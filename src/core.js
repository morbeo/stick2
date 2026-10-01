'use strict';
// ---------- config (every tunable is exposed in the side panel) ----------
// groups: [title, what it does, keys]. vars: k, default v, range or opts, tip (hover text), optTips (per option)
const SCHEMA = [
  ['Movement', 'How the body travels: ground speed ramps up and down, jumps start with an anticipation squat.', 'A/D move · W jump · S crouch'],
  { k: 'maxSpeed', v: 260, min: 50, max: 600, step: 10, tip: 'Top walking speed (px/s). Running near it turns J into a dash punch.' },
  { k: 'accel', v: 2400, min: 200, max: 20000, step: 100, tip: 'How fast you reach top speed (px/s²). Low = slidey start, high = instant.' },
  { k: 'decel', v: 2800, min: 200, max: 20000, step: 100, tip: 'Braking rate (px/s²). Lunges and knockback slide with a fraction of it.' },
  { k: 'jumpVel', v: 560, min: 200, max: 900, step: 10, tip: 'Launch speed of a jump (px/s); with gravity it sets the jump height.' },
  { k: 'gravity', v: 1900, min: 500, max: 4000, step: 50, tip: 'Downward acceleration (px/s²). Higher = snappier, shorter jumps.' },
  { k: 'jumpSquat', v: 0.06, min: 0, max: 0.2, step: 0.01, tip: 'Crouch before leaving the ground (s): anticipation that sells the jump. 0 = instant.' },
  ['Tweening (keyframes)', 'Each attack is a list of keyframe poses; the pose is eased from one key into the next.', 'J punch · K kick · chains: J,J,J · K,K · J,K · J,J,K · S+K sweep · run+J dash · air J/K'],
  { k: 'easing', v: 'authored', opts: ['authored', 'step', 'linear', 'outQuad', 'outCubic', 'outExpo', 'inOutCubic', 'outBack', 'outElastic'],
    tip: "Override every key's easing curve. 'authored' uses each key's own; 'step' snaps (no tween)." },
  { k: 'attackSpeed', v: 1, min: 0.25, max: 2, step: 0.05, tip: 'Playback speed of attacks (not hit reactions). 2 = twice as fast, frame data shrinks.' },
  ['Pose filter (on top of tween)', 'A spring layer chases the tweened pose, adding overshoot and follow-through. Deeper bones (higher lag) trail more.', 'G toggles the ghost of the unfiltered pose'],
  { k: 'filter', v: 'spring', opts: ['none', 'damp', 'spring'], tip: 'What the drawn pose does to catch the keyframed one.',
    optTips: { none: 'Exact keyframes, no smoothing.', damp: 'Exponential smoothing: lag without overshoot.', spring: 'Second-order spring: overshoot, wobble, anticipation.' } },
  { k: 'dampRate', v: 25, min: 1, max: 60, step: 1, tip: 'Damp filter only: how fast the drawn pose catches up (1/s).' },
  { k: 'freq', v: 6, min: 0.5, max: 15, step: 0.1, tip: 'Spring speed (Hz). Low = floaty, high = snappy.' },
  { k: 'zeta', v: 0.5, min: 0, max: 1.5, step: 0.01, tip: 'Spring damping. <1 overshoots and wobbles, 1 settles exactly, >1 is sluggish.' },
  { k: 'response', v: 2, min: -3, max: 4, step: 0.1, tip: 'Initial response. <0 anticipates (starts the wrong way), >1 overshoots early.' },
  { k: 'followThru', v: 0.8, min: 0.3, max: 1, step: 0.01, tip: "Per-bone frequency × followThru^lag, so hands, heads and tails trail the torso. 1 = everything moves together." },
  ['Hit stop (per-fighter freeze)', 'Fighters freeze for a moment on impact so hits feel heavy. A budget stops long combos from turning into stop-motion.', ''],
  { k: 'hitstop', v: 0.08, min: 0, max: 0.3, step: 0.01, tip: 'Freeze length per unit of move power (s).' },
  { k: 'hitstopAtk', v: 1, min: 0, max: 1, step: 0.05, tip: 'Fraction of the freeze the attacker also sits out.' },
  { k: 'hitstopFin', v: 1.3, min: 1, max: 3, step: 0.05, tip: 'Freeze multiplier on finishers (knockdowns).' },
  { k: 'hitstopDecay', v: 0.9, min: 0.5, max: 1, step: 0.01, tip: 'Freeze multiplier per combo hit, so long strings keep flowing.' },
  { k: 'hitstopBudget', v: 0.35, min: 0, max: 1, step: 0.05, tip: 'Max frozen seconds per second of play (0 = no cap).' },
  { k: 'hitShake', v: 3, min: 0, max: 8, step: 0.5, tip: 'Victim jitter while frozen (px).' },
  ['Collision', 'How a strike is tested against hurtboxes. Sweep hitTest in the grid to compare modes on the same fight.', 'B toggles the hitbox overlay'],
  { k: 'hitTest', v: 'drawn', opts: ['drawn', 'target', 'swept', 'limb'], tip: 'Which shape of the strike is tested.',
    optTips: { drawn: 'Striking joint of the drawn (sprung) pose: what you see is what hits.',
      target: 'Striking joint of the keyframe pose, ignoring springs: predictable, the fighting-game standard.',
      swept: 'Path of the drawn joint since the last substep: fast strikes cannot pass through.',
      limb: 'The whole striking bone as a capsule: generous, forearms and shins hit too.' } },
  { k: 'hitR', v: 0, min: 0, max: 12, step: 1, tip: 'Extra radius around the strike (px). Bigger = more forgiving.' },
  { k: 'impact', v: 1, min: 0, max: 3, step: 0.1, tip: 'How hard a blow spins the struck bones: torque about every joint from the contact point to the hips.' },
  ['Combos & cancels', 'Which moves can interrupt which. A move\'s cancel window opens when its active frames end (or at a key marked cancel); the frame meter shows it in purple.',
    'chains: J,J,J · J,K · … · specials: ↓↘→ J rush · →↓↘ J rising · ↓↙← K spin · ↓↘→ K stomp (hits a fighter on the floor)'],
  { k: 'chains', v: 'authored', opts: ['none', 'authored', 'free'], tip: 'Which normal moves a move chains into, in its cancel window.',
    optTips: { none: 'No chains: every move plays out.', authored: 'Each move\'s own routes (J,J,J · J,K …; set in animate).',
      free: 'On hit, any move not used yet in this string, ground or air (a 2-button magic series).' } },
  { k: 'specialCancel', v: true, tip: 'A normal move that hit can be cancelled into a special (↓↘→ J …).' },
  { k: 'jumpCancel', v: true, tip: 'A move that hit can be cancelled into a jump: launch, jump, air combo.' },
  { k: 'juggleDecay', v: 1, min: 0.5, max: 1, step: 0.05, tip: 'Launch speed × this per extra hit on an airborne fighter, so air combos end. 1 = no decay.' },
  { k: 'otg', v: 'flagged', opts: ['off', 'flagged', 'all'], tip: 'Off the ground: which moves can hit a fighter lying on the floor (it pops up).',
    optTips: { off: 'Nothing hits a downed fighter.', flagged: 'Only moves marked otg (stomp).', all: 'Every move.' } },
  { k: 'motionWindow', v: 0.3, min: 0.1, max: 0.8, step: 0.05, tip: 'How long (s) the directions of a special motion (↓↘→ …) stay valid.' },
  ['Falls', 'How a knocked-down fighter tumbles, bounces and lands.', ''],
  { k: 'floorBounce', v: 0.35, min: 0, max: 0.8, step: 0.05, tip: 'A falling fighter bounces off the floor with this fraction of its landing speed. 0 = lands dead.' },
  { k: 'bounces', v: 1, min: 0, max: 4, step: 1, tip: 'Floor bounces before the fighter stays down.' },
  { k: 'wallBounce', v: 0.5, min: 0, max: 1, step: 0.05, tip: 'A flying fighter bounces off the arena walls with this fraction of its speed. 0 = stops dead.' },
  { k: 'flail', v: 1, min: 0, max: 3, step: 0.1, tip: 'How much limbs flail while flying and on every bounce.' },
  ['Combo escalation', 'Effects that grow with every hit of a combo, to find how a long combo should feel. 0 = off. The grid\'s combo fx test compares them side by side.', ''],
  { k: 'comboStop', v: 0, min: -0.2, max: 0.4, step: 0.01, tip: 'Hit stop grows by this fraction per combo hit (negative: shrinks), on top of hitstopDecay.' },
  { k: 'comboShake', v: 0, min: 0, max: 0.6, step: 0.02, tip: 'Camera shake grows by this fraction per combo hit.' },
  { k: 'comboZoom', v: 0, min: 0, max: 0.6, step: 0.02, tip: 'Zoom kick grows by this fraction per combo hit.' },
  { k: 'comboSpeed', v: 0, min: 0, max: 0.3, step: 0.01, tip: 'Attacks play faster by this fraction per combo hit while the combo lasts.' },
  { k: 'comboTime', v: 0, min: -0.15, max: 0.3, step: 0.01, tip: 'The whole game runs faster (negative: slower) by this fraction per combo hit while the combo lasts.' },
  ['Juice', 'Screen and body feedback that sells impacts.', ''],
  { k: 'shake', v: 14, min: 0, max: 40, step: 1, tip: 'Camera shake on impact (px).' },
  { k: 'zoomPunch', v: 0.04, min: 0, max: 0.15, step: 0.005, tip: 'Camera zoom kick per hit.' },
  { k: 'squash', v: 0.25, min: 0, max: 0.6, step: 0.01, tip: 'Squash & stretch on jumps, landings and hits.' },
  { k: 'sparks', v: 10, min: 0, max: 40, step: 1, tip: 'Spark particles per hit.' },
  { k: 'trail', v: 8, min: 0, max: 24, step: 1, tip: 'Length of hand and foot motion trails (frames).' },
  { k: 'flash', v: true, tip: 'Victim flashes white on the hit frame.' },
  { k: 'slowmo', v: true, tip: 'Brief slow motion after a finisher.' },
  { k: 'timeScale', v: 1, min: 0.05, max: 1, step: 0.05, tip: 'Simulation speed inside the world (hit stop and physics slow down too).' },
  ['Debug', 'Inspection aids.', 'G ghost · B boxes'],
  { k: 'ghost', v: false, tip: 'Draw the keyframe (target) pose in blue behind the sprung pose.' },
  { k: 'boxes', v: false, tip: 'Draw hurtboxes (blue) and the active strike (red).' },
  { k: 'scope', v: 'uarmF', tip: 'Bone plotted in the sidebar scope: target (grey) vs drawn (red).' }, // a bone of the current character
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
