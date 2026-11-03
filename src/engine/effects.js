'use strict';
// ---------- special move effects: move.effects = [{ name, kind, look, anchor, offset, at, life, motion, parts, props }] ----------
// One list for everything a special move puts into the world. kind: shot (flies), beam (held line), aura (a look on bones).
// Older moves keep their shot / beam / fx fields: moveEffects reads those as one-effect, one-part lists, so the sim
// behaves exactly as before. A part is a shape relative to the effect's centre (dx, dy flip with facing):
//   { name, shape: 'circle' | 'capsule', dx, dy, r, dx2, dy2 (capsule's other end), hits: true | false }
// Only parts with hits collide (with fighters and with other effects); the others are drawn only.
const EFFECT_KINDS = { shot: 'Flies out from its anchor', beam: 'A straight line held out from its anchor', aura: 'A look drawn on bones, no collision' };
const PART_SHAPES = { circle: 'A ball: dx, dy, r', capsule: 'A rounded line from dx, dy to dx2, dy2, r thick' };
const EFFECT_PROPS = { pierce: 'Foes it can hit before it is spent', durability: 'Clashes with an opposing effect it survives', unblockable: 'Cannot be blocked', noClash: 'Passes through opposing effects' };

// the default single part: one hitting circle the effect's size, centred
const corePart = r => ({ name: 'core', shape: 'circle', dx: 0, dy: 0, r, hits: true });

// a move's effects: its own list, or one read from its older shot / beam / fx fields
function moveEffects(m) {
  if (!m) return [];
  if (m.effects) return m.effects;
  const out = [];
  if (m.shot || m.keys?.some(k => k.shoot)) { // a shoot key with no shot field fires the default ki shot
    const o = m.shot || {};
    out.push({ name: 'shot', kind: 'shot', look: o.look || 'ki', life: o.life ?? 2,
      motion: { speed: o.speed ?? 360, angle: o.angle || 0, gravity: o.gravity || 0, bounce: o.bounce || 0, count: o.count || 1, spread: o.spread || 0 },
      parts: o.parts || [corePart(o.size ?? 12)], props: { pierce: o.pierce || 1, durability: o.durability || 1, maxAlive: o.maxAlive ?? 1 } });
  }
  if (m.beam) out.push({ name: 'beam', kind: 'beam', ...m.beam });
  for (const fx of [m.fx].flat().filter(Boolean)) out.push({ name: fx.look, kind: 'aura', look: fx.look, anchor: fx.on, col: fx.col });
  return out;
}
const moveShot = m => moveEffects(m).find(e => e.kind === 'shot') || null;

// a live shot's hitting parts as swept segments [[x0, y0], [x1, y1], r] in world space, scaled by k (charge), moved by
// (mx, my) this frame. A circle sweeps from where it was to where it is (as shots always have); a capsule is its line now.
function shotHitShapes(s, mx = 0, my = 0) {
  const out = [];
  for (const p of s.parts) if (p.hits !== false) {
    const k = s.k ?? 1, x = s.x + s.dir * (p.dx || 0) * k, y = s.y + (p.dy || 0) * k, r = (p.r ?? 12) * k;
    if (p.shape === 'capsule') out.push([[x, y], [s.x + s.dir * (p.dx2 || 0) * k, s.y + (p.dy2 || 0) * k], r]);
    else out.push([[x - mx, y - my], [x, y], r]);
  }
  return out;
}
// whether two live shots' hitting parts touch
// (two balls use the square overlap shots always had, so older fights replay the same)
function shotsTouch(a, b) {
  for (const s of shotHitShapes(a)) for (const t of shotHitShapes(b)) {
    const balls = s[0][0] === s[1][0] && s[0][1] === s[1][1] && t[0][0] === t[1][0] && t[0][1] === t[1][1];
    if (balls ? Math.abs(s[1][0] - t[1][0]) < s[2] + t[2] && Math.abs(s[1][1] - t[1][1]) < s[2] + t[2] : distSegSeg(s[0], s[1], t[0], t[1]) < s[2] + t[2]) return true;
  }
  return false;
}
