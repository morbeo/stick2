'use strict';
// clampo: a big, slow wrestler built around grabs, throws and holds — extended grab range, heavy, tanky. Its own throw
// (P+G: bearHug into slam) has a short recovery and a generous launch on purpose: it's a combo throw, landing into an
// air combo instead of the usual long swing-around (see docs/fighting.md, Combo throws). The air throw (P+G airborne)
// is inherited as-is from the stick (airGrab/airToss), already combo-friendly the same way
CHAR_DEFS.clampo = { ...stick, name: 'clampo', speed: 0.85, weight: 1.35, jump: 0.85, health: 1.2, tough: 1.3, grabRange: 1.5, springs: 0.85,
  gait: { lean: 0.6, armSwing: 0.7, idle: 'shift' },
  bones: sizedBones({ waist: 1.15, chest: 1.25, thigh: 1.2, shin: 1.15, uarm: 1.3, farm: 1.25, hand: 1.4 }, 1),
  moves: { ...retimed(0.85, 1.2), ...sig({
    // P+G: a bear hug, then slams the foe down hard and recovers fast enough to chase the bounce with an air combo
    bearHug: { power: 1, damage: 0, hit: 'fh', height: 'high', knock: 0, throw: 'slam', keys: [
      { d: 0.07, e: 'outQuad', p: { torso: 15, afU: 100, afL: 90, abU: 90, abL: 95 } },
      { d: 0.06, e: 'outExpo', p: { torso: 20, afU: 110, afL: 70, abU: 105, abL: 75 }, active: true, lunge: 100 },
      { d: 0.3, e: 'inOutCubic', p: null },
    ] },
    slam: { power: 1.7, damage: 15, hit: 'fh', height: 'mid', knock: 220, launch: 420, kd: true, keys: [
      { d: 0.1, e: 'outQuad', p: { torso: 35, afU: 120, afL: 40, abU: 115, abL: 45, lfU: 10, lfL: -70, lbU: -15, lbL: 0 } },
      { d: 0.08, e: 'outExpo', p: { torso: -20, head: 15, afU: 40, afL: 100, abU: 35, abL: 100, lfU: 55, lfL: -10, lbU: -10, lbL: -90 }, active: true },
      { d: 0.16, e: 'inOutCubic', p: null },
    ] },
    // K+G: a leg-lock takedown into a twisting ankle lock, a submission hold rather than a knockdown
    legLock: { power: 1, damage: 0, hit: 'ff', height: 'low', knock: 0, throw: 'ankleTwist', keys: [
      { d: 0.08, e: 'outQuad', p: { ...CROUCH, torso: 35, afU: -20, afL: 60, abU: -10, abL: 60 } },
      { d: 0.06, e: 'outExpo', p: { torso: 40, lfU: 70, lfL: -10, afU: -10, afL: 70, abU: 0, abL: 70 }, active: true, lunge: 80 },
      { d: 0.3, e: 'inOutCubic', p: null },
    ] },
    ankleTwist: { power: 1.3, damage: 11, hit: 'ff', height: 'low', knock: 160, stun: 0.65, keys: [
      { d: 0.14, e: 'outQuad', p: { torso: 50, head: 10, lfU: 85, lfL: -5, lbU: -20, lbL: -110, afU: -10, afL: 40, abU: 0, abL: 40 } },
      { d: 0.1, e: 'outExpo', p: { torso: 55, head: 10, lfU: 95, lfL: 10, lbU: -20, lbL: -110, afU: -10, afL: 40, abU: 0, abL: 40 }, active: true },
      { d: 0.28, e: 'inOutCubic', p: null },
    ] },
    // → S: a running shoulder tackle, the signature non-grab special
    tackle: attack({ power: 1.5, damage: 11, hit: 'fh', height: 'mid', knock: 320, launch: 120, kd: true, lunge: 540, special: true },
      [0.1, { torso: -15, afU: -50, afL: 20, abU: -40, abL: 20 }],
      [0.1, { torso: 10, afU: 20, afL: 20, abU: 10, abL: 20 }], 0.08, 0.3),
    // ↓ S: a running big splash, a diving body press
    splash: attack({ power: 1.6, damage: 13, hit: ['chest', 'uarmF', 'uarmB'], height: 'mid', knock: 260, stun: 0.55, lunge: 320, special: true },
      [0.12, { torso: -20, head: -15, afU: -80, afL: 10, abU: -70, abL: 10, lfU: 40, lfL: -30, lbU: -20, lbL: 0 }],
      [0.08, { torso: 40, head: 20, afU: 30, afL: 60, abU: 20, abL: 60, lfU: 20, lfL: -10, lbU: -10, lbL: -50 }], 0.1, 0.3),
  }) },
  ...bind({ throw: 'bearHug', throw2: 'legLock', fwdSpecial: 'tackle', special: 'tackle', downSpecial: 'splash' }),
  // S+G: locked in a grapple-ready stance, arms spread wide, reach extended further
  stances: [{ name: 'locked in', pose: stylePose([168, 0], [0, 5], [-90, 60], [-100, 70], [15, -15, 90], [-10, -5, 90]),
    body: { stats: { grabRange: 1.4 } },
    ...bind({ punch: 'bearHug', kick: 'legLock', special: 'tackle' }) }] };
