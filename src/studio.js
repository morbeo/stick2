'use strict';
// ---------- studio: editable character definitions (plain JSON), undo/redo, body operations ----------
const clone = o => JSON.parse(JSON.stringify(o));
// definitions persist in localStorage: saved characters override the built-ins, custom ones are added
const STORE = 'stick2.chars';
const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } })();
const DEFS = { ...mapVals(CHAR_DEFS, clone), ...saved.defs };
for (const k in DEFS) CHARS[k] = makeCharacter(DEFS[k]);
if (DEFS[saved.current]) CURRENT = saved.current;
const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ defs: DEFS, current: CURRENT })); } catch {} };
const studio = { sel: 'uarmF', undo: [], redo: [], lastKey: null, lastT: 0 };
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
const SIDE_TIPS = { f: 'Front: drawn over the body in the main colour.', '': 'Centre: drawn with the body.', b: 'Back: drawn behind the body in the second colour.' };
const SHAPE_TIPS = { line: 'A stroke from the parent joint to this one.', circle: 'A disc centred on the joint, radius = length (heads, fists).' };

// ---------- edits: snapshot for undo, change the definition, recompile, swap it into running fights ----------
// key: repeated edits with the same key (a slider or joint drag) merge into one undo step
function edit(fn, key = null) {
  const now = performance.now();
  if (!key || key !== studio.lastKey || now - studio.lastT > 1000) {
    studio.undo.push(JSON.stringify(DEFS[CURRENT]));
    if (studio.undo.length > 200) studio.undo.shift();
    studio.redo = [];
  }
  studio.lastKey = key; studio.lastT = now;
  fn(DEFS[CURRENT]);
  recompile();
}
function undoRedo(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(DEFS[CURRENT]));
  DEFS[CURRENT] = JSON.parse(from.pop());
  studio.lastKey = null;
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
  CURRENT = name; studio.undo = []; studio.redo = []; studio.lastKey = null;
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
function charPanel() {
  return [
    heading('Character', 'Pick the fighter every mode uses. Edits are saved in this browser automatically; export a file to keep or share one.',
      '⌘Z undo · ⇧⌘Z redo'),
    h('div', { cls: 'bar' }, seg(Object.keys(DEFS), () => CURRENT, pickChar,
      Object.fromEntries(Object.keys(DEFS).map(k => [k, CHAR_DEFS[k] ? `Built-in: ${k}` : `Your character: ${k}`])))),
    h('div', { cls: 'bar' },
      button('copy', 'Make a new character from this one', () => addChar(DEFS[CURRENT], CURRENT)),
      button('revert', 'Throw away the edits of this built-in character (undoable)', revertChar),
      button('delete', 'Delete this character (only your own ones)', deleteChar),
      button('export', 'Download this character as a JSON file', exportChar),
      button('import', 'Load a character JSON file as a new character', importChar)),
  ];
}

// ---------- body operations ----------
// limb templates: [name, len, props]; the first bone gets a world angle (w), the rest are relative to their parent
const LIMBS = {
  arm: { w: 0, pair: true, bones: [['uarm', 17, { lag: 1 }], ['farm', 13, { lag: 2, min: -10, max: 165 }], ['hand', 4, { lag: 2.5, thick: 6 }]] },
  leg: { w: 0, pair: true, bones: [['thigh', 22, { hurt: 8, lag: 0 }], ['shin', 23, { hurt: 8, lag: 1, min: -165, max: 8 }],
    ['foot', 7, { a: 90, hurt: 6, lag: 1.5, level: 1, thick: 4 }]] },
  tail: { w: -120, bones: [['tail', 14, { lag: 1, thick: 4 }], ['tailMid', 12, { a: -20, lag: 2, thick: 3 }], ['tailEnd', 10, { a: -20, lag: 3, thick: 2, stretch: 0.2 }]] },
  head: { w: 180, bones: [['neck', 5, { hurt: 12, level: 0.5 }], ['head', 8, { shape: 'circle', hurt: 12 }]] },
};
const LIMB_TIPS = {
  arm: 'Add a pair of arms (front + back) at the selected torso bone, or at the top of the spine.',
  leg: 'Add a pair of legs at the selected torso bone, or at the hips.',
  tail: 'Add a 3-bone tail at the selected torso bone, or at the hips.',
  head: 'Add a neck and head at the selected torso bone, or at the top of the spine.',
};
function addLimb(kind) {
  edit(def => {
    const L = LIMBS[kind], by = Object.fromEntries(def.bones.map(b => [b.id, b])), sel = by[studio.sel];
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
    studio.sel = name(L.bones[0][0], sides[0]);
  });
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
