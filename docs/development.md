# Architecture and development

Orbit is a GNOME Shell extension written in GJS. The extension entry point constructs independent UI components and tears them down as the session changes. The tray service stays registered during lock-mode transitions while its visible UI is removed. Settings live in a GSettings schema; versioned migration runs on enable.

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

Additional modules separate shared state from rendering: `orbitModel.js` covers migration/tray policy, `effectSettings.js` selects per-surface effects, `desktopPresets.js` and `presetModel.js` handle desktop presets, and `sessionActions.js` requests confirmed sign-out. `launcherSearch.js` cancels stale provider searches. Preferences use separate settings transactions for imports so ordinary edits continue applying live.

## Build and validation

Run commands from the repository root. `make zip` packages all extension JavaScript modules; `make dist` includes source, tests, scripts and documentation. `make pkg-arch` builds the Arch package. [Testing](testing.md) documents the checks; [installation](installation.md) covers host and Flatpak usage.

[Documentation index](README.md)
