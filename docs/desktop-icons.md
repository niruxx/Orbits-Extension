# Desktop icons

Enable **Desktop Icons → Enable desktop icons**. Choose visible items, arrangement and appearance on that page. File operations remain with the default file manager.

## Common tasks

- Use **Open Desktop Folder** to find the directory being displayed.
- Choose an automatic sort order, or select **Manual** and drag icons into grid cells.
- Enable additional monitors to distribute icons across displays.
- Right-click empty desktop space for sorting, refresh and desktop settings.

## Behavior and controls

**Desktop icons**: enable them under **Desktop Icons → Enable desktop icons** (off by
default). Orbit draws them below application windows and hides them in the overview and
on the lock screen. No separate desktop-icon extension is needed. If a supported competing
desktop-icon provider is enabled, Orbit leaves desktop rendering to that provider; the
preferences page offers to disable it before using Orbit.

Choose whether to show Desktop folder files, hidden files, Home, Trash and mounted locations.
Files follow the account’s XDG Desktop folder. **Open Desktop Folder** in preferences opens
that folder, creating it if necessary. If no separate Desktop folder is configured, Orbit
shows special icons without listing the entire Home directory. Files open with their default
handlers; file management and application-launcher trust remain with the file manager.

Appearance controls include icon size, label font size and colour, label shadow and extra
spacing. Home and Trash can use an icon theme name or an image chosen from a file picker.
Files also honor existing `metadata::custom-icon` overrides. Other icons use the installed
icon theme. Layout presets preserve these desktop settings.

Sort by name, modification time, size or file type, with reverse name/date/size orders and
an independent folders-first option. Home, Trash and mounts stay ahead of regular files in
automatic arrangements. Choose any start corner and fill rows or columns. **Manual** mode
lets you drag icons between grid cells, swapping occupied cells and saving positions.
Dragging here changes icon placement; use Files for copying, renaming or deleting files.

Use the primary monitor or distribute icons across all monitors. Files and mounted locations
refresh live. If the grid fills, **More files…** opens the Desktop folder; enumeration is
bounded at 5,000 entries to keep Shell responsive. Right-click the desktop for sorting,
refresh, Desktop Icon Settings and GNOME’s background/display settings. Icons support
single- or double-click opening, Enter/Space, arrow-key navigation and keyboard context menus.

[Documentation index](README.md) · [Settings and installation](installation.md)
