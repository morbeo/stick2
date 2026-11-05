'use strict';
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
