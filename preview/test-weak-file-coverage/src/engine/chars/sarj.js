'use strict';
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
