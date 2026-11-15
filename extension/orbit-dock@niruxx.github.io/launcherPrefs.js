// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import * as W from './prefsWidgets.js';
import {LAUNCHER_CATEGORIES, THEME_KEYS, categoryOrder, jsonObject, parseShortcuts} from './launcherModel.js';
import {applySettings, exportSettings, readSettingsFile, validateSettings} from './settingsBackup.js';

const RESERVED_NAMES = ['__proto__', 'constructor', 'prototype'];
const PLACES = [['home', 'Home'], ['documents', 'Documents'], ['pictures', 'Pictures'], ['music', 'Music'],
    ['videos', 'Videos'], ['downloads', 'Downloads'], ['settings', 'Settings'], ['software', 'Software'],
    ['monitor', 'System Monitor'], ['run', 'Run Command']];
function action(title, label, run, subtitle = '') {
    const row = new Adw.ActionRow({title, subtitle});
    const button = new Gtk.Button({label, valign: Gtk.Align.CENTER});
    button.connect('clicked', run); row.add_suffix(button); return row;
}
function entry(settings, key, title, rows) {
    rows._k(key); const row = new Adw.EntryRow({title}); settings.bind(key, row, 'text', Gio.SettingsBindFlags.DEFAULT); return row;
}
function orderButtons(index, count, move) {
    const box = new Gtk.Box({spacing: 4, valign: Gtk.Align.CENTER});
    for (const [delta, icon] of [[-1, 'go-up-symbolic'], [1, 'go-down-symbolic']]) {
        const button = new Gtk.Button({icon_name: icon, tooltip_text: delta < 0 ? 'Move earlier' : 'Move later', sensitive: index + delta >= 0 && index + delta < count});
        button.connect('clicked', () => move(delta)); box.append(button);
    }
    return box;
}
function observe(group, settings, keys, render) {
    render(); const ids = keys.map(key => settings.connect(`changed::${key}`, render));
    group.connect('destroy', () => ids.forEach(id => settings.disconnect(id))); return group;
}
function confirmApply(window, settings, values, heading) {
    const changes = values.filter(([key, value]) => !value.equal(settings.get_value(key)));
    const commandItems = values.find(([key]) => key === 'launcher-shortcuts');
    const commands = commandItems ? parseShortcuts(commandItems[1].deep_unpack()).filter(item => item.type === 'command') : [];
    const body = changes.map(([key, value]) => `${key.replace(/^launcher-/, '').replaceAll('-', ' ')}: ${value.print(false)}`).join('\n');
    const preview = new Gtk.TextView({editable: false, cursor_visible: false, wrap_mode: Gtk.WrapMode.WORD_CHAR, top_margin: 8, bottom_margin: 8, left_margin: 8, right_margin: 8});
    preview.buffer.text = body || 'No changes';
    const scroll = new Gtk.ScrolledWindow({child: preview, min_content_height: 180, max_content_height: 340, propagate_natural_height: true});
    const dialog = new Adw.AlertDialog({heading, body: `${changes.length} changes. Other settings stay as they are.${commands.length ? `\nIncludes command shortcuts: ${commands.map(item => item.label).join(', ')}. Commands run only when selected in the launcher.` : ''}`, extra_child: scroll});
    dialog.add_response('cancel', 'Cancel'); dialog.add_response('apply', 'Apply'); dialog.set_response_appearance('apply', Adw.ResponseAppearance.SUGGESTED);
    dialog.connect('response', (_d, response) => {
        if (response !== 'apply') return;
        const previous = changes.map(([key]) => [key, settings.get_value(key)]);
        try { applySettings(settings, changes); W.toast(window, 'Launcher settings applied', 'Undo', () => applySettings(settings, previous), 15); }
        catch (error) { W.toast(window, error.message); }
    }); dialog.present(window);
}
function shortcutDialog(window, settings, original = null) {
    const group = new Adw.PreferencesGroup();
    const name = new Adw.EntryRow({title: 'Name', text: original?.label ?? ''});
    const type = new Adw.ComboRow({title: 'Type', model: Gtk.StringList.new(['Application', 'Folder or website', 'Command']), selected: Math.max(0, ['app', 'uri', 'command'].indexOf(original?.type ?? 'uri'))});
    const target = new Adw.EntryRow({title: 'Destination', text: original?.target ?? ''});
    const apps = Gio.AppInfo.get_all().filter(app => app.should_show()).sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));
    const application = new Adw.ComboRow({title: 'Application', model: Gtk.StringList.new(apps.map(app => app.get_display_name())),
        selected: Math.max(0, apps.findIndex(app => app.get_id() === original?.target))});
    application.connect('notify::selected', () => { if (type.selected === 0 && apps[application.selected]) target.text = apps[application.selected].get_id(); });
    const icon = new Adw.EntryRow({title: 'Icon theme name', text: original?.icon ?? 'emblem-favorite-symbolic'});
    const help = new Gtk.Label({wrap: true, xalign: 0, margin_top: 8});
    [name, type, application, target, icon].forEach(row => group.add(row));
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 6}); box.append(group); box.append(help);
    const dialog = new Adw.AlertDialog({heading: original ? 'Edit Shortcut' : 'Add Shortcut', extra_child: box});
    dialog.add_response('cancel', 'Cancel'); dialog.add_response('save', 'Save'); dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
    const item = () => ({id: original?.id ?? GLib.uuid_string_random(), label: name.text.trim(), type: ['app', 'uri', 'command'][type.selected], target: target.text.trim(), icon: icon.text.trim()});
    const validate = () => {
        application.visible = type.selected === 0; target.visible = type.selected !== 0;
        target.title = type.selected === 2 ? 'Program and arguments' : 'Folder path or website';
        if (type.selected === 0 && apps[application.selected] && target.text !== apps[application.selected].get_id()) target.text = apps[application.selected].get_id();
        help.label = ['Select an installed application.', 'Use an absolute folder path or a website URI.', 'Use a program and arguments. Shell operators are not evaluated; use sh -c explicitly if needed.'][type.selected];
        try {
            const value = item(); parseShortcuts(JSON.stringify([value]), true);
            if (value.type === 'command') GLib.shell_parse_argv(value.target);
            dialog.set_response_enabled('save', true);
        } catch { dialog.set_response_enabled('save', false); }
    };
    for (const row of [name, target, icon]) row.connect('notify::text', validate);
    type.connect('notify::selected', validate); validate();
    dialog.connect('response', (_dialog, response) => {
        if (response !== 'save') return;
        const items = parseShortcuts(settings.get_string('launcher-shortcuts'));
        const value = item(), at = items.findIndex(saved => saved.id === original?.id);
        if (at < 0) items.push(value); else items[at] = value;
        try { parseShortcuts(JSON.stringify(items), true); settings.set_string('launcher-shortcuts', JSON.stringify(items)); }
        catch (error) { W.toast(window, error.message); }
    }); dialog.present(window);
}
function shortcutsGroup(window, settings) {
    const group = W.group('Pinned Folders, Commands and Applications', [], 'Custom shortcuts appear with pins and in search, in every layout.');
    let rows = [];
    const render = () => {
        rows.forEach(row => group.remove(row)); rows = [];
        const items = parseShortcuts(settings.get_string('launcher-shortcuts'));
        items.forEach((item, index) => {
            const row = action(item.label, 'Edit…', () => shortcutDialog(window, settings, item), item.target);
            row.add_suffix(orderButtons(index, items.length, delta => {
                [items[index], items[index + delta]] = [items[index + delta], items[index]];
                settings.set_string('launcher-shortcuts', JSON.stringify(items));
            }));
            const remove = new Gtk.Button({icon_name: 'user-trash-symbolic', tooltip_text: 'Remove shortcut', valign: Gtk.Align.CENTER});
            remove.connect('clicked', () => settings.set_string('launcher-shortcuts', JSON.stringify(items.filter(saved => saved.id !== item.id))));
            row.add_suffix(remove); group.add(row); rows.push(row);
        });
        const add = action('Create a shortcut', 'Add…', () => shortcutDialog(window, settings)); group.add(add); rows.push(add);
    };
    return observe(group, settings, ['launcher-shortcuts'], render);
}
function categoriesGroup(window, settings) {
    const group = W.group('Categories', [], 'Rename, reorder or hide categories. The same names and order apply to sidebar and category-folder layouts.');
    let rows = [];
    const render = () => {
        rows.forEach(row => group.remove(row)); rows = [];
        const names = jsonObject(settings.get_string('launcher-category-names'));
        const order = categoryOrder(settings.get_strv('launcher-category-order'), [], names);
        const hidden = settings.get_strv('launcher-hidden-categories');
        order.forEach((cat, index) => {
            const row = action(cat.name, 'Rename…', () => {
                const input = new Adw.EntryRow({title: 'Name', text: cat.name});
                const dialog = new Adw.AlertDialog({heading: 'Category Name', extra_child: input});
                dialog.add_response('cancel', 'Cancel'); dialog.add_response('save', 'Save');
                input.connect('notify::text', () => dialog.set_response_enabled('save', !!input.text.trim() && input.text.length <= 80));
                dialog.connect('response', (_d, response) => { if (response === 'save') settings.set_string('launcher-category-names', JSON.stringify({...names, [cat.id]: input.text.trim()})); }); dialog.present(window);
            });
            row.add_suffix(orderButtons(index, order.length, delta => {
                const ids = order.map(item => item.id); [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
                settings.set_strv('launcher-category-order', ids);
            }));
            const visible = new Gtk.Switch({active: !hidden.includes(cat.id), valign: Gtk.Align.CENTER});
            visible.connect('notify::active', () => settings.set_strv('launcher-hidden-categories', visible.active ? hidden.filter(id => id !== cat.id) : [...hidden, cat.id]));
            row.add_suffix(visible); group.add(row); rows.push(row);
        });
    };
    return observe(group, settings, ['launcher-category-order', 'launcher-hidden-categories', 'launcher-category-names'], render);
}
function placesGroup(settings) {
    const group = W.group('Places and System Shortcuts', [], 'Shown below the application area; the two-column layout uses its right column. Missing folders or applications are skipped.');
    let rows = [];
    const render = () => {
        rows.forEach(row => group.remove(row)); rows = [];
        const saved = settings.get_strv('launcher-places');
        const order = [...new Set([...saved, ...PLACES.map(([id]) => id)])].filter(id => PLACES.some(([value]) => value === id));
        order.forEach((id, index) => {
            const row = new Adw.ActionRow({title: PLACES.find(([value]) => value === id)[1]});
            row.add_suffix(orderButtons(index, order.length, delta => {
                const ids = [...order]; [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
                settings.set_strv('launcher-places', ids.filter(value => saved.includes(value)));
            }));
            const active = new Gtk.Switch({active: saved.includes(id), valign: Gtk.Align.CENTER});
            active.connect('notify::active', () => settings.set_strv('launcher-places', active.active ? [...saved, id] : saved.filter(value => value !== id)));
            row.add_suffix(active); group.add(row); rows.push(row);
        });
    };
    return observe(group, settings, ['launcher-places'], render);
}
function providersGroup(settings, rows) {
    const group = W.group('Search Providers', [rows.switch('launcher-search-providers', 'Search GNOME providers', 'GNOME Search settings and provider privacy choices still apply'),
        rows.spin('launcher-provider-limit', 'Results per provider', 1, 20, 1), rows.switch('launcher-provider-descriptions', 'Show result descriptions')]);
    const found = new Set();
    for (const dir of GLib.get_system_data_dirs()) {
        const folder = Gio.File.new_for_path(`${dir}/gnome-shell/search-providers`);
        let enumerator;
        try {
            enumerator = folder.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let file;
            while ((file = enumerator.next_file(null))) {
                try {
                    const data = new GLib.KeyFile(); data.load_from_file(folder.get_child(file.get_name()).get_path(), GLib.KeyFileFlags.NONE);
                    const id = data.get_string('Shell Search Provider', 'DesktopId');
                    if (found.has(id)) continue;
                    found.add(id); const app = GioUnix.DesktopAppInfo.new(id);
                    const row = new Adw.SwitchRow({title: app?.get_name() ?? id, subtitle: 'Allow in Orbit when enabled in GNOME Search', active: !settings.get_strv('launcher-disabled-providers').includes(id)});
                    row.connect('notify::active', () => {
                        const ids = settings.get_strv('launcher-disabled-providers');
                        settings.set_strv('launcher-disabled-providers', row.active ? ids.filter(value => value !== id) : [...new Set([...ids, id])]);
                    });
                    const signal = settings.connect('changed::launcher-disabled-providers', () => { row.active = !settings.get_strv('launcher-disabled-providers').includes(id); });
                    row.connect('destroy', () => settings.disconnect(signal)); group.add(row);
                } catch { /* Ignore invalid third-party provider definitions. */ }
            }
        } catch { /* Provider directory is optional. */ }
        finally { enumerator?.close(null); }
    }
    rows._k('launcher-disabled-providers'); return group;
}
function themesGroup(window, settings) {
    const group = W.group('Saved Themes and Launcher Backups', [], 'Themes change appearance only. Launcher backups also include layouts, categories and shortcuts. Imports show changes before applying and support Undo.');
    const selected = new Adw.ComboRow({title: 'Saved theme'});
    const name = new Adw.EntryRow({title: 'Theme name'});
    const names = () => Object.keys(jsonObject(settings.get_string('launcher-saved-themes'))).sort();
    const refresh = () => { selected.model = Gtk.StringList.new(names()); };
    refresh(); const signal = settings.connect('changed::launcher-saved-themes', refresh);
    group.connect('destroy', () => settings.disconnect(signal)); group.add(selected); group.add(name);
    const snapshot = keys => Object.fromEntries(keys.map(key => { const value = settings.get_value(key); return [key, {type: value.get_type_string(), value: value.deep_unpack()}]; }));
    const readTheme = () => {
        const theme = jsonObject(settings.get_string('launcher-saved-themes'))[names()[selected.selected]];
        if (!theme) throw new Error('Choose a saved theme');
        return validateSettings(JSON.stringify({format: 'orbit-shell-settings', version: 1, settings: theme}), settings);
    };
    const guarded = run => () => { try { run(); } catch (error) { W.toast(window, error.message); } };
    group.add(action('Save current appearance', 'Save', guarded(() => {
        const title = name.text.trim(); if (!title || title.length > 64 || RESERVED_NAMES.includes(title)) throw new Error('Enter a theme name of 1–64 characters');
        const themes = jsonObject(settings.get_string('launcher-saved-themes'));
        if (Object.hasOwn(themes, title)) throw new Error('That theme exists; rename it or use a different name');
        if (Object.keys(themes).length >= 32) throw new Error('Remove a theme before saving more (maximum 32)');
        themes[title] = snapshot(THEME_KEYS); settings.set_string('launcher-saved-themes', JSON.stringify(themes)); name.text = '';
    })));
    group.add(action('Preview and apply selected theme', 'Preview…', guarded(() => confirmApply(window, settings, readTheme(), 'Apply Launcher Theme?'))));
    group.add(action('Rename selected theme', 'Rename', guarded(() => {
        const title = name.text.trim(), old = names()[selected.selected]; const themes = jsonObject(settings.get_string('launcher-saved-themes'));
        if (!old || !title || title.length > 64 || RESERVED_NAMES.includes(title) || Object.hasOwn(themes, title)) throw new Error('Choose a theme and enter a new, unique name');
        themes[title] = themes[old]; delete themes[old]; settings.set_string('launcher-saved-themes', JSON.stringify(themes));
    })));
    group.add(action('Delete selected theme', 'Delete', guarded(() => {
        const title = names()[selected.selected]; if (!title) throw new Error('Choose a saved theme');
        const themes = jsonObject(settings.get_string('launcher-saved-themes')); delete themes[title]; settings.set_string('launcher-saved-themes', JSON.stringify(themes));
    })));
    const cancel = new Gio.Cancellable(); group.connect('destroy', () => cancel.cancel());
    const exportFile = (text, filename) => {
        const dialog = new Gtk.FileDialog({title: 'Export Launcher', initial_name: filename});
        dialog.save(window, cancel, (d, result) => {
            let file; try { file = d.save_finish(result); } catch { return; }
            file.replace_contents_async(new TextEncoder().encode(text), null, false, Gio.FileCreateFlags.NONE, cancel, (f, r) => {
                try { f.replace_contents_finish(r); W.toast(window, 'Launcher exported'); } catch (error) { if (!cancel.is_cancelled()) W.toast(window, error.message); }
            });
        });
    };
    group.add(action('Export selected theme', 'Export…', guarded(() => {
        const values = readTheme(); exportFile(JSON.stringify({format: 'orbit-shell-settings', version: 1, settings: Object.fromEntries(values.map(([key, value]) => [key, {type: value.get_type_string(), value: value.deep_unpack()}]))}, null, 2), 'orbit-launcher-theme.json');
    })));
    const configKeys = settings.settings_schema.list_keys().filter(key => key.startsWith('launcher-') && !['launcher-install-history', 'launcher-saved-themes', 'launcher-progress'].includes(key));
    group.add(action('Export current launcher configuration', 'Export…', guarded(() => exportFile(exportSettings(settings, configKeys), 'orbit-launcher.json'))));
    group.add(action('Import theme or launcher configuration', 'Import…', () => {
        const dialog = new Gtk.FileDialog({title: 'Import Launcher'});
        dialog.open(window, cancel, (d, result) => {
            let file; try { file = d.open_finish(result); } catch { return; }
            readSettingsFile(file, cancel).then(text => {
                if (cancel.is_cancelled()) return;
                const values = validateSettings(text, settings);
                if (values.some(([key]) => !configKeys.includes(key))) throw new Error('This file contains settings outside the launcher. Use the full settings import on the Taskbar page.');
                confirmApply(window, settings, values, 'Import Launcher Settings?');
            }).catch(error => { if (!cancel.is_cancelled()) W.toast(window, error.message); });
        });
    }));
    group.add(action('Restore default launcher appearance', 'Reset Theme', () => confirmApply(window, settings,
        THEME_KEYS.map(key => [key, settings.settings_schema.get_key(key).get_default_value()]), 'Reset Launcher Theme?')));
    return group;
}
export function addLauncherControls(window, page, settings, r) {
    page.add(providersGroup(settings, r));
    page.add(W.group('Recent Files and Newly Installed Apps', [
        r.switch('launcher-recent-files', 'Show recent files', 'Also requires GNOME Privacy → File History. Private entries are excluded. Off by default.'),
        r.spin('launcher-recent-days', 'Recent file age (days)', 1, 365, 1), r.spin('launcher-recent-limit', 'Maximum recent files', 1, 100, 1),
        r.spin('launcher-new-days', 'Mark new applications for (days)', 1, 90, 1),
        action('Clear system recent-file history', 'Clear…', () => {
            const dialog = new Adw.AlertDialog({heading: 'Clear System File History?', body: 'This removes the shared recent-file history used by GNOME and other applications. Your files are kept.'});
            dialog.add_response('cancel', 'Cancel'); dialog.add_response('clear', 'Clear History'); dialog.set_response_appearance('clear', Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.connect('response', (_d, response) => {
                if (response !== 'clear') return;
                try { const file = Gio.File.new_for_path(`${GLib.get_user_data_dir()}/recently-used.xbel`); if (file.query_exists(null)) file.delete(null); W.toast(window, 'Recent-file history cleared'); }
                catch (error) { W.toast(window, error.message); }
            }); dialog.present(window);
        }),
    ]));
    page.add(W.group('Placement and Layout Details', [r.combo('launcher-placement', 'Menu placement'),
        r.spin('launcher-modern-columns', 'Modern / dashboard grid columns', 1, 12, 1), r.spin('launcher-minimal-columns', 'Compact grid columns', 1, 12, 1),
        r.switch('launcher-show-empty-categories', 'Show empty categories'), r.switch('launcher-show-places', 'Show places and system shortcuts')]));
    for (const key of ['launcher-shortcuts', 'launcher-places', 'launcher-category-order', 'launcher-category-names', 'launcher-hidden-categories']) r._k(key);
    page.add(shortcutsGroup(window, settings)); page.add(placesGroup(settings)); page.add(categoriesGroup(window, settings));
    page.add(W.group('Applications Button', [entry(settings, 'launcher-button-icon', 'Icon theme name', r), entry(settings, 'launcher-button-label', 'Label', r),
        r.switch('launcher-button-show-label', 'Show label beside icon'), r.spin('launcher-button-icon-size', 'Button icon size', 0, 96, 2, '0 follows the dock icon size'),
        r.switch('launcher-button-custom-color', 'Use a custom button color'), r.color('launcher-button-color', 'Button color')]));
    page.add(W.group('Menu Theme Details', [r.color('launcher-text-color', 'Text color'), r.color('launcher-selection-color', 'Selection color'),
        r.color('launcher-border-color', 'Border color'), r.spin('launcher-border-width', 'Border width', 0, 8, 1), r.spin('launcher-radius', 'Corner radius', 0, 48, 1),
        r.spin('launcher-spacing', 'Spacing', 0, 24, 1), r.spin('launcher-item-padding', 'Item padding', 0, 20, 1)]));
    page.add(themesGroup(window, settings));
}
