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

test('a fight with stance bodies replays in sync', () => {
  const r = R(`(() => { const ch = stanced(BODY), w = new World(SCENARIOS['you vs dummy'], {}, 5, [ch, CHARS.stick]);
    const inp = i => ({ ...NOIN, right: i % 90 < 40, punch: i % 120 === 10, kick: i % 120 === 90, guard: i % 120 >= 60 && i % 120 < 63, special: i % 120 === 61 });
    w.loop = false; let switched = 0;
    for (let i = 0; i < 500 && !w.done; i++) { w.advance(1 / 60, inp(i)); switched += w.a.stanceI; }
    const rep = JSON.parse(JSON.stringify(makeReplay(w, 'you vs dummy'))), p = replayWorld(rep); p.loop = false;
    for (let i = 0; i <= rep.frames.length; i++) p.advance(0, NOIN);
    return { switched, desync: p.desync, end: p.stateHash() === rep.end }; })()`);
  assert.ok(r.switched > 0, 'the fight used the stance');
  assert.equal(r.desync, null); assert.ok(r.end);
});

// ---------- requirements and limits (stance.req) ----------
// the stance a fights in at the frames in at, with stance req and scripts a / b
const stIs = (req, a, b = 'dummy', n = 150, at = []) => R(`(() => { const ch = stanced(null, { req: ${JSON.stringify(req)} }), w = new World({ a: ${JSON.stringify(a)}, b: ${JSON.stringify(b)}, ax: 330, bx: 380, period: 9 }, {}, 7, [ch, CHARS.stick]);
  w.loop = false; const out = []; for (let i = 1; i <= ${n}; i++) { w.advance(1 / 60, NOIN); if (${JSON.stringify(at)}.includes(i)) out.push(w.a.stanceI); } return out; })()`);

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
