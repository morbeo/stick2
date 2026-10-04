'use strict';
// ---------- effects: aura, fire, lightning and smoke drawn over a fighter's bones ----------
// drawing only (no random numbers of the fight: a hash of time and place), so a fight plays out the same with or without them
// an effect is { look, on, col, size }: a move's fx (the whole move), a key's fx (from that key on; false = none), a bone's fx (always, on that bone)
// each of them can also be a list of up to FX_MAX effects, stacked (a fire fist crackling with lightning); one effect alone stays a plain object
const FX_LOOKS = {
  aura: 'Aura: a pulsing glow around the bones, sparkles rising (powering up, a charged strike)',
  fire: 'Fire: flames licking up from the bones (a flaming kick, a fire fist)',
  lightning: 'Lightning: jagged bolts crackling around the bones (an electric attack)',
  smoke: 'Smoke: puffs rising and spreading from the bones (a vanish, a smouldering fist)',
  spikyAura: 'Spiky aura: a pulsing glow bristling with jagged spikes (a feral power-up, a dark aura)',
  bubbles: 'Bubbles: rising bubbles with a highlight, popping near the top (underwater, a toxic brew)',
  sparks: 'Sparks: a shower of bright streaks flying out and falling (grinding metal, a shower of impact sparks)',
  blood: 'Blood: a spray of droplets falling with gravity (a lethal slash)' };
const FX_ON = { strike: 'The striking limbs (the move\'s hit bones, the whole limb)', body: 'The whole body', arm: 'The arms', leg: 'The legs', head: 'The head', tail: 'The tails', weapon: 'The weapon' };
const FX_COLS = { blue: '60,140,240', cyan: '0,175,255', red: '220,50,35', orange: '240,110,30', gold: '230,170,30', purple: '160,80,220', green: '60,200,90', white: '235,235,240', grey: '130,125,120', dark: '45,35,55' };
const FX_AUTO = { aura: 'blue', fire: 'orange', lightning: 'cyan', smoke: 'grey', spikyAura: 'purple', bubbles: 'cyan', sparks: 'gold', blood: 'red' };
const FX_BACK = new Set(['aura', 'smoke', 'spikyAura']); // these draw behind the body; the rest (fire, lightning, bubbles, sparks) in front
const FX_MAX = 4, fxList = e => !e ? [] : [].concat(e).filter(Boolean).slice(0, FX_MAX);
const fxRnd = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };
// the effects playing at key i: the last key up to i that sets them (its list replaces the move's), else the move's
function fxAt(m, i) { for (let j = Math.min(i, m.keys.length - 1); j >= 0; j--) if (m.keys[j].fx !== undefined) return fxList(m.keys[j].fx); return fxList(m.fx); }
// the bones an effect wraps: whole limbs (strike: the limbs holding the move's hit bones)
function fxBones(ch, on, m) {
  if (on === 'body') return ch.bones;
  if (on && on !== 'strike') return (ch.chains[on] || []).flat();
  const ids = hitIds(m);
  return Object.values(ch.chains).flat().filter(c => c.some(b => ids.includes(b.id))).flat();
}
// what a fighter shows now: its bones' own effects, then its move's: [[effect, bones]]
function fxNow(ch, a) {
  const out = ch.bones.flatMap(b => fxList(b.fx).map(e => [e, [b]]));
  if (a?.m.keys) for (const e of fxAt(a.m, a.i)) out.push([e, fxBones(ch, e.on, a.m)]);
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
  spikyAura(ctx, segs, rgb, k, t) {
    const p = 1 + 0.15 * Math.sin(t * 9);
    for (const [w, a] of [[14, 0.1], [7, 0.18]]) { ctx.strokeStyle = ctx.fillStyle = `rgba(${rgb},${a})`; fxStroke(ctx, segs, w * k * p); }
    segs.forEach(({ i: si, ...s }) => {
      // outward: the segment's own perpendicular (a limb), or straight out from the centre (a ring bone)
      const dx = s.c ? 0 : s.b[0] - s.a[0], dy = s.c ? 0 : s.b[1] - s.a[1], len0 = Math.hypot(dx, dy) || 1, nx = -dy / len0, ny = dx / len0;
      fxPoints(s, 11).forEach(([x, y], j) => {
        const r = fxRnd(si, j), side = fxRnd(si + 50, j) > 0.5 ? 1 : -1;
        const [rx, ry] = s.c ? [(x - s.c[0]) / s.r, (y - s.c[1]) / s.r] : [nx * side, ny * side];
        const ph = (t * 1.4 + r) % 1, spike = (7 + 9 * r) * k * (1 - ph * 0.3), tx = -ry, ty = rx, bw = 1.6 * k;
        ctx.fillStyle = `rgba(${rgb},${0.65 * (1 - ph)})`;
        ctx.beginPath(); ctx.moveTo(x - tx * bw, y - ty * bw); ctx.lineTo(x + rx * spike, y + ry * spike); ctx.lineTo(x + tx * bw, y + ty * bw); ctx.closePath(); ctx.fill();
      });
    });
  },
  bubbles(ctx, segs, rgb, k, t) {
    segs.forEach(({ i: si, ...s }) => fxPoints(s, 9).forEach(([x, y], j) => {
      const r = fxRnd(si, j), ph = (t * (0.5 + 0.3 * r) + r) % 1, rad = (2 + 4 * r) * k * (0.5 + 0.5 * Math.sin(ph * Math.PI));
      const bx = x + Math.sin(t * 2 + r * 15) * 5 * k * ph, by = y - ph * 30 * k;
      ctx.fillStyle = `rgba(${rgb},${0.45 * (1 - ph * 0.7)})`; dot(ctx, bx, by, rad);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; dot(ctx, bx - rad * 0.35, by - rad * 0.35, rad * 0.3);
    }));
  },
  sparks(ctx, segs, rgb, k, t) {
    segs.forEach(({ i: si, ...s }) => fxPoints(s, 13).forEach(([x, y], j) => {
      for (let q = 0; q < 2; q++) {
        const r = fxRnd(si * 7 + q, j), ph = (t * (2 + r) + r * 3) % 0.6; // a brief flight, most of the cycle: gone
        const ang = fxRnd(si + q, j + 5) * 6.283, speed = (20 + 30 * r) * k;
        const at = d => [x + Math.cos(ang) * speed * d, y + Math.sin(ang) * speed * d + 40 * k * d * d]; // a little gravity arcs it down
        const [px, py] = at(ph), [tx, ty] = at(Math.max(0, ph - 0.08));
        ctx.strokeStyle = `rgba(${rgb},${0.9 * (1 - ph / 0.6)})`; ctx.lineWidth = 1.3 * k;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(px, py); ctx.stroke();
      }
    }));
  },
};
// ---------- custom looks: one generic particle draw, parametrized (count/life/speed/spread/angle/gravity/size/shape) ----------
// closed-form from (seed, t) like every look above (no stepped simulation), so the animate timeline can still scrub to any instant
function drawCustom(preset, ctx, segs, rgb, k, t) {
  const { count = 6, life = 0.5, speed = 60, spread = 40, angle = -90, gravity = 200, size0 = 3, size1 = 0, shape = 'dot' } = preset;
  const rad = angle * Math.PI / 180, spreadRad = spread * Math.PI / 180;
  segs.forEach(({ i: si, ...s }) => fxPoints(s, 14).forEach(([x, y], j) => {
    for (let q = 0; q < count; q++) {
      const r = fxRnd(si * 7 + q, j), r2 = fxRnd(si * 13 + q, j + 5);
      const ph = (t / Math.max(0.05, life) + q / count + r * 0.3) % 1, age = ph * life;
      const a = rad + (r2 - 0.5) * spreadRad, sp = speed * (0.7 + 0.6 * r) * k;
      const at = d => [x + Math.cos(a) * sp * d, y + Math.sin(a) * sp * d + 0.5 * gravity * k * d * d];
      const [px, py] = at(age), size = Math.max(0, size0 + (size1 - size0) * ph) * k, alpha = 1 - ph;
      if (size <= 0.05) continue;
      ctx.fillStyle = ctx.strokeStyle = `rgba(${rgb},${alpha})`;
      if (shape === 'line') { const [bx, by] = at(Math.max(0, age - life * 0.08)); ctx.lineWidth = Math.max(0.5, size * 0.4); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(px, py); ctx.stroke(); }
      else if (shape === 'ring') { ctx.lineWidth = Math.max(0.5, size * 0.3); ctx.beginPath(); ctx.arc(px, py, size, 0, 7); ctx.stroke(); }
      else dot(ctx, px, py, size);
    }
  }));
}
// ---------- my looks: custom presets built in the browser, saved as you go (same pattern as scenarios: myStore -> SCENARIOS) ----------
const LOOK_STORE = 'stick2.looks';
const myLooks = (() => { try { return JSON.parse(localStorage.getItem(LOOK_STORE)) || {}; } catch { return {}; } })();
function registerLook(name, preset) {
  FX_LOOKS[name] = `Custom: ${name}`; FX_DRAW[name] = (ctx, segs, rgb, k, t) => drawCustom(preset, ctx, segs, rgb, k, t);
  FX_AUTO[name] = preset.col || 'white'; // a move using this look without its own colour falls back to the look's own default
  if (preset.back) FX_BACK.add(name); else FX_BACK.delete(name);
}
for (const [name, preset] of Object.entries(myLooks)) registerLook(name, preset);
function saveLook(name, preset) { myLooks[name] = preset; registerLook(name, preset); saveLooks(); }
function deleteLook(name) { delete myLooks[name]; delete FX_LOOKS[name]; delete FX_DRAW[name]; delete FX_AUTO[name]; FX_BACK.delete(name); saveLooks(); }
function renameLook(from, to) { if (!myLooks[from] || to === from || FX_LOOKS[to]) return; const p = myLooks[from]; deleteLook(from); saveLook(to, p); }
function saveLooks() { try { localStorage.setItem(LOOK_STORE, JSON.stringify(myLooks)); } catch {} }
// the effects of fxNow over the points P: the ones behind the body (back) or in front
function drawFx(ctx, P, list, t, back) {
  for (const [e, bones] of list) if (FX_DRAW[e.look] && FX_BACK.has(e.look) === back) {
    ctx.save(); ctx.lineCap = ctx.lineJoin = 'round'; FX_DRAW[e.look](ctx, fxSegs(P, bones), FX_COLS[e.col] || FX_COLS[FX_AUTO[e.look]], e.size ?? 1, t * (e.spd ?? 1)); ctx.restore();
  }
}
// ---------- the shadow under a fighter: per character (def.shadow over SHADOW), drawing only ----------
// shape: ellipse (a blob on the floor), circle (a round blob), body (the figure squashed and sheared onto the floor), none
// w × h: the blob's half-width and half-height (px); for body w / 22 and h / 22 scale the figure's width and height
// alpha, col: how dark and what colour (an effect colour; black) · dx, dy: offset from the feet (px)
// lift: how fast it shrinks as the fighter rises (1: to 0.3 at 140 px up, 0: never) · skew: body only, how far it leans per px of height
const SHADOW = { shape: 'ellipse', w: 22, h: 4, alpha: 0.08, col: 'black', dx: 0, dy: 1, lift: 1, skew: 0.5 };
const SHADOW_SHAPES = { ellipse: 'A flat oval on the floor under the feet', circle: 'A round blob (w is its radius), as if lit from above',
  body: 'The figure itself squashed and sheared onto the floor (h squashes it, skew leans it)', none: 'No shadow' };
let shadowCv = null; // the body shadow is drawn opaque here first, then laid down at once, so where bones overlap it doesn't get darker
function drawShadow(ctx, f) {
  const sh = f.ch.shadow || SHADOW, s = Math.max(0.3, 1 + sh.lift * f.y / 200), x = f.x + sh.dx, y = f.groundY + sh.dy, rgb = FX_COLS[sh.col] || '0,0,0';
  if (sh.shape === 'none' || !(sh.alpha > 0)) return;
  if (sh.shape !== 'body') { ctx.fillStyle = `rgba(${rgb},${sh.alpha})`; ctx.beginPath(); ctx.ellipse(x, y, sh.w * s, (sh.shape === 'circle' ? sh.w : sh.h) * s, 0, 0, 7); ctx.fill(); return; }
  const cv = typeof document === 'object' && ctx.canvas?.width ? shadowCv ??= document.createElement('canvas') : null, c = cv ? cv.getContext('2d') : ctx, col = `rgb(${rgb})`;
  if (cv) {
    if (cv.width !== ctx.canvas.width || cv.height !== ctx.canvas.height) Object.assign(cv, { width: ctx.canvas.width, height: ctx.canvas.height });
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); c.setTransform(ctx.getTransform());
  }
  c.save(); if (!cv) c.globalAlpha = sh.alpha; // (no scratch canvas, as in the tests: straight onto the canvas)
  // the feet stay put; a point h px above them lands h × h / 22 below the floor line and h × skew aside
  c.translate(x, y); c.transform(s * sh.w / 22, 0, -s * sh.skew, -s * sh.h / 22, 0, 0); c.translate(-f.x, -(f.groundY + f.y));
  drawFigure(c, f.ch, f.body(), col, col, 0, () => col); c.restore();
  if (cv) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha *= sh.alpha; ctx.drawImage(cv, 0, 0); ctx.restore(); }
}
