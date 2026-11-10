'use strict';
// otkopod: a pod-creature built around eight tentacles, not a human body with extras bolted on. The human skeleton
// stays underneath (hidden, not removed) so walking, IK and every inherited stick move still has a working rig to
// run on; the tentacles are purely visual and offensive. Each is a 4-joint chain (dangle/lag/stretch rising toward
// the tip) so they squirm even standing still, radiating from a shrunk mantle (chest) at 45° apart, front/back
// alternating for draw order. Its signature moves lean hard into multi-limb hits: eightArmSlam lands all eight tips
// at once, tentacleSweep two at once, tentacleFlurry whips four of them in sequence (rehit, alternating sides, same
// trick as jabbo's rushFlurry), and wrapSqueeze coils three around the foe for a throw
const OTKO_TENTACLES = [['tentacle1F', -160], ['tentacle2B', -115], ['tentacle3F', -70], ['tentacle4B', -25],
  ['tentacle5F', 25], ['tentacle6B', 70], ['tentacle7F', 115], ['tentacle8B', 160]];
// each tentacle is drawn as one smooth tapered spline through its four joints (shape spline on the root, taper to a
// point), and every joint follows the one above it a little (follow), so a turn at the root rolls down the tentacle
// as a wave instead of the chain swinging stiff. The four lower ones also walk (also: leg, see OTKO_WALKERS)
const OTKO_WALKERS = ['tentacle1F', 'tentacle2B', 'tentacle7F', 'tentacle8B'];
const tentacle = (id, a) => { const side = id.endsWith('F') ? 'f' : 'b', seg = { role: 'tail', side, followMix: 0.35, min: -110, max: 110 }; return [
  { id, parent: 'chest', len: 22, a, role: 'tail', side, shape: 'spline', taper: 0.85, cap: 'point', hurt: 4, thick: 7, lag: 0.6, dangle: 0.3, stretch: 0.15, min: -140, max: 140,
    ...OTKO_WALKERS.includes(id) && { also: ['leg'] } },
  { id: id + 'Mid', parent: id, len: 18, ...seg, follow: id, hurt: 1.5, thick: 4.5, lag: 1.3, dangle: 0.5, stretch: 0.2, sway: 1.6 },
  { id: id + 'End', parent: id + 'Mid', len: 13, ...seg, follow: id + 'Mid', hurt: 0, thick: 3, lag: 2.1, dangle: 0.7, stretch: 0.3, sway: 2 },
  { id: id + 'Tip', parent: id + 'End', len: 8, ...seg, follow: id + 'End', hurt: 0, thick: 1.8, lag: 3, dangle: 0.9, stretch: 0.35, sway: 2.4 }]; };
// the resting fan: every tentacle curls the same shape, mirrored every other one so they don't all bend the same way
const OTKO_POSE = Object.fromEntries(OTKO_TENTACLES.flatMap(([id], i) => {
  const s = i % 2 ? -1 : 1;
  return [[id + 'Mid', 45 * s], [id + 'End', 40 * s], [id + 'Tip', 20 * s]];
}));
const OTKO_HIDE = ['thighF', 'shinF', 'footF', 'thighB', 'shinB', 'footB', 'uarmF', 'farmF', 'handF', 'uarmB', 'farmB', 'handB'];
const OTKO_TIPS = OTKO_TENTACLES.map(([id]) => id + 'Tip');
// the stick's moves, played by tentacles: its limbs are hidden (no length, no hurtbox, no hitbox), so each limb chain is
// handed to one tentacle, which takes the limb's angles (a leg's re-based from the hip to the chest) and its hit.
// Without this every inherited punch and kick hit with a bone that isn't there and never connected
// Each step down a combo chain (jab → cross → …) hands the limbs to the next set of tentacles, so a combo lashes out
// with a different tentacle every hit instead of the same one three times
const OTKO_ARMS = [['tentacle5F', 'tentacle4B'], ['tentacle3F', 'tentacle6B'], ['tentacle4B', 'tentacle5F'], ['tentacle6B', 'tentacle3F']];
const OTKO_LEGS = [['tentacle7F', 'tentacle2B'], ['tentacle1F', 'tentacle8B'], ['tentacle2B', 'tentacle7F'], ['tentacle8B', 'tentacle1F']];
const otkoLimbs = i => { const [aF, aB] = OTKO_ARMS[i % 4], [lF, lB] = OTKO_LEGS[i % 4]; return { F: { arm: aF, leg: lF }, B: { arm: aB, leg: lB } }; };
const otkoHit = L => Object.fromEntries(Object.entries(L).flatMap(([S, { arm, leg }]) => [
  ['uarm' + S, arm + 'Mid'], ['farm' + S, arm + 'End'], ['hand' + S, arm + 'Tip'],
  ['thigh' + S, leg + 'Mid'], ['shin' + S, leg + 'End'], ['foot' + S, leg + 'Tip']]));
// how far each move sits down a combo chain: 0 for a move nothing links into (or that starts a loop of links), 1 for
// what can follow it, and so on, counting the shortest way in
const comboDepth = moves => {
  const d = {}, linked = new Set(Object.values(moves).flatMap(m => Object.values(m.next || {})));
  const from = roots => { const q = roots.filter(k => !(k in d)); q.forEach(k => { d[k] = 0; });
    while (q.length) { const k = q.shift(); for (const t of Object.values(moves[k].next || {})) if (moves[t] && !(t in d)) { d[t] = d[k] + 1; q.push(t); } } };
  from(Object.keys(moves).filter(k => !linked.has(k)));
  for (const k in moves) from([k]);
  return d;
};
const otkoKey = (p, last, L) => {
  if (!p) return p;
  const q = { ...p }, spine = (p.waist ?? last.waist ?? 180) + (p.chest ?? last.chest ?? 0);
  for (const [S, { arm, leg }] of Object.entries(L)) {
    if ('uarm' + S in p) q[arm] = p['uarm' + S];
    if ('farm' + S in p) q[arm + 'Mid'] = p['farm' + S];
    if ('hand' + S in p) q[arm + 'End'] = p['hand' + S];
    if ('thigh' + S in p) q[leg] = p['thigh' + S] - spine;
    if ('shin' + S in p) q[leg + 'Mid'] = p['shin' + S];
    if ('foot' + S in p) q[leg + 'End'] = p['foot' + S] - 90;
  }
  return q;
};
// sig() reads key poses in the old notation (torso, afU…), which drops any other bone; the tentacle angles go in x instead
// so they survive. Without this every signature move posed nothing and its tentacles never moved
const tentacleX = o => mapVals(o, m => ({ ...m, keys: m.keys.map(k => {
  if (!k.p) return k;
  const x = Object.fromEntries(Object.entries(k.p).filter(([id]) => id.startsWith('tentacle')));
  return { ...k, p: Object.fromEntries(Object.entries(k.p).filter(([id]) => !(id in x))), x: { ...k.x, ...x } };
}) }));
const otkoMove = (m, depth = 0) => {
  if (!m.keys || !m.hit) return m;
  const L = otkoLimbs(depth), HIT = otkoHit(L);
  let last = {};
  const keys = m.keys.map(k => { const p = otkoKey(k.p, last, L); if (k.p) last = { ...last, ...k.p }; return p === k.p ? k : { ...k, p }; });
  const hit = Array.isArray(m.hit) ? m.hit.map(h => HIT[h] ?? h) : HIT[m.hit] ?? m.hit;
  return { ...m, hit, keys };
};
const otkoMoves = moves => { const d = comboDepth(moves); return Object.fromEntries(Object.entries(moves).map(([k, m]) => [k, otkoMove(m, d[k])])); };
// walk: the four lower tentacles step in a rolling wave (one after another, a quarter cycle apart) while the upper four
// ripple; idle: every tentacle drifts in a slow wave, each a beat behind the one before. One cycle = 2 steps
const otkoWave = (amp, ids, ph) => Object.fromEntries(ids.flatMap((id, i) => {
  const q = Math.sin(ph + i * Math.PI / 2) * amp, s = OTKO_TENTACLES.findIndex(([t]) => t === id) % 2 ? -1 : 1;
  return [[id, OTKO_TENTACLES.find(([t]) => t === id)[1] + q], [id + 'Mid', (45 + q * 0.8) * s], [id + 'End', (40 - q * 0.6) * s]];
}));
const OTKO_UPPER = OTKO_TENTACLES.map(([id]) => id).filter(id => !OTKO_WALKERS.includes(id));
// a loop starts with a near-instant key on its first pose, so each cycle ends exactly where the next one begins
const otkoLoop = (n, d, f) => ({ keys: [{ d: 0.001, p: f(0) }, ...Array.from({ length: n }, (_, i) => ({ d, e: 'linear', p: f((i + 1) / n * 2 * Math.PI) }))] });
CHAR_DEFS.otkopod = { ...stick, name: 'otkopod', speed: 1, weight: 1, jump: 0.85, airDodge: 1.1, springs: 1.25, health: 1.5,
  bones: [...STICK_BONES.map(b => b.id === 'chest' ? { ...b, len: 10 } : b.id === 'waist' ? { ...b, len: 8 } : OTKO_HIDE.includes(b.id) ? { ...b, hidden: true } : b),
    ...OTKO_TENTACLES.flatMap(([id, a]) => tentacle(id, a))],
  poses: { ...stick.poses, stance: OTKO_POSE },
  moves: { walk: otkoLoop(8, 0.09, ph => ({ ...otkoWave(28, OTKO_WALKERS, ph), ...otkoWave(10, OTKO_UPPER, ph + 1) })),
    idle: otkoLoop(8, 0.35, ph => otkoWave(8, OTKO_TENTACLES.map(([id]) => id), ph)),
    ...otkoMoves(retimed(1)), ...sig(tentacleX({
    // P: a single tentacle snaps forward, fast
    tentacleJab: attack({ power: 1, damage: 7, hit: 'tentacle5FTip', height: 'mid', knock: 120, stun: 0.3 },
      [0.06, { tentacle5F: -150, tentacle5FMid: 60, tentacle5FEnd: 40 }],
      [0.05, { tentacle5F: -85, tentacle5FMid: 0, tentacle5FEnd: 0, tentacle5FTip: 0 }], 0.06, 0.18),
    // K: a low double sweep, two tentacles at once (simultaneous multi-limb hit)
    tentacleSweep: attack({ power: 1.2, damage: 8, hit: ['tentacle4BTip', 'tentacle6BTip'], height: 'low', knock: 160, stun: 0.4 },
      [0.08, { tentacle4B: -40, tentacle4BMid: -20, tentacle6B: 40, tentacle6BMid: 20 }],
      [0.08, { tentacle4B: 60, tentacle4BMid: 30, tentacle6B: -60, tentacle6BMid: -30 }], 0.08, 0.22),
    // → S: four tentacles whip forward one after another (sequential multi-limb hit: each key poses a different one)
    tentacleFlurry: { power: 1, damage: 4, hit: ['tentacle1FTip', 'tentacle3FTip', 'tentacle5FTip', 'tentacle7FTip'], height: 'high', knock: 90, stun: 0.4, special: true, keys: [
      { d: 0.05, e: 'outQuad', p: { tentacle1F: -140, tentacle3F: -60 } },
      { d: 0.05, e: 'outExpo', p: { tentacle1F: -40, tentacle1FMid: 30, tentacle1FEnd: 30 }, active: true, lunge: 100 },
      { d: 0.05, e: 'outExpo', p: { tentacle1F: -140, tentacle3F: 10, tentacle3FMid: 30, tentacle3FEnd: 30 }, active: true, lunge: 100, rehit: true },
      { d: 0.05, e: 'outExpo', p: { tentacle3F: -60, tentacle5F: 95, tentacle5FMid: 30, tentacle5FEnd: 30 }, active: true, lunge: 100, rehit: true },
      { d: 0.06, e: 'outExpo', p: { tentacle5F: 25, tentacle7F: 185, tentacle7FMid: 30, tentacle7FEnd: 30 }, active: true, lunge: 150, rehit: true },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // ↑ S: all eight tentacles slam down together (one key, eight hitboxes at once)
    eightArmSlam: { power: 1.8, damage: 16, hit: OTKO_TIPS, height: 'mid', knock: 260, launch: 200, kd: true, special: true, keys: [
      { d: 0.14, e: 'outQuad', p: Object.fromEntries(OTKO_TENTACLES.map(([id]) => [id, -170])) },
      { d: 0.1, e: 'outExpo', p: Object.fromEntries(OTKO_TENTACLES.map(([id], i) => [id, i % 2 ? 100 : -40])), active: true, shake: 0.4 },
      { d: 0.14, p: Object.fromEntries(OTKO_TENTACLES.map(([id], i) => [id, i % 2 ? 100 : -40])), active: true },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // ↓ S: a spray of ink from one tentacle's tip
    inkBurst: { power: 1, damage: 6, hit: 'tentacle2BTip', height: 'mid', knock: 300, stun: 0.5, special: true, shot: { speed: 260, size: 18, life: 1.4, look: 'dark' }, fx: { look: 'smoke', on: 'tentacle2B' }, keys: [
      { d: 0.14, e: 'outQuad', p: { tentacle2B: -150, tentacle2BMid: -10 } },
      { d: 0.07, e: 'outExpo', shoot: true, p: { tentacle2B: -90, tentacle2BMid: 10 } },
      { d: 0.18, p: { tentacle2B: -90, tentacle2BMid: 10 } },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // P+G: three tentacles coil around the foe and squeeze — a throw, not a strike
    wrapSqueeze: { power: 1, damage: 0, hit: 'tentacle5FTip', height: 'mid', knock: 0, throw: 'squeezeSlam', keys: [
      { d: 0.08, e: 'outQuad', p: { tentacle4B: -30, tentacle5F: 40, tentacle6B: 30 } },
      { d: 0.07, e: 'outExpo', p: { tentacle4B: 40, tentacle5F: 100, tentacle6B: -40 }, active: true, lunge: 100 },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    squeezeSlam: { power: 1.4, damage: 12, hit: 'tentacle5FTip', height: 'mid', knock: 220, launch: 80, kd: true, keys: [
      { d: 0.16, e: 'outQuad', p: { tentacle4B: 40, tentacle5F: 130, tentacle6B: -40 } },
      { d: 0.1, e: 'outExpo', p: { tentacle4B: -20, tentacle5F: -20, tentacle6B: 20 }, active: true },
      { d: 0.26, e: 'inOutCubic', p: null }] },
    // S+G stance special: one tentacle lashes out at full extension, further than any other move reaches
    coiledLash: attack({ power: 1.5, damage: 11, hit: 'tentacle1FTip', height: 'mid', knock: 380, launch: 100, kd: true, special: true, lunge: 200 },
      [0.14, { tentacle1F: -170, tentacle1FMid: 80, tentacle1FEnd: 60 }],
      [0.08, { tentacle1F: 10, tentacle1FMid: -20, tentacle1FEnd: -10 }], 0.1, 0.3),
  })) },
  ...bind({ punch: 'tentacleJab', kick: 'tentacleSweep', fwdSpecial: 'tentacleFlurry', upSpecial: 'eightArmSlam',
    downSpecial: 'inkBurst', special: 'inkBurst', throw: 'wrapSqueeze' }),
  // S+G: coiled — every tentacle pulled in tight, tougher and springier; its own extended lash special reaches further
  stances: [{ name: 'coiled', body: { stats: { tough: 1.2, springs: 1.4 } },
    pose: Object.fromEntries(OTKO_TENTACLES.flatMap(([id], i) => { const s = i % 2 ? -1 : 1; return [[id, -170], [id + 'Mid', 60 * s], [id + 'End', 40 * s]]; })),
    ...bind({ special: 'coiledLash', fwdSpecial: 'coiledLash' }) }] };
