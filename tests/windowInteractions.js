// Run with: gjs -m tests/windowInteractions.js
// Exercise popup races and temporary window-state restoration without a Shell session.
import Gio from 'gi://Gio';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
let nextId = 1;
class Actor {
    constructor(props = {}) {
        Object.assign(this, {opacity: 255, children: [], hover: false}, props);
        this.signals = new Map();
    }
    connect(name, callback) { const id = nextId++; this.signals.set(id, [name, callback]); return id; }
    disconnect(id) { this.signals.delete(id); }
    emit(name, ...args) {
        for (const [id, [signal, callback]] of [...this.signals]) {
            if (signal === name && this.signals.has(id))
                callback(this, ...args);
        }
    }
    add_child(child) { this.children.push(child); }
    set_child(child) { this.children = [child]; }
    add_style_class_name() {}
    set_style(style) { this.style = style; }
    get_stage() { return !this.dead; }
    grab_key_focus() {}
    destroy() { this.emit('destroy'); this.dead = true; }
}
const timers = new Map();
const GLib = {PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false,
    timeout_add(_priority, _delay, callback) { const id = nextId++; timers.set(id, callback); return id; },
    source_remove(id) { timers.delete(id); }};
function tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); }
const St = {Widget: Actor, BoxLayout: Actor, ScrollView: Actor, Label: Actor, Button: Actor, Icon: Actor,
    PolicyType: {NEVER: 0, AUTOMATIC: 1}, ThemeContext: {get_for_stage: () => ({scale_factor: 1})}};
const Clutter = {Orientation: {VERTICAL: 1}, ActorAlign: {CENTER: 1}, Clone: Actor};
class Menu extends Actor {
    constructor() { super(); this.actor = new Actor(); this.box = new Actor(); }
    addMenuItem(item) { this.add_child(item); }
    open() { this.isOpen = true; this.emit('open-state-changed', true); }
    close() { this.isOpen = false; this.emit('open-state-changed', false); }
}
const PopupMenu = {PopupMenu: Menu, PopupBaseMenuItem: Actor,
    PopupMenuManager: class { addMenu() {} removeMenu() {} }};
const Main = {uiGroup: new Actor(), overview: {visible: false},
    layoutManager: {monitors: [{height: 1080}]}, activateWindow: win => { win.activated = true; }};
const workspace = {list_windows: () => windows};
const global = {stage: {}, get_window_actors: () => windows.map(win => win.actor),
    get_current_time: () => 1, workspace_manager: new Actor()};
global.workspace_manager.get_active_workspace = () => workspace;
function window(name, minimized = false) {
    const win = new Actor({minimized});
    win.actor = new Actor({width: 800, height: 600, meta_window: win});
    win.get_title = () => name;
    win.get_compositor_private = () => win.actor;
    win.is_ancestor_of_transient = () => false;
    win.showing_on_its_workspace = () => true;
    win.located_on_workspace = () => true;
    win.can_minimize = () => true;
    win.minimize = () => { win.minimized = true; };
    win.unminimize = () => { win.minimized = false; };
    return win;
}
const windows = [window('A'), window('B'), window('Already minimized', true)];
function load(name, symbol, dependencies) {
    const [, bytes] = Gio.File.new_for_path(`extension/orbit-dock@niruxx.github.io/${name}.js`).load_contents(null);
    const source = new TextDecoder().decode(bytes).replace(/^import .*;\n/gm, '').replace('export class', 'class');
    return new Function(...Object.keys(dependencies), `${source}\nreturn ${symbol};`)(...Object.values(dependencies));
}
const WindowPreviews = load('windowPreviews', 'WindowPreviews', {Clutter, GLib, St, Main, PopupMenu, global});
const app = new Actor(); app.get_name = () => 'Test';
const icon = new Actor({app});
const dock = {config: {previews: true, previewDelay: 400, previewSize: 240, previewTitles: true, previewPeek: true},
    monitorIndex: 0, side: 0, getAppWindows: () => windows.slice(0, 2), _hideLabel() {}, _updateVisibility() {}};
const previews = new WindowPreviews(dock);
icon.hover = true;
previews.hover(icon);
previews.close(); tick();
assert(!previews._menu, 'Closing must cancel pending hover opens');
previews.hover(icon); previews.forget(icon); tick();
assert(!previews._menu && timers.size === 0, 'Removing an icon must cancel its pending preview');
previews.open(icon);
assert(dock._previewOpen, 'Popup must keep the dock visible');
previews._peek(windows[0]);
assert(windows[1].actor.opacity === 70, 'Peeking must dim other visible windows');
assert(windows[2].actor.opacity === 255, 'Peeking must leave minimized windows alone');
previews._menu.close();
assert(windows[1].actor.opacity === 255 && !dock._previewOpen, 'External popup close must restore opacity');
previews.open(icon);
windows[0].emit('unmanaged');
assert(!previews._menu && previews._signals.length === 0, 'Window removal must clean up popup signals');
assert(windows.every(win => win.signals.size === 0), 'Window handlers must not leak');
previews.open(icon); previews._peek(windows[0]); previews.destroy();
assert(timers.size === 0 && windows[1].actor.opacity === 255, 'Destroy must restore windows and cancel timers');
const ShowDesktop = load('showDesktop', 'ShowDesktop', {Clutter, GLib, St, global});
const desktop = new ShowDesktop(true, () => previews.close());
desktop.actor.emit('clicked');
assert(windows.every(win => win.minimized), 'Desktop toggle must minimize visible windows');
desktop.actor.emit('clicked');
assert(!windows[0].minimized && !windows[1].minimized && windows[2].minimized,
    'Restore must preserve windows that were minimized before the toggle');
desktop.actor.hover = true; desktop.actor.emit('notify::hover'); tick();
assert(windows[0].actor.opacity === 0, 'Desktop hover must temporarily hide visible windows');
global.workspace_manager.emit('active-workspace-changed');
assert(windows[0].actor.opacity === 255, 'Workspace changes must undo desktop peeking');
desktop.actor.emit('notify::hover'); tick(); desktop.actor.destroy();
assert(windows[0].actor.opacity === 255 && timers.size === 0, 'Desktop destruction must restore opacity');
assert(global.workspace_manager.signals.size === 0, 'Desktop workspace signal must not leak');
print('Window interaction lifecycle checks passed');
