// the gamepad's button and stick reading (src/ui/gamepad.js), run in a bare context: bound buttons become actions,
// the stick past its dead zone becomes directions, the menu buttons stay fixed whatever is bound, and a saved map loads
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '../../src/ui/gamepad.js'), 'utf8');
const load = stored => { const ctx = { addEventListener() {}, localStorage: { getItem: () => stored, setItem() {} } };
  vm.createContext(ctx); vm.runInContext(src + ';this.padActions = padActions; this.padMenu = padMenu; this.padCfg = padCfg; this.resetPad = resetPad;', ctx); return ctx; };
const pad = (on = [], axes = [0, 0]) => ({ axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: on.includes(i) })) });

test('gamepad: default buttons and the stick give fight actions', () => {
  const g = load(null);
  assert.deepEqual([...g.padActions(pad([0, 5, 9]))].sort(), ['guard', 'pause', 'punch']);
  assert.deepEqual([...g.padActions(pad([], [-0.9, 0.9]))].sort(), ['down', 'left']);
  assert.equal(g.padActions(pad([], [0.3, -0.3])).size, 0, 'inside the dead zone');
});

test('gamepad: a saved map and dead zone load, unbound buttons do nothing, reset restores', () => {
  const g = load(JSON.stringify({ map: { 0: 'kick', 1: '' }, dead: 0.2 }));
  assert.deepEqual([...g.padActions(pad([0, 1], [0.3, 0]))].sort(), ['kick', 'right']);
  g.resetPad();
  assert.equal(g.padCfg.map[0], 'punch'); assert.equal(g.padCfg.dead, 0.4);
});

test('gamepad: menu buttons are fixed whatever is bound, broken storage falls back', () => {
  const g = load('{bad');
  assert.deepEqual({ ...g.padMenu(pad([0, 13])) }, { up: false, down: true, left: false, right: false, ok: true, back: false });
  assert.deepEqual({ ...g.padMenu(pad([1], [0, -1])) }, { up: true, down: false, left: false, right: false, ok: false, back: true });
});
