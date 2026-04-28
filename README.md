# Hermes WebUI Chat

> ⚠️ **STOP. READ THIS FIRST.**
>
> This plugin **will NOT run** on a stock Hermes dashboard. You **must** apply 3 small patches to the Hermes core dashboard first.
>
> **If you do not run the patch script below, the Web Chat tab will be broken or invisible.**
>
> Upstream PR: [#15819](https://github.com/NousResearch/hermes-agent/pull/15819) (open as of 2026-04-27)

---

## 🚀 TL;DR — Quick Start (3 commands)

```bash
# 1. Clone this plugin into your Hermes plugins folder
git clone https://github.com/e-shizz/hermes-webui-chat.git ~/.hermes/plugins/webui

# 2. Apply the required dashboard patches (run this manually)
cd ~/.hermes/plugins/webui
./scripts/apply-core-patches.sh

# 3. Restart the dashboard
pkill -f "hermes dashboard"
hermes dashboard
```

The "Web Chat" tab will appear in the dashboard sidebar.

---

## ✅ Prerequisites

| Requirement | Why |
|-------------|-----|
| **Hermes Agent installed** | This is a dashboard plugin, not a standalone app |
| **`npm` and `node` available** | The patch script rebuilds the dashboard frontend |
| **Git** | The patch script uses `git apply` inside `~/.hermes/hermes-agent` |

If Hermes is installed somewhere other than `~/.hermes/hermes-agent`, set `HERMES_AGENT` before running the script:

```bash
export HERMES_AGENT=/path/to/hermes-agent
cd ~/.hermes/plugins/webui
./scripts/apply-core-patches.sh
```

---

## 🔧 Step-by-Step Installation

### Step 1 — Install the plugin

```bash
git clone https://github.com/e-shizz/hermes-webui-chat.git ~/.hermes/plugins/webui
```

### Step 2 — Apply the dashboard patches (REQUIRED)

```bash
cd ~/.hermes/plugins/webui
./scripts/apply-core-patches.sh
```

**This script will:**
1. Check which patches are missing
2. Apply them with `git apply`
3. Rebuild the dashboard (`npm run build` inside `~/.hermes/hermes-agent/web`)

You will see output like:

```
📋 0001-dashboard-plugin-route-flex-layout.patch ...
 ✅ Applied
📋 0002-dashboard-sessions-page-resume-button.patch ...
 ✅ Applied
📋 0003-dashboard-code-background-fix.patch ...
 ✅ Applied
🔨 Rebuilding dashboard...
✅ Done. Restart Hermes dashboard if running.
```

**If a patch says "Already applied (skipping)":** That's fine. It means you already ran the script.

**If a patch says "CONFLICT":** The upstream dashboard changed significantly. Open an issue on this repo with the error output.

### Step 3 — Restart the dashboard

```bash
pkill -f "hermes dashboard"
hermes dashboard
```

The "Web Chat" tab will appear in the dashboard sidebar.

---

## 🔄 After Every `hermes upgrade`

`hermes upgrade` resets the dashboard to the latest upstream code. **You must re-run the patch script every time.**

```bash
cd ~/.hermes/plugins/webui
./scripts/apply-core-patches.sh
```

The script is safe to run multiple times — already-applied patches are skipped automatically.

---

## 📋 What The Patches Do

| Patch | File | Required? | Purpose |
|-------|------|-----------|---------|
| `0001` | `web/src/App.tsx` | **YES** | Plugin routes get proper flex layout so the chat page fills the viewport. Without this, the chat window is collapsed or invisible. |
| `0002` | `web/src/pages/SessionsPage.tsx` | No — nice to have | Adds a "Resume in Web Chat" button to the Sessions page. The chat works fine without this. |
| `0003` | `web/src/index.css` | No — nice to have | Fixes a dashboard-wide bug where inline code flashes rainbow colors when you select text. Purely visual. |

> **Bottom line:** Patch `0001` is mandatory. Patches `0002` and `0003` are upstream bugfixes included for convenience.

See [CORE_PATCHES.md](CORE_PATCHES.md) for full technical details.

---

## ✨ Features

- **Clean chat bubbles** — user right/muted, assistant left/plain
- **SSE streaming** — tokens appear in real-time, no polling
- **Session sidebar** — list, paginated browse, resume, new chat
- **Deep-link resume** — `?resume=<id>` works for sharing/bookmarking
- **Collapsible sidebar** — click × to collapse, hamburger to reopen
- **Font size slider** — 12–22px, persisted to `localStorage`
- **Code blocks** — syntax highlight labels + hover copy-to-clipboard
- **TTS passthrough** — "Listen" button on any assistant message; uses Hermes' own `text_to_speech` tool
- **Model selector** — live discovery from provider API + static fallback catalog; per-chat override; persists to `localStorage`
- **Theme agnostic** — works with light, dark, and any custom dashboard theme

---

## 🖼️ Screenshots

| Clean design with streaming chat | Session sidebar + model selector |
|:---:|:---:|
| ![Clean design](screenshots/clean%20design.png) | ![Session sidebar and model selector](screenshots/session%20side%20barr%20changes%20and%20deletes%20sessions%20%2C%20changes%20models%20from%20provider.png) |

| Hermes skills, images & TTS | Firefox sidebar ready |
|:---:|:---:|
| ![Skills images and TTS](screenshots/able%20to%20use%20hermes%20skills%2C%20show%20images%20hermes%20creates%20and%20use%20tts.png) | ![Firefox extension](screenshots/can%20be%20run%20in%20browser%20extensions%20for%20firefox.png) |

| Works with any theme |
|:---:|
| ![Works with any theme](screenshots/works%20with%20any%20theme.png) |

---

## 🏆 Contest Submission

**Track:** Plugin  
**Author:** [e-shizz](https://github.com/e-shizz)  
**Co-Author:** [kimi-k2.6](https://github.com/e-shizz) (Hermes Agent — plugin SDK integration, SSE streaming backend, TTS/model selector features)  
**License:** MIT

> The frozen contest submission is preserved on the [`contest-submission`](https://github.com/e-shizz/hermes-webui-chat/tree/contest-submission) branch. This `main` branch is actively maintained post-contest with bugfixes and new features.

---

## 🖼️ Architecture

```
┌────────────────────────────────────────────────────────┐
│  Hermes Dashboard (React)                              │
│  ┌───────────────────────────────────────────────┐     │
│  │  App.tsx — route container (flex context)     │     │
│  │  ┌───────────────────────────────────────┐    │     │
│  │  │  Plugin Route: /webui                 │    │     │
│  │  │  ┌──────────────────────────┐         │    │     │
│  │  │  │  WebUI Plugin (this repo)│         │    │     │
│  │  │  │  │ SessionSidebar │ ChatWindow │   │    │     │
│  │  │  │  └──────────────────────────┘         │    │     │
│  │  │  └───────────────────────────────────────┘    │     │
│  │  └───────────────────────────────────────────────┘     │
│  └────────────────────────────────────────────────────────┘
│                                                        │
│  Backend: Hermes Agent JSON-RPC / SSE / gateway        │
└────────────────────────────────────────────────────────┘
```

The plugin registers as a dashboard page via `dashboard/manifest.json`. The core patches (in `patches/`) only touch the dashboard shell — the chat UI itself is 100% self-contained in this repo.

---

## 📜 License

MIT
