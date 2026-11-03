// SPDX-License-Identifier: GPL-3.0-or-later
//
// Shows the focused application (icon + name or window title) in the top bar.
// Clicking opens GNOME's own app menu (windows, new window, details, quit).

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export const APP_BUTTON_KEYS = new Set([
    'app-button-enabled', 'app-button-position', 'app-button-show-title', 'app-button-show-icon',
]);

const ROLE = 'orbit-app-button';
const MAX_TITLE_CHARS = 48;

const FocusedAppButton = GObject.registerClass(
class OrbitFocusedAppButton extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, 'Focused application', false);
        this._settings = settings;
        this.add_style_class_name('orbit-app-button');

        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._icon = new St.Bin({y_align: Clutter.ActorAlign.CENTER});
        this._label = new St.Label({y_align: Clutter.ActorAlign.CENTER});
        this._label.clutter_text.ellipsize = 3; // Pango.EllipsizeMode.END
        box.add_child(this._icon);
        box.add_child(this._label);
        this.add_child(box);

        // Replaces the default menu; the panel registers it with its menu
        // manager when the button is added to the status area.
        this.setMenu(new AppMenu(this, St.Side.TOP, {showSingleWindows: true}));

        this._tracker = Shell.WindowTracker.get_default();
        this._tracker.connectObject('notify::focus-app', () => this._sync(), this);
        global.display.connectObject('notify::focus-window', () => this._sync(), this);
        Main.overview.connectObject('showing', () => this._sync(), 'hidden', () => this._sync(), this);
        this._sync();
    }

    _sync() {
        const app = this._tracker.focus_app;
        const win = global.display.focus_window;
        const visible = !!app && !Main.overview.visibleTarget;
        this.container.visible = visible;
        if (!visible)
            return;

        if (this._app !== app) {
            this._app?.disconnectObject(this);
            this._app = app;
            this.menu.setApp(app);
            this._icon.set_child(this._settings.get_boolean('app-button-show-icon')
                ? app.create_icon_texture(16) : null);
        }

        let text = app.get_name();
        if (this._settings.get_boolean('app-button-show-title') && win?.title) {
            text = win.title;
            // follow title changes of the focused window
            if (this._titleWin !== win) {
                this._titleWin?.disconnectObject(this);
                this._titleWin = win;
                win.connectObject('notify::title', () => this._sync(), this);
            }
        }
        if (text.length > MAX_TITLE_CHARS)
            text = `${text.slice(0, MAX_TITLE_CHARS - 1)}…`;
        this._label.text = text;
    }

    _onDestroy() {
        this._tracker.disconnectObject(this);
        global.display.disconnectObject(this);
        Main.overview.disconnectObject(this);
        this._titleWin?.disconnectObject(this);
        super._onDestroy();
    }
});

export class AppButtonManager {
    constructor(settings) {
        this._settings = settings;
        this._settings.connectObject('changed', (_s, key) => {
            if (APP_BUTTON_KEYS.has(key))
                this._queueReload();
        }, this);
        this._build();
    }

    _queueReload() {
        if (this._reloadId)
            GLib.source_remove(this._reloadId);
        this._reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._reloadId = 0;
            this._remove();
            this._build();
            return GLib.SOURCE_REMOVE;
        });
    }

    _build() {
        if (!this._settings.get_boolean('app-button-enabled'))
            return;
        const position = this._settings.get_string('app-button-position');
        this._button = new FocusedAppButton(this._settings);
        // Left: after Activities. Center: before the clock. Right: before the system menu.
        const index = {left: 1, center: 0, right: 0}[position] ?? 1;
        Main.panel.addToStatusArea(ROLE, this._button, index, position);
    }

    _remove() {
        if (this._button) {
            this._button.destroy();
            this._button = null;
        }
        delete Main.panel.statusArea[ROLE];
    }

    destroy() {
        if (this._reloadId) {
            GLib.source_remove(this._reloadId);
            this._reloadId = 0;
        }
        this._settings.disconnectObject(this);
        this._remove();
    }
}
