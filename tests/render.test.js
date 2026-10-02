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

test('hud and labels off draw less, leave the fight as it was, and stay out of replays', () => {
  const r = JSON.parse(run(`(() => { const calls = cfg => { const w = new World(SCENARIOS['you vs ai'], cfg, 7), { ctx, st } = stubCtx(); w.loop = false;
      for (let i = 0; i < 60; i++) { w.advance(1/60, { ...NOIN, punch: i % 20 === 0 }); w.render(ctx, { x: 0, y: 0, w: 800, h: 450 }, true); }
      return { calls: st.calls, hash: w.stateHash() }; };
    const on = calls({}), off = calls({ hud: false, labels: false });
    return JSON.stringify({ on, off, skip: REPLAY_SKIP }); })()`));
  assert.ok(r.off.calls < r.on.calls, `hud off draws less: ${r.off.calls} < ${r.on.calls}`);
  assert.equal(r.off.hash, r.on.hash);
  assert.ok(r.skip.includes('hud') && r.skip.includes('labels'));
});

test('effects: an old single effect still draws, a stack draws each, a key\'s stack replaces the move\'s, and a stacked fighter fights the same', () => {
  const r = JSON.parse(run(`(() => { const ch = CHARS.stick, jab = ch.moves.jab, draw = list => { const { ctx, st } = stubCtx(); drawFx(ctx, fk(ch, ch.poses.stance, 1), list, 0.3, false); drawFx(ctx, fk(ch, ch.poses.stance, 1), list, 0.3, true); return st.calls; };
    const one = { ...jab, fx: { look: 'fire' } }, two = { ...jab, fx: [{ look: 'fire' }, { look: 'lightning', on: 'body', col: 'red', size: 2 }] };
    const keyed = { ...two, keys: jab.keys.map((k, i) => i ? { ...k, fx: i === 1 ? [{ look: 'aura' }, { look: 'smoke' }] : false } : k) };
    const many = { ...jab, fx: Array(9).fill({ look: 'aura' }) };
    const def = JSON.parse(JSON.stringify(CHAR_DEFS.stick)); def.bones.find(b => b.id === 'head').fx = [{ look: 'aura', col: 'gold' }, { look: 'smoke' }]; def.moves.jab.fx = two.fx;
    const sc = { a: 'ai', b: 'ai', ax: 300, bx: 380, period: 9 }, chs = [makeCharacter(def), CHARS.stick], a = new World(sc, {}, 7, chs), b = new World(sc, {}, 7, chs), { ctx, st } = stubCtx();
    a.loop = b.loop = false;
    for (let i = 0; i < 240; i++) { a.advance(1/60, NOIN); b.advance(1/60, NOIN); if (i % 3 === 0) a.render(ctx, { x: 0, y: 0, w: 800, h: 450 }, false); }
    return JSON.stringify({ one: fxNow(ch, { m: one, i: 0 }).length, oneCalls: draw(fxNow(ch, { m: one, i: 0 })), two: fxNow(ch, { m: two, i: 0 }).map(([e]) => e.look),
      twoCalls: draw(fxNow(ch, { m: two, i: 0 })), fire: draw([fxNow(ch, { m: one, i: 0 })[0]]), light: draw([fxNow(ch, { m: two, i: 0 })[1]]),
      keyed: [0, 1, 2].map(i => fxAt(keyed, i).map(e => e.look)), many: fxNow(ch, { m: many, i: 0 }).length, none: fxNow(ch, null).length,
      bones: fxNow(chs[0], null).map(([e, bs]) => e.look + ':' + bs.map(b => b.id)), same: a.stateHash() === b.stateHash(), bad: st.bad }); })()`));
  assert.equal(r.one, 1, 'an old single effect plays'); assert.ok(r.oneCalls > 10, 'and draws');
  assert.deepEqual(r.two, ['fire', 'lightning']); assert.ok(r.fire > 0 && r.light > 0 && r.twoCalls >= r.fire + r.light - 2, `each of a stack draws: ${r.twoCalls} vs ${r.fire} + ${r.light}`);
  assert.deepEqual(r.keyed, [['fire', 'lightning'], ['aura', 'smoke'], []], 'a key\'s stack replaces the move\'s; false: none');
  assert.equal(r.many, 4, 'at most FX_MAX effects'); assert.equal(r.none, 0);
  assert.deepEqual(r.bones, ['aura:head', 'smoke:head'], 'a bone\'s stack');
  assert.ok(r.same, 'effects leave the fight as it was'); assert.deepEqual(r.bad, []);
});
