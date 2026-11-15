// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

/** Show/restore only windows minimized by this button, on the current workspace. */
export class ShowDesktop {
    constructor(peek, beforePeek) {
        this._minimized = new Set();
        this._dimmed = new Map();
        this.actor = new St.Button({style_class: 'orbit-show-desktop', can_focus: true,
            track_hover: true, accessible_name: 'Show Desktop',
            child: new St.Icon({icon_name: 'user-desktop-symbolic', icon_size: 16})});
        this.actor.connect('clicked', () => {
            this._restorePeek();
            const windows = this._windows();
            const restore = windows.filter(win => this._minimized.has(win));
            if (restore.length) {
                restore.forEach(win => win.unminimize());
                this._minimized.clear();
            } else {
                this._minimized = new Set(windows.filter(win => !win.minimized && win.can_minimize()));
                this._minimized.forEach(win => win.minimize());
            }
        });
        this.actor.connect('notify::hover', () => {
            this._restorePeek();
            if (!peek || !this.actor.hover)
                return;
            this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                this._timer = 0;
                beforePeek();
                for (const win of this._windows()) {
                    const actor = win.get_compositor_private();
                    if (actor && !win.minimized) {
                        this._dimmed.set(actor, actor.opacity);
                        actor.opacity = 0;
                    }
                }
                return GLib.SOURCE_REMOVE;
            });
        });
        this._workspaceSignal = global.workspace_manager.connect('active-workspace-changed', () => this._restorePeek());
        this.actor.connect('destroy', () => {
            this._restorePeek();
            global.workspace_manager.disconnect(this._workspaceSignal);
            this._minimized.clear();
        });
    }

    _windows() {
        const workspace = global.workspace_manager.get_active_workspace();
        return workspace.list_windows().filter(win => !win.skip_taskbar && win.located_on_workspace(workspace));
    }

    _restorePeek() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
        for (const [actor, opacity] of this._dimmed) {
            if (actor.get_stage())
                actor.opacity = opacity;
        }
        this._dimmed.clear();
    }
}
