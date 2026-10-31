// the procedural walk steps evenly, the air legs move, and a stance off the floor anchor (hipH) stands its hip at a set height
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load();
const R = code => JSON.parse(run(`JSON.stringify(${code})`));
// each leg's ankle x (rig space, from its stance spot) over one walk cycle: [min, max] per leg
run(`var stepRange = (name, back, gait = {}) => { const w = new World({ a: 'dummy', b: 'dummy' }, {}, 7, [CHARS[name], CHARS.stick]), f = w.a, ch = f.ch;
  const g0 = { ...ch.gait }; Object.assign(ch.gait, gait); const R0 = fk(ch, f.st.pose, 1), out = ch.chains.leg.map(() => []);
  for (let i = 0; i < 64; i++) { f.vx = f.dir * f.c('maxSpeed') * (back ? -1 : 1); f.walkPh = i / 64 * 2 * Math.PI; const L = fk(ch, f.procPose(), 1);
    ch.chains.leg.forEach((c, j) => { const a = c[1] || c[0]; out[j].push(L[a.id][0] - R0[a.id][0]); }); }
  Object.assign(ch.gait, g0); return out.map(a => [Math.min(...a), Math.max(...a)]); };`);

test('walking, each foot steps as far forward as back, both ways, scaled by stride', () => {
  for (const back of [false, true]) for (const [lo, hi] of R(`stepRange('stick', ${back})`)) assert.ok(Math.abs(lo + hi) < 0.5, `even step: ${lo} .. ${hi}`);
  const [[lo1, hi1]] = R(`stepRange('stick', false)`), [[lo2, hi2]] = R(`stepRange('stick', false, { stride: 0.5 })`);
  assert.ok(Math.abs((hi2 - lo2) * 2 - (hi1 - lo1)) < 1, 'half the stride, half the step');
  const [[, hiB]] = R(`stepRange('stick', true, { backStride: 0.5 })`);
  assert.ok(Math.abs(hiB - hi1 * 0.5) < 1, `backStride scales the backward step: ${hiB} vs ${hi1}`);
  const [[lo3, hi3]] = R(`stepRange('stick', false, { swing: 0.3 })`);
  assert.ok(hi3 + lo3 > 5, 'swing + steps more in front');
});

test('in the air the legs keep moving (airKick), held still with it and airDrag off', () => {
  const r = R(`(() => { const w = new World({ a: 'dummy', b: 'dummy' }, {}, 7, [CHARS.stick, CHARS.stick]), f = w.a, th = f.ch.chains.leg[0][0].id;
    f.grounded = false; f.y = -80; f.vy = -200; const at = t => { f.airT = t; return f.procPose()[th]; };
    const moving = Math.abs(at(0.3) - at(0.5)); Object.assign(f.ch.gait, { airKick: 0, airDrag: 0, airReach: 0 });
    const still = Math.abs(at(0.3) - at(0.5)); Object.assign(f.ch.gait, { airKick: 1, airDrag: 1, airReach: 1 }); return { moving, still }; })()`);
  assert.ok(r.moving > 1, 'the legs cycle'); assert.ok(r.still < 1e-9, 'off: the air pose');
});

test('off the floor (hipH): the hip stands at its height, the feet may leave the floor; null: the lowest point stands on it', () => {
  const r = R(`(() => { const d = JSON.parse(JSON.stringify(CHAR_DEFS.stick)); d.stances = [{ name: 'shuffle', key: 'S+G', pose: {}, binds: {}, hipH: 70 }];
    const ch = makeCharacter(d), w = new World({ a: 'dummy', b: 'dummy' }, {}, 7, [ch, CHARS.stick]), f = w.a;
    const hipY = () => { const P = f.body(); return w.groundY - P.thighF[1] + fk(f.ch, f.disp, 1).thighF[1]; }, low = () => Math.max(...Object.values(f.body()).map(p => p[1]));
    const before = low(); f.setStance(1); f.morph = null;
    return { main: Math.round(before - w.groundY), hip: Math.round(hipY()), st: f.st.hipH, mainH: ch.stances[0].hipH }; })()`);
  assert.equal(r.st, 70); assert.equal(r.mainH, null);
  assert.ok(Math.abs(r.main) <= 4, 'main: on the floor');
  assert.equal(r.hip, 70, 'the hip 70 px up');
});

// one fighter's procPose with some state set; returns the thigh / shin angles of leg 0 and the spine's
run(`var legAt = (set, gait = {}) => { const w = new World({ a: 'dummy', b: 'dummy' }, {}, 7, [CHARS.stick, CHARS.stick]), f = w.a, ch = f.ch, c = ch.chains.leg[0];
  const g0 = { ...ch.gait }; Object.assign(ch.gait, gait); Object.assign(f, set); const P = f.procPose(); Object.assign(ch.gait, g0);
  return [P[c[0].id], P[c[1].id], P[ch.chains.spine[0][0].id]]; };`);

test('landing keeps the knees bent a moment (landBend), straight with it off', () => {
  const [, bent] = R(`legAt({ landT: 0.2, landK: 1 })`), [, flat] = R(`legAt({ landT: 0.2, landK: 1 }, { landBend: 0 })`), [, none] = R(`legAt({})`);
  assert.ok(Math.abs(bent - none) > 10, 'bent'); assert.ok(Math.abs(flat - none) < 1e-9, 'off');
});

test('past runAt the walk becomes a run: longer steps and a lean; run 0 keeps the walk', () => {
  const r = R(`(() => { const sp = k => { const w = new World({ a: 'dummy', b: 'dummy' }, {}, 7, [CHARS.stick, CHARS.stick]), f = w.a; f.vx = f.dir * f.c('maxSpeed') * 1.5; f.walkPh = Math.PI / 2;
    Object.assign(f.ch.gait, { run: k }); const L = fk(f.ch, f.procPose(), 1); Object.assign(f.ch.gait, { run: 1 }); return L[f.ch.chains.leg[0][1].id][0]; };
    return [sp(1), sp(0)]; })()`);
  assert.ok(r[0] > r[1] + 3, `the run steps further: ${r}`);
});

test('turning on the ground swings a foot through (turnStep)', () => {
  const [a] = R(`legAt({ face: 0 })`), [b] = R(`legAt({ face: 0 }, { turnStep: 0 })`);
  assert.ok(Math.abs(a - b) > 5);
});

test('the stance pose fk is cached per pose and character', () => {
  assert.ok(R(`(() => { const ch = CHARS.stick, p = ch.stances[0].pose; return baseFk(ch, p) === baseFk(ch, p) && baseFk(ch, { ...p }) !== baseFk(ch, p); })()`));
});
