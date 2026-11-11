'use strict';
// otkopod: an octopus passing as a person (Octodad style). Its eight tentacles are bundled two per limb, two for each arm
// off the shoulders and two for each leg off the hip, so at rest it stands like a person, only wobbly. The stick's
// skeleton stays underneath, its limbs hidden (no length, hurtbox or hitbox), so walking, IK and every inherited stick
// move keep a working rig: each limb's angles go to its pair of tentacles (otkoKey), the second trailing the first.
// The tentacles are soft: low spring stiffness and damping, rising lag, whip and dangle toward the tip, and each
// joint follows the one above it, so a turn at the root rolls down the tentacle as a wave. Each one is drawn as a single
// tapered spline to a point. The S+G stance, splayed, drops the act and fans all eight out like a real octopus
const OTKO_LIMBS = [['armF', 'chest', 'arm', 'f'], ['armB', 'chest', 'arm', 'b'], ['legF', null, 'leg', 'f'], ['legB', null, 'leg', 'b']];
// one tentacle (4 joints) of a pair; the second of a pair (n 2) is a little thinner and has no hurtbox of its own: it
// lies along the first, so the pair's hurtbox is the one drawn line it reads as
const tentacle = (id, parent, role, side, n, leg) => {
  const k = leg ? 0.9 : 0.8, hurt = n === 1, seg = { role, side, stiff: 0.75, damp: 0.95, followMix: 0.4, min: -120, max: 120 };
  return [
    { id, parent, len: Math.round(22 * k), role, side, shape: 'spline', taper: 0.85, cap: 'point', thick: n === 1 ? 6 : 5, hurt: hurt ? 4 : 0, lag: 0.7, stiff: 0.7, damp: 0.7, dangle: 0.2, stretch: 0.15 },
    { id: id + 'Mid', parent: id, len: Math.round(20 * k), ...seg, follow: id, thick: 4, hurt: hurt ? 3 : 0, lag: 1.5, dangle: 0.45, whip: 0.12, stretch: 0.2, sway: 1.6 },
    { id: id + 'End', parent: id + 'Mid', len: Math.round(16 * k), ...seg, follow: id + 'Mid', thick: 3, hurt: 0, lag: 2.3, dangle: 0.5, whip: 0.2, stretch: 0.3, sway: 2 },
    { id: id + 'Tip', parent: id + 'End', len: Math.round(10 * k), ...seg, follow: id + 'End', thick: 1.8, hurt: 0, lag: 3.2, dangle: 0.6, whip: 0.3, stretch: 0.35, sway: 2.4 }];
};
// bone order sets chain order: F1, B1, F2, B2, so the walk (legs alternate by index) steps both front tentacles together
const OTKO_BONES = [1, 2].flatMap(n => OTKO_LIMBS.flatMap(([id, parent, role, side]) => tentacle(id + n, parent, role, side, n, role === 'leg')));
const OTKO_HIDE = ['thighF', 'shinF', 'footF', 'thighB', 'shinB', 'footB', 'uarmF', 'farmF', 'handF', 'uarmB', 'farmB', 'handB'];
const OTKO_ARMS = ['armF1', 'armF2', 'armB1', 'armB2'], OTKO_LEGS = ['legF1', 'legF2', 'legB1', 'legB2'];
const OTKO_ALL = [...OTKO_ARMS, ...OTKO_LEGS];
// the stick's limb chains, by side: which tentacle pair plays each, and the stick bones it reads
const OTKO_PLAY = ['F', 'B'].flatMap(S => [['arm' + S, ['uarm' + S, 'farm' + S, 'hand' + S], 0], ['leg' + S, ['thigh' + S, 'shin' + S, 'foot' + S], 90]]);
// a stick pose → the same pose on the tentacles: the first of each pair takes the limb's angles, the second fans a bit
// off it and curls the other way, so a pair reads as two tentacles doing the work of one limb
const otkoKey = p => {
  if (!p) return p;
  const q = { ...p };
  for (const [t, [u, l, e], foot] of OTKO_PLAY) {
    if (u in p) { q[t + '1'] = p[u]; q[t + '2'] = p[u] + (t.startsWith('arm') ? 10 : -8); }
    if (l in p) { q[t + '1Mid'] = p[l]; q[t + '2Mid'] = p[l] * 0.7 - 12; q[t + '2End'] = 18; }
    if (e in p) { q[t + '1End'] = p[e] - foot; q[t + '1Tip'] = (p[e] - foot) * 0.5; }
  }
  return q;
};
// the stick's moves, played by tentacles. Each step down a combo chain (jab → cross → …) strikes with the other
// tentacle of the pair, so a combo never lands two hits in a row with the same one
const otkoHit = (h, n) => { const m = h.match(/^(uarm|farm|hand|thigh|shin|foot)([FB])$/); if (!m) return h;
  const t = (['uarm', 'farm', 'hand'].includes(m[1]) ? 'arm' : 'leg') + m[2] + n; return t + { uarm: 'Mid', farm: 'End', hand: 'Tip', thigh: 'Mid', shin: 'End', foot: 'Tip' }[m[1]]; };
const comboDepth = moves => {
  const d = {}, linked = new Set(Object.values(moves).flatMap(m => Object.values(m.next || {})));
  const from = roots => { const q = roots.filter(k => !(k in d)); q.forEach(k => { d[k] = 0; });
    while (q.length) { const k = q.shift(); for (const t of Object.values(moves[k].next || {})) if (moves[t] && !(t in d)) { d[t] = d[k] + 1; q.push(t); } } };
  from(Object.keys(moves).filter(k => !linked.has(k)));
  for (const k in moves) from([k]);
  return d;
};
const otkoMove = (m, depth = 0) => {
  if (!m.keys) return m;
  const n = depth % 2 ? 2 : 1, swap = p => {
    if (!p || n === 1) return p;
    const q = { ...p }; // the second tentacle leads: swap each pair's angles
    for (const [t] of OTKO_PLAY) for (const j of ['', 'Mid', 'End', 'Tip']) [q[t + '1' + j], q[t + '2' + j]] = [p[t + '2' + j], p[t + '1' + j]];
    for (const k in q) if (q[k] === undefined) delete q[k];
    return q;
  };
  const keys = m.keys.map(k => k.p ? { ...k, p: swap(otkoKey(k.p)) } : k);
  const hit = !m.hit ? m.hit : Array.isArray(m.hit) ? m.hit.map(h => otkoHit(h, n)) : otkoHit(m.hit, n);
  return { ...m, hit, keys };
};
const otkoMoves = moves => { const d = comboDepth(moves); return mapVals2(moves, (m, k) => otkoMove(m, d[k])); };
const mapVals2 = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v, k)]));
// the same angle on several tentacles (and their joints), for the signature moves below
const otkoAll = (ids, a, mid = 0, end = 0) => Object.fromEntries(ids.flatMap(id => [[id, a], [id + 'Mid', mid], [id + 'End', end]]));
const otkoEach = (ids, f) => Object.fromEntries(ids.flatMap((id, i) => Object.entries(f(id, i))));
// arm angles (from the chest): -90 forward, 90 back, 0 overhead, ±180 hanging. Leg angles (from the hip): 90 forward,
// -90 back, 0 straight down
const FRONT_ARM = -95, BACK_ARM = 95, FRONT_LEG = 85, BACK_LEG = -85;
// splayed: the act dropped, all eight fanned out round the body like a real octopus, arms high, legs wide
const SPLAYED = { ...otkoEach(OTKO_ARMS, (id, i) => ({ [id]: [-60, -25, 60, 25][i], [id + 'Mid']: [35, 50, -35, -50][i], [id + 'End']: [30, 40, -30, -40][i] })),
  ...otkoEach(OTKO_LEGS, (id, i) => ({ [id]: [55, 30, -55, -30][i], [id + 'Mid']: [-40, -30, 40, 30][i], [id + 'End']: [-30, -40, 30, 40][i] })), waist: 180, chest: 0 };
CHAR_DEFS.otkopod = { ...stick, name: 'otkopod', speed: 1, weight: 1, jump: 0.85, airDodge: 1.1, springs: 1.4, health: 1.5,
  gait: { idle: 'sway', idleAmt: 2.2, lean: 0.8, stride: 1.1, lift: 1.3, armSwing: 1.6, breath: 1.3 },
  bones: [...STICK_BONES.map(b => OTKO_HIDE.includes(b.id) ? { ...b, hidden: true } : b), ...OTKO_BONES],
  // every stick pose (stance, crouch, air, fall, lie) with the tentacles taking the limbs' place: human-shaped
  poses: mapVals(stick.poses, otkoKey),
  moves: { ...otkoMoves(retimed(1)),
    // P: the front arm's lead tentacle snaps out straight, fast
    tentacleJab: { power: 1, damage: 7, hit: 'armF1Tip', height: 'mid', knock: 120, stun: 0.3, keys: [
      { d: 0.06, e: 'outQuad', p: { armF1: -150, armF1Mid: 70, armF1End: 50 } },
      { d: 0.05, e: 'outExpo', p: { armF1: -88, armF1Mid: 0, armF1End: 0, armF1Tip: 0 }, active: true },
      { d: 0.06, p: { armF1: -88, armF1Mid: 0, armF1End: 0, armF1Tip: 0 }, active: true },
      { d: 0.18, e: 'inOutCubic', p: null }] },
    // K: one leg tentacle of each leg sweeps low, one in front and one behind at once
    tentacleSweep: { power: 1.2, damage: 8, hit: ['legF1Tip', 'legB1Tip'], height: 'low', knock: 160, stun: 0.4, keys: [
      { d: 0.08, e: 'outQuad', p: { waist: 165, legF1: 30, legF1Mid: -30, legB1: -30, legB1Mid: 30 } },
      { d: 0.08, e: 'outExpo', p: { waist: 165, ...otkoAll(['legF1'], FRONT_LEG, -5), ...otkoAll(['legB1'], BACK_LEG, 5) }, active: true },
      { d: 0.08, p: { waist: 165, ...otkoAll(['legF1'], FRONT_LEG, -5), ...otkoAll(['legB1'], BACK_LEG, 5) }, active: true },
      { d: 0.22, e: 'inOutCubic', p: null }] },
    // → S: the four arm tentacles whip forward one after another (four hits, each key a different tentacle)
    tentacleFlurry: { power: 1, damage: 4, hit: OTKO_ARMS.map(id => id + 'Tip'), height: 'high', knock: 90, stun: 0.4, special: true, keys: [
      { d: 0.06, e: 'outQuad', p: otkoAll(OTKO_ARMS, -170, 60, 40) },
      ...['armF1', 'armB1', 'armF2', 'armB2'].map((id, i) => ({ d: 0.05, e: 'outExpo', p: { ...otkoAll(OTKO_ARMS, -170, 60, 40), ...otkoAll([id], -90) },
        active: true, lunge: i === 3 ? 150 : 100, ...i && { rehit: true } })),
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // ↑ S: all four arm tentacles rise overhead, then two slam down in front and two behind (one hit, both sides)
    eightArmSlam: { power: 1.8, damage: 16, hit: OTKO_ARMS.map(id => id + 'Tip'), height: 'mid', knock: 260, launch: 200, kd: true, special: true, keys: [
      { d: 0.14, e: 'outQuad', p: { ...otkoAll(OTKO_ARMS, 0, 10, 10), ...otkoAll(OTKO_LEGS, 0, 30, 20) } },
      { d: 0.1, e: 'outExpo', p: { ...otkoAll(['armF1', 'armF2'], -120, -20), ...otkoAll(['armB1', 'armB2'], 120, 20), ...otkoAll(OTKO_LEGS, 0, 30, 20) }, active: true, shake: 0.4 },
      { d: 0.14, p: { ...otkoAll(['armF1', 'armF2'], -120, -20), ...otkoAll(['armB1', 'armB2'], 120, 20) }, active: true },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // ↓ S: a spray of ink from the front arm's second tentacle
    inkBurst: { power: 1, damage: 6, hit: 'armF2Tip', height: 'mid', knock: 300, stun: 0.5, special: true, shot: { speed: 260, size: 18, life: 1.4, look: 'dark' }, fx: { look: 'smoke', on: 'armF2' }, keys: [
      { d: 0.14, e: 'outQuad', p: { armF2: -170, armF2Mid: 60 } },
      { d: 0.07, e: 'outExpo', shoot: true, p: otkoAll(['armF2'], -85) },
      { d: 0.18, p: otkoAll(['armF2'], -85) },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // S: windmill. The arm tentacles spin round the body, front and back in turn: every key one pair lashes forward
    // while the other lashes back, so it hits whoever stands on either side, up to five times
    windmill: { power: 0.8, damage: 3, hit: OTKO_ARMS.map(id => id + 'Tip'), height: 'mid', knock: 80, stun: 0.35, special: true, keys: [
      { d: 0.08, e: 'outQuad', p: { ...otkoAll(OTKO_ARMS, 0, 20, 20), waist: 180 } },
      ...[0, 1, 2, 3, 4].map(i => ({ d: 0.06, e: 'outExpo', p: { waist: 180, ...otkoEach(OTKO_ARMS, (id, j) => otkoAll([id], (i + j) % 2 ? BACK_ARM : FRONT_ARM, (i + j) % 2 ? 25 : -25, (i + j) % 2 ? 20 : -20)) },
        active: true, ...i && { rehit: true } })),
      { d: 0.28, e: 'inOutCubic', p: null }] },
    // ↓ S splayed / S splayed: thrash. All eight flail at once, high and low, in front and behind, four hits
    thrash: { power: 0.9, damage: 3, hit: OTKO_ALL.map(id => id + 'Tip'), height: 'mid', knock: 100, stun: 0.4, special: true, keys: [
      { d: 0.07, e: 'outQuad', p: SPLAYED },
      ...[0, 1, 2, 3].map(i => ({ d: 0.07, e: 'outExpo', p: { ...SPLAYED,
        ...otkoEach(OTKO_ARMS, (id, j) => otkoAll([id], (i + j) % 2 ? BACK_ARM : FRONT_ARM, i % 2 ? 40 : -40)),
        ...otkoEach(OTKO_LEGS, (id, j) => otkoAll([id], (i + j) % 2 ? BACK_LEG : FRONT_LEG, i % 2 ? -40 : 40)) }, active: true, ...i && { rehit: true } })),
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // P+G: both front-arm tentacles and one back one coil round the foe and squeeze: a throw, not a strike
    wrapSqueeze: { power: 1, damage: 0, hit: 'armF1Tip', height: 'mid', knock: 0, throw: 'squeezeSlam', keys: [
      { d: 0.08, e: 'outQuad', p: otkoAll(['armF1', 'armF2', 'armB1'], -120, 30, 30) },
      { d: 0.07, e: 'outExpo', p: otkoAll(['armF1', 'armF2', 'armB1'], -80, -70, -70), active: true, lunge: 100 },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    squeezeSlam: { power: 1.4, damage: 12, hit: 'armF1Tip', height: 'mid', knock: 220, launch: 80, kd: true, keys: [
      { d: 0.16, e: 'outQuad', p: otkoAll(['armF1', 'armF2', 'armB1'], 0, -60, -60) },
      { d: 0.1, e: 'outExpo', p: otkoAll(['armF1', 'armF2', 'armB1'], -150, -20, -20), active: true },
      { d: 0.26, e: 'inOutCubic', p: null }] },
  },
  ...bind({ punch: 'tentacleJab', kick: 'tentacleSweep', fwdSpecial: 'tentacleFlurry', upSpecial: 'eightArmSlam',
    downSpecial: 'inkBurst', special: 'windmill', throw: 'wrapSqueeze' }),
  // S+G: splayed. The act drops: all eight fan out, a wider and wobblier target that reaches all round; its specials thrash
  stances: [{ name: 'splayed', pose: SPLAYED, body: { stats: { tough: 0.9, springs: 1.6, speed: 0.85 } },
    ...bind({ special: 'thrash', downSpecial: 'thrash' }) }] };
