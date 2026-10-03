// unit tests of the rig and fighter
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load();
run(require('./centaur'));

test('a character\'s own colour (def.col) wins over the player slot; unset, the slot decides as before', () => {
  const r = run(`(() => {
    const ch = makeCharacter({ ...CHAR_DEFS.stick, col: '#2e8b57' });
    const w = new World({ a: 'dummy', b: 'dummy', ax: 300, bx: 400, period: 9 }, {}, 7, [ch, CHARS.stick]);
    return { own: w.a.col[0], slotCol: COLS[1][0], stock: w.b.col[0] }; // w.a: the custom colour; w.b (slot 1, unset): the slot's own
  })()`);
  assert.equal(r.own, '#2e8b57', 'the custom colour overrode the slot');
  assert.equal(r.stock, r.slotCol, 'unset: still the slot colour, as every character before this existed');
});

test('every built-in character compiles with poses, moves and a main stance', () => {
  for (const n of run('Object.keys(CHAR_DEFS)')) {
    const ch = run(`makeCharacter(CHAR_DEFS[${JSON.stringify(n)}])`);
    assert.ok(ch.poses.stance, n), assert.ok(Object.keys(ch.moves).length > 10, n);
    assert.equal(ch.stances[0].name, 'main', n);
    for (const s of ch.stances) for (const [slot, m] of [...Object.entries(s.binds), ...Object.entries(s.binds25)]) if (m) assert.ok(ch.moves[m], `${n}/${s.name}: ${slot} → ${m}`);
  }
});

test('samplePose hits the first key at t=0, the last key at the end, and holds it after', () => {
  const r = run(`(() => { const ch = CHARS.stick, m = ch.moves.jab;
    return { t: total(m), a: samplePose(ch, m, 0), z: samplePose(ch, m, total(m)), after: samplePose(ch, m, total(m) + 1), k: m.keys[m.keys.length - 1].p, s: ch.poses.stance }; })()`);
  assert.ok(r.t > 0);
  for (const b in r.k) assert.ok(Math.abs(r.z[b] - r.k[b]) < 1e-6, b);
  assert.deepEqual(r.after, r.z);
});

test('stats scale the fight settings per character', () => {
  const r = run(`(() => { const w = new World(SCENARIOS[Object.keys(SCENARIOS)[0]], {}, 7, [CHARS.sneeko, CHARS.stick]);
    return [w.a.c('maxSpeed'), w.b.c('maxSpeed'), w.a.c('jumpVel'), w.b.c('jumpVel')]; })()`);
  assert.ok(r[0] > r[1], 'sneeko faster'), assert.ok(r[2] > r[3], 'sneeko jumps higher');
});

test('heavier characters fly less far from the same hit', () => {
  const kb = ch => run(`(() => { const r = fight({ a: [0.1, 'punch'], b: 'dummy', ax: 330, bx: 375, period: 3 }, [CHARS.stick, CHARS.${ch}], 40); return r.w.b.x; })()`);
  assert.ok(kb('stick') > kb('grumbo'));
});

test('centaur forelegs bend forward, hind legs back', () => {
  const p = run('CHARS.centaur.poses.stance');
  assert.ok(p.foreThighF !== undefined && p.foreShinF !== undefined);
  assert.ok(p.shinF > 0, 'hind shin bends back'), assert.ok(p.foreShinF < 0, 'fore shin bends forward');
});

test('S+G switches zippa into crane and changes the moveset', () => {
  const r = run(`(() => { const r = fight({ a: [0.1, 'special+guard', 1, 'kick'], b: 'dummy', ax: 330, bx: 380, period: 9 }, [CHARS.zippa, CHARS.stick], 120);
    return { st: r.w.a.stanceI, seen: r.seen }; })()`);
  assert.equal(r.st, 1);
  assert.ok(r.seen.includes('a:craneKick'), r.seen.join(' '));
});

test('K+G is the second throw (clinch into suplex), not a stance switch', () => {
  const r = run(`(() => { const r = fight({ a: [0.1, 'kick+guard'], b: 'dummy', ax: 330, bx: 372, period: 9 }, [CHARS.stick, CHARS.stick], 150);
    return { st: r.w.a.stanceI, seen: r.seen, behind: Math.sign(r.w.b.x - r.w.a.x) }; })()`);
  assert.equal(r.st, 0);
  assert.ok(r.seen.includes('a:clinch') && r.seen.includes('a:suplex'), r.seen.join(' '));
  assert.equal(r.behind, -1, 'the suplex lands the victim behind');
});

test('every built-in has a second stance (S+G), and an old K+G stance key still works', () => {
  const r = run(`Object.keys(CHARS).filter(k => CHARS[k].stances.length < 2 || CHARS[k].stances.slice(1).some(s => !(s.key in STANCE_KEYS)))`);
  assert.deepEqual(r, []);
  const st = run(`(() => { const d = JSON.parse(JSON.stringify(CHAR_DEFS.zippa)); d.stances[0].key = 'K+G'; d.stances.length = 1;
    return fight({ a: [0.1, 'special+guard'], b: 'dummy', ax: 330, bx: 380, period: 9 }, [makeCharacter(d), CHARS.stick], 60).w.a.stanceI; })()`);
  assert.equal(st, 1);
});

test('a keyframed idle loop replaces the procedural idle', () => {
  const r = run(`(() => { const d = JSON.parse(JSON.stringify(CHAR_DEFS.stick)), pose = { ...CHARS.stick.poses.stance, uarmF: 40 };
    d.moves = { ...d.moves, idle: { keys: [{ d: 1, p: pose }, { d: 1, p: pose }] } };
    const w = new World(SCENARIOS[Object.keys(SCENARIOS)[0]], {}, 7, [makeCharacter(d), CHARS.stick]);
    w.a.time = 1.5; return w.a.basePose().uarmF; })()`);
  assert.ok(Math.abs(r - 40) < 6, String(r));
});

test('a stance key with a direction switches to it, and back to main when pressed again', () => {
  const zippa = d => `(() => { const d = JSON.parse(JSON.stringify(CHAR_DEFS.zippa)); d.stances[0].key = '↓S+G'; d.stances.length = 1; return makeCharacter(d); })()`;
  const st = inp => run(`fight({ a: ${JSON.stringify(inp)}, b: 'dummy', ax: 330, bx: 380, period: 9 }, [${zippa()}, CHARS.stick], 150).w.a.stanceI`);
  assert.equal(st([0.1, 'special+guard']), 0, 'plain S+G no longer switches');
  assert.equal(st([0.1, 'down+special+guard']), 1);
  assert.equal(st([0.1, 'down+special+guard', 1, 'down+special+guard']), 0);
});

test('each stance plays its own idle loop (craneIdle), not the main one', () => {
  const r = run(`(() => { const d = JSON.parse(JSON.stringify(CHAR_DEFS.zippa)), ch0 = makeCharacter(d), main = { ...ch0.poses.stance, uarmF: 40 }, crane = { ...ch0.stances[1].pose, uarmF: -60 };
    d.moves = { ...d.moves, idle: { keys: [{ d: 1, p: main }, { d: 1, p: main }] }, craneIdle: { keys: [{ d: 1, p: crane }, { d: 1, p: crane }] } };
    const w = new World(SCENARIOS[Object.keys(SCENARIOS)[0]], {}, 7, [makeCharacter(d), CHARS.stick]);
    w.a.time = 1.5; const a = w.a.basePose().uarmF; w.a.stanceI = 1; return [a, w.a.basePose().uarmF]; })()`);
  assert.ok(Math.abs(r[0] - 40) < 6, String(r)), assert.ok(Math.abs(r[1] + 60) < 6, String(r));
});

test('head, tail and two-handed strikes land', () => {
  for (const [ch, inp, move, plane = '2d'] of [['stick', 'back+punch', 'palms'], ['stick', 'up+fwd+punch', 'headbutt', 'lanes'], ['gloomo', 'back+kick', 'tailWhip']]) {
    const r = run(`(() => { const r = fight({ a: [0.1, '${inp}'], b: 'dummy', ax: 330, bx: 372, period: 9, cfg: { plane: '${plane}' } }, [CHARS.${ch}, CHARS.stick], 60); return { hits: r.w.hits, seen: r.seen }; })()`);
    assert.ok(r.seen.includes('a:' + move), `${ch} ${inp}: ${r.seen.join(' ')}`);
    assert.ok(r.hits > 0, `${ch} ${move} hits`);
  }
});

test('2D: ↑ jumps and ↑ with an attack is an up attack; 2.5D: ↑ is a direction with its own moveset', () => {
  const air = (inp, plane) => run(`(() => { const w = new World({ a: [0.1, '${inp}'], b: 'dummy', ax: 300, bx: 600, period: 9, cfg: { plane: '${plane}' } }, {}, 7, [CHARS.stick, CHARS.stick]);
    let up = false; for (let i = 0; i < 40; i++) { w.advance(1/60, NOIN); up ||= !w.a.grounded; } return up; })()`);
  assert.ok(air('up', '2d'), '2D ↑ jumps'), assert.ok(!air('up', 'lanes'), 'lanes ↑ does not jump');
  const seen = (inp, plane) => run(`fight({ a: [0.1, '${inp}'], b: 'dummy', ax: 330, bx: 372, period: 9, cfg: { plane: '${plane}' } }, [CHARS.stick, CHARS.stick], 40).seen`).join(' ');
  assert.match(seen('up+punch', '2d'), /a:hammer/), assert.match(seen('up+fwd+punch', '2d'), /a:headbutt/), assert.match(seen('up+fwd+punch', 'lanes'), /a:headbutt/);
});

test('character stats: max jumps, jump height under any gravity, air dash, air dodge, fast fall, grab range', () => {
  const probe = (script, def = {}) => run(`(() => { const d = { ...CHAR_DEFS.stick, ...${JSON.stringify(def)} };
    const w = new World({ a: ${JSON.stringify(script)}, b: 'dummy', ax: 300, bx: 700, period: 9 }, {}, 7, [makeCharacter(d), CHARS.stick]);
    let top = 0, vx = 0, vy = 0, dodge = 0; for (let i = 0; i < 90; i++) { w.advance(1/60, NOIN); top = Math.min(top, w.a.y); vx = Math.max(vx, Math.abs(w.a.vx)); vy = Math.max(vy, w.a.vy); dodge = Math.max(dodge, w.a.dodgeT); }
    return { top, vx, vy, dodge }; })()`);
  const one = probe(['hop']);
  assert.ok(probe(['hop', 0.3, 'hop'], { jumps: 2 }).top < one.top - 30, 'double jump goes higher');
  assert.equal(probe(['hop', 0.3, 'hop']).top, one.top, 'one jump only');
  assert.ok(Math.abs(probe(['hop'], { gravity: 2 }).top - one.top) < 4, 'gravity keeps the jump height');
  assert.ok(probe(['hop', 0.2, 'fwd', 0.05, 'fwd']).vx > 400, 'air dash');
  assert.ok(probe(['hop', 0.2, 'fwd', 0.05, 'fwd'], { airDash: 0 }).vx < 100, 'no air dash at 0');
  assert.ok(probe(['hop', 0.2, 'guard']).dodge > 0.2, 'air dodge');
  assert.ok(probe(['hop', 0.32, { hold: 'down', t: 0.5 }]).vy > one.vy + 150, 'fast fall');
  const seen = g => run(`fight({ a: [0.1, 'punch+guard'], b: 'dummy', ax: 300, bx: 375, period: 9 }, [makeCharacter({ ...CHAR_DEFS.stick, grabRange: ${g} }), CHARS.stick], 60).seen`).join(' ');
  assert.ok(seen(3).includes('a:toss') && !seen(0).includes('a:toss'), `grab range: ${seen(3)} / ${seen(0)}`);
});

test('mid turn the body keeps turnWidth of its width and tucks in (turnTuck)', () => {
  const wid = over => run(`(() => { const w = new World({ a: 'idle', b: 'dummy', ax: 300, bx: 600, period: 9 }, ${JSON.stringify(over)}, 7, [CHARS.stick, CHARS.stick]);
    const f = w.a, xs = P => { const v = Object.values(P).map(p => p[0]); return Math.max(...v) - Math.min(...v); };
    const full = xs(f.points(f.ch.poses.stance)); f.face = 0.02; return [xs(f.points(f.ch.poses.stance)) / full, f.basePose().shinF - f.ch.poses.stance.shinF]; })()`);
  const thin = wid({ turnWidth: 0, turnTuck: 0 }), keep = wid({ turnWidth: 0.5, turnTuck: 1 });
  assert.ok(thin[0] < 0.1 && keep[0] > 0.45, `${thin} / ${keep}`);
  assert.ok(Math.abs(keep[1] - thin[1]) > 20, `tuck ${thin[1]} / ${keep[1]}`);
});

test('dangling bones (the sneeko scarf) droop at rest, trail a run and lift in a fall, by dangle', () => {
  const end = (over, vx, vy) => run(`(() => { const w = new World({ a: 'idle', b: 'dummy', ax: 300, bx: 600, period: 9 }, ${JSON.stringify(over)}, 7, [CHARS.sneeko, CHARS.stick]);
    const f = w.a; for (let i = 0; i < 40; i++) { f.vx = ${vx}; f.vy = ${vy}; f.update(1 / 60, NOIN); f.x = 300; f.y = 0; }
    const P = f.points(f.disp); return [P.scarfEnd[0] - P.neck[0], P.scarfEnd[1] - P.neck[1]]; })()`);
  const still = end({}, 0, 0), runR = end({}, 400, 0), off = end({ dangle: 0 }, 0, 0), fall = end({}, 0, 700);
  assert.ok(runR[0] < still[0] - 5, `run trails back: ${runR} vs ${still}`);
  assert.ok(off[1] < still[1] - 5, `droops at rest, not with dangle 0: ${off} vs ${still}`);
  assert.ok(fall[1] < still[1] - 5, `fall lifts it: ${fall} vs ${still}`);
});

test('↓ then jump is a super jump; a jump next to a wall is a triangle jump off it', () => {
  const probe = (script, ax = 300, over = {}) => run(`(() => { const w = new World({ a: ${JSON.stringify(script)}, b: 'dummy', ax: ${ax}, bx: 700, period: 9 }, ${JSON.stringify(over)}, 7, [CHARS.stick, CHARS.stick]);
    let top = 0, vx = 0; for (let i = 0; i < 90; i++) { w.advance(1/60, NOIN); top = Math.min(top, w.a.y); vx = Math.max(vx, w.a.vx); } return { top, vx }; })()`);
  const one = probe(['hop']), sup = probe(['down', 0.1, 'hop']);
  assert.ok(sup.top < one.top * 1.6, `super jump ${sup.top} vs ${one.top}`);
  assert.equal(probe(['down', 0.1, 'hop'], 300, { superJump: 1 }).top, one.top, 'superJump 1 is off');
  assert.ok(Math.abs(probe(['down', 0.5, 'hop']).top - one.top) < 2, 'too late after ↓');
  assert.ok(probe(['hop', 0.25, 'hop'], 45).vx > 300, 'wall jump pushes away from the left wall');
  assert.ok(probe(['hop', 0.25, 'hop'], 45, { wallJump: 0 }).vx < 100, 'wallJump 0 is off');
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

test('a fully limp body lies with its knees bent (slack), neither straight nor folded flat', () => {
  const knees = run(`(() => { const w = new World({ a: 'dummy', b: 'dummy', ax: 300, bx: 500, period: 9 }, { tone: 0 }, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    w.advance(1/60, NOIN); const f = w.a; f.kd = 'fly'; f.grounded = false; f.vx = -250; f.vy = -350; f.startRag(); f.ragHit({ pt: [f.rag.p.head.x, f.rag.p.head.y] });
    for (let i = 0; i < 480; i++) { f.target = f.basePose(); f.ragStep(1/120); }
    const p = f.rag.p, ang = (a, e) => Math.atan2(e.x - a.x, e.y - a.y) / R;
    return ['F', 'B'].map(s => Math.round(Math.abs(wrap180(ang(p['thigh' + s], p['shin' + s]) - ang(p.hip, p['thigh' + s]))))); })()`);
  assert.ok(knees.every(k => k > 15 && k < 150), `knees ${knees}`);
});

test('a ragdoll is drawn where it is simulated, upside down too (the half-level neck keeps up)', () => {
  const off = run(`(() => { const w = new World({ a: [0.1, '@launcher'], b: 'dummy', period: 9 }, {}, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    let off = 0; for (let i = 0; i < 240; i++) { w.advance(1/60, NOIN); const f = w.b; if (!f.rag) continue; const P = f.body();
      for (const id in f.rag.p) off = Math.max(off, Math.hypot(f.rag.p[id].x - P[id][0], f.rag.p[id].y - P[id][1])); } return off; })()`);
  assert.ok(off < 0.5, `drawn ${off}px off`);
});

test('a ragdoll head keeps to its joint limits and never props the body up', () => {
  let frames = 0, over = 0;
  for (const c of ['stick', 'grumbo', 'lumpo', 'sarj']) for (const seed of [1, 2, 3]) for (const a of ['@charge', '@launcher', '@sweep']) {
    const r = run(`(() => { const w = new World({ a: [0.1, '${a}'], b: 'dummy', bx: 380, period: 9 }, {}, ${seed}, [CHARS.stick, CHARS.${c}]); w.loop = false;
      const f = w.b, ch = f.ch, head = ch.bones.find(b => b.shape === 'circle' && b.role === 'head'); let n = 0, over = 0, prop = 0;
      for (let i = 0; i < 400; i++) { w.advance(1/60, NOIN); if (!f.rag) continue; const p = f.rag.p, A = id => { const b = ch.by[id], a = p[b.parent || 'hip'], e = p[id]; return Math.atan2((e.x - a.x) * f.dir, e.y - a.y) / R; };
        n++; if (ch.bones.some(b => { if (b.role !== 'head' || b.min === undefined) return false; const x = wrap180(A(b.id) - A(b.parent) - (b.min + b.max) / 2) + (b.min + b.max) / 2; return x < b.min - 10 || x > b.max + 10; })) over++;
        const nk = p[head.parent], hd = p[head.id]; if (f.kd === 'down') prop = hd.y + hd.r > f.groundY - 1 && hd.y - nk.y > 3 && f.groundY - nk.y > 14 ? 1 : 0; }
      return { n, over, prop }; })()`);
    assert.ok(!r.prop, `${c} ${a} seed ${seed}: the head props the body up`);
    frames += r.n; over += r.over;
  }
  assert.ok(over / frames < 0.06, `${over} of ${frames} frames more than 10° past a head joint limit`);
});

test('per-move hit stop, blockstun and block push override the settings', () => {
  const probe = (mv, guard) => run(`(() => { const d = { ...CHAR_DEFS.stick, moves: { ...CHAR_DEFS.stick.moves, kick: { ...CHAR_DEFS.stick.moves.kick, ...${JSON.stringify(mv)} } } };
    const w = new World({ a: [0.1, '@kick'], b: ${guard ? "[{ hold: 'guard', t: 3 }]" : "'dummy'"}, ax: 330, bx: 385, period: 9 }, {}, 7, [makeCharacter(d), CHARS.stick]); w.loop = false;
    let fr = 0, bt = 0, vx = 0; for (let i = 0; i < 90; i++) { w.advance(1/60, NOIN); fr = Math.max(fr, w.b.freeze); bt = Math.max(bt, w.b.blockT); vx = Math.max(vx, Math.abs(w.b.vx)); }
    return { fr: +fr.toFixed(3), bt: +bt.toFixed(3), vx: Math.round(vx) }; })()`);
  assert.ok(probe({ stop: 0.3 }).fr > probe({}).fr + 0.1, 'hit stop');
  assert.equal(probe({ bstun: 0.9 }, true).bt, 0.9, 'blockstun');
  assert.ok(probe({ bpush: 500 }, true).vx > probe({}, true).vx + 100, 'block push');
});

test('bones with react 0 are not jolted by bounces or blocks', () => {
  const kick = react => run(`(() => { const d = { ...CHAR_DEFS.stick, bones: CHAR_DEFS.stick.bones.map(b => ({ ...b, react: ${react} })) };
    const w = new World({ a: 'dummy', b: 'dummy', period: 9 }, {}, 7, [makeCharacter(d), CHARS.stick]); w.loop = false; w.advance(1/60, NOIN);
    const f = w.a, before = Object.values(f.flt).map(s => s.yd); f.flailJolt(1); f.jolt(f.ch.by.uarmF, 300);
    return Math.max(...Object.values(f.flt).map((s, i) => Math.abs(s.yd - before[i]))); })()`);
  assert.equal(kick(0), 0);
  assert.ok(kick(1) > 100);
});

test('power scale makes hits knock further', () => {
  const dist = ps => run(`(() => { const w = new World({ a: [0.1, '@roundhouse'], b: 'dummy', ax: 330, bx: 385, period: 9 }, { powerScale: ${ps} }, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    let mx = 0; for (let i = 0; i < 90; i++) { w.advance(1/60, NOIN); mx = Math.max(mx, w.b.x); } return mx - 385; })()`);
  assert.ok(dist(2) > dist(1) + 20 && dist(1) > dist(0.5), `${dist(0.5)} ${dist(1)} ${dist(2)}`);
});

test('the ceiling bounces a body knocked up to the top of the screen; a ragdoll bounces off the floor (bounces setting)', () => {
  const top = (falls, ceiling) => run(`(() => { const w = new World({ a: 'dummy', b: 'dummy', ax: 300, bx: 500, period: 9 }, { falls: '${falls}', ceiling: ${ceiling} }, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    w.advance(1/60, NOIN); const f = w.a; f.kd = 'fly'; f.grounded = false; f.vy = -1600; if ('${falls}' === 'ragdoll') { f.startRag(); f.ragHit({ pt: [f.x, f.groundY - 60] }); }
    let top = 1e9; for (let i = 0; i < 120; i++) { w.advance(1/60, NOIN); top = Math.min(top, ...Object.values(f.body()).map(q => q[1])); } return top; })()`);
  for (const falls of ['ragdoll', 'pose']) { const off = top(falls, 0), on = top(falls, 0.9); assert.ok(off < -100 && on > -20, `${falls}: ${off} ${on}`); }
  const rise = bounces => run(`(() => { const w = new World({ a: 'dummy', b: 'dummy', ax: 300, bx: 500, period: 9 }, { floorBounce: 0.8, bounces: ${bounces} }, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    w.advance(1/60, NOIN); const f = w.a; f.kd = 'fly'; f.grounded = false; f.vx = 300; f.vy = -900; f.startRag(); f.ragHit({ pt: [f.x, f.groundY - 60] });
    let low = 0, up = 0; for (let i = 0; i < 150; i++) { w.advance(1/60, NOIN); const y = f.rag ? f.groundY - f.rag.p.hip.y : 0; if (i > 40) { low = Math.min(low || y, y); up = Math.max(up, y - low); } } return up; })()`);
  assert.ok(rise(3) > 30 && rise(0) < 15, `${rise(0)} ${rise(3)}`);
});

test('endless waves: the next wave comes once every enemy is down, knocked-out ones leave, rewinding across a wave plays the same', () => {
  const r = run(`(() => { const w = new World(SCENARIOS['ai vs waves'], { health: 60, waves: 'one' }, 2, [CHARS.stick]); w.loop = false;
    let at = 0, most = 0; for (let i = 0; i < 60 * 60 && w.wave < 3 && !w.done; i++) { w.advance(1/60, NOIN); most = Math.max(most, w.fighters.length); if (w.wave === 2 && !at) at = i; }
    return { wave: w.wave, most, at }; })()`);
  assert.ok(r.at > 0 && r.most === 2, JSON.stringify(r));
  const same = run(`(() => { const w = new World(SCENARIOS['ai vs waves'], { health: 60, waves: 'one' }, 2, [CHARS.stick]); w.loop = false;
    for (let i = 0; i < ${r.at} + 60; i++) w.advance(1/60, NOIN); const h = w.stateHash(); w.rewind(80); for (let i = 0; i < 80; i++) w.advance(1/60, NOIN); return [h, w.stateHash(), w.wave]; })()`);
  assert.equal(same[0], same[1]); assert.ok(same[2] >= 2);
});

test('survival: enemies keep coming up to survMax, tougher with time and enemies down, the downed leave, rewinding plays the same', () => {
  const sim = `const w = new World(SCENARIOS['ai survival'], { health: 60, survMax: 2, survEvery: 1, survHp: 0.2, survHpTime: 1, survHpKill: 0.5 }, 3, [CHARS.stick]); w.loop = false;`;
  const r = run(`(() => { ${sim} const first = w.b.c('health'); let most = 0, at = 0;
    for (let i = 0; i < 60 * 90 && w.downs < 3 && !w.done; i++) { w.advance(1/60, NOIN); most = Math.max(most, w.foes(w.a).length); if (w.downs && !at) at = i; }
    return { first, downs: w.downs, most, at, last: w.fighters[w.fighters.length - 1].c('health'), n: w.fighters.length, spawned: w.spawned }; })()`);
  assert.equal(r.first, 12); assert.ok(r.downs >= 3 && r.most === 2 && r.n <= 5, JSON.stringify(r));
  assert.ok(r.last > 12 * 1.5, JSON.stringify(r)); // grown by the downs (and the minutes)
  const same = run(`(() => { ${sim} for (let i = 0; i < ${r.at} + 90; i++) w.advance(1/60, NOIN); const h = w.stateHash(); w.rewind(120); for (let i = 0; i < 120; i++) w.advance(1/60, NOIN); return [h, w.stateHash()]; })()`);
  assert.equal(same[0], same[1]);
});

test('a character\'s own motion (def.motions) is a new input, tried before the built-in motions', () => {
  const r = run(`(() => { const d = { ...CHAR_DEFS.stick, motions: { m41236: '41236' }, binds: { ...CHAR_DEFS.stick.binds, m41236Punch: 'launcher' } };
    const go = seq => { const w = new World({ a: seq, b: 'dummy', ax: 330, bx: 385, period: 9 }, {}, 7, [makeCharacter(d), CHARS.stick]); w.loop = false; const seen = new Set();
      for (let i = 0; i < 60; i++) { w.advance(1/60, NOIN); const a = w.a.action; if (a) seen.add(Object.keys(w.a.ch.moves).find(k => w.a.ch.moves[k] === a.m)); } return [...seen].join(); };
    return [go(['back', 'down+back', 'down', 'down+fwd', 'fwd+punch']), go(['down', 'down+fwd', 'fwd+punch']), go(['fwd+punch'])]; })()`);
  assert.deepEqual([...r], ['launcher', 'rush', 'elbow']);
});

test('fighting-style moves land when bound, the clinch and plum throws release into the suplex and the knee', () => {
  const r = json(`(() => { const out = {}, ch = binds => makeCharacter({ ...CHAR_DEFS.stick, binds: { ...CHAR_DEFS.stick.binds, ...binds } });
    for (const n of ['hook', 'bodyHook', 'overhand', 'reversePunch', 'sideKick', 'knifeHand', 'spinElbow', 'thaiKick', 'armada', 'martelo', 'rasteira', 'chainPunch', 'tigerClaw', 'axeKick', 'lariat']) {
      const w = new World({ a: [0.1, 'punch'], b: 'dummy', ax: 330, bx: 385, period: 9 }, {}, 7, [ch({ punch: n }), CHARS.stick]); w.loop = false;
      for (let i = 0; i < 60; i++) w.advance(1/60, NOIN); out[n] = w.hits; }
    for (const n of ['clinch', 'plum']) { const w = new World(SCENARIOS.throw, {}, 7, [ch({ throw: n }), CHARS.stick]); w.loop = false;
      for (let i = 0; i < 150; i++) w.advance(1/60, NOIN); out[n] = [Math.sign(w.b.x - w.a.x), w.b.hp < 100]; }
    out.styles = Object.keys(CHARS.stick.moves).filter(n => CHARS.stick.moves[n].style).length;
    return out; })()`);
  for (const [n, v] of Object.entries(r)) if (typeof v === 'number' && n !== 'styles') assert.equal(v, 1, n + ' whiffs');
  assert.deepEqual(r.clinch, [-1, true]); assert.deepEqual(r.plum, [1, true]); // the suplex throws behind, the knee forward
  assert.ok(r.styles >= 50, 'styled moves ' + r.styles);
});

test('bodies collide by their extents: two centaurs keep their horse bodies apart, two sticks the usual gap', () => {
  const r = json(`[CHARS.centaur, CHARS.stick].map(ch => { const w = new World({ a: 'dummy', b: 'dummy', ax: 380, bx: 400, period: 9 }, {}, 7, [ch, ch]); w.loop = false;
    for (let i = 0; i < 10; i++) w.advance(1/60, NOIN); return Math.round(w.b.x - w.a.x); })`);
  assert.ok(r[0] > 85, 'centaurs ' + r[0]); assert.equal(r[1], 38);
});

test('the impact tool strikes the body under the point, a long drag knocks it down', () => {
  const r = run(`(() => { const w = new World({ a: 'dummy', b: 'dummy', period: 9 }, {}, 7, [CHARS.stick, CHARS.stick]); w.loop = false; w.advance(1/60, NOIN);
    const h = w.b.body().head, miss = w.poke(h[0], h[1] - 200, 50, 0), small = w.poke(h[0], h[1], 20, 0), kd1 = w.b.kd;
    for (let i = 0; i < 60; i++) w.advance(1/60, NOIN);
    const big = w.poke(w.b.body().head[0], w.b.body().head[1], 120, -60); w.advance(1/60, NOIN);
    return { miss, small, kd1, big, kd2: w.b.kd, rag: !!w.b.rag, hits: w.hits }; })()`);
  assert.deepEqual({ ...r }, { miss: false, small: true, kd1: null, big: true, kd2: 'fly', rag: true, hits: 2 });
});

// results from the engine's context as plain values (deepEqual wants this realm's arrays and objects)
const json = code => JSON.parse(run(`JSON.stringify(${code})`));

test('a weapon compiles into the hand with its class\'s binds; wbinds override them', () => {
  const r = json(`(() => { const ch = armed(CHARS.stick, 'sword'), d = { ...CHAR_DEFS.stick, wbinds: { slash: { punch: 'chop', downPunch: '' } } }, c2 = armed(makeCharacter(d), 'axe');
    return { w: ch.weapon, p: ch.stances[0].binds.punch, f: ch.stances[0].binds25.fwdPunch, bone: ch.by.weapon.parent, same: armed(CHARS.stick, 'sword') === ch, base: ch.base === CHARS.stick,
      p2: c2.stances[0].binds.punch, d2: c2.stances[0].binds.downPunch, un: CHARS.stick.stances[0].binds.punch, nun: !!armed(CHARS.stick, 'nunchucks').by.weaponTip }; })()`);
  assert.deepEqual(r, { w: 'sword', p: 'slash', f: 'chop', bone: 'handF', same: true, base: true, p2: 'chop', d2: run('CHARS.stick.binds.downPunch'), un: 'jab', nun: true });
});

test('P+G over a weapon picks it up and P swings it', () => {
  const r = json(`(() => { const r = fight(SCENARIOS['pick up & slash'], [CHARS.stick, CHARS.stick], 300); return { w: r.w.a.ch.weapon, seen: r.seen, hits: r.w.hits, items: r.w.items.length }; })()`);
  assert.equal(r.w, 'sword'), assert.equal(r.items, 0);
  assert.deepEqual(r.seen.slice(0, 4), ['a:pickUp', 'a:slash', 'a:chop', 'a:lowSlash']);
  assert.ok(r.hits >= 2);
});

test('pick up by the handle at the grip key, throw at the release key; unmarked: the first key', () => {
  const r = json(`(() => { const go = (flags, sc) => { const d = JSON.parse(JSON.stringify(CHAR_DEFS.stick));
      if (!flags) for (const n of ['pickUp', 'weaponThrow']) d.moves[n].keys.forEach(k => { delete k.grip; delete k.release; });
      const w = new World(SCENARIOS[sc], {}, 7, [makeCharacter(d), CHARS.stick]), out = [];
      for (let i = 0; i < 120; i++) { w.advance(1 / 60, NOIN); const a = w.a, it = w.items.find(i => i.taker === a);
        if (a.action && (a.action.pick || a.action.toss)) out.push([a.action.i, !!a.ch.weapon, it ? Math.abs(a.body()[a.weaponIds?.[0] || 'handF'][0] - (it.x - Math.cos(it.rot) * WEAPONS[it.type].len / 2)) : -1]); }
      return out; };
    return { pick: go(true, 'pick up & slash'), pick0: go(false, 'pick up & slash'), toss: go(true, 'weapon throw'), toss0: go(false, 'weapon throw') }; })()`);
  const at = (o, armed) => o.find(([, w]) => w === armed)?.[0];
  assert.equal(at(r.pick, true), 1, 'gripped as the first key is reached'), assert.equal(at(r.pick, false), 0);
  const near = r.pick.filter(([i, w, d]) => !w && d >= 0).at(-1);
  assert.ok(near[2] < 8, 'the handle is at the hand when it closes: ' + near[2]);
  assert.equal(at(r.toss, false), 2, 'released at the second key, after the wind-up');
  assert.equal(at(r.pick0, true), 1), assert.equal(at(r.toss0, false), 1, 'no release key: the first');
});

test('a staff or hammer is held in both hands (grip2), a sword in one; the whirl turns the staff a full circle and does not unwind', () => {
  const r = json(`(() => { const gap = type => { const w = new World(SCENARIOS['you vs dummy'], {}, 7, [CHARS.stick, CHARS.stick]); w.a.wield(type);
      for (let i = 0; i < 30; i++) w.advance(1 / 60, NOIN);
      if (!WEAPONS[type].grip2) return w.a.ch.bones.filter(b => b.side === 'b' && /arm|hand/.test(b.id)).every(b => (w.a.planted || w.a.disp)[b.id] === w.a.disp[b.id]) ? 'free' : 'held';
      const P = w.a.body(), h = P.handF, u = [P.weapon[0] - h[0], P.weapon[1] - h[1]], l = Math.hypot(...u), g = WEAPONS[type].grip2 || 0;
      return Math.round(Math.hypot(P.handB[0] - h[0] - u[0] / l * g, P.handB[1] - h[1] - u[1] / l * g)); };
    const w = new World(SCENARIOS['you vs dummy'], {}, 7, [CHARS.stick, CHARS.stick]), a = w.a; a.wield('staff');
    for (let i = 0; i < 20; i++) w.advance(1 / 60, NOIN);
    const ang = () => { const wa = {}; fk(a.ch, a.disp, 1, a.lens, wa); return wa.weapon; }, a0 = ang(); let lo = a0, back = 0;
    a.force('whirl'); for (let i = 0; i < 90 && a.action; i++) { w.advance(1 / 60, NOIN); if (!a.action) break; const v = ang(); lo = Math.min(lo, v); back = Math.max(back, v - lo); }
    for (let i = 0; i < 30; i++) w.advance(1 / 60, NOIN);
    return { staff: gap('staff'), hammer: gap('hammer'), sword: gap('sword'), turn: a0 - lo, back, after: Math.abs(ang() - a0) }; })()`);
  assert.ok(r.staff < 3 && r.hammer < 3, 'the back hand on the weapon: ' + [r.staff, r.hammer]);
  assert.equal(r.sword, 'free', 'a sword is held in one hand');
  assert.ok(r.turn > 300, 'whirl: a full circle (' + Math.round(r.turn) + '°)');
  assert.ok(r.back < 60, 'it does not turn back the way it came: ' + Math.round(r.back) + '°');
  assert.ok(r.after < 5, 'back at the rest grip, a whole turn on: ' + r.after);
});

test('P+G with a weapon throws it: it hits from range and the thrower is unarmed', () => {
  const r = json(`(() => { const r = fight(SCENARIOS['weapon throw'], [CHARS.stick, CHARS.stick], 120); return { w: r.w.a.ch.weapon, hits: r.w.hits, hp: r.w.b.hp, it: r.w.items.map(i => [i.type, i.rest]) }; })()`);
  assert.equal(r.w, undefined), assert.equal(r.hits, 1), assert.ok(r.hp < 100);
  assert.deepEqual(r.it, [['dagger', true]]);
});

test('a knockdown disarms: the weapon falls to the floor', () => {
  const r = json(`(() => { const r = fight(SCENARIOS.disarm, [CHARS.stick, CHARS.stick], 120); return { w: r.w.b.ch.weapon, it: r.w.items.map(i => i.type) }; })()`);
  assert.equal(r.w, undefined), assert.deepEqual(r.it, ['sword']);
});

test('rewind replays the fight to the same state, AI and human input included', () => {
  const r = json(`(() => { const w = new World(SCENARIOS['you vs ai'], {}, 7, [CHARS.stick, CHARS.sneeko]), st = () => [w.a.x, w.b.x, w.a.hp, w.b.hp, w.hits, w.b.action?.i ?? -1].map(v => Math.round(v * 1000));
    const inp = i => ({ ...NOIN, right: i % 90 < 40, punch: i % 23 === 0, kick: i % 37 === 0 });
    for (let i = 0; i < 400; i++) w.advance(i % 3 ? 1 / 60 : 1 / 50, inp(i));
    const at = st();
    for (let i = 400; i < 520; i++) w.advance(1 / 60, inp(i));
    const later = st(), hl = w.stateHash(); w.rewind(120);
    const back = st(), n = w.log.length, cp = w.checkpoints.at(-1).i;
    for (let i = 400; i < 520; i++) w.advance(1 / 60, inp(i)); // the same inputs again from the restored checkpoint
    return { at, later, back, n, cp, again: st(), same: w.stateHash() === hl }; })()`);
  assert.deepEqual(r.back, r.at), assert.notDeepEqual(r.later, r.at), assert.equal(r.n, 400), assert.equal(r.cp, 360);
  assert.deepEqual(r.again, r.later), assert.ok(r.same, 'the state hash after replaying forward matches');
});

test('planted feet stay put while the body walks over them, step when left behind, and rewind the same', () => {
  const r = plant => json(`(() => { const w = new World(SCENARIOS.walk, { plant: ${plant} }, 3, [CHARS.stick, CHARS.stick]); w.loop = false;
    let slide = 0, steps = 0, prev = null;
    for (let i = 0; i < 240; i++) { w.advance(1 / 60, NOIN); const f = w.a, P = f.body(), cur = ['shinF', 'shinB'].map(id => [...P[id]]), on = f.feet.map(x => x && x.t >= 1);
      if (prev) cur.forEach((p, j) => { if (p[1] > f.groundY - 12 && prev.p[j][1] > f.groundY - 12 && (!${plant} || on[j] && prev.on[j])) slide += Math.abs(p[0] - prev.p[j][0]); });
      steps += f.feet.filter(x => x && x.t > 0 && x.t < 1).length > 0 && !prev?.stepping; prev = { p: cur, on, stepping: f.feet.some(x => x && x.t > 0 && x.t < 1) }; }
    const h = w.stateHash(); w.rewind(60); for (let i = 0; i < 60; i++) w.advance(1 / 60, NOIN);
    return { slide, steps, same: w.stateHash() === h }; })()`);
  const off = r(false), on = r(true);
  assert.ok(off.slide > 500, 'off: feet slide ' + off.slide), assert.ok(on.slide < off.slide / 10, 'on: planted ' + on.slide);
  assert.ok(on.steps >= 3, 'steps ' + on.steps), assert.ok(on.same, 'rewinds to the same state');
});

test('rewind after a long fight starts from a checkpoint, not from the start', () => {
  const r = json(`(() => { const w = new World(SCENARIOS['ai vs ai'], { health: 1e6 }, 3, [CHARS.stick, CHARS.sneeko]); w.loop = false;
    for (let i = 0; i < 7200; i++) w.advance(1 / 60, NOIN);
    let steps = 0; const adv = w.advance; w.advance = (...a) => (steps++, adv.apply(w, a)); w.rewind(30); return { steps, n: w.log.length, cps: w.checkpoints.length }; })()`);
  assert.equal(r.n, 7170), assert.equal(r.cps, 66); // the last 60 + one per 10 s before them
  assert.ok(r.steps < 60, 'replays ' + r.steps + ' frames, not the whole fight'); // frames counted, not milliseconds: no wall clock, never flaky
});

test('two weapon strikes that meet clash: no hit, both recoil; with clash off the first one lands', () => {
  const r = clash => json(`(() => { const w = new World(SCENARIOS['weapon clash'], { clash: '${clash}' }, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    for (let i = 0; i < 60; i++) w.advance(1 / 60, NOIN); return { c: w.clashes, h: w.hits, gap: Math.round(w.b.x - w.a.x) }; })()`);
  const on = r('weapons'), off = r('off');
  assert.equal(on.h, 0), assert.equal(on.c, 1), assert.ok(on.gap > 120, 'pushed apart ' + on.gap);
  assert.equal(off.c, 0), assert.ok(off.h >= 1);
});

test('two jabs landing on the same frame trade: both hit, whoever is first in the list', () => {
  const r = json(`(() => { const w = new World({ a: [0.3, 'punch'], b: [0.3, 'punch'], ax: 300, bx: 360, period: 2 }, { clash: 'off', health: 100 }, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    for (let i = 0; i < 60; i++) w.advance(1 / 60, NOIN); return { h: w.hits, a: w.a.hp, b: w.b.hp }; })()`);
  assert.equal(r.h, 2), assert.equal(r.a, r.b), assert.ok(r.a < 100, 'both hurt ' + r.a);
});

test('an active strike bats a thrown weapon away', () => {
  const r = clash => json(`(() => { const w = new World(SCENARIOS.deflect, { clash: '${clash}' }, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    for (let i = 0; i < 90; i++) w.advance(1 / 60, NOIN); return { c: w.clashes, h: w.hits, x: w.items[0].x }; })()`);
  const on = r('weapons'), off = r('off');
  assert.equal(on.h, 0), assert.equal(on.c, 1), assert.ok(on.x < 300, 'batted back ' + on.x);
  assert.equal(off.h, 1);
});

test('every attack, hitting a standing dummy, leaves it drawable and free again (no NaN stun)', () => {
  const bad = run(`(() => { const bad = [];
    for (const [n, m] of Object.entries(CHARS.stick.moves)) { if (!m.power || m.throw || m.counter) continue;
      const w = new World({ a: 'dummy', b: 'dummy', ax: 330, bx: 372 }, {}, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
      const b = w.b, bone = b.ch.bones[1]; b.takeHit(w.a, m, { bone, pt: b.body()[bone.id] });
      let free = false;
      for (let i = 0; i < 400 && !free; i++) { w.advance(1/60, NOIN); free = b.free && i > 2; }
      const nums = [b.x, b.y, b.hurtT, ...Object.values(b.disp), ...Object.values(b.lens)];
      if (!free || !nums.every(Number.isFinite)) bad.push(n);
    } return bad.join(' '); })()`);
  assert.equal(bad, '');
});

test('AI difficulty: throw-break rates rise with aiLevel and do not depend on the frame rate', () => {
  const rate = (lvl, dt) => run(`(() => { let held = 0, broke = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const w = new World({ a: ['punch+guard'], b: 'ai', ax: 330, bx: 372 }, { aiLevel: '${lvl}' }, seed, [CHARS.stick, CHARS.stick]); w.loop = false;
      let h = false, br = false;
      for (let t = 0; t < 1.2; t += ${dt}) { w.advance(${dt}, NOIN); h = h || !!w.b.heldBy; br = br || w.b.label === 'BREAK'; if (h && !w.b.heldBy) break; }
      if (h) { held++; if (br) broke++; }
    } return [held, broke / held]; })()`);
  const r = ['easy', 'normal', 'hard', 'expert'].map(l => rate(l, 1 / 60));
  for (const [held] of r) assert.ok(held >= 70, 'enough throws landed: ' + held);
  const p = r.map(x => x[1]);
  assert.ok(p[0] < p[1] && p[1] < p[2] && p[2] < p[3], p.join(' '));
  for (const [x, want] of p.map((x, i) => [x, [0.1, 0.35, 0.6, 0.85][i]])) assert.ok(Math.abs(x - want) < 0.2, `${x} vs ${want}`);
  assert.ok(Math.abs(rate('normal', 1 / 144)[1] - p[1]) < 0.2, 'same rate at 144 Hz');
});

test('aiStyle biases how the AI prefers to fight, separately from aiLevel: rushdown closes the distance, turtle keeps it', () => {
  const avgDist = style => run(`(() => { let total = 0, n = 0;
    for (let seed = 1; seed <= 20; seed++) { const w = new World({ a: 'ai', b: 'dummy', ax: 150, bx: 450 }, { aiStyle: '${style}' }, seed, [CHARS.stick, CHARS.stick]); w.loop = false;
      for (let i = 0; i < 300; i++) { w.advance(1 / 60, NOIN); total += Math.abs(w.b.x - w.a.x); n++; } }
    return total / n; })()`);
  const rush = avgDist('rushdown'), turtle = avgDist('turtle'), balanced = avgDist('balanced');
  assert.ok(rush < balanced && balanced < turtle, `rushdown closer, turtle farther, balanced between: ${rush} ${balanced} ${turtle}`);
});

test('move limits (over.limits, a fighter override) cap how many times a move can start; 0 bans it outright', () => {
  const r = run(`(() => {
    const press = [0.1, 'punch', 0.3, 'punch', 0.3, 'punch', 0.3, 'punch', 0.3, 'kick'];
    const w = new World({ a: press, b: 'dummy', ax: 300, bx: 400, period: 9, aover: { limits: { jab: 2, kick: 0 } } }, {}, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    for (let i = 0; i < 400; i++) w.advance(1 / 60, NOIN);
    return { jab: w.a.moveCount.jab, kick: w.a.moveCount.kick || 0, played: Object.keys(w.a.moveCount) }; })()`);
  assert.equal(r.jab, 2, `jab capped at 2: ${r.jab}`);
  assert.equal(r.kick, 0, `kick banned outright: ${r.kick}`);
  assert.ok(!r.played.includes('kick'), 'a banned move never starts: ' + r.played);
});

test('holding P+G charges a weapon throw: it flies farther and hits harder', () => {
  const go = hold => run(`(() => { const w = new World({ a: ['punch+guard'${hold ? ", { hold: 'punchHeld+guard', t: 1 }" : ''}], aw: 'dagger', b: 'dummy', ax: 150, bx: 420 }, {}, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    let it = null, hp = w.b.hp, vx = 0, charge = 0;
    for (let i = 0; i < 150; i++) { w.advance(1/60, NOIN); charge = Math.max(charge, w.a.action?.charge || 0); if (!it && w.items[0]) { it = w.items[0]; vx = Math.abs(it.vx); } }
    return { vx, dmg: hp - w.b.hp, charge, power: it?.power }; })()`);
  const tap = go(false), held = go(true);
  assert.equal(tap.charge, 0);
  assert.ok(held.charge > 0.5, 'charged ' + held.charge);
  assert.ok(held.vx > tap.vx * 1.5, `${held.vx} vs ${tap.vx}`);
  assert.ok(held.dmg > tap.dmg && tap.dmg > 0, `${held.dmg} vs ${tap.dmg}`);
});

test('inputLeniency: guard a couple of frames ahead of P still throws, not just the exact same frame; too far ahead, or long let go, it does not', () => {
  const held = seq => JSON.parse(run(`(() => { const w = new World({ a: ${JSON.stringify(seq)}, b: 'dummy', ax: 330, bx: 372 }, {}, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    let held = false; for (let i = 0; i < 60; i++) { w.advance(1/60, NOIN); held ||= !!w.b.heldBy; } return JSON.stringify({ held }); })()`));
  assert.ok(held(['guard', 1 / 60, 'punch']).held, 'guard, then punch a frame later: still a throw');
  assert.ok(!held([{ hold: 'guard', t: 0.6 }, 'punch']).held, 'guard let go well before the punch: no throw (not a negative edge)');
  assert.ok(!held(['guard', 0.5, 'punch']).held, 'guard pressed, then let go, half a second before the punch: too far, no throw');
});

test('rolls (G held + → / ←) pass through the foe untouched; teleport (↓↓ S) lands behind it; each has a switch; the motion scheme', () => {
  const go = (a, cfg = {}, b = "'dummy'") => run(`(() => { const w = new World({ a: ${a}, b: ${b}, ax: 300, bx: 380, cfg: ${JSON.stringify(cfg)} }, {}, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    const seen = new Set(), hp = w.a.hp;
    for (let i = 0; i < 90; i++) { w.advance(1/60, NOIN); const k = w.a.action && Object.keys(w.a.ch.moves).find(k => w.a.ch.moves[k] === w.a.action.m); if (k) seen.add(k); }
    return { seen: [...seen].join(' '), x: w.a.x, bx: w.b.x, hurt: hp - w.a.hp }; })()`);
  const fwd = "[{ hold: 'guard+fwd', t: 0.1 }]", back = "[{ hold: 'guard+back', t: 0.1 }]", tele = "['down', 0.05, 'down+special']";
  const r = go(fwd, {}, "[0.12, 'kick']");
  assert.match(r.seen, /rollFwd/); assert.ok(r.x > r.bx, `rolled to ${r.x}, foe at ${r.bx}`); assert.equal(r.hurt, 0);
  const rb = go(back); assert.match(rb.seen, /rollBack/); assert.ok(rb.x < 240, 'back roll to ' + rb.x);
  const t = go(tele); assert.match(t.seen, /teleport/); assert.ok(t.x > t.bx, `teleported to ${t.x}, foe at ${t.bx}`);
  assert.doesNotMatch(go(fwd, { rolls: false }).seen, /roll/);
  assert.doesNotMatch(go(tele, { teleport: false }).seen, /teleport/);
  const m = { specialScheme: 'motion' };
  assert.match(go("['down', 'down+fwd', 'fwd+special']", m).seen, /rollFwd/);
  assert.match(go("['fwd', 'down', 'down+fwd+special']", m).seen, /teleport/);
  assert.doesNotMatch(go(fwd, m).seen, /roll/);
});

test('wake-up: P / K while down gets up attacking, ← / → rolls, G held stays down up to wakeDelay; downTime; wakeUp off: a plain get-up', () => {
  const go = (b, cfg = {}) => run(`(() => { const w = new World({ a: ['down+kick'], b: ${b}, cfg: ${JSON.stringify(cfg)} }, {}, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    let up = -1, wake = '';
    for (let i = 0; i < 240; i++) { const was = w.b.kd; w.advance(1/60, NOIN);
      if (was === 'down' && !w.b.kd && up < 0) { up = i; wake = Object.keys(w.b.ch.moves).find(k => w.b.ch.moves[k] === w.b.action?.m) || ''; } }
    return { up, wake }; })()`);
  const plain = go("'dummy'");
  assert.equal(plain.wake, 'getup');
  assert.equal(go("[1.0, 'kick']").wake, 'getupAttack');
  assert.equal(go("[1.0, 'back']").wake, 'rollBack');
  assert.equal(go("[1.0, 'fwd']").wake, 'rollFwd');
  assert.equal(go("[1.0, 'kick']", { wakeUp: false }).wake, 'getup');
  const stay = go("[0.8, { hold: 'guard', t: 3 }]", { wakeDelay: 0.5 });
  assert.ok(Math.abs(stay.up - plain.up - 30) <= 2, `stayed down ${stay.up - plain.up} frames more`);
  assert.ok(Math.abs(go("'dummy'", { downTime: 1.2 }).up - plain.up - 36) <= 2);
});

test('in blockstun P guard cancels (costs health), K push blocks (the attacker slides off); G tapped just before the parry window: just guard', () => {
  const go = (b, cfg = {}) => run(`(() => { const w = new World({ a: [0.2, 'kick'], b: ${b}, cfg: ${JSON.stringify(cfg)} }, {}, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    const seen = new Set(), labels = new Set(); let bs = 0;
    for (let i = 0; i < 70; i++) { w.advance(1/60, NOIN); const k = w.b.action && Object.keys(w.b.ch.moves).find(k => w.b.ch.moves[k] === w.b.action.m); if (k) seen.add(k);
      if (w.b.labelT > 0) labels.add(w.b.label); bs = Math.max(bs, w.b.blockT); }
    return { seen: [...seen].join(' '), labels: [...labels].join(' '), hp: w.b.hp, ahp: w.a.hp, ax: w.a.x, bs }; })()`);
  const hold = go("[{ hold: 'guard', t: 2 }]"), gc = go("[{ hold: 'guard', t: 0.4 }, 'punch']"), push = go("[{ hold: 'guard', t: 0.4 }, 'kick']");
  assert.match(gc.seen, /guardCancel/); assert.ok(hold.hp - gc.hp >= 5, `paid ${hold.hp - gc.hp}`); assert.ok(gc.ahp < 100, 'the cancel hits');
  assert.match(push.seen, /pushBlock/); assert.ok(push.ax < hold.ax - 40, `pushed to ${push.ax} from ${hold.ax}`);
  assert.doesNotMatch(go("[{ hold: 'guard', t: 0.4 }, 'punch']", { guardCancel: false }).seen, /guardCancel/);
  assert.doesNotMatch(go("[{ hold: 'guard', t: 0.4 }, 'kick']", { pushBlock: false }).seen, /pushBlock/);
  assert.match(go("[{ hold: 'guard', t: 0.4 }, 'fwd+special']", { specialScheme: 'motion' }).seen, /guardCancel/);
  const just = go("[0.19, { hold: 'guard', t: 2 }]");
  assert.match(just.labels, /JUST/); assert.equal(just.hp, 100); assert.ok(hold.hp < 100, 'a plain block chips');
  assert.ok(just.bs < hold.bs * 0.7, `blockstun ${just.bs} vs ${hold.bs}`);
  assert.doesNotMatch(go("[0.19, { hold: 'guard', t: 2 }]", { justGuard: false }).labels, /JUST/);
});

test('counters by height: 7S catches highs, ← S mids, 1S lows (key catchH), each answered by its own counter; counters off; the motion scheme', () => {
  const go = (a, b, cfg = {}) => run(`(() => { const w = new World({ a: [0.3, '${a}'], b: [0.15, '${b}'], cfg: ${JSON.stringify(cfg)} }, {}, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    const seen = new Set(), labels = new Set();
    for (let i = 0; i < 70; i++) { w.advance(1/60, NOIN); const k = w.b.action && Object.keys(w.b.ch.moves).find(k => w.b.ch.moves[k] === w.b.action.m); if (k) seen.add(k);
      if (w.b.labelT > 0) labels.add(w.b.label); }
    return { seen: [...seen].join(' '), caught: labels.has('CATCH'), hp: w.b.hp }; })()`);
  const hi = go('punch', 'up+back+special');
  assert.match(hi.seen, /catchHigh/); assert.ok(hi.caught); assert.match(hi.seen, /highCounter/); assert.equal(hi.hp, 100);
  assert.ok(!go('down+kick', 'up+back+special').caught, 'the high counter lets a low through');
  const lo = go('down+kick', 'down+back+special');
  assert.match(lo.seen, /catchLow/); assert.ok(lo.caught); assert.match(lo.seen, /lowCounter/);
  assert.ok(!go('punch', 'down+back+special').caught, 'the low counter lets a high through');
  assert.ok(go('kick', 'back+special').caught, '← S still catches a mid');
  assert.ok(!go('down+kick', 'back+special').caught, '← S lets a low through');
  assert.doesNotMatch(go('punch', 'up+back+special', { counters: false }).seen, /catchHigh/);
  assert.doesNotMatch(go('down+kick', 'down+back+special', { counters: false }).seen, /catchLow/);
  assert.ok(go('down+kick', 'down+back+special', { specialScheme: 'motion' }).caught, 'motion: 1S is still the low counter');
  assert.match(go('punch', "down', 0.03, 'down+special", { specialScheme: 'motion' }).seen, /catchHigh/, 'motion: ↓↓ S is the high counter');
});

test('↑ S+G taunts; after a K.O. the survivor plays its win move and the controllers pause; taunt / winPose switches', () => {
  const go = (a, cfg = {}, n = 60) => run(`(() => { const w = new World({ a: ${a}, b: 'dummy', ax: 330, bx: 375, cfg: ${JSON.stringify(cfg)} }, {}, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    const seen = []; for (let i = 0; i < ${n} && !w.done; i++) { w.advance(1/60, NOIN); const k = w.a.action && Object.keys(w.a.ch.moves).find(k => w.a.ch.moves[k] === w.a.action.m); if (k && seen[seen.length - 1] !== k) seen.push(k); }
    return { seen: seen.join(' '), ko: w.b.ko }; })()`);
  assert.match(go("[0.2, 'up+guard+special']").seen, /taunt/);
  assert.doesNotMatch(go("[0.2, 'up+guard+special']", { taunt: false }).seen, /taunt/);
  const ko = "[0.2, 'kick', 0.9, 'kick', 0.3, 'kick']", win = go(ko, { health: 5 }, 150);
  assert.ok(win.ko); assert.match(win.seen, /^kick win$/, 'won, and the kicks after the K.O. were not played: ' + win.seen);
  assert.doesNotMatch(go(ko, { health: 5, winPose: false }, 150).seen, /win/);
});

test('air ↓ S pounces onto a fighter lying on the floor; a wallbounce hit (spin) bounces the victim back off the wall, juggle count reset', () => {
  const go = (sc, cfg = {}, n = 150) => run(`(() => { const w = new World({ ...SCENARIOS[${JSON.stringify(sc)}], cfg: ${JSON.stringify(cfg)} }, {}, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    const seen = new Set(), labels = new Set(); let down = null, xmax = 0, xmin = 9999, jug = -1;
    for (let i = 0; i < ${n}; i++) { w.advance(1/60, NOIN); const k = w.a.action && Object.keys(w.a.ch.moves).find(k => w.a.ch.moves[k] === w.a.action.m); if (k) seen.add(k);
      if (w.b.labelT > 0 && !labels.has(w.b.label)) { labels.add(w.b.label); if (w.b.label === 'WALL BOUNCE') jug = w.b.juggles; }
      if (w.b.kd === 'down' && down === null) down = w.b.hp; xmax = Math.max(xmax, w.b.x); if (jug >= 0) xmin = Math.min(xmin, w.b.x); }
    return { seen: [...seen].join(' '), labels: [...labels].join(' '), hp: w.b.hp, down, xmin, xmax, jug }; })()`);
  const p = go('pounce');
  assert.match(p.seen, /pounce/); assert.ok(p.hp < p.down, `the pounce hits the lying foe: ${p.down} → ${p.hp}`);
  assert.doesNotMatch(go('pounce', { pounce: false }).seen, /pounce/);
  const wb = go('wall bounce');
  assert.match(wb.labels, /WALL BOUNCE/); assert.equal(wb.jug, 0); assert.ok(wb.xmax - wb.xmin > 80, `bounced back ${wb.xmax - wb.xmin}px`);
  assert.ok(wb.hp < 80, 'the follow-up air kick lands: ' + wb.hp);
});

test('key events: sound, shake, after-images and the hit spark style play as keys are reached, and change nothing in the simulation', () => {
  const r = run(`(() => { const ev = { sound: 'whoosh', shake: 0.6, after: true, spark: 'slash' };
    const kick = CHAR_DEFS.stick.moves.kick, d = { ...CHAR_DEFS.stick, moves: { ...CHAR_DEFS.stick.moves, kick: { ...kick, keys: kick.keys.map(k => ({ ...k, ...ev })) } } };
    const go = ch => { const w = new World({ a: [0.1, 'kick'], b: 'dummy', ax: 330, bx: 380 }, {}, 7, [ch, CHARS.stick]); w.loop = false; const snd = [];
      w.sfx = n => snd.push(n); let tr = 0, after = 0, slash = 0;
      for (let i = 0; i < 40; i++) { w.advance(1/60, NOIN); tr = Math.max(tr, w.trauma); after = Math.max(after, w.a.after.length); slash += w.parts.filter(p => p.t === 'slash').length; }
      return { snd: snd.join(' '), tr, after, slash, hash: w.stateHash(), hp: w.b.hp }; };
    const a = go(makeCharacter(d)), b = go(CHARS.stick); return { a, b }; })()`);
  assert.match(r.a.snd, /whoosh/); assert.doesNotMatch(r.b.snd, /whoosh/); assert.match(r.b.snd, /hit|thud/, 'a hit sounds by default');
  assert.ok(r.a.tr > r.b.tr, `shake ${r.a.tr} vs ${r.b.tr}`); assert.ok(r.a.after > 0 && r.b.after === 0); assert.ok(r.a.slash > 0 && r.b.slash === 0);
  assert.equal(r.a.hash, r.b.hash); assert.ok(r.a.hp < 100);
});

test('hit flags: a move\'s hits (stand / crouch / air) skips other states; airGuard blocks in the air unless the move is noAirGuard; jugglePoints ends air combos', () => {
  const r = run(`(() => { const kick = CHAR_DEFS.stick.moves.kick;
    const withKick = p => makeCharacter({ ...CHAR_DEFS.stick, moves: { ...CHAR_DEFS.stick.moves, kick: { ...kick, ...p } } });
    const hp = (ch, b, cfg = {}, init) => { const w = new World({ a: [0.1, 'kick'], b, ax: 330, bx: 380, cfg, init }, {}, 7, [ch, CHARS.stick]); w.loop = false;
      for (let i = 0; i < 50; i++) w.advance(1/60, NOIN); return { hp: w.b.hp, blocks: w.blocks }; };
    const crouch = [{ hold: 'down', t: 2 }], air = w => { w.b.grounded = false; w.b.y = -40; w.b.vy = -500; };
    const combo = cfg => { const w = new World({ a: [0.1, 'kick', 0.3, 'kick', 0.3, 'kick'], b: 'dummy', ax: 330, bx: 375, cfg }, {}, 7, [withKick({ kd: true, knock: 20, launch: 300, juggle: 2 }), CHARS.stick]);
      w.loop = false; for (let i = 0; i < 150; i++) w.advance(1/60, NOIN); return w.hits; };
    return { crouchAll: hp(CHARS.stick, crouch).hp, crouchNo: hp(withKick({ hits: ['stand', 'air'] }), crouch).hp, standNo: hp(withKick({ hits: ['stand', 'air'] }), 'dummy').hp,
      airOff: hp(CHARS.stick, [{ hold: 'guard', t: 2 }], {}, air), airOn: hp(CHARS.stick, [{ hold: 'guard', t: 2 }], { airGuard: true }, air),
      airNo: hp(withKick({ noAirGuard: true }), [{ hold: 'guard', t: 2 }], { airGuard: true }, air),
      comboFree: combo({ chains: 'none' }), comboPool: combo({ chains: 'none', jugglePoints: 1 }), comboRoom: combo({ chains: 'none', jugglePoints: 2 }) }; })()`);
  assert.ok(r.crouchAll < 100, 'a kick hits a croucher'); assert.equal(r.crouchNo, 100, 'without crouch in hits it whiffs'); assert.ok(r.standNo < 100);
  assert.equal(r.airOff.blocks, 0); assert.ok(r.airOff.hp < 100, 'no air guard by default');
  assert.equal(r.airOn.blocks, 1, 'airGuard: blocked in the air'); assert.equal(r.airNo.blocks, 0, 'noAirGuard goes through');
  assert.ok(r.comboFree >= 2 && r.comboPool === 1, `juggle pool: ${r.comboPool} hits vs ${r.comboFree}`); assert.equal(r.comboRoom, r.comboFree, 'a pool that can pay lets it land');
});

test('a fighter lying on the floor rests on it: no joint of the lie pose hangs far above the floor (both fall modes); the OTG stomp scenario stomps', () => {
  for (const falls of ['ragdoll', 'pose']) for (const c of ['stick', 'grumbo', 'lumpo']) {
    const r = run(`(() => { const w = new World(SCENARIOS.sweep, { falls: '${falls}' }, 7, [CHARS.stick, CHARS.${c}]); w.loop = false;
      let worst = null;
      for (let i = 0; i < 200; i++) { w.advance(1/60, NOIN); const f = w.b; if (f.kd !== 'down' || f.downT > f.c('downTime') - 0.5) continue;
        const P = f.body(), low = id => f.groundY - P[id][1] - (f.ch.by[id].thick ?? BONE.thick) / 2; // the underside of the stroke
        const hip = low('waist') + P.waist[1] - P.hip[1], chest = low('chest');
        worst = Math.max(worst ?? 0, hip, chest); }
      return worst; })()`);
    assert.ok(r !== null, `${falls} ${c}: lies down`);
    assert.ok(r < 6, `${falls} ${c}: hips / chest ${r.toFixed(1)} px over the floor`);
  }
  const s = run(`(() => { const { w, seen } = fight(SCENARIOS['OTG stomp'], [CHARS.stick], 180); return { seen, hp: w.b.hp }; })()`);
  assert.ok(s.seen.includes('a:stomp'), s.seen.join(' ')), assert.ok(s.hp < 100 - 5 - 8 + 1, 'sweep + stomp landed: ' + s.hp);
});

test('a forward dash passes a foe backed against the wall (either side, either fighter dashing) and the push apart keeps both inside the walls', () => {
  const r = run(`[[100, 40, 'a'], [100, 52, 'a'], [W - 100, W - 40, 'a'], [40, 100, 'b'], [W - 40, W - 100, 'b']].map(([ax, bx, who]) => {
    const dash = [0.2, 'fwd', 0.05, 'fwd'], w = new World({ a: who === 'a' ? dash : 'dummy', b: who === 'b' ? dash : 'dummy', ax, bx }, {}, 7, [CHARS.stick]); w.loop = false;
    let out = false;
    for (let i = 0; i < 70; i++) { w.advance(1/60, NOIN); out ||= w.fighters.some(f => f.x < 40 - 0.01 || f.x > W - 40 + 0.01); }
    const d = who === 'a' ? w.a : w.b, o = who === 'a' ? w.b : w.a;
    return { who, ax, bx, crossed: Math.sign(d.x - o.x) !== Math.sign(who === 'a' ? ax - bx : bx - ax), out, dx: d.x, ox: o.x };
  })`);
  assert.ok(r.every(c => c.crossed && !c.out), JSON.stringify(r));
  // in the open a dash from afar still stops at the foe (it passes only within its first frames)
  const far = run(`(() => { const w = new World({ a: [0.2, 'fwd', 0.05, 'fwd'], b: 'dummy', ax: 200, bx: 320 }, {}, 7, [CHARS.stick]); w.loop = false;
    for (let i = 0; i < 70; i++) w.advance(1/60, NOIN); return w.a.x < w.b.x; })()`);
  assert.ok(far);
});

test('staff collision: a flying weapon hits along its whole drawn length (a staff\'s part behind the grip too); a weapon swing sweeps from its last substep, no gaps', () => {
  const r = run(`(() => { const it = { type: 'staff', x: 100, y: 50, rot: 0 }, [p, q] = itemSeg(it), w = WEAPONS.staff;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const g = new World(SCENARIOS['you vs dummy'], {}, 7, [CHARS.stick]); g.loop = false; g.a.x = 300; g.b.x = 2000; g.a.wield('staff');
    for (let i = 0; i < 20; i++) g.advance(1/60, NOIN);
    g.a.force('whirl'); for (let i = 0; i < 9; i++) g.advance(1/60, NOIN); // into the swing
    const now = g.a.strikeShapes(g.a.action.m)[0], back = [now[0][0] - 60, now[0][1] + 40], tipWas = [now[1][0] - 50, now[1][1] + 70];
    g.a.lastSegs = { weapon: [back, tipWas] }; // where the staff was a substep ago, far off
    const ss = g.a.strikeShapes(g.a.action.m).filter(s => s.id === 'weapon'), swept = ss.length;
    const chain = [[back, tipWas], ...ss.filter(s => s.sweep), ss[0]];
    let worst = 0; for (let k = 1; k < chain.length; k++) worst = Math.max(worst, ...[0, 1].map(e => Math.hypot(chain[k][e][0] - chain[k - 1][e][0], chain[k][e][1] - chain[k - 1][e][1])));
    return { len, want: w.len + w.back, worst, swept }; })()`);
  assert.ok(Math.abs(r.len - r.want) < 1e-6, JSON.stringify(r));
  assert.ok(r.swept > 1 && r.worst <= 6.5, JSON.stringify(r));
});

test('the gallery shows every move and every movement: each move cell plays its move, each motion cell reaches its state', () => {
  const r = JSON.parse(run(`(() => {
    const ms = currentChar().moves, moves = galleryMoves(), out = { missing: Object.keys(ms).filter(m => !moves.includes(m)), unplayed: [], motions: {} };
    for (const m of moves) if (!fight(galleryScen(m), null, 150).seen.includes('a:' + m)) out.unplayed.push(m);
    const ok = {
      idle: f => f.free && f.grounded && !f.action && Math.abs(f.vx) < 1,
      walk: f => f.vx * f.dir > 50, 'back walk': f => f.vx * f.dir < -50 && f.dashT <= 0,
      run: f => f.running && Math.abs(f.vx) > f.c('maxSpeed') * 1.2, dash: f => f.dashT > 0 && f.vx * f.dir > 0, 'back dash': f => f.dashT > 0 && f.vx * f.dir < 0,
      crouch: f => f.crouching, jump: f => !f.grounded && !f.vx, 'jump forward': f => !f.grounded && f.vx * f.dir > 0, flip: f => f.flip !== 0,
      'air dash': f => f.airDashT > 0, 'air dodge': f => f.dodgeT > 0, guard: f => f.guarding && !f.crouching, 'low guard': f => f.guarding && f.crouching,
      turn: f => Math.abs(f.face) < 0.5, 'hit reaction': f => f.hurtT > 0 && !f.kd && f.blockT <= 0, blockstun: f => f.blockT > 0,
      'knockdown & getup': f => f.kd === 'down', launched: f => f.kd === 'fly', dizzy: f => f.dizzyT > 0,
    };
    for (const k in MOVEMENTS) {
      const w = new World(MOVEMENTS[k][1], {}, 7); w.loop = false;
      let n = 0, all = true;
      for (let i = 0; i < 150; i++) { w.advance(1 / 60, NOIN); if (ok[k]?.(w.a)) n++; else all = false; }
      out.motions[k] = k === 'idle' ? all : n > 0;
    }
    out.unchecked = Object.keys(ok).filter(k => !MOVEMENTS[k]);
    return JSON.stringify(out);
  })()`));
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.unplayed, []);
  assert.deepEqual(r.unchecked, []);
  for (const [k, v] of Object.entries(r.motions)) assert.ok(v, k);
});

test('movement layers: a move named <state>Layer adds its offsets from its ref pose on top of the procedural pose while the state lasts, scaled by mix; nothing when idle', () => {
  const r = JSON.parse(run(`(() => {
    const out = {}, plain = makeCharacter(CHAR_DEFS.stick), id = plain.chains.spine[0][0].id, ref = plain.poses.stance;
    const key = { ...ref, [id]: ref[id] + 40 }, layer = mix => ({ ref, mix, keys: [{ d: 0.01, p: key }, { d: 1, p: key }] });
    const scen = { crouch: 'crouch', rise: 'jump', fall: 'jump', flip: 'flip', run: 'run', dash: 'dash', backDash: 'back dash', backWalk: 'back walk',
      airDash: 'air dash', guard: 'guard', hurt: 'hit reaction', tumble: 'launched', lying: 'knockdown & getup', dizzy: 'dizzy', turn: 'turn' };
    const most = (kind, s, mix = 1) => {
      const ch = makeCharacter({ ...CHAR_DEFS.stick, moves: { ...CHAR_DEFS.stick.moves, [kind + 'Layer']: layer(mix) } });
      const w = new World(MOVEMENTS[s][1], {}, 7, [ch]); w.loop = false;
      let m = 0;
      for (let i = 0; i < 150; i++) {
        w.advance(1 / 60, NOIN);
        const f = w.a, P = f.basePose(), at = f.layerAt; f.ch = plain; f.layerAt = {}; const Q = f.basePose(); f.ch = ch; f.layerAt = at;
        m = Math.max(m, Math.abs(P[id] - Q[id]));
      }
      return Math.round(m);
    };
    out.kinds = Object.keys(LAYERS); out.scen = Object.keys(scen);
    for (const k in scen) out[k] = most(k, scen[k]);
    out.half = most('crouch', 'crouch', 0.5);
    out.idle = Object.keys(scen).map(k => most(k, 'idle'));
    return JSON.stringify(out);
  })()`));
  assert.deepEqual(r.kinds, r.scen);
  for (const k of r.scen) assert.ok(r[k] >= 30 && r[k] <= 40, `${k}: ${r[k]}`);
  assert.equal(r.half, 20);
  assert.deepEqual(r.idle, r.scen.map(() => 0));
});

test('combo routes: every chain from a starter (a bound move with links, or one no move links to) to its end, with inputs, damage and frames; a loop ends the route', () => {
  const r = JSON.parse(run(`(() => {
    const ch = CHARS.stick, bound = new Set(Object.values(ch.stances[0].binds)), roots = comboRoots(ch, bound), routes = comboRoutes(ch, roots);
    const ppp = routes.find(x => x.moves.join() === 'jab,cross,uppercut'), m = ch.moves;
    const cf = n => m[n].keys.slice(0, m[n].cancel).reduce((s, k) => s + k.d * 60, 0);
    const looped = makeCharacter({ ...CHAR_DEFS.stick, moves: { ...CHAR_DEFS.stick.moves, uppercut: { ...CHAR_DEFS.stick.moves.uppercut, next: { punch: 'jab' } } } });
    const lr = comboRoutes(looped, comboRoots(looped, bound));
    return JSON.stringify({ roots, ppp, want: { damage: moveDamage(m.jab) + moveDamage(m.cross) + moveDamage(m.uppercut), frames: Math.round(cf('jab') + cf('cross') + total(m.uppercut) * 60) },
      allLinked: routes.every(x => x.moves.slice(1).every((n, i) => m[x.moves[i]].next[x.inputs[i + 1]] === n)),
      loop: lr.find(x => x.moves.join().startsWith('jab,cross,uppercut'))?.moves, ends: routes.every(x => !Object.values(m[x.moves.at(-1)].next || {}).some(n => m[n] && !x.moves.includes(n))) });
  })()`));
  assert.ok(r.roots.includes('jab') && r.roots.includes('kick'), r.roots.join());
  assert.ok(r.ppp, 'jab › cross › uppercut');
  assert.deepEqual(r.ppp.inputs.slice(1), ['punch', 'punch']);
  assert.equal(r.ppp.damage, r.want.damage);
  assert.equal(r.ppp.frames, r.want.frames);
  assert.ok(r.allLinked && r.ends);
  assert.deepEqual(r.loop, ['jab', 'cross', 'uppercut']);
});

test('directional links: P with a direction held chains into that direction\'s link (6P, 2P…, toward the foe), and into the plain P link without one', () => {
  const r = JSON.parse(run(`(() => { const w = new World({ a: [], b: [], ax: 330, bx: 400, period: 9 }, {}, 1, [CHARS.stick, CHARS.stick]), f = w.a;
    const a = { m: { cancel: 0, next: { punch: 'cross', '6P': 'elbow', '2P': 'uppercut' } }, i: 0 }, at = dirs => { f.inp = { ...NOIN, ...dirs }; return f.cancelInto(a, 'punch'); };
    return JSON.stringify([at({}), at(f.dir > 0 ? { right: true } : { left: true }), at({ down: true }), at(f.dir > 0 ? { left: true } : { right: true }), at({ up: true })]); })()`));
  assert.deepEqual(r, ['cross', 'elbow', 'uppercut', 'cross', 'cross']);
});

test('directional links on S: a direction held chains into that direction\'s special link (fwdSpecial, downSpecial…, diagonals fall back to vertical), neutral into the plain one', () => {
  const r = JSON.parse(run(`(() => { const w = new World({ a: [], b: [], ax: 330, bx: 400, period: 9 }, {}, 1, [CHARS.stick, CHARS.stick]), f = w.a;
    const a = { m: { cancel: 0, next: { special: 'uppercut', fwdSpecial: 'fireball', downSpecial: 'sweep' } }, i: 0 }, at = dirs => { f.inp = { ...NOIN, ...dirs }; return f.cancelInto(a, 'special'); };
    return JSON.stringify([at({}), at(f.dir > 0 ? { right: true } : { left: true }), at({ down: true }), at(f.dir > 0 ? { left: true } : { right: true }), at({ up: true })]); })()`));
  assert.deepEqual(r, ['uppercut', 'fireball', 'sweep', 'uppercut', 'uppercut']);
});

test('back turned, ↓ crouches without turning around: a low guard held with the back to the foe stays turned, so a low hits it', () => {
  const go = hold => JSON.parse(run(`(() => { const w = new World({ a: [0.5, 'down+kick'], b: [{ hold: '${hold}', t: 99 }], ax: 330, bx: 380, period: 9, init: w => { w.b.away = true; w.b.dir = -w.b.dir; } }, {}, 1, [CHARS.stick, CHARS.stick]);
    w.loop = false; let crouched = false; for (let i = 0; i < 60; i++) { w.advance(1/60, NOIN); crouched ||= w.b.crouching; }
    return JSON.stringify({ away: w.b.away, crouched, hits: w.hits, blocks: w.blocks }); })()`));
  for (const hold of ['down', 'down+guard']) assert.deepEqual(go(hold), { away: true, crouched: true, hits: 1, blocks: 0 }, hold);
  assert.equal(go('back').away, false, '← still turns it back');
});

test('turning moves: a turn key turns the fighter around over that key; one turn leaves its back to the foe until a direction or a move, two make a full spin', () => {
  const go = (a, n = 70, cfg = {}) => JSON.parse(run(`(() => { const w = new World({ a: ${a}, b: 'dummy', ax: 330, bx: 385, cfg: ${JSON.stringify(cfg)} }, {}, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    let minFace = 1; const seen = new Set();
    for (let i = 0; i < ${n}; i++) { w.advance(1/60, NOIN); minFace = Math.min(minFace, w.a.face); const k = w.a.action && Object.keys(w.a.ch.moves).find(k => w.a.ch.moves[k] === w.a.action.m); if (k) seen.add(k); }
    return JSON.stringify({ away: w.a.away, dir: w.a.dir, face: w.a.face, minFace, seen: [...seen].join(' '), hp: w.b.hp, bhp: w.b.c('health') }); })()`));
  // the turnaround: back turned (facing away from the foe) once it ends, and it stays so while idle
  const t = go("[0.1, '@turnBack']");
  assert.equal(t.away, true); assert.equal(t.dir, -1); assert.ok(t.face < -0.99, 'turned: ' + t.face);
  // ←/→/↑ held turns it back; so does starting a move without turn keys (it faces the foe for it)
  assert.deepEqual([go("[0.1, '@turnBack', 0.8, { hold: 'back', t: 0.1 }]").away, go("[0.1, '@turnBack', 0.8, { hold: 'back', t: 0.1 }]").dir], [false, 1]);
  const j = go("[0.1, '@turnBack', 0.8, 'punch']", 100);
  assert.match(j.seen, /jab/); assert.equal(j.away, false); assert.equal(j.dir, 1);
  // a spinning kick (two turn keys): the body passes through its back and ends facing the foe, and it lands
  for (const m of ['spin', 'turnKick', 'spinKick']) {
    const s = go(`[0.1, '@${m}']`, 80);
    assert.ok(s.minFace < -0.5, `${m} turns: ${s.minFace}`); assert.equal(s.dir, 1, m); assert.equal(s.away, false, m); assert.ok(s.hp < s.bhp, `${m} hits`);
  }
  // the turnaround is 9S (both schemes) while its switch is on, else 9S is the up special
  const pick = cfg => run(`(() => { const w = new World({ a: 'dummy', b: 'dummy', ax: 330, bx: 420, cfg: ${JSON.stringify(cfg)} }, {}, 7, [CHARS.stick, CHARS.stick]);
    w.a.inp = { ...NOIN, up: true, right: true }; return w.a.pick('special'); })()`);
  assert.equal(pick({}), 'turnBack'); assert.equal(pick({ specialScheme: 'motion' }), 'turnBack'); assert.equal(pick({ turnBack: false }), 'jumpKick');
});

test('a back throw (← P+G) swings the victim to the other side: it lands behind the thrower, and slides there instead of jumping', () => {
  const pick = run(`(() => { const w = new World({ a: 'dummy', b: 'dummy', ax: 330, bx: 420 }, {}, 7, [CHARS.stick, CHARS.stick]);
    w.a.inp = { ...NOIN, left: true, guard: true }; const back = w.a.pick('throw'); w.a.inp = { ...NOIN, guard: true }; return [back, w.a.pick('throw')]; })()`);
  assert.deepEqual(JSON.parse(JSON.stringify(pick)), ['backGrab', 'grab']);
  const go = m => JSON.parse(run(`(() => { const w = new World({ a: [0.1, '@${m}'], b: 'dummy', ax: 330, bx: 372 }, {}, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
    let jump = 0, x = w.b.x, held = false;
    for (let i = 0; i < 150; i++) { w.advance(1/60, NOIN); if (w.b.heldBy) { held = true; jump = Math.max(jump, Math.abs(w.b.x - x)); } x = w.b.x; }
    return JSON.stringify({ held, jump, side: Math.sign(w.b.x - w.a.x), hurt: w.b.c('health') - w.b.hp, away: w.a.away, dir: w.a.dir }); })()`));
  const f = go('grab'), b = go('backGrab');
  assert.ok(f.held && b.held);
  assert.equal(f.side, 1, 'the toss throws forward'); assert.equal(b.side, -1, 'the back throw lands the victim behind');
  assert.ok(b.hurt > 0); assert.equal(b.away, false, 'the thrower faces its victim, not away');
  assert.ok(b.jump < 30, 'the victim slides round, it does not jump: ' + b.jump);  // the demos: ← then P+G throws behind; back turned, G does not guard the foe's jab, K turns back for the kick
  const d = JSON.parse(run(`(() => { const t = fight(SCENARIOS['back throw'], [CHARS.stick, CHARS.stick], 150), u = fight(SCENARIOS.turnaround, [CHARS.stick, CHARS.stick], 150);
    return JSON.stringify({ side: Math.sign(t.w.b.x - t.w.a.x), seen: [...t.seen, ...u.seen], hurt: u.w.a.c('health') - u.w.a.hp }); })()`));
  assert.equal(d.side, -1); assert.ok(['a:backGrab', 'a:backToss', 'a:turnBack', 'b:jab', 'a:kick'].every(k => d.seen.includes(k)), d.seen.join(' ')); assert.ok(d.hurt > 0);
});

test('armor: a hit during an armored key (the hammer wind-up) does its damage but the move goes on and lands', () => {
  const go = d => JSON.parse(run(`(() => { const w = new World({ a: ['punch'], b: [${d}, '@hammer'], ax: 330, bx: 385 }, {}, 7); w.loop = false; const L = new Set();
    for (let i = 0; i < 70; i++) { w.advance(1/60, NOIN); if (w.b.labelT > 0) L.add(w.b.label); }
    return JSON.stringify({ labels: [...L], b: w.b.hp, a: w.a.hp }); })()`));
  const r = go(0.05);
  assert.ok(r.labels.includes('ARMOR'), 'armored: ' + r.labels);
  assert.ok(r.b < 100, 'the jab still does its damage'), assert.ok(r.a < 100, 'the hammer lands anyway');
  assert.ok(!go(0.02).labels.includes('ARMOR'), 'hit after the wind-up: no armor');
});

test('posed falls (falls: pose): a wallbounce hit bounces off the wall, G just before landing techs, and air recovery', () => {
  const labels = sc => run(`(() => { const w = new World({ ...SCENARIOS[${JSON.stringify(sc)}], cfg: { falls: 'pose' } }, {}, 7); w.loop = false; const L = new Set();
    for (let i = 0; i < 150; i++) { w.advance(1/60, NOIN); if (w.b.labelT > 0) L.add(w.b.label); } return [...L].join(' '); })()`);
  assert.match(labels('wall bounce'), /WALL BOUNCE/);
  assert.match(labels('tech'), /TECH/);
  assert.match(labels('air recover'), /RECOVER/);
});

test('the damp filter: the drawn pose catches the keyframed one at dampRate, slower with a lower rate', () => {
  const lag = rate => +run(`(() => { const w = new World(SCENARIOS['J,J,J'], { filter: 'damp', dampRate: ${rate} }, 7); w.loop = false; let lag = 0;
    for (let i = 0; i < 90; i++) { w.advance(1/60, NOIN); const f = w.a; for (const j of f.ch.ids) { if (!isFinite(f.disp[j])) return NaN; lag += Math.abs(f.disp[j] - f.target[j]); } }
    return lag; })()`);
  const fast = lag(50), slow = lag(5);
  assert.ok(isFinite(fast) && isFinite(slow), 'the pose stays finite');
  assert.ok(slow > fast * 2, `a low rate lags more: ${slow.toFixed(0)} vs ${fast.toFixed(0)}`);
});

test('the replay dummy plays back a recorded tape, mirrored to its own facing; a key macro presses its steps over the held keys', () => {
  const r = JSON.parse(run(`(() => {
    const rec = new World(SCENARIOS['you vs dummy'], {}, 7); rec.loop = false; rec.tape = [];
    for (let i = 0; i < 60; i++) rec.advance(1/60, { ...NOIN, right: i < 20, punch: i === 30 });
    const fwd = rec.tape.filter(e => e.fwd).length, punches = rec.tape.filter(e => e.punch).length;
    const play = new World({ a: 'dummy', b: { tape: rec.tape }, ax: 300, bx: 500 }, {}, 7); play.loop = false; const x0 = play.b.x; let jab = false;
    for (let i = 0; i < 60; i++) { play.advance(1/60, NOIN); jab ||= play.b.action?.m === play.b.ch.moves.jab; }
    const mac = new World(SCENARIOS['you vs dummy'], {}, 7); mac.loop = false; mac.macro = new Script(['punch']); let mjab = false;
    for (let i = 0; i < 30; i++) { mac.advance(1/60, NOIN); mjab ||= mac.a.action?.m === mac.a.ch.moves.jab; }
    return JSON.stringify({ fwd, punches, moved: x0 - play.b.x, jab, mjab, macro: mac.macro }); })()`));
  assert.ok(r.fwd >= 19 && r.punches === 1, `recorded: ${r.fwd} forward, ${r.punches} punch`);
  assert.ok(r.moved > 20, 'the dummy walks toward its foe (to the left): ' + r.moved), assert.ok(r.jab, 'and jabs');
  assert.ok(r.mjab, 'the macro jabs'), assert.equal(r.macro, null, 'and ends');
});

test('swapChar: fighters wearing an edited character switch to the new build mid-fight, others keep theirs', () => {
  const r = JSON.parse(run(`(() => { const w = new World(SCENARIOS['you vs dummy'], {}, 7, [CHARS.stick, CHARS.sneeko]); w.loop = false;
    for (let i = 0; i < 70; i++) w.advance(1/60, NOIN);
    const to = makeCharacter(JSON.parse(JSON.stringify(CHAR_DEFS.stick))); w.swapChar(CHARS.stick, to); const cps = w.checkpoints.length;
    for (let i = 0; i < 30; i++) w.advance(1/60, NOIN);
    return JSON.stringify({ a: w.a.ch0 === to, b: w.b.ch0 === CHARS.sneeko, chars: w.chars[0] === to, cps, ok: Object.values(w.a.body()).every(p => isFinite(p[0] + p[1])) }); })()`));
  assert.deepEqual(r, { a: true, b: true, chars: true, cps: 0, ok: true });
});

test('frameData counts startup / active / recovery in 60 fps frames, attacks scaled by attack speed', () => {
  const r = JSON.parse(run(`JSON.stringify({ m: frameData({ power: 1, keys: [{ d: 0.1 }, { d: 0.05, active: true }, { d: 0.2 }] }),
    fast: frameData({ power: 1, keys: [{ d: 0.1 }, { d: 0.05, active: true }, { d: 0.2 }] }, 2), still: frameData({ keys: [{ d: 0.5 }] }, 2) })`));
  assert.deepEqual(r.m, { startup: 6, active: 3, recovery: 12 });
  assert.deepEqual(r.fast, { startup: 3, active: 2, recovery: 6 });
  assert.deepEqual(r.still, { startup: 30, active: 0, recovery: 0 }, 'a non-attack ignores the speed');
});

test('projectiles: a shoot key fires the move\'s shot from its striking limb; it hits from range, is blocked, cancels another and is one at a time', () => {
  const go = (a, b, cfg = {}, n = 120) => JSON.parse(run(`(() => { const w = new World({ a: ${JSON.stringify(a)}, b: ${JSON.stringify(b)}, ax: 250, bx: 560, cfg: ${JSON.stringify(cfg)} }, {}, 7); w.loop = false;
    let most = 0, gap = 0, seen = 0; const hp0 = w.b.hp;
    for (let i = 0; i < ${n}; i++) { w.advance(1/60, NOIN); most = Math.max(most, w.shots.filter(s => s.owner === w.a).length); seen ||= w.shots.length;
      for (const s of w.shots) gap = Math.max(gap, Math.abs(s.x - s.owner.x)); }
    return JSON.stringify({ hit: hp0 - w.b.hp, ahp: w.a.hp, most, gap, seen, clashes: w.clashes, blocks: w.blocks, hits: w.hits, ax: w.a.x }); })()`));
  const r = go(['@fireball'], 'dummy');
  assert.equal(r.most, 1), assert.ok(r.gap > 200, 'it flies across: ' + r.gap), assert.ok(r.hit >= 6, 'and hits: ' + r.hit), assert.ok(Math.abs(r.ax - 250) < 30, 'the shooter stays put');
  assert.equal(go(['@fireball', 0.05, '@fireball'], 'dummy').most, 1, 'one shot at a time');
  const bl = go(['@fireball'], [{ hold: 'guard', t: 2 }]);
  assert.equal(bl.blocks, 1), assert.ok(bl.hit < 3, 'blocked: chip only ' + bl.hit);
  const cl = go(['@fireball'], ['@fireball']);
  assert.ok(cl.clashes >= 1, 'two shots meet and cancel'), assert.equal(cl.hit, 0), assert.equal(cl.ahp, 100);
  assert.equal(go(['@fireball'], 'dummy', { shots: false }).seen, 0, 'shots off: no projectile');
});

test('beams: a beam key holds a straight line out from the striking limb; it hits once from range, is blocked, and is one at a time', () => {
  const go = (a, b, cfg = {}, n = 60) => JSON.parse(run(`(() => { const w = new World({ a: ${JSON.stringify(a)}, b: ${JSON.stringify(b)}, ax: 250, bx: 560, cfg: ${JSON.stringify(cfg)} }, {}, 7); w.loop = false;
    let most = 0, seen = 0; const hp0 = w.b.hp;
    for (let i = 0; i < ${n}; i++) { w.advance(1/60, NOIN); most = Math.max(most, w.beams.filter(b => b.owner === w.a).length); seen ||= w.beams.length; }
    return JSON.stringify({ hit: hp0 - w.b.hp, ahp: w.a.hp, most, seen, clashes: w.clashes, blocks: w.blocks, hits: w.hits, ax: w.a.x }); })()`));
  const r = go(['@laserBeam'], 'dummy');
  assert.equal(r.most, 1), assert.ok(r.hit >= 6, 'and hits: ' + r.hit), assert.ok(Math.abs(r.ax - 250) < 30, 'the beamer stays put');
  assert.equal(go(['@laserBeam', 0.05, '@laserBeam'], 'dummy').most, 1, 'one beam at a time');
  const bl = go(['@laserBeam'], [{ hold: 'guard', t: 2 }]);
  assert.equal(bl.blocks, 1), assert.ok(bl.hit < 3, 'blocked: chip only ' + bl.hit);
  assert.equal(go(['@laserBeam'], 'dummy', { beams: false }).seen, 0, 'beams off: no beam');
});

test('chargeable moves: holding the move\'s button fires it bigger, faster and harder; a tap fires at minimum; charge.timeout caps how long it can be held', () => {
  const go = t => JSON.parse(run(`(() => {
    const ch = makeCharacter({ ...CHAR_DEFS.stick, binds: { special: 'fireball' } });
    const w = new World({ a: [${t > 0 ? `'special', { hold: 'specialHeld', t: ${t} }` : `'special'`}], b: 'dummy', ax: 250, bx: 560 }, {}, 7, [ch, CHARS.stick]); w.loop = false;
    let shot = null, charge = 0; const hp0 = w.b.hp;
    for (let i = 0; i < 300; i++) { w.advance(1/60, NOIN); charge = Math.max(charge, w.a.action?.charge || 0); if (!shot && w.shots[0]) shot = w.shots[0]; }
    return JSON.stringify({ r: shot?.r, vx: Math.abs(shot?.vx || 0), dmg: hp0 - w.b.hp, charge }); })()`));
  const tap = go(0), held = go(1), long = go(3);
  assert.equal(tap.charge, 0, 'a tap: no charge, fires at minimum');
  assert.ok(held.charge > 0.5, 'held a second: charged ' + held.charge);
  assert.ok(held.r > tap.r * 1.3 && held.vx > tap.vx * 1.3, `bigger and faster: ${held.r}/${held.vx} vs ${tap.r}/${tap.vx}`);
  assert.ok(held.dmg > tap.dmg && tap.dmg > 0, `hits harder: ${held.dmg} vs ${tap.dmg}`);
  assert.ok(long.charge <= 1.25, 'charge.timeout caps it even held well past: ' + long.charge);
  assert.ok(long.r > 0, 'it still fires once the timeout forces it');
});

test('chase jump: after a launcher hits, ↑ held jumps after the victim (press), on its own (auto), not at all (off)', () => {
  const chase = (mode, a) => JSON.parse(run(`(() => { const w = new World({ a: ${JSON.stringify(a)}, b: 'dummy', ax: 330, bx: 372, period: 9 }, { chaseJump: '${mode}' }, 7, [CHARS.stick]); w.loop = false;
    let top = 0, gap = 1e9, flew = false;
    for (let i = 0; i < 100; i++) { w.advance(1/60, NOIN); if (!w.b.grounded) flew = true;
      if (!w.a.grounded) { top = Math.min(top, w.a.y); gap = Math.min(gap, Math.hypot(w.a.x - w.b.x, w.a.y - w.b.y)); } }
    return JSON.stringify({ top, gap, flew }); })()`));
  assert.equal(run('CHARS.stick.moves.launcher.launcher'), true);
  const press = chase('press', [0.1, '@launcher', { hold: 'up', t: 0.8 }]), auto = chase('auto', [0.1, '@launcher']), off = chase('off', [0.1, '@launcher', { hold: 'up', t: 0.8 }]);
  for (const [k, r] of Object.entries({ press, auto })) { assert.ok(r.flew && r.top < -40, `${k} jumps: ${JSON.stringify(r)}`); assert.ok(r.gap < 45, `${k} reaches the victim: ${JSON.stringify(r)}`); }
  assert.equal(off.top, 0, 'off: no jump');
  assert.equal(run(`fight(SCENARIOS['chase jump'], [CHARS.stick], 150).w.hits`), 3, 'the chase jump scenario: launcher, air P, air K');
});

test('move checks: each target column says what may happen (guard blocks from the front, highs pass over a crouch, only otg hits the floor) and stick\'s jab passes every column', () => {
  const ok = (mv, s, facing = 'toward', dist = 'near') => run(`allowed(CHARS.stick.moves.${mv}, CHECK_COLS.find(c => c.s === '${s}' && c.facing === '${facing}' && c.dist === '${dist}'), { otg: 'flagged' }).ok.join()`);
  assert.equal(run('CHECK_COLS.length'), 28, '7 states × toward / away × near / far');
  assert.equal(ok('jab', 'stand'), 'hit', 'its own setup must connect');
  assert.equal(ok('jab', 'stand', 'toward', 'far'), 'hit,whiff');
  assert.equal(ok('cross', 'guard'), 'block,whiff', 'a guard blocks a mid from the front');
  assert.equal(ok('cross', 'guard', 'away'), 'hit,whiff', 'not from behind');
  assert.equal(ok('sweep', 'low'), 'block,whiff', 'a low guard blocks a low');
  assert.equal(ok('sweep', 'guard'), 'hit,whiff', 'a standing guard does not');
  assert.equal(ok('jab', 'down'), 'whiff', 'the floor: otg moves only');
  assert.equal(run("CHARS.stick.moves.jab.height"), 'high');
  assert.equal(ok('jab', 'crouch'), 'whiff', 'a high passes over a crouch');
  // stick's jab against itself: every column passes, and recovers in about a second
  const res = run(`CHECK_COLS.map(c => runCheck(CHARS.stick, CHARS.stick, 'jab', c))`);
  for (const [i, r] of res.entries()) assert.equal(r.issues.length, 0, `column ${i}: ${JSON.stringify(r)}`);
  assert.equal(res[0].out, 'hit'); assert.equal(res.find((r, i) => run(`CHECK_COLS[${i}].s`) === 'guard' && i % 4 === 0).out, 'block');
  assert.ok(res.every(r => r.t < 4), 'each settles inside its limit (a knockdown included)');
});

test('move checks: a move whose hits leave out a state must whiff it, and a jab that cannot reach its own setup is flagged', () => {
  const r = JSON.parse(run(`(() => { const j = CHARS.stick.moves.jab, ch = { ...CHARS.stick, moves: { ...CHARS.stick.moves, dud: { ...j, hit: [] } } };
    return JSON.stringify({ air: allowed({ ...j, hits: ['air'] }, CHECK_COLS[0]), dud: runCheck(ch, CHARS.stick, 'dud', CHECK_COLS[0]) }); })()`));
  assert.deepEqual(r.air.ok, ['whiff']), assert.match(r.air.why, /leave out stand/);
  assert.equal(r.dud.out, 'whiff'), assert.deepEqual(r.dud.issues, ['whiffs its own setup: a standing target in reach']);
});
