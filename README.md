# Hermes WebUI Chat

A native web chat plugin for [Hermes Agent](https://github.com/NousResearch/hermes-agent) that brings clean, streaming chat directly into the dashboard. No terminal. No xterm.js. Just fast, native React chat.

Built for the **Nous Research Dashboard Hackathon** (2026-04-25) — Plugin Track.

> 🏆 **Contest Submission:** The frozen contest submission is preserved on the [`contest-submission`](https://github.com/e-shizz/hermes-webui-chat/tree/contest-submission) branch. This `main` branch is actively maintained post-contest with bugfixes and new features.

---

## 🏆 Contest Submission

**Track:** Plugin  
**Author:** [e-shizz](https://github.com/e-shizz)  
**Co-Author:** [kimi-k2.6](https://github.com/e-shizz) (Hermes Agent — plugin SDK integration, SSE streaming backend, TTS/model selector features)  
**Plugin Repo:** https://github.com/e-shizz/hermes-webui-chat  
**License:** MIT

> ⚠️ **This plugin requires core dashboard patches.** We opened [PR #15819](https://github.com/NousResearch/hermes-agent/pull/15819) upstream. Until merged, apply the included patch files after each `hermes upgrade`. See [Installation](#installation) below.

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

### Step 1: Install the plugin

```bash
# Clone into your Hermes plugins directory
git clone https://github.com/e-shizz/hermes-webui-chat.git ~/.hermes/plugins/webui
```

### Step 2: Apply core dashboard patches

This plugin needs small patches to the Hermes dashboard frontend for proper flex layout. Patches live in `patches/` and are applied automatically:

```bash
cd ~/.hermes/plugins/webui
./scripts/apply-core-patches.sh
```

**What the patches do:**
- Add flex context to plugin routes so the chat fills the viewport
- Add "Resume in Web Chat" button to the Sessions page
- Fix inline code background flashing on text selection

**After each `hermes upgrade`:**
Run the same script — patches are idempotent (already-applied patches are skipped).

### Step 3: Restart Hermes dashboard

```bash
pkill -f "hermes dashboard"
hermes dashboard
```

The "Web Chat" tab will appear in the dashboard sidebar.

---

## 📝 Patch-Based Workflow (Why Not a Fork?)

Previously we maintained a forked `hermes-agent` repo with a `feature/webui-chat` branch. This broke every upgrade because `hermes upgrade` resets to `origin/main`, orphaning the branch commits.

The new patch-based workflow keeps **all plugin-related changes in the plugin repo** — where they belong. The patches are:
- Version-controlled in `patches/`
- Applied cleanly with `git apply`
- Idempotent (safe to run multiple times)
- Easy to update when upstream changes break them

See [CORE_PATCHES.md](CORE_PATCHES.md) for technical details.

---

## 🖼️ Architecture

```
┌────────────────────────────────────────────────────────┐
│  Hermes Dashboard (React)                                  │
│  ┌───────────────────────────────────────────────┐    │
│  │  App.tsx — route container (flex context)           │    │
│  │  ┌───────────────────────────────────────┐  │    │
│  │  │  Plugin Route: /webui                             │  │    │
│  │  │  ┌──────────────────────────┐  │  │    │
│  │  │  │  WebUI Plugin (this repo)                  │  │  │    │
│  │  │  │  │ SessionSidebar │ ChatWindow │          │  │  │    │
│  │  │  │  └──────────────────────────┘  │  │    │
│  │  │  └──────────────────────────────────────┘  │    │
│  │  └───────────────────────────────────────────────┘    │
│  └────────────────────────────────────────────────────────┘
│                                                             │
│  Backend: Hermes Agent JSON-RPC / SSE / gateway           │
└────────────────────────────────────────────────────────┘
```

The plugin registers as a dashboard page via Hermes' plugin manifest system (`plugin.yaml`). The core patches (in `patches/`) only touch the dashboard shell — the chat UI itself is 100% self-contained in this repo.

---

## 📜 License

MIT
