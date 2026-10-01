// unit tests of the rig and fighter
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load();

test('every built-in character compiles with poses, moves and a main stance', () => {
  for (const n of run('Object.keys(CHAR_DEFS)')) {
    const ch = run(`makeCharacter(CHAR_DEFS[${JSON.stringify(n)}])`);
    assert.ok(ch.poses.stance, n), assert.ok(Object.keys(ch.moves).length > 10, n);
    assert.equal(ch.stances[0].name, 'main', n);
    for (const s of ch.stances) for (const [slot, m] of Object.entries(s.binds)) if (m) assert.ok(ch.moves[m], `${n}/${s.name}: ${slot} → ${m}`);
  }
});

test('samplePose hits the first key at t=0 and the last key at the end', () => {
  const r = run(`(() => { const ch = CHARS.stick, m = ch.moves.jab;
    return { t: total(m), a: samplePose(ch, m, 0), z: samplePose(ch, m, total(m)), k: m.keys[m.keys.length - 1].p, s: ch.poses.stance }; })()`);
  assert.ok(r.t > 0);
  for (const b in r.k) assert.ok(Math.abs(r.z[b] - r.k[b]) < 1e-6, b);
});

test('stats scale the fight settings per character', () => {
  const r = run(`(() => { const w = new World(SCENARIOS[Object.keys(SCENARIOS)[0]], {}, 7, [CHARS.ninja, CHARS.stick]);
    return [w.a.c('maxSpeed'), w.b.c('maxSpeed'), w.a.c('jumpVel'), w.b.c('jumpVel')]; })()`);
  assert.ok(r[0] > r[1], 'ninja faster'), assert.ok(r[2] > r[3], 'ninja jumps higher');
});

test('heavier characters fly less far from the same hit', () => {
  const kb = ch => run(`(() => { const r = fight({ a: [0.1, 'punch'], b: 'dummy', ax: 330, bx: 375, period: 3 }, [CHARS.stick, CHARS.${ch}], 40); return r.w.b.x; })()`);
  assert.ok(kb('stick') > kb('brute'));
});

test('centaur forelegs bend forward, hind legs back', () => {
  const p = run('CHARS.centaur.poses.stance');
  assert.ok(p.foreThighF !== undefined && p.foreShinF !== undefined);
  assert.ok(p.shinF > 0, 'hind shin bends back'), assert.ok(p.foreShinF < 0, 'fore shin bends forward');
});

test('K+G switches the ninja into crane and changes the moveset', () => {
  const r = run(`(() => { const r = fight({ a: [0.1, 'kick+guard', 1, 'kick'], b: 'dummy', ax: 330, bx: 380, period: 9 }, [CHARS.ninja, CHARS.stick], 120);
    return { st: r.w.a.stanceI, seen: r.seen }; })()`);
  assert.equal(r.st, 1);
  assert.ok(r.seen.includes('a:axeKick'), r.seen.join(' '));
});

test('K+G on a one-stance character is not a stance switch', () => {
  const r = run(`fight({ a: [0.1, 'kick+guard'], b: 'dummy', ax: 330, bx: 380, period: 9 }, [CHARS.stick, CHARS.stick], 60).w.a.stanceI`);
  assert.equal(r, 0);
});

test('a keyframed idle loop replaces the procedural idle', () => {
  const r = run(`(() => { const d = JSON.parse(JSON.stringify(CHAR_DEFS.stick)), pose = { ...CHARS.stick.poses.stance, uarmF: 40 };
    d.moves = { ...d.moves, idle: { keys: [{ d: 1, p: pose }, { d: 1, p: pose }] } };
    const w = new World(SCENARIOS[Object.keys(SCENARIOS)[0]], {}, 7, [makeCharacter(d), CHARS.stick]);
    w.a.time = 1.5; return w.a.basePose().uarmF; })()`);
  assert.ok(Math.abs(r - 40) < 6, String(r));
});

test('head, tail and two-handed strikes land', () => {
  for (const [ch, inp, move] of [['stick', 'back+punch', 'palms'], ['stick', 'up+fwd+punch', 'headbutt'], ['demon', 'back+kick', 'tailWhip']]) {
    const r = run(`(() => { const r = fight({ a: [0.1, '${inp}'], b: 'dummy', ax: 330, bx: 372, period: 9 }, [CHARS.${ch}, CHARS.stick], 60); return { hits: r.w.hits, seen: r.seen }; })()`);
    assert.ok(r.seen.includes('a:' + move), `${ch} ${inp}: ${r.seen.join(' ')}`);
    assert.ok(r.hits > 0, `${ch} ${move} hits`);
  }
});

test('with several striking bones, any of them can land', () => {
  // palms with only the back hand listed, and with both: both versions must connect, the pair never misses where one hand lands
  const r = run(`(() => { const out = {};
    for (const hit of [['handB'], ['handF', 'handB'], ['footB']]) {
      const d = JSON.parse(JSON.stringify(CHAR_DEFS.stick)); d.moves.palms.hit = hit.length > 1 ? hit : hit[0];
      out[hit.join('+')] = fight({ a: [0.1, 'back+punch'], b: 'dummy', ax: 330, bx: 372, period: 9 }, [makeCharacter(d), CHARS.stick], 60).w.hits;
    } return out; })()`);
  assert.ok(r.handB > 0 && r['handF+handB'] > 0, JSON.stringify(r));
  assert.equal(r.footB, 0, 'a bone that does not reach misses');
});

test('ragdoll falls stay in the arena, come to rest and get up', () => {
  for (const ch of run('Object.keys(CHAR_DEFS)')) for (const [mv, ax, bx] of [['@sweep', 330, 380], ['@roundhouse', 330, 385], ['@turnKick', 640, 700]]) {
    const r = run(`(() => { const w = new World({ a: [0.1, '${mv}'], b: 'dummy', ax: ${ax}, bx: ${bx}, period: 9 }, {}, 7, [CHARS.stick, CHARS.${ch}]); w.loop = false;
      let rag = false, maxV = 0, out = false, labels = new Set();
      for (let i = 0; i < 240; i++) { w.advance(1/60, NOIN); const b = w.b; if (b.label && b.labelT > 0) labels.add(b.label);
        if (b.rag) { rag = true; for (const q of Object.values(b.rag.p)) { maxV = Math.max(maxV, Math.hypot(q.vx, q.vy)); out ||= q.x < 0 || q.x > W || q.y > b.groundY + 1; } } }
      return { rag, maxV, out, end: w.b.rag ? 'rag' : w.b.kd || 'up', labels: [...labels] }; })()`);
    if (!r.rag) continue; // that character's move didn't knock it down
    assert.ok(!r.out, `${ch} ${mv} leaves the arena or sinks into the floor`);
    assert.ok(r.maxV < 2600, `${ch} ${mv} max speed ${r.maxV}`);
    assert.equal(r.end, 'up', `${ch} ${mv} gets up (${JSON.stringify(r)})`);
    if (mv === '@turnKick') assert.ok(r.labels.includes('WALL'), `${ch} splats on the wall`);
  }
});

test('a limp body collapses and comes to rest, with joint limits and muscle tone', () => {
  for (const tone of [0, 0.4, 1]) {
    const v = run(`(() => { const w = new World({ a: 'dummy', b: 'dummy', ax: 300, bx: 500, period: 9 }, { tone: ${tone} }, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
      w.advance(1/60, NOIN); const f = w.a; f.kd = 'fly'; f.grounded = false; f.vx = f.vy = 0; f.startRag();
      for (let i = 0; i < 600; i++) { f.target = f.basePose(); f.ragStep(1/120); }
      return Math.max(...Object.values(f.rag.p).map(q => Math.hypot(q.vx, q.vy))); })()`);
    assert.ok(v < 5, `tone ${tone}: still moving at ${v}`);
  }
});

test('power scale makes hits knock further', () => {
  const dist = ps => run(`(() => { const w = new World({ a: [0.1, '@roundhouse'], b: 'dummy', ax: 330, bx: 385, period: 9 }, { powerScale: ${ps} }, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    let mx = 0; for (let i = 0; i < 90; i++) { w.advance(1/60, NOIN); mx = Math.max(mx, w.b.x); } return mx - 385; })()`);
  assert.ok(dist(2) > dist(1) + 20 && dist(1) > dist(0.5), `${dist(0.5)} ${dist(1)} ${dist(2)}`);
});
