'use strict';
// ---------- rig: a character is a tree of bones; walking, hurtboxes, trails and ground contact derive from it ----------
// angles in degrees. world angle 0 = straight down, 90 = forward (facing dir), 180 = up.
// a pose maps bone id -> angle relative to the parent bone (root bones: relative to straight down).
const R = Math.PI / 180;
const BONE = {
  len: 10, a: 0,       // length (px) and rest angle
  role: 'tail',        // spine | head | arm | leg | tail: decides breathing, walk cycle, hit reactions
  side: '',            // f | b | '': front / back limb (back is drawn behind, in the second colour)
  shape: 'line',       // line | circle (circle is centred on the bone's end, radius = len)
  thick: 5, hurt: 0,   // stroke width; hurtbox radius (0 = can't be hit here)
  lag: 1,              // follow-through: each step lowers the spring frequency, so the bone trails its parent
  level: 0,            // 0 = rigid child, 1 = keeps its rest world angle whatever the parent does (feet stay flat)
  stretch: 0,          // how much the bone lengthens while swinging fast (0.2 = up to +20%)
  stiff: 1, damp: 1,   // multipliers on the spring frequency / damping
};

// ---------- the default stick fighter ----------
const limb = s => [
  { id: 'thigh' + s, len: 22, role: 'leg', side: s.toLowerCase(), hurt: 8, lag: 0, min: -100, max: 140 },
  { id: 'shin' + s, parent: 'thigh' + s, len: 23, role: 'leg', side: s.toLowerCase(), hurt: 8, lag: 1, min: -165, max: 8 },
  { id: 'foot' + s, parent: 'shin' + s, len: 7, a: 90, role: 'leg', side: s.toLowerCase(), hurt: 6, lag: 1.5, level: 1, thick: 4, min: 40, max: 140 },
  { id: 'uarm' + s, parent: 'chest', len: 17, a: -180, role: 'arm', side: s.toLowerCase(), lag: 1, min: -250, max: -10 },
  { id: 'farm' + s, parent: 'uarm' + s, len: 13, role: 'arm', side: s.toLowerCase(), lag: 2, min: -10, max: 165 },
  { id: 'hand' + s, parent: 'farm' + s, len: 4, role: 'arm', side: s.toLowerCase(), lag: 2.5, thick: 6, min: -70, max: 70 },
];
const STICK_BONES = [
  { id: 'waist', len: 14, a: 180, role: 'spine', hurt: 12, lag: 0, min: 120, max: 300 },
  { id: 'chest', parent: 'waist', len: 20, role: 'spine', hurt: 12, lag: 0.5, min: -40, max: 40 },
  { id: 'neck', parent: 'chest', len: 5, role: 'head', hurt: 12, lag: 1, level: 0.5, min: -45, max: 45 },
  { id: 'head', parent: 'neck', len: 8, role: 'head', shape: 'circle', hurt: 12, lag: 1, min: -50, max: 50 },
  ...limb('F'), ...limb('B'),
];

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
const STANCE = { torso: 8, head: 0, afU: 35, afL: 115, abU: 15, abL: 125, lfU: 25, lfL: -25, lbU: -18, lbL: 0 };
const CROUCH = { torso: 22, lfU: 60, lfL: -110, lbU: -10, lbL: -70 };
const AIR = { torso: 4, lfU: 55, lfL: -95, lbU: -10, lbL: -45, afU: 55, afL: 95, abU: 40, abL: 100 };
const AIR_FALL = { torso: 6, lfU: 28, lfL: -35, lbU: -18, lbL: -20, afU: 75, afL: 60, abU: 65, abL: 70 };
const FALL = { torso: -55, head: -20, afU: 140, afL: 30, abU: 110, abL: 50, lfU: 60, lfL: -50, lbU: 30, lbL: -30 };
const LIE = { torso: -92, head: 0, afU: 150, afL: 15, abU: 30, abL: 20, lfU: 88, lfL: -8, lbU: 78, lbL: -25 };

// the common attack shape: anticipation -> strike -> hold (both active) -> recover
const attack = (o, [ad, ap], [sd, sp], hd, rd) => ({ ...o, keys: [
  { d: ad, e: 'outQuad', p: ap },
  { d: sd, e: 'outExpo', p: sp, active: true, lunge: o.lunge },
  { d: hd, p: sp, active: true },
  { d: rd, e: 'inOutCubic', p: null },
] });
// keys: d = duration (s), e = easing, p = partial pose (null = back to base). hit = striking joint.
// next = chain targets, usable once the active frames are over.
const STICK_MOVES = {
  jab: attack({ power: 1, damage: 5, hit: 'fh', height: 'high', knock: 120, stun: 0.32, next: { punch: 'cross', kick: 'kick' } },
    [0.06, { torso: 0, afU: 10, afL: 135, abU: 30 }],
    [0.05, { torso: 18, afU: 98, afL: 0, abU: -15, abL: 130 }], 0.06, 0.16),
  cross: attack({ power: 1.1, damage: 7, hit: 'bh', height: 'high', knock: 140, stun: 0.36, lunge: 120, next: { punch: 'uppercut', kick: 'roundhouse' } },
    [0.06, { torso: 4, abU: 5, abL: 140, afU: 40, afL: 120 }],
    [0.05, { torso: 26, abU: 112, abL: 0, afU: 20, afL: 130, lbU: -28, lbL: 0, lfU: 30 }], 0.07, 0.18),
  // custom shape: the strike drives forward into the body, the follow-through rises
  uppercut: { power: 1.6, damage: 12, hit: 'fh', height: 'high', knock: 120, launch: 520, kd: true, keys: [
    { d: 0.08, e: 'outQuad', p: { torso: 28, afU: -10, afL: 90, abU: 40, abL: 120, lfU: 45, lfL: -70, lbU: -25, lbL: -30 } },
    { d: 0.06, e: 'outExpo', p: { torso: 20, afU: 115, afL: 50, abU: 0, abL: 130, lfU: 30, lfL: -25, lbU: -22, lbL: 0 }, active: true, lunge: 220 },
    { d: 0.09, e: 'outQuad', p: { torso: 6, afU: 150, afL: 35, abU: 0, abL: 130, lfU: 22, lfL: -10, lbU: -22, lbL: 0 }, active: true },
    { d: 0.26, e: 'inOutCubic', p: null },
  ] },
  kick: attack({ power: 1.3, damage: 9, hit: 'ff', height: 'mid', knock: 200, stun: 0.4, next: { kick: 'roundhouse', punch: 'cross' } },
    [0.09, { torso: -5, lfU: 75, lfL: -120, afU: 20, abU: 40 }],
    [0.07, { torso: -28, lfU: 100, lfL: -5, lbU: -10, lbL: 0, afU: -10, afL: 60, abU: 60 }], 0.08, 0.22),
  roundhouse: attack({ power: 1.7, damage: 14, hit: 'bf', height: 'high', knock: 380, launch: 280, kd: true, lunge: 160 },
    [0.09, { torso: -8, lbU: 30, lbL: -120, lfU: 5, lfL: -10, afU: 50, afL: 100, abU: -20, abL: 80 }],
    [0.07, { torso: -32, lbU: 118, lbL: -8, lfU: 2, lfL: 0, afU: -20, afL: 60, abU: 70, abL: 40 }], 0.09, 0.26),
  sweep: attack({ power: 1.2, damage: 10, hit: 'ff', height: 'low', knock: 150, launch: 250, kd: true },
    [0.07, { torso: 30, lbU: -5, lbL: -120, lfU: 40, lfL: -110, afU: -20, afL: 60, abU: -30, abL: 40 }],
    [0.08, { torso: 40, lfU: 84, lfL: -2, lbU: 10, lbL: -125, afU: -40, afL: 30, abU: -50, abL: 30 }], 0.08, 0.24),
  dashPunch: attack({ power: 1.4, damage: 11, hit: 'fh', height: 'mid', knock: 380, stun: 0.5, lunge: 450, next: { punch: 'uppercut' } },
    [0.05, { torso: 10, afU: 20, afL: 130 }],
    [0.06, { torso: 30, afU: 110, afL: 0, abU: -40, abL: 60, lfU: 50, lfL: -40, lbU: -40, lbL: 0 }], 0.12, 0.22),
  airKick: attack({ power: 1.3, damage: 9, hit: 'ff', height: 'shigh', knock: 250, stun: 0.4, air: true },
    [0.06, { torso: -10, lfU: 60, lfL: -110, lbU: 10, lbL: -100 }],
    [0.06, { torso: -25, lfU: 70, lfL: -3, lbU: -5, lbL: -90, afU: 40, afL: 90, abU: 60, abL: 60 }], 0.25, 0.15),
  airPunch: attack({ power: 1.1, damage: 7, hit: 'fh', height: 'shigh', knock: 160, stun: 0.36, air: true, next: { kick: 'airKick' } },
    [0.05, { torso: 5, afU: 150, afL: 60 }],
    [0.06, { torso: 25, afU: 75, afL: 0, abU: -20, abL: 120 }], 0.12, 0.15),
  // specials (motion + button), cancellable from normals that hit
  rush: attack({ power: 1.5, damage: 12, hit: 'fh', height: 'mid', knock: 320, stun: 0.5, lunge: 520, special: true },
    [0.08, { torso: 4, afU: 10, afL: 140, abU: 40, abL: 120, lfU: 40, lfL: -60 }],
    [0.05, { torso: 32, afU: 105, afL: 0, abU: -30, abL: 70, lfU: 55, lfL: -30, lbU: -45, lbL: 0 }], 0.1, 0.26),
  // invincible while it rises
  rising: { power: 1.8, damage: 14, hit: 'fh', height: 'high', knock: 100, launch: 680, kd: true, special: true, keys: [
    { d: 0.05, e: 'outQuad', p: { torso: 30, afU: -20, afL: 100, abU: 40, abL: 120, lfU: 55, lfL: -90, lbU: -25, lbL: -40 }, inv: true },
    { d: 0.06, e: 'outExpo', p: { torso: 10, afU: 150, afL: 20, abU: 0, abL: 130, lfU: 20, lfL: -10, lbU: -20, lbL: 0 }, active: true, lunge: 160, inv: true },
    { d: 0.1, e: 'outQuad', p: { torso: 0, afU: 170, afL: 10, abU: -10, abL: 130, lfU: 15, lfL: -5, lbU: -20, lbL: 0 }, active: true },
    { d: 0.34, e: 'inOutCubic', p: null },
  ] },
  spin: attack({ power: 1.9, damage: 15, hit: 'bf', height: 'high', knock: 420, launch: 320, kd: true, lunge: 260, special: true, wide: true },
    [0.1, { torso: -12, lbU: 40, lbL: -130, lfU: 0, lfL: -15, afU: 60, afL: 90, abU: -30, abL: 70 }],
    [0.07, { torso: -36, lbU: 120, lbL: -5, lfU: 0, lfL: 0, afU: -30, afL: 50, abU: 80, abL: 30 }], 0.1, 0.3),
  // hits a fighter lying on the floor
  stomp: attack({ power: 1.1, damage: 8, hit: 'ff', height: 'low', knock: 60, launch: 240, kd: true, otg: true, special: true },
    [0.08, { torso: -5, lfU: 80, lfL: -120, afU: 50, abU: 30 }],
    [0.06, { torso: 12, lfU: 42, lfL: -4, lbU: -15, lbL: 0, afU: 20, abU: 60 }], 0.08, 0.2),
  // directional normals (→ / ↑ / ↓ / ↘ with J or K, see BINDS); the elbow strikes with the end of the upper arm
  elbow: attack({ power: 1.3, damage: 10, hit: 'uarmF', height: 'mid', knock: 260, stun: 0.42, lunge: 200, next: { kick: 'kick' } },
    [0.07, { torso: 2, afU: 40, afL: 150, abU: 30, abL: 120 }],
    [0.05, { torso: 30, afU: 80, afL: 155, abU: -25, abL: 110, lfU: 45, lfL: -40, lbU: -30, lbL: 0 }], 0.06, 0.2),
  // pushes the victim away instead of stunning long
  pushKick: attack({ power: 1.2, damage: 8, hit: 'ff', height: 'mid', knock: 480, stun: 0.3 },
    [0.09, { torso: -8, lfU: 95, lfL: -120, afU: 30, abU: 40 }],
    [0.06, { torso: -24, lfU: 92, lfL: 0, lbU: -12, lbL: 0, afU: 10, afL: 80, abU: 50 }], 0.07, 0.24),
  // overhead: beats a crouching guard; armored while it winds up (takes the hit without flinching); smashes the victim off the floor
  hammer: attack({ power: 1.5, damage: 12, hit: 'fh', height: 'shigh', knock: 120, launch: 100, kd: true, bounce: true },
    [0.13, { torso: -10, afU: 175, afL: 50, abU: 160, abL: 60 }],
    [0.06, { torso: 32, afU: 70, afL: 15, abU: 60, abL: 30, lfU: 40, lfL: -35, lbU: -25, lbL: 0 }], 0.06, 0.28),
  // a turning back kick, head high; near a wall the victim splats against it
  turnKick: attack({ power: 1.8, damage: 15, hit: 'bf', height: 'high', knock: 400, launch: 300, kd: true, lunge: 180, wall: true },
    [0.1, { torso: -15, head: 10, lbU: 20, lbL: -110, lfU: 0, lfL: -10, afU: 60, afL: 90, abU: -30, abL: 80 }],
    [0.07, { torso: -45, head: 15, lbU: 125, lbL: 0, lfU: -2, lfL: 0, afU: -30, afL: 50, abU: 80, abL: 40 }], 0.09, 0.28),
  // from a crouch, straight up: the launcher that starts juggles
  launcher: attack({ power: 1.5, damage: 10, hit: 'fh', height: 'mid', knock: 80, launch: 560, kd: true },
    [0.08, { ...CROUCH, afU: -10, afL: 100, abU: 30, abL: 120 }],
    [0.06, { torso: 12, afU: 165, afL: 20, abU: 10, abL: 130, lfU: 30, lfL: -30, lbU: -15, lbL: -10 }], 0.08, 0.3),
  lowKick: attack({ power: 1, damage: 6, hit: 'ff', height: 'low', knock: 120, stun: 0.34 },
    [0.06, { torso: 0, lfU: 45, lfL: -70 }],
    [0.05, { torso: -12, lfU: 55, lfL: -4, lbU: -15, lbL: 0, afU: 50, abU: 20 }], 0.06, 0.18),
  // a long wind-up, then both palms: unblockable (its active keys go through guard), but it can be hit out of; the victim crumples
  charge: attack({ power: 2, damage: 18, hit: 'fh', height: 'mid', knock: 460, crumple: true, lunge: 320, special: true },
    [0.36, { torso: -15, afU: -50, afL: 110, abU: -60, abL: 100, lfU: 35, lfL: -50 }],
    [0.06, { torso: 30, afU: 95, afL: 5, abU: 90, abL: 15, lfU: 55, lfL: -30, lbU: -40, lbL: 0 }], 0.08, 0.36),
  // P+G: a short reach that ignores guard (not a crouching fighter: it is high); on connect the victim is held for the
  // techWindow (P+G breaks it), then thrown by the move named in throw. toss has no active keys: the release does the damage
  grab: { power: 1, damage: 0, hit: 'fh', height: 'high', knock: 0, throw: 'toss', keys: [
    { d: 0.06, e: 'outQuad', p: { torso: 15, afU: 70, afL: 40, abU: 60, abL: 50 } },
    { d: 0.06, e: 'outExpo', p: { torso: 22, afU: 92, afL: 5, abU: 88, abL: 10, lfU: 40, lfL: -35 }, active: true, lunge: 120 },
    { d: 0.32, e: 'inOutCubic', p: null },
  ] },
  toss: { power: 1.5, damage: 14, hit: 'fh', height: 'mid', knock: 260, launch: 450, kd: true, keys: [
    { d: 0.2, e: 'outQuad', p: { torso: -10, afU: 60, afL: 90, abU: 50, abL: 100, lfU: 20, lfL: -40, lbU: -30, lbL: -20 } },
    { d: 0.08, e: 'outExpo', p: { torso: 35, afU: 150, afL: 10, abU: 140, abL: 20, lfU: 45, lfL: -30, lbU: -35, lbL: 0 } },
    { d: 0.3, e: 'inOutCubic', p: null },
  ] },
  // ← S: a counter stance; a strike from the front landing during its catch key is caught and answered by the counter move
  catch: { power: 1, special: true, counter: 'reversal', keys: [
    { d: 0.05, e: 'outQuad', p: { torso: -5, afU: 80, afL: 60, abU: 40, abL: 90 } },
    { d: 0.3, p: { torso: -5, afU: 85, afL: 55, abU: 45, abL: 85 }, catch: true },
    { d: 0.25, e: 'inOutCubic', p: null },
  ] },
  reversal: { power: 1.6, damage: 13, hit: 'bh', height: 'mid', knock: 350, launch: 380, kd: true, keys: [
    { d: 0.05, e: 'outExpo', p: { torso: 30, abU: 110, abL: 0, afU: 20, afL: 130, lbU: -30, lbL: 0, lfU: 35 } },
    { d: 0.1, p: { torso: 30, abU: 110, abL: 0, afU: 20, afL: 130, lbU: -30, lbL: 0, lfU: 35 } },
    { d: 0.3, e: 'inOutCubic', p: null },
  ] },
  getup: { inv: true, keys: [
    { d: 0.18, e: 'outCubic', p: { torso: -30, head: 10, lfU: 75, lfL: -130, lbU: 60, lbL: -140, afU: -40, afL: 20, abU: -60, abL: 10 } },
    { d: 0.16, e: 'outCubic', p: { ...CROUCH, afU: 30, afL: 110, abU: 20, abL: 120 } },
    { d: 0.2, e: 'inOutCubic', p: null },
  ] },
};
STICK_MOVES.hammer.keys[0].armor = true;
STICK_MOVES.charge.keys.forEach(k => { if (k.active) k.unblock = true; });
const STICK_HURT = {
  high: [
    { torso: -22, head: -28, afU: -20, afL: 40, abU: -40, abL: 30 },
    { torso: -30, head: -10, afU: 140, afL: 40, abU: 100, abL: 60 },
  ],
  mid: [
    { torso: 35, head: 15, afU: 20, afL: 100, abU: 10, abL: 110, lfU: 30, lfL: -45, lbU: -15, lbL: -20 },
    { torso: 25, head: -10, afU: -30, afL: 60, abU: 60, abL: 20 },
  ],
  low: [
    { torso: 15, lfU: 50, lfL: -80, lbU: -10, lbL: -40, afU: 60, afL: 40, abU: -40, abL: 50 },
    { torso: -10, head: 10, lfU: 5, lfL: -60, lbU: -30, lbL: -30, afU: 80, afL: 30, abU: 70, abL: 40 },
  ],
};
// ---------- characters ----------
const HITS = { fh: 'handF', bh: 'handB', ff: 'footF', bf: 'footB' };
// which move each input slot triggers (a character's binds override these)
// Directions in numpad terms (6 = towards the opponent): a diagonal without a move falls back to its vertical, then to neutral
const BINDS = { punch: 'jab', kick: 'kick', fwdPunch: 'elbow', fwdKick: 'pushKick', backPunch: null, backKick: null,
  upPunch: 'hammer', upKick: 'turnKick', upFwdPunch: null, upFwdKick: null, upBackPunch: null, upBackKick: null,
  downPunch: 'launcher', downKick: 'sweep', downFwdPunch: null, downFwdKick: 'lowKick', downBackPunch: null, downBackKick: null,
  dashPunch: 'dashPunch', airPunch: 'airPunch', airKick: 'airKick', throw: 'grab',
  qcfPunch: 'rush', dpPunch: 'rising', qcbKick: 'spin', qcfKick: 'stomp', qcbPunch: 'charge', dpKick: null,
  special: 'spin', fwdSpecial: 'rush', backSpecial: 'catch', upSpecial: 'rising', downSpecial: 'stomp', airSpecial: null };
// special motions in numpad notation (6 = towards the opponent), matched in order against the recent directions
const MOTIONS = { dp: /6.*2.*3/, qcf: /2.*3.*6/, qcb: /2.*1.*4/ };
// whole-character stats: each multiplies some fight settings for this character only (1 = as the settings say)
const CHAR_STATS = [
  { k: 'speed', cfg: ['maxSpeed'], min: 0.5, max: 1.6, step: 0.05, tip: 'Walk speed, × maxSpeed (dashes and runs too). Heavy bodies feel right a little slower.' },
  { k: 'jump', cfg: ['jumpVel'], min: 0.6, max: 1.5, step: 0.05, tip: 'Jump height, × jumpVel.' },
  { k: 'weight', cfg: [], min: 0.5, max: 2, step: 0.05, tip: 'Heavier bodies are pushed and launched less: knockback, block push and launch ÷ weight.' },
  { k: 'health', cfg: ['health'], min: 0.5, max: 2, step: 0.05, tip: 'Health, × the health setting.' },
  { k: 'tough', cfg: ['staggerAt', 'dizzyAt'], min: 0.5, max: 2, step: 0.05, tip: 'Toughness: blows needed to stagger it and damage to make it dizzy, × staggerAt and dizzyAt.' },
  { k: 'tempo', cfg: ['attackSpeed'], min: 0.6, max: 1.5, step: 0.05, tip: 'How fast its moves play, × attackSpeed.' },
  { k: 'springs', cfg: ['freq'], min: 0.4, max: 2, step: 0.05, tip: 'Limb spring frequency, × freq: above 1 snappy, below 1 floppy.' },
];
const STAT_OF = Object.fromEntries(CHAR_STATS.flatMap(s => s.cfg.map(k => [k, s.k])));
function makeCharacter(def) {
  def = JSON.parse(JSON.stringify(def)); // the caller's definition stays untouched (it is what gets edited and saved)
  const by = {}, order = [];
  for (const b of def.bones) by[b.id] = { ...BONE, parent: null, ...b };
  const visit = b => { if (order.includes(b)) return; if (b.parent) visit(by[b.parent]); order.push(b); };
  Object.values(by).forEach(visit); // parents before children
  for (const b of order) {
    const pb = by[b.parent];
    b.restW = (pb ? pb.restW : 0) + b.a;
    b.fwd = Math.cos(b.restW * R) >= 0 ? 1 : -1; // + moves the end forward for bones hanging down, back for bones pointing up
    b.flex = b.min !== undefined && Math.abs(b.min) > Math.abs(b.max) ? -1 : 1; // the way the joint bends furthest
    b.kids = order.filter(k => k.parent === b.id);
  }
  // rough rotational inertia: everything hanging off a bone has to turn with it
  for (const b of [...order].reverse()) {
    b.mass = b.len + b.kids.reduce((s, k) => s + k.mass, 0);
    b.inertia = (b.mass + 30) ** 2 / 3;
  }
  // limb chains per role: start where the parent has another role, follow the first child of the same role
  const chains = { spine: [], head: [], arm: [], leg: [], tail: [] };
  for (const b of order) if (!b.parent || by[b.parent].role !== b.role) {
    const c = [b];
    for (let k; (k = c[c.length - 1].kids.find(k => k.role === b.role));) c.push(k);
    chains[b.role].push(c);
  }
  const rest = Object.fromEntries(order.map(b => [b.id, b.a]));
  const ch = { name: def.name, bones: order, by, ids: order.map(b => b.id), chains,
    tips: [...chains.arm, ...chains.leg].map(c => c[c.length - 1]),
    poses: { ...def.poses, stance: { ...rest, ...def.poses.stance } }, moves: def.moves, hurt: def.hurt, binds: { ...BINDS, ...def.binds },
    stats: Object.fromEntries(CHAR_STATS.map(s => [s.k, def[s.k] ?? 1])) };
  // the cancel window opens at a key marked cancel, else after the last active key
  for (const m of Object.values(ch.moves)) { const c = m.keys.findIndex(k => k.cancel); m.cancel = c >= 0 ? c : m.keys.findLastIndex(k => k.active) + 1; }
  return ch;
}
const oldMove = m => ({ ...m, hit: HITS[m.hit] || m.hit, keys: m.keys.map(k => ({ ...k, p: fromOld(k.p) })) });
const mapVals = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
// built-in definitions (plain JSON: what the creator edits, saves and reverts to); CHARS = compiled
const CHAR_DEFS = {
  stick: { name: 'stick', bones: STICK_BONES,
    poses: mapVals({ stance: STANCE, crouch: CROUCH, air: AIR, airFall: AIR_FALL, fall: FALL, lie: LIE }, fromOld),
    moves: mapVals(STICK_MOVES, oldMove), hurt: mapVals(STICK_HURT, set => set.map(fromOld)) },
};
// brute: the stick's skeleton and moves, bigger, much thicker, heavier and slower (speed scales its walk)
const BRUTE_SCALE = { waist: 1.2, chest: 1.35, neck: 1, head: 1.25, thigh: 1.1, shin: 1.05, foot: 1.2, uarm: 1.3, farm: 1.3, hand: 1.5 };
CHAR_DEFS.brute = { ...CHAR_DEFS.stick, name: 'brute', speed: 0.7, weight: 1.35, health: 1.2, tough: 1.25, springs: 0.85,
  bones: STICK_BONES.map(b => ({ ...b, len: Math.round(b.len * BRUTE_SCALE[b.id.replace(/[FB]$/, '')]), thick: (b.thick ?? BONE.thick) + (b.role === 'spine' ? 10 : 6),
    hurt: b.hurt ? b.hurt + 5 : 0, stiff: 0.65, damp: 1.25 })),
  moves: mapVals(CHAR_DEFS.stick.moves, m => m.power ? { ...m, power: +(m.power * 1.3).toFixed(2), knock: m.knock * 1.25,
    keys: m.keys.map(k => ({ ...k, d: +(k.d * 1.4).toFixed(4) })) } : m) };
// more built-ins, all on the stick's moves: scale its bones by segment name, add parts, retime the moves
const sizedBones = (scale, thick = 0) => STICK_BONES.map(b => ({ ...b, len: Math.round(b.len * (scale[b.id.replace(/[FB]$/, '')] ?? 1)),
  thick: (b.thick ?? BONE.thick) + thick, hurt: b.hurt ? b.hurt + thick : 0 }));
const pair = (f, props) => ['F', 'B'].map(S => ({ ...f(S), side: S.toLowerCase(), ...props }));
const horns = (len, a, curl) => ['F', 'B'].flatMap(S => [
  { id: 'horn' + S, parent: 'head', len, a: a + (S === 'B' ? 15 : 0), role: 'head', side: S.toLowerCase(), thick: 3, lag: 0.5 },
  { id: 'hornTip' + S, parent: 'horn' + S, len: Math.round(len * 0.7), a: curl, role: 'head', side: S.toLowerCase(), thick: 2, lag: 1 }]);
const tail3 = (len, thick) => [
  { id: 'tail', parent: null, len, a: -120, role: 'tail', thick, lag: 1 },
  { id: 'tailMid', parent: 'tail', len: Math.round(len * 0.9), a: -20, role: 'tail', thick: thick - 1, lag: 2, min: -70, max: 70 },
  { id: 'tailEnd', parent: 'tailMid', len: Math.round(len * 0.8), a: -20, role: 'tail', thick: Math.max(1, thick - 2), lag: 3, stretch: 0.25, min: -70, max: 70 }];
const retimed = (k, power = 1) => mapVals(CHAR_DEFS.stick.moves, m => m.power
  ? { ...m, power: +(m.power * power).toFixed(2), knock: Math.round(m.knock * power), keys: m.keys.map(x => ({ ...x, d: +(x.d * k).toFixed(4) })) } : m);
// every pose a definition holds (named poses, move keys, hit reactions)
function mapPoses(def, fn) {
  const f = p => p && fn({ ...p });
  return { ...def, poses: mapVals(def.poses, f), moves: mapVals(def.moves, m => ({ ...m, keys: m.keys.map(k => ({ ...k, p: f(k.p) })) })),
    hurt: mapVals(def.hurt, set => set.map(f)) };
}
const { stick } = CHAR_DEFS;
// dwarf: short legs, a barrel chest, everything thick
CHAR_DEFS.dwarf = { ...stick, name: 'dwarf', speed: 0.85, jump: 0.85, weight: 1.2, tough: 1.2, moves: retimed(1.1, 1.15),
  bones: [...sizedBones({ waist: 0.8, chest: 0.85, neck: 0.6, head: 1.15, thigh: 0.6, shin: 0.55, foot: 1.2, uarm: 0.85, farm: 0.85, hand: 1.5 }, 5)
    .map(b => b.role === 'spine' ? { ...b, thick: b.thick + 8, hurt: b.hurt + 3 } : b),
    { id: 'beard', parent: 'head', len: 11, a: -165, role: 'head', thick: 7, lag: 1.5, stretch: 0.1 }] };
CHAR_DEFS.minotaur = { ...stick, name: 'minotaur', weight: 1.25, health: 1.1, moves: retimed(1.2, 1.35),
  bones: [...sizedBones({ waist: 1.25, chest: 1.4, neck: 1.6, head: 1.35, thigh: 1.15, shin: 1.1, foot: 1.3, uarm: 1.3, farm: 1.3, hand: 1.6 }, 4)
    .map(b => ({ ...b, stiff: 0.75, damp: 1.2 })), ...horns(18, -50, 40), ...tail3(16, 4)] };
CHAR_DEFS.demon = { ...stick, name: 'demon', jump: 1.15, weight: 0.9, moves: retimed(0.9),
  bones: [...sizedBones({ waist: 1.1, chest: 1.1, thigh: 1.15, shin: 1.15, uarm: 1.2, farm: 1.25, hand: 1.5 }).map(b => ({ ...b, stretch: b.role === 'arm' ? 0.15 : 0 })),
    ...horns(7, -20, 30), ...tail3(16, 3),
    ...pair(S => ({ id: 'wing' + S, parent: 'chest', len: 20, a: 5 + (S === 'B' ? 12 : 0), role: 'tail', thick: 3, lag: 1.5 })),
    ...pair(S => ({ id: 'wingTip' + S, parent: 'wing' + S, len: 18, a: 40, role: 'tail', thick: 2, lag: 2.5, stretch: 0.2, min: 0, max: 110 }))] };
// centaur: a horizontal horse body from the hips forward; the human waist sits on its front end (its angles are
// relative to the barrel, so every pose's waist turns by -90); hind legs are the stick's legs, forelegs hang off the barrel
// the forelegs move as the stick's legs do (knees forward, they do the kicking), the hind legs bend the other way like hocks
// and follow at half strength; both relative to the centaur's own stance
const QUAD_HITS = { footF: 'hoofF', footB: 'hoofB', shinF: 'foreShinF', shinB: 'foreShinB' };
const QUAD_STANCE = { thighF: -22, shinF: 30, thighB: -12, shinB: 22, foreThighF: -76, foreShinF: -18, foreThighB: -84, foreShinB: -12 };
function quadLegs(p) {
  const st = CHAR_DEFS.stick.poses.stance;
  if ('waist' in p) p.waist -= 90;
  for (const S of 'FB') {
    for (const [j, f] of [['thigh', 'foreThigh'], ['shin', 'foreShin']]) if (j + S in p) {
      const d = p[j + S] - st[j + S];
      p[f + S] = QUAD_STANCE[f + S] + d; p[j + S] = QUAD_STANCE[j + S] - d / 2;
    }
    if ('foot' + S in p) p['hoof' + S] = p['foot' + S];
  }
  return p;
}
CHAR_DEFS.centaur = { ...mapPoses({ ...stick, moves: mapVals(retimed(1.1, 1.2), m => ({ ...m, hit: QUAD_HITS[m.hit] || m.hit })) }, quadLegs), name: 'centaur', speed: 1.1, weight: 1.4, jump: 0.9,
  bones: [{ id: 'barrel', len: 34, a: 90, role: 'spine', hurt: 13, thick: 11, lag: 0, min: 60, max: 120 },
    ...STICK_BONES.map(b => b.id === 'waist' ? { ...b, parent: 'barrel', a: 90, min: 30, max: 210 } : b.id.startsWith('shin') ? { ...b, min: -8, max: 165 } : b),
    ...['B', 'F'].flatMap(S => [
      { id: 'foreThigh' + S, parent: 'barrel', len: 22, a: -90, role: 'leg', side: S.toLowerCase(), hurt: 8, lag: 0, min: -190, max: 50 },
      { id: 'foreShin' + S, parent: 'foreThigh' + S, len: 23, role: 'leg', side: S.toLowerCase(), hurt: 8, lag: 1, min: -165, max: 8 },
      { id: 'hoof' + S, parent: 'foreShin' + S, len: 6, a: 90, role: 'leg', side: S.toLowerCase(), hurt: 6, lag: 1.5, level: 1, thick: 5, min: 40, max: 140 }]),
    ...tail3(12, 3).map(b => b.id === 'tail' ? { ...b, a: -150 } : b)] };
// ninja: slender, long legs, fast and light; a scarf trails from the neck
CHAR_DEFS.ninja = { ...stick, name: 'ninja', speed: 1.25, jump: 1.15, weight: 0.85, health: 0.9, springs: 1.15, binds: { downFwdKick: 'slide', upFwdKick: 'axeKick', upFwdPunch: 'rising' },
  moves: { ...retimed(0.8, 0.85), ...mapVals({
    // a low slide along the floor, under highs
    slide: attack({ power: 1.1, damage: 8, hit: 'ff', height: 'low', knock: 160, launch: 220, kd: true, lunge: 520 },
      [0.06, { torso: -20, lfU: 60, lfL: -90, lbU: 10, lbL: -110 }],
      [0.06, { torso: -50, lfU: 85, lfL: 0, lbU: 30, lbL: -135, afU: -70, afL: 30, abU: -90, abL: 20 }], 0.14, 0.2),
    // the heel comes down from above the head: an overhead
    axeKick: attack({ power: 1.6, damage: 13, hit: 'ff', height: 'shigh', knock: 150, stun: 0.5, lunge: 140 },
      [0.1, { torso: -22, lfU: 170, lfL: -5, afU: 40, abU: 60 }],
      [0.06, { torso: 15, lfU: 55, lfL: 0, lbU: -15, lbL: 0, afU: 30, abU: 40 }], 0.06, 0.24),
  }, oldMove) },
  bones: [...sizedBones({ waist: 1.05, chest: 0.95, head: 0.9, thigh: 1.15, shin: 1.15, uarm: 1.05, farm: 1.05 }, -1),
    // the scarf trails behind the neck (+ angle = backwards for a bone hanging off it) and flutters on its springs
    { id: 'scarf', parent: 'neck', len: 13, a: 105, role: 'tail', thick: 4, lag: 2, stretch: 0.2 },
    { id: 'scarfMid', parent: 'scarf', len: 13, a: -15, role: 'tail', thick: 3, lag: 3, stretch: 0.25, min: -60, max: 60 },
    { id: 'scarfEnd', parent: 'scarfMid', len: 11, a: -15, role: 'tail', thick: 2, lag: 4, stretch: 0.3, min: -60, max: 60 }] };
// ape: long heavy arms, short legs, hunched forward
CHAR_DEFS.ape = { ...stick, name: 'ape', speed: 0.95, jump: 1.1, moves: retimed(1.05, 1.15),
  bones: sizedBones({ waist: 0.95, chest: 1.15, neck: 0.6, head: 1.05, thigh: 0.8, shin: 0.75, uarm: 1.5, farm: 1.5, hand: 1.6 }, 3)
    .map(b => b.role === 'spine' ? { ...b, thick: b.thick + 4 } : b) };
CHAR_DEFS.ape.poses = { ...CHAR_DEFS.ape.poses, stance: { ...CHAR_DEFS.ape.poses.stance, waist: 155, neck: 15, uarmF: -140, uarmB: -150, farmF: 15, farmB: 20 } };
// asura: a second pair of arms on the chest, swinging and breathing with the first
CHAR_DEFS.asura = { ...stick, name: 'asura', moves: retimed(0.95, 1.1),
  bones: [...sizedBones({ chest: 1.15, uarm: 1.05, farm: 1.05 }, 1),
    ...['F', 'B'].flatMap(S => [
      { id: 'uarm2' + S, parent: 'chest', len: 15, a: -175, role: 'arm', side: S.toLowerCase(), lag: 1.2, thick: 5, min: -250, max: -10 },
      { id: 'farm2' + S, parent: 'uarm2' + S, len: 12, role: 'arm', side: S.toLowerCase(), lag: 2, thick: 5, min: -10, max: 165 },
      { id: 'hand2' + S, parent: 'farm2' + S, len: 4, role: 'arm', side: S.toLowerCase(), lag: 2.5, thick: 6, min: -70, max: 70 }])] };
CHAR_DEFS.asura.poses = { ...stick.poses, stance: { ...stick.poses.stance, uarm2F: -100, farm2F: 50, uarm2B: -230, farm2B: 40 } };
const CHARS = mapVals(CHAR_DEFS, makeCharacter);
let CURRENT = 'stick';
const currentChar = () => CHARS[CURRENT];

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

// forward kinematics, hip (root) at origin, y down. dir in [-1, 1] (fractional while turning). lens: stretched lengths
// wa (optional) receives each bone's world angle
function fk(ch, p, dir, lens, wa = {}) {
  const P = { hip: [0, 0] };
  for (const b of ch.bones) {
    const pb = b.parent && ch.by[b.parent], pw = pb ? wa[pb.id] : 0;
    const w = wa[b.id] = pw + p[b.id] - b.level * (pw - (pb ? pb.restW : 0));
    const o = P[b.parent || 'hip'], l = lens ? lens[b.id] : b.len;
    P[b.id] = [o[0] + Math.sin(w * R) * l * dir, o[1] + Math.cos(w * R) * l];
  }
  return P;
}

// back limbs first in the second colour, then the body, then front limbs. extra = added stroke width (outlines)
// tint(bone) overrides the colour per bone (the editors colour-code by role)
function drawFigure(ctx, ch, P, col, back, extra = 0, tint = null) {
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const side of ['b', '', 'f']) for (const b of ch.bones) if (b.side === side) {
    const o = P[b.parent || 'hip'], e = P[b.id], c = tint ? tint(b) : side === 'b' ? back : col;
    if (b.shape === 'circle') { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(e[0], e[1], b.len + extra / 2, 0, 7); ctx.fill(); continue; }
    ctx.strokeStyle = c; ctx.lineWidth = b.thick + extra;
    ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
  }
}
