// SPDX-License-Identifier: GPL-3.0-or-later
//
// Frosted glass: a blurred copy of the wallpaper, aligned with the widget's
// screen position and clipped to rounded corners. This is the cheap "static"
// blur approach (windows behind are not blurred), which keeps rounded shapes
// clean and costs nothing while idle.

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const CORNER_DECLARATIONS = `
uniform vec2 size;
uniform float radius;
`;

// Runs after the default fragment code: fade out pixels outside the rounded rect.
const CORNER_CODE = `
vec2 p = cogl_tex_coord_in[0].xy * size;
vec2 q = min(p, size - p);
if (q.x < radius && q.y < radius) {
    float d = distance(q, vec2(radius));
    cogl_color_out *= clamp(radius - d + 0.5, 0.0, 1.0);
}
`;

export const RoundedCornersEffect = GObject.registerClass(
class OrbitRoundedCornersEffect extends Clutter.ShaderEffect {
    _init(radius = 0) {
        super._init();
        this._radius = radius;
        this._size = [1, 1];
    }

    vfunc_get_static_snippet() {
        return Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, CORNER_DECLARATIONS, CORNER_CODE);
    }

    setRadius(radius) {
        this._radius = radius;
        this._sync();
    }

    setSize(width, height) {
        this._size = [Math.max(width, 1), Math.max(height, 1)];
        this._sync();
    }

    _sync() {
        // Stage units are physical pixels under integer scaling, so the CSS-like
        // radius (logical px) is scaled the same way St scales theme lengths.
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this.set_uniform_float('size', 2, this._size);
        this.set_uniform_float('radius', 1, [Math.min(this._radius * scale,
            this._size[0] / 2, this._size[1] / 2)]);
        this.queue_repaint();
    }
});

export class GlassLayer {
    /**
     * @param {object} params
     * @param {number} params.monitorIndex - monitor whose wallpaper to use
     * @param {number} params.radius - corner radius in logical px
     * @param {number} params.blur - blur radius in px
     * @param {number} params.brightness - 0..1
     */
    constructor({monitorIndex, radius = 0, blur = 30, brightness = 0.75}) {
        this._monitorIndex = monitorIndex;

        this.actor = new St.Widget({
            style_class: 'orbit-glass',
            clip_to_allocation: true,
            x_expand: true,
            y_expand: true,
        });

        this._bgGroup = new Clutter.Actor();
        this.actor.add_child(this._bgGroup);
        this._bgManager = new Background.BackgroundManager({
            container: this._bgGroup,
            monitorIndex,
            controlPosition: false,
            vignette: false,
        });

        if (blur > 0) {
            this._bgGroup.add_effect(new Shell.BlurEffect({
                mode: Shell.BlurMode.ACTOR,
                radius: blur,
                brightness,
            }));
        }

        this._corners = new RoundedCornersEffect(radius);
        this.actor.add_effect(this._corners);

        this.actor.connect('notify::allocation', () => this.sync());
        this.actor.connect('notify::mapped', () => this.sync());
        this.actor.connect('destroy', () => {
            this._bgManager?.destroy();
            this._bgManager = null;
        });
    }

    setRadius(radius) {
        this._corners.setRadius(radius);
    }

    /** Re-align the wallpaper copy with where the widget is on screen. */
    sync() {
        const monitor = Main.layoutManager.monitors[this._monitorIndex];
        if (!monitor || !this.actor.get_stage())
            return;
        const [x, y] = this.actor.get_transformed_position();
        if (Number.isNaN(x) || Number.isNaN(y))
            return;
        this._bgGroup.set_position(Math.round(monitor.x - x), Math.round(monitor.y - y));
        this._bgGroup.set_size(monitor.width, monitor.height);
        const [w, h] = this.actor.get_transformed_size();
        this._corners.setSize(w, h);
    }

    destroy() {
        this.actor.destroy();
    }
}
