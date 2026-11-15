// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class DockShortcuts {
    constructor(manager) {
        this._manager = manager;
        this._bindings = [];
        this._add('reveal-shortcut', () => this._dock()?.toggleReveal());
        if (manager.settings.get_boolean('number-shortcuts')) {
            for (let i = 1; i <= 10; i++) {
                this._add(`dock-app-${i}`, () => {
                    const dock = this._dock();
                    const icon = dock?.shortcutIcons()[i - 1];
                    if (!icon)
                        return;
                    dock.revealFor(2500);
                    dock.showNumbers(true);
                    if (this._overlayTimer)
                        GLib.source_remove(this._overlayTimer);
                    this._overlayTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => {
                        this._overlayTimer = 0;
                        this._manager._docks.forEach(d => d.showNumbers(false));
                        return GLib.SOURCE_REMOVE;
                    });
                    dock.activateApp(icon, 1, 0); // Never inherit the shortcut's Alt/Ctrl modifiers.
                });
            }
        }
    }

    _add(name, callback) {
        const action = Main.wm.addKeybinding(name, this._manager.settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW, callback);
        this._bindings.push(name);
        if (action === Meta.KeyBindingAction.NONE && this._manager.settings.get_strv(name).length)
            console.warn(`Orbit: shortcut ${name} could not be registered; choose an unused accelerator`);
    }

    _dock() {
        return this._manager._docks.find(d => d.monitorIndex === global.display.get_current_monitor())
            ?? this._manager._docks[0];
    }

    destroy() {
        if (this._overlayTimer)
            GLib.source_remove(this._overlayTimer);
        this._bindings.forEach(name => Main.wm.removeKeybinding(name));
    }
}
