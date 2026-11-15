// SPDX-License-Identifier: GPL-3.0-or-later
export function surfaceEffects(settings, surface) {
    const custom = settings.get_boolean(`glass-${surface}-custom`);
    return {enabled: !settings.get_boolean('reduced-effects') && settings.get_boolean(surface === 'panel' ? 'glass-top-bar' : `glass-${surface}`),
        blur: settings.get_int(custom ? `glass-${surface}-blur` : 'glass-blur-radius'),
        brightness: settings.get_double(custom ? `glass-${surface}-brightness` : 'glass-brightness'),
        backdrop: settings.get_boolean(`glass-${surface}-windows`)};
}
