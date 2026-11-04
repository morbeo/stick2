'use strict';
// centaur: a horizontal horse body from the hips forward; the human waist sits on its front end (its angles are relative to
// the barrel, so every pose's waist turns by -90); hind legs are the stick's legs, forelegs hang off the barrel: the forelegs
// move as the stick's legs do (knees forward, they do the kicking), the hind legs bend the other way like hocks and follow at
// half strength; both relative to the centaur's own stance. Tramples, kicks with both hind hooves, headbutts, whips its tail
function mapPoses(def, fn) {
  const f = p => p && fn({ ...p });
  return { ...def, poses: mapVals(def.poses, f), moves: mapVals(def.moves, m => ({ ...m, keys: m.keys.map(k => ({ ...k, p: f(k.p) })) })),
    hurt: mapVals(def.hurt, set => set.map(f)) };
}
const QUAD_HITS = { footF: 'hoofF', footB: 'hoofB', shinF: 'foreShinF', shinB: 'foreShinB' };
const QUAD_STANCE = { thighF: -22, shinF: 30, thighB: -12, shinB: 22, foreThighF: -76, foreShinF: -18, foreThighB: -84, foreShinB: -12 };
function quadLegs(p) {
  const st = CHAR_DEFS.stick.poses.stance;
  if ('waist' in p) p.waist -= 90;
  for (const S of 'FB') {
    for (const [j, f] of [['thigh', 'foreThigh'], ['shin', 'foreShin']]) if (j + S in p) {
      const d = p[j + S] - st[j + S];
      p[f + S] = QUAD_STANCE[f + S] + d; p[j + S] = QUAD_STANCE[j + S] - d / 2;
    }
    if ('foot' + S in p) p['hoof' + S] = p['foot' + S];
  }
  return p;
}
const CENTAUR_MOVES = mapVals({ ...retimed(1.1, 1.2), tailWhip: TAIL_WHIP, ...sig({
  // → P: tramples forward on all fours, the forelegs pounding the ground
  trample: { power: 1.6, damage: 12, hit: ['ff', 'bf'], height: 'mid', knock: 380, launch: 120, kd: true, special: true, keys: [
    { d: 0.12, e: 'outQuad', p: { torso: -5, lfU: -5, lfL: 15, lbU: 10, lbL: -15 } },
    { d: 0.14, e: 'outExpo', p: { torso: 10, lfU: 55, lfL: -35, lbU: 35, lbL: -25 }, active: true, lunge: 480, rehit: true },
    { d: 0.14, p: { torso: 5, lfU: 35, lfL: -15, lbU: 20, lbL: -15 }, active: true, lunge: 360 },
    { d: 0.3, e: 'inOutCubic', p: null }] },
  // ↓ K: the donkey kick, both hind hooves kick back
  donkeyKick: { power: 1.5, damage: 11, hit: ['ff', 'bf'], height: 'mid', knock: 460, stun: 0.45, special: true, keys: [
    { d: 0.1, e: 'outQuad', p: { torso: 30, lfU: -30, lfL: 10, lbU: -20, lbL: 10 } },
    { d: 0.1, e: 'outExpo', p: { torso: 40, lfU: 70, lfL: -60, lbU: 60, lbL: -60 }, active: true, shake: 0.4 },
    { d: 0.08, p: { torso: 40, lfU: 70, lfL: -60, lbU: 60, lbL: -60 }, active: true },
    { d: 0.26, e: 'inOutCubic', p: null }] },
  // ↑ P: rears up and headbutts down
  rearButt: { power: 1.4, damage: 10, hit: 'head', height: 'high', knock: 260, stun: 0.4, special: true, keys: [
    { d: 0.12, e: 'outQuad', p: { torso: -30, head: -20, afU: -20, afL: 100, abU: -30, abL: 100 } },
    { d: 0.1, e: 'outExpo', p: { torso: 30, head: 10, afU: 100, afL: 10, abU: 90, abL: 15 }, active: true, lunge: 140 },
    { d: 0.08, p: { torso: 30, head: 10, afU: 100, afL: 10, abU: 90, abL: 15 }, active: true },
    { d: 0.26, e: 'inOutCubic', p: null }] },
}),
  // rearing-only (the stance below), written in raw bone angles (sig's fromOld only knows the old 10-joint notation,
  // which has no idea about forelegs): standing reared up, both forelegs pummel forward like a boxing horse
  rearStrike: attack({ power: 1.5, damage: 11, hit: ['hoofF', 'hoofB'], height: 'mid', knock: 320, launch: 80, kd: true, special: true },
    [0.12, { foreThighF: -110, foreShinF: 100, foreThighB: -140, foreShinB: 110 }],
    [0.1, { foreThighF: 20, foreShinF: -10, foreThighB: -10, foreShinB: 10 }], 0.1, 0.3),
  // rearing-only: a single overhead hoof stomp with the lead foreleg
  rearStomp: attack({ power: 1.3, damage: 9, hit: 'hoofF', height: 'mid', knock: 200, stun: 0.4, special: true },
    [0.12, { foreThighF: -130, foreShinF: 110 }],
    [0.12, { foreThighF: 40, foreShinF: -20 }], 0.1, 0.26),
}, m => ({ ...m, hit: mapHit(m.hit, h => QUAD_HITS[h] || h) }));
CHAR_DEFS.centaur = { ...mapPoses({ ...stick, moves: CENTAUR_MOVES }, quadLegs),
  name: 'centaur', speed: 1.1, weight: 1.4, jump: 0.9, dash: 1.4, turnaround: 0.45, traction: 0.75, airDodge: 0.6,
  bones: [{ id: 'barrel', len: 34, a: 90, role: 'spine', hurt: 13, thick: 11, lag: 0, min: 60, max: 120 },
    ...STICK_BONES.map(b => b.id === 'waist' ? { ...b, parent: 'barrel', a: 90, min: 30, max: 210 } : b.id.startsWith('shin') ? { ...b, min: -8, max: 165 } : b),
    ...['B', 'F'].flatMap(S => [
      { id: 'foreThigh' + S, parent: 'barrel', len: 22, a: -90, role: 'leg', side: S.toLowerCase(), hurt: 8, lag: 0, min: -190, max: 50 },
      { id: 'foreShin' + S, parent: 'foreThigh' + S, len: 23, role: 'leg', side: S.toLowerCase(), hurt: 8, lag: 1, min: -165, max: 8 },
      { id: 'hoof' + S, parent: 'foreShin' + S, len: 6, a: 90, role: 'leg', side: S.toLowerCase(), hurt: 6, lag: 1.5, level: 1, thick: 5, min: 40, max: 140 }]),
    ...tail3(12, 3).map(b => b.id === 'tail' ? { ...b, a: -150 } : b)],
  ...bind({ fwdPunch: 'trample', downKick: 'donkeyKick', upPunch: 'rearButt', backKick: 'tailWhip',
    special: 'trample', fwdSpecial: 'trample', downSpecial: 'donkeyKick', upSpecial: 'rearButt' }),
  // ↓ (held a moment): lowers into a charging crouch, quicker into the trample
  // S+G (cycles with charge): rears up onto the hind (human) legs, barrel swung upright; the forelegs strike like hooves boxing
  stances: [{ name: 'charge', pose: quadLegs(fromOld({ torso: 20, lfU: 10, lfL: -10, lbU: -5, lbL: 5 })),
    ...bind({ punch: 'trample', special: 'trample', kick: 'donkeyKick' }) },
    { name: 'rearing', pose: { barrel: 150, waist: 22, thighF: 25, shinF: -25, footF: 90, thighB: -18, shinB: 0, footB: 90,
        foreThighF: -60, foreShinF: 60, hoofF: 90, foreThighB: -100, foreShinB: 80, hoofB: 90 },
      body: { bones: { barrel: { min: 60, max: 185 } } },
      ...bind({ punch: 'rearStrike', fwdPunch: 'rearStrike', special: 'rearStrike', kick: 'rearStomp' }) }] };
