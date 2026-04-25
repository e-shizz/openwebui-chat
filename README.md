# OpenWebUI Chat — Hermes Dashboard Plugin

A native web chat experience for [Hermes Agent](https://github.com/NousResearch/hermes-agent) with OpenWebUI-style chat bubbles, session management, and real-time streaming.

## Features

- 💬 **OpenWebUI-style chat bubbles** — Clean, readable message layout
- 🔄 **Session resume** — Pick up any conversation from the sidebar
- ⚡ **SSE streaming** — Real-time token-by-token responses
- 📚 **Session list** — Browse all your chats with timestamps
- 🔧 **Code blocks with copy** — Syntax-highlighted code with one-click copy
- 🔢 **Font size slider** — Adjust text size to your preference

## Install

```bash
# Clone into your Hermes plugins directory
git clone https://github.com/e-shizz/openwebui-chat.git ~/.hermes/plugins/openwebui-chat

# Restart Hermes dashboard to load the plugin
```

## Files

- `dashboard/dist/index.js` — Frontend bundle (React, no build step needed)
- `dashboard/plugin_api.py` — FastAPI backend for chat streaming
- `dashboard/manifest.json` — Plugin manifest

## Architecture

The plugin exposes a FastAPI router mounted at `/api/plugins/openwebui-chat/chat` which handles SSE streaming to the frontend. The frontend uses the Hermes Plugin SDK (`window.__HERMES_PLUGIN_SDK__`) for React, UI components, and API access.

## License

MIT
