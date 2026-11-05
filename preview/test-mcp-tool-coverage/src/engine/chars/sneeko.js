'use strict';
// sneeko: the ninja: slender, fast, a double jump, shuriken, a vanishing kick, a slide; a scarf trails from the neck
CHAR_DEFS.sneeko = { ...stick, name: 'sneeko', speed: 1.25, jump: 1.15, weight: 0.85, jumps: 2, turnaround: 1.5, airDash: 1.2, airAccel: 1.4, dash: 1.15, health: 0.9, springs: 1.15,
  gait: { lean: 1.6, lift: 1.3, armSwing: 0.4, idle: 'still', breath: 0.6 },
  bones: [...sizedBones({ waist: 1.05, chest: 0.95, head: 0.9, thigh: 1.15, shin: 1.15, uarm: 1.05, farm: 1.05 }, -1), ...ribbon('scarf', 'neck', 13, 4)],
  moves: { ...retimed(0.8, 0.85), ...sig({
    // ↘ K: a low slide along the floor, under highs
    slide: attack({ power: 1.1, damage: 8, hit: 'ff', height: 'low', knock: 160, launch: 220, kd: true, lunge: 520 },
      [0.06, { torso: -20, lfU: 60, lfL: -90, lbU: 10, lbL: -110 }],
      [0.06, { torso: -50, lfU: 85, lfL: 0, lbU: 30, lbL: -135, afU: -70, afL: 30, abU: -90, abL: 20 }], 0.14, 0.2),
    // ↓↘→ P: a shuriken flicked from the front hand
    shuriken: { power: 0.9, damage: 5, hit: 'fh', height: 'high', knock: 120, stun: 0.34, special: true, shot: { speed: 520, size: 7, life: 1.5, look: 'star' }, keys: [
      { d: 0.07, e: 'outQuad', p: { torso: -5, afU: 160, afL: 120, abU: 20, abL: 110 } },
      { d: 0.05, e: 'outExpo', shoot: true, p: { torso: 20, afU: 80, afL: 0, abU: -20, abL: 90, lfU: 40, lfL: -35, lbU: -30, lbL: 0 } },
      { d: 0.18, e: 'inOutCubic', p: null }] },
    // S in the air: a shuriken from a jump
    airShuriken: { power: 0.9, damage: 5, hit: 'fh', height: 'mid', knock: 120, stun: 0.34, special: true, air: true, shot: { speed: 520, size: 7, life: 1.5, look: 'star' }, keys: [
      { d: 0.06, e: 'outQuad', p: { ...AIR, afU: 160, afL: 120 } },
      { d: 0.05, e: 'outExpo', shoot: true, p: { ...AIR, torso: 20, afU: 80, afL: 0 } },
      { d: 0.16, e: 'inOutCubic', p: null }] },
    // →↓↘ K: vanishes, reappears behind and kicks
    vanishKick: { power: 1.5, damage: 12, hit: 'bf', height: 'high', knock: 320, launch: 200, kd: true, special: true, keys: [
      { d: 0.1, e: 'outQuad', p: { ...CROUCH, afU: 20, afL: 120, abU: 10, abL: 130 } },
      { d: 0.05, e: 'outExpo', p: { torso: 5, head: -10, afU: 150, afL: 10, abU: 140, abL: 15 }, warp: true, inv: true },
      { d: 0.08, e: 'outQuad', p: { torso: -10, lbU: 40, lbL: -120, afU: 60, afL: 90, abU: 40, abL: 90 } },
      { d: 0.06, e: 'outExpo', p: { torso: -30, lbU: 115, lbL: -5, lfU: 0, lfL: 0, afU: -20, afL: 50, abU: 70, abL: 30 }, active: true, lunge: 120 },
      { d: 0.06, p: { torso: -30, lbU: 115, lbL: -5, lfU: 0, lfL: 0, afU: -20, afL: 50, abU: 70, abL: 30 }, active: true },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // → S: a dash through with a hand blade, invincible as it starts, leaving after-images
    shadowSlash: { power: 1.4, damage: 11, hit: 'fh', height: 'mid', knock: 260, stun: 0.5, special: true, keys: [
      { d: 0.08, e: 'outQuad', p: { torso: 30, afU: -60, afL: 30, abU: -70, abL: 40, lfU: 60, lfL: -90, lbU: -30, lbL: -40 }, inv: true },
      { d: 0.1, e: 'outExpo', p: { torso: 40, afU: 95, afL: 0, abU: -80, abL: 20, lfU: 60, lfL: -40, lbU: -50, lbL: 0 }, active: true, lunge: 760, after: true },
      { d: 0.06, p: { torso: 40, afU: 95, afL: 0, abU: -80, abL: 20, lfU: 60, lfL: -40, lbU: -50, lbL: 0 }, active: true },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // the heel comes down from above the head: an overhead
    axeKick: attack({ power: 1.6, damage: 13, hit: 'ff', height: 'shigh', knock: 150, stun: 0.5, lunge: 140 },
      [0.1, { torso: -22, lfU: 170, lfL: -5, afU: 40, abU: 60 }],
      [0.06, { torso: 15, lfU: 55, lfL: 0, lbU: -15, lbL: 0, afU: 30, abU: 40 }], 0.06, 0.24),
    // ← S: a ninja substitution — holds still a moment; a strike caught during it answers by vanishing
    substituteCatch: { power: 1, special: true, counter: 'substitute', keys: [
      { d: 0.05, e: 'outQuad', p: { torso: 10, afU: -30, afL: 100, abU: -20, abL: 100 } },
      { d: 0.22, p: { torso: 10, afU: -30, afL: 100, abU: -20, abL: 100 }, catch: true },
      { d: 0.18, e: 'inOutCubic', p: null }] },
    // the answer: a stationary double left right where it stood (a shot that doesn't move, gone shortly), invincible as
    // it reappears behind the foe — pure escape, no damage of its own, the way the samurai shodown ninjas vanish
    substitute: { power: 0, damage: 0, hit: 'fh', height: 'mid', knock: 0, stun: 0, special: true, shot: { speed: 0, size: 18, life: 0.4, look: 'dark' }, keys: [
      { d: 0.04, e: 'outExpo', shoot: true, p: { torso: 20, afU: 100, afL: 10, abU: 90, abL: 10 }, warp: true, inv: true },
      { d: 0.14, p: { torso: 10, afU: -20, afL: 60, abU: -10, abL: 60 }, inv: true },
      { d: 0.14, e: 'inOutCubic', p: null }] },
  }) },
  ...bind({ fwdPunch: 'knifeHand', downFwdKick: 'slide', upKick: 'axeKick', backKick: 'fadeKick', backSpecial: 'substituteCatch', qcfPunch: 'shuriken', dpKick: 'vanishKick', qcfKick: 'slide', qcbPunch: 'shadowSlash',
    special: 'shuriken', fwdSpecial: 'shadowSlash', upSpecial: 'risingKick', downSpecial: 'slide', airSpecial: 'airShuriken', airPunch: 'airPunch' },
  { upFwdKick: 'axeKick', upFwdPunch: 'rising' }),
  stances: [{ name: 'shadow', pose: stylePose([140, 0], [0, 25], [-100, 30], [-220, 20], [60, -100, 90], [-40, -60, 90]),
    ...bind({ punch: 'knifeHand', kick: 'slide', fwdPunch: 'shadowSlash', special: 'vanishKick' }) }] };
