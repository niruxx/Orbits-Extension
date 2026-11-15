import {arrangeDesktop, desktopGrid, readDesktopPositions, slotAt, slotPosition, sortDesktopEntries} from '../extension/orbit-dock@niruxx.github.io/desktopModel.js';
function assert(condition, message) { if (!condition) throw new Error(message); }
const entries = [
    {id: 'home', name: 'Home', special: true},
    {id: 'b', name: 'File 10.txt', directory: false, size: 10, modified: 30, contentType: 'text/plain'},
    {id: 'a', name: 'File 2.txt', directory: false, size: 50, modified: 10, contentType: 'text/plain'},
    {id: 'folder', name: 'Folder', directory: true, size: 0, modified: 20, contentType: 'inode/directory'},
];
assert(sortDesktopEntries(entries, 'name', true).map(e => e.id).join(',') === 'home,folder,a,b', 'Natural names with folders first');
assert(sortDesktopEntries(entries, 'size-desc', false).map(e => e.id).join(',') === 'home,a,b,folder', 'Size descending with special icons fixed first');
assert(sortDesktopEntries(entries, 'modified-desc', false)[1].id === 'b', 'Newest first');
assert(sortDesktopEntries(entries, 'name-desc', false)[1].id === 'folder', 'Reverse alphabetical sort');
const grid = desktopGrid(500, 400, 48, 12);
for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    for (const flow of ['horizontal', 'vertical']) {
        const occupied = new Set();
        for (let slot = 0; slot < grid.capacity; slot++) {
            const {x, y} = slotPosition(slot, grid, corner, flow);
            assert(slotAt(x + 1, y + 1, grid, corner, flow) === slot, 'Drag target matches every layout direction');
            occupied.add(`${x},${y}`);
        }
        assert(occupied.size === grid.capacity, 'Grid cells do not overlap');
    }
}
assert(desktopGrid(1000, 800, 48, 12, 2).capacity === grid.capacity, 'Grid respects integer display scaling');
const screens = [{key: 'primary', grid: {...grid, capacity: 2}}, {key: 'secondary', grid: {...grid, capacity: 2}}];
let result = arrangeDesktop(entries, screens, {a: {monitor: 'secondary', slot: 1}}, true);
assert(result.placed.find(p => p.entry.id === 'a').screen.key === 'secondary', 'Preserve saved monitor');
assert(result.placed.find(p => p.entry.id === 'a').slot === 1 && !result.overflow.length, 'Preserve manual cell and distribute remaining entries');
result = arrangeDesktop(entries, [screens[0]], {a: {monitor: 'secondary', slot: 1}}, true);
assert(result.placed.length === 2 && result.overflow.length === 2, 'Disconnected monitors fall back without dropping overflow count');
result = arrangeDesktop(entries, screens, {a: {monitor: 'primary', slot: 0}, b: {monitor: 'primary', slot: 0}}, true);
assert(new Set(result.placed.map(p => `${p.screen.key}:${p.slot}`)).size === 4, 'Duplicate saved cells cannot overlap');
assert(Object.keys(readDesktopPositions('{broken')).length === 0, 'Malformed manual positions recover');
assert(Object.keys(readDesktopPositions('{"a":{"monitor":"primary","slot":-1}}')).length === 0, 'Reject invalid saved cells');
assert(entries[1].id === 'b', 'Sorting does not mutate source entries');
print('Desktop sorting, placement, scaling and saved-position checks passed');
