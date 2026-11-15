// SPDX-License-Identifier: GPL-3.0-or-later
// Pure state helpers shared by the Shell implementation and regression checks.
export function launcherId(uri) {
    if (typeof uri !== 'string' || !uri.startsWith('application://'))
        return null;
    try {
        const id = decodeURIComponent(uri.slice('application://'.length));
        return id && !/[\/\x00]/.test(id) ? id : null;
    } catch {
        return null;
    }
}

export function updateLauncher(previous, properties) {
    const next = {...previous};
    for (const key of ['count-visible', 'progress-visible', 'urgent']) {
        if (typeof properties[key] === 'boolean')
            next[key] = properties[key];
    }
    if (typeof properties.count === 'number' && Number.isFinite(properties.count))
        next.count = Math.max(0, Math.floor(properties.count));
    if (typeof properties.progress === 'number' && Number.isFinite(properties.progress))
        next.progress = Math.max(0, Math.min(1, properties.progress));
    return next;
}

export function combineStatus(entries, notifications = 0, critical = false) {
    let count = Math.max(0, notifications), progress = 0, progressVisible = false, urgent = critical;
    for (const entry of entries) {
        if (entry['count-visible'])
            count = Math.max(count, entry.count ?? 0); // Avoid double-counting the same notification.
        if (entry['progress-visible']) {
            progress = entry.progress ?? 0;
            progressVisible = true;
        }
        urgent ||= entry.urgent === true;
    }
    return {count, progress, progressVisible, urgent};
}

export function dominantColor(pixels, width, height, rowstride, channels) {
    // Quantized, saturation-weighted histogram: avoid transparent margins and white backgrounds.
    const bins = new Map();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * rowstride + x * channels;
            const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
            const alpha = channels === 4 ? pixels[i + 3] / 255 : 1;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            if (alpha < 0.5 || max < 30)
                continue;
            const key = `${r >> 5},${g >> 5},${b >> 5}`;
            const weight = alpha * (0.1 + (max - min) / 255);
            const bin = bins.get(key) ?? {weight: 0, r: 0, g: 0, b: 0};
            bin.weight += weight;
            bin.r += r * weight; bin.g += g * weight; bin.b += b * weight;
            bins.set(key, bin);
        }
    }
    const best = [...bins.values()].sort((a, b) => b.weight - a.weight)[0];
    if (!best)
        return null;
    return `rgb(${[best.r, best.g, best.b].map(v => Math.round(v / best.weight)).join(',')})`;
}

export function dockVisible(state) {
    if (state.fullscreen && !state.fullscreenReveal)
        return false;
    if (state.forced || state.menu || state.preview)
        return true;
    if (state.mode === 'manual')
        return !!state.manualVisible;
    if (state.fullscreen)
        return !!(state.hover || state.edge);
    if (state.mode === 'fixed' || state.overview || state.dragging || state.hover || state.edge)
        return true;
    return state.mode === 'intellihide' && !state.overlap;
}
