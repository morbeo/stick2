'use strict';
// bonko: a loose-jointed skeleton who throws his own finger bones, rattles into a flurry charge, headbutts
// straight up out of a crouch and slams a shin down on anyone still on the floor
CHAR_DEFS.bonko = { ...stick, name: 'bonko', col: '#5c5445', speed: 1.15, weight: 0.8, health: 0.85, tough: 0.85, tempo: 1.1, jump: 1.1,
  moves: { ...stick.moves,
    // S: a thrown finger bone, spinning end over end
    boneThrow: { power: 0.9, damage: 6, hit: 'handF', height: 'mid', knock: 150, stun: 0.35, special: true, shot: { speed: 380, size: 9, life: 1.4, look: 'star' },
      keys: [
        { d: 0.1, e: 'outQuad', p: { waist: 192, chest: 0, neck: 0, uarmF: -210, farmF: 130, thighF: 30, shinF: -35, uarmB: -120, farmB: 100, thighB: -25, shinB: -10 } },
        { d: 0.05, e: 'outExpo', shoot: true, p: { waist: 160, chest: 0, neck: 0, uarmF: -85, farmF: 0, thighF: 45, shinF: -40, uarmB: -210, farmB: 110, thighB: -30, shinB: 0 } },
        { d: 0.12, p: { waist: 160, chest: 0, neck: 0, uarmF: -85, farmF: 0, thighF: 45, shinF: -40, uarmB: -210, farmB: 110, thighB: -30, shinB: 0 } },
        { d: 0.2, e: 'inOutCubic', p: null } ],
      cancel: 0 },
    // → S: a rattling charge, two hits as the loose bones clatter forward, the second sending them flying
    rattleRush: { power: 1.3, damage: 7, hit: 'chest', height: 'mid', knock: 400, special: true,
      keys: [
        { d: 0.16, e: 'outQuad', p: { waist: 145, chest: 0, neck: -5, head: -15, uarmF: -160, farmF: 120, thighF: 45, shinF: -70, uarmB: -200, farmB: 110, thighB: -20, shinB: -30 }, armor: true },
        { d: 0.08, e: 'outExpo', p: { waist: 135, chest: 0, neck: -10, head: -20, uarmF: -190, farmF: 110, thighF: 55, shinF: -40, uarmB: -220, farmB: 100, thighB: -45, shinB: 0 }, active: true, lunge: 420, rehit: true, knock: 40 },
        { d: 0.1, p: { waist: 135, chest: 0, neck: -10, head: -20, uarmF: -190, farmF: 110, thighF: 55, shinF: -40, uarmB: -220, farmB: 100, thighB: -45, shinB: 0 }, active: true, kd: true, launch: 150, knock: 350, wallbounce: true },
        { d: 0.3, e: 'inOutCubic', p: null } ],
      cancel: 3 },
    // ↑ S: a rising headbutt out of a crouch, skull leading, invincible on the way up
    skullBash: { power: 1.6, damage: 13, hit: 'head', height: 'high', knock: 300, launch: 480, kd: true, special: true,
      keys: [
        { d: 0.08, e: 'outQuad', p: { waist: 158, chest: 0, neck: 0, uarmF: -130, farmF: 110, thighF: 60, shinF: -110, uarmB: -150, farmB: 120, thighB: -10, shinB: -70 } },
        { d: 0.07, e: 'outExpo', p: { waist: 205, chest: 0, neck: 0, uarmF: -140, farmF: 100, thighF: 100, shinF: -5, uarmB: -60, farmB: 60, thighB: -20, shinB: -110 }, active: true, rise: 520, lunge: 240, inv: true },
        { d: 0.16, p: { waist: 205, chest: 0, neck: 0, uarmF: -140, farmF: 100, thighF: 100, shinF: -5, uarmB: -60, farmB: 60, thighB: -20, shinB: -110 }, active: true },
        { d: 0.3, e: 'inOutCubic', p: null } ],
      cancel: 3 },
    // ↓ S: a shin dropped straight down onto anyone still on the floor
    boneSlam: { power: 1.2, damage: 9, hit: 'footF', height: 'low', knock: 60, launch: 300, kd: true, otg: true, special: true,
      keys: [
        { d: 0.12, e: 'outQuad', p: { waist: 160, chest: 0, neck: 0, head: 10, uarmF: -10, farmF: 30, thighF: 70, shinF: -90, uarmB: -160, farmB: 120, thighB: -10, shinB: -100 } },
        { d: 0.06, e: 'outExpo', p: { waist: 120, chest: 0, neck: -17.5, head: -20, uarmF: -160, farmF: 0, thighF: 80, shinF: -100, uarmB: -210, farmB: 100, thighB: -5, shinB: -110 }, active: true },
        { d: 0.1, p: { waist: 120, chest: 0, neck: -17.5, head: -20, uarmF: -160, farmF: 0, thighF: 80, shinF: -100, uarmB: -210, farmB: 100, thighB: -5, shinB: -110 }, active: true },
        { d: 0.24, e: 'inOutCubic', p: null } ],
      cancel: 3 },
    // S+G stance, special: two finger bones thrown in a spread instead of one
    boneBarrage: { power: 0.8, damage: 5, hit: 'handF', height: 'mid', knock: 130, stun: 0.3, special: true, shot: { speed: 380, size: 8, life: 1.3, look: 'star', count: 2, spread: 16 },
      keys: [
        { d: 0.1, e: 'outQuad', p: { waist: 192, chest: 0, neck: 0, uarmF: -210, farmF: 130, thighF: 30, shinF: -35, uarmB: -120, farmB: 100, thighB: -25, shinB: -10 } },
        { d: 0.05, e: 'outExpo', shoot: true, p: { waist: 160, chest: 0, neck: 0, uarmF: -85, farmF: 0, thighF: 45, shinF: -40, uarmB: -210, farmB: 110, thighB: -30, shinB: 0 } },
        { d: 0.12, p: { waist: 160, chest: 0, neck: 0, uarmF: -85, farmF: 0, thighF: 45, shinF: -40, uarmB: -210, farmB: 110, thighB: -30, shinB: 0 } },
        { d: 0.2, e: 'inOutCubic', p: null } ],
      cancel: 0 },
  },
  ...bind({ special: 'boneThrow', fwdSpecial: 'rattleRush', upSpecial: 'skullBash', downSpecial: 'boneSlam' }),
  // S+G: rattled, every joint gone loose and clattering - faster and springier, but frailer; the special throws two bones in a spread
  stances: [{ name: 'rattled', body: { stats: { speed: 1.3, springs: 1.4, tough: 0.7 } },
    ...bind({ special: 'boneBarrage' }) }] };
