# Taskbar

Use **Taskbar → Panel Layout → Enable integrated taskbars**, or apply **Arc Desktop** from Layouts. Taskbars combine running apps, launch controls, clock, tray and system controls.

## Common tasks

- Show app names: **Taskbar → Application Appearance → Show application names beside running icons**.
- Separate battery/network/audio icons: **Taskbar → Spacing → System icon spacing**.
- Adjust the gap beside the clock: **Taskbar → Spacing → Gap between taskbar sections**.
- Move windows: right-click a running app and choose **Move Application to Workspace**.
- Add or remove controls: **Taskbar → Panel Elements**.
- Set a different edge or size on each display: **Per-Monitor Overrides**.

## Behavior and controls

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

[Documentation index](README.md) · [Settings and installation](installation.md)
