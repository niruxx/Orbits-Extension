import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {categoryOrder, parseShortcuts, updateInstalled, validateLauncherValue, THEME_KEYS} from '../extension/orbit-dock@niruxx.github.io/launcherModel.js';
import {applySettings, exportSettings, validateSettings} from '../extension/orbit-dock@niruxx.github.io/settingsBackup.js';
function assert(ok, message) { if (!ok) throw new Error(message); }
function rejects(run, message) { let rejected = false; try { run(); } catch { rejected = true; } assert(rejected, message); }
const shortcut = {id: 'test', label: 'Docs', icon: 'folder-symbolic', type: 'uri', target: '/tmp'};
assert(parseShortcuts(JSON.stringify([shortcut]), true)[0].target === '/tmp', 'Folder shortcut preserved');
for (const type of ['app', 'uri', 'command']) {
    const item = {...shortcut, type, target: {app: 'org.gnome.Nautilus.desktop', uri: 'https://example.org', command: 'printf "hello world"'}[type]};
    assert(parseShortcuts(JSON.stringify([item]), true).length === 1, `Valid ${type} shortcut`);
}
rejects(() => parseShortcuts(JSON.stringify([shortcut, shortcut]), true), 'Duplicate IDs rejected');
rejects(() => parseShortcuts(JSON.stringify([{...shortcut, target: 'relative/path'}]), true), 'Relative URI rejected');
rejects(() => parseShortcuts(JSON.stringify([{...shortcut, type: 'command', target: 'cmd\nother'}]), true), 'Multiline command rejected');
assert(parseShortcuts('bad').length === 0, 'Corrupt saved shortcuts are recoverable');
const categories = categoryOrder(['Office', 'all'], ['Game'], {Office: 'Work'});
assert(categories[0].name === 'Work' && categories[1].id === 'all' && !categories.some(item => item.id === 'Game'), 'Category names, order and hiding');
assert(new Set(categories.map(item => item.id)).size === categories.length, 'Category IDs unique');
const first = updateInstalled({}, ['a'], 100);
assert(!Object.keys(first.added).length, 'Initial scan does not mark every app new');
const second = updateInstalled(first, ['a', 'b'], 200);
assert(second.added.b === 200 && !second.added.a, 'Newly installed app tracked');
assert(!Object.keys(updateInstalled(second, ['a', 'b'], 200 + 15 * 86400).added).length, 'New app marker expires');
rejects(() => validateLauncherValue('launcher-background-color', 'bad; css'), 'Invalid colors rejected');
rejects(() => validateLauncherValue('launcher-category-order', ['bad']), 'Unknown categories rejected');
rejects(() => validateLauncherValue('launcher-places', ['run', 'run']), 'Duplicate places rejected');
GLib.setenv('GSETTINGS_BACKEND', 'memory', true);
const scratch = GLib.dir_make_tmp('orbit-launcher-test-XXXXXX');
const schema = 'org.gnome.shell.extensions.orbit-dock';
Gio.File.new_for_path(`extension/orbit-dock@niruxx.github.io/schemas/${schema}.gschema.xml`).copy(Gio.File.new_for_path(`${scratch}/${schema}.gschema.xml`), 0, null, null);
GLib.spawn_command_line_sync(`glib-compile-schemas ${scratch}`);
const source = Gio.SettingsSchemaSource.new_from_directory(scratch, Gio.SettingsSchemaSource.get_default(), false);
const settings = new Gio.Settings({settings_schema: source.lookup(schema, false)});
const originalDock = settings.get_int('icon-size');
settings.set_string('launcher-shortcuts', JSON.stringify([shortcut]));
const keys = settings.settings_schema.list_keys().filter(key => key.startsWith('launcher-') && key !== 'launcher-saved-themes');
const backup = exportSettings(settings, keys);
const validated = validateSettings(backup, settings);
settings.set_string('launcher-shortcuts', '[]'); applySettings(settings, validated);
assert(parseShortcuts(settings.get_string('launcher-shortcuts')).length === 1 && settings.get_int('icon-size') === originalDock, 'Scoped backup restores launcher without changing dock');
const theme = Object.fromEntries(THEME_KEYS.map(key => { const value = settings.get_value(key); return [key, {type: value.get_type_string(), value: value.deep_unpack()}]; }));
settings.set_string('launcher-saved-themes', JSON.stringify({Test: theme}));
validateSettings(exportSettings(settings), settings);
settings.set_string('launcher-saved-themes', JSON.stringify({Bad: {'icon-size': {type: 'i', value: 80}}}));
rejects(() => validateSettings(exportSettings(settings), settings), 'Themes cannot modify dock settings');
for (const name of [`${schema}.gschema.xml`, 'gschemas.compiled']) Gio.File.new_for_path(`${scratch}/${name}`).delete(null);
Gio.File.new_for_path(scratch).delete(null);
print('Launcher shortcuts, categories, install tracking, theme validation and scoped backup checks passed');
