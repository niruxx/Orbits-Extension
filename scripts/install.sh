#!/bin/sh
# Works on the host or from a Flatpak editor. Does not restart GNOME Shell.
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -n "${FLATPAK_ID:-}" ]; then
    exec flatpak-spawn --host env -u FLATPAK_ID sh "$script_dir/install.sh" "$@"
fi
repo=$(CDPATH= cd -- "$script_dir/.." && pwd)
source_dir="$repo/extension/orbit-dock@niruxx.github.io"
profile_dir="$HOME/.local/share/gnome-shell/extensions/orbit-dock@niruxx.github.io"
command -v glib-compile-schemas >/dev/null || { echo 'glib-compile-schemas is required'; exit 1; }
glib-compile-schemas --strict --dry-run "$source_dir/schemas"
mkdir -p "$profile_dir"
cp -r "$source_dir"/. "$profile_dir"/
glib-compile-schemas --strict "$profile_dir/schemas"
echo 'Orbit installed for this user. Log out and back in to load the update.'
