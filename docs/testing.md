# Testing and acceptance

Run commands from the repository root. Tests use temporary settings, extension copies
and private session buses; they do not reload or lock your running desktop.

## Run the automated checks

```sh
sh scripts/check.sh --shell --visual --acceptance --a11y
```

The script supports host terminals and Flatpak editors without `make`. Host dependencies
include GJS, GNOME Shell, GTK4/Libadwaita, GLib schema tools, `dbus-run-session`, and `timeout`.
The accessibility check also needs Python GI/AT-SPI and the AT-SPI bus/registry binaries.

| Command or option | Coverage |
| --- | --- |
| `sh scripts/check.sh` | Strict schemas, JavaScript parsing, focused models, and LTR/RTL preferences |
| `--shell` | Dock, taskbar, launcher, tray, desktop, workspace and lifecycle integration |
| `--visual` | Pixel comparisons of rounded glass corners at two radii and 1×/2× scaling; live repaint |
| `--acceptance` | Virtual keyboard/touch, RTL long labels, mixed scales, virtual rotation/output changes, fullscreen/overview, session modes, and lifecycle/settings stress |
| `--a11y` | External AT-SPI client checks names, button role and focusability on a dedicated private accessibility bus |
| `make check` | Schema/module and focused behavior checks; fails if required tools are absent |

## Run individual compositor suites

```sh
sh tests/shellSmoke.sh
ORBIT_SMOKE_DRIVER=tests/launcherGlassSmoke.js sh tests/shellSmoke.sh
ORBIT_SMOKE_DRIVER=tests/acceptanceSmoke.js sh tests/shellSmoke.sh
ORBIT_SMOKE_A11Y=1 ORBIT_SMOKE_DRIVER=tests/accessibilitySmoke.js sh tests/shellSmoke.sh
```

The harness rejects failed assertions, JavaScript errors and CRITICAL Shell logs.
A failed runtime assertion cannot be overwritten by a subsequent PASS.

## What passing tests establish

See [acceptance.md](acceptance.md) for dated evidence and [roadmap.md](roadmap.md) for
implementation and acceptance status. Virtual input and display changes do not establish
physical touchscreen or cable-hotplug behavior. Private unlock-dialog mode transitions
do not establish authenticated unlock. AT-SPI names/roles do not establish spoken Orca
navigation. Older declared GNOME versions need their own real-session tests.

When adding a feature, update its topic guide, schema/preset checks and relevant runtime
coverage. Inspect cleanup of actors, timers, signals, grabs and keybindings as well as the
visible result. Record limitations rather than marking unexecuted checks complete.

[Documentation index](README.md) · [Architecture](development.md)
