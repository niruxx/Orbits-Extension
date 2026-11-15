// SPDX-License-Identifier: GPL-3.0-or-later
export const PANEL_ELEMENTS = ['start', 'activities', 'apps', 'app-title', 'places', 'spacer', 'spacer2', 'tray', 'clock', 'system', 'desktop'];
export const PANEL_EDGES = ['top', 'bottom', 'left', 'right'];

export function panelOverrides(text, strict = false) {
    try {
        const value = JSON.parse(text);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a monitor configuration object');
        const result = {};
        for (const [key, entry] of Object.entries(value)) {
            if (!/^\d{1,2}$/.test(key) || Number(key) > 31 || !entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid monitor configuration');
            const clean = {};
            for (const [field, v] of Object.entries(entry)) {
                if (field === 'edge' && PANEL_EDGES.includes(v) || field === 'anchor' && ['start', 'center', 'end'].includes(v) ||
                    field === 'mode' && ['fixed', 'autohide', 'intellihide'].includes(v)) clean[field] = v;
                else if (field === 'size' && Number.isInteger(v) && v >= 24 && v <= 128 || field === 'length' && typeof v === 'number' && v >= 0.2 && v <= 1) clean[field] = v;
                else throw new Error(`Invalid monitor ${key} property: ${field}`);
            }
            result[key] = clean;
        }
        return result;
    } catch (error) {
        if (strict) throw error;
        return {};
    }
}

export function readPanelConfig(settings, index) {
    const position = settings.get_string('taskbar-position');
    const base = {edge: position === 'follow' ? settings.get_string('top-bar-position') : position,
        size: Math.max(24, settings.get_int('taskbar-size') || settings.get_int('top-bar-height') || 44),
        length: settings.get_double('taskbar-length'), anchor: settings.get_string('taskbar-anchor'),
        mode: settings.get_string('taskbar-mode')};
    return {...base, ...panelOverrides(settings.get_string('taskbar-monitor-overrides'))[index]};
}

export function panelGeometry(monitor, config, scale = 1) {
    const vertical = ['left', 'right'].includes(config.edge);
    const thickness = config.size * scale;
    const available = vertical ? monitor.height : monitor.width;
    const length = Math.round(available * config.length);
    const offset = config.anchor === 'end' ? available - length : config.anchor === 'center' ? (available - length) / 2 : 0;
    return {x: monitor.x + (vertical ? config.edge === 'right' ? monitor.width - thickness : 0 : offset),
        y: monitor.y + (vertical ? offset : config.edge === 'bottom' ? monitor.height - thickness : 0),
        width: vertical ? thickness : length, height: vertical ? length : thickness};
}

export function orderedPanelElements(order, hidden, centered = false) {
    const visible = [...new Set(order)].filter(id => PANEL_ELEMENTS.includes(id) && !hidden.includes(id));
    if (centered && !visible.includes('spacer2')) {
        const index = visible.findIndex(id => id === 'start' || id === 'apps');
        if (index >= 0) visible.splice(index, 0, 'spacer2');
    }
    return visible;
}
