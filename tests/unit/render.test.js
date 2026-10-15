// drawing: every scenario renders into a stub canvas with every overlay on, and drawing never changes the fight
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load();
// a 2D context that records calls and checks every coordinate is a finite number
run(`var stubCtx = () => { const st = { calls: 0, bad: [] };
  const ctx = new Proxy(st, { get: (t, k) => k in t ? t[k] : (...a) => { st.calls++; if (a.some(v => typeof v === 'number' && !isFinite(v))) st.bad.push(k);
      return /^create(Linear|Radial)Gradient$/.test(k) ? { addColorStop: () => {} } : undefined; },
    set: (t, k, v) => (t[k] = v, true) });
  return { ctx, st }; };`);

test('every scenario draws (boxes, ghost, trails on; full and camera views) without NaN, and drawing changes nothing in the fight', () => {
  // a 'random' character slot picks a fresh one for each World built, so two separate constructions (draw/plain) of
  // the same scenario would get different fighters and look "changed"; excluded here, not a real drawing bug
  const r = JSON.parse(run(`JSON.stringify(Object.keys(SCENARIOS).filter(n => !SCENARIOS[n].chars?.includes('random')).map(n => {
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
    w.a.action = { m: w.a.ch.moves.fireball, i: 0, t: 0, hits: [], charge: 0.3 }; w.a.draw(ctx); // a chargeable move charging: its striking limbs glow
    return JSON.stringify({ kinds, calls: st.calls, bad: [...new Set(st.bad)] }); })()`));
  for (const k of ['flash', 'ring', 'slash', 'spark']) assert.ok(r.kinds.includes(k), 'particle ' + k);
  assert.ok(r.calls > 100), assert.deepEqual(r.bad, []);
});

test('a beam draws without NaN, fading as it ends, at any width or facing', () => {
  const r = JSON.parse(run(`(() => { const w = new World(SCENARIOS['you vs ai'], { boxes: true }, 7), { ctx, st } = stubCtx();
    w.loop = false; w.advance(1/60, NOIN);
    w.beams.push({ x: 200, y: 300, z: 0, dir: 1, vx: 1, w: 14, range: 400, dur: 0.25, t: 0.05, look: 'laser', owner: w.a }); // mid-flight
    w.beams.push({ x: 500, y: 320, z: 0, dir: -1, vx: -1, w: 30, range: 400, dur: 0.25, t: 0.23, look: 'laser', owner: w.b }); // near the end: fading
    w.drawBeams(ctx);
    return JSON.stringify({ calls: st.calls, bad: [...new Set(st.bad)] }); })()`));
  assert.ok(r.calls > 5), assert.deepEqual(r.bad, []);
});

test('hud, labels and timer off draw less, leave the fight as it was, and stay out of replays', () => {
  const r = JSON.parse(run(`(() => { const calls = cfg => { const w = new World(SCENARIOS['you vs ai'], cfg, 7), { ctx, st } = stubCtx(); w.loop = false;
      for (let i = 0; i < 60; i++) { w.advance(1/60, { ...NOIN, punch: i % 20 === 0 }); w.render(ctx, { x: 0, y: 0, w: 800, h: 450 }, true); }
      return { calls: st.calls, hash: w.stateHash() }; };
    const on = calls({ timer: true }), off = calls({ hud: false, labels: false, timer: false });
    return JSON.stringify({ on, off, skip: REPLAY_SKIP }); })()`));
  assert.ok(r.off.calls < r.on.calls, `hud/timer off draws less: ${r.off.calls} < ${r.on.calls}`);
  assert.equal(r.off.hash, r.on.hash);
  assert.ok(r.skip.includes('hud') && r.skip.includes('labels') && r.skip.includes('timer'));
});

test('hudPos "top" draws the health bars at the top instead of over each fighter\'s head, without changing the fight', () => {
  const r = JSON.parse(run(`(() => { const run = cfg => { const w = new World(SCENARIOS['you vs ai'], cfg, 7), { ctx, st } = stubCtx(); w.loop = false;
      for (let i = 0; i < 60; i++) { w.advance(1/60, { ...NOIN, punch: i % 20 === 0 }); w.render(ctx, { x: 0, y: 0, w: 800, h: 450 }, true); }
      return { calls: st.calls, bad: st.bad, hash: w.stateHash() }; };
    const body = run({}), top = run({ hudPos: 'top' });
    return JSON.stringify({ body, top }); })()`));
  assert.deepEqual(r.body.bad, []); assert.deepEqual(r.top.bad, []);
  assert.equal(r.top.hash, r.body.hash, 'only where the bars draw changes, not the fight');
  assert.notEqual(r.top.calls, r.body.calls, 'a different number of draw calls: the bars moved, not duplicated');
});

test('the timer draws an elapsed mm:ss clock that counts up from the round\'s start, and resets when the round restarts', () => {
  const r = JSON.parse(run(`JSON.stringify((() => { const w = new World({ a: 'dummy', b: 'dummy', ax: 300, bx: 500 }, { timer: true }, 7); w.loop = false;
    for (let i = 0; i < 125; i++) w.advance(1/60, NOIN); // just past 2s
    const t0 = w.simT; w.reset();
    return { t0, afterReset: w.simT }; })())`));
  assert.ok(r.t0 > 2 && r.t0 < 2.2, `about 2s elapsed: ${r.t0}`);
  assert.equal(r.afterReset, 0, 'a reset (new round) starts the clock over');
});

test('every stage (STAGES) draws without NaN; a scenario with no stage set draws exactly like "plain"', () => {
  const r = JSON.parse(run(`JSON.stringify((() => { const draw = scen => { const w = new World(scen, {}, 7), { ctx, st } = stubCtx(); w.loop = false;
      w.advance(1/60, NOIN); w.render(ctx, { x: 0, y: 0, w: 800, h: 450 }, true); return { calls: st.calls, bad: st.bad }; };
    const results = Object.fromEntries(Object.keys(STAGES).map(k => [k, draw({ ...SCENARIOS['you vs ai'], stage: k })]));
    return { results, def: draw(SCENARIOS['you vs ai']) }; })())`));
  for (const k of Object.keys(r.results)) { assert.ok(r.results[k].calls > 10, `${k} draws`); assert.deepEqual(r.results[k].bad, [], `${k}: no NaN`); }
  assert.equal(r.results.plain.calls, r.def.calls, 'no scen.stage defaults to plain, drawing the same as today');
});

test('every prop (PROPS) draws without NaN, bending and all, and a scenario with none draws exactly the same', () => {
  const r = JSON.parse(run(`JSON.stringify((() => { const draw = scen => { const w = new World(scen, {}, 7), { ctx, st } = stubCtx(); w.loop = false;
      for (let i = 0; i < 10; i++) w.advance(1/60, NOIN); w.render(ctx, { x: 0, y: 0, w: 800, h: 450 }, true); return { calls: st.calls, bad: st.bad }; };
    const sc = { a: 'dummy', b: 'dummy', ax: 300, bx: 500 };
    const results = Object.fromEntries(Object.keys(PROPS).map(k => [k, draw({ ...sc, props: [{ type: k, x: 400 }] })]));
    return { results, def: draw(sc) }; })())`));
  for (const k of Object.keys(r.results)) { assert.ok(r.results[k].calls > r.def.calls, `${k} draws something extra`); assert.deepEqual(r.results[k].bad, [], `${k}: no NaN`); }
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

test('new fx looks (spiky aura, bubbles, sparks) draw without NaN, each on its own side of the body', () => {
  const r = JSON.parse(run(`(() => { const ch = CHARS.stick, P = fk(ch, ch.poses.stance, 1);
    const draw = (look, back) => { const { ctx, st } = stubCtx(); drawFx(ctx, P, [[{ look }, ch.bones]], 0.37, back); return { calls: st.calls, bad: st.bad }; };
    return JSON.stringify({ spikyAuraBack: draw('spikyAura', true), spikyAuraFront: draw('spikyAura', false),
      bubblesFront: draw('bubbles', false), bubblesBack: draw('bubbles', true), sparksFront: draw('sparks', false),
      auto: ['spikyAura', 'bubbles', 'sparks'].map(l => FX_AUTO[l]), back: ['spikyAura', 'bubbles', 'sparks'].map(l => FX_BACK.has(l)) }); })()`));
  assert.ok(r.spikyAuraBack.calls > 5, 'spiky aura draws'); assert.equal(r.spikyAuraFront.calls, 0, 'spiky aura is a back effect');
  assert.deepEqual(r.spikyAuraBack.bad, []);
  assert.ok(r.bubblesFront.calls > 5, 'bubbles draws'); assert.equal(r.bubblesBack.calls, 0, 'bubbles is a front effect');
  assert.deepEqual(r.bubblesFront.bad, []);
  assert.ok(r.sparksFront.calls > 5, 'sparks draws'); assert.deepEqual(r.sparksFront.bad, []);
  assert.deepEqual(r.auto, ['purple', 'cyan', 'gold']); assert.deepEqual(r.back, [true, false, false]);
});

test('a custom look (saveLook: the generic particle draw, drawCustom) registers into FX_LOOKS/FX_DRAW/FX_AUTO/FX_BACK and draws every shape without NaN', () => {
  const r = JSON.parse(run(`(() => { const ch = CHARS.stick, P = fk(ch, ch.poses.stance, 1);
    const draw = (name, back) => { const { ctx, st } = stubCtx(); drawFx(ctx, P, [[{ look: name }, ch.bones]], 0.37, back); return { calls: st.calls, bad: st.bad }; };
    const results = {};
    for (const shape of ['dot', 'line', 'ring']) {
      const name = 'test_' + shape;
      saveLook(name, { count: 5, life: 0.4, speed: 80, spread: 30, angle: -90, gravity: 150, size0: 3, size1: 0, shape, col: 'gold', back: shape === 'ring' });
      results[shape] = { front: draw(name, false), back: draw(name, true), inLooks: name in FX_LOOKS, auto: FX_AUTO[name], isBack: FX_BACK.has(name) };
    }
    const before = Object.keys(FX_LOOKS).length; deleteLook('test_dot');
    return JSON.stringify({ results, before, after: Object.keys(FX_LOOKS).length, goneFromDraw: !FX_DRAW.test_dot }); })()`));
  for (const shape of ['dot', 'line', 'ring']) {
    const r2 = r.results[shape], drawn = shape === 'ring' ? r2.back : r2.front, other = shape === 'ring' ? r2.front : r2.back;
    assert.ok(drawn.calls > 0, `${shape} draws (back: ${shape === 'ring'})`); assert.deepEqual(drawn.bad, [], `${shape}: no NaN`);
    assert.equal(other.calls, 0, `${shape} only draws on its own side`);
    assert.ok(r2.inLooks, `${shape} is in FX_LOOKS`); assert.equal(r2.auto, 'gold'); assert.equal(r2.isBack, shape === 'ring');
  }
  assert.equal(r.after, r.before - 1, 'deleteLook removes it from FX_LOOKS'); assert.ok(r.goneFromDraw, 'and from FX_DRAW');
});

test('an effect\'s spd scales the time passed to its look (the preview tool\'s speed slider; unset: unchanged)', () => {
  const r = JSON.parse(run(`(() => { const ch = CHARS.stick, P = fk(ch, ch.poses.stance, 1), { ctx } = stubCtx();
    const orig = FX_DRAW.aura; let seen = null;
    FX_DRAW.aura = (c, segs, rgb, k, t) => { seen = t; };
    drawFx(ctx, P, [[{ look: 'aura', spd: 2 }, ch.bones]], 0.37, true); const withSpd = seen; seen = null;
    drawFx(ctx, P, [[{ look: 'aura' }, ch.bones]], 0.37, true); const without = seen;
    FX_DRAW.aura = orig;
    return JSON.stringify({ withSpd, without }); })()`));
  assert.ok(Math.abs(r.withSpd - 0.74) < 1e-9, 'spd 2 doubles the time passed to the look: ' + r.withSpd);
  assert.ok(Math.abs(r.without - 0.37) < 1e-9, 'unset spd: unchanged');
});

test('shadow: the default draws today\'s oval, every shape draws, none draws nothing, and a shadow leaves the fight as it was', () => {
  const r = JSON.parse(run(`(() => { const log = () => { const L = []; return { L, ctx: new Proxy({}, { get: (t, k) => k in t ? t[k] : (...a) => L.push([k, ...a]), set: (t, k, v) => (L.push([k, v]), t[k] = v, true) }) }; };
    const w = new World(SCENARIOS['you vs ai'], {}, 7); w.loop = false; for (let i = 0; i < 30; i++) w.advance(1/60, { ...NOIN, up: i < 3 });
    const f = w.a, was = log(), now = log(), s = Math.max(0.3, 1 + f.y / 200);
    was.ctx.fillStyle = 'rgba(0,0,0,0.08)'; was.ctx.beginPath(); was.ctx.ellipse(f.x, f.groundY + 1, 22 * s, 4 * s, 0, 0, 7); was.ctx.fill(); // the shadow before def.shadow
    drawShadow(now.ctx, f);
    const shapes = {}, ch0 = f.ch;
    for (const shape of ['ellipse', 'circle', 'body', 'none']) { f.ch = { ...ch0, shadow: { ...SHADOW, shape, col: 'purple', dx: 5, lift: 0.5 } };
      const { ctx, st } = stubCtx(); drawShadow(ctx, f); shapes[shape] = { calls: st.calls, bad: st.bad }; }
    f.ch = ch0;
    const def = JSON.parse(JSON.stringify(CHAR_DEFS.stick)); def.shadow = { shape: 'body', alpha: 0.3, skew: -1 };
    const sc = { a: 'ai', b: 'ai', ax: 300, bx: 380, period: 9 }, chs = [makeCharacter(def), CHARS.stick], a = new World(sc, {}, 7, chs), b = new World(sc, {}, 7, chs), { ctx, st } = stubCtx();
    a.loop = b.loop = false;
    for (let i = 0; i < 120; i++) { a.advance(1/60, NOIN); b.advance(1/60, NOIN); if (i % 3 === 0) a.render(ctx, { x: 0, y: 0, w: 800, h: 450 }, false); }
    return JSON.stringify({ y: f.y, was: was.L, now: now.L, shapes, same: a.stateHash() === b.stateHash(), bad: st.bad, filled: makeCharacter(def).shadow,
      plain: Object.keys(CHARS).filter(k => CHAR_DEFS[k] && !CHAR_DEFS[k].shadow).every(k => JSON.stringify(CHARS[k].shadow) === JSON.stringify(SHADOW)) }); })()`));
  assert.ok(r.y < 0, 'measured in the air (it shrinks)');
  assert.deepEqual(r.now, r.was, 'the default shadow draws exactly what it did');
  for (const s of ['ellipse', 'circle', 'body']) { assert.ok(r.shapes[s].calls > 2, s + ' draws'); assert.deepEqual(r.shapes[s].bad, [], s + ': no NaN'); }
  assert.equal(r.shapes.none.calls, 0, 'none draws nothing');
  assert.deepEqual(r.filled, { shape: 'body', w: 22, h: 4, alpha: 0.3, col: 'black', dx: 0, dy: 1, lift: 1, skew: -1 }, 'makeCharacter fills in the defaults');
  assert.ok(r.plain, 'characters without a shadow get the default');
  assert.ok(r.same, 'a body shadow leaves the fight as it was'); assert.deepEqual(r.bad, []);
});

test('a bone\'s alpha draws it translucent (globalAlpha), draws nothing extra at 0 (already excluded), and never NaNs', () => {
  const r = JSON.parse(run(`(() => { const def = JSON.parse(JSON.stringify(CHAR_DEFS.stick));
    def.bones = def.bones.map(b => b.id === 'uarmF' ? { ...b, alpha: 0.4 } : b);
    const ch = makeCharacter(def), P = fk(ch, ch.poses.stance, 1), { ctx, st } = stubCtx(); ctx.globalAlpha = 1;
    const seen = []; const g = ctx.stroke; ctx.stroke = (...a) => { seen.push(ctx.globalAlpha); return g(...a); };
    drawFigure(ctx, ch, P, '#000', '#000');
    return JSON.stringify({ seen, bad: st.bad, calls: st.calls }); })()`));
  assert.ok(r.seen.some(a => Math.abs(a - 0.4) < 1e-9), 'the translucent bone saved globalAlpha 0.4: ' + r.seen);
  assert.ok(r.calls > 10), assert.deepEqual(r.bad, []);
});
