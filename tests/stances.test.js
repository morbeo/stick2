// stances: a body per stance (stanceChar), the switch keeps the move, fights with stance bodies replay in sync
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load();
const R = code => JSON.parse(run(`JSON.stringify(${code})`)); // plain values out of the engine's context
// the stick with a second stance "big" on S+G; body / more: what the stance gets
run(`var stanced = (body, more = {}) => { const d = JSON.parse(JSON.stringify(CHAR_DEFS.stick));
  d.stances = [{ name: 'big', key: 'S+G', pose: { uarmF: -100 }, binds: {}, ...(body ? { body } : {}), ...more }]; return makeCharacter(d); };
var BODY = { bones: { uarmF: { len: 30 }, uarmB: { hidden: true } }, add: [{ id: 'horn', parent: 'head', len: 10, role: 'tail' }], scale: 1.2,
  stats: { speed: 1.5, health: 2 }, gait: { stride: 2 }, chains: { jab: { punch: 'jab' } } };`);

test('stanceChar compiles a stance body once, over the base character and with a weapon', () => {
  const r = R(`(() => { const ch = stanced(BODY), s = stanceChar(ch, 1), a = armed(s, 'sword');
    return { same: stanceChar(ch, 1) === s, main: stanceChar(ch, 0) === ch, base: s.base === ch, uarmF: s.by.uarmF.len, shin: s.by.shinF.len, root: ch.by.uarmF.len,
      horn: s.by.horn?.parent, hidden: ['uarmB', 'farmB', 'handB'].map(id => [s.by[id].hidden, s.by[id].len, s.by[id].hurt]),
      arms: s.chains.arm.map(c => c[0].id), speed: s.stats.speed, health: s.stats.health, stride: s.gait.stride, next: s.moves.jab.next, rootNext: ch.moves.jab.next,
      stances: s.stances.length, armedSame: a === stanceChar(armed(ch, 'sword'), 1), aw: a.by.weapon?.parent, ahorn: !!a.by.horn, unarmed: armed(a, '') === s,
      cached: armed(s, 'sword') === a, rootArmed: armed(ch, 'sword').by.horn === undefined }; })()`);
  assert.ok(r.same && r.main && r.base && r.cached, 'cached on the base');
  assert.equal(r.uarmF, 36); assert.equal(r.shin, 23 * 1.2); assert.equal(r.root, 17);
  assert.equal(r.horn, 'head');
  assert.deepEqual(r.hidden, [[true, 0, 0], [true, 0, 0], [true, 0, 0]], 'hidden: the bone and all below it');
  assert.deepEqual(r.arms, ['uarmF'], 'hidden arms are in no chain');
  assert.equal(r.speed, 1.5); assert.equal(r.health, 1, 'health stays the character\'s'); assert.equal(r.stride, 2);
  assert.deepEqual(r.next, { punch: 'jab' }); assert.notDeepEqual(r.rootNext, { punch: 'jab' });
  assert.equal(r.stances, 2);
  assert.ok(r.armedSame && r.ahorn && r.unarmed && r.rootArmed, 'stance body and weapon combine');
  assert.equal(r.aw, 'handF');
});

test('switching stance swaps the body and its stats, keeping the running move', () => {
  const r = R(`(() => { const ch = stanced(BODY), sw = fight({ a: [0.1, 'special+guard'], b: 'dummy', ax: 330, bx: 380, period: 9 }, [ch, CHARS.stick], 40).w.a;
    const w = new World({ a: 'dummy', b: 'dummy', ax: 300, bx: 400, period: 9 }, {}, 7, [ch, CHARS.stick]), f = w.a;
    f.start('jab'); const a = f.action; f.setStance(1);
    const kept = f.action === a, grow0 = f.lens.horn, body = f.ch === stanceChar(ch, 1), speed = f.c('maxSpeed') / w.cfg.maxSpeed;
    for (let i = 0; i < 30; i++) w.advance(1 / 60, NOIN);
    const grown = f.lens.horn; f.setStance(0);
    return { st: sw.stanceI, swCh: sw.ch === stanceChar(ch, 1), kept, grow0, grown, body, speed, back: f.ch === ch }; })()`);
  assert.equal(r.st, 1); assert.ok(r.swCh, 'S+G switches to the stance body');
  assert.ok(r.kept && r.body && r.back);
  assert.equal(r.grow0, 0, 'a new bone grows from nothing'); assert.ok(Math.abs(r.grown - 12) < 0.5, 'to its length × scale: ' + r.grown);
  assert.equal(r.speed, 1.5);
});

test('a stance with an empty body fights exactly like one without', () => {
  const r = R(`(() => { const go = ch => { const r = fight({ a: [0.1, 'special+guard', 0.6, 'punch', 0.9, 'kick', 1.4, 'special+guard', 1.8, 'punch'], b: 'ai', ax: 330, bx: 400, period: 9 }, [ch, CHARS.stick], 240);
    return [r.w.stateHash(), r.seen.join(' ')]; };
    return [go(stanced(null)), go(stanced({}))]; })()`);
  assert.deepEqual(r[0], r[1]);
});

test('a fight with stance bodies (auto morph, max time) replays in sync', () => {
  const r = R(`(() => { const ch = stanced(BODY, { morph: { mode: 'auto', T: 8 }, req: { maxT: 1 } }), w = new World(SCENARIOS['you vs dummy'], {}, 5, [ch, CHARS.stick]);
    const inp = i => ({ ...NOIN, right: i % 90 < 40, punch: i % 120 === 10, kick: i % 120 === 90, guard: i % 120 >= 60 && i % 120 < 63, special: i % 120 === 61 });
    w.loop = false; let switched = 0, at = null;
    for (let i = 0; i < 500 && !w.done; i++) { w.advance(1 / 60, inp(i)); switched += w.a.stanceI; if (w.log.length === 248) at = w.stateHash(); }
    const rep = JSON.parse(JSON.stringify(makeReplay(w, 'you vs dummy'))), p = replayWorld(rep); p.loop = false;
    for (let i = 0; i <= rep.frames.length; i++) p.advance(0, NOIN);
    w.rewind(w.log.length - 248); // from a checkpoint copy (cloneState) taken mid-stance
    return { switched, desync: p.desync, end: p.stateHash() === rep.end, rewind: w.stateHash() === at }; })()`);
  assert.ok(r.switched > 0, 'the fight used the stance');
  assert.equal(r.desync, null); assert.ok(r.end); assert.ok(r.rewind, 'rewinding plays the same');
});

// ---------- requirements and limits (stance.req) ----------
// the stance a fights in at the frames in at, with stance req and scripts a / b
const stIs = (req, a, b = 'dummy', n = 150, at = []) => R(`(() => { const ch = stanced(null, { req: ${JSON.stringify(req)} }), w = new World({ a: ${JSON.stringify(a)}, b: ${JSON.stringify(b)}, ax: 330, bx: 380, period: 9 }, {}, 7, [ch, CHARS.stick]);
  w.loop = false; const out = []; for (let i = 1; i <= ${n}; i++) { w.advance(1 / 60, NOIN); if (${JSON.stringify(at)}.includes(i)) out.push(w.a.stanceI); } return out; })()`);

test('req.auto switches with no key: in the moment the requirements hold, out the moment they stop (minT still applies)', () => {
  const r = R(`(() => { const ch = stanced(null, { req: { auto: true, hpBelow: 0.5, minT: 0.2 } }), w = new World({ a: 'dummy', b: 'dummy', ax: 300, bx: 400, period: 9 }, {}, 7, [ch, CHARS.stick]), f = w.a;
    const before = f.stanceI; f.hp = f.c('health') * 0.4; w.advance(1 / 60, NOIN); const low = f.stanceI;
    f.hp = f.c('health'); w.advance(0.1, NOIN); const tooSoon = f.stanceI;
    w.advance(0.2, NOIN); const back = f.stanceI;
    return { before, low, tooSoon, back }; })()`);
  assert.deepEqual(r, { before: 0, low: 1, tooSoon: 1, back: 0 });
});

// ---------- flying (stance.fly) ----------
test('stance.fly hovers: no gravity or landing while in it, vertical speed follows ↑ / ↓, leaving it lets gravity take over again', () => {
  const r = R(`(() => { const ch = stanced(null, { fly: true }), w = new World({ a: 'human', b: 'dummy', ax: 300, bx: 400, period: 9 }, {}, 7, [ch, CHARS.stick]), f = w.a;
    f.setStance(1, 'instant');
    for (let i = 0; i < 40; i++) w.advance(1 / 60, { ...NOIN, up: true });
    const up = { y: f.y, grounded: f.grounded };
    for (let i = 0; i < 20; i++) w.advance(1 / 60, { ...NOIN, down: true });
    const down = { y: f.y, grounded: f.grounded };
    f.setStance(0); for (let i = 0; i < 5; i++) w.advance(1 / 60, NOIN);
    return { upY: up.y, upGrounded: up.grounded, downY: down.y, downGrounded: down.grounded, falling: f.vy > 0 && !f.grounded }; })()`);
  assert.ok(r.upY < -20, `rose while flying up: ${r.upY}`);
  assert.equal(r.upGrounded, false, 'flying never grounds');
  assert.ok(r.downY < 0 && r.downY > r.upY, `came back down toward the floor: ${r.downY} vs ${r.upY}`);
  assert.equal(r.downGrounded, false, 'still hovering, not landed');
  assert.ok(r.falling, 'leaving the stance lets gravity take over again');
});

test('requirements: health, where, once and cooldown decide whether a stance can be taken', () => {
  const r = R(`(() => { const ch = stanced(null, { req: { hpBelow: 0.5, cooldown: 1 } }), w = new World({ a: 'dummy', b: 'dummy', ax: 300, bx: 400, period: 9 }, {}, 7, [ch, CHARS.stick]), f = w.a;
    const full = f.stanceOk(1); f.hp = f.c('health') * 0.4; const low = f.stanceOk(1);
    f.grounded = false; const air = f.stanceOk(1), pressAir = f.stanceOk(1, false); f.grounded = true;
    f.setStance(1); f.setStance(0); const cd = f.stanceOk(1); w.simT += 1; const after = f.stanceOk(1);
    const c2 = stanced(null, { req: { once: true, air: true, grounded: false } }), w2 = new World({ a: 'dummy', b: 'dummy', ax: 300, bx: 400, period: 9 }, {}, 7, [c2, CHARS.stick]), g = w2.a;
    const ground = g.stanceOk(1); g.grounded = false; const up = g.stanceOk(1); g.setStance(1); g.setStance(0); const again = g.stanceOk(1);
    return { full, low, air, pressAir, cd, after, ground, up, again }; })()`);
  assert.deepEqual(r, { full: false, low: true, air: false, pressAir: true, cd: false, after: true, ground: false, up: true, again: false });
});

test('a blocked stance key does nothing (no special), an allowed one switches', () => {
  const blocked = R(`fight({ a: [0.1, 'special+guard'], b: 'dummy', ax: 330, bx: 380, period: 9 }, [stanced(null, { req: { hpBelow: 0.5 } }), CHARS.stick], 60).seen`);
  assert.deepEqual(blocked, []);
  assert.deepEqual(stIs({ hpAbove: 0.5 }, [0.1, 'special+guard'], 'dummy', 40, [40]), [1]);
});

test('maxT sends it back to main, minT holds it, cooldown waits', () => {
  assert.deepEqual(stIs({ maxT: 0.5 }, [0.1, 'special+guard'], 'dummy', 60, [20, 30, 60]), [1, 1, 0]);
  // (script numbers are waits: presses at about 0.1, 0.5 and 1.2 s)
  assert.deepEqual(stIs({ minT: 1 }, [0.1, 'special+guard', 0.4, 'special+guard', 0.7, 'special+guard'], 'dummy', 90, [50, 90]), [1, 0]);
  // in at 0.1, out at 0.4, again at 0.8 (too soon) and 1.6
  assert.deepEqual(stIs({ cooldown: 1 }, [0.1, 'special+guard', 0.3, 'special+guard', 0.4, 'special+guard', 0.8, 'special+guard'], 'dummy', 110, [20, 35, 60, 110]), [1, 0, 0, 1]);
  assert.deepEqual(stIs({}, [0.1, 'special+guard', 0.3, 'special+guard', 0.4, 'special+guard'], 'dummy', 60, [60]), [1], 'no cooldown: straight back in');
});

test('exitOn: a hit sends it back to main', () => {
  const b = [0.4, 'punch'];
  assert.deepEqual(stIs({ exitOn: ['hit'] }, [0.1, 'special+guard'], b, 50, [20, 50]), [1, 0]);
  assert.deepEqual(stIs({ exitOn: ['block'] }, [0.1, 'special+guard'], b, 50, [20, 50]), [1, 1], 'not on a hit');
});

test('moves: own drops the main binds, a list keeps only those moves', () => {
  const r = R(`(() => { const own = stanced(null, { binds: { punch: 'hook' }, req: { moves: 'own' } }).stances[1].binds, list = stanced(null, { req: { moves: ['jab', 'sweep'] } }).stances[1].binds;
    return { own, list: Object.values(list).sort() }; })()`);
  assert.deepEqual(r.own, { punch: 'hook' });
  assert.deepEqual(r.list, ['jab', 'sweep']);
});

// ---------- switch transitions (stance.morph) ----------
test('an auto morph blends the stance pose and the bone lengths, done in T frames', () => {
  const r = R(`(() => { const ch = stanced({ bones: { uarmF: { len: 30 } } }, { morph: { mode: 'auto', T: 10, ease: 'linear' } }), w = new World({ a: 'dummy', b: 'dummy', ax: 300, bx: 400, period: 9 }, {}, 7, [ch, CHARS.stick]), f = w.a;
    for (let i = 0; i < 5; i++) w.advance(1 / 60, NOIN);
    const p0 = f.stancePose().uarmF; f.setStance(1); let n = 0, mid = null, len = null;
    while (f.morph && n < 30) { w.advance(1 / 60, NOIN); n++; if (n === 5) { mid = f.stancePose().uarmF; len = f.lens.uarmF; } }
    return { p0, to: f.st.pose.uarmF, n, mid, len, end: f.stancePose() === f.st.pose }; })()`);
  assert.equal(r.n, 10);
  assert.ok(Math.abs(r.mid - (r.p0 + r.to) / 2) < 1e-6, `half way at frame 5: ${r.mid}`);
  assert.ok(r.len > 20 && r.len < 27, 'the length half way: ' + r.len);
  assert.ok(r.end);
});

test('a transition move plays on the switch, back to main too, or the one the stance names', () => {
  const go = (morph, script) => R(`(() => { const d = JSON.parse(JSON.stringify(CHAR_DEFS.stick)), k = p => ({ keys: [{ d: 0.1, e: 'outQuad', p }, { d: 0.1, e: 'inOutCubic', p: null }] });
    d.moves.mainToBig = k({ uarmF: 0 }); d.moves.bigToMain = k({ uarmF: 40 }); d.moves.grow = k({ uarmF: 80 });
    d.stances = [{ name: 'big', key: 'S+G', pose: { uarmF: -100 }, binds: {}, morph: ${JSON.stringify(morph)} }];
    const r = fight({ a: ${JSON.stringify(script)}, b: 'dummy', ax: 330, bx: 380, period: 9 }, [makeCharacter(d), CHARS.stick], 120);
    return { seen: r.seen, st: r.w.a.stanceI }; })()`);
  const sg = [0.1, 'special+guard', 0.6, 'special+guard'];
  assert.deepEqual(go({ mode: 'move' }, sg), { seen: ['a:mainToBig', 'a:bigToMain'], st: 0 });
  assert.deepEqual(go({ mode: 'move', move: 'grow' }, sg), { seen: ['a:grow', 'a:bigToMain'], st: 0 });
  assert.deepEqual(go({ mode: 'springs' }, sg), { seen: [], st: 0 });
});

// ---------- main is a stance too (def.main: req / body / fly over its stance 0) ----------
// the stick with def.main set, plus a second stance "big" so main's own body can be seen cascading into it
run(`var mained = (main, body) => { const d = JSON.parse(JSON.stringify(CHAR_DEFS.stick)); d.main = main;
  d.stances = [{ name: 'big', key: 'S+G', pose: {}, binds: {}, ...(body ? { body } : {}) }]; return makeCharacter(d); };`);
const M = (main, body) => `mained(${JSON.stringify(main)}, ${JSON.stringify(body)})`;

test('an unset def.main compiles exactly like today: same stances[0], main: true on it', () => {
  const r = R(`(() => { const a = makeCharacter(CHAR_DEFS.stick), b = ${M(undefined)}; return { a: a.stances[0], b: b.stances[0] }; })()`);
  assert.deepEqual(r.a, r.b);
  assert.equal(r.a.main, true);
});

test("def.main.body becomes the character's own body; another stance's body still varies from it", () => {
  const body = { bones: { uarmF: { len: 30 } }, scale: 1.2 }, bigBody = { bones: { uarmB: { hidden: true } } };
  const r = R(`(() => { const ch = ${M({ body }, bigBody)}, big = stanceChar(ch, 1);
    return { uarmF: ch.by.uarmF.len, base: ch.base, bigUarmF: big.by.uarmF.len, bigHidden: big.by.uarmB.hidden }; })()`);
  assert.equal(r.uarmF, 36, "main's own body is the base body (× its scale)");
  assert.equal(r.base, undefined, 'no separate variant needed: it IS the base');
  assert.equal(r.bigUarmF, 36, "big varies from main's body, not the character as authored");
  assert.equal(r.bigHidden, true, 'and adds its own change on top');
});

test('a weapon held in main with its own body is sized once, not twice', () => {
  const r = R(`(() => { const a = armed(${M({ body: { scale: 2 } })}, 'sword'), p = armed(makeCharacter(CHAR_DEFS.stick), 'sword');
    return { weapon: a.by.weapon.len, pWeapon: p.by.weapon.len, shin: a.by.shinF.len, pShin: p.by.shinF.len }; })()`);
  assert.ok(Math.abs(r.weapon - r.pWeapon) < 1e-9, 'the weapon itself does not inherit the body scale, either way');
  assert.equal(r.shin, r.pShin * 2, 'but the body is scaled exactly once');
});

test('def.main.req gates a switch back into main (where, hp, cooldown); maxT / exitOn / auto are not offered to main', () => {
  const r = R(`(() => { const ch = ${M({ req: { hpAbove: 0.5 } })}, w = new World({ a: 'dummy', b: 'dummy', ax: 300, bx: 400, period: 9 }, {}, 7, [ch, CHARS.stick]), f = w.a;
    f.setStance(1); const hurt0 = f.stanceOk(0); f.hp = f.c('health') * 0.4; const hurt = f.stanceOk(0); f.hp = f.c('health'); const healed = f.stanceOk(0);
    return { hurt0, hurt, healed }; })()`);
  assert.deepEqual(r, { hurt0: true, hurt: false, healed: true });
});

test('def.main.fly makes main itself hover', () => {
  const r = R(`(() => { const ch = ${M({ fly: true })}, w = new World({ a: 'human', b: 'dummy', ax: 300, bx: 400, period: 9 }, {}, 7, [ch, CHARS.stick]), f = w.a;
    for (let i = 0; i < 20; i++) w.advance(1 / 60, { ...NOIN, up: true });
    return { y: f.y, grounded: f.grounded }; })()`);
  assert.ok(r.y < -10, `rose while flying up: ${r.y}`);
  assert.equal(r.grounded, false);
});
