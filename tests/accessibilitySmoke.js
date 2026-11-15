import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
export default class AccessibilitySmoke extends Extension {
    enable() {this._timer=GLib.timeout_add(GLib.PRIORITY_DEFAULT,4000,()=>{this._timer=0;this._run().catch(error=>{console.error(error);this._write(`FAIL: ${error.message}`);});return GLib.SOURCE_REMOVE;});}
    _write(text){Gio.File.new_for_path(GLib.getenv('ORBIT_SMOKE_RESULT')).replace_contents(text,null,false,0,null);}
    _wait(ms){return new Promise(resolve=>GLib.timeout_add(GLib.PRIORITY_DEFAULT,ms,()=>{resolve();return GLib.SOURCE_REMOVE;}));}
    async _run(){
        Main.welcomeDialog?.close();const ext=Main.extensionManager.lookup('orbit-dock@niruxx.github.io').stateObj;
        ext._settings.set_boolean('launcher-arc-bottom-bar',false);ext._settings.set_string('launcher-style','arc');
        ext._settings.set_string('launcher-shortcuts',JSON.stringify([{id:'accessible-fixture',label:'Orbit accessibility fixture',type:'uri',target:GLib.getenv('ORBIT_SMOKE_DESKTOP'),icon:'folder-symbolic'}]));
        ext._launcher.open();ext._launcher._selectCategory('shortcuts');await this._wait(500);
        const button=ext._launcher._navigationButtons().find(item=>item._orbitApp?._orbitCustom);
        if(!button)throw new Error('Accessible fixture missing');ext._launcher._focusItem(button);
        this._probe=Gio.Subprocess.new(['python3',`${GLib.getenv('ORBIT_SMOKE_REPO')}/tests/accessibilityProbe.py`,'Orbit accessibility fixture'],Gio.SubprocessFlags.STDOUT_PIPE|Gio.SubprocessFlags.STDERR_PIPE);
        const [output,error]=await new Promise((resolve,reject)=>this._probe.communicate_utf8_async(null,null,(p,r)=>{try{const [,out,err]=p.communicate_utf8_finish(r);resolve([out,err]);}catch(e){reject(e);}}));
        if(!this._probe.get_successful())throw new Error(error||output);ext._launcher.close();this._write(output.trim());
    }
    disable(){if(this._timer)GLib.source_remove(this._timer);}
}
