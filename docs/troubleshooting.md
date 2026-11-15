# Troubleshooting

## Updated extension still looks unchanged

Log out and back in on Wayland after installation. Verify the extension is enabled and
that you installed into the account running GNOME. See [installation](installation.md).

## Arc corners show wallpaper colors or look opaque

The current launcher uses a menu-sized live-scene backdrop and a rounded alpha mask.
Use **Launcher → Background opacity** for the tint and **Effects** for blur/brightness.
Turn off launcher glass for plain transparency. After updating from an older version,
log out and back in. The [visual test](testing.md) checks the four corners against the window behind them.

## A number appears on Firefox or another application

A top-left number is a keyboard shortcut position. A top-right badge is a notification
or app-reported count; it is not a process/instance count. Configure **Dock → Keyboard
Shortcuts → Number overlays** and **Dock → Notification counts** independently.
Application-reported progress/counts require support in the application.

## Clock, battery, audio or network icons are too close together

Use **Taskbar → Spacing**. System icon spacing changes gaps inside the system-controls
button; section spacing changes the gap between that button, the clock and other sections.
Tray icon spacing affects third-party application indicators. See [taskbar.md](taskbar.md).

## Taskbar app area is full

The app viewport follows its content width until it reaches the space available beside
other controls. Scrollbars remain hidden and overflow stays scrollable. Reduce icon/name
widths, hide unnecessary panel elements or increase panel length if you want more room.

## A tray icon is missing

Check that the tray is enabled, the application is not hidden in **Tray Visibility and
Order**, and overflow is expanded. Restart an application that was running before you
enabled the tray. Disable competing indicator hosts using the conflict controls.
Legacy XEmbed-only icons are unsupported. See [tray.md](tray.md) for dependencies.

## Moving an application changes its monitor

When GNOME limits workspaces to the primary monitor, Orbit must move a secondary-monitor
window to the primary monitor before assigning it to a different workspace.

## Search providers or recent files return no results

Check both Orbit's provider switches and GNOME Search settings. Recent files additionally
require GNOME Privacy's File History setting. Private bookmarks are excluded. Provider
services must be installed and working; requests are cancelled after five seconds.
See [launcher.md](launcher.md).

## Desktop icons do not appear

Enable them on **Desktop Icons**. Resolve a detected competing desktop-icon extension.
Check the configured XDG Desktop directory using **Open Desktop Folder**. When no separate
Desktop folder exists, Orbit avoids listing the entire Home directory.
See [desktop-icons.md](desktop-icons.md).

## A preset or backup is rejected

Use the matching import tool for its scope. Unknown keys, invalid values, shortcuts,
internal preset state or oversized files are rejected. Backups and preset files have a
1 MiB limit. Use the change preview and Undo rather than manually editing live settings.
See [backups.md](backups.md) and [layouts.md](layouts.md).

## Report a remaining problem

Include your GNOME Shell version, Orbit version, layout, monitor arrangement/scales,
reproduction steps and whether the relevant [test suite](testing.md) passes. Consult the
[acceptance report](acceptance.md) before treating an unverified hardware/version scenario
as a confirmed regression. Do not include credentials or private application data in logs.

[Documentation index](README.md)
