// SPDX-License-Identifier: GPL-3.0-or-later
//
// Preferences pages: Dock, Top Bar, Launcher, Personalization, Effects.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import * as W from './prefsWidgets.js';
import {trayControls} from './trayPrefs.js';
import {addLauncherControls} from './launcherPrefs.js';

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
export class Rows {
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

export function conflictRow(title, subtitle, uuids) {
    const row = new Adw.ActionRow({title, subtitle, css_classes: ['warning'], visible: false});
    const active = new Set();
    for (const uuid of uuids) {
        shellExtensionsCall('GetExtensionInfo', uuid, reply => {
            const info = reply?.recursiveUnpack()[0];
            if (info?.state === 1) {
                active.add(uuid);
                row.visible = true;
                row.subtitle = `${subtitle} Active: ${[...active].join(', ')}`;
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
        r.switch('fixed-icon-size', 'Keep icon size', 'Scroll overflowing apps instead of shrinking icons'),
        r.percent('dock-length-limit', 'Maximum dock length', 'Fraction of the available screen edge; standalone dock only'),
        r.switch('extend-to-edge', 'Panel mode', 'Stretch the dock across the whole edge'),
        panelOff(r.spin('margin', 'Edge gap', 0, 64, 1, 'Space between the dock and the screen edge')),
        r.switch('multi-monitor', 'Show on all monitors'),
        r.spin('preferred-monitor', 'Preferred monitor', -1, 31, 1,
            'Standalone dock only: -1 follows the primary display; 0 is the first monitor. Ignored when showing on all monitors.'),
    ]);
    position.add(conflictRow('Another dock is active',
        'Dash to Dock / Ubuntu Dock / Dash to Panel will fight with Orbit\'s dock.', CONFLICTING_DOCKS));
    page.add(position);
    const taskbar = W.group('Taskbar', [
        r.switch('dock-in-panel', 'Enable integrated taskbars',
            'Combine applications, clock, tray and system controls in one panel. Configure each display on the Taskbar page.'),
        r.combo('taskbar-alignment', 'Apps alignment'),
        r.switch('group-apps', 'Group windows by application', 'Turn off for a separate taskbar button per window'),
        r.switch('window-titles', 'Show ungrouped window titles'),
        r.spin('window-title-width', 'Window title width', 40, 300, 10, 'Logical pixels; applies when windows are ungrouped'),
        r.spin('taskbar-icon-size', 'Taskbar icon size', 16, 48, 2),
        r.switch('show-desktop-button', 'Show Desktop button', 'Minimize or restore windows on the current workspace'),
        r.switch('show-desktop-peek', 'Peek at desktop on hover', 'Temporarily hide windows after a short hover over Show Desktop'),
    ]);
    page.add(taskbar);
    page.add(W.group('Visibility', [
        r.combo('dock-mode', 'Behaviour', 'Intelligent autohide hides only when a window overlaps the dock'),
        r.combo('intellihide-scope', 'Hide for'),
        r.spin('pressure-threshold', 'Reveal pressure', 0, 1000, 10,
            'How hard to push the screen edge to show a hidden dock (px)'),
        r.spin('show-delay', 'Reveal delay', 0, 3000, 50, 'Milliseconds after edge pressure triggers'),
        r.switch('fullscreen-reveal', 'Allow reveal over fullscreen windows'),
        r.switch('reveal-urgent', 'Reveal for urgent apps'),
        r.spin('hide-delay', 'Hide delay', 0, 5000, 50, 'Milliseconds'),
        r.spin('animation-time', 'Animation duration', 0, 2000, 25, 'Milliseconds'),
        r.switch('hide-overview-dash', 'Hide the GNOME dash in Activities'),
    ]));
    page.add(W.group('Content', [
        r.switch('show-favorites', 'Show pinned apps'),
        r.switch('favorites-primary-only', 'Pinned apps on primary monitor only'),
        r.switch('show-running', 'Show running apps'),
        r.switch('show-trash', 'Show Trash'),
        r.switch('show-mounts', 'Show volumes and drives'),
        r.switch('mounts-only-mounted', 'Mounted volumes only'),
        r.switch('mounts-local', 'Include local volumes'),
        r.switch('mounts-network', 'Include network mounts'),
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
        r.combo('shift-click-action', 'Shift + click'),
        r.combo('shift-middle-click-action', 'Shift + middle click'),
        r.combo('scroll-action', 'Scroll'),
    ]));
    page.add(W.group('Window Previews', [
        r.switch('window-previews', 'Show previews on hover', 'Applies to both the dock and taskbar'),
        r.spin('preview-delay', 'Hover delay', 0, 3000, 50, 'Milliseconds'),
        r.spin('preview-size', 'Preview width', 120, 480, 20, 'Logical pixels'),
        r.switch('preview-titles', 'Show window titles'),
        r.switch('preview-peek', 'Peek at windows', 'Dim other windows while hovering a preview'),
    ]));
    page.add(W.group('Appearance', [
        r.combo('indicator-style', 'Running indicator'),
        r.spin('indicator-size', 'Indicator thickness', 2, 12, 1, 'Logical pixels'),
        r.color('indicator-color', 'Unfocused indicator colour'),
        r.color('indicator-focused-color', 'Focused indicator colour'),
        r.switch('indicator-dominant-color', 'Use app icon colours for indicators'),
        r.switch('notification-badges', 'Notification counts'),
        r.switch('launcher-progress', 'Application progress bars'),
        r.switch('urgent-indicator', 'Highlight urgent applications'),
        r.combo('dock-opacity-mode', 'Dock opacity mode'),
        r.percent('dock-min-opacity', 'Opacity away from windows'),
        r.percent('background-opacity', 'Background opacity'),
        panelOff(r.spin('border-radius', 'Corner radius', 0, 64, 1)),
        r.switch('glass-dock', 'Frosted glass', 'Blur the wallpaper behind the dock'),
        r.switch('use-custom-color', 'Custom background colour'),
        r.color('background-color', 'Background colour', 'use-custom-color'),
    ]));
    const shortcuts = W.group('Keyboard Shortcuts', [
        r.switch('number-shortcuts', 'Enable numbered app shortcuts'),
        r.combo('number-overlays', 'Number overlays'),
    ], 'Defaults use Super + Alt to avoid GNOME’s existing Super + number bindings. ' +
        'Enter a GTK accelerator such as &lt;Control&gt;&lt;Alt&gt;1; leave it empty to disable it. ' +
        'Choose combinations unused by other desktop shortcuts.');
    for (const [key, title] of [['reveal-shortcut', 'Reveal / toggle manual dock'],
        ...Array.from({length: 10}, (_, i) => [`dock-app-${i + 1}`, `Application ${i + 1}`])]) {
        r._k(key);
        shortcuts.add(W.shortcutRow(settings, key, title));
    }
    page.add(shortcuts);
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
        r.combo('top-bar-position', 'Position', 'Bottom gives a Windows-style taskbar'),
        r.spin('top-bar-height', 'Bar height', 0, 96, 2, 'Pixels; 0 keeps the theme\'s height'),
        r.switch('top-bar-hide-activities', 'Hide Activities button'),
        r.combo('top-bar-clock-position', 'Clock position'),
        W.switchRow(interfaceSettings, 'enable-hot-corners', 'Hot corner',
            'Push the pointer into the top-left corner to open the overview'),
    ]));
    const windowButtons = W.group('Window Buttons', [
        r.switch('top-bar-window-minimize', 'Minimize'),
        r.switch('top-bar-window-maximize', 'Maximize / Restore'),
        r.switch('top-bar-window-close', 'Close'),
        r.switch('top-bar-window-buttons-maximized-only', 'Only for maximized windows'),
        r.combo('top-bar-window-buttons-position', 'Button position'),
    ], 'Control the focused window from GNOME’s panel. Available when the integrated Orbit taskbar is off.');
    page.add(windowButtons);
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
    ], 'Type to search, use the arrow keys and Enter to launch an app, or press Escape to close.');
    page.add(open);
    page.add(W.group('Appearance', [
        r.combo('launcher-style', 'Menu style'),
        W.sensitiveWhenValue(settings, r.switch('launcher-xp-categories',
            'Group All Apps into categories',
            'Two-column style only: All Apps shows folders like Accessories, Games and Office'),
        'launcher-style', ['xp']),
        r.spin('launcher-icon-size', 'List icon size', 16, 64, 2),
        r.switch('launcher-show-descriptions', 'Show descriptions'),
        r.switch('launcher-show-power', 'Show power buttons', 'Lock, sign out, suspend, restart and power off'),
        r.percent('launcher-opacity', 'Background opacity'),
        r.color('launcher-background-color', 'Background colour'),
        r.spin('launcher-font-size', 'Font size', 10, 24, 1),
        r.spin('launcher-width', 'Menu width', 0, 1400, 20, '0 uses the layout default; limited to the available screen'),
        r.spin('launcher-height', 'Menu height', 0, 1400, 20, '0 uses the layout default'),
        r.spin('launcher-columns', 'Arc and Plasma grid columns', 2, 8, 1),
        r.spin('launcher-grid-icon-size', 'Grid icon size', 24, 96, 4),
        r.spin('launcher-hover-delay', 'Category hover delay', 0, 1000, 20, 'Milliseconds'),
        r.spin('launcher-transition-time', 'Highlight transition', 0, 400, 20, 'Milliseconds'),
        r.percent('launcher-footer-opacity', 'Menu bottom strip opacity'),
        r.switch('glass-launcher', 'Frosted glass', 'Blur the windows and wallpaper behind the launcher'),
    ]));
    page.add(W.group('Pinned Apps and Navigation', [
        r.switch('launcher-independent-pins', 'Keep launcher pins separate from the dock', 'Initially copies your dock favorites; right-click apps to pin, unpin and reorder'),
        r.combo('launcher-default-view', 'Default view'),
    ]));
    r._k('launcher-shortcut');
    page.add(W.group('Keyboard Shortcut', [W.shortcutRow(settings, 'launcher-shortcut', 'Open application launcher')]));
    page.add(W.group('Arc Bottom Bar', [
        r.switch('launcher-arc-bottom-bar', 'Enable bottom taskbar with Arc Menu', 'Selecting Arc Menu enables a bottom taskbar; explicit per-monitor overrides are preserved'),
        r.combo('top-bar-style', 'Bar background mode'),
        r.percent('top-bar-transparent-opacity', 'Bottom bar opacity'),
        r.percent('top-bar-solid-opacity', 'Opacity near windows in dynamic mode'),
        r.switch('glass-top-bar', 'Frosted bottom bar'),
    ]));
    const applyBar = new Adw.ActionRow({title: 'Use a bottom bar with this menu', subtitle: 'Available for every launcher style'});
    const applyBarButton = new Gtk.Button({label: 'Apply Bottom Bar', valign: Gtk.Align.CENTER});
    applyBarButton.connect('clicked', () => {
        settings.set_boolean('dock-in-panel', true);
        settings.set_string('taskbar-position', 'bottom');
        settings.set_string('top-bar-position', 'bottom');
        if (settings.get_string('top-bar-style') === 'default') {
            settings.set_string('top-bar-style', 'translucent');
            settings.set_double('top-bar-transparent-opacity', 0.55);
        }
    });
    applyBar.add_suffix(applyBarButton);
    page.add(W.group('Bottom Bar Setup', [applyBar]));
    addLauncherControls(window, page, settings, r);
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
    page.add(trayControls(settings));
    r._k('tray-order'); r._k('tray-hidden-apps'); r._k('tray-visible-limit');
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

export function shellPage(window, settings) {
    const r = new Rows(settings);
    const page = makePage('Shell', 'preferences-system-symbolic');
    const notifications = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
    const popups = W.group('Notifications &amp; On-Screen Displays', [
        W.switchRow(notifications, 'show-banners', 'Show notification banners',
            'Changes GNOME’s system-wide Do Not Disturb setting'),
        r.combo('shell-banner-position', 'Banner position'),
        r.combo('shell-osd-position', 'On-screen display position', 'Applies to volume, brightness and other GNOME on-screen displays'),
    ]);
    page.add(popups);
    page.add(W.group('Workspaces and Window Switching', [
        r.switch('shell-workspace-wraparound', 'Wrap directional workspace switching',
            'Move between the first and last workspace with a directional shortcut'),
        r.switch('shell-hide-maximized-decorations', 'Hide maximized X11 window decorations',
            'Requires xprop. Applies to window-manager decorations on X11 and XWayland.'),
        r.switch('shell-hide-workspace-popup', 'Hide the workspace switcher popup'),
        r.spin('shell-switcher-delay', 'Switcher delay', -1, 1000, 1, 'Milliseconds. −1 uses the Shell default and 0 shows immediately'),
        r.spin('shell-switcher-preview-size', 'Window preview size', 50, 150, 5,
            'Percentage of the default size, bounded by available space'),
    ]));
    page.add(W.group('Quick Settings', [
        r.switch('shell-hide-dark-style', 'Hide Dark Style'),
        r.switch('shell-hide-night-light', 'Hide Night Light'),
        r.switch('shell-hide-airplane-mode', 'Hide Airplane Mode'),
    ]));
    return addReset(window, page, popups, r, 'Shell');
}

export function effectsPage(window, settings) {
    const r = new Rows(settings);
    const page = makePage('Effects', 'weather-fog-symbolic');
    const glass = W.group('Frosted Glass', [
        r.switch('glass-dock', 'Dock'),
        r.switch('glass-top-bar', 'Top bar'),
        r.switch('glass-launcher', 'Launcher'),
    ], 'Frosted Shell surfaces can blur live windows or wallpaper only, ' +
       'tinted by each surface\'s background colour. Lower a surface\'s opacity for a clearer glass look.');
    page.add(glass);
    page.add(W.group('Performance', [r.switch('reduced-effects', 'Reduced effects', 'Disable glass and icon hover animations across Orbit')]));
    for (const [surface, label] of [['dock', 'Dock'], ['panel', 'Top Bar / Taskbar'], ['launcher', 'Launcher']]) page.add(W.group(`${label} Glass`, [
        r.switch(`glass-${surface}-custom`, 'Use independent blur settings'),
        r.spin(`glass-${surface}-blur`, 'Blur strength', 0, 100, 2),
        r.percent(`glass-${surface}-brightness`, 'Brightness'),
        r.switch(`glass-${surface}-windows`, 'Blur windows behind this surface', 'Use the live window scene instead of wallpaper only'),
    ]));
    page.add(W.group('Frost', [
        r.spin('glass-blur-radius', 'Blur strength', 0, 100, 2, 'Pixels'),
        r.percent('glass-brightness', 'Brightness', 'Lower values darken the glass'),
        r.switch('glass-highlight', 'Frosted edge', 'A soft light border on glass surfaces'),
    ]));
    return addReset(window, page, glass, r, 'Effects');
}

// ---- native desktop icons ---------------------------------------------------
export function desktopPage(window, settings) {
    const r = new Rows(settings);
    const page = makePage('Desktop Icons', 'user-desktop-symbolic');
    const enable = W.group('Desktop Icons', [
        r.switch('desktop-icons-enabled', 'Enable desktop icons', 'Show files and shortcuts below application windows'),
        r.switch('desktop-primary-only', 'Primary monitor only', 'Turn off to distribute icons across all monitors'),
        r.switch('desktop-single-click', 'Open with a single click', 'Otherwise double-click an icon or press Enter'),
    ]);
    enable.add(conflictRow('Another desktop icon provider is active',
        'Disable the other provider to use Orbit desktop icons.',
        ['ding@rastersoft.com', 'gtk4-ding@smedius.gitlab.com', 'desktop-icons@csoriano']));
    page.add(enable);
    page.add(W.group('Visible Icons', [
        r.switch('desktop-show-files', 'Desktop folder files'),
        r.switch('desktop-show-hidden', 'Hidden files'),
        r.switch('desktop-show-home', 'Home folder'),
        r.switch('desktop-show-trash', 'Trash'),
        r.switch('desktop-show-drives', 'Mounted drives and network locations'),
    ]));
    page.add(W.group('Appearance', [
        r.spin('desktop-icon-size', 'Icon size', 24, 128, 8, 'Logical pixels'),
        r.spin('desktop-label-size', 'Label font size', 8, 24, 1),
        r.color('desktop-label-color', 'Label colour'),
        r.switch('desktop-label-shadow', 'Label shadow'),
        r.spin('desktop-grid-spacing', 'Extra spacing', 0, 64, 4, 'Logical pixels between cells'),
    ]));
    page.add(W.group('Sorting &amp; Placement', [
        r.combo('desktop-sort-order', 'Sort by'),
        r.switch('desktop-folders-first', 'Folders first'),
        r.combo('desktop-start-corner', 'Start corner'),
        r.combo('desktop-flow', 'Fill direction'),
    ]));
    const custom = W.group('Custom Special Icons', [], 'Use an icon theme name or select an image file.');
    for (const [key, title] of [['desktop-home-icon', 'Home icon'], ['desktop-trash-icon', 'Trash icon']]) {
        r._k(key);
        const row = new Adw.EntryRow({title, show_apply_button: true, text: settings.get_string(key)});
        row.connect('apply', () => settings.set_string(key, row.text.trim()));
        const id = settings.connect(`changed::${key}`, () => { row.text = settings.get_string(key); });
        row.connect('destroy', () => settings.disconnect(id));
        const choose = new Gtk.Button({icon_name: 'folder-open-symbolic', valign: Gtk.Align.CENTER,
            tooltip_text: 'Choose an image'});
        choose.connect('clicked', () => {
            const filter = new Gtk.FileFilter({name: 'Images'});
            filter.add_mime_type('image/*');
            const filters = new Gio.ListStore({item_type: Gtk.FileFilter.$gtype});
            filters.append(filter);
            const dialog = new Gtk.FileDialog({title: `Choose ${title.toLowerCase()}`, filters, default_filter: filter});
            dialog.open(window, null, (d, result) => {
                try {
                    const file = d.open_finish(result);
                    settings.set_string(key, file.get_path() ?? file.get_uri());
                } catch { /* User cancelled the picker. */ }
            });
        });
        row.add_suffix(choose);
        custom.add(row);
    }
    page.add(custom);
    const actions = W.group('Desktop Folder', []);
    const open = new Adw.ActionRow({title: 'Open Desktop Folder', subtitle: 'Add files and folders here to show them on the desktop'});
    const button = new Gtk.Button({label: 'Open', valign: Gtk.Align.CENTER});
    button.connect('clicked', () => {
        const path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
        if (!path) {
            W.toast(window, 'No Desktop folder is configured for this account');
            return;
        }
        const folder = Gio.File.new_for_path(path);
        try { folder.make_directory_with_parents(null); } catch (error) {
            if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
                W.toast(window, error.message);
                return;
            }
        }
        Gio.AppInfo.launch_default_for_uri_async(folder.get_uri(), null, null, (_o, result) => {
            try { Gio.AppInfo.launch_default_for_uri_finish(result); } catch (error) { W.toast(window, error.message); }
        });
    });
    open.add_suffix(button);
    actions.add(open);
    const resetPositions = new Adw.ActionRow({title: 'Reset manual positions', subtitle: 'Keep the selected sort and appearance settings'});
    const reset = new Gtk.Button({label: 'Reset Positions', valign: Gtk.Align.CENTER});
    reset.connect('clicked', () => settings.reset('desktop-icon-positions'));
    resetPositions.add_suffix(reset);
    actions.add(resetPositions);
    page.add(actions);
    r._k('desktop-icon-positions');
    return addReset(window, page, enable, r, 'Desktop Icons');
}
