'use strict';
// ---------- studio: editable character definitions (plain JSON), undo/redo, body operations ----------
const clone = o => JSON.parse(JSON.stringify(o));
// definitions persist in localStorage: saved characters override the built-ins, custom ones are added
const STORE = 'stick2.chars';
const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } })();
const DEFS = { ...mapVals(CHAR_DEFS, clone), ...saved.defs };
for (const d of Object.values(saved.defs || {})) d.moves = { ...clone(WEAPON_MOVES), ...d.moves }; // characters saved before weapons get their moves
for (const k in DEFS) CHARS[k] = makeCharacter(DEFS[k]);
if (DEFS[saved.current]) CURRENT = saved.current;
// only edited built-ins are stored, so improved built-ins reach characters nobody changed
const edited = () => Object.fromEntries(Object.entries(DEFS).filter(([k, d]) => !CHAR_DEFS[k] || JSON.stringify(d) !== JSON.stringify(CHAR_DEFS[k])));
// debounced: a drag (a joint in animate, a settings slider) can call a save on every event, far more often than the
// JSON + localStorage write needs to happen; flush() forces it now (used on beforeunload, and where a caller needs the
// write to have happened, like a test reading localStorage straight back)
function debounce(fn, ms = 250) {
  let t = null;
  const d = () => { clearTimeout(t); t = setTimeout(fn, ms); };
  d.flush = () => { if (t) { clearTimeout(t); t = null; fn(); } };
  if (typeof addEventListener === 'function') addEventListener('beforeunload', d.flush);
  return d;
}
const save = debounce(() => { try { localStorage.setItem(STORE, JSON.stringify({ defs: edited(), current: CURRENT })); } catch {} });
// settings persist too: the ones changed from the defaults, checked on the way in (known, the right type, in range)
const CFG_STORE = 'stick2.settings';
// a value a setting can take: known, its type, one of its options; numbers any finite value (outside the usual range is only flagged, riskOf)
const cfgOk = (k, v) => k in DEFAULTS && typeof v === typeof DEFAULTS[k] && (SPEC[k].opts ? SPEC[k].opts.includes(v) : typeof v !== 'number' || Number.isFinite(v));
const saveCfg = debounce(() => { try { localStorage.setItem(CFG_STORE, JSON.stringify(Object.fromEntries(Object.keys(DEFAULTS).filter(k => CFG[k] !== DEFAULTS[k]).map(k => [k, CFG[k]])))); } catch {} });
const loadCfg = () => { try { for (const [k, v] of Object.entries(JSON.parse(localStorage.getItem(CFG_STORE)) || {})) if (cfgOk(k, v)) CFG[k] = v; } catch {}
  if (!currentChar().by[CFG.scope]) CFG.scope = currentChar().ids[0]; };
loadCfg();
// the display aids (ghost, boxes, scope, hud, labels, timer): saved, but not undo steps
const setDisplay = (k, v) => { CFG[k] = v; saveCfg(); };
const studio = { sel: 'uarmF', also: new Set(), undo: [], redo: [], lastKey: null, lastT: 0, fold: new Set(), stance: 0, own: false };
layFlag(studio, 'colors', 'colours');
// the stance being edited (0 = main): its pose as drawn, its pose and own binds in the definition (what edits change)
const curStance = (ch = viewChar()) => ch.stances[studio.stance] || ch.stances[0];
const editPose = def => studio.stance ? def.stances[studio.stance - 1].pose : def.poses.stance;
// the character as the editors show it: in the stance picked, with its body (stanceChar)
const viewChar = () => stanceChar(currentChar(), studio.stance);
// "this stance only" (own): bone, size, stat, gait, effect and chain edits go to the stance's body (def.stances[i].body
// for a stance, def.main.body for main itself, see bodyDef) instead of every stance at once
const stanceOnly = () => studio.own && (studio.stance ? !!DEFS[CURRENT].stances?.[studio.stance - 1] : true);
const editBody = def => (studio.stance ? def.stances[studio.stance - 1] : (def.main ??= {})).body ??= {};
const stanceBody = (def = DEFS[CURRENT]) => studio.stance ? def.stances?.[studio.stance - 1]?.body : def.main?.body;
// clears an empty def.main left behind once its last req / morph / fly / body override is removed
const pruneMain = def => { if (def.main && !Object.keys(def.main).length) delete def.main; };
// the definition a bone edit changes: a bone the stance adds is its own entry; else the stance's override (stance only) or the bone
function boneDef(def, id) {
  const add = stanceBody(def)?.add?.find(b => b.id === id);
  if (add) return add;
  if (!stanceOnly()) return def.bones.find(b => b.id === id);
  const o = editBody(def).bones ??= {};
  return o[id] ??= {};
}
// a move's chain links as the combo editors see and change them: in stance only, the stance body's own (chains)
const nextOf = (def, n) => (stanceOnly() && stanceBody(def)?.chains?.[n]) || def.moves[n].next;
function setNext(def, n, next) {
  const has = next && Object.keys(next).length;
  if (stanceOnly()) (editBody(def).chains ??= {})[n] = has ? next : {};
  else if (has) def.moves[n].next = next; else delete def.moves[n].next;
}
// binds follow the plane setting: 2D and 2.5D each have their own table (see BINDS)
const bkey = () => bindsKey(CFG.plane);
const curBinds = ch => curStance(ch)[bkey()];
const editBinds = def => (studio.stance ? def.stances[studio.stance - 1] : def)[bkey()] ??= {};
// (in stance only: with the stance's overrides; a bone the stance adds: its own entry)
const boneView = id => { const def = DEFS[CURRENT], b = def.bones.find(b => b.id === id), body = stanceBody(def);
  return body?.add?.find(x => x.id === id) || (b && stanceOnly() && body?.bones?.[b.id] ? { ...b, ...body.bones[b.id] } : b); };
const selBone = () => boneView(studio.sel);
// the selection: the bone the panel shows (sel) and the others ⌘/Ctrl-clicked with it (also); bone edits go to all of them
const selIds = () => [studio.sel, ...[...studio.also].filter(id => id !== studio.sel && viewChar().by[id])];
const selDefs = def => selIds().map(id => boneDef(def, id)).filter(Boolean);
function pickBoneSel(id, add) {
  const ids = selIds();
  if (!add) { studio.sel = id; studio.also.clear(); }
  else if (!ids.includes(id)) { studio.also = new Set(ids); studio.sel = id; } // the clicked bone joins and is shown
  else if (ids.length > 1) { studio.also = new Set(ids.filter(x => x !== id)); if (id === studio.sel) studio.sel = ids.find(x => x !== id); }
}

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
  { k: 'react', min: 0, max: 3, step: 0.05, tip: 'Hit reaction: how hard blows, blocks and bounces jolt this bone. 0 = unmoved by impacts, 2 = flops loosely.' },
  { k: 'sway', min: 0, max: 3, step: 0.05, tip: 'Idle sway: how much the bone drifts on its own while standing (deeper bones more). 0 = still.' },
  { k: 'dangle', min: 0, max: 1.5, step: 0.05, tip: 'Secondary motion: how much the bone hangs like a rope (tails, scarves, hair): it droops with gravity, trails a run and a jump and lifts in a fall. 0 = only its animation.' },
  { k: 'whip', min: 0, max: 0.1, step: 0.002, tip: 'Bends back from a fast-turning parent\'s own angular velocity, springing past straight into the next turn (a nunchuck\'s loose end). 0 = rigid to its parent.' },
  { k: 'alpha', min: 0, max: 1, step: 0.05, tip: 'Visibility: 1 is fully visible (the default). 0 hides the bone and everything below it completely: no draw, no hurtbox, no part in walking or chains. Between, it draws translucent but stays solid.' },
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
const roleTint = () => studio.colors ? b => ROLE_COLS[b.role]?.[b.side === 'b' ? 1 : 0] : null; // a weapon keeps its own colours
const colorsToggle = () => toggle(':palette:', 'Colours: colour bones by role: spine black · head purple · arms blue · legs green · tails amber (back side paler)',
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
  Object.assign(CFG, vals); saveCfg();
}
function undoRedo(from, to) {
  if (!from.length) return;
  const e = from.pop();
  studio.lastKey = null;
  if (e.cfg) { to.push({ cfg: { ...CFG } }); Object.assign(CFG, e.cfg); saveCfg(); syncAll(); return; }
  if (e.reel) { to.push({ reel: reelSnap() }); reelRestore(e.reel); return; } // a replay edit (replay.js)
  if (e.movie) { to.push({ movie: JSON.stringify(rp.movie) }); rp.movie = JSON.parse(e.movie); panels(); return; } // a movie edit (replay.js)
  to.push(JSON.stringify(DEFS[CURRENT]));
  DEFS[CURRENT] = JSON.parse(e);
  recompile();
}
const undo = () => undoRedo(studio.undo, studio.redo), redo = () => undoRedo(studio.redo, studio.undo);

function recompile() {
  const old = CHARS[CURRENT], ch = CHARS[CURRENT] = makeCharacter(DEFS[CURRENT]), v = viewChar();
  if (!v.by[studio.sel]) studio.sel = v.ids[0];
  if (!ch.by[CFG.scope]) CFG.scope = ch.ids[0];
  for (const w of mode().worlds()) w.swapChar(old, ch);
  save();
  mode().changed?.();
  if (v.ids.join() !== stanceChar(old, studio.stance).ids.join()) panels(); else syncAll();
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
  studio.also.clear();
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
async function renameChar() {
  const old = CURRENT, name = (await askText('Rename the character', old))?.trim();
  if (!name || name === old || old !== CURRENT) return;
  if (DEFS[name]) return notice('Name taken', `"${name}" already exists`);
  if (CHAR_DEFS[old]) return addChar(DEFS[old], name);
  DEFS[name] = { ...DEFS[old], name }; CHARS[name] = makeCharacter(DEFS[name]);
  delete DEFS[old]; delete CHARS[old];
  pickChar(name);
}
async function deleteChar() {
  const name = CURRENT;
  if (CHAR_DEFS[name] || !await askYes(`Delete the character "${name}"?`, 'This cannot be undone.', ':delete: delete') || name !== CURRENT) return;
  delete DEFS[CURRENT]; delete CHARS[CURRENT];
  pickChar('stick');
}
function exportChar(clip) { (clip ? copyData : d => download(CURRENT + '.json', d))(DEFS[CURRENT]); }
function importChar(clip) {
  (clip ? pasteJSON : openFile)((def, name) => {
    try { makeCharacter(def); addChar(def, name.replace(/\.json$/, '')); } catch (err) { notice('Not a character file', err.message); }
  });
}
// ---------- suggest a character for the roster: an issue + an attached file, no local git, no sign-in beyond GitHub ----------
// used to pre-fill GitHub's "new file" page instead (a PR draft) - a character alone is ~70 KB, well past any URL
// GitHub will accept (it refuses an oversized request outright, not just truncates it), so that page almost always
// opened empty anyway, and still needed a fork + "propose changes" even once pasted. An issue with the exported file
// attached needs neither: any signed-in account can open one, and dragging a file in is a familiar step.
async function suggestChar() {
  const name = CURRENT, add = !CHAR_DEFS[name];
  const text = `1. Export this character as a file (below) — you'll attach it to the issue.\n2. Open a new issue on GitHub (below) and drag the exported file in.\n3. Say what's new or changed; a maintainer folds it into the roster (see CONTRIBUTING.md).`;
  for (;;) {
    const v = await dialog(`Suggest ${add ? `adding ${name}` : `a change to ${name}`}`, text, [
      [':download: export character file', 'export', 'Download this character as a JSON file to attach to the issue'],
      [':north_east: open a new issue', 'issue', 'Opens a new GitHub issue on this repo — attach the exported file there'],
      [':check: done', null, 'Close this'],
    ]);
    if (v === 'export') exportChar(false);
    else if (v === 'issue') window.open(`https://github.com/morbeo/stick2/issues/new?title=${encodeURIComponent(`Suggest ${add ? `adding ${name}` : `a change to ${name}`}`)}`, '_blank');
    else break;
  }
}
// ---------- files (the menu bar): export / import the character, the settings, or everything (edited characters, settings, my scenarios, keys), to a file or the clipboard ----------
const FILE_TIPS = { character: 'The character being edited: skeleton, poses, moves, binds',
  settings: 'Every setting changed from its default (debug views left out)',
  everything: 'Your edited and new characters, the settings, your scenarios and your keys and macros' };
function download(name, data) {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })), download: name });
  a.click(); URL.revokeObjectURL(a.href);
}
const copyData = data => navigator.clipboard?.writeText(JSON.stringify(data, null, 1));
function openFile(f) {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => { let d; try { d = JSON.parse(await inp.files[0].text()); } catch (err) { return notice('Not a JSON file', err.message); } f(d, inp.files[0].name); syncAll(); };
  inp.click();
}
async function pasteJSON(f) {
  let text; try { text = await navigator.clipboard.readText(); } catch { return notice('Clipboard unavailable', 'Allow the browser to read the clipboard, or use a file instead'); }
  let d; try { d = JSON.parse(text); } catch (err) { return notice('Not JSON', err.message); }
  await f(d, 'clipboard'); syncAll();
}
const cfgData = () => Object.fromEntries(changedCfg().map(k => [k, CFG[k]]));
// settings from a file over the defaults: known ones of the right type and in range only (the debug views stay)
function cfgFrom(o = {}) {
  const base = Object.keys(DEFAULTS).filter(k => !DISPLAY.includes(k)).map(k => [k, DEFAULTS[k]]);
  return Object.fromEntries([...base, ...Object.entries(o).filter(([k, v]) => cfgOk(k, v))]);
}
function exportFile(kind, clip) {
  if (kind === 'character') return exportChar(clip);
  const put = clip ? copyData : d => download(`stick2-${kind}.json`, d);
  if (kind === 'settings') return put({ format: 'stick2.settings', cfg: cfgData() });
  put({ format: 'stick2.everything', chars: edited(), current: CURRENT, cfg: cfgData(), scenarios: myStore, keys: { map: keymap, macros } });
}
function importFile(kind, clip) {
  if (kind === 'character') return importChar(clip);
  (clip ? pasteJSON : openFile)(async d => {
    if (d.format !== 'stick2.' + kind) return notice('Wrong file', `Not a${kind === 'everything' ? 'n everything' : ' settings'} file`);
    if (kind === 'settings') { setCfg(cfgFrom(d.cfg)); return mode().restart(); }
    if (!await askYes('Load everything in this file?', 'Characters with the same names, the settings, scenarios with the same names and your keys are replaced (⌘Z undoes only the settings).', ':restart_alt: replace')) return;
    try { for (const def of Object.values(d.chars || {})) makeCharacter(def); } catch (err) { return notice('Nothing was loaded', 'A character in the file is broken: ' + err.message); }
    for (const [n, def] of Object.entries(d.chars || {})) { DEFS[n] = { ...clone(def), name: n }; CHARS[n] = makeCharacter(DEFS[n]); }
    if (d.scenarios) importScens(JSON.stringify(d.scenarios));
    if (d.keys?.map) { Object.assign(keymap, d.keys.map); macros.splice(0, macros.length, ...(d.keys.macros || [])); saveKeys(); }
    setCfg(cfgFrom(d.cfg));
    pickChar(DEFS[d.current] ? d.current : CURRENT); // saves the characters, rebuilds every fight
    syncAll(); // openFile's own syncAll ran before the question was answered
  });
}
const fileMenu = (verb, f, ...extra) => (e, b) => popup(b, h('b', { textContent: verb }),
  h('div', { cls: 'bar col', onclick: closePop }, Object.entries(FILE_TIPS).map(([k, tip]) => h('div', { cls: 'bar' },
    button(k, `${verb} ${k} ${verb === 'export' ? 'to' : 'from'} a file: ${tip}`, () => f(k)),
    button(verb === 'export' ? 'copy' : 'paste', `${verb} ${k} ${verb === 'export' ? 'to' : 'from'} the clipboard: ${tip}`, () => f(k, true), 'mini'))),
    ...extra));

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
function drawThumb(cv, ch, pose = ch.poses.stance, cw = 60, chh = 64) {
  const w = cv.width = cw * dpr, hh = cv.height = chh * dpr, c = cv.getContext('2d'), L = fk(ch, pose, 1), s = hh * 0.92 / 125;
  let low = 0, x0 = 0, x1 = 0;
  for (const b of ch.bones) { const p = L[b.id], r = b.shape === 'circle' ? b.len : 0; low = Math.max(low, p[1] + r); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
  c.translate(w / 2 - (x0 + x1) / 2 * s, hh - 3 * dpr - low * s); c.scale(s, s);
  const col = ch.col || INK;
  drawFigure(c, ch, L, col[0], col[1]);
}
// a character as a card; by default clicking it makes it the one every mode edits
function charCard(k, pick = pickChar, on = k => CURRENT === k) {
  const cv = h('canvas'), b = h('button', { cls: 'card', tip: `${CHAR_DEFS[k] ? 'Built-in' : 'Your character'}: ${k} · ${CHARS[k].bones.length} bones · speed ${CHARS[k].stats.speed} · click: use it in every mode`,
    onclick: () => { closePop(); pick(k); syncAll(); } }, cv, h('span', { textContent: k }));
  reg(b, () => { b.classList.toggle('on', on(k)); drawThumb(cv, CHARS[k]); });
  return b;
}
// the character + stance picker: a toolbar group (pinned at the top, unlike the side panel, so it stays visible on
// scroll), shared by the character and animate tabs - which character every mode edits (same popup-of-cards button
// as fighterPick/scenarios.js charPick), and which of its stances (the same quick-switch seg as stanceRow, whose own
// row stays in the side panel for the rest of a stance's own settings: key, fly, body)
// a floating pose thumbnail shown while hovering a stance button, over the stance's own body if it has one (stanceChar)
let stancePreview = null;
function showStancePreview(btn, i) {
  hideStancePreview();
  const cv = h('canvas'), box = h('div', { cls: 'pop stancepv' }, cv);
  document.body.append(box);
  drawThumb(cv, stanceChar(currentChar(), i), undefined, 70, 76);
  const r = btn.getBoundingClientRect();
  box.style.left = Math.max(4, Math.min(r.left, innerWidth - box.offsetWidth - 8)) + 'px';
  box.style.top = (r.bottom + 4) + 'px';
  stancePreview = box;
}
function hideStancePreview() { stancePreview?.remove(); stancePreview = null; }
function charStancePicker() {
  const cv = h('canvas'), b = button('', 'The character every mode edits · click: pick another', (e, el) =>
    popup(el, h('b', { textContent: 'character' }), h('div', { cls: 'cards' }, Object.keys(DEFS).map(k => charCard(k)))));
  b.classList.add('fpick');
  reg(b, () => { b.replaceChildren(cv, h('span', { textContent: CURRENT })); drawThumb(cv, currentChar(), undefined, 20, 22); });
  const names = currentChar().stances.map(s => s.name);
  // like seg(), but hovering a stance shows its pose (stanceChar: its own body too, if it has one) in a floating
  // thumbnail instead of just a text tip - stances can look very different, worth seeing before switching
  const stances = names.length > 1 ? h('span', { cls: 'seg' }, names.map((n, i) => {
    const btn = button(n, i ? `Stance ${n}: its own pose, binds and loops` : 'The main stance: the base pose, binds and loops',
      () => { studio.stance = i; panels(); mode().restart(); });
    btn.onmouseenter = () => showStancePreview(btn, i);
    btn.onmouseleave = hideStancePreview;
    reg(btn, () => btn.classList.toggle('on', studio.stance === i));
    return btn;
  })) : null;
  // the same new/copy/rename/revert/delete/import/export actions charPanel() used to carry in the side panel - up here
  // too, so they stay in view with the picker instead of scrolling off with the rest of the body/move panel
  const ops = crud({
    random: ['New random character: proportions, thickness, extra limbs, stance and stats', () => addChar(randomDef(makeRand(Math.random() * 1e9 | 0)))],
    copy: ['New character copied from this one', () => addChar(DEFS[CURRENT], CURRENT)],
    rename: ['Rename this character (a built-in one is copied under the new name)', renameChar],
    revert: ['Throw away the edits of this built-in character (undoable)', revertChar],
    delete: ['Delete this character (only your own ones; asks first, cannot be undone)', deleteChar],
    import: ['Load a character JSON file as a new character', importChar],
    export: ['Download this character as a JSON file', exportChar],
  });
  return grp('character', 'The character every mode edits, and which of its stances', b, stances, ops);
}
// the character's stances: each has its own pose, binds (unset slots use the main ones), key and idle / walk loops
function stanceRow() {
  const add = async () => {
    const name = (await askText('Name of the new stance', 'stance' + currentChar().stances.length, 'It starts as a copy of the current one.'))?.trim();
    if (!name) return;
    edit(def => { (def.stances ??= []).push({ name, pose: { ...curStance().pose }, binds: {} }); });
    studio.stance = currentChar().stances.length - 1; panels();
  };
  const del = () => { if (!studio.stance) return; const i = studio.stance - 1; studio.stance = 0; edit(def => { def.stances.splice(i, 1); if (!def.stances.length) delete def.stances; }); panels(); };
  const names = currentChar().stances.map(s => s.name), i = studio.stance;
  const keyTips = Object.fromEntries(Object.entries(STANCE_KEYS).map(([k, l]) => [k, `${l} switches to ${names[i]}; pressed again in it, back to main (stances sharing a key take turns)`]));
  // a stance's own req/morph/fly/body (def.stances[i - 1]); main's the same, in def.main (no key: it's never switched "into" by one)
  const own = i ? () => DEFS[CURRENT].stances[i - 1] : () => DEFS[CURRENT].main;
  const ref = i ? def => def.stances[i - 1] : def => (def.main ??= {});
  return [h('div', { cls: 'row', tip: 'Stances: their key switches to them in a fight. The stance picked here is the one the pose, input and idle / walk loop edits change, and the one previews start in.' },
    h('span', {}, ...rich(':sports_martial_arts: stance')), h('span', { cls: 'bar' },
      seg(names.map((_, i) => i), () => studio.stance, i => { studio.stance = i; panels(); mode().restart(); }, Object.fromEntries(names.map((n, i) => [i, i ? `Stance ${n}: its own pose, binds and loops` : 'The main stance: the base pose, binds and loops'])), i => names[i]),
      crud({ new: ['New stance: a copy of the current one with no binds of its own', add], delete: ['Delete this stance (not the main one)', del] }))),
    h('div', { cls: 'row', tip: i ? `The input that switches to ${names[i]} in a fight (→ = toward the opponent)` : `${names[i]} hovers instead of falling: ↑ / ↓ fly up / down, gravity and the ground are suspended while in it` },
      h('span', {}, ...rich(i ? ':keyboard: key' : ':air: fly')), h('span', { cls: 'bar' },
      i ? seg(Object.keys(STANCE_KEYS), () => stanceKey(own()?.key), v => edit(def => { ref(def).key = v; }), keyTips, k => STANCE_KEYS[k]) : null,
      toggle(':air: fly', `${names[i]} hovers instead of falling: ↑ / ↓ fly up / down, gravity and the ground are suspended while in it`,
        () => !!own()?.fly, v => edit(def => { if (v) ref(def).fly = true; else { delete ref(def).fly; if (!i) pruneMain(def); } })))),
    h('div', { cls: 'row', tip: `The body in ${names[i]}: the same as ${i ? 'main' : 'the character as authored'}, or changed for this stance only` }, h('span', { textContent: 'body' }), h('span', { cls: 'bar' },
      toggle(':accessibility_new: this stance only', `This stance only: bone edits (length, thickness, shape, effects…, new limbs, delete = hide), size, stats, walk and combo links go to ${names[i]}'s own body, not every stance's. Off: they change the character in every stance`,
        () => studio.own, v => { studio.own = v; panels(); }),
      button(':history: revert body', `Throw away ${names[i]}'s own body: back to ${i ? 'the main body' : 'the character as authored'} (undoable)`,
        () => edit(def => { delete ref(def).body; if (!i) pruneMain(def); }), 'mini'))),
    studio.own ? slider('size', { min: 0.5, max: 2, step: 0.05 }, () => stanceBody()?.scale ?? 1,
      v => edit(def => { if (v === 1) delete editBody(def).scale; else editBody(def).scale = v; }, 'stance scale'),
      `Size of the whole body in ${names[i]}: × every bone's length, thickness and hurtbox`) : null,
    ...stanceReq(i, names[i]), ...i ? stanceMorph(i, names[i]) : []];
}
// a stance's switch transition (def.stances[i - 1].morph over MORPH): springs, an auto blend over T frames, or a transition move
function stanceMorph(i, name) {
  const mo = k => ({ ...MORPH, ...DEFS[CURRENT].stances[i - 1].morph })[k];
  const set = (vals, key = null) => edit(def => {
    const st = def.stances[i - 1], m = { ...st.morph, ...vals };
    for (const k in m) if (m[k] === MORPH[k]) delete m[k];
    if (Object.keys(m).length) st.morph = m; else delete st.morph;
  }, key);
  const show = (el, mode) => { reg(el, () => { el.hidden = mo('mode') !== mode; }); return el; };
  const inName = () => mo('move') || morphName('main', name), outName = morphName(name, 'main');
  // a new transition move: half way between the two stance poses, then on into the stance switched to; opened in animate
  const make = (n, from, to) => {
    const ch = currentChar(), a = ch.stances[from].pose, b = ch.stances[to].pose;
    if (!ch.moves[n]) edit(def => { def.moves[n] = { keys: [{ d: 0.12, e: 'inOutCubic', p: Object.fromEntries(Object.keys(b).map(j => [j, Math.round(((a[j] ?? b[j]) + b[j]) / 2)])) },
      { d: 0.12, e: 'inOutCubic', p: null }] }; });
    studio.stance = to; openMove(n);
  };
  const pick = (e, b) => { const ns = Object.keys(currentChar().moves).filter(n => !currentChar().moves[n].power);
    popup(b, h('b', { textContent: `transition into ${name}` }), seg(['', ...ns], () => mo('move'), v => { set({ move: v }); closePop(); },
      { '': `The move named ${morphName('main', name)}`, ...Object.fromEntries(ns.map(n => [n, `Play ${n} when switching to ${name}`])) }, v => v || morphName('main', name))); };
  const moveBtn = button(':animation: move', `The move played switching to ${name} · click: pick another`, pick, 'mini');
  reg(moveBtn, () => setRich(moveBtn, `:animation: ${inName()}${currentChar().moves[inName()] ? '' : ' (none yet)'}`));
  return [h('h4', { tip: `How the body changes switching to ${name} (and back to main from it)` }, ...rich(':sync_alt: transition')),
    h('div', { cls: 'row', tip: 'The switch transition' }, h('span', { textContent: 'morph' }), seg(['springs', 'auto', 'move'], () => mo('mode'), v => set({ mode: v }),
      { springs: 'The springs chase the new pose (the default)', auto: 'The stance pose and the bone lengths blend over the frames below, with the ease (new bones grow from nothing)',
        move: `A keyframed transition move plays: ${morphName('main', name)} (or the one picked) switching in, ${outName} back to main` })),
    show(slider('frames', { min: 1, max: 60, step: 1 }, () => mo('T'), v => set({ T: v }, 'morph:T'), 'How many frames (60 a second) the blend takes'), 'auto'),
    show(h('div', { cls: 'row', tip: 'How the blend eases' }, h('span', { textContent: 'ease' }), seg(['linear', 'inOutCubic', 'outQuad', 'outBack'], () => mo('ease'), v => set({ ease: v }),
      { linear: 'Even', inOutCubic: 'Slow in and out (the default)', outQuad: 'Fast, then settles', outBack: 'Overshoots, then settles' })), 'auto'),
    show(h('div', { cls: 'row', tip: `The transition moves of ${name}` }, h('span', { textContent: 'move' }), h('span', { cls: 'bar' }, moveBtn,
      button(':add: new transition move', `Make ${inName()} (half way between the poses, then into ${name}) and open it in animate`, () => make(inName(), 0, i), 'mini'),
      button(':add: back', `Make ${outName}, played going back to main, and open it in animate`, () => make(outName, i, 0), 'mini'))), 'move')];
}
// a stance's requirements and limits (def.stances[i - 1].req for a stance, def.main.req for main; only what differs
// from STANCE_REQ is stored). maxT, exit on and auto need somewhere to send it other than itself, so main skips them
function stanceReq(i, name) {
  const own = i ? () => DEFS[CURRENT].stances[i - 1] : () => DEFS[CURRENT].main;
  const req = k => ({ ...STANCE_REQ, ...own()?.req })[k];
  const set = (vals, key = null) => edit(def => {
    const st = i ? def.stances[i - 1] : (def.main ??= {}), r = { ...st.req, ...vals };
    for (const k in r) if (JSON.stringify(r[k]) === JSON.stringify(STANCE_REQ[k])) delete r[k];
    if (Object.keys(r).length) st.req = r; else delete st.req;
    if (!i) pruneMain(def);
  }, key);
  const row = (label, tip, ...c) => h('div', { cls: 'row', tip }, h('span', {}, ...rich(label)), h('span', { cls: 'bar' }, ...c));
  const sl = (k, label, max, step, tip) => slider(label, { min: 0, max, step }, () => req(k), v => set({ [k]: v }, 'req:' + k), tip);
  const where = () => req('grounded') && req('air') ? 'both' : req('air') ? 'air' : 'ground';
  const EXITS = { hit: 'Hit (a blow that lands)', knockdown: 'Knocked down', block: 'Blocking a blow', grab: 'Grabbed by a throw' };
  const moveOpts = i ? ['all', 'own', 'list'] : ['all', 'list']; // main has no separate "own" binds layer to fall back to
  const moves = () => Array.isArray(req('moves')) ? 'list' : req('moves');
  const pick = (e, b) => popup(b, h('b', { textContent: `moves allowed in ${name}` }), h('div', { cls: 'bar' }, Object.keys(currentChar().moves).map(n =>
    toggle(n, `Allow ${n} in ${name} (its binds that play other moves are dropped)`, () => req('moves').includes?.(n),
      on => set({ moves: on ? [...req('moves'), n] : req('moves').filter(x => x !== n) })))));
  const listBtn = button(':tune: moves', `Pick the moves ${name} allows`, pick, 'mini');
  reg(listBtn, () => { listBtn.hidden = moves() !== 'list'; if (moves() === 'list') setRich(listBtn, `:tune: ${req('moves').length} moves`); });
  const title = h('h4', { tip: i ? `When ${name} can be switched to, how long it lasts and what sends it back to main. Unset: as today (on the ground, any time)`
    : `When ${name} can be switched back into, and how long before it can be left again. Unset: as today (any time, any health)` }, ...rich(':gavel: requirements'));
  return [title,
    row(':my_location: where', `Where ${name} can be switched to`, seg(['ground', 'air', 'both'], where, v => set({ grounded: v !== 'air', air: v !== 'ground' }),
      { ground: 'Only standing on the floor (the default)', air: 'Only in the air', both: 'On the floor or in the air' }, v => optLabel(v === 'ground' ? 'stand' : v))),
    sl('hpBelow', 'hp below', 1, 0.05, `Only with at most this much health left (1 = any): a desperation stance at 0.3`),
    sl('hpAbove', 'hp above', 1, 0.05, `Only with at least this much health left (0 = any)`),
    sl('cooldown', 'cooldown', 10, 0.1, `Seconds after leaving ${name} before it can be taken again (0 = straight away)`),
    sl('minT', 'min time', 5, 0.1, `Seconds in ${name} before it can be left (0 = any time)`),
    ...i ? [sl('maxT', 'max time', 20, 0.1, `Seconds in ${name}, then back to main on its own (0 = no limit)`),
      row('exit on', `What sends ${name} back to main`, ...Object.entries(EXITS).map(([k, tip]) =>
        toggle(k, `${tip}: back to main`, () => req('exitOn').includes(k), on => set({ exitOn: on ? [...req('exitOn'), k] : req('exitOn').filter(x => x !== k) }))))] : [],
    row('once', `How often ${name} can be taken`, toggle(':timer: once a round', `${name} can be taken once a round`, () => req('once'), v => set({ once: v })),
      ...i ? [toggle(':smart_toy: auto', `No key needed: ${name} is taken the moment the requirements above hold, and left the moment they stop holding`, () => req('auto'), v => set({ auto: v }))] : []),
    row('moves', `The moves ${name} plays`, seg(moveOpts, moves, v => set({ moves: v === 'list' ? [] : v }),
      { all: i ? `${name}'s binds over the main ones (the default)` : 'The usual binds (the default)', own: `Only ${name}'s own binds: inputs it doesn't bind play nothing`,
        list: `Only the moves picked: binds playing other moves are dropped` }),
      listBtn)];
}
// the generator's variables; the random characters experiment shows nine of them
function randomPanel(changed = () => {}) {
  const set = vals => { Object.assign(studio.rnd, vals); changed(); syncAll(); };
  const title = h('h4', { tip: 'What the random button draws from' }, ...rich(':casino: generator'));
  title.append(groupOps(RANDOM_VARS, k => studio.rnd[k], k => RANDOM_VARS.find(s => s.k === k).v, set,
    ['Experiment: a grid of nine random characters; click one to keep it', () => randomExp()]));
  return [title, ...RANDOM_VARS.map(s => slider(s.k, s, () => studio.rnd[s.k], v => set({ [s.k]: v }), s.tip))];
}
// the picker and its new/copy/rename/revert/delete/import/export actions moved to the toolbar (charStancePicker, pinned
// above the side panel instead of scrolling with it); this fold keeps only what has nowhere else to live
function charPanel() {
  const head = heading('Character', 'Pick the fighter every mode uses (the picker is in the toolbar above). Edits are saved in this browser automatically; export a file to keep or share one.',
    '⌘Z undo · ⇧⌘Z redo');
  head.append(button(':tune:', 'What the random characters are drawn from, and an experiment grid of them', (e, b) => popup(b, ...randomPanel()), 'mini'));
  // its own row, not a small icon lost in the crud bar: proposing a character for the roster is a one-off, worth noticing
  const suggestRow = h('div', { cls: 'row', tip: 'Think this character belongs in the roster? Export it and open an issue - a maintainer folds it in.' },
    button(':upload: suggest for the roster', 'Export this character and open a GitHub issue to propose it, with instructions (see CONTRIBUTING.md)', () => suggestChar()));
  return [head, colorRow(), suggestRow];
}
// a character's own colour (def.col): unset (auto) leaves it to the player slot in a fight (P1 black, P2 red…, as every
// built-in does today); set, it is always drawn that way — in a fight too, overriding the slot. Preset swatches, or any
// colour from the picker.
const CHAR_COLS = { auto: null, black: '#222222', red: '#c0392b', blue: '#2c6fb0', green: '#2e8b57', purple: '#8e44ad', orange: '#b9770e' };
const CHAR_COL_TIPS = { auto: 'No colour of its own: whichever player slot it fights in decides (P1 black, P2 red…)' };
function colorRow() {
  const curCol = () => { const b = stanceOnly() && stanceBody(); return (b && 'col' in b ? b.col : DEFS[CURRENT].col) || null; };
  const cur = () => Object.keys(CHAR_COLS).find(k => CHAR_COLS[k] === curCol()) || '';
  const set = v => edit(def => { const target = stanceOnly() ? editBody(def) : def; if (v) target.col = v; else delete target.col; });
  const picker = h('input', { type: 'color', tip: 'Any colour, not just the presets', onchange: e => set(e.target.value) });
  reg(picker, () => { picker.value = curCol() || '#222222'; });
  return h('div', { cls: 'row', tip: 'This character\'s own colour. Auto: coloured by player slot instead, like every character before this existed.' },
    h('span', {}, ...rich(':palette: colour')), h('span', { cls: 'bar' },
      seg(Object.keys(CHAR_COLS), cur, k => set(CHAR_COLS[k]), { ...Object.fromEntries(Object.keys(CHAR_COLS).map(k => [k, k === 'auto' ? CHAR_COL_TIPS.auto : `This character is always ${k}`])) }),
      picker));
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
  const ch = viewChar(), rows = [];
  const walk = (b, depth) => {
    const fold = studio.fold.has(b.id);
    const tw = b.kids.length ? button(fold ? '▸' : '▾', fold ? `Show the bones under ${b.id}` : `Hide the bones under ${b.id} in this list`, () => { studio.fold[fold ? 'delete' : 'add'](b.id); panels(); }, 'twist')
      : h('span', { cls: 'twist' });
    const stanceOwn = studio.stance > 0 && !!stanceBody()?.add?.some(x => x.id === b.id);
    const nb = button(b.id + (b.lock ? ' 🔒' : '') + (b.hidden ? ' (hidden)' : '') + (stanceOwn ? ' (this stance)' : ''),
      `${b.role}${b.side ? ' · ' + (b.side === 'f' ? 'front' : 'back') : ''} · ${b.len}px${fold ? ` · ${subtree(DEFS[CURRENT], b.id).length - 1} hidden` : ''}` +
      (stanceOwn ? ' · only exists in this stance' : '') + ' · click: select it (Shift / ⌘: add to the selection) · double-click: rename',
      e => pickBoneSel(b.id, e.shiftKey || e.metaKey || e.ctrlKey));
    nb.ondblclick = e => { e.stopPropagation(); renameBone(b.id).then(panels); };
    nb.style.borderLeft = `4px solid ${ROLE_COLS[b.role]?.[b.side === 'b' ? 1 : 0] || '#888'}`; // a weapon (or other roleless) bone keeps a neutral colour
    reg(nb, () => nb.classList.toggle('on', selIds().includes(b.id)));
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
// (stance only: the stance's body adds it)
function addLimb(kind) {
  edit(def => {
    if (!stanceOnly()) { studio.sel = attachLimb(def, kind, studio.sel); return; }
    const body = editBody(def), all = { bones: [...def.bones, ...body.add || []] }, n = all.bones.length;
    studio.sel = attachLimb(all, kind, studio.sel); body.add = [...body.add || [], ...all.bones.slice(n)];
  });
  studio.also.clear();
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
    const p = selBone(), into = stanceOnly() ? editBody(def).add ??= [] : def.bones, ids = new Set([...def.bones, ...stanceBody(def)?.add || []].map(b => b.id));
    let id = 'bone', n = 1;
    while (ids.has(id + n)) n++;
    into.push({ id: id + n, parent: p?.id ?? null, len: 10, role: p?.role ?? 'tail', side: p?.side ?? '', lag: (p?.lag ?? 0) + 0.5 });
    studio.sel = id + n; studio.also.clear();
  });
}
// every stance body override (main's and each named stance's): where a bone id can also appear, besides def.bones
const allBodies = def => [def.main?.body, ...(def.stances || []).map(s => s.body)].filter(Boolean);
// rename a bone: follows it into its parent pointers, the stance bodies that add or override it, and every pose that poses it
async function renameBone(id = studio.sel) {
  const was = id, name = (await askText('Rename the bone', was))?.trim();
  if (!name || name === was) return;
  const def = DEFS[CURRENT];
  if ([...def.bones, ...allBodies(def).flatMap(b => b.add || [])].some(b => b.id === name)) return notice('Name taken', `"${name}" already exists`);
  edit(def => {
    for (const b of [...def.bones, ...allBodies(def).flatMap(b => b.add || [])]) { if (b.id === was) b.id = name; if (b.parent === was) b.parent = name; }
    for (const body of allBodies(def)) if (body.bones?.[was]) { body.bones[name] = body.bones[was]; delete body.bones[was]; }
    forEachPose(def, p => { if (Object.prototype.hasOwnProperty.call(p, was)) { p[name] = p[was]; delete p[was]; } });
  });
  if (studio.sel === was) studio.sel = name;
  if (studio.also.has(was)) { studio.also.delete(was); studio.also.add(name); }
}
// every bone in the current stance's view, selected together (⌘/Ctrl+click adds one at a time; this adds them all)
function selectAllBones() {
  const ids = viewChar().ids;
  if (selIds().length === ids.length) { studio.also.clear(); return; } // already all selected: deselect, back to just the focused bone
  studio.sel = ids[0]; studio.also = new Set(ids);
}
function selectAllBtn() {
  const b = button(':select_all:', '', selectAllBones, 'mini');
  reg(b, () => { const all = selIds().length === viewChar().ids.length;
    b.classList.toggle('on', all); b.dataset.tip = all ? 'Deselect: back to just the focused bone' : 'Select every bone, so an edit goes to all of them at once'; });
  return b;
}
const subtree = (def, id) => [id, ...def.bones.filter(b => b.parent === id).flatMap(b => subtree(def, b.id))];
// rearranging: a bone moves before another in the list (inside a side, earlier bones draw underneath; a parent stays before its children),
// or hangs from another bone (null: the hip), never from one hanging from it
function moveBone(id, before) {
  if (id === before) return;
  edit(def => { const b = def.bones.find(b => b.id === id); def.bones.splice(def.bones.indexOf(b), 1); def.bones.splice(def.bones.findIndex(x => x.id === before), 0, b); });
}
const parentChoices = (def, id) => { const sub = new Set(subtree(def, id)); return def.bones.filter(b => !sub.has(b.id)).map(b => b.id); };
function setParent(id, p) { edit(def => { def.bones.find(b => b.id === id).parent = p; }); }
// a bone the stance adds goes from its body; in stance only, any other bone is hidden in the stance (with all below it)
function deleteBone() {
  const body = stanceBody();
  if (body?.add?.some(b => b.id === studio.sel)) {
    const gone = new Set(subtree({ bones: [...DEFS[CURRENT].bones, ...body.add] }, studio.sel));
    studio.sel = selBone().parent ?? currentChar().ids[0]; studio.also.clear();
    return edit(def => { const b = editBody(def); b.add = b.add.filter(x => !gone.has(x.id)); if (!b.add.length) delete b.add; });
  }
  if (stanceOnly()) return edit(def => { for (const b of selDefs(def)) b.hidden = true; });
  const def = DEFS[CURRENT], gone = new Set(subtree(def, studio.sel));
  if (gone.size >= def.bones.length) return; // keep at least one bone
  studio.sel = selBone().parent ?? studio.sel; studio.also.clear();
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
    studio.sel = map[studio.sel]; studio.also.clear();
  });
}
