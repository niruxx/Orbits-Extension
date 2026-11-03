// SPDX-License-Identifier: GPL-3.0-or-later
//
// Orbit Shell preferences (GNOME Extensions → Orbit Shell → Settings).

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {layoutsPage} from './prefsLayouts.js';
import {dockPage, effectsPage, launcherPage, personalizationPage, topBarPage} from './prefsPages.js';

export default class OrbitShellPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(760, 820);
        window.set_search_enabled(true);
        for (const build of [layoutsPage, dockPage, topBarPage, launcherPage,
            personalizationPage, effectsPage])
            window.add(build(window, settings));
        // Keep the settings object alive as long as the window.
        window._orbitSettings = settings;
    }
}
