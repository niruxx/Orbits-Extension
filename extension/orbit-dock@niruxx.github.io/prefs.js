// SPDX-License-Identifier: GPL-3.0-or-later
//
// Orbit Shell preferences (GNOME Extensions → Orbit Shell → Settings).

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {taskbarPage} from './taskbarPrefs.js';

import {layoutsPage} from './prefsLayouts.js';
import {desktopPage, dockPage, effectsPage, launcherPage, personalizationPage, shellPage, topBarPage} from './prefsPages.js';

export default class OrbitShellPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(760, 820);
        window.set_search_enabled(true);
        for (const build of [layoutsPage, dockPage, taskbarPage, topBarPage, launcherPage, desktopPage,
            personalizationPage, effectsPage, shellPage])
            window.add(build(window, settings));
        // Keep the settings object alive as long as the window.
        window._orbitSettings = settings;
    }
}
