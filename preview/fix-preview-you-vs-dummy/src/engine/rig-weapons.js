'use strict';
// ---------- weapons: an extra bone in the front hand; while held, its class's moves go over P, → P and ↓ P ----------
// shapes: how it is drawn (src/engine/shapes.js) — primitives in (distance along the blade from the grip, perpendicular
// offset) · a: grip angle relative to the hand · back: length behind the hand (a staff is held along it)
// grip2: two-handed, the back hand holds it this far along it from the front hand (− behind)
// weight: heavier hits harder (power, damage and knockback × weaponPower) but its moves play slower (× weaponSpeed)
// a shape's x can reach for 'len' (this weapon's own len, so the blade still reaches the tip under a slight live
// stretch) or 'len-4' etc; grip/guard sizes are plain numbers (a short dagger's guard isn't scaled down with it)
// bladeShapes/clubShapes return a fresh copy each time: dagger/sword and bat/limb start from the same recipe, but
// each weapon owns its own shapes array (editing one must never silently change the other)
const bladeShapes = () => [ // grip, guard, a pointed blade to the tip
  { kind: 'line', x1: -3, y1: 0, x2: 4, y2: 0, w: 3, col: 'wood' },
  { kind: 'polygon', pts: [[3, -5], [3, 5], [4.5, 5], [4.5, -5]], col: 'metal', stroke: 'metal' },
  { kind: 'polygon', pts: [[5, -2], [5, 2], ['len-4', 1.5], ['len', 0], ['len-4', -1.5]], col: 'metal', stroke: 'metal' },
];
const clubShapes = () => [{ kind: 'polygon', pts: [[-3, -1.5], [-3, 1.5], ['len', 3.5], ['len', -3.5]], col: 'wood', stroke: 'wood' }];
const BASE_WEAPONS = {
  dagger: { cls: 'pierce', shapes: bladeShapes(), len: 20, weight: 0.3, a: 0, tip: 'Dagger: short and quick; stabs, and flies straight when thrown' },
  sword: { cls: 'slash', shapes: bladeShapes(), len: 46, weight: 0.8, a: 10, tip: 'Sword: long blade, slashes and chops' },
  axe: { cls: 'slash', len: 36, weight: 1.3, a: 40, tip: 'Axe: a heavy head on a handle; slower, harder chops', shapes: [
    { kind: 'line', x1: -3, y1: 0, x2: 'len', y2: 0, w: 3, col: 'wood' },
    { kind: 'polygon', pts: [['len-12', 0], ['len-15', 10], ['len+1', 12], ['len-2', 0]], col: 'metal', stroke: 'metal' },
  ] },
  lightsaber: { cls: 'slash', len: 50, weight: 0.4, a: 10, tip: 'Lightsaber: a humming blade of pure light, slashes and chops', shapes: [
    { kind: 'line', x1: -4, y1: 0, x2: 9, y2: 0, w: 5, col: 'metal' }, // hilt
    { kind: 'line', x1: 9, y1: 0, x2: 'len', y2: 0, w: 10, col: 'rgba(90,190,255,0.3)' }, // glow
    { kind: 'line', x1: 9, y1: 0, x2: 'len', y2: 0, w: 3, col: '#cdf3ff' }, // bright core
  ] },
  bat: { cls: 'blunt', shapes: clubShapes(), len: 40, weight: 0.9, a: 40, tip: 'Bat: blunt swings that knock back' },
  nunchucks: { cls: 'blunt', chain: true, len: 34, weight: 0.6, a: -100, tip: 'Nunchucks: two sticks on a chain, the outer one flails behind the swing',
    shapes: [{ kind: 'line', x1: -2, y1: 0, x2: 'len', y2: 0, w: 4, col: 'wood' }] },
  // chain: true (the same loose-jointed weaponTip as nunchucks, weaponBones in rig.js) makes the lash itself flex and
  // crack out behind the swing (whip/dangle on weaponTip); light and long, so it's fast with by far the longest reach
  whip: { cls: 'slash', chain: true, len: 76, weight: 0.2, a: -70, tip: 'Whip: a long, light lash that cracks out behind the swing - the longest one-handed reach',
    shapes: [{ kind: 'line', x1: -2, y1: 0, x2: 'len', y2: 0, w: 2, col: 'wood' }] },
  hammer: { cls: '2h', len: 52, weight: 2, a: 40, grip2: 9, tip: 'War hammer: two-handed, very slow, crushing', shapes: [
    { kind: 'line', x1: -3, y1: 0, x2: 'len', y2: 0, w: 3.5, col: 'wood' },
    { kind: 'polygon', pts: [['len-6', -7], ['len-6', 9], ['len+4', 9], ['len+4', -7]], col: 'metal', stroke: 'metal' },
  ] },
  staff: { cls: 'pole', len: 62, back: 34, weight: 1, a: -50, grip2: -24, tip: 'Staff: held along its length; the longest reach',
    shapes: [{ kind: 'line', x1: -36, y1: 0, x2: 'len', y2: 0, w: 3, col: 'wood' }] },
  limb: { cls: 'blunt', shapes: clubShapes(), len: 24, weight: 0.9, a: 0, tip: 'Severed limb: a gruesome weapon of opportunity' },
  // fixed: built into a stance's body (body.weapon, see variant() in rig.js), not picked up or held - never disarmed,
  // thrown or wielded through the normal P+G flow (src/engine/fighter.js weaponGrab, takeHit)
  claws: { cls: 'slash', fixed: true, shapes: [-4, 0, 4].map(y => ({ kind: 'line', x1: 0, y1: y, x2: 'len', y2: y, w: 2, col: 'metal' })),
    len: 14, weight: 0.5, a: 0, tip: 'Claws: short, fast slashes, built into the stance - a fighter\'s own hands, never dropped or thrown' },
};
// my weapons: edits to a built-in, or wholly new ones (same pattern as sounds: myStore -> live table)
const WEAPON_STORE = 'stick2.weapons';
const myWeapons = (() => { try { return JSON.parse(localStorage.getItem(WEAPON_STORE)) || {}; } catch { return {}; } })();
const WEAPONS = { ...BASE_WEAPONS, ...myWeapons };
function saveWeapon(name, preset) { myWeapons[name] = WEAPONS[name] = preset; saveWeapons(); }
function resetWeapon(name) { delete myWeapons[name]; if (BASE_WEAPONS[name]) WEAPONS[name] = { ...BASE_WEAPONS[name] }; else delete WEAPONS[name]; saveWeapons(); }
function renameWeapon(from, to) { if (!myWeapons[from] || to === from || WEAPONS[to]) return; myWeapons[to] = WEAPONS[to] = myWeapons[from]; resetWeapon(from); }
function saveWeapons() { try { localStorage.setItem(WEAPON_STORE, JSON.stringify(myWeapons)); } catch {} }
function duplicateWeapon(from) { let n = 1; while (WEAPONS[from + n]) n++; const name = from + n; saveWeapon(name, { ...WEAPONS[from], shapes: cloneShapes(WEAPONS[from].shapes) }); return name; }
const weaponPower = w => 0.8 + 0.4 * w.weight, weaponSpeed = w => 1.15 - 0.2 * w.weight;
// a weapon move built on a stick move's key pose (move, key index), with the weapon's grip angle (undefined: the rest grip)
const wPose = (n, i, w, more) => ({ ...CHAR_DEFS.stick.moves[n].keys[i].p, ...more, ...(w === undefined ? {} : { weapon: w }) });
// a weapon move's own pose, written as the stick's moves are (torso, afU, …), with the weapon's grip angle
const wOwn = (o, w) => ({ ...fromOld(o), ...(w === undefined ? {} : { weapon: w }) });
const wAtk = (cls, o, wind, strike, hd, rd) => attack({ ...o, hit: 'weapon', weapon: cls }, wind, strike, hd, rd);
const WEAPON_MOVES = {
  // pierce: a fencer's thrust from the hip, the free hand up on guard; a deep lunge, the back arm flung behind; a rising stab up out of a crouch
  stab: wAtk('pierce', { power: 0.9, damage: 7, height: 'high', knock: 100, stun: 0.3 }, [0.05, wOwn({ torso: -6, afU: -30, afL: 100, abU: 60, abL: 110 })],
    [0.04, wOwn({ torso: 22, afU: 92, afL: 0, abU: 45, abL: 120, lfU: 30, lfL: -20, lbU: -20 })], 0.05, 0.14),
  lungeStab: wAtk('pierce', { power: 1.2, damage: 10, height: 'mid', knock: 160, stun: 0.4, lunge: 300 }, [0.08, wOwn({ torso: -5, afU: 50, afL: 60, abU: 150, abL: 60, lfU: 20, lbU: -10 })],
    [0.05, wOwn({ torso: 20, afU: 90, afL: 0, abU: -60, abL: 20, lfU: 70, lfL: -70, lbU: -50, lbL: 0 })], 0.07, 0.2),
  riseStab: wAtk('pierce', { power: 1.3, damage: 9, height: 'high', knock: 80, launch: 480, kd: true }, [0.08, wOwn({ ...CROUCH, torso: 30, afU: -20, afL: 60, abU: 40, abL: 120 })],
    [0.05, wOwn({ torso: -10, afU: 135, afL: 45, abU: -30, abL: 60, lfU: 10, lfL: -5, lbU: -20, lbL: -10 })], 0.06, 0.24),
  slash: wAtk('slash', { power: 1.1, damage: 10, height: 'high', knock: 150, stun: 0.38 }, [0.08, wPose('jab', 0, 110)], [0.05, wPose('jab', 1, 0)], 0.06, 0.2),
  chop: wAtk('slash', { power: 1.4, damage: 13, height: 'mid', knock: 120, stun: 0.45 }, [0.1, wPose('hammer', 0, 30)], [0.06, wPose('hammer', 1, 10)], 0.07, 0.26),
  lowSlash: wAtk('slash', { power: 1, damage: 8, height: 'low', knock: 110, stun: 0.35, lunge: 80 }, [0.08, wPose('launcher', 0, 120)], [0.06, wPose('launcher', 0, 20)], 0.06, 0.22),
  swing: wAtk('blunt', { power: 1.2, damage: 9, height: 'high', knock: 200, stun: 0.4 }, [0.09, wPose('jab', 0, 100)], [0.06, wPose('jab', 1, -10)], 0.06, 0.22),
  smash: wAtk('blunt', { power: 1.5, damage: 12, height: 'mid', knock: 150, stun: 0.5, crumple: true }, [0.11, wPose('hammer', 0, 30)], [0.06, wPose('hammer', 1, 0)], 0.07, 0.28),
  // a low backhand swing at the shins, from high over the front shoulder
  lowSwing: wAtk('blunt', { power: 1.1, damage: 8, height: 'low', knock: 150, kd: true, launch: 150 }, [0.09, wOwn({ ...CROUCH, afU: 120, afL: 60, abU: 20, abL: 100 }, 140)],
    [0.06, wOwn({ ...CROUCH, torso: 30, afU: 20, afL: 0, abU: -20, abL: 90 }, 0)], 0.06, 0.24),
  // two-handed: a level swing from far back over the shoulder; an overhead slam from behind the head into a deep bow; a low sweep along the floor
  heavySwing: wAtk('2h', { power: 1.8, damage: 15, height: 'high', knock: 280, stun: 0.5 }, [0.16, wOwn({ torso: -15, afU: 120, afL: 100, abU: 110, abL: 110, lfU: 10, lbU: -20 }, 150)],
    [0.08, wOwn({ torso: 25, afU: 95, afL: 10, abU: 90, abL: 20, lfU: 35, lfL: -25, lbU: -30 }, -20)], 0.08, 0.32),
  slam: wAtk('2h', { power: 2, damage: 18, height: 'mid', knock: 100, launch: 200, kd: true, bounce: true }, [0.18, wOwn({ torso: -18, head: -10, afU: 185, afL: 40, abU: 180, abL: 45, lfU: 5, lbU: -5 }, 60)],
    [0.08, wOwn({ torso: 45, afU: 55, afL: 10, abU: 50, abL: 15, lfU: 55, lfL: -60, lbU: -35, lbL: -10 }, 10)], 0.1, 0.36),
  groundSwing: wAtk('2h', { power: 1.6, damage: 12, height: 'low', knock: 250, kd: true, launch: 150 }, [0.15, wOwn({ ...CROUCH, torso: 30, afU: -40, afL: 30, abU: -35, abL: 35 }, 160)],
    [0.08, wOwn({ ...CROUCH, torso: 35, afU: 60, afL: 5, abU: 55, abL: 10 }, 45)], 0.08, 0.3),
  // the staff in both hands (grip2): poke thrusts it level, whirl turns it a full circle (down behind, up and over into the strike), trip sweeps it low
  poke: wAtk('pole', { power: 1, damage: 7, height: 'mid', knock: 180, stun: 0.35, lunge: 120 }, [0.07, wPose('jab', 0, -52)], [0.05, wPose('jab', 1, 9)], 0.06, 0.18),
  whirl: wAtk('pole', { power: 1.3, damage: 10, height: 'high', knock: 200, stun: 0.4, wide: true }, [0.12, wPose('hammer', 0, -404)], [0.07, wPose('uppercut', 1, -394)], 0.07, 0.26),
  trip: wAtk('pole', { power: 1, damage: 7, height: 'low', knock: 60, launch: 150, kd: true }, [0.09, wPose('launcher', 0, 80)], [0.06, wPose('launcher', 0, -2)], 0.06, 0.24),
  // not attacks (P+G): crouch and reach, the hand closes on the handle at the grip key; wind up over the shoulder, the weapon leaves at the release key
  pickUp: { weapon: 'slash', keys: [
    { d: 0.16, e: 'outQuad', grip: true, p: { waist: 110, chest: 0, neck: 20, uarmF: -75, farmF: -5, handF: 0, weapon: 80, thighF: 85, shinF: -135, thighB: -25, shinB: -95 } },
    { d: 0.18, e: 'inOutCubic', p: null }] },
  weaponThrow: { weapon: 'slash', keys: [
    { d: 0.14, e: 'outQuad', p: wPose('overhand', 0, 140) },
    { d: 0.07, e: 'linear', release: true, p: wPose('overhand', 1, 20) },
    { d: 0.2, e: 'inOutCubic', p: null }] },
};
WEAPON_MOVES.whirl.keys[3].p = { weapon: -410 }; // recovers on round: a turn past the rest grip, not back the way it came
// classes: their moves on P, → P and ↓ P while a weapon of the class is held (a character's wbinds override them), and the weapon the editor shows
const WEAPON_CLASSES = {
  pierce: { weapon: 'dagger', binds: { punch: 'stab', fwdPunch: 'lungeStab', downPunch: 'riseStab' }, tip: 'One-handed pierce: quick stabs' },
  slash: { weapon: 'sword', binds: { punch: 'slash', fwdPunch: 'chop', downPunch: 'lowSlash' }, tip: 'One-handed slash: swings and chops' },
  blunt: { weapon: 'bat', binds: { punch: 'swing', fwdPunch: 'smash', downPunch: 'lowSwing' }, tip: 'One-handed blunt: knockback swings' },
  '2h': { weapon: 'hammer', binds: { punch: 'heavySwing', fwdPunch: 'slam', downPunch: 'groundSwing' }, tip: 'Two-handed: slow, crushing blows' },
  pole: { weapon: 'staff', binds: { punch: 'poke', fwdPunch: 'whirl', downPunch: 'trip' }, tip: 'Pole: long pokes, sweeps and trips' },
};
CHAR_DEFS.stick.moves = { ...CHAR_DEFS.stick.moves, ...WEAPON_MOVES };
// the weapon's bones on the front hand; nunchucks: the handle and the flailing stick (weaponTip) on a loose joint
function weaponBones(ch, type) {
  // no arms (a houndo, all fours): the nearest thing to a hand is a front leg's own tip instead of the root bone
  const w = WEAPONS[type], limb = ch.chains.arm.find(c => c[0].side === 'f') || ch.chains.arm[0] || ch.chains.leg.find(c => c[0].side === 'f') || ch.chains.leg[0];
  // a socket bone (front side first) is where the weapon goes; else the front hand
  const socket = ch.bones.find(b => b.shape === 'socket' && !b.hidden && b.side === 'f') || ch.bones.find(b => b.shape === 'socket' && !b.hidden);
  const parent = socket ? socket.id : limb ? limb[limb.length - 1].id : ch.bones[0].id;
  const b = { role: 'weapon', side: 'f', type, thick: 3, hurt: 0, lag: 0.3, react: 0.3, sway: 0 };
  // weaponTip dangle (see fighter.js: hangs toward gravity, the same mechanism a tail or scarf uses): the free end,
  // not gripped, hangs down at rest instead of staying rigid at its rest angle; whip still takes over during a swing
  if (w.chain) return [{ ...b, id: 'weapon', parent, len: Math.round(w.len / 2), a: w.a }, { ...b, id: 'weaponTip', parent: 'weapon', len: Math.round(w.len / 2), a: 0, lag: 2, stiff: 0.7, damp: 0.4, react: 2, whip: 0.045, dangle: 0.4 }];
  return [{ ...b, id: 'weapon', parent, len: w.len, a: w.a, back: w.back || 0 }];
}
