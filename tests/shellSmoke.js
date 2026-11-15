// Test driver installed only in shellSmoke.sh's temporary extension directory.
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as RemoteSearch from 'resource:///org/gnome/shell/ui/remoteSearch.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

export default class SmokeDriver extends Extension {
    enable() {
        this._timers = new Set();
        this._later(4000, () => this._start());
    }
    _later(ms, run) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timers.delete(id);
            try { run(); } catch (error) { this._fail(error); }
            return GLib.SOURCE_REMOVE;
        });
        this._timers.add(id);
    }
    _write(text) {
        Gio.File.new_for_path(GLib.getenv('ORBIT_SMOKE_RESULT')).replace_contents(
            text, null, false, Gio.FileCreateFlags.NONE, null);
    }
    _fail(error) {
        console.error(error);
        this._write(`FAIL: ${error.message}\n${error.stack ?? ''}`);
    }
    _assert(condition, message) {
        if (!condition) throw new Error(message);
    }
    _dock() { return this._manager._docks[0]; }
    _start() {
        Main.welcomeDialog?.close();
        this._extension = Main.extensionManager.lookup('orbit-dock@niruxx.github.io')?.stateObj;
        this._manager = this._extension?._parts?.[0];
        this._assert(this._manager?._docks.length, 'Orbit dock did not initialize');
        Gio.Subprocess.new(['gjs', '-m', `${GLib.getenv('ORBIT_SMOKE_REPO')}/tests/shellWindow.js`], Gio.SubprocessFlags.NONE);
        this._later(2500, () => this._exercise());
    }
    _exercise() {
        const dock = this._dock();
        const icon = [...dock._icons.values()].find(i => i.app.get_id() === 'io.github.orbit.Smoke.desktop');
        this._assert(icon, 'Test application missing from dock');
        this._assert(dock.getAppWindows(icon.app).length === 2, 'Expected two test windows');
        this._app = icon.app;
        dock._previews.open(icon, true);
        this._assert(dock._previewOpen, 'Previews failed to open');
        dock._previews._peek(dock.getAppWindows(icon.app)[0]);
        dock._previews.close();
        dock._spread.toggle(icon);
        this._assert(dock._spread._root, 'App spread failed to open');
        dock._spread.close();
        const settings = this._extension._settings;
        settings.set_boolean('show-trash', true);
        settings.set_boolean('show-mounts', true);
        settings.set_boolean('fixed-icon-size', true);
        settings.set_double('dock-length-limit', 0.4);
        settings.set_string('dock-opacity-mode', 'dynamic');
        settings.set_boolean('indicator-dominant-color', true);
        settings.set_string('indicator-style', 'metro');
        settings.set_boolean('number-shortcuts', true);
        this._later(800, () => this._second());
    }
    _second() {
        const dock = this._dock();
        this._assert(dock._places?.actor.get_children().length >= 1, 'Trash icon missing');
        this._assert(dock._container.width <= 1280 * 0.4 + 2, 'Dock length limit was not respected');
        this._later(250, () => {
            this._assert(dock._icons.values().next().value._dominantColor, 'Dominant icon color did not load');
        });
        dock.showNumbers(true);
        const icon = dock.shortcutIcons().find(i => i.app === this._app);
        this._assert(icon?._numberBadge.visible, 'Number overlays failed');
        this._launcherConnection = Gio.DBusConnection.new_for_address_sync(GLib.getenv('DBUS_SESSION_BUS_ADDRESS'),
            Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, null, null);
        this._launcherConnection.emit_signal(null, '/io/github/orbit/Test', 'com.canonical.Unity.LauncherEntry', 'Update',
            new GLib.Variant('(sa{sv})', [`application://${this._app.get_id()}`, {
                'count-visible': new GLib.Variant('b', true), count: new GLib.Variant('x', 7),
                'progress-visible': new GLib.Variant('b', true), progress: new GLib.Variant('d', 0.4),
                urgent: new GLib.Variant('b', true),
            }]));
        this._launcherConnection.flush_sync(null);
        this._later(200, () => {
            this._assert(icon._countBadge.text === '7' && icon._progressBar.visible, 'Live LauncherEntry badges/progress failed');
            this._launcherConnection.close_sync(null);
            this._launcherConnection = null;
            this._later(100, () => {
                this._assert(this._manager.status.get(this._app.get_id()).count === 0, 'Disconnected launcher left stale count');
                const source = new MessageTray.Source({policy: MessageTray.NotificationPolicy.newForApp(this._app)});
                source.app = this._app;
                Main.messageTray.add(source);
                source.addNotification(new MessageTray.Notification({source, title: 'Orbit smoke notification',
                    body: 'Private test session only', urgency: MessageTray.Urgency.CRITICAL}));
                const status = this._manager.status.get(this._app.get_id());
                this._assert(status.count === 1 && status.urgent, 'Native notification counts/urgency failed');
                source.destroy();
                this._assert(this._manager.status.get(this._app.get_id()).count === 0, 'Removed notification left stale count');
                this._taskbar();
            });
        });
    }
    _taskbar() {
        const settings = this._extension._settings;
        settings.set_boolean('dock-in-panel', true);
        settings.set_boolean('group-apps', false);
        settings.set_boolean('taskbar-app-names', true);
        settings.set_boolean('show-desktop-button', true);
        this._later(800, () => {
            const taskbar = this._dock();
            const windows = [...taskbar._icons.values()].filter(i => i.app === this._app);
            this._assert(windows.length === 2, 'Ungrouped taskbar buttons missing');
            this._assert(windows.every(icon => icon._orbitAppNameLabel?.visible && icon._orbitAppNameLabel.text === this._app.get_name()), 'Individual running app names missing');
            this._assert([...taskbar._icons.values()].filter(icon => !icon.app.get_windows().length).every(icon => !icon._orbitAppNameLabel?.visible), 'Unopened pins should remain icon-only');
            taskbar._previews.open(windows[0]);
            taskbar._previews.close();
            settings.set_boolean('dock-in-panel', false);
            settings.set_string('dock-mode', 'manual');
            this._later(800, () => {
                const manual = this._dock();
                manual._forcedReveal = false;
                manual._updateVisibility(false);
                this._assert(!manual._shown, 'Manual dock should start hidden');
                manual.toggleReveal();
                this._assert(manual._shown, 'Manual toggle did not reveal dock');
                this._extension.disable();
                this._extension.enable();
                this._later(800, () => {
                    this._assert(this._extension._parts?.[0]?._docks.length, 'Re-enable failed');
                    this._manager = this._extension._parts[0];
                    this._panels();
                });
            });
        });
    }
    _panels() {
        const settings = this._extension._settings;
        settings.set_int('taskbar-section-spacing', 10);
        settings.set_int('taskbar-system-icon-spacing', 12);
        settings.set_int('taskbar-tray-icon-spacing', 8);
        settings.set_int('taskbar-status-padding', 10);
        settings.set_boolean('dock-in-panel', true);
        settings.set_boolean('multi-monitor', true);
        settings.set_boolean('isolate-monitors', true);
        settings.set_string('taskbar-alignment', 'center');
        this._app.get_windows().forEach(window => window.move_to_monitor(0));
        settings.set_boolean('tray-enabled', true);
        settings.set_string('hover-animation', 'zoom');
        settings.set_string('taskbar-monitor-overrides', JSON.stringify({
            0: {edge: 'bottom', size: 48, length: 0.9, anchor: 'center', mode: 'fixed'},
            1: {edge: 'left', size: 64, length: 0.85, anchor: 'end', mode: 'intellihide'},
        }));
        this._later(1000, () => {
            this._assert(this._manager._docks.length === 2, 'Taskbars missing on secondary monitor');
            this._assert(Main.ctrlAltTabManager._items.filter(item => item.root.name === 'orbitTaskbarPanel').length === 2, 'Taskbar keyboard groups missing');
            const [first, second] = this._manager._docks;
            for (const panel of [first._panel, second._panel]) {
                this._assert(panel._systemBox.get_style().includes('12px') && panel.trayBox.get_style().includes('8px'), 'System/tray spacing settings were not applied');
                this._assert(panel.body.get_style().includes('spacing: 10px'), 'Section spacing setting was not applied');
            }
            this._assert(first._taskbarScroll.hscrollbar_policy === St.PolicyType.EXTERNAL && second._taskbarScroll.vscrollbar_policy === St.PolicyType.EXTERNAL, 'Taskbar scrollbars must stay hidden');
            const previousAppWidth = first._taskbarScroll.width;
            const extraIcon = new St.Widget({width: 40, height: 32}); first._box.add_child(extraIcon); first._panel.updateGeometry();
            this._later(100, () => {
                const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
                const budget = Number(first._taskbarScroll.get_style().match(/max-width: ([\d.]+)px/)[1]) * scale;
                const natural = first._box.get_preferred_width(-1)[1];
                this._assert(Math.abs(first._taskbarScroll.width - Math.min(natural, budget)) <= 2, 'Taskbar app area does not follow icon width within available space');
                if (budget > previousAppWidth + 40 * scale) this._assert(first._taskbarScroll.width > previousAppWidth, 'Taskbar app area did not grow when space was available');
                extraIcon.destroy(); first._queueGeometry();
            });
            this._assert(first.position === 'bottom' && second.position === 'left', 'Per-monitor positions not applied');
            this._assert(first._panel.actor.height === 48 && second._panel.actor.width === 64, 'Per-monitor panel thickness failed');
            this._assert(!Main.panel.visible, 'Native panel was not replaced');
            const area = Main.layoutManager.getWorkAreaForMonitor(0);
            this._assert(area.y === Main.layoutManager.monitors[0].y, 'Hidden native top bar still reserves space');
            let effect;
            first._animateIcon({hover: true, icon: {set_pivot_point() {}, ease(value) { effect = value; }}});
            this._assert(effect.scale_x > 1, 'Configured hover animation was not applied');
            this._extension._launcher.open();
            const menu = this._extension._launcher._menu;
            const owner = this._manager._docks.find(dock => dock.monitorIndex === this._extension._launcher._monitorIndex);
            const monitor = Main.layoutManager.monitors[owner.monitorIndex];
            const menuX = monitor.x + menu.x, menuY = monitor.y + menu.y;
            const frame = owner._panel._frame;
            const anchored = owner.position === 'bottom' ? menuY + menu.height <= frame.y + 1
                : owner.position === 'top' ? menuY >= frame.y + frame.height - 1
                    : owner.position === 'left' ? menuX >= frame.x + frame.width - 1 : menuX + menu.width <= frame.x + 1;
            this._assert(anchored, `Launcher did not anchor to ${owner.position} taskbar: menu=${menuX},${menuY},${menu.width},${menu.height}; frame=${JSON.stringify(frame)}`);
            this._extension._launcher.close();
            const calendar = Main.panel.statusArea.dateMenu.menu;
            const original = calendar.sourceActor;
            second._panel.openCalendar();
            this._assert(calendar.isOpen && calendar.sourceActor === second._panel.clock, 'Calendar did not open on vertical taskbar');
            Main.panel.closeCalendar();
            this._assert(calendar.sourceActor === original, 'Calendar source not restored');
            first._panel.openSystem();
            this._assert(Main.panel.statusArea.quickSettings.menu.isOpen, 'System menu did not open from taskbar');
            Main.panel.statusArea.quickSettings.menu.close();
            this._assert(second._panel.clock.get_parent() === second._panel.body, 'Clock role missing from vertical panel');
            const xml = `<node><interface name="org.kde.StatusNotifierItem">
                <property name="Id" type="s" access="read"/><property name="Title" type="s" access="read"/>
                <property name="Status" type="s" access="read"/><property name="IconName" type="s" access="read"/>
                <property name="Menu" type="o" access="read"/><property name="ItemIsMenu" type="b" access="read"/>
                <method name="Activate"><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
            </interface></node>`;
            this._indicator = Gio.DBusExportedObject.wrapJSObject(xml, {Id: 'smoke', Title: 'Smoke Indicator',
                Status: 'Active', IconName: 'utilities-terminal-symbolic', Menu: '/', ItemIsMenu: false, Activate() {}});
            this._indicator.export(Gio.DBus.session, '/StatusNotifierItem');
            Gio.DBus.session.call('org.kde.StatusNotifierWatcher', '/StatusNotifierWatcher', 'org.kde.StatusNotifierWatcher',
                'RegisterStatusNotifierItem', new GLib.Variant('(s)', ['/StatusNotifierItem']), null,
                Gio.DBusCallFlags.NONE, 3000, null, (c, r) => {
                    try { c.call_finish(r); } catch (error) { this._fail(error); }
                });
            this._later(600, () => {
                this._assert(first._panel.trayBox.get_n_children() === 1 && second._panel.trayBox.get_n_children() === 1, 'Tray items not mirrored on every taskbar');
                const overrides = JSON.parse(settings.get_string('taskbar-monitor-overrides'));
                overrides[1].mode = 'autohide';
                settings.set_string('taskbar-monitor-overrides', JSON.stringify(overrides));
                this._later(700, () => {
                    const panel = this._manager._docks[1];
                    panel._forcedReveal = false; panel._pointerRevealed = false;
                    panel._updateVisibility(false);
                    this._assert(!panel._shown, 'Whole taskbar autohide failed');
                    panel.revealFor(200);
                    this._assert(panel._shown, 'Taskbar reveal failed');
                    this._later(400, () => {
                        this._assert(!panel._shown, 'Taskbar reveal did not expire');
                        this._intellihide();
                    });
                });
            });
        });
    }
    _intellihide() {
        const settings = this._extension._settings;
        const overrides = JSON.parse(settings.get_string('taskbar-monitor-overrides'));
        overrides[1].mode = 'intellihide';
        settings.set_string('taskbar-monitor-overrides', JSON.stringify(overrides));
        this._later(600, () => {
            const window = this._app.get_windows()[0];
            const monitor = Main.layoutManager.monitors[1];
            window.move_to_monitor(1); window.unminimize();
            Main.activateWindow(window);
            window.move_frame(true, monitor.x, monitor.y + 200);
            this._later(600, () => {
                const panel = this._manager._docks[1];
                this._assert(panel._windowsOverlapDock() && !panel._shown, 'Whole-panel intelligent hiding failed on overlap');
                this._assert([...panel._icons.values()].some(icon => icon.app === this._app), 'Monitor-isolated taskbar did not pick up moved windows');
                window.move_frame(true, monitor.x + 200, monitor.y + 200);
                this._later(600, () => {
                    this._assert(panel._shown, 'Whole-panel intelligent hiding did not restore the panel');
                    const calendar = Main.panel.statusArea.dateMenu.menu;
                    this._manager._docks[0]._panel.openCalendar();
                    settings.set_boolean('dock-in-panel', false);
                    settings.set_boolean('multi-monitor', false);
                    this._later(700, () => {
                        this._assert(Main.panel.visible && !calendar.isOpen && Main.modalCount === 0, 'Native panel or popup grabs not restored');
                        this._assert(!Main.ctrlAltTabManager._items.some(item => item.root.name === 'orbitTaskbarPanel'), 'Taskbar keyboard groups leaked');
                        this._launcherNavigation();
                    });
                });
            });
        });
    }
    _launcherNavigation() {
        const settings = this._extension._settings;
        settings.set_boolean('group-apps', true);
        settings.set_boolean('taskbar-app-names', true);
        settings.set_string('launcher-style', 'arc');
        settings.set_boolean('launcher-arc-bottom-bar', true);
        settings.set_boolean('launcher-independent-pins', true);
        settings.set_double('top-bar-transparent-opacity', 0.4);
        this._later(700, () => {
            this._assert(this._manager._docks[0].inPanel && this._manager._docks[0].position === 'bottom', 'Arc did not enable its bottom bar');
            const icon = [...this._manager._docks[0]._icons.values()].find(item => item.app === this._app);
            this._assert(icon, 'Taskbar app missing for workspace menu test');
            this._assert(icon._orbitAppNameLabel?.visible && icon._orbitAppNameLabel.text === this._app.get_name(), 'Grouped running app name missing');
            icon.popupMenu(3);
            const workspaceMenu = icon._menu._getMenuItems().find(item => item._orbitWorkspaceMenu);
            this._assert(workspaceMenu && workspaceMenu.menu._getMenuItems().length >= 2, 'Workspace submenu missing');
            const originalWorkspace = this._app.get_windows()[0].get_workspace();
            const target = global.workspace_manager.get_workspace_by_index(global.workspace_manager.n_workspaces - 1);
            workspaceMenu.menu._getMenuItems()[target.index()].emit('activate', null);
            this._assert(this._app.get_windows().every(win => win.get_workspace() === target), `Taskbar menu did not move application windows: target=${target.index()}, single=${!!icon._orbitWindow}, eligible=${icon._workspaceWindows().length}, windows=${this._app.get_windows().map(win => win.get_workspace().index())}, labels=${workspaceMenu.menu._getMenuItems().map(item => item.label?.text)}`);
            icon._menu.close();
            icon._moveToWorkspace(originalWorkspace);
            this._assert(this._manager._docks[0]._panel._context._getMenuItems().some(item => item.label?.text === 'Sign Out…'), 'Taskbar Sign Out action missing');
            const launcher = this._extension._launcher;
            launcher.open(); launcher._selectCategory('all');
            this._assert(launcher._content.get_children().find(child => child.has_style_class_name('orbit-launcher-power'))?.get_children().some(button => button.accessible_name === 'Sign Out'), 'Launcher Sign Out action missing');
            this._later(300, () => {
                const key = symbol => ({get_key_symbol: () => symbol, get_state: () => 0, get_key_unicode: () => ''});
                launcher._onKeyPress(key(Clutter.KEY_Down));
                const first = global.stage.get_key_focus();
                this._assert(first?._orbitApp && launcher._activeItem === first, 'Search Down did not select first app');
                launcher._onKeyPress(key(Clutter.KEY_Right));
                const second = global.stage.get_key_focus();
                this._assert(second !== first && second === launcher._activeItem, 'Keyboard highlight did not move right');
                this._assert(!first.has_style_pseudo_class('selected') && second.has_style_pseudo_class('selected'), 'Old keyboard highlight remained selected');
                launcher._onKeyPress(key(Clutter.KEY_Down));
                this._assert(global.stage.get_key_focus() !== second, 'Keyboard highlight did not move down');
                launcher._search.grab_key_focus();
                this._assert(!launcher._activeItem && !second.has_style_pseudo_class('selected'), 'Search retained an old app highlight');
                launcher._onKeyPress(key(Clutter.KEY_Tab));
                this._assert(launcher._activeItem === global.stage.get_key_focus(), 'Tab focus and highlight diverged');
                launcher._onKeyPress(key(Clutter.KEY_ISO_Left_Tab));
                this._assert(launcher._search.contains(global.stage.get_key_focus()), 'Shift Tab did not return to search');
                launcher._onKeyPress(key(Clutter.KEY_Down));
                launcher._appContext(global.stage.get_key_focus());
                this._later(100, () => {
                    this._assert(launcher._itemMenu?.isOpen, 'Launcher application context menu failed');
                    launcher._closeContext();
                });
                this._later(150, () => settings.set_strv('launcher-pinned-apps', [this._app.get_id()]));
                this._later(300, () => {
                    this._assert(launcher._favorites.length === 1 && launcher._favorites[0] === this._app, 'Independent launcher pins did not update live');
                    launcher.close();
                    settings.set_int('launcher-width', 480); settings.set_int('launcher-height', 400);
                    launcher.open();
                    this._later(300, () => {
                        this._assert(launcher._menu.width === 480 && launcher._menu.height === 400, 'Custom launcher dimensions failed');
                        this._assert(launcher._gridColumns >= 1 && launcher._gridColumns <= 2, 'Compact Arc grid did not adapt');
                        launcher.close(); this._launcherFeatures();
                    });
                });
            });
        });
    }
    _launcherFeatures() {
        this._launcherExtra().then(() => this._desktop()).catch(error => this._fail(error));
    }
    async _launcherExtra() {
        const settings = this._extension._settings, launcher = this._extension._launcher;
        const pause = ms => new Promise(resolve => this._later(ms, resolve));
        const testShortcut = {id: 'smoke-folder', label: 'Smoke Folder', icon: 'folder-symbolic', type: 'uri', target: GLib.getenv('ORBIT_SMOKE_DESKTOP')};
        const commandTarget = `${GLib.getenv('ORBIT_SMOKE_DESKTOP')}/Shortcut created.txt`;
        const commandShortcut = {id: 'smoke-command', label: 'Smoke Command', icon: 'system-run-symbolic', type: 'command', target: `${GLib.find_program_in_path('touch')} ${GLib.shell_quote(commandTarget)}`};
        settings.set_string('launcher-shortcuts', JSON.stringify([testShortcut, commandShortcut]));
        launcher._customApps().find(app => app.get_id() === 'smoke-command').activate();
        await pause(100);
        this._assert(Gio.File.new_for_path(commandTarget).query_exists(null), 'Command shortcut arguments were not launched');
        settings.set_string('launcher-category-names', JSON.stringify({Utility: 'Tools'}));
        settings.set_strv('launcher-category-order', ['all', 'favorites', 'Utility']);
        settings.set_strv('launcher-hidden-categories', ['Game']);
        settings.set_boolean('launcher-show-empty-categories', true);
        settings.set_string('launcher-placement', 'center');
        settings.set_int('launcher-width', 620); settings.set_int('launcher-height', 460);
        settings.set_boolean('launcher-button-show-label', true); settings.set_string('launcher-button-label', 'Start Test');
        await pause(100);
        this._assert(this._manager._docks[0]._showAppsButton._orbitLabel === 'Start Test', 'Menu button label did not update live');
        for (const style of ['modern', 'list', 'minimal', 'classic', 'arc', 'xp', 'grid', 'runner', 'sidebar']) {
            settings.set_string('launcher-style', style); launcher.open(); launcher._selectCategory('favorites');
            await pause(90);
            const custom = launcher._navigationButtons().find(item => item._orbitApp?._orbitCustom);
            this._assert(custom, `Custom pins missing in ${style}`);
            this._assert(launcher._catButtons.has('recent') || style === 'xp', `Recent view inaccessible in ${style}`);
            if (['classic', 'arc', 'sidebar'].includes(style)) {
                this._assert([...launcher._catButtons.keys()][0] === 'all' && launcher._catButtons.has('Utility') && !launcher._catButtons.has('Game'), 'Category ordering/visibility failed');
                const appCount = launcher._navigationButtons().length;
                settings.set_strv('launcher-hidden-categories', ['Game', 'Utility']); await pause(70);
                this._assert(!launcher._catButtons.has('Utility') && launcher._navigationButtons().length < appCount, 'Live category refresh failed');
                settings.set_strv('launcher-hidden-categories', ['Game']); await pause(70);
            }
            const monitor = Main.layoutManager.monitors[launcher._monitorIndex];
            this._assert(Math.abs(launcher._menu.x - (monitor.width - launcher._menu.width) / 2) <= 1 && Math.abs(launcher._menu.y - (monitor.height - launcher._menu.height) / 2) <= 1, `Forced center placement failed in ${style}`);
            launcher._search.set_text('smoke folder'); await pause(40);
            this._assert(launcher._navigationButtons().some(item => item._orbitApp?._orbitCustom), `Shortcut search missing in ${style}`);
            launcher.close();
        }
        settings.set_string('launcher-style', 'arc'); settings.set_string('launcher-placement', 'automatic');
        settings.set_int('launcher-width', 480); settings.set_int('launcher-height', 400);
        // A real D-Bus SearchProvider2 exercises the installed Shell adapter.
        const xml = `<node><interface name="org.gnome.Shell.SearchProvider2">
            <method name="GetInitialResultSet"><arg type="as" direction="in"/><arg type="as" direction="out"/></method>
            <method name="GetSubsearchResultSet"><arg type="as" direction="in"/><arg type="as" direction="in"/><arg type="as" direction="out"/></method>
            <method name="GetResultMetas"><arg type="as" direction="in"/><arg type="aa{sv}" direction="out"/></method>
            <method name="ActivateResult"><arg type="s" direction="in"/><arg type="as" direction="in"/><arg type="u" direction="in"/></method>
            <method name="LaunchSearch"><arg type="as" direction="in"/><arg type="u" direction="in"/></method>
        </interface></node>`;
        this._providerActivations = 0;
        this._provider = Gio.DBusExportedObject.wrapJSObject(xml, {
            GetInitialResultSetAsync: ([terms], invocation) => this._later(terms[0] === 'slow' ? 450 : 20, () => invocation.return_value(new GLib.Variant('(as)', [[terms.join(' ')]]))),
            GetResultMetas: ids => ids.map(id => ({id: new GLib.Variant('s', id), name: new GLib.Variant('s', `Provider ${id}`), description: new GLib.Variant('s', 'Smoke remote result')})),
            ActivateResult: () => { this._providerActivations++; }, LaunchSearch() {},
        });
        this._provider.export(Gio.DBus.session, '/SearchProvider');
        this._providerName = Gio.bus_own_name_on_connection(Gio.DBus.session, 'io.github.orbit.SmokeSearch', Gio.BusNameOwnerFlags.NONE, null, null);
        const search = launcher._searchService.searchSettings;
        search.set_boolean('disable-external', false);
        settings.set_strv('launcher-disabled-providers', RemoteSearch.loadRemoteSearchProviders(search).filter(provider => provider.id !== this._app.get_id()).map(provider => provider.id));
        settings.set_boolean('launcher-search-providers', true); settings.set_boolean('launcher-show-places', false);
        launcher.open(); launcher._search.set_text('slow'); await pause(220);
        launcher._search.set_text('orbit-provider'); await pause(650);
        let results = launcher._navigationButtons().filter(button => button._orbitResult);
        this._assert(results.some(button => button._orbitResult.name === 'Provider orbit-provider') && !results.some(button => button._orbitResult.name === 'Provider slow'), `Provider results or cancellation failed: ${JSON.stringify(results.map(button => button._orbitResult?.name))}; providers=${RemoteSearch.loadRemoteSearchProviders(search).map(provider => provider.id)}; query=${launcher._search.get_text()}`);
        const result = results.find(button => button._orbitResult.name === 'Provider orbit-provider');
        launcher._focusItem(result); result.emit('clicked', 1); await pause(80);
        this._assert(this._providerActivations === 1 && !launcher.isOpen, 'Provider activation failed');
        settings.set_strv('launcher-disabled-providers', [...settings.get_strv('launcher-disabled-providers'), this._app.get_id()]);
        launcher.open(); launcher._search.set_text('orbit-provider'); await pause(300);
        this._assert(!launcher._navigationButtons().some(button => button._orbitResult?.name === 'Provider orbit-provider'), 'Disabled provider returned results'); launcher.close();
        settings.set_strv('launcher-disabled-providers', []); search.set_boolean('disable-external', true);
        launcher.open(); launcher._search.set_text('orbit-provider'); await pause(300);
        this._assert(!launcher._navigationButtons().some(button => button._orbitResult), 'GNOME global provider disable was ignored'); launcher.close();
        // Private bookmark file and privacy settings, isolated by XDG_DATA_HOME.
        const book = new GLib.BookmarkFile(); const uri = Gio.File.new_for_path(`${GLib.getenv('ORBIT_SMOKE_DESKTOP')}/File 2.txt`).get_uri();
        book.set_title(uri, 'Orbit Recent Fixture'); book.set_mime_type(uri, 'text/plain'); book.add_application(uri, 'Orbit Smoke', 'gjs %u');
        book.set_modified_date_time(uri, GLib.DateTime.new_now_utc());
        const privateUri = `${uri}-private`; book.set_title(privateUri, 'Private Fixture'); book.set_mime_type(privateUri, 'text/plain'); book.add_application(privateUri, 'Orbit Smoke', 'gjs %u'); book.set_is_private(privateUri, true);
        const oldUri = `${uri}-old`; book.set_title(oldUri, 'Old Fixture'); book.set_mime_type(oldUri, 'text/plain'); book.add_application(oldUri, 'Orbit Smoke', 'gjs %u'); book.set_modified_date_time(oldUri, GLib.DateTime.new_from_unix_utc(GLib.get_real_time() / 1000000 - 60 * 86400));
        book.to_file(`${GLib.get_user_data_dir()}/recently-used.xbel`);
        settings.set_boolean('launcher-recent-files', true); launcher._searchService.privacy.set_boolean('remember-recent-files', true);
        launcher.open(); launcher._selectCategory('recent'); await pause(200);
        results = launcher._navigationButtons().filter(button => button._orbitResult);
        this._assert(results.length === 1 && results[0]._orbitResult.name === 'Orbit Recent Fixture', 'Recent files or private entry filtering failed');
        launcher._searchService.privacy.set_boolean('remember-recent-files', false); await pause(200);
        this._assert(!launcher._navigationButtons().some(button => button._orbitResult), 'Privacy disable left recent files visible'); launcher.close();
        this._provider.unexport(); this._provider = null; Gio.bus_unown_name(this._providerName); this._providerName = 0;
        const context = St.ThemeContext.get_for_stage(global.stage), originalScale = context.scale_factor;
        try {
            context.scale_factor = 2; await pause(500); launcher.open(); launcher._selectCategory('all'); await pause(100);
            const monitor = Main.layoutManager.monitors[launcher._monitorIndex];
            const [appX] = launcher._appScroll.get_transformed_position(), [menuX] = launcher._menu.get_transformed_position();
            this._assert(appX + launcher._appScroll.width <= menuX + launcher._menu.width + 1, 'Scaled application area overflow');
            this._assert(launcher._menu.width <= monitor.width && launcher._menu.height <= monitor.height && launcher._gridColumns >= 1, 'Scaled launcher overflow');
            launcher._onKeyPress({get_key_symbol: () => Clutter.KEY_Down});
            this._assert(global.stage.get_key_focus()?._orbitApp, 'Scaled keyboard selection failed');
            launcher.close();
        } finally { context.scale_factor = originalScale; await pause(500); }
        settings.set_string('launcher-shortcuts', '[]');
    }
    _desktop() {
        this._app.get_windows().forEach(win => win.minimize());
        const settings = this._extension._settings;
        settings.set_boolean('desktop-icons-enabled', true);
        settings.set_boolean('desktop-show-files', true);
        settings.set_boolean('desktop-show-hidden', false);
        this._later(800, () => {
            const desktop = this._extension._parts[4];
            this._assert(desktop?._roots.length === 1, 'Desktop layer missing');
            const entries = desktop._buttons.map(button => button._delegate._orbitDesktopEntry);
            this._assert(entries.some(entry => entry.name === 'File 2.txt') && !entries.some(entry => entry.name === '.hidden'), 'Desktop enumeration/hidden filter failed');
            this._assert(desktop._roots[0].get_parent() === Main.layoutManager._backgroundGroup, 'Desktop must stay under window actors');
            const button = desktop._buttons[0];
            const [x, y] = button.get_transformed_position();
            const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x + 16, y + 16);
            this._assert(desktop._roots[0].contains(picked), `Desktop icons are not pointer targets: picked=${picked}, modalCount=${Main.modalCount}, parent=${picked.get_parent()}, rootMapped=${desktop._roots[0].mapped}, buttonMapped=${button.mapped}, overview=${Main.overview.visible}, coords=${x},${y}`);
            settings.set_string('desktop-sort-order', 'manual');
            this._later(500, () => {
                const placement = desktop._placements.find(item => item.entry.id.startsWith('file:'));
                this._assert(placement, 'No file available for manual placement');
                const source = desktop._buttons.find(b => b._delegate._orbitDesktopEntry.id === placement.entry.id)._delegate;
                const target = placement.screen.grid.capacity - 1;
                // Top-left column layout: last cell is bottom-right.
                const grid = placement.screen.grid;
                this._assert(desktop._drop(source, placement.screen, (grid.columns - 1) * grid.cellWidth + 1,
                    (grid.rows - 1) * grid.cellHeight + 1), 'Manual drop was rejected');
                const movedId = placement.entry.id;
                this._later(500, () => {
                    this._assert(desktop._placements.find(item => item.entry.id === movedId)?.slot === target, 'Manual position did not survive refresh');
                    Gio.File.new_for_path(`${GLib.getenv('ORBIT_SMOKE_DESKTOP')}/Live.txt`).replace_contents('test', null, false, Gio.FileCreateFlags.NONE, null);
                    settings.set_boolean('desktop-show-hidden', true);
                    settings.set_int('desktop-icon-size', 64);
                    this._later(600, () => {
                        const names = desktop._buttons.map(b => b._delegate._orbitDesktopEntry.name);
                        this._assert(names.includes('Live.txt') && names.includes('.hidden'), 'Desktop refresh/hidden visibility failed');
                        settings.set_boolean('desktop-icons-enabled', false);
                        this._later(400, () => {
                            this._assert(!desktop._roots.length && !desktop._fileWatch, 'Disabling desktop icons leaked actors/monitor');
                            settings.set_boolean('desktop-icons-enabled', true);
                            this._later(500, () => {
                                this._assert(desktop._roots.length === 1, 'Desktop icons did not re-enable');
                                this._extension.disable(); this._extension.enable();
                                this._later(700, () => {
                                    this._assert(this._extension._parts[4]?._roots.length === 1, 'Desktop icons did not survive extension re-enable');
                                    const roots = Main.layoutManager._backgroundGroup.get_children().filter(actor => actor.name === 'orbitDesktopIcons');
                                    this._assert(roots.length === 1, 'Desktop actors leaked across extension re-enable');
                                    this._write('PASS: Dock, taskbar, launcher and desktop Shell smoke checks');
                                });
                            });
                        });
                    });
                });
            });
        });
    }
    disable() {
        this._provider?.unexport();
        if (this._providerName) Gio.bus_unown_name(this._providerName);
        this._indicator?.unexport();
        this._timers?.forEach(id => GLib.source_remove(id));
        this._timers?.clear();
    }
}
