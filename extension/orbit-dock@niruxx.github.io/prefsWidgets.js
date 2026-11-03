// SPDX-License-Identifier: GPL-3.0-or-later
//
// Row helpers for the preferences window. Each helper binds one GSettings
// key to a libadwaita row. `onUser(key)` callbacks fire only for changes the
// user makes in the window, never for changes arriving from elsewhere
// (presets, other tools), so pages can react to the user's intent.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

export const CHOICES = {
    // dock
    'dock-position': [['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right'], ['top', 'Top']],
    'dock-mode': [['intellihide', 'Intelligent autohide'], ['autohide', 'Autohide'],
        ['fixed', 'Always visible']],
    'intellihide-scope': [['all-windows', 'Any window'], ['focus-app', 'Windows of the focused app'],
        ['maximized', 'Maximized windows only']],
    'click-action': [['focus-or-minimize', 'Focus, minimize or cycle windows'],
        ['cycle-windows', 'Cycle through windows'],
        ['focus-or-minimize-all', 'Raise or minimize all windows'],
        ['launch', 'Always launch a new window']],
    'middle-click-action': [['new-window', 'Open a new window'], ['minimize', 'Minimize windows'],
        ['quit', 'Quit the app'], ['none', 'Do nothing']],
    'scroll-action': [['cycle-windows', 'Cycle app windows'], ['switch-workspace', 'Switch workspace'],
        ['none', 'Do nothing']],
    'indicator-style': [['dots', 'Dot per window'], ['dot', 'Single dot'], ['line', 'Line'],
        ['none', 'None']],
    'show-apps-position': [['end', 'End of the dock'], ['start', 'Start of the dock'],
        ['after-favorites', 'After pinned apps']],
    // top bar
    'top-bar-style': [['default', 'Theme default'],
        ['dynamic', 'Dynamic — transparent until a window touches it'],
        ['translucent', 'Always translucent']],
    'top-bar-dynamic-trigger': [['touching', 'A window touches the bar'],
        ['maximized', 'A window is maximized']],
    'top-bar-clock-position': [['center', 'Center'], ['left', 'Left'], ['right', 'Right']],
    // launcher
    'super-key-action': [['overview', 'Activities overview'], ['launcher', 'Orbit launcher'],
        ['none', 'Nothing']],
    'activities-action': [['overview', 'Activities overview'], ['launcher', 'Orbit launcher']],
    'show-apps-action': [['overview', 'App grid'], ['launcher', 'Orbit launcher']],
    // personalization
    'tray-position': [['top-bar', 'Top bar (right side)'], ['bottom-left', 'Bottom-left tray']],
    'app-button-position': [['left', 'Left'], ['center', 'Center'], ['right', 'Right']],
};

export function group(title, rows, description = '') {
    const g = new Adw.PreferencesGroup({title, description});
    for (const row of rows)
        g.add(row);
    return g;
}

export function switchRow(settings, key, title, subtitle = '', onUser = null) {
    const row = new Adw.SwitchRow({title, subtitle});
    if (onUser) {
        // Connected before the binding: for a user toggle the setting still
        // holds the old value here; for outside changes it already matches.
        row.connect('notify::active', r => {
            if (r.active !== settings.get_boolean(key))
                onUser(key);
        });
    }
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

export function spinRow(settings, key, title, lower, upper, step, subtitle = '', digits = 0, onUser = null) {
    const adjustment = new Gtk.Adjustment({
        lower, upper, step_increment: step, page_increment: step * 10,
    });
    const row = new Adw.SpinRow({title, subtitle, adjustment, digits});
    if (onUser) {
        adjustment.connect('value-changed', a => {
            const v = settings.get_value(key);
            const current = v.get_type_string() === 'd' ? v.get_double() : v.get_int32();
            if (Math.abs(a.value - current) > 1e-9)
                onUser(key);
        });
    }
    settings.bind(key, adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

/** A 0..1 double shown as a percentage slider. */
export function percentRow(settings, key, title, subtitle = '', onUser = null) {
    const row = new Adw.ActionRow({title, subtitle});
    const scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 5);
    scale.set_size_request(200, -1);
    scale.valign = Gtk.Align.CENTER;
    scale.draw_value = true;
    scale.value_pos = Gtk.PositionType.LEFT;
    scale.set_format_value_func((_s, v) => `${v.toFixed(0)}%`);

    const fromSettings = () => {
        const v = Math.round(settings.get_double(key) * 100);
        if (Math.round(scale.get_value()) !== v)
            scale.set_value(v);
    };
    fromSettings();
    scale.connect('value-changed', s => {
        const value = Math.round(s.get_value()) / 100;
        if (Math.abs(settings.get_double(key) - value) > 1e-9) {
            settings.set_double(key, value);
            onUser?.(key);
        }
    });
    const id = settings.connect(`changed::${key}`, fromSettings);
    row.connect('destroy', () => settings.disconnect(id));
    row.add_suffix(scale);
    return row;
}

export function comboRow(settings, key, title, subtitle = '', choices = null) {
    choices = choices ?? CHOICES[key];
    const values = choices.map(c => c[0]);
    const row = new Adw.ComboRow({
        title, subtitle,
        model: Gtk.StringList.new(choices.map(c => c[1])),
    });
    const fromSettings = () => {
        const i = values.indexOf(settings.get_string(key));
        if (i >= 0 && row.selected !== i)
            row.selected = i;
    };
    fromSettings();
    row.connect('notify::selected', r => {
        const value = values[r.selected];
        if (value !== undefined && settings.get_string(key) !== value)
            settings.set_string(key, value);
    });
    const id = settings.connect(`changed::${key}`, fromSettings);
    row.connect('destroy', () => settings.disconnect(id));
    return row;
}

export function colorRow(settings, key, title, enableKey = null, onUser = null) {
    const row = new Adw.ActionRow({title});
    const button = new Gtk.ColorDialogButton({
        dialog: new Gtk.ColorDialog({with_alpha: false}),
        valign: Gtk.Align.CENTER,
    });
    const fromSettings = () => {
        const rgba = new Gdk.RGBA();
        if (rgba.parse(settings.get_string(key)))
            button.set_rgba(rgba);
    };
    fromSettings();
    button.connect('notify::rgba', b => {
        const c = b.get_rgba();
        const hex = n => Math.round(n * 255).toString(16).padStart(2, '0');
        const value = `#${hex(c.red)}${hex(c.green)}${hex(c.blue)}`;
        if (value !== settings.get_string(key)) {
            settings.set_string(key, value);
            onUser?.(key);
        }
    });
    const id = settings.connect(`changed::${key}`, fromSettings);
    row.connect('destroy', () => settings.disconnect(id));
    if (enableKey)
        settings.bind(enableKey, row, 'sensitive', Gio.SettingsBindFlags.GET);
    row.add_suffix(button);
    return row;
}

export function sensitiveWhen(settings, row, key, invert = false) {
    let flags = Gio.SettingsBindFlags.GET;
    if (invert)
        flags |= Gio.SettingsBindFlags.INVERT_BOOLEAN;
    settings.bind(key, row, 'sensitive', flags);
    return row;
}

/** Row sensitive only while string setting `key` is one of `values`. */
export function sensitiveWhenValue(settings, row, key, values) {
    const sync = () => {
        row.sensitive = values.includes(settings.get_string(key));
    };
    sync();
    const id = settings.connect(`changed::${key}`, sync);
    row.connect('destroy', () => settings.disconnect(id));
    return row;
}

export function toast(window, title, buttonLabel = null, onButton = null, timeout = 5) {
    const t = new Adw.Toast({title, timeout});
    if (buttonLabel) {
        t.button_label = buttonLabel;
        t.connect('button-clicked', () => onButton?.());
    }
    window.add_toast(t);
}

/** Reset every key used on a page. */
export function resetButton(window, settings, keys, what) {
    const button = new Gtk.Button({
        label: 'Reset', valign: Gtk.Align.CENTER, css_classes: ['flat'],
        tooltip_text: `Reset ${what} settings to their defaults`,
    });
    button.connect('clicked', () => {
        const dialog = new Adw.AlertDialog({
            heading: `Reset ${what} settings?`,
            body: 'Every option on this page goes back to its default.',
        });
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('reset', 'Reset');
        dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.connect('response', (_d, response) => {
            if (response !== 'reset')
                return;
            for (const key of keys)
                settings.reset(key);
            toast(window, `${what} settings reset`);
        });
        dialog.present(window);
    });
    return button;
}
