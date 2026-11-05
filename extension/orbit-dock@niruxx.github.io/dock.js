// SPDX-License-Identifier: GPL-3.0-or-later
//
// Orbit Dock: a dash-to-dock style dock built on GNOME Shell's own AppIcon,
// so app menus, launching, drag sources and theming match the stock dash.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {GlassLayer} from './glass.js';

const LABEL_SHOW_DELAY = 300;
const SCROLL_THROTTLE_MS = 250;
const MAX_INDICATOR_DOTS = 4;

const SIDES = {
    bottom: St.Side.BOTTOM,
    top: St.Side.TOP,
    left: St.Side.LEFT,
    right: St.Side.RIGHT,
};

const INTELLIHIDE_WINDOW_TYPES = [
    Meta.WindowType.NORMAL,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
    Meta.WindowType.UTILITY,
    Meta.WindowType.TOOLBAR,
    Meta.WindowType.MENU,
    Meta.WindowType.SPLASHSCREEN,
];

function laterAdd(func) {
    return global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
        func();
        return GLib.SOURCE_REMOVE;
    });
}

function laterRemove(id) {
    if (id)
        global.compositor.get_laters().remove(id);
}

function isWindowMaximized(win) {
    if (typeof win.is_maximized === 'function')
        return win.is_maximized();
    return win.get_maximized?.() === Meta.MaximizeFlags.BOTH;
}

function rectsOverlap(a, b) {
    return a.x < b.x + b.width && b.x < a.x + a.width &&
           a.y < b.y + b.height && b.y < a.y + a.height;
}

function parseHexColor(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
    if (!m)
        return [36, 36, 40];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function readConfig(settings) {
    return {
        position: settings.get_string('dock-position'),
        multiMonitor: settings.get_boolean('multi-monitor'),
        extend: settings.get_boolean('extend-to-edge'),
        margin: settings.get_int('margin'),
        mode: settings.get_string('dock-mode'),
        intellihideScope: settings.get_string('intellihide-scope'),
        pressure: settings.get_int('pressure-threshold'),
        hideDelay: settings.get_int('hide-delay'),
        animationTime: settings.get_int('animation-time'),
        iconSize: settings.get_int('icon-size'),
        showFavorites: settings.get_boolean('show-favorites'),
        showRunning: settings.get_boolean('show-running'),
        showAppsButton: settings.get_boolean('show-apps-button'),
        showAppsPosition: settings.get_string('show-apps-position'),
        isolateWorkspaces: settings.get_boolean('isolate-workspaces'),
        isolateMonitors: settings.get_boolean('isolate-monitors'),
        clickAction: settings.get_string('click-action'),
        middleClickAction: settings.get_string('middle-click-action'),
        scrollAction: settings.get_string('scroll-action'),
        indicatorStyle: settings.get_string('indicator-style'),
        opacity: settings.get_double('background-opacity'),
        useCustomColor: settings.get_boolean('use-custom-color'),
        color: settings.get_string('background-color'),
        radius: settings.get_int('border-radius'),
        showAppsAction: settings.get_string('show-apps-action'),
        inPanel: settings.get_boolean('dock-in-panel'),
        panelAtBottom: settings.get_string('top-bar-position') === 'bottom',
        taskbarAlignment: settings.get_string('taskbar-alignment'),
        taskbarIconSize: settings.get_int('taskbar-icon-size'),
        glass: settings.get_boolean('glass-dock'),
        blur: settings.get_int('glass-blur-radius'),
        brightness: settings.get_double('glass-brightness'),
        highlight: settings.get_boolean('glass-highlight'),
    };
}

// An app icon that reuses the shell's AppIcon (menus, launch animation, drag
// source) but delegates clicks/scrolls to the dock and draws its own
// per-window running indicator.
const OrbitAppIcon = GObject.registerClass(
class OrbitAppIcon extends AppDisplay.AppIcon {
    _init(app, dock) {
        this._dock = dock;
        this._indicatorReady = false;

        super._init(app, {
            setSizeManually: true,
            showLabel: false,
            popupMenuSide: dock.side,
        });
        this.add_style_class_name('orbit-dock-app');

        // The stock running dot is replaced by our indicator.
        this._dot.hide();

        const vertical = !dock.horizontal;
        this._indicator = new St.BoxLayout({
            style_class: 'orbit-dock-indicator',
            orientation: vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL,
            x_expand: true,
            y_expand: true,
            x_align: {left: Clutter.ActorAlign.START, right: Clutter.ActorAlign.END}[dock.position] ??
                Clutter.ActorAlign.CENTER,
            y_align: {bottom: Clutter.ActorAlign.END, top: Clutter.ActorAlign.START}[dock.position] ??
                Clutter.ActorAlign.CENTER,
        });
        this._indicator.add_style_class_name(`orbit-${dock.position}`);
        const [dx, dy] = {bottom: [0, 4], top: [0, -4], left: [-4, 0], right: [4, 0]}[dock.position];
        this._indicator.set_translation(dx, dy, 0);
        this._iconContainer.add_child(this._indicator);
        this._indicatorReady = true;

        this.app.connectObject('windows-changed', () => this.updateIndicator(), this);
        this.connect('scroll-event', (_actor, event) => this._dock.onAppScroll(this, event));
        this.updateIndicator();
    }

    _updateRunningStyle() {
        this._dot?.hide();
        if (this._indicatorReady)
            this.updateIndicator();
    }

    updateIndicator() {
        const style = this._dock.config.indicatorStyle;
        const windows = this._dock.getAppWindows(this.app);
        const running = this.app.state !== Shell.AppState.STOPPED;

        let count = 0;
        if (style === 'dots')
            count = Math.min(windows.length || (running ? 1 : 0), MAX_INDICATOR_DOTS);
        else if (style === 'dot' || style === 'line')
            count = running ? 1 : 0;

        this._indicator.destroy_all_children();
        for (let i = 0; i < count; i++) {
            this._indicator.add_child(new St.Widget({
                style_class: style === 'line' ? 'orbit-dock-line' : 'orbit-dock-dot',
            }));
        }

        const focused = Shell.WindowTracker.get_default().focus_app === this.app;
        if (focused)
            this.add_style_class_name('orbit-focused');
        else
            this.remove_style_class_name('orbit-focused');
    }

    activate(button) {
        this._dock.activateApp(this, button);
    }

    getDragActor() {
        return this.app.create_icon_texture(this._dock.iconSize);
    }

    // Behave like the stock DashIcon during drag-and-drop: let the dock box
    // decide where things go.
    scaleAndFade() {}

    undoScaleAndFade() {}

    handleDragOver() {
        return DND.DragMotionResult.CONTINUE;
    }

    acceptDrop() {
        return false;
    }
});

class Dock {
    constructor(manager, monitorIndex) {
        this._manager = manager;
        this.config = manager.config;
        this.monitorIndex = monitorIndex;
        // Taskbar mode: the apps live inside GNOME's top bar, wherever it is.
        this.inPanel = this.config.inPanel;
        this.position = this.inPanel
            ? (this.config.panelAtBottom ? 'bottom' : 'top') : this.config.position;
        this.side = SIDES[this.position] ?? St.Side.BOTTOM;
        this.horizontal = this.position === 'bottom' || this.position === 'top';
        this.iconSize = this.inPanel ? this.config.taskbarIconSize : this.config.iconSize;

        this._icons = new Map();
        this._runningOrder = [];
        this._shown = true;
        this._pointerRevealed = false;
        this._menusOpen = 0;
        this._dragging = false;
        this._lastScroll = 0;
        this._trackedWindows = new Set();

        this._appSystem = Shell.AppSystem.get_default();
        this._tracker = Shell.WindowTracker.get_default();

        if (this.inPanel)
            this._buildPanelActors();
        else
            this._buildActors();
        this._connectSignals();
        if (!this.inPanel)
            this._setupBarrier();

        this._redisplay();
        this._updateVisibility(false);
    }

    // ---- construction -------------------------------------------------

    _buildActors() {
        const orientation = this.horizontal
            ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL;

        // The container is fixed at the screen edge and clips the slider,
        // which is translated off-screen to hide the dock.
        this._container = new St.Widget({
            name: 'orbitDockContainer',
            clip_to_allocation: true,
            layout_manager: new Clutter.BinLayout(),
        });

        this._slider = new St.Widget({
            style_class: `orbit-dock-slider orbit-${this.position}`,
            reactive: true,
            track_hover: true,
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });
        this._slider.set_style(this._marginStyle());

        this._background = new St.BoxLayout({
            style_class: `orbit-dock orbit-${this.position}`,
            orientation,
            x_expand: true,
            y_expand: true,
            // CENTER keeps the natural size; panel mode must FILL the long axis.
            x_align: this.config.extend && this.horizontal
                ? Clutter.ActorAlign.FILL : Clutter.ActorAlign.CENTER,
            y_align: this.config.extend && !this.horizontal
                ? Clutter.ActorAlign.FILL : Clutter.ActorAlign.CENTER,
        });
        this._background.set_style(this._backgroundStyle());
        if (this.config.extend)
            this._background.add_style_class_name('orbit-panel');

        this._box = new St.BoxLayout({
            style_class: 'orbit-dock-box',
            orientation,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box._delegate = this;

        if (this.config.showAppsButton)
            this._showAppsButton = this._createShowAppsButton();

        // start/end: outside the app box (in panel mode it then hugs the screen
        // corner). after-favorites: inside the box, ordered in _redisplay().
        const appsPos = this.config.showAppsPosition;
        if (this._showAppsButton && appsPos === 'start')
            this._background.add_child(this._showAppsButton);
        this._background.add_child(this._box);
        if (this._showAppsButton && appsPos === 'after-favorites')
            this._box.add_child(this._showAppsButton);
        else if (this._showAppsButton && appsPos !== 'start')
            this._background.add_child(this._showAppsButton);

        if (this.config.glass) {
            // Frosted glass sits under the tinted background and follows it.
            this._glass = new GlassLayer({
                monitorIndex: this.monitorIndex,
                radius: this.config.extend ? 0 : this.config.radius,
                blur: this.config.blur,
                brightness: this.config.brightness,
            });
            this._glass.actor.add_constraint(new Clutter.BindConstraint({
                source: this._background, coordinate: Clutter.BindCoordinate.ALL,
            }));
            this._slider.add_child(this._glass.actor);
            this._slider.connect('notify::translation-x', () => this._glass?.sync());
            this._slider.connect('notify::translation-y', () => this._glass?.sync());
            this._container.connect('notify::x', () => this._glass?.sync());
            this._container.connect('notify::y', () => this._glass?.sync());
            if (this.config.highlight)
                this._background.add_style_class_name('orbit-glass-highlight');
        }
        this._slider.add_child(this._background);
        this._container.add_child(this._slider);

        this._label = new St.Label({style_class: 'dash-label orbit-dock-label'});
        this._label.hide();
        Main.layoutManager.addTopChrome(this._label);

        this._container.connect('destroy', () => {
            this._destroyed = true;
            laterRemove(this._redisplayLater);
            laterRemove(this._geometryLater);
            this._redisplayLater = this._geometryLater = 0;
        });
        Main.layoutManager.addChrome(this._container, {
            affectsStruts: this.config.mode === 'fixed',
            trackFullscreen: true,
        });

        this._slider.connect('notify::hover', () => this._onHoverChanged());
        this._slider.connect('scroll-event', (_a, event) => this._onDockScroll(event));
        this._slider.connect('style-changed', () => this._queueGeometry());
        // Content size changes (apps opening/closing, icons getting styled)
        // re-allocate the container; re-centre it when that happens.
        this._container.connect('notify::allocation', () => this._queueGeometry());
    }

    /** Taskbar mode: start button + app icons inside GNOME's top bar. */
    _buildPanelActors() {
        this._background = new St.BoxLayout({
            style_class: `orbit-taskbar orbit-${this.position}`,
            reactive: true,
            y_align: Clutter.ActorAlign.FILL,
        });
        this._box = new St.BoxLayout({style_class: 'orbit-dock-box orbit-taskbar-box'});
        this._box._delegate = this;

        if (this.config.showAppsButton)
            this._showAppsButton = this._createShowAppsButton();
        const appsPos = this.config.showAppsPosition;
        if (this._showAppsButton && appsPos === 'start')
            this._background.add_child(this._showAppsButton);
        this._background.add_child(this._box);
        if (this._showAppsButton && appsPos === 'after-favorites')
            this._box.add_child(this._showAppsButton);
        else if (this._showAppsButton && appsPos !== 'start')
            this._background.add_child(this._showAppsButton);

        const target = this.config.taskbarAlignment === 'center'
            ? Main.panel._centerBox : Main.panel._leftBox;
        if (target === Main.panel._centerBox)
            target.insert_child_at_index(this._background, 0);
        else
            target.add_child(this._background);

        this._label = new St.Label({style_class: 'dash-label orbit-dock-label'});
        this._label.hide();
        Main.layoutManager.addTopChrome(this._label);

        this._background.connect('destroy', () => {
            this._destroyed = true;
            laterRemove(this._redisplayLater);
            laterRemove(this._geometryLater);
            this._redisplayLater = this._geometryLater = 0;
        });
        this._background.connect('scroll-event', (_a, event) => this._onDockScroll(event));
    }

    _marginStyle() {
        // A panel sits flush against the screen edge.
        const m = this.config.extend ? 0 : this.config.margin;
        return `padding-${this.position}: ${m}px;`;
    }

    _backgroundStyle() {
        const c = this.config;
        const parts = [];
        if (c.useCustomColor) {
            const [r, g, b] = parseHexColor(c.color);
            parts.push(`background-color: rgba(${r}, ${g}, ${b}, ${c.opacity});`);
        } else {
            parts.push(`background-color: rgba(36, 36, 40, ${c.opacity});`);
        }
        if (c.extend) {
            // Square panel with a hairline only on the side facing the screen.
            const inner = {bottom: 'top', top: 'bottom', left: 'right', right: 'left'}[this.position];
            parts.push('border-radius: 0; border-width: 0;');
            parts.push(`border-${inner}-width: 1px;`);
        } else {
            parts.push(`border-radius: ${c.radius}px;`);
        }
        return parts.join(' ');
    }

    _createShowAppsButton() {
        const icon = new St.Icon({
            icon_name: 'view-app-grid-symbolic',
            icon_size: this.iconSize,
            style_class: 'orbit-dock-show-apps-icon',
        });
        const button = new St.Button({
            style_class: 'orbit-dock-show-apps',
            toggle_mode: true,
            can_focus: true,
            track_hover: true,
            child: icon,
        });
        button._orbitIcon = icon;
        button._orbitLabel = 'Show Apps';

        button.connect('clicked', () => {
            this._hideLabel();
            if (this.config.showAppsAction === 'launcher') {
                button.checked = false;
                this._manager.launcher?.toggle(button);
                return;
            }
            if (Main.overview.visible && Main.overview.dash.showAppsButton.checked)
                Main.overview.hide();
            else
                Main.overview.showApps();
        });
        button.connect('notify::hover', () => this._syncLabel(button));

        const syncChecked = () => {
            button.checked = Main.overview.visible &&
                Main.overview.dash.showAppsButton.checked;
        };
        Main.overview.dash.showAppsButton.connectObject('notify::checked', syncChecked, button);
        Main.overview.connectObject('hidden', syncChecked, button);

        // Dropping a pinned app onto the button unpins it.
        button._delegate = {
            handleDragOver: source => {
                const app = source?.app;
                return app && AppFavorites.getAppFavorites().isFavorite(app.get_id())
                    ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.NO_DROP;
            },
            acceptDrop: source => {
                const app = source?.app;
                if (!app || !AppFavorites.getAppFavorites().isFavorite(app.get_id()))
                    return false;
                const id = app.get_id();
                laterAdd(() => AppFavorites.getAppFavorites().removeFavorite(id));
                return true;
            },
        };
        return button;
    }

    _connectSignals() {
        const queue = () => this._queueRedisplay();

        AppFavorites.getAppFavorites().connectObject('changed', queue, this);
        this._appSystem.connectObject(
            'installed-changed', queue,
            'app-state-changed', queue, this);
        this._tracker.connectObject('notify::focus-app', () => {
            this._icons.forEach(icon => icon.updateIndicator());
            this._queueIntellihide();
        }, this);

        global.workspace_manager.connectObject('active-workspace-changed', () => {
            this._queueRedisplay();
            this._queueIntellihide();
        }, this);

        global.display.connectObject(
            'window-created', (_d, win) => {
                this._trackWindow(win);
                this._queueIntellihide();
            },
            'restacked', () => this._queueIntellihide(),
            'notify::focus-window', () => this._queueIntellihide(),
            'grab-op-end', () => this._queueIntellihide(),
            this);
        global.get_window_actors().forEach(actor => this._trackWindow(actor.meta_window));

        Main.overview.connectObject(
            'showing', () => this._updateVisibility(),
            'hidden', () => this._updateVisibility(),
            'item-drag-begin', () => {
                this._dragging = true;
                this._updateVisibility();
            },
            'item-drag-end', () => {
                this._dragging = false;
                this._updateVisibility();
            },
            'item-drag-cancelled', () => {
                this._dragging = false;
                this._updateVisibility();
            },
            this);
    }

    _trackWindow(win) {
        if (!win || this._trackedWindows.has(win))
            return;
        this._trackedWindows.add(win);
        const update = () => {
            this._queueIntellihide();
            if (this.config.isolateMonitors || this.config.isolateWorkspaces)
                this._queueRedisplay();
        };
        win.connectObject(
            'position-changed', () => this._queueIntellihide(),
            'size-changed', () => this._queueIntellihide(),
            'notify::minimized', () => this._queueIntellihide(),
            'workspace-changed', update,
            'notify::skip-taskbar', update,
            'unmanaged', () => {
                win.disconnectObject(this);
                this._trackedWindows.delete(win);
                this._queueIntellihide();
            },
            this);
    }

    _setupBarrier() {
        if (this.config.mode === 'fixed')
            return;

        const monitor = Main.layoutManager.monitors[this.monitorIndex];
        if (!monitor)
            return;

        this._pressureBarrier = new Layout.PressureBarrier(
            Math.max(this.config.pressure, 1), 1000,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW);
        this._pressureBarrier.connect('trigger', () => {
            this._pointerRevealed = true;
            this._updateVisibility();
        });

        const {x, y, width, height} = monitor;
        let params;
        switch (this.position) {
        case 'top':
            params = {x1: x, x2: x + width, y1: y, y2: y, directions: Meta.BarrierDirection.POSITIVE_Y};
            break;
        case 'left':
            params = {x1: x, x2: x, y1: y, y2: y + height, directions: Meta.BarrierDirection.POSITIVE_X};
            break;
        case 'right':
            params = {x1: x + width, x2: x + width, y1: y, y2: y + height, directions: Meta.BarrierDirection.NEGATIVE_X};
            break;
        default:
            params = {x1: x, x2: x + width, y1: y + height, y2: y + height, directions: Meta.BarrierDirection.NEGATIVE_Y};
        }
        this._barrier = new Meta.Barrier({backend: global.backend, ...params});
        this._pressureBarrier.addBarrier(this._barrier);
    }

    // ---- app list -----------------------------------------------------

    getAppWindows(app) {
        const ws = global.workspace_manager.get_active_workspace();
        return app.get_windows().filter(w =>
            !w.skip_taskbar &&
            (!this.config.isolateWorkspaces || w.located_on_workspace(ws)) &&
            (!this.config.isolateMonitors || w.get_monitor() === this.monitorIndex));
    }

    _queueRedisplay() {
        if (this._redisplayLater)
            return;
        this._redisplayLater = laterAdd(() => {
            this._redisplayLater = 0;
            this._redisplay();
        });
    }

    _redisplay() {
        // The shell can dispose our actors at shutdown without disable().
        if (this._destroyed)
            return;
        const favMap = AppFavorites.getAppFavorites().getFavoriteMap();
        const favorites = this.config.showFavorites ? Object.values(favMap) : [];
        const favIds = new Set(favorites.map(a => a.get_id()));

        let running = [];
        if (this.config.showRunning) {
            const isolate = this.config.isolateWorkspaces || this.config.isolateMonitors;
            running = this._appSystem.get_running().filter(app =>
                !favIds.has(app.get_id()) &&
                (!isolate || this.getAppWindows(app).length > 0));
        }

        // Keep running apps in first-seen order so icons don't jump around.
        const runningIds = new Set(running.map(a => a.get_id()));
        this._runningOrder = this._runningOrder.filter(id => runningIds.has(id));
        for (const app of running) {
            if (!this._runningOrder.includes(app.get_id()))
                this._runningOrder.push(app.get_id());
        }
        const runningById = new Map(running.map(a => [a.get_id(), a]));
        const orderedRunning = this._runningOrder.map(id => runningById.get(id));

        const apps = [...favorites, ...orderedRunning];
        const wanted = new Set(apps.map(a => a.get_id()));

        for (const [id, icon] of this._icons) {
            if (!wanted.has(id)) {
                icon.destroy();
                this._icons.delete(id);
            }
        }

        if (this._separator && (!favorites.length || !orderedRunning.length)) {
            this._separator.destroy();
            this._separator = null;
        }
        if (!this._separator && favorites.length && orderedRunning.length) {
            this._separator = new St.Widget({
                style_class: `orbit-dock-separator orbit-${this.horizontal ? 'horizontal' : 'vertical'}`,
            });
            this._box.add_child(this._separator);
        }

        const ordered = [];
        const buttonInBox = this._showAppsButton?.get_parent() === this._box;
        apps.forEach((app, i) => {
            if (i === favorites.length) {
                if (buttonInBox)
                    ordered.push(this._showAppsButton);
                if (this._separator)
                    ordered.push(this._separator);
            }
            ordered.push(this._getOrCreateIcon(app));
        });
        if (buttonInBox && apps.length === favorites.length)
            ordered.push(this._showAppsButton); // no running apps: right after the pinned ones
        ordered.forEach((actor, i) => this._box.set_child_at_index(actor, i));
        this._icons.forEach(icon => icon.updateIndicator());

        this._applyIconSize(this.inPanel ? this.config.taskbarIconSize : this.config.iconSize);
        this._queueGeometry();
    }

    _getOrCreateIcon(app) {
        const id = app.get_id();
        let icon = this._icons.get(id);
        if (icon)
            return icon;

        icon = new OrbitAppIcon(app, this);
        icon.label_actor = null;
        icon.accessible_name = app.get_name();
        icon._orbitLabel = app.get_name();
        icon.icon.setIconSize(this.iconSize);
        icon.connect('notify::hover', () => this._syncLabel(icon));
        icon.connect('sync-tooltip', () => this._syncLabel(icon));
        icon.connect('clicked', () => this._hideLabel());
        icon.connect('menu-state-changed', (_i, open) => {
            this._menusOpen = Math.max(0, this._menusOpen + (open ? 1 : -1));
            if (open)
                this._hideLabel();
            this._updateVisibility();
        });
        icon.connect('destroy', () => {
            if (this._labelSource === icon)
                this._hideLabel();
        });
        this._icons.set(id, icon);
        this._box.add_child(icon);
        return icon;
    }

    _applyIconSize(size) {
        this.iconSize = size;
        this._icons.forEach(icon => icon.icon.setIconSize(size));
        if (this._showAppsButton)
            this._showAppsButton._orbitIcon.icon_size = size;
    }

    // ---- geometry -----------------------------------------------------

    _queueGeometry() {
        if (this._geometryLater)
            return;
        this._geometryLater = laterAdd(() => {
            this._geometryLater = 0;
            this._updateGeometry();
        });
    }

    _availableArea(monitor) {
        // Leave room for the top bar on the primary monitor (it may be at the
        // top or, in taskbar layouts, at the bottom).
        const panel = this.monitorIndex === Main.layoutManager.primaryIndex &&
            Main.panel.visible ? Main.panel.height : 0;
        const top = this.config.panelAtBottom ? 0 : panel;
        const bottom = this.config.panelAtBottom ? panel : 0;
        if (this.horizontal) {
            const t = this.position === 'top' ? top : 0;
            const b = this.position === 'bottom' ? bottom : 0;
            return {x: monitor.x, width: monitor.width, y: monitor.y + t, height: monitor.height - t - b};
        }
        return {
            x: monitor.x, width: monitor.width,
            y: monitor.y + top, height: monitor.height - top - bottom,
        };
    }

    _updateGeometry(shrinkPass = false) {
        if (this._destroyed || this.inPanel)
            return;
        const monitor = Main.layoutManager.monitors[this.monitorIndex];
        if (!monitor)
            return;
        const area = this._availableArea(monitor);
        const extend = this.config.extend;

        // The container follows its content's natural size (so it grows and
        // shrinks as apps come and go); only panel mode pins the long axis.
        if (this.horizontal) {
            this._container.set_width(extend ? area.width : -1);
            this._container.set_height(-1);
        } else {
            this._container.set_width(-1);
            this._container.set_height(extend ? area.height : -1);
        }

        const [, natW] = this._container.get_preferred_width(-1);
        const [, natH] = this._container.get_preferred_height(natW);

        // Shrink icons when the dock doesn't fit along its edge.
        const length = this.horizontal ? natW : natH;
        const available = this.horizontal ? area.width : area.height;
        if (!shrinkPass && !extend && length > available && this.iconSize > 16) {
            const count = Math.max(this._icons.size + (this._showAppsButton ? 1 : 0), 1);
            const overflowPerIcon = (length - available) / count;
            this._applyIconSize(Math.max(16, Math.floor(this.iconSize - overflowPerIcon - 2)));
            this._updateGeometry(true);
            return;
        }

        let x, y;
        if (this.horizontal) {
            const w = Math.min(natW, area.width);
            if (w < natW)
                this._container.set_width(w);
            x = area.x + Math.round((area.width - w) / 2);
            y = this.position === 'top' ? area.y : area.y + area.height - natH;
        } else {
            const h = Math.min(natH, area.height);
            if (h < natH)
                this._container.set_height(h);
            y = area.y + Math.round((area.height - h) / 2);
            x = this.position === 'left' ? area.x : area.x + area.width - natW;
        }

        this._container.set_position(x, y);
        if (!this._shown)
            this._applyTranslation(false, false);
        this._queueIntellihide();
    }

    _dockRect() {
        const [x, y] = this._container.get_transformed_position();
        const [width, height] = this._container.get_transformed_size();
        return {x, y, width, height};
    }

    // ---- visibility ---------------------------------------------------

    _onHoverChanged() {
        if (this._slider.hover) {
            this._cancelHideTimeout();
            this._updateVisibility();
            return;
        }
        this._hideLabel();
        this._cancelHideTimeout();
        this._hideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            Math.max(this.config.hideDelay, 1), () => {
                this._hideTimeoutId = 0;
                if (!this._slider.hover)
                    this._pointerRevealed = false;
                this._updateVisibility();
                return GLib.SOURCE_REMOVE;
            });
    }

    _cancelHideTimeout() {
        if (this._hideTimeoutId) {
            GLib.source_remove(this._hideTimeoutId);
            this._hideTimeoutId = 0;
        }
    }

    _queueIntellihide() {
        if (this.inPanel || this.config.mode !== 'intellihide' || this._intellihideId)
            return;
        this._intellihideId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
            this._intellihideId = 0;
            this._updateVisibility();
            return GLib.SOURCE_REMOVE;
        });
    }

    _windowsOverlapDock() {
        const rect = this._dockRect();
        if (rect.width <= 0 || rect.height <= 0)
            return false;

        const ws = global.workspace_manager.get_active_workspace();
        const scope = this.config.intellihideScope;
        const focusApp = this._tracker.focus_app;

        return global.get_window_actors().some(actor => {
            const win = actor.meta_window;
            if (!win || win.minimized || !win.showing_on_its_workspace?.())
                return false;
            if (!win.located_on_workspace(ws))
                return false;
            if (!INTELLIHIDE_WINDOW_TYPES.includes(win.get_window_type()))
                return false;
            if (scope === 'focus-app' && this._tracker.get_window_app(win) !== focusApp)
                return false;
            if (scope === 'maximized' && !isWindowMaximized(win))
                return false;
            return rectsOverlap(win.get_frame_rect(), rect);
        });
    }

    _shouldShow() {
        if (this.config.mode === 'fixed')
            return true;
        if (Main.overview.visibleTarget || this._menusOpen > 0 || this._dragging)
            return true;
        if (this._slider.hover || this._pointerRevealed)
            return true;
        if (this.config.mode === 'autohide')
            return false;
        return !this._windowsOverlapDock();
    }

    _updateVisibility(animate = true) {
        if (this.inPanel)
            return; // the taskbar is always shown with the bar
        const show = this._shouldShow();
        if (show === this._shown)
            return;
        this._shown = show;
        this._applyTranslation(show, animate);
    }

    _applyTranslation(show, animate) {
        const [w, h] = this._container.get_size();
        const offsets = {
            bottom: [0, h], top: [0, -h], left: [-w, 0], right: [w, 0],
        };
        const [tx, ty] = show ? [0, 0] : offsets[this.position];
        this._slider.remove_all_transitions();
        this._slider.ease({
            translation_x: tx,
            translation_y: ty,
            duration: animate ? this.config.animationTime : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    // ---- labels -------------------------------------------------------

    _syncLabel(item) {
        const hovered = item.hover && !(item._menu?.isOpen);
        if (hovered) {
            if (this._labelTimeoutId)
                GLib.source_remove(this._labelTimeoutId);
            this._labelTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                this._labelShowing ? 0 : LABEL_SHOW_DELAY, () => {
                    this._labelTimeoutId = 0;
                    if (item.hover)
                        this._showLabel(item);
                    return GLib.SOURCE_REMOVE;
                });
        } else if (this._labelSource === item) {
            this._hideLabel();
        }
    }

    _showLabel(item) {
        if (!item._orbitLabel || !item.get_stage())
            return;
        this._labelSource = item;
        this._labelShowing = true;
        this._label.set_text(item._orbitLabel);
        this._label.opacity = 0;
        this._label.show();

        const [ix, iy] = item.get_transformed_position();
        const [iw, ih] = item.get_transformed_size();
        const lw = this._label.width;
        const lh = this._label.height;
        const gap = 8;

        let x, y;
        switch (this.position) {
        case 'top':
            x = ix + (iw - lw) / 2;
            y = iy + ih + gap;
            break;
        case 'left':
            x = ix + iw + gap;
            y = iy + (ih - lh) / 2;
            break;
        case 'right':
            x = ix - lw - gap;
            y = iy + (ih - lh) / 2;
            break;
        default:
            x = ix + (iw - lw) / 2;
            y = iy - lh - gap;
        }
        x = Math.clamp(Math.round(x), 0, global.stage.width - lw);
        y = Math.clamp(Math.round(y), 0, global.stage.height - lh);
        this._label.set_position(x, y);
        this._label.ease({opacity: 255, duration: 150, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    _hideLabel() {
        if (this._labelTimeoutId) {
            GLib.source_remove(this._labelTimeoutId);
            this._labelTimeoutId = 0;
        }
        this._labelSource = null;
        this._labelShowing = false;
        this._label.ease({
            opacity: 0,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this._label.hide(),
        });
    }

    // ---- actions ------------------------------------------------------

    _sortedWindows(app) {
        return this.getAppWindows(app).sort((a, b) =>
            a.get_stable_sequence() - b.get_stable_sequence());
    }

    _cycle(app, direction = 1) {
        const windows = this._sortedWindows(app);
        if (!windows.length)
            return;
        const focused = global.display.focus_window;
        const idx = windows.indexOf(focused);
        const next = idx < 0 ? 0 : (idx + direction + windows.length) % windows.length;
        Main.activateWindow(windows[next]);
    }

    activateApp(icon, button) {
        const app = icon.app;
        const event = Clutter.get_current_event();
        const modifiers = event ? event.get_state() : 0;
        const ctrl = (modifiers & Clutter.ModifierType.CONTROL_MASK) !== 0;
        const shift = (modifiers & Clutter.ModifierType.SHIFT_MASK) !== 0;
        const windows = this.getAppWindows(app);
        const wasOverview = Main.overview.visible;

        if (button === Clutter.BUTTON_MIDDLE) {
            this._middleClick(icon, windows);
            return;
        }

        if (ctrl || shift || !windows.length || this.config.clickAction === 'launch') {
            icon.animateLaunch();
            if (windows.length && app.can_open_new_window())
                app.open_new_window(-1);
            else
                app.activate();
            Main.overview.hide();
            return;
        }

        if (wasOverview) {
            Main.activateWindow(windows[0]);
            Main.overview.hide();
            return;
        }

        const focusedIsOurs = windows.includes(global.display.focus_window);
        switch (this.config.clickAction) {
        case 'cycle-windows':
            if (focusedIsOurs)
                this._cycle(app);
            else
                Main.activateWindow(windows[0]);
            break;
        case 'focus-or-minimize-all':
            if (focusedIsOurs) {
                windows.forEach(w => w.minimize());
            } else {
                const time = global.get_current_time();
                [...windows].reverse().forEach(w => w.activate(time));
            }
            break;
        default: // focus-or-minimize
            if (!focusedIsOurs)
                Main.activateWindow(windows[0]);
            else if (windows.length === 1)
                windows[0].minimize();
            else
                this._cycle(app);
        }
    }

    _middleClick(icon, windows) {
        const app = icon.app;
        switch (this.config.middleClickAction) {
        case 'new-window':
            icon.animateLaunch();
            if (app.can_open_new_window())
                app.open_new_window(-1);
            else
                app.activate();
            Main.overview.hide();
            break;
        case 'minimize':
            windows.forEach(w => w.minimize());
            break;
        case 'quit':
            app.request_quit();
            break;
        }
    }

    _throttleScroll() {
        const now = GLib.get_monotonic_time() / 1000;
        if (now - this._lastScroll < SCROLL_THROTTLE_MS)
            return false;
        this._lastScroll = now;
        return true;
    }

    _scrollDirection(event) {
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
        case Clutter.ScrollDirection.LEFT:
            return -1;
        case Clutter.ScrollDirection.DOWN:
        case Clutter.ScrollDirection.RIGHT:
            return 1;
        case Clutter.ScrollDirection.SMOOTH: {
            const [dx, dy] = event.get_scroll_delta();
            const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
            if (Math.abs(d) < 0.5)
                return 0;
            return d > 0 ? 1 : -1;
        }
        }
        return 0;
    }

    onAppScroll(icon, event) {
        if (this.config.scrollAction !== 'cycle-windows')
            return Clutter.EVENT_PROPAGATE;
        const dir = this._scrollDirection(event);
        if (dir && this._throttleScroll())
            this._cycle(icon.app, dir);
        return Clutter.EVENT_STOP;
    }

    _onDockScroll(event) {
        if (this.config.scrollAction !== 'switch-workspace')
            return Clutter.EVENT_PROPAGATE;
        const dir = this._scrollDirection(event);
        if (!dir || !this._throttleScroll())
            return Clutter.EVENT_STOP;
        const ws = global.workspace_manager.get_active_workspace();
        const target = ws.get_neighbor(dir > 0 ? Meta.MotionDirection.RIGHT : Meta.MotionDirection.LEFT);
        if (target && target !== ws)
            target.activate(global.get_current_time());
        return Clutter.EVENT_STOP;
    }

    // ---- drag and drop (DND delegate for this._box) ---------------------

    _dropIndex(x, y) {
        const coord = this.horizontal ? x : y;
        let index = 0;
        for (const child of this._box.get_children()) {
            if (!(child instanceof OrbitAppIcon) ||
                !AppFavorites.getAppFavorites().isFavorite(child.app.get_id()))
                continue;
            const box = child.get_allocation_box();
            const center = this.horizontal ? (box.x1 + box.x2) / 2 : (box.y1 + box.y2) / 2;
            if (coord > center)
                index++;
        }
        return index;
    }

    handleDragOver(source) {
        const app = source?.app;
        if (!app || app.is_window_backed() || !global.settings.is_writable('favorite-apps'))
            return DND.DragMotionResult.NO_DROP;
        return AppFavorites.getAppFavorites().isFavorite(app.get_id())
            ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.COPY_DROP;
    }

    acceptDrop(source, _actor, x, y) {
        const app = source?.app;
        if (!app || app.is_window_backed() || !global.settings.is_writable('favorite-apps'))
            return false;
        const id = app.get_id();
        const favorites = AppFavorites.getAppFavorites();
        let pos = this._dropIndex(x, y);
        laterAdd(() => {
            if (favorites.isFavorite(id)) {
                // moveFavoriteToPos removes before inserting, so account for
                // the app's own slot when moving it to the right.
                const current = Object.keys(favorites.getFavoriteMap()).indexOf(id);
                if (current >= 0 && current < pos)
                    pos--;
                favorites.moveFavoriteToPos(id, pos);
            } else {
                favorites.addFavoriteAtPos(id, pos);
            }
        });
        return true;
    }

    // ---- teardown -----------------------------------------------------

    destroy() {
        this._cancelHideTimeout();
        for (const id of ['_intellihideId', '_labelTimeoutId']) {
            if (this[id]) {
                GLib.source_remove(this[id]);
                this[id] = 0;
            }
        }
        laterRemove(this._redisplayLater);
        laterRemove(this._geometryLater);
        this._redisplayLater = this._geometryLater = 0;

        if (this._pressureBarrier) {
            this._pressureBarrier.removeBarrier(this._barrier);
            this._barrier.destroy();
            this._pressureBarrier.destroy();
            this._pressureBarrier = null;
            this._barrier = null;
        }

        AppFavorites.getAppFavorites().disconnectObject(this);
        this._appSystem.disconnectObject(this);
        this._tracker.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);
        global.display.disconnectObject(this);
        Main.overview.disconnectObject(this);
        this._trackedWindows.forEach(w => w.disconnectObject(this));
        this._trackedWindows.clear();

        this._icons.clear();
        this._label.destroy();
        (this._container ?? this._background).destroy();
    }
}

// Keys owned by the other Orbit Shell parts; changing them must not rebuild docks.
const NON_DOCK_KEY = /^(top-bar-|launcher-|tray-|app-button-|super-key-action|activities-action|skip-startup-overview|glass-top-bar|glass-launcher)/;

export class DockManager {
    constructor(settings, launcher = null) {
        this.settings = settings;
        this.launcher = launcher;
        this.config = readConfig(settings);
        this._docks = [];

        this.settings.connectObject('changed', (_s, key) => {
            this.config = readConfig(settings);
            if (NON_DOCK_KEY.test(key) && key !== 'top-bar-position')
                return;
            if (key === 'hide-overview-dash')
                this._syncOverviewDash();
            else
                this._queueRebuild();
        }, this);

        Main.layoutManager.connectObject('monitors-changed', () => this._queueRebuild(), this);

        if (Main.layoutManager._startingUp) {
            Main.layoutManager.connectObject('startup-complete', () => this._build(), this);
        } else {
            this._build();
        }
    }

    _queueRebuild() {
        // Settings sliders fire many changes; rebuild once they settle.
        if (this._rebuildId)
            GLib.source_remove(this._rebuildId);
        this._rebuildId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            this._rebuildId = 0;
            this._build();
            return GLib.SOURCE_REMOVE;
        });
    }

    _build() {
        this._destroyDocks();
        const monitors = Main.layoutManager.monitors;
        const indices = this.config.multiMonitor && !this.config.inPanel
            ? monitors.map((_m, i) => i)
            : [Main.layoutManager.primaryIndex];
        for (const i of indices) {
            try {
                this._docks.push(new Dock(this, i));
            } catch (e) {
                logError(e, `Orbit Dock: failed to create dock on monitor ${i}`);
            }
        }
        this._syncOverviewDash();
    }

    _syncOverviewDash() {
        const dash = Main.overview.dash;
        if (this.settings.get_boolean('hide-overview-dash') && this._docks.length) {
            dash.hide();
            dash.set_height(0);
        } else {
            dash.set_height(-1);
            dash.show();
        }
    }

    _destroyDocks() {
        this._docks.forEach(d => d.destroy());
        this._docks = [];
    }

    destroy() {
        if (this._rebuildId) {
            GLib.source_remove(this._rebuildId);
            this._rebuildId = 0;
        }
        this.settings.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._destroyDocks();
        const dash = Main.overview.dash;
        dash.set_height(-1);
        dash.show();
        this.settings = null;
    }
}
