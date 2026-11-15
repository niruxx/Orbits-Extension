// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import * as W from './prefsWidgets.js';
import {Rows, conflictRow} from './prefsPages.js';
import {PANEL_ELEMENTS, PANEL_EDGES, panelOverrides, readPanelConfig} from './taskbarModel.js';
import {applySettings, exportSettings, readSettingsFile, validateSettings} from './settingsBackup.js';

const LABELS = {start: 'Applications button', activities: 'Activities / overview', apps: 'Application buttons',
    'app-title': 'Focused application', places: 'Trash and volumes', spacer: 'Flexible space', spacer2: 'Second flexible space',
    tray: 'AppIndicator tray', clock: 'Clock and notifications', system: 'System controls', desktop: 'Show Desktop'};

function elementsGroup(settings) {
    const group = W.group('Panel Elements', [], 'Use the arrows to change order and switches to show or hide elements.');
    let rows = [];
    const render = () => {
        rows.forEach(row => group.remove(row)); rows = [];
        const saved = settings.get_strv('taskbar-element-order');
        const order = [...new Set([...saved, ...PANEL_ELEMENTS])].filter(id => PANEL_ELEMENTS.includes(id));
        const hidden = settings.get_strv('taskbar-hidden-elements');
        order.forEach((id, index) => {
            const row = new Adw.ActionRow({title: LABELS[id]});
            const dependency = {start: 'show-apps-button', desktop: 'show-desktop-button', tray: 'tray-enabled'}[id];
            const active = new Gtk.Switch({active: saved.includes(id) && !hidden.includes(id) && (!dependency || settings.get_boolean(dependency)) && (id !== 'tray' || settings.get_string('tray-position') === 'top-bar'), valign: Gtk.Align.CENTER});
            active.connect('notify::active', () => {
                const checked = active.active;
                if (dependency && checked) settings.set_boolean(dependency, true);
                if (id === 'tray' && checked) settings.set_string('tray-position', 'top-bar');
                if (!saved.includes(id)) settings.set_strv('taskbar-element-order', order);
                settings.set_strv('taskbar-hidden-elements', checked ? hidden.filter(value => value !== id) : [...new Set([...hidden, id])]);
            });
            const controls = new Gtk.Box({spacing: 4, valign: Gtk.Align.CENTER});
            for (const [delta, icon] of [[-1, 'go-up-symbolic'], [1, 'go-down-symbolic']]) {
                const button = new Gtk.Button({icon_name: icon, tooltip_text: delta < 0 ? 'Move earlier' : 'Move later',
                    sensitive: index + delta >= 0 && index + delta < order.length});
                button.connect('clicked', () => {
                    const changed = [...order];
                    [changed[index], changed[index + delta]] = [changed[index + delta], changed[index]];
                    settings.set_strv('taskbar-element-order', changed);
                });
                controls.append(button);
            }
            row.add_suffix(controls); row.add_suffix(active);
            group.add(row); rows.push(row);
        });
    };
    render();
    const ids = ['taskbar-element-order', 'taskbar-hidden-elements', 'show-apps-button', 'show-desktop-button', 'tray-enabled', 'tray-position'].map(key => settings.connect(`changed::${key}`, render));
    group.connect('destroy', () => ids.forEach(id => settings.disconnect(id)));
    return group;
}

function monitorGroup(settings) {
    const group = W.group('Per-Monitor Overrides', [], 'Monitor indexes start at 0. Unconfigured monitors use the defaults above.');
    const spin = (title, lower, upper, step, value) => new Adw.SpinRow({title,
        adjustment: new Gtk.Adjustment({lower, upper, step_increment: step, page_increment: step * 5, value})});
    const combo = (title, labels) => new Adw.ComboRow({title, model: Gtk.StringList.new(labels)});
    const monitor = spin('Monitor index', 0, 31, 1, 0);
    const enabled = new Adw.SwitchRow({title: 'Override this monitor'});
    const edge = combo('Position', ['Top', 'Bottom', 'Left', 'Right']);
    const size = spin('Thickness', 24, 128, 2, 44);
    const length = spin('Length (%)', 20, 100, 5, 100);
    const anchor = combo('Anchor', ['Start', 'Center', 'End']);
    const mode = combo('Visibility', ['Always visible', 'Autohide', 'Intelligent autohide']);
    [monitor, enabled, edge, size, length, anchor, mode].forEach(row => group.add(row));
    let syncing = false;
    const sync = () => {
        syncing = true;
        const id = Math.round(monitor.value);
        const override = panelOverrides(settings.get_string('taskbar-monitor-overrides'))[id];
        const config = readPanelConfig(settings, id);
        enabled.active = !!override;
        edge.selected = PANEL_EDGES.indexOf(config.edge);
        size.value = config.size; length.value = config.length * 100;
        anchor.selected = ['start', 'center', 'end'].indexOf(config.anchor);
        mode.selected = ['fixed', 'autohide', 'intellihide'].indexOf(config.mode);
        [edge, size, length, anchor, mode].forEach(row => { row.sensitive = !!override; });
        syncing = false;
    };
    const save = () => {
        if (syncing) return;
        const overrides = panelOverrides(settings.get_string('taskbar-monitor-overrides'));
        const id = `${Math.round(monitor.value)}`;
        if (enabled.active) overrides[id] = {edge: PANEL_EDGES[edge.selected], size: Math.round(size.value),
            length: length.value / 100, anchor: ['start', 'center', 'end'][anchor.selected],
            mode: ['fixed', 'autohide', 'intellihide'][mode.selected]};
        else delete overrides[id];
        settings.set_string('taskbar-monitor-overrides', JSON.stringify(overrides));
    };
    monitor.connect('notify::value', sync);
    enabled.connect('notify::active', save);
    for (const row of [edge, anchor, mode]) row.connect('notify::selected', save);
    for (const row of [size, length]) row.connect('notify::value', save);
    const id = settings.connect('changed', (_s, key) => {
        if (['taskbar-monitor-overrides', 'taskbar-position', 'taskbar-size', 'taskbar-length', 'taskbar-anchor', 'taskbar-mode', 'top-bar-position', 'top-bar-height'].includes(key)) sync();
    });
    group.connect('destroy', () => settings.disconnect(id));
    sync();
    return group;
}

function backupGroup(window, settings) {
    const group = W.group('Settings Backup', [], 'Export or import Orbit settings, including desktop and launcher preferences. GNOME settings outside Orbit are excluded.');
    const cancel = new Gio.Cancellable();
    group.connect('destroy', () => cancel.cancel());
    const action = (title, label, run) => {
        const row = new Adw.ActionRow({title});
        const button = new Gtk.Button({label, valign: Gtk.Align.CENTER});
        button.connect('clicked', run); row.add_suffix(button); group.add(row);
    };
    action('Export settings', 'Export…', () => {
        let contents;
        try { contents = exportSettings(settings); } catch (error) { W.toast(window, error.message); return; }
        const dialog = new Gtk.FileDialog({title: 'Export Orbit Settings', initial_name: 'orbit-settings.json'});
        dialog.save(window, cancel, (d, result) => {
            let file;
            try { file = d.save_finish(result); } catch { return; }
            file.replace_contents_async(contents, null, false, Gio.FileCreateFlags.NONE, cancel, (f, r) => {
                try { f.replace_contents_finish(r); W.toast(window, 'Settings exported'); }
                catch (error) { if (!cancel.is_cancelled()) W.toast(window, error.message); }
            });
        });
    });
    action('Import settings', 'Import…', () => {
        const dialog = new Gtk.FileDialog({title: 'Import Orbit Settings'});
        dialog.open(window, cancel, (d, result) => {
            let file;
            try { file = d.open_finish(result); } catch { return; }
            readSettingsFile(file, cancel).then(text => {
                const values = validateSettings(text, settings);
                const confirm = new Adw.AlertDialog({heading: 'Import Orbit settings?',
                    body: `Apply ${values.length} settings from this backup? Existing values will be replaced. You can undo this import from the confirmation toast.`});
                confirm.add_response('cancel', 'Cancel'); confirm.add_response('import', 'Import');
                confirm.set_response_appearance('import', Adw.ResponseAppearance.SUGGESTED);
                confirm.connect('response', (_dialog, response) => {
                    if (response !== 'import') return;
                    try {
                        const previous = values.map(([key]) => [key, settings.get_value(key)]);
                        applySettings(settings, values);
                        W.toast(window, 'Settings imported', 'Undo', () => {
                            try { applySettings(settings, previous); W.toast(window, 'Previous settings restored'); }
                            catch (error) { W.toast(window, error.message); }
                        }, 15);
                    } catch (error) { W.toast(window, error.message); }
                });
                confirm.present(window);
            }).catch(error => { if (!cancel.is_cancelled()) W.toast(window, error.message); });
        });
    });
    return group;
}

export function taskbarPage(window, settings) {
    const r = new Rows(settings);
    const page = new Adw.PreferencesPage({title: 'Taskbar', icon_name: 'view-dual-symbolic'});
    const layout = W.group('Panel Layout', [
        r.switch('dock-in-panel', 'Enable integrated taskbars'),
        r.switch('multi-monitor', 'Show on all monitors'),
        r.combo('taskbar-position', 'Position'),
        r.spin('taskbar-size', 'Thickness', 0, 128, 2, '0 follows Top Bar height, or 44 pixels when unspecified'),
        r.percent('taskbar-length', 'Length'),
        r.combo('taskbar-anchor', 'Anchor'),
        r.combo('taskbar-mode', 'Visibility'),
        r.combo('taskbar-alignment', 'Application alignment'),
    ]);
    page.add(layout);
    page.add(W.group('Extension Conflicts', [conflictRow('Another panel or dock replacement is active', 'Disable overlapping panel replacements to avoid duplicate bars and conflicting work areas.', ['dash-to-panel@jderose9.github.com', 'dash-to-dock@micxgx.gmail.com', 'ubuntu-dock@ubuntu.com'])]));
    page.add(monitorGroup(settings)); page.add(elementsGroup(settings));
    r._k('taskbar-monitor-overrides'); r._k('taskbar-element-order'); r._k('taskbar-hidden-elements');
    page.add(W.group('Panel Interactions', [
        r.combo('taskbar-scroll-action', 'Scroll on unused space'),
        r.combo('taskbar-click-action', 'Click on unused space'),
        r.combo('taskbar-middle-click-action', 'Middle click on unused space'),
        r.combo('taskbar-double-click-action', 'Double click on unused space'),
        r.switch('taskbar-drag-window', 'Drag focused window from unused space'),
    ]));
    page.add(W.group('Spacing', [
        r.spin('taskbar-section-spacing', 'Gap between taskbar sections', 0, 32, 1, 'Space between the clock, tray, system controls and other sections'),
        r.spin('taskbar-system-icon-spacing', 'System icon spacing', 0, 24, 1, 'Space between battery, audio, Bluetooth and network indicators'),
        r.spin('taskbar-tray-icon-spacing', 'Application tray icon spacing', 0, 24, 1),
        r.spin('taskbar-status-padding', 'Clock and system button padding', 0, 24, 1, 'Space inside the clock and system-controls buttons; values are logical pixels'),
    ]));
    page.add(W.group('Application Appearance', [
        r.switch('taskbar-app-names', 'Show application names beside running icons', 'Works with grouped apps and individual window buttons; unopened pins stay icon-only'),
        r.spin('taskbar-app-name-width', 'Application name width', 40, 300, 10, 'Long names are shortened to fit'),
        r.combo('indicator-focused-style', 'Focused running indicator'),
        r.combo('indicator-style', 'Unfocused running indicator'),
        r.color('indicator-focused-color', 'Focused indicator colour'),
        r.color('indicator-color', 'Unfocused indicator colour'),
        r.combo('hover-animation', 'Icon hover animation'),
        r.spin('hover-animation-strength', 'Animation strength', 0.05, 0.4, 0.05, '', 2),
    ]));
    page.add(W.group('Preview Appearance', [
        r.spin('preview-size', 'Width', 120, 480, 20),
        r.spin('preview-ratio', 'Height / width', 0.3, 1, 0.05, '', 2),
        r.spin('preview-delay', 'Open delay', 0, 3000, 50, 'Milliseconds'),
        r.spin('preview-hide-delay', 'Close delay', 0, 3000, 50, 'Milliseconds'),
        r.switch('preview-titles', 'Show titles'),
        r.spin('preview-title-size', 'Title font size', 8, 24, 1),
        r.color('preview-background', 'Background colour'),
        r.spin('preview-opacity', 'Opacity', 0.1, 1, 0.05, '', 2),
        r.spin('preview-radius', 'Corner radius', 0, 32, 1),
    ]));
    page.add(backupGroup(window, settings));
    layout.set_header_suffix(W.resetButton(window, settings, r.keys, 'Taskbar'));
    return page;
}
