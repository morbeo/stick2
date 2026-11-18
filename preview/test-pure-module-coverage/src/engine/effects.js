'use strict';
// ---------- special move effects: move.effects = [{ name, kind, look, anchor, offset, at, life, motion, parts, props }] ----------
// One list for everything a special move puts into the world. kind: shot (flies), beam (held line), aura (a look on bones).
// Older moves keep their shot / beam / fx fields: moveEffects reads those as one-effect, one-part lists, so the sim
// behaves exactly as before. A part is a shape relative to the effect's centre (dx, dy flip with facing):
//   { name, shape: 'circle' | 'capsule', dx, dy, r, dx2, dy2 (capsule's other end), hits: true | false }
// Only parts with hits collide (with fighters and with other effects); the others are drawn only.
const EFFECT_KINDS = { shot: 'Flies out from its anchor', beam: 'A straight line held out from its anchor', aura: 'A look drawn on bones, no collision' };
const PART_SHAPES = { circle: 'A ball: dx, dy, r', capsule: 'A rounded line from dx, dy to dx2, dy2, r thick' };
const EFFECT_PROPS = { pierce: 'Foes it can hit before it is spent', durability: 'Clashes with an opposing effect it survives', unblockable: 'Cannot be blocked or parried', noClash: 'Passes through opposing shots instead of clashing',
  grow: 'Size by the end of its life (1 = stays the same, 2 = doubles)', homing: 'Turns toward the nearest foe, degrees per second (0 = flies straight)',
  reflect: 'A parry can send it back (with the reflectShots setting); off: a parry only stops it',
  hitSpark: 'An extra spark where it lands a hit', endSpark: 'A spark where it fizzles out at the end of its life',
  split: 'At the end of its life it bursts into this many smaller shots', splitSpread: 'The fan (degrees) the split shots spread across, centred on its heading' };

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
      parts: o.parts || [corePart(o.size ?? 12)], props: { pierce: o.pierce || 1, durability: o.durability || 1, maxAlive: o.maxAlive ?? 1,
        unblockable: !!o.unblockable, noClash: !!o.noClash, grow: o.grow ?? 1, homing: o.homing || 0,
        reflect: o.reflect !== false, hitSpark: o.hitSpark || null, endSpark: o.endSpark || null, split: o.split || 0, splitSpread: o.splitSpread ?? 90 } });
  }
  if (m.beam || m.keys?.some(k => k.beam)) out.push({ name: 'beam', kind: 'beam', ...m.beam, parts: m.beam?.parts || [{ name: 'core', from: 0, to: 1, w: 1, hits: true }] });
  for (const fx of [m.fx].flat().filter(Boolean)) out.push({ name: fx.look, kind: 'aura', look: fx.look, anchor: fx.on, col: fx.col });
  return out;
}
const moveShot = m => moveEffects(m).find(e => e.kind === 'shot') || null;

// a live shot's hitting parts as swept segments [[x0, y0], [x1, y1], r] in world space, scaled by k (charge), moved by
// (mx, my) this frame. A circle sweeps from where it was to where it is (as shots always have); a capsule is its line now.
function shotHitShapes(s, mx = 0, my = 0) {
  const out = [];
  for (const p of s.parts || [corePart(s.r)]) if (p.hits !== false) {
    const k = s.parts ? s.k ?? 1 : 1, x = s.x + s.dir * (p.dx || 0) * k, y = s.y + (p.dy || 0) * k, r = (p.r ?? 12) * k;
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

// ---------- drawing (also the animate tab's preview): looks ki (a blue ball), fire (flickering orange), dark (purple),
// wave (a crescent, sonic boom), star (a spinning shuriken) ----------
const SHOT_COLS = { ki: ['80,160,255', '#2c6fb0'], fire: ['240,140,30', '#c0392b'], dark: ['142,68,173', '#2c1338'], wave: ['230,200,60', '#b07a2c'], star: ['120,120,130', '#444'] };
// true for the default: one hitting ball at the centre (no parts of its own)
const isCorePart = parts => !parts || parts.length === 1 && parts[0].shape !== 'capsule' && !parts[0].dx && !parts[0].dy && parts[0].hits !== false;
// one ball of a look, radius r, at the origin
function drawShotLook(ctx, look, r0, t, dir) {
  const [rgb, edge] = SHOT_COLS[look] || SHOT_COLS.ki, r = r0 * (look === 'fire' ? 1 + 0.12 * Math.sin(t * 45) : 1);
  if (look === 'star') {
    ctx.save(); ctx.rotate(t * 25 * dir); ctx.fillStyle = edge; ctx.beginPath();
    for (let k = 0; k < 8; k++) { const q = k * Math.PI / 4, l = k % 2 ? r * 0.35 : r; ctx.lineTo(Math.cos(q) * l, Math.sin(q) * l); }
    ctx.fill(); ctx.restore();
  } else if (look === 'wave') {
    ctx.save(); ctx.scale(dir, 1); ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) { ctx.strokeStyle = `rgba(${rgb},${0.9 - k * 0.3})`; ctx.lineWidth = 4 - k; ctx.beginPath(); ctx.arc(-k * 9, 0, r * 1.4, -1.1, 1.1); ctx.stroke(); }
    ctx.restore();
  } else {
    for (let k = 3; k > 0; k--) { ctx.fillStyle = `rgba(${rgb},${0.12 * (4 - k)})`; ctx.beginPath(); ctx.arc(-dir * k * r * 0.6, 0, r * (1 - k * 0.15), 0, 7); ctx.fill(); } // trail
    ctx.fillStyle = `rgba(${rgb},.45)`; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(${rgb},.9)`; ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, 7); ctx.fill();
  }
}
// one part, relative to the shot's centre: a ball of the look, or a capsule (a glowing rounded line); a cosmetic part is drawn fainter
function drawShotPart(ctx, p, look, k, t, dir) {
  const [rgb] = SHOT_COLS[look] || SHOT_COLS.ki, x = dir * (p.dx || 0) * k, y = (p.dy || 0) * k, r = (p.r ?? 12) * k;
  ctx.save(); ctx.globalAlpha = p.hits === false ? 0.55 : 1;
  if (p.shape === 'capsule') {
    const x2 = dir * (p.dx2 || 0) * k, y2 = (p.dy2 || 0) * k; ctx.lineCap = 'round';
    for (const [w, a] of [[r * 3, 0.25], [r * 2, 0.6], [r * 0.8, 0.95]]) { ctx.strokeStyle = a > 0.9 ? '#fff' : `rgba(${rgb},${a})`; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); }
  } else if (p.hits === false) { // a cosmetic ball: a soft glow of the look's colour, not a second shot
    for (const [f, a] of [[1, 0.18], [0.7, 0.22], [0.4, 0.3]]) { ctx.fillStyle = `rgba(${rgb},${a})`; ctx.beginPath(); ctx.arc(x, y, r * f, 0, 7); ctx.fill(); }
  } else { ctx.translate(x, y); drawShotLook(ctx, look, r, t, dir); }
  ctx.restore();
}

// ---------- beam parts: stretches of the beam, from / to as fractions of its range (0 = the muzzle, 1 = its far end), w its width
// multiplier; only parts with hits collide, so a beam can hit only at its tip, or carry a wide cosmetic glow ----------
// a live beam's hitting stretches as segments [[x0, y], [x1, y], r], clipped to the arena like the beam itself
// (an angled beam, beam.angle / angleTo: its direction now, degrees above level, swept across its duration)
const beamAngle = b => (b.ang0 || 0) + ((b.ang1 ?? b.ang0 ?? 0) - (b.ang0 || 0)) * Math.min(1, b.t / (b.dur || 1));
function beamPoint(b, f, lo = -1e9, hi = 1e9) { const a = beamAngle(b) * Math.PI / 180;
  return [Math.min(hi, Math.max(lo, b.x + b.dir * Math.cos(a) * b.range * f)), b.y - Math.sin(a) * b.range * f]; }
function beamHitShapes(b, lo = 20, hi = 1e9) {
  const out = [];
  for (const p of b.parts || [{ from: 0, to: 1, w: 1 }]) if (p.hits !== false) out.push([beamPoint(b, p.from || 0, lo, hi), beamPoint(b, p.to ?? 1, lo, hi), b.w * (p.w ?? 1) / 2]);
  return out;
}

// a fire beam's stretch from f0 to f1 (fractions along it, at(f) its point): overlapping puffs that widen and redden toward
// the end and flicker with time (drawing only: a hash of the puff index and the time, no random numbers)
function drawFireStream(ctx, at, f0, f1, bw, alpha, t) {
  const n = Math.max(6, Math.round((f1 - f0) * 60)), fl = (i, k) => Math.sin(i * 12.9898 + t * k) * 0.5 + 0.5;
  for (let i = n; i >= 0; i--) {
    const f = f0 + (f1 - f0) * i / n, u = i / n, [x, y] = at(f), r = bw * (0.45 + u * 0.9) * (0.85 + fl(i, 31) * 0.3), j = (fl(i, 17) - 0.5) * bw * 0.5;
    for (const [m, c, al] of [[1.6, '200,60,20', 0.18], [1, '240,140,30', 0.55], [0.5, '255,220,120', 0.7]]) {
      ctx.fillStyle = `rgba(${c},${al * alpha * (1 - u * 0.35)})`; ctx.beginPath(); ctx.arc(x, y + j, r * m * 0.6, 0, 7); ctx.fill(); }
  }
}
