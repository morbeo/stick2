'use strict';
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
