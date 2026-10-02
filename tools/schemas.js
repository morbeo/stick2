// hand-written descriptions of the data the MCP server takes: a character definition and a scenario (stick2://schema/…)
// Written from src/rig.js (BONE, makeCharacter, CHAR_STATS, GAIT_VARS), src/fighter.js, src/editor.js (MOVE_PROPS, MOVE_FLAGS) and src/brain.js.
const character = {
  about: 'A character definition: plain JSON, what makeCharacter (src/rig.js) compiles and the app exports as a character file. get_character shows a real one; '
    + 'create_character takes one, edit_character takes a JSON merge patch of one. Angles are degrees; a world angle of 0 points straight down, 90 forward (the way the fighter faces), 180 up.',
  fields: {
    name: 'string: the name (unique; a taken one gets a number on create)',
    bones: '[bone]: the skeleton, a tree. Parents may come in any order; the root (no parent) is the waist in the built-ins',
    poses: '{ stance (required), crouch, air, airFall, fall, lie }: each a pose. stance is the rest pose; bones it leaves out stay at their rest angle a',
    moves: '{ name: move }: every move, attacks and others (idle / walk loops, <state>Layer movement layers, taunts, win…)',
    hurt: '{ high: [pose], mid: [pose], low: [pose], … }: hit-reaction poses picked by where a blow lands',
    binds: '{ slot: move name }: input slots (punch, kick, fwdPunch, downKick, airPunch, qcfPunch, special, throw, …) over the default table (BINDS in src/rig.js), 2D plane',
    binds25: 'the same for the 2.5D planes (lanes, belt)',
    stances: '[{ name, key ("S+G" | "↓S+G" | "→S+G" | "←S+G"), pose, binds, binds25 }]: extra stances; pose and binds go over the main ones',
    motions: '{ name: numpad digits }: own special motions (m41236: "41236"); each makes slots <name>Punch and <name>Kick',
    weapon: 'string (optional): a WEAPONS type held from the start (dagger, sword, axe, bat, nunchucks, hammer, staff)',
    wbinds: '{ weaponClass: { slot: move } }: binds while holding a weapon of that class (pierce, slash, blunt, 2h, pole)',
    gait: '{ stride, lift, armSwing, lean, idle (auto | shift | bounce | sway | still), idleAmt, breath }: the procedural walk and idle, 1 = as built',
    stats: 'top-level numbers, each × some fight settings for this character only (1 = as the settings say): speed, dash, traction, turnaround, weight, jump, jumps (max jumps, integer), gravity, airSpeed, airAccel, fallSpeed, airDodge, airDash, health, tough, tempo, springs, grabRange',
  },
  bone: {
    id: 'string, unique', parent: 'bone id (omit for the root)', len: 'length px (default 10)', a: 'rest angle relative to the parent (root: to straight down)',
    role: 'spine | head | arm | leg | tail | weapon: decides breathing, walk cycle, hit reactions, which chains IK and moves use',
    side: "'f' | 'b' | '': front / back limb (back is drawn behind, in the second colour)", shape: 'line | circle (circle: centred on the end, radius = len)',
    thick: 'stroke width (default 5)', hurt: 'hurtbox radius (0 = cannot be hit here)', lag: 'follow-through: each step lowers its spring frequency',
    level: '0 = rigid child, 1 = keeps its rest world angle (feet stay flat)', stretch: 'lengthens while swinging fast (0.2 = up to +20%)',
    stiff: 'spring frequency ×', damp: 'damping ×', react: 'how hard blows jolt it', sway: 'idle drift', dangle: 'swings with the body (tails, scarves)',
    min: 'joint limit (shapes the IK solve)', max: 'joint limit', fx: 'drawing effect on the bone (see the editor)', hidden: 'not drawn',
  },
  pose: '{ boneId: angle }: each angle relative to its parent bone (root: to straight down). A key with p: null eases back to the stance',
  move: {
    keys: '[key] (required): the keyframes, played in order',
    power: 'number 0.2..3: makes it an attack (scales hit stop, shake, sparks; sped up by attackSpeed). No power = not an attack',
    damage: 'health taken (× damage setting); unset = power × 8', hit: 'bone id or [ids]: the striking bones (each its own hitbox)',
    height: 'high | shigh (overhead) | mid | smid | low', knock: 'knockback px/s', launch: 'upward speed on a knockdown px/s', stun: 'hitstun s (unset 0.4)',
    chip: 'damage fraction on block', stop: 'hit stop s', bstun: 'blockstun s', bpush: 'push on block px/s', juggle: 'juggle cost', range: 'setup distance px (gallery, tests)', reach: 'extra strike radius px',
    flags: 'booleans: kd (knockdown), air (jumping move), inv, special (normals cancel into it), otg, wide, crumple, wall, wallbounce, bounce, noAirGuard, launcher, roll, throw (a grab), counter',
    next: "{ input: move }: combo links in the cancel window ({ punch: 'cross', kick: 'kick', '6P': 'elbow' })",
    hits: "['stand' | 'crouch' | 'air']: which target states it can hit (unset = all)", shot: '{ look: ki | fire | dark | wave | star, speed, size, life }: the projectile of a shoot key',
    weapon: 'weapon class: played while holding one (arms the fighter)', lunge: 'forward push px/s', style: 'fighting style tag (grouping only)', fx: 'drawing effect while it plays', ref: 'layer moves: the pose they play from',
  },
  key: {
    d: 'duration s (required)', e: 'ease: step | linear | outQuad | outCubic | outExpo | inOutCubic | outBack | outElastic', p: 'pose or null (back to the stance)',
    active: 'strikes during this key', lunge: 'forward push px/s during it', cancel: 'the cancel window opens here (else after the last active key)', rehit: 'may hit again',
    shoot: 'fires the move\'s shot', turn: 'true = half turn over the key, 2 = a whole turn', unblock: 'cannot be blocked', inv: 'invincible during it', armor: 'takes hits without flinching',
    catch: 'counter window (catches a strike)', catchH: 'counter height', grip: 'weapon pick-up grip key', release: 'a held weapon or victim is let go here', warp: 'teleport', sound: 'whoosh …', shake: 'screen shake',
  },
};

const scenario = {
  about: 'A scenario: who fights whom and how (src/brain.js SCENARIOS; the World constructor in src/world.js). simulate takes a named one (list_scenarios) or one as JSON in scen.',
  fields: {
    a: "P1's controller: 'human' (the inputs you give simulate), 'ai', 'dummy' (stands still), or a script: an array of steps, or (in scen) macro text such as '0.2, 2P, 0.12, K'",
    b: "P2's controller, the same kinds",
    ax: 'P1 start x (the stage is 800 wide; walls at 20 and 780)', bx: 'P2 start x',
    more: "[{ c: controller, x, team, w: weapon held }]: extra fighters; the same team = allies (a and b are teams 0 and 1)",
    period: 'seconds before the scenario restarts (simulate stops there); 0 / unset = plays to a K.O.',
    chars: "[character names] per slot, the last fills the rest (simulate's chars argument overrides it)",
    cfg: '{ setting: value }: settings this scenario brings (plane, health …), over the session settings',
    aw: 'weapon P1 starts holding', bw: 'weapon P2 starts holding', items: "[{ type, x }]: weapons lying on the floor",
    waves: 'true: endless waves of enemies (Waves settings)', survival: 'true: one enemy after another (Survival settings)',
  },
  script: "Script steps: 'punch', 'down+kick', 'fwd+punch' (fwd / back are relative to the opponent) press now; a number waits that many seconds; "
    + "{ hold: 'fwd' | 'back' | 'guard' | 'down+guard' …, t } holds; '!punch' walks in and presses once idle; '@uppercut' forces a move. "
    + "Macro text (parseMacro): comma-separated; numpad digits are directions relative to the opponent (2 down, 3 down-forward, 6 forward, 4 back, 8 up), "
    + "P / K / S / G the buttons, a number with a dot waits ('0.2, 2, 3, 6P'), 'hold up 0.2' holds, words pass through ('down+fwd+punch').",
};
module.exports = { character, scenario };
