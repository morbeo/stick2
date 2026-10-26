'use strict';
// the plain stick's own extras (its body, poses and moves are the base in src/engine/rig.js)
// the stick's only other stance: powered (S+G), a DBZ-style power-up — charges up (mainToPowered: fists clench, the
// aura builds, the screen shakes harder with each key), then fights faster and snappier until it's hit or 8 seconds
// pass (req.exitOn / maxT: setStance(0, 'exit') skips the transition back out)
CHAR_DEFS.stick.stances = [{ name: 'powered', pose: fromOld({ torso: 12, afU: -100, afL: 50, abU: -90, abL: 50 }),
  req: { exitOn: ['hit'], maxT: 8 }, body: { stats: { speed: 1.2, dash: 1.3, tempo: 1.25, springs: 1.3 } }, morph: { mode: 'move', move: 'mainToPowered' } }];
