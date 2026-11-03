// SPDX-License-Identifier: GPL-3.0-or-later
//
// A compact application menu in the spirit of Plasma's Kicker: search on top,
// categories on the left (switch on hover), apps on the right, power actions
// at the bottom. It can replace the overview for Super, Activities and the
// dock's applications button.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';

import {GlassLayer} from './glass.js';

const CATEGORIES = [
    {id: 'favorites', name: 'Favorites', icon: 'starred-symbolic'},
    {id: 'all', name: 'All Applications', icon: 'view-app-grid-symbolic'},
    {id: 'Utility', name: 'Accessories', icon: 'applications-utilities-symbolic', match: ['Utility', 'Accessibility']},
    {id: 'Development', name: 'Development', icon: 'applications-engineering-symbolic', match: ['Development']},
    {id: 'Education', name: 'Education', icon: 'accessories-dictionary-symbolic', match: ['Education']},
    {id: 'Game', name: 'Games', icon: 'applications-games-symbolic', match: ['Game']},
    {id: 'Graphics', name: 'Graphics', icon: 'applications-graphics-symbolic', match: ['Graphics']},
    {id: 'Network', name: 'Internet', icon: 'applications-internet-symbolic', match: ['Network', 'WebBrowser', 'Email', 'Chat']},
    {id: 'AudioVideo', name: 'Multimedia', icon: 'applications-multimedia-symbolic', match: ['AudioVideo', 'Audio', 'Video']},
    {id: 'Office', name: 'Office', icon: 'applications-office-symbolic', match: ['Office']},
    {id: 'Science', name: 'Science', icon: 'applications-science-symbolic', match: ['Science']},
    {id: 'Settings', name: 'Settings', icon: 'preferences-system-symbolic', match: ['Settings', 'DesktopSettings']},
    {id: 'System', name: 'System', icon: 'applications-system-symbolic', match: ['System']},
    {id: 'Other', name: 'Other', icon: 'applications-other-symbolic'},
];

const POWER_ACTIONS = [
    {label: 'Lock', icon: 'system-lock-screen-symbolic', run: a => a.activateLockScreen(), can: 'can-lock-screen'},
    {label: 'Log Out', icon: 'system-log-out-symbolic', run: a => a.activateLogout(), can: 'can-logout'},
    {label: 'Suspend', icon: 'media-playback-pause-symbolic', run: a => a.activateSuspend(), can: 'can-suspend'},
    {label: 'Restart', icon: 'system-reboot-symbolic', run: a => a.activateRestart(), can: 'can-restart'},
    {label: 'Power Off', icon: 'system-shutdown-symbolic', run: a => a.activatePowerOff(), can: 'can-power-off'},
];

const MENU_WIDTH = 620;
const MENU_HEIGHT = 540;
const MAX_SEARCH_RESULTS = 60;

function appCategories(app) {
    const info = app.get_app_info();
    const cats = (info?.get_categories?.() ?? '').split(';').filter(Boolean);
    const ids = CATEGORIES.filter(c => c.match?.some(m => cats.includes(m))).map(c => c.id);
    return ids.length ? ids : ['Other'];
}

function searchText(app) {
    const info = app.get_app_info();
    return [
        app.get_name(),
        info?.get_generic_name?.() ?? '',
        (info?.get_keywords?.() ?? []).join(' '),
        info?.get_executable?.() ?? '',
        app.get_id(),
    ].join(' ').toLowerCase();
}

export class Launcher {
    constructor(settings) {
        this._settings = settings;
        this._root = null;
    }

    get isOpen() {
        return this._root !== null;
    }

    toggle(source = null) {
        if (this.isOpen)
            this.close();
        else
            this.open(source);
    }

    open(source = null) {
        if (this.isOpen)
            return;
        if (Main.overview.visible)
            Main.overview.hide();

        this._config = {
            iconSize: this._settings.get_int('launcher-icon-size'),
            descriptions: this._settings.get_boolean('launcher-show-descriptions'),
            power: this._settings.get_boolean('launcher-show-power'),
            opacity: this._settings.get_double('launcher-opacity'),
            glass: this._settings.get_boolean('glass-launcher'),
            blur: this._settings.get_int('glass-blur-radius'),
            brightness: this._settings.get_double('glass-brightness'),
            highlight: this._settings.get_boolean('glass-highlight'),
        };

        this._loadApps();
        this._build(source);

        this._grab = Main.pushModal(this._root, {actionMode: Shell.ActionMode.POPUP});
        global.focus_manager.add_group(this._menu);
        this._search.grab_key_focus();
        this._selectCategory(this._favorites.length ? 'favorites' : 'all');

        this._menu.opacity = 0;
        this._menu.ease({opacity: 255, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    close() {
        if (!this._root)
            return;
        if (this._hoverId) {
            GLib.source_remove(this._hoverId);
            this._hoverId = 0;
        }
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        const root = this._root;
        this._root = null;
        this._glass = null; // destroyed with the root
        root.destroy();
    }

    destroy() {
        this.close();
    }

    // ---- data -------------------------------------------------------------

    _loadApps() {
        const appSys = Shell.AppSystem.get_default();
        const seen = new Set();
        this._apps = [];
        for (const info of appSys.get_installed()) {
            if (!info.should_show())
                continue;
            const app = appSys.lookup_app(info.get_id());
            if (!app || seen.has(app.get_id()))
                continue;
            seen.add(app.get_id());
            this._apps.push({app, cats: appCategories(app), text: searchText(app)});
        }
        this._apps.sort((a, b) => a.app.get_name().localeCompare(b.app.get_name()));
        this._favorites = AppFavorites.getAppFavorites().getFavorites();
    }

    // ---- UI ---------------------------------------------------------------

    _build(source) {
        const monitor = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const c = this._config;
        this._glass = null;

        // Full-monitor transparent backdrop catches outside clicks and keys.
        this._root = new St.Widget({
            name: 'orbitLauncherRoot',
            reactive: true,
            x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height,
        });
        this._root.connect('button-press-event', (_a, event) => this._onBackdropPress(event));
        this._root.connect('touch-event', (_a, event) => {
            if (event.type() === Clutter.EventType.TOUCH_BEGIN)
                return this._onBackdropPress(event);
            return Clutter.EVENT_PROPAGATE;
        });
        this._root.connect('key-press-event', (_a, event) => this._onKeyPress(event));
        // Close on Super *release*; closing on press would let the release
        // reach the Super-key handler and reopen the menu.
        this._root.connect('key-release-event', (_a, event) => {
            const sym = event.get_key_symbol();
            if (sym === Clutter.KEY_Super_L || sym === Clutter.KEY_Super_R) {
                this.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        Main.layoutManager.addTopChrome(this._root);

        const width = MENU_WIDTH * scale;
        const height = MENU_HEIGHT * scale;
        this._menu = new St.Widget({
            name: 'orbitLauncher',
            layout_manager: new Clutter.BinLayout(),
            width, height,
        });

        if (c.glass) {
            this._glass = new GlassLayer({
                monitorIndex: monitor.index,
                radius: 18,
                blur: c.blur,
                brightness: c.brightness,
            });
            this._menu.add_child(this._glass.actor);
        }

        const content = new St.BoxLayout({
            style_class: 'orbit-launcher',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
        });
        const border = c.glass && c.highlight ? 'border: 1px solid rgba(255, 255, 255, 0.16);' : '';
        content.set_style(`background-color: rgba(30, 30, 34, ${c.opacity}); ${border}`);
        this._menu.add_child(content);

        // Header: user + search
        const header = new St.BoxLayout({style_class: 'orbit-launcher-header'});
        header.add_child(new St.Icon({icon_name: 'avatar-default-symbolic', icon_size: 28,
            style_class: 'orbit-launcher-avatar', y_align: Clutter.ActorAlign.CENTER}));
        header.add_child(new St.Label({
            text: GLib.get_real_name() || GLib.get_user_name(),
            style_class: 'orbit-launcher-user',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        this._search = new St.Entry({
            style_class: 'orbit-launcher-search',
            hint_text: 'Search applications…',
            can_focus: true,
            x_expand: true,
            primary_icon: new St.Icon({icon_name: 'edit-find-symbolic', icon_size: 16}),
        });
        this._search.clutter_text.connect('text-changed', () => this._onSearchChanged());
        this._search.clutter_text.connect('activate', () => this._launchFirst());
        this._search.clutter_text.connect('key-press-event', (_a, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Down) {
                this._appBox.get_first_child()?.grab_key_focus();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        header.add_child(this._search);
        content.add_child(header);

        // Body: categories | apps
        const body = new St.BoxLayout({style_class: 'orbit-launcher-body', y_expand: true});
        this._catBox = new St.BoxLayout({
            style_class: 'orbit-launcher-categories',
            orientation: Clutter.Orientation.VERTICAL,
        });
        const catScroll = new St.ScrollView({
            child: this._catBox,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
        });
        body.add_child(catScroll);

        this._appBox = new St.BoxLayout({
            style_class: 'orbit-launcher-apps',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        this._appScroll = new St.ScrollView({
            child: this._appBox,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            x_expand: true,
            y_expand: true,
        });
        body.add_child(this._appScroll);
        content.add_child(body);

        this._catButtons = new Map();
        for (const cat of CATEGORIES) {
            if (!this._categoryApps(cat.id).length)
                continue;
            const button = new St.Button({
                style_class: 'orbit-launcher-category',
                can_focus: true,
                toggle_mode: false,
                x_expand: true,
                child: this._iconLabel(cat.icon, cat.name, 16),
            });
            button.connect('clicked', () => this._selectCategory(cat.id));
            button.connect('notify::hover', () => {
                // Kicker-style: hovering a category switches to it after a beat.
                if (this._hoverId)
                    GLib.source_remove(this._hoverId);
                this._hoverId = 0;
                if (button.hover && !this._search.get_text()) {
                    this._hoverId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
                        this._hoverId = 0;
                        if (button.hover)
                            this._selectCategory(cat.id);
                        return GLib.SOURCE_REMOVE;
                    });
                }
            });
            this._catButtons.set(cat.id, button);
            this._catBox.add_child(button);
        }

        if (c.power)
            content.add_child(this._buildPowerRow());

        this._root.add_child(this._menu);
        this._positionMenu(source, monitor, width, height, scale);
        this._glass?.sync();
    }

    _iconLabel(iconName, text, size) {
        // St.Button centres its child unless told otherwise.
        const box = new St.BoxLayout({
            style_class: 'orbit-launcher-iconlabel',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        box.add_child(new St.Icon({icon_name: iconName, icon_size: size}));
        box.add_child(new St.Label({text, y_align: Clutter.ActorAlign.CENTER}));
        return box;
    }

    _buildPowerRow() {
        const actions = SystemActions.getDefault();
        const row = new St.BoxLayout({style_class: 'orbit-launcher-power', x_align: Clutter.ActorAlign.END});
        for (const action of POWER_ACTIONS) {
            if (action.can && actions[action.can.replace(/-([a-z])/g, (_m, l) => l.toUpperCase())] === false)
                continue;
            const button = new St.Button({
                style_class: 'orbit-launcher-power-button',
                can_focus: true,
                accessible_name: action.label,
                child: new St.Icon({icon_name: action.icon, icon_size: 16}),
            });
            button.connect('clicked', () => {
                this.close();
                action.run(actions);
            });
            button.connect('notify::hover', () => {
                this._powerLabel.text = button.hover ? action.label : '';
            });
            row.add_child(button);
        }
        this._powerLabel = new St.Label({style_class: 'orbit-launcher-power-label', y_align: Clutter.ActorAlign.CENTER});
        row.insert_child_at_index(this._powerLabel, 0);
        return row;
    }

    _positionMenu(source, monitor, width, height, scale) {
        const gap = 8 * scale;
        let x, y;
        if (source?.get_stage()) {
            const [sx, sy] = source.get_transformed_position();
            const [sw, sh] = source.get_transformed_size();
            // Open away from the closest screen edge (works for any dock side).
            const cx = sx + sw / 2 - monitor.x;
            const cy = sy + sh / 2 - monitor.y;
            const distances = {
                bottom: monitor.height - cy, top: cy, left: cx, right: monitor.width - cx,
            };
            const edge = Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0];
            switch (edge) {
            case 'bottom': x = sx + sw / 2 - width / 2; y = sy - height - gap; break;
            case 'top': x = sx + sw / 2 - width / 2; y = sy + sh + gap; break;
            case 'left': x = sx + sw + gap; y = sy + sh / 2 - height / 2; break;
            default: x = sx - width - gap; y = sy + sh / 2 - height / 2;
            }
        } else {
            const panel = Main.layoutManager.panelBox;
            x = monitor.x + gap;
            y = (panel.visible ? panel.y + panel.height : monitor.y) + gap;
        }
        x = Math.clamp(Math.round(x), monitor.x + gap, monitor.x + monitor.width - width - gap) - monitor.x;
        y = Math.clamp(Math.round(y), monitor.y + gap, monitor.y + monitor.height - height - gap) - monitor.y;
        this._menu.set_position(x, y);
    }

    // ---- content ----------------------------------------------------------

    _categoryApps(id) {
        if (id === 'favorites')
            return this._favorites.map(app => ({app}));
        if (id === 'all')
            return this._apps;
        return this._apps.filter(a => a.cats.includes(id));
    }

    _selectCategory(id) {
        this._currentCategory = id;
        for (const [catId, button] of this._catButtons) {
            if (catId === id)
                button.add_style_pseudo_class('checked');
            else
                button.remove_style_pseudo_class('checked');
        }
        this._showApps(this._categoryApps(id).map(a => a.app));
    }

    _showApps(apps) {
        this._appBox.destroy_all_children();
        this._appScroll.vadjustment.value = 0;
        for (const app of apps)
            this._appBox.add_child(this._appRow(app));
        if (!apps.length) {
            this._appBox.add_child(new St.Label({
                text: 'No applications found',
                style_class: 'orbit-launcher-empty',
                x_align: Clutter.ActorAlign.CENTER,
            }));
        }
    }

    _appRow(app) {
        const c = this._config;
        const box = new St.BoxLayout({
            style_class: 'orbit-launcher-app-box',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        box.add_child(app.create_icon_texture(c.iconSize));
        const text = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        text.add_child(new St.Label({text: app.get_name(), style_class: 'orbit-launcher-app-name'}));
        const desc = c.descriptions ? app.get_description() : null;
        if (desc) {
            const label = new St.Label({text: desc, style_class: 'orbit-launcher-app-desc'});
            label.clutter_text.ellipsize = 3; // Pango.EllipsizeMode.END
            text.add_child(label);
        }
        box.add_child(text);

        const button = new St.Button({
            style_class: 'orbit-launcher-app',
            can_focus: true,
            x_expand: true,
            child: box,
        });
        button._orbitApp = app;
        button.connect('clicked', () => this._launch(app));
        button.connect('key-focus-in', () => {
            // keep the focused row visible while arrowing through the list
            const adj = this._appScroll.vadjustment;
            const [, y] = [0, button.y];
            if (y < adj.value)
                adj.value = y;
            else if (y + button.height > adj.value + adj.page_size)
                adj.value = y + button.height - adj.page_size;
        });
        return button;
    }

    _onSearchChanged() {
        const query = this._search.get_text().trim().toLowerCase();
        if (!query) {
            this._selectCategory(this._currentCategory ?? 'all');
            return;
        }
        for (const button of this._catButtons.values())
            button.remove_style_pseudo_class('checked');

        const terms = query.split(/\s+/);
        const scored = [];
        for (const entry of this._apps) {
            if (!terms.every(t => entry.text.includes(t)))
                continue;
            const name = entry.app.get_name().toLowerCase();
            const score = name.startsWith(query) ? 0 : name.includes(query) ? 1 : 2;
            scored.push([score, entry.app]);
        }
        scored.sort((a, b) => a[0] - b[0] || a[1].get_name().localeCompare(b[1].get_name()));
        this._showApps(scored.slice(0, MAX_SEARCH_RESULTS).map(s => s[1]));
    }

    _launchFirst() {
        const first = this._appBox.get_first_child();
        if (first?._orbitApp)
            this._launch(first._orbitApp);
    }

    _launch(app) {
        this.close();
        app.activate();
    }

    // ---- events -----------------------------------------------------------

    _onBackdropPress(event) {
        const [x, y] = event.get_coords();
        const [mx, my] = this._menu.get_transformed_position();
        const [mw, mh] = this._menu.get_transformed_size();
        if (x < mx || x > mx + mw || y < my || y > my + mh) {
            this.close();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onKeyPress(event) {
        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Escape) {
            if (this._search.get_text()) {
                this._search.set_text('');
                this._search.grab_key_focus();
            } else {
                this.close();
            }
            return Clutter.EVENT_STOP;
        }
        // Typing anywhere goes to the search field.
        const ch = event.get_key_unicode();
        if (ch && ch.length === 1 && ch >= ' ' && !this._search.clutter_text.has_key_focus()) {
            this._search.grab_key_focus();
            this._search.clutter_text.insert_text(ch, -1);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }
}

