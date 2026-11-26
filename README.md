# Orbit Shell

A GNOME Shell extension with a configurable dock, per-monitor taskbars, application
launcher, desktop icons, application indicators and glass effects.

Orbit changes GNOME Shell surfaces. It does not install GTK/icon/cursor themes,
wallpapers, system fonts, login-screen themes or boot splashes.

## Install or update

From the repository root:

```sh
sh scripts/install.sh
```

Log out and back in on Wayland, then enable the extension if needed:

```sh
gnome-extensions enable orbit-dock@niruxx.github.io
```

The installer works without `make` and supports Flatpak editors with host execution.
See [installation](docs/installation.md) for dependencies and packaging alternatives.

## Configure

Open **Extensions → Orbit Shell → Settings**, or run:

```sh
gnome-extensions prefs orbit-dock@niruxx.github.io
```

Use **Top Bar → Window Buttons** to add Minimize, Maximize / Restore and Close to
GNOME’s panel and place the group on the left, center or right. Use **Shell**
to customize notification banners, on-screen displays, workspace switching,
Alt+Tab, Quick Settings and maximized X11 window decorations.

## Documentation

Start with the [documentation index](docs/README.md), or open a topic:

- [Dock](docs/dock.md) and [taskbar](docs/taskbar.md)
- [Application launcher](docs/launcher.md)
- [Appearance and effects](docs/appearance.md) and [top bar](docs/top-bar.md)
- [Desktop icons](docs/desktop-icons.md) and [application tray](docs/tray.md)
- [Layouts and presets](docs/layouts.md) and [backups](docs/backups.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Development](docs/development.md), [testing](docs/testing.md), [acceptance report](docs/acceptance.md) and [roadmap](docs/roadmap.md)

Metadata declares GNOME Shell 48–51. Real-session validation currently covers 51.1;
other versions and remaining hardware checks are recorded in the acceptance report.
The UUID `orbit-dock@niruxx.github.io` is retained for compatibility.
