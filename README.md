# Orbit Shell

A GNOME Shell extension that adds a dash-to-dock style dock, a dynamic top bar, a
Plasma-style app launcher, tray icons, frosted-glass effects and one-click desktop layouts.
It customises GNOME Shell itself; it does not manage wallpapers, GTK/icon/cursor
themes, fonts, the login screen or the boot splash. Everything is configured from the
extension's own settings: open **Extensions → Orbit
Shell → Settings**, or run `gnome-extensions prefs orbit-dock@niruxx.github.io`.

| Settings page | What it does |
|---|---|
| **Layouts** | One-click desktop layouts: GNOME, Ubuntu Unity, Windows 10, Windows 11, Windows XP, macOS (undo from the toast) |
| **Dock** | Position, panel mode, autohide/intellihide, content, click and scroll actions, appearance |
| **Top Bar** | Dynamic or translucent bar, opacity, colour, floating look, glass, Activities, clock position, hot corner |
| **Launcher** | App menu in five styles (Modern, List view, Minimal, Classic, Two-column); choose what Super, Activities and the dock's apps button open |
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
- `make check` validates the schema and the JS syntax.

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
- Icons shrink automatically when the dock is full

**Taskbar (Windows layouts)**: the top bar can move to the bottom of the screen, and the
dock's start button and app icons can live inside it (Dock → Taskbar). Together that gives
one Windows-style taskbar, apps left (Windows 10) or centred (Windows 11), with the tray
and clock on the right, and no separate dock.

**Top bar**: *Dynamic* keeps the bar transparent until a window touches it (or until a
window is maximized), then fades to solid. *Translucent* always uses your opacity. Both can
float as a rounded bar and use frosted glass. Changing a look option while the style is
*Theme default* switches it to Translucent, so the change shows. You can also hide
Activities, move the clock, and show the focused app's name or window title with its menu.

**Launcher**: an app menu in five styles (Launcher → Menu style):
- *Modern*: search, a pinned grid and an All apps list, with user and power buttons (Windows 11 style)
- *List view*: one scrolling list, pinned apps first, then A–Z with letter headings
- *Minimal*: a compact, centred search box with a row of pinned icons; results appear as you type
- *Classic*: categories beside the app list (Plasma Kicker style)
- *Two-column*: the Windows XP layout with a GNOME look: user and search on top; pinned apps
  and All Apps on the left; folders, Settings, Software and Run… on the right; Log Out and
  Power Off at the bottom. Optionally, All Apps is grouped into category folders
  (Launcher → Group All Apps into categories).

It can replace the overview for the Super key and the Activities button, and Orbit can
skip the overview at login.

**Tray icons**: Orbit implements the StatusNotifierWatcher/host and DBusMenu protocols, so
Discord, Steam, Telegram and others show their icons and menus. Disable other AppIndicator
extensions first; only one program can host the tray. Electron/Chromium apps register
their icon only once, when they start. So Orbit keeps the tray service running through
setting changes and screen locks, and the extension stays loaded on the lock screen,
without showing any of its UI there. An app started while the tray was off needs a
restart to show its icon.

**Frosted glass**: a blurred copy of the wallpaper behind each surface, tinted by its
background colour and clipped to its rounded corners. Windows behind are not blurred. That
keeps it cheap and the corners clean, and it only applies to Shell UI, not app windows.

## Layout

```
extension/orbit-dock@niruxx.github.io/
  extension.js        enables the parts; keeps the tray alive on the lock screen
  dock.js             the dock
  topbar.js           dynamic / translucent / floating top bar
  launcher.js         Kicker-style app menu
  shellModes.js       Super key, Activities button, start on the desktop
  appButton.js        focused-app button in the top bar
  tray.js             AppIndicator / StatusNotifierItem host + DBusMenu
  glass.js            frosted glass (wallpaper blur + rounded-corner shader)
  util.js             shared helpers
  prefs.js            settings window: prefsPages.js, prefsLayouts.js, prefsWidgets.js
  schemas/            GSettings schema
packaging/arch/       PKGBUILD
```

