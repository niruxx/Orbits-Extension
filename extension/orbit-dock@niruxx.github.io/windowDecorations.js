// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import {isWindowMaximized, WindowWatcher} from './util.js';

const MOTIF_HINTS = '_MOTIF_WM_HINTS';
const DECORATIONS = 2;

// Keep a pending restoration serialized with a subsequent enable or unlock.
const records = new Map();

function runXprop(record, ...args) {
    const launcher = new Gio.SubprocessLauncher({
        flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    });
    launcher.setenv('LC_ALL', 'C', true);
    const process = launcher.spawnv([record.xprop, '-id', record.xid, ...args]);
    return new Promise((resolve, reject) => {
        process.communicate_utf8_async(null, null, (child, result) => {
            try {
                const [, output] = child.communicate_utf8_finish(result);
                if (!child.get_successful())
                    throw new Error('xprop could not access the window');
                resolve(output.trim());
            } catch (error) {
                reject(error);
            }
        });
    });
}

async function readHints(record) {
    const output = await runXprop(record, '-f', MOTIF_HINTS, '32c', MOTIF_HINTS);
    if (/^_MOTIF_WM_HINTS:\s+(not found|no such atom)/.test(output))
        return null;

    const property = /^_MOTIF_WM_HINTS\((_MOTIF_WM_HINTS|CARDINAL)\)\s*=\s*(.*)$/.exec(output);
    const fields = property?.[2].split(',').map(value => value.trim());
    if (fields?.length === 5 && fields.every(value => /^\d+$/.test(value)))
        return fields.map(Number);
    throw new Error('Unrecognized Motif window hints');
}

function setHints(record, hints) {
    return runXprop(record, '-f', MOTIF_HINTS, '32c', '-set', MOTIF_HINTS, hints.join(', '));
}

async function restoreHints(record) {
    const current = await readHints(record);
    if (record.closed || current?.join(',') !== record.hidden.join(','))
        return;

    // Apply valid hints to make Mutter recreate its frame before deleting a
    // property that was originally absent.
    await setHints(record, record.original ?? [0, 0, 0, 0, 0]);
    for (let attempt = 0; attempt < 20 && !record.closed && !record.window.decorated; attempt++) {
        await new Promise(resolve => GLib.timeout_add_once(GLib.PRIORITY_DEFAULT, 50, resolve));
    }
    if (!record.original && !record.closed && record.window.decorated) {
        const restored = await readHints(record);
        if (!record.closed && restored?.every(value => value === 0))
            await runXprop(record, '-remove', MOTIF_HINTS);
    }
}

async function sync(record) {
    try {
        if (record.wanted && !record.hidden && record.window.decorated) {
            const original = await readHints(record);
            if (record.closed || !record.wanted)
                return;
            const [flags, functions, , inputMode, status] = original ?? [0, 0, 0, 0, 0];
            const hidden = [(flags | DECORATIONS) >>> 0, functions, 0, inputMode, status];
            await setHints(record, hidden);
            record.original = original;
            record.hidden = hidden;
        }
        if (!record.closed && !record.wanted && record.hidden) {
            await restoreHints(record);
            record.hidden = null;
        }
    } catch (error) {
        if (!record.closed)
            console.warn(`Orbit Shell: ${error.message} (${record.xid})`);
    } finally {
        if (!record.wanted && !record.hidden && !record.closed) {
            record.window.disconnect(record.unmanagedId);
            records.delete(record.window);
        }
    }
}

export class WindowDecorations {
    constructor(settings) {
        this._settings = settings;
        settings.connectObject('changed::shell-hide-maximized-decorations', () => this._apply(), this);
        this._apply();
    }

    _apply() {
        const enabled = this._settings.get_boolean('shell-hide-maximized-decorations');
        this._xprop = enabled ? GLib.find_program_in_path('xprop') : null;
        if (this._xprop)
            this._watcher ??= new WindowWatcher(() => this._sync());
        else {
            this._watcher?.destroy();
            this._watcher = null;
        }
        this._sync();
    }

    _sync() {
        const wanted = new Set();
        if (this._xprop) {
            for (const actor of global.get_window_actors()) {
                const window = actor.meta_window;
                if (window?.get_client_type() === Meta.WindowClientType.X11 &&
                    window.get_window_type() === Meta.WindowType.NORMAL &&
                    !window.is_fullscreen() && isWindowMaximized(window)) {
                    wanted.add(window);
                    if (records.has(window) || !window.decorated)
                        continue;
                    const xid = /^0x[0-9a-f]+(?=\s|$)/i.exec(window.get_description())?.[0];
                    if (!xid)
                        continue;
                    const record = {window, xid, xprop: this._xprop};
                    record.unmanagedId = window.connect('unmanaged', () => {
                        record.closed = true;
                        records.delete(window);
                    });
                    records.set(window, record);
                }
            }
        }

        for (const [window, record] of records) {
            record.wanted = wanted.has(window);
            // A change while xprop is running is applied after that operation.
            if (record.pending)
                continue;
            record.pending = true;
            this._reconcile(record);
        }
    }

    async _reconcile(record) {
        try {
            let wanted;
            do {
                wanted = record.wanted;
                await sync(record);
            } while (!record.closed && records.has(record.window) && wanted !== record.wanted);
        } finally {
            record.pending = false;
        }
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._watcher?.destroy();
        this._xprop = null;
        this._sync();
    }
}
