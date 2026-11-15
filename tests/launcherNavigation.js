import {directionalItem} from '../extension/orbit-dock@niruxx.github.io/launcherNavigation.js';
function assert(ok, message) { if (!ok) throw new Error(message); }
const items = [{actor: 'a', x: 0, y: 0}, {actor: 'b', x: 100, y: 0}, {actor: 'c', x: 0, y: 100}, {actor: 'd', x: 100, y: 100}];
assert(directionalItem(items, 'a', 'right') === 'b', 'Right arrow stays in row');
assert(directionalItem(items, 'b', 'down') === 'd', 'Down arrow stays in column');
assert(directionalItem(items, 'd', 'left') === 'c', 'Left arrow moves highlight');
assert(directionalItem(items, 'c', 'up') === 'a', 'Up arrow moves highlight');
assert(directionalItem(items, 'a', 'left') === 'a', 'Edge retains selection');
assert(directionalItem([], null, 'down') === null, 'Empty results are safe');
console.log('Launcher directional selection passed');
