// SPDX-License-Identifier: GPL-3.0-or-later
/** Select the closest item in a direction, favoring its row/column over diagonals. */
export function directionalItem(items, current, direction) {
    if (!items.length) return null;
    if (!current) return items[0].actor;
    const from = items.find(item => item.actor === current);
    if (!from) return items[0].actor;
    const horizontal = direction === 'left' || direction === 'right';
    const sign = direction === 'left' || direction === 'up' ? -1 : 1;
    return items.filter(item => item !== from).map(item => {
        const primary = (horizontal ? item.x - from.x : item.y - from.y) * sign;
        const cross = Math.abs(horizontal ? item.y - from.y : item.x - from.x);
        return {actor: item.actor, primary, score: primary + cross * 4};
    }).filter(item => item.primary > 1).sort((a, b) => a.score - b.score)[0]?.actor ?? current;
}
