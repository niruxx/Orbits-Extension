// SPDX-License-Identifier: GPL-3.0-or-later
//
// Preferences pages: Dock, Top Bar, Launcher, Personalization, Effects.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import * as W from './prefsWidgets.js';

const CONFLICTING_DOCKS = [
    'dash-to-dock@micxgx.gmail.com',
    'ubuntu-dock@ubuntu.com',
    'dash-to-panel@jderose9.github.com',
];
const APPINDICATOR_EXTENSIONS = [
    'appindicatorsupport@rgcjonas.gmail.com',
    'ubuntu-appindicators@ubuntu.com',
];
const BUTTON_LAYOUTS = [
    ['appmenu:close', 'Right — close only (GNOME)'],
    ['appmenu:minimize,maximize,close', 'Right — minimize, maximize, close (Windows)'],
    ['close,minimize,maximize:appmenu', 'Left — close, minimize, maximize (macOS / Unity)'],
    ['close:appmenu', 'Left — close only'],
];

/** Records the keys a page uses so its Reset button can reset exactly those. */
class Rows {
    constructor(settings) {
        this.settings = settings;
        this.keys = [];
    }

    _k(key) {
        if (!this.keys.includes(key))
            this.keys.push(key);
    }

    switch(key, title, subtitle = '', onUser = null) {
        this._k(key);
        return W.switchRow(this.settings, key, title, subtitle, onUser);
    }

    spin(key, title, lower, upper, step, subtitle = '', digits = 0, onUser = null) {
        this._k(key);
        return W.spinRow(this.settings, key, title, lower, upper, step, subtitle, digits, onUser);
    }

    percent(key, title, subtitle = '', onUser = null) {
        this._k(key);
        return W.percentRow(this.settings, key, title, subtitle, onUser);
    }

    combo(key, title, subtitle = '') {
        this._k(key);
        return W.comboRow(this.settings, key, title, subtitle);
    }

    color(key, title, enableKey = null, onUser = null) {
        this._k(key);
        return W.colorRow(this.settings, key, title, enableKey, onUser);
    }
}

function makePage(title, iconName) {
    return new Adw.PreferencesPage({title, icon_name: iconName});
}

function addReset(window, page, firstGroup, rows, what) {
    firstGroup.set_header_suffix(W.resetButton(window, rows.settings, rows.keys, what));
    return page;
}

// ---- other extensions -------------------------------------------------------
// GNOME Shell serves org.gnome.Shell.Extensions on the bus name org.gnome.Shell.
// (The bus name "org.gnome.Shell.Extensions" is the Extensions app this window
// runs in, so calling it from here would block on ourselves.) Calls are async
// so the window never waits on the Shell.

function shellExtensionsCall(method, uuid, callback = null) {
    Gio.DBus.session.call('org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell.Extensions',
        method, new GLib.Variant('(s)', [uuid]), null, Gio.DBusCallFlags.NONE, 3000, null,
        (conn, res) => {
            let reply = null;
            try {
                reply = conn.call_finish(res);
            } catch {
                // Shell not reachable or extension unknown: treat as inactive.
            }
            callback?.(reply);
        });
}

function conflictRow(title, subtitle, uuids) {
    const row = new Adw.ActionRow({title, subtitle, css_classes: ['warning'], visible: false});
    const active = new Set();
    for (const uuid of uuids) {
        shellExtensionsCall('GetExtensionInfo', uuid, reply => {
            const info = reply?.recursiveUnpack()[0];
            if (info?.state === 1) {
                active.add(uuid);
                row.visible = true;
            }
        });
    }
    const button = new Gtk.Button({label: 'Disable It', valign: Gtk.Align.CENTER});
    button.connect('clicked', () => {
        active.forEach(uuid => shellExtensionsCall('DisableExtension', uuid));
        row.visible = false;
    });
    row.add_suffix(button);
    return row;
}

// ---- pages ----------------------------------------------------------------

export function dockPage(window, settings) {
    const r = new Rows(settings);
    const page = makePage('Dock', 'view-grid-symbolic');
    const panelOff = row => W.sensitiveWhen(settings, row, 'extend-to-edge', true);

    const position = W.group('Position &amp; Size', [
        r.combo('dock-position', 'Position'),
        r.spin('icon-size', 'Icon size', 16, 128, 2, 'Shrinks automatically when the dock is full'),
        r.switch('extend-to-edge', 'Panel mode', 'Stretch the dock across the whole edge'),
        panelOff(r.spin('margin', 'Edge gap', 0, 64, 1, 'Space between the dock and the screen edge')),
        r.switch('multi-monitor', 'Show on all monitors'),
    ]);
    position.add(conflictRow('Another dock is active',
        'Dash to Dock / Ubuntu Dock / Dash to Panel will fight with Orbit\'s dock.', CONFLICTING_DOCKS));
    page.add(position);
    page.add(W.group('Visibility', [
        r.combo('dock-mode', 'Behaviour', 'Intelligent autohide hides only when a window overlaps the dock'),
        r.combo('intellihide-scope', 'Hide for'),
        r.spin('pressure-threshold', 'Reveal pressure', 0, 1000, 10,
            'How hard to push the screen edge to show a hidden dock (px)'),
        r.spin('hide-delay', 'Hide delay', 0, 5000, 50, 'Milliseconds'),
        r.spin('animation-time', 'Animation duration', 0, 2000, 25, 'Milliseconds'),
        r.switch('hide-overview-dash', 'Hide the overview dash', 'Replace the Activities dash with the dock'),
    ]));
    page.add(W.group('Content', [
        r.switch('show-favorites', 'Show pinned apps'),
        r.switch('show-running', 'Show running apps'),
        r.switch('show-apps-button', 'Show applications button'),
        r.combo('show-apps-position', 'Applications button position'),
        r.combo('show-apps-action', 'Applications button opens'),
        r.switch('isolate-workspaces', 'Current workspace only',
            'Running apps and window counts only include this workspace'),
        r.switch('isolate-monitors', 'Current monitor only',
            'With multiple docks, each one only shows its monitor\'s windows'),
    ]));
    page.add(W.group('Clicks &amp; Scrolling', [
        r.combo('click-action', 'Click'),
        r.combo('middle-click-action', 'Middle click'),
        r.combo('scroll-action', 'Scroll'),
    ]));
    page.add(W.group('Appearance', [
        r.combo('indicator-style', 'Running indicator'),
        r.percent('background-opacity', 'Background opacity'),
        panelOff(r.spin('border-radius', 'Corner radius', 0, 64, 1)),
        r.switch('glass-dock', 'Frosted glass', 'Blur the wallpaper behind the dock'),
        r.switch('use-custom-color', 'Custom background colour'),
        r.color('background-color', 'Background colour', 'use-custom-color'),
    ]));
    return addReset(window, page, position, r, 'Dock');
}

export function topBarPage(window, settings) {
    const r = new Rows(settings);
    const page = makePage('Top Bar', 'go-top-symbolic');

    // Changing how the bar looks only works when Orbit draws it, so switch the
    // theme-default style to Translucent when the user changes one of these.
    const drawnKeys = ['top-bar-transparent-opacity', 'top-bar-use-custom-color', 'top-bar-color',
        'top-bar-floating', 'top-bar-radius', 'glass-top-bar'];
    const userChanged = key => {
        if (drawnKeys.includes(key) && settings.get_string('top-bar-style') === 'default') {
            settings.set_string('top-bar-style', 'translucent');
            W.toast(window, 'Top bar switched to Translucent so your change shows');
        }
    };

    const trigger = W.sensitiveWhenValue(settings, r.combo('top-bar-dynamic-trigger', 'Turn solid when',
        'Dynamic style only'), 'top-bar-style', ['dynamic']);
    const solid = W.sensitiveWhenValue(settings, r.percent('top-bar-solid-opacity',
        'Opacity when a window touches it', 'Dynamic style only'), 'top-bar-style', ['dynamic']);
    const interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});

    const behaviour = W.group('Behaviour', [
        r.combo('top-bar-style', 'Style', 'Theme default keeps your Shell theme\'s bar untouched'),
        trigger,
        r.spin('top-bar-transition', 'Fade duration', 0, 2000, 25, 'Milliseconds'),
    ]);
    page.add(behaviour);
    page.add(W.group('Transparency &amp; Colour', [
        r.percent('top-bar-transparent-opacity', 'Opacity',
            '0% is fully see-through. In Dynamic style: while no window touches the bar', userChanged),
        solid,
        r.switch('top-bar-floating', 'Floating',
            'Rounded bar with a small gap from the screen edges (in Dynamic style: while see-through)',
            userChanged),
        r.spin('top-bar-radius', 'Floating corner radius', 0, 32, 1, '', 0, userChanged),
        r.switch('glass-top-bar', 'Frosted glass', 'Blur the wallpaper behind the bar', userChanged),
        r.switch('top-bar-use-custom-color', 'Custom colour', 'Otherwise black', userChanged),
        r.color('top-bar-color', 'Bar colour', 'top-bar-use-custom-color', userChanged),
    ]));
    page.add(W.group('Layout', [
        r.switch('top-bar-hide-activities', 'Hide Activities button'),
        r.combo('top-bar-clock-position', 'Clock position'),
        W.switchRow(interfaceSettings, 'enable-hot-corners', 'Hot corner',
            'Push the pointer into the top-left corner to open the overview'),
    ]));
    return addReset(window, page, behaviour, r, 'Top bar');
}

export function launcherPage(window, settings) {
    const r = new Rows(settings);
    const page = makePage('Launcher', 'view-app-grid-symbolic');
    const open = W.group('Open the Launcher With', [
        r.combo('super-key-action', 'Super key'),
        r.combo('activities-action', 'Activities button'),
        r.combo('show-apps-action', 'Dock applications button'),
        r.switch('skip-startup-overview', 'Start on the desktop', 'Don\'t open the overview after logging in'),
    ], 'A compact app menu with search, categories and favourites, similar to Plasma\'s application ' +
       'launcher. Type to search, use the arrow keys and Enter, or Escape to close.');
    page.add(open);
    page.add(W.group('Appearance', [
        r.spin('launcher-icon-size', 'Icon size', 16, 64, 2),
        r.switch('launcher-show-descriptions', 'Show descriptions'),
        r.switch('launcher-show-power', 'Show power buttons', 'Lock, log out, suspend, restart and power off'),
        r.percent('launcher-opacity', 'Background opacity'),
        r.switch('glass-launcher', 'Frosted glass', 'Blur the wallpaper behind the launcher'),
    ]));
    return addReset(window, page, open, r, 'Launcher');
}

export function personalizationPage(window, settings) {
    const r = new Rows(settings);
    const page = makePage('Personalization', 'user-desktop-symbolic');
    const tray = W.group('Application Indicators', [
        r.switch('tray-enabled', 'Show tray icons',
            'Legacy status icons from apps like Discord, Steam, Telegram and Nextcloud ' +
            '(AppIndicator / StatusNotifierItem)'),
        r.combo('tray-position', 'Location'),
        r.spin('tray-icon-size', 'Icon size', 12, 48, 1),
    ], 'Electron apps (Discord, Slack…) register their icon when they start: restart such an app ' +
       'if you turned the tray on while it was running.');
    tray.add(conflictRow('Another indicator extension is active',
        'Only one program can host tray icons. Disable the AppIndicator extension to use Orbit\'s tray.',
        APPINDICATOR_EXTENSIONS));
    page.add(tray);
    page.add(W.group('Focused Application', [
        r.switch('app-button-enabled', 'Show the current app in the top bar',
            'Click it for the app\'s windows, New Window and Quit'),
        r.combo('app-button-position', 'Position'),
        r.switch('app-button-show-icon', 'Show icon'),
        r.switch('app-button-show-title', 'Show window title instead of app name'),
    ]));

    const wm = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
    const current = wm.get_string('button-layout');
    const layouts = [...BUTTON_LAYOUTS];
    if (!layouts.some(l => l[0] === current))
        layouts.push([current, `Custom (${current})`]);
    page.add(W.group('Windows', [
        W.comboRow(wm, 'button-layout', 'Title bar buttons', '', layouts),
    ]));
    return addReset(window, page, tray, r, 'Personalization');
}

export function effectsPage(window, settings) {
    const r = new Rows(settings);
    const page = makePage('Effects', 'weather-fog-symbolic');
    const glass = W.group('Frosted Glass', [
        r.switch('glass-dock', 'Dock'),
        r.switch('glass-top-bar', 'Top bar'),
        r.switch('glass-launcher', 'Launcher'),
    ], 'Glassmorphism for Shell surfaces: a blurred copy of the wallpaper behind each surface, ' +
       'tinted by its background colour. Lower a surface\'s opacity for a clearer glass look. ' +
       'Windows behind are not blurred, which keeps it smooth and rounded corners clean.');
    page.add(glass);
    page.add(W.group('Frost', [
        r.spin('glass-blur-radius', 'Blur strength', 0, 100, 2, 'Pixels'),
        r.percent('glass-brightness', 'Brightness', 'Lower values darken the glass'),
        r.switch('glass-highlight', 'Frosted edge', 'A soft light border on glass surfaces'),
    ]));
    return addReset(window, page, glass, r, 'Effects');
}
