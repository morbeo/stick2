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
const FX_AUTO = {}; // every look's default colour; built-ins fill theirs in below (applyBuiltin), customs on registerLook
const FX_BACK = new Set(); // looks that draw behind the body; built-ins fill in below, customs on registerLook
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
// ---------- built-in looks: hand-coded draws, each with a few tunable constants, editable + revertible like built-in sounds ----------
// BASE_BUILTIN holds the shipped defaults (never mutated); FX_BUILTIN is the live table (shipped + any saved override) that
// every FX_DRAW function below reads; BUILTIN_SLIDERS gives the looks panel each knob's range and tip (see sound.js BASE_SOUNDS/SOUNDS)
const BASE_BUILTIN = {
  aura: { col: 'blue', back: true, params: { gap: 14, pulseSpeed: 9, pulseAmt: 0.15, riseSpeed: 0.9, reach: 16, size: 1.6, glowSize: 1, glowAlpha: 1 } },
  fire: { col: 'orange', back: false, params: { gap: 6, height: 13, heightVar: 9, sway: 4, flicker: 13, emberHeight: 18 } },
  lightning: { col: 'cyan', back: false, params: { gap: 16, rate: 24, length: 16, jitter: 9, boltWidth: 3.5, glowWidth: 7 } },
  smoke: { col: 'grey', back: true, params: { gap: 10, speed: 0.5, size: 9, rise: 36, spread: 18 } },
  spikyAura: { col: 'purple', back: true, params: { gap: 11, pulseSpeed: 9, pulseAmt: 0.15, rotSpeed: 1.4, spikeBase: 7, spikeLen: 24, thickness: 1.6, shrink: 0.3, glowSize: 1, glowAlpha: 1 } },
  bubbles: { col: 'cyan', back: false, params: { gap: 9, speed: 0.5, size: 4, rise: 30, sway: 5 } },
  sparks: { col: 'gold', back: false, params: { gap: 13, speed: 2, reach: 30, gravity: 40, life: 0.6 } },
  blood: { col: 'red', back: false, params: { gap: 12, speed: 1.5, size: 3, gravity: 250, reach: 60 } },
};
const BUILTIN_SLIDERS = {
  aura: [['gap', { min: 4, max: 30, step: 1 }, 'Spacing between sparkle points along the bones (px); lower = denser'],
    ['pulseSpeed', { min: 1, max: 20, step: 0.5 }, 'How fast the glow pulses (Hz)'],
    ['pulseAmt', { min: 0, max: 0.6, step: 0.01 }, 'How much the glow swells and shrinks as it pulses', 'pulse amount'],
    ['riseSpeed', { min: 0.1, max: 3, step: 0.05 }, 'How fast sparkles rise'],
    ['reach', { min: 4, max: 60, step: 1 }, 'How far sparkles spread sideways and rise (px)'],
    ['size', { min: 0.5, max: 5, step: 0.1 }, 'Sparkle size'],
    ['glowSize', { min: 0, max: 3, step: 0.1 }, 'Glow ring width, relative to the shipped look', 'glow size'],
    ['glowAlpha', { min: 0, max: 3, step: 0.1 }, 'Glow ring opacity, relative to the shipped look', 'glow opacity']],
  fire: [['gap', { min: 2, max: 20, step: 1 }, 'Spacing between flame tongues (px); lower = denser'],
    ['height', { min: 4, max: 40, step: 1 }, 'Flame height (px)'],
    ['heightVar', { min: 0, max: 30, step: 1 }, 'How much taller some tongues randomly get (px)', 'height variance'],
    ['sway', { min: 0, max: 12, step: 0.5 }, 'Side-to-side sway (px)'],
    ['flicker', { min: 4, max: 30, step: 1 }, 'Flicker speed (Hz)'],
    ['emberHeight', { min: 0, max: 50, step: 1 }, 'How high embers rise off the tips (px)', 'ember height']],
  lightning: [['gap', { min: 6, max: 30, step: 1 }, 'Spacing between bolt origins along the bones (px)'],
    ['rate', { min: 4, max: 48, step: 1 }, 'How often bolts jump to new places (Hz)'],
    ['length', { min: 2, max: 60, step: 1 }, 'Bolt length (px)'],
    ['jitter', { min: 0, max: 30, step: 1 }, 'Bolt jaggedness (px)'],
    ['boltWidth', { min: 0.5, max: 12, step: 0.5 }, 'Bolt thickness (px)', 'bolt width'],
    ['glowWidth', { min: 0, max: 24, step: 1 }, 'Faint glow thickness around the bones (px)', 'glow width']],
  smoke: [['gap', { min: 4, max: 24, step: 1 }, 'Spacing between puffs along the bones (px)'],
    ['speed', { min: 0.1, max: 2, step: 0.05 }, 'How fast puffs rise'],
    ['size', { min: 2, max: 20, step: 0.5 }, 'Puff size'],
    ['rise', { min: 10, max: 80, step: 2 }, 'How far puffs rise before looping (px)'],
    ['spread', { min: 0, max: 40, step: 1 }, 'How far puffs drift sideways as they rise (px)']],
  spikyAura: [['gap', { min: 4, max: 24, step: 1 }, 'Spacing between spikes along the bones (px)'],
    ['pulseSpeed', { min: 1, max: 20, step: 0.5 }, 'How fast the inner glow pulses (Hz)'],
    ['pulseAmt', { min: 0, max: 0.6, step: 0.01 }, 'How much the glow swells and shrinks as it pulses', 'pulse amount'],
    ['rotSpeed', { min: 0.2, max: 6, step: 0.1 }, 'How fast each spike cycles through its length', 'cycle speed'],
    ['spikeBase', { min: 0, max: 100, step: 1 }, 'Every spike\'s minimum length (px)', 'spike base'],
    ['spikeLen', { min: 0, max: 150, step: 1 }, 'How much extra length spikes randomly get, on top of the base (px)', 'spike length'],
    ['thickness', { min: 0.2, max: 10, step: 0.1 }, 'Spike thickness at the base (px)'],
    ['shrink', { min: 0, max: 1, step: 0.05 }, 'How much a spike shrinks over its cycle (0 = stays full length, 1 = shrinks to nothing)'],
    ['glowSize', { min: 0, max: 3, step: 0.1 }, 'Inner glow ring width, relative to the shipped look', 'glow size'],
    ['glowAlpha', { min: 0, max: 3, step: 0.1 }, 'Inner glow ring opacity, relative to the shipped look', 'glow opacity']],
  bubbles: [['gap', { min: 4, max: 20, step: 1 }, 'Spacing between bubbles along the bones (px)'],
    ['speed', { min: 0.1, max: 2, step: 0.05 }, 'How fast bubbles rise'],
    ['size', { min: 1, max: 12, step: 0.5 }, 'Bubble size'],
    ['rise', { min: 8, max: 60, step: 2 }, 'How far bubbles rise before popping (px)'],
    ['sway', { min: 0, max: 20, step: 1 }, 'Side-to-side drift as bubbles rise (px)']],
  sparks: [['gap', { min: 4, max: 26, step: 1 }, 'Spacing between spark points along the bones (px)'],
    ['speed', { min: 0.5, max: 6, step: 0.1 }, 'How fast sparks fly out'],
    ['reach', { min: 5, max: 60, step: 1 }, 'How far sparks fly (px)'],
    ['gravity', { min: 0, max: 120, step: 5 }, 'Downward pull on sparks (px/s²)'],
    ['life', { min: 0.1, max: 2, step: 0.05 }, 'How long each spark\'s flight lasts before it loops (s)']],
  blood: [['gap', { min: 4, max: 24, step: 1 }, 'Spacing between droplet points along the bones (px)'],
    ['speed', { min: 0.3, max: 4, step: 0.1 }, 'How fast droplets fly out and fall'],
    ['size', { min: 1, max: 8, step: 0.5 }, 'Droplet size'],
    ['gravity', { min: 50, max: 600, step: 10 }, 'Downward pull on droplets (px/s²)'],
    ['reach', { min: 0, max: 150, step: 5 }, 'How far droplets fly out (px)']],
};
const BUILTIN_STORE = 'stick2.builtinFx';
const builtinFx = (() => { try { return JSON.parse(localStorage.getItem(BUILTIN_STORE)) || {}; } catch { return {}; } })();
const FX_BUILTIN = {};
function applyBuiltin(name) {
  const o = builtinFx[name] || {}, base = BASE_BUILTIN[name];
  FX_BUILTIN[name] = { col: o.col ?? base.col, back: o.back ?? base.back, params: { ...base.params, ...o.params } };
  FX_AUTO[name] = FX_BUILTIN[name].col;
  if (FX_BUILTIN[name].back) FX_BACK.add(name); else FX_BACK.delete(name);
}
for (const name in BASE_BUILTIN) applyBuiltin(name);
function saveBuiltinFx(name, patch) {
  builtinFx[name] = { ...builtinFx[name], ...patch, params: { ...builtinFx[name]?.params, ...patch.params } };
  applyBuiltin(name); saveBuiltinFxStore();
}
function resetBuiltinFx(name) { delete builtinFx[name]; applyBuiltin(name); saveBuiltinFxStore(); }
function saveBuiltinFxStore() { try { localStorage.setItem(BUILTIN_STORE, JSON.stringify(builtinFx)); } catch {} }
// wraps a built-in's draw with its live (tunable) params, merged with an optional override (the looks panel's experiment grid previews a
// value without saving it); a move's own fx still just calls FX_DRAW[name](ctx, segs, rgb, k, t) with no override, unaffected.
// BUILTIN_RAW keeps the bare (ctx, segs, rgb, k, t, params) function too, so a custom look can reuse the exact same algorithm with its
// own independent params (duplicateBuiltinLook): editing a built-in only ever changes BASE_BUILTIN's live overrides, never a custom's copy
const BUILTIN_RAW = {};
function builtinDraw(name, draw) { BUILTIN_RAW[name] = draw; FX_DRAW[name] = (ctx, segs, rgb, k, t, override) => draw(ctx, segs, rgb, k, t, { ...FX_BUILTIN[name].params, ...override }); }
// each look: (ctx, segments, rgb, size, time)
const FX_DRAW = {};
// a glow layer list [[width,alpha], …] scaled by a size and alpha multiplier (aura, spikyAura: both have an inner glow)
const glowLayers = (base, sizeMul, alphaMul) => base.map(([w, a]) => [w * sizeMul, a * alphaMul]);
builtinDraw('aura', (ctx, segs, rgb, k, t, pm) => {
  const p = 1 + pm.pulseAmt * Math.sin(t * pm.pulseSpeed);
  for (const [w, a] of glowLayers([[18, 0.12], [10, 0.18], [5, 0.28]], pm.glowSize, pm.glowAlpha)) { ctx.strokeStyle = ctx.fillStyle = `rgba(${rgb},${a})`; fxStroke(ctx, segs, w * k * p); }
  segs.forEach(({ i: si, ...s }) => fxPoints(s, pm.gap).forEach(([x, y], j) => {
    const r = fxRnd(si, j), ph = (t * pm.riseSpeed + r) % 1;
    ctx.fillStyle = `rgba(${rgb},${0.7 * (1 - ph)})`; dot(ctx, x + (r - 0.5) * pm.reach * k, y - ph * pm.reach * 2 * k, pm.size * k);
  }));
});
builtinDraw('fire', (ctx, segs, rgb, k, t, pm) => {
  // a tongue of flame: round at the base, bending to a tip that sways
  const tongue = (x, y, w, h, sway) => { ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w, y - h * 0.55, x + sway, y - h); ctx.quadraticCurveTo(x + w, y - h * 0.55, x + w, y); ctx.arc(x, y, w, 0, Math.PI); ctx.fill(); };
  segs.forEach(({ i: si, ...s }) => fxPoints(s, pm.gap).forEach(([x, y], j) => {
    const r = fxRnd(si, j), f = 0.65 + 0.35 * Math.sin(t * (pm.flicker + 6 * r) + r * 40), h = (pm.height + pm.heightVar * r) * k * f, sway = Math.sin(t * 9 + r * 20) * pm.sway * k;
    ctx.fillStyle = `rgba(${rgb},0.5)`; tongue(x, y, 4 * k, h, sway);
    ctx.fillStyle = 'rgba(255,215,70,0.65)'; tongue(x, y, 2.2 * k, h * 0.55, sway * 0.6);
    const ph = (t * (1.2 + r) + r * 3) % 1; // an ember rising off the top
    if (r > 0.6) { ctx.fillStyle = `rgba(${rgb},${0.8 * (1 - ph)})`; dot(ctx, x + sway * 2 * ph, y - h - ph * pm.emberHeight * k, 1.3 * k); }
  }));
});
builtinDraw('lightning', (ctx, segs, rgb, k, t, pm) => {
  const q = Math.floor(t * pm.rate); // the bolts jump to new places this many times a second
  ctx.strokeStyle = ctx.fillStyle = `rgba(${rgb},0.16)`; fxStroke(ctx, segs, pm.glowWidth * k);
  segs.forEach(({ i: si, ...s }) => fxPoints(s, pm.gap).forEach(([x, y], j) => {
    if (fxRnd(q + si, j) > 0.5) return;
    const a = fxRnd(q * 3 + si, j + 9) * 6.283, len = (10 + pm.length * fxRnd(q, si * 5 + j)) * k, pts = [[x, y]];
    for (let n = 1; n <= 4; n++) pts.push([x + Math.cos(a) * len * n / 4 + (fxRnd(q + n, j + si) - 0.5) * pm.jitter * k, y + Math.sin(a) * len * n / 4 + (fxRnd(q - n, j + si) - 0.5) * pm.jitter * k]);
    for (const [w, c] of [[pm.boltWidth * k, `rgba(${rgb},0.85)`], [pm.boltWidth * 0.343 * k, 'rgba(255,255,255,0.95)']]) {
      ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath(); for (const [px, py] of pts) ctx.lineTo(px, py); ctx.stroke();
    }
  }));
});
builtinDraw('smoke', (ctx, segs, rgb, k, t, pm) => {
  segs.forEach(({ i: si, ...s }) => fxPoints(s, pm.gap).forEach(([x, y], j) => {
    for (let q = 0; q < 2; q++) {
      const r = fxRnd(si * 5 + q, j + 3), ph = (t * (pm.speed + 0.4 * r) + r) % 1;
      ctx.fillStyle = `rgba(${rgb},${0.3 * (1 - ph) * Math.min(1, ph * 5)})`;
      dot(ctx, x + (r - 0.5) * pm.spread * k * ph + Math.sin(t * 2 + r * 9) * 3 * k, y - ph * pm.rise * k, (3 + pm.size * ph) * k);
    }
  }));
});
builtinDraw('spikyAura', (ctx, segs, rgb, k, t, pm) => {
  const p = 1 + pm.pulseAmt * Math.sin(t * pm.pulseSpeed);
  for (const [w, a] of glowLayers([[14, 0.1], [7, 0.18]], pm.glowSize, pm.glowAlpha)) { ctx.strokeStyle = ctx.fillStyle = `rgba(${rgb},${a})`; fxStroke(ctx, segs, w * k * p); }
  segs.forEach(({ i: si, ...s }) => {
    // outward: the segment's own perpendicular (a limb), or straight out from the centre (a ring bone)
    const dx = s.c ? 0 : s.b[0] - s.a[0], dy = s.c ? 0 : s.b[1] - s.a[1], len0 = Math.hypot(dx, dy) || 1, nx = -dy / len0, ny = dx / len0;
    fxPoints(s, pm.gap).forEach(([x, y], j) => {
      const r = fxRnd(si, j), side = fxRnd(si + 50, j) > 0.5 ? 1 : -1;
      const [rx, ry] = s.c ? [(x - s.c[0]) / s.r, (y - s.c[1]) / s.r] : [nx * side, ny * side];
      const ph = (t * pm.rotSpeed + r) % 1, spike = (pm.spikeBase + pm.spikeLen * r) * k * (1 - ph * pm.shrink), tx = -ry, ty = rx, bw = pm.thickness * k;
      ctx.fillStyle = `rgba(${rgb},${0.65 * (1 - ph)})`;
      ctx.beginPath(); ctx.moveTo(x - tx * bw, y - ty * bw); ctx.lineTo(x + rx * spike, y + ry * spike); ctx.lineTo(x + tx * bw, y + ty * bw); ctx.closePath(); ctx.fill();
    });
  });
});
builtinDraw('bubbles', (ctx, segs, rgb, k, t, pm) => {
  segs.forEach(({ i: si, ...s }) => fxPoints(s, pm.gap).forEach(([x, y], j) => {
    const r = fxRnd(si, j), ph = (t * (pm.speed + 0.3 * r) + r) % 1, rad = (2 + pm.size * r) * k * (0.5 + 0.5 * Math.sin(ph * Math.PI));
    const bx = x + Math.sin(t * 2 + r * 15) * pm.sway * k * ph, by = y - ph * pm.rise * k;
    ctx.fillStyle = `rgba(${rgb},${0.45 * (1 - ph * 0.7)})`; dot(ctx, bx, by, rad);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; dot(ctx, bx - rad * 0.35, by - rad * 0.35, rad * 0.3);
  }));
});
builtinDraw('sparks', (ctx, segs, rgb, k, t, pm) => {
  segs.forEach(({ i: si, ...s }) => fxPoints(s, pm.gap).forEach(([x, y], j) => {
    for (let q = 0; q < 2; q++) {
      const r = fxRnd(si * 7 + q, j), ph = (t * (pm.speed + r) + r * 3) % pm.life; // a brief flight, most of the cycle: gone
      const ang = fxRnd(si + q, j + 5) * 6.283, sp = (20 + pm.reach * r) * k;
      const at = d => [x + Math.cos(ang) * sp * d, y + Math.sin(ang) * sp * d + pm.gravity * k * d * d]; // a little gravity arcs it down
      const [px, py] = at(ph), [tx, ty] = at(Math.max(0, ph - 0.08));
      ctx.strokeStyle = `rgba(${rgb},${0.9 * (1 - ph / pm.life)})`; ctx.lineWidth = 1.3 * k;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(px, py); ctx.stroke();
    }
  }));
});
builtinDraw('blood', (ctx, segs, rgb, k, t, pm) => {
  segs.forEach(({ i: si, ...s }) => fxPoints(s, pm.gap).forEach(([x, y], j) => {
    const r = fxRnd(si, j), ph = (t * pm.speed + r) % 1;
    const ang = fxRnd(si + 3, j) * 6.283, sp = (40 + pm.reach * r) * k;
    const px = x + Math.cos(ang) * sp * ph, py = y + Math.sin(ang) * sp * ph + pm.gravity * k * ph * ph;
    ctx.fillStyle = `rgba(${rgb},${0.8 * (1 - ph)})`; dot(ctx, px, py, pm.size * k * (1 - ph * 0.5));
  }));
});
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
// preset.algo (unset = 'particle'): a custom look either tunes the generic particle draw (drawCustom), or — duplicated
// from a built-in (duplicateBuiltinLook) — reuses that built-in's own hand-coded algorithm with its own independent
// copy of params, so it fully recreates the built-in's look at the moment it was duplicated, decoupled from it after
function registerLook(name, preset) {
  FX_LOOKS[name] = `Custom: ${name}`;
  const algo = preset.algo || 'particle';
  // override: the looks panel's experiment grid previews a value without saving it (same signature as builtinDraw)
  FX_DRAW[name] = algo === 'particle' ? (ctx, segs, rgb, k, t, override) => drawCustom({ ...preset, ...override }, ctx, segs, rgb, k, t)
    : (ctx, segs, rgb, k, t, override) => BUILTIN_RAW[algo](ctx, segs, rgb, k, t, { ...preset, ...override });
  FX_AUTO[name] = preset.col || 'white'; // a move using this look without its own colour falls back to the look's own default
  if (preset.back) FX_BACK.add(name); else FX_BACK.delete(name);
}
for (const [name, preset] of Object.entries(myLooks)) registerLook(name, preset);
function saveLook(name, preset) { myLooks[name] = preset; registerLook(name, preset); saveLooks(); }
// a built-in, independent copy: a new custom look seeded with its current (possibly tuned) values, using the very same
// hand-coded algorithm — fully recreates it, free to rename, tune further or delete without ever touching the original
function duplicateBuiltinLook(name) {
  let n = 2; while (FX_LOOKS[name + n]) n++;
  const copy = name + n, b = FX_BUILTIN[name];
  saveLook(copy, { algo: name, ...b.params, col: b.col, back: b.back });
  return copy;
}
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
