# Dock

Configure a floating or edge-to-edge dock under **Dock**. For an integrated bottom bar with a clock and tray, see [Taskbar](taskbar.md).

## Common tasks

- Pin an application by dragging it from the application grid onto the dock.
- Reorder pinned icons by dragging them along the dock.
- Choose autohide or intelligent hiding under **Dock → Position & Size**.
- Change icon size, length, indicators and opacity on the Dock page.
- Disable **Notification counts** to hide notification/app badges; change **Number overlays** to control shortcut numbers. A number is not an instance count.

## Behavior and controls

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
- Use Shift+scroll or a horizontal trackpad gesture to reach overflow on the horizontal dock
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

**Window previews**: configure hover previews, delay, width, title visibility and peeking
under **Dock → Window Previews**. Additional width/height ratio, close delay, title font size,
background, opacity and corner controls are on **Taskbar → Preview Appearance**. They work in both dock and taskbar modes and respect
workspace/monitor filters. Preview click actions work even when hover previews are off.
Use the thumbnail to activate a window and its close button to request closing it. A popup
closes when its application's window list changes. Peeking restores original window
opacities when the popup closes. Minimized windows may not provide an up-to-date thumbnail.

[Documentation index](README.md) · [Settings and installation](installation.md)
