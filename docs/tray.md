# Application tray

Configure indicators under **Personalization**. For battery, network, audio and Bluetooth spacing, use [Taskbar spacing](taskbar.md); those are system indicators, not AppIndicator tray applications.

## Common tasks

- Enable the tray and choose **Top bar / taskbar** or **Bottom-left tray**.
- In **Tray Visibility and Order**, hide applications with switches and reorder them with arrows.
- Set **Visible icons before overflow** to collapse extra icons. Zero shows all.
- Restart an application if it was already running when you first enabled the tray.

## Protocol, lifecycle and limitations

**Tray icons**: Orbit implements the StatusNotifierWatcher/host and DBusMenu protocols, so
Discord, Steam, Telegram and others show their icons and menus. Disable other AppIndicator
extensions first; only one program can host the tray. Electron/Chromium apps register
their icon only once, when they start. So Orbit keeps the tray service running through
setting changes and screen locks, and the extension stays loaded on the lock screen,
without showing any of its UI there. An app started while the tray was off needs a
restart to show its icon.

**Personalization → Tray Visibility and Order** lists registered application indicators.
Use switches to hide applications and arrows to reorder them. Set a visible-icon limit to
collapse excess indicators behind the keyboard-accessible more button; click again to
collapse them. A limit of zero shows every enabled icon. Passive indicators stay hidden.
These settings do not stop the indicator service, so applications need not re-register.

Orbit hosts StatusNotifierItem/AppIndicator and DBusMenu indicators. It does **not** host
legacy XEmbed system-tray icons. Applications without indicator support cannot be added by
Orbit; sandbox permissions, missing indicator libraries and apps that register only once
can also affect availability. Run only one StatusNotifierWatcher host. Conflict warnings
in Dock, Taskbar and Personalization identify known overlapping extensions and provide
an explicit disable action; Orbit does not silently disable another extension.

[Documentation index](README.md) · [Settings and installation](installation.md)
