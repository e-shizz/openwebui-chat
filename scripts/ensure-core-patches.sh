#!/usr/bin/env bash
# ensure-core-patches.sh
# Detect and re-apply required Hermes core dashboard patches for the webui plugin.
# Run from ~/.hermes/plugins/webui/ or anywhere with HERMES_AGENT set.

set -euo pipefail

HERMES_AGENT="${HERMES_AGENT:-$HOME/.hermes/hermes-agent}"
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== WebUI Core Patch Auditor ==="
echo "Hermes agent: $HERMES_AGENT"
echo "Plugin dir:   $PLUGIN_DIR"
echo ""

# --- Detect missing patches ---
MISSING=0

if ! grep -q "isPluginRoute" "$HERMES_AGENT/web/src/App.tsx" 2>/dev/null; then
    echo "❌ MISSING: Plugin route flex layout (App.tsx isPluginRoute)"
    MISSING=1
else
    echo "✅ App.tsx plugin route fix present"
fi

if ! grep -q "Resume in Web Chat" "$HERMES_AGENT/web/src/pages/SessionsPage.tsx" 2>/dev/null; then
    echo "❌ MISSING: SessionsPage resume button"
    MISSING=1
else
    echo "✅ SessionsPage resume button present"
fi

if [ "$MISSING" -eq 0 ]; then
    echo ""
    echo "All core patches present. Nothing to do."
    exit 0
fi

echo ""
echo "Attempting recovery..."
cd "$HERMES_AGENT"

# --- Strategy 1: cherry-pick from reflog if commit still exists ---
RECOVERED=0

for HASH in 3f4f6cda eec701ff cf1c8405; do
    if git cat-file -e "$HASH" 2>/dev/null; then
        echo "Found recoverable commit $HASH in object store / reflog"
        # Cherry-pick only the files we care about, skipping any plugin files
        git show "$HASH" -- web/src/App.tsx web/src/pages/SessionsPage.tsx | git apply -3 --index 2>/dev/null && {
            echo "✅ Applied patch from $HASH"
            RECOVERED=1
            break
        } || true
    fi
done

# --- Strategy 2: apply hardcoded diff if cherry-pick failed ---
if [ "$RECOVERED" -eq 0 ]; then
    echo "No recoverable commits found. Applying hardcoded patch..."
    # The diff is stored in CORE_PATCHES.md or we could embed it here.
    # For now, fail loudly so the user knows manual intervention is needed.
    echo ""
    echo "⚠️  Automatic recovery failed."
    echo "The required core patches are not present and cannot be auto-recovered."
    echo ""
    echo "Manual steps:"
    echo "  1. Find the lost commits:  cd $HERMES_AGENT && git reflog | grep -i webui"
    echo "  2. Cherry-pick them:       git cherry-pick <hash>"
    echo "  3. Rebuild:                cd web && npm run build"
    echo "  4. Restart dashboard:      pkill -f 'hermes dashboard'; hermes dashboard"
    echo ""
    exit 1
fi

# --- Commit the recovery ---
git add web/src/App.tsx web/src/pages/SessionsPage.tsx
git commit -m "fix(dashboard): re-apply webui plugin required core patches" || true

# --- Rebuild ---
echo ""
echo "Rebuilding web frontend..."
cd "$HERMES_AGENT/web"
npm run build

# --- Restart dashboard if running ---
echo ""
DASH_PID=$(pgrep -f "hermes dashboard" || true)
if [ -n "$DASH_PID" ]; then
    echo "Restarting dashboard (PID $DASH_PID)..."
    kill "$DASH_PID" || true
    sleep 2
fi

# Start fresh in background
nohup hermes dashboard >/dev/null 2>&1 &
echo "✅ Dashboard restarted. Plugin should now render correctly."
