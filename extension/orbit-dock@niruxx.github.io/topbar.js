// SPDX-License-Identifier: GPL-3.0-or-later
//
// Top bar customisation: dynamic transparency (solid only when a window
// touches it), translucent/custom colours, a floating rounded look, frosted
// glass, hiding Activities and moving the clock.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {GlassLayer} from './glass.js';
import {WindowWatcher, isWindowMaximized, parseHexColor, visibleWorkspaceWindows} from './util.js';

export const TOP_BAR_KEYS = new Set([
    'top-bar-style', 'top-bar-dynamic-trigger', 'top-bar-solid-opacity',
    'top-bar-transparent-opacity', 'top-bar-use-custom-color', 'top-bar-color',
    'top-bar-floating', 'top-bar-radius', 'top-bar-transition',
    'top-bar-hide-activities', 'top-bar-clock-position',
    'glass-top-bar', 'glass-blur-radius', 'glass-brightness', 'glass-highlight',
]);

const TOUCH_SLACK = 4;      // px below the bar that still counts as touching
const FLOAT_INSET_X = 6;
const FLOAT_INSET_Y = 3;

function readConfig(s) {
    return {
        style: s.get_string('top-bar-style'),
        trigger: s.get_string('top-bar-dynamic-trigger'),
        solidOpacity: s.get_double('top-bar-solid-opacity'),
        transparentOpacity: s.get_double('top-bar-transparent-opacity'),
        useCustomColor: s.get_boolean('top-bar-use-custom-color'),
        color: s.get_string('top-bar-color'),
        floating: s.get_boolean('top-bar-floating'),
        radius: s.get_int('top-bar-radius'),
        transition: s.get_int('top-bar-transition'),
        hideActivities: s.get_boolean('top-bar-hide-activities'),
        clockPosition: s.get_string('top-bar-clock-position'),
        glass: s.get_boolean('glass-top-bar'),
        blur: s.get_int('glass-blur-radius'),
        brightness: s.get_double('glass-brightness'),
        highlight: s.get_boolean('glass-highlight'),
    };
}

export class TopBarManager {
    constructor(settings) {
        this._settings = settings;
        this._settings.connectObject('changed', (_s, key) => {
            if (TOP_BAR_KEYS.has(key))
                this._queueReload();
        }, this);
        this._build();
    }

    _queueReload() {
        if (this._reloadId)
            GLib.source_remove(this._reloadId);
        this._reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            this._reloadId = 0;
            this._teardown();
            this._build();
            return GLib.SOURCE_REMOVE;
        });
    }

    _build() {
        const c = this._config = readConfig(this._settings);

        this._applyActivities(c.hideActivities);
        this._applyClock(c.clockPosition);

        // Default look without glass: leave the theme alone.
        if (c.style === 'default' && !c.glass)
            return;

        // The panel itself goes transparent (via a style class: the overview
        // owns Main.panel.style and resets it); our own background actor sits
        // right below it in the chrome and does the drawing.
        Main.panel.add_style_class_name('orbit-top-bar');

        this._bg = new St.Widget({
            name: 'orbitTopBarBackground',
            layout_manager: new Clutter.BinLayout(),
        });
        if (c.glass) {
            this._glass = new GlassLayer({
                monitorIndex: Main.layoutManager.primaryIndex,
                blur: c.blur,
                brightness: c.brightness,
            });
            this._bg.add_child(this._glass.actor);
            this._bg.connect('notify::x', () => this._glass?.sync());
            this._bg.connect('notify::y', () => this._glass?.sync());
        }
        this._tint = new St.Widget({style_class: 'orbit-top-bar-tint', x_expand: true, y_expand: true});
        this._bg.add_child(this._tint);

        const panelBox = Main.layoutManager.panelBox;
        Main.layoutManager.uiGroup.insert_child_below(this._bg, panelBox);

        panelBox.connectObject(
            'notify::allocation', () => this._update(false),
            'notify::visible', () => this._update(false),
            this);
        Main.overview.connectObject(
            'showing', () => this._update(),
            'hidden', () => this._update(),
            this);
        Main.sessionMode.connectObject('updated', () => this._update(false), this);
        Main.layoutManager.connectObject('monitors-changed', () => this._queueReload(), this);

        if (c.style === 'dynamic')
            this._watcher = new WindowWatcher(() => this._update());

        this._state = null;
        this._update(false);
    }

    _isSolid() {
        const c = this._config;
        // Only Dynamic switches between two opacities. Translucent (and the
        // theme-default style with glass) always use the main opacity.
        if (c.style !== 'dynamic')
            return false;

        const panelBox = Main.layoutManager.panelBox;
        const [, py] = panelBox.get_transformed_position();
        const bottom = py + panelBox.height;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const primary = Main.layoutManager.primaryIndex;

        return visibleWorkspaceWindows()
            .filter(w => w.get_monitor() === primary)
            .some(w => c.trigger === 'maximized'
                ? isWindowMaximized(w)
                : w.get_frame_rect().y <= bottom + TOUCH_SLACK * scale);
    }

    _update(animate = true) {
        if (!this._bg)
            return;
        const c = this._config;
        const panelBox = Main.layoutManager.panelBox;

        // The overview and lock screen draw their own backdrop.
        const hidden = Main.overview.visible || Main.sessionMode.isLocked ||
            !panelBox.visible || !panelBox.mapped;
        this._bg.visible = !hidden;
        if (hidden) {
            Main.panel.add_style_class_name('orbit-transparent');
            return;
        }

        const solid = this._isSolid();
        const floating = c.floating && !solid;
        const opacity = solid ? c.solidOpacity : c.transparentOpacity;
        const [r, g, b] = c.useCustomColor ? parseHexColor(c.color) : [0, 0, 0];
        const radius = floating ? c.radius : 0;
        const duration = animate ? c.transition : 0;

        const parts = [
            `background-color: rgba(${r}, ${g}, ${b}, ${opacity});`,
            `border-radius: ${radius}px;`,
            `transition-duration: ${duration}ms;`,
        ];
        if (c.glass && c.highlight) {
            parts.push(floating
                ? 'border: 1px solid rgba(255, 255, 255, 0.16);'
                : 'border-bottom: 1px solid rgba(255, 255, 255, 0.10);');
        }
        this._tint.set_style(parts.join(' '));
        this._glass?.setRadius(radius);

        // Light text needs a shadow when the bar is see-through.
        if (opacity < 0.5)
            Main.panel.add_style_class_name('orbit-transparent');
        else
            Main.panel.remove_style_class_name('orbit-transparent');

        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const [px, py] = [panelBox.x, panelBox.y];
        const [pw, ph] = [panelBox.width, panelBox.height];
        const ix = floating ? FLOAT_INSET_X * scale : 0;
        const iy = floating ? FLOAT_INSET_Y * scale : 0;
        const target = {x: px + ix, y: py + iy, width: Math.max(pw - 2 * ix, 1), height: Math.max(ph - 2 * iy, 1)};

        // Geometry snaps (easing size inside uiGroup makes Clutter re-allocate
        // every frame); colour and radius fade through the CSS transition.
        this._bg.set_position(target.x, target.y);
        this._bg.set_size(target.width, target.height);
        this._state = {solid, floating};
        this._glass?.sync();
    }

    // ---- layout tweaks ---------------------------------------------------

    _applyActivities(hide) {
        const activities = Main.panel.statusArea.activities;
        if (!activities)
            return;
        activities.container.visible = !hide;
    }

    _applyClock(position) {
        const dateMenu = Main.panel.statusArea.dateMenu;
        if (!dateMenu)
            return;
        const container = dateMenu.container;
        const target = {
            left: Main.panel._leftBox,
            right: Main.panel._rightBox,
            center: Main.panel._centerBox,
        }[position] ?? Main.panel._centerBox;
        const parent = container.get_parent();
        if (parent === target)
            return;
        parent?.remove_child(container);
        if (position === 'left')
            target.add_child(container);
        else
            target.insert_child_at_index(container, 0);
    }

    // ---- teardown -----------------------------------------------------------

    _teardown() {
        this._watcher?.destroy();
        this._watcher = null;
        Main.layoutManager.panelBox.disconnectObject(this);
        Main.overview.disconnectObject(this);
        Main.sessionMode.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._glass = null;
        this._bg?.destroy();
        this._bg = null;
        this._tint = null;
        Main.panel.remove_style_class_name('orbit-top-bar');
        Main.panel.remove_style_class_name('orbit-transparent');
    }

    destroy() {
        if (this._reloadId) {
            GLib.source_remove(this._reloadId);
            this._reloadId = 0;
        }
        this._settings.disconnectObject(this);
        this._teardown();
        this._applyActivities(false);
        this._applyClock('center');
    }
}
