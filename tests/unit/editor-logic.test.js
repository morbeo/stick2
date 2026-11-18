'use strict';
// the pure parts of the animate tab (src/editor/editor.js) and its key / move edits (src/editor/keyedit.js), run headless:
// the two files are loaded on their own and the few UI helpers they call (edit, panels, studio...) are stubbed
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load');

const FILES = ['core', 'rig', 'fx', 'effects', 'roster', 'fighter', 'world', 'stage', 'brain', 'checks', 'events', 'editor', 'keyedit'];
function setup() {
  const { run } = load(FILES);
  run(`var clone = o => JSON.parse(JSON.stringify(o)); var studio = { stance: 0, sel: 'uarmF' };
    var DEFS = mapVals(CHAR_DEFS, clone); var downloads = []; var download = (name, data) => downloads.push({ name, data });
    var edit = (fn) => { fn(DEFS[CURRENT]); CHARS[CURRENT] = makeCharacter(DEFS[CURRENT]); };
    var panels = () => {}; var buildPreview = () => { buildCount++; }; var buildCount = 0;
    var curStance = (ch = currentChar()) => ch.stances[studio.stance] || ch.stances[0]; var bkey = () => bindsKey(CFG.plane);
    var curBinds = ch => curStance(ch)[bkey()]; var editBinds = def => def[bkey()] ??= {};
    var unlockedAbove = (ch, b) => { while (b?.lock) b = ch.by[b.parent]; return b; }; var unpeek = () => {}; var saveLay = () => {}; var lay = () => ({}); var panelSet = () => {}; var setMode = () => {}; var app = { mode: 'animate' };
    var dpr = 1; var canvas = { width: 1000, height: 600 }; var splitX = () => 600;
    anim.playing = true; anim.move = 'jab'; anim.key = 1;`);
  const json = code => JSON.parse(run(`JSON.stringify((() => { ${code} })())`));
  return { run, json };
}

test('key timing: start, end and the key under a time', () => {
  const { json } = setup();
  const r = json(`const m = { keys: [{ d: 0.1 }, { d: 0.2 }, { d: 0.3 }] };
    return { s: [0, 1, 2, 3].map(i => keyStart(m, i)), e: keyEnd(m, 1), at: [0, 0.099, 0.1, 0.299, 0.59, 9].map(t => keyAt(m, t)) };`);
  assert.deepEqual(r.s.map(v => Math.round(v * 100) / 100), [0, 0.1, 0.3, 0.6]);
  assert.equal(Math.round(r.e * 100) / 100, 0.3);
  assert.deepEqual(r.at, [0, 0, 1, 1, 2, 2]);
});

test('keyPose resolves a key over the stance; isThrowTarget finds the toss a grab points at', () => {
  const { json } = setup();
  const r = json(`const ch = currentChar(), m = ch.moves.jab, p = keyPose(ch, m, 1);
    return { bones: ch.ids.every(id => typeof p[id] === 'number'), grab: ch.moves.grab.throw, toss: isThrowTarget(ch.moves.grab.throw), jab: isThrowTarget('jab') };`);
  assert.equal(r.bones, true);
  assert.equal(r.toss, true);
  assert.equal(r.jab, false);
});

test('ikChain: bone, limb and body reach', () => {
  const { json } = setup();
  const r = json(`const ch = currentChar();
    const ids = c => c.map(b => b.id);
    return { bone: ids(ikChain(ch, 'farmF', false, 'bone')), single: ids(ikChain(ch, 'farmF', true, 'limb')), limb: ids(ikChain(ch, 'handF', false, 'limb')),
      body: ids(ikChain(ch, 'handF', false, 'body')), none: ikChain(ch, 'hip', true).length };`);
  assert.deepEqual(r.bone, ['farmF']);
  assert.deepEqual(r.single, ['farmF']);
  assert.ok(r.limb.length >= 1 && r.limb.length <= 3 && r.limb[0] === 'handF');
  assert.ok(r.body.length > r.limb.length, 'body reach goes up to the root');
});

test('limit and wrap', () => {
  const { json } = setup();
  const r = json(`return { free: limit({}, 500), clamped: [limit({ min: -10, max: 20 }, 50), limit({ min: -10, max: 20 }, -50), limit({ min: -10, max: 20 }, 5)],
    off: limit({ min: -10, max: 20 }, 50, false), wrap: [wrap(190), wrap(-190), wrap(0), wrap(360), wrap(179)] };`);
  assert.equal(r.free, 500);
  assert.deepEqual(r.clamped, [20, -10, 5]);
  assert.equal(r.off, 50);
  assert.deepEqual(r.wrap, [-170, 170, 0, 0, 179]);
});

test('ik moves the end of a bone to a reachable target', () => {
  const { json } = setup();
  const r = json(`const ch = currentChar(), pose = { ...keyPose(ch, ch.moves.jab, 0) }, chain = ikChain(ch, 'handF', false, 'limb');
    const end = p => fk(ch, p, 1).handF, a = end(pose), target = [a[0] + 6, a[1] - 6];
    const out = ik(ch, pose, 'handF', target, chain), b = end(out);
    return { before: Math.hypot(a[0] - target[0], a[1] - target[1]), after: Math.hypot(b[0] - target[0], b[1] - target[1]) };`);
  assert.ok(r.after < r.before, `${r.after} < ${r.before}`);
  assert.ok(r.after < 1, 'a nearby target is reached');
});

test('poseTo writes the dragged limb into the selected key, rounded to a tenth; the hip drag keeps the ankles planted', () => {
  const { json } = setup();
  const r = json(`anim.holdEdit = false; anim.reach = 'limb'; anim.key = 1;
    const ch = currentChar(), L0 = fk(ch, keyPose(ch, ch.moves.jab, 1), 1);
    const f = { ch, s: 1, pose: keyPose(ch, ch.moves.jab, 1), toLocal: (x, y) => [x, y] };
    // poseTo reads the frame from anFrame(); stand in for it
    anFrame = () => f;
    poseTo('handF', L0.handF[0] + 5, L0.handF[1] - 5, false);
    const k = DEFS.stick.moves.jab.keys[1].p;
    return { hasHand: 'handF' in k, tenths: Object.values(k).every(v => typeof v !== 'number' || Math.abs(v * 10 - Math.round(v * 10)) < 1e-9) };`);
  assert.equal(r.hasHand, true);
  assert.equal(r.tenths, true);
});

test('hipTo moves the hip and re-solves each leg so the ankles stay', () => {
  const { json } = setup();
  const r = json(`const ch = currentChar(), pose = keyPose(ch, ch.moves.jab, 1), L = fk(ch, pose, 1);
    anim.hip0 = { x: 100, y: 100, a: [10, 10], pose, L };
    const out = hipTo({ ch, s: 1 }, 104, 100);
    const ank = id => fk(ch, out.pose, 1)[id];
    const legs = ch.chains.leg.map(c => ankleOf(c).id);
    return { anchor: anim.anchor, chain: out.chain.length > 0, drift: legs.map(id => Math.hypot(ank(id)[0] - (L[id][0] - 4), ank(id)[1] - L[id][1])) };`);
  assert.deepEqual(r.anchor, [14, 10]);
  assert.equal(r.chain, true);
  for (const d of r.drift) assert.ok(d < 1.5, 'ankle drift ' + d);
});

test('selectKey clamps and moves the playhead to the end of the key; stepFrame walks a frame at a time', () => {
  const { json } = setup();
  const r = json(`const m = currentChar().moves.jab, n = m.keys.length;
    selectKey(99); const a = [anim.key, anim.t]; selectKey(-4); const b = [anim.key, anim.t];
    anim.t = 0; anim.key = 0; stepFrame(3); const c = [anim.key, Math.round(anim.t * 60)];
    stepFrame(-99); const d = [anim.key, anim.t];
    stepFrame(9999); const e = [anim.key, anim.t < total(m)];
    return { n, a, b, c, d, e };`);
  assert.equal(r.a[0], r.n - 1);
  assert.equal(r.b[0], 0);
  assert.equal(r.c[1], 3);
  assert.deepEqual(r.d, [0, 0]);
  assert.deepEqual(r.e, [r.n - 1, true]);
});

test('move groups sort a move by type, limb, height, stance and style', () => {
  const { json } = setup();
  const r = json(`const ch = currentChar(), g = MOVE_GROUPS, mv = ch.moves;
    return { type: ['jab', 'grab', 'airKick', 'fireball', 'stomp'].map(n => g.type(mv[n])), layer: g.type({ ref: {} }), weapon: g.type({ weapon: 'sword' }), other: g.type({}),
      limb: g.limb(mv.jab, ch), nolimb: g.limb({}, ch), height: [g.height(mv.jab), g.height({ power: 1, height: 'low' }), g.height({})],
      style: [g.style({ style: 'karate' }), g.style({ power: 1 }), g.style({})], stance: g.stance(mv.jab, ch, 'jab'), none: g.none() };`);
  assert.equal(r.type[1], 'throw');
  assert.equal(r.type[2], 'air');
  assert.equal(r.layer, 'layer');
  assert.equal(r.weapon, 'weapon');
  assert.equal(r.other, 'other');
  assert.ok(r.limb.length > 0);
  assert.equal(r.nolimb, 'other');
  assert.deepEqual(r.height.slice(1), ['low', 'other']);
  assert.deepEqual(r.style, ['karate', 'basic', 'other']);
  assert.ok(['main', 'unbound'].includes(r.stance) || r.stance.length > 0);
  assert.equal(r.none, '');
});

test('moveInputs lists the input slots a move is bound to', () => {
  const { json } = setup();
  const r = json(`const ch = currentChar(); return { jab: moveInputs(ch, 'jab'), unbound: moveInputs(ch, 'rush') };`);
  assert.ok(Array.isArray(r.jab) && Array.isArray(r.unbound));
});

test('makeLoop and makeLayer author a keyframed loop / layer from the procedural pose', () => {
  const { json } = setup();
  const r = json(`makeLoop('walk'); const walk = DEFS.stick.moves[anim.move], wn = anim.move;
    makeLoop('idle'); const idle = DEFS.stick.moves[anim.move];
    makeLayer('crouch'); const lay = DEFS.stick.moves[anim.move];
    return { wn, wk: walk.keys.length, wd: Math.round(walk.keys.reduce((s, k) => s + k.d, 0) * 100) / 100, idleD: Math.round(idle.keys.reduce((s, k) => s + k.d, 0) * 10) / 10,
      layer: anim.move, ref: Object.keys(lay.ref).length > 0, lk: lay.keys.length, same: JSON.stringify(lay.keys[0].p) === JSON.stringify(lay.ref) };`);
  assert.equal(r.wk, 8);
  assert.equal(r.wd, 0.8);
  assert.equal(r.idleD, 2.4);
  assert.match(r.layer, /crouchLayer/);
  assert.equal(r.ref, true);
  assert.equal(r.lk, 2);
  assert.equal(r.same, true);
});

// ---------- key and move edits (keyedit.js) ----------
test('mirrorKey swaps front and back limbs in the key pose', () => {
  const { json } = setup();
  const r = json(`anim.key = 1; const ch = currentChar(), before = keyPose(ch, ch.moves.jab, 1);
    mirrorKey(); const after = DEFS.stick.moves.jab.keys[1].p;
    return { uF: [before.uarmF, after.uarmB], uB: [before.uarmB, after.uarmF], waist: [before.waist, after.waist] };`);
  assert.equal(r.uF[0], r.uF[1]);
  assert.equal(r.uB[0], r.uB[1]);
  assert.equal(r.waist[0], r.waist[1]);
});

test('addKey, splitKey, moveKey and deleteKey edit the key list', () => {
  const { json } = setup();
  const r = json(`const keys = () => DEFS.stick.moves.jab.keys, n0 = keys().length;
    anim.key = 1; addKey(); const added = [keys().length, anim.key, keys()[2].d, keys()[2].e];
    const total0 = keys().reduce((s, k) => s + k.d, 0);
    anim.key = 2; const d2 = keys()[2].d; splitKey(keyStart(currentChar().moves.jab, 2) + 1 / 60); const split = [keys().length, Math.round(keys()[2].d * 60), Math.round(keys()[3].d * 60), Math.round(d2 * 60)];
    const total1 = keys().reduce((s, k) => s + k.d, 0);
    const lenBefore = keys().length; splitKey(0); const noop = keys().length === lenBefore;
    const first = keys()[0].d; moveKey(0, 2); const moved = [anim.key, keys()[2].d === first];
    anim.key = 0; const l = keys().length; deleteKey(); const del = [keys().length === l - 1, anim.key];
    return { n0, added, same: Math.abs(total0 - total1) < 1e-9, split, noop, moved, del };`);
  assert.equal(r.added[0], r.n0 + 1);
  assert.equal(r.added[1], 2);
  assert.ok(Math.abs(r.added[2] - 4 / 60) < 1e-9);
  assert.equal(r.added[3], 'outQuad');
  assert.equal(r.same, true, 'a split keeps the move length');
  assert.equal(r.split[0], r.added[0] + 1);
  assert.equal(r.split[1], 1);
  assert.equal(r.split[1] + r.split[2], r.split[3]);
  assert.equal(r.noop, true);
  assert.deepEqual(r.moved, [2, true]);
  assert.deepEqual(r.del, [true, 0]);
});

test('deleteKey leaves a move its last key; keyFrames retimes in whole frames, never below one', () => {
  const { json } = setup();
  const r = json(`anim.move = 'jab'; edit(def => { def.moves.jab.keys = def.moves.jab.keys.slice(0, 1); }); anim.key = 0;
    deleteKey(); const left = DEFS.stick.moves.jab.keys.length;
    const d0 = Math.round(DEFS.stick.moves.jab.keys[0].d * 60);
    keyFrames(2); const up = Math.round(DEFS.stick.moves.jab.keys[0].d * 60); keyFrames(-99); const floor = Math.round(DEFS.stick.moves.jab.keys[0].d * 60);
    return { left, d0, up, floor };`);
  assert.equal(r.left, 1);
  assert.equal(r.up, r.d0 + 2);
  assert.equal(r.floor, 1);
});

test('setKey and setMove write a field; toggleMul adds and removes a per-bone multiplier', () => {
  const { json } = setup();
  const r = json(`anim.key = 1; setKey('e', 'linear'); setMove('knock', 123);
    toggleMul('len', 'farmF', 2); const on = { ...DEFS.stick.moves.jab.keys[1].len };
    toggleMul('len', 'handF', 2); const two = Object.keys(DEFS.stick.moves.jab.keys[1].len).length;
    toggleMul('len', 'farmF', 2); toggleMul('len', 'handF', 2); const off = DEFS.stick.moves.jab.keys[1].len;
    return { e: DEFS.stick.moves.jab.keys[1].e, knock: DEFS.stick.moves.jab.knock, on, two, off: off === undefined, rows: Object.keys(KEY_MUL_ROWS) };`);
  assert.equal(r.e, 'linear');
  assert.equal(r.knock, 123);
  assert.deepEqual(r.on, { farmF: 2 });
  assert.equal(r.two, 2);
  assert.equal(r.off, true);
  assert.deepEqual(r.rows, ['len', 'thick', 'alpha']);
});

test('pickHit sets the striking bone, or adds and removes bones in add mode', () => {
  const { json } = setup();
  const r = json(`const m = () => DEFS.stick.moves.jab; const b0 = buildCount;
    pickHit('footF', false); const one = m().hit;
    pickHit('handF', true); const two = m().hit;
    pickHit('footF', true); const back = m().hit;
    pickHit('handF', true); const none = m().hit;
    return { one, two, back, none, built: buildCount - b0 };`);
  assert.equal(r.one, 'footF');
  assert.deepEqual(r.two, ['footF', 'handF']);
  assert.equal(r.back, 'handF');
  assert.equal(r.none, '');
  assert.equal(r.built, 4);
});

test('copyMove makes a numbered copy; deleteMove removes a custom move and its binds but keeps built-ins', () => {
  const { json } = setup();
  const r = json(`anim.move = 'jab'; copyMove(); const first = anim.move; anim.move = 'jab'; copyMove(); const second = anim.move;
    const copy = JSON.stringify(DEFS.stick.moves[first]) === JSON.stringify(DEFS.stick.moves.jab);
    DEFS.stick.binds.punch = second; anim.move = second; deleteMove();
    const gone = !(second in DEFS.stick.moves), unbound = DEFS.stick.binds.punch !== second;
    anim.move = 'jab'; deleteMove(); const kept = 'jab' in DEFS.stick.moves;
    return { first, second, copy, gone, unbound, kept };`);
  assert.equal(r.first, 'jab2');
  assert.equal(r.second, 'jab3');
  assert.equal(r.copy, true);
  assert.equal(r.gone, true);
  assert.equal(r.unbound, true);
  assert.equal(r.kept, true);
});

test('exportMove downloads the move as stick2.move JSON', () => {
  const { json } = setup();
  const r = json(`anim.move = 'jab'; exportMove(); const d = downloads[0]; return { name: d.name, format: d.data.format, char: d.data.char, mv: d.data.name, same: JSON.stringify(d.data.move) === JSON.stringify(DEFS.stick.moves.jab) };`);
  assert.equal(r.name, 'stick-jab.move.json');
  assert.equal(r.format, 'stick2.move');
  assert.equal(r.char, 'stick');
  assert.equal(r.mv, 'jab');
  assert.equal(r.same, true);
});

test('toggleBind gives a move an input slot and takes it back to the default', () => {
  const { json } = setup();
  const r = json(`anim.move = 'jab'; const slot = 'qcfPunch', def0 = DEFS.stick.binds[slot];
    toggleBind(slot); const bound = DEFS.stick.binds[slot]; const listed = boundSlots().includes(slot);
    toggleBind(slot); const back = DEFS.stick.binds[slot];
    return { bound, listed, back: back === def0 || back === undefined, def0 };`);
  assert.equal(r.bound, 'jab');
  assert.equal(r.listed, true);
  assert.equal(r.back, true);
});

test('pickMove, followMove and moveSide keep the selected move and key in range', () => {
  const { json } = setup();
  const r = json(`pickMove('cross'); const a = [anim.move, anim.key, anim.t, anim.playing];
    followMove('jab'); const b = anim.move; followMove('nope'); const c = anim.move;
    anim.move = 'nope'; anim.key = 99; try { moveSide(); } catch (e) {} const d = [anim.move, anim.key < currentChar().moves[anim.move].keys.length];
    return { a, b, c, d };`);
  assert.deepEqual(r.a, ['cross', 0, 0, true]);
  assert.equal(r.b, 'jab');
  assert.equal(r.c, 'jab');
  assert.equal(r.d[1], true);
});

test('keyedit tables: every move prop, flag, tip and slot has text', () => {
  const { json } = setup();
  const r = json(`return { slots: Object.keys(SLOT_TIPS).filter(k => !SLOT_TIPS[k]), ease: Object.keys(EASE_TIPS), sparks: Object.keys(SPARK_TIPS).length, hold: HOLD_INPUTS, states: HIT_STATES };`);
  assert.deepEqual(r.slots, []);
  assert.ok(r.ease.includes('bezier'));
  assert.deepEqual(r.hold, ['punch', 'kick', 'special']);
  assert.deepEqual(r.states, ['stand', 'crouch', 'air']);
});

test('anLayout splits the canvas into editor, timeline and preview; anFrame maps rig space to the editor and back', () => {
  const { json } = setup();
  const r = json(`const l = anLayout(), f = anFrame(); anim.drag = null;
    const back = f.toLocal(f.P.handF[0], f.P.handF[1]), L = f.L.handF;
    return { l, preview: l.pv.x + l.pv.w === 1000, edW: l.ed.w, inside: Object.values(f.P).every(p => p[0] >= l.ed.x && p[0] <= l.ed.x + l.ed.w && p[1] >= l.ed.y && p[1] <= l.ed.y + l.ed.h),
      back: Math.hypot(back[0] - L[0], back[1] - L[1]), ground: f.ground, low: lowest(f.ch, f.L) };`);
  assert.equal(r.preview, true);
  assert.equal(r.edW, 600);
  assert.equal(r.l.tl.y > r.l.ed.h, true);
  assert.equal(r.inside, true);
  assert.ok(r.back < 1e-6);
  assert.ok(r.low > 0);
});

test('holdFrame offsets the held victim from the thrower by holdAt (30 px in front by default)', () => {
  const { json } = setup();
  const r = json(`anim.move = 'toss'; const a = holdFrame(); DEFS.stick.moves.toss.holdAt = { dx: 50, dy: -10 }; CHARS.stick = makeCharacter(DEFS.stick); const b = holdFrame();
    return { a: [a.dx, a.dy], b: [b.dx, b.dy], moved: b.o[0] - a.o[0] };`);
  assert.deepEqual(r.a, [30, 0]);
  assert.deepEqual(r.b, [50, -10]);
  assert.ok(r.moved > 0);
});
