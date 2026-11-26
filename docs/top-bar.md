# Top bar

Use **Top Bar** to configure GNOME’s panel or the appearance shared by integrated Orbit taskbars. Taskbar placement, elements and spacing are configured separately on [Taskbar](taskbar.md).

## Common tasks

- Select **Translucent** for a fixed opacity or **Dynamic** for near-window opacity changes.
- Choose a custom color, adjust opacity or enable a floating rounded surface.
- Move the clock, hide Activities, or change the panel edge.
- Under **Window Buttons**, enable **Minimize**, **Maximize / Restore**, or **Close**
  individually and choose **Left**, **Center**, or **Right** for the group. Enable
  **Only for maximized windows** to show the group only while the focused window
  is maximized.

## Behavior

**Top bar**: *Dynamic* keeps the bar transparent until a window touches it (or until a
window is maximized), then fades to solid. *Translucent* always uses your opacity. Both can
float as a rounded bar and use frosted glass. Changing a look option while the style is
*Theme default* switches it to Translucent, so the change shows. You can also hide
Activities, move the clock, and show the focused app's name or window title with its menu.

Window buttons are off by default and apply to the focused window when GNOME’s panel
is in use. The buttons appear when the window supports their actions and hide in
the overview or when the focused window is fullscreen. To set the buttons on
application title bars, use **Title bar buttons** on the **Personalization** page.

## Shell settings

- **Notifications & On-Screen Displays** places notification banners at the top or
  bottom, with start, center and end alignment. The banner switch changes GNOME’s
  system-wide Do Not Disturb setting, which persists when Orbit is disabled.
  GNOME can still show critical notifications. The separate placement control moves
  volume, brightness and other native on-screen displays on every output.
- **Workspaces and Window Switching** offers wraparound for directional workspace
  shortcuts and an option to hide the workspace popup. Window switcher settings
  control preview size as a percentage of GNOME’s default and the initial delay
  before the application or window switcher appears.
- **Quick Settings** can hide Dark Style, Night Light and Airplane Mode individually.
- **Hide maximized X11 window decorations** requires the optional `xprop` command.
  It applies to X11 and XWayland windows with window-manager decorations and
  restores decorations when the window is unmaximized or the feature is turned
  off. App-drawn title bars and native Wayland windows are outside this setting’s scope.

[Documentation index](README.md) · [Settings and installation](installation.md)
