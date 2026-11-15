#!/bin/sh
# Run on the workstation host: sh tests/shellSmoke.sh
# Uses a private DBus, settings backend, runtime directory, and extension install.
set -eu
repo=$(pwd)
scratch=$(mktemp -d /tmp/orbit-shell-smoke.XXXXXX)
cleanup() {
    if command -v fusermount3 >/dev/null 2>&1; then
        fusermount3 -u "$scratch/run/doc" 2>/dev/null || true
    fi
    rm -rf "$scratch"
}
trap cleanup EXIT HUP INT TERM
export XDG_DATA_HOME="$scratch/share" XDG_CONFIG_HOME="$scratch/config" XDG_CACHE_HOME="$scratch/cache"
export XDG_DATA_DIRS="$scratch/providers:${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
export XDG_RUNTIME_DIR="$scratch/run" GSETTINGS_BACKEND=keyfile
export ORBIT_SMOKE_REPO="$repo" ORBIT_SMOKE_RESULT="$scratch/result"
export LIBGL_ALWAYS_SOFTWARE=1 GTK_A11Y=none NO_AT_BRIDGE=1
export WAYLAND_DISPLAY="orbit-smoke-$$"
export ORBIT_SMOKE_DESKTOP="$scratch/Desktop"
mkdir -p "$ORBIT_SMOKE_DESKTOP/Folder" "$XDG_CONFIG_HOME"
printf 'XDG_DESKTOP_DIR="%s"\n' "$ORBIT_SMOKE_DESKTOP" > "$XDG_CONFIG_HOME/user-dirs.dirs"
printf 'one' > "$ORBIT_SMOKE_DESKTOP/File 2.txt"
printf 'two' > "$ORBIT_SMOKE_DESKTOP/File 10.txt"
printf 'hidden' > "$ORBIT_SMOKE_DESKTOP/.hidden"
mkdir -p "$XDG_RUNTIME_DIR" "$XDG_DATA_HOME/gnome-shell/extensions" "$XDG_DATA_HOME/applications" "$scratch/providers/gnome-shell/search-providers"
chmod 700 "$XDG_RUNTIME_DIR"
cp -r extension/orbit-dock@niruxx.github.io "$XDG_DATA_HOME/gnome-shell/extensions/"
glib-compile-schemas "$XDG_DATA_HOME/gnome-shell/extensions/orbit-dock@niruxx.github.io/schemas"
driver="$XDG_DATA_HOME/gnome-shell/extensions/orbit-smoke@local"
mkdir -p "$driver"
cp "${ORBIT_SMOKE_DRIVER:-tests/shellSmoke.js}" "$driver/extension.js"
printf '%s\n' '{"uuid":"orbit-smoke@local","name":"Orbit smoke driver","description":"Temporary test driver","shell-version":["48","49","50","51"]}' > "$driver/metadata.json"
printf '%s\n' '[Desktop Entry]' 'Type=Application' 'Name=Orbit Smoke' 'Exec=gjs' 'Icon=utilities-terminal' 'StartupWMClass=io.github.orbit.Smoke' > "$XDG_DATA_HOME/applications/io.github.orbit.Smoke.desktop"
cat > "$scratch/providers/gnome-shell/search-providers/orbit-smoke.ini" <<'PROVIDER'
[Shell Search Provider]
DesktopId=io.github.orbit.Smoke.desktop
BusName=io.github.orbit.SmokeSearch
ObjectPath=/SearchProvider
Version=2
PROVIDER
gsettings set org.gnome.shell enabled-extensions "['orbit-dock@niruxx.github.io', 'orbit-smoke@local']"
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.desktop.screensaver lock-enabled false
# Keep this session isolated from the workstation's running compositor.
timeout 40s dbus-run-session -- gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x800 --virtual-monitor 1024x768 --wayland-display "$WAYLAND_DISPLAY" > "$scratch/shell.log" 2>&1 || true
if [ -f "$scratch/result" ]; then
    cat "$scratch/result"
    printf '\n'
else
    printf 'No smoke result produced\n'
fi
if [ ! -f "$scratch/result" ] || ! grep -q '^PASS:' "$scratch/result"; then
    cat "$scratch/shell.log"
    exit 1
fi
if grep -En 'JS ERROR|CRITICAL|Error .*orbit|SyntaxError' "$scratch/shell.log"; then
    cat "$scratch/shell.log"
    exit 1
fi
