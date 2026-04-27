# Required Hermes Core Patches

This external dashboard plugin (`webui`) requires specific modifications to the
Hermes Agent core dashboard frontend. These patches live in `patches/` as
standalone `.patch` files and are applied after each `hermes upgrade`.

## Patch Files

| Patch | File | Purpose |
|-------|------|---------|
| `0001-dashboard-plugin-route-flex-layout.patch` | `web/src/App.tsx` | Plugin route flex layout: detect plugin/override routes, skip outer padding, apply `min-h-0 flex flex-1 flex-col` so plugins can use `h-full` |
| `0002-dashboard-sessions-page-resume-button.patch` | `web/src/pages/SessionsPage.tsx` | Add "Resume in Web Chat" button (MessageSquare icon) that navigates to `/webui?resume=<id>` |
| `0003-dashboard-code-background-fix.patch` | `web/src/index.css` | Decouple `<code>` background from animated `--selection-bg` to stop inline code from flashing colors on text selection |

## How to Apply (after `hermes upgrade`)

```bash
cd ~/.hermes/plugins/webui
./scripts/apply-core-patches.sh
```

This will:
1. Detect which patches are missing
2. Apply them cleanly via `git apply`
3. Rebuild the web frontend (`npm run build`)

## Why Patches Instead of Fork Commits?

Previously these changes were maintained as commits on a `feature/webui-chat`
branch in a forked `hermes-agent` repo. This broke every upgrade because:
- `hermes upgrade` resets `main` to `origin/main`
- Fork branch commits become dangling
- Cherry-picking was error-prone and messy

The patch-based workflow keeps **all plugin-related changes in the plugin repo**,
where they belong. After any upgrade, run one script and you're back in business.

## Adding a New Patch

1. Make the change in `~/.hermes/hermes-agent/web/src/...`
2. `cd ~/.hermes/hermes-agent && git diff web/src/SomeFile.tsx > ~/.hermes/plugins/webui/patches/000X-description.patch`
3. Test: `./scripts/apply-core-patches.sh --check`
4. Commit the new patch file to the plugin repo

## Removing a Patch

If upstream Hermes merges the fix natively, the applier will skip it
(`Already applied`). Delete the patch file from `patches/` once you confirm
it's no longer needed.
