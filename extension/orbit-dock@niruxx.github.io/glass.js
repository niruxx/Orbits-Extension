// SPDX-License-Identifier: GPL-3.0-or-later
//
// Frosted surfaces use either the live scene backdrop or an aligned wallpaper
// copy. The launcher uses the scene so translucent areas reveal windows below;
// dock and panel surfaces keep their existing wallpaper treatment.

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const CORNER_DECLARATIONS = `
uniform vec2 size;
uniform vec2 texture_size;
uniform vec2 texture_offset;
uniform float radius;
`;

// Runs after the default fragment code: fade out pixels outside the rounded rect.
const CORNER_CODE = `
vec2 p = cogl_tex_coord_in[0].xy * texture_size - texture_offset;
vec2 q = min(p, size - p);
if (q.x < radius && q.y < radius) {
    float d = distance(q, vec2(radius));
    cogl_color_out *= clamp(radius - d + 0.5, 0.0, 1.0);
}
`;

export const RoundedCornersEffect = GObject.registerClass(
class OrbitRoundedCornersEffect extends Clutter.ShaderEffect {
    _init(radius = 0, localBounds = false) {
        super._init();
        this._localBounds = localBounds;
        this._radius = radius;
        this._size = [1, 1];
    }

    vfunc_get_static_snippet() {
        return Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, CORNER_DECLARATIONS, CORNER_CODE);
    }

    vfunc_paint_target(node, paintContext) {
        // Allocation notifications can run before the menu receives its final
        // bounds. Set the mask from the allocation actually being painted.
        const actor = this.get_actor();
        const [width, height] = actor.get_size();
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const texture = this.get_texture();
        const resourceScale = actor.get_resource_scale();
        const textureSize = this._localBounds && texture ? [texture.get_width() / resourceScale, texture.get_height() / resourceScale] : [width, height];
        const offset = this._localBounds ? [Math.ceil((textureSize[0] - width) / 2), Math.ceil((textureSize[1] - height) / 2)] : [0, 0];
        if (this._size[0] !== width || this._size[1] !== height || this._scale !== scale || this._textureSize?.[0] !== textureSize[0] || this._textureSize?.[1] !== textureSize[1]) {
            this._textureSize = textureSize; this._textureOffset = offset;
            this._size = [Math.max(width, 1), Math.max(height, 1)];
            this._sync();
        }
        super.vfunc_paint_target(node, paintContext);
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
        this._scale = scale;
        this.set_uniform_float('size', 2, this._size);
        this.set_uniform_float('texture_size', 2, this._textureSize ?? this._size);
        this.set_uniform_float('texture_offset', 2, this._textureOffset ?? [0, 0]);
        this.set_uniform_float('radius', 1, [Math.min(this._radius * scale,
            this._size[0] / 2, this._size[1] / 2)]);
        this.queue_repaint();
    }
});

// Keep the offscreen mask's texture aligned with this surface, even though
// its scene clone covers the entire desktop at a negative offset.
const CroppedGlassSurface = GObject.registerClass(
class OrbitCroppedGlassSurface extends St.Widget {
    // The desktop clone must never contribute its screen-sized natural size
    // to the menu's BinLayout. The surface fills the menu allocation only.
    vfunc_get_preferred_width(_forHeight) { return [0, 0]; }
    vfunc_get_preferred_height(_forWidth) { return [0, 0]; }
    vfunc_get_paint_volume(volume) {
        volume.set_width(this.width); volume.set_height(this.height); volume.set_depth(0);
        return true;
    }
});

export class GlassLayer {
    /**
     * @param {object} params
     * @param {number} params.monitorIndex - monitor whose wallpaper to use
     * @param {number} params.radius - corner radius in logical px
     * @param {number} params.blur - blur radius in px
     * @param {number} params.brightness - 0..1
     * @param {boolean} params.backdrop - blur the live scene instead of wallpaper
     */
    constructor({monitorIndex, radius = 0, blur = 30, brightness = 0.75, backdrop = false}) {
        this._monitorIndex = monitorIndex;
        this._backdrop = backdrop;

        const Surface = backdrop ? CroppedGlassSurface : St.Widget;
        this.actor = new Surface({
            style_class: 'orbit-glass',
            clip_to_allocation: true,
            x_expand: true,
            y_expand: true,
        });

        this._bgGroup = new Clutter.Actor();
        this.actor.add_child(this._bgGroup);
        if (backdrop) {
            // WindowGroup contains the live wallpaper and application windows,
            // but not this menu, so cloning it cannot capture the menu itself.
            this._bgGroup.add_child(new Clutter.Clone({source: global.window_group}));
        } else {
            this._bgManager = new Background.BackgroundManager({
                container: this._bgGroup, monitorIndex, controlPosition: false, vignette: false,
            });
        }
        if (blur > 0) this._bgGroup.add_effect(new Shell.BlurEffect({mode: Shell.BlurMode.ACTOR, radius: blur, brightness}));
        this._corners = new RoundedCornersEffect(radius, backdrop);
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

    /** Update the corner mask and, when present, align the wallpaper copy. */
    sync() {
        const monitor = Main.layoutManager.monitors[this._monitorIndex];
        if (!monitor || !this.actor.get_stage())
            return;
        const [x, y] = this.actor.get_transformed_position();
        if (Number.isNaN(x) || Number.isNaN(y))
            return;
        this._bgGroup.set_position(Math.round((this._backdrop ? 0 : monitor.x) - x), Math.round((this._backdrop ? 0 : monitor.y) - y));
        this._bgGroup.set_size(this._backdrop ? global.stage.width : monitor.width, this._backdrop ? global.stage.height : monitor.height);
        const [w, h] = this.actor.get_transformed_size();
        this._corners.setSize(w, h);
    }

    destroy() {
        this.actor.destroy();
    }
}
