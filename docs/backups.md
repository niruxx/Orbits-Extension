# Settings backup and recovery

There are three scopes: full Orbit preferences, launcher configuration/themes, and whole-desktop presets. Choose the scope that matches the change you want.

| Tool | Includes | Where |
| --- | --- | --- |
| Settings backup | Orbit preferences, excluding external GNOME settings | Taskbar → Settings Backup |
| Launcher theme/configuration | Menu appearance or launcher configuration | Launcher → Saved Themes and Launcher Backups |
| Desktop preset | Orbit preferences and window-button layout | Layouts → Custom Desktop Presets |

## Export and restore

1. Export the chosen scope to a JSON file.
2. Import that file using the matching tool.
3. Review the confirmation or change preview before applying.
4. Use the confirmation toast’s **Undo** to restore the previous state if necessary.

Imports validate types, ranges and structured settings. Command shortcuts are only executed when selected in the launcher. Per-page Reset controls restore their own settings; **Reset Theme** changes launcher appearance without deleting shortcuts or saved themes.

## Full settings backup behavior

**Settings backups**: use **Taskbar → Settings Backup** to export Orbit preferences as JSON.
Import validates the format, setting names, types, ranges, monitor overrides and shortcuts
before showing an apply confirmation. The confirmation toast offers Undo for 15 seconds.
Backups include Orbit’s dock, taskbar, desktop and launcher preferences. GNOME settings outside
Orbit—such as shared pinned apps and window-button layouts—are excluded. Files are limited
to 1 MiB. Imports and layout presets use separate transactions so subsequent preference edits
continue applying live.

[Documentation index](README.md) · [Settings and installation](installation.md)
