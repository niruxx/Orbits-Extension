// SPDX-License-Identifier: GPL-3.0-or-later
//
// Decides what Super, the Activities button and the login do: the stock
// overview, Orbit's launcher, or nothing.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const MODE_KEYS = new Set(['super-key-action', 'activities-action', 'skip-startup-overview']);

export class ShellModes {
    constructor(settings, launcher) {
        this._settings = settings;
        this._launcher = launcher;
        this._superBlocked = false;

        this._settings.connectObject('changed', (_s, key) => {
            if (MODE_KEYS.has(key))
                this._apply();
        }, this);

        // "Start on the desktop": GNOME may enable extensions before or just
        // after startup completes, so handle both, but only once per Shell
        // session (not again after unlocking the screen).
        if (!globalThis.__orbitStartupHandled) {
            globalThis.__orbitStartupHandled = true;
            const leaveOverview = () => {
                if (!this._settings.get_boolean('skip-startup-overview'))
                    return;
                this._startupId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    this._startupId = 0;
                    if (Main.overview.visible)
                        Main.overview.hide();
                    return GLib.SOURCE_REMOVE;
                });
            };
            if (Main.layoutManager._startingUp)
                Main.layoutManager.connectObject('startup-complete', leaveOverview, this);
            else
                leaveOverview();
        }
        this._apply();
    }

    _apply() {
        this._applySuperKey(this._settings.get_string('super-key-action'));
        this._applyActivities(this._settings.get_string('activities-action'));
    }

    // ---- Super key ----------------------------------------------------------

    _applySuperKey(action) {
        this._restoreSuperKey();
        if (action === 'overview')
            return;

        // The overview's handler lives in overviewControls.js; block it rather
        // than replacing Shell code, so disabling restores it exactly.
        GObject.signal_handlers_block_matched(global.display, {signalId: 'overlay-key'});
        this._superBlocked = true;
        this._superId = global.display.connect('overlay-key', () => {
            if (action === 'launcher')
                this._launcher.toggle(null);
        });
    }

    _restoreSuperKey() {
        if (this._superId) {
            global.display.disconnect(this._superId);
            this._superId = 0;
        }
        if (this._superBlocked) {
            GObject.signal_handlers_unblock_matched(global.display, {signalId: 'overlay-key'});
            this._superBlocked = false;
        }
    }

    // ---- Activities button ------------------------------------------------

    _applyActivities(action) {
        this._restoreActivities();
        const button = Main.panel.statusArea.activities;
        if (!button || action !== 'launcher')
            return;

        button._clickGesture?.set_enabled(false);
        this._activitiesGesture = new Clutter.ClickGesture();
        this._activitiesGesture.connect('recognize', () => this._launcher.toggle(null));
        button.add_action(this._activitiesGesture);
        this._activitiesButton = button;
    }

    _restoreActivities() {
        if (this._activitiesGesture) {
            this._activitiesButton?.remove_action(this._activitiesGesture);
            this._activitiesGesture = null;
        }
        if (this._activitiesButton) {
            this._activitiesButton._clickGesture?.set_enabled(true);
            this._activitiesButton = null;
        }
    }

    destroy() {
        if (this._startupId) {
            GLib.source_remove(this._startupId);
            this._startupId = 0;
        }
        this._settings.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._restoreSuperKey();
        this._restoreActivities();
    }
}
