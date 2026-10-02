// drawing: every scenario renders into a stub canvas with every overlay on, and drawing never changes the fight
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load();
// a 2D context that records calls and checks every coordinate is a finite number
run(`var stubCtx = () => { const st = { calls: 0, bad: [] };
  const ctx = new Proxy(st, { get: (t, k) => k in t ? t[k] : (...a) => { st.calls++; if (a.some(v => typeof v === 'number' && !isFinite(v))) st.bad.push(k); },
    set: (t, k, v) => (t[k] = v, true) });
  return { ctx, st }; };`);

test('every scenario draws (boxes, ghost, trails on; full and camera views) without NaN, and drawing changes nothing in the fight', () => {
  const r = JSON.parse(run(`JSON.stringify(Object.keys(SCENARIOS).map(n => {
    const draw = new World(SCENARIOS[n], { boxes: true, ghost: true, trail: 4 }, 7), plain = new World(SCENARIOS[n], {}, 7), { ctx, st } = stubCtx();
    draw.loop = plain.loop = false;
    for (let i = 0; i < 240; i++) { const inp = { ...NOIN, right: i % 60 < 30, punch: i % 20 === 0, kick: i % 31 === 0 };
      draw.advance(1/60, inp); plain.advance(1/60, inp);
      if (i % 4 === 0) draw.render(ctx, { x: 0, y: 0, w: 800, h: 450 }, i % 8 === 0); }
    return { n, calls: st.calls, bad: [...new Set(st.bad)], same: draw.stateHash() === plain.stateHash() }; }))`));
  for (const s of r) {
    assert.ok(s.calls > 1000, `${s.n} draws: ${s.calls} calls`);
    assert.deepEqual(s.bad, [], `${s.n}: no NaN coordinates`);
    assert.ok(s.same, `${s.n}: drawing leaves the fight as it was`);
  }
});

test('flying and lying weapons, sparks, rings and dust draw; a flying weapon shows its hitbox with boxes on', () => {
  const r = JSON.parse(run(`(() => { const w = new World(SCENARIOS['weapon throw'], { boxes: true }, 7), { ctx, st } = stubCtx(), kinds = new Set(); let flying = 0;
    w.loop = false;
    for (let i = 0; i < 150; i++) { w.advance(1/60, NOIN); w.parts.forEach(p => kinds.add(p.t)); if (w.items.some(it => it.live)) flying++;
      w.drawItems(ctx); w.drawParticles(ctx); }
    return JSON.stringify({ flying, kinds: [...kinds], bad: st.bad }); })()`));
  assert.ok(r.flying > 5, 'the dagger flies');
  assert.ok(r.kinds.length >= 2, 'particles: ' + r.kinds);
  assert.deepEqual(r.bad, []);
});

test('every projectile look, styled spark and glow draws without NaN', () => {
  const r = JSON.parse(run(`(() => { const w = new World(SCENARIOS['you vs ai'], { boxes: true, weapon: 'dagger', weaponStart: 'held' }, 7), { ctx, st } = stubCtx();
    w.loop = false; w.advance(1/60, NOIN);
    const looks = ['ki', 'fire', 'dark', 'wave', 'star'];
    looks.forEach((look, i) => w.shots.push({ x: 200 + i * 80, y: 300, z: 0, r: 12, t: 0.1, dir: i % 2 ? 1 : -1, look }));
    w.drawShots(ctx);
    for (const s of ['heavy', 'slash', 'blunt']) w.spark(s, [400, 300], 0, 1);
    const kinds = [...new Set(w.parts.map(p => p.t))]; w.drawParticles(ctx);
    w.a.force('charge'); w.a.draw(ctx); // unblockable frames ahead: the striking limbs glow
    w.b.action = { m: w.b.ch.moves.stance || Object.values(w.b.ch.moves)[0], i: 0, t: 0, hits: [], charge: 0.2 }; w.b.draw(ctx); // a throw charging
    return JSON.stringify({ kinds, calls: st.calls, bad: [...new Set(st.bad)] }); })()`));
  for (const k of ['flash', 'ring', 'slash', 'spark']) assert.ok(r.kinds.includes(k), 'particle ' + k);
  assert.ok(r.calls > 100), assert.deepEqual(r.bad, []);
});
