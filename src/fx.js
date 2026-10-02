'use strict';
// ---------- effects: aura, fire, lightning and smoke drawn over a fighter's bones ----------
// drawing only (no random numbers of the fight: a hash of time and place), so a fight plays out the same with or without them
// an effect is { look, on, col, size }: a move's fx (the whole move), a key's fx (from that key on; false = none), a bone's fx (always, on that bone)
const FX_LOOKS = {
  aura: 'Aura: a pulsing glow around the bones, sparkles rising (powering up, a charged strike)',
  fire: 'Fire: flames licking up from the bones (a flaming kick, a fire fist)',
  lightning: 'Lightning: jagged bolts crackling around the bones (an electric attack)',
  smoke: 'Smoke: puffs rising and spreading from the bones (a vanish, a smouldering fist)' };
const FX_ON = { strike: 'The striking limbs (the move\'s hit bones, the whole limb)', body: 'The whole body', arm: 'The arms', leg: 'The legs', head: 'The head', tail: 'The tails', weapon: 'The weapon' };
const FX_COLS = { blue: '60,140,240', cyan: '0,175,255', red: '220,50,35', orange: '240,110,30', gold: '230,170,30', purple: '160,80,220', green: '60,200,90', white: '235,235,240', grey: '130,125,120', dark: '45,35,55' };
const FX_AUTO = { aura: 'blue', fire: 'orange', lightning: 'cyan', smoke: 'grey' }, FX_BACK = new Set(['aura', 'smoke']); // aura and smoke draw behind the body
const fxRnd = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };
// the effect playing at key i: the last key up to i that sets one, else the move's
function fxAt(m, i) { for (let j = Math.min(i, m.keys.length - 1); j >= 0; j--) if (m.keys[j].fx !== undefined) return m.keys[j].fx || null; return m.fx || null; }
// the bones an effect wraps: whole limbs (strike: the limbs holding the move's hit bones)
function fxBones(ch, on, m) {
  if (on === 'body') return ch.bones;
  if (on && on !== 'strike') return (ch.chains[on] || []).flat();
  const ids = hitIds(m);
  return Object.values(ch.chains).flat().filter(c => c.some(b => ids.includes(b.id))).flat();
}
// what a fighter shows now: its bones' own effects, then its move's: [[effect, bones]]
function fxNow(ch, a) {
  const out = ch.bones.filter(b => b.fx).map(b => [b.fx, [b]]), e = a?.m.keys && fxAt(a.m, a.i);
  if (e) out.push([e, fxBones(ch, e.on, a.m)]);
  return out;
}
// the bones as segments (a circle bone as a ring) and points spaced about gap apart along them
// (each seeded by its bone's id, so a bone's flames and bolts are its own however the effects are split)
const fxSeed = id => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7);
const fxSegs = (P, bones) => bones.filter(b => P[b.id]).map(b => ({ i: fxSeed(b.id), w: b.thick, ...b.shape === 'circle' ? { c: P[b.id], r: b.len } : { a: P[b.parent || 'hip'], b: P[b.id] } }));
function fxPoints(s, gap) {
  if (s.c) { const n = Math.max(4, Math.round(2 * Math.PI * s.r / gap)); return Array.from({ length: n }, (_, i) => [s.c[0] + Math.cos(i / n * 6.283) * s.r, s.c[1] + Math.sin(i / n * 6.283) * s.r]); }
  const n = Math.max(1, Math.round(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) / gap));
  return Array.from({ length: n + 1 }, (_, i) => [s.a[0] + (s.b[0] - s.a[0]) * i / n, s.a[1] + (s.b[1] - s.a[1]) * i / n]);
}
// the bones thickened by w (strokeStyle and fillStyle set by the caller)
function fxStroke(ctx, segs, w) {
  for (const s of segs) {
    ctx.beginPath();
    if (s.c) { ctx.arc(s.c[0], s.c[1], s.r + w / 2, 0, 7); ctx.fill(); continue; }
    ctx.lineWidth = s.w + w; ctx.moveTo(s.a[0], s.a[1]); ctx.lineTo(s.b[0] + 0.01, s.b[1]); ctx.stroke();
  }
}
const dot = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, 7); ctx.fill(); };
// each look: (ctx, segments, rgb, size, time)
const FX_DRAW = {
  aura(ctx, segs, rgb, k, t) {
    const p = 1 + 0.15 * Math.sin(t * 9);
    for (const [w, a] of [[18, 0.12], [10, 0.18], [5, 0.28]]) { ctx.strokeStyle = ctx.fillStyle = `rgba(${rgb},${a})`; fxStroke(ctx, segs, w * k * p); }
    segs.forEach(({ i: si, ...s }) => fxPoints(s, 14).forEach(([x, y], j) => {
      const r = fxRnd(si, j), ph = (t * 0.9 + r) % 1;
      ctx.fillStyle = `rgba(${rgb},${0.7 * (1 - ph)})`; dot(ctx, x + (r - 0.5) * 16 * k, y - ph * 32 * k, 1.6 * k);
    }));
  },
  fire(ctx, segs, rgb, k, t) {
    // a tongue of flame: round at the base, bending to a tip that sways
    const tongue = (x, y, w, h, sway) => { ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w, y - h * 0.55, x + sway, y - h); ctx.quadraticCurveTo(x + w, y - h * 0.55, x + w, y); ctx.arc(x, y, w, 0, Math.PI); ctx.fill(); };
    segs.forEach(({ i: si, ...s }) => fxPoints(s, 6).forEach(([x, y], j) => {
      const r = fxRnd(si, j), f = 0.65 + 0.35 * Math.sin(t * (13 + 6 * r) + r * 40), h = (13 + 9 * r) * k * f, sway = Math.sin(t * 9 + r * 20) * 4 * k;
      ctx.fillStyle = `rgba(${rgb},0.5)`; tongue(x, y, 4 * k, h, sway);
      ctx.fillStyle = 'rgba(255,215,70,0.65)'; tongue(x, y, 2.2 * k, h * 0.55, sway * 0.6);
      const ph = (t * (1.2 + r) + r * 3) % 1; // an ember rising off the top
      if (r > 0.6) { ctx.fillStyle = `rgba(${rgb},${0.8 * (1 - ph)})`; dot(ctx, x + sway * 2 * ph, y - h - ph * 18 * k, 1.3 * k); }
    }));
  },
  lightning(ctx, segs, rgb, k, t) {
    const q = Math.floor(t * 24); // the bolts jump to new places 24 times a second
    ctx.strokeStyle = ctx.fillStyle = `rgba(${rgb},0.16)`; fxStroke(ctx, segs, 7 * k);
    segs.forEach(({ i: si, ...s }) => fxPoints(s, 16).forEach(([x, y], j) => {
      if (fxRnd(q + si, j) > 0.5) return;
      const a = fxRnd(q * 3 + si, j + 9) * 6.283, len = (10 + 16 * fxRnd(q, si * 5 + j)) * k, pts = [[x, y]];
      for (let n = 1; n <= 4; n++) pts.push([x + Math.cos(a) * len * n / 4 + (fxRnd(q + n, j + si) - 0.5) * 9 * k, y + Math.sin(a) * len * n / 4 + (fxRnd(q - n, j + si) - 0.5) * 9 * k]);
      for (const [w, c] of [[3.5 * k, `rgba(${rgb},0.85)`], [1.2 * k, 'rgba(255,255,255,0.95)']]) {
        ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath(); for (const [px, py] of pts) ctx.lineTo(px, py); ctx.stroke();
      }
    }));
  },
  smoke(ctx, segs, rgb, k, t) {
    segs.forEach(({ i: si, ...s }) => fxPoints(s, 10).forEach(([x, y], j) => {
      for (let q = 0; q < 2; q++) {
        const r = fxRnd(si * 5 + q, j + 3), ph = (t * (0.5 + 0.4 * r) + r) % 1;
        ctx.fillStyle = `rgba(${rgb},${0.3 * (1 - ph) * Math.min(1, ph * 5)})`;
        dot(ctx, x + (r - 0.5) * 18 * k * ph + Math.sin(t * 2 + r * 9) * 3 * k, y - ph * 36 * k, (3 + 9 * ph) * k);
      }
    }));
  },
};
// the effects of fxNow over the points P: the ones behind the body (back) or in front
function drawFx(ctx, P, list, t, back) {
  for (const [e, bones] of list) if (FX_DRAW[e.look] && FX_BACK.has(e.look) === back) {
    ctx.save(); ctx.lineCap = ctx.lineJoin = 'round'; FX_DRAW[e.look](ctx, fxSegs(P, bones), FX_COLS[e.col] || FX_COLS[FX_AUTO[e.look]], e.size ?? 1, t); ctx.restore();
  }
}
