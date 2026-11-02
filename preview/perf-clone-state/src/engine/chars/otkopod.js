'use strict';
// tako: a human who shapeshifts into an octopus. Two more legs and two more arms are always part of the skeleton, as
// short nubs at the hips and shoulders in human form (every move stays valid on the base skeleton, and no bone needs a
// otkopod: a pod-creature built around eight tentacles, not a human body with extras bolted on. The human skeleton
// stays underneath (hidden, not removed) so walking, IK and every inherited stick move still has a working rig to
// run on; the tentacles are purely visual and offensive. Each is a 4-joint chain (dangle/lag/stretch rising toward
// the tip) so they squirm even standing still, radiating from a shrunk mantle (chest) at 45° apart, front/back
// alternating for draw order. Its signature moves lean hard into multi-limb hits: eightArmSlam lands all eight tips
// at once, tentacleSweep two at once, tentacleFlurry whips four of them in sequence (rehit, alternating sides, same
// trick as jabbo's rushFlurry), and wrapSqueeze coils three around the foe for a throw
const OTKO_TENTACLES = [['tentacle1F', -160], ['tentacle2B', -115], ['tentacle3F', -70], ['tentacle4B', -25],
  ['tentacle5F', 25], ['tentacle6B', 70], ['tentacle7F', 115], ['tentacle8B', 160]];
const tentacle = (id, a) => { const side = id.endsWith('F') ? 'f' : 'b'; return [
  { id, parent: 'chest', len: 22, a, role: 'tail', side, hurt: 6, thick: 6, lag: 0.6, dangle: 0.3, stretch: 0.15, min: -140, max: 140 },
  { id: id + 'Mid', parent: id, len: 18, role: 'tail', side, hurt: 5, thick: 4.5, lag: 1.3, dangle: 0.5, stretch: 0.2, min: -110, max: 110 },
  { id: id + 'End', parent: id + 'Mid', len: 13, role: 'tail', side, hurt: 4, thick: 3, lag: 2.1, dangle: 0.7, stretch: 0.3, min: -110, max: 110 },
  { id: id + 'Tip', parent: id + 'End', len: 8, role: 'tail', side, hurt: 2, thick: 1.8, lag: 3, dangle: 0.9, stretch: 0.35, min: -110, max: 110 }]; };
// the resting fan: every tentacle curls the same shape, mirrored every other one so they don't all bend the same way
const OTKO_POSE = Object.fromEntries(OTKO_TENTACLES.flatMap(([id], i) => {
  const s = i % 2 ? -1 : 1;
  return [[id + 'Mid', 24 * s], [id + 'End', 18 * s], [id + 'Tip', -12 * s]];
}));
const OTKO_HIDE = ['thighF', 'shinF', 'footF', 'thighB', 'shinB', 'footB', 'uarmF', 'farmF', 'handF', 'uarmB', 'farmB', 'handB'];
const OTKO_TIPS = OTKO_TENTACLES.map(([id]) => id + 'Tip');
CHAR_DEFS.otkopod = { ...stick, name: 'otkopod', speed: 0.95, weight: 1, jump: 0.85, airDodge: 1.1, springs: 1.25, health: 1.1,
  bones: [...STICK_BONES.map(b => b.id === 'chest' ? { ...b, len: 10 } : b.id === 'waist' ? { ...b, len: 8 } : OTKO_HIDE.includes(b.id) ? { ...b, hidden: true } : b),
    ...OTKO_TENTACLES.flatMap(([id, a]) => tentacle(id, a))],
  poses: { ...stick.poses, stance: OTKO_POSE },
  moves: { ...retimed(1), ...sig({
    // P: a single tentacle snaps forward, fast
    tentacleJab: attack({ power: 0.9, damage: 5, hit: 'tentacle5FTip', height: 'mid', knock: 120, stun: 0.3 },
      [0.06, { tentacle5F: -10, tentacle5FMid: 10, tentacle5FEnd: 10 }],
      [0.05, { tentacle5F: 20, tentacle5FMid: -60, tentacle5FEnd: -50 }], 0.06, 0.18),
    // K: a low double sweep, two tentacles at once (simultaneous multi-limb hit)
    tentacleSweep: attack({ power: 1.1, damage: 7, hit: ['tentacle4BTip', 'tentacle6BTip'], height: 'low', knock: 160, stun: 0.4 },
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
  }) },
  ...bind({ punch: 'tentacleJab', kick: 'tentacleSweep', fwdSpecial: 'tentacleFlurry', upSpecial: 'eightArmSlam',
    downSpecial: 'inkBurst', special: 'inkBurst', throw: 'wrapSqueeze' }),
  // S+G: coiled — every tentacle pulled in tight, tougher and springier; its own extended lash special reaches further
  stances: [{ name: 'coiled', body: { stats: { tough: 1.2, springs: 1.4 } },
    pose: Object.fromEntries(OTKO_TENTACLES.flatMap(([id], i) => { const s = i % 2 ? -1 : 1; return [[id, -170], [id + 'Mid', 60 * s], [id + 'End', 40 * s]]; })),
    ...bind({ special: 'coiledLash', fwdSpecial: 'coiledLash' }) }] };
