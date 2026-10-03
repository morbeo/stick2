'use strict';
// ---------- the built-in roster: the plain stick plus a dozen fighting-game stereotypes ----------
// each one: a body (the stick's bones resized, plus parts), stats and a gait, the stick's moves retimed to its size plus its
// own signature moves, every input bound to a move that fits it, its own motions where it has charge moves, and a second stance
const sizedBones = (scale, thick = 0) => STICK_BONES.map(b => ({ ...b, len: Math.round(b.len * (scale[b.id.replace(/[FB]$/, '')] ?? 1)),
  thick: (b.thick ?? BONE.thick) + thick, hurt: b.hurt ? b.hurt + thick : 0 }));
const pair = (f, props) => ['F', 'B'].map(S => ({ ...f(S), side: S.toLowerCase(), ...props }));
const horns = (len, a, curl) => ['F', 'B'].flatMap(S => [
  { id: 'horn' + S, parent: 'head', len, a: a + (S === 'B' ? 15 : 0), role: 'head', side: S.toLowerCase(), thick: 3, lag: 0.5 },
  { id: 'hornTip' + S, parent: 'horn' + S, len: Math.round(len * 0.7), a: curl, role: 'head', side: S.toLowerCase(), thick: 2, lag: 1 }]);
const tail3 = (len, thick) => [
  { id: 'tail', parent: null, len, a: -120, role: 'tail', thick, lag: 1, dangle: 0.15 },
  { id: 'tailMid', parent: 'tail', len: Math.round(len * 0.9), a: -20, role: 'tail', thick: thick - 1, lag: 2, dangle: 0.2, min: -70, max: 70 },
  { id: 'tailEnd', parent: 'tailMid', len: Math.round(len * 0.8), a: -20, role: 'tail', thick: Math.max(1, thick - 2), lag: 3, stretch: 0.25, dangle: 0.3, min: -70, max: 70 }];
// a cloth strip trailing from a bone (headband, scarf, mask ties): + angle = backwards off a bone pointing up
const ribbon = (id, parent, len, thick = 3) => [
  { id, parent, len, a: 105, role: 'tail', thick, lag: 2, stretch: 0.2, dangle: 0.45 },
  { id: id + 'Mid', parent: id, len, a: -15, role: 'tail', thick: thick - 1, lag: 3, stretch: 0.25, dangle: 0.35, min: -60, max: 60 },
  { id: id + 'End', parent: id + 'Mid', len: Math.round(len * 0.85), a: -15, role: 'tail', thick: Math.max(1, thick - 2), lag: 4, stretch: 0.3, dangle: 0.35, min: -60, max: 60 }];
// characters with a tail (tail3) swing it up over the back and thrust it forward like a scorpion
const TAIL_WHIP = (() => {
  const m = oldMove(attack({ power: 1.4, damage: 11, hit: 'tailEnd', height: 'mid', knock: 200, stun: 0.45, lunge: 60 },
    [0.12, { torso: -12 }], [0.07, { torso: 25, lfU: 40, lfL: -30, lbU: -25, lbL: 0 }], 0.06, 0.3));
  Object.assign(m.keys[0].p, { tail: -70, tailMid: -30, tailEnd: -30 });
  for (const k of m.keys.slice(1, 3)) Object.assign(k.p, { tail: -270, tailMid: 8, tailEnd: 8 });
  return m;
})();
// the stick's moves, slower and harder (k scales the key times, power the power and knockback)
const retimed = (k, power = 1) => mapVals(CHAR_DEFS.stick.moves, m => m.power
  ? { ...m, power: +(m.power * power).toFixed(2), knock: Math.round(m.knock * power), keys: m.keys.map(x => ({ ...x, d: +(x.d * k).toFixed(4) })) } : m);
// signature moves are written in the old notation (see fromOld); a key's x holds angles of extra bones (tail, wings, second arms)
const sig = o => mapVals(o, m => { const n = oldMove(m); n.keys = n.keys.map(({ x, ...k }) => x ? { ...k, p: { ...k.p, ...x } } : k); return n; });
// the same binds in 2D and 2.5D, b25 adding the 2.5D-only slots (↗ / ↖ with P / K)
const bind = (b, b25 = {}) => ({ binds: b, binds25: { ...b, ...b25 } });
// a stance pose as the presets give it: spine, head, front / back arm, front / back leg (local angles from the root of each limb)
const stylePose = (sp, hd, af, ab, lf, lb) => ({ waist: sp[0], chest: sp[1], neck: hd[0], head: hd[1], uarmF: af[0], farmF: af[1], handF: 0, uarmB: ab[0], farmB: ab[1], handB: 0,
  ...lf && { thighF: lf[0], shinF: lf[1], footF: lf[2], thighB: lb[0], shinB: lb[1], footB: lb[2] } });
const stanceOf = (def, p) => ({ ...def.poses.stance, ...fromOld(p) });
// poses shared by several signature moves (old notation)
const PALMS_OUT = { torso: 18, afU: 90, afL: 5, abU: 80, abL: 10, lfU: 40, lfL: -35, lbU: -30, lbL: 0 };
const PALMS_BACK = { torso: -10, afU: -40, afL: 120, abU: -50, abL: 120, lfU: 35, lfL: -40, lbU: -25, lbL: -10 };
const SPLITS = { torso: 10, lfU: 95, lfL: 0, lbU: -85, lbL: 0, afU: 100, afL: 20, abU: 80, abL: 30 }; // legs out level: spinning kicks
const FLYING = { torso: 88, head: -40, afU: 170, afL: 5, abU: 160, abL: 10, lfU: -80, lfL: 0, lbU: -95, lbL: 0 }; // level, head first
const { stick } = CHAR_DEFS;

// hadoo: the shoto, all-rounder karateka with a ki blast, a rising uppercut and a hurricane kick; the headband trails
CHAR_DEFS.hadoo = { ...stick, name: 'hadoo', tough: 1.05, tempo: 1.05, gait: { idle: 'bounce', idleAmt: 0.7, lean: 1.2 },
  bones: [...sizedBones({ chest: 1.05, uarm: 1.05, farm: 1.05 }, 1), ...ribbon('band', 'head', 9, 3)],
  moves: { ...retimed(1), ...sig({
    // ↓↘→ P: the ki blast, pushed from both palms
    kiBlast: { power: 1.2, damage: 9, hit: ['fh', 'bh'], height: 'mid', knock: 220, stun: 0.42, special: true, shot: { speed: 340, size: 12, look: 'ki' }, keys: [
      { d: 0.14, e: 'outQuad', p: PALMS_BACK },
      { d: 0.06, e: 'outExpo', shoot: true, p: PALMS_OUT },
      { d: 0.18, p: PALMS_OUT }, { d: 0.22, e: 'inOutCubic', p: null }] },
    // karate stance S: the burning blast, slower and hotter
    fireBlast: { power: 1.5, damage: 13, hit: ['fh', 'bh'], height: 'mid', knock: 300, launch: 200, kd: true, special: true, shot: { speed: 240, size: 16, life: 2.5, look: 'fire' }, keys: [
      { d: 0.22, e: 'outQuad', p: { ...PALMS_BACK, torso: -16, head: 10 } },
      { d: 0.07, e: 'outExpo', shoot: true, p: { ...PALMS_OUT, torso: 24 } },
      { d: 0.22, p: { ...PALMS_OUT, torso: 24 } }, { d: 0.26, e: 'inOutCubic', p: null }] },
    // →↓↘ P: the rising uppercut, invincible on the way up, and up it goes
    shoryu: { power: 1.9, damage: 15, hit: 'fh', height: 'high', knock: 120, launch: 720, kd: true, special: true, fx: { look: 'fire' }, keys: [
      { d: 0.04, e: 'outQuad', p: { ...CROUCH, afU: -20, afL: 100, abU: 40, abL: 120 }, inv: true },
      { d: 0.06, e: 'outExpo', p: { torso: 12, head: -10, afU: 160, afL: 15, abU: 10, abL: 130, lfU: 60, lfL: -100, lbU: -15, lbL: -10 }, active: true, lunge: 140, rise: 540, inv: true },
      { d: 0.14, e: 'outQuad', p: { torso: 0, head: -15, afU: 178, afL: 5, abU: 0, abL: 130, lfU: 70, lfL: -110, lbU: -10, lbL: -20 }, active: true },
      { d: 0.3, e: 'inOutCubic', p: AIR_FALL }, { d: 0.1, e: 'inOutCubic', p: null }] },
    // ↓↙← K: the hurricane kick, spinning forward off the floor, its legs out, hitting on every turn
    tatsu: { power: 1.2, damage: 5, hit: ['ff', 'bf'], height: 'high', knock: 160, stun: 0.4, special: true, wide: true, keys: [
      { d: 0.08, e: 'outQuad', p: { torso: 10, lfU: 70, lfL: -110, lbU: -10, lbL: -40, afU: 60, afL: 100, abU: 50, abL: 100 } },
      { d: 0.13, p: SPLITS, active: true, lunge: 260, rise: 420, turn: 2 },
      { d: 0.13, p: SPLITS, active: true, lunge: 260, rehit: true, turn: 2 },
      { d: 0.13, p: SPLITS, active: true, lunge: 260, rehit: true, turn: 2 },
      { d: 0.18, e: 'inOutCubic', p: null }] },
    // S in the air: the same, from a jump
    airTatsu: { power: 1.1, damage: 5, hit: ['ff', 'bf'], height: 'high', knock: 180, stun: 0.4, special: true, air: true, wide: true, keys: [
      { d: 0.06, e: 'outQuad', p: { ...AIR, torso: 10 } },
      { d: 0.13, p: SPLITS, active: true, lunge: 220, drop: -160, turn: 2 },
      { d: 0.13, p: SPLITS, active: true, lunge: 220, rehit: true, turn: 2 },
      { d: 0.15, e: 'inOutCubic', p: null }] },
    // → P: the collarbone breaker, a short hop into an overhead fist
    collarBreak: attack({ power: 1.5, damage: 11, hit: 'fh', height: 'shigh', knock: 180, stun: 0.5, lunge: 140 },
      [0.12, { torso: -12, afU: 175, afL: 90, abU: 20, abL: 120, lfU: 40, lfL: -60 }],
      [0.06, { torso: 32, afU: 80, afL: 10, abU: -20, abL: 90, lfU: 50, lfL: -30, lbU: -35, lbL: 0 }], 0.08, 0.24),
  }) },
  ...bind({ fwdPunch: 'collarBreak', fwdKick: 'sideKick', backPunch: 'reversePunch', backKick: 'crescent', upPunch: 'uppercut', upKick: 'axeKick',
    qcfPunch: 'kiBlast', dpPunch: 'shoryu', qcbKick: 'tatsu', qcfKick: 'tatsu', qcbPunch: 'catch', dpKick: 'risingKick',
    special: 'kiBlast', fwdSpecial: 'tatsu', upSpecial: 'shoryu', downSpecial: 'stomp', airSpecial: 'airTatsu' }, { upFwdPunch: 'collarBreak', upFwdKick: 'flyingKnee' }),
  // S+G: the karate stance, deep and square; S burns the blast
  stances: [{ name: 'karate', pose: stylePose([168, 0], [0, 0], [-110, 40], [-185, 150], [40, -30, 90], [-30, -5, 90]),
    ...bind({ punch: 'reversePunch', fwdPunch: 'knifeHand', fwdKick: 'sideKick', special: 'fireBlast', qcfPunch: 'fireBlast' }) }] };

// grumbo: the giant grappler: huge and slow, a spinning piledriver on a half circle, a bear hug and a spinning lariat
CHAR_DEFS.grumbo = { ...stick, name: 'grumbo', speed: 0.7, dash: 0.8, weight: 1.45, traction: 1.3, turnaround: 0.7, jump: 0.8, fallSpeed: 1.2, airSpeed: 0.8, airDodge: 0.6,
  health: 1.25, tough: 1.3, tempo: 0.95, springs: 0.85, grabRange: 1.7, gait: { stride: 0.8, lift: 0.6, armSwing: 0.5, lean: 1.5, idle: 'shift', breath: 1.6 },
  bones: sizedBones({ waist: 1.2, chest: 1.35, head: 1.25, thigh: 1.1, shin: 1.05, foot: 1.2, uarm: 1.3, farm: 1.3, hand: 1.5 }, 6)
    .map(b => ({ ...b, thick: b.thick + (b.role === 'spine' ? 4 : 0), stiff: 0.65, damp: 1.25 })),
  motions: { m63214: '63214' },
  moves: { ...retimed(1.25, 1.3), ...sig({
    // →↘↓↙← P: the command grab into the spinning piledriver
    spinGrab: { power: 1, damage: 0, hit: ['fh', 'bh'], height: 'high', knock: 0, throw: 'piledriver', special: true, keys: [
      { d: 0.1, e: 'outQuad', p: { torso: 10, afU: 110, afL: 60, abU: 100, abL: 70 } },
      { d: 0.06, e: 'outExpo', p: { torso: 25, afU: 95, afL: 10, abU: 90, abL: 15, lfU: 40, lfL: -40 }, active: true, lunge: 140 },
      { d: 0.36, e: 'inOutCubic', p: null }] },
    piledriver: { power: 2, damage: 26, hit: 'fh', height: 'mid', knock: 60, launch: 140, kd: true, keys: [
      { d: 0.14, e: 'outQuad', p: { torso: -10, afU: 175, afL: 20, abU: 170, abL: 25, lfU: 20, lfL: -10, lbU: -20, lbL: 0 }, turn: 2 },
      { d: 0.1, e: 'linear', p: { ...CROUCH, torso: 50, afU: 120, afL: 10, abU: 110, abL: 20 }, shake: 0.7, sound: 'thud' },
      { d: 0.24, p: { ...CROUCH, torso: 50, afU: 120, afL: 10, abU: 110, abL: 20 } },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // K+G: the bear hug, squeezing the breath out (crumples)
    hugGrab: { power: 1, damage: 0, hit: ['fh', 'bh'], height: 'high', knock: 0, throw: 'bearHug', keys: [
      { d: 0.07, e: 'outQuad', p: { torso: 12, afU: 100, afL: 70, abU: 95, abL: 75 } },
      { d: 0.06, e: 'outExpo', p: { torso: 20, afU: 90, afL: 40, abU: 88, abL: 45 }, active: true, lunge: 100 },
      { d: 0.32, e: 'inOutCubic', p: null }] },
    bearHug: { power: 1.6, damage: 18, hit: 'fh', height: 'mid', knock: 80, crumple: true, keys: [
      { d: 0.1, e: 'outQuad', p: { torso: -15, head: -10, afU: 85, afL: 120, abU: 85, abL: 125 } },
      { d: 0.08, e: 'inOutCubic', p: { torso: -25, head: -20, afU: 80, afL: 140, abU: 80, abL: 145 }, shake: 0.2 },
      { d: 0.08, e: 'inOutCubic', p: { torso: -15, head: -10, afU: 85, afL: 120, abU: 85, abL: 125 } },
      { d: 0.1, e: 'inOutCubic', p: { torso: -25, head: -20, afU: 80, afL: 140, abU: 80, abL: 145 }, shake: 0.3 },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // S: the spinning lariat, arms out, armored through the wind-up and hitting on each turn
    spinLariat: { power: 1.5, damage: 8, hit: ['fh', 'bh'], height: 'high', knock: 260, launch: 200, kd: true, special: true, wide: true, keys: [
      { d: 0.12, e: 'outQuad', p: { torso: 0, afU: 95, afL: 5, abU: 95, abL: 5, lfU: 30, lfL: -40, lbU: -30, lbL: -20 }, armor: true },
      { d: 0.18, p: { torso: 5, afU: 95, afL: 0, abU: 95, abL: 0, lfU: 25, lfL: -30, lbU: -25, lbL: -10 }, active: true, lunge: 120, turn: 2, armor: true },
      { d: 0.18, p: { torso: 5, afU: 95, afL: 0, abU: 95, abL: 0, lfU: 25, lfL: -30, lbU: -25, lbL: -10 }, active: true, lunge: 120, turn: 2, rehit: true },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // ↑ P: both fists clubbed down from overhead, armored
    headCrush: attack({ power: 1.9, damage: 16, hit: ['fh', 'bh'], height: 'shigh', knock: 140, launch: 80, kd: true, bounce: true, lunge: 80 },
      [0.2, { torso: -15, head: -10, afU: 175, afL: 40, abU: 170, abL: 45 }],
      [0.07, { torso: 40, head: 10, afU: 70, afL: 5, abU: 65, abL: 10, lfU: 45, lfL: -45, lbU: -30, lbL: 0 }], 0.1, 0.3),
  }) },
  ...bind({ fwdPunch: 'lariat', backPunch: 'headbutt', upPunch: 'headCrush', backKick: 'stomp', throw2: 'hugGrab',
    m63214Punch: 'spinGrab', m63214Kick: 'hugGrab', qcfPunch: 'lariat', qcbKick: 'spinLariat', qcfKick: 'stomp', qcbPunch: 'spinGrab', dpPunch: 'headCrush',
    special: 'spinLariat', fwdSpecial: 'spinGrab', upSpecial: 'headCrush', downSpecial: 'stomp' }, { upFwdPunch: 'headbutt', upBackPunch: 'headCrush' }),
  stances: [{ name: 'wrestling', pose: stylePose([158, 0], [0, -15], [-130, 100], [-150, 110], [55, -80, 90], [-35, -40, 90]),
    ...bind({ punch: 'hammer', fwdPunch: 'lariat', throw: 'spinGrab', throw2: 'clinch', special: 'spinGrab' }) }] };
CHAR_DEFS.grumbo.moves.piledriver.keys[0].turn = 2;

// jabbo: the boxer: punches only (K throws punches too), bouncing, dash punches on a charge, a rush and a turn punch
CHAR_DEFS.jabbo = { ...stick, name: 'jabbo', speed: 1.1, dash: 1.35, jump: 0.85, airDodge: 0.7, tempo: 1.1, health: 1.05, gait: { idle: 'bounce', idleAmt: 1.5, armSwing: 0.3, lift: 1.2 },
  bones: sizedBones({ chest: 1.1, uarm: 1.05, farm: 1.05, hand: 1.6 }, 1).map(b => b.id.startsWith('hand') ? { ...b, thick: 11, hurt: 6 } : b),
  motions: { m46: '46' },
  moves: { ...retimed(0.9), ...sig({
    // ←→ P: the dash straight, a long lunge behind the back fist
    dashStraight: attack({ power: 1.6, damage: 12, hit: 'bh', height: 'mid', knock: 400, stun: 0.5, lunge: 680, special: true },
      [0.1, { torso: 0, afU: 40, afL: 120, abU: 20, abL: 140, lfU: 40, lfL: -60, lbU: -30, lbL: -10 }],
      [0.08, { torso: 34, afU: 30, afL: 120, abU: 95, abL: 0, lfU: 55, lfL: -30, lbU: -45, lbL: 0 }], 0.12, 0.26),
    // ←→ K: the dash uppercut, launching
    dashUpper: { power: 1.7, damage: 13, hit: 'fh', height: 'high', knock: 120, launch: 600, kd: true, special: true, keys: [
      { d: 0.1, e: 'outQuad', p: { ...CROUCH, torso: 30, afU: 10, afL: 120, abU: 40, abL: 130 } },
      { d: 0.12, p: { ...CROUCH, torso: 30, afU: 10, afL: 120, abU: 40, abL: 130 }, lunge: 560 },
      { d: 0.06, e: 'outExpo', p: { torso: 5, head: -10, afU: 165, afL: 15, abU: 30, abL: 130, lfU: 30, lfL: -10, lbU: -20, lbL: 0 }, active: true },
      { d: 0.1, p: { torso: 5, head: -10, afU: 170, afL: 10, abU: 30, abL: 130, lfU: 30, lfL: -10, lbU: -20, lbL: 0 }, active: true },
      { d: 0.28, e: 'inOutCubic', p: null }] },
    // ↓↘→ P: the rush: four straights stepping in, each one landing
    rushFlurry: { power: 1, damage: 4, hit: ['fh', 'bh'], height: 'high', knock: 90, stun: 0.4, special: true, keys: [
      { d: 0.05, e: 'outQuad', p: { torso: 10, afU: 60, afL: 110, abU: 50, abL: 120 } },
      { d: 0.05, e: 'outExpo', p: { torso: 20, afU: 92, afL: 0, abU: 50, abL: 120 }, active: true, lunge: 120 },
      { d: 0.05, e: 'outExpo', p: { torso: 22, afU: 50, afL: 120, abU: 92, abL: 0 }, active: true, lunge: 120, rehit: true },
      { d: 0.05, e: 'outExpo', p: { torso: 20, afU: 92, afL: 0, abU: 50, abL: 120 }, active: true, lunge: 120, rehit: true },
      { d: 0.06, e: 'outExpo', p: { torso: 28, afU: 50, afL: 120, abU: 95, abL: 0, lfU: 50, lfL: -30, lbU: -40, lbL: 0 }, active: true, lunge: 200, rehit: true },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // S: the turn punch: a whole turn winding up, then a haymaker that crumples
    turnPunch: attack({ power: 2.1, damage: 19, hit: 'bh', height: 'high', knock: 420, crumple: true, lunge: 300, special: true, wide: true },
      [0.24, { torso: -10, afU: 40, afL: 130, abU: -30, abL: 90, lfU: 30, lfL: -40, lbU: -25, lbL: -10 }],
      [0.07, { torso: 32, afU: 20, afL: 120, abU: 100, abL: 5, lfU: 55, lfL: -30, lbU: -45, lbL: 0 }], 0.1, 0.32),
    // →↓↘ P: the buffalo head, a rising headbutt, invincible as it starts
    buffaloHead: { power: 1.7, damage: 13, hit: 'head', height: 'high', knock: 140, launch: 560, kd: true, special: true, keys: [
      { d: 0.05, e: 'outQuad', p: { ...CROUCH, torso: 40, head: 20, afU: 40, afL: 130, abU: 30, abL: 140 }, inv: true },
      { d: 0.06, e: 'outExpo', p: { torso: -5, head: -25, afU: 40, afL: 140, abU: 30, abL: 145, lfU: 20, lfL: -10, lbU: -25, lbL: -20 }, active: true, lunge: 120, rise: 380, inv: true },
      { d: 0.12, p: { torso: -10, head: -25, afU: 40, afL: 140, abU: 30, abL: 145, lfU: 40, lfL: -80, lbU: -10, lbL: -60 }, active: true },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // peekaboo S: the weave: the body ducks side to side as hooks come off it
    weaveHooks: { power: 1.1, damage: 5, hit: ['fh', 'bh'], height: 'high', knock: 150, stun: 0.45, special: true, keys: [
      { d: 0.08, e: 'inOutCubic', p: { ...CROUCH, torso: 35, head: 15, afU: 80, afL: 140, abU: 75, abL: 145 } },
      { d: 0.07, e: 'outExpo', p: { torso: 20, afU: 90, afL: 80, abU: 60, abL: 140, lfU: 40, lfL: -60, lbU: -25, lbL: -30 }, active: true, lunge: 160 },
      { d: 0.08, e: 'inOutCubic', p: { ...CROUCH, torso: 35, head: 15, afU: 80, afL: 140, abU: 75, abL: 145 } },
      { d: 0.07, e: 'outExpo', p: { torso: 20, afU: 60, afL: 140, abU: 90, abL: 80, lfU: 40, lfL: -60, lbU: -25, lbL: -30 }, active: true, lunge: 160, rehit: true },
      { d: 0.26, e: 'inOutCubic', p: null }] },
    // the champion: both gloves up
    win: { keys: [
      { d: 0.2, e: 'outBack', p: { torso: -8, head: -20, afU: 170, afL: 20, abU: 165, abL: 25 } },
      { d: 1.2, p: { torso: -8, head: -20, afU: 172, afL: 15, abU: 168, abL: 20 } },
      { d: 0.4, e: 'inOutCubic', p: null }] },
  }) },
  ...bind({ kick: 'cross', fwdPunch: 'hook', fwdKick: 'bodyHook', backPunch: 'backfist', backKick: 'overhand', upPunch: 'uppercut', upKick: 'overhand',
    downKick: 'bodyHook', downFwdKick: 'bodyBlow', downBackKick: 'crouchJab', dashPunch: 'dashStraight', airKick: 'airPunch', airUpKick: 'airUpper', airDownKick: 'airHammer',
    throw2: 'grab', m46Punch: 'dashStraight', m46Kick: 'dashUpper', qcfPunch: 'rushFlurry', dpPunch: 'buffaloHead', qcbKick: 'turnPunch', qcfKick: 'dashStraight',
    qcbPunch: 'turnPunch', dpKick: 'dashUpper', special: 'turnPunch', fwdSpecial: 'rushFlurry', upSpecial: 'buffaloHead', downSpecial: 'bodyBlow', airSpecial: 'airHammer' },
  { upFwdPunch: 'headbutt', upFwdKick: 'overhand', upBackKick: 'hook' }),
  stances: [{ name: 'peekaboo', pose: stylePose([165, 0], [0, 15], [-150, 150], [-155, 150], [45, -55, 90], [-30, -25, 90]),
    ...bind({ punch: 'hook', kick: 'bodyHook', fwdPunch: 'weaveHooks', upPunch: 'overhand', special: 'weaveHooks' }) }] };

// sneeko: the ninja: slender, fast, a double jump, shuriken, a vanishing kick, a slide; a scarf trails from the neck
CHAR_DEFS.sneeko = { ...stick, name: 'sneeko', speed: 1.25, jump: 1.15, weight: 0.85, jumps: 2, turnaround: 1.5, airDash: 1.2, airAccel: 1.4, dash: 1.15, health: 0.9, springs: 1.15,
  gait: { lean: 1.6, lift: 1.3, armSwing: 0.4, idle: 'still', breath: 0.6 },
  bones: [...sizedBones({ waist: 1.05, chest: 0.95, head: 0.9, thigh: 1.15, shin: 1.15, uarm: 1.05, farm: 1.05 }, -1), ...ribbon('scarf', 'neck', 13, 4)],
  moves: { ...retimed(0.8, 0.85), ...sig({
    // ↘ K: a low slide along the floor, under highs
    slide: attack({ power: 1.1, damage: 8, hit: 'ff', height: 'low', knock: 160, launch: 220, kd: true, lunge: 520 },
      [0.06, { torso: -20, lfU: 60, lfL: -90, lbU: 10, lbL: -110 }],
      [0.06, { torso: -50, lfU: 85, lfL: 0, lbU: 30, lbL: -135, afU: -70, afL: 30, abU: -90, abL: 20 }], 0.14, 0.2),
    // ↓↘→ P: a shuriken flicked from the front hand
    shuriken: { power: 0.9, damage: 5, hit: 'fh', height: 'high', knock: 120, stun: 0.34, special: true, shot: { speed: 520, size: 7, life: 1.5, look: 'star' }, keys: [
      { d: 0.07, e: 'outQuad', p: { torso: -5, afU: 160, afL: 120, abU: 20, abL: 110 } },
      { d: 0.05, e: 'outExpo', shoot: true, p: { torso: 20, afU: 80, afL: 0, abU: -20, abL: 90, lfU: 40, lfL: -35, lbU: -30, lbL: 0 } },
      { d: 0.18, e: 'inOutCubic', p: null }] },
    // S in the air: a shuriken from a jump
    airShuriken: { power: 0.9, damage: 5, hit: 'fh', height: 'mid', knock: 120, stun: 0.34, special: true, air: true, shot: { speed: 520, size: 7, life: 1.5, look: 'star' }, keys: [
      { d: 0.06, e: 'outQuad', p: { ...AIR, afU: 160, afL: 120 } },
      { d: 0.05, e: 'outExpo', shoot: true, p: { ...AIR, torso: 20, afU: 80, afL: 0 } },
      { d: 0.16, e: 'inOutCubic', p: null }] },
    // →↓↘ K: vanishes, reappears behind and kicks
    vanishKick: { power: 1.5, damage: 12, hit: 'bf', height: 'high', knock: 320, launch: 200, kd: true, special: true, keys: [
      { d: 0.1, e: 'outQuad', p: { ...CROUCH, afU: 20, afL: 120, abU: 10, abL: 130 } },
      { d: 0.05, e: 'outExpo', p: { torso: 5, head: -10, afU: 150, afL: 10, abU: 140, abL: 15 }, warp: true, inv: true },
      { d: 0.08, e: 'outQuad', p: { torso: -10, lbU: 40, lbL: -120, afU: 60, afL: 90, abU: 40, abL: 90 } },
      { d: 0.06, e: 'outExpo', p: { torso: -30, lbU: 115, lbL: -5, lfU: 0, lfL: 0, afU: -20, afL: 50, abU: 70, abL: 30 }, active: true, lunge: 120 },
      { d: 0.06, p: { torso: -30, lbU: 115, lbL: -5, lfU: 0, lfL: 0, afU: -20, afL: 50, abU: 70, abL: 30 }, active: true },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // → S: a dash through with a hand blade, invincible as it starts, leaving after-images
    shadowSlash: { power: 1.4, damage: 11, hit: 'fh', height: 'mid', knock: 260, stun: 0.5, special: true, keys: [
      { d: 0.08, e: 'outQuad', p: { torso: 30, afU: -60, afL: 30, abU: -70, abL: 40, lfU: 60, lfL: -90, lbU: -30, lbL: -40 }, inv: true },
      { d: 0.1, e: 'outExpo', p: { torso: 40, afU: 95, afL: 0, abU: -80, abL: 20, lfU: 60, lfL: -40, lbU: -50, lbL: 0 }, active: true, lunge: 760, after: true },
      { d: 0.06, p: { torso: 40, afU: 95, afL: 0, abU: -80, abL: 20, lfU: 60, lfL: -40, lbU: -50, lbL: 0 }, active: true },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // the heel comes down from above the head: an overhead
    axeKick: attack({ power: 1.6, damage: 13, hit: 'ff', height: 'shigh', knock: 150, stun: 0.5, lunge: 140 },
      [0.1, { torso: -22, lfU: 170, lfL: -5, afU: 40, abU: 60 }],
      [0.06, { torso: 15, lfU: 55, lfL: 0, lbU: -15, lbL: 0, afU: 30, abU: 40 }], 0.06, 0.24),
  }) },
  ...bind({ fwdPunch: 'knifeHand', downFwdKick: 'slide', upKick: 'axeKick', backKick: 'fadeKick', qcfPunch: 'shuriken', dpKick: 'vanishKick', qcfKick: 'slide', qcbPunch: 'shadowSlash',
    special: 'shuriken', fwdSpecial: 'shadowSlash', upSpecial: 'risingKick', downSpecial: 'slide', airSpecial: 'airShuriken', airPunch: 'airPunch' },
  { upFwdKick: 'axeKick', upFwdPunch: 'rising' }),
  stances: [{ name: 'shadow', pose: stylePose([140, 0], [0, 25], [-100, 30], [-220, 20], [60, -100, 90], [-40, -60, 90]),
    ...bind({ punch: 'knifeHand', kick: 'slide', fwdPunch: 'shadowSlash', special: 'vanishKick' }) }] };

// zippa: the kung-fu kicker: strong legs, lightning legs, a spinning bird kick on a charge, a head stomp and the crane stance
CHAR_DEFS.zippa = { ...stick, name: 'zippa', speed: 1.15, jump: 1.2, dash: 1.2, airAccel: 1.2, weight: 0.9, health: 0.95, tempo: 1.05,
  gait: { idle: 'bounce', idleAmt: 1.1, stride: 1.2, lift: 1.2, armSwing: 0.6 },
  bones: sizedBones({ waist: 0.95, chest: 0.9, head: 0.95, thigh: 1.15, shin: 1.15, foot: 1.1 }),
  motions: { m28: '28' },
  moves: { ...retimed(0.95), ...sig({
    // S: lightning legs: the front foot snaps out over and over
    lightningLegs: { power: 1, damage: 3, hit: 'ff', height: 'high', knock: 60, stun: 0.4, special: true, keys: [
      { d: 0.06, e: 'outQuad', p: { torso: -8, lfU: 80, lfL: -110, lbU: -15, lbL: 0, afU: 60, afL: 90, abU: -40, abL: 60 } },
      ...[0, 1, 2, 3, 4].flatMap(i => [
        { d: 0.04, e: 'outExpo', p: { torso: -18, lfU: 110 - i * 8, lfL: 0, lbU: -15, lbL: 0, afU: 60, afL: 90, abU: -40, abL: 60 }, active: true, rehit: i > 0 },
        { d: 0.04, e: 'inOutCubic', p: { torso: -10, lfU: 85, lfL: -110, lbU: -15, lbL: 0, afU: 60, afL: 90, abU: -40, abL: 60 } }]),
      { d: 0.2, e: 'inOutCubic', p: null }] },
    // ↓↑ K: the spinning bird kick: upside down, legs split, spinning across, hitting on every turn
    birdKick: { power: 1.3, damage: 5, hit: ['ff', 'bf'], height: 'high', knock: 200, stun: 0.4, special: true, wide: true, keys: [
      { d: 0.08, e: 'outQuad', p: { ...CROUCH, afU: 160, afL: 30, abU: 150, abL: 30 } },
      { d: 0.12, p: { torso: 180, head: 0, lfU: 100, lfL: 0, lbU: -100, lbL: 0, afU: 175, afL: 10, abU: 175, abL: 10 }, active: true, lunge: 280, rise: 420, turn: 2 },
      { d: 0.12, p: { torso: 180, head: 0, lfU: 100, lfL: 0, lbU: -100, lbL: 0, afU: 175, afL: 10, abU: 175, abL: 10 }, active: true, lunge: 280, rehit: true, turn: 2 },
      { d: 0.12, p: { torso: 180, head: 0, lfU: 100, lfL: 0, lbU: -100, lbL: 0, afU: 175, afL: 10, abU: 175, abL: 10 }, active: true, lunge: 280, rehit: true, turn: 2 },
      { d: 0.2, e: 'inOutCubic', p: null }] },
    // crane K: the front foot snaps from the raised knee
    craneKick: attack({ power: 1.5, damage: 12, hit: 'ff', height: 'high', knock: 320, launch: 160, kd: true, lunge: 80 },
      [0.05, { torso: -5, lfU: 100, lfL: -130, afU: 110, afL: 40, abU: -100, abL: 40 }],
      [0.05, { torso: -20, lfU: 125, lfL: 0, lbU: -5, lbL: 0, afU: 110, afL: 40, abU: -100, abL: 40 }], 0.06, 0.2),
    // ↓ K in the air: the head stomp, both feet driven down
    headStomp: attack({ power: 1.4, damage: 10, hit: ['ff', 'bf'], height: 'shigh', knock: 80, launch: 120, kd: true, bounce: true, air: true },
      [0.06, { torso: 10, lfU: 60, lfL: -120, lbU: 50, lbL: -120, afU: 120, afL: 40, abU: 110, abL: 40 }],
      [0.06, { torso: 0, lfU: 10, lfL: 0, lbU: -5, lbL: 0, afU: 140, afL: 20, abU: 130, abL: 20 }], 0.12, 0.16),
    // ↑ K: the flipping axe: a hop and a front flip into a heel from above
    flipAxe: { power: 1.6, damage: 13, hit: 'ff', height: 'shigh', knock: 140, launch: 80, kd: true, bounce: true, keys: [
      { d: 0.08, e: 'outQuad', p: { ...CROUCH, afU: 120, afL: 40, abU: 110, abL: 40 } },
      { d: 0.12, e: 'inOutCubic', p: { torso: 60, head: 20, lfU: 120, lfL: -140, lbU: 100, lbL: -140, afU: 60, afL: 120, abU: 50, abL: 120 }, rise: 420, lunge: 200 },
      { d: 0.06, e: 'outExpo', p: { torso: 20, lfU: 70, lfL: 0, lbU: -20, lbL: -30, afU: 120, afL: 20, abU: 110, abL: 20 }, active: true },
      { d: 0.1, p: { torso: 20, lfU: 40, lfL: 0, lbU: -20, lbL: -30, afU: 120, afL: 20, abU: 110, abL: 20 }, active: true },
      { d: 0.2, e: 'inOutCubic', p: null }] },
  }) },
  ...bind({ fwdPunch: 'palms', fwdKick: 'sideKick', backPunch: 'knifeHand', upKick: 'flipAxe', upPunch: 'chainPunch', airDownKick: 'headStomp',
    m28Kick: 'birdKick', m28Punch: 'flipAxe', qcfKick: 'lightningLegs', dpKick: 'birdKick', qcbKick: 'spinKick', qcfPunch: 'palms', dpPunch: 'risingKick',
    special: 'lightningLegs', fwdSpecial: 'spinKick', upSpecial: 'birdKick', downSpecial: 'rasteira', airSpecial: 'headStomp' },
  { upFwdKick: 'flipAxe', upBackKick: 'crescent' }),
  // S+G: the crane, on one leg with the arms spread; its kicks come from the raised knee
  stances: [{ name: 'crane', pose: { waist: 178, chest: 0, neck: 0, head: 0, uarmF: -70, farmF: -40, handF: 0, uarmB: -280, farmB: 40, handB: 0, thighF: 85, shinF: -110, footF: 90, thighB: -4, shinB: 0, footB: 90 },
    ...bind({ kick: 'craneKick', fwdKick: 'turnKick', punch: 'elbow', downKick: 'lowKick', special: 'lightningLegs' }) }] };

// hicco: the drunken master: leans back and sways, slides on the floor, floppy and tough; a beard and a gourd at the hip
CHAR_DEFS.hicco = { ...stick, name: 'hicco', speed: 0.9, traction: 0.6, turnaround: 1.2, springs: 0.6, tough: 1.35, health: 1.05, jump: 0.95,
  gait: { idle: 'sway', idleAmt: 2.4, lean: -0.5, stride: 0.8, lift: 0.7, armSwing: 1.6, breath: 1.2 },
  bones: [...sizedBones({ waist: 0.95, head: 1.05, thigh: 0.95, shin: 0.95 }, 2),
    { id: 'beard', parent: 'head', len: 10, a: -165, role: 'head', thick: 6, lag: 1.5, stretch: 0.1, dangle: 0.3 },
    { id: 'cord', parent: null, len: 7, a: -20, role: 'tail', thick: 1, lag: 2, dangle: 0.6 },
    { id: 'gourd', parent: 'cord', len: 5, role: 'tail', shape: 'circle', thick: 2, lag: 3, dangle: 0.6 }],
  moves: { ...retimed(1.05), ...sig({
    // → P: a stumble that turns out to be a punch
    stumbleFist: { power: 1.4, damage: 11, hit: 'fh', height: 'mid', knock: 280, stun: 0.5, keys: [
      { d: 0.14, e: 'inOutCubic', p: { torso: -20, head: -15, afU: 120, afL: 60, abU: -30, abL: 40, lfU: 10, lfL: -20, lbU: -30, lbL: -10 } },
      { d: 0.08, e: 'linear', p: { torso: 45, head: 10, afU: 40, afL: 120, abU: -60, abL: 30, lfU: 50, lfL: -70, lbU: -40, lbL: 0 }, lunge: 260 },
      { d: 0.05, e: 'outExpo', p: { torso: 40, afU: 95, afL: 0, abU: -60, abL: 30, lfU: 55, lfL: -50, lbU: -45, lbL: 0 }, active: true },
      { d: 0.08, p: { torso: 40, afU: 95, afL: 0, abU: -60, abL: 30, lfU: 55, lfL: -50, lbU: -45, lbL: 0 }, active: true },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // ↓↘→ K: rolls forward and comes up kicking
    tipsyRoll: { power: 1.4, damage: 11, hit: 'ff', height: 'mid', knock: 300, launch: 220, kd: true, special: true, keys: [
      { d: 0.05, e: 'outQuad', p: TUCK },
      { d: 0.24, p: TUCK, lunge: 420, inv: true },
      { d: 0.06, e: 'outExpo', p: { torso: -40, lfU: 120, lfL: -10, lbU: 20, lbL: -110, afU: -60, afL: 40, abU: -70, abL: 40 }, active: true },
      { d: 0.08, p: { torso: -40, lfU: 120, lfL: -10, lbU: 20, lbL: -110, afU: -60, afL: 40, abU: -70, abL: 40 }, active: true },
      { d: 0.26, e: 'inOutCubic', p: null }] },
    // ← K: tips over backward and the foot comes up as he falls
    fallingKick: attack({ power: 1.5, damage: 12, hit: 'ff', height: 'high', knock: 260, launch: 300, kd: true, lunge: -60 },
      [0.12, { torso: -35, head: -20, afU: 140, afL: 40, abU: 120, abL: 60, lfU: 40, lfL: -60, lbU: -10, lbL: -50 }],
      [0.07, { torso: -70, head: -20, afU: 170, afL: 20, abU: 150, abL: 30, lfU: 150, lfL: 0, lbU: 0, lbL: -80 }], 0.08, 0.36),
    // ← S: sways back from a strike and answers it
    swayCatch: { power: 1, special: true, counter: 'swayStrike', keys: [
      { d: 0.05, e: 'outQuad', p: { torso: -30, head: -20, afU: 100, afL: 90, abU: 60, abL: 90 } },
      { d: 0.3, p: { torso: -35, head: -25, afU: 100, afL: 90, abU: 60, abL: 90 }, catch: true },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    swayStrike: { power: 1.6, damage: 13, hit: ['fh', 'bh'], height: 'mid', knock: 380, launch: 280, kd: true, keys: [
      { d: 0.06, e: 'outQuad', p: { torso: -30, afU: 60, afL: 120, abU: 50, abL: 130 } },
      { d: 0.05, e: 'outExpo', p: PALMS_OUT, active: true, lunge: 200 },
      { d: 0.08, p: PALMS_OUT, active: true },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // ↓ K: drops to the floor and spins the legs round, low
    groundSpin: { power: 1.4, damage: 10, hit: ['ff', 'bf'], height: 'low', knock: 160, launch: 260, kd: true, wide: true, keys: [
      { d: 0.1, e: 'outQuad', p: { ...CROUCH, torso: 40, afU: -60, afL: 20, abU: -70, abL: 20 } },
      { d: 0.18, p: { torso: 60, head: 20, afU: -80, afL: 10, abU: -90, abL: 10, lfU: 85, lfL: 0, lbU: -80, lbL: 0 }, active: true, turn: 2 },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // ↑ S+G: a long swig from the gourd, head back
    taunt: { keys: [
      { d: 0.2, e: 'outQuad', p: { torso: -15, head: -30, afU: 160, afL: 150, abU: -10, abL: 40 } },
      { d: 0.5, e: 'inOutCubic', p: { torso: -22, head: -40, afU: 165, afL: 155, abU: -15, abL: 40 } },
      { d: 0.2, e: 'inOutCubic', p: { torso: 10, head: 10, afU: 40, afL: 100, abU: -10, abL: 40 } },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    win: { keys: [
      { d: 0.3, e: 'outQuad', p: { torso: -15, head: -30, afU: 160, afL: 150, abU: 60, abL: 90 } },
      { d: 1.2, e: 'inOutCubic', p: { torso: -25, head: -40, afU: 165, afL: 155, abU: 80, abL: 60 } },
      { d: 0.4, e: 'inOutCubic', p: null }] },
  }) },
  ...bind({ fwdPunch: 'stumbleFist', backKick: 'fallingKick', backPunch: 'palms', downKick: 'groundSpin', upKick: 'crescent', fwdKick: 'pushKick',
    qcfKick: 'tipsyRoll', qcfPunch: 'stumbleFist', qcbPunch: 'swayCatch', qcbKick: 'groundSpin', dpPunch: 'tigerClaw', dpKick: 'fallingKick',
    special: 'stumbleFist', fwdSpecial: 'tipsyRoll', backSpecial: 'swayCatch', upSpecial: 'fallingKick', downSpecial: 'groundSpin' },
  { upBackKick: 'fallingKick', upFwdPunch: 'stumbleFist' }),
  // S+G: sobers up: upright kung fu
  stances: [{ name: 'sober', pose: stylePose([170, 0], [0, 0], [-100, 70], [-120, 85], [40, -30, 90], [-30, -5, 90]),
    ...bind({ punch: 'chainPunch', fwdPunch: 'tigerClaw', fwdKick: 'sideKick', special: 'catch' }) }] };
CHAR_DEFS.hicco.poses = { ...stick.poses, stance: stanceOf(stick, { torso: -8, head: -12, afU: 60, afL: 90, abU: -20, abL: 60, lfU: 15, lfL: -30, lbU: -25, lbL: -10 }) };

// lumpo: the sumo: very heavy, short legs, a flying headbutt, the hundred-hand slap, a belly splash and a belt throw
CHAR_DEFS.lumpo = { ...stick, name: 'lumpo', speed: 0.8, dash: 1.2, weight: 1.6, health: 1.2, tough: 1.3, jump: 0.7, gravity: 1.3, traction: 1.4, airSpeed: 0.7, grabRange: 1.3, springs: 0.9,
  gait: { stride: 0.7, lift: 1.6, armSwing: 0.6, lean: 0.8, idle: 'shift', breath: 2 },
  bones: sizedBones({ waist: 1.15, chest: 1.3, neck: 0.6, head: 1.15, thigh: 0.85, shin: 0.8, foot: 1.2, uarm: 1.1, farm: 1.1, hand: 1.5 }, 6)
    .map(b => b.role === 'spine' ? { ...b, thick: b.thick + 12, hurt: b.hurt + 4 } : b),
  motions: { m46: '46', m28: '28' },
  moves: { ...retimed(1.1, 1.2), ...sig({
    // ←→ P: the sumo headbutt: flies head first across the screen
    torpedo: { power: 1.7, damage: 14, hit: 'head', height: 'high', knock: 420, launch: 200, kd: true, special: true, keys: [
      { d: 0.1, e: 'outQuad', p: { ...CROUCH, torso: 50, head: 20, afU: -40, afL: 30, abU: -50, abL: 30 } },
      { d: 0.14, p: FLYING, active: true, lunge: 620, rise: 520 },
      { d: 0.14, p: FLYING, active: true, lunge: 520, rise: 260 },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // S: the hundred-hand slap: palms in a blur
    hundredSlap: { power: 0.9, damage: 3, hit: ['fh', 'bh'], height: 'high', knock: 50, stun: 0.4, special: true, keys: [
      { d: 0.06, e: 'outQuad', p: { torso: 15, afU: 60, afL: 100, abU: 50, abL: 110, lfU: 40, lfL: -50, lbU: -30, lbL: -20 } },
      ...[0, 1, 2, 3, 4, 5].map(i => ({ d: 0.045, e: 'outExpo', p: i % 2
        ? { torso: 22, afU: 60, afL: 100, abU: 95 + i * 3, abL: 5, lfU: 40, lfL: -50, lbU: -30, lbL: -20 }
        : { torso: 22, afU: 85 + i * 4, afL: 5, abU: 50, abL: 110, lfU: 40, lfL: -50, lbU: -30, lbL: -20 }, active: true, rehit: i > 0 })),
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // ↓↑ K: the belly splash: up, and down belly first (an overhead)
    sumoSplash: { power: 1.8, damage: 16, hit: ['chest', 'waist'], height: 'shigh', knock: 120, launch: 160, kd: true, otg: true, special: true, keys: [
      { d: 0.1, e: 'outQuad', p: { ...CROUCH, afU: 160, afL: 40, abU: 150, abL: 40 } },
      { d: 0.2, e: 'inOutCubic', p: { torso: -10, afU: 170, afL: 20, abU: 165, abL: 20, lfU: 40, lfL: -80, lbU: -20, lbL: -60 }, rise: 520, lunge: 200 },
      { d: 0.2, e: 'linear', p: { torso: 80, head: -30, afU: 150, afL: 10, abU: 140, abL: 10, lfU: -70, lfL: -20, lbU: -80, lbL: -20 }, active: true, shake: 0.5 },
      { d: 0.1, p: { torso: 80, head: -30, afU: 150, afL: 10, abU: 140, abL: 10, lfU: -70, lfL: -20, lbU: -80, lbL: -20 }, active: true },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // ↓ S: shiko: the leg goes up high and stamps the floor, hitting low
    shiko: { power: 1.3, damage: 9, hit: 'ff', height: 'low', knock: 120, launch: 220, kd: true, otg: true, special: true, keys: [
      { d: 0.2, e: 'outQuad', p: { torso: -20, lfU: 110, lfL: -40, lbU: -20, lbL: 0, afU: 60, afL: 10, abU: 40, abL: 20 } },
      { d: 0.06, e: 'linear', p: { torso: 20, lfU: 40, lfL: -60, lbU: -40, lbL: -40, afU: 20, afL: 30, abU: 20, abL: 30 }, active: true, shake: 0.4, sound: 'thud' },
      { d: 0.08, p: { torso: 20, lfU: 40, lfL: -60, lbU: -40, lbL: -40, afU: 20, afL: 30, abU: 20, abL: 30 }, active: true },
      { d: 0.26, e: 'inOutCubic', p: null }] },
    // → P: the two-handed shove, armored as it winds up
    pushOut: attack({ power: 1.6, damage: 10, hit: ['fh', 'bh'], height: 'mid', knock: 560, stun: 0.4, lunge: 260 },
      [0.12, { ...PALMS_BACK, torso: 0 }], [0.06, { ...PALMS_OUT, torso: 28 }], 0.1, 0.26),
    // P+G: grabs the belt and throws over the arm
    beltGrab: { power: 1, damage: 0, hit: ['fh', 'bh'], height: 'high', knock: 0, throw: 'beltThrow', keys: [
      { d: 0.07, e: 'outQuad', p: { torso: 20, afU: 70, afL: 60, abU: 60, abL: 70 } },
      { d: 0.06, e: 'outExpo', p: { torso: 30, afU: 75, afL: 30, abU: 70, abL: 40, lfU: 40, lfL: -50 }, active: true, lunge: 120 },
      { d: 0.32, e: 'inOutCubic', p: null }] },
    beltThrow: { power: 1.6, damage: 15, hit: 'fh', height: 'mid', knock: -160, launch: 380, kd: true, keys: [
      { d: 0.2, e: 'outQuad', p: { torso: 10, afU: 60, afL: 60, abU: 50, abL: 80, lfU: 30, lfL: -60, lbU: -30, lbL: -40 }, turn: true },
      { d: 0.08, e: 'outExpo', p: { torso: 50, afU: 20, afL: 10, abU: 100, abL: 30, lfU: 40, lfL: -60, lbU: -40, lbL: -20 }, shake: 0.4 },
      { d: 0.32, e: 'inOutCubic', p: null }] },
  }) },
  ...bind({ fwdPunch: 'pushOut', backPunch: 'headbutt', upPunch: 'hammer', fwdKick: 'pushKick', backKick: 'stomp', downKick: 'shiko', throw: 'beltGrab',
    m46Punch: 'torpedo', m46Kick: 'torpedo', m28Kick: 'sumoSplash', m28Punch: 'sumoSplash', qcfPunch: 'hundredSlap', dpPunch: 'sumoSplash', qcbKick: 'shiko', qcfKick: 'torpedo',
    qcbPunch: 'pushOut', dpKick: 'sumoSplash', special: 'hundredSlap', fwdSpecial: 'torpedo', upSpecial: 'sumoSplash', downSpecial: 'shiko' },
  { upFwdPunch: 'headbutt', upFwdKick: 'shiko' }),
  // S+G: the crouch at the line before the charge
  stances: [{ name: 'shikiri', pose: stylePose([140, 0], [0, 20], [-120, 20], [-125, 25], [70, -110, 90], [-40, -70, 90]),
    ...bind({ punch: 'pushOut', kick: 'shiko', fwdPunch: 'hundredSlap', special: 'torpedo' }) }] };

// sarj: the soldier: a sonic boom and a flash kick on charges, a spinning backfist, a knee and the hair comb
CHAR_DEFS.sarj = { ...stick, name: 'sarj', speed: 0.95, health: 1.1, tough: 1.1, jump: 0.95, gait: { idle: 'shift', idleAmt: 0.6, armSwing: 0.7 },
  bones: sizedBones({ chest: 1.1, uarm: 1.1, farm: 1.05, thigh: 1.05, shin: 1.05 }, 1),
  motions: { m46: '46', m28: '28' },
  moves: { ...retimed(1), ...sig({
    // ←→ P: the sonic boom: both arms swing across and a crescent of air flies
    sonicBoom: { power: 1.2, damage: 9, hit: ['fh', 'bh'], height: 'mid', knock: 240, stun: 0.42, special: true, shot: { speed: 300, size: 14, look: 'wave' }, keys: [
      { d: 0.12, e: 'outQuad', p: { torso: -5, afU: 140, afL: 80, abU: 130, abL: 90, lfU: 30, lfL: -30, lbU: -20, lbL: 0 } },
      { d: 0.06, e: 'outExpo', shoot: true, p: { torso: 20, afU: 70, afL: 5, abU: 60, abL: 10, lfU: 40, lfL: -35, lbU: -30, lbL: 0 } },
      { d: 0.16, p: { torso: 20, afU: 70, afL: 5, abU: 60, abL: 10, lfU: 40, lfL: -35, lbU: -30, lbL: 0 } },
      { d: 0.2, e: 'inOutCubic', p: null }] },
    // ↓↑ K: the flash kick: a backflip with the foot sweeping up through the foe, invincible as it starts
    flashKick: { power: 1.9, damage: 15, hit: 'ff', height: 'high', knock: 140, launch: 680, kd: true, special: true, keys: [
      { d: 0.04, e: 'outQuad', p: { ...CROUCH, afU: -20, afL: 60, abU: -30, abL: 60 }, inv: true },
      { d: 0.07, e: 'outExpo', p: { torso: -50, head: -10, lfU: 165, lfL: -5, lbU: 10, lbL: -60, afU: -40, afL: 40, abU: -50, abL: 40 }, active: true, rise: 480, lunge: 60, inv: true },
      { d: 0.12, e: 'outQuad', p: { torso: -140, head: -20, lfU: 220, lfL: -5, lbU: 120, lbL: -90, afU: 60, afL: 40, abU: 50, abL: 40 }, active: true },
      { d: 0.22, e: 'inOutCubic', p: AIR_FALL }, { d: 0.1, e: 'inOutCubic', p: null }] },
    // → S: a whole turn into the back of the fist
    spinKnuckle: attack({ power: 1.6, damage: 13, hit: 'bh', height: 'high', knock: 300, stun: 0.55, lunge: 260, special: true, wide: true },
      [0.12, { torso: -10, afU: 40, afL: 120, abU: 50, abL: 140 }],
      [0.06, { torso: 10, afU: 20, afL: 130, abU: 95, abL: 0, lfU: 40, lfL: -30, lbU: -30, lbL: 0 }], 0.08, 0.26),
    // → K: the knee bazooka: a quick skip into a knee
    kneeBazooka: attack({ power: 1.3, damage: 10, hit: 'thighF', height: 'mid', knock: 260, stun: 0.45, lunge: 420 },
      [0.06, { torso: 5, lfU: 20, lfL: -40, afU: 60, afL: 110, abU: 40, abL: 120 }],
      [0.05, { torso: 20, lfU: 100, lfL: -140, lbU: -20, lbL: 0, afU: 40, afL: 120, abU: -30, abL: 90 }], 0.08, 0.2),
    // ← K: the sobat: turns side on and drives the heel back
    sobat: attack({ power: 1.5, damage: 12, hit: 'bf', height: 'mid', knock: 440, stun: 0.4, lunge: 120 },
      [0.1, { torso: 30, lbU: 50, lbL: -130, afU: 40, afL: 120, abU: 30, abL: 120 }],
      [0.06, { torso: 50, head: -20, lbU: 100, lbL: 0, lfU: -10, lfL: -10, afU: 40, afL: 120, abU: 30, abL: 120 }], 0.08, 0.26),
    // ↑ S+G: combs the hair
    taunt: { keys: [
      { d: 0.15, e: 'outQuad', p: { torso: -5, head: -10, afU: 170, afL: 130, abU: 10, abL: 30 } },
      { d: 0.3, e: 'inOutCubic', p: { torso: -5, head: -15, afU: 175, afL: 100, abU: 10, abL: 30 } },
      { d: 0.25, e: 'inOutCubic', p: null }] },
    // a salute
    win: { keys: [
      { d: 0.2, e: 'outQuad', p: { torso: -4, head: -5, afU: 140, afL: 150, abU: 0, abL: 10, lfU: 5, lfL: 0, lbU: -5, lbL: 0 } },
      { d: 1.3, p: { torso: -4, head: -5, afU: 140, afL: 150, abU: 0, abL: 10, lfU: 5, lfL: 0, lbU: -5, lbL: 0 } },
      { d: 0.4, e: 'inOutCubic', p: null }] },
  }) },
  ...bind({ fwdKick: 'kneeBazooka', backKick: 'sobat', backPunch: 'backfist', upKick: 'flashKick', upPunch: 'hammer',
    m46Punch: 'sonicBoom', m46Kick: 'spinKnuckle', m28Kick: 'flashKick', m28Punch: 'flashKick', qcfPunch: 'sonicBoom', dpKick: 'flashKick', dpPunch: 'rising',
    qcbPunch: 'spinKnuckle', qcbKick: 'sobat', qcfKick: 'kneeBazooka', special: 'sonicBoom', fwdSpecial: 'spinKnuckle', upSpecial: 'flashKick', downSpecial: 'sweep' },
  { upFwdKick: 'kneeBazooka', upBackPunch: 'spinKnuckle' }),
  // S+G: crouched waiting, holding the charge: P booms, K flash kicks
  stances: [{ name: 'turtle', pose: stylePose([150, 0], [0, 15], [-130, 120], [-140, 130], [60, -100, 90], [-25, -60, 90]),
    ...bind({ punch: 'sonicBoom', kick: 'flashKick', fwdPunch: 'spinKnuckle', downKick: 'sweep' }) }] };

// noodo: the stretchy yogi: long thin limbs that stretch, floaty jumps, breathes fire, teleports, a long-reach grab
CHAR_DEFS.noodo = { ...stick, name: 'noodo', speed: 0.8, jump: 0.85, gravity: 0.6, airSpeed: 0.8, fallSpeed: 0.7, weight: 0.85, health: 0.9, springs: 0.8, grabRange: 2, tempo: 0.95,
  gait: { stride: 1.1, lift: 0.8, armSwing: 0.4, lean: 0.4, idle: 'still', breath: 2 },
  bones: sizedBones({ waist: 1.05, chest: 0.9, head: 0.9, thigh: 1.25, shin: 1.25, uarm: 1.6, farm: 1.7, hand: 1.2 }, -2)
    .map(b => b.role === 'arm' || b.role === 'leg' ? { ...b, stretch: 0.5 } : b),
  moves: { ...retimed(1.05), ...sig({
    // ↓↘→ P: yoga fire: leans in and breathes a ball of flame
    yogaFire: { power: 1.2, damage: 9, hit: 'head', height: 'mid', knock: 220, stun: 0.42, special: true, shot: { speed: 220, size: 14, life: 2.5, look: 'fire' }, keys: [
      { d: 0.16, e: 'outQuad', p: { torso: -20, head: -30, afU: 60, afL: 150, abU: 50, abL: 150 } },
      { d: 0.06, e: 'outExpo', shoot: true, p: { torso: 30, head: 10, afU: 40, afL: 150, abU: 30, abL: 150, lfU: 35, lfL: -30, lbU: -25, lbL: 0 } },
      { d: 0.2, p: { torso: 30, head: 10, afU: 40, afL: 150, abU: 30, abL: 150, lfU: 35, lfL: -30, lbU: -25, lbL: 0 } },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // P: the long jab: the arm stretches out its whole length
    longJab: attack({ power: 1, damage: 6, hit: 'fh', height: 'high', knock: 140, stun: 0.34, range: 70, next: { punch: 'cross' } },
      [0.08, { torso: 0, afU: 70, afL: 130, abU: 20, abL: 130 }],
      [0.07, { torso: 12, afU: 92, afL: 0, abU: 20, abL: 130 }], 0.08, 0.2),
    // ↓ K in the air: the yoga drill, feet first and spinning down at an angle
    drillKick: attack({ power: 1.3, damage: 9, hit: 'ff', height: 'shigh', knock: 200, stun: 0.42, air: true, lunge: 300 },
      [0.06, { torso: -20, lfU: 60, lfL: -120, lbU: 40, lbL: -120 }],
      [0.2, { torso: -40, lfU: 50, lfL: 0, lbU: 40, lbL: -10, afU: 170, afL: 0, abU: 165, abL: 0 }], 0.1, 0.12),
    // →↓↘ K: yoga teleport: sinks into a lotus and reappears behind
    yogaWarp: { special: true, fx: { look: 'smoke', on: 'body' }, keys: [
      { d: 0.18, e: 'outQuad', p: { torso: 10, head: 10, afU: 40, afL: 130, abU: 40, abL: 130, lfU: 80, lfL: -150, lbU: 70, lbL: -150 } },
      { d: 0.05, e: 'outExpo', p: { torso: 10, head: 10, afU: 40, afL: 130, abU: 40, abL: 130, lfU: 80, lfL: -150, lbU: 70, lbL: -150 }, warp: true, inv: true },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // P+G: grabs from far off with a long arm and headbutts over and over
    yogaGrab: { power: 1, damage: 0, hit: 'fh', height: 'high', knock: 0, throw: 'yogaNoogie', keys: [
      { d: 0.08, e: 'outQuad', p: { torso: 10, afU: 70, afL: 60 } },
      { d: 0.08, e: 'outExpo', p: { torso: 18, afU: 92, afL: 0 }, active: true, lunge: 60 },
      { d: 0.34, e: 'inOutCubic', p: null }] },
    yogaNoogie: { power: 1.5, damage: 15, hit: 'head', height: 'mid', knock: 320, stun: 0.7, keys: [
      { d: 0.08, e: 'outQuad', p: { torso: -10, head: -20, afU: 90, afL: 120 } },
      { d: 0.06, e: 'linear', p: { torso: 30, head: 20, afU: 90, afL: 120 }, shake: 0.15 },
      { d: 0.08, e: 'outQuad', p: { torso: -10, head: -20, afU: 90, afL: 120 } },
      { d: 0.06, e: 'linear', p: { torso: 30, head: 20, afU: 90, afL: 120 }, shake: 0.25 },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // ↑ S+G: sits in a lotus and floats a moment
    taunt: { keys: [
      { d: 0.25, e: 'outQuad', p: { torso: 0, head: 10, afU: 40, afL: 130, abU: 40, abL: 130, lfU: 80, lfL: -150, lbU: 70, lbL: -150 } },
      { d: 0.6, p: { torso: 0, head: 10, afU: 45, afL: 125, abU: 45, abL: 125, lfU: 80, lfL: -150, lbU: 70, lbL: -150 } },
      { d: 0.3, e: 'inOutCubic', p: null }] },
  }) },
  ...bind({ punch: 'longJab', fwdPunch: 'cross', backPunch: 'palms', airDownKick: 'drillKick', throw: 'yogaGrab', fwdKick: 'sideKick', upKick: 'crescent',
    qcfPunch: 'yogaFire', dpKick: 'yogaWarp', dpPunch: 'yogaWarp', qcfKick: 'sweep', qcbPunch: 'yogaGrab', qcbKick: 'drillKick',
    special: 'yogaFire', fwdSpecial: 'yogaGrab', backSpecial: 'yogaWarp', upSpecial: 'yogaWarp', downSpecial: 'stomp', airSpecial: 'drillKick' },
  { upFwdPunch: 'longJab', upFwdKick: 'crescent' }),
  // S+G: the tree pose, on one leg with the palms together overhead
  stances: [{ name: 'tree', pose: { ...stylePose([180, 0], [0, 0], [-5, 20], [-10, 25]), thighF: 50, shinF: -150, footF: 90, thighB: 0, shinB: 0, footB: 90 },
    ...bind({ punch: 'longJab', kick: 'crescent', special: 'yogaFire', fwdPunch: 'yogaGrab' }) }] };
CHAR_DEFS.noodo.moves.drillKick.keys[1].turn = 2;
// the long legs and arms reach past a foe standing close: their setup distance (see range)
for (const [m, r] of Object.entries({ spin: 75, turnKick: 70, armada: 65, lariat: 100, risingKick: 35 })) CHAR_DEFS.noodo.moves[m].range = r;

// gogili: the wild beast: long heavy arms, hunched, rolls into a ball, electrifies itself, bites, leaps off the wall
CHAR_DEFS.gogili = { ...stick, name: 'gogili', speed: 1.05, jump: 1.15, grabRange: 1.6, airAccel: 1.2, dash: 1.3, weight: 1.05, springs: 1.2, health: 1.05,
  gait: { lean: 2.2, armSwing: 1.8, lift: 1.2, idle: 'bounce', idleAmt: 1.5, breath: 1.6 },
  bones: sizedBones({ waist: 0.95, chest: 1.15, neck: 0.6, head: 1.05, thigh: 0.8, shin: 0.75, uarm: 1.5, farm: 1.5, hand: 1.6 }, 3)
    .map(b => b.role === 'spine' ? { ...b, thick: b.thick + 4 } : b),
  motions: { m46: '46', m28: '28' },
  moves: { ...retimed(1.05, 1.15), ...sig({
    // ←→ P: the rolling ball: curls up and flies at the foe
    rollingBall: { power: 1.6, damage: 13, hit: ['head', 'chest'], height: 'mid', knock: 380, launch: 180, kd: true, special: true, keys: [
      { d: 0.1, e: 'outQuad', p: TUCK },
      { d: 0.16, p: TUCK, active: true, lunge: 680, rise: 100, after: true },
      { d: 0.16, p: TUCK, active: true, lunge: 560 },
      { d: 0.2, e: 'inOutCubic', p: null }] },
    // ↓↑ K: the vertical ball, straight up
    verticalBall: { power: 1.7, damage: 13, hit: ['head', 'chest'], height: 'high', knock: 120, launch: 620, kd: true, special: true, keys: [
      { d: 0.05, e: 'outQuad', p: TUCK, inv: true },
      { d: 0.2, p: TUCK, active: true, rise: 620, lunge: 60, inv: true },
      { d: 0.2, p: TUCK },
      { d: 0.12, e: 'inOutCubic', p: null }] },
    // S: electricity: crouches and crackles, shocking anything that touches it
    electricity: { power: 1, damage: 4, hit: ['fh', 'bh', 'head'], height: 'mid', knock: 120, stun: 0.5, special: true, wide: true, fx: { look: 'lightning', on: 'body' }, keys: [
      { d: 0.08, e: 'outQuad', p: { ...CROUCH, torso: 30, head: 20, afU: 120, afL: 60, abU: 110, abL: 70 } },
      ...[0, 1, 2, 3].map(i => ({ d: 0.07, p: { ...CROUCH, torso: 30 + (i % 2) * 8, head: 20, afU: 125 + (i % 2) * 10, afL: 50, abU: 115 - (i % 2) * 10, abL: 70 },
        active: true, rehit: i > 0, shake: 0.06 })),
      { d: 0.22, e: 'inOutCubic', p: null }] },
    // P+G: grabs and bites the head
    biteGrab: { power: 1, damage: 0, hit: ['fh', 'bh'], height: 'high', knock: 0, throw: 'bite', keys: [
      { d: 0.06, e: 'outQuad', p: { torso: 20, afU: 100, afL: 50, abU: 90, abL: 60 } },
      { d: 0.06, e: 'outExpo', p: { torso: 30, afU: 95, afL: 20, abU: 90, abL: 25 }, active: true, lunge: 120 },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    bite: { power: 1.5, damage: 16, hit: 'head', height: 'high', knock: 260, stun: 0.7, keys: [
      { d: 0.1, e: 'outQuad', p: { torso: 10, head: -30, afU: 95, afL: 60, abU: 90, abL: 70 } },
      { d: 0.06, e: 'linear', p: { torso: 40, head: 20, afU: 95, afL: 90, abU: 90, abL: 100 }, shake: 0.2 },
      { d: 0.08, e: 'outQuad', p: { torso: 10, head: -30, afU: 95, afL: 60, abU: 90, abL: 70 } },
      { d: 0.06, e: 'linear', p: { torso: 40, head: 20, afU: 95, afL: 90, abU: 90, abL: 100 }, shake: 0.3 },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // ↑ S: leaps back as if off a wall, then dives in claws first
    wallDive: { power: 1.6, damage: 12, hit: ['fh', 'bh'], height: 'shigh', knock: 300, launch: 160, kd: true, special: true, range: 115, keys: [
      { d: 0.08, e: 'outQuad', p: { ...CROUCH, afU: -40, afL: 30, abU: -50, abL: 30 } },
      { d: 0.2, e: 'inOutCubic', p: { ...TUCK, torso: -40 }, rise: 640, lunge: -260 },
      { d: 0.16, e: 'outExpo', p: { torso: 130, head: -20, afU: 160, afL: 10, abU: 150, abL: 15, lfU: -40, lfL: -60, lbU: -60, lbL: -60 }, active: true, lunge: 520 },
      { d: 0.12, p: { torso: 130, head: -20, afU: 160, afL: 10, abU: 150, abL: 15, lfU: -40, lfL: -60, lbU: -60, lbL: -60 }, active: true },
      { d: 0.2, e: 'inOutCubic', p: null }] },
    // → P: both claws swipe across
    clawSwipe: attack({ power: 1.4, damage: 11, hit: ['fh', 'bh'], height: 'mid', knock: 260, stun: 0.45, lunge: 140, wide: true },
      [0.1, { torso: -5, afU: 170, afL: 40, abU: 160, abL: 50 }],
      [0.06, { torso: 35, afU: 40, afL: 10, abU: 30, abL: 20, lfU: 45, lfL: -45, lbU: -30, lbL: 0 }], 0.08, 0.24),
    // ↑ S+G: beats the chest
    taunt: { keys: [
      ...[0, 1, 2].flatMap(() => [{ d: 0.1, e: 'inOutCubic', p: { torso: -15, head: -25, afU: 60, afL: 140, abU: 20, abL: 120 } },
        { d: 0.1, e: 'inOutCubic', p: { torso: -15, head: -25, afU: 20, afL: 120, abU: 60, abL: 140 } }]),
      { d: 0.25, e: 'inOutCubic', p: null }] },
  }) },
  ...bind({ fwdPunch: 'clawSwipe', backPunch: 'headbutt', upPunch: 'hammer', downPunch: 'launcher', throw: 'biteGrab', fwdKick: 'pushKick', backKick: 'fadeKick',
    m46Punch: 'rollingBall', m46Kick: 'rollingBall', m28Kick: 'verticalBall', m28Punch: 'wallDive', qcfPunch: 'rollingBall', dpPunch: 'verticalBall',
    qcbPunch: 'electricity', qcbKick: 'wallDive', qcfKick: 'rollingBall', dpKick: 'verticalBall',
    special: 'electricity', fwdSpecial: 'rollingBall', upSpecial: 'wallDive', downSpecial: 'electricity', airSpecial: 'airHammer' },
  { upFwdPunch: 'headbutt', upFwdKick: 'flyingKnee' }),
  // S+G: prowls low, knuckles near the floor
  stances: [{ name: 'prowl', pose: stylePose([120, 0], [0, 35], [-100, 20], [-110, 25], [60, -90, 90], [-40, -60, 90]),
    ...bind({ punch: 'clawSwipe', kick: 'backSweep', fwdPunch: 'biteGrab', special: 'rollingBall' }) }] };
CHAR_DEFS.gogili.poses = { ...stick.poses, stance: { ...stick.poses.stance, waist: 155, neck: 15, uarmF: -140, uarmB: -150, farmF: 15, farmB: 20 } };

// pollo: the luchador: high jumps, the flying body press, a dropkick, a dive from the air, suplexes and a giant swing; mask ties trail
CHAR_DEFS.pollo = { ...stick, name: 'pollo', speed: 1.05, jump: 1.3, airAccel: 1.3, airSpeed: 1.2, weight: 1.15, health: 1.1, grabRange: 1.4, dash: 1.1,
  gait: { idle: 'bounce', idleAmt: 0.9, armSwing: 1.3, lean: 1 },
  bones: [...sizedBones({ chest: 1.2, uarm: 1.15, farm: 1.1, thigh: 1.1, shin: 1.05 }, 3), ...ribbon('tie', 'head', 8, 2)],
  motions: { m63214: '63214' },
  moves: { ...retimed(1.05, 1.1), ...sig({
    // ↓↘→ K: the flying body press, arms out
    bodyPress: { power: 1.6, damage: 13, hit: ['chest', 'fh', 'bh'], height: 'shigh', knock: 300, launch: 160, kd: true, special: true, keys: [
      { d: 0.1, e: 'outQuad', p: { ...CROUCH, afU: 160, afL: 30, abU: 150, abL: 30 } },
      { d: 0.18, e: 'inOutCubic', p: { torso: 80, head: -30, afU: 100, afL: 0, abU: 90, abL: 0, lfU: -70, lfL: -10, lbU: -80, lbL: -10 }, rise: 440, lunge: 380 },
      { d: 0.18, p: { torso: 85, head: -30, afU: 100, afL: 0, abU: 90, abL: 0, lfU: -70, lfL: -10, lbU: -80, lbL: -10 }, active: true, lunge: 340 },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // S in the air: the plancha, diving head first
    plancha: { power: 1.5, damage: 12, hit: ['chest', 'head'], height: 'shigh', knock: 320, launch: 160, kd: true, air: true, special: true, keys: [
      { d: 0.06, e: 'outQuad', p: { ...AIR, afU: 160 } },
      { d: 0.3, p: FLYING, active: true, lunge: 360, drop: 420 },
      { d: 0.14, e: 'inOutCubic', p: null }] },
    // → K: the dropkick, both feet off the floor
    dropkick: { power: 1.6, damage: 12, hit: ['ff', 'bf'], height: 'high', knock: 480, stun: 0.4, keys: [
      { d: 0.08, e: 'outQuad', p: { ...CROUCH, afU: 40, afL: 100, abU: 30, abL: 100 } },
      { d: 0.07, e: 'outExpo', p: { torso: -70, head: 10, lfU: 95, lfL: 0, lbU: 85, lbL: -10, afU: 60, afL: 40, abU: 50, abL: 40 }, active: true, rise: 440, lunge: 320 },
      { d: 0.12, p: { torso: -80, head: 10, lfU: 95, lfL: 0, lbU: 85, lbL: -10, afU: 60, afL: 40, abU: 50, abL: 40 }, active: true },
      { d: 0.28, e: 'inOutCubic', p: null }] },
    // K+G: the waist lock into a German suplex, bridging back
    waistLock: { power: 1, damage: 0, hit: ['fh', 'bh'], height: 'high', knock: 0, throw: 'german', keys: [
      { d: 0.06, e: 'outQuad', p: { torso: 15, afU: 80, afL: 70, abU: 75, abL: 80 } },
      { d: 0.06, e: 'outExpo', p: { torso: 22, afU: 85, afL: 50, abU: 80, abL: 60 }, active: true, lunge: 120 },
      { d: 0.32, e: 'inOutCubic', p: null }] },
    german: { power: 1.8, damage: 17, hit: 'fh', height: 'mid', knock: -140, launch: 520, kd: true, keys: [
      { d: 0.16, e: 'outQuad', p: { torso: -20, afU: 90, afL: 90, abU: 85, abL: 95, lfU: 30, lfL: -60, lbU: -20, lbL: -50 } },
      { d: 0.12, e: 'linear', p: { torso: -140, head: -40, afU: 170, afL: 30, abU: 165, abL: 35, lfU: 40, lfL: -90, lbU: 20, lbL: -100 }, shake: 0.5 },
      { d: 0.16, p: { torso: -140, head: -40, afU: 170, afL: 30, abU: 165, abL: 35, lfU: 40, lfL: -90, lbU: 20, lbL: -100 } },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // →↘↓↙← P: grabs the legs and swings the foe round in a giant swing
    swingGrab: { power: 1, damage: 0, hit: ['fh', 'bh'], height: 'high', knock: 0, throw: 'giantSwing', special: true, keys: [
      { d: 0.08, e: 'outQuad', p: { ...CROUCH, afU: 70, afL: 40, abU: 60, abL: 50 } },
      { d: 0.06, e: 'outExpo', p: { torso: 35, afU: 60, afL: 10, abU: 55, abL: 15, lfU: 40, lfL: -60 }, active: true, lunge: 140 },
      { d: 0.34, e: 'inOutCubic', p: null }] },
    giantSwing: { power: 1.8, damage: 18, hit: 'fh', height: 'mid', knock: 520, launch: 320, kd: true, wallbounce: true, keys: [
      { d: 0.24, p: { torso: -25, head: -10, afU: 95, afL: 10, abU: 90, abL: 15, lfU: 30, lfL: -40, lbU: -30, lbL: -20 }, turn: 2 },
      { d: 0.1, e: 'outExpo', p: { torso: 20, afU: 120, afL: 10, abU: 115, abL: 15, lfU: 40, lfL: -40, lbU: -30, lbL: 0 } },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // ↓ S: up and down elbow first onto a foe on the floor
    elbowDrop: { power: 1.4, damage: 11, hit: 'uarmF', height: 'low', knock: 60, launch: 160, kd: true, otg: true, special: true, keys: [
      { d: 0.08, e: 'outQuad', p: { ...CROUCH, afU: 170, afL: 150 } },
      { d: 0.2, e: 'inOutCubic', p: { torso: -20, afU: 175, afL: 150, abU: 60, abL: 60, lfU: 40, lfL: -80, lbU: -10, lbL: -60 }, rise: 420, lunge: 180 },
      { d: 0.16, e: 'linear', p: { torso: 80, head: -20, afU: 95, afL: 155, abU: 40, abL: 60, lfU: -60, lfL: -20, lbU: -70, lbL: -20 }, active: true, shake: 0.35 },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // ↑ S+G and the win: double biceps
    taunt: { keys: [
      { d: 0.2, e: 'outBack', p: { torso: -5, head: -15, afU: 100, afL: 150, abU: 100, abL: 150 } },
      { d: 0.5, p: { torso: -5, head: -15, afU: 105, afL: 155, abU: 105, abL: 155 } },
      { d: 0.25, e: 'inOutCubic', p: null }] },
    win: { keys: [
      { d: 0.25, e: 'outBack', p: { torso: -8, head: -20, afU: 100, afL: 150, abU: 100, abL: 150 } },
      { d: 1.3, p: { torso: -8, head: -20, afU: 105, afL: 155, abU: 105, abL: 155 } },
      { d: 0.4, e: 'inOutCubic', p: null }] },
  }) },
  ...bind({ fwdKick: 'dropkick', fwdPunch: 'lariat', upPunch: 'hammer', backPunch: 'headbutt', backKick: 'fadeKick', throw2: 'waistLock', airDownPunch: 'plancha',
    m63214Punch: 'swingGrab', m63214Kick: 'swingGrab', qcfKick: 'bodyPress', qcfPunch: 'lariat', dpPunch: 'swingGrab', dpKick: 'dropkick', qcbPunch: 'waistLock', qcbKick: 'elbowDrop',
    special: 'bodyPress', fwdSpecial: 'dropkick', upSpecial: 'bodyPress', downSpecial: 'elbowDrop', airSpecial: 'plancha' },
  { upFwdKick: 'dropkick', upFwdPunch: 'headbutt' }),
  stances: [{ name: 'lucha', pose: stylePose([158, 0], [0, -15], [-130, 100], [-150, 110], [55, -80, 90], [-35, -40, 90]),
    ...bind({ punch: 'hammer', kick: 'dropkick', throw: 'swingGrab', throw2: 'waistLock', special: 'swingGrab' }) }] };

// gloomo: the boss demon: horns, wings, a tail and four arms; a dark orb, a psycho dash, a warp claw and a dive from the air
CHAR_DEFS.gloomo = { ...stick, name: 'gloomo', speed: 1.05, dash: 1.4, jump: 1.15, jumps: 2, gravity: 0.8, airSpeed: 1.2, airAccel: 1.3, airDash: 1.3, weight: 1.1, health: 1.3, tough: 1.2,
  gait: { idle: 'still', breath: 1.4, armSwing: 0.4, lean: 0.6 },
  bones: [...sizedBones({ waist: 1.1, chest: 1.15, thigh: 1.15, shin: 1.15, uarm: 1.2, farm: 1.25, hand: 1.5 }, 1).map(b => ({ ...b, stretch: b.role === 'arm' ? 0.15 : 0 })),
    ...horns(7, -20, 30), ...tail3(16, 3),
    ...pair(S => ({ id: 'wing' + S, parent: 'chest', len: 20, a: 5 + (S === 'B' ? 12 : 0), role: 'tail', thick: 3, lag: 1.5 })),
    ...pair(S => ({ id: 'wingTip' + S, parent: 'wing' + S, len: 18, a: 40, role: 'tail', thick: 2, lag: 2.5, stretch: 0.2, min: 0, max: 110 })),
    ...['F', 'B'].flatMap(S => [
      { id: 'uarm2' + S, parent: 'chest', len: 15, a: -175, role: 'arm', side: S.toLowerCase(), lag: 1.2, thick: 5, min: -250, max: -10 },
      { id: 'farm2' + S, parent: 'uarm2' + S, len: 12, role: 'arm', side: S.toLowerCase(), lag: 2, thick: 5, min: -10, max: 165 },
      { id: 'hand2' + S, parent: 'farm2' + S, len: 4, role: 'arm', side: S.toLowerCase(), lag: 2.5, thick: 6, min: -70, max: 70 }])],
  motions: { m46: '46' },
  moves: { ...retimed(0.95, 1.15), tailWhip: TAIL_WHIP, ...sig({
    // ↓↘→ P: the dark orb, gathered in all four hands
    darkOrb: { power: 1.4, damage: 12, hit: ['fh', 'bh'], height: 'mid', knock: 260, stun: 0.45, special: true, shot: { speed: 300, size: 16, look: 'dark' }, fx: { look: 'aura', on: 'arm', col: 'purple' }, keys: [
      { d: 0.16, e: 'outQuad', p: PALMS_BACK, x: { uarm2F: -230, farm2F: 100, uarm2B: -240, farm2B: 100 } },
      { d: 0.07, e: 'outExpo', shoot: true, p: PALMS_OUT, x: { uarm2F: -90, farm2F: 10, uarm2B: -100, farm2B: 15 } },
      { d: 0.18, p: PALMS_OUT, x: { uarm2F: -90, farm2F: 10, uarm2B: -100, farm2B: 15 } },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // ←→ P: the psycho dash: flies fist first, wrapped in after-images, hitting again and again
    psychoDash: { power: 1.4, damage: 6, hit: ['fh', 'head'], height: 'mid', knock: 300, launch: 160, kd: true, special: true, keys: [
      { d: 0.12, e: 'outQuad', p: { ...CROUCH, torso: 40, afU: -40, afL: 60, abU: -50, abL: 60 } },
      { d: 0.12, p: { ...FLYING, afU: 175, abU: 20, abL: 40 }, active: true, lunge: 700, rise: 400, after: true },
      { d: 0.12, p: { ...FLYING, afU: 175, abU: 20, abL: 40 }, active: true, lunge: 640, rise: 220, rehit: true, after: true },
      { d: 0.12, p: { ...FLYING, afU: 175, abU: 20, abL: 40 }, active: true, lunge: 560, rise: 220, rehit: true, after: true },
      { d: 0.22, e: 'inOutCubic', p: null }] },
    // ← S: warps behind and rakes down with the claws (an overhead)
    warpClaw: { power: 1.6, damage: 13, hit: ['fh', 'bh'], height: 'shigh', knock: 240, launch: 120, kd: true, special: true, keys: [
      { d: 0.12, e: 'outQuad', p: { ...CROUCH, afU: 20, afL: 120, abU: 10, abL: 130 } },
      { d: 0.05, e: 'outExpo', p: { torso: -10, afU: 175, afL: 30, abU: 170, abL: 30 }, warp: true, inv: true },
      { d: 0.1, e: 'outQuad', p: { torso: -10, afU: 175, afL: 30, abU: 170, abL: 30 } },
      { d: 0.06, e: 'outExpo', p: { torso: 40, afU: 60, afL: 10, abU: 55, abL: 10, lfU: 45, lfL: -45, lbU: -30, lbL: 0 }, active: true, lunge: 240 },
      { d: 0.08, p: { torso: 40, afU: 60, afL: 10, abU: 55, abL: 10, lfU: 45, lfL: -45, lbU: -30, lbL: 0 }, active: true },
      { d: 0.26, e: 'inOutCubic', p: null }] },
    // ↓ K in the air: the skull dive, both feet down hard
    skullDive: attack({ power: 1.5, damage: 11, hit: ['ff', 'bf'], height: 'shigh', knock: 120, launch: 160, kd: true, bounce: true, air: true, lunge: 220 },
      [0.08, { torso: 20, lfU: 70, lfL: -130, lbU: 60, lbL: -130, afU: 150, afL: 40, abU: 140, abL: 40 }],
      [0.08, { torso: 10, lfU: 30, lfL: 0, lbU: 20, lbL: 0, afU: 160, afL: 20, abU: 150, abL: 20 }], 0.14, 0.16),
    // → P: the four-arm flurry, the extra pair striking between the first
    quadRush: { power: 1.1, damage: 4, hit: ['fh', 'bh', 'hand2F', 'hand2B'], height: 'high', knock: 100, stun: 0.42, keys: [
      { d: 0.06, e: 'outQuad', p: { torso: 10, afU: 60, afL: 110, abU: 50, abL: 120 }, x: { uarm2F: -120, farm2F: 100, uarm2B: -130, farm2B: 100 } },
      ...[0, 1, 2, 3].map(i => ({ d: 0.05, e: 'outExpo', p: i % 2 ? { torso: 22, afU: 50, afL: 110, abU: 50, abL: 120 } : { torso: 22, afU: 92, afL: 0, abU: 85, abL: 5 },
        x: i % 2 ? { uarm2F: -90, farm2F: 0, uarm2B: -95, farm2B: 5 } : { uarm2F: -120, farm2F: 100, uarm2B: -130, farm2B: 100 }, active: true, lunge: 80, rehit: i > 0 })),
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // ← P: the wings snap forward in a gust that blows the foe away
    wingGust: { power: 1.2, damage: 4, hit: ['wingTipF', 'wingTipB'], height: 'mid', knock: 620, stun: 0.3, keys: [
      { d: 0.14, e: 'outQuad', p: { torso: -10 }, x: { wingF: 50, wingTipF: 100, wingB: 60, wingTipB: 100 } },
      { d: 0.06, e: 'outExpo', p: { torso: 20 }, x: { wingF: -80, wingTipF: 10, wingB: -70, wingTipB: 10 }, active: true },
      { d: 0.08, p: { torso: 20 }, x: { wingF: -80, wingTipF: 10, wingB: -70, wingTipB: 10 }, active: true },
      { d: 0.26, e: 'inOutCubic', p: null }] },
    // ↑ S+G: spreads the wings and all four arms
    taunt: { keys: [
      { d: 0.2, e: 'outBack', p: { torso: -10, head: -20, afU: 140, afL: 30, abU: 130, abL: 30 }, x: { uarm2F: -60, farm2F: 30, uarm2B: -250, farm2B: 30, wingF: 40, wingB: 50, wingTipF: 20, wingTipB: 20 } },
      { d: 0.6, p: { torso: -10, head: -20, afU: 140, afL: 30, abU: 130, abL: 30 }, x: { uarm2F: -60, farm2F: 30, uarm2B: -250, farm2B: 30, wingF: 40, wingB: 50, wingTipF: 20, wingTipB: 20 } },
      { d: 0.3, e: 'inOutCubic', p: null }] },
  }) },
  ...bind({ fwdPunch: 'quadRush', backPunch: 'wingGust', backKick: 'tailWhip', upKick: 'crescent', airDownKick: 'skullDive',
    m46Punch: 'psychoDash', m46Kick: 'psychoDash', qcfPunch: 'darkOrb', dpPunch: 'warpClaw', qcbPunch: 'wingGust', qcbKick: 'tailWhip', qcfKick: 'psychoDash', dpKick: 'risingKick',
    special: 'darkOrb', fwdSpecial: 'psychoDash', backSpecial: 'warpClaw', upSpecial: 'rising', downSpecial: 'stomp', airSpecial: 'skullDive' },
  { upBackKick: 'tailWhip', upFwdPunch: 'quadRush' }),
  // S+G: looms upright, all four arms spread
  stances: [{ name: 'menace', pose: { ...stylePose([180, 0], [0, -10], [-100, 70], [-120, 85], [30, -10, 90], [-25, 0, 90]), uarm2F: -60, farm2F: 30, uarm2B: -250, farm2B: 30 },
    ...bind({ punch: 'quadRush', fwdPunch: 'psychoDash', special: 'darkOrb', kick: 'tailWhip' }) }] };
CHAR_DEFS.gloomo.poses = { ...stick.poses, stance: { ...stick.poses.stance, uarm2F: -100, farm2F: 50, uarm2B: -230, farm2B: 40 } };

// centaur: a horizontal horse body from the hips forward; the human waist sits on its front end (its angles are relative to
// the barrel, so every pose's waist turns by -90); hind legs are the stick's legs, forelegs hang off the barrel: the forelegs
// move as the stick's legs do (knees forward, they do the kicking), the hind legs bend the other way like hocks and follow at
// half strength; both relative to the centaur's own stance. Tramples, kicks with both hind hooves, headbutts, whips its tail
function mapPoses(def, fn) {
  const f = p => p && fn({ ...p });
  return { ...def, poses: mapVals(def.poses, f), moves: mapVals(def.moves, m => ({ ...m, keys: m.keys.map(k => ({ ...k, p: f(k.p) })) })),
    hurt: mapVals(def.hurt, set => set.map(f)) };
}
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
const CENTAUR_MOVES = mapVals({ ...retimed(1.1, 1.2), tailWhip: TAIL_WHIP, ...sig({
  // → P: tramples forward on all fours, the forelegs pounding the ground
  trample: { power: 1.6, damage: 12, hit: ['ff', 'bf'], height: 'mid', knock: 380, launch: 120, kd: true, special: true, keys: [
    { d: 0.12, e: 'outQuad', p: { torso: -5, lfU: -5, lfL: 15, lbU: 10, lbL: -15 } },
    { d: 0.14, e: 'outExpo', p: { torso: 10, lfU: 55, lfL: -35, lbU: 35, lbL: -25 }, active: true, lunge: 480, rehit: true },
    { d: 0.14, p: { torso: 5, lfU: 35, lfL: -15, lbU: 20, lbL: -15 }, active: true, lunge: 360 },
    { d: 0.3, e: 'inOutCubic', p: null }] },
  // ↓ K: the donkey kick, both hind hooves kick back
  donkeyKick: { power: 1.5, damage: 11, hit: ['ff', 'bf'], height: 'mid', knock: 460, stun: 0.45, special: true, keys: [
    { d: 0.1, e: 'outQuad', p: { torso: 30, lfU: -30, lfL: 10, lbU: -20, lbL: 10 } },
    { d: 0.1, e: 'outExpo', p: { torso: 40, lfU: 70, lfL: -60, lbU: 60, lbL: -60 }, active: true, shake: 0.4 },
    { d: 0.08, p: { torso: 40, lfU: 70, lfL: -60, lbU: 60, lbL: -60 }, active: true },
    { d: 0.26, e: 'inOutCubic', p: null }] },
  // ↑ P: rears up and headbutts down
  rearButt: { power: 1.4, damage: 10, hit: 'head', height: 'high', knock: 260, stun: 0.4, special: true, keys: [
    { d: 0.12, e: 'outQuad', p: { torso: -30, head: -20, afU: -20, afL: 100, abU: -30, abL: 100 } },
    { d: 0.1, e: 'outExpo', p: { torso: 30, head: 10, afU: 100, afL: 10, abU: 90, abL: 15 }, active: true, lunge: 140 },
    { d: 0.08, p: { torso: 30, head: 10, afU: 100, afL: 10, abU: 90, abL: 15 }, active: true },
    { d: 0.26, e: 'inOutCubic', p: null }] },
}),
  // rearing-only (the stance below), written in raw bone angles (sig's fromOld only knows the old 10-joint notation,
  // which has no idea about forelegs): standing reared up, both forelegs pummel forward like a boxing horse
  rearStrike: attack({ power: 1.5, damage: 11, hit: ['hoofF', 'hoofB'], height: 'mid', knock: 320, launch: 80, kd: true, special: true },
    [0.12, { foreThighF: -110, foreShinF: 100, foreThighB: -140, foreShinB: 110 }],
    [0.1, { foreThighF: 20, foreShinF: -10, foreThighB: -10, foreShinB: 10 }], 0.1, 0.3),
  // rearing-only: a single overhead hoof stomp with the lead foreleg
  rearStomp: attack({ power: 1.3, damage: 9, hit: 'hoofF', height: 'mid', knock: 200, stun: 0.4, special: true },
    [0.12, { foreThighF: -130, foreShinF: 110 }],
    [0.12, { foreThighF: 40, foreShinF: -20 }], 0.1, 0.26),
}, m => ({ ...m, hit: mapHit(m.hit, h => QUAD_HITS[h] || h) }));
CHAR_DEFS.centaur = { ...mapPoses({ ...stick, moves: CENTAUR_MOVES }, quadLegs),
  name: 'centaur', speed: 1.1, weight: 1.4, jump: 0.9, dash: 1.4, turnaround: 0.45, traction: 0.75, airDodge: 0.6,
  bones: [{ id: 'barrel', len: 34, a: 90, role: 'spine', hurt: 13, thick: 11, lag: 0, min: 60, max: 120 },
    ...STICK_BONES.map(b => b.id === 'waist' ? { ...b, parent: 'barrel', a: 90, min: 30, max: 210 } : b.id.startsWith('shin') ? { ...b, min: -8, max: 165 } : b),
    ...['B', 'F'].flatMap(S => [
      { id: 'foreThigh' + S, parent: 'barrel', len: 22, a: -90, role: 'leg', side: S.toLowerCase(), hurt: 8, lag: 0, min: -190, max: 50 },
      { id: 'foreShin' + S, parent: 'foreThigh' + S, len: 23, role: 'leg', side: S.toLowerCase(), hurt: 8, lag: 1, min: -165, max: 8 },
      { id: 'hoof' + S, parent: 'foreShin' + S, len: 6, a: 90, role: 'leg', side: S.toLowerCase(), hurt: 6, lag: 1.5, level: 1, thick: 5, min: 40, max: 140 }]),
    ...tail3(12, 3).map(b => b.id === 'tail' ? { ...b, a: -150 } : b)],
  ...bind({ fwdPunch: 'trample', downKick: 'donkeyKick', upPunch: 'rearButt', backKick: 'tailWhip',
    special: 'trample', fwdSpecial: 'trample', downSpecial: 'donkeyKick', upSpecial: 'rearButt' }),
  // ↓ (held a moment): lowers into a charging crouch, quicker into the trample
  // S+G (cycles with charge): rears up onto the hind (human) legs, barrel swung upright; the forelegs strike like hooves boxing
  stances: [{ name: 'charge', pose: quadLegs(fromOld({ torso: 20, lfU: 10, lfL: -10, lbU: -5, lbL: 5 })),
    ...bind({ punch: 'trample', special: 'trample', kick: 'donkeyKick' }) },
    { name: 'rearing', pose: { barrel: 150, waist: 22, thighF: 25, shinF: -25, footF: 90, thighB: -18, shinB: 0, footB: 90,
        foreThighF: -60, foreShinF: 60, hoofF: 90, foreThighB: -100, foreShinB: 80, hoofB: 90 },
      body: { bones: { barrel: { min: 60, max: 185 } } },
      ...bind({ punch: 'rearStrike', fwdPunch: 'rearStrike', special: 'rearStrike', kick: 'rearStomp' }) }] };

// houndo: a quadruped beast fighting on all fours; the stick's arms become its front legs (torso turns horizontal the same
// way the centaur's does), its own legs stay the hind legs. Pounces, claws low, rears up to bite, and howls to taunt
function beastPose(p) {
  const q = { ...p };
  if ('waist' in q) q.waist -= 90;
  return q;
}
CHAR_DEFS.houndo = { ...mapPoses({ ...stick, moves: retimed(0.85, 0.9) }, beastPose),
  name: 'houndo', speed: 1.3, weight: 0.9, jump: 0.8, dash: 1.5, turnaround: 0.6, traction: 0.9, airDodge: 0.8, health: 0.95,
  bones: [
    { ...STICK_BONES[0], a: 90, min: 60, max: 120 },
    STICK_BONES[1], STICK_BONES[2], { ...STICK_BONES[3], len: 10 },
    ...STICK_BONES.slice(4).map(b => b.role === 'arm'
      ? { ...b, len: Math.round(b.len * 1.1), min: b.id.startsWith('uarm') ? -140 : -10, max: b.id.startsWith('uarm') ? 100 : 165 } : b),
    ...tail3(14, 3)],
  moves: { ...mapPoses({ ...stick, moves: retimed(0.85, 0.9) }, beastPose).moves, ...sig({
    // → P: tackles forward, teeth bared
    tackle: attack({ power: 1.5, damage: 12, hit: 'head', height: 'mid', knock: 320, stun: 0.42, lunge: 480, special: true },
      [0.1, { torso: -20, lfU: 20, lfL: -30, lbU: -10, lbL: 10 }],
      [0.12, { torso: 20, head: -10, lfU: 60, lfL: -50, lbU: 30, lbL: -40 }], 0.08, 0.3),
    // ↓ P: a low claw rake with the front paw
    clawSwipe: { power: 1.3, damage: 9, hit: ['fh', 'bh'], height: 'low', knock: 160, stun: 0.4, special: true, keys: [
      { d: 0.08, e: 'outQuad', p: { torso: -20, afU: -40, afL: 40, abU: 40, abL: 60 } },
      { d: 0.08, e: 'outExpo', p: { torso: 20, afU: 60, afL: 10, abU: 10, abL: 100 }, active: true },
      { d: 0.06, p: { torso: 20, afU: 60, afL: 10, abU: 10, abL: 100 }, active: true },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // ↑ K: rears and bites down
    bite: { power: 1.6, damage: 13, hit: 'head', height: 'high', knock: 240, launch: 120, kd: true, special: true, keys: [
      { d: 0.1, e: 'outQuad', p: { torso: -30, head: -20 } },
      { d: 0.1, e: 'outExpo', p: { torso: 30, head: 20 }, active: true },
      { d: 0.08, p: { torso: 30, head: 20 }, active: true },
      { d: 0.26, e: 'inOutCubic', p: null }] },
    // ← K: a hind-leg kick, body twisted round to land it behind
    hindKick: { power: 1.3, damage: 9, hit: ['ff', 'bf'], height: 'mid', knock: 300, stun: 0.4, special: true, keys: [
      { d: 0.08, e: 'outQuad', p: { torso: -10, lbU: -40, lbL: 20 } },
      { d: 0.08, e: 'outExpo', p: { torso: 20, lbU: 60, lbL: -60 }, active: true },
      { d: 0.06, p: { torso: 20, lbU: 60, lbL: -60 }, active: true },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // ↑ S+G: a howl
    howl: { keys: [
      { d: 0.2, e: 'outBack', p: { torso: -20, head: -30 } },
      { d: 0.6, p: { torso: -20, head: -30 } },
      { d: 0.3, e: 'inOutCubic', p: null }] },
  }) },
  ...bind({ fwdPunch: 'tackle', downPunch: 'clawSwipe', upKick: 'bite', backKick: 'hindKick', taunt: 'howl',
    special: 'tackle', downSpecial: 'clawSwipe', upSpecial: 'bite', backSpecial: 'hindKick' }),
  // ↓ S+G: a low prowling crouch, quicker into the claw rake
  stances: [{ name: 'prowl', pose: beastPose(fromOld({ torso: 10, lfU: 5, lfL: -5, lbU: -5, lbL: 5, afU: -10, afL: 10, abU: -5, abL: 15 })),
    ...bind({ punch: 'clawSwipe', special: 'clawSwipe', fwdPunch: 'bite' }) }] };

// tako: a human who shapeshifts into an octopus. Two more legs and two more arms are always part of the skeleton, as
// short nubs at the hips and shoulders in human form (every move stays valid on the base skeleton, and no bone needs a
// destructive, one-way hide at the main level) — real 'arm' / 'leg' role bones throughout, so when the octopus stance
// grows them out it walks on its own tentacles instead of drifting on hidden legs. The hands and feet also sprout an
// extra tentacle-tip joint, and the torso shrinks to an octopus's small mantle. Main's own specials are an ink cloud
// and a slippery dodge; the octopus form has its own tentacle slam (the extra arms) and constricting grab (the extra legs)
const tenTip = (parent, a) => [
  { id: parent + 'Tip', parent, len: 9, a, role: 'tail', thick: 3, lag: 1.5, dangle: 0.5, stretch: 0.2, min: -90, max: 90 },
  { id: parent + 'TipEnd', parent: parent + 'Tip', len: 7, a: 15, role: 'tail', thick: 2, lag: 2.5, dangle: 0.6, stretch: 0.3, min: -90, max: 90 }];
// forcePlant (legs only): these are shorter and set higher on the body than the real legs, so they'd never reach as low as
// the body's own lowest point and would be forever "lifted" to the automatic foot-planting check — forced in, they still step
const extraLimb = (id, parent, role, a) => [
  { id, parent, len: 3, a, role, side: id.endsWith('F') ? 'f' : 'b', hurt: 0, lag: 0.5, min: -180, max: 180, ...(role === 'leg' && { forcePlant: true }) },
  { id: id + 'Mid', parent: id, len: 3, role, side: id.endsWith('F') ? 'f' : 'b', hurt: 0, lag: 1.2, dangle: 0.3, stretch: 0.15, min: -90, max: 90 },
  { id: id + 'End', parent: id + 'Mid', len: 2, role, side: id.endsWith('F') ? 'f' : 'b', hurt: 0, lag: 2, dangle: 0.5, stretch: 0.2, min: -90, max: 90 }];
const EXTRA_FULL = {
  extraArmF: { len: 20, hurt: 6 }, extraArmFMid: { len: 16, hurt: 5 }, extraArmFEnd: { len: 10, hurt: 4 },
  extraArmB: { len: 20, hurt: 6 }, extraArmBMid: { len: 16, hurt: 5 }, extraArmBEnd: { len: 10, hurt: 4 },
  extraLegF: { len: 22, hurt: 6 }, extraLegFMid: { len: 18, hurt: 5 }, extraLegFEnd: { len: 12, hurt: 4 },
  extraLegB: { len: 22, hurt: 6 }, extraLegBMid: { len: 18, hurt: 5 }, extraLegBEnd: { len: 12, hurt: 4 },
};
CHAR_DEFS.tako = { ...stick, name: 'tako', speed: 0.95, weight: 0.95, jump: 0.9, airDodge: 1.2, springs: 1.1,
  bones: [...STICK_BONES, ...extraLimb('extraArmF', 'chest', 'arm', 60), ...extraLimb('extraArmB', 'chest', 'arm', -60),
    ...extraLimb('extraLegF', 'waist', 'leg', 150), ...extraLimb('extraLegB', 'waist', 'leg', -150)],
  moves: { ...retimed(1), ...sig({
    // ↓↘→ P: a cloud of ink, blinding and pushing the foe back
    inkCloud: { power: 1, damage: 6, hit: ['fh', 'bh'], height: 'mid', knock: 300, stun: 0.5, special: true, shot: { speed: 260, size: 18, life: 1.4, look: 'dark' }, fx: { look: 'smoke', on: 'arm' }, keys: [
      { d: 0.14, e: 'outQuad', p: PALMS_BACK },
      { d: 0.07, e: 'outExpo', shoot: true, p: PALMS_OUT },
      { d: 0.18, p: PALMS_OUT },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // ← S: a boneless slip to the side, invincible, with a quick counter-jab as it passes
    slipAway: { power: 0.8, damage: 4, hit: 'fh', height: 'mid', knock: 140, stun: 0.3, keys: [
      { d: 0.05, e: 'outQuad', p: { torso: 20 }, inv: true },
      { d: 0.1, p: { torso: -10, afU: 90, afL: 10 }, inv: true, active: true },
      { d: 0.15, e: 'inOutCubic', p: null }] },
  }),
    // octopus-only (the stance below): the two extra arms slam down, the two extra legs wrap and constrict
    tentacleSlam: attack({ power: 1.6, damage: 13, hit: ['extraArmFEnd', 'extraArmBEnd'], height: 'mid', knock: 300, launch: 100, kd: true, special: true },
      [0.1, { waist: 150, extraArmF: -40, extraArmFMid: 20, extraArmB: 100, extraArmBMid: -10 }],
      [0.1, { waist: 190, extraArmF: 60, extraArmFMid: -30, extraArmB: -20, extraArmBMid: 40 }], 0.1, 0.3),
    constrict: attack({ power: 1.3, damage: 9, hit: ['extraLegFEnd', 'extraLegBEnd'], height: 'low', knock: 60, stun: 0.6, special: true },
      [0.12, { waist: 172, extraLegF: -90, extraLegB: -30 }],
      [0.12, { waist: 172, extraLegF: -10, extraLegB: 70 }], 0.14, 0.28) },
  ...bind({ fwdSpecial: 'inkCloud', backSpecial: 'slipAway', special: 'inkCloud' }),
  // S+G: the whole skeleton change described above
  stances: [{ name: 'octopus', pose: { ...stylePose([172, 0], [0, 0], [35, 115], [15, 125], null, null),
      // the four extra limbs fan out around the mantle so they read as tentacles, not a tangle at the shoulders/hips
      extraArmF: -70, extraArmFMid: 45, extraArmFEnd: 35, extraArmB: 130, extraArmBMid: -45, extraArmBEnd: -35,
      extraLegF: 160, extraLegFMid: 45, extraLegFEnd: 35, extraLegB: -170, extraLegBMid: -45, extraLegBEnd: -35 },
    body: { bones: { chest: { len: 10 }, waist: { len: 8 }, ...EXTRA_FULL,
        ...Object.fromEntries(['handF', 'handB', 'footF', 'footB'].map(id => [id, { thick: 4, dangle: 0.4, stretch: 0.2 }])) },
      add: [...tenTip('handF', 20), ...tenTip('handB', -20), ...tenTip('footF', 20), ...tenTip('footB', -20)] },
    ...bind({ punch: 'tentacleSlam', fwdPunch: 'tentacleSlam', kick: 'constrict', special: 'tentacleSlam' }) }] };

// the stick's second stance: boxing · the third: powered (S+G cycles main -> boxing -> powered), a DBZ-style power-up —
// charges up (mainToPowered: fists clench, the aura builds, the screen shakes harder with each key), then fights faster
// and snappier until it's hit or 8 seconds pass (req.exitOn / maxT: setStance(0, 'exit') skips the transition back out)
CHAR_DEFS.stick.stances = [{ name: 'boxing', pose: stylePose([176, 0], [0, 10], [-160, 140], [-170, 145], [20, -20, 90], [-15, 0, 90]),
  ...bind({ fwdPunch: 'hook', downFwdPunch: 'bodyHook', upPunch: 'overhand' }) },
  { name: 'powered', pose: fromOld({ torso: 12, afU: -100, afL: 50, abU: -90, abL: 50 }),
    req: { exitOn: ['hit'], maxT: 8 }, body: { stats: { speed: 1.2, dash: 1.3, tempo: 1.25, springs: 1.3 } }, morph: { mode: 'move' } }];
const CHARS = mapVals(CHAR_DEFS, makeCharacter);
let CURRENT = 'stick';
const currentChar = () => CHARS[CURRENT];
