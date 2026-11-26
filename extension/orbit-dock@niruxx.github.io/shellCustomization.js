// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as AltTab from 'resource:///org/gnome/shell/ui/altTab.js';
import {MonitorConstraint} from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {WorkspaceSwitcherPopup} from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';

const ALIGN = {
    start: Clutter.ActorAlign.START,
    center: Clutter.ActorAlign.CENTER,
    end: Clutter.ActorAlign.END,
};

const QUICK_TOGGLES = {
    'dark-style': '_darkMode',
    'night-light': '_nightLight',
    'airplane-mode': '_rfkill',
};

function resizeClone(clone, ratio, maxHeight = Infinity) {
    const [width, height] = clone.get_size();
    const [sourceWidth, sourceHeight] = clone.source.get_size();
    const scale = Math.min(ratio, sourceWidth / width, sourceHeight / height, maxHeight / height);
    if (width > 0 && height > 0 && scale > 0)
        clone.set_size(Math.round(width * scale), Math.round(height * scale));
}

export class ShellCustomization {
    constructor(settings) {
        this._settings = settings;
        this._patches = new Map();
        this._hiddenToggles = new Map();
        this._osdDefaults = new Map();

        settings.connectObject('changed', (_settings, key) => {
            if (key.startsWith('shell-'))
                this._apply();
        }, this);
        Main.sessionMode.connectObject('updated', () => this._applyBannerPosition(), this);
        Main.layoutManager.connectObject('monitors-changed', () => this._applyOsdPosition(), this);
        this._apply();
    }

    _patch(key, target, name, enabled, wrap) {
        const restore = this._patches.get(key);
        if (!enabled) {
            restore?.();
            this._patches.delete(key);
            return;
        }
        if (restore || typeof target?.[name] !== 'function')
            return;

        const descriptor = Object.getOwnPropertyDescriptor(target, name);
        const original = target[name];
        const patched = wrap(original);
        let active = true;
        function replacement(...args) {
            return (active ? patched : original).apply(this, args);
        }
        target[name] = replacement;
        this._patches.set(key, () => {
            active = false;
            if (target[name] !== replacement)
                return;
            if (descriptor)
                Object.defineProperty(target, name, descriptor);
            else
                delete target[name];
        });
    }

    _apply() {
        this._applyBannerPosition();
        this._applyOsdPosition();
        this._applyQuickSettings();
        this._applyWorkspaceSettings();
        this._applySwitcherSettings();
    }

    _applyBannerPosition() {
        const tray = Main.messageTray;
        const position = this._settings.get_string('shell-banner-position');
        if (position === 'default') {
            this._restoreBannerPosition();
        } else {
            const horizontal = tray.bannerAlignment;
            const vertical = tray._bannerBin.y_align;
            if (horizontal !== this._bannerAlignment)
                this._bannerDefault = horizontal;
            if (vertical !== this._bannerVertical)
                this._bannerVerticalDefault = vertical;

            const [edge, alignment] = position.split('-');
            this._bannerAlignment = ALIGN[alignment];
            this._bannerVertical = ALIGN[edge];
            tray.bannerAlignment = this._bannerAlignment;
            tray._bannerBin.y_align = this._bannerVertical;
        }
    }

    _restoreBannerPosition() {
        const tray = Main.messageTray;
        if (this._bannerDefault !== undefined && tray.bannerAlignment === this._bannerAlignment)
            tray.bannerAlignment = this._bannerDefault;
        if (this._bannerVerticalDefault !== undefined && tray._bannerBin.y_align === this._bannerVertical)
            tray._bannerBin.y_align = this._bannerVerticalDefault;
        this._bannerAlignment = undefined;
        this._bannerDefault = undefined;
        this._bannerVertical = undefined;
        this._bannerVerticalDefault = undefined;
    }

    _applyOsdPosition() {
        const position = this._settings.get_string('shell-osd-position');
        const windows = Main.osdWindowManager._osdWindows ?? [];
        if (position === 'default') {
            this._restoreOsdPosition();
            return;
        }
        for (const window of this._osdDefaults.keys()) {
            if (!windows.includes(window))
                this._osdDefaults.delete(window);
        }
        const [vertical, horizontal] = position.split('-');
        for (const window of windows) {
            if (!window)
                continue;
            if (!this._osdDefaults.has(window)) {
                const constraint = window.get_constraints().find(item => item instanceof MonitorConstraint);
                this._osdDefaults.set(window, {x: window.x_align, y: window.y_align,
                    constraint, workArea: constraint?.workArea});
                if (constraint)
                    constraint.workArea = true;
            }
            window.x_align = ALIGN[horizontal ?? 'center'];
            window.y_align = ALIGN[vertical];
        }
    }

    _restoreOsdPosition() {
        for (const window of Main.osdWindowManager._osdWindows ?? []) {
            const defaults = this._osdDefaults.get(window);
            if (!defaults)
                continue;
            window.x_align = defaults.x;
            window.y_align = defaults.y;
            if (defaults.constraint)
                defaults.constraint.workArea = defaults.workArea;
        }
        this._osdDefaults.clear();
    }

    _applyQuickSettings() {
        const quickSettings = Main.panel.statusArea.quickSettings;
        const grid = quickSettings?.menu?._grid;
        if (!grid)
            return;
        if (grid !== this._quickGrid) {
            this._quickGrid?.disconnectObject(this);
            this._restoreQuickSettings();
            this._quickGrid = grid;
            grid.connectObject('child-added', () => {
                // Shell sets grid metadata after inserting each item.
                if (!this._quickSyncId) {
                    this._quickSyncId = GLib.idle_add_once(GLib.PRIORITY_DEFAULT_IDLE, () => {
                        this._quickSyncId = 0;
                        this._applyQuickSettings();
                    });
                }
            }, this);
        }
        for (const [key, field] of Object.entries(QUICK_TOGGLES)) {
            const hide = this._settings.get_boolean(`shell-hide-${key}`);
            for (const item of quickSettings[field]?.quickSettingsItems ?? []) {
                const placeholder = this._hiddenToggles.get(item);
                if (hide && !placeholder && item.get_parent() === grid) {
                    // Keep the real toggle's visibility bindings and indicator state.
                    const slot = new St.Widget({visible: false});
                    this._hiddenToggles.set(item, slot);
                    item.menu?.close();
                    grid.replace_child(item, slot);
                    slot.add_child(item);
                } else if (!hide && placeholder) {
                    this._restoreToggle(item, placeholder);
                }
            }
        }
    }

    _restoreToggle(item, slot) {
        this._hiddenToggles.delete(item);
        slot.remove_child(item);
        slot.get_parent()?.replace_child(slot, item);
        slot.destroy();
    }

    _restoreQuickSettings() {
        for (const [item, slot] of this._hiddenToggles)
            this._restoreToggle(item, slot);
    }

    _applyWorkspaceSettings() {
        const wrap = this._settings.get_boolean('shell-workspace-wraparound');
        this._patch('neighbors', Meta.Workspace.prototype, 'get_neighbor', wrap, original => function (direction) {
            const neighbor = original.call(this, direction);
            const manager = global.workspace_manager;
            if (neighbor !== this || manager.n_workspaces < 2)
                return neighbor;

            const vertical = manager.layout_rows === -1;
            const rtl = Clutter.get_default_text_direction() === Clutter.TextDirection.RTL;
            const motion = Meta.MotionDirection;
            const previous = vertical ? motion.UP : rtl ? motion.RIGHT : motion.LEFT;
            const next = vertical ? motion.DOWN : rtl ? motion.LEFT : motion.RIGHT;
            const index = this.index();
            const last = manager.n_workspaces - 1;
            if (direction === previous && index === 0)
                return manager.get_workspace_by_index(last);
            if (direction === next && index === last)
                return manager.get_workspace_by_index(0);
            return neighbor;
        });

        const hide = this._settings.get_boolean('shell-hide-workspace-popup');
        this._patch('workspace-popup', WorkspaceSwitcherPopup.prototype, 'display', hide,
            original => function (...args) {
                // Let Shell keep its normal popup lifetime and workspace-update bookkeeping.
                const result = original.apply(this, args);
                this.hide();
                return result;
            });
        if (hide)
            Main.wm._workspaceSwitcherPopup?.hide();
    }

    _applySwitcherSettings() {
        const settings = this._settings;
        const delay = settings.get_int('shell-switcher-delay');
        for (const popup of [AltTab.AppSwitcherPopup, AltTab.WindowSwitcherPopup]) {
            this._patch(popup, popup.prototype, 'show', delay >= 0, original => function (...args) {
                const shown = original.apply(this, args);
                if (!shown || !this._initialDelayTimeoutId || !this._showImmediately)
                    return shown;
                const milliseconds = settings.get_int('shell-switcher-delay');
                if (milliseconds === 0) {
                    this._showImmediately();
                } else if (milliseconds > 0) {
                    GLib.source_remove(this._initialDelayTimeoutId);
                    // Shell cancels this same source on release, click, and destruction.
                    this._initialDelayTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
                        this._showImmediately();
                        return GLib.SOURCE_REMOVE;
                    });
                }
                return shown;
            });
        }

        const resize = settings.get_int('shell-switcher-preview-size') !== 100;
        this._patch('window-previews', AltTab.WindowIcon.prototype, '_init', resize,
            original => function (...args) {
                original.apply(this, args);
                const clone = this._icon.get_children().find(actor => actor instanceof Clutter.Clone);
                if (clone) {
                    const ratio = settings.get_int('shell-switcher-preview-size') / 100;
                    resizeClone(clone, ratio);
                    this._icon.set_size(Math.round(this._icon.width * ratio), Math.round(this._icon.height * ratio));
                }
            });
        this._patch('app-previews', AltTab.AppSwitcherPopup.prototype, '_createThumbnails', resize,
            original => function (...args) {
                original.apply(this, args);
                const thumbnails = this._thumbnails;
                const addClones = thumbnails?.addClones;
                if (!addClones)
                    return;

                // Shell may allocate synchronously inside _createThumbnails().
                const resizeClones = available => {
                    const ratio = settings.get_int('shell-switcher-preview-size') / 100;
                    for (const clone of thumbnails._clones) {
                        const bin = clone.get_parent();
                        const height = Math.min(bin.height * ratio, available);
                        if (height > 0) {
                            resizeClone(clone, ratio, height);
                            bin.set_height(Math.round(height));
                        }
                    }
                };
                if (thumbnails._clones.length) {
                    resizeClones(thumbnails.height);
                } else {
                    thumbnails.addClones = function (available) {
                        addClones.call(this, available);
                        if (this._clones.length) {
                            delete this.addClones;
                            resizeClones(available);
                        }
                    };
                }
            });
    }

    destroy() {
        this._settings.disconnectObject(this);
        Main.sessionMode.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._quickGrid?.disconnectObject(this);
        if (this._quickSyncId)
            GLib.source_remove(this._quickSyncId);
        this._restoreQuickSettings();
        this._restoreBannerPosition();
        this._restoreOsdPosition();
        for (const restore of this._patches.values())
            restore();
        this._patches.clear();
    }
}
