// SPDX-License-Identifier: GPL-3.0-or-later
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {AppButtonManager} from './appButton.js';
import {DockManager} from './dock.js';
import {Launcher} from './launcher.js';
import {ShellModes} from './shellModes.js';
import {TopBarManager} from './topbar.js';
import {TrayManager} from './tray.js';

function attempt(name, make) {
    try {
        return make();
    } catch (e) {
        logError(e, `Orbit Shell: failed to start ${name}`);
        return null;
    }
}

function destroyQuietly(part) {
    try {
        part?.destroy();
    } catch (e) {
        logError(e, 'Orbit Shell: error while disabling');
    }
}

// metadata.json lists "unlock-dialog" so the extension stays enabled while
// the screen is locked. That keeps the tray service alive (apps such as
// Discord register their tray icon only once), while everything visible is
// removed for the lock screen and rebuilt after unlocking.
export default class OrbitShellExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        // Start the tray first so apps launched at login find it.
        this._tray = attempt('tray', () => new TrayManager(this._settings));
        Main.sessionMode.connectObject('updated', () => this._syncSessionMode(), this);
        this._syncSessionMode();
    }

    _syncSessionMode() {
        const locked = Main.sessionMode.isLocked || !Main.sessionMode.hasWindows;
        if (locked && this._parts)
            this._destroyUi();
        else if (!locked && !this._parts)
            this._buildUi();
    }

    _buildUi() {
        const settings = this._settings;
        this._launcher = new Launcher(settings);
        // Each part is independent: one failing must not take the others down.
        this._parts = [
            ['dock', () => new DockManager(settings, this._launcher)],
            ['top bar', () => new TopBarManager(settings)],
            ['shell modes', () => new ShellModes(settings, this._launcher)],
            ['app button', () => new AppButtonManager(settings)],
        ].map(([name, make]) => attempt(name, make));
    }

    _destroyUi() {
        for (const part of (this._parts ?? []).reverse())
            destroyQuietly(part);
        this._parts = null;
        destroyQuietly(this._launcher);
        this._launcher = null;
    }

    disable() {
        Main.sessionMode.disconnectObject(this);
        this._destroyUi();
        destroyQuietly(this._tray);
        this._tray = null;
        this._settings = null;
    }
}
