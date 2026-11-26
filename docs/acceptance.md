# Acceptance audit — Orbit Shell 0.10.1

Audit date: 2026-11-15. Runtime environment: GNOME Shell 51.1, isolated headless
Wayland compositor with two virtual monitors. Preferences run on the host with a
memory settings backend. No tests lock or sign out the workstation's real session.

The Orbit-specific feature implementation checklist is complete. The release
acceptance checklist remains partially open: implementation completion does not
establish compatibility with every declared Shell version or physical input setup.

| Acceptance requirement | Status | Evidence and remaining work |
| --- | --- | --- |
| Defaults and preference explanations | Verified in this environment | Strict schema validation, all nine preference pages construct, preset/schema checks, theme and desktop-preset save/rename/delete checks. Defaults and control descriptions reviewed. |
| README and desktop presets | Verified | README documents controls, dependencies, installer and tray limits. Built-in presets validate against the schema; application previews and Undo preserve unrelated settings. |
| Keyboard, focus, accessibility and touch | Partial | Virtual keyboard events verify moving selection, Escape and previous-actor focus restoration. Virtual touchscreen events verify category activation and outside-tap dismissal. An external AT-SPI client reads the launcher result name, button role and focusable state through a dedicated private accessibility bus. No physical touchscreen is exposed here. Orca is installed, but spoken navigation and announcements remain unverified. |
| Long/translated text and RTL | Partial | GTK preferences and preset/theme actions pass in LTR/RTL. All nine Shell launcher layouts pass RTL allocation checks with long Arabic/Hebrew/English labels. Nine screenshots of the private compositor were visually reviewed with long mixed-direction labels. The acceptance suite also passes in a native Arabic RTL Shell session. Orbit translation catalogs and screen-reader pronunciation remain unverified. |
| Monitors, scaling, hotplug and workspaces | Partial | Two virtual monitors, simultaneous 1×/4⁄3× display scales, panel bounds, workspace moves, temporary output removal/restoration and launcher modal cleanup pass. Uniform 1×/2× pixel tests also pass. A 90° virtual display rotation and panel bounds pass. Physical cable unplug/replug remains unverified. |
| Fullscreen, overview, lock/unlock | Partial | Real fixture fullscreen enter/exit verifies taskbar hiding; overview entry closes the launcher. Private unlock-dialog/user mode transitions remove/restore UI and retain indicator registration. Actual authenticated lock/unlock and suspend/resume remain unverified. |
| Cleanup across enable/disable and settings changes | Verified in this environment | 180 open/disable/enable cycles and repeated taskbar/tray settings changes verify stable Orbit actor/modal/focus-group counts, cancelled captured GLib sources, a disconnected native icon-theme signal, empty tracked-window ownership and balanced native keybinding add/remove calls. Six post-GC samples showed no sustained growth. |
| Declared GNOME Shell versions | Partial | Runtime verified on Shell 51.1. Only the 51.1 executable is installed here. Metadata also declares 48, 49 and 50; these versions need separate real-session runs and are not certified by parsing or model tests. |
| Regression coverage and Shell logs | Verified for executed suites | Focused checks, host preferences and isolated runtime/visual suites pass; the harness rejects JS errors and CRITICAL logs. A failed runtime assertion cannot be overwritten by a later PASS. |

## Reproduce

Run from the repository on the host or in a Flatpak editor:

```sh
sh scripts/check.sh --shell --visual --acceptance --a11y
```

Without options, this runs strict schema checks, module parsing, focused regression
suites, and LTR/RTL preferences tests. `--shell` adds the private compositor suite;
`--visual` adds rendered corner/blur comparisons at 14/40 px radii and 1×/2× scaling,
including a live repaint beneath the menu. `--acceptance` adds virtual keyboard/touch, RTL long-label layouts, mixed-scale display changes, fullscreen/overview, private session-mode transitions and fifteen lifecycle/settings cycles auditing actor/modal counts, owned timers, native signal disconnection, window tracking and Orbit keybindings. `--a11y` runs an external Python/GI AT-SPI probe against the private Shell. Its bus and registry are launched explicitly; the workstation accessibility setting is unchanged. Display configuration changes are confined to the private compositor. The host needs GJS, GTK4/Libadwaita,
GNOME Shell, GLib schema tools, `dbus-run-session`, and `timeout`. `make` is optional.

## Follow-up acceptance — 2026-11-26

- Left-to-right and right-to-left preferences passed on GNOME Shell 51.1.
- All nine launcher layouts were captured and visually reviewed in the private
  compositor. The review covered mirrored launcher controls and truncation of
  long Arabic, Hebrew and English labels in a compact menu.
- A separate acceptance run used a temporary Arabic locale and GNOME’s installed
  Arabic translations. The driver verified Shell-wide RTL direction and
  exercised leftward keyboard navigation, mixed-scale taskbars and lifecycle
  cleanup. Orbit’s own labels still need translation catalogs.
- The focused Shell customization suite passed, including bottom banner
  geometry, Do Not Disturb, switcher delay and preview sizing, and restoration
  on disable. A private XWayland session exercised X11 decoration hiding and
  restoration on unmaximize and reset.
- Launcher results now preserve keyboard selection across a content refresh
  while stage focus is temporarily missing. The external AT-SPI suite exercises
  this path before reading the result's accessible name, role and focusable state.
- `sh scripts/check.sh --stress` runs the acceptance suite with 180 cycles and
  samples the private compositor after each batch of 30. The measurements are
  for the entire Shell process. They bound this run and do not cover arbitrary
  session lengths or uninstrumented resources.

| Cycle | Live JavaScript heap nodes after GC | Shell PSS (KiB) |
| ---: | ---: | ---: |
| 30 | 130400 | 264886 |
| 60 | 130420 | 275426 |
| 90 | 130922 | 248472 |
| 120 | 130470 | 254827 |
| 150 | 130472 | 274323 |
| 180 | 130209 | 244119 |

## Remaining manual acceptance

- Use real mouse, keyboard, touch and screen-reader input across all layouts;
  confirm focus is restored after closing menus and cancelling dialogs.
- Check translated long labels and RTL Shell layouts, including submenu placement,
  tray overflow, clock/system order, and drag/drop direction.
- Test physical unplug/replug with open menus and primary-monitor changes.
  Mixed scales and virtual rotation are covered by the automated compositor run.
- Exercise authenticated lock/unlock and suspend/resume while indicators are active.
  Automated mode transitions do not establish authentication or physical-lock correctness.
- Run the same suites and manual scenarios on GNOME Shell 48, 49 and 50 before
  marking compatibility acceptance complete.

Do not mark these requirements complete solely because their underlying feature
exists or a model test passes.

## Issues found and fixed in this acceptance pass

- Keyboard navigation now retains its selected-item reference if stage focus is cleared.
- Closing the launcher restores the previously focused actor after removing its modal root;
  a destroy handler prevents retaining a disposed focus target.
- Monitor configuration changes close the launcher to avoid a stale modal backdrop.
- Fullscreen queries guard against removed monitor indexes during deferred panel rebuilds.
- Launcher application rows and categories now set explicit accessible names.

The session-mode tests push/pop `unlock-dialog` on the private Shell instance. They do
not invoke the real workstation's screen lock or bypass an authentication prompt.

## Physical input and assistive-technology inventory

The 2026-11-15 input inventory exposes keyboards, mice and a touchpad, but no
physical touchscreen. A touchpad is not a substitute for touchscreen acceptance.
Orca and the GI AT-SPI bindings are installed; `pyatspi` is not required by the
external probe. The workstation accessibility setting was read but not changed.
The AT-SPI probe validates a programmatic name, role and focusability; it does not
prove Orca pronunciation, announcement order or end-to-end spoken navigation.

## Follow-up acceptance: rotation and resource cleanup

The private compositor additionally passes a 90° virtual-output rotation followed
by restoration. Each taskbar is checked against the rotated monitor bounds. This
is a real Mutter display configuration change, not physical cable hotplug.

The lifecycle audit runs fifteen disable/enable cycles with taskbar-spacing and
tray-size changes. It captures active Orbit-owned GLib source IDs before disable,
checks that the main context no longer contains them, checks the old icon-theme
signal and tracked-window collection, and observes forwarded native Orbit
keybinding registrations/removals. Wrapper methods are restored in `finally`.
Actor, modal and taskbar keyboard-group counts must remain at their baseline.
This bounds regressions in the audited resources; it is not proof that arbitrary
long-running native/GJS heap growth is absent.

| Declared GNOME version | Real-session result | Limitation |
| --- | --- | --- |
| 48 | Not run | No 48 executable/session installed on this workstation |
| 49 | Not run | No 49 executable/session installed on this workstation |
| 50 | Not run | No 50 executable/session installed on this workstation |
| 51.1 | Private Wayland runtime suites pass | Authenticated lock/unlock and physical cable hotplug are not covered |

Authenticated unlock cannot be established by changing Shell mode or injecting
keys. The test does not lock the user's active desktop, request credentials, or
claim that the private `unlock-dialog` round trip verified PAM/authentication.
