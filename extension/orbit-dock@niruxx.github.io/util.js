// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

export function parseHexColor(hex, fallback = [0, 0, 0]) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
    if (!m)
        return fallback;
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export function isWindowMaximized(win) {
    if (typeof win.is_maximized === 'function')
        return win.is_maximized();
    return win.get_maximized?.() === Meta.MaximizeFlags.BOTH;
}

/** Normal, visible windows on the active workspace. */
export function visibleWorkspaceWindows() {
    const ws = global.workspace_manager.get_active_workspace();
    return global.get_window_actors()
        .map(a => a.meta_window)
        .filter(w => w && !w.minimized &&
            w.get_window_type() === Meta.WindowType.NORMAL &&
            w.located_on_workspace(ws) &&
            (!w.showing_on_its_workspace || w.showing_on_its_workspace()));
}

/**
 * Calls `callback` (debounced) whenever window geometry, stacking, focus or
 * the workspace changes.
 */
export class WindowWatcher {
    constructor(callback, delay = 50) {
        this._callback = callback;
        this._delay = delay;
        this._windows = new Set();

        global.display.connectObject(
            'window-created', (_d, win) => {
                this._track(win);
                this.queue();
            },
            'restacked', () => this.queue(),
            'notify::focus-window', () => this.queue(),
            'grab-op-end', () => this.queue(),
            this);
        global.workspace_manager.connectObject(
            'active-workspace-changed', () => this.queue(), this);
        global.get_window_actors().forEach(a => this._track(a.meta_window));
    }

    _track(win) {
        if (!win || this._windows.has(win))
            return;
        this._windows.add(win);
        win.connectObject(
            'position-changed', () => this.queue(),
            'size-changed', () => this.queue(),
            'notify::minimized', () => this.queue(),
            'workspace-changed', () => this.queue(),
            'unmanaged', () => {
                win.disconnectObject(this);
                this._windows.delete(win);
                this.queue();
            },
            this);
    }

    queue() {
        if (this._timeoutId)
            return;
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._delay, () => {
            this._timeoutId = 0;
            this._callback();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        global.display.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);
        this._windows.forEach(w => w.disconnectObject(this));
        this._windows.clear();
    }
}
