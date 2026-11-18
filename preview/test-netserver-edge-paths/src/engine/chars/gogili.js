'use strict';
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
