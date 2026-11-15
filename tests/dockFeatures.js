import Gio from 'gi://Gio';
import {launcherId, updateLauncher, combineStatus, dominantColor, dockVisible} from '../extension/orbit-dock@niruxx.github.io/dockModel.js';
function assert(condition, message) { if (!condition) throw new Error(message); }
assert(launcherId('application://org.example.App.desktop') === 'org.example.App.desktop', 'Application URI parsing');
assert(!launcherId('file:///etc/passwd') && !launcherId('application://../secret') && !launcherId('application://%GG'), 'Reject malformed launcher identities');
let entry = updateLauncher({}, {count: 7, 'count-visible': true, progress: 4, 'progress-visible': true});
entry = updateLauncher(entry, {count: '99', progress: NaN, urgent: true});
assert(entry.count === 7 && entry.progress === 1 && entry.urgent, 'Partial launcher updates must preserve valid state and clamp progress');
let state = combineStatus([entry], 3, false);
assert(state.count === 7 && state.progressVisible && state.urgent, 'Combine exported count with native notifications without double counting');
state = combineStatus([updateLauncher(entry, {'count-visible': false, 'progress-visible': false, urgent: false})], 2, true);
assert(state.count === 2 && !state.progressVisible && state.urgent, 'Hidden launcher overlays must not hide native critical notification state');
assert(combineStatus([]).count === 0, 'Disconnected exporters must leave no stale badge');
assert(dominantColor(new Uint8Array([255,0,0,255, 255,255,255,0]), 2, 1, 8, 4) === 'rgb(255,0,0)', 'Dominant color ignores transparent margins');
assert(dominantColor(new Uint8Array([0,0,0,0]), 1, 1, 4, 4) === null, 'Transparent icons use fallback color');
const base = {mode: 'autohide', fullscreen: false, fullscreenReveal: true};
assert(!dockVisible(base) && dockVisible({...base, hover: true}), 'Autohide pointer behavior');
assert(dockVisible({...base, mode: 'fixed'}), 'Fixed dock visible normally');
assert(!dockVisible({...base, mode: 'fixed', fullscreen: true}), 'Fixed dock hides for fullscreen until revealed');
assert(dockVisible({...base, fullscreen: true, forced: true}), 'Explicit fullscreen reveal allowed');
assert(!dockVisible({...base, fullscreen: true, fullscreenReveal: false, forced: true, hover: true}), 'Fullscreen deny policy overrides pointer and keyboard reveal');
assert(!dockVisible({...base, mode: 'manual', hover: true}), 'Manual hiding is not defeated by pointer hover');
assert(dockVisible({...base, mode: 'manual', manualVisible: true}), 'Manual shortcut toggle');
assert(dockVisible({...base, mode: 'manual', forced: true}), 'Urgency or numbered shortcut can temporarily reveal manual dock');
assert(dockVisible({...base, mode: 'intellihide', overlap: false}) && !dockVisible({...base, mode: 'intellihide', overlap: true}), 'Overlap-based intellihide');
const [, bytes] = Gio.File.new_for_path('extension/orbit-dock@niruxx.github.io/dockPlaces.js').load_contents(null);
const source = new TextDecoder().decode(bytes).replace(/^import .*;\n/gm, '').replaceAll('export ', '');
const volumeEntries = new Function(`${source}\nreturn volumeEntries;`)();
const root = native => ({is_native: () => native});
const mount = (name, native, shadowed = false) => ({get_name: () => name, get_icon: () => null,
    get_root: () => root(native), is_shadowed: () => shadowed, get_volume: () => null});
const local = mount('Local', true), remote = mount('Remote', false), hidden = mount('Shadow', true, true);
const mounted = {get_name: () => 'Duplicate', get_mount: () => local, get_activation_root: () => root(true)};
const unmounted = {get_name: () => 'USB', get_mount: () => null, get_activation_root: () => root(true), can_mount: () => true, get_icon: () => null};
const volumes = {get_mounts: () => [local, remote, hidden], get_volumes: () => [mounted, unmounted]};
const config = {mountsLocal: true, mountsNetwork: true, mountsOnlyMounted: true};
assert(volumeEntries(volumes, config).length === 2, 'Mounted list excludes shadowed entries');
assert(volumeEntries(volumes, {...config, mountsNetwork: false})[0].name === 'Local', 'Local-only filter');
assert(volumeEntries(volumes, {...config, mountsLocal: false}).length === 1, 'Network-only filter');
assert(volumeEntries(volumes, {...config, mountsOnlyMounted: false}).length === 3, 'Unmounted volumes included without duplicate mount');
print('Dock state, launcher overlays, icon colors and volume filters passed');

// Shortcuts follow the pointer's monitor, ignore inherited keyboard modifiers, and release all grabs.
const [, shortcutBytes] = Gio.File.new_for_path('extension/orbit-dock@niruxx.github.io/dockShortcuts.js').load_contents(null);
const shortcutSource = new TextDecoder().decode(shortcutBytes).replace(/^import .*;\n/gm, '').replace('export class', 'class');
const bindings = new Map(), timers = new Map();
const Main = {wm: {addKeybinding(name, _settings, _flags, _modes, callback) { bindings.set(name, callback); return 1; },
    removeKeybinding(name) { bindings.delete(name); }}};
const GLib = {PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false, timeout_add(_p, _ms, cb) { timers.set(1, cb); return 1; }, source_remove(id) { timers.delete(id); }};
const Meta = {KeyBindingFlags: {IGNORE_AUTOREPEAT: 1}, KeyBindingAction: {NONE: 0}};
const Shell = {ActionMode: {NORMAL: 1, OVERVIEW: 2}};
const fakeGlobal = {display: {get_current_monitor: () => 1}};
const DockShortcuts = new Function('GLib', 'Meta', 'Shell', 'Main', 'global', `${shortcutSource}\nreturn DockShortcuts;`)(GLib, Meta, Shell, Main, fakeGlobal);
let activated = null, toggled = false;
const targetDock = {monitorIndex: 1, shortcutIcons: () => ['icon'], revealFor() {}, showNumbers() {},
    activateApp(...args) { activated = args; }, toggleReveal() { toggled = true; }};
const manager = {settings: {get_boolean: () => true, get_strv: () => ['<Super><Alt>1']}, _docks: [{monitorIndex: 0}, targetDock]};
const shortcuts = new DockShortcuts(manager);
assert(bindings.size === 11, 'Ten app shortcuts and a reveal binding registered');
bindings.get('dock-app-1')();
assert(activated[0] === 'icon' && activated[2] === 0, 'Shortcut activation follows pointer monitor and strips modifiers');
bindings.get('reveal-shortcut')();
assert(toggled, 'Reveal binding toggles target dock');
shortcuts.destroy();
assert(bindings.size === 0 && timers.size === 0, 'Shortcuts and number-overlay timer released on teardown');
print('Dock shortcut routing and cleanup passed');
