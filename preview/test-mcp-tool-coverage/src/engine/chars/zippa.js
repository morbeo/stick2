'use strict';
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
