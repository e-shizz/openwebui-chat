# Hermes WebUI Chat

A native web chat plugin for [Hermes Agent](https://github.com/NousResearch/hermes-agent) that brings OpenWebUI-style streaming chat directly into the dashboard. No terminal. No xterm.js. Just clean, fast, native React chat.

Built for the **Nous Research Dashboard Hackathon** (2026-04-25) — Plugin Track.

---

## 🏆 Contest Submission

**Track:** Plugin  
**Author:** [e-shizz](https://github.com/e-shizz)  
**Repo:** https://github.com/e-shizz/hermes-webui-chat  
**License:** MIT

### Why This Is Awesome & Useful

| Criterion | How We Deliver |
|-----------|----------------|
| **Most awesome** | Real-time SSE streaming with OpenWebUI-style bubbles — the *only* entry with a proper streaming chat UX. Hover-to-listen TTS. Live model discovery. Glassmorphic sidebar. It feels like a modern chat app, not a terminal wrapped in a browser. |
| **Most useful** | Native chat without `--tui`. Session resume from sidebar. Model selector with per-chat override. TTS passthrough using Hermes' own infrastructure. Anyone who finds the embedded TUI clunky now has a first-class alternative. |
| **Clean & hackable** | Single-file frontend IIFE (~25KB). Single-file Python backend. No build step for users. Drop it in `~/.hermes/plugins/webui/` and `hermes dashboard` picks it up. The entire plugin is ~350 lines of frontend JS and ~250 lines of backend Python. |
| **Bonus: Firefox ML Ready** | Because this is a pure web frontend using standard `fetch()` + SSE, it can be wired to [Firefox ML](https://blog.mozilla.org/en/mozilla/ai/)'s local on-device runtime for fully private, offline inference — no server round-trip. The architecture is provider-agnostic by design. |

### Screenshots / Demo

*(Add screenshots or screen recording here before submitting)*

> 📸 Screenshot 1: Main chat view with streaming response  
> 📸 Screenshot 2: Collapsed sidebar, wide chat area  
> 📸 Screenshot 3: TTS "Listen" button on assistant message  
> 📸 Screenshot 4: Model selector dropdown (12 models from opencode-go)

---

## ✅ Features

- **OpenWebUI-style chat bubbles** — user right/muted, assistant left/plain
- **SSE streaming** — tokens appear in real-time, no polling
- **Session sidebar** — list, search-ish (paginated), resume, new chat
- **Deep-link resume** — `?resume=<session_id>` works for sharing/bookmarking
- **Collapsible sidebar** — click × to collapse, hamburger to reopen
- **Font size slider** — 12–22px, persisted to `localStorage`
- **Code blocks** — syntax highlight labels + hover copy-to-clipboard
- **TTS passthrough** — "Listen" button on any assistant message; uses Hermes' own `text_to_speech` tool
- **Model selector** — live discovery from provider API + static fallback catalog; per-chat override; persists to `localStorage`
- **Zero core patches** — pure plugin, works on stock Hermes (only needs the existing `App.tsx` flex fix, already merged)

---

## 🚀 Installation

```bash
# 1. Clone into your Hermes plugins directory
git clone https://github.com/e-shizz/hermes-webui-chat.git ~/.hermes/plugins/webui

# 2. Restart the dashboard
hermes dashboard

# 3. Look for the "Web Chat" tab in the sidebar
```

No build step. No npm install. The plugin ships as a pre-bundled IIFE.

---

## 🌐 Firefox ML Integration (Future/Bonus)

Because the frontend is a standard web app using `fetch()` and `EventSource`, it can be adapted to talk to Firefox's local AI runtime instead of the Hermes backend:

```javascript
// Concept: swap the SSE endpoint for Firefox ML's local port
const eventSource = new EventSource('http://localhost:8080/v1/chat/completions');
```

This makes the same chat UI work for:
- **Cloud inference** (current — Hermes backend)
- **Local on-device inference** (future — Firefox ML, llamafile, etc.)

The plugin architecture is intentionally provider-agnostic.

---

## 🎨 Built With

- Hermes Plugin SDK (`window.__HERMES_PLUGIN_SDK__`) — React, hooks, UI components, API client
- Vanilla SSE (`EventSource`) — no WebSocket complexity
- `AIAgent.run_conversation()` from Hermes core — same agent power as the TUI
- FastAPI router — mounted at `/api/plugins/webui/`

---

## 📝 Technical Notes

**Endpoints exposed by the plugin backend:**

| Endpoint | Purpose |
|----------|---------|
| `POST /api/plugins/webui/chat` | SSE streaming chat |
| `GET /api/plugins/webui/models` | Live model discovery |
| `POST /api/plugins/webui/tts` | Generate TTS audio |
| `GET /api/plugins/webui/audio?path=...` | Serve TTS audio files |

**Frontend bundle:** `dashboard/dist/index.js` (~25KB IIFE)  
**Backend:** `dashboard/plugin_api.py` (~250 lines)  
**Manifest:** `dashboard/manifest.json`

---

## 💡 Acknowledgements

Built with [Hermes Agent](https://github.com/NousResearch/hermes-agent) by Nous Research. Thanks to the Hermes team for the plugin SDK and dashboard extensibility architecture.
