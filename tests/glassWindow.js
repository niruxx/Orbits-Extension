import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
const app = new Gtk.Application({application_id: 'io.github.orbit.GlassFixture'});
app.connect('activate', () => {
    const css = new Gtk.CssProvider();
    css.load_from_string('#left { background-color: rgb(20,220,70); } #right { background-color: rgb(40,60,240); }');
    const row = new Gtk.Box({homogeneous: true});
    for (const name of ['left', 'right']) {
        const half = new Gtk.Box({name, hexpand: true, vexpand: true});
        half.get_style_context().add_provider(css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION); row.append(half);
    }
    const window = new Gtk.ApplicationWindow({application: app, title: 'Orbit Glass Fixture', decorated: false, child: row});
    window.fullscreen(); window.present();
    const change = Gio.File.new_for_path(`${GLib.getenv('ORBIT_SMOKE_RESULT')}.colors`);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
        if (!change.query_exists(null)) return GLib.SOURCE_CONTINUE;
        css.load_from_string('#left { background-color: rgb(220,40,170); } #right { background-color: rgb(210,180,20); }');
        return GLib.SOURCE_REMOVE;
    });
});
app.run([]);
