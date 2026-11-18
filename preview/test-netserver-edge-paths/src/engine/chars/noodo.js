'use strict';
// noodo: the stretchy yogi: long thin limbs that stretch, floaty jumps, breathes fire, teleports, a long-reach grab
CHAR_DEFS.noodo = { ...stick, name: 'noodo', speed: 0.8, jump: 0.85, gravity: 0.6, airSpeed: 0.8, fallSpeed: 0.7, weight: 0.85, health: 0.9, springs: 0.8, grabRange: 2, tempo: 0.95,
  gait: { stride: 1.1, lift: 0.8, armSwing: 0.4, lean: 0.4, idle: 'still', breath: 2 },
  bones: sizedBones({ waist: 1.05, chest: 0.9, head: 0.9, thigh: 1.25, shin: 1.25, uarm: 1.6, farm: 1.7, hand: 1.2 }, -2)
    .map(b => b.role === 'arm' || b.role === 'leg' ? { ...b, stretch: 0.5 } : b),
  moves: { ...retimed(1.05), ...sig({
    // ↓↘→ P: yoga fire: leans in and breathes a ball of flame
    yogaFire: { power: 1.2, damage: 9, hit: 'head', height: 'mid', knock: 220, stun: 0.42, special: true, shot: { speed: 220, size: 14, life: 2.5, look: 'fire' }, keys: [
      { d: 0.16, e: 'outQuad', p: { torso: -20, head: -30, afU: 60, afL: 150, abU: 50, abL: 150 } },
      { d: 0.06, e: 'outExpo', shoot: true, p: { torso: 30, head: 10, afU: 40, afL: 150, abU: 30, abL: 150, lfU: 35, lfL: -30, lbU: -25, lbL: 0 } },
      { d: 0.2, p: { torso: 30, head: 10, afU: 40, afL: 150, abU: 30, abL: 150, lfU: 35, lfL: -30, lbU: -25, lbL: 0 } },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // P: the long jab: the arm stretches out its whole length
    longJab: attack({ power: 1, damage: 6, hit: 'fh', height: 'high', knock: 140, stun: 0.34, range: 70, next: { punch: 'cross' } },
      [0.08, { torso: 0, afU: 70, afL: 130, abU: 20, abL: 130 }],
      [0.07, { torso: 12, afU: 92, afL: 0, abU: 20, abL: 130 }], 0.08, 0.2),
    // ↓ K in the air: the yoga drill, feet first and spinning down at an angle
    drillKick: attack({ power: 1.3, damage: 9, hit: 'ff', height: 'shigh', knock: 200, stun: 0.42, air: true, lunge: 300 },
      [0.06, { torso: -20, lfU: 60, lfL: -120, lbU: 40, lbL: -120 }],
      [0.2, { torso: -40, lfU: 50, lfL: 0, lbU: 40, lbL: -10, afU: 170, afL: 0, abU: 165, abL: 0 }], 0.1, 0.12),
    // →↓↘ K: yoga teleport: sinks into a lotus and reappears behind
    yogaWarp: { special: true, fx: { look: 'smoke', on: 'body' }, keys: [
      { d: 0.18, e: 'outQuad', p: { torso: 10, head: 10, afU: 40, afL: 130, abU: 40, abL: 130, lfU: 80, lfL: -150, lbU: 70, lbL: -150 } },
      { d: 0.05, e: 'outExpo', p: { torso: 10, head: 10, afU: 40, afL: 130, abU: 40, abL: 130, lfU: 80, lfL: -150, lbU: 70, lbL: -150 }, warp: true, inv: true },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // P+G: grabs from far off with a long arm and headbutts over and over
    yogaGrab: { power: 1, damage: 0, hit: 'fh', height: 'high', knock: 0, throw: 'yogaNoogie', keys: [
      { d: 0.08, e: 'outQuad', p: { torso: 10, afU: 70, afL: 60 } },
      { d: 0.08, e: 'outExpo', p: { torso: 18, afU: 92, afL: 0 }, active: true, lunge: 60 },
      { d: 0.34, e: 'inOutCubic', p: null }] },
    yogaNoogie: { power: 1.5, damage: 15, hit: 'head', height: 'mid', knock: 320, stun: 0.7, keys: [
      { d: 0.08, e: 'outQuad', p: { torso: -10, head: -20, afU: 90, afL: 120 } },
      { d: 0.06, e: 'linear', p: { torso: 30, head: 20, afU: 90, afL: 120 }, shake: 0.15 },
      { d: 0.08, e: 'outQuad', p: { torso: -10, head: -20, afU: 90, afL: 120 } },
      { d: 0.06, e: 'linear', p: { torso: 30, head: 20, afU: 90, afL: 120 }, shake: 0.25 },
      { d: 0.3, e: 'inOutCubic', p: null }] },
    // ↑ S+G: sits in a lotus and floats a moment
    taunt: { keys: [
      { d: 0.25, e: 'outQuad', p: { torso: 0, head: 10, afU: 40, afL: 130, abU: 40, abL: 130, lfU: 80, lfL: -150, lbU: 70, lbL: -150 } },
      { d: 0.6, p: { torso: 0, head: 10, afU: 45, afL: 125, abU: 45, abL: 125, lfU: 80, lfL: -150, lbU: 70, lbL: -150 } },
      { d: 0.3, e: 'inOutCubic', p: null }] },
  }) },
  ...bind({ punch: 'longJab', fwdPunch: 'cross', backPunch: 'palms', airDownKick: 'drillKick', throw: 'yogaGrab', fwdKick: 'sideKick', upKick: 'crescent',
    qcfPunch: 'yogaFire', dpKick: 'yogaWarp', dpPunch: 'yogaWarp', qcfKick: 'sweep', qcbPunch: 'yogaGrab', qcbKick: 'drillKick',
    special: 'yogaFire', fwdSpecial: 'yogaGrab', backSpecial: 'yogaWarp', upSpecial: 'yogaWarp', downSpecial: 'stomp', airSpecial: 'drillKick' },
  { upFwdPunch: 'longJab', upFwdKick: 'crescent' }),
  // S+G: the tree pose, on one leg with the palms together overhead
  stances: [{ name: 'tree', pose: { ...stylePose([180, 0], [0, 0], [-5, 20], [-10, 25]), thighF: 50, shinF: -150, footF: 90, thighB: 0, shinB: 0, footB: 90 },
    ...bind({ punch: 'longJab', kick: 'crescent', special: 'yogaFire', fwdPunch: 'yogaGrab' }) }] };
CHAR_DEFS.noodo.moves.drillKick.keys[1].turn = 2;
// the long legs and arms reach past a foe standing close: their setup distance (see range)
for (const [m, r] of Object.entries({ spin: 75, turnKick: 70, armada: 65, lariat: 100, risingKick: 35 })) CHAR_DEFS.noodo.moves[m].range = r;
