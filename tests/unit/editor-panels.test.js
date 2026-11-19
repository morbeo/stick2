// the animate tab's panels and canvas without a page (src/editor/editor.js, src/editor/keyedit.js): tests/unit/ui-stub.js
// stands in for the DOM toolkit, the key panel of moves of every kind is built and every control clicked, the editor,
// filmstrip and timeline draw on a call-recording canvas, and the mouse and keys drive them
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load(['core', 'rig', 'fx', 'effects', 'roster', 'fighter', 'world', 'stage', 'brain', 'checks', 'events', 'editor', 'keyedit', 'movetable']);
run(require('./ui-stub'));
// a heading keeps its title in a first child the panel rewrites
run(`var heading = (name, tip) => Object.assign(el('h3', { tip }), { firstChild: { textContent: name } });`);
run(`var clone = o => JSON.parse(JSON.stringify(o)); var studio = { stance: 0, sel: 'uarmF' }; var fmt = v => typeof v === 'number' ? String(+v.toFixed(3)) : String(v);
  var DEFS = mapVals(CHAR_DEFS, clone); var edits = 0; var downloads = []; var download = (name, data) => downloads.push(name);
  var edit = fn => { fn(DEFS[CURRENT]); CHARS[CURRENT] = makeCharacter(DEFS[CURRENT]); edits++; };
  var panels = () => {}; var builds = 0; var curStance = (ch = currentChar()) => ch.stances[studio.stance] || ch.stances[0]; var bkey = () => bindsKey(CFG.plane);
  var curBinds = ch => curStance(ch)[bkey()]; var editBinds = def => def[bkey()] ??= {};
  var unlockedAbove = (ch, b) => { while (b?.lock) b = ch.by[b.parent]; return b; }; var saveLay = () => {}; var lay = () => ({}); var panelSet = () => {};
  var modes = []; var setMode = m => modes.push(m); var app = { mode: 'animate' }; var dpr = 1; var canvas = { width: 1000, height: 600, style: {} }; var splitX = () => 600;
  var calls = 0; var fake = () => new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k in t ? t[k] : (t[k] = new Proxy(function () {}, { apply: () => (calls++, fake()), get: (_, j) => j === Symbol.toPrimitive ? () => 0 : fake()[j] })),
    set: (t, k, v) => (t[k] = v, true), apply: () => fake() });
  var ctx = fake(); var clear = () => {}; var text = () => {}; var cursor = () => {}; var snapshot = () => {};
  var tapAll = (root, seen = new Set(), depth = 0) => { for (const c of controls(root)) { const key = c.label + '|' + c.tip; if (seen.has(key) || depth > 2) continue; seen.add(key);
    FAKE.pop = null; try { c.fire('click'); if (c.tag === 'input') c.fire('change', { target: { value: '3' } }); if (c.set) c.set(c.opts ? c.opts[0] : 1); }
    catch (e) { throw new Error((c.label || c.tag) + ' (' + c.tip + '): ' + e.stack.split('\\n').slice(0, 3).join(' / ')); }
    if (FAKE.pop) tapAll(FAKE.pop, seen, depth + 1); } return seen.size; };
  var groupOps = () => el('span');
  var adv = e => e;
  var SOUNDS = { hit: {}, whoosh: {} };
  var subFold = (name, els) => el('div', { cls: 'fold' }, [els]);
  var fxRows = () => [el('span')];
  var fxOns = () => ['strike', 'body'];
  var posesFor = () => ({ guard: { tip: 'a pose', pose: () => ({ uarmF: 0.5 }) } });
  var newWorld = (...a) => new World(...a); var playSound = () => {}; var shotPartRows = () => [el('span')];
  var performance = { now: () => 1000 };
  var roleTint = () => null;
  var drawShotGizmo = () => el('span');
  var ICONS = new Proxy({}, { get: () => 0xe000 });
  anim.playing = false; anim.move = 'jab'; anim.key = 0;`);
const js = src => JSON.parse(run(`JSON.stringify((() => { ${src} })())`));

test('the key panel of a strike, a throw, a hold and a special builds, and every control in it runs', () => {
  const r = js(`const ch = currentChar(), kinds = { strike: 'jab' };
    for (const [n, m] of Object.entries(ch.moves)) { if (m.throw && !kinds.throw) kinds.throw = n; if (m.hold && !kinds.hold) kinds.hold = n; if (m.counter && !kinds.counter) kinds.counter = n; if (m.fx && !kinds.fx) kinds.fx = n; }
    const out = {}; for (const [k, n] of Object.entries(kinds)) { anim.move = n; anim.key = 0; FAKE.regs = []; out[k] = tapAll(h('div', {}, keyPanel())); refresh(); }
    return { out, edits };`);
  assert.ok(Object.values(r.out).every(n => n > 10), JSON.stringify(r)); assert.ok(r.edits > 10);
});

test('the throw, hold, counter, effect and per-bone rows of moves that have them build and every control runs', () => {
  const r = js(`const find = f => { for (const c of Object.keys(CHARS)) for (const [n, m] of Object.entries(CHARS[c].moves)) if (f(m, n, CHARS[c])) return [c, n]; };
    const picks = { throw: find(m => m.throw), shot: find(m => m.keys.some(k => k.shoot)), plain: [CURRENT, 'jab'] };
    const out = {}, keep = CURRENT;
    for (const [k, [c, n]] of Object.entries(picks)) { CURRENT = c; anim.move = n; anim.key = Math.max(0, CHARS[c].moves[n].keys.findIndex(x => x.shoot));
      FAKE.regs = []; const rows = [throwRow(), ...(curMove().throw ? holdOptionsRows() : []), counterRow(), holdRow(), ...effectRows(), ...boneMulRows()];
      out[k] = tapAll(h('div', {}, rows)); refresh(); }
    CURRENT = keep; anim.move = 'jab'; anim.key = 0; return { out, picks };`);
  assert.ok(r.picks.throw && r.picks.shot, JSON.stringify(r.picks));
  assert.ok(Object.values(r.out).every(n => n > 3), JSON.stringify(r.out));
});

test('the bezier graph draws, drags its nearest handle, and a double click resets it', () => {
  const r = js(`anim.move = 'jab'; anim.key = 0; setKey('e', 'bezier'); const k = () => curMove().keys[anim.key];
    FAKE.regs = []; const cv = bezierGraph(k); cv.getBoundingClientRect = () => ({ left: 0, top: 0 }); cv.setPointerCapture = () => {}; refresh();
    cv.onpointermove({ clientX: 100, clientY: 40 }); const idle = k().bz;
    cv.onpointerdown({ clientX: 40, clientY: 100, pointerId: 1 }); cv.onpointermove({ clientX: 30, clientY: 120 }); const dragged = k().bz; cv.onpointerup();
    cv.ondblclick(); const reset = k().bz; setKey('e', undefined); refresh();
    return { idle: idle ?? null, dragged, reset: reset ?? null };`);
  assert.equal(r.idle, null, 'no drag without a press');
  assert.equal(r.dragged.length, 4); assert.equal(r.reset, null);
});

test('the editor, filmstrip and timeline draw, and the mouse and keys drive the animate tab', () => {
  const r = js(`anim.move = 'jab'; anim.key = 0; buildPreview(); const L = anLayout(); const out = {};
    for (const [k, set] of Object.entries({ plain: {}, onion: { onion: true }, strip: { cmpView: 'strip' }, aim: { aim: true } })) {
      Object.assign(anim, { onion: false, cmpView: null, aim: false }, set); calls = 0; drawAnimEditor(); drawTimeline(); if (set.cmpView) drawStrip(); out[k] = calls; }
    anim.cmpView = 'strip'; animMouse('down', 50, 50, {}); const stripT = anim.t; anim.cmpView = null;
    const tl = L.tl, tlY = tl.y + 30, keys = curMove().keys.length;
    for (const [t, x, y] of [['move', 200, 200], ['down', 200, 200], ['move', 210, 190], ['up', 210, 190], ['down', tl.x + 20, tl.y + 5], ['move', tl.x + 60, tl.y + 5], ['up', tl.x + 60, tl.y + 5],
      ['down', tl.x + 40, tlY], ['move', tl.x + 80, tlY], ['up', tl.x + 80, tlY], ['leave', 0, 0]]) animMouse(t, x, y, {});
    const acts = ['nextKey', 'prevKey', 'frameFwd', 'frameBack', 'playMove', 'onion', 'aim', 'nothing'].map(a => !!animKey({}, a));
    const pick = pickJoint(...[0, 0]); previewAt(0.05);
    return { out, stripT, keys, acts, edits };`);
  assert.ok(Object.values(r.out).every(n => n > 50), JSON.stringify(r.out));
  assert.deepEqual(r.acts, [true, true, true, true, true, true, true, false]);
});
