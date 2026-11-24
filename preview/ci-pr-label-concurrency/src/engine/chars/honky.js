'use strict';
// honky: the luchador: high jumps, the flying body press, a dropkick, a dive from the air, suplexes and a giant swing; mask ties trail
CHAR_DEFS.honky = { ...stick, name: 'honky', speed: 1.05, jump: 1.3, airAccel: 1.3, airSpeed: 1.2, weight: 1.15, health: 1.1, grabRange: 1.4, dash: 1.1,
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
