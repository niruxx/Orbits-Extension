// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {presetEnvelope} from './presetModel.js';
import {applySettings, exportSettings, validateSettings, readSettingsFile} from './settingsBackup.js';
import {group, toast} from './prefsWidgets.js';
export function validatePreset(text, settings) {
    const data = presetEnvelope(text);
    const values = validateSettings(JSON.stringify({format: 'orbit-shell-settings', version: 1, settings: data.orbit}), settings);
    return {data, values};
}
export function previewPreset(window, settings, data) {
    const {values} = validatePreset(JSON.stringify(data), settings);
    const wm = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
    const changes = values.filter(([key, value]) => !value.equal(settings.get_value(key)));
    const text = new Gtk.TextView({editable: false, cursor_visible: false, wrap_mode: Gtk.WrapMode.WORD_CHAR});
    text.buffer.text = changes.map(([key, value]) => `${key}: ${settings.get_value(key).print(false)} → ${value.print(false)}`).join('\n') + `\nWindow buttons: ${wm.get_string('button-layout')} → ${data.wm['button-layout']}`;
    const dialog = new Adw.AlertDialog({heading: `Apply ${data.name}?`, body: `${changes.length} Orbit settings will change. Unlisted settings are preserved. Imported command shortcuts only run when selected.`, extra_child: new Gtk.ScrolledWindow({child: text, min_content_height: 180, max_content_height: 350, propagate_natural_height: true})});
    dialog.add_response('cancel', 'Cancel'); dialog.add_response('apply', 'Apply'); dialog.set_response_appearance('apply', Adw.ResponseAppearance.SUGGESTED);
    dialog.connect('response', (_d, response) => {
        if (response !== 'apply') return;
        const old = changes.map(([key]) => [key, settings.get_value(key)]), oldWm = wm.get_string('button-layout');
        try {
            applySettings(settings, changes); wm.set_string('button-layout', data.wm['button-layout']);
            toast(window, 'Desktop preset applied', 'Undo', () => { applySettings(settings, old); wm.set_string('button-layout', oldWm); }, 15);
        } catch (error) { applySettings(settings, old); wm.set_string('button-layout', oldWm); toast(window, error.message); }
    }); dialog.present(window);
}
export function customPresetsGroup(window, settings) {
    const saved = () => { try { return JSON.parse(settings.get_string('custom-presets')); } catch { return {}; } };
    const names = () => Object.keys(saved()).sort();
    const row = new Adw.ComboRow({title: 'Saved desktop preset'}), name = new Adw.EntryRow({title: 'Preset name'});
    const result = group('Custom Desktop Presets', [row, name], 'Save your Orbit configuration and window buttons. Preview changes before applying; Undo restores the previous configuration.');
    const refresh = () => { row.model = Gtk.StringList.new(names()); }; refresh();
    const signal = settings.connect('changed::custom-presets', refresh); const cancel = new Gio.Cancellable();
    result.connect('destroy', () => { settings.disconnect(signal); cancel.cancel(); });
    const put = data => {
        validatePreset(JSON.stringify(data), settings); const all = saved();
        if (Object.keys(all).length >= 16 && !Object.hasOwn(all, data.name)) throw new Error('Maximum 16 saved desktop presets');
        all[data.name] = data;
        const text = JSON.stringify(all); if (text.length > 1024 * 1024) throw new Error('Saved presets exceed 1 MiB');
        settings.set_string('custom-presets', text);
    };
    const selected = () => { const data = saved()[names()[row.selected]]; if (!data) throw new Error('Choose a preset'); return data; };
    const action = (title, label, run) => {
        const actionRow = new Adw.ActionRow({title}); const button = new Gtk.Button({label, valign: Gtk.Align.CENTER});
        button.connect('clicked', () => { try { run(); } catch (error) { toast(window, error.message); } }); actionRow.add_suffix(button); result.add(actionRow);
    };
    action('Save current desktop', 'Save', () => {
        if (Object.hasOwn(saved(), name.text.trim())) throw new Error('Use a unique preset name');
        const keys = settings.settings_schema.list_keys().filter(key => !['custom-presets','settings-version','tray-known-items','launcher-install-history'].includes(key));
        put({format:'orbit-desktop-preset', version:1, name:name.text.trim(), orbit:JSON.parse(exportSettings(settings, keys)).settings, wm:{'button-layout':new Gio.Settings({schema_id:'org.gnome.desktop.wm.preferences'}).get_string('button-layout')}});
    });
    action('Review and apply saved preset', 'Preview…', () => previewPreset(window, settings, selected()));
    action('Rename selected preset', 'Rename', () => {
        const data = selected(), old = data.name, title = name.text.trim();
        if (Object.hasOwn(saved(), title)) throw new Error('Use a unique preset name');
        put({...data, name:title}); const all = saved(); delete all[old]; settings.set_string('custom-presets', JSON.stringify(all));
    });
    action('Delete selected preset', 'Delete', () => { const data = selected(), all = saved(); delete all[data.name]; settings.set_string('custom-presets', JSON.stringify(all)); });
    action('Export selected preset', 'Export…', () => {
        const contents = new TextEncoder().encode(JSON.stringify(selected(), null, 2)); const dialog = new Gtk.FileDialog({title:'Export Desktop Preset', initial_name:'orbit-desktop.json'});
        dialog.save(window, cancel, (d,r) => { let file; try { file=d.save_finish(r); } catch { return; }
            file.replace_contents_async(contents, null, false, Gio.FileCreateFlags.NONE, cancel, (f,res) => { try { f.replace_contents_finish(res); toast(window,'Preset exported'); } catch (e) { if (!cancel.is_cancelled()) toast(window,e.message); } }); });
    });
    action('Import desktop preset', 'Import…', () => {
        const dialog = new Gtk.FileDialog({title:'Import Desktop Preset'});
        dialog.open(window, cancel, (d,r) => { let file; try { file=d.open_finish(r); } catch { return; }
            readSettingsFile(file,cancel).then(text => {
                if (cancel.is_cancelled()) return; const {data}=validatePreset(text,settings);
                if (Object.hasOwn(saved(), data.name)) throw new Error('Rename the existing preset before importing one with the same name');
                put(data); toast(window,'Preset imported; choose Preview to review and apply');
            }).catch(e => { if (!cancel.is_cancelled()) toast(window,e.message); }); });
    }); return result;
}
