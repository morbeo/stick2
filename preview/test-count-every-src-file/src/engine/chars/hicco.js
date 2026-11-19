'use strict';
// hicco: the drunken master: leans back and sways, slides on the floor, floppy and tough; a beard and a gourd at the hip
CHAR_DEFS.hicco = { ...stick, name: 'hicco', speed: 0.9, traction: 0.6, turnaround: 1.2, springs: 0.6, tough: 1.35, health: 1.05, jump: 0.95,
  gait: { idle: 'sway', idleAmt: 2.4, lean: -0.5, stride: 0.8, lift: 0.7, armSwing: 1.6, breath: 1.2 },
  // a ridiculous sway on the torso/head/arms on top of the gait's own: reads as drunken wobble, not just a walk cycle
  bones: [...sizedBones({ waist: 0.95, head: 1.05, thigh: 0.95, shin: 0.95 }, 2).map(b => ['spine', 'head', 'arm'].includes(b.role) ? { ...b, sway: 3 } : b),
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
