import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {PANEL_ELEMENTS, panelGeometry, panelOverrides, orderedPanelElements} from '../extension/orbit-dock@niruxx.github.io/taskbarModel.js';
import {applySettings, exportSettings, validateSettings, readSettingsFile} from '../extension/orbit-dock@niruxx.github.io/settingsBackup.js';
function assert(condition, message) { if (!condition) throw new Error(message); }
function rejects(run, message) { let rejected = false; try { run(); } catch { rejected = true; } assert(rejected, message); }
const monitor = {x: -1280, y: 40, width: 1280, height: 800};
let frame = panelGeometry(monitor, {edge: 'bottom', size: 48, length: 0.5, anchor: 'center'});
assert(frame.x === -960 && frame.y === 792 && frame.width === 640 && frame.height === 48, 'Bottom panel geometry and negative monitor origin');
frame = panelGeometry(monitor, {edge: 'right', size: 48, length: 0.5, anchor: 'end'}, 2);
assert(frame.x === -96 && frame.y === 440 && frame.width === 96 && frame.height === 400, 'Vertical geometry, scaling and end anchor');
assert(Object.keys(panelOverrides('{bad')).length === 0, 'Malformed overrides recover at runtime');
rejects(() => panelOverrides('{"0":{"size":-1}}', true), 'Invalid override sizes rejected for import');
rejects(() => panelOverrides('{"0":{"edge":"diagonal"}}', true), 'Unknown edges rejected');
assert(panelOverrides('{"1":{"edge":"left","size":64,"length":0.8,"anchor":"center","mode":"autohide"}}', true)[1].size === 64, 'Valid independent monitor settings');
assert(orderedPanelElements(['clock', 'apps', 'clock', 'unknown', 'system'], ['system']).join(',') === 'clock,apps', 'Element order, deduplication and visibility');
assert(orderedPanelElements(['start', 'apps', 'spacer', 'clock'], [], true)[0] === 'spacer2', 'Centered application layout adds leading space');

GLib.setenv('GSETTINGS_BACKEND', 'memory', true);
const scratch = GLib.dir_make_tmp('orbit-backup-test-XXXXXX');
const schemaName = 'org.gnome.shell.extensions.orbit-dock';
const schemaFile = `${schemaName}.gschema.xml`;
Gio.File.new_for_path(`extension/orbit-dock@niruxx.github.io/schemas/${schemaFile}`).copy(Gio.File.new_for_path(`${scratch}/${schemaFile}`), Gio.FileCopyFlags.NONE, null, null);
const [, , stderr, status] = GLib.spawn_command_line_sync(`glib-compile-schemas ${scratch}`);
assert(status === 0, new TextDecoder().decode(stderr));
const source = Gio.SettingsSchemaSource.new_from_directory(scratch, Gio.SettingsSchemaSource.get_default(), false);
const settings = new Gio.Settings({settings_schema: source.lookup(schemaName, false)});
const backup = exportSettings(settings);
const values = validateSettings(backup, settings);
assert(values.length === settings.settings_schema.list_keys().length, 'Backup covers all Orbit preferences');
const change = (key, type, value) => JSON.stringify({format: 'orbit-shell-settings', version: 1, settings: {[key]: {type, value}}});
rejects(() => validateSettings(change('unknown', 's', 'x'), settings), 'Unknown setting rejected');
rejects(() => validateSettings(change('icon-size', 'i', '64'), settings), 'Numeric coercion rejected');
rejects(() => validateSettings(change('icon-size', 'i', -1), settings), 'Out of range value rejected');
rejects(() => validateSettings(change('taskbar-hidden-elements', 'as', ['system', 'invalid']), settings), 'Invalid element IDs rejected');
rejects(() => validateSettings(change('taskbar-monitor-overrides', 's', '{"0":{"size":2}}'), settings), 'Invalid nested overrides rejected');
rejects(() => validateSettings('x'.repeat(1024 * 1024 + 1), settings), 'Oversized backup rejected');
const previous = settings.get_int('icon-size');
applySettings(settings, validateSettings(change('icon-size', 'i', 64), settings));
assert(settings.get_int('icon-size') === 64, 'Imported settings applied');
settings.set_int('icon-size', 48);
const observer = new Gio.Settings({settings_schema: settings.settings_schema});
assert(observer.get_int('icon-size') === 48, 'Import must not leave normal preferences in delayed mode');
applySettings(settings, [['icon-size', new GLib.Variant('i', previous)]]);
assert(settings.get_int('icon-size') === previous, 'Undo transaction restores prior value');
const file = Gio.File.new_for_path(`${scratch}/settings.json`);
file.replace_contents(backup, null, false, Gio.FileCreateFlags.NONE, null);
const loop = new GLib.MainLoop(null, false);
let failure;
readSettingsFile(file).then(text => assert(text === backup, 'Bounded async file reader preserves backup')).catch(error => { failure = error; }).finally(() => loop.quit());
loop.run();
if (failure) throw failure;
for (const name of ['settings.json', schemaFile, 'gschemas.compiled']) Gio.File.new_for_path(`${scratch}/${name}`).delete(null);
Gio.File.new_for_path(scratch).delete(null);
print(`Taskbar geometry, elements and ${PANEL_ELEMENTS.length} roles; settings validation, apply and undo passed`);

// Exercise unused-space interactions without changing workstation audio or pointer grabs.
const [, panelBytes] = Gio.File.new_for_path('extension/orbit-dock@niruxx.github.io/taskbarPanel.js').load_contents(null);
const panelSource = new TextDecoder().decode(panelBytes).replace(/^import .*;\n/gm, '').replaceAll('export ', '');
const timers = new Map();
const fakeGLib = {PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false,
    timeout_add(_priority, _delay, callback) { timers.set(1, callback); return 1; }, source_remove(id) { timers.delete(id); }};
let shownOverview = 0, showedDesktop = 0, osd = 0, grab;
const stream = {volume: 50, push_volume() {}, change_is_muted(value) { this.muted = value; }};
const Volume = {getMixerControl: () => ({get_default_sink: () => stream, get_vol_max_norm: () => 100})};
const Main = {overview: {toggle: () => shownOverview++}, osdWindowManager: {show: () => osd++}};
const St = {Button: class {}};
const Meta = {MaximizeFlags: {BOTH: 3}, GrabOp: {MOVING: 1}, MotionDirection: {LEFT: -1, RIGHT: 1}};
const Clutter = {EVENT_PROPAGATE: 0, EVENT_STOP: 1, ModifierType: {BUTTON1_MASK: 256}};
const window = {maximized: false, can_maximize: () => true, allows_move: () => true, get_monitor: () => 1,
    maximize() { this.maximized = true; }, unmaximize() { this.maximized = false; }, begin_grab_op(...args) { grab = args; }};
const globalStub = {display: {focus_window: window}, get_current_time: () => 1,
    stage: {get_context: () => ({get_backend: () => ({get_sprite: () => 'pointer'})})}};
const TaskbarPanel = new Function('Clutter', 'Gio', 'GLib', 'Meta', 'St', 'Main', 'Volume', 'global', 'isWindowMaximized',
    `${panelSource}\nreturn TaskbarPanel;`)(Clutter, Gio, fakeGLib, Meta, St, Main, Volume, globalStub, win => win.maximized);
const panel = Object.create(TaskbarPanel.prototype);
const actions = {'taskbar-scroll-action': 'volume', 'taskbar-click-action': 'overview', 'taskbar-middle-click-action': 'desktop', 'taskbar-double-click-action': 'maximize'};
panel._settings = {get_string: key => actions[key], get_boolean: () => true};
panel.dock = {monitorIndex: 1, _scrollDirection: () => 1, _throttleScroll: () => true};
panel._unused = () => true; panel._desktop = () => showedDesktop++;
panel._scroll({});
assert(stream.volume === 45 && osd === 1, 'Panel scroll adjusts volume in bounded increments');
stream.volume = 1; panel._scroll({});
assert(stream.volume === 0 && stream.muted, 'Volume clamps to zero and mutes');
const event = {get_coords: () => [0, 0], get_button: () => 1, get_time: () => 1, get_state: () => 256};
panel._press(event); panel._release(event);
assert(timers.size === 1, 'Single click waits for the double-click interval');
panel._press(event); panel._release(event);
assert(window.maximized && !timers.size && shownOverview === 0, 'Double click maximizes without also running single-click action');
panel._press({...event, get_button: () => 2}); panel._release(event);
assert(showedDesktop === 1, 'Middle click action');
panel._press(event); panel._motion({...event, get_coords: () => [20, 20]});
assert(grab[0] === Meta.GrabOp.MOVING && grab[1] === 'pointer' && panel._pressed === null, 'Dragging unused space starts a native window move');
panel._press(event); grab = null; panel._motion({...event, get_state: () => 0, get_coords: () => [20, 20]});
assert(!grab && !panel._pressed, 'A released pointer cannot start a stale window drag');
print('Panel volume, click, double-click and window-drag interactions passed');
