#!/bin/sh
# Produce a GNOME-installable bundle, including every runtime/preferences module.
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -n "${FLATPAK_ID:-}" ]; then
    exec flatpak-spawn --host env -u FLATPAK_ID sh "$script_dir/package.sh"
fi
repo=$(CDPATH= cd -- "$script_dir/.." && pwd)
source_dir="$repo/extension/orbit-dock@niruxx.github.io"
output_dir="$repo/build/releases"
command -v gnome-extensions >/dev/null || { echo 'gnome-extensions is required'; exit 1; }
command -v sha256sum >/dev/null || { echo 'sha256sum is required'; exit 1; }
command -v glib-compile-schemas >/dev/null || { echo 'glib-compile-schemas is required'; exit 1; }
glib-compile-schemas --strict --dry-run "$source_dir/schemas"
mkdir -p "$output_dir"
cd "$source_dir"
set -- --force --out-dir "$output_dir"
for module in ./*.js; do
    case "$module" in ./extension.js|./prefs.js) continue ;; esac
    set -- "$@" "--extra-source=${module#./}"
done
gnome-extensions pack "$@" "$source_dir"
(cd "$output_dir" && sha256sum orbit-dock@niruxx.github.io.shell-extension.zip > orbit-dock@niruxx.github.io.shell-extension.zip.sha256)
echo "Bundle: $output_dir/orbit-dock@niruxx.github.io.shell-extension.zip"
