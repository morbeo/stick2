'use strict';
// ---------- the roster's shared kit: helpers and poses every character file in src/engine/chars/ builds on ----------
// load order: src/engine/chars/index.json (after rig.js, before roster.js). Adding a character: docs/characters.md
const sizedBones = (scale, thick = 0) => STICK_BONES.map(b => ({ ...b, len: Math.round(b.len * (scale[b.id.replace(/[FB]$/, '')] ?? 1)),
  thick: (b.thick ?? BONE.thick) + thick, hurt: b.hurt ? b.hurt + thick : 0 }));
const pair = (f, props) => ['F', 'B'].map(S => ({ ...f(S), side: S.toLowerCase(), ...props }));
const horns = (len, a, curl) => ['F', 'B'].flatMap(S => [
  { id: 'horn' + S, parent: 'head', len, a: a + (S === 'B' ? 15 : 0), role: 'head', side: S.toLowerCase(), thick: 3, lag: 0.5 },
  { id: 'hornTip' + S, parent: 'horn' + S, len: Math.round(len * 0.7), a: curl, role: 'head', side: S.toLowerCase(), thick: 2, lag: 1 }]);
const tail3 = (len, thick) => [
  { id: 'tail', parent: null, len, a: -120, role: 'tail', thick, lag: 1, dangle: 0.3, sway: 0.6 },
  { id: 'tailMid', parent: 'tail', len: Math.round(len * 0.9), a: -20, role: 'tail', thick: thick - 1, lag: 2, dangle: 0.4, sway: 0.8, min: -70, max: 70 },
  { id: 'tailEnd', parent: 'tailMid', len: Math.round(len * 0.8), a: -20, role: 'tail', thick: Math.max(1, thick - 2), lag: 3, stretch: 0.25, dangle: 0.6, sway: 1, min: -70, max: 70 }];
// a cloth strip trailing from a bone (headband, scarf, mask ties): + angle = backwards off a bone pointing up
const ribbon = (id, parent, len, thick = 3) => [
  { id, parent, len, a: 105, role: 'tail', thick, lag: 2, stretch: 0.2, dangle: 0.45 },
  { id: id + 'Mid', parent: id, len, a: -15, role: 'tail', thick: thick - 1, lag: 3, stretch: 0.25, dangle: 0.35, min: -60, max: 60 },
  { id: id + 'End', parent: id + 'Mid', len: Math.round(len * 0.85), a: -15, role: 'tail', thick: Math.max(1, thick - 2), lag: 4, stretch: 0.3, dangle: 0.35, min: -60, max: 60 }];
// characters with a tail (tail3) swing it up over the back and thrust it forward like a scorpion
const TAIL_WHIP = (() => {
  const m = oldMove(attack({ power: 1.4, damage: 11, hit: 'tailEnd', height: 'mid', knock: 200, stun: 0.45, lunge: 60 },
    [0.12, { torso: -12 }], [0.07, { torso: 25, lfU: 40, lfL: -30, lbU: -25, lbL: 0 }], 0.06, 0.3));
  Object.assign(m.keys[0].p, { tail: -70, tailMid: -30, tailEnd: -30 });
  for (const k of m.keys.slice(1, 3)) Object.assign(k.p, { tail: -270, tailMid: 8, tailEnd: 8 });
  return m;
})();
// the stick's moves, slower and harder (k scales the key times, power the power and knockback)
const retimed = (k, power = 1) => mapVals(CHAR_DEFS.stick.moves, m => m.power
  ? { ...m, power: +(m.power * power).toFixed(2), knock: Math.round(m.knock * power), keys: m.keys.map(x => ({ ...x, d: +(x.d * k).toFixed(4) })) } : m);
// signature moves are written in the old notation (see fromOld); a key's x holds angles of extra bones (tail, wings, second arms)
const sig = o => mapVals(o, m => { const n = oldMove(m); n.keys = n.keys.map(({ x, ...k }) => x ? { ...k, p: { ...k.p, ...x } } : k); return n; });
// the same binds in 2D and 2.5D, b25 adding the 2.5D-only slots (↗ / ↖ with P / K)
const bind = (b, b25 = {}) => ({ binds: b, binds25: { ...b, ...b25 } });
// a stance pose as the presets give it: spine, head, front / back arm, front / back leg (local angles from the root of each limb)
const stylePose = (sp, hd, af, ab, lf, lb) => ({ waist: sp[0], chest: sp[1], neck: hd[0], head: hd[1], uarmF: af[0], farmF: af[1], handF: 0, uarmB: ab[0], farmB: ab[1], handB: 0,
  ...lf && { thighF: lf[0], shinF: lf[1], footF: lf[2], thighB: lb[0], shinB: lb[1], footB: lb[2] } });
const stanceOf = (def, p) => ({ ...def.poses.stance, ...fromOld(p) });
// poses shared by several signature moves (old notation)
const PALMS_OUT = { torso: 18, afU: 90, afL: 5, abU: 80, abL: 10, lfU: 40, lfL: -35, lbU: -30, lbL: 0 };
const PALMS_BACK = { torso: -10, afU: -40, afL: 120, abU: -50, abL: 120, lfU: 35, lfL: -40, lbU: -25, lbL: -10 };
const SPLITS = { torso: 10, lfU: 95, lfL: 0, lbU: -85, lbL: 0, afU: 100, afL: 20, abU: 80, abL: 30 }; // legs out level: spinning kicks
const FLYING = { torso: 88, head: -40, afU: 170, afL: 5, abU: 160, abL: 10, lfU: -80, lfL: 0, lbU: -95, lbL: 0 }; // level, head first
const { stick } = CHAR_DEFS;
// a character exported as code from the editor (character: export as code; npm run char:add): its base built-in plus a
// diff (objdiff.js), applied by roster.js once every built-in is finished (supers added), which is what the export diffed
const CHAR_DIFFS = [];
const charFromDiff = (name, base, diff) => { CHAR_DIFFS.push({ name, base, diff }); };
