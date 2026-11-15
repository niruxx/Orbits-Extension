// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/** App-only window overview, without changing GNOME's global overview filters. */
export class WindowSpread {
    constructor(dock) {
        this._dock = dock;
        this._signals = [];
    }

    toggle(icon) {
        if (this._app === icon.app && this._root) {
            this.close();
            return;
        }
        this.close();
        this._dock._previews.close();
        this._dock._manager.launcher?.close();
        const windows = this._dock.getAppWindows(icon.app);
        if (!windows.length)
            return;
        Main.overview.hide();
        const monitor = Main.layoutManager.monitors[this._dock.monitorIndex];
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._app = icon.app;
        this._root = new St.Widget({style_class: 'orbit-window-spread', reactive: true,
            x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height});
        Main.layoutManager.addTopChrome(this._root);
        this._root.connect('button-press-event', (_actor, event) => {
            if (event.get_source() === this._root) {
                this.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._root.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this.close();
                icon.get_stage() && icon.grab_key_focus();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        const padding = 32 * scale;
        const content = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'orbit-spread-content', x: padding, y: padding,
            width: Math.max(1, monitor.width - padding * 2), height: Math.max(1, monitor.height - padding * 2)});
        content.add_child(new St.Label({text: icon.app.get_name(), style_class: 'orbit-spread-heading'}));
        const scroll = new St.ScrollView({hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC, y_expand: true});
        const list = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL});
        scroll.set_child(list);
        content.add_child(scroll);
        this._root.add_child(content);
        const columns = Math.max(1, Math.min(3, Math.floor((monitor.width - padding * 2) / (260 * scale))));
        const width = Math.max(1, Math.min(360 * scale, (monitor.width - padding * 2) / columns - 24 * scale));
        let row, first;
        windows.forEach((win, i) => {
            if (i % columns === 0) {
                row = new St.BoxLayout({style_class: 'orbit-spread-row'});
                list.add_child(row);
            }
            const card = new St.BoxLayout({style_class: 'orbit-spread-card', orientation: Clutter.Orientation.VERTICAL});
            const header = new St.BoxLayout();
            const title = new St.Label({text: win.get_title() || icon.app.get_name(), x_expand: true,
                style: `max-width: ${Math.max(1, width / scale - 40)}px;`});
            header.add_child(title);
            const close = new St.Button({can_focus: true, accessible_name: `Close ${title.text}`,
                style_class: 'orbit-preview-close', child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 16})});
            close.connect('clicked', () => { this.close(); win.delete(global.get_current_time()); });
            header.add_child(close);
            card.add_child(header);
            const view = new St.Widget({width, height: width * 0.6, clip_to_allocation: true});
            const source = win.get_compositor_private();
            if (source?.width > 0 && source.height > 0) {
                const factor = Math.min(width / source.width, width * 0.6 / source.height);
                view.add_child(new Clutter.Clone({source, scale_x: factor, scale_y: factor,
                    x: (width - source.width * factor) / 2, y: (width * 0.6 - source.height * factor) / 2}));
            }
            const button = new St.Button({child: view, can_focus: true,
                accessible_name: title.text, style_class: 'orbit-preview-activate'});
            button.connect('clicked', () => { this.close(); Main.activateWindow(win); });
            card.add_child(button);
            row.add_child(card);
            first ??= button;
            this._signals.push([win, win.connect('unmanaged', () => this.close())]);
            this._signals.push([win, win.connect('notify::title', () => { title.text = win.get_title() || icon.app.get_name(); })]);
        });
        this._signals.push([icon.app, icon.app.connect('windows-changed', () => this.close())]);
        this._signals.push([global.workspace_manager, global.workspace_manager.connect('active-workspace-changed', () => this.close())]);
        this._signals.push([icon, icon.connect('destroy', () => this.close())]);
        this._grab = Main.pushModal(this._root, {actionMode: Shell.ActionMode.POPUP});
        global.focus_manager.add_group(this._root);
        first?.grab_key_focus();
    }

    close() {
        this._signals.forEach(([object, id]) => object.disconnect(id));
        this._signals = [];
        if (this._grab)
            Main.popModal(this._grab);
        this._grab = null;
        this._root?.destroy();
        this._root = null;
        this._app = null;
    }

    destroy() { this.close(); }
}
