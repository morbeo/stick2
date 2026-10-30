'use strict';
// ---------- posing: stance bodies, sampling moves, frame data, combos, forward kinematics and constraints ----------
// ---------- stance bodies: a stance (or main) can change the body (def.stances[i].body / def.main.body), compiled like a weapon ----------
// body: { bones: { id: { len, thick, shape, fx, hidden, … } } over the bones, add: [more bones], scale (× every length, thickness
// and hurtbox), stats: { k: v } over the character's (not health), gait: { k: v }, chains: { move: next } (that move's links in it) }.
// A hidden bone (and all below it) has no length, hurtbox or chain and isn't drawn
function bodyDef(def, b) {
  const k = b.scale || 1, over = b.bones || {};
  const bones = [...def.bones, ...(b.add || [])].map(x => ({ ...x, ...over[x.id] }));
  if (k !== 1) for (const x of bones) Object.assign(x, { len: (x.len ?? BONE.len) * k, hurt: (x.hurt ?? BONE.hurt) * k, thick: (x.thick ?? BONE.thick) * k });
  applyHidden(bones);
  const moves = { ...def.moves };
  for (const [n, next] of Object.entries(b.chains || {})) if (moves[n]) moves[n] = { ...moves[n], next };
  const stats = Object.fromEntries(Object.entries(b.stats || {}).filter(([s]) => s !== 'health' && CHAR_STATS.some(c => c.k === s)));
  // shadow merges field by field (a stance can change just its alpha, say); colour replaces outright, including back
  // to auto (the builder deletes def.col rather than nulling it, so 'in' - not ?? - tells "unset" from "set to falsy")
  return { ...def, bones, moves, ...stats, gait: { ...def.gait, ...b.gait },
    shadow: { ...def.shadow, ...b.shadow }, ...('col' in b ? { col: b.col } : {}) };
}
const stanceDef = (def, i) => bodyDef(def, def.stances[i - 1].body);
// a character in stance i (its body, if the stance has one) holding a weapon (if any): compiled once and cached on the base character.
// Every variant has all the stances, so stance indexes and loop names work in any of them. A stance can also build its
// own weapon right into its body (body.weapon, e.g. claws): that always wins over whatever is (or isn't) held, so the
// stance's own hands are the weapon - see WEAPONS.fixed, which also keeps it from being disarmed or thrown away
function variant(ch, i, type) {
  const base = ch.base || ch, si = i && base.def.stances?.[i - 1]?.body ? i : 0;
  const w = (si && base.def.stances[si - 1].body.weapon) || (WEAPONS[type] ? type : ''), key = si + ':' + w;
  if (!si && !w) return base;
  base.variants ??= {};
  if (base.variants[key]) return base.variants[key];
  let def = si ? stanceDef(base.def, si) : base.def;
  if (w) { // weaponBones needs the chains of this same stance body, unarmed - compiled once, cached, and never itself re-entering this branch
    const bare = si ? (base.variants[si + ':'] ??= Object.assign(makeCharacter(def), { base, si })) : base;
    def = { ...def, weapon: w, moves: { ...WEAPON_MOVES, ...def.moves }, bones: [...def.bones, ...weaponBones(bare, w)] };
  }
  return base.variants[key] = Object.assign(makeCharacter(def), { base, si });
}
// the character holding a weapon (in the same stance body; the weapon moves are there even when the def lacks them); no type: unarmed
function armed(ch, type) { return variant(ch, ch.si || 0, type); }
// the character in stance i, holding what it holds
const stanceChar = (ch, i) => variant(ch, i, ch.weapon);
// a weapon move is shown (editor, gallery) by the character holding its class's weapon
const withWeapon = (ch, m) => m?.weapon ? armed(ch, WEAPON_CLASSES[m.weapon].weapon) : ch.base || ch;
// a thrown weapon: one blow, by its weight
// k: a charged throw's multiplier (Fighter.letGo) on its damage and knockback
const thrownMove = (type, k = 1) => { const w = WEAPONS[type]; return { power: weaponPower(w), damage: Math.round((5 + 6 * w.weight) * k), knock: 160 * k, stun: 0.4, height: 'mid' }; };

// a reaction pose, randomized so repeated hits never look identical
function makeHurt(pose, stun, rand, stance) {
  const hit = {}, hold = {};
  for (const k in pose) {
    const s = stance[k];
    hit[k] = pose[k] + (pose[k] - s) * rand(-0.25, 0.2) + rand(-5, 5);
    hold[k] = hit[k] * 0.8 + s * 0.2;
  }
  return { hurt: true, keys: [
    { d: 0.05, e: 'outExpo', p: hit },
    { d: Math.max(0.04, stun - 0.1), e: 'outQuad', p: hold },
    { d: 0.22, e: 'outCubic', p: null },
  ] };
}
const resolve = (base, p) => p ? { ...base, ...p } : base;
const total = m => m.keys.reduce((s, k) => s + k.d, 0);
// the keyframe layer of move m at time t: eased from the base (the stance), key by key (what the springs then chase)
function samplePose(ch, m, t, easing = CFG.easing, base = m.ref || ch.poses.stance) { // a layer plays from its ref pose
  let from = base;
  for (const k of m.keys) {
    const to = resolve(base, k.p);
    if (t < k.d) {
      const e = easeKey(k, t / k.d, easing), p = {};
      // base's own ids, not ch.ids: a shared movement layer (dashLayer etc.) is authored once for the stick's bones, so a
      // character with extra ones (wings, a tail…) must not blend bones the layer's ref never defined (NaN: from/to undefined)
      for (const j in base) p[j] = from[j] + (to[j] - from[j]) * e;
      return p;
    }
    t -= k.d; from = to;
  }
  return from;
}
// startup / active / recovery in 60 fps frames
function frameData(m, speed = 1) {
  const f = { startup: 0, active: 0, recovery: 0 };
  let seen = false;
  for (const k of m.keys) {
    const n = k.d * 60 / (m.power ? speed : 1);
    if (k.active) { f.active += n; seen = true; } else f[seen ? 'recovery' : 'startup'] += n;
  }
  return mapVals(f, Math.round);
}
const moveDamage = m => m.power ? m.damage ?? m.power * 8 : 0;
// combos (the chains setting authored): a move's next links { punch: 'cross', kick: 'kick', '6P': 'elbow' } chain it into another in its cancel window (6P: P with → held).
// starters: moves with links that are bound to an input (bound: a Set of names) or that no move links to
const linksOf = (ch, n) => Object.entries(ch.moves[n]?.next || {}).filter(([, t]) => ch.moves[t]);
function comboRoots(ch, bound) {
  const linked = new Set(Object.keys(ch.moves).flatMap(n => linksOf(ch, n).map(l => l[1])));
  return Object.keys(ch.moves).filter(n => linksOf(ch, n).length && (bound.has(n) || !linked.has(n)));
}
// every route from each starter to a move without links (a link back into the route ends it): moves, the button of each link
// (the first is null), damage before combo scaling and frames until the last move ends (each earlier one until its cancel window opens)
function comboRoutes(ch, roots, speed = 1) {
  const out = [], f = m => 60 / (m.power ? speed : 1);
  const walk = (moves, inputs) => {
    const next = linksOf(ch, moves.at(-1)).filter(([, t]) => !moves.includes(t));
    if (!next.length) {
      if (moves.length < 2) return;
      const ms = moves.map(n => ch.moves[n]), last = ms.at(-1);
      out.push({ moves, inputs, damage: ms.reduce((s, m) => s + moveDamage(m), 0),
        frames: Math.round(ms.slice(0, -1).reduce((s, m) => s + m.keys.slice(0, m.cancel).reduce((a, k) => a + k.d, 0) * f(m), 0) + total(last) * f(last)) });
    }
    for (const [b, t] of next) walk([...moves, t], [...inputs, b]);
  };
  for (const r of roots) walk([r], [null]);
  return out;
}

// forward kinematics, hip (root) at origin, y down. dir in [-1, 1] (fractional while turning), or a bone => dir function
// so a part (the head, snapping instantly through a turn instead of squashing with the body) can mirror on its own. lens: stretched lengths
// wa (optional) receives each bone's world angle
function fk(ch, p, dir, lens, wa = {}) {
  const dirOf = typeof dir === 'function' ? dir : () => dir;
  const P = { hip: [0, 0] };
  for (const b of ch.bones) {
    const pb = b.parent && ch.by[b.parent], pw = pb ? wa[pb.id] : 0;
    const w = wa[b.id] = pw + p[b.id] - b.level * (pw - (pb ? pb.restW : 0));
    const o = P[b.parent || 'hip'], l = lens ? lens[b.id] : b.len, dir = dirOf(b);
    P[b.id] = [o[0] + Math.sin(w * R) * l * dir, o[1] + Math.cos(w * R) * l];
  }
  return P;
}

// constraints, in place on pose p (bone order, so a constraint sees its parents' result): follow adds followMix × the
// followed bone's turn away from ref (the stance); reach bends the bone and its parent toward the reached bone's end
// (two-bone IK, keeping the knee or elbow on the side it already bends to), blended by reachMix. Pure and deterministic
function constrain(ch, p, ref = ch.poses?.stance || {}) {
  if (!ch.cons) return p;
  for (const b of ch.bones) {
    const f = b.follow !== b.id && ch.by[b.follow];
    if (f) p[b.id] += b.followMix * wrap180((p[f.id] ?? 0) - (ref[f.id] ?? 0));
  }
  for (const b of ch.bones) {
    const t = b.reach !== b.id && ch.by[b.reach], pa = t && ch.by[b.parent];
    if (!pa || !b.reachMix) continue;
    const wa = {}, P = fk(ch, p, 1, null, wa), gp = ch.by[pa.parent], gw = gp ? wa[gp.id] : 0, o = P[pa.parent || 'hip'];
    const l1 = pa.len, l2 = b.len, tx = P[t.id][0] - o[0], ty = P[t.id][1] - o[1];
    const d = clamp(Math.hypot(tx, ty), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
    const base = Math.atan2(tx, ty) / R, al = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)) / R;
    const w1 = [base + al, base - al].reduce((m, w) => Math.abs(wrap180(w - wa[pa.id])) < Math.abs(wrap180(m - wa[pa.id])) ? w : m);
    const kn = [o[0] + Math.sin(w1 * R) * l1, o[1] + Math.cos(w1 * R) * l1], w2 = Math.atan2(o[0] + tx - kn[0], o[1] + ty - kn[1]) / R;
    const m = clamp(b.reachMix, 0, 1), set = (x, w, pw, prw) => { p[x.id] += m * wrap180(w - pw + x.level * (pw - prw) - p[x.id]); };
    set(pa, w1, gw, gp ? gp.restW : 0); set(b, w2, w1, pa.restW);
  }
  return p;
}
