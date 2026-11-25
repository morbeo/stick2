'use strict';
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
