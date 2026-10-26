// rig constraints (follow, reach) and bezier easing: pure engine functions, deterministic
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load();
const json = code => JSON.parse(run(`JSON.stringify(${code})`));
const near = (a, b, e = 1e-6, m = '') => assert.ok(Math.abs(a - b) < e, `${m} ${a} vs ${b}`);

test('bezier: ends pinned, linear handles give a straight line, y may overshoot', () => {
  const r = json(`[bezier([0.3, 0.3, 0.7, 0.7], 0.25), bezier(BZ, 0), bezier(BZ, 1), bezier(BZ, 0.5), Math.max(...Array.from({ length: 21 }, (_, i) => bezier([0.2, 1.8, 0.6, 1.4], i / 20)))]`);
  near(r[0], 0.25, 1e-5); assert.equal(r[1], 0); assert.equal(r[2], 1); near(r[3], 0.5, 1e-5); assert.ok(r[4] > 1);
});

test('easeKey: authored bezier uses bz, else the EASE name; a global easing overrides the key', () => {
  const r = json(`[easeKey({ e: 'bezier', bz: [0.3, 0.3, 0.7, 0.7] }, 0.4), easeKey({ e: 'outQuad' }, 0.5), easeKey({}, 0.3), easeKey({ e: 'bezier' }, 0.3, 'linear'), easeKey({ e: 'bezier' }, 0.5)]`);
  near(r[0], 0.4, 1e-5); near(r[1], 0.75); near(r[2], 0.3); near(r[3], 0.3); near(r[4], 0.5, 1e-5);
});

test('follow copies the followed bone\'s turn from the stance, scaled by followMix', () => {
  const r = json(`(() => { const def = JSON.parse(JSON.stringify(CHAR_DEFS.stick)), b = def.bones.find(x => x.id === 'handF');
    b.follow = 'head'; b.followMix = 0.5; const ch = makeCharacter(def), st = ch.poses.stance, p = { ...st, head: st.head + 20 };
    return [ch.cons, constrain(ch, { ...p }).handF - p.handF, makeCharacter(CHAR_DEFS.stick).cons]; })()`);
  assert.equal(r[0], true); near(r[1], 10); assert.equal(r[2], false);
});

test('reach bends the bone and its parent so its end lands on the target\'s end', () => {
  const r = json(`(() => { const def = JSON.parse(JSON.stringify(CHAR_DEFS.stick)), h = def.bones.find(x => x.id === 'handF');
    h.reach = 'handB'; const ch = makeCharacter(def), p = constrain(ch, { ...ch.poses.stance }), P = fk(ch, p, 1);
    const h2 = h.parent && ch.by[ch.by.handF.parent], reachable = Math.hypot(...[0, 1].map(i => fk(ch, ch.poses.stance, 1)[ch.by[h2.id].parent || 'hip'][i] - fk(ch, ch.poses.stance, 1).handB[i])) < h2.len + ch.by.handF.len;
    return [Math.hypot(P.handF[0] - P.handB[0], P.handF[1] - P.handB[1]), reachable]; })()`);
  assert.ok(r[1], 'target in reach'); near(r[0], 0, 0.5, 'hand to target');
});

test('a fight with constraints stays deterministic', () => {
  const r = json(`(() => { const def = JSON.parse(JSON.stringify(CHAR_DEFS.stick)); def.bones.find(x => x.id === 'handF').reach = 'handB';
    const go = () => { const w = new World(SCENARIOS[Object.keys(SCENARIOS)[0]], {}, 7, [makeCharacter(def), CHARS.stick]); for (let i = 0; i < 240; i++) w.advance(1 / 60, NOIN); return JSON.stringify(w.a.body()); };
    return [go() === go(), go().includes('NaN')]; })()`);
  assert.deepEqual(r, [true, false]);
});

test('morphAt: no delay matches the plain ease; a delayed bone waits, then lands with the rest; bezier blends work', () => {
  const r = json(`(() => { const m = { t: 0.1, T: 0.2, ease: 'inOutCubic' }, mb = { t: 0.1, T: 0.2, ease: 'bezier', bz: [0.3, 0.3, 0.7, 0.7] };
    return [morphAt(m, {}), EASE.inOutCubic(0.5), morphAt(m, { morphDelay: 0.5 }), morphAt({ ...m, t: 0.2 }, { morphDelay: 0.9 }), morphAt(mb, {}), morphAt(m, { morphDelay: 0.25 }), EASE.inOutCubic(1 / 3)]; })()`);
  near(r[0], r[1]); assert.equal(r[2], 0); assert.equal(r[3], 1); near(r[4], 0.5, 1e-5); near(r[5], r[6]);
});
