// Validate session request routing without contacting a real session manager.
import Gio from 'gi://Gio';
const [, bytes] = Gio.File.new_for_path('extension/orbit-dock@niruxx.github.io/sessionActions.js').load_contents(null);
const source = new TextDecoder().decode(bytes).replace(/^import .*;$/gm, '').replaceAll('export function', 'function');
let restricted = false, request;
const mockGio = {Settings: class {get_boolean() { return restricted; }}, DBusCallFlags: {NONE: 0},
    DBus: {session: {call(...args) { request = args; }}}};
const mockGLib = {Variant: class {constructor(type, value) { this.type = type; this.value = value; }}};
const actions = new Function('Gio', 'GLib', 'Main', `${source}; return {canSignOut, signOut};`)(mockGio, mockGLib, {});
actions.signOut();
if (request[0] !== 'org.gnome.SessionManager' || request[3] !== 'Logout' || request[4].type !== '(u)' || request[4].value[0] !== 0)
    throw new Error('Sign Out must request normal confirmation mode');
request = null; restricted = true; actions.signOut();
if (actions.canSignOut() || request) throw new Error('Logout restriction must be respected');
print('Sign Out confirmation mode and lockdown checks passed');
