// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import {presetEnvelope} from './presetModel.js';
import {validateLauncherValue, THEME_KEYS, jsonObject, parseShortcuts} from './launcherModel.js';
import {PANEL_ELEMENTS, panelOverrides} from './taskbarModel.js';

export function exportSettings(settings, keys = settings.settings_schema.list_keys()) {
    const text = JSON.stringify({format: 'orbit-shell-settings', version: 1,
        settings: Object.fromEntries(keys.sort().map(key => {
            const value = settings.get_value(key);
            return [key, {type: value.get_type_string(), value: value.deep_unpack()}];
        }))}, null, 2);
    if (new TextEncoder().encode(text).length > 1024 * 1024) throw new Error('Settings backup exceeds 1 MiB; reduce saved desktop positions before exporting');
    return text;
}

export function validateSettings(text, settings) {
    if (new TextEncoder().encode(text).length > 1024 * 1024) throw new Error('Settings file exceeds 1 MiB');
    const data = JSON.parse(text);
    if (data?.format !== 'orbit-shell-settings' || data.version !== 1 || !data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings))
        throw new Error('Not a supported Orbit settings backup');
    const keys = new Set(settings.settings_schema.list_keys());
    const values = [];
    for (const [key, entry] of Object.entries(data.settings)) {
        if (!keys.has(key)) throw new Error(`Unknown setting: ${key}`);
        const type = settings.get_value(key).get_type_string();
        const value = entry?.value;
        const valid = type === 'b' ? typeof value === 'boolean' : type === 's' ? typeof value === 'string'
            : type === 'as' ? Array.isArray(value) && value.every(item => typeof item === 'string')
                : type === 'i' ? Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
                    : type === 'd' ? typeof value === 'number' && Number.isFinite(value) : false;
        if (entry?.type !== type || !valid) throw new Error(`Invalid value type for ${key}`);
        const variant = new GLib.Variant(type, value);
        if (!settings.settings_schema.get_key(key).range_check(variant)) throw new Error(`Value out of range for ${key}`);
        if (/^(dock-app-\d+|reveal-shortcut|launcher-shortcut)$/.test(key)) {
            for (const accelerator of value) {
                const [ok, keyval, modifiers] = Gtk.accelerator_parse(accelerator);
                if (!ok || !Gtk.accelerator_valid(keyval, modifiers)) throw new Error(`Invalid shortcut in ${key}`);
            }
        }
        if (key === 'taskbar-monitor-overrides') panelOverrides(value, true);
        if (['taskbar-element-order', 'taskbar-hidden-elements'].includes(key) &&
            (value.some(id => !PANEL_ELEMENTS.includes(id)) || new Set(value).size !== value.length)) throw new Error(`Invalid panel elements in ${key}`);
        if (key === 'tray-known-items') {
            const known = jsonObject(value,true);
            if (Object.entries(known).some(([id,title]) => !id || typeof title !== 'string')) throw new Error('Invalid known tray applications');
        }
        if (['tray-order','tray-hidden-apps'].includes(key) && (new Set(value).size !== value.length || value.some(id => !id))) throw new Error(`Invalid tray application list: ${key}`);
        if (key === 'custom-presets') {
            const presets = jsonObject(value, true);
            if (Object.keys(presets).length > 16) throw new Error('Too many desktop presets');
            for (const [name, preset] of Object.entries(presets)) {
                const data = presetEnvelope(JSON.stringify(preset));
                if (data.name !== name) throw new Error('Preset name mismatch');
                validateSettings(JSON.stringify({format:'orbit-shell-settings',version:1,settings:data.orbit}),settings);
            }
        }
        validateLauncherValue(key, value);
        if (key === 'launcher-shortcuts') for (const item of parseShortcuts(value, true)) if (item.type === 'command') GLib.shell_parse_argv(item.target);
        if (key === 'launcher-saved-themes') {
            const themes = jsonObject(value, true);
            if (Object.keys(themes).length > 32) throw new Error('Too many launcher themes');
            for (const [name, theme] of Object.entries(themes)) {
                if (!name.trim() || name.length > 64 || ['__proto__', 'constructor', 'prototype'].includes(name) || !theme || Object.keys(theme).some(themeKey => !THEME_KEYS.includes(themeKey))) throw new Error('Invalid launcher theme');
                validateSettings(JSON.stringify({format: 'orbit-shell-settings', version: 1, settings: theme}), settings);
            }
        }
        values.push([key, variant]);
    }
    if (!values.length) throw new Error('The backup contains no settings');
    return values;
}

/** Use a separate transaction so normal preferences bindings do not remain delayed. */
export function applySettings(settings, values) {
    const transaction = new Gio.Settings({settings_schema: settings.settings_schema, backend: settings.backend, path: settings.path});
    transaction.delay();
    try {
        for (const [key, value] of values) {
            if (!transaction.is_writable(key) || !transaction.set_value(key, value)) throw new Error(`Could not write setting: ${key}`);
        }
        transaction.apply();
    } catch (error) {
        transaction.revert();
        throw error;
    }
}

export function readSettingsFile(file, cancel = null) {
    return new Promise((resolve, reject) => {
        file.read_async(GLib.PRIORITY_DEFAULT, cancel, (source, result) => {
            let stream;
            try { stream = source.read_finish(result); } catch (error) { reject(error); return; }
            const chunks = []; let length = 0, closed = false;
            const close = () => {
                if (closed) return;
                closed = true;
                stream.close_async(GLib.PRIORITY_DEFAULT, null, (s, r) => { try { s.close_finish(r); } catch {} });
            };
            const next = () => stream.read_bytes_async(65536, GLib.PRIORITY_DEFAULT, cancel, (s, r) => {
                try {
                    const chunk = s.read_bytes_finish(r).get_data();
                    if (chunk.length) {
                        length += chunk.length;
                        if (length > 1024 * 1024) throw new Error('Settings file exceeds 1 MiB');
                        chunks.push(chunk); next();
                    } else {
                        const bytes = new Uint8Array(length); let offset = 0;
                        for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
                        close(); resolve(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
                    }
                } catch (error) { close(); reject(error); }
            });
            next();
        });
    });
}
