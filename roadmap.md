# Feature parity roadmap

This is a development checklist for parity with **Dash to Dock**, **Dash to Panel**
and **ArcMenu**, reviewed on **2026-11-15**. It covers their main user-facing
capabilities, rather than promising a permanent match with every upstream setting.
Upstream development versions may differ from releases available for a particular
GNOME version. No feature below is implemented merely by being listed here.

**Status:** `[x]` = implemented in Orbit's source; `[ ]` = remaining work.
**Partial** means Orbit has a related feature but still needs the stated work.
Checked items are not a claim of runtime validation on every supported GNOME version.

## Existing foundation

- [x] Four dock edges; floating and edge-to-edge modes.
- [x] Fixed dock, autohide and intelligent hiding with window filters.
- [x] Edge pressure, hide delay and show/hide animation controls.
- [x] Docks on multiple monitors; workspace and monitor isolation.
- [x] Favorite/running app visibility and a separator between them.
- [x] Drag to pin, reorder and unpin dock apps.
- [x] Native GNOME application context menus on dock icons.
- [x] Configurable click, middle-click and scroll actions.
- [x] Running dots/line indicators and focused-app styling.
- [x] Automatic icon shrinking when available space is limited.
- [x] Applications button visibility, placement and launcher/overview action.
- [x] Single integrated taskbar with left or centered apps.
- [x] Top/bottom bar placement, height, clock placement and Activities visibility.
- [x] Dynamic top-bar opacity, custom color and floating appearance.
- [x] Six launcher styles, app search, categories and shared GNOME favorites.
- [x] Super/Activities integration and optional desktop startup.
- [x] Power/session actions; places and system shortcuts in the two-column menu.
- [x] AppIndicator/StatusNotifier tray host with DBusMenu support.
- [x] Focused-app button and window-button layout preferences.
- [x] Wallpaper-based glass for dock, bar and launcher.
- [x] Desktop presets with an undo snapshot.
- [x] Native desktop icons with visibility, appearance, sorting and manual arrangement controls.

## Dock gaps — Dash to Dock baseline

Reference: [upstream settings schema](https://github.com/micheleg/dash-to-dock/blob/master/schemas/org.gnome.shell.extensions.dash-to-dock.gschema.xml).

- [x] Window thumbnails and preview-based click actions.
- [x] App-specific window spread/overview actions.
- [x] Configurable Shift-click and Shift-middle-click.
- [x] Numbered app shortcuts with number overlays and dock reveal.
- [x] Notification counts and launcher progress overlays.
- [x] Urgent-app indication and reveal-on-urgency controls.
- [x] Trash icon and empty-trash action.
- [x] Mounted-volume icons; mount filtering and device actions.
- [x] Dynamic dock opacity with separate idle and near-window opacity.
- [x] Additional indicator shapes, colors, sizing and dominant-icon colors.
- [x] Preferred-monitor selection for the standalone dock, with primary-display fallback.
- [x] Fixed-size icon mode and configurable dock length limits.
- [x] Independent show-delay and fullscreen reveal policy.
- [x] Manual dock hiding and a reveal shortcut.
- [x] Favorites visibility restricted to the primary monitor.

Dock items above are implemented in source. Automated state checks and an isolated
GNOME Shell 51 smoke test cover the main paths; real device operations, physical edge
pressure, mixed scaling and other Shell versions still require interactive validation.

## Taskbar gaps — Dash to Panel baseline

References: [feature list](https://github.com/home-sweet-gnome/dash-to-panel#features)
and [settings schema](https://github.com/home-sweet-gnome/dash-to-panel/blob/master/schemas/org.gnome.shell.extensions.dash-to-panel.gschema.xml).

- [x] Hover previews with window activation and close controls.
- [x] Preview sizing, titles, timing and appearance settings.
- [x] Window peeking from previews.
- [x] Ungrouped window buttons with configurable title labels.
- [x] Show Desktop button and optional hover peek.
- [x] Complete taskbars on secondary monitors.
- [x] Independent panel position, size, length and anchor per monitor.
- [x] Arbitrary panel-element ordering and visibility.
- [x] Vertical integrated taskbars.
- [x] Whole-panel intelligent hiding.
- [x] Separate focused/unfocused indicator styles and colors.
- [x] Panel scroll actions including volume adjustment.
- [x] Panel click actions and window dragging from unused panel space.
- [x] Configurable icon hover animations.
- [x] Numbered shortcuts with configurable accelerators and overlays (shared with the dock).
- [x] Settings export/import.

Taskbar items above are implemented in source. Two-monitor GNOME Shell 51 smoke tests
cover horizontal/vertical panels, native menus, tray mirroring, hiding, launcher anchoring
and restoration. State tests cover interactions and settings validation/undo. Physical
window dragging, audio hardware and other Shell versions still need interactive checks.

## Launcher gaps — ArcMenu baseline

References: [project overview](https://gitlab.com/arcmenu/ArcMenu)
and [settings schema](https://gitlab.com/arcmenu/ArcMenu/-/blob/master/schemas/org.gnome.shell.extensions.arcmenu.gschema.xml).

- [x] GNOME search-provider results beyond installed apps.
- [x] Provider selection and result-display controls.
- [x] Recent-file browsing with privacy-aware controls.
- [x] Independent launcher pins instead of sharing dock favorites.
- [x] Editable pinned folders, commands and shortcuts.
- [x] Pin reordering and launcher context menus.
- [x] Configurable places and application shortcuts across layouts.
- [x] More layout families and layout-specific controls: nine styles, including Dashboard, Runner and Sidebar.
- [x] Adjustable menu dimensions, responsive columns, taskbar anchoring and forced screen placement.
- [x] Configurable category names, visibility, order, empty-category behavior and default view.
- [x] Frequent and newly installed application views with configurable new-app expiration.
- [x] Menu-button icon, label and appearance customization.
- [x] Custom launcher shortcut beyond the Super-key action.
- [x] Moving keyboard selection, spatial arrow navigation, Tab cycling and smooth selection scrolling.
- [x] Debounced category hover and configurable highlight transitions.
- [x] Optional Arc bottom taskbar with independent bar and menu-footer opacity controls.
- [x] Menu theme controls for typography, spacing, padding, colors, borders and corners.
- [x] Saved menu themes and settings backup/restore.

## Orbit-specific completion work

These are Orbit product and engineering requirements, not claims that every
comparison extension provides them.

- [x] Launcher context menu: pin/unpin, new window and desktop-file actions.
- [x] Make launcher grid columns and application icon sizes configurable across layouts.
- [x] Responsive launcher grids and headers with bounded dimensions, adaptive columns and ellipsized labels; runtime checks cover compact menus and 2× scaling.
- [x] Refresh launcher app results, pins and category sidebars when apps or favorites change while open.
- [x] Define category naming/order and empty-category behavior for each menu style.
- [ ] Custom desktop preset save, rename, delete, export and import. **Partial:** named launcher themes and launcher configuration import/export are complete; whole-desktop custom presets remain.
- [ ] Show preset changes before applying and preserve unrelated user settings where appropriate. **Partial:** launcher themes/imports have change previews and Undo; layout presets preserve unspecified launcher/desktop settings. Whole-desktop preset previews remain.
- [x] Validate imported settings and provide Undo plus scoped reset controls, including launcher themes and shortcut commands.
- [ ] Optional blur of windows behind Shell surfaces. **Partial:** the launcher blurs live windows and wallpaper with transparent rounded corners; dock and panel glass still samples wallpaper only.
- [ ] Per-surface glass settings and a reduced-effects option.
- [ ] Tray ordering, per-app visibility and overflow controls.
- [ ] Document tray limitations, including lack of legacy XEmbed hosting.
- [ ] Detect overlapping dock, panel and tray extensions and explain conflicts in preferences.
- [x] Make `make check` fail if required validation tools are unavailable.
- [ ] Add automated checks for preset/schema consistency and settings migration.
- [ ] Document host installation from Flatpak editors and environments without `make`.

## Acceptance checklist for every feature

A feature is complete only after its behavior, preferences and cleanup work together.
Use this checklist when implementing each unchecked item above.

- [ ] Provide sensible defaults and explain the control in preferences.
- [ ] Update README documentation and any affected desktop presets.
- [ ] Check keyboard navigation, focus restoration, accessible labels and touch input.
- [ ] Check long/translated text and right-to-left layouts.
- [ ] Check multiple monitors, mixed scaling, hotplug and workspace changes.
- [ ] Check fullscreen windows, overview transitions and session lock/unlock.
- [ ] Check enable/disable/re-enable and repeated settings changes for leaked actors,
  signals, timers, modal grabs and keybindings.
- [ ] Verify supported GNOME Shell versions in real sessions; record failures and limitations.
- [ ] Add focused regression coverage where feasible and inspect Shell logs for errors.

## Suggested delivery order

1. **Window interaction:** previews, close/activate controls, peeking and ungrouped buttons.
2. **Daily dock use:** badges/progress, urgency, numbered shortcuts, Trash and volumes.
3. **Launcher:** context menus, independent pins, search providers and responsive sizing.
4. **Panel:** secondary-monitor taskbars, panel hiding and element arrangement.
5. **Preferences:** export/import, custom presets and remaining appearance controls.

Before claiming full parity for a release, re-audit the linked upstream schemas at
specific release tags or commits, record those versions here, and resolve or explicitly
document every remaining gap. Features depending on application support, GNOME search
providers or desktop services should state those dependencies.
