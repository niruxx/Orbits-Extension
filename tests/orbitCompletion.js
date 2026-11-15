import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {PRESETS} from '../extension/orbit-dock@niruxx.github.io/prefsLayouts.js';
import {validatePreset} from '../extension/orbit-dock@niruxx.github.io/desktopPresets.js';
import {trayLayout, migrationValues} from '../extension/orbit-dock@niruxx.github.io/orbitModel.js';
import {surfaceEffects} from '../extension/orbit-dock@niruxx.github.io/effectSettings.js';
function assert(ok,message){if(!ok)throw new Error(message);}
GLib.setenv('GSETTINGS_BACKEND','memory',true);
const scratch=GLib.dir_make_tmp('orbit-completion-XXXXXX'), schema='org.gnome.shell.extensions.orbit-dock';
Gio.File.new_for_path(`extension/orbit-dock@niruxx.github.io/schemas/${schema}.gschema.xml`).copy(Gio.File.new_for_path(`${scratch}/${schema}.gschema.xml`),0,null,null);
GLib.spawn_command_line_sync(`glib-compile-schemas ${scratch}`);
const source=Gio.SettingsSchemaSource.new_from_directory(scratch,Gio.SettingsSchemaSource.get_default(),false);
const settings=new Gio.Settings({settings_schema:source.lookup(schema,false)});
for(const preset of PRESETS){
 const orbit=Object.fromEntries(Object.entries(preset.orbit).map(([key,value])=>[key,{type:settings.get_value(key).get_type_string(),value}]));
 // The GNOME preset is a reset plan assembled by the UI, so use one default.
 if(!Object.keys(orbit).length)orbit['dock-in-panel']={type:'b',value:false};
 validatePreset(JSON.stringify({format:'orbit-desktop-preset',version:1,name:preset.title,orbit,wm:preset.wm}),settings);
}
settings.set_int('settings-version',2);assert(settings.get_int('settings-version')===2,'Schema must preserve future migration versions');settings.set_int('settings-version',0);
assert(migrationValues(0)[0][1]===1&&migrationValues(1).length===0,'Settings migration must be idempotent');
let rejected=false;try{migrationValues(2);}catch{rejected=true;}assert(rejected,'Future settings versions must not be overwritten');
const items=[{id:'a',active:true},{id:'b',active:true},{id:'c',active:false}];
const layout=trayLayout(items,['b','a'],[],1);
assert(layout.visible[0].id==='b'&&layout.overflow,'Tray order and overflow');
assert(trayLayout(items,[],['a'],0).visible.map(i=>i.id).join()==='b','Hidden and passive tray icons');
assert(trayLayout(items,[],[],1,true).visible.length===2,'Expanded tray overflow');
settings.set_boolean('glass-dock',true);settings.set_boolean('glass-dock-custom',true);settings.set_int('glass-dock-blur',58);
assert(surfaceEffects(settings,'dock').blur===58,'Independent surface blur');
settings.set_boolean('reduced-effects',true);assert(!surfaceEffects(settings,'dock').enabled,'Reduced effects disables glass');
for(const name of [`${schema}.gschema.xml`,'gschemas.compiled'])Gio.File.new_for_path(`${scratch}/${name}`).delete(null);Gio.File.new_for_path(scratch).delete(null);
print('Desktop preset/schema consistency, migration, tray policy and surface effects checks passed');
