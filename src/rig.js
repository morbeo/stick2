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
  react: 1, sway: 1,   // secondary motion: how hard blows and bounces jolt the bone; how much it drifts while idle
  dangle: 0,           // how much the bone swings with the body's motion: trails behind a run, lifts in a fall (tails, scarves)
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
const TUCK = { torso: 70, head: 30, lfU: 120, lfL: -150, lbU: 110, lbL: -150, afU: 40, afL: 130, abU: 30, abL: 140 }; // curled up in a ball (rolls)
const AIR = { torso: 4, lfU: 55, lfL: -95, lbU: -10, lbL: -45, afU: 55, afL: 95, abU: 40, abL: 100 };
const AIR_FALL = { torso: 6, lfU: 28, lfL: -35, lbU: -18, lbL: -20, afU: 75, afL: 60, abU: 65, abL: 70 };
const FALL = { torso: -55, head: -20, afU: 140, afL: 30, abU: 110, abL: 50, lfU: 60, lfL: -50, lbU: 30, lbL: -30 };
const LIE = { torso: -90, head: 0, afU: 6, afL: 8, abU: -2, abL: 6, lfU: 93, lfL: -14, lbU: 96, lbL: -6 }; // on the back, arms by the sides

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
  spin: attack({ power: 1.9, damage: 15, hit: 'bf', height: 'high', knock: 420, launch: 320, kd: true, wallbounce: true, lunge: 260, special: true, wide: true },
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
  launcher: attack({ power: 1.5, damage: 10, hit: 'fh', height: 'mid', knock: 80, launch: 560, kd: true, launcher: true },
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
  // ← P+G: the back throw; its throw turns round with the victim held (key flag turn), so the victim lands on the other side
  backGrab: { power: 1, damage: 0, hit: 'fh', height: 'high', knock: 0, throw: 'backToss', keys: [
    { d: 0.06, e: 'outQuad', p: { torso: 15, afU: 70, afL: 40, abU: 60, abL: 50 } },
    { d: 0.06, e: 'outExpo', p: { torso: 22, afU: 92, afL: 5, abU: 88, abL: 10, lfU: 40, lfL: -35 }, active: true, lunge: 120 },
    { d: 0.32, e: 'inOutCubic', p: null },
  ] },
  backToss: { power: 1.5, damage: 14, hit: 'fh', height: 'mid', knock: 300, launch: 380, kd: true, keys: [
    { d: 0.18, e: 'inOutCubic', p: { torso: 5, afU: 90, afL: 60, abU: 80, abL: 70, lfU: 30, lfL: -40, lbU: -25, lbL: -20 }, turn: true },
    { d: 0.08, e: 'outExpo', p: { torso: 30, afU: 140, afL: 10, abU: 130, abL: 20, lfU: 45, lfL: -30, lbU: -35, lbL: 0 } },
    { d: 0.3, e: 'inOutCubic', p: null },
  ] },
  // ← S: a counter stance; a mid strike from the front landing during its catch key (catchH: the heights it catches) is caught
  // and answered by the counter move
  catch: { power: 1, special: true, counter: 'reversal', keys: [
    { d: 0.05, e: 'outQuad', p: { torso: -5, afU: 80, afL: 60, abU: 40, abL: 90 } },
    { d: 0.3, p: { torso: -5, afU: 85, afL: 55, abU: 45, abL: 85 }, catch: true, catchH: ['mid', 'smid'] },
    { d: 0.25, e: 'inOutCubic', p: null },
  ] },
  reversal: { power: 1.6, damage: 13, hit: 'bh', height: 'mid', knock: 350, launch: 380, kd: true, keys: [
    { d: 0.05, e: 'outExpo', p: { torso: 30, abU: 110, abL: 0, afU: 20, afL: 130, lbU: -30, lbL: 0, lfU: 35 } },
    { d: 0.1, p: { torso: 30, abU: 110, abL: 0, afU: 20, afL: 130, lbU: -30, lbL: 0, lfU: 35 } },
    { d: 0.3, e: 'inOutCubic', p: null },
  ] },
  // the head as the weapon: a lunge with the forehead, head high
  headbutt: attack({ power: 1.4, damage: 11, hit: 'head', height: 'high', knock: 220, stun: 0.5, lunge: 160 },
    [0.1, { torso: -15, head: -20, afU: 30, afL: 120, abU: 20, abL: 120 }],
    [0.05, { torso: 42, head: 28, afU: 0, afL: 110, abU: -10, abL: 110, lfU: 45, lfL: -35, lbU: -30, lbL: 0 }], 0.05, 0.26),
  // both hands at once (two striking bones): a push that sends the victim away
  palms: attack({ power: 1.3, damage: 9, hit: ['fh', 'bh'], height: 'mid', knock: 420, stun: 0.36, lunge: 140 },
    [0.08, { torso: -5, afU: 20, afL: 140, abU: 25, abL: 140 }],
    [0.05, { torso: 20, afU: 100, afL: 5, abU: 72, abL: 15, lfU: 40, lfL: -30, lbU: -25, lbL: 0 }], 0.06, 0.24),
  // a projectile (shoot key): both palms drawn back to the hip, then pushed out; the shot leaves as the push is reached and hits
  // with the move's own power, damage and height (move field shot: speed, size, life, look)
  fireball: { power: 1.2, damage: 9, hit: ['fh', 'bh'], height: 'mid', knock: 220, stun: 0.42, special: true, shot: { speed: 360, size: 12, look: 'ki' }, keys: [
    { d: 0.13, e: 'outQuad', p: { torso: -10, afU: -40, afL: 120, abU: -50, abL: 120, lfU: 35, lfL: -40, lbU: -25, lbL: -10 } },
    { d: 0.06, e: 'outExpo', shoot: true, p: { torso: 18, afU: 90, afL: 5, abU: 80, abL: 10, lfU: 40, lfL: -35, lbU: -30, lbL: 0 } },
    { d: 0.16, p: { torso: 18, afU: 90, afL: 5, abU: 80, abL: 10, lfU: 40, lfL: -35, lbU: -30, lbL: 0 } },
    { d: 0.22, e: 'inOutCubic', p: null }] },
  // the rest of the direction table (see BINDS): 4K steps back as it kicks, 1P a quick crouching poke, 3P a lunging body blow,
  // 1K a sweep with the back leg; 2.5D only (2D diagonals up are jumps): 7P backfist, 7K crescent (overhead), 9K flying knee
  fadeKick: attack({ power: 1.2, damage: 8, hit: 'ff', height: 'mid', knock: 300, stun: 0.36, lunge: -180 },
    [0.08, { torso: -10, lfU: 70, lfL: -110, lbU: -5, lbL: -30, afU: 30, afL: 110, abU: 40, abL: 100 }],
    [0.06, { torso: -32, lfU: 95, lfL: -3, lbU: -20, lbL: -15, afU: -10, afL: 70, abU: 60, abL: 60 }], 0.07, 0.24),
  crouchJab: attack({ power: 0.9, damage: 4, hit: 'fh', height: 'mid', knock: 90, stun: 0.3, next: { kick: 'lowKick' } },
    [0.05, { ...CROUCH, afU: 20, afL: 130, abU: 30, abL: 130 }],
    [0.04, { ...CROUCH, torso: 28, afU: 85, afL: 0, abU: 20, abL: 130 }], 0.05, 0.14),
  bodyBlow: attack({ power: 1.4, damage: 11, hit: 'fh', height: 'mid', knock: 200, stun: 0.55, lunge: 180 },
    [0.09, { ...CROUCH, torso: 15, afU: -20, afL: 100, abU: 40, abL: 120 }],
    [0.06, { torso: 38, lfU: 55, lfL: -50, lbU: -35, lbL: -10, afU: 60, afL: 40, abU: 10, abL: 130 }], 0.07, 0.26),
  backSweep: attack({ power: 1.5, damage: 12, hit: 'bf', height: 'low', knock: 200, launch: 280, kd: true, wide: true },
    [0.12, { torso: 35, lfU: 50, lfL: -120, lbU: -20, lbL: -110, afU: -30, afL: 50, abU: -40, abL: 40 }],
    [0.08, { torso: 45, lfU: 45, lfL: -125, lbU: 80, lbL: -3, afU: -50, afL: 30, abU: -60, abL: 20 }], 0.09, 0.3),
  backfist: attack({ power: 1.4, damage: 11, hit: 'bh', height: 'high', knock: 260, stun: 0.45, lunge: 140 },
    [0.1, { torso: -15, head: 10, abU: 20, abL: 150, afU: 60, afL: 120 }],
    [0.06, { torso: 10, head: -5, abU: 100, abL: 20, afU: 10, afL: 110, lbU: -30, lbL: 0, lfU: 35, lfL: -20 }], 0.07, 0.26),
  crescent: attack({ power: 1.6, damage: 13, hit: 'ff', height: 'shigh', knock: 200, launch: 120, kd: true },
    [0.11, { torso: -10, lfU: 140, lfL: -40, lbU: -10, lbL: 0, afU: 40, afL: 100, abU: 50, abL: 90 }],
    [0.07, { torso: 15, lfU: 70, lfL: -5, lbU: -10, lbL: 0, afU: 20, afL: 90, abU: 70, abL: 60 }], 0.06, 0.3),
  flyingKnee: attack({ power: 1.6, damage: 13, hit: 'thighF', height: 'high', knock: 160, launch: 420, kd: true, lunge: 260, reach: 8 },
    [0.09, { ...CROUCH, afU: -30, afL: 90, abU: -20, abL: 90 }],
    [0.06, { torso: 10, lfU: 100, lfL: -140, lbU: -40, lbL: -20, afU: 120, afL: 80, abU: 110, abL: 80 }], 0.08, 0.28),
  // air ↑ / ↓ with P / K: an upward punch and flip kick that launch, a double-fist spike off the floor, a dive kick forward
  airUpper: attack({ power: 1.2, damage: 8, hit: 'fh', height: 'high', knock: 120, launch: 300, stun: 0.35, air: true },
    [0.05, { torso: 10, afU: 30, afL: 130 }],
    [0.05, { torso: -5, afU: 170, afL: 5, abU: -20, abL: 110 }], 0.12, 0.15),
  airHammer: attack({ power: 1.5, damage: 11, hit: ['fh', 'bh'], height: 'shigh', knock: 80, launch: 100, kd: true, bounce: true, air: true },
    [0.08, { torso: -10, afU: 175, afL: 40, abU: 170, abL: 40, lfU: 40, lfL: -90, lbU: 20, lbL: -90 }],
    [0.06, { torso: 30, afU: 40, afL: 10, abU: 35, abL: 10, lfU: 30, lfL: -80, lbU: 10, lbL: -80 }], 0.12, 0.18),
  airFlipKick: attack({ power: 1.4, damage: 10, hit: 'ff', height: 'high', knock: 140, launch: 380, stun: 0.4, air: true },
    [0.06, { torso: 10, lfU: 60, lfL: -120, lbU: 10, lbL: -100 }],
    [0.06, { torso: -35, head: -10, lfU: 150, lfL: -5, lbU: 0, lbL: -80, afU: -30, afL: 60, abU: -40, abL: 60 }], 0.12, 0.18),
  diveKick: attack({ power: 1.3, damage: 9, hit: 'ff', height: 'shigh', knock: 220, stun: 0.4, air: true, lunge: 300 },
    [0.06, { torso: 10, lfU: 70, lfL: -120, lbU: 20, lbL: -110 }],
    [0.05, { torso: 15, lfU: 35, lfL: -3, lbU: 30, lbL: -120, afU: 60, afL: 80, abU: 80, abL: 60 }], 0.22, 0.15),
  // 623K: a flash kick, invincible as it rises; S in the air: a spinning kick
  risingKick: { power: 1.8, damage: 14, hit: 'ff', height: 'high', knock: 120, launch: 650, kd: true, special: true, keys: [
    { d: 0.05, e: 'outQuad', p: { ...CROUCH, afU: -20, afL: 60, abU: -30, abL: 60 }, inv: true },
    { d: 0.06, e: 'outExpo', p: { torso: -30, head: -10, lfU: 160, lfL: -10, lbU: -10, lbL: -20, afU: -40, afL: 40, abU: -50, abL: 40 }, active: true, lunge: 120, inv: true },
    { d: 0.1, e: 'outQuad', p: { torso: -40, head: -15, lfU: 175, lfL: -5, lbU: -15, lbL: -40, afU: -50, afL: 40, abU: -60, abL: 40 }, active: true },
    { d: 0.34, e: 'inOutCubic', p: null },
  ] },
  airSpin: attack({ power: 1.6, damage: 12, hit: 'bf', height: 'high', knock: 380, launch: 200, kd: true, air: true, special: true, wide: true },
    [0.08, { torso: -12, lbU: 40, lbL: -130, lfU: 30, lfL: -100, afU: 60, afL: 90, abU: -30, abL: 70 }],
    [0.07, { torso: -36, lbU: 115, lbL: -5, lfU: 20, lfL: -100, afU: -30, afL: 50, abU: 80, abL: 30 }], 0.12, 0.2),
  // fighting-style moves (unbound: pick them from a slot); MOVE_STYLES below tags every move with its style
  hook: attack({ power: 1.3, damage: 9, hit: 'fh', height: 'high', knock: 220, stun: 0.42, lunge: 80, next: { punch: 'cross' } },
    [0.07, { torso: -4, afU: 40, afL: 120, abU: 30, abL: 130 }],
    [0.05, { torso: 24, head: 5, afU: 88, afL: 80, abU: 15, abL: 135, lfU: 30, lfL: -25, lbU: -25, lbL: 0 }], 0.06, 0.2),
  bodyHook: attack({ power: 1.3, damage: 10, hit: 'bh', height: 'mid', knock: 180, stun: 0.5, lunge: 100 },
    [0.08, { ...CROUCH, torso: 10, abU: -10, abL: 110, afU: 40, afL: 130 }],
    [0.05, { ...CROUCH, torso: 30, abU: 60, abL: 75, afU: 30, afL: 135 }], 0.06, 0.22),
  overhand: attack({ power: 1.6, damage: 13, hit: 'bh', height: 'high', knock: 260, launch: 150, kd: true, lunge: 160 },
    [0.12, { torso: -12, abU: 150, abL: 100, afU: 40, afL: 120 }],
    [0.06, { torso: 38, head: 10, abU: 95, abL: 15, afU: 10, afL: 120, lfU: 45, lfL: -40, lbU: -35, lbL: 0 }], 0.07, 0.3),
  reversePunch: attack({ power: 1.3, damage: 10, hit: 'bh', height: 'mid', knock: 260, stun: 0.42, lunge: 220 },
    [0.07, { torso: 0, abU: -20, abL: 120, afU: 70, afL: 10 }],
    [0.05, { torso: 18, abU: 95, abL: 0, afU: -20, afL: 120, lfU: 50, lfL: -45, lbU: -40, lbL: 0 }], 0.07, 0.22),
  sideKick: attack({ power: 1.5, damage: 12, hit: 'ff', height: 'mid', knock: 460, stun: 0.4, lunge: 120 },
    [0.1, { torso: -15, lfU: 100, lfL: -140, lbU: -5, lbL: -10, afU: 30, afL: 100, abU: 50, abL: 90 }],
    [0.06, { torso: -45, head: 15, lfU: 105, lfL: 0, lbU: -15, lbL: 0, afU: -20, afL: 60, abU: 40, abL: 80 }], 0.08, 0.26),
  knifeHand: attack({ power: 1.3, damage: 10, hit: 'fh', height: 'high', knock: 200, stun: 0.45, lunge: 120 },
    [0.09, { torso: -8, afU: 150, afL: 130, abU: 60, abL: 90 }],
    [0.05, { torso: 22, afU: 72, afL: 8, abU: -10, abL: 120, lfU: 35, lfL: -30, lbU: -25, lbL: 0 }], 0.06, 0.22),
  // the Thai clinch: hands behind the head on connect, then knees (the release of the hold does the damage)
  plum: { power: 1, damage: 0, hit: 'fh', height: 'high', knock: 0, throw: 'knee', keys: [
    { d: 0.06, e: 'outQuad', p: { torso: 10, afU: 120, afL: 60, abU: 115, abL: 60 } },
    { d: 0.06, e: 'outExpo', p: { torso: 18, afU: 110, afL: 50, abU: 105, abL: 55, lfU: 35, lfL: -30 }, active: true, lunge: 110 },
    { d: 0.3, e: 'inOutCubic', p: null },
  ] },
  knee: { power: 1.4, damage: 13, hit: 'thighF', height: 'mid', knock: 260, stun: 0.6, keys: [
    { d: 0.12, e: 'outQuad', p: { torso: 15, afU: 115, afL: 70, abU: 110, abL: 70, lfU: 10, lfL: -60, lbU: -15, lbL: 0 } },
    { d: 0.07, e: 'outExpo', p: { torso: 5, afU: 100, afL: 80, abU: 95, abL: 80, lfU: 105, lfL: -140, lbU: -10, lbL: 0 } },
    { d: 0.08, p: { torso: 5, afU: 100, afL: 80, abU: 95, abL: 80, lfU: 105, lfL: -140, lbU: -10, lbL: 0 } },
    { d: 0.26, e: 'inOutCubic', p: null },
  ] },
  // a spinning heel kick: a whole turn (two turn keys), the heel coming round head high
  spinKick: attack({ power: 1.8, damage: 15, hit: 'ff', height: 'high', knock: 380, launch: 260, kd: true, lunge: 160, wide: true },
    [0.12, { torso: -10, head: 10, lfU: 30, lfL: -90, lbU: -10, lbL: -20, afU: 60, afL: 80, abU: -30, abL: 70 }],
    [0.08, { torso: -35, head: 15, lfU: 115, lfL: -5, lbU: -10, lbL: 0, afU: -20, afL: 50, abU: 70, abL: 40 }], 0.08, 0.3),
  spinElbow: attack({ power: 1.6, damage: 13, hit: 'uarmB', height: 'high', knock: 280, stun: 0.55, lunge: 240, wide: true },
    [0.1, { torso: -25, head: 15, abU: 30, abL: 150, afU: 60, afL: 120 }],
    [0.05, { torso: 15, head: -10, abU: 95, abL: 160, afU: 10, afL: 120, lbU: -30, lbL: 0, lfU: 35, lfL: -20 }], 0.06, 0.28),
  thaiKick: attack({ power: 1.5, damage: 12, hit: 'bf', height: 'low', knock: 160, stun: 0.5 },
    [0.09, { torso: -5, lbU: 20, lbL: -60, afU: 120, afL: 60, abU: -20, abL: 40 }],
    [0.06, { torso: -25, lbU: 70, lbL: -5, lfU: 0, lfL: -10, afU: 130, afL: 50, abU: -40, abL: 20 }], 0.08, 0.26),
  armada: attack({ power: 1.7, damage: 14, hit: 'bf', height: 'high', knock: 360, launch: 220, kd: true, lunge: 120, wide: true },
    [0.12, { torso: 20, head: 20, lbU: -10, lbL: -40, lfU: 20, lfL: -40, afU: -40, afL: 40, abU: -50, abL: 40 }],
    [0.07, { torso: -30, head: 10, lbU: 140, lbL: -10, lfU: 5, lfL: -15, afU: 60, afL: 40, abU: 40, abL: 40 }], 0.09, 0.3),
  martelo: attack({ power: 1.4, damage: 11, hit: 'ff', height: 'high', knock: 300, stun: 0.45 },
    [0.08, { torso: -10, lfU: 90, lfL: -130, afU: 60, afL: 80, abU: -30, abL: 60 }],
    [0.06, { torso: -40, lfU: 125, lfL: -5, lbU: -10, lbL: 0, afU: 70, afL: 60, abU: -40, abL: 40 }], 0.07, 0.24),
  rasteira: attack({ power: 1.3, damage: 9, hit: 'ff', height: 'low', knock: 120, launch: 260, kd: true, lunge: 60 },
    [0.1, { torso: 55, head: -15, afU: 40, afL: 10, abU: 20, abL: 20, lfU: 60, lfL: -130, lbU: -20, lbL: -120 }],
    [0.07, { torso: 60, head: -15, afU: 45, afL: 5, abU: 25, abL: 15, lfU: 75, lfL: -5, lbU: -20, lbL: -125 }], 0.08, 0.28),
  chainPunch: { power: 1, damage: 9, hit: ['fh', 'bh'], height: 'high', knock: 140, stun: 0.45, next: { punch: 'palms' }, keys: [
    { d: 0.05, e: 'outQuad', p: { torso: 8, afU: 70, afL: 90, abU: 60, abL: 100 } },
    { d: 0.04, e: 'outExpo', p: { torso: 14, afU: 92, afL: 0, abU: 60, abL: 100 }, active: true, lunge: 80 },
    { d: 0.04, e: 'outExpo', p: { torso: 14, afU: 60, afL: 100, abU: 92, abL: 0 }, active: true, lunge: 80 },
    { d: 0.04, e: 'outExpo', p: { torso: 16, afU: 92, afL: 0, abU: 60, abL: 100 }, active: true, lunge: 80 },
    { d: 0.18, e: 'inOutCubic', p: null },
  ] },
  tigerClaw: attack({ power: 1.4, damage: 11, hit: ['fh', 'bh'], height: 'high', knock: 300, stun: 0.45, lunge: 160 },
    [0.09, { ...CROUCH, torso: 10, afU: 20, afL: 140, abU: 10, abL: 140 }],
    [0.05, { torso: 25, afU: 120, afL: 30, abU: 100, abL: 40, lfU: 45, lfL: -35, lbU: -30, lbL: 0 }], 0.07, 0.24),
  axeKick: attack({ power: 1.6, damage: 13, hit: 'ff', height: 'shigh', knock: 120, launch: 80, kd: true, bounce: true },
    [0.12, { torso: -20, lfU: 170, lfL: -5, lbU: -10, lbL: 0, afU: 40, afL: 100, abU: -30, abL: 80 }],
    [0.06, { torso: 15, lfU: 45, lfL: -5, lbU: -15, lbL: 0, afU: 50, afL: 90, abU: -20, abL: 70 }], 0.07, 0.3),
  lariat: attack({ power: 1.7, damage: 14, hit: 'fh', height: 'high', knock: 320, launch: 320, kd: true, lunge: 380 },
    [0.1, { torso: 10, afU: -40, afL: 20, abU: 30, abL: 100, lfU: 40, lfL: -60 }],
    [0.06, { torso: 25, afU: 92, afL: 0, abU: -20, abL: 90, lfU: 50, lfL: -40, lbU: -35, lbL: 0 }], 0.12, 0.3),
  // a second throw: clinch on connect, then the victim goes over the top
  clinch: { power: 1, damage: 0, hit: 'fh', height: 'high', knock: 0, throw: 'suplex', keys: [
    { d: 0.07, e: 'outQuad', p: { torso: 20, afU: 80, afL: 60, abU: 70, abL: 70 } },
    { d: 0.06, e: 'outExpo', p: { torso: 28, afU: 95, afL: 30, abU: 90, abL: 35, lfU: 40, lfL: -35 }, active: true, lunge: 100 },
    { d: 0.34, e: 'inOutCubic', p: null },
  ] },
  suplex: { power: 1.7, damage: 16, hit: 'fh', height: 'mid', knock: -120, launch: 560, kd: true, keys: [
    { d: 0.18, e: 'outQuad', p: { ...CROUCH, torso: 10, afU: 80, afL: 70, abU: 75, abL: 75 } },
    { d: 0.1, e: 'outExpo', p: { torso: -55, head: -30, afU: 170, afL: 20, abU: 165, abL: 25, lfU: 20, lfL: -30, lbU: -10, lbL: -20 } },
    { d: 0.34, e: 'inOutCubic', p: null },
  ] },
  getup: { inv: true, keys: [
    { d: 0.18, e: 'outCubic', p: { torso: -30, head: 10, lfU: 75, lfL: -130, lbU: 60, lbL: -140, afU: -40, afL: 20, abU: -60, abL: 10 } },
    { d: 0.16, e: 'outCubic', p: { ...CROUCH, afU: 30, afL: 110, abU: 20, abL: 120 } },
    { d: 0.2, e: 'inOutCubic', p: null },
  ] },
  // wake-up (wakeUp setting): P / K while lying, a kick from the floor on the way up, invincible as it rises
  getupAttack: { power: 1, damage: 7, hit: 'ff', height: 'mid', knock: 260, stun: 0.4, keys: [
    { d: 0.12, e: 'outCubic', p: { torso: -30, head: 10, lfU: 75, lfL: -130, lbU: 60, lbL: -140, afU: -40, afL: 20, abU: -60, abL: 10 }, inv: true },
    { d: 0.06, e: 'outExpo', p: { torso: -40, head: 15, lfU: 100, lfL: -5, lbU: 60, lbL: -140, afU: -50, afL: 20, abU: -70, abL: 10 }, active: true },
    { d: 0.06, p: { torso: -40, head: 15, lfU: 100, lfL: -5, lbU: 60, lbL: -140, afU: -50, afL: 20, abU: -70, abL: 10 }, active: true },
    { d: 0.14, e: 'outCubic', p: { ...CROUCH, afU: 30, afL: 110, abU: 20, abL: 120 } },
    { d: 0.18, e: 'inOutCubic', p: null },
  ] },
  // out of blockstun: guardCancel strikes back (invincible as it starts), pushBlock shoves the attacker away
  guardCancel: { ...attack({ power: 1.2, damage: 7, hit: 'fh', height: 'mid', knock: 320, stun: 0.4, lunge: 120 },
    [0.04, { torso: -10, afU: 30, afL: 120, abU: 40, abL: 110 }],
    [0.05, { torso: 20, afU: 92, afL: 5, abU: 30, abL: 120, lfU: 35, lfL: -30, lbU: -25, lbL: 0 }], 0.05, 0.2) },
  pushBlock: { keys: [
    { d: 0.04, e: 'outQuad', p: { torso: -8, afU: 50, afL: 100, abU: 45, abL: 105 }, inv: true },
    { d: 0.1, e: 'outExpo', p: { torso: 15, afU: 88, afL: 10, abU: 84, abL: 15, lfU: 30, lfL: -25, lbU: -30, lbL: 0 }, inv: true },
    { d: 0.16, e: 'inOutCubic', p: null },
  ] },
  // counters by height (counters setting): catchHigh catches highs and answers with an elbow to the body, catchLow catches lows
  // and answers with a stamp that knocks down
  catchHigh: { power: 1, special: true, counter: 'highCounter', keys: [
    { d: 0.05, e: 'outQuad', p: { torso: -8, head: -5, afU: 150, afL: 30, abU: 130, abL: 50 } },
    { d: 0.3, p: { torso: -8, head: -5, afU: 155, afL: 25, abU: 135, abL: 45 }, catch: true, catchH: ['high', 'shigh'] },
    { d: 0.25, e: 'inOutCubic', p: null },
  ] },
  highCounter: { power: 1.5, damage: 12, hit: 'fh', height: 'mid', knock: 380, stun: 0.6, keys: [
    { d: 0.05, e: 'outExpo', p: { torso: 35, afU: 90, afL: 150, abU: 30, abL: 120, lfU: 40, lfL: -35, lbU: -30, lbL: 0 } },
    { d: 0.1, p: { torso: 35, afU: 90, afL: 150, abU: 30, abL: 120, lfU: 40, lfL: -35, lbU: -30, lbL: 0 } },
    { d: 0.3, e: 'inOutCubic', p: null },
  ] },
  catchLow: { power: 1, special: true, counter: 'lowCounter', keys: [
    { d: 0.05, e: 'outQuad', p: { ...CROUCH, afU: 10, afL: 30, abU: -10, abL: 40 } },
    { d: 0.3, p: { ...CROUCH, afU: 5, afL: 30, abU: -15, abL: 40 }, catch: true, catchH: ['low'] },
    { d: 0.25, e: 'inOutCubic', p: null },
  ] },
  lowCounter: { power: 1.4, damage: 11, hit: 'ff', height: 'low', knock: 200, launch: 300, kd: true, keys: [
    { d: 0.05, e: 'outExpo', p: { torso: -15, lfU: 70, lfL: -10, lbU: -15, lbL: -20, afU: 40, afL: 100, abU: 50, abL: 90 } },
    { d: 0.1, p: { torso: -15, lfU: 70, lfL: -10, lbU: -15, lbL: -20, afU: 40, afL: 100, abU: 50, abL: 90 } },
    { d: 0.3, e: 'inOutCubic', p: null },
  ] },
  // specials (SPECIAL_SCHEMES): rolls tumble through or away (flag roll: invincible for rollInv), teleport reappears behind at its warp key
  rollFwd: { roll: true, keys: [
    { d: 0.05, e: 'outQuad', p: TUCK },
    { d: 0.3, p: TUCK, lunge: 560 },
    { d: 0.12, e: 'inOutCubic', p: null },
  ] },
  rollBack: { roll: true, keys: [
    { d: 0.05, e: 'outQuad', p: TUCK },
    { d: 0.3, p: TUCK, lunge: -480 },
    { d: 0.12, e: 'inOutCubic', p: null },
  ] },
  teleport: { special: true, keys: [
    { d: 0.12, e: 'outQuad', p: { ...CROUCH, afU: 20, afL: 120, abU: 10, abL: 130 } },
    { d: 0.05, e: 'outExpo', p: { torso: 5, head: -10, afU: 150, afL: 10, abU: 140, abL: 15 }, warp: true, inv: true },
    { d: 0.22, e: 'inOutCubic', p: null },
  ] },
  // 9S (turnBack setting): turn your back to the foe (key flag turn); ←, → or ↑ or a move without turns faces it again (↓ crouches still turned)
  turnBack: { special: true, keys: [
    { d: 0.16, e: 'inOutCubic', p: { torso: -8, afU: 70, afL: 110, abU: 60, abL: 110, lfU: 25, lfL: -30, lbU: -20, lbL: -20 }, turn: true },
    { d: 0.12, e: 'inOutCubic', p: null },
  ] },
  // ↓ S in the air (pounce setting): a dive onto a fighter lying on the floor (otg), driven down by its key's drop
  pounce: { power: 1.3, damage: 9, hit: ['fh', 'bh'], height: 'low', knock: 60, launch: 160, kd: true, otg: true, air: true, special: true, keys: [
    { d: 0.08, e: 'outQuad', p: { torso: -20, afU: 160, afL: 30, abU: 150, abL: 40, lfU: 60, lfL: -100, lbU: 40, lbL: -110 } },
    { d: 0.35, e: 'outExpo', p: { torso: 70, head: -25, afU: 60, afL: 5, abU: 55, abL: 10, lfU: 100, lfL: -140, lbU: 20, lbL: -110 }, active: true, drop: 900, lunge: 260 },
    { d: 0.15, e: 'inOutCubic', p: null },
  ] },
  // ↑ S+G (taunt setting): beckons the foe, open the whole time; win (winPose setting): the survivors' fist in the air after a K.O.
  taunt: { keys: [
    { d: 0.15, e: 'outQuad', p: { torso: -12, head: -15, afU: 70, afL: 100, abU: -20, abL: 30 } },
    { d: 0.12, e: 'inOutCubic', p: { torso: -12, head: -15, afU: 75, afL: 40, abU: -20, abL: 30 } },
    { d: 0.12, e: 'inOutCubic', p: { torso: -12, head: -15, afU: 70, afL: 100, abU: -20, abL: 30 } },
    { d: 0.12, e: 'inOutCubic', p: { torso: -12, head: -15, afU: 75, afL: 40, abU: -20, abL: 30 } },
    { d: 0.25, e: 'inOutCubic', p: null },
  ] },
  win: { keys: [
    { d: 0.2, e: 'outQuad', p: { ...CROUCH, afU: 20, afL: 140, abU: 10, abL: 140 } },
    { d: 0.15, e: 'outBack', p: { torso: -8, head: -20, afU: 170, afL: 15, abU: 30, abL: 110 } },
    { d: 1.2, p: { torso: -8, head: -20, afU: 172, afL: 10, abU: 30, abL: 110 } },
    { d: 0.4, e: 'inOutCubic', p: null },
  ] },
};
STICK_MOVES.hammer.keys[0].armor = true;
STICK_MOVES.guardCancel.keys.slice(0, 2).forEach(k => { k.inv = true; });
STICK_MOVES.charge.keys.forEach(k => { if (k.active) k.unblock = true; });
// spinning moves turn the body round once in their wind-up (key flag turn: 2): the back shows, the blow lands facing
for (const n of ['spin', 'turnKick', 'spinElbow', 'armada', 'spinKick']) STICK_MOVES[n].keys[0].turn = 2;
// the fighting style of each move (the style move group); the rest are plain basics
const MOVE_STYLES = {
  boxing: ['jab', 'cross', 'uppercut', 'hook', 'bodyHook', 'overhand', 'bodyBlow', 'crouchJab', 'dashPunch'],
  karate: ['kick', 'reversePunch', 'sideKick', 'knifeHand', 'backfist', 'crescent', 'roundhouse'],
  'muay thai': ['elbow', 'plum', 'knee', 'spinElbow', 'thaiKick', 'pushKick', 'flyingKnee', 'lowKick'],
  capoeira: ['armada', 'martelo', 'rasteira', 'sweep', 'backSweep', 'fadeKick'],
  'kung fu': ['chainPunch', 'tigerClaw', 'palms', 'charge', 'spin', 'risingKick', 'catch', 'reversal', 'catchHigh', 'highCounter', 'catchLow', 'lowCounter'],
  taekwondo: ['turnKick', 'spinKick', 'axeKick', 'airFlipKick', 'diveKick', 'airSpin', 'launcher'],
  wrestling: ['grab', 'toss', 'backGrab', 'backToss', 'clinch', 'suplex', 'lariat', 'headbutt', 'hammer', 'stomp'],
};
for (const [style, names] of Object.entries(MOVE_STYLES)) for (const n of names) STICK_MOVES[n].style = style;
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
// which move each input slot triggers (a character's binds override these). 2D and 2.5D have separate tables:
// in 2D ↑ jumps (↑ with J / K in the jump squat is an up attack instead) and the air has its own ↑ / ↓ moves;
// in 2.5D (VF-style) Space jumps and every direction × button is a ground move.
// Directions in numpad terms (6 = towards the opponent): a diagonal without a move falls back to its vertical, then to neutral
// the inputs that switch stance (→ = toward the opponent); stances sharing a key are cycled, pressing it again goes back to main
const STANCE_KEYS = { 'S+G': 'S+G', '↓S+G': '↓ S+G', '→S+G': '→ S+G', '←S+G': '← S+G' };
// stance keys were K+G before K+G became the second throw
const stanceKey = k => (k || 'S+G').replace('K+G', 'S+G');
// a stance's keyframed idle / walk loop: the moves idle / walk for the main stance, craneIdle / craneWalk for a stance named crane
const loopName = (ch, i, kind) => i ? ch.stances[i].name + kind[0].toUpperCase() + kind.slice(1) : kind;
// movement layers: a move named <state>Layer (per stance, like the loops) is keyframed on top of the procedural / IK pose while the
// fighter is in that state: [tip, how much of it shows (0..1) for a fighter f]
const LAYERS = {
  crouch: ['Crouching', f => +(!f.kd && f.grounded && (f.crouching || f.squatT > 0))],
  rise: ['Rising in a jump', f => +(!f.kd && !f.grounded && !f.flip && f.vy <= 0)],
  fall: ['Falling from a jump', f => +(!f.kd && !f.grounded && !f.flip && f.vy > 0)],
  flip: ['A ninja flip', f => +(!f.kd && !f.grounded && !!f.flip)],
  run: ['Running', f => +(!f.kd && f.grounded && f.running && f.dashT <= 0)],
  dash: ['A forward dash', f => +(f.dashT > 0 && f.vx * f.dir > 0)],
  backDash: ['A back dash', f => +(f.dashT > 0 && f.vx * f.dir < 0)],
  backWalk: ['Walking backward, by how fast', f => !f.kd && f.grounded && f.dashT <= 0 && !f.crouching && f.vx * f.dir < 0 ? Math.min(1, -f.vx * f.dir / f.c('maxSpeed')) : 0],
  airDash: ['An air dash', f => +(f.airDashT > 0)],
  guard: ['Guarding (and in blockstun)', f => +f.guarding],
  hurt: ['Hit: the hit reaction, until free', f => +(f.hurtT > 0 && !f.kd && !f.guarding && f.dizzyT <= 0)],
  tumble: ['Knocked into the air: the tumble', f => +(!!f.kd && f.kd !== 'down')],
  lying: ['Lying on the floor', f => +(f.kd === 'down')],
  dizzy: ['Dizzy', f => +(f.dizzyT > 0)],
  turn: ['Turning around, by how far through the turn', f => 1 - Math.abs(f.face)],
};
const BINDS = { punch: 'jab', kick: 'kick', fwdPunch: 'elbow', fwdKick: 'pushKick', backPunch: 'palms', backKick: 'fadeKick',
  upPunch: 'hammer', upKick: 'turnKick',
  downPunch: 'launcher', downKick: 'sweep', downFwdPunch: 'bodyBlow', downFwdKick: 'lowKick', downBackPunch: 'crouchJab', downBackKick: 'backSweep',
  dashPunch: 'dashPunch', airPunch: 'airPunch', airKick: 'airKick', airUpPunch: 'airUpper', airUpKick: 'airFlipKick', airDownPunch: 'airHammer', airDownKick: 'diveKick', throw: 'grab', throw2: 'clinch', backThrow: 'backGrab',
  qcfPunch: 'rush', dpPunch: 'rising', qcbKick: 'spin', qcfKick: 'stomp', qcbPunch: 'charge', dpKick: 'risingKick',
  special: 'spin', fwdSpecial: 'rush', backSpecial: 'catch', upSpecial: 'rising', downSpecial: 'stomp', airSpecial: 'airSpin' };
const BINDS_25 = { punch: 'jab', kick: 'kick', fwdPunch: 'elbow', fwdKick: 'pushKick', backPunch: 'palms', backKick: 'fadeKick',
  upPunch: 'hammer', upKick: 'turnKick', upFwdPunch: 'headbutt', upFwdKick: 'flyingKnee', upBackPunch: 'backfist', upBackKick: 'crescent',
  downPunch: 'launcher', downKick: 'sweep', downFwdPunch: 'bodyBlow', downFwdKick: 'lowKick', downBackPunch: 'crouchJab', downBackKick: 'backSweep',
  dashPunch: 'dashPunch', airPunch: 'airPunch', airKick: 'airKick', airUpPunch: 'airUpper', airUpKick: 'airFlipKick', airDownPunch: 'airHammer', airDownKick: 'diveKick', throw: 'grab', throw2: 'clinch', backThrow: 'backGrab',
  qcfPunch: 'rush', dpPunch: 'rising', qcbKick: 'spin', qcfKick: 'stomp', qcbPunch: 'charge', dpKick: 'risingKick',
  special: 'spin', fwdSpecial: 'rush', backSpecial: 'catch', upSpecial: 'rising', downSpecial: 'stomp', airSpecial: 'airSpin' };
// the table of a plane and where a character keeps its own binds for it
const slotsOf = plane => plane === '2d' ? BINDS : BINDS_25;
const bindsKey = plane => plane === '2d' ? 'binds' : 'binds25';
// specials by name, each with its on/off setting, and the input that plays it in each specialScheme:
// a motion name (MOTIONS) + S, 7S / 1S = S with a diagonal held (numpad), G4 / G6 = ← / → pressed while guarding,
// b… = pressed in blockstun (bP, bK, b6S = → S, b4S = ← S); taunt is on ↑ S+G and pounce on ↓ S in the air in both
const SPECIALS = { rollFwd: 'rolls', rollBack: 'rolls', teleport: 'teleport', guardCancel: 'guardCancel', pushBlock: 'pushBlock', catchHigh: 'counters', catchLow: 'counters', taunt: 'taunt', pounce: 'pounce', turnBack: 'turnBack' };
const SPECIAL_SCHEMES = {
  guard: { rollFwd: 'G6', rollBack: 'G4', teleport: 'dd', guardCancel: 'bP', pushBlock: 'bK', catchHigh: '7S', catchLow: '1S', turnBack: '9S' },
  motion: { rollFwd: 'qcf', rollBack: 'qcb', teleport: 'dp', guardCancel: 'b6S', pushBlock: 'b4S', catchHigh: 'dd', catchLow: '1S', turnBack: '9S' },
};
// special motions in numpad notation (6 = towards the opponent), matched in order against the recent directions
const MOTIONS = { dp: /6.*2.*3/, qcf: /2.*3.*6/, qcb: /2.*1.*4/, dd: /252/ };
// a character's own motions (def.motions: name → numpad digits, e.g. m41236: '41236'), tried before the built-in ones, longest first;
// each makes two input slots, name + Punch / Kick
const customMotions = def => Object.fromEntries(Object.entries(def.motions || {}).sort((a, b) => b[1].length - a[1].length).map(([k, d]) => [k, new RegExp(d.split('').join('.*'))]));
// whole-character stats: each multiplies some fight settings for this character only (1 = as the settings say); g = its group
const CHAR_STATS = [
  { k: 'speed', g: 'ground', cfg: ['maxSpeed'], min: 0.5, max: 1.6, step: 0.05, tip: 'Walk speed, × maxSpeed (runs too). Heavy bodies feel right a little slower.' },
  { k: 'dash', g: 'ground', cfg: ['dashSpeed'], min: 0.5, max: 1.8, step: 0.05, tip: 'Dash speed, × dashSpeed.' },
  { k: 'traction', g: 'ground', cfg: ['decel'], min: 0.3, max: 2, step: 0.05, tip: 'Grip on the floor, × decel: low = slides on when it stops, is hit or lunges; high = stops dead.' },
  { k: 'turnaround', g: 'ground', cfg: ['turnSpeed'], min: 0.3, max: 3, step: 0.05, tip: 'How fast it turns to face the other way, × turnSpeed. Slow turners are open to cross-ups.' },
  { k: 'weight', g: 'ground', cfg: [], min: 0.5, max: 2, step: 0.05, tip: 'Heavier bodies are pushed and launched less: knockback, block push and launch ÷ weight.' },
  { k: 'jump', g: 'air', cfg: ['jumpVel'], f: (v, s) => v * Math.sqrt(s.jump * s.gravity), min: 0.5, max: 2, step: 0.05, tip: 'Jump height, × the height jumpVel and gravity give (whatever its gravity).' },
  { k: 'jumps', g: 'air', cfg: [], min: 1, max: 5, step: 1, tip: 'Max jumps: 2 = a double jump (jump again in the air), and so on.' },
  { k: 'gravity', g: 'air', cfg: ['gravity'], min: 0.4, max: 2, step: 0.05, tip: 'Its gravity, × gravity: high = snappy short jumps (jump height stays), low = floaty.' },
  { k: 'airSpeed', g: 'air', cfg: ['airSpeed'], min: 0.3, max: 2, step: 0.05, tip: 'Top drift speed in the air, × airSpeed.' },
  { k: 'airAccel', g: 'air', cfg: ['airAccel'], min: 0, max: 3, step: 0.05, tip: 'Air control, × airAccel: how fast the drift turns around.' },
  { k: 'fallSpeed', g: 'air', cfg: ['fallSpeed'], min: 0.5, max: 2, step: 0.05, tip: 'Top falling speed and fast-fall speed, × fallSpeed.' },
  { k: 'airDodge', g: 'air', cfg: ['airDodge'], min: 0, max: 2, step: 0.05, tip: 'Air dodge length, × airDodge (0 = cannot air dodge).' },
  { k: 'airDash', g: 'air', cfg: ['airDash'], min: 0, max: 2, step: 0.05, tip: 'Air dash speed, × airDash (0 = cannot air dash).' },
  { k: 'health', g: 'fight', cfg: ['health'], min: 0.5, max: 2, step: 0.05, tip: 'Health, × the health setting.' },
  { k: 'tough', g: 'fight', cfg: ['staggerAt', 'dizzyAt'], min: 0.5, max: 2, step: 0.05, tip: 'Toughness: blows needed to stagger it and damage to make it dizzy, × staggerAt and dizzyAt.' },
  { k: 'tempo', g: 'fight', cfg: ['attackSpeed'], min: 0.6, max: 1.5, step: 0.05, tip: 'How fast its moves play, × attackSpeed.' },
  { k: 'springs', g: 'fight', cfg: ['freq'], min: 0.4, max: 2, step: 0.05, tip: 'Limb spring frequency, × freq: above 1 snappy, below 1 floppy.' },
  { k: 'grabRange', g: 'fight', cfg: ['grabReach'], min: 0, max: 3, step: 0.05, tip: 'Throw reach, × grabReach.' },
];
const STAT_GROUPS = { ground: 'Ground: walking, dashing, turning, weight', air: 'Air: jumps, gravity, drift, falling, air dodge and air dash', fight: 'Fight: health, toughness, tempo, limb springs, grab range' };
// walk and idle, per character: the procedural cycle's knobs (moves named idle / walk, if any, replace it with keyframed loops)
const GAIT_VARS = [
  { k: 'stride', v: 1, min: 0, max: 2, step: 0.05, tip: 'How far the legs swing walking.' },
  { k: 'lift', v: 1, min: 0, max: 2.5, step: 0.05, tip: 'How high the knees come up on each step.' },
  { k: 'armSwing', v: 1, min: 0, max: 2.5, step: 0.05, tip: 'How much the arms counter-swing the legs.' },
  { k: 'lean', v: 1, min: -2, max: 3, step: 0.1, tip: 'Torso lean into the walking direction.' },
  { k: 'idle', v: 'auto', opts: ['auto', 'shift', 'bounce', 'sway', 'still'], tip: 'Idle style: weight shift, boxer bounce, sway or still; auto picks one per fighter.' },
  { k: 'idleAmt', v: 1, min: 0, max: 3, step: 0.05, tip: 'Strength of the idle motion.' },
  { k: 'breath', v: 1, min: 0, max: 3, step: 0.1, tip: 'Breathing: the chest and arms rise and fall.' },
];
const STAT_OF = Object.fromEntries(CHAR_STATS.flatMap(s => s.cfg.map(k => [k, s])));
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
  const chains = { spine: [], head: [], arm: [], leg: [], tail: [], weapon: [] };
  for (const b of order) if (!b.parent || by[b.parent].role !== b.role) {
    const c = [b];
    for (let k; (k = c[c.length - 1].kids.find(k => k.role === b.role));) c.push(k);
    chains[b.role].push(c);
  }
  const rest = Object.fromEntries(order.map(b => [b.id, b.a]));
  const ch = { name: def.name, bones: order, by, ids: order.map(b => b.id), chains,
    tips: [...chains.arm, ...chains.leg, ...chains.head, ...chains.tail, ...chains.weapon].map(c => c[c.length - 1]),
    poses: { ...def.poses, stance: { ...rest, ...def.poses.stance } }, moves: def.moves, hurt: def.hurt, motions: customMotions(def), binds: { ...BINDS, ...def.binds }, binds25: { ...BINDS_25, ...def.binds25 },
    stats: Object.fromEntries(CHAR_STATS.map(s => [s.k, def[s.k] ?? 1])), gait: { ...Object.fromEntries(GAIT_VARS.map(s => [s.k, s.v])), ...def.gait } };
  // stances: the main one plus any extra; each has its pose, its own binds over the main ones and the key that switches to it
  ch.stances = [{ name: 'main', pose: ch.poses.stance, binds: ch.binds, binds25: ch.binds25 },
    ...(def.stances || []).map(s => ({ name: s.name, key: stanceKey(s.key), pose: { ...ch.poses.stance, ...s.pose }, binds: { ...ch.binds, ...s.binds }, binds25: { ...ch.binds25, ...s.binds25 } }))];
  // armed (see armed): the weapon class's binds go over every stance's, where the move exists
  ch.def = def;
  if (def.weapon) {
    const cls = WEAPONS[def.weapon].cls, wb = Object.fromEntries(Object.entries({ ...WEAPON_CLASSES[cls].binds, ...def.wbinds?.[cls] }).filter(([, n]) => def.moves[n]));
    ch.weapon = def.weapon;
    for (const s of ch.stances) { s.binds = { ...s.binds, ...wb }; s.binds25 = { ...s.binds25, ...wb }; }
  }
  // the cancel window opens at a key marked cancel, else after the last active key
  for (const m of Object.values(ch.moves)) { const c = m.keys.findIndex(k => k.cancel); m.cancel = c >= 0 ? c : m.keys.findLastIndex(k => k.active) + 1; SHARED.add(m); }
  // the body's extent behind and in front of x (torso and legs in the stance): fighters are pushed apart where these meet
  const L = fk(ch, ch.poses.stance, 1), xs = ch.bones.filter(b => b.role === 'spine' || b.role === 'leg').map(b => L[b.id][0]);
  ch.extent = [Math.max(19, 2 - Math.min(0, ...xs)), Math.max(19, 2 + Math.max(0, ...xs))];
  SHARED.add(ch);
  return ch;
}
// hit: one striking bone or a list of them (both fists, a kick and the tail…); each is its own hitbox
const hitIds = m => m?.hit ? [].concat(m.hit) : [];
const mapHit = (h, f) => Array.isArray(h) ? h.map(f) : f(h);
const oldMove = m => ({ ...m, hit: mapHit(m.hit, h => HITS[h] || h), keys: m.keys.map(k => ({ ...k, p: fromOld(k.p) })) });
const mapVals = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
// built-in definitions (plain JSON: what the creator edits, saves and reverts to); CHARS = compiled
const CHAR_DEFS = {
  stick: { name: 'stick', bones: STICK_BONES,
    poses: mapVals({ stance: STANCE, crouch: CROUCH, air: AIR, airFall: AIR_FALL, fall: FALL, lie: LIE }, fromOld),
    moves: mapVals(STICK_MOVES, oldMove), hurt: mapVals(STICK_HURT, set => set.map(fromOld)) },
};
// ---------- weapons: an extra bone in the front hand; while held, its class's moves go over P, → P and ↓ P ----------
// look: how it is drawn · a: grip angle relative to the hand · back: length behind the hand (a staff is held along it)
// grip2: two-handed, the back hand holds it this far along it from the front hand (− behind)
// weight: heavier hits harder (power, damage and knockback × weaponPower) but its moves play slower (× weaponSpeed)
const WEAPONS = {
  dagger: { cls: 'pierce', look: 'blade', len: 20, weight: 0.3, a: 0, tip: 'Dagger: short and quick; stabs, and flies straight when thrown' },
  sword: { cls: 'slash', look: 'blade', len: 46, weight: 0.8, a: 10, tip: 'Sword: long blade, slashes and chops' },
  axe: { cls: 'slash', look: 'axe', len: 36, weight: 1.3, a: 40, tip: 'Axe: a heavy head on a handle; slower, harder chops' },
  bat: { cls: 'blunt', look: 'club', len: 40, weight: 0.9, a: 40, tip: 'Bat: blunt swings that knock back' },
  nunchucks: { cls: 'blunt', look: 'stick', chain: true, len: 34, weight: 0.6, a: -100, tip: 'Nunchucks: two sticks on a chain, the outer one flails behind the swing' },
  hammer: { cls: '2h', look: 'hammer', len: 52, weight: 2, a: 40, grip2: 9, tip: 'War hammer: two-handed, very slow, crushing' },
  staff: { cls: 'pole', look: 'pole', len: 62, back: 34, weight: 1, a: -50, grip2: -24, tip: 'Staff: held along its length; the longest reach' },
};
const weaponPower = w => 0.8 + 0.4 * w.weight, weaponSpeed = w => 1.15 - 0.2 * w.weight;
// a weapon move built on a stick move's key pose (move, key index), with the weapon's grip angle (undefined: the rest grip)
const wPose = (n, i, w, more) => ({ ...CHAR_DEFS.stick.moves[n].keys[i].p, ...more, ...(w === undefined ? {} : { weapon: w }) });
const wAtk = (cls, o, wind, strike, hd, rd) => attack({ ...o, hit: 'weapon', weapon: cls }, wind, strike, hd, rd);
const WEAPON_MOVES = {
  stab: wAtk('pierce', { power: 0.9, damage: 7, height: 'high', knock: 100, stun: 0.3 }, [0.05, wPose('jab', 0)], [0.04, wPose('jab', 1)], 0.05, 0.14),
  lungeStab: wAtk('pierce', { power: 1.2, damage: 10, height: 'mid', knock: 160, stun: 0.4, lunge: 300 }, [0.08, wPose('dashPunch', 0)], [0.05, wPose('dashPunch', 1)], 0.07, 0.2),
  riseStab: wAtk('pierce', { power: 1.3, damage: 9, height: 'high', knock: 80, launch: 480, kd: true }, [0.08, wPose('launcher', 0)], [0.05, wPose('launcher', 1)], 0.06, 0.24),
  slash: wAtk('slash', { power: 1.1, damage: 10, height: 'high', knock: 150, stun: 0.38 }, [0.08, wPose('jab', 0, 110)], [0.05, wPose('jab', 1, 0)], 0.06, 0.2),
  chop: wAtk('slash', { power: 1.4, damage: 13, height: 'mid', knock: 120, stun: 0.45 }, [0.1, wPose('hammer', 0, 30)], [0.06, wPose('hammer', 1, 10)], 0.07, 0.26),
  lowSlash: wAtk('slash', { power: 1, damage: 8, height: 'low', knock: 110, stun: 0.35, lunge: 80 }, [0.08, wPose('launcher', 0, 120)], [0.06, wPose('launcher', 0, 20)], 0.06, 0.22),
  swing: wAtk('blunt', { power: 1.2, damage: 9, height: 'high', knock: 200, stun: 0.4 }, [0.09, wPose('jab', 0, 100)], [0.06, wPose('jab', 1, -10)], 0.06, 0.22),
  smash: wAtk('blunt', { power: 1.5, damage: 12, height: 'mid', knock: 150, stun: 0.5, crumple: true }, [0.11, wPose('hammer', 0, 30)], [0.06, wPose('hammer', 1, 0)], 0.07, 0.28),
  lowSwing: wAtk('blunt', { power: 1.1, damage: 8, height: 'low', knock: 150, kd: true, launch: 150 }, [0.09, wPose('launcher', 0, 120)], [0.06, wPose('launcher', 0, 20)], 0.06, 0.24),
  heavySwing: wAtk('2h', { power: 1.8, damage: 15, height: 'high', knock: 280, stun: 0.5 }, [0.16, wPose('jab', 0, 110)], [0.08, wPose('jab', 1, 0)], 0.08, 0.32),
  slam: wAtk('2h', { power: 2, damage: 18, height: 'mid', knock: 100, launch: 200, kd: true, bounce: true }, [0.18, wPose('hammer', 0, 30)], [0.08, wPose('hammer', 1, 0)], 0.1, 0.36),
  groundSwing: wAtk('2h', { power: 1.6, damage: 12, height: 'low', knock: 250, kd: true, launch: 150 }, [0.15, wPose('launcher', 0, 120)], [0.08, wPose('launcher', 0, 20)], 0.08, 0.3),
  // the staff in both hands (grip2): poke thrusts it level, whirl turns it a full circle (down behind, up and over into the strike), trip sweeps it low
  poke: wAtk('pole', { power: 1, damage: 7, height: 'mid', knock: 180, stun: 0.35, lunge: 120 }, [0.07, wPose('jab', 0, -52)], [0.05, wPose('jab', 1, 9)], 0.06, 0.18),
  whirl: wAtk('pole', { power: 1.3, damage: 10, height: 'high', knock: 200, stun: 0.4, wide: true }, [0.12, wPose('hammer', 0, -404)], [0.07, wPose('uppercut', 1, -394)], 0.07, 0.26),
  trip: wAtk('pole', { power: 1, damage: 7, height: 'low', knock: 60, launch: 150, kd: true }, [0.09, wPose('launcher', 0, 80)], [0.06, wPose('launcher', 0, -2)], 0.06, 0.24),
  // not attacks (P+G): crouch and reach, the hand closes on the handle at the grip key; wind up over the shoulder, the weapon leaves at the release key
  pickUp: { weapon: 'slash', keys: [
    { d: 0.16, e: 'outQuad', grip: true, p: { waist: 110, chest: 0, neck: 20, uarmF: -75, farmF: -5, handF: 0, weapon: 80, thighF: 85, shinF: -135, thighB: -25, shinB: -95 } },
    { d: 0.18, e: 'inOutCubic', p: null }] },
  weaponThrow: { weapon: 'slash', keys: [
    { d: 0.14, e: 'outQuad', p: wPose('overhand', 0, 140) },
    { d: 0.07, e: 'linear', release: true, p: wPose('overhand', 1, 20) },
    { d: 0.2, e: 'inOutCubic', p: null }] },
};
WEAPON_MOVES.whirl.keys[3].p = { weapon: -410 }; // recovers on round: a turn past the rest grip, not back the way it came
// classes: their moves on P, → P and ↓ P while a weapon of the class is held (a character's wbinds override them), and the weapon the editor shows
const WEAPON_CLASSES = {
  pierce: { weapon: 'dagger', binds: { punch: 'stab', fwdPunch: 'lungeStab', downPunch: 'riseStab' }, tip: 'One-handed pierce: quick stabs' },
  slash: { weapon: 'sword', binds: { punch: 'slash', fwdPunch: 'chop', downPunch: 'lowSlash' }, tip: 'One-handed slash: swings and chops' },
  blunt: { weapon: 'bat', binds: { punch: 'swing', fwdPunch: 'smash', downPunch: 'lowSwing' }, tip: 'One-handed blunt: knockback swings' },
  '2h': { weapon: 'hammer', binds: { punch: 'heavySwing', fwdPunch: 'slam', downPunch: 'groundSwing' }, tip: 'Two-handed: slow, crushing blows' },
  pole: { weapon: 'staff', binds: { punch: 'poke', fwdPunch: 'whirl', downPunch: 'trip' }, tip: 'Pole: long pokes, sweeps and trips' },
};
CHAR_DEFS.stick.moves = { ...CHAR_DEFS.stick.moves, ...WEAPON_MOVES };
// the weapon's bones on the front hand; nunchucks: the handle and the flailing stick (weaponTip) on a loose joint
function weaponBones(ch, type) {
  const w = WEAPONS[type], arm = ch.chains.arm.find(c => c[0].side === 'f') || ch.chains.arm[0], parent = arm ? arm[arm.length - 1].id : ch.bones[0].id;
  const b = { role: 'weapon', side: 'f', look: w.look, thick: 3, hurt: 0, lag: 0.3, react: 0.3, sway: 0 };
  if (w.chain) return [{ ...b, id: 'weapon', parent, len: Math.round(w.len / 2), a: w.a }, { ...b, id: 'weaponTip', parent: 'weapon', len: Math.round(w.len / 2), a: 0, lag: 3, stiff: 0.6, damp: 0.5, react: 2 }];
  return [{ ...b, id: 'weapon', parent, len: w.len, a: w.a, back: w.back || 0 }];
}
// the character holding a weapon (compiled once per character and weapon; the weapon moves are there even when the def lacks them)
function armed(ch, type) {
  const base = ch.base || ch;
  if (!WEAPONS[type]) return base;
  base.armed ??= {};
  return base.armed[type] ??= Object.assign(makeCharacter({ ...base.def, weapon: type, moves: { ...WEAPON_MOVES, ...base.def.moves }, bones: [...base.def.bones, ...weaponBones(base, type)] }), { base });
}
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
      const e = EASE[easing === 'authored' ? k.e || 'linear' : easing](t / k.d), p = {};
      for (const j of ch.ids) p[j] = from[j] + (to[j] - from[j]) * e;
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
// a weapon bone from o (the hand) to e (the tip), in wood and metal unless col gives it one colour
const METAL = '#7f8a93', WOOD = '#9b7653';
function drawWeapon(ctx, b, o, e, col, extra = 0) {
  const l = Math.hypot(e[0] - o[0], e[1] - o[1]) || 1, ux = (e[0] - o[0]) / l, uy = (e[1] - o[1]) / l, at = (d, s = 0) => [o[0] + ux * d - uy * s, o[1] + uy * d + ux * s];
  const line = (d0, d1, w, c, s = 0) => { const p = at(d0, s), q = at(d1, s); ctx.strokeStyle = col || c; ctx.lineWidth = w + extra; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
  const poly = (pts, c) => { ctx.fillStyle = col || c; ctx.strokeStyle = col || c; ctx.lineWidth = 1 + extra; ctx.beginPath(); pts.forEach(([d, s], i) => ctx[i ? 'lineTo' : 'moveTo'](...at(d, s))); ctx.closePath(); ctx.fill(); ctx.stroke(); };
  if (b.look === 'blade') { line(-3, 4, 3, WOOD); poly([[3, -5], [3, 5], [4.5, 5], [4.5, -5]], METAL); poly([[5, -2], [5, 2], [l - 4, 1.5], [l, 0], [l - 4, -1.5]], METAL); } // grip, guard, blade
  else if (b.look === 'club') poly([[-3, -1.5], [-3, 1.5], [l, 3.5], [l, -3.5]], WOOD);
  else if (b.look === 'axe') { line(-3, l, 3, WOOD); poly([[l - 12, 0], [l - 15, 10], [l + 1, 12], [l - 2, 0]], METAL); }
  else if (b.look === 'hammer') { line(-3, l, 3.5, WOOD); poly([[l - 6, -7], [l - 6, 9], [l + 4, 9], [l + 4, -7]], METAL); }
  else line(-(b.back || 0) - 2, l, b.look === 'pole' ? 3 : 4, WOOD); // pole, nunchuck stick
}
function drawFigure(ctx, ch, P, col, back, extra = 0, tint = null) {
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const side of ['b', '', 'f']) for (const b of ch.bones) if (b.side === side) {
    const o = P[b.parent || 'hip'], e = P[b.id], c = tint ? tint(b) : side === 'b' ? back : col;
    if (b.shape === 'circle') { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(e[0], e[1], b.len + extra / 2, 0, 7); ctx.fill(); continue; }
    if (b.role === 'weapon') { drawWeapon(ctx, b, o, e, extra || tint?.(b) ? c : null, extra); continue; }
    ctx.strokeStyle = c; ctx.lineWidth = b.thick + extra;
    ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
  }
}
