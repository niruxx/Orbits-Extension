// SPDX-License-Identifier: GPL-3.0-or-later
//
// Layouts page: one-click desktop layouts (GNOME, Ubuntu Unity, Windows,
// macOS). A preset is a full set of Orbit Shell settings plus the title bar
// button layout; applying snapshots everything first so it can be undone.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Cairo from 'cairo';

import {toast} from './prefsWidgets.js';

const WM_SCHEMA = 'org.gnome.desktop.wm.preferences';

const PRESETS = [
    {
        title: 'GNOME',
        description: 'GNOME\'s own workflow: Super opens the overview, floating dock that hides ' +
            'when windows need the space, standard top bar.',
        preview: {topBar: 'solid', dock: 'bottom-float', startButton: 'end'},
        orbit: {}, // all defaults
        wm: {'button-layout': 'appmenu:close'},
    },
    {
        title: 'Ubuntu Unity',
        description: 'Full-height launcher on the left with the app menu button at the top, Super ' +
            'opens the launcher, focused app name and tray icons in the top bar, window buttons on the left.',
        preview: {topBar: 'solid', dock: 'left-panel', startButton: 'start', appName: true, buttonsLeft: true},
        orbit: {
            'dock-position': 'left', 'extend-to-edge': true, 'dock-mode': 'fixed',
            'icon-size': 48, 'show-apps-button': true, 'show-apps-position': 'start',
            'show-apps-action': 'launcher', 'indicator-style': 'dot', 'background-opacity': 0.88,
            'hide-overview-dash': true,
            'top-bar-style': 'default', 'top-bar-hide-activities': true, 'top-bar-clock-position': 'right',
            'app-button-enabled': true, 'app-button-position': 'left',
            'tray-enabled': true, 'tray-position': 'top-bar',
            'super-key-action': 'launcher', 'activities-action': 'launcher', 'skip-startup-overview': true,
        },
        wm: {'button-layout': 'close,minimize,maximize:appmenu'},
    },
    {
        title: 'Windows 10',
        description: 'One taskbar along the bottom: start button and apps on the left, tray and ' +
            'clock on the right. Super opens a start-menu style launcher.',
        preview: {topBar: 'taskbar', dock: 'taskbar', startButton: 'start'},
        orbit: {
            'top-bar-position': 'bottom', 'dock-in-panel': true, 'taskbar-alignment': 'left', 'top-bar-height': 44, 'taskbar-icon-size': 28, 'launcher-style': 'modern',
            'show-apps-button': true, 'show-apps-position': 'start', 'show-apps-action': 'launcher',
            'indicator-style': 'line', 'hide-overview-dash': true,
            'top-bar-style': 'default', 'top-bar-hide-activities': true, 'top-bar-clock-position': 'right',
            'tray-enabled': true, 'tray-position': 'top-bar',
            'super-key-action': 'launcher', 'activities-action': 'launcher', 'skip-startup-overview': true,
        },
        wm: {'button-layout': 'appmenu:minimize,maximize,close'},
    },
    {
        title: 'Windows 11',
        description: 'One taskbar along the bottom with the start button and apps centred, tray ' +
            'and clock on the right. Super opens the launcher.',
        preview: {topBar: 'taskbar', dock: 'taskbar', startButton: 'start', centered: true},
        orbit: {
            'top-bar-position': 'bottom', 'dock-in-panel': true, 'taskbar-alignment': 'center', 'top-bar-height': 44, 'taskbar-icon-size': 28, 'launcher-style': 'modern',
            'show-apps-button': true, 'show-apps-position': 'start', 'show-apps-action': 'launcher',
            'indicator-style': 'line', 'hide-overview-dash': true,
            'top-bar-style': 'default', 'top-bar-hide-activities': true, 'top-bar-clock-position': 'right',
            'tray-enabled': true, 'tray-position': 'top-bar',
            'super-key-action': 'launcher', 'activities-action': 'launcher', 'skip-startup-overview': true,
        },
        wm: {'button-layout': 'appmenu:minimize,maximize,close'},
    },
    {
        title: 'Windows XP',
        description: 'Taskbar along the bottom with the start button first and a two-column ' +
            'app menu: apps on the left, folders and settings on the right.',
        preview: {topBar: 'taskbar', dock: 'taskbar', startButton: 'start', xp: true},
        orbit: {
            'top-bar-position': 'bottom', 'dock-in-panel': true, 'taskbar-alignment': 'left',
            'top-bar-height': 34, 'taskbar-icon-size': 22, 'launcher-style': 'xp',
            'show-apps-button': true, 'show-apps-position': 'start', 'show-apps-action': 'launcher',
            'indicator-style': 'line', 'hide-overview-dash': true,
            'top-bar-style': 'default', 'top-bar-hide-activities': true, 'top-bar-clock-position': 'right',
            'tray-enabled': true, 'tray-position': 'top-bar',
            'super-key-action': 'launcher', 'activities-action': 'launcher', 'skip-startup-overview': true,
        },
        wm: {'button-layout': 'appmenu:minimize,maximize,close'},
    },
    {
        title: 'macOS',
        description: 'Translucent frosted menu bar with the current app\'s name, a floating glass ' +
            'dock that hides when windows need the space, window buttons on the left.',
        preview: {topBar: 'translucent', dock: 'bottom-float', startButton: 'end', appName: true,
            buttonsLeft: true, glass: true},
        orbit: {
            'dock-position': 'bottom', 'extend-to-edge': false, 'dock-mode': 'intellihide',
            'icon-size': 52, 'margin': 6, 'border-radius': 20, 'indicator-style': 'dot',
            'show-apps-position': 'end', 'show-apps-action': 'overview',
            'background-opacity': 0.35, 'glass-dock': true, 'hide-overview-dash': true,
            'top-bar-style': 'translucent', 'top-bar-transparent-opacity': 0.35,
            'glass-top-bar': true, 'top-bar-hide-activities': true, 'top-bar-clock-position': 'right',
            'app-button-enabled': true, 'app-button-position': 'left',
            'tray-enabled': true, 'tray-position': 'top-bar',
            'skip-startup-overview': true, 'glass-launcher': true,
        },
        wm: {'button-layout': 'close,minimize,maximize:appmenu'},
    },
];

function variantFor(settings, key, value) {
    return new GLib.Variant(settings.get_value(key).get_type_string(), value);
}

function applyPreset(window, settings, preset) {
    const wm = new Gio.Settings({schema_id: WM_SCHEMA});
    const keys = settings.settings_schema.list_keys();
    const snapshot = {
        orbit: keys.map(k => [k, settings.get_value(k)]),
        wm: Object.keys(preset.wm).map(k => [k, wm.get_value(k)]),
    };

    settings.delay();
    for (const key of keys) {
        if (key in preset.orbit)
            settings.set_value(key, variantFor(settings, key, preset.orbit[key]));
        else
            settings.reset(key);
    }
    settings.apply();
    for (const [key, value] of Object.entries(preset.wm))
        wm.set_value(key, variantFor(wm, key, value));

    toast(window, `Applied the ${preset.title} layout`, 'Undo', () => {
        settings.delay();
        for (const [key, value] of snapshot.orbit)
            settings.set_value(key, value);
        settings.apply();
        for (const [key, value] of snapshot.wm)
            wm.set_value(key, value);
        toast(window, 'Previous layout restored');
    }, 10);
}

// ---- preview drawing ------------------------------------------------------

const APP_COLORS = [[0.27, 0.52, 0.95], [0.96, 0.62, 0.17], [0.35, 0.78, 0.45],
    [0.89, 0.29, 0.36], [0.62, 0.42, 0.88]];

function rounded(cr, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
}

function icons(cr, x, y, count, size, gap, vertical) {
    for (let i = 0; i < count; i++) {
        const [r, g, b] = APP_COLORS[i % APP_COLORS.length];
        cr.setSourceRGB(r, g, b);
        rounded(cr, x + (vertical ? 0 : i * (size + gap)), y + (vertical ? i * (size + gap) : 0),
            size, size, size * 0.28);
        cr.fill();
    }
}

function grid(cr, x, y, size) {
    cr.setSourceRGBA(1, 1, 1, 0.85);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            cr.arc(x + size * (0.25 + i * 0.25), y + size * (0.25 + j * 0.25), size * 0.06, 0, 2 * Math.PI);
            cr.fill();
        }
    }
}

function startButton(cr, x, y, size) {
    cr.setSourceRGB(0.91, 0.33, 0.13);
    rounded(cr, x, y, size, size, size * 0.28);
    cr.fill();
    grid(cr, x, y, size);
}

function drawPreview(cr, w, h, p) {
    rounded(cr, 0, 0, w, h, 12);
    cr.clip();
    const bg = new Cairo.LinearGradient(0, 0, w, h);
    bg.addColorStopRGB(0, 0.20, 0.27, 0.62);
    bg.addColorStopRGB(1, 0.52, 0.30, 0.70);
    cr.setSource(bg);
    cr.paint();

    const taskbar = p.topBar === 'taskbar';
    const barH = taskbar ? 0 : h * 0.075;
    if (!taskbar) {
        cr.setSourceRGBA(0.05, 0.05, 0.07, p.topBar === 'solid' ? 0.95 : 0.35);
        cr.rectangle(0, 0, w, barH);
        cr.fill();
        cr.setSourceRGBA(1, 1, 1, 0.85);
        rounded(cr, w / 2 - 14, barH * 0.35, 28, barH * 0.3, 2);
        cr.fill();
        if (p.appName) {
            rounded(cr, p.dock === 'left-panel' ? 30 : 10, barH * 0.35, 30, barH * 0.3, 2);
            cr.fill();
        }
        cr.setSourceRGBA(1, 1, 1, 0.7);
        for (let i = 0; i < 3; i++) {
            cr.arc(w - 10 - i * 9, barH / 2, 2.4, 0, 2 * Math.PI);
            cr.fill();
        }
    }

    // a window
    const dockLeft = p.dock === 'left-panel' ? w * 0.09 : 0;
    const wx = dockLeft + w * 0.14, wy = barH + h * 0.12, ww = w * 0.58, wh = h * 0.52;
    cr.setSourceRGBA(0, 0, 0, 0.25);
    rounded(cr, wx + 2, wy + 3, ww, wh, 6);
    cr.fill();
    cr.setSourceRGB(0.97, 0.97, 0.98);
    rounded(cr, wx, wy, ww, wh, 6);
    cr.fill();
    cr.setSourceRGB(0.90, 0.90, 0.92);
    rounded(cr, wx, wy, ww, h * 0.07, 6);
    cr.fill();
    [[0.93, 0.33, 0.31], [0.97, 0.75, 0.25], [0.35, 0.78, 0.45]].forEach(([r, g, b], i) => {
        cr.setSourceRGB(r, g, b);
        const bx = p.buttonsLeft ? wx + 8 + i * 8 : wx + ww - 8 - i * 8;
        cr.arc(bx, wy + h * 0.035, 2.4, 0, 2 * Math.PI);
        cr.fill();
    });

    // dock
    const icon = h * 0.075, gap = icon * 0.35, n = 5;
    if (p.dock === 'bottom-float') {
        const dw = n * icon + (n - 1) * gap + icon + gap + 12;
        const dx = (w - dw) / 2, dy = h - icon - 16;
        cr.setSourceRGBA(0.12, 0.12, 0.16, p.glass ? 0.45 : 0.8);
        rounded(cr, dx, dy, dw, icon + 10, 9);
        cr.fill();
        if (p.glass) {
            cr.setSourceRGBA(1, 1, 1, 0.25);
            cr.setLineWidth(1);
            rounded(cr, dx, dy, dw, icon + 10, 9);
            cr.stroke();
        }
        icons(cr, dx + 6, dy + 5, n, icon, gap, false);
        grid(cr, dx + 6 + n * (icon + gap), dy + 5, icon);
    } else if (p.dock === 'bottom-panel') {
        const ph = icon + 8;
        cr.setSourceRGBA(0.08, 0.08, 0.10, 0.92);
        cr.rectangle(0, h - ph, w, ph);
        cr.fill();
        let x0 = 8;
        if (p.startButton === 'start') {
            startButton(cr, x0, h - ph + 4, icon);
            x0 += icon + gap * 2;
        }
        icons(cr, x0, h - ph + 4, n, icon, gap, false);
    } else if (p.dock === 'taskbar') {
        // single bottom bar: start + apps (left or centred), tray dots + clock right
        const ph = h * 0.1;
        const ty = h - ph;
        if (p.xp)
            cr.setSourceRGB(0.13, 0.33, 0.80);
        else
            cr.setSourceRGBA(0.06, 0.06, 0.08, 0.95);
        cr.rectangle(0, ty, w, ph);
        cr.fill();
        const s = ph * 0.62, g = s * 0.3, count = n + 1;
        const total = count * s + (count - 1) * g;
        let x0 = p.centered ? (w - total) / 2 : 8;
        if (p.xp) {
            // green "start" pill
            cr.setSourceRGB(0.24, 0.62, 0.25);
            rounded(cr, 0, ty, s * 2.6, ph, ph / 2);
            cr.fill();
            x0 = s * 2.6 + g;
        } else {
            startButton(cr, x0, ty + (ph - s) / 2, s);
            x0 += s + g;
        }
        icons(cr, x0, ty + (ph - s) / 2, n, s, g, false);
        cr.setSourceRGBA(1, 1, 1, 0.8);
        for (let i = 0; i < 3; i++) {
            cr.arc(w - 46 - i * 9, ty + ph / 2, 2.2, 0, 2 * Math.PI);
            cr.fill();
        }
        rounded(cr, w - 34, ty + ph * 0.38, 26, ph * 0.24, 2);
        cr.fill();
    } else if (p.dock === 'left-panel') {
        cr.setSourceRGBA(0.08, 0.08, 0.10, 0.9);
        cr.rectangle(0, barH, dockLeft, h - barH);
        cr.fill();
        const ix = (dockLeft - icon) / 2;
        let y0 = barH + 6;
        if (p.startButton === 'start') {
            startButton(cr, ix, y0, icon);
            y0 += icon + gap * 1.5;
        }
        icons(cr, ix, y0, n, icon, gap, true);
    }
}

// ---- page -----------------------------------------------------------------

function card(window, settings, preset) {
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8, css_classes: ['card']});
    const area = new Gtk.DrawingArea({
        content_width: 260, content_height: 156, margin_top: 12, margin_start: 12, margin_end: 12,
    });
    area.set_draw_func((_a, cr, w, h) => {
        drawPreview(cr, w, h, preset.preview);
        cr.$dispose();
    });
    box.append(area);
    box.append(new Gtk.Label({label: preset.title, xalign: 0, css_classes: ['title-4'],
        margin_start: 12, margin_end: 12}));
    box.append(new Gtk.Label({label: preset.description, xalign: 0, wrap: true, css_classes: ['dim-label'],
        margin_start: 12, margin_end: 12, max_width_chars: 36, vexpand: true, valign: Gtk.Align.START}));
    const apply = new Gtk.Button({label: 'Apply', css_classes: ['suggested-action', 'pill'],
        halign: Gtk.Align.END, margin_end: 12, margin_bottom: 12});
    apply.connect('clicked', () => applyPreset(window, settings, preset));
    box.append(apply);
    return box;
}

export function layoutsPage(window, settings) {
    const page = new Adw.PreferencesPage({title: 'Layouts', icon_name: 'view-dual-symbolic'});
    const group = new Adw.PreferencesGroup({
        description: 'Pick a starting point. Each layout changes the dock, top bar, launcher and ' +
            'window buttons; fine-tune anything afterwards on the other pages.',
    });
    const flow = new Gtk.FlowBox({
        selection_mode: Gtk.SelectionMode.NONE, homogeneous: true,
        min_children_per_line: 1, max_children_per_line: 2,
        row_spacing: 18, column_spacing: 18,
    });
    for (const preset of PRESETS)
        flow.append(card(window, settings, preset));
    group.add(flow);
    page.add(group);
    return page;
}
