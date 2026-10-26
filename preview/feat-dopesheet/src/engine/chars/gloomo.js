'use strict';
// gloomo: the boss demon: horns, wings, a tail and four arms; a dark orb, a psycho dash, a warp claw and a dive from the air
CHAR_DEFS.gloomo = { ...stick, name: 'gloomo', speed: 1.05, dash: 1.4, jump: 1.15, jumps: 2, gravity: 0.8, airSpeed: 1.2, airAccel: 1.3, airDash: 1.3, weight: 1.1, health: 1.3, tough: 1.2,
  gait: { idle: 'still', breath: 1.4, armSwing: 0.4, lean: 0.6 },
  bones: [...sizedBones({ waist: 1.1, chest: 1.15, thigh: 1.15, shin: 1.15, uarm: 1.2, farm: 1.25, hand: 1.5 }, 1).map(b => ({ ...b, stretch: b.role === 'arm' ? 0.15 : 0 })),
    ...horns(7, -20, 30), ...tail3(16, 3),
    ...pair(S => ({ id: 'wing' + S, parent: 'chest', len: 20, a: 5 + (S === 'B' ? 12 : 0), role: 'tail', thick: 3, lag: 1.5 })),
    ...pair(S => ({ id: 'wingTip' + S, parent: 'wing' + S, len: 18, a: 40, role: 'tail', thick: 2, lag: 2.5, stretch: 0.2, min: 0, max: 110 })),
    ...['F', 'B'].flatMap(S => [
      { id: 'uarm2' + S, parent: 'chest', len: 15, a: -175, role: 'arm', side: S.toLowerCase(), lag: 1.2, thick: 5, min: -250, max: -10 },
      { id: 'farm2' + S, parent: 'uarm2' + S, len: 12, role: 'arm', side: S.toLowerCase(), lag: 2, thick: 5, min: -10, max: 165 },
      { id: 'hand2' + S, parent: 'farm2' + S, len: 4, role: 'arm', side: S.toLowerCase(), lag: 2.5, thick: 6, min: -70, max: 70 }])],
  motions: { m46: '46' },
  moves: { ...retimed(0.95, 1.15), tailWhip: TAIL_WHIP, ...sig({
    // ↓↘→ P: the dark orb, gathered in all four hands
    darkOrb: { power: 1.4, damage: 12, hit: ['fh', 'bh'], height: 'mid', knock: 260, stun: 0.45, special: true, shot: { speed: 300, size: 16, look: 'dark' }, fx: { look: 'aura', on: 'arm', col: 'purple' }, keys: [
      { d: 0.16, e: 'outQuad', p: PALMS_BACK, x: { uarm2F: -230, farm2F: 100, uarm2B: -240, farm2B: 100 } },
      { d: 0.07, e: 'outExpo', shoot: true, p: PALMS_OUT, x: { uarm2F: -90, farm2F: 10, uarm2B: -100, farm2B: 15 } },
      { d: 0.18, p: PALMS_OUT, x: { uarm2F: -90, farm2F: 10, uarm2B: -100, farm2B: 15 } },
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // ←→ P: the psycho dash: flies fist first, wrapped in after-images, hitting again and again
    psychoDash: { power: 1.4, damage: 6, hit: ['fh', 'head'], height: 'mid', knock: 300, launch: 160, kd: true, special: true, keys: [
      { d: 0.12, e: 'outQuad', p: { ...CROUCH, torso: 40, afU: -40, afL: 60, abU: -50, abL: 60 } },
      { d: 0.12, p: { ...FLYING, afU: 175, abU: 20, abL: 40 }, active: true, lunge: 700, rise: 400, after: true },
      { d: 0.12, p: { ...FLYING, afU: 175, abU: 20, abL: 40 }, active: true, lunge: 640, rise: 220, rehit: true, after: true },
      { d: 0.12, p: { ...FLYING, afU: 175, abU: 20, abL: 40 }, active: true, lunge: 560, rise: 220, rehit: true, after: true },
      { d: 0.22, e: 'inOutCubic', p: null }] },
    // ← S: warps behind and rakes down with the claws (an overhead)
    warpClaw: { power: 1.6, damage: 13, hit: ['fh', 'bh'], height: 'shigh', knock: 240, launch: 120, kd: true, special: true, keys: [
      { d: 0.12, e: 'outQuad', p: { ...CROUCH, afU: 20, afL: 120, abU: 10, abL: 130 } },
      { d: 0.05, e: 'outExpo', p: { torso: -10, afU: 175, afL: 30, abU: 170, abL: 30 }, warp: true, inv: true },
      { d: 0.1, e: 'outQuad', p: { torso: -10, afU: 175, afL: 30, abU: 170, abL: 30 } },
      { d: 0.06, e: 'outExpo', p: { torso: 40, afU: 60, afL: 10, abU: 55, abL: 10, lfU: 45, lfL: -45, lbU: -30, lbL: 0 }, active: true, lunge: 240 },
      { d: 0.08, p: { torso: 40, afU: 60, afL: 10, abU: 55, abL: 10, lfU: 45, lfL: -45, lbU: -30, lbL: 0 }, active: true },
      { d: 0.26, e: 'inOutCubic', p: null }] },
    // ↓ K in the air: the skull dive, both feet down hard
    skullDive: attack({ power: 1.5, damage: 11, hit: ['ff', 'bf'], height: 'shigh', knock: 120, launch: 160, kd: true, bounce: true, air: true, lunge: 220 },
      [0.08, { torso: 20, lfU: 70, lfL: -130, lbU: 60, lbL: -130, afU: 150, afL: 40, abU: 140, abL: 40 }],
      [0.08, { torso: 10, lfU: 30, lfL: 0, lbU: 20, lbL: 0, afU: 160, afL: 20, abU: 150, abL: 20 }], 0.14, 0.16),
    // → P: the four-arm flurry, the extra pair striking between the first
    quadRush: { power: 1.1, damage: 4, hit: ['fh', 'bh', 'hand2F', 'hand2B'], height: 'high', knock: 100, stun: 0.42, keys: [
      { d: 0.06, e: 'outQuad', p: { torso: 10, afU: 60, afL: 110, abU: 50, abL: 120 }, x: { uarm2F: -120, farm2F: 100, uarm2B: -130, farm2B: 100 } },
      ...[0, 1, 2, 3].map(i => ({ d: 0.05, e: 'outExpo', p: i % 2 ? { torso: 22, afU: 50, afL: 110, abU: 50, abL: 120 } : { torso: 22, afU: 92, afL: 0, abU: 85, abL: 5 },
        x: i % 2 ? { uarm2F: -90, farm2F: 0, uarm2B: -95, farm2B: 5 } : { uarm2F: -120, farm2F: 100, uarm2B: -130, farm2B: 100 }, active: true, lunge: 80, rehit: i > 0 })),
      { d: 0.24, e: 'inOutCubic', p: null }] },
    // ← P: the wings snap forward in a gust that blows the foe away
    wingGust: { power: 1.2, damage: 4, hit: ['wingTipF', 'wingTipB'], height: 'mid', knock: 620, stun: 0.3, keys: [
      { d: 0.14, e: 'outQuad', p: { torso: -10 }, x: { wingF: 50, wingTipF: 100, wingB: 60, wingTipB: 100 } },
      { d: 0.06, e: 'outExpo', p: { torso: 20 }, x: { wingF: -80, wingTipF: 10, wingB: -70, wingTipB: 10 }, active: true },
      { d: 0.08, p: { torso: 20 }, x: { wingF: -80, wingTipF: 10, wingB: -70, wingTipB: 10 }, active: true },
      { d: 0.26, e: 'inOutCubic', p: null }] },
    // ↑ S+G: spreads the wings and all four arms
    taunt: { keys: [
      { d: 0.2, e: 'outBack', p: { torso: -10, head: -20, afU: 140, afL: 30, abU: 130, abL: 30 }, x: { uarm2F: -60, farm2F: 30, uarm2B: -250, farm2B: 30, wingF: 40, wingB: 50, wingTipF: 20, wingTipB: 20 } },
      { d: 0.6, p: { torso: -10, head: -20, afU: 140, afL: 30, abU: 130, abL: 30 }, x: { uarm2F: -60, farm2F: 30, uarm2B: -250, farm2B: 30, wingF: 40, wingB: 50, wingTipF: 20, wingTipB: 20 } },
      { d: 0.3, e: 'inOutCubic', p: null }] },
  }) },
  ...bind({ fwdPunch: 'quadRush', backPunch: 'wingGust', backKick: 'tailWhip', upKick: 'crescent', airDownKick: 'skullDive',
    m46Punch: 'psychoDash', m46Kick: 'psychoDash', qcfPunch: 'darkOrb', dpPunch: 'warpClaw', qcbPunch: 'wingGust', qcbKick: 'tailWhip', qcfKick: 'psychoDash', dpKick: 'risingKick',
    special: 'darkOrb', fwdSpecial: 'psychoDash', backSpecial: 'warpClaw', upSpecial: 'rising', downSpecial: 'stomp', airSpecial: 'skullDive' },
  { upBackKick: 'tailWhip', upFwdPunch: 'quadRush' }),
  // S+G: looms upright, all four arms spread
  stances: [{ name: 'menace', pose: { ...stylePose([180, 0], [0, -10], [-100, 70], [-120, 85], [30, -10, 90], [-25, 0, 90]), uarm2F: -60, farm2F: 30, uarm2B: -250, farm2B: 30 },
    ...bind({ punch: 'quadRush', fwdPunch: 'psychoDash', special: 'darkOrb', kick: 'tailWhip' }) }] };
CHAR_DEFS.gloomo.poses = { ...stick.poses, stance: { ...stick.poses.stance, uarm2F: -100, farm2F: 50, uarm2B: -230, farm2B: 40 } };
