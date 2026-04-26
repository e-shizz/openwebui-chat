# Required Hermes Core Patches

This external dashboard plugin (`webui`) requires specific modifications to the
Hermes Agent core dashboard frontend. When you `git pull` Hermes core updates,
these changes can be lost if they were on a feature branch.

## Current Required Patches

| Commit | File | Purpose |
|--------|------|---------|
| `3f4f6cda` | `web/src/App.tsx` | Plugin route flex layout: detect plugin/override routes, skip outer padding, apply `min-h-0 flex flex-1 flex-col` so plugins can use `h-full` |
| `3f4f6cda` | `web/src/pages/SessionsPage.tsx` | Add "Resume in Web Chat" button (MessageSquare icon) that navigates to `/webui?resume=<id>` |

## How These Were Lost

The original commits (`cf1c8405`, `67141335`, `eec701ff`) were on a
`feature/webui-chat` branch in `~/.hermes/hermes-agent/`. After switching to
`main` and running `git pull --ff-only`, the branch commits became dangling in
the reflog. The core dashboard was rebuilt without them, breaking the plugin's
viewport-filling layout.

## Recovery

If patches are missing after a core update:

```bash
cd ~/.hermes/hermes-agent
# Check if plugin route fix is present
grep -q "isPluginRoute" web/src/App.tsx || {
    # Find the commits in reflog (if still there)
    git reflog | grep "webui-chat\|plugin route\|OpenWebUI"
    # Or re-apply from this plugin repo's backup diff
    ./scripts/ensure-core-patches.sh
}
```

## Automated Helper

Run from the plugin repo:
```bash
./scripts/ensure-core-patches.sh
```

This will:
1. Detect if required core changes are missing
2. Cherry-pick/re-apply them from known-good commit hashes
3. Rebuild the web frontend
4. Restart the dashboard (if running)

## Commit These Back to Core?

The ideal long-term fix is getting these changes merged into upstream Hermes
`main` so they survive `git pull`. Until then, this file tracks the dependency.
