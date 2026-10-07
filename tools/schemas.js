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
    turnSnap: "mirrors to face right away when turning around, instead of squashing through the turn with the rest of the body (default: true for role 'head', false otherwise) - a second head, a tail, antennae...; set false on a 'head' bone to make it squash normally instead",
  },
  pose: '{ boneId: angle }: each angle relative to its parent bone (root: to straight down). A key with p: null eases back to the stance',
  move: {
    keys: '[key] (required): the keyframes, played in order',
    power: 'number 0.2..3: makes it an attack (scales hit stop, shake, sparks; sped up by attackSpeed). No power = not an attack',
    damage: 'health taken (× damage setting); unset = power × 8', hit: 'bone id or [ids]: the striking bones (each its own hitbox)',
    height: 'high | shigh (overhead) | mid | smid | low', knock: 'knockback px/s', launch: 'upward speed on a knockdown px/s', stun: 'hitstun s (unset 0.4)',
    chip: 'damage fraction on block', stop: 'hit stop s', bstun: 'blockstun s', bpush: 'push on block px/s', juggle: 'juggle cost', range: 'setup distance px (gallery, tests)', reach: 'extra strike radius px',
    flags: "booleans, each its own top-level field on the move (not nested under a 'flags' key): kd (knockdown), air (jumping move), inv, special (normals cancel into it), otg, wide, crumple, wall, wallbounce, bounce, noAirGuard, launcher, roll, throw (a grab)",
    counter: "a move name: what plays, on the attacker's own skeleton, when one of this move's keys catches a strike (key.catch/catchH). 'MIRROR' instead of a name plays the attacker's own connecting move right back at them, whatever it was",
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
    more: "[{ c: controller, x, team, w: weapon held }]: extra fighters; the same team = allies",
    aTeam: 'P1 team (default 0); bTeam: P2 team (default 1) — set either to ally them with each other or with a more entry',
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

const sound = {
  about: 'A sound preset (src/sound.js): a noise layer and/or a tone layer, each swept over an attack and a decay. save_sound takes a merge patch of this shape; list_sounds shows the built-ins to start from.',
  fields: {
    noise: "bandpass | lowpass | highpass | none: the noise layer's filter (none: no noise layer)", nf0: 'noise filter start frequency (Hz)', nf1: 'noise filter end frequency (Hz), swept over dur',
    ngain: 'noise layer volume 0-1', q: 'noise filter resonance (default 1): higher narrows and emphasises the band',
    tone: "sine | square | sawtooth | triangle | none: the tone layer's oscillator (none: no tone layer)", tf0: 'tone start frequency (Hz)', tf1: 'tone end frequency (Hz), swept over dur',
    tgain: 'tone layer volume 0-1', detune: 'tone pitch offset in cents (default 0; 100 = a semitone)',
    attack: 'ramp-up time in seconds before the decay starts (default 0: an instant hard onset)', dur: 'total length in seconds (required on a brand new sound)',
  },
};

const look = {
  about: 'A custom fx look preset (src/fx.js drawCustom): one generic particle effect. Built-in looks (fire, aura…) are hand-coded drawing, not this shape. save_look takes a merge patch of this shape.',
  fields: {
    count: 'particles spawned per point, looping', life: 'one particle\'s lifetime in seconds before it loops', speed: 'launch speed (px/s)',
    spread: 'random spread around the launch angle, in degrees', angle: 'launch angle in degrees (-90 = straight up, 0 = forward, along facing)',
    gravity: 'downward acceleration (px/s²); negative floats upward', size0: 'size at birth', size1: 'size at the end of its life (0 = shrinks to nothing)',
    shape: 'dot | line | ring', col: 'a default colour name (blue, cyan, red, orange, gold, purple, green, white, grey, dark); a move can still override it',
    back: 'true: draws behind the body (like aura, smoke) instead of in front',
  },
};

const track = {
  about: 'A tracker track (src/tracker.js): a simple step sequencer built from your own sounds. save_track takes a merge patch of this shape. There is no play tool over MCP (no speaker on this end).',
  fields: {
    bpm: 'tempo, beats per minute (a step is a 16th note)', steps: '8, 16 or 32 steps in the loop',
    rows: '[{ sound, cells }]: sound is a name from list_sounds; cells is one boolean per step (true: this row\'s sound plays on that step)',
  },
};
module.exports = { character, scenario, sound, look, track };
