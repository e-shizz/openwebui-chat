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


def _load_agent_config():
    """Load user config + .env exactly like the CLI does."""
    from hermes_cli.config import load_config, load_env

    cfg = load_config()
    env = load_env()

    model = cfg.get("model", "")
    if isinstance(model, dict):
        model_name = model.get("default", model.get("name", ""))
        model_provider = model.get("provider", "")
        model_base_url = model.get("base_url", "")
    else:
        model_name = str(model) if model else ""
        model_provider = ""
        model_base_url = ""

    api_key = (
        env.get("OPENAI_API_KEY")
        or env.get("ANTHROPIC_API_KEY")
        or env.get("XAI_API_KEY")
        or env.get("GEMINI_API_KEY")
        or env.get("NOUS_API_KEY")
        or env.get("OPENCODE_GO_API_KEY")
        or env.get("OPENROUTER_API_KEY")
        or env.get("DEEPSEEK_API_KEY")
        or cfg.get("api_key")
    )
    base_url = cfg.get("base_url") or model_base_url or env.get("OPENAI_BASE_URL")
    provider = cfg.get("provider") or model_provider
    api_mode = cfg.get("api_mode") or (model.get("api_mode") if isinstance(model, dict) else None)
    max_iterations = cfg.get("max_iterations", 90)
    if not isinstance(max_iterations, int):
        max_iterations = 90

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

    Tries live API first (using the provider's /models endpoint),
    falls back to static curated catalog if unreachable.
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

    # 1. Try live API probe first (works for most OpenAI-compatible providers)
    if base_url:
        try:
            from hermes_cli.models import probe_api_models
            result = probe_api_models(api_key, base_url, timeout=5.0, api_mode=api_mode)
            live_models = result.get("models")
            if live_models:
                models = list(live_models)
                source = "live"
        except Exception:
            pass

    # 2. Provider-specific live fetches for providers that don't use base_url
    if not models and provider:
        try:
            from hermes_cli.models import (
                normalize_provider,
                _fetch_anthropic_models,
                _fetch_ai_gateway_models,
                _PROVIDER_MODELS,
            )
            normalized = normalize_provider(provider)

            if normalized == "anthropic":
                live = _fetch_anthropic_models()
                if live:
                    models = live
                    source = "live"
            elif normalized == "ai-gateway":
                live = _fetch_ai_gateway_models()
                if live:
                    models = live
                    source = "live"
            elif normalized in _PROVIDER_MODELS:
                models = list(_PROVIDER_MODELS[normalized])
                source = "static"
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
            loop.call_soon_threadsafe(
                queue.put_nowait,
                {
                    "type": "done",
                    "result": result.get("final_response", ""),
                    "session_id": getattr(agent, "session_id", resolved_session_id),
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
