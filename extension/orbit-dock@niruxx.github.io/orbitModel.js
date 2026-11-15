// SPDX-License-Identifier: GPL-3.0-or-later
export const CURRENT_SETTINGS_VERSION = 1;
export function migrationValues(version) {
    if (version > CURRENT_SETTINGS_VERSION) throw new Error('Settings were created by a newer Orbit version');
    return version < 1 ? [['settings-version', 1]] : [];
}
export function trayLayout(items, order, hidden, limit, expanded = false) {
    const ranked = [...items].filter(item => !hidden.includes(item.id) && item.active);
    ranked.sort((a, b) => {
        const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
        return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi) || a.id.localeCompare(b.id);
    });
    return {items: ranked, visible: expanded || !limit ? ranked : ranked.slice(0, limit), overflow: limit > 0 && ranked.length > limit};
}
