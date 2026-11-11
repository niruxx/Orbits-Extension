// SPDX-License-Identifier: GPL-3.0-or-later
//
// Orbit's application menu. It can replace the overview for Super, Activities
// and the dock's applications button, and comes in several styles:
//
//   modern   search · pinned grid · "All apps" list · user + power footer
//   list     one scrolling list: pinned apps, then A–Z with letter headings
//   minimal  a compact search box with a row of pinned icons
//   classic  categories beside the app list (Plasma Kicker style)
//   xp       two columns (the Windows XP layout, styled like GNOME): apps on
//            the left, folders and system places on the right

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
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

// Logical size of each style's menu.
const STYLES = {
    modern: {width: 600, height: 640},
    list: {width: 400, height: 620},
    minimal: {width: 540, height: 380},
    classic: {width: 620, height: 540},
    xp: {width: 490, height: 580},
};
const GRID_COLUMNS = 6;
const MINIMAL_COLUMNS = 8;
// GNOME's own modes for the Super key (main.js: NORMAL | OVERVIEW).
const OVERLAY_MODES = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW;
const MAX_SEARCH_RESULTS = 60;
const ELLIPSIZE_END = 3; // Pango.EllipsizeMode.END

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

/** XDG folders for the two-column style's places (missing ones are skipped). */
function places() {
    const dirs = [
        ['Home Folder', 'user-home-symbolic', GLib.get_home_dir()],
        ['Documents', 'folder-documents-symbolic', GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOCUMENTS)],
        ['Pictures', 'folder-pictures-symbolic', GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES)],
        ['Music', 'folder-music-symbolic', GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_MUSIC)],
        ['Videos', 'folder-videos-symbolic', GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_VIDEOS)],
        ['Downloads', 'folder-download-symbolic', GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD)],
    ];
    const seen = new Set();
    return dirs.filter(([, , path]) => {
        if (!path || seen.has(path) || !GLib.file_test(path, GLib.FileTest.IS_DIR))
            return false;
        seen.add(path);
        return true;
    });
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

        const style = this._settings.get_string('launcher-style');
        this._config = {
            style: style in STYLES ? style : 'modern',
            iconSize: this._settings.get_int('launcher-icon-size'),
            descriptions: this._settings.get_boolean('launcher-show-descriptions'),
            xpCategories: this._settings.get_boolean('launcher-xp-categories'),
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
        // Super is a mutter keybinding that GNOME blocks while a popup is open,
        // so the key never reaches the menu. Allow it while we're open so the
        // Super handler (ShellModes) can toggle the menu closed.
        Main.wm.allowKeybinding('overlay-key', OVERLAY_MODES | Shell.ActionMode.POPUP);
        // If Super opens the overview instead, close when it shows.
        Main.overview.connectObject('showing', () => this.close(), this);
        global.focus_manager.add_group(this._menu);
        this._search.grab_key_focus();
        this._selectCategory(this._favorites.length || this._config.style === 'list' ? 'favorites' : 'all');

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
        Main.wm.allowKeybinding('overlay-key', OVERLAY_MODES);
        Main.overview.disconnectObject(this);
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

    // ---- shell of the menu --------------------------------------------------

    _build(source) {
        const monitor = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const c = this._config;
        this._glass = null;
        this._catButtons = new Map();
        this._sectionLabel = null;
        this._toggleButton = null;

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
        Main.layoutManager.addTopChrome(this._root);

        const {width: w, height: h} = STYLES[c.style];
        const width = w * scale;
        const height = h * scale;
        this._menu = new St.Widget({name: 'orbitLauncher', layout_manager: new Clutter.BinLayout(), width, height});

        // Every style is a tinted panel that can sit on frosted glass.
        if (c.glass) {
            this._glass = new GlassLayer({
                monitorIndex: monitor.index, radius: c.style === 'modern' ? 14 : 18,
                blur: c.blur, brightness: c.brightness,
            });
            this._menu.add_child(this._glass.actor);
        }

        const content = new St.BoxLayout({
            style_class: `orbit-launcher orbit-launcher-${c.style}`,
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
        });
        const border = c.glass && c.highlight ? 'border: 1px solid rgba(255, 255, 255, 0.16);' : '';
        content.set_style(`background-color: rgba(30, 30, 34, ${c.opacity}); ${border}`);
        this._menu.add_child(content);

        ({
            modern: () => this._buildModern(content),
            list: () => this._buildList(content),
            minimal: () => this._buildMinimal(content),
            classic: () => this._buildClassic(content),
            xp: () => this._buildXp(content),
        })[c.style]();

        this._root.add_child(this._menu);
        this._positionMenu(source, monitor, width, height, scale);
        this._glass?.sync();
    }

    // ---- building blocks ------------------------------------------------------

    _makeSearch(hint = 'Search applications…', styleClass = 'orbit-launcher-search') {
        this._search = new St.Entry({
            style_class: styleClass,
            hint_text: hint,
            can_focus: true,
            x_expand: true,
            primary_icon: new St.Icon({icon_name: 'edit-find-symbolic', icon_size: 16}),
        });
        this._search.clutter_text.connect('text-changed', () => this._onSearchChanged());
        this._search.clutter_text.connect('activate', () => this._launchFirst());
        this._search.clutter_text.connect('key-press-event', (_a, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Down) {
                this._firstItem()?.grab_key_focus();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        return this._search;
    }

    /** The scrolling area every style uses for apps and search results. */
    _makeAppArea(styleClass = 'orbit-launcher-apps') {
        this._appBox = new St.BoxLayout({style_class: styleClass, orientation: Clutter.Orientation.VERTICAL,
            x_expand: true});
        this._appScroll = new St.ScrollView({
            child: this._appBox,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            x_expand: true,
            y_expand: true,
        });
        return this._appScroll;
    }

    _userBox(iconSize = 28) {
        const box = new St.BoxLayout({style_class: 'orbit-launcher-userbox'});
        box.add_child(new St.Icon({icon_name: 'avatar-default-symbolic', icon_size: iconSize,
            style_class: 'orbit-launcher-avatar', y_align: Clutter.ActorAlign.CENTER}));
        box.add_child(new St.Label({
            text: GLib.get_real_name() || GLib.get_user_name(),
            style_class: 'orbit-launcher-user',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        return box;
    }

    _footer() {
        const footer = new St.BoxLayout({style_class: 'orbit-launcher-footer'});
        const user = this._userBox();
        user.x_expand = true;
        footer.add_child(user);
        if (this._config.power)
            footer.add_child(this._buildPowerRow());
        return footer;
    }

    _sectionBar(title, toggleLabel) {
        const bar = new St.BoxLayout({style_class: 'orbit-launcher-section'});
        this._sectionLabel = new St.Label({text: title, style_class: 'orbit-launcher-section-title',
            x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        bar.add_child(this._sectionLabel);
        if (toggleLabel) {
            this._toggleButton = new St.Button({style_class: 'orbit-launcher-toggle', can_focus: true,
                label: toggleLabel});
            this._toggleButton.connect('clicked', () => this._selectCategory(
                this._currentCategory === 'all' ? 'favorites' : 'all'));
            bar.add_child(this._toggleButton);
        }
        return bar;
    }

    _iconLabel(iconName, text, size) {
        // St.Button centres its child unless told otherwise.
        const box = new St.BoxLayout({style_class: 'orbit-launcher-iconlabel', x_expand: true,
            x_align: Clutter.ActorAlign.START});
        box.add_child(new St.Icon({icon_name: iconName, icon_size: size}));
        box.add_child(new St.Label({text, y_align: Clutter.ActorAlign.CENTER}));
        return box;
    }

    _buildPowerRow() {
        const actions = SystemActions.getDefault();
        const row = new St.BoxLayout({style_class: 'orbit-launcher-power', x_align: Clutter.ActorAlign.END});
        for (const action of this._availablePowerActions(actions)) {
            const button = new St.Button({
                style_class: 'orbit-launcher-power-button', can_focus: true, accessible_name: action.label,
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

    _availablePowerActions(actions) {
        return POWER_ACTIONS.filter(a =>
            !a.can || actions[a.can.replace(/-([a-z])/g, (_m, l) => l.toUpperCase())] !== false);
    }

    // ---- styles ---------------------------------------------------------------

    _buildModern(content) {
        const header = new St.BoxLayout({style_class: 'orbit-launcher-header'});
        header.add_child(this._makeSearch());
        content.add_child(header);
        content.add_child(this._sectionBar('Pinned', 'All apps  ›'));
        const body = new St.BoxLayout({style_class: 'orbit-launcher-body', y_expand: true});
        body.add_child(this._makeAppArea());
        content.add_child(body);
        content.add_child(this._footer());
    }

    _buildList(content) {
        const header = new St.BoxLayout({style_class: 'orbit-launcher-header'});
        header.add_child(this._makeSearch());
        content.add_child(header);
        content.add_child(this._makeAppArea('orbit-launcher-apps orbit-launcher-listview'));
        content.add_child(this._footer());
    }

    _buildMinimal(content) {
        content.add_child(this._makeSearch('Type to search…', 'orbit-launcher-search orbit-launcher-minimal-search'));
        content.add_child(this._sectionBar('Pinned', null));
        content.add_child(this._makeAppArea());
    }

    _buildClassic(content) {
        const header = new St.BoxLayout({style_class: 'orbit-launcher-header'});
        header.add_child(this._userBox());
        header.add_child(this._makeSearch());
        content.add_child(header);

        const body = new St.BoxLayout({style_class: 'orbit-launcher-body', y_expand: true});
        this._catBox = new St.BoxLayout({style_class: 'orbit-launcher-categories',
            orientation: Clutter.Orientation.VERTICAL});
        body.add_child(new St.ScrollView({
            child: this._catBox, hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC, overlay_scrollbars: true,
        }));
        body.add_child(this._makeAppArea());
        content.add_child(body);

        for (const cat of CATEGORIES) {
            if (!this._categoryApps(cat.id).length)
                continue;
            const button = new St.Button({style_class: 'orbit-launcher-category', can_focus: true,
                x_expand: true, child: this._iconLabel(cat.icon, cat.name, 16)});
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
        if (this._config.power)
            content.add_child(this._buildPowerRow());
    }

    _buildXp(content) {
        // Header: user + search
        const header = new St.BoxLayout({style_class: 'orbit-launcher-header orbit-xp-header'});
        header.add_child(this._userBox(32));
        header.add_child(this._makeSearch('Search apps…'));
        content.add_child(header);

        const body = new St.BoxLayout({style_class: 'orbit-xp-body', y_expand: true});

        // Left: programs
        const left = new St.BoxLayout({style_class: 'orbit-xp-left', orientation: Clutter.Orientation.VERTICAL,
            x_expand: true});
        left.add_child(this._makeAppArea('orbit-launcher-apps orbit-xp-programs'));
        body.add_child(left);

        // Right: places, settings and Run…
        const right = new St.BoxLayout({style_class: 'orbit-xp-right', orientation: Clutter.Orientation.VERTICAL});
        for (const [label, icon, path] of places())
            right.add_child(this._xpPlace(label, icon, () => Gio.AppInfo.launch_default_for_uri(
                Gio.File.new_for_path(path).get_uri(), global.create_app_launch_context(0, -1))));
        right.add_child(new St.Widget({style_class: 'orbit-xp-separator'}));
        const appSys = Shell.AppSystem.get_default();
        for (const [id, label, icon] of [['org.gnome.Settings.desktop', 'Settings', 'emblem-system-symbolic'],
            ['org.gnome.Software.desktop', 'Software', 'system-software-install-symbolic'],
            ['org.gnome.SystemMonitor.desktop', 'System Monitor', 'utilities-system-monitor-symbolic']]) {
            const app = appSys.lookup_app(id);
            if (app)
                right.add_child(this._xpPlace(label, icon, () => app.activate()));
        }
        right.add_child(this._xpPlace('Run…', 'system-run-symbolic', () => Main.openRunDialog()));
        body.add_child(right);
        content.add_child(body);

        // Footer: Log Out · Power Off
        const footer = new St.BoxLayout({style_class: 'orbit-xp-footer', x_align: Clutter.ActorAlign.FILL});
        footer.add_child(new St.Widget({x_expand: true}));
        if (this._config.power) {
            const actions = SystemActions.getDefault();
            const available = new Set(this._availablePowerActions(actions).map(a => a.label));
            for (const [label, icon, run, needs] of [
                ['Log Out', 'system-log-out-symbolic', () => actions.activateLogout(), 'Log Out'],
                ['Power Off…', 'system-shutdown-symbolic', () => actions.activatePowerOff(), 'Power Off']]) {
                if (!available.has(needs))
                    continue;
                const button = new St.Button({style_class: 'orbit-xp-footer-button', can_focus: true,
                    child: this._iconLabel(icon, label, 16)});
                button.connect('clicked', () => {
                    this.close();
                    run();
                });
                footer.add_child(button);
            }
        }
        content.add_child(footer);
    }

    _xpPlace(label, icon, activate) {
        const button = new St.Button({style_class: 'orbit-xp-place', can_focus: true, x_expand: true,
            child: this._iconLabel(icon, label, 16)});
        button.connect('clicked', () => {
            this.close();
            activate();
        });
        return button;
    }

    // ---- positioning --------------------------------------------------------

    _positionMenu(source, monitor, width, height, scale) {
        const gap = 8 * scale;
        let x, y;
        if (source?.get_stage()) {
            const [sx, sy] = source.get_transformed_position();
            const [sw, sh] = source.get_transformed_size();
            // Open away from the closest screen edge (works for any dock side).
            const cx = sx + sw / 2 - monitor.x;
            const cy = sy + sh / 2 - monitor.y;
            const distances = {bottom: monitor.height - cy, top: cy, left: cx, right: monitor.width - cx};
            const edge = Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0];
            switch (edge) {
            case 'bottom': x = sx + sw / 2 - width / 2; y = sy - height - gap; break;
            case 'top': x = sx + sw / 2 - width / 2; y = sy + sh + gap; break;
            case 'left': x = sx + sw + gap; y = sy + sh / 2 - height / 2; break;
            default: x = sx - width - gap; y = sy + sh / 2 - height / 2;
            }
        } else if (this._config.style === 'minimal') {
            // Spotlight-like: centred in the upper part of the screen.
            x = monitor.x + (monitor.width - width) / 2;
            y = monitor.y + monitor.height * 0.18;
        } else {
            const panel = Main.layoutManager.panelBox;
            x = monitor.x + gap;
            const panelAtBottom = panel.visible && panel.y > monitor.y + monitor.height / 2;
            if (panelAtBottom) {
                y = panel.y - height - gap; // above a bottom (taskbar) bar
                if (this._settings.get_boolean('dock-in-panel') &&
                    this._settings.get_string('taskbar-alignment') === 'center')
                    x = monitor.x + (monitor.width - width) / 2; // Windows 11: centred
            } else {
                y = (panel.visible ? panel.y + panel.height : monitor.y) + gap;
            }
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
        const all = this._apps.map(a => a.app);
        switch (this._config.style) {
        case 'modern': {
            const pinned = id === 'favorites';
            this._sectionLabel.text = pinned ? 'Pinned' : 'All apps';
            this._toggleButton.label = pinned ? 'All apps  ›' : '‹  Back';
            if (pinned)
                this._showGrid(this._favorites, GRID_COLUMNS, true);
            else
                this._showApps(all);
            return;
        }
        case 'list':
            this._showSectionedList();
            return;
        case 'minimal':
            this._sectionLabel.text = 'Pinned';
            this._showGrid(this._favorites, MINIMAL_COLUMNS, false);
            return;
        case 'xp':
            if (id === 'favorites')
                this._showXpPrograms(false);
            else if (id === 'all' && this._config.xpCategories)
                this._showXpCategories();
            else if (id === 'all')
                this._showXpPrograms(true);
            else
                this._showXpCategory(id);
            return;
        }
        // classic
        for (const [catId, button] of this._catButtons) {
            if (catId === id)
                button.add_style_pseudo_class('checked');
            else
                button.remove_style_pseudo_class('checked');
        }
        this._showApps(this._categoryApps(id).map(a => a.app));
    }

    _clearApps() {
        this._appBox.destroy_all_children();
        this._appScroll.vadjustment.value = 0;
    }

    _empty(text) {
        this._appBox.add_child(new St.Label({text, style_class: 'orbit-launcher-empty',
            x_align: Clutter.ActorAlign.CENTER}));
    }

    _showApps(apps, rowOptions = {}) {
        this._clearApps();
        for (const app of apps)
            this._appBox.add_child(this._appRow(app, rowOptions));
        if (!apps.length)
            this._empty('No applications found');
    }

    _showGrid(apps, columns, labels) {
        this._clearApps();
        let row = null;
        apps.forEach((app, i) => {
            if (i % columns === 0) {
                row = new St.BoxLayout({style_class: 'orbit-launcher-grid-row'});
                this._appBox.add_child(row);
            }
            row.add_child(this._appTile(app, labels));
        });
        if (!apps.length)
            this._empty('Nothing pinned yet: right-click an app and choose Pin to Dash');
    }

    /** List view: pinned apps first, then every app under its first letter. */
    _showSectionedList() {
        this._clearApps();
        const heading = text => this._appBox.add_child(new St.Label({text,
            style_class: 'orbit-launcher-letter'}));
        if (this._favorites.length) {
            heading('Pinned');
            for (const app of this._favorites)
                this._appBox.add_child(this._appRow(app));
        }
        let letter = null;
        for (const {app} of this._apps) {
            const first = app.get_name().charAt(0).toUpperCase();
            const l = /[A-Z]/.test(first) ? first : '#';
            if (l !== letter) {
                letter = l;
                heading(l);
            }
            this._appBox.add_child(this._appRow(app, {descriptions: false}));
        }
    }

    _showXpPrograms(showAll) {
        this._clearApps();
        const apps = showAll ? this._apps.map(a => a.app) : this._favorites;
        for (const app of apps)
            this._appBox.add_child(this._appRow(app, {iconSize: showAll ? 24 : 32, descriptions: false, bold: !showAll}));
        if (!apps.length && !showAll)
            this._empty('Pin apps to see them here');
        this._appBox.add_child(new St.Widget({style_class: 'orbit-xp-separator'}));
        const button = new St.Button({style_class: 'orbit-xp-allprograms', can_focus: true,
            child: new St.Label({text: showAll ? '‹  Back' : 'All Apps  ›'})});
        button.connect('clicked', () => this._selectCategory(showAll ? 'favorites' : 'all'));
        this._appBox.add_child(button);
    }

    /** "All Apps" grouped into category folders (two-column style). */
    _showXpCategories() {
        this._clearApps();
        for (const cat of CATEGORIES) {
            if (cat.id === 'favorites' || cat.id === 'all')
                continue;
            const count = this._categoryApps(cat.id).length;
            if (!count)
                continue;
            const box = new St.BoxLayout({style_class: 'orbit-launcher-iconlabel', x_expand: true});
            box.add_child(new St.Icon({icon_name: cat.icon, icon_size: 20}));
            box.add_child(new St.Label({text: cat.name, x_expand: true, y_align: Clutter.ActorAlign.CENTER}));
            box.add_child(new St.Label({text: `${count}`, style_class: 'orbit-xp-count',
                y_align: Clutter.ActorAlign.CENTER}));
            box.add_child(new St.Label({text: '›', style_class: 'orbit-xp-arrow',
                y_align: Clutter.ActorAlign.CENTER}));
            const button = new St.Button({style_class: 'orbit-xp-category', can_focus: true, x_expand: true,
                child: box});
            button.connect('clicked', () => this._selectCategory(cat.id));
            button.connect('key-focus-in', () => this._scrollTo(button));
            this._appBox.add_child(button);
        }
        this._xpBackButton('‹  Back', 'favorites');
    }

    _showXpCategory(id) {
        this._clearApps();
        const cat = CATEGORIES.find(c => c.id === id);
        if (cat) {
            // The title doubles as a back button, so long categories need no scrolling to leave.
            const title = new St.BoxLayout({style_class: 'orbit-xp-category-title', x_expand: true,
                x_align: Clutter.ActorAlign.START});
            title.add_child(new St.Label({text: '‹', style_class: 'orbit-xp-arrow',
                y_align: Clutter.ActorAlign.CENTER}));
            title.add_child(new St.Icon({icon_name: cat.icon, icon_size: 16}));
            title.add_child(new St.Label({text: cat.name, y_align: Clutter.ActorAlign.CENTER}));
            const back = new St.Button({style_class: 'orbit-xp-category-back', can_focus: true,
                x_expand: true, child: title, accessible_name: 'Back to All Apps'});
            back.connect('clicked', () => this._selectCategory('all'));
            this._appBox.add_child(back);
        }
        for (const {app} of this._categoryApps(id))
            this._appBox.add_child(this._appRow(app, {iconSize: 24, descriptions: false}));
        this._xpBackButton('‹  All Apps', 'all');
    }

    _xpBackButton(label, target) {
        this._appBox.add_child(new St.Widget({style_class: 'orbit-xp-separator'}));
        const button = new St.Button({style_class: 'orbit-xp-allprograms', can_focus: true,
            child: new St.Label({text: label})});
        button.connect('clicked', () => this._selectCategory(target));
        this._appBox.add_child(button);
    }

    _appRow(app, {iconSize = null, descriptions = null, bold = false} = {}) {
        const c = this._config;
        const box = new St.BoxLayout({style_class: 'orbit-launcher-app-box', x_expand: true,
            x_align: Clutter.ActorAlign.START});
        box.add_child(app.create_icon_texture(iconSize ?? c.iconSize));
        const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER, x_expand: true});
        text.add_child(new St.Label({text: app.get_name(),
            style_class: bold ? 'orbit-launcher-app-name orbit-bold' : 'orbit-launcher-app-name'}));
        const desc = (descriptions ?? c.descriptions) ? app.get_description() : null;
        if (desc) {
            const label = new St.Label({text: desc, style_class: 'orbit-launcher-app-desc'});
            label.clutter_text.ellipsize = ELLIPSIZE_END;
            text.add_child(label);
        }
        box.add_child(text);

        const button = new St.Button({style_class: 'orbit-launcher-app', can_focus: true, x_expand: true,
            child: box});
        button._orbitApp = app;
        button.connect('clicked', () => this._launch(app));
        button.connect('key-focus-in', () => this._scrollTo(button));
        return button;
    }

    _appTile(app, withLabel = true) {
        const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'orbit-launcher-tile-box', x_align: Clutter.ActorAlign.CENTER});
        const icon = app.create_icon_texture(withLabel ? 40 : 36);
        icon.x_align = Clutter.ActorAlign.CENTER;
        box.add_child(icon);
        if (withLabel) {
            const label = new St.Label({text: app.get_name(), style_class: 'orbit-launcher-tile-name',
                x_align: Clutter.ActorAlign.CENTER});
            label.clutter_text.ellipsize = ELLIPSIZE_END;
            box.add_child(label);
        }
        const button = new St.Button({style_class: withLabel ? 'orbit-launcher-tile' : 'orbit-launcher-tile orbit-icon-only',
            can_focus: true, child: box, accessible_name: app.get_name()});
        button._orbitApp = app;
        button.connect('clicked', () => this._launch(app));
        return button;
    }

    _scrollTo(actor) {
        const adj = this._appScroll.vadjustment;
        const [, y] = actor.get_parent() === this._appBox ? [0, actor.y] : [0, actor.get_parent().y];
        if (y < adj.value)
            adj.value = y;
        else if (y + actor.height > adj.value + adj.page_size)
            adj.value = y + actor.height - adj.page_size;
    }

    /** First launchable item anywhere in the app area (rows, tiles, lists). */
    _firstItem() {
        const find = actor => {
            for (let c = actor.get_first_child(); c; c = c.get_next_sibling()) {
                if (c._orbitApp)
                    return c;
                const inner = find(c);
                if (inner)
                    return inner;
            }
            return null;
        };
        return find(this._appBox);
    }

    _onSearchChanged() {
        const query = this._search.get_text().trim().toLowerCase();
        if (!query) {
            this._selectCategory(this._currentCategory ?? 'all');
            return;
        }
        if (this._sectionLabel)
            this._sectionLabel.text = 'Results';
        if (this._toggleButton)
            this._toggleButton.label = '‹  Back';
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
        const limit = this._config.style === 'minimal' ? 8 : MAX_SEARCH_RESULTS;
        this._showApps(scored.slice(0, limit).map(s => s[1]),
            this._config.style === 'xp' ? {iconSize: 24, descriptions: false} : {});
    }

    _launchFirst() {
        const first = this._firstItem();
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
