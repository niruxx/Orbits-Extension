// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as BackgroundMenu from 'resource:///org/gnome/shell/ui/backgroundMenu.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {arrangeDesktop, desktopGrid, readDesktopPositions, slotAt, slotPosition, sortDesktopEntries} from './desktopModel.js';

const PROVIDERS = ['ding@rastersoft.com', 'gtk4-ding@smedius.gitlab.com', 'desktop-icons@csoriano'];
const ATTRIBUTES = 'standard::name,standard::display-name,standard::icon,standard::type,standard::is-hidden,standard::is-backup,standard::size,standard::content-type,time::modified,metadata::custom-icon';

function themedIcon(value, fallback) {
    try { return Gio.Icon.new_for_string(value || fallback); } catch { return Gio.ThemedIcon.new(fallback); }
}

export class DesktopIcons {
    constructor(settings, openPreferences) {
        this._settings = settings;
        this._openPreferences = openPreferences;
        this._roots = [];
        this._menus = [];
        this._buttons = [];
        this._placements = [];
        this._cancel = new Gio.Cancellable();
        this._group = Main.layoutManager._backgroundGroup;
        this._settingsSignal = settings.connect('changed', (_s, key) => {
            if (key.startsWith('desktop-')) this._queue();
        });
        this._signals = [
            [Main.layoutManager, Main.layoutManager.connect('monitors-changed', () => this._queue())],
            [global.display, global.display.connect('workareas-changed', () => this._queue())],
            [Main.overview, Main.overview.connect('showing', () => this._roots.forEach(root => root.hide()))],
            [Main.overview, Main.overview.connect('hidden', () => this._roots.forEach(root => root.show()))],
            [Main.extensionManager, Main.extensionManager.connect('extension-state-changed', (_m, extension) => {
                if (PROVIDERS.includes(extension.uuid)) this._queue();
            })],
            [this._group, this._group.connect('child-added', (_group, actor) => {
                if (!this._roots.includes(actor)) this._queueRaise();
            })],
        ];
        this._refresh();
    }

    _queue() {
        if (this._destroyed) return;
        if (this._refreshId) GLib.source_remove(this._refreshId);
        this._refreshId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._refreshId = 0;
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    _queueRaise() {
        if (this._raiseId || this._destroyed) return;
        this._raiseId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._raiseId = 0;
            this._roots.forEach(root => this._group.set_child_above_sibling(root, null));
            return GLib.SOURCE_REMOVE;
        });
    }

    _report(error) {
        if (!this._destroyed && !error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED) && error.message !== this._lastError) {
            this._lastError = error.message;
            Main.notifyError('Orbit Desktop Icons', error.message);
        }
    }

    _watchDesktop() {
        if (this._fileWatch) {
            this._fileWatch.disconnect(this._fileWatchSignal);
            this._fileWatch.cancel();
            this._fileWatch = null;
        }
        if (!this._desktop) return;
        try {
            this._fileWatch = this._desktop.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, this._cancel);
            this._fileWatchSignal = this._fileWatch.connect('changed', () => this._queue());
        } catch {
            // Watch for a Desktop folder created later through preferences or a file manager.
            try {
                this._fileWatch = this._desktop.get_parent()?.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, this._cancel);
                this._fileWatchSignal = this._fileWatch?.connect('changed', (_w, file, other) => {
                    if (file?.equal(this._desktop) || other?.equal(this._desktop)) this._queue();
                });
            } catch { /* Home may not support file monitoring. Refresh remains available. */ }
        }
    }

    _refresh() {
        this._loadCancel?.cancel();
        this._loadCancel = new Gio.Cancellable();
        this._clear();
        if (!this._settings.get_boolean('desktop-icons-enabled') || PROVIDERS.some(uuid => Main.extensionManager.lookup(uuid)?.state === 1)) {
            this._stopWatching();
            return;
        }
        const path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
        this._desktop = path && path !== GLib.get_home_dir() ? Gio.File.new_for_path(path) : null;
        this._watchDesktop();
        if (!this._volumeMonitor) {
            this._volumeMonitor = Gio.VolumeMonitor.get();
            this._volumeSignals = ['mount-added', 'mount-removed', 'mount-changed'].map(signal =>
                this._volumeMonitor.connect(signal, () => this._queue()));
        }
        const entries = [];
        if (this._settings.get_boolean('desktop-show-home')) {
            entries.push({id: 'special:home', kind: 'home', special: true, name: 'Home',
                file: Gio.File.new_for_path(GLib.get_home_dir()),
                icon: themedIcon(this._settings.get_string('desktop-home-icon'), 'user-home')});
        }
        if (this._settings.get_boolean('desktop-show-trash')) {
            entries.push({id: 'special:trash', kind: 'trash', special: true, name: 'Trash',
                file: Gio.File.new_for_uri('trash:///'),
                icon: themedIcon(this._settings.get_string('desktop-trash-icon'), 'user-trash')});
        }
        if (this._settings.get_boolean('desktop-show-drives')) {
            for (const mount of this._volumeMonitor.get_mounts()) {
                if (!mount.is_shadowed()) entries.push({id: `mount:${mount.get_root().get_uri()}`,
                    special: true, name: mount.get_name(), icon: mount.get_icon(), file: mount.get_root()});
            }
        }
        if (!this._desktop || !this._settings.get_boolean('desktop-show-files')) {
            this._render(entries);
            return;
        }
        const cancel = this._loadCancel;
        this._desktop.enumerate_children_async(ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT,
            cancel, (file, result) => {
                let enumerator;
                try { enumerator = file.enumerate_children_finish(result); } catch (error) {
                    if (!cancel.is_cancelled()) {
                        if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) this._report(error);
                        this._render(entries);
                    }
                    return;
                }
                const finish = () => {
                    enumerator.close_async(GLib.PRIORITY_DEFAULT, null, (e, r) => {
                        try { e.close_finish(r); } catch { /* Enumerator is already released. */ }
                    });
                    if (!cancel.is_cancelled()) this._render(entries);
                };
                const next = () => enumerator.next_files_async(128, GLib.PRIORITY_DEFAULT, cancel, (e, r) => {
                    let batch;
                    try { batch = e.next_files_finish(r); } catch (error) {
                        if (!cancel.is_cancelled()) this._report(error);
                        finish();
                        return;
                    }
                    for (const info of batch) {
                        if (!this._settings.get_boolean('desktop-show-hidden') && (info.get_is_hidden() || info.get_is_backup())) continue;
                        const child = file.get_child(info.get_name());
                        const custom = info.get_attribute_string('metadata::custom-icon');
                        entries.push({id: child.get_uri(), name: info.get_display_name(), file: child,
                            icon: custom ? themedIcon(custom, 'text-x-generic') : info.get_icon(),
                            directory: info.get_file_type() === Gio.FileType.DIRECTORY,
                            size: info.get_size(), modified: info.get_attribute_uint64('time::modified'),
                            contentType: info.get_content_type()});
                    }
                    if (!batch.length || entries.length >= 5000 || cancel.is_cancelled()) finish();
                    else next();
                });
                next();
            });
    }

    _render(entries) {
        if (this._destroyed || this._loadCancel.is_cancelled()) return;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const size = this._settings.get_int('desktop-icon-size');
        const spacing = this._settings.get_int('desktop-grid-spacing');
        const primary = Main.layoutManager.primaryIndex;
        const monitors = [...Main.layoutManager.monitors].sort((a, b) => (a.index === primary ? -1 : b.index === primary ? 1 : a.index - b.index));
        const screens = monitors.filter(monitor => !this._settings.get_boolean('desktop-primary-only') || monitor.index === primary)
            .map(monitor => {
                const area = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
                return {key: monitor.connector ?? `${monitor.index}`, monitor, area,
                    grid: desktopGrid(Math.max(1, area.width - 16 * scale), Math.max(1, area.height - 16 * scale), size, spacing, scale, this._settings.get_int('desktop-label-size'))};
            });
        this._corner = this._settings.get_string('desktop-start-corner');
        this._flow = this._settings.get_string('desktop-flow');
        const order = this._settings.get_string('desktop-sort-order');
        this._entries = sortDesktopEntries(entries, order, this._settings.get_boolean('desktop-folders-first'));
        const positions = readDesktopPositions(this._settings.get_string('desktop-icon-positions'));
        const arrangement = arrangeDesktop(this._entries, screens, positions, order === 'manual');
        this._placements = arrangement.placed;
        if (arrangement.overflow.length && this._placements.length) {
            const last = this._placements[this._placements.length - 1];
            last.entry = {id: 'special:more', name: 'More files…', special: true,
                file: this._desktop ?? Gio.File.new_for_path(GLib.get_home_dir()), icon: Gio.ThemedIcon.new('folder-open')};
        }
        for (const screen of screens) {
            const {area} = screen;
            const root = new St.Widget({name: 'orbitDesktopIcons', reactive: true, clip_to_allocation: true,
                x: area.x + 8 * scale, y: area.y + 8 * scale,
                width: Math.max(1, area.width - 16 * scale), height: Math.max(1, area.height - 16 * scale)});
            this._roots.push(root);
            this._group.add_child(root);
            global.focus_manager.add_group(root);
            this._backgroundMenu(root);
            root._delegate = {
                handleDragOver: source => source._orbitDesktopManager === this && order === 'manual'
                    ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.CONTINUE,
                acceptDrop: (source, _actor, x, y) => this._drop(source, screen, x, y),
            };
            for (const placement of this._placements.filter(item => item.screen.key === screen.key)) {
                const button = this._button(placement.entry, screen.grid, scale);
                const {x, y} = slotPosition(placement.slot, screen.grid, this._corner, this._flow);
                root.add_child(button);
                button.set_position(x, y);
            }
            root.connect('button-press-event', (_r, event) => {
                if (event.get_source() !== root) return Clutter.EVENT_PROPAGATE;
                if (event.get_button() === 3) {
                    const [x, y] = event.get_coords();
                    Main.layoutManager.setDummyCursorGeometry(x, y, 0, 0);
                    root._backgroundMenu.open();
                    return Clutter.EVENT_STOP;
                }
                this._select(null);
                return Clutter.EVENT_PROPAGATE;
            });
            if (Main.overview.visible) root.hide();
        }
        this._queueRaise();
    }

    _backgroundMenu(root) {
        const menu = new BackgroundMenu.BackgroundMenu(Main.layoutManager);
        const manager = new PopupMenu.PopupMenuManager(root);
        manager.addMenu(menu);
        root._backgroundMenu = menu;
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        menu.addAction('Open Desktop Folder', () => this._open(this._desktop ?? Gio.File.new_for_path(GLib.get_home_dir())));
        const sort = new PopupMenu.PopupSubMenuMenuItem('Sort Icons');
        for (const [value, label] of [['manual', 'Manual'], ['name', 'Name (A–Z)'], ['name-desc', 'Name (Z–A)'],
            ['modified-desc', 'Newest First'], ['modified', 'Oldest First'], ['size-desc', 'Largest First'], ['size', 'Smallest First'], ['type', 'File Type']]) {
            const item = sort.menu.addAction(label, () => this._settings.set_string('desktop-sort-order', value));
            if (value === this._settings.get_string('desktop-sort-order')) item.setOrnament(PopupMenu.Ornament.DOT);
        }
        menu.addMenuItem(sort);
        menu.addAction('Refresh Icons', () => this._queue());
        menu.addAction('Desktop Icon Settings', () => this._openPreferences());
        this._menus.push([menu, manager]);
    }

    _button(entry, grid, scale) {
        const image = new St.Icon({gicon: entry.icon ?? Gio.ThemedIcon.new('text-x-generic'),
            icon_size: this._settings.get_int('desktop-icon-size'), fallback_icon_name: 'text-x-generic',
            x_align: Clutter.ActorAlign.CENTER});
        const label = new St.Label({text: entry.name, style_class: 'orbit-desktop-label',
            x_align: Clutter.ActorAlign.CENTER});
        label.clutter_text.line_wrap = true;
        label.clutter_text.line_wrap_mode = 2;
        label.clutter_text.ellipsize = 3;
        const color = /^#[0-9a-f]{6}$/i.test(this._settings.get_string('desktop-label-color'))
            ? this._settings.get_string('desktop-label-color') : '#ffffff';
        label.set_style(`color: ${color}; font-size: ${this._settings.get_int('desktop-label-size')}px; ` +
            `max-width: ${grid.cellWidth / scale - 12}px; max-height: ${this._settings.get_int('desktop-label-size') * 2.8}px; ` +
            `text-shadow: ${this._settings.get_boolean('desktop-label-shadow') ? '0 1px 3px rgba(0,0,0,0.95)' : 'none'};`);
        const content = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'orbit-desktop-tile'});
        content.add_child(image); content.add_child(label);
        const button = new St.Button({style_class: 'orbit-desktop-icon', child: content, can_focus: true,
            track_hover: true, accessible_name: entry.name, width: grid.cellWidth, height: grid.cellHeight,
            button_mask: (St.ButtonMask.PRIMARY ?? St.ButtonMask.ONE) | (St.ButtonMask.SECONDARY ?? St.ButtonMask.THREE)});
        const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.TOP);
        Main.uiGroup.add_child(menu.actor); menu.actor.hide();
        const manager = new PopupMenu.PopupMenuManager(button); manager.addMenu(menu);
        menu.addAction('Open', () => this._open(entry.file));
        if (!entry.special) menu.addAction('Show in Files', () => {
            Gio.DBus.session.call('org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
                'org.freedesktop.FileManager1', 'ShowItems', new GLib.Variant('(ass)', [[entry.file.get_uri()], '']),
                null, Gio.DBusCallFlags.NONE, -1, this._cancel, (connection, result) => {
                    try { connection.call_finish(result); } catch (error) { this._report(error); }
                });
        });
        menu.addAction('Desktop Icon Settings', () => this._openPreferences());
        this._menus.push([menu, manager]);
        button.connect('clicked', (_button, which) => {
            if (button._orbitDragging) return;
            this._select(button);
            if (which === 3) { menu.toggle(); return; }
            const now = GLib.get_monotonic_time();
            if (this._settings.get_boolean('desktop-single-click') || this._lastClick?.id === entry.id && now - this._lastClick.time < 400000) {
                this._lastClick = null;
                this._open(entry.file);
            } else this._lastClick = {id: entry.id, time: now};
        });
        button.connect('key-press-event', (_button, event) => {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter || key === Clutter.KEY_space) {
                this._open(entry.file); return Clutter.EVENT_STOP;
            }
            if ([Clutter.KEY_Left, Clutter.KEY_Right, Clutter.KEY_Up, Clutter.KEY_Down].includes(key)) {
                const directions = {[Clutter.KEY_Left]: St.DirectionType.LEFT, [Clutter.KEY_Right]: St.DirectionType.RIGHT,
                    [Clutter.KEY_Up]: St.DirectionType.UP, [Clutter.KEY_Down]: St.DirectionType.DOWN};
                button.get_parent().navigate_focus(button, directions[key], true);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        button.connect('key-focus-in', () => this._select(button));
        button.connect('popup-menu', () => { menu.open(); menu.actor.grab_key_focus(); });
        button._delegate = {_orbitDesktopManager: this, _orbitDesktopEntry: entry,
            getDragActor: () => new St.Icon({gicon: image.gicon, icon_size: image.icon_size}),
            getDragActorSource: () => image};
        if (this._settings.get_string('desktop-sort-order') === 'manual' && entry.id !== 'special:more') {
            const draggable = DND.makeDraggable(button, {restoreOnSuccess: true});
            draggable.connect('drag-begin', () => { button._orbitDragging = true; menu.close(); });
            draggable.connect('drag-end', () => {
                button._clearDragId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    button._clearDragId = 0;
                    button._orbitDragging = false;
                    return GLib.SOURCE_REMOVE;
                });
            });
            button.connect('destroy', () => {
                if (button._clearDragId) GLib.source_remove(button._clearDragId);
            });
        }
        this._buttons.push(button);
        return button;
    }

    _select(button) {
        this._selected?.remove_style_pseudo_class('selected');
        this._selected = button;
        button?.add_style_pseudo_class('selected');
    }

    _drop(source, screen, x, y) {
        if (source._orbitDesktopManager !== this || this._settings.get_string('desktop-sort-order') !== 'manual') return false;
        const current = this._placements.find(item => item.entry.id === source._orbitDesktopEntry.id);
        if (!current) return false;
        const slot = slotAt(x, y, screen.grid, this._corner, this._flow);
        const occupant = this._placements.find(item => item.screen.key === screen.key && item.slot === slot);
        const positions = readDesktopPositions(this._settings.get_string('desktop-icon-positions'));
        // Seed visible positions before a swap so unrelated icons keep their cells.
        this._placements.forEach(item => { positions[item.entry.id] = {monitor: item.screen.key, slot: item.slot}; });
        positions[current.entry.id] = {monitor: screen.key, slot};
        if (occupant && occupant !== current) positions[occupant.entry.id] = {monitor: current.screen.key, slot: current.slot};
        this._settings.set_string('desktop-icon-positions', JSON.stringify(positions));
        return true;
    }

    _open(file) {
        if (!file) return;
        Gio.AppInfo.launch_default_for_uri_async(file.get_uri(), global.create_app_launch_context(0, -1), this._cancel,
            (_object, result) => {
                try { Gio.AppInfo.launch_default_for_uri_finish(result); } catch (error) { this._report(error); }
            });
    }

    _stopWatching() {
        if (this._fileWatch) {
            this._fileWatch.disconnect(this._fileWatchSignal);
            this._fileWatch.cancel(); this._fileWatch = null;
        }
        if (this._volumeMonitor) {
            this._volumeSignals.forEach(id => this._volumeMonitor.disconnect(id));
            this._volumeMonitor = null;
        }
    }

    _clear() {
        for (const [menu, manager] of this._menus) { menu.close(); manager.removeMenu(menu); menu.destroy(); }
        this._menus = [];
        this._selected = null; this._lastClick = null;
        this._roots.forEach(root => root.destroy());
        this._roots = []; this._buttons = [];
    }

    destroy() {
        this._destroyed = true;
        this._cancel.cancel(); this._loadCancel?.cancel();
        for (const id of [this._refreshId, this._raiseId]) if (id) GLib.source_remove(id);
        this._settings.disconnect(this._settingsSignal);
        this._signals.forEach(([object, id]) => object.disconnect(id));
        this._stopWatching(); this._clear();
    }
}
