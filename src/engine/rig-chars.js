'use strict';
// ---------- characters: input binds, stances, stats and makeCharacter (rig.js: bones; chars/stick.js: the base character) ----------
const HITS = { fh: 'handF', bh: 'handB', ff: 'footF', bf: 'footB' };
// which move each input slot triggers (a character's binds override these). 2D and 2.5D have separate tables:
// in 2D ↑ jumps (↑ with J / K in the jump squat is an up attack instead) and the air has its own ↑ / ↓ moves;
// in 2.5D (VF-style) Space jumps and every direction × button is a ground move.
// Directions in numpad terms (6 = towards the opponent): a diagonal without a move falls back to its vertical, then to neutral
// the inputs that switch stance (→ = toward the opponent); stances sharing a key are cycled, pressing it again goes back to main
const STANCE_KEYS = { 'S+G': 'S+G', '↓S+G': '↓ S+G', '→S+G': '→ S+G', '←S+G': '← S+G' };
// a stance's requirements (def.stances[i].req, over these): grounded / air = where it can be switched to; hpBelow / hpAbove: health
// fractions (at most / at least); cooldown: s after leaving it before it can be taken again; minT: s in it before leaving; maxT: s,
// then back to main (0 = no limit); exitOn: back to main when hit, knocked down, blocking or grabbed; once: once a round;
// moves: 'all' (its binds over main's), 'own' (only its own binds) or a list of the moves it allows
// auto: no key needed — taken the moment the other requirements allow it, and left the moment they stop holding (still bound by minT)
const STANCE_REQ = { grounded: true, air: false, hpBelow: 1, hpAbove: 0, cooldown: 0, minT: 0, maxT: 0, exitOn: [], once: false, moves: 'all', auto: false };
// switching into a stance (and back to main from it): springs = the springs chase the new pose; auto = the stance pose and the bone
// lengths blend over T frames (60 fps) with the ease; move = a keyframed transition move plays (move, or one named <from>To<To>)
// ease 'bezier' uses bz [x1, y1, x2, y2] (the key easing curve); each bone's morphDelay holds it back for part of the blend
const MORPH = { mode: 'springs', T: 12, ease: 'inOutCubic', move: '', grow: false };
// grow: the bones a stance switch adds or takes away, each with a delay by its depth among them (0 … 0.75 of the blend), so
// a new limb grows out of its parent bone joint by joint and a lost one pulls back in from the tip. from / to: bone lengths
function growDelays(ch, from, to) {
  const moving = id => (from[id] ?? 0) < 0.5 !== (to[id] ?? 0) < 0.5, depth = {}, out = {};
  const d = b => depth[b.id] ??= b.parent && ch.by[b.parent] && moving(b.parent) ? d(ch.by[b.parent]) + 1 : 0;
  const ids = ch.bones.filter(b => moving(b.id)).map(b => b.id); if (!ids.length) return null;
  const max = Math.max(...ids.map(id => d(ch.by[id])));
  for (const id of ids) { const g = (to[id] ?? 0) >= 0.5; out[id] = max ? 0.75 * (g ? depth[id] : max - depth[id]) / (max + 1) : 0; }
  return out;
}
// how far bone b is through morph m (0 … 1, eased)
// (grow: limbs that appear or vanish in the switch get their own delay down the chain, gd, unless the bone sets morphDelay)
function morphAt(m, b) {
  const d = clamp(b?.morphDelay || m.gd?.[b?.id] || 0, 0, 0.9), u = clamp((Math.min(1, m.t / m.T) - d) / (1 - d), 0, 1);
  return easeKey({ e: m.ease, bz: m.bz }, u);
}
// stance keys were K+G before K+G became the second throw
const stanceKey = k => (k || 'S+G').replace('K+G', 'S+G');
// a stance's keyframed idle / walk loop: the moves idle / walk for the main stance, craneIdle / craneWalk for a stance named crane
const loopName = (ch, i, kind) => i ? ch.stances[i].name + kind[0].toUpperCase() + kind.slice(1) : kind;
// a stance switch's transition move (morph mode move) unless the stance names its own: mainToCrane, craneToMain
const morphName = (from, to) => from + 'To' + to[0].toUpperCase() + to.slice(1);
// movement layers: a move named <state>Layer (per stance, like the loops) is keyframed on top of the procedural / IK pose while the
// fighter is in that state: [tip, how much of it shows (0..1) for a fighter f]
const LAYERS = {
  crouch: ['Crouching', f => +(!f.kd && f.grounded && (f.crouching || f.squatT > 0))],
  rise: ['Rising in a jump', f => +(!f.kd && !f.grounded && !f.st.fly && !f.flip && f.vy <= 0 && f.wallJumpT <= 0)],
  fall: ['Falling from a jump', f => +(!f.kd && !f.grounded && !f.st.fly && !f.flip && f.vy > 0 && f.wallJumpT <= 0)],
  fly: ['Hovering or flying (a fly stance, see stance.fly)', f => +(!f.kd && !f.grounded && f.st.fly)],
  flip: ['A ninja flip', f => +(!f.kd && !f.grounded && !!f.flip)],
  run: ['Running', f => +(!f.kd && f.grounded && f.running && f.dashT <= 0)],
  dash: ['A forward dash', f => +(f.dashT > 0 && f.vx * f.dir > 0)],
  backDash: ['A back dash', f => +(f.dashT > 0 && f.vx * f.dir < 0)],
  backWalk: ['Walking backward, by how fast', f => !f.kd && f.grounded && f.dashT <= 0 && !f.crouching && f.vx * f.dir < 0 ? Math.min(1, -f.vx * f.dir / f.c('maxSpeed')) : 0],
  airDash: ['An air dash', f => +(f.airDashT > 0)],
  wallJump: ['A wall jump: kicking off the wall', f => +(f.wallJumpT > 0)],
  guard: ['Guarding (and in blockstun)', f => +f.guarding],
  hurt: ['Hit: the hit reaction, until free', f => +(f.hurtT > 0 && !f.kd && !f.guarding && f.dizzyT <= 0)],
  tumble: ['Knocked into the air: the tumble', f => +(!!f.kd && f.kd !== 'down')],
  lying: ['Lying on the floor', f => +(f.kd === 'down')],
  dizzy: ['Dizzy', f => +(f.dizzyT > 0)],
  turn: ['Turning around, by how far through the turn', f => 1 - Math.abs(f.face)],
};
const BINDS = { punch: 'jab', kick: 'kick', fwdPunch: 'elbow', fwdKick: 'pushKick', backPunch: 'palms', backKick: 'fadeKick',
  upPunch: 'hammer', upKick: 'turnKick', upFwdPunch: 'headbutt', upFwdKick: 'flyingKnee', upBackPunch: 'backfist', upBackKick: 'crescent',
  downPunch: 'launcher', downKick: 'sweep', downFwdPunch: 'bodyBlow', downFwdKick: 'lowKick', downBackPunch: 'crouchJab', downBackKick: 'backSweep',
  dashPunch: 'dashPunch', airPunch: 'airPunch', airKick: 'airKick', airUpPunch: 'airUpper', airUpKick: 'airFlipKick', airDownPunch: 'airHammer', airDownKick: 'diveKick', throw: 'grab', throw2: 'clinch', backThrow: 'backGrab', airThrow: 'airGrab',
  qcfPunch: 'rush', dpPunch: 'rising', qcbKick: 'spin', qcfKick: 'stomp', qcbPunch: 'charge', dpKick: 'risingKick',
  special: 'palmShot', fwdSpecial: 'shoulderCharge', backSpecial: 'catch', upSpecial: 'jumpKick', downSpecial: 'groundPunch', airSpecial: 'airSpin' };
const BINDS_25 = { punch: 'jab', kick: 'kick', fwdPunch: 'elbow', fwdKick: 'pushKick', backPunch: 'palms', backKick: 'fadeKick',
  upPunch: 'hammer', upKick: 'turnKick', upFwdPunch: 'headbutt', upFwdKick: 'flyingKnee', upBackPunch: 'backfist', upBackKick: 'crescent',
  downPunch: 'launcher', downKick: 'sweep', downFwdPunch: 'bodyBlow', downFwdKick: 'lowKick', downBackPunch: 'crouchJab', downBackKick: 'backSweep',
  dashPunch: 'dashPunch', airPunch: 'airPunch', airKick: 'airKick', airUpPunch: 'airUpper', airUpKick: 'airFlipKick', airDownPunch: 'airHammer', airDownKick: 'diveKick', throw: 'grab', throw2: 'clinch', backThrow: 'backGrab', airThrow: 'airGrab',
  qcfPunch: 'rush', dpPunch: 'rising', qcbKick: 'spin', qcfKick: 'stomp', qcbPunch: 'charge', dpKick: 'risingKick',
  special: 'palmShot', fwdSpecial: 'shoulderCharge', backSpecial: 'catch', upSpecial: 'jumpKick', downSpecial: 'groundPunch', airSpecial: 'airSpin' };
// the table of a plane and where a character keeps its own binds for it
const slotsOf = plane => plane === '2d' ? BINDS : BINDS_25;
const bindsKey = plane => plane === '2d' ? 'binds' : 'binds25';
// specials by name, each with its on/off setting, and the input that plays it in each specialScheme:
// a motion name (MOTIONS) + S, 7S / 1S = S with a diagonal held (numpad), G4 / G6 = ← / → pressed while guarding,
// b… = pressed in blockstun (bP, bK, b6S = → S, b4S = ← S); taunt is on ↑ S+G and pounce on ↓ S in the air in both
const SPECIALS = { rollFwd: 'rolls', rollBack: 'rolls', teleport: 'teleport', guardCancel: 'guardCancel', pushBlock: 'pushBlock', catchHigh: 'counters', catchLow: 'counters', taunt: 'taunt', pounce: 'pounce', turnBack: 'turnBack' };
const SPECIAL_SCHEMES = {
  guard: { rollFwd: 'G6', rollBack: 'G4', teleport: 'dd', turnBack: '9S', guardCancel: 'bP', pushBlock: 'bK', catchHigh: '7S', catchLow: '1S' },
  motion: { rollFwd: 'qcf', rollBack: 'qcb', teleport: 'dp', turnBack: '9S', guardCancel: 'b6S', pushBlock: 'b4S', catchHigh: 'dd', catchLow: '1S' },
};
// special motions in numpad notation (6 = towards the opponent), matched in order against the recent directions
const MOTIONS = { dp: /6.*2.*3/, qcf: /2.*3.*6/, qcb: /2.*1.*4/, dd: /252/ };
// a character's own motions (def.motions: name → numpad digits, e.g. m41236: '41236'), tried before the built-in ones, longest first;
// each makes two input slots, name + Punch / Kick
const customMotions = def => Object.fromEntries(Object.entries(def.motions || {}).sort((a, b) => b[1].length - a[1].length).map(([k, d]) => [k, new RegExp(d.split('').join('.*'))]));
// whole-character stats: each multiplies some fight settings for this character only (1 = as the settings say); g = its group
const CHAR_STATS = [
  { k: 'speed', g: 'ground', cfg: ['maxSpeed'], min: 0.5, max: 1.6, step: 0.05, tip: 'Walk speed, × maxSpeed (runs too). Heavy bodies feel right a little slower.' },
  { k: 'dash', g: 'ground', cfg: ['dashSpeed'], min: 0.5, max: 1.8, step: 0.05, tip: 'Dash speed, × dashSpeed.' },
  { k: 'traction', g: 'ground', cfg: ['decel'], min: 0.3, max: 2, step: 0.05, tip: 'Grip on the floor, × decel: low = slides on when it stops, is hit or lunges; high = stops dead.' },
  { k: 'turnaround', g: 'ground', cfg: ['turnSpeed'], min: 0.3, max: 3, step: 0.05, tip: 'How fast it turns to face the other way, × turnSpeed. Slow turners are open to cross-ups.' },
  { k: 'weight', g: 'ground', cfg: [], min: 0.5, max: 2, step: 0.05, tip: 'Heavier bodies are pushed and launched less: knockback, block push and launch ÷ weight.' },
  { k: 'jump', g: 'air', cfg: ['jumpVel'], f: (v, s) => v * Math.sqrt(s.jump * s.gravity), min: 0.5, max: 2, step: 0.05, tip: 'Jump height, × the height jumpVel and gravity give (whatever its gravity).' },
  { k: 'jumps', g: 'air', cfg: [], min: -1, max: 5, step: 1, tip: 'Max jumps: 2 = a double jump (jump again in the air), and so on. -1 = infinite air jumps.' },
  { k: 'gravity', g: 'air', cfg: ['gravity'], min: 0.4, max: 2, step: 0.05, tip: 'Its gravity, × gravity: high = snappy short jumps (jump height stays), low = floaty.' },
  { k: 'airSpeed', g: 'air', cfg: ['airSpeed'], min: 0.3, max: 2, step: 0.05, tip: 'Top drift speed in the air, × airSpeed.' },
  { k: 'airAccel', g: 'air', cfg: ['airAccel'], min: 0, max: 3, step: 0.05, tip: 'Air control, × airAccel: how fast the drift turns around.' },
  { k: 'fallSpeed', g: 'air', cfg: ['fallSpeed'], min: 0.5, max: 2, step: 0.05, tip: 'Top falling speed and fast-fall speed, × fallSpeed.' },
  { k: 'airDodge', g: 'air', cfg: ['airDodge'], min: 0, max: 2, step: 0.05, tip: 'Air dodge length, × airDodge (0 = cannot air dodge).' },
  { k: 'airDash', g: 'air', cfg: ['airDash'], min: 0, max: 2, step: 0.05, tip: 'Air dash speed, × airDash (0 = cannot air dash).' },
  { k: 'health', g: 'fight', cfg: ['health'], min: 0.5, max: 2, step: 0.05, tip: 'Health, × the health setting.' },
  { k: 'tough', g: 'fight', cfg: ['staggerAt', 'dizzyAt'], min: 0.5, max: 2, step: 0.05, tip: 'Toughness: blows needed to stagger it and damage to make it dizzy, × staggerAt and dizzyAt.' },
  { k: 'tempo', g: 'fight', cfg: ['attackSpeed'], min: 0.6, max: 1.5, step: 0.05, tip: 'How fast its moves play, × attackSpeed.' },
  { k: 'springs', g: 'fight', cfg: ['freq'], min: 0.4, max: 2, step: 0.05, tip: 'Limb spring frequency, × freq: above 1 snappy, below 1 floppy.' },
  { k: 'grabRange', g: 'fight', cfg: ['grabReach'], min: 0, max: 3, step: 0.05, tip: 'Throw reach, × grabReach.' },
  { k: 'chip', g: 'fight', cfg: ['chip'], min: 0, max: 2, step: 0.05, tip: 'Chip damage it takes through guard, × chip.' },
  { k: 'blockPush', g: 'fight', cfg: ['blockPush'], min: 0, max: 2, step: 0.05, tip: 'Pushback it takes on block, × blockPush.' },
  { k: 'comboDamage', g: 'fight', cfg: ['comboDamage'], min: 0.5, max: 1.5, step: 0.05, tip: 'Damage it takes, scaling per extra combo hit, × comboDamage.' },
  { k: 'knockScale', g: 'fight', cfg: ['knockScale'], min: 0, max: 2, step: 0.05, tip: 'Knockback it takes, × knockScale (on top of weight).' },
  { k: 'justGuardKnock', g: 'fight', cfg: ['justGuardKnock'], min: 0, max: 2, step: 0.05, tip: 'How hard its own just guard (JUST) pushes back the attacker, × justGuardKnock.' },
  { k: 'pushBlockForce', g: 'fight', cfg: ['pushBlockForce'], min: 0, max: 2, step: 0.05, tip: 'How hard its own push block shoves the attacker away, × pushBlockForce.' },
];
const STAT_GROUPS = { ground: 'Ground: walking, dashing, turning, weight', air: 'Air: jumps, gravity, drift, falling, air dodge and air dash', fight: 'Fight: health, toughness, tempo, limb springs, grab range' };
// walk and idle, per character: the procedural cycle's knobs (moves named idle / walk, if any, replace it with keyframed loops)
const GAIT_VARS = [
  { k: 'stride', v: 1, min: 0, max: 2, step: 0.05, tip: 'How far the legs swing walking.' },
  { k: 'swing', v: 0, min: -0.5, max: 0.5, step: 0.05, tip: 'Step balance: 0 = each foot goes as far forward as back; + steps more in front of the body, − more behind.' },
  { k: 'stepCenter', v: 0, min: 0, max: 1, step: 0.05, tip: 'Where the steps are centred: 0 = around the foot\'s spot in the stance (a wide stance walks wide), 1 = under the hip.' },
  { k: 'backStride', v: 0.7, min: 0.2, max: 1.5, step: 0.05, tip: 'Walking backwards: its steps (and speed of the cycle) × this.' },
  { k: 'lift', v: 1, min: 0, max: 2.5, step: 0.05, tip: 'How high the foot lifts on the way forward each step.' },
  { k: 'armSwing', v: 1, min: 0, max: 2.5, step: 0.05, tip: 'How much the arms counter-swing the legs.' },
  { k: 'lean', v: 1, min: -2, max: 3, step: 0.1, tip: 'Torso lean into the walking direction.' },
  { k: 'idle', v: 'auto', opts: ['auto', 'shift', 'bounce', 'sway', 'still'], tip: 'Idle style: weight shift, boxer bounce, sway or still; auto picks one per fighter.',
    optTips: { auto: 'Each fighter picks one of the styles', shift: 'Shifts its weight from foot to foot', bounce: 'Bounces on its toes like a boxer', sway: 'Sways side to side', still: 'Stands still' } },
  { k: 'airKick', v: 1, min: 0, max: 3, step: 0.05, tip: 'In the air: how much the legs keep cycling (a loose run in the air), 0 = held in the air pose.' },
  { k: 'airDrag', v: 1, min: 0, max: 3, step: 0.05, tip: 'In the air: how far the legs trail behind the body\'s drift.' },
  { k: 'airReach', v: 1, min: 0, max: 3, step: 0.05, tip: 'In the air: how much the legs straighten to reach for the floor as it comes up.' },
  { k: 'idleAmt', v: 1, min: 0, max: 3, step: 0.05, tip: 'Strength of the idle motion.' },
  { k: 'breath', v: 1, min: 0, max: 3, step: 0.1, tip: 'Breathing: the chest and arms rise and fall.' },
];
const STAT_OF = Object.fromEntries(CHAR_STATS.flatMap(s => s.cfg.map(k => [k, s])));
function makeCharacter(def) {
  def = JSON.parse(JSON.stringify(def)); // the caller's definition stays untouched (it is what gets edited and saved)
  // main's own body (def.main.body, see bodyDef) becomes the character's actual body; other stances' own body
  // overrides then vary from this one, same as they'd vary from the character as authored when main has none.
  // body is dropped once applied so a variant recompiled from this (already-baked) def doesn't apply it twice
  if (def.main?.body) { def = bodyDef(def, def.main.body); delete def.main.body; }
  const by = {}, order = [];
  for (const b of def.bones) by[b.id] = { ...BONE, parent: null, ...b };
  expandChains(by);
  for (const b of Object.values(by)) if (b.shape === 'socket') b.hurt = 0;
  applyHidden(Object.values(by));
  const visit = b => { if (order.includes(b)) return; if (b.parent) visit(by[b.parent]); order.push(b); };
  Object.values(by).forEach(visit); // parents before children
  for (const b of order) {
    const pb = by[b.parent];
    b.restW = (pb ? pb.restW : 0) + b.a;
    b.fwd = Math.cos(b.restW * R) >= 0 ? 1 : -1; // + moves the end forward for bones hanging down, back for bones pointing up
    b.flex = b.min !== undefined && Math.abs(b.min) > Math.abs(b.max) ? -1 : 1; // the way the joint bends furthest
    b.kids = order.filter(k => k.parent === b.id);
  }
  // rough rotational inertia: everything hanging off a bone has to turn with it
  for (const b of [...order].reverse()) {
    b.mass = b.len + b.kids.reduce((s, k) => s + k.mass, 0);
    b.inertia = (b.mass + 30) ** 2 / 3;
  }
  // limb chains per role: start where the parent has another role, follow the first child of the same role
  // (a stance body's hidden bones are in no chain: no walk, swing or trail)
  const chains = { spine: [], head: [], arm: [], leg: [], tail: [], weapon: [] };
  for (const b of order) if (!b.hidden && b.shape !== 'socket' && (!b.parent || by[b.parent].role !== b.role)) {
    const c = [b];
    for (let k; (k = c[c.length - 1].kids.find(k => k.role === b.role && !k.hidden && k.shape !== 'socket'));) c.push(k);
    chains[b.role].push(c);
    for (const r of b.also || []) (chains[r] ??= []).push(c);
  }
  const rest = Object.fromEntries(order.map(b => [b.id, b.a]));
  const ch = { name: def.name, bones: order, by, ids: order.map(b => b.id), chains, aims: order.some(b => b.aim > 0), cons: order.some(b => by[b.follow] && b.follow !== b.id || by[b.reach] && b.reach !== b.id && b.parent),
    tips: [...chains.arm, ...chains.leg, ...chains.head, ...chains.tail, ...chains.weapon].map(c => c[c.length - 1]),
    poses: { ...def.poses, stance: { ...rest, ...def.poses.stance } }, moves: def.moves, hurt: def.hurt, motions: customMotions(def), binds: { ...BINDS, ...def.binds }, binds25: { ...BINDS_25, ...def.binds25 },
    stats: Object.fromEntries(CHAR_STATS.map(s => [s.k, def[s.k] ?? 1])), gait: { ...Object.fromEntries(GAIT_VARS.map(s => [s.k, s.v])), ...def.gait },
    shadow: { ...SHADOW, ...def.shadow },
    // a character's own colour (def.col, a hex string), the back-limb shade tinted from it; unset: the fight assigns one
    // by player slot instead (P1 black, P2 red…, see COLS in world.js), same as every character before this existed
    col: def.col ? [def.col, tint(def.col, 0.6)] : null };
  // stances: main (index 0) plus any extra; each has its pose, its own binds over the main ones, the key that switches to it and
  // its requirements (STANCE_REQ; req.moves 'own': only its own binds, a list: only those moves) and its transition (MORPH)
  // hipH: off the floor anchor, the hip sits hipH px above the floor and the feet may leave it (a boxer's shuffle, a hop on
  // one foot); null = the body's lowest point stands on the floor
  // fly: the stance hovers instead of falling — ↑ / ↓ fly up / down, gravity and landing are suspended while in it
  // main is a stance like the others, just with no key and no body/req/morph of its own unless def.main sets them (main: true marks it)
  const binds = (s, k) => { const m = s.req?.moves, b = m === 'own' ? { ...s[k] } : { ...ch[k], ...s[k] };
    return Array.isArray(m) ? Object.fromEntries(Object.entries(b).filter(([, n]) => m.includes(n))) : b; };
  const mainS = def.main || {};
  ch.stances = [{ name: 'main', pose: ch.poses.stance, binds: binds(mainS, 'binds'), binds25: binds(mainS, 'binds25'),
      req: { ...STANCE_REQ, ...mainS.req }, morph: { ...MORPH, ...mainS.morph }, fly: !!mainS.fly, hipH: mainS.hipH ?? null, main: true },
    ...(def.stances || []).map(s => ({ name: s.name, key: stanceKey(s.key), pose: { ...ch.poses.stance, ...s.pose }, binds: binds(s, 'binds'), binds25: binds(s, 'binds25'),
      req: { ...STANCE_REQ, ...s.req }, morph: { ...MORPH, ...s.morph }, fly: !!s.fly, hipH: s.hipH ?? null, main: false }))];
  // armed (see armed): the weapon class's binds go over every stance's, where the move exists
  ch.def = def;
  if (def.weapon) {
    const cls = WEAPONS[def.weapon].cls, wb = Object.fromEntries(Object.entries({ ...WEAPON_CLASSES[cls].binds, ...def.wbinds?.[cls] }).filter(([, n]) => def.moves[n]));
    ch.weapon = def.weapon;
    for (const s of ch.stances) { s.binds = { ...s.binds, ...wb }; s.binds25 = { ...s.binds25, ...wb }; }
  }
  // the cancel window opens at a key marked cancel, else after the last active key
  for (const m of Object.values(ch.moves)) { const c = m.keys.findIndex(k => k.cancel); m.cancel = c >= 0 ? c : m.keys.findLastIndex(k => k.active) + 1; SHARED.add(m); }
  // the body's extent behind and in front of x (torso and legs in the stance): fighters are pushed apart where these meet
  const L = fk(ch, ch.poses.stance, 1), xs = ch.bones.filter(b => b.role === 'spine' || b.role === 'leg').map(b => L[b.id][0]);
  ch.extent = [Math.max(19, 2 - Math.min(0, ...xs)), Math.max(19, 2 + Math.max(0, ...xs))];
  SHARED.add(ch);
  return ch;
}
// hit: one striking bone or a list of them (both fists, a kick and the tail…); each is its own hitbox
const hitIds = m => m?.hit ? [].concat(m.hit) : [];
const mapHit = (h, f) => Array.isArray(h) ? h.map(f) : f(h);
const oldMove = m => ({ ...m, hit: mapHit(m.hit, h => HITS[h] || h), keys: m.keys.map(k => ({ ...k, p: fromOld(k.p) })), ...(m.holdPose ? { holdPose: fromOld(m.holdPose) } : {}) });
const mapVals = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
// built-in definitions by name: chars/stick.js, then each file in chars/index.json, adds its own
const CHAR_DEFS = {};
