// Acceptance checks run only in the harness's private compositor/session bus.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GObject from 'gi://GObject';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
export default class AcceptanceSmoke extends Extension {
    enable() {
        this._timers=new Set();
        this._wait(4000).then(()=>this._run()).catch(error=>{console.error(error);this._write(`FAIL: ${error.message}\n${error.stack}`);});
    }
    _write(text){Gio.File.new_for_path(GLib.getenv('ORBIT_SMOKE_RESULT')).replace_contents(text,null,false,0,null);}
    _assert(ok,message){if(!ok)throw new Error(message);}
    _wait(ms=200){return new Promise(resolve=>{const id=GLib.timeout_add(GLib.PRIORITY_DEFAULT,ms,()=>{this._timers.delete(id);resolve();return GLib.SOURCE_REMOVE;});this._timers.add(id);});}
    async _key(key){this._keyboard.notify_keyval(GLib.get_monotonic_time(),key,Clutter.KeyState.PRESSED);await this._wait(30);this._keyboard.notify_keyval(GLib.get_monotonic_time(),key,Clutter.KeyState.RELEASED);await this._wait(80);}
    async _tap(x,y){this._touch.notify_touch_down(GLib.get_monotonic_time(),0,x,y);await this._wait(40);this._touch.notify_touch_up(GLib.get_monotonic_time(),0);await this._wait(100);}
    _counts(){
        const counts={};const visit=actor=>{const name=actor.name??'';if(name.startsWith('orbit'))counts[name]=(counts[name]??0)+1;actor.get_children().forEach(visit);};visit(global.stage);return counts;
    }
    _display(method, params=null){return new Promise((resolve,reject)=>Gio.DBus.session.call('org.gnome.Mutter.DisplayConfig','/org/gnome/Mutter/DisplayConfig','org.gnome.Mutter.DisplayConfig',method,params,null,Gio.DBusCallFlags.NONE,3000,null,(c,r)=>{try{resolve(c.call_finish(r).recursiveUnpack());}catch(e){reject(e);}}));}
    async _applyDisplays(configs){const state=await this._display('GetCurrentState');await this._display('ApplyMonitorsConfig',new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})',[state[0],1,configs,{'layout-mode':new GLib.Variant('u',1)}]));await this._wait(700);}
    async _run(){
        Main.welcomeDialog?.close();
        const ext=this._ext=Main.extensionManager.lookup('orbit-dock@niruxx.github.io').stateObj;
        const settings=ext._settings; settings.set_boolean('launcher-arc-bottom-bar',false);settings.set_string('launcher-style','arc');settings.set_boolean('launcher-show-power',true);settings.set_boolean('glass-launcher',false);settings.set_string('launcher-default-view','all');settings.set_boolean('dock-in-panel',true);settings.set_boolean('tray-enabled',true);await this._wait(300);
        const seat=global.stage.get_context().get_backend().get_default_seat();
        this._keyboard=seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        this._touch=seat.create_virtual_device(Clutter.InputDeviceType.TOUCHSCREEN_DEVICE);
        this._fixture=Gio.Subprocess.new(['gjs','-m',`${GLib.getenv('ORBIT_SMOKE_REPO')}/tests/shellWindow.js`],Gio.SubprocessFlags.NONE);
        await this._wait(1000);
        const monitor=Main.layoutManager.primaryMonitor;
        this._probe=new St.Button({label:'Return focus',can_focus:true,reactive:true,x:monitor.x+8,y:monitor.y+8,width:110,height:30});Main.layoutManager.addTopChrome(this._probe);
        this._probe.grab_key_focus();let launcher=ext._launcher;launcher.open();await this._wait();
        this._assert(launcher._firstItem(),`No app results: ${launcher._apps.length}`);
        await this._key(Clutter.KEY_Down);const first=launcher._activeItem;this._assert(first?._orbitApp,`Virtual keyboard Down did not select an application: focus=${first}, selected=${launcher._activeItem}, mode=${launcher._inputMode}`);
        await this._key(Clutter.KEY_Right);this._assert(launcher._activeItem!==first,'Virtual keyboard Right did not move selection');
        await this._key(Clutter.KEY_Escape);this._assert(!launcher.isOpen,'Virtual Escape did not close launcher');
        this._assert(global.stage.get_key_focus()===this._probe,'Launcher did not restore previous keyboard focus');
        launcher.open();launcher._selectCategory('favorites');await this._wait();const all=launcher._catButtons.get('all');const [cx,cy]=all.get_transformed_position();await this._tap(cx+all.width/2,cy+all.height/2);this._assert(launcher._currentCategory==='all','Virtual touch did not select category');
        await this._tap(monitor.x+3,monitor.y+monitor.height-3);this._assert(!launcher.isOpen,'Virtual outside touch did not close launcher');
        const direction = Clutter.TextDirection.RTL;
        try{
            await this._wait(100);
            settings.set_string('launcher-category-names',JSON.stringify({favorites:'تطبيقات مثبتة — '+ 'Long translated text '.repeat(3),all:'כל היישומים — '+ 'Long translated text '.repeat(3)}));
            settings.set_string('launcher-shortcuts',JSON.stringify([{id:'acceptance-long',label:'تطبيق طويل — '+'Long application name '.repeat(3),type:'uri',target:GLib.getenv('ORBIT_SMOKE_DESKTOP'),icon:'folder-symbolic'}]));
            settings.set_int('launcher-width',480);settings.set_int('launcher-height',400);
            for(const style of ['modern','list','minimal','classic','arc','xp','grid','runner','sidebar']){
                settings.set_string('launcher-style',style);launcher.open();launcher._selectCategory('favorites');
                const rtl=actor=>{actor.set_text_direction(direction);actor.get_children().forEach(rtl);};rtl(launcher._root);await this._wait(120);
                this._assert(launcher._menu.width<=monitor.width&&launcher._content.width<=launcher._menu.width+1,`RTL long-text overflow in ${style}`);
                for(const button of launcher._navigationButtons())if(button._orbitApp||button._orbitResult)this._assert(!!button.accessible_name||!!button._orbitApp.get_name(),`Missing accessible application name in ${style}`);
                launcher.close();
            }
        }finally{launcher.close();}
        settings.set_boolean('multi-monitor',true);await this._wait(300);
        const state=await this._display('GetCurrentState');
        const configs=state[2].map(logical=>[logical[0],logical[1],logical[2],logical[3],logical[4],logical[5].map(spec=>{
            const physical=state[1].find(item=>item[0][0]===spec[0]);const mode=physical[1].find(item=>item[6]['is-current']);return[spec[0],mode[0],{}];
        })]);
        const mixed=configs.map(config=>[...config]);mixed[1][2]=state[1][1][1][0][5].find(scale=>scale>1);
        this._assert(mixed[1][2],'Virtual monitor has no mixed-scale mode');
        await this._applyDisplays(mixed);
        const applied=await this._display('GetCurrentState');this._assert(new Set(applied[2].map(item=>item[2])).size===2,'Mixed scales were not applied by Mutter');
        for(const dock of ext._parts[0]._docks){const m=Main.layoutManager.monitors[dock.monitorIndex],frame=dock._panel._frame;this._assert(frame.x>=m.x&&frame.y>=m.y&&frame.x+frame.width<=m.x+m.width+1&&frame.y+frame.height<=m.y+m.height+1,'Mixed-scale taskbar exceeds monitor bounds');}
        this._assert(Main.layoutManager.monitors.length===2&&ext._parts[0]._docks.length===2,'Mixed-scale taskbars missing');
        launcher.open();await this._wait();await this._applyDisplays([mixed[0]]);
        this._assert(!launcher.isOpen&&Main.layoutManager.monitors.length===1&&ext._parts[0]._docks.length===1,'Virtual display removal left stale UI/modal');
        const rotated=configs.map(config=>[...config]);rotated[1][3]=1;
        await this._applyDisplays(rotated);
        const rotatedState=await this._display('GetCurrentState');this._assert(rotatedState[2].some(item=>item[3]===1),'Virtual rotation was not applied');
        for(const dock of ext._parts[0]._docks){const m=Main.layoutManager.monitors[dock.monitorIndex],frame=dock._panel._frame;this._assert(frame.x>=m.x&&frame.y>=m.y&&frame.x+frame.width<=m.x+m.width+1&&frame.y+frame.height<=m.y+m.height+1,'Rotated taskbar exceeds monitor bounds');}
        await this._applyDisplays(configs);this._assert(Main.layoutManager.monitors.length===2&&ext._parts[0]._docks.length===2,'Virtual display reattach did not restore taskbars');
        settings.set_string('launcher-style','arc');await this._wait(200);
        const fixtureWindow=global.get_window_actors().map(actor=>actor.meta_window).find(win=>win.get_title()?.startsWith('Orbit smoke window'));
        this._assert(fixtureWindow,'Fullscreen fixture window missing');settings.set_boolean('fullscreen-reveal',false);await this._wait(300);fixtureWindow.make_fullscreen();await this._wait(500);
        this._assert(fixtureWindow.is_fullscreen(),'Fullscreen transition failed');
        const fullscreenDock=ext._parts[0]._docks.find(dock=>dock.monitorIndex===fixtureWindow.get_monitor());this._assert(!fullscreenDock._shown,'Taskbar did not hide for fullscreen deny policy');
        fixtureWindow.unmake_fullscreen();await this._wait(400);
        launcher.open();await this._wait();Main.overview.show();await this._wait(600);this._assert(!launcher.isOpen,'Overview transition left launcher modal open');Main.overview.hide();await this._wait(600);
        // This exercises Shell mode changes, not a physical authenticated lock.
        const tray=ext._tray;
        this._indicator=Gio.DBusExportedObject.wrapJSObject('<node><interface name="org.kde.StatusNotifierItem"><property name="Id" type="s" access="read"/><property name="Title" type="s" access="read"/><property name="Status" type="s" access="read"/><property name="IconName" type="s" access="read"/><property name="Menu" type="o" access="read"/><property name="ItemIsMenu" type="b" access="read"/></interface></node>',{Id:'acceptance',Title:'Acceptance indicator',Status:'Active',IconName:'utilities-terminal-symbolic',Menu:'/',ItemIsMenu:false});
        this._indicator.export(Gio.DBus.session,'/AcceptanceIndicator');
        await new Promise((resolve,reject)=>Gio.DBus.session.call('org.kde.StatusNotifierWatcher','/StatusNotifierWatcher','org.kde.StatusNotifierWatcher','RegisterStatusNotifierItem',new GLib.Variant('(s)',['/AcceptanceIndicator']),null,Gio.DBusCallFlags.NONE,3000,null,(c,r)=>{try{c.call_finish(r);resolve();}catch(e){reject(e);}}));await this._wait(250);
        const registered=tray._items.size;
        Main.sessionMode.pushMode('unlock-dialog');await this._wait(300);
        this._assert(!ext._parts&&ext._tray===tray&&tray._items.size===registered,'Unlock-dialog mode did not remove UI while retaining tray service');
        Main.sessionMode.popMode('unlock-dialog');await this._wait(400);this._assert(ext._parts?.[0]&&tray._items.size===registered&&[...tray._items.values()].some(entry=>entry.button?.container.visible),'User UI and indicator did not return after unlock-dialog mode');
        const groups=()=>Main.ctrlAltTabManager._items.filter(item=>item.root.name==='orbitTaskbarPanel').length;
        const baseline=this._counts(), baselineGroups=groups(), modal=Main.modalCount;
        const tracked=new Set(['launcher-shortcut',...ext._parts[0]._shortcuts._bindings]);
        const add=Main.wm.addKeybinding,remove=Main.wm.removeKeybinding;
        const owned=name=>/^(launcher-shortcut|reveal-shortcut|dock-app-\d+)$/.test(name);
        Main.wm.addKeybinding=function(name,...args){if(owned(name)){if(tracked.has(name))throw new Error(`Duplicate Orbit keybinding: ${name}`);tracked.add(name);}return add.call(this,name,...args);};
        Main.wm.removeKeybinding=function(name,...args){if(owned(name))tracked.delete(name);return remove.call(this,name,...args);};
        try {
            for(let i=0;i<15;i++){
                const manager=ext._parts[0],docks=[...manager._docks],oldLauncher=ext._launcher;
                docks.forEach(dock=>dock.revealFor(5000));
                oldLauncher.open();await this._wait(40);
                const resources=[manager,manager._shortcuts,ext._tray,oldLauncher,oldLauncher._searchService,...docks,...docks.map(dock=>dock._panel)];
                const timerFields=['_rebuildId','_overlayTimer','_reloadId','_hoverId','_appsReloadId','_delay','_timeout','_intellihideId','_labelTimeoutId','_edgeRevealId','_edgeExpiryId','_revealTimeout','_timer','_clickTimer'];
                const sources=resources.filter(Boolean).flatMap(resource=>timerFields.map(key=>resource[key]).filter(value=>typeof value==='number'&&value>0));
                ext.disable();await this._wait(50);
                this._assert(Main.modalCount===modal,'Disable leaked modal grab');
                this._assert(!tracked.size,'Disable left Orbit keybindings registered');
                for(const id of sources)this._assert(!GLib.MainContext.default().find_source_by_id(id),`Disable left GLib source ${id} active`);
                this._assert(!GObject.signal_handler_is_connected(manager._iconTheme,manager._themeSignal),'Icon-theme signal survived disable');
                this._assert(docks.every(dock=>dock._trackedWindows.size===0),'Window signal ownership survived disable');
                ext.enable();await this._wait(180);
                ext._settings.set_int('taskbar-section-spacing',i%2?6:8);ext._settings.set_int('tray-icon-size',i%2?16:18);await this._wait(250);
                this._assert(groups()===baselineGroups,'Re-enable leaked taskbar keyboard groups');
                this._assert(tracked.has('launcher-shortcut')&&tracked.has('reveal-shortcut'),'Re-enable did not restore shortcuts');
                const counts=this._counts();for(const [name,count]of Object.entries(counts))this._assert(count<=(baseline[name]??0),`Actor count grew for ${name}`);
            }
        } finally { Main.wm.addKeybinding=add;Main.wm.removeKeybinding=remove; }
        this._probe.destroy();this._probe=null;this._fixture.force_exit();this._fixture=null;
        this._write('PASS: Virtual keyboard/touch, focus restore, RTL long text, mixed scaling/rotation and virtual output removal/restoration, fullscreen/overview, session-mode round trip and fifteen lifecycle/settings cycles with timer/signal/keybinding cleanup');
    }
    disable(){this._indicator?.unexport();this._fixture?.force_exit();this._probe?.destroy();this._timers?.forEach(id=>GLib.source_remove(id));this._timers?.clear();this._keyboard=null;this._touch=null;}
}
