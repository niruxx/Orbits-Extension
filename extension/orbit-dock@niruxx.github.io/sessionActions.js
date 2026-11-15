// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
export function canSignOut() {
    return !new Gio.Settings({schema_id: 'org.gnome.desktop.lockdown'}).get_boolean('disable-log-out');
}
export function signOut() {
    if (!canSignOut()) return;
    // Mode zero requests GNOME's normal confirmation and inhibitor handling.
    Gio.DBus.session.call('org.gnome.SessionManager', '/org/gnome/SessionManager',
        'org.gnome.SessionManager', 'Logout', new GLib.Variant('(u)', [0]), null,
        Gio.DBusCallFlags.NONE, -1, null, (connection, result) => {
            try { connection.call_finish(result); }
            catch (error) { Main.notify('Unable to sign out', error.message); }
        });
}
