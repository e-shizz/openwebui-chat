#!/usr/bin/env bash
# apply-core-patches.sh
# Apply required Hermes core dashboard patches from this plugin repo.
# Run after `hermes upgrade` to re-apply dashboard fixes.
#
# Usage:
#   cd ~/.hermes/plugins/webui
#   ./scripts/apply-core-patches.sh

set -euo pipefail

HERMES_AGENT="${HERMES_AGENT:-$HOME/.hermes/hermes-agent}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/patches"

echo "=== WebUI Core Patch Applier ==="
echo "Hermes agent: $HERMES_AGENT"
echo "Patch dir:    $PATCH_DIR"
echo ""

if [ ! -d "$HERMES_AGENT" ]; then
    echo "❌ ERROR: Hermes agent not found at $HERMES_AGENT"
    echo "   Set HERMES_AGENT or ensure ~/.hermes/hermes-agent exists"
    exit 1
fi

APPLIED=0
SKIPPED=0
CONFLICTS=0

for patch in "$PATCH_DIR"/*.patch; do
    [ -e "$patch" ] || continue
    name=$(basename "$patch")
    echo "📋 $name ..."

    if git -C "$HERMES_AGENT" apply --check "$patch" 2>/dev/null; then
        git -C "$HERMES_AGENT" apply "$patch"
        echo "   ✅ Applied"
        APPLIED=$((APPLIED + 1))
    else
        # Check if already applied
        if git -C "$HERMES_AGENT" apply --check --reverse "$patch" 2>/dev/null; then
            echo "   ⏭️  Already applied (skipping)"
            SKIPPED=$((SKIPPED + 1))
        else
            echo "   ⚠️  CONFLICT — patch does not apply cleanly"
            echo "      File may have changed significantly in this update."
            echo "      Manual review needed: $patch"
            CONFLICTS=$((CONFLICTS + 1))
        fi
    fi
done

echo ""
echo "=== Results ==="
echo "Applied:   $APPLIED"
echo "Skipped:   $SKIPPED"
echo "Conflicts: $CONFLICTS"
echo ""

if [ "$CONFLICTS" -gt 0 ]; then
    echo "❌ Some patches failed. Review conflicts above before rebuilding."
    exit 1
fi

# Rebuild dashboard
echo "🔨 Rebuilding dashboard..."
cd "$HERMES_AGENT/web"
npm run build

echo ""
echo "✅ Done. Restart Hermes dashboard if running:"
echo "   pkill -f 'hermes dashboard'; hermes dashboard"
