// a quadruped built from the stick (not in the roster): the forelegs, barrel and hocks exercise bones a biped never has
// run(require('./centaur')) adds CHARS.centaur
module.exports = `
function mapPoses(def, fn) {
  const f = p => p && fn({ ...p });
  return { ...def, poses: mapVals(def.poses, f), moves: mapVals(def.moves, m => ({ ...m, keys: m.keys.map(k => ({ ...k, p: f(k.p) })) })),
    hurt: mapVals(def.hurt, set => set.map(f)) };
}
// centaur: a horizontal horse body from the hips forward; the human waist sits on its front end (its angles are
// relative to the barrel, so every pose's waist turns by -90); hind legs are the stick's legs, forelegs hang off the barrel
// the forelegs move as the stick's legs do (knees forward, they do the kicking), the hind legs bend the other way like hocks
// and follow at half strength; both relative to the centaur's own stance
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
CHARS.centaur = makeCharacter({ ...mapPoses({ ...stick, moves: mapVals(retimed(1.1, 1.2), m => ({ ...m, hit: mapHit(m.hit, h => QUAD_HITS[h] || h) })) }, quadLegs),
  name: 'centaur', speed: 1.1, weight: 1.4, jump: 0.9, dash: 1.4, turnaround: 0.45, traction: 0.75, airDodge: 0.6,
  bones: [{ id: 'barrel', len: 34, a: 90, role: 'spine', hurt: 13, thick: 11, lag: 0, min: 60, max: 120 },
    ...STICK_BONES.map(b => b.id === 'waist' ? { ...b, parent: 'barrel', a: 90, min: 30, max: 210 } : b.id.startsWith('shin') ? { ...b, min: -8, max: 165 } : b),
    ...['B', 'F'].flatMap(S => [
      { id: 'foreThigh' + S, parent: 'barrel', len: 22, a: -90, role: 'leg', side: S.toLowerCase(), hurt: 8, lag: 0, min: -190, max: 50 },
      { id: 'foreShin' + S, parent: 'foreThigh' + S, len: 23, role: 'leg', side: S.toLowerCase(), hurt: 8, lag: 1, min: -165, max: 8 },
      { id: 'hoof' + S, parent: 'foreShin' + S, len: 6, a: 90, role: 'leg', side: S.toLowerCase(), hurt: 6, lag: 1.5, level: 1, thick: 5, min: 40, max: 140 }]),
    ...tail3(12, 3).map(b => b.id === 'tail' ? { ...b, a: -150 } : b)] });
`;
