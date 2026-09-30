'use strict';
// ---------- rig: a character is a tree of bones; walking, hurtboxes, trails and ground contact derive from it ----------
// angles in degrees. world angle 0 = straight down, 90 = forward (facing dir), 180 = up.
// a pose maps bone id -> angle relative to the parent bone (root bones: relative to straight down).
const R = Math.PI / 180;
const BONE = {
  len: 10, a: 0,       // length (px) and rest angle
  role: 'tail',        // spine | head | arm | leg | tail: decides breathing, walk cycle, hit reactions
  side: '',            // f | b | '': front / back limb (back is drawn behind, in the second colour)
  shape: 'line',       // line | circle (circle is centred on the bone's end, radius = len)
  thick: 5, hurt: 0,   // stroke width; hurtbox radius (0 = can't be hit here)
  lag: 1,              // follow-through: each step lowers the spring frequency, so the bone trails its parent
  level: 0,            // 0 = rigid child, 1 = keeps its rest world angle whatever the parent does (feet stay flat)
  stretch: 0,          // how much the bone lengthens while swinging fast (0.2 = up to +20%)
  stiff: 1, damp: 1,   // multipliers on the spring frequency / damping
};

// ---------- the default stick fighter ----------
const limb = s => [
  { id: 'thigh' + s, len: 22, role: 'leg', side: s.toLowerCase(), hurt: 8, lag: 0, min: -100, max: 140 },
  { id: 'shin' + s, parent: 'thigh' + s, len: 23, role: 'leg', side: s.toLowerCase(), hurt: 8, lag: 1, min: -165, max: 8 },
  { id: 'foot' + s, parent: 'shin' + s, len: 7, a: 90, role: 'leg', side: s.toLowerCase(), hurt: 6, lag: 1.5, level: 1, thick: 4, min: 40, max: 140 },
  { id: 'uarm' + s, parent: 'chest', len: 17, a: -180, role: 'arm', side: s.toLowerCase(), lag: 1, min: -250, max: -10 },
  { id: 'farm' + s, parent: 'uarm' + s, len: 13, role: 'arm', side: s.toLowerCase(), lag: 2, min: -10, max: 165 },
  { id: 'hand' + s, parent: 'farm' + s, len: 4, role: 'arm', side: s.toLowerCase(), lag: 2.5, thick: 6, min: -70, max: 70 },
];
const STICK_BONES = [
  { id: 'waist', len: 14, a: 180, role: 'spine', hurt: 12, lag: 0, min: 120, max: 300 },
  { id: 'chest', parent: 'waist', len: 20, role: 'spine', hurt: 12, lag: 0.5, min: -40, max: 40 },
  { id: 'neck', parent: 'chest', len: 5, role: 'head', hurt: 12, lag: 1, level: 0.5, min: -45, max: 45 },
  { id: 'head', parent: 'neck', len: 8, role: 'head', shape: 'circle', hurt: 12, lag: 1, min: -50, max: 50 },
  ...limb('F'), ...limb('B'),
];

// The built-in poses and moves are written in the original 10-joint notation and mapped onto the bones by fromOld:
// torso: lean fwd. head: tilt fwd. arms (a{f,b}{U,L}) relative to torso, + swings forward / flexes elbow.
// legs (l{f,b}U) are world angles from straight down, + forward; l{f,b}L relative, − bends the knee.
function fromOld(o) {
  if (!o) return o;
  const p = {};
  if ('torso' in o) {
    const t = o.torso;
    p.waist = 180 - t; p.chest = 0;
    p.neck = (clamp(t, -25, 25) - t) * 0.5;     // the neck's level already half-follows small leans; cap big ones
  }
  if ('head' in o) p.head = -o.head;
  for (const s of ['f', 'b']) {
    const S = s.toUpperCase(), m = { [`a${s}U`]: 'uarm', [`a${s}L`]: 'farm', [`l${s}U`]: 'thigh', [`l${s}L`]: 'shin' };
    for (const k in m) if (k in o) p[m[k] + S] = o[k] - (m[k] === 'uarm' ? 180 : 0);
  }
  return p;
}
const STANCE = { torso: 8, head: 0, afU: 35, afL: 115, abU: 15, abL: 125, lfU: 25, lfL: -25, lbU: -18, lbL: 0 };
const CROUCH = { torso: 22, lfU: 60, lfL: -110, lbU: -10, lbL: -70 };
const AIR = { torso: 4, lfU: 55, lfL: -95, lbU: -10, lbL: -45, afU: 55, afL: 95, abU: 40, abL: 100 };
const AIR_FALL = { torso: 6, lfU: 28, lfL: -35, lbU: -18, lbL: -20, afU: 75, afL: 60, abU: 65, abL: 70 };
const FALL = { torso: -55, head: -20, afU: 140, afL: 30, abU: 110, abL: 50, lfU: 60, lfL: -50, lbU: 30, lbL: -30 };
const LIE = { torso: -92, head: 0, afU: 150, afL: 15, abU: 30, abL: 20, lfU: 88, lfL: -8, lbU: 78, lbL: -25 };

// the common attack shape: anticipation -> strike -> hold (both active) -> recover
const attack = (o, [ad, ap], [sd, sp], hd, rd) => ({ ...o, keys: [
  { d: ad, e: 'outQuad', p: ap },
  { d: sd, e: 'outExpo', p: sp, active: true, lunge: o.lunge },
  { d: hd, p: sp, active: true },
  { d: rd, e: 'inOutCubic', p: null },
] });
// keys: d = duration (s), e = easing, p = partial pose (null = back to base). hit = striking joint.
// next = chain targets, usable once the active frames are over.
const STICK_MOVES = {
  jab: attack({ power: 1, hit: 'fh', height: 'high', knock: 120, stun: 0.32, next: { punch: 'cross', kick: 'kick' } },
    [0.06, { torso: 0, afU: 10, afL: 135, abU: 30 }],
    [0.05, { torso: 18, afU: 98, afL: 0, abU: -15, abL: 130 }], 0.06, 0.16),
  cross: attack({ power: 1.1, hit: 'bh', height: 'high', knock: 140, stun: 0.36, lunge: 120, next: { punch: 'uppercut', kick: 'roundhouse' } },
    [0.06, { torso: 4, abU: 5, abL: 140, afU: 40, afL: 120 }],
    [0.05, { torso: 26, abU: 112, abL: 0, afU: 20, afL: 130, lbU: -28, lbL: 0, lfU: 30 }], 0.07, 0.18),
  // custom shape: the strike drives forward into the body, the follow-through rises
  uppercut: { power: 1.6, hit: 'fh', height: 'high', knock: 120, launch: 520, kd: true, keys: [
    { d: 0.08, e: 'outQuad', p: { torso: 28, afU: -10, afL: 90, abU: 40, abL: 120, lfU: 45, lfL: -70, lbU: -25, lbL: -30 } },
    { d: 0.06, e: 'outExpo', p: { torso: 20, afU: 115, afL: 50, abU: 0, abL: 130, lfU: 30, lfL: -25, lbU: -22, lbL: 0 }, active: true, lunge: 220 },
    { d: 0.09, e: 'outQuad', p: { torso: 6, afU: 150, afL: 35, abU: 0, abL: 130, lfU: 22, lfL: -10, lbU: -22, lbL: 0 }, active: true },
    { d: 0.26, e: 'inOutCubic', p: null },
  ] },
  kick: attack({ power: 1.3, hit: 'ff', height: 'mid', knock: 200, stun: 0.4, next: { kick: 'roundhouse', punch: 'cross' } },
    [0.09, { torso: -5, lfU: 75, lfL: -120, afU: 20, abU: 40 }],
    [0.07, { torso: -28, lfU: 100, lfL: -5, lbU: -10, lbL: 0, afU: -10, afL: 60, abU: 60 }], 0.08, 0.22),
  roundhouse: attack({ power: 1.7, hit: 'bf', height: 'high', knock: 380, launch: 280, kd: true, lunge: 160 },
    [0.09, { torso: -8, lbU: 30, lbL: -120, lfU: 5, lfL: -10, afU: 50, afL: 100, abU: -20, abL: 80 }],
    [0.07, { torso: -32, lbU: 118, lbL: -8, lfU: 2, lfL: 0, afU: -20, afL: 60, abU: 70, abL: 40 }], 0.09, 0.26),
  sweep: attack({ power: 1.2, hit: 'ff', height: 'low', knock: 150, launch: 250, kd: true },
    [0.07, { torso: 30, lbU: -5, lbL: -120, lfU: 40, lfL: -110, afU: -20, afL: 60, abU: -30, abL: 40 }],
    [0.08, { torso: 40, lfU: 84, lfL: -2, lbU: 10, lbL: -125, afU: -40, afL: 30, abU: -50, abL: 30 }], 0.08, 0.24),
  dashPunch: attack({ power: 1.4, hit: 'fh', height: 'mid', knock: 380, stun: 0.5, lunge: 450, next: { punch: 'uppercut' } },
    [0.05, { torso: 10, afU: 20, afL: 130 }],
    [0.06, { torso: 30, afU: 110, afL: 0, abU: -40, abL: 60, lfU: 50, lfL: -40, lbU: -40, lbL: 0 }], 0.12, 0.22),
  airKick: attack({ power: 1.3, hit: 'ff', height: 'high', knock: 250, stun: 0.4, air: true },
    [0.06, { torso: -10, lfU: 60, lfL: -110, lbU: 10, lbL: -100 }],
    [0.06, { torso: -25, lfU: 70, lfL: -3, lbU: -5, lbL: -90, afU: 40, afL: 90, abU: 60, abL: 60 }], 0.25, 0.15),
  airPunch: attack({ power: 1.1, hit: 'fh', height: 'high', knock: 160, stun: 0.36, air: true, next: { kick: 'airKick' } },
    [0.05, { torso: 5, afU: 150, afL: 60 }],
    [0.06, { torso: 25, afU: 75, afL: 0, abU: -20, abL: 120 }], 0.12, 0.15),
  // specials (motion + button), cancellable from normals that hit
  rush: attack({ power: 1.5, hit: 'fh', height: 'mid', knock: 320, stun: 0.5, lunge: 520, special: true },
    [0.08, { torso: 4, afU: 10, afL: 140, abU: 40, abL: 120, lfU: 40, lfL: -60 }],
    [0.05, { torso: 32, afU: 105, afL: 0, abU: -30, abL: 70, lfU: 55, lfL: -30, lbU: -45, lbL: 0 }], 0.1, 0.26),
  // invincible while it rises
  rising: { power: 1.8, hit: 'fh', height: 'high', knock: 100, launch: 680, kd: true, special: true, keys: [
    { d: 0.05, e: 'outQuad', p: { torso: 30, afU: -20, afL: 100, abU: 40, abL: 120, lfU: 55, lfL: -90, lbU: -25, lbL: -40 }, inv: true },
    { d: 0.06, e: 'outExpo', p: { torso: 10, afU: 150, afL: 20, abU: 0, abL: 130, lfU: 20, lfL: -10, lbU: -20, lbL: 0 }, active: true, lunge: 160, inv: true },
    { d: 0.1, e: 'outQuad', p: { torso: 0, afU: 170, afL: 10, abU: -10, abL: 130, lfU: 15, lfL: -5, lbU: -20, lbL: 0 }, active: true },
    { d: 0.34, e: 'inOutCubic', p: null },
  ] },
  spin: attack({ power: 1.9, hit: 'bf', height: 'high', knock: 420, launch: 320, kd: true, lunge: 260, special: true },
    [0.1, { torso: -12, lbU: 40, lbL: -130, lfU: 0, lfL: -15, afU: 60, afL: 90, abU: -30, abL: 70 }],
    [0.07, { torso: -36, lbU: 120, lbL: -5, lfU: 0, lfL: 0, afU: -30, afL: 50, abU: 80, abL: 30 }], 0.1, 0.3),
  // hits a fighter lying on the floor
  stomp: attack({ power: 1.1, hit: 'ff', height: 'low', knock: 60, launch: 240, kd: true, otg: true, special: true },
    [0.08, { torso: -5, lfU: 80, lfL: -120, afU: 50, abU: 30 }],
    [0.06, { torso: 12, lfU: 42, lfL: -4, lbU: -15, lbL: 0, afU: 20, abU: 60 }], 0.08, 0.2),
  getup: { inv: true, keys: [
    { d: 0.18, e: 'outCubic', p: { torso: -30, head: 10, lfU: 75, lfL: -130, lbU: 60, lbL: -140, afU: -40, afL: 20, abU: -60, abL: 10 } },
    { d: 0.16, e: 'outCubic', p: { ...CROUCH, afU: 30, afL: 110, abU: 20, abL: 120 } },
    { d: 0.2, e: 'inOutCubic', p: null },
  ] },
};
const STICK_HURT = {
  high: [
    { torso: -22, head: -28, afU: -20, afL: 40, abU: -40, abL: 30 },
    { torso: -30, head: -10, afU: 140, afL: 40, abU: 100, abL: 60 },
  ],
  mid: [
    { torso: 35, head: 15, afU: 20, afL: 100, abU: 10, abL: 110, lfU: 30, lfL: -45, lbU: -15, lbL: -20 },
    { torso: 25, head: -10, afU: -30, afL: 60, abU: 60, abL: 20 },
  ],
  low: [
    { torso: 15, lfU: 50, lfL: -80, lbU: -10, lbL: -40, afU: 60, afL: 40, abU: -40, abL: 50 },
    { torso: -10, head: 10, lfU: 5, lfL: -60, lbU: -30, lbL: -30, afU: 80, afL: 30, abU: 70, abL: 40 },
  ],
};
// ---------- characters ----------
const HITS = { fh: 'handF', bh: 'handB', ff: 'footF', bf: 'footB' };
// which move each input slot triggers (a character's binds override these)
const BINDS = { punch: 'jab', kick: 'kick', downPunch: 'jab', downKick: 'sweep', dashPunch: 'dashPunch', airPunch: 'airPunch', airKick: 'airKick',
  qcfPunch: 'rush', dpPunch: 'rising', qcbKick: 'spin', qcfKick: 'stomp', qcbPunch: null, dpKick: null };
// special motions in numpad notation (6 = towards the opponent), matched in order against the recent directions
const MOTIONS = { dp: /6.*2.*3/, qcf: /2.*3.*6/, qcb: /2.*1.*4/ };
function makeCharacter(def) {
  def = JSON.parse(JSON.stringify(def)); // the caller's definition stays untouched (it is what gets edited and saved)
  const by = {}, order = [];
  for (const b of def.bones) by[b.id] = { ...BONE, parent: null, ...b };
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
  const chains = { spine: [], head: [], arm: [], leg: [], tail: [] };
  for (const b of order) if (!b.parent || by[b.parent].role !== b.role) {
    const c = [b];
    for (let k; (k = c[c.length - 1].kids.find(k => k.role === b.role));) c.push(k);
    chains[b.role].push(c);
  }
  const rest = Object.fromEntries(order.map(b => [b.id, b.a]));
  const ch = { name: def.name, bones: order, by, ids: order.map(b => b.id), chains,
    tips: [...chains.arm, ...chains.leg].map(c => c[c.length - 1]),
    poses: { ...def.poses, stance: { ...rest, ...def.poses.stance } }, moves: def.moves, hurt: def.hurt, binds: { ...BINDS, ...def.binds } };
  // the cancel window opens at a key marked cancel, else after the last active key
  for (const m of Object.values(ch.moves)) { const c = m.keys.findIndex(k => k.cancel); m.cancel = c >= 0 ? c : m.keys.findLastIndex(k => k.active) + 1; }
  return ch;
}
const oldMove = m => ({ ...m, hit: HITS[m.hit], keys: m.keys.map(k => ({ ...k, p: fromOld(k.p) })) });
const mapVals = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
// built-in definitions (plain JSON: what the creator edits, saves and reverts to); CHARS = compiled
const CHAR_DEFS = {
  stick: { name: 'stick', bones: STICK_BONES,
    poses: mapVals({ stance: STANCE, crouch: CROUCH, air: AIR, airFall: AIR_FALL, fall: FALL, lie: LIE }, fromOld),
    moves: mapVals(STICK_MOVES, oldMove), hurt: mapVals(STICK_HURT, set => set.map(fromOld)) },
};
// brute: the stick's skeleton and moves, bigger, heavier and slower
const BRUTE_SCALE = { waist: 1.2, chest: 1.35, neck: 1, head: 1.25, thigh: 1.1, shin: 1.05, foot: 1.2, uarm: 1.3, farm: 1.3, hand: 1.5 };
CHAR_DEFS.brute = { ...CHAR_DEFS.stick, name: 'brute',
  bones: STICK_BONES.map(b => ({ ...b, len: Math.round(b.len * BRUTE_SCALE[b.id.replace(/[FB]$/, '')]), thick: (b.thick ?? BONE.thick) + 3,
    hurt: b.hurt ? b.hurt + 3 : 0, stiff: 0.75, damp: 1.2 })),
  moves: mapVals(CHAR_DEFS.stick.moves, m => m.power ? { ...m, power: +(m.power * 1.25).toFixed(2), knock: m.knock * 1.2,
    keys: m.keys.map(k => ({ ...k, d: +(k.d * 1.2).toFixed(4) })) } : m) };
// more built-ins, all on the stick's moves: scale its bones by segment name, add parts, retime the moves
const sizedBones = (scale, thick = 0) => STICK_BONES.map(b => ({ ...b, len: Math.round(b.len * (scale[b.id.replace(/[FB]$/, '')] ?? 1)),
  thick: (b.thick ?? BONE.thick) + thick, hurt: b.hurt ? b.hurt + thick : 0 }));
const pair = (f, props) => ['F', 'B'].map(S => ({ ...f(S), side: S.toLowerCase(), ...props }));
const horns = (len, a, curl) => ['F', 'B'].flatMap(S => [
  { id: 'horn' + S, parent: 'head', len, a: a + (S === 'B' ? 15 : 0), role: 'head', side: S.toLowerCase(), thick: 3, lag: 0.5 },
  { id: 'hornTip' + S, parent: 'horn' + S, len: Math.round(len * 0.7), a: curl, role: 'head', side: S.toLowerCase(), thick: 2, lag: 1 }]);
const tail3 = (len, thick) => [
  { id: 'tail', parent: null, len, a: -120, role: 'tail', thick, lag: 1 },
  { id: 'tailMid', parent: 'tail', len: Math.round(len * 0.9), a: -20, role: 'tail', thick: thick - 1, lag: 2, min: -70, max: 70 },
  { id: 'tailEnd', parent: 'tailMid', len: Math.round(len * 0.8), a: -20, role: 'tail', thick: Math.max(1, thick - 2), lag: 3, stretch: 0.25, min: -70, max: 70 }];
const retimed = (k, power = 1) => mapVals(CHAR_DEFS.stick.moves, m => m.power
  ? { ...m, power: +(m.power * power).toFixed(2), knock: Math.round(m.knock * power), keys: m.keys.map(x => ({ ...x, d: +(x.d * k).toFixed(4) })) } : m);
// every pose a definition holds (named poses, move keys, hit reactions)
function mapPoses(def, fn) {
  const f = p => p && fn({ ...p });
  return { ...def, poses: mapVals(def.poses, f), moves: mapVals(def.moves, m => ({ ...m, keys: m.keys.map(k => ({ ...k, p: f(k.p) })) })),
    hurt: mapVals(def.hurt, set => set.map(f)) };
}
const { stick } = CHAR_DEFS;
CHAR_DEFS.dwarf = { ...stick, name: 'dwarf', moves: retimed(1.1, 1.15),
  bones: [...sizedBones({ waist: 0.9, chest: 0.95, head: 1.15, thigh: 0.65, shin: 0.6, uarm: 0.95, farm: 0.95, hand: 1.4 }, 3),
    { id: 'beard', parent: 'head', len: 11, a: -165, role: 'head', thick: 7, lag: 1.5, stretch: 0.1 }] };
CHAR_DEFS.minotaur = { ...stick, name: 'minotaur', moves: retimed(1.2, 1.35),
  bones: [...sizedBones({ waist: 1.25, chest: 1.4, neck: 1.6, head: 1.35, thigh: 1.15, shin: 1.1, foot: 1.3, uarm: 1.3, farm: 1.3, hand: 1.6 }, 4)
    .map(b => ({ ...b, stiff: 0.75, damp: 1.2 })), ...horns(18, -50, 40), ...tail3(16, 4)] };
CHAR_DEFS.demon = { ...stick, name: 'demon', moves: retimed(0.9),
  bones: [...sizedBones({ waist: 1.1, chest: 1.1, thigh: 1.15, shin: 1.15, uarm: 1.2, farm: 1.25, hand: 1.5 }).map(b => ({ ...b, stretch: b.role === 'arm' ? 0.15 : 0 })),
    ...horns(7, -20, 30), ...tail3(16, 3),
    ...pair(S => ({ id: 'wing' + S, parent: 'chest', len: 20, a: 5 + (S === 'B' ? 12 : 0), role: 'tail', thick: 3, lag: 1.5 })),
    ...pair(S => ({ id: 'wingTip' + S, parent: 'wing' + S, len: 18, a: 40, role: 'tail', thick: 2, lag: 2.5, stretch: 0.2, min: 0, max: 110 }))] };
// centaur: a horizontal horse body from the hips forward; the human waist sits on its front end (its angles are
// relative to the barrel, so every pose's waist turns by -90); hind legs are the stick's legs, forelegs hang off the barrel
CHAR_DEFS.centaur = { ...mapPoses({ ...stick, moves: retimed(1.1, 1.2) }, p => { if ('waist' in p) p.waist -= 90; return p; }), name: 'centaur',
  bones: [{ id: 'barrel', len: 34, a: 90, role: 'spine', hurt: 13, thick: 11, lag: 0, min: 60, max: 120 },
    ...STICK_BONES.map(b => b.id === 'waist' ? { ...b, parent: 'barrel', a: 90, min: 30, max: 210 } : b),
    ...['B', 'F'].flatMap(S => [
      { id: 'foreThigh' + S, parent: 'barrel', len: 22, a: -90, role: 'leg', side: S.toLowerCase(), hurt: 8, lag: 0, min: -190, max: 50 },
      { id: 'foreShin' + S, parent: 'foreThigh' + S, len: 23, role: 'leg', side: S.toLowerCase(), hurt: 8, lag: 1, min: -8, max: 165 },
      { id: 'hoof' + S, parent: 'foreShin' + S, len: 6, a: 90, role: 'leg', side: S.toLowerCase(), hurt: 6, lag: 1.5, level: 1, thick: 5, min: 40, max: 140 }]),
    ...tail3(12, 3).map(b => b.id === 'tail' ? { ...b, a: -150 } : b)] };
const CHARS = mapVals(CHAR_DEFS, makeCharacter);
let CURRENT = 'stick';
const currentChar = () => CHARS[CURRENT];

// a reaction pose, randomized so repeated hits never look identical
function makeHurt(pose, stun, rand, stance) {
  const hit = {}, hold = {};
  for (const k in pose) {
    const s = stance[k];
    hit[k] = pose[k] + (pose[k] - s) * rand(-0.25, 0.2) + rand(-5, 5);
    hold[k] = hit[k] * 0.8 + s * 0.2;
  }
  return { hurt: true, keys: [
    { d: 0.05, e: 'outExpo', p: hit },
    { d: Math.max(0.04, stun - 0.1), e: 'outQuad', p: hold },
    { d: 0.22, e: 'outCubic', p: null },
  ] };
}
const resolve = (base, p) => p ? { ...base, ...p } : base;
// startup / active / recovery in 60 fps frames
function frameData(m, speed = 1) {
  const f = { startup: 0, active: 0, recovery: 0 };
  let seen = false;
  for (const k of m.keys) {
    const n = k.d * 60 / (m.power ? speed : 1);
    if (k.active) { f.active += n; seen = true; } else f[seen ? 'recovery' : 'startup'] += n;
  }
  return mapVals(f, Math.round);
}

// forward kinematics, hip (root) at origin, y down. dir in [-1, 1] (fractional while turning). lens: stretched lengths
// wa (optional) receives each bone's world angle
function fk(ch, p, dir, lens, wa = {}) {
  const P = { hip: [0, 0] };
  for (const b of ch.bones) {
    const pb = b.parent && ch.by[b.parent], pw = pb ? wa[pb.id] : 0;
    const w = wa[b.id] = pw + p[b.id] - b.level * (pw - (pb ? pb.restW : 0));
    const o = P[b.parent || 'hip'], l = lens ? lens[b.id] : b.len;
    P[b.id] = [o[0] + Math.sin(w * R) * l * dir, o[1] + Math.cos(w * R) * l];
  }
  return P;
}

// back limbs first in the second colour, then the body, then front limbs. extra = added stroke width (outlines)
// tint(bone) overrides the colour per bone (the editors colour-code by role)
function drawFigure(ctx, ch, P, col, back, extra = 0, tint = null) {
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const side of ['b', '', 'f']) for (const b of ch.bones) if (b.side === side) {
    const o = P[b.parent || 'hip'], e = P[b.id], c = tint ? tint(b) : side === 'b' ? back : col;
    if (b.shape === 'circle') { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(e[0], e[1], b.len + extra / 2, 0, 7); ctx.fill(); continue; }
    ctx.strokeStyle = c; ctx.lineWidth = b.thick + extra;
    ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
  }
}
