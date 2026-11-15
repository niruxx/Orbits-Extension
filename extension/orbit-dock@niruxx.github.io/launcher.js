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
import Meta from 'gi://Meta';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import {directionalItem} from './launcherNavigation.js';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';

import {GlassLayer} from './glass.js';
import {surfaceEffects} from './effectSettings.js';
import {canSignOut, signOut} from './sessionActions.js';

import {LAUNCHER_CATEGORIES as CATEGORIES, categoryOrder, parseShortcuts, jsonObject, updateInstalled} from './launcherModel.js';
import {LauncherSearch} from './launcherSearch.js';

const POWER_ACTIONS = [
    {label: 'Lock', icon: 'system-lock-screen-symbolic', run: a => a.activateLockScreen(), can: 'can-lock-screen'},
    {label: 'Sign Out', icon: 'system-log-out-symbolic', run: () => signOut()},
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
    arc: {width: 750, height: 615},
    xp: {width: 580, height: 580},
    grid: {width: 1100, height: 800},
    runner: {width: 620, height: 420},
    sidebar: {width: 580, height: 1000},
};
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
        this._appSystem = Shell.AppSystem.get_default();
        this._searchService = new LauncherSearch(settings);
        Main.layoutManager.connectObject('monitors-changed', () => this.close(), this);
        this._trackInstalled();
        try {
            this._recentMonitor = Gio.File.new_for_path(GLib.get_user_data_dir()).monitor_directory(Gio.FileMonitorFlags.NONE, null);
            this._recentMonitor.connect('changed', (_monitor, file) => { if (file?.get_basename() === 'recently-used.xbel') this._reloadContent(); });
        } catch { /* Recent-file history is optional. */ }
        this._appSystem.connectObject('installed-changed', () => { this._trackInstalled(); this._searchService.invalidate(); }, this);
        this._searchService.privacy.connectObject('changed', () => this._reloadContent(), this);
        this._searchService.searchSettings.connectObject('changed', () => this._reloadContent(), this);
        this._appSystem.connectObject('installed-changed', () => this._reloadContent(), this);
        AppFavorites.getAppFavorites().connectObject('changed', () => this._reloadContent(), this);
        settings.connectObject('changed', (_s, key) => {
            if (key === 'launcher-style' || key === 'launcher-arc-bottom-bar') this._syncArcBar();
            if (key.startsWith('launcher-') && !['launcher-install-history', 'launcher-saved-themes'].includes(key)) this._reloadContent();
        }, this);
        Main.wm.addKeybinding('launcher-shortcut', settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            OVERLAY_MODES, () => this.toggle());
        this._syncArcBar();
    }

    _syncArcBar() {
        if (this._settings.get_string('launcher-style') !== 'arc' || !this._settings.get_boolean('launcher-arc-bottom-bar')) return;
        this._settings.set_boolean('dock-in-panel', true);
        this._settings.set_string('taskbar-position', 'bottom');
        this._settings.set_string('top-bar-position', 'bottom');
        if (this._settings.get_string('top-bar-style') === 'default') {
            this._settings.set_string('top-bar-style', 'translucent');
            this._settings.set_double('top-bar-transparent-opacity', 0.55);
        }
    }

    _reloadContent() {
        if (!this._root || this._reloading || this._appsReloadId) return;
        this._appsReloadId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._appsReloadId = 0;
            if (this._root) this._refreshAppsContent();
            return GLib.SOURCE_REMOVE;
        });
    }

    _refreshAppsContent() {
        this._reloading = true;
        const id = this._activeItem?._orbitApp?.get_id();
        const keyboard = this._inputMode === 'keyboard' && !this._search.contains(global.stage.get_key_focus());
        this._loadApps(); this._rebuildCategories(); this._onSearchChanged(); this._wireNavigation();
        if (keyboard && id) {
            const button = this._navigationButtons().find(item => item._orbitApp?.get_id() === id);
            if (button) this._focusItem(button);
        }
        this._reloading = false;
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
        this._previousFocus = global.stage.get_key_focus();
        if (this._previousFocus) this._previousFocusSignal = this._previousFocus.connect('destroy', () => { this._previousFocus = null; this._previousFocusSignal = 0; });
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
            glass: surfaceEffects(this._settings, 'launcher').enabled,
            blur: surfaceEffects(this._settings, 'launcher').blur,
            brightness: surfaceEffects(this._settings, 'launcher').brightness,
            highlight: this._settings.get_boolean('glass-highlight'),
            gridIconSize: this._settings.get_int('launcher-grid-icon-size'),
            spacing: this._settings.get_int('launcher-spacing'),
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
        const view = this._settings.get_string('launcher-default-view');
        this._selectCategory(view === 'favorites' && !this._favorites.length ? 'all' : view);

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
        this._searchService.cancel();
        this._recentCancel?.cancel();
        this._closeContext();
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        Main.wm.allowKeybinding('overlay-key', OVERLAY_MODES);
        Main.overview.disconnectObject(this);
        if (this._appsReloadId) { GLib.source_remove(this._appsReloadId); this._appsReloadId = 0; }
        this._activeItem = null;
        const root = this._root;
        this._root = null;
        this._glass = null; // destroyed with the root
        root.destroy();
        const previousFocus = this._previousFocus;
        if (previousFocus && this._previousFocusSignal) previousFocus.disconnect(this._previousFocusSignal);
        this._previousFocus = null; this._previousFocusSignal = 0;
        if (previousFocus?.get_stage()) previousFocus.grab_key_focus();
        this._taskbarChanged?.();
    }

    destroy() {
        this.close();
        Main.wm.removeKeybinding('launcher-shortcut');
        this._searchService.privacy.disconnectObject(this);
        this._searchService.searchSettings.disconnectObject(this);
        this._searchService.destroy();
        Main.layoutManager.disconnectObject(this);
        this._recentMonitor?.cancel();
        this._settings.disconnectObject(this);
        this._appSystem.disconnectObject(this);
        AppFavorites.getAppFavorites().disconnectObject(this);
    }

    // ---- data -------------------------------------------------------------

    _trackInstalled() {
        const ids = this._appSystem.get_installed().filter(info => info.should_show()).map(info => info.get_id());
        const history = updateInstalled(jsonObject(this._settings.get_string('launcher-install-history')), ids,
            GLib.get_real_time() / 1000000, this._settings.get_int('launcher-new-days'));
        this._settings.set_string('launcher-install-history', JSON.stringify(history));
    }

    _categories() {
        return categoryOrder(this._settings.get_strv('launcher-category-order'), this._settings.get_strv('launcher-hidden-categories'),
            jsonObject(this._settings.get_string('launcher-category-names')));
    }

    _customApps() {
        return parseShortcuts(this._settings.get_string('launcher-shortcuts')).map(item => ({
            _orbitCustom: item, get_id: () => item.id, get_name: () => item.label, get_description: () => item.target,
            get_app_info: () => null, can_open_new_window: () => false,
            create_icon_texture: size => new St.Icon({icon_name: item.icon || 'emblem-favorite-symbolic', icon_size: size}),
            activate: () => {
                if (item.type === 'app') this._appSystem.lookup_app(item.target)?.activate();
                else if (item.type === 'command') {
                    const [ok, argv] = GLib.shell_parse_argv(item.target);
                    if (ok && argv.length) Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
                } else Gio.AppInfo.launch_default_for_uri(item.target.startsWith('/') ? Gio.File.new_for_path(item.target).get_uri() : item.target,
                    global.create_app_launch_context(0, -1));
            },
        }));
    }

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
        const native = AppFavorites.getAppFavorites().getFavorites();
        if (this._settings.get_boolean('launcher-independent-pins')) {
            if (!this._settings.get_boolean('launcher-pins-initialized')) {
                this._settings.set_strv('launcher-pinned-apps', native.map(app => app.get_id()));
                this._settings.set_boolean('launcher-pins-initialized', true);
            }
            this._favorites = this._settings.get_strv('launcher-pinned-apps').map(id => appSys.lookup_app(id)).filter(Boolean);
        } else this._favorites = native;
        this._favorites = [...this._favorites, ...this._customApps()];
    }

    // ---- shell of the menu --------------------------------------------------

    _build(source) {
        const monitor = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
        this._monitorIndex = monitor.index;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const c = this._config;
        this._glass = null;
        this._catButtons = new Map();
        this._inputMode = 'keyboard';
        this._lastPointer = global.get_pointer().slice(0, 2);
        this._activeItem = null;
        this._catBox = null; this._catScroll = null; this._viewBox = null; this._viewScroll = null;
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
        this._root.connect('captured-event', (_a, event) => {
            if (event.type() === Clutter.EventType.MOTION) {
                const [x, y] = event.get_coords();
                if (Math.hypot(x - this._lastPointer[0], y - this._lastPointer[1]) > 1) this._inputMode = 'pointer';
                this._lastPointer = [x, y];
            }
            if (event.type() !== Clutter.EventType.KEY_PRESS) return Clutter.EVENT_PROPAGATE;
            this._inputMode = 'keyboard';
            if (this._hoverId) { GLib.source_remove(this._hoverId); this._hoverId = 0; }
            if ([Clutter.KEY_Left, Clutter.KEY_Right, Clutter.KEY_Up, Clutter.KEY_Down, Clutter.KEY_Tab, Clutter.KEY_ISO_Left_Tab].includes(event.get_key_symbol()))
                return this._onKeyPress(event);
            return Clutter.EVENT_PROPAGATE;
        });
        Main.layoutManager.addTopChrome(this._root);

        const {width: w, height: h} = STYLES[c.style];
        const width = Math.min(Math.max(320, this._settings.get_int('launcher-width') || w) * scale, monitor.width - 16 * scale);
        const height = Math.min(Math.max(280, this._settings.get_int('launcher-height') || (c.style === 'sidebar' ? monitor.height / scale - 80 : h)) * scale, monitor.height - 80 * scale);
        this._categoryWidth = width / scale < 600 ? Math.max(100, width / scale * 0.28) : 212;
        this._tileWidth = Math.max(c.style === 'arc' ? 108 : 88, c.gridIconSize + 16);
        this._gridColumns = Math.max(1, Math.min(this._settings.get_int('launcher-columns'), Math.floor((width / scale - this._categoryWidth - 40) / (this._tileWidth + 2 * this._settings.get_int('launcher-item-padding') + c.spacing))));
        this._modernColumns = Math.max(1, Math.min(this._settings.get_int('launcher-modern-columns'), Math.floor((width / scale - 44) / (this._tileWidth + 2 * this._settings.get_int('launcher-item-padding') + c.spacing))));
        this._menuWidth = width / scale;
        this._menu = new St.Widget({name: 'orbitLauncher', layout_manager: new Clutter.BinLayout(), width, height});

        // Every style is a tinted panel that can sit on frosted glass.
        if (c.glass) {
            this._glass = new GlassLayer({
                monitorIndex: monitor.index, radius: this._settings.get_int('launcher-radius'),
                blur: c.blur, brightness: c.brightness, backdrop: surfaceEffects(this._settings, 'launcher').backdrop,
            });
            this._menu.add_child(this._glass.actor);
        }

        const content = new St.BoxLayout({
            style_class: `orbit-launcher orbit-launcher-${c.style}`,
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
        });
        const border = `border: ${this._settings.get_int('launcher-border-width')}px solid ${this._settings.get_string('launcher-border-color')}; border-radius: ${this._settings.get_int('launcher-radius')}px;`;
        const hex = this._settings.get_string('launcher-background-color');
        const rgb = /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) : [30, 30, 34];
        content.set_style(`background-color: rgba(${rgb.join(',')}, ${c.opacity}); font-size: ${this._settings.get_int('launcher-font-size')}px; color: ${this._settings.get_string('launcher-text-color')}; spacing: ${this._settings.get_int('launcher-spacing')}px; ${border}`);
        this._menu.add_child(content);
        this._content = content;

        ({
            modern: () => this._buildModern(content),
            list: () => this._buildList(content),
            minimal: () => this._buildMinimal(content),
            classic: () => this._buildClassic(content),
            arc: () => this._buildClassic(content),
            xp: () => this._buildXp(content),
            grid: () => this._buildDashboard(content),
            runner: () => this._buildRunner(content),
            sidebar: () => this._buildClassic(content),
        })[c.style]();

        if (['minimal', 'runner'].includes(c.style) && c.power) content.add_child(this._buildPowerRow());
        if (!['arc', 'classic', 'sidebar', 'grid'].includes(c.style)) content.insert_child_at_index(this._buildViewChooser(), 1);
        if (c.style !== 'xp' && this._settings.get_boolean('launcher-show-places')) content.add_child(this._buildPlaces());
        this._root.add_child(this._menu);
        this._positionMenu(source ?? this._taskbarSource?.(monitor.index), monitor, width, height, scale);
        this._glass?.sync();
        this._taskbarChanged?.();
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
        this._search.clutter_text.connect('key-focus-in', () => {
            if (this._activeItem && this._activeItem !== this._search) {
                this._activeItem.remove_style_pseudo_class('selected');
                this._activeItem.set_style(this._activeItem._orbitBaseStyle ?? '');
                this._activeItem = null;
            }
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
            x_expand: true, style: `spacing: ${this._config.spacing}px;`});
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
        const label = new St.Label({text, y_align: Clutter.ActorAlign.CENTER, x_expand: true});
        label.clutter_text.ellipsize = ELLIPSIZE_END; box.add_child(label);
        return box;
    }

    _buildPowerRow() {
        const actions = SystemActions.getDefault();
        const row = new St.BoxLayout({style_class: 'orbit-launcher-power',
            x_align: ['arc', 'classic'].includes(this._config.style) ? Clutter.ActorAlign.FILL : Clutter.ActorAlign.END});
        const available = this._availablePowerActions(actions);
        if (!available.some(action => action.label === 'Sign Out')) available.push(POWER_ACTIONS.find(action => action.label === 'Sign Out'));
        for (const action of available) {
            const button = new St.Button({
                style_class: 'orbit-launcher-power-button', can_focus: action.label !== 'Sign Out' || canSignOut(),
                reactive: action.label !== 'Sign Out' || canSignOut(), accessible_name: action.label,
                child: new St.Icon({icon_name: action.icon, icon_size: 16}),
            });
            if (action.label === 'Sign Out') {
                const label = new St.BoxLayout({style: 'spacing: 6px;'});
                label.add_child(new St.Icon({icon_name: action.icon, icon_size: 16}));
                label.add_child(new St.Label({text: 'Sign Out', y_align: Clutter.ActorAlign.CENTER}));
                button.set_child(label);
            }
            button.connect('clicked', () => {
                this.close();
                if (action.label !== 'Sign Out' || canSignOut()) action.run(actions);
            });
            button.connect('notify::hover', () => {
                this._powerLabel.text = button.hover ? action.label : '';
            });
            row.add_child(button);
        }
        if (this._config.style === 'arc' || this._config.style === 'classic')
            row.set_style(`background-color: rgba(0,0,0,${this._settings.get_double('launcher-footer-opacity')}); border-radius: 8px;`);
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
        this._catBox.set_style(`width: ${this._categoryWidth}px;`);
        this._catScroll = new St.ScrollView({
            child: this._catBox, hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC, overlay_scrollbars: true,
        });
        body.add_child(this._catScroll);
        body.add_child(this._makeAppArea());
        content.add_child(body);

        this._rebuildCategories();
        if (this._config.power)
            content.add_child(this._buildPowerRow());
    }

    _rebuildCategories() {
        if (!this._catBox) return;
        if (this._hoverId) { GLib.source_remove(this._hoverId); this._hoverId = 0; }
        if (global.stage.get_key_focus() && this._catBox.contains(global.stage.get_key_focus())) this._search.grab_key_focus();
        this._catButtons.clear(); this._catBox.destroy_all_children();
        for (const cat of this._categories()) {
            if (!this._settings.get_boolean('launcher-show-empty-categories') && !['favorites', 'all', 'recent', 'shortcuts'].includes(cat.id) && !this._categoryApps(cat.id).length)
                continue;
            const button = new St.Button({style_class: 'orbit-launcher-category', can_focus: true, accessible_name: cat.name,
                x_expand: true, child: this._iconLabel(cat.id === 'favorites' && this._config.style === 'arc'
                    ? 'view-pin-symbolic' : cat.icon,
                cat.name, 16)});
            button._orbitCategory = cat.id;
            button.connect('clicked', () => this._selectCategory(cat.id));
            button.connect('notify::hover', () => {
                // Kicker-style: hovering a category switches to it after a beat.
                if (this._hoverId)
                    GLib.source_remove(this._hoverId);
                this._hoverId = 0;
                if (button.hover && this._inputMode === 'pointer' && !this._search.get_text()) {
                    this._hoverId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._settings.get_int('launcher-hover-delay'), () => {
                        this._hoverId = 0;
                        if (button.hover && this._inputMode === 'pointer' && this._currentCategory !== cat.id)
                            this._selectCategory(cat.id);
                        return GLib.SOURCE_REMOVE;
                    });
                }
            });
            this._catButtons.set(cat.id, button);
            this._catBox.add_child(button);
        }
    }

    _buildViewChooser() {
        const box = new St.BoxLayout({style_class: 'orbit-launcher-grid-row'});
        this._viewScroll = new St.ScrollView({child: box, hscrollbar_policy: St.PolicyType.AUTOMATIC, vscrollbar_policy: St.PolicyType.NEVER});
        this._viewBox = box;
        for (const cat of this._categories()) {
            if (!['favorites', 'all', 'frequent', 'new', 'recent', 'shortcuts'].includes(cat.id)) continue;
            const button = new St.Button({label: cat.name, can_focus: true, style_class: 'orbit-launcher-category'});
            button.connect('clicked', () => this._selectCategory(cat.id)); this._catButtons.set(cat.id, button); box.add_child(button);
        }
        return this._viewScroll;
    }

    _buildRunner(content) {
        content.add_child(this._makeSearch('Search apps, files and providers…'));
        content.add_child(this._sectionBar('Search', null));
        content.add_child(this._makeAppArea());
    }

    _buildDashboard(content) {
        const header = new St.BoxLayout({style_class: 'orbit-launcher-header'});
        header.add_child(this._makeSearch()); content.add_child(header);
        content.add_child(this._buildViewChooser()); content.add_child(this._makeAppArea()); content.add_child(this._footer());
    }

    _placeEntries() {
        const dirs = Object.fromEntries(places().map(([label, icon, path]) => [label.split(' ')[0].toLowerCase(), {label, icon, run: () =>
            Gio.AppInfo.launch_default_for_uri(Gio.File.new_for_path(path).get_uri(), global.create_app_launch_context(0, -1))}]));
        for (const [id, appId, label, icon] of [['settings', 'org.gnome.Settings.desktop', 'Settings', 'emblem-system-symbolic'],
            ['software', 'org.gnome.Software.desktop', 'Software', 'system-software-install-symbolic'],
            ['monitor', 'org.gnome.SystemMonitor.desktop', 'System Monitor', 'utilities-system-monitor-symbolic']]) {
            const app = this._appSystem.lookup_app(appId);
            if (app) dirs[id] = {label, icon, run: () => app.activate()};
        }
        dirs.run = {label: 'Run…', icon: 'system-run-symbolic', run: () => Main.openRunDialog()};
        return this._settings.get_strv('launcher-places').map(id => dirs[id]).filter(Boolean);
    }

    _buildPlaces() {
        const box = new St.BoxLayout({style_class: 'orbit-launcher-grid-row'});
        for (const item of this._placeEntries()) {
            const button = new St.Button({can_focus: true, style_class: 'orbit-launcher-power-button', accessible_name: item.label,
                child: new St.Icon({icon_name: item.icon, icon_size: 20})});
            button.connect('clicked', () => { this.close(); this._runAction(item.run); }); box.add_child(button);
        }
        return new St.ScrollView({child: box, hscrollbar_policy: St.PolicyType.AUTOMATIC, vscrollbar_policy: St.PolicyType.NEVER});
    }

    _runAction(run) {
        try { run(); } catch (error) { Main.notify('Unable to open launcher item', error.message); }
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
        if (this._settings.get_boolean('launcher-show-places')) for (const item of this._placeEntries())
            right.add_child(this._xpPlace(item.label, item.icon, () => this._runAction(item.run)));
        body.add_child(right);
        content.add_child(body);

        // Footer: Sign Out · Power Off
        const footer = new St.BoxLayout({style_class: 'orbit-xp-footer', x_align: Clutter.ActorAlign.FILL});
        footer.add_child(new St.Widget({x_expand: true}));
        if (this._config.power) {
            const actions = SystemActions.getDefault();
            const available = new Set(this._availablePowerActions(actions).map(a => a.label));
            for (const [label, icon, run, needs] of [
                ['Sign Out', 'system-log-out-symbolic', () => signOut(), 'Sign Out'],
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
            const edge = source._orbitEdge ?? Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0];
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
        let placement = this._settings.get_string('launcher-placement');
        if (placement === 'automatic' && this._config.style === 'runner') placement = 'top-center';
        if (placement === 'automatic' && this._config.style === 'sidebar') placement = 'top-left';
        if (placement !== 'automatic') {
            x = monitor.x + (placement.endsWith('left') ? gap : placement.endsWith('right') ? monitor.width - width - gap : (monitor.width - width) / 2);
            y = monitor.y + (placement === 'center' ? (monitor.height - height) / 2 : placement.startsWith('bottom') ? monitor.height - height - gap : gap);
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
        if (id === 'shortcuts') return this._customApps().map(app => ({app}));
        if (id === 'new') {
            const added = jsonObject(this._settings.get_string('launcher-install-history')).added ?? {};
            const now = GLib.get_real_time() / 1000000;
            return this._apps.filter(entry => Number.isFinite(added[entry.app.get_id()]) && now - added[entry.app.get_id()] < this._settings.get_int('launcher-new-days') * 86400)
                .sort((a, b) => added[b.app.get_id()] - added[a.app.get_id()]);
        }
        if (id === 'frequent')
            return Shell.AppUsage.get_default().get_most_used().filter(app => this._apps.some(entry => entry.app.get_id() === app.get_id())).map(app => ({app}));
        return this._apps.filter(a => a.cats.includes(id));
    }

    _selectCategory(id) {
        this._renderCategory(id);
        this._wireNavigation();
    }

    _renderCategory(id) {
        this._currentCategory = id;
        this._searchService.cancel(); this._recentCancel?.cancel();
        for (const [catId, button] of this._catButtons) {
            if (catId === id) button.add_style_pseudo_class('checked'); else button.remove_style_pseudo_class('checked');
        }
        if (id === 'recent') { this._showRecent(); return; }
        if (['new', 'shortcuts'].includes(id)) {
            if (this._sectionLabel) this._sectionLabel.text = id === 'new' ? 'Newly Installed' : 'Shortcuts';
            this._showApps(this._categoryApps(id).map(entry => entry.app)); return;
        }
        if (id === 'frequent') {
            if (this._sectionLabel) this._sectionLabel.text = 'Frequently Used';
            for (const [catId, button] of this._catButtons) {
                if (catId === id) button.add_style_pseudo_class('checked');
                else button.remove_style_pseudo_class('checked');
            }
            this._showApps(this._categoryApps(id).map(entry => entry.app));
            return;
        }
        const all = this._apps.map(a => a.app);
        switch (this._config.style) {
        case 'grid':
            if (this._sectionLabel) this._sectionLabel.text = id;
            this._showGrid(id === 'favorites' ? this._favorites : this._categoryApps(id).map(entry => entry.app), this._modernColumns, true); return;
        case 'runner':
            this._showApps(id === 'favorites' ? this._favorites : this._categoryApps(id).map(entry => entry.app)); return;
        case 'modern': {
            const pinned = id === 'favorites';
            if (id === 'frequent') { this._sectionLabel.text = 'Frequently Used'; this._showApps(this._categoryApps(id).map(entry => entry.app)); return; }
            this._sectionLabel.text = pinned ? 'Pinned' : 'All apps';
            this._toggleButton.label = pinned ? 'All apps  ›' : '‹  Back';
            if (pinned)
                this._showGrid(this._favorites, this._modernColumns, true);
            else
                this._showApps(all);
            return;
        }
        case 'list':
            this._showSectionedList();
            return;
        case 'minimal':
            this._sectionLabel.text = id === 'favorites' ? 'Pinned' : 'All Apps';
            this._showGrid(id === 'favorites' ? this._favorites : this._categoryApps(id).map(entry => entry.app), Math.max(1, Math.min(this._settings.get_int('launcher-minimal-columns'), Math.floor((this._menuWidth - 40) / (this._tileWidth + 2 * this._settings.get_int('launcher-item-padding') + this._config.spacing)))), true);
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
        const apps = this._categoryApps(id).map(a => a.app);
        if (this._config.style === 'arc')
            this._showGrid(apps, this._gridColumns, true);
        else
            this._showApps(apps);
    }

    _clearApps() {
        this._closeContext();
        const focus = global.stage.get_key_focus();
        if (focus && this._appBox.contains(focus)) this._search.grab_key_focus();
        if (this._activeItem && this._appBox.contains(this._activeItem)) this._activeItem = null;
        this._appBox.destroy_all_children();
        this._appScroll.vadjustment.value = 0;
    }

    _empty(text) {
        const label = new St.Label({text, style_class: 'orbit-launcher-empty', x_expand: true});
        label.clutter_text.line_wrap = true; label.clutter_text.ellipsize = ELLIPSIZE_END;
        this._appBox.add_child(label);
    }

    _showApps(apps, rowOptions = {}) {
        this._clearApps();
        for (const app of apps)
            this._appBox.add_child(this._appRow(app, rowOptions));
        if (!apps.length)
            this._empty('No applications found');
        this._wireNavigation();
    }

    _showGrid(apps, columns, labels) {
        this._clearApps();
        let row = null;
        apps.forEach((app, i) => {
            if (i % columns === 0) {
                row = new St.BoxLayout({style_class: 'orbit-launcher-grid-row', style: `spacing: ${this._config.spacing}px;`});
                this._appBox.add_child(row);
            }
            row.add_child(this._appTile(app, labels));
        });
        if (!apps.length)
            this._empty('Nothing pinned yet: right-click an app to pin it');
        this._wireNavigation();
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
            this._appBox.add_child(this._appRow(app, {descriptions: false, bold: !showAll}));
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
        for (const cat of this._categories()) {
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
            this._appBox.add_child(this._appRow(app, {descriptions: false}));
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
        const name = new St.Label({text: app.get_name(), style_class: bold ? 'orbit-launcher-app-name orbit-bold' : 'orbit-launcher-app-name'});
        name.clutter_text.ellipsize = ELLIPSIZE_END; text.add_child(name);
        const desc = (descriptions ?? c.descriptions) ? app.get_description() : null;
        if (desc) {
            const label = new St.Label({text: desc, style_class: 'orbit-launcher-app-desc'});
            label.clutter_text.ellipsize = ELLIPSIZE_END;
            text.add_child(label);
        }
        box.add_child(text);

        const button = new St.Button({style_class: 'orbit-launcher-app', can_focus: true, x_expand: true, accessible_name: app.get_name(),
            child: box});
        button._orbitApp = app;
        button.connect('clicked', () => this._launch(app));
        button.connect('key-focus-in', () => this._scrollTo(button));
        return button;
    }

    _appTile(app, withLabel = true) {
        const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'orbit-launcher-tile-box', x_align: Clutter.ActorAlign.CENTER});
        const icon = app.create_icon_texture(this._config.gridIconSize);
        icon.x_align = Clutter.ActorAlign.CENTER;
        box.add_child(icon);
        if (withLabel) {
            const label = new St.Label({text: app.get_name(), style_class: 'orbit-launcher-tile-name',
                x_align: Clutter.ActorAlign.CENTER});
            label.clutter_text.ellipsize = ELLIPSIZE_END;
            if (this._config.style === 'arc') {
                label.clutter_text.line_wrap = true;
                label.clutter_text.line_wrap_mode = 2; // Pango.WrapMode.WORD_CHAR
            }
            box.add_child(label);
        }
        const button = new St.Button({style_class: withLabel ? 'orbit-launcher-tile' : 'orbit-launcher-tile orbit-icon-only',
            can_focus: true, child: box, accessible_name: app.get_name()});
        button.set_style(`width: ${this._tileWidth}px;`);
        button._orbitApp = app;
        button.connect('clicked', () => this._launch(app));
        button.connect('key-focus-in', () => this._scrollTo(button));
        return button;
    }

    _scrollTo(actor) {
        const inApps = this._appBox.contains(actor);
        const inCategories = this._catBox?.contains(actor);
        if (this._viewBox?.contains(actor)) {
            const adj = this._viewScroll.hadjustment;
            const [ax] = actor.get_transformed_position(), [bx] = this._viewBox.get_transformed_position();
            const x = ax - bx;
            const value = x < adj.value ? x : x + actor.width > adj.value + adj.page_size ? x + actor.width - adj.page_size : adj.value;
            adj.value = Math.max(adj.lower, Math.min(Math.max(adj.lower, adj.upper - adj.page_size), value)); return;
        }
        if (!inApps && !inCategories) return;
        const content = inApps ? this._appBox : this._catBox;
        const adj = (inApps ? this._appScroll : this._catScroll).vadjustment;
        const [, ay] = actor.get_transformed_position();
        const [, by] = content.get_transformed_position();
        const y = ay - by;
        let target = adj.value;
        if (y < adj.value) target = y;
        else if (y + actor.height > adj.value + adj.page_size) target = y + actor.height - adj.page_size;
        target = Math.max(adj.lower, Math.min(Math.max(adj.lower, adj.upper - adj.page_size), target));
        adj.remove_transition?.('value');
        if (adj.ease) adj.ease(target, {duration: St.Settings.get().enable_animations ? 120 : 0, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        else adj.value = target;
    }

    /** First launchable item anywhere in the app area (rows, tiles, lists). */
    _firstItem() {
        return this._navigationButtons().find(button => this._appBox.contains(button) && (button._orbitApp || button._orbitResult)) ?? null;
    }

    _onSearchChanged() {
        this._searchService.cancel(); this._recentCancel?.cancel();
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
        if (this._config.style === 'arc') {
            this._showGrid(scored.slice(0, limit).map(s => s[1]), this._gridColumns, true);
            this._searchExtras(query); return;
        }
        this._showApps(scored.slice(0, limit).map(s => s[1]),
            this._config.style === 'xp' ? {descriptions: false} : {});
        this._searchExtras(query);
    }

    _resultButton(result) {
        const box = new St.BoxLayout({style_class: 'orbit-launcher-app-box', x_expand: true});
        box.add_child(result.createIcon?.(this._config.iconSize) ?? new St.Icon({icon_name: result.icon || 'system-search-symbolic', icon_size: this._config.iconSize}));
        const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        const name = new St.Label({text: result.name || 'Result', x_expand: true}); name.clutter_text.ellipsize = ELLIPSIZE_END; text.add_child(name);
        if (result.description && this._settings.get_boolean('launcher-provider-descriptions')) {
            const description = new St.Label({text: result.description, style_class: 'orbit-launcher-app-desc'});
            description.clutter_text.ellipsize = ELLIPSIZE_END; text.add_child(description);
        }
        box.add_child(text);
        const button = new St.Button({child: box, can_focus: true, x_expand: true, style_class: 'orbit-launcher-app', accessible_name: result.name});
        button._orbitResult = result;
        button.connect('clicked', () => { this.close(); this._runAction(result.activate); });
        return button;
    }

    _appendResults(title, results, more = null) {
        if (!results.length) return;
        for (const child of this._appBox.get_children()) if (child.has_style_class_name?.('orbit-launcher-empty')) child.destroy();
        this._appBox.add_child(new St.Label({text: title, style_class: 'orbit-launcher-letter'}));
        for (const result of results) this._appBox.add_child(this._resultButton(result));
        if (more) this._appBox.add_child(this._resultButton({name: `More in ${title}…`, activate: more}));
        this._wireNavigation();
    }

    _searchExtras(query) {
        this._searchService.query(query, (title, results, more) => {
            if (this._root && this._search.get_text().trim().toLowerCase() === query) this._appendResults(title, results, more);
        });
        const terms = query.split(/\s+/);
        const shortcuts = this._customApps().filter(app => terms.every(term => `${app.get_name()} ${app.get_description()}`.toLowerCase().includes(term)));
        if (shortcuts.length) {
            this._appBox.add_child(new St.Label({text: 'Shortcuts', style_class: 'orbit-launcher-letter'}));
            for (const app of shortcuts) this._appBox.add_child(this._appRow(app));
            this._wireNavigation();
        }
    }

    _showRecent() {
        this._clearApps(); this._empty('Loading recent files…');
        this._recentCancel = new Gio.Cancellable(); const cancel = this._recentCancel;
        this._searchService.recent(cancel).then(items => {
            if (!this._root || cancel.is_cancelled() || this._currentCategory !== 'recent' || this._search.get_text()) return;
            this._clearApps();
            if (items.length) this._appendResults('Recent Files', items);
            else this._empty('No recent files. Enable Recent Files in Launcher preferences and GNOME Privacy.');
        });
    }

    _launchFirst() {
        const first = this._firstItem();
        if (first?._orbitApp) this._launch(first._orbitApp);
        else if (first?._orbitResult) { const action = first._orbitResult.activate; this.close(); this._runAction(action); }
    }

    _launch(app) {
        this.close();
        this._runAction(() => app.activate());
    }

    _navigationButtons() {
        const items = [];
        const visit = actor => {
            for (const child of actor.get_children()) {
                if (!child.visible) continue;
                if (child instanceof St.Button && child.can_focus) items.push(child);
                else visit(child);
            }
        };
        if (this._menu) visit(this._menu);
        return items;
    }

    _focusItem(button) {
        if (!button?.get_stage()) return;
        if (this._activeItem) { this._activeItem.remove_style_pseudo_class('selected'); this._activeItem.set_style(this._activeItem._orbitBaseStyle ?? ''); }
        this._activeItem = button;
        button.add_style_pseudo_class('selected');
        button.set_style(`${button._orbitBaseStyle ?? button.get_style() ?? ''} background-color: ${this._settings.get_string('launcher-selection-color')};`);
        button.grab_key_focus();
        this._scrollTo(button);
    }

    _wireNavigation() {
        if (!this._menu) return;
        for (const button of this._navigationButtons()) {
            if (button._orbitNavigationWired) continue;
            button._orbitNavigationWired = true;
            button.set_style(`${button.get_style() ?? ''} padding: ${this._settings.get_int('launcher-item-padding')}px; transition-duration: ${this._settings.get_int('launcher-transition-time')}ms;`);
            button._orbitBaseStyle = button.get_style();
            button.connect('key-focus-in', () => {
                if (this._activeItem !== button) this._focusItem(button);
                if (button._orbitCategory && this._inputMode === 'keyboard' && this._currentCategory !== button._orbitCategory)
                    this._selectCategory(button._orbitCategory);
            });
            button.connect('notify::hover', () => {
                if (button.hover && this._inputMode === 'pointer') this._focusItem(button);
            });
            if (button._orbitApp) {
                button.connect('popup-menu', () => this._appContext(button));
                button.connect('button-press-event', (_actor, event) => {
                    if (event.get_button() !== 3) return Clutter.EVENT_PROPAGATE;
                    this._appContext(button); return Clutter.EVENT_STOP;
                });
            }
        }
    }

    _closeContext() {
        const menu = this._itemMenu;
        this._itemMenu = null;
        if (!menu) return;
        menu.close(BoxPointer.PopupAnimation.NONE);
        menu.actor.remove_all_transitions();
        // BoxPointer queues positioning during allocation. Let that frame
        // finish before disposing its bin, including rapid open/close cycles.
        global.compositor.get_laters().add(Meta.LaterType.IDLE, () => {
            menu.destroy();
            return GLib.SOURCE_REMOVE;
        });
    }

    _appContext(button) {
        this._closeContext();
        const app = button._orbitApp;
        const menu = this._itemMenu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
        Main.uiGroup.add_child(menu.actor); menu.actor.hide();
        const manager = new PopupMenu.PopupMenuManager(button); manager.addMenu(menu);
        menu.addAction('Open', () => this._launch(app));
        if (app.can_open_new_window()) menu.addAction('New Window', () => { this.close(); app.open_new_window(-1); });
        if (app._orbitCustom) {
            const items = parseShortcuts(this._settings.get_string('launcher-shortcuts'));
            const at = items.findIndex(item => item.id === app.get_id());
            for (const [delta, label] of [[-1, 'Move Earlier'], [1, 'Move Later']]) if (at + delta >= 0 && at + delta < items.length)
                menu.addAction(label, () => { [items[at], items[at + delta]] = [items[at + delta], items[at]]; menu.close(); this._settings.set_string('launcher-shortcuts', JSON.stringify(items)); });
            menu.addAction('Remove Shortcut', () => { menu.close(); this._settings.set_string('launcher-shortcuts', JSON.stringify(items.filter(item => item.id !== app.get_id()))); });
        }
        const independent = this._settings.get_boolean('launcher-independent-pins');
        const ids = independent ? this._settings.get_strv('launcher-pinned-apps') : AppFavorites.getAppFavorites().getFavorites().map(item => item.get_id());
        const index = ids.indexOf(app.get_id());
        const update = values => {
            menu.close();
            if (independent) this._settings.set_strv('launcher-pinned-apps', values);
            else if (index >= 0) AppFavorites.getAppFavorites().removeFavorite(app.get_id());
            else AppFavorites.getAppFavorites().addFavorite(app.get_id());
        };
        if (!app._orbitCustom) menu.addAction(index >= 0 ? 'Unpin' : 'Pin to Launcher', () => update(index >= 0 ? ids.filter(id => id !== app.get_id()) : [...ids, app.get_id()]));
        if (!app._orbitCustom && index >= 0) for (const [delta, label] of [[-1, 'Move Earlier'], [1, 'Move Later']]) {
            if (index + delta < 0 || index + delta >= ids.length) continue;
            menu.addAction(label, () => {
                const changed = [...ids]; [changed[index], changed[index + delta]] = [changed[index + delta], changed[index]];
                menu.close();
                if (independent) this._settings.set_strv('launcher-pinned-apps', changed);
                else AppFavorites.getAppFavorites().moveFavoriteToPos(app.get_id(), index + delta);
            });
        }
        const info = app.get_app_info();
        for (const action of info?.list_actions?.() ?? []) menu.addAction(info.get_action_name(action), () => {
            this.close(); info.launch_action(action, global.create_app_launch_context(0, -1));
        });
        menu.connect('destroy', () => { manager.removeMenu(menu); if (this._itemMenu === menu) this._itemMenu = null; });
        const open = () => {
            if (this._itemMenu === menu && button.get_stage() && button.has_allocation())
                menu.open(BoxPointer.PopupAnimation.NONE);
            return GLib.SOURCE_REMOVE;
        };
        // A category switch may have just created this app tile. BoxPointer
        // needs allocated source geometry before calculating its arrow.
        if (button.has_allocation()) open();
        else global.compositor.get_laters().add(Meta.LaterType.IDLE, open);
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
        const focus = global.stage.get_key_focus() ?? this._activeItem ?? this._search.clutter_text;
        if (symbol === Clutter.KEY_Tab || symbol === Clutter.KEY_ISO_Left_Tab) {
            const items = [this._search, ...this._navigationButtons()];
            const index = items.findIndex(item => item === focus || item.contains(focus));
            const delta = symbol === Clutter.KEY_ISO_Left_Tab || event.get_state() & Clutter.ModifierType.SHIFT_MASK ? -1 : 1;
            this._focusItem(items[(index + delta + items.length) % items.length]);
            return Clutter.EVENT_STOP;
        }
        const direction = {[Clutter.KEY_Left]: 'left', [Clutter.KEY_Right]: 'right', [Clutter.KEY_Up]: 'up', [Clutter.KEY_Down]: 'down'}[symbol];
        if (direction) {
            if (this._search.contains(focus)) {
                if (direction !== 'down') return Clutter.EVENT_PROPAGATE;
                this._focusItem(this._firstItem());
            } else {
                const items = [this._search, ...this._navigationButtons()].map(actor => {
                    const [x, y] = actor.get_transformed_position();
                    return {actor, x: x + actor.width / 2, y: y + actor.height / 2};
                });
                this._focusItem(directionalItem(items, focus, direction));
            }
            return Clutter.EVENT_STOP;
        }
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
        if (!(event.get_state() & (Clutter.ModifierType.CONTROL_MASK | (Clutter.ModifierType.ALT_MASK ?? Clutter.ModifierType.MOD1_MASK) | Clutter.ModifierType.SUPER_MASK)) && ch && ch.length === 1 && ch >= ' ' && !this._search.clutter_text.has_key_focus()) {
            this._search.grab_key_focus();
            this._search.clutter_text.insert_text(ch, -1);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }
}
