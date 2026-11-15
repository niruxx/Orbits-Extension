// Run on the workstation host with GSETTINGS_BACKEND=memory.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import {layoutsPage} from '../extension/orbit-dock@niruxx.github.io/prefsLayouts.js';
import {desktopPage, dockPage, topBarPage, launcherPage, personalizationPage, effectsPage} from '../extension/orbit-dock@niruxx.github.io/prefsPages.js';
import {taskbarPage} from '../extension/orbit-dock@niruxx.github.io/taskbarPrefs.js';
GLib.setenv('GSETTINGS_BACKEND', 'memory', true);
Gtk.init(); Adw.init();
if (GLib.getenv('ORBIT_TEST_RTL') === '1') Gtk.Widget.set_default_direction(Gtk.TextDirection.RTL);
const scratch = GLib.dir_make_tmp('orbit-preferences-test-XXXXXX');
const name = 'org.gnome.shell.extensions.orbit-dock';
Gio.File.new_for_path(`extension/orbit-dock@niruxx.github.io/schemas/${name}.gschema.xml`).copy(
    Gio.File.new_for_path(`${scratch}/${name}.gschema.xml`), Gio.FileCopyFlags.NONE, null, null);
const [, , stderr, status] = GLib.spawn_command_line_sync(`glib-compile-schemas ${scratch}`);
if (status !== 0) throw new Error(new TextDecoder().decode(stderr));
const source = Gio.SettingsSchemaSource.new_from_directory(scratch, Gio.SettingsSchemaSource.get_default(), false);
const settings = new Gio.Settings({settings_schema: source.lookup(name, false)});
const window = new Adw.PreferencesWindow();
for (const build of [layoutsPage, dockPage, taskbarPage, topBarPage, launcherPage, desktopPage, personalizationPage, effectsPage])
    window.add(build(window, settings));
const descendants = root => {
    const result = [root];
    for (let child = root.get_first_child(); child; child = child.get_next_sibling()) result.push(...descendants(child));
    return result;
};
const widgets = descendants(window);
const title = text => widgets.find(widget => widget instanceof Adw.PreferencesRow && widget.title === text);
const themeName = title('Theme name');
const click = text => {
    const row = title(text); const button = descendants(row).find(widget => widget instanceof Gtk.Button && widget.label);
    if (!button) throw new Error(`Action missing: ${text}`); button.emit('clicked');
};
themeName.text = 'Smoke Theme'; click('Save current appearance');
if (!JSON.parse(settings.get_string('launcher-saved-themes'))['Smoke Theme']) throw new Error('Saving a theme failed');
themeName.text = 'Renamed Theme'; click('Rename selected theme');
if (!JSON.parse(settings.get_string('launcher-saved-themes'))['Renamed Theme']) throw new Error('Renaming a theme failed');
click('Delete selected theme');
if (Object.keys(JSON.parse(settings.get_string('launcher-saved-themes'))).length) throw new Error('Deleting a theme failed');
title('Preset name').text = 'Smoke Desktop'; click('Save current desktop');
if (!JSON.parse(settings.get_string('custom-presets'))['Smoke Desktop']) throw new Error('Saving desktop preset failed');
title('Preset name').text = 'Renamed Desktop'; click('Rename selected preset');
if (!JSON.parse(settings.get_string('custom-presets'))['Renamed Desktop']) throw new Error('Renaming desktop preset failed');
click('Delete selected preset');
if (Object.keys(JSON.parse(settings.get_string('custom-presets'))).length) throw new Error('Deleting desktop preset failed');
window.destroy();
for (const file of [`${name}.gschema.xml`, 'gschemas.compiled']) Gio.File.new_for_path(`${scratch}/${file}`).delete(null);
Gio.File.new_for_path(scratch).delete(null);
print('All preferences pages constructed successfully');
