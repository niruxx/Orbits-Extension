# Installation and updates

Run commands from the repository root. Orbit declares GNOME Shell 48–51 support;
real-session verification currently covers 51.1. See the [acceptance report](acceptance.md)
for the exact environment and unverified versions.

## Install for your account

```sh
sh scripts/install.sh
```

The host needs `glib-compile-schemas`. The script validates the schema, copies the
extension to `~/.local/share/gnome-shell/extensions/orbit-dock@niruxx.github.io`,
and compiles the installed schema. It preserves saved preferences and does not restart Shell.

Log out and back in after installing or updating on Wayland. Then enable the extension:

```sh
gnome-extensions enable orbit-dock@niruxx.github.io
```

Run the same installer to update an existing installation. Changes to most preferences
apply live; launcher appearance changes generally apply when the menu is reopened.

## Flatpak editors and systems without make

The installer detects a Flatpak environment and uses `flatpak-spawn --host` with an
absolute script path. The repository must be accessible at the same path on the host,
and the editor must permit host execution. If host execution is unavailable, run the
installer in a host terminal. `make` is not required.

## Open preferences

Use **Extensions → Orbit Shell → Settings**, or:

```sh
gnome-extensions prefs orbit-dock@niruxx.github.io
```

## Other installation and packaging commands

| Command | Purpose |
| --- | --- |
| `make install` | Install to the current user's extension directory |
| `sh scripts/package.sh` or `make zip` | Build an installable ZIP in `build/releases/` |
| `gnome-extensions install --force PATH_TO_ZIP` | Install a built ZIP |
| `make dist` | Build a source archive including documentation and tests |
| `make pkg-arch` | Build the Arch package; requires the Arch packaging tools |

The Arch package conflicts with the old `orbit` package that bundled a GTK app.
The extension UUID retains `dock` for compatibility; do not rename its installed directory.

## Install the downloadable archive

The bundle is `build/releases/orbit-dock@niruxx.github.io.shell-extension.zip`.
It contains the extension code, preferences, styles and settings schema, not the
source repository or its build tools. Install it without cloning the repository:

```sh
gnome-extensions install --force /path/to/orbit-dock@niruxx.github.io.shell-extension.zip
```

Log out and back in on Wayland, then enable it:

```sh
gnome-extensions enable orbit-dock@niruxx.github.io
```

An extension-management application with local ZIP installation support can select
this same file. The command above is the direct GNOME installation method.

## Disable or remove

```sh
gnome-extensions disable orbit-dock@niruxx.github.io
```

To remove a user installation from a repository checkout, use `make uninstall`.
Removal does not reset saved preferences. Export a [backup](backups.md) before resetting settings.

[Documentation index](README.md)
