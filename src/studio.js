'use strict';
// ---------- studio: editable character definitions (plain JSON), undo/redo, body operations ----------
const clone = o => JSON.parse(JSON.stringify(o));
// definitions persist in localStorage: saved characters override the built-ins, custom ones are added
const STORE = 'stick2.chars';
const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } })();
const DEFS = { ...mapVals(CHAR_DEFS, clone), ...saved.defs };
for (const k in DEFS) CHARS[k] = makeCharacter(DEFS[k]);
if (DEFS[saved.current]) CURRENT = saved.current;
// only edited built-ins are stored, so improved built-ins reach characters nobody changed
const edited = () => Object.fromEntries(Object.entries(DEFS).filter(([k, d]) => !CHAR_DEFS[k] || JSON.stringify(d) !== JSON.stringify(CHAR_DEFS[k])));
const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ defs: edited(), current: CURRENT })); } catch {} };
const studio = { sel: 'uarmF', undo: [], redo: [], lastKey: null, lastT: 0, colors: false, fold: new Set(), stance: 0 };
// the stance being edited (0 = main): its pose as drawn, its pose and own binds in the definition (what edits change)
const curStance = (ch = currentChar()) => ch.stances[studio.stance] || ch.stances[0];
const editPose = def => studio.stance ? def.stances[studio.stance - 1].pose : def.poses.stance;
const editBinds = def => studio.stance ? (def.stances[studio.stance - 1].binds ??= {}) : (def.binds ??= {});
const selBone = () => DEFS[CURRENT].bones.find(b => b.id === studio.sel);

// every bone property the creator exposes, with its hover text
const BONE_PROPS = [
  { k: 'len', min: 2, max: 60, step: 1, tip: 'Length (px). For circles, the radius.' },
  { k: 'thick', min: 1, max: 16, step: 1, tip: 'Stroke width (px).' },
  { k: 'hurt', min: 0, max: 20, step: 1, tip: 'Hurtbox radius around the bone (px). 0 = blows pass through it.' },
  { k: 'lag', min: 0, max: 4, step: 0.1, tip: 'Follow-through: each step lowers the spring frequency (× followThru^lag), so the bone trails its parent.' },
  { k: 'level', min: 0, max: 1, step: 0.05, tip: '0 = turns rigidly with its parent. 1 = keeps its rest world angle whatever the parent does (feet stay flat).' },
  { k: 'stretch', min: 0, max: 1, step: 0.05, tip: 'Stretchiness: lengthens while swinging fast (0.3 = up to +30%), then eases back.' },
  { k: 'stiff', min: 0.2, max: 3, step: 0.05, tip: 'Multiplies the spring frequency: >1 snappier, <1 floppier than the rest of the body.' },
  { k: 'damp', min: 0.2, max: 3, step: 0.05, tip: 'Multiplies the spring damping: <1 wobbles longer, >1 settles without overshoot.' },
];
const ROLE_TIPS = {
  spine: 'Torso: breathes, leans into movement, carries arms and head.',
  head: 'Head and neck: nods with hits and follows the torso.',
  arm: 'Swings against the legs while walking; hands leave trails.',
  leg: 'Walk cycle, knees absorb landings, feet leave trails.',
  tail: 'Free appendage: no walk cycle, just follow-through and wander.',
};
// role colours for the editors' colour-coded view: [front / centre, back]
const ROLE_COLS = { spine: ['#222', '#8a8580'], head: ['#8e44ad', '#c6a2d6'], arm: ['#2c6fb0', '#94b7d8'], leg: ['#2e8b57', '#97c5ab'], tail: ['#b9770e', '#e0c08a'] };
const roleTint = () => studio.colors ? b => ROLE_COLS[b.role][b.side === 'b' ? 1 : 0] : null;
const colorsToggle = () => toggle(':palette: colors', 'Colour bones by role: spine black · head purple · arms blue · legs green · tails amber (back side paler)',
  () => studio.colors, v => { studio.colors = v; });
const SIDE_TIPS = { f: 'Front: drawn over the body in the main colour.', '': 'Centre: drawn with the body.', b: 'Back: drawn behind the body in the second colour.' };
const SHAPE_TIPS = { line: 'A stroke from the parent joint to this one.', circle: 'A disc centred on the joint, radius = length (heads, fists).' };

// ---------- edits: snapshot for undo, change the definition, recompile, swap it into running fights ----------
// key: repeated edits with the same key (a slider or joint drag) merge into one undo step.
// One stack for both: character snapshots (JSON strings) and settings snapshots ({ cfg })
function snapshot(entry, key) {
  const now = performance.now();
  if (!key || key !== studio.lastKey || now - studio.lastT > 1000) {
    studio.undo.push(entry());
    if (studio.undo.length > 200) studio.undo.shift();
    studio.redo = [];
  }
  studio.lastKey = key; studio.lastT = now;
}
function edit(fn, key = null) {
  snapshot(() => JSON.stringify(DEFS[CURRENT]), key);
  fn(DEFS[CURRENT]);
  recompile();
}
// settings changes (sliders, presets, group buttons, grid picks) are undoable too
function setCfg(vals, key = null) {
  snapshot(() => ({ cfg: { ...CFG } }), key);
  Object.assign(CFG, vals);
}
function undoRedo(from, to) {
  if (!from.length) return;
  const e = from.pop();
  studio.lastKey = null;
  if (e.cfg) { to.push({ cfg: { ...CFG } }); Object.assign(CFG, e.cfg); syncAll(); return; }
  to.push(JSON.stringify(DEFS[CURRENT]));
  DEFS[CURRENT] = JSON.parse(e);
  recompile();
}
const undo = () => undoRedo(studio.undo, studio.redo), redo = () => undoRedo(studio.redo, studio.undo);

function recompile() {
  const old = CHARS[CURRENT], ch = CHARS[CURRENT] = makeCharacter(DEFS[CURRENT]);
  if (!ch.by[studio.sel]) studio.sel = ch.ids[0];
  if (!ch.by[CFG.scope]) CFG.scope = ch.ids[0];
  for (const w of mode().worlds()) w.swapChar(old, ch);
  save();
  mode().changed?.();
  if (ch.ids.join() !== old.ids.join()) panels(); else syncAll();
}

// every pose a definition holds (named poses, move keys, hit reactions), to rename or drop bones everywhere
function forEachPose(def, fn) {
  for (const k in def.poses) fn(def.poses[k]);
  for (const m of Object.values(def.moves)) for (const k of m.keys) if (k.p) fn(k.p);
  for (const set of Object.values(def.hurt)) set.forEach(fn);
}

// ---------- characters: pick, copy, revert, delete, export / import ----------
function pickChar(name) {
  CURRENT = name; studio.stance = 0; studio.undo = []; studio.redo = []; studio.lastKey = null;
  if (!currentChar().by[studio.sel]) studio.sel = currentChar().ids[0];
  if (!currentChar().by[CFG.scope]) CFG.scope = currentChar().ids[0];
  save(); setMode(app.mode); // every mode rebuilds its fights with the new character
}
function addChar(def, base = def.name || 'char') {
  let name = base, n = 2;
  while (DEFS[name]) name = base + n++;
  DEFS[name] = { ...clone(def), name };
  CHARS[name] = makeCharacter(DEFS[name]);
  pickChar(name);
}
const revertChar = () => CHAR_DEFS[CURRENT] && edit(def => {
  for (const k in def) delete def[k];
  Object.assign(def, clone(CHAR_DEFS[CURRENT]));
});
// built-ins keep their name (revert needs it), so renaming one makes a renamed copy
function renameChar() {
  const name = prompt('Rename the character', CURRENT)?.trim(), old = CURRENT;
  if (!name || name === old) return;
  if (DEFS[name]) return alert(`"${name}" already exists`);
  if (CHAR_DEFS[old]) return addChar(DEFS[old], name);
  DEFS[name] = { ...DEFS[old], name }; CHARS[name] = makeCharacter(DEFS[name]);
  delete DEFS[old]; delete CHARS[old];
  pickChar(name);
}
function deleteChar() {
  if (CHAR_DEFS[CURRENT] || !confirm(`Delete the character "${CURRENT}"?`)) return;
  delete DEFS[CURRENT]; delete CHARS[CURRENT];
  pickChar('stick');
}
function exportChar() {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(DEFS[CURRENT], null, 1)], { type: 'application/json' })), download: CURRENT + '.json' });
  a.click(); URL.revokeObjectURL(a.href);
}
function importChar() {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => {
    try {
      const def = JSON.parse(await inp.files[0].text());
      makeCharacter(def); // throws on a broken file before it touches anything
      addChar(def, inp.files[0].name.replace(/\.json$/, ''));
    } catch (err) { alert('Not a character file: ' + err.message); }
  };
  inp.click();
}
// a random character: the stick's skeleton with random proportions and thickness, maybe extra limbs, a stance preset;
// its moves are retimed to its size (bigger = slower and harder)
const SYLLABLES = ['ka', 'ro', 'zu', 'mi', 'gor', 'ta', 'ven', 'shi', 'bo', 'rak', 'lu', 'dra', 'ni', 'vex', 'ul', 'ash'];
// what the generator draws from (studio.rnd holds the current values)
const RANDOM_VARS = [
  { k: 'size', v: 1.05, min: 0.6, max: 1.6, step: 0.05, tip: 'Average overall size (bigger also means slower, harder hitting moves).' },
  { k: 'sizeVar', v: 0.25, min: 0, max: 0.5, step: 0.05, tip: 'How much the size varies around the average.' },
  { k: 'shape', v: 0.3, min: 0, max: 0.6, step: 0.05, tip: 'Proportions: how much each limb segment strays from the size (front and back partners match).' },
  { k: 'thick', v: 2, min: -1, max: 8, step: 1, tip: 'Average extra stroke width (px); varies ±3.' },
  { k: 'core', v: 4, min: 0, max: 10, step: 1, tip: 'Average extra thickness of the torso (px); varies from 0 to twice this.' },
  { k: 'limbs', v: 1, min: 0, max: 3, step: 0.5, tip: 'Average number of extra arms, tails or heads (up to twice this).' },
  { k: 'stats', v: 0.15, min: 0, max: 0.5, step: 0.05, tip: 'How much the stats (jump, weight, health, toughness, tempo, springs) stray from 1; weight and health also follow the size.' },
];
studio.rnd = Object.fromEntries(RANDOM_VARS.map(s => [s.k, s.v]));
function randomDef(rand, o = studio.rnd) {
  const pick = a => a[Math.floor(rand() * a.length)], size = rand(o.size - o.sizeVar, o.size + o.sizeVar), seg = {};
  const thick = Math.round(rand(o.thick - 3, o.thick + 3)), core = Math.round(rand(0, 2 * o.core));
  const def = clone(CHAR_DEFS.stick);
  def.name = pick(SYLLABLES) + pick(SYLLABLES);
  for (const b of def.bones) {
    const k = seg[b.id.replace(/[FB]$/, '')] ??= size * rand(1 - o.shape, 1 + o.shape); // front and back partners match
    b.len = Math.max(3, Math.round(b.len * k));
    b.thick = Math.max(2, (b.thick ?? BONE.thick) + thick + (b.role === 'spine' ? core : 0));
    if (b.hurt) b.hurt = Math.max(4, Math.round(b.hurt * Math.sqrt(k)) + Math.round(thick / 2));
  }
  const spine = def.bones.filter(b => b.role === 'spine');
  for (let n = Math.round(rand(0, 2 * o.limbs)); n > 0; n--) attachLimb(def, pick(['arm', 'arm', 'tail', 'head']), pick(spine).id);
  const preset = pick(Object.keys(POSES).filter(k => k !== 'tpose'));
  Object.assign(def.poses.stance, presetPose(makeCharacter(def), POSES[preset]));
  const t = size * rand(0.9, 1.1);
  def.speed = +clamp(rand(0.9, 1.2) / size, 0.6, 1.4).toFixed(2);
  for (const st of CHAR_STATS.slice(1)) {
    const v = rand(1 - o.stats, 1 + o.stats) * (st.k === 'weight' || st.k === 'health' ? size : 1);
    if (Math.abs(v - 1) > 0.02) def[st.k] = +clamp(Math.round(v / st.step) * st.step, st.min, st.max).toFixed(2);
  }
  def.moves = mapVals(def.moves, m => m.power ? { ...m, power: +(m.power * size).toFixed(2), knock: Math.round(m.knock * size),
    keys: m.keys.map(k => ({ ...k, d: +(k.d * t).toFixed(4) })) } : m);
  return def;
}
// a small drawing of a character (its stance, or any pose); one scale for all, so sizes compare
function drawThumb(cv, ch, pose = ch.poses.stance) {
  const w = cv.width = 60 * dpr, hh = cv.height = 64 * dpr, c = cv.getContext('2d'), L = fk(ch, pose, 1), s = hh * 0.92 / 125;
  let low = 0, x0 = 0, x1 = 0;
  for (const b of ch.bones) { const p = L[b.id], r = b.shape === 'circle' ? b.len : 0; low = Math.max(low, p[1] + r); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
  c.translate(w / 2 - (x0 + x1) / 2 * s, hh - 3 * dpr - low * s); c.scale(s, s);
  drawFigure(c, ch, L, INK[0], INK[1]);
}
function charCard(k) {
  const cv = h('canvas'), b = h('button', { cls: 'card', tip: `${CHAR_DEFS[k] ? 'Built-in' : 'Your character'}: ${k} · ${CHARS[k].bones.length} bones · speed ${CHARS[k].stats.speed}`,
    onclick: () => { pickChar(k); syncAll(); } }, cv, h('span', { textContent: k }));
  reg(b, () => { b.classList.toggle('on', CURRENT === k); drawThumb(cv, CHARS[k]); });
  return b;
}
// the character's stances: K+G cycles them in a fight; each has its own pose and binds (unset slots use the main ones)
function stanceRow() {
  const add = () => {
    const name = prompt('Name of the new stance (it starts as a copy of the current one)', 'stance' + currentChar().stances.length)?.trim();
    if (!name) return;
    edit(def => { (def.stances ??= []).push({ name, pose: { ...curStance().pose }, binds: {} }); });
    studio.stance = currentChar().stances.length - 1; panels();
  };
  const del = () => { if (!studio.stance) return; const i = studio.stance - 1; studio.stance = 0; edit(def => { def.stances.splice(i, 1); if (!def.stances.length) delete def.stances; }); panels(); };
  const names = currentChar().stances.map(s => s.name);
  return h('div', { cls: 'row', tip: 'Stances: K+G switches to the next one in a fight. The stance picked here is the one the pose and input edits change, and the one previews start in.' },
    h('span', { textContent: 'stance' }), h('span', { cls: 'bar' },
      seg(names.map((_, i) => i), () => studio.stance, i => { studio.stance = i; panels(); mode().restart(); }, Object.fromEntries(names.map((n, i) => [i, i ? `Stance ${n}: its own pose and binds` : 'The main stance'])), i => names[i]),
      crud({ new: ['New stance: a copy of the current one with no binds of its own', add], delete: ['Delete this stance (not the main one)', del] })));
}
// the generator's variables; the random characters experiment shows nine of them
function randomPanel(changed = () => {}) {
  const set = vals => { Object.assign(studio.rnd, vals); changed(); syncAll(); };
  const title = h('h4', { textContent: 'generator', tip: 'What the random button draws from' });
  title.append(groupOps(RANDOM_VARS, k => studio.rnd[k], k => RANDOM_VARS.find(s => s.k === k).v, set,
    ['Experiment: a grid of nine random characters; click one to keep it', () => randomExp()]));
  return [title, ...RANDOM_VARS.map(s => slider(s.k, s, () => studio.rnd[s.k], v => set({ [s.k]: v }), s.tip))];
}
function charPanel() {
  const head = heading('Character', 'Pick the fighter every mode uses. Edits are saved in this browser automatically; export a file to keep or share one.',
    '⌘Z undo · ⇧⌘Z redo');
  head.append(crud({
    random: ['New random character: proportions, thickness, extra limbs, stance and stats', () => addChar(randomDef(makeRand(Math.random() * 1e9 | 0)))],
    copy: ['New character copied from this one', () => addChar(DEFS[CURRENT], CURRENT)],
    rename: ['Rename this character (a built-in one is copied under the new name)', renameChar],
    revert: ['Throw away the edits of this built-in character (undoable)', revertChar],
    delete: ['Delete this character (only your own ones)', deleteChar],
    import: ['Load a character JSON file as a new character', importChar],
    export: ['Download this character as a JSON file', exportChar],
  }, button(':tune:', 'What the random characters are drawn from, and an experiment grid of them', (e, b) => popup(b, ...randomPanel()), 'mini')));
  return [head, h('div', { cls: 'cards' }, Object.keys(DEFS).map(charCard))];
}

// ---------- pose presets: local angles per limb chain (index 0 = the bone at the root of the limb), by role ----------
// arms and legs have front / back values; limbs beyond the first pair take the same ones; tails are left alone
const POSES = {
  boxer: { tip: 'Fists up, weight forward: the default fighting stance.', spine: [172, 0], head: [0, 0], arm: { f: [-145, 115, 0], b: [-165, 125, 0] }, leg: { f: [25, -25, 90], b: [-18, 0, 90] } },
  guard: { tip: 'High guard: hands by the face, upright.', spine: [176, 0], head: [0, 10], arm: { f: [-160, 140, 0], b: [-170, 145, 0] }, leg: { f: [20, -20, 90], b: [-15, 0, 90] } },
  low: { tip: 'Low, wide and crouched: a grappler or a beast.', spine: [158, 0], head: [0, -15], arm: { f: [-130, 100, 0], b: [-150, 110, 0] }, leg: { f: [55, -80, 90], b: [-35, -40, 90] } },
  karate: { tip: 'Lead hand extended, rear fist at the hip, deep front knee.', spine: [168, 0], head: [0, 0], arm: { f: [-110, 40, 0], b: [-185, 150, 0] }, leg: { f: [40, -30, 90], b: [-30, -5, 90] } },
  relaxed: { tip: 'Standing loose, arms hanging.', spine: [178, 0], head: [0, 5], arm: { f: [-175, 20, 0], b: [-185, 20, 0] }, leg: { f: [8, -5, 90], b: [-8, -3, 90] } },
  wide: { tip: 'Arms spread forward and back, feet apart: a showy or clumsy stance.', spine: [178, 0], head: [0, 0], arm: { f: [-110, 40, 0], b: [-240, 40, 0] }, leg: { f: [35, -10, 90], b: [-35, -10, 90] } },
  southpaw: { tip: 'The boxer mirrored: the other hand and foot lead.', spine: [172, 0], head: [0, 0], arm: { f: [-165, 125, 0], b: [-145, 115, 0] }, leg: { f: [-18, 0, 90], b: [25, -25, 90] } },
  muay: { tip: 'Tall, hands high, lead heel light: ready to check and knee.', spine: [178, 0], head: [0, 5], arm: { f: [-165, 140, 0], b: [-172, 150, 0] }, leg: { f: [15, -30, 115], b: [-20, -5, 90] } },
  tiger: { tip: 'Low and forward, claws out: a pouncing animal style.', spine: [160, 0], head: [0, -10], arm: { f: [-100, 70, 0], b: [-120, 85, 0] }, leg: { f: [45, -55, 90], b: [-30, -30, 90] } },
  crane: { tip: 'On one leg, the front knee raised, arms spread like wings.', spine: [178, 0], head: [0, 0], arm: { f: [-70, -40, 0], b: [-280, 40, 0] }, leg: { f: [85, -110, 90], b: [-4, 0, 90] } },
  sumo: { tip: 'Very wide and low, hands forward: a wall of a stance.', spine: [168, 0], head: [0, -5], arm: { f: [-125, 35, 0], b: [-135, 35, 0] }, leg: { f: [55, -55, 90], b: [-55, -35, 90] } },
  drunken: { tip: 'Leaning back, one hand high, loose knees: unpredictable.', spine: [190, 0], head: [0, 20], arm: { f: [-125, 125, 0], b: [-205, 60, 0] }, leg: { f: [30, -40, 90], b: [-5, -25, 90] } },
  tpose: { tip: 'Straight limbs: a neutral pose to edit the body from.', spine: [180, 0], head: [0, 0], arm: { f: [-90, 0, 0], b: [-270, 0, 0] }, leg: { f: [0, 0, 90], b: [0, 0, 90] } },
};
// the preset's angles for every bone of a character (partial: only chains the preset covers)
function presetPose(ch, preset) {
  const p = {};
  for (const role of ['spine', 'head', 'arm', 'leg']) for (const c of ch.chains[role]) {
    const v = Array.isArray(preset[role]) ? preset[role] : preset[role][c[0].side === 'b' ? 'b' : 'f'];
    c.forEach((b, i) => { if (v[i] !== undefined) p[b.id] = v[i]; });
  }
  return p;
}
// locked bones rotate only with their parent: IK and dragging turn the first unlocked bone above instead
const unlockedAbove = (ch, b) => { while (b?.lock) b = ch.by[b.parent]; return b; };

// collapsible bone tree: ▾/▸ folds a branch, the stripe is the role colour, 🔒 = locked
function boneTree() {
  const ch = currentChar(), rows = [];
  const walk = (b, depth) => {
    const fold = studio.fold.has(b.id);
    const tw = b.kids.length ? button(fold ? '▸' : '▾', fold ? 'Expand' : 'Collapse', () => { studio.fold[fold ? 'delete' : 'add'](b.id); panels(); }, 'twist')
      : h('span', { cls: 'twist' });
    const nb = button(b.id + (b.lock ? ' 🔒' : ''), `${b.role}${b.side ? ' · ' + (b.side === 'f' ? 'front' : 'back') : ''} · ${b.len}px${fold ? ` · ${subtree(DEFS[CURRENT], b.id).length - 1} hidden` : ''}`,
      () => { studio.sel = b.id; });
    nb.style.borderLeft = `4px solid ${ROLE_COLS[b.role][b.side === 'b' ? 1 : 0]}`;
    reg(nb, () => nb.classList.toggle('on', studio.sel === b.id));
    const row = h('div', { cls: 'tree' }, tw, nb);
    row.style.paddingLeft = depth * 14 + 'px';
    rows.push(row);
    if (!fold) b.kids.forEach(k => walk(k, depth + 1));
  };
  ch.bones.filter(b => !b.parent).forEach(b => walk(b, 0));
  return h('div', {}, rows);
}

// ---------- body operations ----------
// limb templates: [name, len, props]; the first bone gets a world angle (w), the rest are relative to their parent
const LIMBS = {
  arm: { w: 0, pair: true, bones: [['uarm', 17, { lag: 1 }], ['farm', 13, { lag: 2, min: -10, max: 165 }], ['hand', 4, { lag: 2.5, thick: 6, min: -70, max: 70 }]] },
  leg: { w: 0, pair: true, bones: [['thigh', 22, { hurt: 8, lag: 0 }], ['shin', 23, { hurt: 8, lag: 1, min: -165, max: 8 }],
    ['foot', 7, { a: 90, hurt: 6, lag: 1.5, level: 1, thick: 4, min: 40, max: 140 }]] },
  tail: { w: -120, bones: [['tail', 14, { lag: 1, thick: 4 }], ['tailMid', 12, { a: -20, lag: 2, thick: 3, min: -70, max: 70 }],
    ['tailEnd', 10, { a: -20, lag: 3, thick: 2, stretch: 0.2, min: -70, max: 70 }]] },
  head: { w: 180, bones: [['neck', 5, { hurt: 12, level: 0.5, min: -45, max: 45 }], ['head', 8, { shape: 'circle', hurt: 12, min: -50, max: 50 }]] },
};
const LIMB_TIPS = {
  arm: 'Add a pair of arms (front + back) at the selected torso bone, or at the top of the spine.',
  leg: 'Add a pair of legs at the selected torso bone, or at the hips.',
  tail: 'Add a 3-bone tail at the selected torso bone, or at the hips.',
  head: 'Add a neck and head at the selected torso bone, or at the top of the spine.',
};
function addLimb(kind) {
  edit(def => { studio.sel = attachLimb(def, kind, studio.sel); });
}
// adds a limb to a definition at torso bone `at` (or the default place); returns its first bone's id
function attachLimb(def, kind, at) {
  {
    const L = LIMBS[kind], by = Object.fromEntries(def.bones.map(b => [b.id, b])), sel = by[at];
    const spine = def.bones.filter(b => b.role === 'spine'), top = spine.find(b => !spine.some(k => k.parent === b.id));
    // arms and heads hang off the top of the torso, legs and tails off the hips, unless a torso bone is selected
    const parent = sel?.role === 'spine' ? sel.id : kind === 'arm' || kind === 'head' ? top?.id ?? null : null;
    const restW = id => id ? restW(by[id].parent) + (by[id].a ?? 0) : 0;
    const sides = L.pair ? ['F', 'B'] : [''];
    let n = 1; // one number for the whole limb so F/B partners keep matching names
    const name = (base, S) => base + (n > 1 ? n : '') + S;
    while (sides.some(S => L.bones.some(([base]) => by[name(base, S)]))) n++;
    for (const S of sides) L.bones.forEach(([base, len, props], i) => def.bones.push({
      id: name(base, S), parent: i ? name(L.bones[i - 1][0], S) : parent, len, role: kind === 'head' ? 'head' : kind,
      side: S.toLowerCase(), ...props, a: i ? props.a ?? 0 : L.w - restW(parent) }));
    return name(L.bones[0][0], sides[0]);
  }
}
// one more joint at the end of the selected bone, same role and side
function addBone() {
  edit(def => {
    const p = selBone(), ids = new Set(def.bones.map(b => b.id));
    let id = 'bone', n = 1;
    while (ids.has(id + n)) n++;
    def.bones.push({ id: id + n, parent: p?.id ?? null, len: 10, role: p?.role ?? 'tail', side: p?.side ?? '', lag: (p?.lag ?? 0) + 0.5 });
    studio.sel = id + n;
  });
}
const subtree = (def, id) => [id, ...def.bones.filter(b => b.parent === id).flatMap(b => subtree(def, b.id))];
function deleteBone() {
  const def = DEFS[CURRENT], gone = new Set(subtree(def, studio.sel));
  if (gone.size >= def.bones.length) return; // keep at least one bone
  studio.sel = selBone().parent ?? studio.sel;
  edit(def => {
    def.bones = def.bones.filter(b => !gone.has(b.id));
    forEachPose(def, p => { for (const id of gone) delete p[id]; });
  });
}
// copy the selected bone and everything under it to the other side (front <-> back), stance included
function copyLimb() {
  edit(def => {
    const src = subtree(def, studio.sel), ids = new Set(def.bones.map(b => b.id)), map = {};
    const flip = { f: 'b', b: 'f', '': '' };
    for (const id of src) {
      let nid = /[FB]$/.test(id) ? id.slice(0, -1) + (id.endsWith('F') ? 'B' : 'F') : id + '2';
      while (ids.has(nid)) nid += '2';
      ids.add(nid); map[id] = nid;
    }
    for (const id of src) {
      const b = def.bones.find(b => b.id === id);
      def.bones.push({ ...clone(b), id: map[id], parent: map[b.parent] ?? b.parent, side: flip[b.side ?? ''] });
      if (id in def.poses.stance) def.poses.stance[map[id]] = def.poses.stance[id];
    }
    studio.sel = map[studio.sel];
  });
}
