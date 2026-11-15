// SPDX-License-Identifier: GPL-3.0-or-later
export function sortDesktopEntries(entries, order, foldersFirst) {
    const special = entries.filter(entry => entry.special);
    const files = entries.filter(entry => !entry.special);
    const descending = order.endsWith('-desc');
    const field = order.replace(/-desc$/, '');
    files.sort((a, b) => {
        if (foldersFirst && a.directory !== b.directory)
            return a.directory ? -1 : 1;
        let result = 0;
        if (field === 'modified') result = a.modified - b.modified;
        else if (field === 'size') result = a.size - b.size;
        else if (field === 'type') result = (a.contentType ?? '').localeCompare(b.contentType ?? '');
        else result = a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'});
        return (result || a.name.localeCompare(b.name)) * (descending ? -1 : 1);
    });
    return [...special, ...files];
}

export function desktopGrid(width, height, iconSize, spacing, scale = 1, labelSize = 11) {
    const cellWidth = (Math.max(96, iconSize + 32) + spacing) * scale;
    const cellHeight = (iconSize + Math.max(58, labelSize * 2.8 + 20) + spacing) * scale;
    const columns = Math.max(1, Math.floor(width / cellWidth));
    const rows = Math.max(1, Math.floor(height / cellHeight));
    return {cellWidth, cellHeight, columns, rows, capacity: columns * rows};
}

export function slotPosition(slot, grid, corner, flow) {
    const column = flow === 'vertical' ? Math.floor(slot / grid.rows) : slot % grid.columns;
    const row = flow === 'vertical' ? slot % grid.rows : Math.floor(slot / grid.columns);
    return {
        x: (corner.endsWith('right') ? grid.columns - column - 1 : column) * grid.cellWidth,
        y: (corner.startsWith('bottom') ? grid.rows - row - 1 : row) * grid.cellHeight,
    };
}

export function slotAt(x, y, grid, corner, flow) {
    let column = Math.max(0, Math.min(grid.columns - 1, Math.floor(x / grid.cellWidth)));
    let row = Math.max(0, Math.min(grid.rows - 1, Math.floor(y / grid.cellHeight)));
    if (corner.endsWith('right')) column = grid.columns - column - 1;
    if (corner.startsWith('bottom')) row = grid.rows - row - 1;
    return flow === 'vertical' ? column * grid.rows + row : row * grid.columns + column;
}

export function readDesktopPositions(text) {
    try {
        const raw = JSON.parse(text);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        return Object.fromEntries(Object.entries(raw).slice(0, 4000).filter(([, value]) =>
            value && typeof value.monitor === 'string' && Number.isInteger(value.slot) && value.slot >= 0 && value.slot < 10000));
    } catch { return {}; }
}

/** Keep valid manual slots; fill empty cells deterministically, without overlapping icons. */
export function arrangeDesktop(entries, screens, positions, manual) {
    const placed = [], pending = [];
    const used = new Map(screens.map(screen => [screen.key, new Set()]));
    for (const entry of entries) {
        const saved = manual ? positions[entry.id] : null;
        const screen = saved && screens.find(candidate => candidate.key === saved.monitor && saved.slot < candidate.grid.capacity);
        if (screen && !used.get(screen.key).has(saved.slot)) {
            used.get(screen.key).add(saved.slot);
            placed.push({entry, screen, slot: saved.slot});
        } else pending.push(entry);
    }
    const overflow = [];
    for (const entry of pending) {
        let target = null;
        for (const screen of screens) {
            for (let slot = 0; slot < screen.grid.capacity; slot++) {
                if (!used.get(screen.key).has(slot)) { target = {entry, screen, slot}; break; }
            }
            if (target) break;
        }
        if (target) {
            used.get(target.screen.key).add(target.slot);
            placed.push(target);
        } else overflow.push(entry);
    }
    return {placed, overflow};
}
