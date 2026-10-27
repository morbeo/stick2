'use strict';
// ---------- the default stick fighter: the base every built-in character starts from ----------
// loads with the rig (after rig-chars.js, before rig-weapons.js, which adds the weapon moves to it); see docs/characters.md
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

const STANCE = { torso: 8, head: 0, afU: 35, afL: 115, abU: 15, abL: 125, lfU: 25, lfL: -25, lbU: -18, lbL: 0 };
const CROUCH = { torso: 22, lfU: 60, lfL: -110, lbU: -10, lbL: -70 };
const TUCK = { torso: 70, head: 30, lfU: 120, lfL: -150, lbU: 110, lbL: -150, afU: 40, afL: 130, abU: 30, abL: 140 }; // curled up in a ball (rolls)
const AIR = { torso: 4, lfU: 55, lfL: -95, lbU: -10, lbL: -45, afU: 55, afL: 95, abU: 40, abL: 100 };
const AIR_FALL = { torso: 6, lfU: 28, lfL: -35, lbU: -18, lbL: -20, afU: 75, afL: 60, abU: 65, abL: 70 };
const FALL = { torso: -55, head: -20, afU: 140, afL: 30, abU: 110, abL: 50, lfU: 60, lfL: -50, lbU: 30, lbL: -30 };
const LIE = { torso: -90, head: 0, afU: 6, afL: 8, abU: -2, abL: 6, lfU: 93, lfL: -14, lbU: 96, lbL: -6 }; // on the back, arms by the sides

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
  // the S specials (S, → S, ↑ S, ↓ S; the motions above keep rush, rising, spin and stomp): a one-palm ki shot; a shoulder charge
  // that shrugs off a hit as it winds up and bounces the foe off a wall; a leaping flying side kick; a punch into the floor at a foe lying there
  palmShot: { power: 1, damage: 7, hit: 'fh', height: 'mid', knock: 200, stun: 0.4, special: true, shot: { speed: 420, size: 10, life: 1.6, look: 'ki' }, keys: [
    { d: 0.1, e: 'outQuad', p: { torso: -12, afU: -30, afL: 130, abU: 60, abL: 100, lfU: 30, lfL: -35, lbU: -25, lbL: -10 } },
    { d: 0.05, e: 'outExpo', shoot: true, p: { torso: 20, afU: 95, afL: 0, abU: -30, abL: 110, lfU: 45, lfL: -40, lbU: -30, lbL: 0 } },
    { d: 0.12, p: { torso: 20, afU: 95, afL: 0, abU: -30, abL: 110, lfU: 45, lfL: -40, lbU: -30, lbL: 0 } },
    { d: 0.2, e: 'inOutCubic', p: null }] },
  shoulderCharge: { power: 1.6, damage: 12, hit: 'chest', height: 'mid', knock: 400, launch: 150, kd: true, wallbounce: true, special: true, keys: [
    { d: 0.16, e: 'outQuad', p: { torso: 35, head: 15, afU: 20, afL: 120, abU: -20, abL: 110, lfU: 45, lfL: -70, lbU: -20, lbL: -30 }, armor: true },
    { d: 0.08, e: 'outExpo', p: { torso: 45, head: 20, afU: -10, afL: 110, abU: -40, abL: 100, lfU: 55, lfL: -40, lbU: -45, lbL: 0 }, active: true, lunge: 480 },
    { d: 0.1, p: { torso: 45, head: 20, afU: -10, afL: 110, abU: -40, abL: 100, lfU: 55, lfL: -40, lbU: -45, lbL: 0 }, active: true },
    { d: 0.3, e: 'inOutCubic', p: null }] },
  jumpKick: { power: 1.5, damage: 12, hit: 'ff', height: 'high', knock: 300, launch: 250, kd: true, special: true, keys: [
    { d: 0.08, e: 'outQuad', p: { ...CROUCH, afU: 50, afL: 110, abU: 30, abL: 120 } },
    { d: 0.07, e: 'outExpo', p: { torso: -25, lfU: 100, lfL: -5, lbU: -20, lbL: -110, afU: 40, afL: 100, abU: 120, abL: 60 }, active: true, rise: 520, lunge: 240 },
    { d: 0.16, p: { torso: -25, lfU: 100, lfL: -5, lbU: -20, lbL: -110, afU: 40, afL: 100, abU: 120, abL: 60 }, active: true },
    { d: 0.3, e: 'inOutCubic', p: null }] },
  groundPunch: attack({ power: 1.2, damage: 9, hit: 'fh', height: 'low', knock: 60, launch: 300, kd: true, otg: true, special: true },
    [0.12, { torso: 20, head: -10, afU: 170, afL: 30, abU: 20, abL: 120, lfU: 70, lfL: -90, lbU: -10, lbL: -100 }],
    [0.06, { torso: 60, head: 20, afU: 20, afL: 0, abU: -30, abL: 100, lfU: 80, lfL: -100, lbU: -5, lbL: -110 }], 0.1, 0.24),
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
  toss: { power: 1.5, damage: 14, hit: 'fh', height: 'mid', knock: 260, launch: 450, kd: true, next: { kick: 'airGrab' }, keys: [
    { d: 0.2, e: 'outQuad', p: { torso: -10, afU: 60, afL: 90, abU: 50, abL: 100, lfU: 20, lfL: -40, lbU: -30, lbL: -20 } },
    { d: 0.08, e: 'outExpo', p: { torso: 35, afU: 150, afL: 10, abU: 140, abL: 20, lfU: 45, lfL: -30, lbU: -35, lbL: 0 } },
    { d: 0.3, e: 'inOutCubic', p: null },
  ] },
  // ← P+G: the back throw; its throw turns round with the victim held (key flag turn), so the victim lands on the other side
  // (a clinch: the front arm hooks the neck, the back one the waist, stepping in on the back leg to swing round)
  backGrab: { power: 1, damage: 0, hit: 'fh', height: 'high', knock: 0, throw: 'backToss', keys: [
    { d: 0.06, e: 'outQuad', p: { torso: 6, afU: 105, afL: 70, abU: 35, abL: 85, lbU: -20, lbL: -15 } },
    { d: 0.06, e: 'outExpo', p: { torso: 18, afU: 108, afL: 22, abU: 80, abL: 20, lfU: 22, lfL: -20, lbU: -38, lbL: -12 }, active: true, lunge: 120 },
    { d: 0.32, e: 'inOutCubic', p: null },
  ] },
  backToss: { power: 1.5, damage: 14, hit: 'fh', height: 'mid', knock: 300, launch: 380, kd: true, next: { kick: 'airGrab' }, keys: [
    { d: 0.18, e: 'inOutCubic', p: { torso: 5, afU: 90, afL: 60, abU: 80, abL: 70, lfU: 30, lfL: -40, lbU: -25, lbL: -20 }, turn: true },
    { d: 0.08, e: 'outExpo', p: { torso: 30, afU: 140, afL: 10, abU: 130, abL: 20, lfU: 45, lfL: -30, lbU: -35, lbL: 0 } },
    { d: 0.3, e: 'inOutCubic', p: null },
  ] },
  // P+G in the air: the air throw, catching another airborne fighter (move flag air). catchFly also catches a foe
  // still flying from an earlier launch - a throw chain (toss/backToss's own next chains kick into this once the
  // first throw's launch actually lands the victim in the air; chasing one down requires no changes of its own)
  airGrab: { power: 1, damage: 0, hit: 'fh', height: 'mid', knock: 0, throw: 'airToss', air: true, catchFly: true, keys: [
    { d: 0.06, e: 'outQuad', p: { torso: 10, afU: 80, afL: 30, abU: 60, abL: 40 } },
    { d: 0.08, e: 'outExpo', p: { torso: 15, afU: 95, afL: 10, abU: 80, abL: 15 }, active: true },
    { d: 0.3, e: 'inOutCubic', p: null },
  ] },
  airToss: { power: 1.4, damage: 12, hit: 'fh', height: 'mid', knock: 280, launch: 400, kd: true, air: true, keys: [
    { d: 0.16, e: 'outQuad', p: { torso: -10, afU: 60, afL: 90, abU: 50, abL: 100 } },
    { d: 0.08, e: 'outExpo', p: { torso: 30, afU: 140, afL: 15, abU: 130, abL: 20 } },
    { d: 0.26, e: 'inOutCubic', p: null },
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
  // with the move's own power, damage and height (move field shot: speed, size, life, look). Chargeable (key flag charge, move
  // field charge: dur, timeout, min, max): holding the button through the wind-up fires it bigger, faster and harder
  fireball: { power: 1.2, damage: 9, hit: ['fh', 'bh'], height: 'mid', knock: 220, stun: 0.42, special: true, shot: { speed: 360, size: 12, look: 'ki' }, charge: { dur: 0.5, timeout: 1.2, min: 1, max: 1.8 }, keys: [
    { d: 0.13, e: 'outQuad', charge: true, p: { torso: -10, afU: -40, afL: 120, abU: -50, abL: 120, lfU: 35, lfL: -40, lbU: -25, lbL: -10 } },
    { d: 0.06, e: 'outExpo', shoot: true, p: { torso: 18, afU: 90, afL: 5, abU: 80, abL: 10, lfU: 40, lfL: -35, lbU: -30, lbL: 0 } },
    { d: 0.16, p: { torso: 18, afU: 90, afL: 5, abU: 80, abL: 10, lfU: 40, lfL: -35, lbU: -30, lbL: 0 } },
    { d: 0.22, e: 'inOutCubic', p: null }] },
  // a beam (beam key): both palms pushed out and held there; the beam leaves as the push is reached, holds out for its duration
  // (move field beam: width, range, duration, look) and hits once with the move's own power, damage and height. Chargeable
  // (key flag charge, move field charge): holding the button through the wind-up fires a wider, longer-reaching, harder beam
  laserBeam: { power: 1.3, damage: 10, hit: ['fh', 'bh'], height: 'mid', knock: 80, stun: 0.3, special: true, beam: { width: 14, range: 500, duration: 0.25, look: 'laser' }, charge: { dur: 0.45, timeout: 1.1, min: 1, max: 1.7 }, keys: [
    { d: 0.12, e: 'outQuad', charge: true, p: { torso: -8, afU: -30, afL: 110, abU: -40, abL: 110, lfU: 30, lfL: -35, lbU: -20, lbL: -10 } },
    { d: 0.05, e: 'outExpo', beam: true, p: { torso: 15, afU: 95, afL: 10, abU: 85, abL: 15, lfU: 35, lfL: -30, lbU: -25, lbL: 0 } },
    { d: 0.2, p: { torso: 15, afU: 95, afL: 10, abU: 85, abL: 15, lfU: 35, lfL: -30, lbU: -25, lbL: 0 } },
    { d: 0.2, e: 'inOutCubic', p: null }] },
  // a lobbed shot (shoot key): the same push as fireball, but thrown up and out so gravity arcs it down, bouncing
  // once before it fizzles (move field shot: angle, gravity, bounce — an arc instead of flying dead level)
  grenade: { power: 1.1, damage: 8, hit: ['fh', 'bh'], height: 'mid', knock: 200, stun: 0.4, special: true,
    shot: { speed: 420, size: 11, life: 2.2, look: 'fire', angle: 50, gravity: 1300, bounce: 0.4 }, keys: [
    { d: 0.13, e: 'outQuad', p: { torso: -10, afU: -40, afL: 120, abU: -50, abL: 120, lfU: 35, lfL: -40, lbU: -25, lbL: -10 } },
    { d: 0.06, e: 'outExpo', shoot: true, p: { torso: 18, afU: 90, afL: 5, abU: 80, abL: 10, lfU: 40, lfL: -35, lbU: -30, lbL: 0 } },
    { d: 0.16, p: { torso: 18, afU: 90, afL: 5, abU: 80, abL: 10, lfU: 40, lfL: -35, lbU: -30, lbL: 0 } },
    { d: 0.22, e: 'inOutCubic', p: null }] },
  // several shots at once (shoot key): count fires that many, fanned across spread degrees; pierce lets each hit
  // more than one foe before it's spent, durability lets it survive more than one clash (move fields: count, spread,
  // pierce, durability)
  multiShot: { power: 0.8, damage: 5, hit: ['fh', 'bh'], height: 'mid', knock: 140, stun: 0.3, special: true,
    shot: { speed: 400, size: 9, life: 1.4, look: 'star', count: 3, spread: 36, pierce: 2, durability: 2 }, keys: [
    { d: 0.1, e: 'outQuad', p: { torso: -8, afU: -20, afL: 110, abU: -30, abL: 110, lfU: 30, lfL: -30, lbU: -20, lbL: -10 } },
    { d: 0.05, e: 'outExpo', shoot: true, p: { torso: 15, afU: 70, afL: 10, abU: 60, abL: 15, lfU: 35, lfL: -25, lbU: -25, lbL: 0 } },
    { d: 0.1, p: { torso: 15, afU: 70, afL: 10, abU: 60, abL: 15, lfU: 35, lfL: -25, lbU: -25, lbL: 0 } },
    { d: 0.2, e: 'inOutCubic', p: null }] },
  // the rest of the direction table (see BINDS): 4K steps back as it kicks, 1P a quick crouching poke, 3P a lunging body blow,
  // 1K a sweep with the back leg; ↑ diagonals: 7P backfist, 7K crescent (overhead), 9K flying knee
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
    { d: 0.05, e: 'outQuad', p: { torso: 35, head: 20, afU: 60, afL: 100, abU: 50, abL: 110, lfU: 70, lfL: -110, lbU: 10, lbL: -20 } }, // a crouching dip, hands reaching forward, before it tucks over
    { d: 0.3, p: TUCK, lunge: 560 },
    { d: 0.12, e: 'inOutCubic', p: null },
  ] },
  // (a backward somersault: sitting back, hands by the ears to push off the floor as it goes over)
  rollBack: { roll: true, keys: [
    { d: 0.05, e: 'outQuad', p: { torso: -20, head: 25, lfU: 100, lfL: -135, lbU: 90, lbL: -135, afU: 165, afL: 120, abU: 155, abL: 130 } },
    { d: 0.3, p: { ...TUCK, head: 35, afU: 170, afL: 140, abU: 160, abL: 145 }, lunge: -480 },
    { d: 0.12, e: 'inOutCubic', p: null },
  ] },
  // a scrambling wake-up roll (used getting up, instead of the standing dodge roll): low to the ground, hands and knees, not an acrobatic tuck
  tumbleFwd: { roll: true, keys: [
    { d: 0.05, e: 'outQuad', p: { torso: 60, head: 10, afU: 15, afL: 25, abU: 25, abL: 35, lfU: 45, lfL: -55, lbU: 15, lbL: -25 } },
    { d: 0.28, p: { torso: 65, head: 15, afU: 10, afL: 20, abU: 20, abL: 30, lfU: 55, lfL: -65, lbU: 20, lbL: -30 }, lunge: 560 },
    { d: 0.14, e: 'inOutCubic', p: null },
  ] },
  tumbleBack: { roll: true, keys: [
    { d: 0.05, e: 'outQuad', p: { torso: -35, head: 20, afU: 150, afL: 80, abU: 140, abL: 90, lfU: 70, lfL: -90, lbU: 50, lbL: -60 } },
    { d: 0.28, p: { torso: -30, head: 25, afU: 155, afL: 85, abU: 145, abL: 95, lfU: 75, lfL: -95, lbU: 55, lbL: -65 }, lunge: -480 },
    { d: 0.14, e: 'inOutCubic', p: null },
  ] },
  // a leapfrog over a close foe (grounded hop near one vaults it instead of jumping): invincible and spinning like a roll, but through the air
  vault: { vault: true, keys: [
    { d: 0.05, e: 'outQuad', p: { torso: 30, afU: 70, afL: 20, abU: 60, abL: 10, lfU: 60, lfL: -90, lbU: 20, lbL: -20 } },
    { d: 0.22, e: 'outQuad', p: { torso: -10, afU: -60, afL: 10, abU: -50, abL: 20, lfU: 110, lfL: -140, lbU: -60, lbL: -30 }, rise: 300, lunge: 170 },
    { d: 0.18, e: 'inOutCubic', p: null },
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
  // the powered stance's own transition move (morph: move): fists clench at the sides, then thrust up and out as the
  // aura builds, the screen shaking harder with each key; it plays once, then settles into the stance's own pose
  mainToPowered: { fx: { look: 'aura', on: 'body' }, keys: [
    { d: 0.3, e: 'outQuad', p: { torso: 15, afU: -60, afL: 90, abU: -50, abL: 90 }, shake: 0.08 },
    { d: 0.4, e: 'outQuad', p: { torso: 20, afU: -90, afL: 60, abU: -80, abL: 60 }, shake: 0.18 },
    { d: 0.5, e: 'outExpo', p: { torso: 8, head: -15, afU: -140, afL: 25, abU: -130, abL: 25 }, shake: 0.4 },
    { d: 0.3, e: 'inOutCubic', p: null },
  ] },
  // teleport strike: vanish, appear behind the opponent with a strike
  vanishingStrike: { power: 1.4, damage: 11, hit: 'bh', height: 'high', knock: 240, launch: 200, kd: true, special: true, keys: [
    { d: 0.08, e: 'outQuad', p: { torso: -5, afU: 50, afL: 130, abU: 40, abL: 130 }, warp: true },
    { d: 0.06, e: 'outExpo', p: { torso: 20, afU: 100, afL: 20, abU: 0, abL: 120, lfU: 45, lfL: -40, lbU: -35, lbL: 0 }, active: true, lunge: 180 },
    { d: 0.18, e: 'inOutCubic', p: null },
  ] },
  // not an attack - played once on the character picker card while it's hovered, then settles into the stance pose
  // (studio.js's startCardPreview, by name - not bound to any input, so it never plays in a fight)
  select: { keys: [
    { d: 0.1, e: 'outQuad', p: { torso: -10, head: -5, afU: 60, afL: 100, abU: 20, abL: 90, lfU: 10, lfL: -10 } },
    { d: 0.15, e: 'outExpo', p: { torso: 15, head: 5, afU: 130, afL: 20, abU: -10, abL: 100, lfU: 30, lfL: -20, lbU: -15 } },
    { d: 0.35, e: 'inOutCubic', p: null },
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
// built-in definitions (plain JSON: what the creator edits, saves and reverts to); CHARS = compiled
// movement layers (LAYERS, written in raw bone angles: a layer's ref is its own procedural-pose snapshot, which oldMove's
// fromOld doesn't know how to reproduce): the ground and air dashes (a single committed lunge, not a sped-up walk cycle)
// and the wall jump (a push off the wall, kicking away from it). Every built-in fighter inherits these through retimed(),
// which maps over the stick's own moveset
const MOVEMENT_LAYERS = {
  dashLayer: { ref: { waist: 166, chest: 1, neck: 2, head: 1, thighF: 25, shinF: -89, footF: 90, uarmF: -146, farmF: 109, handF: 0, thighB: -18, shinB: 0, footB: 90, uarmB: -165, farmB: 128, handB: 3 },
    keys: [
      { d: 0.08, e: 'outExpo', p: { waist: 148, chest: -12, thighF: 50, shinF: -60, thighB: -48, shinB: 22, uarmF: -175, farmF: 70, uarmB: -110, farmB: 150 } },
      { d: 0.12, e: 'inOutCubic', p: null }] },
  backDashLayer: { ref: { waist: 179, chest: 1, neck: 2, head: 1, thighF: 25, shinF: -70, footF: 90, uarmF: -146, farmF: 141, handF: 0, thighB: -18, shinB: 0, footB: 90, uarmB: -165, farmB: 160, handB: 3 },
    keys: [
      { d: 0.1, e: 'outExpo', p: { waist: 195, chest: 15, thighF: -10, shinF: -40, thighB: 10, shinB: -10, uarmF: -160, farmF: 100, uarmB: -150, farmB: 110 } },
      { d: 0.12, e: 'inOutCubic', p: null }] },
  airDashLayer: { ref: { waist: 176, chest: 0, neck: 0, head: 1, thighF: 55, shinF: -95, footF: 90, uarmF: -125, farmF: 95, handF: 0, thighB: -10, shinB: -45, footB: 90, uarmB: -140, farmB: 100, handB: 3 },
    keys: [
      { d: 0.08, e: 'outExpo', p: { waist: 160, chest: -15, thighF: 75, shinF: -110, thighB: -20, shinB: -60, uarmF: -160, farmF: 60, uarmB: -110, farmB: 70 } },
      { d: 0.14, e: 'inOutCubic', p: null }] },
  // kicking off the wall: both legs spring out straight behind (where the wall was), the lead arm reaches on ahead
  wallJumpLayer: { ref: { waist: 176, chest: 0, neck: 0, head: 1, thighF: 55, shinF: -95, footF: 90, uarmF: -125, farmF: 95, handF: 0, thighB: -10, shinB: -45, footB: 90, uarmB: -140, farmB: 100, handB: 3 },
    keys: [
      { d: 0.1, e: 'outExpo', p: { waist: 190, chest: -5, head: -15, thighF: 100, shinF: -140, thighB: 35, shinB: -90, uarmF: -175, farmF: 30, uarmB: -55, farmB: 70 } },
      { d: 0.18, e: 'inOutCubic', p: null }] },
  // a ninja run: a steep forward lean (the legs' own swing still drives the stride) with both arms swept straight back,
  // held for as long as the run lasts (one key, eased in quickly, long enough it won't visibly re-ease mid-sprint)
  runLayer: { ref: { waist: 166, chest: 1, neck: 2, head: 1, thighF: 25, shinF: -89, footF: 90, uarmF: -146, farmF: 109, handF: 0, thighB: -18, shinB: 0, footB: 90, uarmB: -165, farmB: 128, handB: 3 },
    keys: [{ d: 3, e: 'outQuad', p: { waist: 120, chest: -15, head: -12, uarmF: -100, farmF: 15, uarmB: -85, farmB: 10 } }] },
};
CHAR_DEFS.stick = { name: 'stick', bones: STICK_BONES,
    poses: mapVals({ stance: STANCE, crouch: CROUCH, air: AIR, airFall: AIR_FALL, fall: FALL, lie: LIE }, fromOld),
    moves: { ...mapVals(STICK_MOVES, oldMove), ...MOVEMENT_LAYERS }, hurt: mapVals(STICK_HURT, set => set.map(fromOld)) };

// the stick's only other stance: powered (S+G), a DBZ-style power-up — charges up (mainToPowered: fists clench, the
// aura builds, the screen shakes harder with each key), then fights faster and snappier until it's hit or 8 seconds
// pass (req.exitOn / maxT: setStance(0, 'exit') skips the transition back out)
CHAR_DEFS.stick.stances = [{ name: 'powered', pose: fromOld({ torso: 12, afU: -100, afL: 50, abU: -90, abL: 50 }),
  req: { exitOn: ['hit'], maxT: 8 }, body: { stats: { speed: 1.2, dash: 1.3, tempo: 1.25, springs: 1.3 } }, morph: { mode: 'move', move: 'mainToPowered' } }];
