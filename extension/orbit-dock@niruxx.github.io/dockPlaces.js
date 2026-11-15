// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ShellMountOperation from 'resource:///org/gnome/shell/ui/shellMountOperation.js';

export function volumeEntries(monitor, config) {
    const entries = [];
    const include = network => network ? config.mountsNetwork : config.mountsLocal;
    for (const mount of monitor.get_mounts()) {
        if (!mount.is_shadowed() && include(!mount.get_root().is_native()))
            entries.push({name: mount.get_name(), icon: mount.get_icon(), mount, volume: mount.get_volume()});
    }
    if (!config.mountsOnlyMounted) {
        for (const volume of monitor.get_volumes()) {
            const root = volume.get_activation_root();
            const network = root ? !root.is_native() : volume.get_identifier('class') === 'network';
            if (!volume.get_mount() && volume.can_mount() && include(network))
                entries.push({name: volume.get_name(), icon: volume.get_icon(), volume});
        }
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export class DockPlaces {
    constructor(dock) {
        this._dock = dock;
        this._cancel = new Gio.Cancellable();
        this._menus = [];
        this._operations = new Set();
        this.actor = new St.BoxLayout({style_class: 'orbit-dock-places',
            orientation: dock.horizontal ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL});
        this._volumes = Gio.VolumeMonitor.get();
        this._signals = ['mount-added', 'mount-removed', 'mount-changed', 'volume-added', 'volume-removed', 'volume-changed']
            .map(signal => this._volumes.connect(signal, () => this._refresh()));
        this._trash = Gio.File.new_for_uri('trash:///');
        if (dock.config.showTrash) {
            try {
                this._trashMonitor = this._trash.monitor_directory(Gio.FileMonitorFlags.NONE, this._cancel);
                this._trashSignal = this._trashMonitor.connect('changed', () => this._syncTrash());
            } catch {
                // GVfs may not be installed; opening Trash still reports the handler error.
            }
        }
        this._refresh();
    }

    _report(error) {
        if (!this._cancel.is_cancelled() && !error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
            Main.notifyError('Orbit Dock', error.message);
    }

    _launch(uri) {
        Gio.AppInfo.launch_default_for_uri_async(uri, global.create_app_launch_context(0, -1), this._cancel,
            (_object, result) => {
                try { Gio.AppInfo.launch_default_for_uri_finish(result); } catch (error) { this._report(error); }
            });
    }

    _button(name, icon, activate, actions) {
        const image = new St.Icon({gicon: icon, icon_size: this._dock.iconSize});
        const button = new St.Button({style_class: 'orbit-dock-place', child: image,
            can_focus: true, track_hover: true, accessible_name: name,
            button_mask: (St.ButtonMask.PRIMARY ?? St.ButtonMask.ONE) | (St.ButtonMask.SECONDARY ?? St.ButtonMask.THREE)});
        button._orbitIcon = image;
        button._orbitLabel = name;
        button.connect('notify::hover', () => this._dock._syncLabel(button));
        const menu = new PopupMenu.PopupMenu(button, 0.5, this._dock.side);
        Main.uiGroup.add_child(menu.actor);
        menu.actor.hide();
        button._menu = menu;
        const manager = new PopupMenu.PopupMenuManager(button);
        manager.addMenu(menu);
        menu.addAction('Open', activate);
        for (const [label, callback] of actions)
            menu.addAction(label, callback);
        menu.connect('open-state-changed', (_m, open) => {
            this._dock._menusOpen = Math.max(0, this._dock._menusOpen + (open ? 1 : -1));
            this._dock._hideLabel();
            this._dock._updateVisibility();
        });
        button.connect('clicked', (_b, which) => which === 3 ? menu.toggle() : activate());
        button.connect('popup-menu', () => { menu.open(); menu.actor.grab_key_focus(); });
        this._menus.push([menu, manager]);
        this.actor.add_child(button);
        return button;
    }

    _clear() {
        for (const [menu, manager] of this._menus) {
            menu.close(); manager.removeMenu(menu); menu.destroy();
        }
        this._menus = [];
        this._dock._hideLabel();
        this.actor.destroy_all_children();
    }

    _refresh() {
        if (this._cancel.is_cancelled())
            return;
        this._clear();
        if (this._dock.config.showTrash) {
            this._trashButton = this._button('Trash', Gio.ThemedIcon.new('user-trash'), () => this._launch('trash:///'), [
                ['Empty Trash…', () => {
                    Gio.DBus.session.call('org.gnome.Nautilus', '/org/gnome/Nautilus/FileOperations2',
                        'org.gnome.Nautilus.FileOperations2', 'EmptyTrash',
                        new GLib.Variant('(ba{sv})', [true, {'timestamp': new GLib.Variant('u', global.get_current_time())}]),
                        null, Gio.DBusCallFlags.NONE, -1, this._cancel, (connection, result) => {
                            try { connection.call_finish(result); } catch (error) { this._report(error); }
                        });
                }],
            ]);
            this._syncTrash();
        }
        if (this._dock.config.showMounts) {
            for (const entry of volumeEntries(this._volumes, this._dock.config)) {
                const actions = [];
                if (entry.mount?.can_unmount())
                    actions.push(['Unmount', () => this._operate(entry, 'unmount')]);
                if (entry.mount?.can_eject() || entry.volume?.can_eject())
                    actions.push(['Eject', () => this._operate(entry, 'eject')]);
                this._button(entry.name, entry.icon, () => entry.mount
                    ? this._launch(entry.mount.get_root().get_uri()) : this._operate(entry, 'mount'), actions);
            }
        }
        this._dock._queueGeometry();
    }

    _syncTrash() {
        const button = this._trashButton;
        if (!button || this._cancel.is_cancelled())
            return;
        this._trash.query_info_async('trash::item-count', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT,
            this._cancel, (file, result) => {
                try {
                    const info = file.query_info_finish(result);
                    if (!this._cancel.is_cancelled() && button === this._trashButton)
                        button._orbitIcon.gicon = Gio.ThemedIcon.new(info.get_attribute_uint32('trash::item-count') ? 'user-trash-full' : 'user-trash');
                } catch { /* Optional GVfs attribute; retain the generic icon. */ }
            });
    }

    _operate(entry, action) {
        const object = action === 'mount' ? entry.volume : action === 'eject' && !entry.mount?.can_eject()
            ? entry.volume : entry.mount;
        const operation = new ShellMountOperation.ShellMountOperation(object);
        this._operations.add(operation);
        const method = action === 'mount' ? 'mount' : `${action}_with_operation`;
        object[method](0, operation.mountOp, this._cancel, (source, result) => {
            try {
                source[`${method}_finish`](result);
                if (action === 'mount' && !this._cancel.is_cancelled()) {
                    const mount = source.get_mount();
                    if (mount)
                        this._launch(mount.get_root().get_uri());
                }
            } catch (error) { this._report(error); }
            operation.close();
            this._operations.delete(operation);
        });
    }

    setIconSize(size) {
        this.actor.get_children().forEach(button => { button._orbitIcon.icon_size = size; });
    }

    destroy() {
        this._cancel.cancel();
        this._signals.forEach(id => this._volumes.disconnect(id));
        if (this._trashMonitor) {
            this._trashMonitor.disconnect(this._trashSignal);
            this._trashMonitor.cancel();
        }
        this._operations.forEach(operation => operation.close());
        this._operations.clear();
        this._clear();
        this.actor.destroy();
    }
}
