"""OpenWebUI Chat — dashboard plugin backend.

Provides an SSE streaming chat endpoint that instantiates AIAgent directly,
loading conversation history from SessionDB for resumed sessions.
"""

import asyncio
import json
import sys
import traceback
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse, FileResponse

router = APIRouter()

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
    """Scan conversation messages for image_generate_tool results and return image URLs.

    Tool results are stored as role='tool' messages with JSON content.
    The image_generate_tool returns: {"success": true, "image": "https://..."}
    """
    images = []
    if not messages:
        return images
    for msg in messages:
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
    the API key from the environment using the provider name itself.
    No hardcoded priority chains, no stale static catalogs.
    """
    from hermes_cli.config import load_config, load_env

    cfg = load_config()
    env = load_env()

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

    # Compute the expected env var name from the provider itself.
    #   opencode-go  → OPENCODE_GO_API_KEY
    #   openai       → OPENAI_API_KEY
    #   gemini       → GEMINI_API_KEY
    api_key = None
    if provider:
        env_key = provider.upper().replace("-", "_") + "_API_KEY"
        api_key = env.get(env_key)

    # Fallback: scan env for any *_API_KEY that might match (useful for custom providers)
    if not api_key:
        for key, value in env.items():
            if key.endswith("_API_KEY") and value:
                api_key = value
                break

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

    Tries live API first (using the exact base_url/api_key from config),
    falls back to only the currently configured model.
    """
    config = _load_agent_config()
    base_url = config.get("base_url")
    api_key = config.get("api_key")
    current_model = config.get("model", "")

    models = []
    source = "config"

    # Try live API probe using the exact config values
    if base_url and api_key:
        try:
            from hermes_cli.models import probe_api_models
            result = probe_api_models(api_key, base_url, timeout=5.0)
            live_models = result.get("models")
            if live_models:
                models = sorted(set(str(m) for m in live_models if m))
                source = "live"
        except Exception:
            pass

    # Fallback: only the configured model (never a stale static catalog)
    if not models and current_model:
        models = [current_model]

    return {
        "models": models,
        "source": source,
        "provider": config.get("provider", ""),
        "current_model": current_model,
    }


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

    if not message:
        return {"error": "Message is required"}

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

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def stream_callback(text: str) -> None:
        loop.call_soon_threadsafe(
            queue.put_nowait, {"type": "delta", "content": text}
        )

    def run_chat() -> None:
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

    asyncio.create_task(asyncio.to_thread(run_chat))

    async def sse_generator():
        while True:
            msg = await queue.get()
            yield f"data: {json.dumps(msg)}\n\n"
            if msg.get("type") in ("done", "error"):
                break

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


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
