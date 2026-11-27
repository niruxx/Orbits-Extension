// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as CtrlAltTab from 'resource:///org/gnome/shell/ui/ctrlAltTab.js';
import * as Volume from 'resource:///org/gnome/shell/ui/status/volume.js';
import {FocusedAppButton} from './appButton.js';
import {GlassLayer} from './glass.js';
import {surfaceEffects} from './effectSettings.js';
import {canSignOut, signOut} from './sessionActions.js';
import {orderedPanelElements, panelGeometry} from './taskbarModel.js';
import {isWindowMaximized, parseHexColor} from './util.js';

/** Temporarily anchor existing GNOME menus to a monitor's proxy button. */
export class TaskbarMenus {
    constructor() { this._leases = new Map(); }
    toggle(menu, source, dock) {
        if (!menu || !source.mapped || Main.overview.visible) return;
        const lease = this._leases.get(menu);
        if (menu.isOpen) {
            menu.close();
            if (lease?.button === source) return;
        }
        const original = menu.sourceActor;
        const side = menu._boxPointer?._userArrowSide;
        menu.sourceActor = source;
        menu._boxPointer?.updateArrowSide(dock.side);
        const signal = menu.connect('open-state-changed', (_m, open) => {
            if (open) return;
            menu.disconnect(signal);
            menu.sourceActor = original;
            if (side !== undefined) menu._boxPointer?.updateArrowSide(side);
            this._leases.delete(menu);
            dock._menusOpen = Math.max(0, dock._menusOpen - 1);
            dock._updateVisibility();
        });
        this._leases.set(menu, {dock, button: source});
        dock._menusOpen++;
        dock._updateVisibility();
        menu.open();
        menu.actor.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
    }
    closeFor(dock) {
        for (const [menu, lease] of [...this._leases]) if (lease.dock === dock) menu.close();
    }
    destroy() { for (const menu of [...this._leases.keys()]) menu.close(); }
}

export class TaskbarPanel {
    constructor(dock) {
        this.dock = dock;
        this._settings = dock._manager.settings;
        this._widgets = [];
        this._roles = new Map();
        this.actor = new St.Widget({name: 'orbitTaskbarContainer', clip_to_allocation: true,
            layout_manager: new Clutter.BinLayout()});
        this.slider = new St.Widget({reactive: true, track_hover: true, x_expand: true, y_expand: true,
            layout_manager: new Clutter.BinLayout()});
        this.body = new St.BoxLayout({name: 'orbitTaskbarPanel', style_class: 'orbit-taskbar orbit-taskbar-panel',
            reactive: true, x_expand: true, y_expand: true,
            orientation: dock.horizontal ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL});
        this.actor._orbitEdge = dock.position;
        this.menuManager = new PopupMenu.PopupMenuManager(this.slider);
        if (surfaceEffects(this._settings, 'panel').enabled) {
            this._glass = new GlassLayer({monitorIndex: dock.monitorIndex,
                ...surfaceEffects(this._settings, 'panel')});
            this.slider.add_child(this._glass.actor);
            this.slider.connect('notify::translation-x', () => this._glass.sync());
            this.slider.connect('notify::translation-y', () => this._glass.sync());
        }
        this.slider.add_child(this.body);
        this.actor.add_child(this.slider);
        Main.ctrlAltTabManager.addGroup(this.body, `Taskbar ${dock.monitorIndex + 1}`, 'view-dual-symbolic', {
            sortGroup: CtrlAltTab.SortGroup.TOP,
            focusCallback: () => {
                if (Main.overview.visible || dock._fullscreen() && !dock.config.fullscreenReveal) return;
                dock.revealFor(); dock._applyTranslation(true, false);
                this.body.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
            },
        });
        Main.layoutManager.addChrome(this.actor, {affectsStruts: dock.panelConfig.mode === 'fixed', trackFullscreen: false});
        this._roles.set('start', dock._showAppsButton);
        this._roles.set('apps', dock._taskbarScroll);
        this._roles.set('desktop', dock._desktopButton?.actor);
        this._roles.set('spacer', this._spacer());
        this._roles.set('spacer2', this._spacer());
        const activities = this._button('Overview', 'view-grid-symbolic', () => {
            if (this._settings.get_string('activities-action') === 'launcher') dock._manager.launcher?.toggle(activities);
            else Main.overview.toggle();
        });
        this._roles.set('activities', activities);
        this.trayBox = new St.BoxLayout({style_class: 'orbit-taskbar-tray',
            orientation: dock.horizontal ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL});
        this._roles.set('tray', this.trayBox);
        this.clock = new St.Button({can_focus: true, style_class: 'orbit-panel-button', accessible_name: 'Calendar and notifications'});
        this._clockLabel = new St.Label({y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.CENTER});
        this.clock.set_child(this._clockLabel);
        this.clock.connect('clicked', () => this.openCalendar());
        this._roles.set('clock', this.clock);
        this.system = new St.Button({can_focus: true, style_class: 'orbit-panel-button', accessible_name: 'System menu'});
        this._systemBox = new St.BoxLayout({orientation: dock.horizontal ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL});
        this._systemBox.set_style(`spacing: ${this._settings.get_int('taskbar-system-icon-spacing')}px;`);
        this.trayBox.set_style(`spacing: ${this._settings.get_int('taskbar-tray-icon-spacing')}px;`);
        const padding = this._settings.get_int('taskbar-status-padding');
        const statusStyle = dock.horizontal ? `padding: 4px ${padding}px;` : `padding: ${padding}px 4px;`;
        this.clock.set_style(statusStyle); this.system.set_style(statusStyle);
        this.system.set_child(this._systemBox);
        this.system.connect('clicked', () => this.openSystem());
        this._roles.set('system', this.system);
        const elements = orderedPanelElements(this._settings.get_strv('taskbar-element-order'),
            this._settings.get_strv('taskbar-hidden-elements'), dock.config.taskbarAlignment === 'center');
        if (elements.includes('app-title')) {
            this._appButton = new FocusedAppButton(this._settings);
            this._appButton._label.set_style(dock.horizontal ? 'max-width: 160px;' : 'max-width: 40px; font-size: 9px;');
            this._registerMenu(this._appButton.menu);
            this._roles.set('app-title', this._appButton.container);
        }
        this._elements = elements.filter(id => id !== 'desktop' || dock.config.showDesktop);
        this._arrange();
        this._makeContextMenu();
        this.slider.connect('button-press-event', (_a, event) => this._press(event));
        this.slider.connect('button-release-event', (_a, event) => this._release(event));
        this.slider.connect('motion-event', (_a, event) => this._motion(event));
        this.slider.connect('scroll-event', (_a, event) => this._scroll(event));
        this.slider.connect('notify::hover', () => dock._onHoverChanged());
        this.actor.connect('notify::allocation', () => dock._queueGeometry());
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._clockSignal = Main.panel.statusArea.dateMenu?._clockDisplay?.connect('notify::text', () => this._syncStatus());
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._syncStatus(); return GLib.SOURCE_CONTINUE;
        });
        this._syncStatus();
    }
    _spacer() { return new St.Widget({x_expand: this.dock.horizontal, y_expand: !this.dock.horizontal}); }
    _button(label, icon, run) {
        const button = new St.Button({can_focus: true, style_class: 'orbit-panel-button', accessible_name: label,
            child: new St.Icon({icon_name: icon, icon_size: 18})});
        button._orbitEdge = this.dock.position;
        button.connect('clicked', run);
        return button;
    }
    _registerMenu(menu) {
        menu._boxPointer?.updateArrowSide(this.dock.side);
        this.menuManager.addMenu(menu);
        menu.connect('open-state-changed', (_m, open) => {
            this.dock._menusOpen = Math.max(0, this.dock._menusOpen + (open ? 1 : -1));
            this.dock._updateVisibility();
        });
    }
    addTrayButton(button) { this.trayBox.add_child(button.container); this._registerMenu(button.menu); this.dock._queueGeometry(); }
    removePlaces() {
        const actor = this._roles.get('places');
        actor?.get_parent()?.remove_child(actor);
        this._roles.delete('places');
    }
    addPlaces(actor) { this._roles.set('places', actor); this._arrange(); }
    _arrange() {
        // Preserve actors (including live menus) while changing their order.
        for (const actor of this._roles.values()) actor?.get_parent()?.remove_child(actor);
        for (const id of this._elements) {
            const actor = this._roles.get(id);
            if (actor) this.body.add_child(actor);
        }
    }
    openCalendar() { this.dock._manager.panelMenus.toggle(Main.panel.statusArea.dateMenu?.menu, this.clock, this.dock); }
    openSystem() { this.dock._manager.panelMenus.toggle(Main.panel.statusArea.quickSettings?.menu, this.system, this.dock); }
    _syncStatus() {
        if (this._destroyed) return;
        const nativeClock = Main.panel.statusArea.dateMenu?._clockDisplay;
        const date = GLib.DateTime.new_now_local();
        const clockText = this.dock.horizontal ? nativeClock?.text || date.format('%H:%M')
            : date.format(this._interface.get_string('clock-format') === '12h' ? '%I\n%M\n%p' : '%H\n%M');
        if (this._clockLabel.text !== clockText) { this._clockLabel.text = clockText; this.dock._queueGeometry(); }
        const source = Main.panel.statusArea.quickSettings?._indicators;
        const nodes = [];
        const collect = actor => {
            if (!actor.visible) return;
            if (actor instanceof St.Icon) nodes.push({icon: actor.gicon, name: actor.icon_name});
            else if (actor instanceof St.Label && actor.text) nodes.push({text: actor.text});
            else actor.get_children().forEach(collect);
        };
        source?.get_children().forEach(collect);
        const key = JSON.stringify(nodes.map(node => node.text ?? node.icon?.to_string() ?? node.name));
        if (key === this._statusKey) return;
        this._statusKey = key;
        this._systemBox.destroy_all_children();
        for (const node of nodes.slice(0, 16)) {
            this._systemBox.add_child(node.text ? new St.Label({text: node.text, y_align: Clutter.ActorAlign.CENTER})
                : new St.Icon({gicon: node.icon ?? Gio.ThemedIcon.new(node.name || 'emblem-system-symbolic'), icon_size: 16}));
        }
        if (!nodes.length) this._systemBox.add_child(new St.Icon({icon_name: 'emblem-system-symbolic', icon_size: 18}));
        this.dock._queueGeometry();
    }
    updateGeometry() {
        if (this._destroyed) return;
        const monitor = Main.layoutManager.monitors[this.dock.monitorIndex];
        if (!monitor) return;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const frame = this._frame = panelGeometry(monitor, this.dock.panelConfig, scale);
        this.actor.set_position(frame.x, frame.y);
        this.actor.set_size(frame.width, frame.height);
        const length = this.dock.horizontal ? frame.width : frame.height;
        const measure = id => {
            const actor = this._roles.get(id);
            if (!actor || !actor.visible) return 0;
            return (this.dock.horizontal ? actor.get_preferred_width(-1) : actor.get_preferred_height(-1))[1] + this._settings.get_int('taskbar-section-spacing') * scale;
        };
        const leading = this._elements.indexOf('spacer2'), trailing = this._elements.indexOf('spacer');
        const centered = this.dock.config.taskbarAlignment === 'center' && leading >= 0 && trailing > leading;
        let balance = 0;
        if (centered) {
            const left = this._elements.slice(0, leading).reduce((sum, id) => sum + measure(id), 0);
            const right = this._elements.slice(trailing + 1).reduce((sum, id) => sum + measure(id), 0);
            balance = Math.abs(left - right);
            for (const [id, amount] of [['spacer2', Math.max(0, right - left)], ['spacer', Math.max(0, left - right)]]) {
                const actor = this._roles.get(id);
                const style = `min-${this.dock.horizontal ? 'width' : 'height'}: ${amount / scale}px;`;
                if (actor._orbitBalanceStyle !== style) { actor._orbitBalanceStyle = style; actor.set_style(style); }
            }
        }
        const used = this._elements.filter(id => !['apps', 'spacer', 'spacer2'].includes(id)).reduce((sum, id) => sum + measure(id), 0);
        const budget = Math.max(16, length - used - balance - 8 * scale) / scale;
        const axis = this.dock.horizontal ? 'width' : 'height';
        const natural = (this.dock.horizontal ? this.dock._box.get_preferred_width(-1) : this.dock._box.get_preferred_height(-1))[1] / scale;
        const style = `${axis}: ${Math.min(natural, budget)}px; max-${axis}: ${budget}px;`;
        if (style !== this._scrollStyle) { this._scrollStyle = style; this.dock._taskbarScroll.set_style(style); }
        this._glass?.sync();
        this.updateBackground();
    }
    updateBackground() {
        if (this._destroyed) return;
        const settings = this._settings;
        const solid = settings.get_string('top-bar-style') === 'dynamic' && this.dock._windowsOverlapDock(true);
        const opacity = solid ? settings.get_double('top-bar-solid-opacity') : settings.get_double('top-bar-transparent-opacity');
        const rgb = parseHexColor(settings.get_boolean('top-bar-use-custom-color') ? settings.get_string('top-bar-color') : '#242428');
        const radius = settings.get_boolean('top-bar-floating') && !solid ? settings.get_int('top-bar-radius') : 0;
        const style = `background-color: rgba(${rgb.join(',')}, ${settings.get_string('top-bar-style') === 'default' ? 0.94 : opacity}); border-radius: ${radius}px; spacing: ${settings.get_int('taskbar-section-spacing')}px;`;
        if (style !== this._style) { this._style = style; this.body.set_style(style); this._glass?.setRadius(radius); }
    }
    _unused(event) {
        let actor = event.get_source();
        while (actor && actor !== this.slider) {
            if (actor instanceof St.Button || actor.can_focus) return false;
            actor = actor.get_parent();
        }
        return actor === this.slider;
    }
    _makeContextMenu() {
        this._context = new PopupMenu.PopupMenu(this.slider, 0.5, this.dock.side);
        Main.uiGroup.add_child(this._context.actor); this._context.actor.hide();
        this._registerMenu(this._context);
        this._context.addAction('Taskbar Settings', () => this.dock._manager.openPreferences());
        this._context.addAction('Overview', () => Main.overview.toggle());
        this._context.addAction('Show Desktop', () => this._desktop());
        const signOut = this._context.addAction('Sign Out…', () => {
            this._context.close();
            signOut();
        });
        this._context.connect('open-state-changed', (_menu, open) => {
            if (open) signOut.setSensitive(canSignOut());
        });
    }
    _desktop() { this.dock._desktopButton?.actor.emit('clicked', 1); }
    _run(action) {
        if (action === 'overview') Main.overview.toggle();
        else if (action === 'desktop') this._desktop();
        else if (action === 'maximize') {
            const window = global.display.focus_window;
            if (window?.can_maximize()) {
                if (isWindowMaximized(window)) window.unmaximize(Meta.MaximizeFlags.BOTH);
                else window.maximize(Meta.MaximizeFlags.BOTH);
            }
        }
    }
    _press(event) {
        if (!this._unused(event)) return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        if (event.get_button() === 3) { this._context.toggle(); return Clutter.EVENT_STOP; }
        this._pressed = {x, y, button: event.get_button()};
        return Clutter.EVENT_PROPAGATE;
    }
    _motion(event) {
        if (!this._pressed || this._pressed.button !== 1 || !this._settings.get_boolean('taskbar-drag-window')) return Clutter.EVENT_PROPAGATE;
        if (!(event.get_state() & Clutter.ModifierType.BUTTON1_MASK)) { this._pressed = null; return Clutter.EVENT_PROPAGATE; }
        const [x, y] = event.get_coords();
        if (Math.hypot(x - this._pressed.x, y - this._pressed.y) < 8) return Clutter.EVENT_PROPAGATE;
        this._pressed = null;
        if (this._clickTimer) { GLib.source_remove(this._clickTimer); this._clickTimer = 0; }
        const window = global.display.focus_window;
        if (!window?.allows_move() || window.get_monitor() !== this.dock.monitorIndex) return Clutter.EVENT_PROPAGATE;
        if (window.begin_grab_op) {
            const backend = global.stage.get_context().get_backend();
            window.begin_grab_op(Meta.GrabOp.MOVING, backend.get_sprite(global.stage, event), event.get_time(), {x, y});
        } else global.display.begin_grab_op(window, Meta.GrabOp.MOVING, true, false, 1, event.get_state(), event.get_time(), x, y);
        return Clutter.EVENT_STOP;
    }
    _release(event) {
        if (!this._pressed || !this._unused(event)) { this._pressed = null; return Clutter.EVENT_PROPAGATE; }
        const button = this._pressed.button; this._pressed = null;
        if (button === 2) this._run(this._settings.get_string('taskbar-middle-click-action'));
        else if (button === 1) {
            if (this._settings.get_string('taskbar-double-click-action') === 'none') {
                this._run(this._settings.get_string('taskbar-click-action'));
                return Clutter.EVENT_STOP;
            }
            if (this._clickTimer) {
                GLib.source_remove(this._clickTimer); this._clickTimer = 0;
                this._run(this._settings.get_string('taskbar-double-click-action'));
            } else this._clickTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
                this._clickTimer = 0; this._run(this._settings.get_string('taskbar-click-action')); return GLib.SOURCE_REMOVE;
            });
        }
        return Clutter.EVENT_STOP;
    }
    _scroll(event) {
        if (!this._unused(event)) return Clutter.EVENT_PROPAGATE;
        const action = this._settings.get_string('taskbar-scroll-action');
        if (action === 'none') return Clutter.EVENT_PROPAGATE;
        const direction = this.dock._scrollDirection(event);
        if (!direction || !this.dock._throttleScroll()) return Clutter.EVENT_STOP;
        if (action === 'volume') {
            const mixer = Volume.getMixerControl(), stream = mixer.get_default_sink();
            if (stream) {
                const max = mixer.get_vol_max_norm();
                stream.volume = Math.max(0, Math.min(max, stream.volume - direction * max * 0.05));
                stream.push_volume();
                stream.change_is_muted(stream.volume === 0);
                const manager = Main.osdWindowManager;
                const icon = Gio.ThemedIcon.new('audio-volume-high-symbolic');
                if (manager.showOne)
                    manager.showOne(this.dock.monitorIndex, icon, null, stream.volume / max);
                else
                    manager.show(this.dock.monitorIndex, icon, null, stream.volume / max);
            }
        } else if (action === 'switch-workspace') {
            const ws = global.workspace_manager.get_active_workspace();
            ws.get_neighbor(direction > 0 ? Meta.MotionDirection.RIGHT : Meta.MotionDirection.LEFT)?.activate(global.get_current_time());
        } else if (action === 'cycle-windows') {
            const windows = global.get_window_actors().map(actor => actor.meta_window).filter(window => !window.skip_taskbar && window.get_monitor() === this.dock.monitorIndex && window.located_on_workspace(global.workspace_manager.get_active_workspace()));
            const index = windows.indexOf(global.display.focus_window);
            if (windows.length) Main.activateWindow(windows[(index + direction + windows.length) % windows.length]);
        }
        return action === 'none' ? Clutter.EVENT_PROPAGATE : Clutter.EVENT_STOP;
    }
    closeMenus() {
        this.dock._manager.panelMenus.closeFor(this.dock);
        this.menuManager.activeMenu?.close();
    }
    destroy() {
        this._destroyed = true;
        this.closeMenus();
        GLib.source_remove(this._timer);
        if (this._clickTimer) GLib.source_remove(this._clickTimer);
        if (this._clockSignal) Main.panel.statusArea.dateMenu._clockDisplay.disconnect(this._clockSignal);
        this._context.close(); this.menuManager.removeMenu(this._context); this._context.destroy();
        this._roles.delete('app-title');
        this._appButton?.destroy();
        // Hidden elements have no parent, so release them explicitly as well.
        for (const actor of this._roles.values()) if (actor && !actor.get_parent()) actor.destroy();
        this.actor.destroy();
    }
}
