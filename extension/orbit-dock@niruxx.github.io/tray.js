// SPDX-License-Identifier: GPL-3.0-or-later
//
// Application indicators (StatusNotifierItem / AppIndicator, the protocol used
// by Discord, Steam, Telegram, Nextcloud, …). Orbit acts as the
// org.kde.StatusNotifierWatcher and as the host that draws the icons, either in
// the top bar or in a small tray at the bottom-left of the screen. Menus are
// rendered from the com.canonical.dbusmenu interface.

import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export const TRAY_KEYS = new Set(['tray-enabled', 'tray-position', 'tray-icon-size']);

const WATCHER_NAME = 'org.kde.StatusNotifierWatcher';
const WATCHER_PATH = '/StatusNotifierWatcher';
const ITEM_IFACE = 'org.kde.StatusNotifierItem';
const MENU_IFACE = 'com.canonical.dbusmenu';
const DEFAULT_ITEM_PATH = '/StatusNotifierItem';

const WATCHER_XML = `<node>
  <interface name="org.kde.StatusNotifierWatcher">
    <method name="RegisterStatusNotifierItem"><arg type="s" direction="in"/></method>
    <method name="RegisterStatusNotifierHost"><arg type="s" direction="in"/></method>
    <property name="RegisteredStatusNotifierItems" type="as" access="read"/>
    <property name="IsStatusNotifierHostRegistered" type="b" access="read"/>
    <property name="ProtocolVersion" type="i" access="read"/>
    <signal name="StatusNotifierItemRegistered"><arg type="s"/></signal>
    <signal name="StatusNotifierItemUnregistered"><arg type="s"/></signal>
    <signal name="StatusNotifierHostRegistered"/>
    <signal name="StatusNotifierHostUnregistered"/>
  </interface>
</node>`;

const ITEM_PROPS = ['Id', 'Title', 'Status', 'IconName', 'IconPixmap', 'AttentionIconName',
    'AttentionIconPixmap', 'IconThemePath', 'Menu', 'ItemIsMenu', 'ToolTip'];

function dbusCall(bus, path, iface, method, params, replyType = null) {
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call(bus, path, iface, method, params,
            replyType ? new GLib.VariantType(replyType) : null,
            Gio.DBusCallFlags.NONE, 5000, null, (conn, res) => {
                try {
                    resolve(conn.call_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

function stripMnemonic(label) {
    return (label ?? '').replace(/__/g, '\u0000').replace(/_/g, '').replace(/\u0000/g, '_');
}

/** IconPixmap is ARGB32 in network byte order; turn the best size into a GIcon. */
function pixmapToGicon(pixmaps, wanted) {
    if (!Array.isArray(pixmaps) || !pixmaps.length)
        return null;
    const sorted = [...pixmaps].sort((a, b) => a[0] - b[0]);
    const [w, h, data] = sorted.find(p => p[0] >= wanted) ?? sorted[sorted.length - 1];
    if (!w || !h || !data || data.length < w * h * 4)
        return null;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h * 4; i += 4) {
        rgba[i] = data[i + 1];
        rgba[i + 1] = data[i + 2];
        rgba[i + 2] = data[i + 3];
        rgba[i + 3] = data[i];
    }
    const pixbuf = GdkPixbuf.Pixbuf.new_from_bytes(new GLib.Bytes(rgba),
        GdkPixbuf.Colorspace.RGB, true, 8, w, h, w * 4);
    const [ok, png] = pixbuf.save_to_bufferv('png', [], []);
    return ok ? Gio.BytesIcon.new(new GLib.Bytes(png)) : null;
}

/** Look for an icon file shipped in the app's own IconThemePath. */
function findInThemePath(themePath, name) {
    if (!themePath || !name)
        return null;
    const exts = ['png', 'svg', 'xpm'];
    const dirs = [themePath];
    for (let depth = 0; depth < 4 && dirs.length; depth++) {
        const next = [];
        for (const dir of dirs) {
            for (const ext of exts) {
                const f = Gio.File.new_for_path(`${dir}/${name}.${ext}`);
                if (f.query_exists(null))
                    return new Gio.FileIcon({file: f});
            }
            try {
                const en = Gio.File.new_for_path(dir).enumerate_children(
                    'standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
                let info;
                while ((info = en.next_file(null))) {
                    if (info.get_file_type() === Gio.FileType.DIRECTORY)
                        next.push(`${dir}/${info.get_name()}`);
                }
            } catch {
                // unreadable directory: ignore
            }
        }
        dirs.splice(0, dirs.length, ...next);
    }
    return null;
}

// --------------------------------------------------------------------------
// One indicator icon

const TrayItemButton = GObject.registerClass(
class OrbitTrayItemButton extends PanelMenu.Button {
    _init(manager, busName, objectPath, side) {
        super._init(0.5, busName, false);
        this._manager = manager;
        this._busName = busName;
        this._path = objectPath;
        this._props = {};
        this.add_style_class_name('orbit-tray-item');

        if (side !== St.Side.TOP)
            this.setMenu(new PopupMenu.PopupMenu(this, 0.5, side));
        // We decide ourselves what each mouse button does.
        this._clickGesture.set_enabled(false);

        this._icon = new St.Icon({
            style_class: 'system-status-icon',
            icon_size: manager.iconSize,
            fallback_icon_name: 'image-missing-symbolic',
        });
        this.add_child(this._icon);

        const primary = new Clutter.ClickGesture({required_button: Clutter.BUTTON_PRIMARY});
        primary.connect('recognize', () => this._onPrimary());
        this.add_action(primary);
        const secondary = new Clutter.ClickGesture({required_button: Clutter.BUTTON_SECONDARY, recognize_on_press: true});
        secondary.connect('recognize', () => this._openMenu());
        this.add_action(secondary);
        const middle = new Clutter.ClickGesture({required_button: Clutter.BUTTON_MIDDLE});
        middle.connect('recognize', () => this._callItem('SecondaryActivate', this._coords()));
        this.add_action(middle);
        this.connect('scroll-event', (_a, event) => this._onScroll(event));

        this._signalId = Gio.DBus.session.signal_subscribe(busName, ITEM_IFACE, null, objectPath,
            null, Gio.DBusSignalFlags.NONE, (_c, _s, _p, _i, signal) => {
                if (signal.startsWith('New'))
                    this._refresh();
            });
        this._refresh();
    }

    get key() {
        return `${this._busName}${this._path}`;
    }

    async _refresh() {
        try {
            const reply = await dbusCall(this._busName, this._path, 'org.freedesktop.DBus.Properties',
                'GetAll', new GLib.Variant('(s)', [ITEM_IFACE]), '(a{sv})');
            const [dict] = reply.recursiveUnpack();
            this._props = dict;
        } catch (e) {
            // Some items answer GetAll badly; fall back to single gets.
            for (const prop of ITEM_PROPS) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const r = await dbusCall(this._busName, this._path, 'org.freedesktop.DBus.Properties',
                        'Get', new GLib.Variant('(ss)', [ITEM_IFACE, prop]), '(v)');
                    this._props[prop] = r.recursiveUnpack()[0];
                } catch {
                    // property not implemented
                }
            }
        }
        if (!this._icon)
            return; // destroyed meanwhile
        this._sync();
    }

    _sync() {
        const p = this._props;
        this.container.visible = p.Status !== 'Passive';
        const title = p.Title || p.Id || '';
        this.accessible_name = title;

        const attention = p.Status === 'NeedsAttention';
        const name = (attention && p.AttentionIconName) || p.IconName;
        const pixmap = (attention && p.AttentionIconPixmap?.length) ? p.AttentionIconPixmap : p.IconPixmap;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;

        let gicon = null;
        if (name?.startsWith('/'))
            gicon = new Gio.FileIcon({file: Gio.File.new_for_path(name)});
        if (!gicon && name)
            gicon = findInThemePath(p.IconThemePath, name);
        if (!gicon && name)
            gicon = new Gio.ThemedIcon({names: [name, `${name}-symbolic`]});
        if (!gicon)
            gicon = pixmapToGicon(pixmap, this._manager.iconSize * scale);
        this._icon.gicon = gicon ?? new Gio.ThemedIcon({name: 'image-missing-symbolic'});
    }

    _coords() {
        const [x, y] = this.get_transformed_position();
        return new GLib.Variant('(ii)', [Math.round(x), Math.round(y)]);
    }

    async _callItem(method, params) {
        try {
            await dbusCall(this._busName, this._path, ITEM_IFACE, method, params);
            return true;
        } catch {
            return false;
        }
    }

    async _onPrimary() {
        if (this._props.ItemIsMenu && this._props.Menu) {
            this._openMenu();
            return;
        }
        if (!await this._callItem('Activate', this._coords()))
            this._openMenu();
    }

    _onScroll(event) {
        const dir = event.get_scroll_direction();
        let delta = 0, orientation = 'vertical';
        if (dir === Clutter.ScrollDirection.UP) {
            delta = -1;
        } else if (dir === Clutter.ScrollDirection.DOWN) {
            delta = 1;
        } else if (dir === Clutter.ScrollDirection.SMOOTH) {
            const [dx, dy] = event.get_scroll_delta();
            delta = Math.round(Math.abs(dx) > Math.abs(dy) ? dx : dy);
            orientation = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
        }
        if (delta)
            this._callItem('Scroll', new GLib.Variant('(is)', [delta, orientation]));
        return Clutter.EVENT_STOP;
    }

    // ---- DBusMenu -----------------------------------------------------------

    async _openMenu() {
        if (this.menu.isOpen) {
            this.menu.close();
            return;
        }
        const menuPath = this._props.Menu;
        if (!menuPath || menuPath === '/') {
            this._callItem('ContextMenu', this._coords());
            return;
        }
        if (!this._menuSignal) {
            this._menuSignal = Gio.DBus.session.signal_subscribe(this._busName, MENU_IFACE, null,
                menuPath, null, Gio.DBusSignalFlags.NONE, (_c, _s, _p, _i, signal) => {
                    if ((signal === 'LayoutUpdated' || signal === 'ItemsPropertiesUpdated') && this.menu.isOpen)
                        this._loadMenu(menuPath);
                });
        }
        try {
            await dbusCall(this._busName, menuPath, MENU_IFACE, 'AboutToShow', new GLib.Variant('(i)', [0]));
        } catch {
            // optional
        }
        if (await this._loadMenu(menuPath))
            this.menu.open();
    }

    async _loadMenu(menuPath) {
        try {
            const reply = await dbusCall(this._busName, menuPath, MENU_IFACE, 'GetLayout',
                new GLib.Variant('(iias)', [0, -1, []]), '(u(ia{sv}av))');
            const [, layout] = reply.recursiveUnpack();
            this.menu.removeAll();
            this._fillMenu(this.menu, layout[2], menuPath);
            return true;
        } catch (e) {
            logError(e, `Orbit tray: menu of ${this._busName} failed`);
            return false;
        }
    }

    _fillMenu(menu, children, menuPath) {
        for (const child of children ?? []) {
            const [id, props, sub] = child;
            if (props.visible === false)
                continue;
            if (props.type === 'separator') {
                menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                continue;
            }
            const label = stripMnemonic(props.label);
            let item;
            if (props['children-display'] === 'submenu' || sub?.length) {
                item = new PopupMenu.PopupSubMenuMenuItem(label);
                this._fillMenu(item.menu, sub, menuPath);
            } else {
                let icon = null;
                if (props['icon-name'])
                    icon = new Gio.ThemedIcon({name: props['icon-name']});
                else if (props['icon-data']?.length)
                    icon = Gio.BytesIcon.new(new GLib.Bytes(props['icon-data']));
                item = icon ? new PopupMenu.PopupImageMenuItem(label, icon) : new PopupMenu.PopupMenuItem(label);
                if (props['toggle-type'] === 'checkmark')
                    item.setOrnament(props['toggle-state'] === 1 ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
                else if (props['toggle-type'] === 'radio')
                    item.setOrnament(props['toggle-state'] === 1 ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NO_DOT);
                item.connect('activate', () => {
                    dbusCall(this._busName, menuPath, MENU_IFACE, 'Event',
                        new GLib.Variant('(isvu)', [id, 'clicked', new GLib.Variant('i', 0),
                            global.get_current_time() >>> 0])).catch(() => {});
                });
            }
            if (props.enabled === false)
                item.setSensitive(false);
            menu.addMenuItem(item);
        }
    }

    _onDestroy() {
        if (this._signalId)
            Gio.DBus.session.signal_unsubscribe(this._signalId);
        if (this._menuSignal)
            Gio.DBus.session.signal_unsubscribe(this._menuSignal);
        this._signalId = this._menuSignal = 0;
        this._icon = null;
        super._onDestroy();
    }
});

// --------------------------------------------------------------------------
// Watcher + placement

export class TrayManager {
    // Two layers:
    //  * the service: owns org.kde.StatusNotifierWatcher and remembers which
    //    apps registered. Chromium/Electron apps (Discord, Slack, VS Code, …)
    //    register only once at startup and never again, so the service must
    //    survive setting changes and screen locks; it stops only when the tray
    //    is switched off or the extension is disabled.
    //  * the view: icon buttons in the top bar or bottom-left tray, rebuilt
    //    freely (position/size changes, lock screen).
    constructor(settings) {
        this._settings = settings;
        this._items = new Map(); // key -> {busName, path, watchId, button}
        this._settings.connectObject('changed', (_s, key) => {
            if (key === 'tray-enabled')
                this._syncEnabled();
            else if (TRAY_KEYS.has(key))
                this._queueViewRebuild();
        }, this);
        // The panel hides unknown indicators on session changes and the lock
        // screen must not show the tray: rebuild the view whenever the mode
        // changes.
        Main.sessionMode.connectObject('updated', () => this._rebuildView(), this);
        this._syncEnabled();
    }

    get iconSize() {
        return this._settings.get_int('tray-icon-size');
    }

    // ---- service --------------------------------------------------------

    _syncEnabled() {
        const enabled = this._settings.get_boolean('tray-enabled');
        if (enabled && !this._dbus)
            this._startService();
        else if (!enabled && this._dbus)
            this._stopService();
        this._rebuildView();
    }

    _startService() {
        this._dbus = Gio.DBusExportedObject.wrapJSObject(WATCHER_XML, this);
        this._dbus.export(Gio.DBus.session, WATCHER_PATH);
        this._ownerId = Gio.bus_own_name_on_connection(Gio.DBus.session, WATCHER_NAME,
            Gio.BusNameOwnerFlags.NONE,
            () => this._dbus?.emit_signal('StatusNotifierHostRegistered', null),
            () => {
                // Another watcher (e.g. the AppIndicator extension) already runs.
                log('Orbit tray: org.kde.StatusNotifierWatcher is owned by another program; ' +
                    'disable other AppIndicator extensions to use Orbit\'s tray.');
            });
    }

    _stopService() {
        for (const key of [...this._items.keys()])
            this._removeItem(key);
        if (this._ownerId) {
            Gio.bus_unown_name(this._ownerId);
            this._ownerId = 0;
        }
        this._dbus?.unexport();
        this._dbus = null;
    }

    // ---- org.kde.StatusNotifierWatcher (called over D-Bus) ---------------

    RegisterStatusNotifierItemAsync([service], invocation) {
        const sender = invocation.get_sender();
        let busName, path;
        if (service.startsWith('/')) {
            busName = sender;
            path = service;
        } else {
            busName = service;
            path = DEFAULT_ITEM_PATH;
        }
        // Resolve well-known names to the unique owner so we can watch it.
        if (!busName.startsWith(':'))
            busName = sender;
        this._addItem(busName, path);
        invocation.return_value(null);
    }

    RegisterStatusNotifierHostAsync(_params, invocation) {
        invocation.return_value(null);
    }

    get RegisteredStatusNotifierItems() {
        return [...this._items.keys()];
    }

    get IsStatusNotifierHostRegistered() {
        return true;
    }

    get ProtocolVersion() {
        return 0;
    }

    _addItem(busName, path) {
        const key = `${busName}${path}`;
        if (this._items.has(key))
            return;
        const watchId = Gio.bus_watch_name_on_connection(Gio.DBus.session, busName,
            Gio.BusNameWatcherFlags.NONE, null, () => this._removeItem(key));
        const entry = {busName, path, watchId, button: null};
        this._items.set(key, entry);
        this._showItem(key, entry);
        this._dbus?.emit_signal('StatusNotifierItemRegistered', new GLib.Variant('(s)', [key]));
    }

    _removeItem(key) {
        const entry = this._items.get(key);
        if (!entry)
            return;
        this._items.delete(key);
        Gio.bus_unwatch_name(entry.watchId);
        entry.button?.destroy();
        if (this._area && !this._items.size)
            this._area.hide();
        this._dbus?.emit_signal('StatusNotifierItemUnregistered', new GLib.Variant('(s)', [key]));
    }

    // ---- view -----------------------------------------------------------

    _queueViewRebuild() {
        if (this._reloadId)
            GLib.source_remove(this._reloadId);
        this._reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            this._reloadId = 0;
            this._rebuildView();
            return GLib.SOURCE_REMOVE;
        });
    }

    _rebuildView() {
        this._destroyView();
        if (!this._dbus || Main.sessionMode.isLocked || !Main.sessionMode.hasWindows)
            return;
        this._position = this._settings.get_string('tray-position');
        if (this._position === 'bottom-left')
            this._buildTrayArea();
        this._viewBuilt = true;
        for (const [key, entry] of this._items)
            this._showItem(key, entry);
    }

    _showItem(key, entry) {
        if (!this._viewBuilt)
            return;
        const side = this._position === 'bottom-left' ? St.Side.BOTTOM : St.Side.TOP;
        const button = new TrayItemButton(this, entry.busName, entry.path, side);
        entry.button = button;
        button.connect('destroy', () => {
            if (entry.button === button)
                entry.button = null;
        });
        if (this._area) {
            this._area.add_child(button.container);
            this._menuManager.addMenu(button.menu);
            this._area.show();
        } else {
            const role = `orbit-tray-${key}`;
            delete Main.panel.statusArea[role];
            Main.panel.addToStatusArea(role, button, 0, 'right');
        }
    }

    _destroyView() {
        this._viewBuilt = false;
        for (const entry of this._items.values()) {
            entry.button?.destroy();
            entry.button = null;
        }
        global.display.disconnectObject(this);
        this._areaChrome?.destroy();
        this._areaChrome = null;
        this._area = null;
        this._menuManager = null;
    }

    _buildTrayArea() {
        this._menuManager = new PopupMenu.PopupMenuManager(Main.layoutManager.uiGroup);
        this._area = new St.BoxLayout({
            name: 'orbitTray',
            style_class: 'orbit-tray',
            reactive: true,
        });
        this._area.hide(); // shown once something registers
        // Chrome with trackFullscreen gets its `visible` forced by the layout
        // manager, so track a wrapper and toggle the tray inside it.
        this._areaChrome = new St.Bin({child: this._area});
        Main.layoutManager.addChrome(this._areaChrome, {trackFullscreen: true});
        global.display.connectObject('workareas-changed', () => this._positionArea(), this);
        this._area.connect('notify::allocation', () => this._positionArea());
    }

    _positionArea() {
        if (!this._area)
            return;
        const wa = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const gap = 8 * scale;
        const x = wa.x + gap;
        const y = wa.y + wa.height - this._area.height - gap;
        if (this._areaChrome.x !== x || this._areaChrome.y !== y)
            this._areaChrome.set_position(x, y);
    }

    destroy() {
        if (this._reloadId) {
            GLib.source_remove(this._reloadId);
            this._reloadId = 0;
        }
        this._settings.disconnectObject(this);
        Main.sessionMode.disconnectObject(this);
        this._destroyView();
        this._stopService();
    }
}
