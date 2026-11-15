// Run in shellSmoke.sh's private compositor via ORBIT_SMOKE_DRIVER.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
export default class GlassSmoke extends Extension {
    enable() {
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 4000, () => {
            this._timer = 0; this._run().catch(error => { console.error(error); this._write(`FAIL: ${error.message}`); });
            return GLib.SOURCE_REMOVE;
        });
    }
    _write(text) { Gio.File.new_for_path(GLib.getenv('ORBIT_SMOKE_RESULT')).replace_contents(text, null, false, 0, null); }
    _pause(ms = 250) { return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; })); }
    _color(x, y) {
        const screenshot = new Shell.Screenshot();
        return new Promise((resolve, reject) => screenshot.pick_color(Math.round(x), Math.round(y), (source, result) => {
            try { const [ok, color] = source.pick_color_finish(result); if (!ok) throw new Error('Pixel capture failed'); const rgb = [color.red, color.green, color.blue]; if (!rgb.every(Number.isFinite)) throw new Error(`Invalid color result: ${color}`); resolve(rgb); }
            catch (error) { reject(error); }
        }));
    }
    async _run() {
        Main.welcomeDialog?.close();
        const extension = Main.extensionManager.lookup('orbit-dock@niruxx.github.io').stateObj;
        const settings = extension._settings, launcher = extension._launcher;
        const monitor = Main.layoutManager.primaryMonitor;
        this._fixture = Gio.Subprocess.new(['gjs', '-m', `${GLib.getenv('ORBIT_SMOKE_REPO')}/tests/glassWindow.js`], Gio.SubprocessFlags.NONE);
        await this._pause(1200);
        settings.set_boolean('launcher-arc-bottom-bar', false); settings.set_string('launcher-style', 'arc');
        settings.set_string('launcher-placement', 'center'); settings.set_int('launcher-width', 480); settings.set_int('launcher-height', 400);
        settings.set_int('launcher-radius', 40); settings.set_int('launcher-border-width', 0); settings.set_boolean('launcher-show-places', false);
        settings.set_boolean('launcher-show-power', false); settings.set_double('launcher-opacity', 0); settings.set_double('glass-brightness', 0.7);
        const context = St.ThemeContext.get_for_stage(global.stage), originalScale = context.scale_factor;
        try {
            for (const [scale, radius] of [[1, 14], [1, 40], [2, 14], [2, 40]]) {
                if (context.scale_factor !== scale) { context.scale_factor = scale; await this._pause(500); }
                for (const glass of [false, true]) {
                    settings.set_int('launcher-radius', radius);
                    settings.set_boolean('glass-launcher', glass); launcher.open(); await this._pause();
                    const [x, y] = launcher._menu.get_transformed_position(), [w, h] = launcher._menu.get_transformed_size();
                    const points = [[x+2,y+2], [x+w-3,y+2], [x+2,y+h-3], [x+w-3,y+h-3], [x+w/2+4,y+h-8]];
                    if (glass && (launcher._glass.actor.width !== w || launcher._glass.actor.height !== h)) throw new Error('Glass surface does not match menu allocation');
                    const colors = [];
                    for (const point of points) colors.push(await this._color(...point));
                    print(`Glass ${glass}, scale ${scale}, radius ${radius}: ${JSON.stringify(colors)}`);
                    if (glass) for (let i = 0; i < 4; i++) {
                        if (colors[i].some((value, c) => Math.abs(value - this._baseline[i][c]) > 4)) throw new Error(`Glass leaked into transparent sample ${i}: ${colors[i]} vs ${this._baseline[i]}`);
                    }
                    if (glass && colors[4][1] < this._baseline[4][1] + 10) throw new Error(`Backdrop blur did not sample the scene: ${colors[4]} vs ${this._baseline[4]}`);
                    if (!glass) this._baseline = colors;
                    if (glass && scale === 2 && radius === 40) {
                        Gio.File.new_for_path(`${GLib.getenv('ORBIT_SMOKE_RESULT')}.colors`).replace_contents('change', null, false, 0, null);
                        await this._pause(350);
                        const updated = await this._color(...points[4]);
                        if (updated[0] < colors[4][0] + 20) throw new Error('Launcher backdrop did not update with the window beneath it');
                    }
                    launcher.close(); await this._pause(100);
                }
            }
        } finally { context.scale_factor = originalScale; }
        this._fixture.force_exit(); this._fixture = null;
        this._write('PASS: Live Arc backdrop and four transparent corners at 14/40 px radii and 1×/2× scaling');
    }
    disable() { if (this._timer) GLib.source_remove(this._timer); this._fixture?.force_exit(); }
}
