'use strict';
// houndo: a beast posed to fight on all fours, not an actual quadruped rig (it's still the stick's own two-legged
// skeleton): the torso turns horizontal (the same way the centaur's does) so the arms double as front legs, while
// its own two legs stay the hind legs. Pounces, claws low, rears up to bite, and howls to taunt
function beastPose(p) {
  const q = { ...p };
  if ('waist' in q) q.waist -= 90;
  return q;
}
CHAR_DEFS.houndo = { ...mapPoses({ ...stick, moves: retimed(0.85, 0.9) }, beastPose),
  name: 'houndo', speed: 1.3, weight: 0.9, jump: 0.8, dash: 1.5, turnaround: 0.6, traction: 0.9, airDodge: 0.8, health: 0.95,
  bones: [
    { ...STICK_BONES[0], a: 90, min: 60, max: 120 },
    STICK_BONES[1], STICK_BONES[2], { ...STICK_BONES[3], len: 10 },
    // the stick's arms become real front legs too (also: ['leg'], on top of their own role: arm): the gait and foot
    // planting code key off ch.chains.leg, so they drive and plant all four the same way, no special-casing needed —
    // and staying arms as well means a weapon still has a sensible hand to go in (weaponBones, src/engine/rig.js)
    ...STICK_BONES.slice(4).map(b => b.role === 'arm'
      ? { ...b, also: b.id.startsWith('uarm') ? ['leg'] : undefined, len: Math.round(b.len * 1.1), min: b.id.startsWith('uarm') ? -140 : -10, max: b.id.startsWith('uarm') ? 100 : 165 } : b),
    ...tail3(14, 3)],
  moves: { ...mapPoses({ ...stick, moves: retimed(0.85, 0.9) }, beastPose).moves, ...sig({
    // → P: tackles forward, teeth bared
    tackle: attack({ power: 1.5, damage: 12, hit: 'head', height: 'mid', knock: 320, stun: 0.42, lunge: 480, special: true },
      [0.1, { torso: -20, lfU: 20, lfL: -30, lbU: -10, lbL: 10 }],
      [0.12, { torso: 20, head: -10, lfU: 60, lfL: -50, lbU: 30, lbL: -40 }], 0.08, 0.3),
    // ↓ P: a low claw rake with the front paw
    clawSwipe: { power: 1.3, damage: 9, hit: ['fh', 'bh'], height: 'low', knock: 160, stun: 0.4, special: true, keys: [
      { d: 0.08, e: 'outQuad', p: { torso: -20, afU: -40, afL: 40, abU: 40, abL: 60 } },
      { d: 0.08, e: 'outExpo', p: { torso: 20, afU: 60, afL: 10, abU: 10, abL: 100 }, active: true },
      { d: 0.06, p: { torso: 20, afU: 60, afL: 10, abU: 10, abL: 100 }, active: true },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // ↑ K: rears and bites down
    bite: { power: 1.6, damage: 13, hit: 'head', height: 'high', knock: 240, launch: 120, kd: true, special: true, keys: [
      { d: 0.1, e: 'outQuad', p: { torso: -30, head: -20 } },
      { d: 0.1, e: 'outExpo', p: { torso: 30, head: 20 }, active: true },
      { d: 0.08, p: { torso: 30, head: 20 }, active: true },
      { d: 0.26, e: 'inOutCubic', p: null }] },
    // ← K: a hind-leg kick, body twisted round to land it behind
    hindKick: { power: 1.3, damage: 9, hit: ['ff', 'bf'], height: 'mid', knock: 300, stun: 0.4, special: true, keys: [
      { d: 0.08, e: 'outQuad', p: { torso: -10, lbU: -40, lbL: 20 } },
      { d: 0.08, e: 'outExpo', p: { torso: 20, lbU: 60, lbL: -60 }, active: true },
      { d: 0.06, p: { torso: 20, lbU: 60, lbL: -60 }, active: true },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // ↑ S+G: a howl
    howl: { keys: [
      { d: 0.2, e: 'outBack', p: { torso: -20, head: -30 } },
      { d: 0.6, p: { torso: -20, head: -30 } },
      { d: 0.3, e: 'inOutCubic', p: null }] },
  }) },
  ...bind({ fwdPunch: 'tackle', downPunch: 'clawSwipe', upKick: 'bite', backKick: 'hindKick', taunt: 'howl',
    special: 'tackle', downSpecial: 'clawSwipe', upSpecial: 'bite', backSpecial: 'hindKick' }),
  // ↓ S+G: a low prowling crouch, quicker into the claw rake · S+G again: feral, built-in blades on the front paws
  // (body.weapon, WEAPONS.claws, fixed: true — a beast's own claws, not a weapon to drop or lose)
  stances: [{ name: 'prowl', pose: beastPose(fromOld({ torso: 10, lfU: 5, lfL: -5, lbU: -5, lbL: 5, afU: -10, afL: 10, abU: -5, abL: 15 })),
    ...bind({ punch: 'clawSwipe', special: 'clawSwipe', fwdPunch: 'bite' }) },
    { name: 'feral', pose: beastPose(fromOld({ torso: 15, head: -10, lfU: 10, lfL: -10, lbU: -10, lbL: 10, afU: -15, afL: 20, abU: -10, abL: 25 })),
      body: { weapon: 'claws' } }] };
