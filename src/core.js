'use strict';
// ---------- config (every tunable is exposed in the side panel) ----------
const SCHEMA = [
  ['Movement'],
  { k: 'maxSpeed', v: 260, min: 50, max: 600, step: 10 },
  { k: 'accel', v: 2400, min: 200, max: 20000, step: 100 },
  { k: 'decel', v: 2800, min: 200, max: 20000, step: 100 },
  { k: 'jumpVel', v: 560, min: 200, max: 900, step: 10 },
  { k: 'gravity', v: 1900, min: 500, max: 4000, step: 50 },
  { k: 'jumpSquat', v: 0.06, min: 0, max: 0.2, step: 0.01 },
  ['Tweening (keyframes)'],
  { k: 'easing', v: 'authored', opts: ['authored', 'step', 'linear', 'outQuad', 'outCubic', 'outExpo', 'inOutCubic', 'outBack', 'outElastic'] },
  { k: 'attackSpeed', v: 1, min: 0.25, max: 2, step: 0.05 },
  ['Pose filter (on top of tween)'],
  { k: 'filter', v: 'spring', opts: ['none', 'damp', 'spring'] },
  { k: 'dampRate', v: 25, min: 1, max: 60, step: 1 },
  { k: 'freq', v: 6, min: 0.5, max: 15, step: 0.1 },
  { k: 'zeta', v: 0.5, min: 0, max: 1.5, step: 0.01 },
  { k: 'response', v: 2, min: -3, max: 4, step: 0.1 },
  { k: 'followThru', v: 0.8, min: 0.3, max: 1, step: 0.01 },
  ['Hit stop (per-fighter freeze)'],
  { k: 'hitstop', v: 0.08, min: 0, max: 0.3, step: 0.01 },        // seconds per unit of move power
  { k: 'hitstopAtk', v: 1, min: 0, max: 1, step: 0.05 },          // attacker freezes this fraction of it
  { k: 'hitstopFin', v: 1.3, min: 1, max: 3, step: 0.05 },        // multiplier on finishers
  { k: 'hitstopDecay', v: 0.9, min: 0.5, max: 1, step: 0.01 },    // multiplier per combo hit
  { k: 'hitstopBudget', v: 0.35, min: 0, max: 1, step: 0.05 },    // max frozen seconds per second (0 = off)
  { k: 'hitShake', v: 3, min: 0, max: 8, step: 0.5 },             // victim jitter while frozen (px)
  ['Collision'],
  { k: 'hitTest', v: 'drawn', opts: ['drawn', 'target', 'swept', 'limb'] },
  { k: 'hitR', v: 0, min: 0, max: 12, step: 1 },                  // hitbox radius added around the strike (px)
  { k: 'impact', v: 1, min: 0, max: 3, step: 0.1 },               // how hard a blow spins the struck bones
  ['Juice'],
  { k: 'shake', v: 14, min: 0, max: 40, step: 1 },
  { k: 'zoomPunch', v: 0.04, min: 0, max: 0.15, step: 0.005 },
  { k: 'squash', v: 0.25, min: 0, max: 0.6, step: 0.01 },
  { k: 'sparks', v: 10, min: 0, max: 40, step: 1 },
  { k: 'trail', v: 8, min: 0, max: 24, step: 1 },
  { k: 'flash', v: true },
  { k: 'slowmo', v: true },
  { k: 'timeScale', v: 1, min: 0.05, max: 1, step: 0.05 },
  ['Debug'],
  { k: 'ghost', v: false },
  { k: 'scope', v: 'uarmF', opts: [] }, // filled with the default character's bones (rig.js)
];
const CFG = {}, DEFAULTS = {}, SPEC = {};
for (const s of SCHEMA) if (!Array.isArray(s)) { DEFAULTS[s.k] = CFG[s.k] = s.v; SPEC[s.k] = s; }

const NOJUICE = { hitstop: 0, hitShake: 0, shake: 0, zoomPunch: 0, squash: 0, sparks: 0, trail: 0, flash: false, slowmo: false, jumpSquat: 0 };
const PRESETS = {
  raw: { ...NOJUICE, easing: 'step', filter: 'none', accel: 20000, decel: 20000 },
  tweened: { ...NOJUICE, filter: 'none' },
  spring: { ...NOJUICE },
  floaty: { freq: 2, zeta: 0.35, response: 0.5, followThru: 0.7 },
  juicy: {},
};

// ---------- math ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
// seeded rng (mulberry32) so every grid cell replays the exact same fight
function makeRand(seed) {
  return (a = 0, b = 1) => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return a + ((t ^ t >>> 14) >>> 0) / 4294967296 * (b - a);
  };
}
// smooth pseudo-noise in [-1, 1]
const wander = x => Math.sin(x) * 0.5 + Math.sin(x * 2.13 + 1.3) * 0.3 + Math.sin(x * 3.71 + 4.1) * 0.2;
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
// distance between segments ab and cd (0 when they cross)
function distSegSeg(a, b, c, d) {
  const cr = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  if (cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0) return 0;
  return Math.min(distSeg(a, c, d), distSeg(b, c, d), distSeg(c, a, b), distSeg(d, a, b));
}

const EASE = {
  step: t => t > 0 ? 1 : 0,
  linear: t => t,
  outQuad: t => 1 - (1 - t) ** 2,
  outCubic: t => 1 - (1 - t) ** 3,
  outExpo: t => t >= 1 ? 1 : 1 - 2 ** (-10 * t),
  inOutCubic: t => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
  outBack: t => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  outElastic: t => t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * 2 * Math.PI / 3) + 1,
};

// Second-order dynamics (t3ssel8r, "Giving Personality to Procedural Animations").
// f = natural frequency (Hz, speed), z = damping (<1 overshoots), r = initial response (<0 anticipates, >1 overshoots early).
class SecondOrder {
  constructor(x) { this.reset(x); }
  reset(x) { this.xp = this.y = x; this.yd = 0; }
  update(dt, x, f, z, r) {
    const w = 2 * Math.PI * f, k1 = z / (Math.PI * f), k2 = 1 / (w * w), k3 = r * z / w;
    const xd = (x - this.xp) / dt; this.xp = x;
    const k2s = Math.max(k2, dt * dt / 2 + dt * k1 / 2, dt * k1); // keeps it stable at any dt
    this.y += dt * this.yd;
    this.yd += dt * (x + k3 * xd - this.y - k1 * this.yd) / k2s;
    return this.y;
  }
}
