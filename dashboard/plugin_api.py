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

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

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
        model = model.get("default", model.get("name", ""))

    api_key = (
        env.get("OPENAI_API_KEY")
        or env.get("ANTHROPIC_API_KEY")
        or env.get("XAI_API_KEY")
        or env.get("GEMINI_API_KEY")
        or env.get("NOUS_API_KEY")
        or cfg.get("api_key")
    )
    base_url = cfg.get("base_url") or env.get("OPENAI_BASE_URL")
    provider = cfg.get("provider")
    api_mode = cfg.get("api_mode")
    max_iterations = cfg.get("max_iterations", 90)
    if not isinstance(max_iterations, int):
        max_iterations = 90

    return {
        "model": model,
        "api_key": api_key,
        "base_url": base_url,
        "provider": provider,
        "api_mode": api_mode,
        "max_iterations": max_iterations,
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
