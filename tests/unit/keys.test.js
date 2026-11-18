// key binding (src/ui/keys.js) without a page: which action a key press runs in a fight and in the editor, clashes, rebinding
// by capture, macros and custom binds, and every control of the keys panel (tests/unit/ui-stub.js stands in for the DOM toolkit)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), vm = require('vm'), { srcFile } = require('../../tools/lib/engine');
const FILE = srcFile('ui/keys');
const load = stored => {
  const ctx = vm.createContext({ console, JSON, Math, Object, Array, Set, Map, String, RegExp });
  vm.runInContext(require('./ui-stub').replace(/^var keyTip = .*$/m, ''), ctx); // keys.js has its own keyTip
  vm.runInContext(`var store = { 'stick2.keys': ${JSON.stringify(stored === undefined ? null : typeof stored === 'string' ? stored : JSON.stringify(stored))} }; var localStorage = { getItem: k => store[k], setItem: (k, v) => { store[k] = v; } };
    var listeners = {}; var addEventListener = (t, fn) => { listeners[t] = fn; }; var clone = o => JSON.parse(JSON.stringify(o));
    var app = { mode: 'play' }; var creator = { controlDummy: false, htControl: 'none' }; var CFG = { plane: '2d' }; var syncs = 0; var syncAll = () => syncs++;
    var ran = []; var paletteEntries = () => [{ kind: 'mode', name: 'replay', tip: 'Replay', run: () => ran.push('replay') }, { kind: 'tool', name: 'grid', run: () => ran.push('grid') }];
    var paletteRank = (q, e) => e.name.startsWith(q) ? 1 : 0; var fuzzy = (q, s) => s.includes(q);
    var subFold = (name, kids) => el('div', { cls: 'fold', label: name }, kids); var KEYS = [['fight', 'J punch']];
    var worlds = [{ ctl: ['human'], playback: false }, { ctl: ['ai'] }]; var ownWorlds = () => worlds; var Script = function (s) { this.s = s; }; var parseMacro = s => s.split(', ');
    var mode = () => ({ worlds: () => [{ cfg: CFG }] }); var padContent = () => [el('p')];`, ctx);
  vm.runInContext(fs.readFileSync(FILE, 'utf8'), ctx, { filename: FILE });
  vm.runInContext(`var setCapture = () => capture; var keyEv = (code, o = {}) => ({ code, preventDefault() { this.prevented = true; }, target: {}, ...o });`, ctx);
  return { ctx, run: code => vm.runInContext(code, ctx), js: code => JSON.parse(vm.runInContext(`JSON.stringify((() => { ${code} })())`, ctx)) };
};

test('keys: a press runs the fight key in a fight, shortcuts take Shift on letters there and the plain key in the editor', () => {
  const k = load();
  const r = k.js(`const a = (c, o) => act(keyEv(c, o));
    const fight = [a('KeyJ'), a('KeyP'), a('KeyP', { shiftKey: true }), a('ArrowLeft'), a('Digit1'), a('KeyJ', { shiftKey: true })];
    app.mode = 'animate'; const editor = [a('KeyJ'), a('KeyP'), a('Comma'), a('Shift+KeyP')];
    app.mode = 'character'; creator.htControl = 'p1'; const ht = inFight(); creator.htControl = 'none'; globalThis.previewYou = () => true; const pv = inFight();
    return { fight, editor, ht, pv, label: shortcutLabel('pause'), tip: keyTip('pause'), none: (keymap.mark = [], keyTip('mark') + shortcutLabel('mark')),
      lbl: ['Shift+Comma', 'Alt+KeyQ', 'ArrowUp', 'Digit4', 'Period'].map(keyLabel), hint: fightHint() };`);
  assert.deepEqual(r.fight, ['punch', null, 'pause', 'left', 'play', 'punch']);
  assert.deepEqual(r.editor, [null, 'pause', 'frameBack', null]);
  assert.ok(r.ht && r.pv); assert.equal(r.label, '⇧P'); assert.equal(r.tip, ' (P, in a fight ⇧P)'); assert.equal(r.none, '');
  assert.deepEqual(r.lbl, ['⇧,', '⌥Q', '↑', '4', '.']);
  assert.match(r.hint, /^A\/D move · W jump · S crouch · J punch/);
  assert.match(k.js(`CFG.plane = 'lanes'; return fightHint();`), /W\/S depth · Space jump/);
});

test('keys: clashes are found per context; a captured key leaves what it would clash with and is saved', () => {
  const k = load();
  const r = k.js(`keymap.restart = ['KeyB']; macros[0].key = 'KeyJ'; custom.push({ kind: 'mode', name: 'replay', key: 'KeyB' }); const clash = [...keyClashes()].sort();
    keysPanel({}, {}); const chips = controls(FAKE.pop); const chip = chips.find(c => c.tip?.startsWith('Hide / show the side panel'));
    chip.click(); const busy = chip.label; const mod = captureKey(keyEv('ShiftLeft')); const done = captureKey(keyEv('KeyB'));
    const idle = captureKey(keyEv('KeyB'));
    return { clash, busy, mod, done, idle, panel: keymap.panel, restart: keymap.restart, boxes: keymap.boxes, custom: custom[0].key, saved: JSON.parse(store['stick2.keys']).map.panel };`);
  assert.deepEqual(r.clash, ['boxes', 'custom 1', 'macro 1', 'punch', 'restart']);
  assert.equal(r.busy, 'press a key…'); assert.equal(r.mod, true); assert.equal(r.done, true); assert.equal(r.idle, false);
  assert.deepEqual(r.panel, ['KeyB']); assert.deepEqual(r.restart, []); assert.deepEqual(r.boxes, []); assert.equal(r.custom, ''); assert.deepEqual(r.saved, ['KeyB']);
  const e = k.js(`keysPanel({}, {}); const c = controls(FAKE.pop).find(c => c.tip?.startsWith('Hide / show')); c.click(); captureKey(keyEv('Escape')); const esc = keymap.panel.slice();
    c.click(); captureKey(keyEv('Backspace')); return { esc, gone: keymap.panel };`);
  assert.deepEqual(e.esc, ['KeyB']); assert.deepEqual(e.gone, []);
});

test('keys: macros play in human worlds, custom binds run their palette entry, old saved names move over', () => {
  const k = load({ map: { jump: ['KeyQ'], grid: ['Digit9'] }, macros: [{ key: 'KeyO', seq: '2, 3, 6P' }], custom: [{ kind: 'mode', name: 'replay', key: 'KeyZ' }, { kind: 'tool', name: 'gone', key: 'Digit8' }] });
  const r = k.js(`const m = macroFor(keyEv('KeyO')); runMacro(m); const fire = (c, o) => { const e = keyEv(c, o); listeners.keydown(e); return !!e.prevented; };
    const f = [fire('KeyZ'), fire('KeyZ', { shiftKey: true }), fire('Digit8'), fire('KeyZ', { ctrlKey: true }), fire('KeyZ', { shiftKey: true, target: { closest: () => ({}) } })];
    app.mode = 'animate'; f.push(fire('KeyZ'), fire('KeyX'));
    return { up: keymap.up, exp: keymap.experiment, jump: 'jump' in keymap, macro: worlds[0].macro.s, ai: worlds[1].macro, f, ran, syncs };`);
  assert.deepEqual(r.up, ['KeyQ']); assert.deepEqual(r.exp, ['Digit9']); assert.equal(r.jump, false);
  assert.deepEqual(r.macro, ['2', '3', '6P']); assert.equal(r.ai, undefined);
  assert.deepEqual(r.f, [false, true, false, false, false, true, false]); assert.deepEqual(r.ran, ['replay', 'replay']);
  assert.equal(load('{bad').js(`return keymap.punch`)[0], 'KeyJ', 'broken storage falls back to the defaults');
});

test('keys: every control of the keys panel runs: search, macros, custom binds, reset', () => {
  const k = load({ custom: [{ kind: 'tool', name: 'gone', key: 'KeyZ' }] });
  const r = k.js(`keysPanel({}, {}); const pop = FAKE.pop.children[0]; pop.isConnected = true;
    const inputs = walk(pop).filter(e => e.tag === 'input'), [search, seq, pick] = [inputs[0], inputs[1], inputs.at(-1)];
    search.fire('input', { target: { value: 'pause' } }); search.oninput({ target: { value: 'pause' } });
    const shown = walk(pop).filter(e => e.className?.startsWith('row') && !e.hidden).length;
    let stop = 0; search.onkeydown({ key: 'Escape', target: search, stopPropagation: () => stop++ }); const cleared = keysQuery;
    seq.onchange({ target: { value: 'P, K' } }); seq.onkeydown({ stopPropagation: () => stop++ });
    pick.value = 're'; pick.oninput(); const list = walk(pop).filter(e => e.className === 'pitem');
    list[0].onmousedown({ preventDefault() {} }); captureKey(keyEv('KeyU')); const bound = custom.at(-1);
    pick.value = 'x'; pick.onkeydown({ key: 'Escape', target: pick, stopPropagation: () => stop++ });
    controls(pop).find(c => c.label === ':add: macro').click(); const nm = macros.length;
    controls(FAKE.pop ? FAKE.pop.children[0] : pop).filter(c => c.tip === 'Delete this macro')[0].click();
    controls(pop).find(c => c.tip === 'Delete this custom bind').click();
    const gone = walk(h('div', {}, keysContent())).some(e => /\\(gone\\)/.test(e.textContent));
    controls(pop).find(c => c.label?.startsWith(':restart_alt:')).click();
    return { shown, stop, cleared, seq: nm, bound, gone, macros: macros.length, custom: custom.length, punch: keymap.punch };`);
  assert.equal(r.shown, 2, 'pause and play / pause the move'); assert.equal(r.stop, 3); assert.equal(r.cleared, '');
  assert.equal(r.seq, 3); assert.deepEqual(r.bound, { kind: 'mode', name: 'replay', key: 'KeyU' });
  assert.equal(r.macros, 2); assert.equal(r.custom, 0); assert.deepEqual(r.punch, ['KeyJ']);
  k.run(`delete this.padContent`); // without the gamepad file the panel just leaves its section out
  assert.ok(k.js(`return keysContent().length > 3`));
});
