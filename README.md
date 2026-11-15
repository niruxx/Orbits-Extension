# Orbit Shell

A GNOME Shell extension that adds a dash-to-dock style dock, a dynamic top bar, a
Plasma-style app launcher, tray icons, native desktop icons, frosted-glass effects and one-click desktop layouts.
It customises GNOME Shell itself; it does not manage wallpapers, GTK/icon/cursor
themes, fonts, the login screen or the boot splash. Everything is configured from the
extension's own settings: open **Extensions → Orbit
Shell → Settings**, or run `gnome-extensions prefs orbit-dock@niruxx.github.io`.

| Settings page | What it does |
|---|---|
| **Layouts** | One-click desktop layouts: GNOME, Ubuntu Unity, Windows 10, Windows 11, Windows XP, Arc Desktop, macOS (undo from the toast) |
| **Dock** | Position, panel mode, autohide/intellihide, content, click and scroll actions, appearance |
| **Taskbar** | Per-monitor panels, vertical layouts, ordering/visibility, whole-panel hiding, interactions, preview styling and settings backups |
| **Top Bar** | Dynamic or translucent bar, opacity, colour, floating look, glass, Activities, clock position, hot corner |
| **Launcher** | App menu in nine styles (Modern, List view, Minimal, Classic, Arc Menu, Two-column); choose what Super, Activities and the dock's apps button open |
| **Desktop Icons** | Enable icons; choose files, Home, Trash and drives; customize sizes, labels and special icons; sorting and manual arrangement |
| **Personalization** | AppIndicator tray icons (top bar or bottom-left), focused-app button, title bar buttons |
| **Effects** | Frosted glass for the dock, top bar and launcher; blur strength, brightness, frosted edge |

GNOME Shell 48–51. The extension's UUID still says "dock" for compatibility.

## Install

```sh
make install                 # for your user: ~/.local/share/gnome-shell/extensions
gnome-extensions enable orbit-dock@niruxx.github.io
```

On Wayland, GNOME Shell only picks up a newly installed or updated extension after you
**log out and back in**. Settings changes apply live.

Other targets:
- `make zip` builds a zip for extensions.gnome.org or `gnome-extensions install`.
- `make pkg-arch` builds an Arch package (`gnome-shell-extension-orbit`). It conflicts with
  the old `orbit` package, which bundled a GTK app.
- `make check` validates the schema, parses JavaScript modules and runs window-interaction lifecycle checks.

## Features

**Dock**
- Bottom / left / right / top, floating or edge-to-edge panel mode, one dock per monitor
- Always visible (reserves space), autohide, or intelligent autohide (any window / focused
  app / maximized only), with pressure-to-reveal at the screen edge
- Pinned + running apps with separator; one dot per window, a single dot, or a line
- Applications button at the start, the end, or between pinned and running apps
- Click: focus → minimize → cycle windows (or cycle / raise-all / always launch);
  middle-click: new window / minimize / quit; scroll: cycle windows or switch workspace
- Drag apps from the app grid to pin them, drag within the dock to reorder, drop on the
  apps button to unpin. Right-click gives the standard GNOME app menu.
- Icons shrink automatically when the dock is full, or stay fixed with scrollable overflow
- Maximum dock length as a percentage of the available screen edge
- Fixed or dynamic dock opacity, with independent idle and near-window opacity
- Dots, squares, dashes, segmented, solid and Metro indicators; thickness, focused/unfocused
  colours and optional dominant app icon colours
- Notification counts, Unity LauncherEntry progress bars and urgent-app highlighting/reveal
- Optional Trash and volume icons, with mounted-only/local/network filters and device actions
- Independent edge reveal delay, fullscreen reveal policy and manual visibility mode
- Preferred monitor selection (falls back to primary), and pinned apps on the primary monitor only
- Configurable Shift-click and Shift-middle-click actions
- Hover window previews with activate/close controls; optional dimming of other windows while peeking
- Click actions can toggle previews, focus/show previews, or spread only that app’s windows
- Configurable numbered shortcuts with number overlays and temporary dock reveal

**Dock shortcuts and manual visibility**: enable numbered shortcuts under **Dock → Keyboard
Shortcuts**. Defaults are **Super + Alt + 1…9, 0**, following the visible app order on the
pointer’s monitor (with a fallback to the first dock). Ungrouped taskbars number each app
once. Number overlays can be temporary, always visible, or hidden. Each binding is editable
as a GTK accelerator; choose an unused combination to avoid desktop shortcut conflicts.
The reveal shortcut defaults to **Super + Alt + D**. It briefly reveals an automatic dock,
or toggles visibility in **Manual** mode. Edge pressure does not reveal a manually hidden
dock. The fullscreen reveal switch applies to edge, urgency and keyboard reveals; a fixed
dock also hides over fullscreen windows until explicitly revealed.

**Badges, progress and urgency**: counts combine GNOME notification sources associated with
an application and the `com.canonical.Unity.LauncherEntry` protocol, avoiding duplicate counts.
Progress requires the application to publish LauncherEntry updates; unsupported applications
will not show progress. Disconnected exporters are removed. Urgency comes from critical
notifications, window attention requests or LauncherEntry and can briefly reveal the dock.
These overlays and reveal behavior have separate switches.

**Trash and volumes**: optional icons open in your default file manager. Right-click Trash
for **Empty Trash…**, which uses Nautilus’s file-operation service and its confirmation dialog
(requires Nautilus and GVfs). Orbit never deletes trash contents directly. Volume icons
support opening/mounting and, when the device supports them, unmount/eject actions. Authentication
uses GNOME’s mount dialogs. You can filter local/network locations and show unmounted volumes.
Actual devices and network mounts depend on the volume monitors installed on the system.

**App window spread**: choose the spread click action for an app-only overview with a scrollable
thumbnail grid, window activation and close controls. Escape or a backdrop click closes it.
It respects the dock’s workspace/monitor filters and leaves GNOME’s overview implementation unchanged.

**Taskbars**: enable integrated taskbars from **Taskbar → Panel Layout**, or apply a Windows
or Arc Desktop layout. Orbit provides a panel with app buttons, a clock/notification menu,
AppIndicator tray and system controls on each selected monitor. GNOME’s original panel is
restored when integrated taskbars are disabled. Clock and system buttons open GNOME’s existing
menus, anchored to the panel you used; keyboard menu shortcuts continue to work.

Choose top, bottom, left or right placement, thickness, length and anchor. Per-monitor overrides
can change those values and visibility independently; monitor indexes start at 0. A position
of **Follow Top Bar position** preserves existing layout presets. Panel appearance uses the
Top Bar colour, opacity, floating and glass settings. Fixed panels reserve space; autohide
and intelligent hiding move the entire panel, including the clock and tray. Hiding respects
window filters, open menus, keyboard focus and the fullscreen reveal policy.

**Panel Elements** lets you reorder or hide the applications button, overview, app buttons,
focused-app button, places, flexible spaces, tray, clock, system controls and Show Desktop.
Centered alignment balances the application group against the status controls. Numbered
shortcuts use each panel’s app order. Ctrl+Alt+Tab includes the taskbars for keyboard navigation.
AppIndicator items mirror across panels when their location is **Top bar / taskbar**; the
existing floating bottom-left tray remains available as a separate placement option.

Turn off **Dock → Taskbar → Group windows by application** for a button per window, with
optional title labels and adjustable label width. Apps scroll when space runs out, and icon
size is capped to fit the panel thickness. Show Desktop minimizes/restores windows on the
current workspace and optionally peeks on hover. Window buttons retain native app context
menus; ungrouped buttons are not drag sources for rearranging individual windows.

Unused panel space supports configurable click, middle-click and double-click actions,
workspace/window cycling or volume scrolling, and dragging the focused window. Those gestures
leave app and status buttons to their own actions. Focused and unfocused running indicators
have independent styles and colours. Icon hover effects can zoom or lift, with adjustable
strength and support for the system’s animation preference.

**Settings backups**: use **Taskbar → Settings Backup** to export Orbit preferences as JSON.
Import validates the format, setting names, types, ranges, monitor overrides and shortcuts
before showing an apply confirmation. The confirmation toast offers Undo for 15 seconds.
Backups include Orbit’s dock, taskbar, desktop and launcher preferences. GNOME settings outside
Orbit—such as shared pinned apps and window-button layouts—are excluded. Files are limited
to 1 MiB. Imports and layout presets use separate transactions so subsequent preference edits
continue applying live.

**Window previews**: configure hover previews, delay, width, title visibility and peeking
under **Dock → Window Previews**. Additional width/height ratio, close delay, title font size,
background, opacity and corner controls are on **Taskbar → Preview Appearance**. They work in both dock and taskbar modes and respect
workspace/monitor filters. Preview click actions work even when hover previews are off.
Use the thumbnail to activate a window and its close button to request closing it. A popup
closes when its application's window list changes. Peeking restores original window
opacities when the popup closes. Minimized windows may not provide an up-to-date thumbnail.

**Top bar**: *Dynamic* keeps the bar transparent until a window touches it (or until a
window is maximized), then fades to solid. *Translucent* always uses your opacity. Both can
float as a rounded bar and use frosted glass. Changing a look option while the style is
*Theme default* switches it to Translucent, so the change shows. You can also hide
Activities, move the clock, and show the focused app's name or window title with its menu.

**Launcher**: an app menu in nine styles (Launcher → Menu style):
- *Modern*: search, a pinned grid and an All apps list, with user and power buttons (Windows 11 style)
- *List view*: one scrolling list, pinned apps first, then A–Z with letter headings
- *Minimal*: a compact, centred search box with a row of pinned icons; results appear as you type
- *Arc Menu*: user and search header, category sidebar, four-column app grid and power controls,
  paired with a translucent bottom taskbar by the *Arc Desktop* layout preset
- *Classic*: categories beside the app list (Plasma Kicker style)
- *Two-column*: the Windows XP layout with a GNOME look: user and search on top; pinned apps
  and All Apps on the left; folders, Settings, Software and Run… on the right; Log Out and
  Power Off at the bottom. Optionally, All Apps is grouped into category folders
  (Launcher → Group All Apps into categories).

It can replace the overview for the Super key and the Activities button, and Orbit can
skip the overview at login.

**Sign out**: use the labeled **Sign Out** button in the launcher power controls, or
right-click empty taskbar space and choose **Sign Out…**. GNOME handles the sign-out
confirmation. Launcher power controls can be enabled in Launcher preferences.

**Taskbar spacing**: use **Taskbar → Spacing** to adjust section gaps, spacing between
system indicators, tray-icon gaps, and clock/system button padding. Controls work on
horizontal and vertical panels, with scaling applied automatically.

**Taskbar application names**: enable **Taskbar → Application Appearance → Show application
names beside running icons**. This works for grouped apps and individual window buttons;
unopened pins remain icon-only. The name width is adjustable.

**Taskbar app area**: pinned and running icons use their natural width and expand as apps
are added, up to the space beside the other panel controls. Scrollbars stay hidden;
overflow remains scrollable when the panel fills.

**Taskbar workspace actions**: right-click a running application and choose **Move Application
to Workspace** to send its windows to an existing or new workspace without switching away.
Individual window buttons offer **Move Window to Workspace** instead. When GNOME limits
workspaces to the primary monitor, the action also moves secondary-monitor windows there.

**Launcher interaction and customization**: arrow keys now move an explicit selection
between app tiles, list rows, categories and footer controls. Down from search selects the
first result; Tab and Shift+Tab cycle controls. The focus highlight follows selection and
scrolls into view with a short animation. Actual pointer movement switches back to mouse
selection; stationary hover cannot interrupt keyboard navigation. Category hover delay and
highlight transition time are adjustable on the Launcher page.

Right-click an app (or use its keyboard context menu) to open it, launch a new window,
pin/unpin it, move its pin earlier/later, or use desktop-file actions. **Keep launcher pins
separate from the dock** initializes an independent pin list from current dock favorites.
Pinned content and installed-app results refresh while the menu is open. The default view
can show pins, all apps or frequently used apps; frequency uses GNOME’s existing usage data.

Menu width, height, Arc column count, grid icon size, font size, background colour and opacity
are configurable. Grids adapt to the available monitor space. A custom launcher shortcut
(default **Super+Alt+Space**) is available alongside the existing Super-key action.

Selecting **Arc Menu** automatically enables a bottom taskbar when **Enable bottom taskbar
with Arc Menu** is on. Existing per-monitor overrides remain in effect. Other menu styles
can use **Apply Bottom Bar**. On the Launcher page, **Arc Bottom Bar** controls its background
mode, opacity, opacity near windows and glass. **Menu bottom strip opacity** separately
controls the power-action strip inside the Arc/Classic menu. These controls apply on the
next menu opening; taskbar appearance settings apply live.

**Additional launcher views**: Dashboard provides a wide application grid with view tabs;
Runner puts search and results at the top center of the screen; Sidebar provides a tall
category menu. All nine layouts offer pinned, all, frequent, newly installed, recent-file
and custom-shortcut views. Category names, order, visibility and empty-category behavior
are editable. Width, height, per-layout grid columns and icon sizes are configurable, and
placement can follow the taskbar or use a fixed screen corner/center.

**Provider and file search**: Orbit uses installed GNOME search providers, respecting
GNOME Search enable/disable settings. The Launcher page also has per-provider switches,
result limits and description controls. Queries are debounced, cancelled on changes or
menu closure, and limited to five seconds. Recent Files is off by default and additionally
requires GNOME Privacy’s File History setting. It excludes private bookmarks and supports
age/result limits. Clearing history from preferences removes the shared system recent-file
list; it does not delete the files. Newly Installed tracks additions after the first Orbit
scan, with a configurable expiration period.

**Shortcuts and places**: add, edit, remove and reorder pinned folders, websites, installed
applications or commands from Launcher preferences. Custom shortcuts appear with pins and
in search in every layout, and have reorder/remove context actions. Commands launch only
when selected; program arguments are parsed directly (use `sh -c` explicitly for shell
syntax). Built-in places and system shortcuts can be reordered, hidden or disabled.

**Launcher appearance and backups**: customize the applications button’s icon, label,
icon size and color. Menu appearance includes text/selection colors, borders, corners,
spacing and padding. Save, rename, preview, delete and export named themes. Import a theme
or launcher configuration with a change preview and Undo; themes only change appearance,
and launcher backups preserve unrelated dock/desktop settings. Reset Theme restores default
appearance without removing shortcuts or saved themes. Desktop layout presets preserve
launcher customizations unless the preset explicitly sets a launcher option.

**Desktop icons**: enable them under **Desktop Icons → Enable desktop icons** (off by
default). Orbit draws them below application windows and hides them in the overview and
on the lock screen. No separate desktop-icon extension is needed. If a supported competing
desktop-icon provider is enabled, Orbit leaves desktop rendering to that provider; the
preferences page offers to disable it before using Orbit.

Choose whether to show Desktop folder files, hidden files, Home, Trash and mounted locations.
Files follow the account’s XDG Desktop folder. **Open Desktop Folder** in preferences opens
that folder, creating it if necessary. If no separate Desktop folder is configured, Orbit
shows special icons without listing the entire Home directory. Files open with their default
handlers; file management and application-launcher trust remain with the file manager.

Appearance controls include icon size, label font size and colour, label shadow and extra
spacing. Home and Trash can use an icon theme name or an image chosen from a file picker.
Files also honor existing `metadata::custom-icon` overrides. Other icons use the installed
icon theme. Layout presets preserve these desktop settings.

Sort by name, modification time, size or file type, with reverse name/date/size orders and
an independent folders-first option. Home, Trash and mounts stay ahead of regular files in
automatic arrangements. Choose any start corner and fill rows or columns. **Manual** mode
lets you drag icons between grid cells, swapping occupied cells and saving positions.
Dragging here changes icon placement; use Files for copying, renaming or deleting files.

Use the primary monitor or distribute icons across all monitors. Files and mounted locations
refresh live. If the grid fills, **More files…** opens the Desktop folder; enumeration is
bounded at 5,000 entries to keep Shell responsive. Right-click the desktop for sorting,
refresh, Desktop Icon Settings and GNOME’s background/display settings. Icons support
single- or double-click opening, Enter/Space, arrow-key navigation and keyboard context menus.

**Tray icons**: Orbit implements the StatusNotifierWatcher/host and DBusMenu protocols, so
Discord, Steam, Telegram and others show their icons and menus. Disable other AppIndicator
extensions first; only one program can host the tray. Electron/Chromium apps register
their icon only once, when they start. So Orbit keeps the tray service running through
setting changes and screen locks, and the extension stays loaded on the lock screen,
without showing any of its UI there. An app started while the tray was off needs a
restart to show its icon.

**Frosted glass**: the launcher blurs the live wallpaper and application windows behind it.
Its backdrop is bounded to the menu and clipped with the same corner radius, leaving the
rounded corners transparent. The dock and top bar retain their wallpaper blur. Surface
opacity controls the tint over the blur; turn off Frosted glass for plain transparency.

## Validation

For rendered Arc corner/transparency checks over a real window, run
`ORBIT_SMOKE_DRIVER=tests/launcherGlassSmoke.js sh tests/shellSmoke.sh` on the host.
This compares all four corners with glass off/on at 14/40 px radii and 1×/2× scaling,
and checks that a window repaint updates the launcher backdrop.

`make check` runs schema validation, module parsing and focused state/lifecycle checks.
For a real compositor smoke test, run `sh tests/shellSmoke.sh` on the workstation host
with GNOME Shell, `gjs`, `dbus-run-session` and `timeout` installed. It creates a private
headless Wayland session, temporary settings and a temporary extension install; it does
not reload the running desktop. The harness exercises app spread, previews, badge/progress
updates and sender cleanup, native notification counts, icon colours, dock sizing, taskbar
window buttons, manual visibility, independent horizontal/vertical taskbars on two virtual monitors, native menu
anchoring, mirrored tray items, whole-panel hiding, desktop sorting/placement, live Desktop
folder changes and disable/re-enable. It does not empty Trash or operate
real devices. Interactive checks of edge pressure, keyboard input, mixed scaling and real
mount authentication are still needed, as are checks on every claimed Shell version.

## Roadmap

See [the feature parity roadmap](roadmap.md) for the comparison checklist and planned work.

## Layout

```
extension/orbit-dock@niruxx.github.io/
  extension.js        enables the parts; keeps the tray alive on the lock screen
  desktopIcons.js     native desktop icons; desktopModel.js handles sorting and placement
  dock.js             the dock
  taskbarPanel.js     independent monitor panels; taskbarModel.js and taskbarPrefs.js
  settingsBackup.js   validated Orbit settings export/import
  topbar.js           dynamic / translucent / floating top bar
  launcher.js         Kicker-style app menu
  shellModes.js       Super key, Activities button, start on the desktop
  appButton.js        focused-app button in the top bar
  tray.js             AppIndicator / StatusNotifierItem host + DBusMenu
  glass.js            live launcher backdrop, wallpaper blur and rounded masks
  util.js             shared helpers
  prefs.js            settings window: prefsPages.js, prefsLayouts.js, prefsWidgets.js
  schemas/            GSettings schema
packaging/arch/       PKGBUILD
```

