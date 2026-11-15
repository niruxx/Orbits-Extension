// Test fixture for shellSmoke.sh; runs only inside its isolated desktop session.
import Gtk from 'gi://Gtk?version=4.0';
const app = new Gtk.Application({application_id: 'io.github.orbit.Smoke'});
app.connect('activate', () => {
    for (const title of ['Orbit smoke window A', 'Orbit smoke window B']) {
        const window = new Gtk.ApplicationWindow({application: app, title, default_width: 400, default_height: 300});
        window.present();
    }
});
app.run([]);
