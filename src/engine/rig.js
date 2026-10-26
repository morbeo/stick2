'use strict';
// ---------- rig: a character is a tree of bones; walking, hurtboxes, trails and ground contact derive from it ----------
// angles in degrees. world angle 0 = straight down, 90 = forward (facing dir), 180 = up.
// a pose maps bone id -> angle relative to the parent bone (root bones: relative to straight down).
const R = Math.PI / 180;
const BONE = {
  len: 10, a: 0,       // length (px) and rest angle
  role: 'tail',        // spine | head | arm | leg | tail | weapon: decides breathing, walk cycle, hit reactions
  also: undefined,     // extra roles a chain's own root bone also joins (e.g. ['leg']): a limb can drive/plant as more
                        // than one type (houndo's front legs: role arm, also leg, so they gait and plant like real legs
                        // but still count as an arm for weapon-holding)
  side: '',            // f | b | '': front / back limb (back is drawn behind, in the second colour)
  shape: 'line',       // line | circle | spline | chain (circle is centred on the bone's end, radius = len; spline draws one smooth
                        // tapered curve through this bone and its single line child chain; chain splits the bone into segs dangling
                        // segments drawn as a spline: a rope, whip or scarf)
                        // fill: a filled shape through its parent joint, its end and the joints of the single bone chain below it,
                        // closed back (via fillTo's joint if set): capes, wing membranes, skirts. Its own line is its edge
                        // socket: an invisible attach point (no draw, no hurtbox, in no chain): a held weapon goes on it
  segs: 6,             // chain only: how many segments the rope is split into
  shade: 0,            // grey level: 0 = the figure's own ink, 1 = paper white (monochrome characters keep their look: no hues)
  taper: 0,            // how much thinner the line ends than it starts (0 = even, 1 = to a point)
  cap: 'round',        // line ends: round | square (boxy limbs, pills squared off) | flat (cut at the joint) | point (narrows to a tip: blades, claws)
  fillTo: undefined,   // fill only: a bone whose joint closes the filled shape (a cape from the neck to a hand)
  follow: undefined,   // constraint: a bone whose turn away from its stance this bone copies (hair follows the head, a cape the torso)
  followMix: 1,        // how much of that turn it copies (0.5 = half, -1 = mirrored)
  reach: undefined,    // constraint (IK): this bone and its parent bend so its end reaches that bone's end (a hand on a prop, a foot on a pedal)
  reachMix: 1,         // how far toward reaching it (0 = its own pose, 1 = all the way)
  morphDelay: 0,       // auto stance blends: the share of the blend (0 … 0.9) this bone waits before it starts, so it lands
                        // later than the rest (hair and tails settle after the body)
  aim: 0,              // how far the bone turns toward the nearest foe's upper body (1 = points straight at it): heads that watch, tracking arms
  z: 0,                // draw order layer: lower draws underneath everything above it, whatever the side (side orders bones within a layer)
  thick: 5, hurt: 0,   // stroke width; hurtbox radius (0 = can't be hit here)
  lag: 1,              // follow-through: each step lowers the spring frequency, so the bone trails its parent
  level: 0,            // 0 = rigid child, 1 = keeps its rest world angle whatever the parent does (feet stay flat)
  stretch: 0,          // how much the bone lengthens while swinging fast (0.2 = up to +20%)
  stiff: 1, damp: 1,   // multipliers on the spring frequency / damping
  react: 1, sway: 1,   // secondary motion: how hard blows and bounces jolt the bone; how much it drifts while idle
  dangle: 0,           // how much the bone swings with the body's motion: trails behind a run, lifts in a fall (tails, scarves)
  whip: 0,             // how much it lags behind a fast-turning parent joint, then springs back past straight (flails, nunchucks)
  alpha: 1,            // visibility: 0 hides it (and everything below it: no draw, no hurtbox, no part in chains), between draws it translucent
  curve: 0,            // bows the drawn line into a quadratic curve: fraction of its length the midpoint bulges sideways
};
// a bone (or an ancestor) at alpha 0, or flagged hidden directly (older data): no draw, no hurtbox, no part in chains
function applyHidden(bones) {
  const by = Object.fromEntries(bones.map(x => [x.id, x]));
  const hid = x => !!x && ((x.alpha ?? 1) <= 0 || !!x.hidden || hid(by[x.parent]));
  for (const x of bones) if (hid(x)) Object.assign(x, { hidden: true, len: 0, hurt: 0 }); else delete x.hidden;
}

// a chain bone becomes segs real bones (id, id~2 … id~n) of len / segs each, every one looser and more dangling than the
// last, so the existing springs (dangle, whip, lag) swing it like a rope: deterministic, rollback-safe, hit like any bone.
// the first keeps the id (poses and moves still name it) and draws the whole rope as a spline; children hang off the last
function expandChains(by) {
  for (const b of Object.values(by)) if (b.shape === 'chain' && !b.chainOf) {
    const n = clamp(Math.round(b.segs || BONE.segs), 2, 24), len = b.len / n, kids = Object.values(by).filter(k => k.parent === b.id);
    const loose = i => ({ len, lag: b.lag + i * 0.4, dangle: clamp((b.dangle || 0.7) + i * 0.06, 0, 1), whip: b.whip || 0.02, react: b.react + i * 0.1 });
    Object.assign(b, loose(0), { shape: 'spline', chainN: n });
    let prev = b;
    for (let i = 1; i < n; i++) {
      const id = `${b.id}~${i + 1}`;
      by[id] = prev = { ...b, ...loose(i), id, parent: prev.id, a: 0, shape: 'line', chainOf: b.id, chainN: undefined,
        thick: Math.max(1, b.thick * (1 - 0.5 * i / (n - 1))), min: undefined, max: undefined, fx: undefined };
    }
    for (const k of kids) k.parent = prev.id;
  }
}
// a spline bone's curve: this bone, then each single visible line child (same side), while there is exactly one
function splineRun(ch, b) {
  const run = [b];
  for (let k; (k = run[run.length - 1].kids?.filter(x => !x.hidden)) && k.length === 1 && (k[0].shape ?? 'line') === 'line' && k[0].side === b.side && k[0].role !== 'weapon';) run.push(k[0]);
  return run;
}
// a fill bone's outline: this bone, then each single visible child below it (any line bone, whatever its side)
function fillRun(ch, b) {
  const run = [b];
  for (let k; (k = run[run.length - 1].kids?.filter(x => !x.hidden && x.shape !== 'socket')) && k.length === 1 && k[0].shape !== 'circle';) run.push(k[0]);
  return run;
}
// a Catmull-Rom curve through pts, its width easing from w0 to w1 (short strokes, round caps hide the joins)
function strokeSpline(ctx, pts, w0, w1) {
  const n = pts.length - 1, at = (p0, p1, p2, p3, t, k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t);
  for (let i = 0; i < n; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    for (let s = 0; s < 6; s++) {
      const a = s / 6, b = (s + 1) / 6;
      ctx.lineWidth = Math.max(0.5, w0 + (w1 - w0) * (i + a) / n); ctx.beginPath();
      ctx.moveTo(at(p0, p1, p2, p3, a, 0), at(p0, p1, p2, p3, a, 1)); ctx.lineTo(at(p0, p1, p2, p3, b, 0), at(p0, p1, p2, p3, b, 1)); ctx.stroke();
    }
  }
}

// The built-in poses and moves are written in the original 10-joint notation and mapped onto the bones by fromOld:
// torso: lean fwd. head: tilt fwd. arms (a{f,b}{U,L}) relative to torso, + swings forward / flexes elbow.
// legs (l{f,b}U) are world angles from straight down, + forward; l{f,b}L relative, − bends the knee.
function fromOld(o) {
  if (!o) return o;
  const p = {};
  if ('torso' in o) {
    const t = o.torso;
    p.waist = 180 - t; p.chest = 0;
    p.neck = (clamp(t, -25, 25) - t) * 0.5;     // the neck's level already half-follows small leans; cap big ones
  }
  if ('head' in o) p.head = -o.head;
  for (const s of ['f', 'b']) {
    const S = s.toUpperCase(), m = { [`a${s}U`]: 'uarm', [`a${s}L`]: 'farm', [`l${s}U`]: 'thigh', [`l${s}L`]: 'shin' };
    for (const k in m) if (k in o) p[m[k] + S] = o[k] - (m[k] === 'uarm' ? 180 : 0);
  }
  return p;
}

// the common attack shape: anticipation -> strike -> hold (both active) -> recover
const attack = (o, [ad, ap], [sd, sp], hd, rd) => ({ ...o, keys: [
  { d: ad, e: 'outQuad', p: ap },
  { d: sd, e: 'outExpo', p: sp, active: true, lunge: o.lunge },
  { d: hd, p: sp, active: true },
  { d: rd, e: 'inOutCubic', p: null },
] });
