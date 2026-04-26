# Hermes WebUI Chat

> 🚨 **POST-CONTEST DEVELOPMENT BRANCH** — The [contest submission is preserved here](https://github.com/e-shizz/hermes-webui-chat/tree/contest-submission). This branch (`main`) is actively maintained with bugfixes and new features, and will become the default branch once the judging period concludes. All contest honors intact~! 🏆

A native web chat plugin for [Hermes Agent](https://github.com/NousResearch/hermes-agent) that brings clean, streaming chat directly into the dashboard. No terminal. No xterm.js. Just fast, native React chat.

Built for the **Nous Research Dashboard Hackathon** (2026-04-25) — Plugin Track.

---

## 🏆 Contest Submission

**Track:** Plugin  
**Author:** [e-shizz](https://github.com/e-shizz)  
**Co-Author:** [kimi-k2.6](https://github.com/e-shizz) (Hermes Agent — plugin SDK integration, SSE streaming backend, TTS/model selector features)  
**Plugin Repo:** https://github.com/e-shizz/hermes-webui-chat  
**Patched Hermes Fork:** https://github.com/e-shizz/hermes-agent/tree/feature/webui-chat  
**License:** MIT

> 🚨 **This plugin requires a core dashboard patch.** We opened [PR #15819](https://github.com/NousResearch/hermes-agent/pull/15819) to add flex context for plugin routes. Until it's merged, clone from our fork (branch `feature/webui-chat`) or the chat area collapses to zero height. 🚨

### What It Does

This plugin adds a "Web Chat" tab to the Hermes dashboard with a native chat interface. It streams responses in real-time using Server-Sent Events, supports session resume from the sidebar, and includes TTS and model selection built on Hermes' own infrastructure.

### Screenshots / Demo

| Clean design with streaming chat | Session sidebar + model selector |
|:---:|:---:|
| ![Clean design](screenshots/clean%20design.png) | ![Session sidebar and model selector](screenshots/session%20side%20barr%20changes%20and%20deletes%20sessions%20%2C%20changes%20models%20from%20provider.png) |

| Hermes skills, images & TTS | Firefox sidebar ready |
|:---:|:---:|
| ![Skills images and TTS](screenshots/able%20to%20use%20hermes%20skills%2C%20show%20images%20hermes%20creates%20and%20use%20tts.png) | ![Firefox extension](screenshots/can%20be%20run%20in%20browser%20extensions%20for%20firefox.png) |

| Works with any theme ||
|:---:||
| ![Works with any theme](screenshots/works%20with%20any%20theme.png) ||

---

## ✅ Features

- **Clean chat bubbles** — user right/muted, assistant left/plain
- **SSE streaming** — tokens appear in real-time, no polling
- **Session sidebar** — list, paginated browse, resume, new chat
- **Deep-link resume** — `?resume=<session_id>` works for sharing/bookmarking
- **Collapsible sidebar** — click × to collapse, hamburger to reopen
- **Font size slider** — 12–22px, persisted to `localStorage`
- **Code blocks** — syntax highlight labels + hover copy-to-clipboard
- **TTS passthrough** — "Listen" button on any assistant message; uses Hermes' own `text_to_speech` tool
- **Model selector** — live discovery from provider API + static fallback catalog; per-chat override; persists to `localStorage`
- **Theme agnostic** — works with light, dark, and any custom dashboard theme

---

## 🚀 Installation

### Step 1: Use our patched Hermes (required until PR merges)

```bash
# Clone our fork with the flex fix
git clone https://github.com/e-shizz/hermes-agent.git ~/.hermes/hermes-agent
cd ~/.hermes/hermes-agent
git checkout feature/webui-chat
# ...install as normal...
```

**Why our fork?** We opened [PR #15819](https://github.com/NousResearch/hermes-agent/pull/15819) upstream to add flex context for plugin routes, but it's not merged yet. The upstream Hermes dashboard does not give plugin routes the flex treatment they need to fill the viewport. Without this, the chat area collapses to zero height.

- **Upstream PR:** https://github.com/NousResearch/hermes-agent/pull/15819
- **Our fork:** https://github.com/e-shizz/hermes-agent/tree/feature/webui-chat
- **Commit:** [`eec701ff`](https://github.com/e-shizz/hermes-agent/commit/eec701ff) — `fix(dashboard): plugin routes get proper flex context for full-height layouts`

### Step 2: Install the plugin

```bash
# Clone into your Hermes plugins directory
git clone https://github.com/e-shizz/hermes-webui-chat.git ~/.hermes/plugins/webui

# Restart the dashboard
hermes dashboard
```

### Step 3: Look for the "Web Chat" tab in the sidebar

No build step. No npm install. The plugin ships as a pre-bundled IIFE.

---

## 🔗 Required Patches

This plugin requires a **one-line change to the Hermes dashboard core** (`App.tsx`). Plugin routes need `display: flex` to support viewport-filling layouts. Without this fix, the chat area collapses to zero height.

**Upstream PR:** [NousResearch/hermes-agent#15819](https://github.com/NousResearch/hermes-agent/pull/15819) — `fix(dashboard): plugin routes get proper flex context for full-height layouts`

**Our fork with the fix (until PR merges):**
- **Repo:** https://github.com/e-shizz/hermes-agent
- **Branch:** [`feature/webui-chat`](https://github.com/e-shizz/hermes-agent/tree/feature/webui-chat)
- **Commit:** [`eec701ff`](https://github.com/e-shizz/hermes-agent/commit/eec701ff)

**What changed:**
- `web/src/App.tsx`: Plugin routes (any route with key prefix `plugin:` or `override:`) now get `min-h-0 flex flex-1 flex-col` container treatment
- This is the same flex treatment already given to `/chat` and `/docs` routes — extended to plugins
- No other dashboard behavior changes; built-in pages use explicit heights so adding flex is harmless

---

## 🔧 Firefox Sidebar Integration (Bonus)

This plugin can be wired into [Firefox's sidebar API](https://docs.openwebui.com/tutorials/integrations/dev-tools/firefox-sidebar) so the chat UI lives as a persistent panel alongside your browsing session — no tab switching, no context loss.

Because the frontend is a standard web app using `fetch()` and `EventSource`, the same chat UI works both:
- **Inside the Hermes dashboard** (current — mounted as a plugin tab)
- **Inside Firefox sidebar** (future — load the plugin route in Firefox's sidebar panel for always-available chat while browsing)

The architecture is intentionally portable: swap the base URL and the same bundle runs anywhere.

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
