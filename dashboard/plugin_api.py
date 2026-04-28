"""OpenWebUI Chat — dashboard plugin backend.

Provides an SSE streaming chat endpoint that instantiates AIAgent directly,
loading conversation history from SessionDB for resumed sessions.
"""

import asyncio
import json
import os
import sys
import threading
import traceback
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse, FileResponse

router = APIRouter()

# Track active agent instances for interrupt support.
# Key: request_id (str), Value: AIAgent instance
active_agents: dict = {}

# Track pending dangerous-command approvals for WebUI.
# Key: request_id (str), Value: {"event": threading.Event(), "choice": str, ...}
_pending_approvals: dict = {}

# Ensure hermes-agent repo root is importable when this file is loaded
# via importlib from web_server.py.
_HERMES_ROOT = None
if "hermes_cli" in sys.modules and hasattr(sys.modules["hermes_cli"], "__file__"):
    _HERMES_ROOT = Path(sys.modules["hermes_cli"].__file__).parent.parent.resolve()
if not _HERMES_ROOT:
    # Fallback: walk up from this file looking for hermes_cli
    _p = Path(__file__).resolve()
    for _ancestor in _p.parents:
        if (_ancestor / "hermes_cli").is_dir():
            _HERMES_ROOT = _ancestor
            break
if _HERMES_ROOT and str(_HERMES_ROOT) not in sys.path:
    sys.path.insert(0, str(_HERMES_ROOT))


def _extract_images_from_messages(messages):
    """Scan conversation messages for image_generate_tool results from the CURRENT turn only.

    Tool results are stored as role='tool' messages with JSON content.
    Only scans messages after the last user message to avoid carrying
    historical images into every new response.
    """
    images = []
    if not messages:
        return images

    # Find the last user message index — only scan tool results after it
    last_user_idx = -1
    for i, msg in enumerate(messages):
        if isinstance(msg, dict) and msg.get("role") == "user":
            last_user_idx = i

    # Scan only messages after the last user message (current turn)
    current_turn = messages[last_user_idx + 1:] if last_user_idx >= 0 else messages

    for msg in current_turn:
        if not isinstance(msg, dict):
            continue
        if msg.get("role") != "tool":
            continue
        content = msg.get("content", "")
        if not isinstance(content, str) or not content.strip():
            continue
        try:
            data = json.loads(content)
            if data.get("success"):
                # image_generate_tool returns a single "image" URL
                url = data.get("image")
                if url and isinstance(url, str) and url.startswith("http"):
                    images.append(url)
                # Some tools may return an "images" array
                for img in data.get("images", []):
                    if isinstance(img, dict):
                        url = img.get("url")
                    else:
                        url = img
                    if url and isinstance(url, str) and url.startswith("http"):
                        images.append(url)
        except (json.JSONDecodeError, ValueError):
            continue
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for url in images:
        if url not in seen:
            seen.add(url)
            unique.append(url)
    return unique


def _load_agent_config():
    """Load user config natively via Hermes' own config loader.

    Reads ~/.hermes/config.yaml exactly like the CLI does, then resolves
    credentials through Hermes' native auth registry — supporting every
    provider's exact env-var chain, base_url heuristics, and OAuth state.
    """
    import os

    from hermes_cli.config import load_config
    from hermes_cli.auth import (
        resolve_api_key_provider_credentials,
        PROVIDER_REGISTRY,
        AuthError,
    )
    from hermes_cli.models import normalize_provider

    cfg = load_config()

    model_cfg = cfg.get("model", {})
    if isinstance(model_cfg, dict):
        model_name = model_cfg.get("default", model_cfg.get("name", ""))
        provider = model_cfg.get("provider", "")
        base_url = model_cfg.get("base_url", "")
        api_mode = model_cfg.get("api_mode", "chat_completions")
    else:
        model_name = str(model_cfg) if model_cfg else ""
        provider = ""
        base_url = ""
        api_mode = "chat_completions"

    max_iterations = cfg.get("agent", {}).get("max_turns", 90)
    if not isinstance(max_iterations, int):
        max_iterations = 90

    # Use Hermes' native auth resolver for API-key providers.
    # This handles multi-env-var chains (e.g. GOOGLE_API_KEY + GEMINI_API_KEY),
    # provider-specific base_url logic (Kimi redirect, Z.AI resolution), etc.
    api_key = None
    normalized = normalize_provider(provider) if provider else ""

    if normalized and normalized in PROVIDER_REGISTRY:
        pconfig = PROVIDER_REGISTRY[normalized]
        if pconfig.auth_type == "api_key":
            try:
                creds = resolve_api_key_provider_credentials(normalized)
                api_key = creds.get("api_key") or None
                if not base_url:
                    base_url = creds.get("base_url", "")
            except AuthError:
                api_key = None
        # OAuth / external_process / AWS providers: we cannot auto-resolve a
        # key, but the model list will still populate from curated_models.
    else:
        # Custom provider — fall back to naive env scan as last resort
        if provider:
            env_key = provider.upper().replace("-", "_") + "_API_KEY"
            api_key = os.environ.get(env_key) or os.environ.get("API_KEY") or None

    return {
        "model": model_name,
        "api_key": api_key,
        "base_url": base_url,
        "provider": provider,
        "api_mode": api_mode,
        "max_iterations": max_iterations,
    }


@router.get("/models")
async def models_endpoint():
    """Return available models for the configured provider.

    Uses Hermes' native ``curated_models_for_provider`` which handles:
      • Live API probing for OpenAI-compatible endpoints
      • OpenRouter dynamic catalog fetching
      • Static curated catalog fallback
      • Custom provider live probing when a base_url is set
    Always includes the currently configured model.
    """
    config = _load_agent_config()
    provider = config.get("provider") or ""
    base_url = config.get("base_url")
    api_key = config.get("api_key")
    api_mode = config.get("api_mode")
    current_model = config.get("model", "")

    models = []
    source = "static"

    if provider:
        from hermes_cli.models import (
            curated_models_for_provider,
            normalize_provider,
            probe_api_models,
        )
        from hermes_cli.auth import PROVIDER_REGISTRY

        normalized = normalize_provider(provider)

        # 1. Hermes' native model discovery (live + static + OpenRouter)
        try:
            model_tuples = curated_models_for_provider(normalized)
            if model_tuples:
                models = sorted(set(str(m[0]) for m in model_tuples if m[0]))
                source = "live"
        except Exception:
            pass

        # 2. Custom provider with base_url — probe directly
        if not models and base_url and normalized not in PROVIDER_REGISTRY:
            try:
                result = probe_api_models(api_key, base_url, timeout=5.0, api_mode=api_mode)
                live_models = result.get("models")
                if live_models:
                    models = sorted(set(str(m) for m in live_models if m))
                    source = "live"
            except Exception:
                pass

    # 3. Ensure current model is always included
    if current_model and current_model not in models:
        models.insert(0, current_model)

    return {
        "models": models,
        "source": source,
        "provider": provider,
        "current_model": current_model,
    }


@router.post("/command")
async def command_endpoint(request: Request):
    """Execute a slash command from the WebUI.

    Body: {"session_id": "..."|null, "command": "yolo"|"clear"|"help"|...}
    Returns: {"type": "yolo_toggle", "enabled": true/false, "message": "..."}
             {"type": "clear", "message": "..."}
             {"type": "new_session", "message": "..."}
             {"type": "help", "commands": [...]}
             {"type": "error", "message": "..."}
    """
    body = await request.json()
    session_id = body.get("session_id") or None
    text = (body.get("command") or "").strip()
    if not text:
        return {"type": "error", "message": "Command is required"}

    # Parse: /yolo, /yolo on, /yolo off, /clear, /help, /new, /reset
    parts = text.lstrip("/").split()
    cmd = parts[0].lower() if parts else ""
    arg = parts[1].lower() if len(parts) > 1 else ""

    # Session key for session-scoped yolo
    from hermes_state import SessionDB
    db = SessionDB()
    session_key = session_id
    if session_id:
        session_key = db.resolve_resume_session_id(session_id) or session_id
    if not session_key:
        session_key = "webui:no-session"

    from tools.approval import (
        enable_session_yolo,
        disable_session_yolo,
        is_session_yolo_enabled,
    )

    if cmd == "yolo":
        # Determine target state
        if arg == "on":
            target = True
        elif arg == "off":
            target = False
        else:
            # Toggle
            target = not (bool(os.getenv("HERMES_YOLO_MODE")) or is_session_yolo_enabled(session_key))

        if target:
            os.environ["HERMES_YOLO_MODE"] = "1"
            enable_session_yolo(session_key)
            return {
                "type": "yolo_toggle",
                "enabled": True,
                "message": "⚡ YOLO mode ON — all dangerous commands will be auto-approved for this session.",
            }
        else:
            os.environ.pop("HERMES_YOLO_MODE", None)
            disable_session_yolo(session_key)
            return {
                "type": "yolo_toggle",
                "enabled": False,
                "message": "⚠ YOLO mode OFF — dangerous commands will require approval.",
            }

    if cmd in ("clear", "cls"):
        return {"type": "clear", "message": "Screen cleared."}

    if cmd in ("new", "reset"):
        return {"type": "new_session", "message": "New session started."}

    if cmd == "help":
        return {
            "type": "help",
            "message": "Available WebUI commands:",
            "commands": [
                {"name": "/yolo", "description": "Toggle YOLO mode (auto-approve dangerous commands)"},
                {"name": "/yolo on", "description": "Enable YOLO mode"},
                {"name": "/yolo off", "description": "Disable YOLO mode"},
                {"name": "/clear", "description": "Clear chat messages"},
                {"name": "/new", "description": "Start a new session"},
                {"name": "/help", "description": "Show this help"},
            ],
        }

    return {"type": "error", "message": f"Unknown command: /{cmd}. Type /help for available commands."}


@router.post("/chat")
async def chat_endpoint(request: Request):
    """SSE streaming chat with session resume support.

    Body: {"session_id": "..."|null, "message": "..."}
    Returns: text/event-stream with JSON lines:
      data: {"type": "delta", "content": "..."}
      data: {"type": "done", "result": "...", "session_id": "..."}
      data: {"type": "error", "message": "..."}
    """
    body = await request.json()
    session_id = body.get("session_id") or None
    message = (body.get("message") or "").strip()
    request_id = body.get("request_id") or ("req_" + str(uuid.uuid4())[:8])

    if not message:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=400,
            content={"error": "Message is required"}
        )

    # Sanity cap: 100k chars is ~25k tokens, more than most context windows
    if len(message) > 100_000:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=413,
            content={"error": f"Message too long ({len(message):,} characters). Max: 100,000."}
        )

    config = _load_agent_config()
    # Allow frontend to override the model per-request
    override_model = body.get("model")
    if override_model and isinstance(override_model, str) and override_model.strip():
        config["model"] = override_model.strip()

    from run_agent import AIAgent
    from hermes_state import SessionDB

    db = SessionDB()

    # Resolve compression chains and load history for resumed sessions
    conversation_history = None
    resolved_session_id = session_id
    if session_id:
        resolved_session_id = db.resolve_resume_session_id(session_id) or session_id
        if resolved_session_id:
            conversation_history = db.get_messages_as_conversation(resolved_session_id)
            # Strip session_meta entries (synthetic role used by some gateways)
            if conversation_history:
                conversation_history = [
                    m for m in conversation_history if m.get("role") != "session_meta"
                ]

    agent = AIAgent(
        model=config["model"],
        api_key=config["api_key"],
        base_url=config["base_url"],
        provider=config["provider"],
        api_mode=config["api_mode"],
        session_id=resolved_session_id,
        session_db=db,
        platform="dashboard",
        max_iterations=config["max_iterations"],
        quiet_mode=True,
    )

    active_agents[request_id] = agent

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def stream_callback(text: str) -> None:
        loop.call_soon_threadsafe(
            queue.put_nowait, {"type": "delta", "content": text}
        )

    def run_chat() -> None:
        # Bind session key and approval callback in this worker thread so
        # dangerous-command guards know which session to track and where to
        # send approval prompts.
        import os
        from tools.approval import set_current_session_key, enable_session_yolo, disable_session_yolo, is_session_yolo_enabled
        from tools.terminal_tool import set_approval_callback

        session_key = resolved_session_id or ("webui:" + request_id)
        old_session_key = os.environ.get("HERMES_SESSION_KEY")
        old_interactive = os.environ.get("HERMES_INTERACTIVE")

        os.environ["HERMES_SESSION_KEY"] = session_key
        os.environ["HERMES_INTERACTIVE"] = "1"
        approval_token = set_current_session_key(session_key)

        def web_approval_callback(command: str, description: str, *, allow_permanent=True, timeout=300):
            """Emit an SSE approval event and block until the user responds via /approve."""
            req_id = "approval_" + str(uuid.uuid4())[:8]
            evt = threading.Event()
            _pending_approvals[req_id] = {
                "event": evt,
                "choice": "deny",
                "command": command,
                "description": description,
            }
            choices = ["once", "session", "always", "deny"] if allow_permanent else ["once", "session", "deny"]
            loop.call_soon_threadsafe(
                queue.put_nowait,
                {
                    "type": "approval",
                    "request_id": req_id,
                    "command": command,
                    "description": description,
                    "choices": choices,
                },
            )
            if not evt.wait(timeout=timeout):
                _pending_approvals.pop(req_id, None)
                return "deny"
            choice = _pending_approvals.pop(req_id, {}).get("choice", "deny")
            return choice

        set_approval_callback(web_approval_callback)

        try:
            result = agent.run_conversation(
                message,
                conversation_history=conversation_history,
                stream_callback=stream_callback,
            )
            # Extract any generated image URLs from tool results in the conversation
            images = _extract_images_from_messages(result.get("messages", []))
            loop.call_soon_threadsafe(
                queue.put_nowait,
                {
                    "type": "done",
                    "result": result.get("final_response", ""),
                    "session_id": getattr(agent, "session_id", resolved_session_id),
                    "images": images,
                },
            )
        except Exception as exc:
            loop.call_soon_threadsafe(
                queue.put_nowait,
                {
                    "type": "error",
                    "message": str(exc),
                    "detail": traceback.format_exc(),
                },
            )
        finally:
            set_approval_callback(None)
            from tools.approval import reset_current_session_key
            reset_current_session_key(approval_token)
            if old_session_key is not None:
                os.environ["HERMES_SESSION_KEY"] = old_session_key
            else:
                os.environ.pop("HERMES_SESSION_KEY", None)
            if old_interactive is not None:
                os.environ["HERMES_INTERACTIVE"] = old_interactive
            else:
                os.environ.pop("HERMES_INTERACTIVE", None)
            active_agents.pop(request_id, None)

    asyncio.create_task(asyncio.to_thread(run_chat))

    async def sse_generator():
        try:
            while True:
                msg = await asyncio.wait_for(queue.get(), timeout=300)
                yield f"data: {json.dumps(msg)}\n\n"
                if msg.get("type") in ("done", "error"):
                    break
        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Request timed out after 5 minutes.'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'Stream error: {str(e)}'})}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/stop")
async def stop_endpoint(request: Request):
    """Interrupt an in-progress chat by request_id.

    Body: {"request_id": "..."}
    Sets AIAgent._interrupt_requested = True so the agent loop breaks
    and returns whatever has been streamed so far.
    """
    body = await request.json()
    request_id = body.get("request_id")
    agent = active_agents.get(request_id) if request_id else None
    if agent and hasattr(agent, "_interrupt_requested"):
        agent._interrupt_requested = True
        return {"success": True}
    return {"success": False, "error": "No active chat found"}


@router.post("/approve")
async def approve_endpoint(request: Request):
    """Respond to a dangerous-command approval request from the WebUI.

    Body: {"request_id": "approval_...", "choice": "once"|"session"|"always"|"deny"}
    Returns: {"success": true} or {"success": false, "error": "..."}
    """
    body = await request.json()
    req_id = body.get("request_id")
    choice = body.get("choice")

    if not req_id:
        return {"success": False, "error": "request_id is required"}
    if choice not in ("once", "session", "always", "deny"):
        return {"success": False, "error": f"Invalid choice: {choice}"}

    pending = _pending_approvals.get(req_id)
    if not pending:
        return {"success": False, "error": "Approval request not found or already expired"}

    pending["choice"] = choice
    pending["event"].set()
    return {"success": True}


@router.post("/tts")
async def tts_endpoint(request: Request):
    """Generate TTS audio for given text using Hermes' configured TTS provider.

    Body: {"text": "..."}
    Returns: {"success": true, "audio_url": "/api/plugins/webui/audio?path=..."}
             {"success": false, "error": "..."}
    """
    body = await request.json()
    text = (body.get("text") or "").strip()

    if not text:
        return {"success": False, "error": "Text is required"}

    try:
        from tools.tts_tool import text_to_speech_tool
        result_json = text_to_speech_tool(text=text)
        result = json.loads(result_json)

        if not result.get("success"):
            return {"success": False, "error": result.get("error", "TTS generation failed")}

        file_path = result.get("file_path")
        if not file_path or not Path(file_path).exists():
            return {"success": False, "error": "Audio file not found after generation"}

        # Return a URL to our audio-serving endpoint
        return {
            "success": True,
            "audio_url": f"/api/plugins/webui/audio?path={file_path}",
            "provider": result.get("provider"),
        }
    except Exception as exc:
        return {"success": False, "error": str(exc), "detail": traceback.format_exc()}


@router.get("/audio")
async def audio_endpoint(path: str):
    """Serve a TTS-generated audio file from disk."""
    file_path = Path(path).resolve()
    # Security: only serve files inside the hermes home or known TTS dirs
    allowed_roots = [
        Path.home() / "voice-memos",
        Path.home() / ".hermes" / "cache" / "audio",
        Path.home() / ".hermes" / "audio_cache",
    ]
    # Also allow if parent is voice-memos or audio cache
    if not any(str(file_path).startswith(str(r)) for r in allowed_roots):
        raise HTTPException(status_code=403, detail="Access denied")

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Guess content type from extension
    content_type = "audio/mpeg"
    if file_path.suffix == ".ogg":
        content_type = "audio/ogg"
    elif file_path.suffix == ".wav":
        content_type = "audio/wav"

    return FileResponse(
        str(file_path),
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )
