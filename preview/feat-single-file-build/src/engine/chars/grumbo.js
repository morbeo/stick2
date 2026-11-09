'use strict';
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
