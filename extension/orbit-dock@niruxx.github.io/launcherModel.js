// SPDX-License-Identifier: GPL-3.0-or-later
// Shared by Shell, preferences, and import validation. No Shell dependencies.
export const LAUNCHER_CATEGORIES = [
    ['favorites', 'Pinned Apps', 'view-pin-symbolic'], ['all', 'All Apps', 'view-app-grid-symbolic'],
    ['frequent', 'Frequently Used', 'document-open-recent-symbolic'], ['new', 'Newly Installed', 'software-install-symbolic'],
    ['recent', 'Recent Files', 'document-open-recent-symbolic'], ['shortcuts', 'Shortcuts', 'emblem-favorite-symbolic'],
    ['Utility', 'Accessories', 'applications-utilities-symbolic', ['Utility', 'Accessibility']],
    ['Development', 'Development', 'applications-engineering-symbolic', ['Development']],
    ['Education', 'Education', 'accessories-dictionary-symbolic', ['Education']],
    ['Game', 'Games', 'applications-games-symbolic', ['Game']],
    ['Graphics', 'Graphics', 'applications-graphics-symbolic', ['Graphics']],
    ['Network', 'Internet', 'applications-internet-symbolic', ['Network', 'WebBrowser', 'Email', 'Chat']],
    ['AudioVideo', 'Multimedia', 'applications-multimedia-symbolic', ['AudioVideo', 'Audio', 'Video']],
    ['Office', 'Office', 'applications-office-symbolic', ['Office']],
    ['Science', 'Science', 'applications-science-symbolic', ['Science']],
    ['Settings', 'Settings', 'preferences-system-symbolic', ['Settings', 'DesktopSettings']],
    ['System', 'System', 'applications-system-symbolic', ['System']], ['Other', 'Other', 'applications-other-symbolic'],
].map(([id, name, icon, match]) => ({id, name, icon, match}));
export const THEME_KEYS = ['launcher-background-color', 'launcher-opacity', 'launcher-font-size',
    'launcher-text-color', 'launcher-selection-color', 'launcher-border-color', 'launcher-border-width',
    'launcher-radius', 'launcher-spacing', 'launcher-item-padding', 'launcher-grid-icon-size', 'launcher-icon-size',
    'launcher-columns', 'launcher-modern-columns', 'launcher-minimal-columns', 'launcher-transition-time', 'launcher-footer-opacity'];
export function parseShortcuts(text, strict = false) {
    try {
        const items = JSON.parse(text);
        if (!Array.isArray(items) || items.length > 64) throw new Error('Use at most 64 shortcuts');
        const ids = new Set();
        for (const item of items) {
            if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
                !['app', 'uri', 'command'].includes(item.type) || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 100 ||
                typeof item.target !== 'string' || !item.target.trim() || item.target.length > 4096 || /[\0\r\n]/.test(item.target) ||
                typeof item.icon !== 'string' || !/^[\w.-]{0,128}$/.test(item.icon)) throw new Error('Invalid shortcut: provide a unique ID, name, type, destination and icon name');
            if (item.type === 'uri' && !/^(\/|[a-z][a-z0-9+.-]*:\/\/|mailto:)/i.test(item.target)) throw new Error('Folder and website shortcuts need an absolute path or URI');
            if (item.type === 'app' && !/^[\w.+@-]+\.desktop$/.test(item.target)) throw new Error('Application shortcuts need a desktop ID');
            ids.add(item.id);
        }
        return items.map(({id, label, icon, type, target}) => ({id, label, icon, type, target}));
    } catch (error) { if (strict) throw error; return []; }
}
export function categoryOrder(order, hidden, names = {}) {
    return [...new Set([...order, ...LAUNCHER_CATEGORIES.map(cat => cat.id)])]
        .map(id => LAUNCHER_CATEGORIES.find(cat => cat.id === id)).filter(cat => cat && !hidden.includes(cat.id))
        .map(cat => ({...cat, name: typeof names[cat.id] === 'string' && names[cat.id].trim() ? names[cat.id].slice(0, 80) : cat.name}));
}
export function jsonObject(text, strict = false) {
    try { const data = JSON.parse(text); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected an object'); return data; }
    catch (error) { if (strict) throw error; return {}; }
}
export function updateInstalled(previous, installed, now, days = 14) {
    const old = new Set(Array.isArray(previous.known) ? previous.known : installed);
    const added = Object.fromEntries(Object.entries(previous.added ?? {}).filter(([id, time]) => installed.includes(id) && Number.isFinite(time) && now - time < days * 86400));
    for (const id of installed) if (!old.has(id)) added[id] = now;
    return {known: installed, added};
}
export function validateLauncherValue(key, value) {
    if (key === 'launcher-shortcuts') parseShortcuts(value, true);
    if (['launcher-category-order', 'launcher-hidden-categories'].includes(key) &&
        (new Set(value).size !== value.length || value.some(id => !LAUNCHER_CATEGORIES.some(cat => cat.id === id)))) throw new Error(`Invalid categories in ${key}`);
    if (key === 'launcher-category-names') {
        const data = jsonObject(value, true);
        if (Object.entries(data).some(([id, name]) => !LAUNCHER_CATEGORIES.some(cat => cat.id === id) || typeof name !== 'string' || name.length > 80)) throw new Error('Invalid category names');
    }
    if (/^launcher-.*color$/.test(key) && typeof value === 'string' && !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Invalid color in ${key}`);
    if (key === 'launcher-button-icon' && !/^[\w.-]{1,128}$/.test(value)) throw new Error('Use an icon theme name for the menu button');
    if (key === 'launcher-places' && (new Set(value).size !== value.length || value.some(id => !['home', 'documents', 'pictures', 'music', 'videos', 'downloads', 'settings', 'software', 'monitor', 'run'].includes(id)))) throw new Error('Invalid launcher places');
    if (key === 'launcher-button-label' && value.length > 80) throw new Error('Menu button label is too long');
}
