// Isolated GNOME Shell driver for the Shell preferences.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import * as AltTab from 'resource:///org/gnome/shell/ui/altTab.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {WorkspaceSwitcherPopup} from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';

const pause = ms => new Promise(resolve => GLib.timeout_add_once(GLib.PRIORITY_DEFAULT, ms, resolve));

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

export default class CustomizationSmoke extends Extension {
    enable() {
        this._start = GLib.timeout_add_once(GLib.PRIORITY_DEFAULT, 4500, () => {
            this._start = 0;
            if (GLib.file_test(GLib.getenv('ORBIT_SMOKE_RESULT'), GLib.FileTest.EXISTS))
                return;
            this._test().then(() => this._report('PASS: Shell customization and restoration'),
                error => this._report(`FAIL: ${error.message}\n${error.stack}`));
        });
    }

    _report(result) {
        GLib.file_set_contents(GLib.getenv('ORBIT_SMOKE_RESULT'), result);
    }

    async _test() {
        Main.welcomeDialog?.close();
        const installed = Main.extensionManager.lookup('orbit-dock@niruxx.github.io');
        const extension = installed?.stateObj;
        const settings = extension?._settings;
        assert(settings && extension._parts?.[5], `Orbit Shell customization did not initialize (${installed?.error})`);
        if (GLib.getenv('ORBIT_SMOKE_XWAYLAND') === '1')
            await this._testDecorations(settings);
        const {START, END} = Clutter.ActorAlign;
        const alignment = Main.messageTray.bannerAlignment;
        const vertical = Main.messageTray._bannerBin.y_align;
        const windows = Main.osdWindowManager._osdWindows;
        const positions = windows.map(window => [window.x_align, window.y_align]);
        const quick = Main.panel.statusArea.quickSettings;
        const toggle = quick._darkMode.quickSettingsItems[0];
        const grid = toggle.get_parent();
        const originalSlot = grid.get_children().indexOf(toggle);
        const manager = global.workspace_manager;
        const first = manager.get_workspace_by_index(0);
        const last = manager.get_workspace_by_index(manager.n_workspaces - 1);
        const previous = manager.layout_rows === -1 ? Meta.MotionDirection.UP
            : Clutter.get_default_text_direction() === Clutter.TextDirection.RTL
                ? Meta.MotionDirection.RIGHT : Meta.MotionDirection.LEFT;

        settings.set_string('shell-banner-position', 'end-end');
        assert(Main.messageTray.bannerAlignment === END && Main.messageTray._bannerBin.y_align === END,
            'Banner position did not change');
        await this._testBanners();
        settings.set_string('shell-osd-position', 'start-end');
        assert(windows.every(window => window.x_align === END && window.y_align === START), 'OSD alignment did not change');
        for (const key of ['dark-style', 'night-light', 'airplane-mode'])
            settings.set_boolean(`shell-hide-${key}`, true);
        assert(!toggle.get_parent().visible, 'Quick Settings toggle is still on screen');
        for (const field of ['_nightLight', '_rfkill'])
            assert(!quick[field].quickSettingsItems[0].get_parent().visible, `${field} is still on screen`);

        settings.set_boolean('shell-workspace-wraparound', true);
        assert(first !== last && first.get_neighbor(previous) === last, 'Workspace wraparound did not select the last workspace');
        settings.set_boolean('shell-hide-workspace-popup', true);
        const workspacePopup = new WorkspaceSwitcherPopup();
        workspacePopup.display(0);
        assert(!workspacePopup.visible, 'Workspace popup is still visible');

        const fixture = Gio.Subprocess.new(['gjs', '-m', `${GLib.getenv('ORBIT_SMOKE_REPO')}/tests/shellWindow.js`], Gio.SubprocessFlags.NONE);
        try {
            await pause(1700);
            settings.set_int('shell-switcher-preview-size', 50);
            settings.set_int('shell-switcher-delay', 300);
            const windowPopup = new AltTab.WindowSwitcherPopup();
            try {
                assert(windowPopup.show(false, 'switch-windows', 0), 'Window switcher did not show');
                assert(windowPopup.opacity === 0, 'Window switcher ignored the delay');
                const icon = windowPopup._items[0]._icon;
                const preview = icon.get_children().find(child => child instanceof Clutter.Clone);
                assert(preview && icon.width < 128, 'Window switcher preview size did not change');
                await pause(400);
                assert(windowPopup.opacity === 255, 'Window switcher did not show after the delay');
            } finally {
                windowPopup.destroy();
            }

            settings.set_int('shell-switcher-delay', 0);
            const appPopup = new AltTab.AppSwitcherPopup();
            try {
                assert(appPopup.show(false, 'switch-group', 0), 'App switcher did not show');
                assert(appPopup.opacity === 255, 'App switcher ignored immediate display');
                await pause(100);
                const preview = appPopup._thumbnails?._clones[0];
                assert(preview && Math.max(preview.width, preview.height) <= 128, 'App switcher preview size did not change');
            } finally {
                appPopup.destroy();
            }

            settings.set_boolean('dock-in-panel', false);
            settings.set_boolean('top-bar-window-close', true);
            settings.set_boolean('top-bar-window-buttons-maximized-only', true);
            Main.overview.hide();
            await pause(350);
            const fixtureWindow = global.get_window_actors().map(actor => actor.meta_window)
                .find(window => window.get_title() === 'Orbit smoke window A');
            Main.activateWindow(fixtureWindow, global.display.get_current_time_roundtrip());
            await pause(300);
            const window = global.display.focus_window;
            assert(window?.get_title().startsWith('Orbit smoke window'), 'Test application did not gain focus');
            const controls = extension._parts[1]._windowButtons;
            assert(!controls.visible, 'Panel buttons appeared on an unmaximized window');
            if (window.get_maximize_flags)
                window.maximize();
            else
                window.maximize(Meta.MaximizeFlags.BOTH);
            await pause(350);
            assert(controls.visible, `Panel buttons did not appear (focused=${global.display.focus_window === window}, maximized=${window.is_maximized()}, overview=${Main.overview.visibleTarget})`);
        } finally {
            fixture.force_exit();
        }

        Main.extensionManager.disableExtension('orbit-dock@niruxx.github.io');
        await pause(300);
        assert(!extension._settings, 'Extension did not disable');
        assert(Main.messageTray.bannerAlignment === alignment && Main.messageTray._bannerBin.y_align === vertical,
            'Banner position was not restored');
        assert(windows.every((window, i) => window.x_align === positions[i][0] &&
            window.y_align === positions[i][1]), 'OSD alignment was not restored');
        assert(grid.get_children()[originalSlot] === toggle, 'Quick Settings order was not restored');
        assert(first.get_neighbor(previous) === first, 'Workspace wraparound survived disable');
        assert(!Object.hasOwn(AltTab.AppSwitcherPopup.prototype, 'show'), 'Switcher method was not restored');
    }

    async _testBanners() {
        Main.overview.hide();
        await pause(350);
        const preferences = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        preferences.set_boolean('show-banners', false);
        const suppressedSource = MessageTray.getSystemSource();
        const suppressed = new MessageTray.Notification({source: suppressedSource, title: 'Suppressed Orbit banner'});
        suppressedSource.addNotification(suppressed);
        await pause(250);
        assert(Main.messageTray._notification !== suppressed, 'Do Not Disturb did not suppress the banner');
        suppressed.destroy();
        preferences.set_boolean('show-banners', true);
        const source = MessageTray.getSystemSource();
        const notification = new MessageTray.Notification({source, title: 'Visible Orbit banner'});
        source.addNotification(notification);
        await pause(500);
        try {
            assert(Main.messageTray._notification === notification, 'Test banner did not appear');
            const [, y] = Main.messageTray._bannerBin.get_transformed_position();
            const monitor = Main.layoutManager.primaryMonitor;
            assert(y > monitor.y + monitor.height / 2, 'Banner did not appear on the bottom edge');
        } finally {
            notification.destroy();
            preferences.reset('show-banners');
        }
    }

    async _testDecorations(settings) {
        const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
        launcher.setenv('GDK_BACKEND', 'x11', true);
        launcher.setenv('GTK_CSD', '0', true);
        const fixture = launcher.spawnv(['gjs', '-c', `
            imports.gi.versions.Gtk = '3.0';
            const {Gtk} = imports.gi;
            Gtk.init(null);
            const window = new Gtk.Window({title: 'Orbit X11 fixture', default_width: 400, default_height: 300});
            window.show_all();
            window.maximize();
            Gtk.main();
        `]);
        try {
            await pause(2000);
            const window = global.get_window_actors().map(actor => actor.meta_window)
                .find(window => window.get_title() === 'Orbit X11 fixture');
            assert(window?.get_client_type() === Meta.WindowClientType.X11 && window.decorated,
                'Server-decorated X11 fixture did not start');
            settings.set_boolean('shell-hide-maximized-decorations', true);
            await pause(500);
            assert(!window.decorated, 'Maximized X11 window decorations were not hidden');
            if (window.get_maximize_flags)
                window.unmaximize();
            else
                window.unmaximize(Meta.MaximizeFlags.BOTH);
            await pause(700);
            assert(window.decorated, 'X11 window decorations were not restored on unmaximize');
            if (window.get_maximize_flags)
                window.maximize();
            else
                window.maximize(Meta.MaximizeFlags.BOTH);
            await pause(700);
            assert(!window.decorated, 'X11 window decorations were not hidden after re-maximizing');
            settings.set_boolean('shell-hide-maximized-decorations', false);
            await pause(700);
            assert(window.decorated, 'X11 window decorations were not restored on reset');
        } finally {
            fixture.force_exit();
        }
    }

    disable() {
        if (this._start)
            GLib.source_remove(this._start);
    }
}
