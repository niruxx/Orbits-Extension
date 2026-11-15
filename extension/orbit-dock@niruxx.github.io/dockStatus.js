// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {launcherId, updateLauncher, combineStatus} from './dockModel.js';

/** Unity LauncherEntry plus the existing Shell notification tray; never hosts notifications itself. */
export class DockStatus {
    constructor(changed) {
        this._changed = changed;
        this._senders = new Map();
        this._sources = new Map();
        this._subscriptions = [
            Gio.DBus.session.signal_subscribe(null, 'com.canonical.Unity.LauncherEntry', 'Update',
                null, null, Gio.DBusSignalFlags.NONE, (_c, sender, _path, _iface, _signal, params) => {
                    const [uri, properties] = params.deep_unpack();
                    const id = launcherId(uri);
                    if (!id || !sender)
                        return;
                    const unpacked = Object.fromEntries(Object.entries(properties).map(([key, value]) =>
                        [key, value?.deep_unpack?.() ?? value]));
                    let apps = this._senders.get(sender);
                    if (!apps) {
                        apps = new Map();
                        this._senders.set(sender, apps);
                    }
                    apps.set(id, updateLauncher(apps.get(id), unpacked));
                    this._changed();
                }),
            Gio.DBus.session.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged',
                '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE, (_c, _s, _p, _i, _n, params) => {
                    const [name, oldOwner, newOwner] = params.deep_unpack();
                    if (name === oldOwner && !newOwner && this._senders.delete(oldOwner))
                        this._changed();
                }),
        ];
        // Do not displace another launcher that already owns this optional compatibility name.
        this._busName = Gio.bus_own_name_on_connection(Gio.DBus.session, 'com.canonical.Unity',
            Gio.BusNameOwnerFlags.NONE, null, null);
        this._traySignals = [
            Main.messageTray.connect('source-added', (_tray, source) => this._track(source)),
            Main.messageTray.connect('source-removed', (_tray, source) => this._untrack(source)),
        ];
        Main.messageTray.getSources().forEach(source => this._track(source));
    }

    _track(source) {
        if (this._sources.has(source))
            return;
        this._sources.set(source, [
            source.connect('notify::count', () => this._changed()),
            source.connect('notification-added', () => this._changed()),
        ]);
        this._changed();
    }

    _untrack(source) {
        for (const id of this._sources.get(source) ?? [])
            source.disconnect(id);
        this._sources.delete(source);
        this._changed();
    }

    get(appId) {
        let notifications = 0, critical = false;
        for (const source of this._sources.keys()) {
            const id = source.app?.get_id() ?? source._app?.get_id() ?? source.policy?.id;
            if (id !== appId && `${id}.desktop` !== appId)
                continue;
            notifications += source.count;
            critical ||= source.notifications.some(notification => notification.urgency >= 3);
        }
        const entries = [...this._senders.values()].map(apps => apps.get(appId)).filter(Boolean);
        return combineStatus(entries, notifications, critical);
    }

    destroy() {
        this._subscriptions.forEach(id => Gio.DBus.session.signal_unsubscribe(id));
        this._traySignals.forEach(id => Main.messageTray.disconnect(id));
        for (const [source, ids] of this._sources)
            ids.forEach(id => source.disconnect(id));
        this._sources.clear();
        this._senders.clear();
        Gio.bus_unown_name(this._busName);
    }
}
