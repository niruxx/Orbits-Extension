// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

/** Owns one popup per dock, including timers, window signals and temporary peeking. */
export class WindowPreviews {
    constructor(dock) {
        this._dock = dock;
        this._signals = [];
        this._dimmed = new Map();
    }

    hover(icon) {
        this._cancelTimer();
        if (icon.hover && this._dock.config.previews && !Main.overview.visible && !icon._menu?.isOpen) {
            if (this._menu?.isOpen && this._icon === icon)
                return;
            this._pendingIcon = icon;
            this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._dock.config.previewDelay, () => {
                this._timer = 0;
                this._pendingIcon = null;
                if (icon.hover && icon.get_stage())
                    this.open(icon);
                return GLib.SOURCE_REMOVE;
            });
        } else if (!icon.hover) {
            this._scheduleClose();
        }
    }

    _cancelTimer() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
        this._pendingIcon = null;
    }

    _scheduleClose() {
        this._cancelTimer();
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._dock.config.previewHideDelay ?? 250, () => {
            this._timer = 0;
            if (!this._icon?.hover && !this._menu?.actor.hover)
                this.close();
            return GLib.SOURCE_REMOVE;
        });
    }

    forget(icon) {
        if (this._icon === icon || this._pendingIcon === icon)
            this.close();
    }

    toggle(icon) {
        if (this._menu?.isOpen && this._icon === icon)
            this.close();
        else
            this.open(icon, true);
    }

    open(icon, focus = false) {
        this.close();
        const windows = icon._orbitWindow ? [icon._orbitWindow] : this._dock.getAppWindows(icon.app);
        if (!windows.length || !icon.get_stage())
            return;
        this._icon = icon;
        this._dock._hideLabel();
        const menu = this._menu = new PopupMenu.PopupMenu(icon, 0.5, this._dock.side);
        Main.uiGroup.add_child(menu.actor);
        menu.actor.add_style_class_name('orbit-window-previews');
        menu.actor.track_hover = true;
        menu.actor.connect('notify::hover', () => {
            if (menu.actor.hover)
                this._cancelTimer();
            else
                this._scheduleClose();
        });
        this._manager = new PopupMenu.PopupMenuManager(icon);
        this._manager.addMenu(menu);
        const monitor = Main.layoutManager.monitors[this._dock.monitorIndex];
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const scroll = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            style: `max-height: ${Math.max(100, monitor.height / scale - 160)}px;`,
        });
        const color = /^#[0-9a-f]{6}$/i.test(this._dock.config.previewBackground) ? this._dock.config.previewBackground : '#242428';
        menu.box.set_style(`background-color: ${color}; border-radius: ${this._dock.config.previewRadius ?? 10}px;`);
        menu.box.opacity = Math.round((this._dock.config.previewOpacity ?? 1) * 255);
        const list = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL});
        scroll.set_child(list);
        // A non-activating item lets the nested, keyboard-focusable buttons handle input.
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        item.add_child(scroll);
        menu.addMenuItem(item);
        let first;
        for (const win of windows) {
            const card = new St.BoxLayout({style_class: 'orbit-preview-card',
                orientation: Clutter.Orientation.VERTICAL,
                style: `border-radius: ${this._dock.config.previewRadius ?? 10}px;`});
            const header = new St.BoxLayout({style_class: 'orbit-preview-header'});
            const title = new St.Label({text: win.get_title() || icon.app.get_name(),
                x_expand: true, y_align: Clutter.ActorAlign.CENTER,
                visible: this._dock.config.previewTitles, style: `font-size: ${this._dock.config.previewTitleSize ?? 12}px;`});
            const close = new St.Button({style_class: 'orbit-preview-close', can_focus: true,
                accessible_name: `Close ${win.get_title() || icon.app.get_name()}`,
                child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 16})});
            close.connect('clicked', () => {
                this.close();
                win.delete(global.get_current_time());
            });
            header.add_child(title);
            header.add_child(close);
            card.add_child(header);
            const width = this._dock.config.previewSize * scale;
            const height = Math.round(width * (this._dock.config.previewRatio ?? 0.56));
            const thumbnail = new St.Widget({width, height, clip_to_allocation: true});
            const actor = win.get_compositor_private();
            if (actor && actor.width > 0 && actor.height > 0) {
                const factor = Math.min(width / actor.width, height / actor.height);
                thumbnail.add_child(new Clutter.Clone({source: actor,
                    scale_x: factor, scale_y: factor,
                    x: (width - actor.width * factor) / 2,
                    y: (height - actor.height * factor) / 2}));
            }
            const activate = new St.Button({style_class: 'orbit-preview-activate', can_focus: true,
                accessible_name: `Activate ${win.get_title() || icon.app.get_name()}`, child: thumbnail,
                style: `border-radius: ${this._dock.config.previewRadius ?? 10}px;`});
            first ??= activate;
            activate.connect('clicked', () => {
                this.close();
                Main.activateWindow(win);
            });
            activate.connect('notify::hover', () => this._peek(activate.hover ? win : null));
            activate.connect('key-focus-in', () => this._peek(win));
            activate.connect('key-focus-out', () => this._peek(null));
            card.add_child(activate);
            list.add_child(card);
            this._signals.push([win, win.connect('unmanaged', () => this.close())]);
            this._signals.push([win, win.connect('notify::title', () => {
                title.text = win.get_title() || icon.app.get_name();
            })]);
        }
        this._signals.push([icon.app, icon.app.connect('windows-changed', () => this.close())]);
        this._signals.push([icon, icon.connect('destroy', () => this.close())]);
        menu.connect('open-state-changed', (_menu, open) => {
            this._dock._previewOpen = open;
            if (!open) {
                this._cancelTimer();
                this._peek(null);
            }
            this._dock._updateVisibility();
        });
        menu.open();
        if (focus)
            first?.grab_key_focus();
    }

    _peek(win) {
        for (const [actor, opacity] of this._dimmed) {
            if (actor.get_stage())
                actor.opacity = opacity;
        }
        this._dimmed.clear();
        if (!win || !this._dock.config.previewPeek || win.minimized)
            return;
        for (const actor of global.get_window_actors()) {
            const other = actor.meta_window;
            if (other !== win && !other.is_ancestor_of_transient(win) &&
                !win.is_ancestor_of_transient(other) && other.showing_on_its_workspace() && !other.minimized) {
                this._dimmed.set(actor, actor.opacity);
                actor.opacity = 70;
            }
        }
    }

    close() {
        this._cancelTimer();
        this._peek(null);
        for (const [object, id] of this._signals)
            object.disconnect(id);
        this._signals = [];
        if (this._menu) {
            const menu = this._menu;
            this._menu = null;
            menu.close();
            this._manager.removeMenu(menu);
            menu.destroy();
        }
        this._manager = null;
        this._icon = null;
        this._dock._previewOpen = false;
    }

    destroy() {
        this.close();
    }
}
