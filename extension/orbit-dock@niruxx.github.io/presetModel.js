// SPDX-License-Identifier: GPL-3.0-or-later
export const PRESET_INTERNAL_KEYS = ['custom-presets','settings-version','tray-known-items','launcher-install-history'];
export function presetEnvelope(text) {
    if (new TextEncoder().encode(text).length > 1024 * 1024) throw new Error('Preset exceeds 1 MiB');
    const data = JSON.parse(text);
    if (data?.format !== 'orbit-desktop-preset' || data.version !== 1 || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 64 || ['__proto__','constructor','prototype'].includes(data.name)) throw new Error('Invalid desktop preset');
    if (!data.orbit || typeof data.orbit !== 'object' || Array.isArray(data.orbit) || Object.keys(data.orbit).some(key=>PRESET_INTERNAL_KEYS.includes(key))) throw new Error('Preset contains invalid or internal settings');
    const layout=data.wm?.['button-layout'];
    if (!data.wm || Object.keys(data.wm).some(key=>key!=='button-layout') || typeof layout!=='string' || layout.length>128 || layout.split(':').length!==2 || layout.replace(':',',').split(',').some(token=>!['','appmenu','menu','minimize','maximize','close','spacer'].includes(token))) throw new Error('Invalid window button layout');
    return data;
}
