// unit tests of special move effects (src/engine/effects.js): the effect list, older fields read into it, and per-part collision
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load();

test('moveEffects reads older shot / beam / fx fields as one-part effects, and keeps a move\'s own list', () => {
  const r = JSON.parse(run(`JSON.stringify({
    shot: moveEffects({ shot: { speed: 300, size: 16, look: 'dark', pierce: 2 }, fx: { look: 'aura', on: 'arm' } }),
    bare: moveEffects({ keys: [{ shoot: true }] }), beam: moveEffects({ beam: { range: 400 } }).map(e => e.kind),
    none: moveEffects(null), own: moveEffects({ effects: [{ kind: 'aura' }], shot: {} }).length, plain: moveShot({ keys: [{}] }) })`));
  assert.deepEqual(r.shot.map(e => e.kind), ['shot', 'aura']);
  assert.deepEqual(r.shot[0].parts, [{ name: 'core', shape: 'circle', dx: 0, dy: 0, r: 16, hits: true }]);
  assert.equal(r.shot[0].motion.speed, 300), assert.equal(r.shot[0].props.pierce, 2), assert.equal(r.shot[1].anchor, 'arm');
  assert.equal(r.bare[0].look, 'ki', 'a shoot key with no shot field fires the default shot'), assert.equal(r.bare[0].parts[0].r, 12);
  assert.deepEqual(r.beam, ['beam']), assert.deepEqual(r.none, []), assert.equal(r.own, 1), assert.equal(r.plain, null);
});

test('shot parts: only hitting parts collide; a capsule reaches along its line; parts flip with facing', () => {
  const r = JSON.parse(run(`(() => {
    const s = { x: 100, y: 50, dir: -1, k: 2, parts: [{ shape: 'circle', dx: 10, dy: 0, r: 5 }, { shape: 'circle', r: 40, hits: false }, { shape: 'capsule', dx: 0, dy: 0, dx2: 30, dy2: 0, r: 3 }] };
    const sh = shotHitShapes(s, 4, 0);
    const far = { x: 160, y: 50, dir: 1, parts: [{ shape: 'circle', r: 5 }] }, near = { ...far, x: 45 }, tip = { ...far, x: 37 };
    const glowOnly = { x: 100, y: 50, dir: 1, parts: [{ r: 40, hits: false }] };
    return JSON.stringify({ sh, far: shotsTouch(s, far), near: shotsTouch(s, near), tip: shotsTouch(s, tip), glow: shotsTouch(glowOnly, { ...far, x: 110 }) });
  })()`));
  assert.equal(r.sh.length, 2, 'the cosmetic glow has no hit shape');
  assert.deepEqual(r.sh[0], [[76, 50], [80, 50], 10], 'facing left, dx flips; charge k scales; the ball sweeps back over its move');
  assert.deepEqual(r.sh[1], [[100, 50], [40, 50], 6], 'a capsule is its line now');
  assert.equal(r.far, false, 'the big glow on the far side does not clash'), assert.equal(r.near, true), assert.equal(r.tip, true, 'the capsule reaches its far end');
  assert.equal(r.glow, false, 'a shot of only cosmetic parts never clashes');
});

test('in a fight: a fireball whose only part is cosmetic flies through the dummy; a small core with a big cosmetic glow still hits', () => {
  const go = parts => JSON.parse(run(`(() => { const ch = JSON.parse(JSON.stringify(CHARS.stick)); ch.moves.fireball.shot = { ...ch.moves.fireball.shot, parts: ${JSON.stringify(parts)} };
    const w = new World({ a: ['@fireball'], b: 'dummy', ax: 250, bx: 560 }, {}, 7, [ch, CHARS.stick]); w.loop = false; const hp0 = w.b.hp; let r = 0;
    for (let i = 0; i < 120; i++) { w.advance(1/60, NOIN); for (const s of w.shots) r = Math.max(r, s.r); }
    return JSON.stringify({ hit: hp0 - w.b.hp, r }); })()`));
  assert.equal(go([{ shape: 'circle', r: 12, hits: false }]).hit, 0);
  const core = go([{ shape: 'circle', r: 6 }, { shape: 'circle', r: 30, hits: false }]);
  assert.ok(core.hit >= 6, 'core hits: ' + core.hit), assert.ok(core.r >= 30, 'drawn at its biggest part: ' + core.r);
});

test('shot specials: unblockable beats a guard, pass shots skips the clash, grow swells it, homing bends toward the foe', () => {
  const go = (shot, b, aMoves = ['@fireball'], n = 120) => JSON.parse(run(`(() => { const ch = JSON.parse(JSON.stringify(CHARS.stick)); Object.assign(ch.moves.fireball.shot, ${JSON.stringify(shot)});
    const w = new World({ a: ${JSON.stringify(aMoves)}, b: ${JSON.stringify(b)}, ax: 250, bx: 560 }, {}, 7, [ch, CHARS.stick]); w.loop = false; const hp0 = w.b.hp; let r = 0, vy = 0;
    for (let i = 0; i < ${n}; i++) { w.advance(1/60, NOIN); for (const s of w.shots) if (s.owner === w.a) { r = Math.max(r, s.r); vy = Math.max(vy, Math.abs(s.vy)); } }
    return JSON.stringify({ hit: hp0 - w.b.hp, blocks: w.blocks, clashes: w.clashes, r, vy }); })()`));
  const guard = [{ hold: 'guard', t: 2 }];
  assert.equal(go({}, guard).blocks, 1, 'a plain shot is blocked');
  const ub = go({ unblockable: true }, guard); assert.equal(ub.blocks, 0), assert.ok(ub.hit >= 6, 'unblockable lands: ' + ub.hit);
  assert.ok(go({}, ['@fireball']).clashes >= 1), assert.equal(go({ noClash: true }, ['@fireball']).clashes, 0, 'passes through the other shot');
  assert.ok(go({ grow: 3 }, 'dummy', ['@fireball'], 40).r > 14, 'grows'), assert.ok(go({}, 'dummy', ['@fireball'], 40).r <= 12.5, 'stays');
  assert.equal(go({}, 'dummy').vy, 0), assert.ok(go({ homing: 180, angle: 30 }, 'dummy').vy > 0, 'homing turns it');
});

test('shot spawns: split bursts it into smaller shots at the end of its life, sparks on hit and end, reflect: false only stops it on a parry', () => {
  const go = (shot, b = 'dummy', n = 120, cfg = {}) => JSON.parse(run(`(() => { const ch = JSON.parse(JSON.stringify(CHARS.stick)); Object.assign(ch.moves.fireball.shot, ${JSON.stringify(shot)});
    const w = new World({ a: ['@fireball'], b: ${JSON.stringify(b)}, ax: 250, bx: 700, cfg: ${JSON.stringify(cfg)} }, {}, 7, [ch, CHARS.stick]); w.loop = false; let most = 0, small = 99, flash = 0, back = false;
    for (let i = 0; i < ${n}; i++) { w.advance(1/60, NOIN); most = Math.max(most, w.shots.length); for (const s of w.shots) { small = Math.min(small, s.r); if (s.owner === w.b) back = true; } flash += w.parts.filter(p => p.t === 'flash').length; }
    return JSON.stringify({ most, small, flash, back }); })()`));
  const sp = go({ life: 0.3, split: 3, splitSpread: 120, endSpark: 'explosion' });
  assert.equal(sp.most, 3, 'one shot becomes three'), assert.ok(sp.small < 12, 'smaller: ' + sp.small), assert.ok(sp.flash > 0, 'the end spark flashes');
  assert.equal(go({ life: 0.3 }).most, 1, 'no split: just fizzles');
});

test('shot.reflect: false: the fireball reflect scenario parries it but it does not fly back', () => {
  const go = reflect => JSON.parse(run(`(() => { const sc = SCENARIOS['fireball reflect'], ch = JSON.parse(JSON.stringify(CHARS.stick));
    for (const m of Object.values(ch.moves)) if (m.shot) m.shot.reflect = ${reflect};
    const w = new World(sc, {}, 7, [ch, CHARS.stick]); w.loop = false; let back = false;
    for (let i = 0; i < 240; i++) { w.advance(1/60, NOIN); if (w.shots.some(s => s.owner === w.b)) back = true; }
    return JSON.stringify({ back, ahp: w.a.hp }); })()`));
  assert.equal(go(true).back, true, 'reflected as before'), assert.equal(go(false).back, false, 'not reflectable'), assert.equal(go(false).ahp, 100);
});
