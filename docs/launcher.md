# Application launcher

Open **Launcher** in preferences to choose the menu style and how Super, Activities and the applications button behave. The launcher searches installed apps, optional providers, recent files and custom shortcuts.

## Common tasks

- Select **Arc Menu** for categories beside an application grid.
- Right-click an app to pin/unpin it, reorder its pin or open a new window.
- Enable independent launcher pins to keep them separate from dock favorites.
- Use the shortcut editor to add folders, websites, installed apps or commands.
- Enable recent files only if wanted; GNOME Privacy must also permit file history.
- Use the labeled **Sign Out** action in the power controls to request GNOME’s confirmation.

## Styles and behavior

**Launcher**: an app menu in nine styles (Launcher → Menu style):
- *Modern*: search, a pinned grid and an All apps list, with user and power buttons (Windows 11 style)
- *List view*: one scrolling list, pinned apps first, then A–Z with letter headings
- *Minimal*: a compact, centred search box with a row of pinned icons; results appear as you type
- *Arc Menu*: user and search header, category sidebar, four-column app grid and power controls,
  paired with a translucent bottom taskbar by the *Arc Desktop* layout preset
- *Classic*: categories beside the app list (Plasma Kicker style)
- *Two-column*: the Windows XP layout with a GNOME look: user and search on top; pinned apps
  and All Apps on the left; folders, Settings, Software and Run… on the right; Sign Out and
  Power Off at the bottom. Optionally, All Apps is grouped into category folders
  (Launcher → Group All Apps into categories).

- *Dashboard*: a wide grid with view tabs.
- *Runner*: centered search and results.
- *Sidebar*: a tall category menu.

It can replace the overview for the Super key and the Activities button, and Orbit can
skip the overview at login.

**Sign out**: use the labeled **Sign Out** button in the launcher power controls, or
right-click empty taskbar space and choose **Sign Out…**. GNOME handles the sign-out
confirmation. Launcher power controls can be enabled in Launcher preferences.

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

[Documentation index](README.md) · [Settings and installation](installation.md)
