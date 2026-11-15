#!/bin/sh
# Run focused acceptance checks without make; optional isolated Shell sessions.
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -n "${FLATPAK_ID:-}" ]; then
    exec flatpak-spawn --host env -u FLATPAK_ID sh "$script_dir/check.sh" "$@"
fi
cd "$script_dir/.."
command -v gjs >/dev/null || { echo 'gjs is required'; exit 1; }
command -v glib-compile-schemas >/dev/null || { echo 'glib-compile-schemas is required'; exit 1; }
glib-compile-schemas --strict --dry-run extension/orbit-dock@niruxx.github.io/schemas
gjs -m tests/checkSyntax.js extension/orbit-dock@niruxx.github.io/*.js tests/*.js
for test in windowInteractions dockFeatures desktopFeatures taskbarFeatures launcherNavigation launcherFeatures sessionActions orbitCompletion; do
    gjs -m "tests/$test.js"
done
gjs -m tests/preferencesSmoke.js
ORBIT_TEST_RTL=1 gjs -m tests/preferencesSmoke.js
for option in "$@"; do
    case "$option" in
        --shell) sh tests/shellSmoke.sh ;;
        --a11y) ORBIT_SMOKE_A11Y=1 ORBIT_SMOKE_DRIVER=tests/accessibilitySmoke.js sh tests/shellSmoke.sh ;;
        --acceptance) ORBIT_SMOKE_DRIVER=tests/acceptanceSmoke.js sh tests/shellSmoke.sh ;;
        --visual) ORBIT_SMOKE_DRIVER=tests/launcherGlassSmoke.js sh tests/shellSmoke.sh ;;
        *) echo "Unknown option: $option (use --shell, --visual, --acceptance or --a11y)"; exit 1 ;;
    esac
done
