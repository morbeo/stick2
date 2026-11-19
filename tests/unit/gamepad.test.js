// the gamepad's button and stick reading (src/ui/gamepad.js), run in a bare context: bound buttons become actions,
// the stick past its dead zone becomes directions, the menu buttons stay fixed whatever is bound, and a saved map loads
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const FILE = path.join(__dirname, '../../src/ui/gamepad.js'), src = fs.readFileSync(FILE, 'utf8');
const load = stored => { const ctx = { addEventListener() {}, localStorage: { getItem: () => stored, setItem() {} } };
  vm.createContext(ctx); vm.runInContext(src, ctx, { filename: FILE }); // (filename: counted by coverage)
  vm.runInContext('this.padActions = padActions; this.padMenu = padMenu; this.padCfg = padCfg; this.resetPad = resetPad;', ctx); return ctx; };
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

// the rest of the pad, against a fake page: the poll in a fight and in the menus, focus moves, the keys panel section, connect / disconnect
const page = () => {
  const ctrl = (n, extra = {}) => ({ n, disabled: false, offsetParent: {}, focus() { doc.activeElement = this; }, click() { log.push('click ' + n); }, blur() { log.push('blur ' + n); }, ...extra });
  const log = [], listeners = {}, pads = [], els = [ctrl(0), ctrl(1), ctrl(2, { disabled: true }), ctrl(3, { offsetParent: null }), ctrl(4)];
  const doc = { activeElement: null, popup: false, querySelector: () => doc.popup ? { querySelectorAll: () => [els[4]] } : null, querySelectorAll: () => els };
  let t = 0, fighting = true, timers = 0;
  const h = (tag, props = {}, ...kids) => ({ tag, ...props, kids });
  const ctx = { document: doc, navigator: { getGamepads: () => pads }, performance: { now: () => t }, localStorage: { getItem: () => null, setItem: k => log.push('save ' + k) },
    addEventListener: (k, fn) => { listeners[k] = fn; }, dispatchEvent: e => log.push('key ' + e.code), KeyboardEvent: function (type, o) { Object.assign(this, o); },
    setInterval: () => ++timers, clearInterval: () => log.push('stop'), inFight: () => fighting, FIGHT: ['punch', 'kick', 'up', 'down', 'left', 'right'],
    SHORTCUTS: { pause: () => log.push('pause') }, syncAll: () => log.push('sync'), pressed: new Set(), keys: new Set(), refreshKeys: () => log.push('refresh'),
    ACTIONS: [['punch'], ['kick']], h, button: (label, tip, fn) => ({ tag: 'button', label, fn }) };
  vm.createContext(ctx); vm.runInContext(src, ctx, { filename: FILE });
  vm.runInContext('this.gpPoll = gpPoll; this.gp = gp; this.padContent = padContent; this.padCfg = padCfg;', ctx);
  return { ctx, log, listeners, pads, els, doc, tick: (dt = 10) => { t += dt; ctx.gpPoll(); }, fight: on => { fighting = on; }, timers: () => timers };
};

test('gamepad: in a fight bound fight actions press keys, other actions run once, release lets go', () => {
  const p = page(); p.ctx.gpPoll(); // no pad: nothing
  p.pads.push(null, { connected: true, id: 'Pad X', ...pad([0, 9]) });
  p.tick();
  assert.equal(p.ctx.gp.name, 'Pad X');
  assert.ok(p.ctx.keys.has('punch') && p.ctx.pressed.has('punch'));
  assert.deepEqual(p.log, ['pause', 'sync']);
  p.tick(); assert.equal(p.log.length, 2, 'held: the shortcut does not repeat');
  Object.assign(p.pads[1], pad([])); p.tick();
  assert.equal(p.ctx.keys.has('punch'), false);
});

test('gamepad: outside a fight it moves focus, repeats while held, A clicks, B escapes', () => {
  const p = page(); p.fight(false);
  p.pads.push({ connected: true, id: 'P', ...pad([0]) });
  p.ctx.keys.add('punch'); p.tick();
  assert.equal(p.ctx.keys.has('punch'), false, 'fight keys are let go in the menus');
  assert.equal(p.log.filter(l => l.startsWith('click')).length, 0, 'A with nothing focused clicks nothing');
  Object.assign(p.pads[0], pad([13])); p.tick();
  assert.equal(p.doc.activeElement.n, 0, 'first press focuses the first control');
  p.tick(100); assert.equal(p.doc.activeElement.n, 0, 'no repeat before the delay');
  p.tick(400); assert.equal(p.doc.activeElement.n, 1, 'then repeats');
  p.tick(200); assert.equal(p.doc.activeElement.n, 4, 'skipping disabled and hidden controls');
  p.tick(200); assert.equal(p.doc.activeElement.n, 0, 'and wraps around');
  Object.assign(p.pads[0], pad([])); p.tick();
  Object.assign(p.pads[0], pad([12])); p.tick(); assert.equal(p.doc.activeElement.n, 4, 'up goes back');
  Object.assign(p.pads[0], pad([0])); p.tick(); assert.ok(p.log.includes('click 4'));
  Object.assign(p.pads[0], pad([1])); p.tick(); assert.ok(p.log.includes('blur 4') && p.log.includes('key Escape'));
  p.doc.activeElement = null; p.doc.popup = true;
  Object.assign(p.pads[0], pad([12])); p.tick(); assert.equal(p.doc.activeElement.n, 4, 'inside a popup only its controls, up from none picks the last');
  p.els.length = 0; p.doc.popup = false; Object.assign(p.pads[0], pad([])); p.tick(); Object.assign(p.pads[0], pad([13])); p.tick(); // nothing focusable: no throw
});

test('gamepad: an embed without gamepad input ignores the pad', () => {
  const p = page(); p.ctx.EMBED = { cfg: { input: ['keyboard'] } };
  p.pads.push({ connected: true, id: 'P', ...pad([0, 9]) }); p.tick();
  assert.equal(p.ctx.keys.size, 0); assert.equal(p.log.length, 0); assert.deepEqual({ ...p.ctx.gp.menu }, {});
});

test('gamepad: the keys panel section binds buttons and clamps the dead zone; connect and disconnect', () => {
  const p = page(), rows = p.ctx.padContent();
  assert.match(rows[0].textContent, /No gamepad/);
  rows[1].kids[1].onchange({ target: { value: 'kick' } }); assert.equal(p.ctx.padCfg.map[0], 'kick');
  const dz = rows.at(-2).kids[1]; let stopped = false; dz.onkeydown({ stopPropagation: () => { stopped = true; } }); assert.ok(stopped);
  dz.onchange({ target: { value: '3' } }); assert.equal(p.ctx.padCfg.dead, 0.95);
  dz.onchange({ target: { value: 'x' } }); assert.equal(p.ctx.padCfg.dead, 0.4);
  rows.at(-1).kids[0].fn(); assert.equal(p.ctx.padCfg.map[0], 'punch');
  p.listeners.gamepadconnected(); p.listeners.gamepadconnected(); assert.equal(p.timers(), 1, 'one poll timer');
  p.ctx.gp.name = 'Pad X'; assert.match(p.ctx.padContent()[0].textContent, /Connected: Pad X/);
  p.ctx.gp.name = ''; assert.match(p.ctx.padContent()[0].textContent, /a gamepad/);
  p.pads.push({ connected: true }); p.listeners.gamepaddisconnected(); assert.ok(!p.log.includes('stop'), 'another pad still connected');
  p.pads.length = 0; p.ctx.gp.held.add('punch'); p.ctx.keys.add('punch'); p.listeners.gamepaddisconnected();
  assert.ok(p.log.includes('stop')); assert.equal(p.ctx.keys.has('punch'), false); assert.equal(p.ctx.gp.timer, null);
});
