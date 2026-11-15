// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {group, spinRow} from './prefsWidgets.js';
export function trayControls(settings) {
    const result = group('Tray Visibility and Order', [spinRow(settings,'tray-visible-limit','Visible icons before overflow',0,32,1,'0 shows every visible icon. Use the more button to expand overflow.')], 'Applications appear here after registering an indicator. Hidden indicators keep their service connection.');
    let rows=[];
    const render=()=>{
        rows.forEach(row=>result.remove(row)); rows=[];
        let known; try {known=JSON.parse(settings.get_string('tray-known-items'));} catch {known={};}
        const order=[...new Set([...settings.get_strv('tray-order'),...Object.keys(known)])].filter(id=>Object.hasOwn(known,id));
        const hidden=settings.get_strv('tray-hidden-apps');
        order.forEach((id,index)=>{
            const row=new Adw.ActionRow({title:known[id]});
            const active=new Gtk.Switch({active:!hidden.includes(id),valign:Gtk.Align.CENTER});
            active.connect('notify::active',()=>settings.set_strv('tray-hidden-apps',active.active?hidden.filter(item=>item!==id):[...new Set([...hidden,id])])); row.add_suffix(active);
            for(const [delta,icon] of [[-1,'go-up-symbolic'],[1,'go-down-symbolic']]){
                const button=new Gtk.Button({icon_name:icon,valign:Gtk.Align.CENTER,tooltip_text:delta<0?'Move earlier':'Move later',sensitive:index+delta>=0&&index+delta<order.length});
                button.connect('clicked',()=>{const next=[...order];[next[index],next[index+delta]]=[next[index+delta],next[index]];settings.set_strv('tray-order',next);});row.add_suffix(button);
            }
            result.add(row);rows.push(row);
        });
    };
    render();const ids=['tray-known-items','tray-order','tray-hidden-apps'].map(key=>settings.connect(`changed::${key}`,render));result.connect('destroy',()=>ids.forEach(id=>settings.disconnect(id)));return result;
}
