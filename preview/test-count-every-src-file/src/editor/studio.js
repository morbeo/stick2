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
// a built-in can't be deleted (revert needs it to stay around), so "delete" disables it instead: hidden from every
// picker, random pick and the live random-character roster, until re-enabled or reverted. Custom characters are unaffected
const disabledChars = new Set(saved.disabled || []);
const isDisabled = k => disabledChars.has(k);
const rosterKeys = () => Object.keys(DEFS).filter(k => !disabledChars.has(k));
function setDisabled(name, v) { if (v) disabledChars.add(name); else disabledChars.delete(name); save(); }

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
let saveFailed = false;
const save = debounce(() => {
  try { localStorage.setItem(STORE, JSON.stringify({ defs: edited(), current: CURRENT, disabled: [...disabledChars] })); saveFailed = false; }
  catch (e) { if (!saveFailed) { saveFailed = true; notice('Could not save characters', `Your changes are only in this tab for now: ${e.message}`); } }
});
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
  { k: 'shade', min: 0, max: 0.9, step: 0.05, tip: 'Grey level: 0 is the figure\'s own ink, higher fades it toward paper white (stays monochrome).' },
  { k: 'taper', min: 0, max: 1, step: 0.05, tip: 'Line ends thinner than it starts: 0 = even, 1 = to a point (claws, horns, tails).' },
  { k: 'morphDelay', min: 0, max: 0.9, step: 0.05, tip: 'Stance blend delay: in an auto stance transition, the share of the blend this bone waits before it moves, so it lands after the rest. 0.4 on hair or a tail: the body changes first, then they follow. 0 = all bones together.' },
  { k: 'aim', min: 0, max: 1, step: 0.05, tip: 'Look-at: how far the bone turns toward the nearest foe\'s upper body in a fight (1 = straight at it). Heads that watch, an arm that tracks.' },
  { k: 'z', min: -3, max: 3, step: 1, tip: 'Draw order layer: lower draws underneath every higher layer, whatever its side. Side orders bones within a layer.' },
  { k: 'segs', min: 2, max: 16, step: 1, tip: 'Chain shape only: how many segments the rope is split into. More = smoother and floppier.' },
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
const CAP_TIPS = { round: 'Rounded ends (the default stick look).', square: 'Squared ends pushed out by half the width (boxy limbs, robots).',
  flat: 'Cut flat at the joints (plates, pills with flat ends).', point: 'Narrows to a tip at its end (blades, claws, horns).' };
const SHAPE_TIPS = { line: 'A stroke from the parent joint to this one.', circle: 'A disc centred on the joint, radius = length (heads, fists).',
  spline: 'One smooth curve through this bone and the single chain of line bones below it, tapering to the last one\'s thickness (tails, tentacles).',
  fill: 'A filled shape through the parent joint, this joint and the single chain of bones below it, closed back (or through the fill-to bone\'s joint): capes, wing membranes, skirts. Lighter than the ink unless it has a shade.',
  socket: 'An invisible attach point: not drawn, never hit, in no limb chain. A held weapon goes on it (front side first) instead of the hand.',
  chain: 'A rope: the bone splits into segs loose, dangling segments drawn as one smooth curve (whips, scarves, hair). Children hang from its end.' };

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
  if (e.scene) { to.push({ scene: JSON.stringify({ pose: rp.pose, props: rp.props }) }); const s = JSON.parse(e.scene); rp.pose = s.pose; rp.props = s.props; panels(); return; } // a scene edit (replay.js)
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
const revertChar = () => CHAR_DEFS[CURRENT] && (setDisabled(CURRENT, false), edit(def => {
  for (const k in def) delete def[k];
  Object.assign(def, clone(CHAR_DEFS[CURRENT]));
}));
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
// scenarios (built in the browser) that still name this character, directly or in a select-mode roster
const scensUsing = name => Object.entries(myScens()).filter(([, u]) => u.p.some(f => f.char === name) || u.roster?.includes(name)).map(([k]) => k);
// a built-in can't truly be deleted (revert needs it to stay around), so "delete" disables it instead: out of every
// picker, random pick and the live random-character roster until re-enabled or reverted
async function disableChar() {
  const name = CURRENT;
  if (!await askYes(`Disable the character "${name}"?`, `"${name}" ships with the app so it can't be deleted - this hides it from pickers and random picks instead. Enable or revert brings it back.`, ':block: disable') || name !== CURRENT) return;
  setDisabled(name, true);
  pickChar('stick');
}
async function deleteChar() {
  const name = CURRENT;
  if (CHAR_DEFS[name]) return disableChar();
  if (!await askYes(`Delete the character "${name}"?`, 'This cannot be undone.', ':delete: delete') || name !== CURRENT) return;
  const used = scensUsing(name);
  delete DEFS[CURRENT]; delete CHARS[CURRENT];
  pickChar('stick');
  if (used.length) notice('Deleted, but still named elsewhere', `"${name}" is gone, but these scenarios still name it and will fall back to another character when played: ${used.join(', ')}.`);
}
// a character export is a diff against its matching built-in by default (small, and what a diff viewer can use
// directly) - like a git patch, not the whole file. full: the whole def anyway (the only option for a wholly new
// character, with no built-in to diff against; also offered explicitly for sharing one standalone)
// lenLock is a posing-tool option (how dragging a joint behaves in the editor), not something worth sharing or
// diffing against - stripped before either runs
const stripLocal = def => ({ ...def, bones: def.bones.map(({ lenLock, ...b }) => b) });
function charExport(full) {
  const base = CHAR_DEFS[CURRENT];
  if (full || !base) return DEFS[CURRENT];
  const d = diffObj(base, stripLocal(DEFS[CURRENT]));
  return { format: 'stick2.character.diff', base: CURRENT, diff: d || {} };
}
// the character as a ready-to-commit src/engine/chars/<name>.js (npm run char:add takes this file or a JSON export)
function exportCharCode() {
  const def = stripLocal(DEFS[CURRENT]), base = CHAR_DEFS[CURRENT] ? CURRENT : closestBase(def);
  const blob = new Blob([charSource(CURRENT, base, diffObj(CHAR_DEFS[base], def) || {})], { type: 'text/javascript' });
  const a = h('a', { href: URL.createObjectURL(blob), download: CURRENT + '.js' }); a.click(); URL.revokeObjectURL(a.href);
}
function exportChar(clip, full) { (clip ? copyData : d => download(CURRENT + (full || !CHAR_DEFS[CURRENT] ? '' : '.diff') + '.json', d))(charExport(full)); }
// reconstructs a full character def from a diff payload (format stick2.character.diff) - throws a readable message
// if its base isn't a built-in here (an older roster, or a typo'd/tampered link)
function fromCharDiff(d) {
  const base = CHAR_DEFS[d.base];
  if (!base) throw new Error(`This diff is against "${d.base}", which isn't a built-in here.`);
  return applyObj(base, d.diff);
}
// loading a diff means "view/update this named built-in", not "add a new copy": DEFS[base] always already exists
// (it's a built-in), so addChar() would just make base2 and leave nothing left to compare in the changes panel.
// Confirms first if it would overwrite local edits that the diff doesn't already match
async function applyCharDiff(def, name) {
  const cur = DEFS[name];
  if (cur && JSON.stringify(cur) !== JSON.stringify(def) && JSON.stringify(cur) !== JSON.stringify(CHAR_DEFS[name])) {
    if (!await askYes(`Replace your "${name}"?`, `You have your own changes to ${name} - loading this diff replaces them in this browser (⌘Z undoes).`, ':restart_alt: replace')) return;
  }
  DEFS[name] = { ...clone(def), name }; CHARS[name] = makeCharacter(DEFS[name]);
}
function importChar(clip) {
  (clip ? pasteJSON : openFile)(async (def, name) => {
    if (def.format === 'stick2.character.diff') {
      let full; try { full = fromCharDiff(def); } catch (err) { return notice('Unknown base character', err.message); }
      try { makeCharacter(full); } catch (err) { return notice('Not a character file', err.message); }
      await applyCharDiff(full, def.base); return pickChar(def.base);
    }
    try { makeCharacter(def); addChar(def, name.replace(/\.(diff\.)?json$/, '')); } catch (err) { notice('Not a character file', err.message); }
  });
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
// ---------- my poses: a literal per-bone snapshot (not role-generalized like POSES above), captured from a specific
// character - the replay scene editor's "save as" button (replay.js sceneSide) feeds this; the animate editor's own
// "start this key from a preset pose" (editor.js) and the character editor's stance presets (creator.js) both read
// it too, alongside the built-in POSES, so a pose posed once in either place is a preset everywhere
const POSE_STORE = 'stick2.myPoses';
const myPoses = (() => { try { return JSON.parse(localStorage.getItem(POSE_STORE)) || {}; } catch { return {}; } })();
function snapshotPose(name, ch, pose) { myPoses[name] = { char: ch.name, pose, tip: `Saved from ${ch.name}` }; saveMyPoses(); }
function deleteMyPose(name) { delete myPoses[name]; saveMyPoses(); }
function saveMyPoses() { try { localStorage.setItem(POSE_STORE, JSON.stringify(myPoses)); } catch {} }
// every pose a character can be set to right now: the built-ins (role-generalized, presetPose) plus any custom ones
// that were captured from this same character (a custom one's literal bone ids only make sense on its own rig)
function posesFor(ch) {
  return { ...Object.fromEntries(Object.entries(POSES).map(([k, p]) => [k, { tip: p.tip, pose: () => presetPose(ch, p) }])),
    ...Object.fromEntries(Object.entries(myPoses).filter(([, p]) => p.char === ch.name).map(([k, p]) => [k, { tip: p.tip, pose: () => p.pose, custom: true }])) };
}
// locked bones rotate only with their parent: IK and dragging turn the first unlocked bone above instead
const unlockedAbove = (ch, b) => { while (b?.lock) b = ch.by[b.parent]; return b; };

// collapsible bone tree: ▾/▸ folds a branch, the stripe is the role colour, 🔒 = locked
function boneTree() {
  const ch = viewChar();
  const kidsOf = b => b.kids.flatMap(k => k.chainOf ? kidsOf(k) : [k]); // a chain's segments list as the chain bone itself
  const walk = (b, depth) => {
    const fold = studio.fold.has(b.id);
    const tw = kidsOf(b).length ? button(fold ? '▸' : '▾', fold ? `Show the bones under ${b.id}` : `Hide the bones under ${b.id} in this list`, () => { studio.fold[fold ? 'delete' : 'add'](b.id); panels(); }, 'twist')
      : h('span', { cls: 'twist' });
    const nb = button('', '', e => pickBoneSel(b.id, e.shiftKey || e.metaKey || e.ctrlKey));
    nb.ondblclick = e => { e.stopPropagation(); renameBone(b.id).then(panels); };
    nb.style.borderLeft = `4px solid ${ROLE_COLS[b.role]?.[b.side === 'b' ? 1 : 0] || '#888'}`; // a weapon (or other roleless) bone keeps a neutral colour
    // label and tip rebuilt live (not just the .on class): hiding/unhiding a bone (stance-only delete/undo) keeps the
    // same bone ids, so recompile() only calls syncAll(), not a full panels() rebuild - this still has to catch it
    reg(nb, () => {
      nb.classList.toggle('on', selIds().includes(b.id));
      const live = viewChar().by[b.id] || b, stanceOwn = studio.stance > 0 && !!stanceBody()?.add?.some(x => x.id === b.id);
      setRich(nb, live.id + (live.lock ? ' 🔒' : '') + (live.hidden ? ' (hidden)' : '') + (stanceOwn ? ' (this stance)' : ''));
      nb.dataset.tip = `${live.role}${live.side ? ' · ' + (live.side === 'f' ? 'front' : 'back') : ''} · ${live.len}px${fold ? ` · ${subtree(DEFS[CURRENT], b.id).length - 1} hidden` : ''}` +
        (stanceOwn ? ' · only exists in this stance' : '') + ' · click: select it (Shift / ⌘: add to the selection) · double-click: rename · drag onto a bone: hang it from that bone (Alt: move before it)';
    });
    // drag a bone onto another: it (and everything below it) hangs from that one; Alt+drop: moves before it in the draw order instead
    Object.assign(nb, { draggable: true, ondragstart: e => e.dataTransfer?.setData('text/plain', b.id),
      ondragover: e => { e.preventDefault(); nb.classList.add('dropto'); }, ondragleave: () => nb.classList.remove('dropto'),
      ondrop: e => { e.preventDefault(); nb.classList.remove('dropto'); treeDrop(e.dataTransfer?.getData('text/plain'), b.id, e.altKey); } });
    // laid out sideways like an org chart: a bone over the row of the bones hanging from it
    const kids = fold ? [] : kidsOf(b);
    return h('div', { cls: 'tnode' }, h('div', { cls: 'tree' }, tw, nb), kids.length ? h('div', { cls: 'tkids' }, ...kids.map(k => walk(k, depth + 1))) : null);
  };
  const roots = ch.bones.filter(b => !b.parent).map(b => walk(b, 0));
  const hip = h('div', { cls: 'tree note thip', textContent: 'hip',  tip: 'Drag a bone here to make it a root (it hangs from the hip, like the legs and the waist)',
    ondragover: e => e.preventDefault(), ondrop: e => { e.preventDefault(); treeDrop(e.dataTransfer?.getData('text/plain'), 'hip'); } });
  return h('div', { cls: 'tnode troot' }, hip, h('div', { cls: 'tkids' }, ...roots));
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
// the appendages library: parts with a size, a segment count and mirroring, built as normal bones (edit them freely
// after). Each returns a LIMBS-style template; at: where it goes when no bone is selected ('top' of the spine, the
// 'head', or null = the hips). Free parts take the tail role: no walk cycle, just follow-through and wander (their idle).
const PARTS = {
  arm: { at: 'top', pair: true, tip: 'Arms (front + back): extra pairs number themselves (uarm2F…).', make: () => LIMBS.arm },
  leg: { at: null, pair: true, tip: 'Legs (front + back): they join the walk cycle.', make: () => LIMBS.leg },
  head: { at: 'top', tip: 'A neck and a head.', make: () => LIMBS.head },
  tail: { at: null, segs: 3, tip: 'A tail that tapers to its tip.', make: o => chainPart('tail', -120, 14, o, { thick: 4, end: 2, bend: -20 }) },
  tentacle: { at: null, segs: 6, tip: 'A long, floppy tentacle: each segment thinner and laggier.', make: o => chainPart('tentacle', -60, 11, o, { thick: 5, end: 1, bend: 10, lag: 0.7, give: 80 }) },
  wing: { at: 'top', pair: true, segs: 3, tip: 'Wings: up and back from the shoulders, swept tips.', make: o => chainPart('wing', -150, 16, o, { thick: 3, end: 1, bend: -35, lag: 0.8, give: 40 }) },
  horn: { at: 'head', pair: true, segs: 2, tip: 'Horns: stiff, pointed, curling back.', make: o => chainPart('horn', -70, 6, o, { thick: 3, end: 0, bend: -30, lag: 0.1, give: 10, point: true }) },
  socket: { at: 'top', tip: 'A socket: an invisible attach point. A held weapon goes on the first socket instead of the front hand.', make: () => ({ w: 0, bones: [['socket', 6, { shape: 'socket', hurt: 0, lag: 0 }]] }) },
};
// my parts: subtrees saved from any character (this browser only, like my weapons); a template whose bones name their
// parent by index ([base, len, props, parent index]), so a part can branch
const PART_STORE = 'stick2.parts';
const myParts = (() => { try { return JSON.parse(localStorage.getItem(PART_STORE)) || {}; } catch { return {}; } })();
const ownPart = (name, t) => ({ own: true, at: null, tip: `Your part (${t.bones.length} bones), saved from ${t.from || 'a character'}.`, make: () => t });
for (const [n, t] of Object.entries(myParts)) PARTS[n] ??= ownPart(n, t);
function savePartsStore() { try { localStorage.setItem(PART_STORE, JSON.stringify(myParts)); } catch {} }
// the selected bone and everything below it as a part template: side letters and sides dropped (the picker's mirror
// sets them), the root's rest angle kept as a world angle
function partFromBone(def, id) {
  const by = Object.fromEntries(def.bones.map(b => [b.id, b])), restW = i => i ? restW(by[i].parent) + (by[i].a ?? 0) : 0;
  const ids = subtree(def, id), cut = i => i.replace(/[FB]$/, '') || i;
  const base = i => ids.filter(j => cut(j) === cut(i)).length > 1 ? i : cut(i); // uarmF + uarmB in one part: keep both names
  const bones = ids.map((i, n) => { const { id: _, parent, side, a, ...props } = by[i];
    return [base(i), props.len, { ...props, ...n && a !== undefined ? { a } : null }, n ? ids.indexOf(parent) : undefined]; });
  return { w: restW(id), from: def.name || CURRENT, bones: bones.map(([b, len, { len: _, ...p }, pi]) => pi === undefined ? [b, len, p] : [b, len, p, pi]) };
}
async function savePart() {
  const def = DEFS[CURRENT];
  if (!def.bones.some(b => b.id === studio.sel)) return notice('No bone selected', 'Select the first bone of the part: it and everything below it are saved');
  const name = (await askText('Save the part as', (studio.sel || 'part').replace(/[FB]$/, '')))?.trim();
  if (!name) return;
  if (PARTS[name] && !PARTS[name].own) return notice('Name taken', `"${name}" is a built-in part`);
  myParts[name] = partFromBone(def, studio.sel); PARTS[name] = ownPart(name, myParts[name]); savePartsStore();
}
function deletePart(name) { if (!PARTS[name]?.own) return; delete myParts[name]; delete PARTS[name]; savePartsStore(); }
// a chain of segs bones from w (world angle), each bent by bend, shorter and thinner toward the tip
function chainPart(name, w, len, o, { thick, end, bend, lag = 1, give = 70, point }) {
  const n = o.segs, k = o.size;
  return { w, pair: o.pair, bones: Array.from({ length: n }, (_, i) => {
    const t = n > 1 ? i / (n - 1) : 0, last = i === n - 1;
    return [name + (i ? (last ? 'End' : 'Mid' + (n > 3 ? i : '')) : ''), Math.round(len * k * (1 - t * 0.3)), {
      ...i ? { a: bend, min: -give, max: give } : null, lag: +(lag * (i + 1)).toFixed(2),
      thick: Math.max(1, Math.round((thick - (thick - end) * t) * Math.sqrt(k))), ...last && point ? { cap: 'point' } : null }];
  }) };
}
// a part's template for its options ({ size, segs, pair }; missing ones take the part's own defaults)
function partSpec(kind, opt = {}) {
  const P = PARTS[kind], o = { size: 1, segs: P.segs ?? 3, pair: !!P.pair, ...opt };
  return { ...P.make(o), pair: o.pair, size: o.size, at: P.at, hit: o.hit };
}
// the picker's hit option: cosmetic parts are never hit; hittable ones get a hurtbox about their thickness
const partHurt = (hit, props) => hit === 'cosmetic' ? { hurt: 0 } : hit === 'hittable' && props.shape !== 'socket' ? { hurt: Math.max(4, (props.thick ?? BONE.thick) + 3) } : null;
// (stance only: the stance's body adds it)
function addLimb(kind, opt) {
  edit(def => {
    if (!stanceOnly()) { studio.sel = attachLimb(def, kind, studio.sel, opt); return; }
    const body = editBody(def), all = { bones: [...def.bones, ...body.add || []] }, n = all.bones.length;
    studio.sel = attachLimb(all, kind, studio.sel, opt); body.add = [...body.add || [], ...all.bones.slice(n)];
  });
  studio.also.clear();
}
// adds a limb or part to a definition at bone `at` (or the part's default place); opt: partSpec's options, given
// only from the parts picker. Returns its first bone's id
function attachLimb(def, kind, at, opt) {
  {
    const L = opt ? partSpec(kind, opt) : LIMBS[kind], by = Object.fromEntries(def.bones.map(b => [b.id, b])), sel = by[at];
    const spine = def.bones.filter(b => b.role === 'spine'), top = spine.find(b => !spine.some(k => k.parent === b.id));
    const where = opt ? L.at : kind === 'arm' || kind === 'head' ? 'top' : null;
    const home = where === 'head' ? def.bones.find(b => b.role === 'head' && b.shape === 'circle')?.id ?? top?.id : where === 'top' ? top?.id : null;
    // limbs hang off the selected torso bone or socket, parts off any selected bone; else their home (top of the
    // torso, the head, or the hips)
    const parent = sel && (opt || sel.role === 'spine' || sel.shape === 'socket') ? sel.id : home ?? null;
    // a mirrored pair on a sided bone (uarmF): its back copy goes on the partner (uarmB), when there is one
    const partner = S => S === 'B' && sel?.side === 'f' && parent === sel.id && by[sel.id.replace(/F$/, 'B')] ? sel.id.replace(/F$/, 'B') : parent;
    const restW = id => id ? restW(by[id].parent) + (by[id].a ?? 0) : 0;
    const sides = L.pair ? ['F', 'B'] : [''];
    let n = 1; // one number for the whole limb so F/B partners keep matching names
    const name = (base, S) => base + (n > 1 ? n : '') + S;
    while (sides.some(S => L.bones.some(([base]) => by[name(base, S)]))) n++;
    const k = opt && !PARTS[kind].segs ? L.size : 1; // a sized arm, leg, head or own part: scale its fixed bones
    const role = kind === 'head' ? 'head' : LIMBS[kind] ? kind : 'tail';
    for (const S of sides) L.bones.forEach(([base, len, props, pi], i) => def.bones.push({
      id: name(base, S), parent: i ? name(L.bones[pi ?? i - 1][0], S) : partner(S), len: Math.round(len * k), role: props.role ?? role,
      ...props, side: S ? S.toLowerCase() : props.side ?? '', ...partHurt(L.hit, props), a: i ? props.a ?? 0 : L.w - restW(partner(S)) }));
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
// a drop in the bone tree: onto a bone reparents (never under itself), Alt reorders, the hip row makes a root
function treeDrop(id, to, reorder = false) {
  const def = DEFS[CURRENT];
  if (!id || id === to || !def.bones.some(b => b.id === id)) return;
  if (to === 'hip') setParent(id, null);
  else if (reorder) moveBone(id, to);
  else if (parentChoices(def, id).includes(to)) setParent(id, to);
  panels();
}
// a bone the stance adds goes from its body; in stance only, any other bone is hidden in the stance (with all below it)
// split the selected bone in two halves: the new outer half hangs from it, straight on, and takes over its children
function splitBone() {
  if (stanceOnly()) return notice('Split works on the main body', 'Switch the stance to main to split a bone');
  const b = selBone();
  if (!b || b.shape === 'circle' || b.shape === 'socket') return notice('Can\'t split this bone', 'Pick a line bone (not a circle or a socket)');
  const ids = new Set(DEFS[CURRENT].bones.map(x => x.id)), base = b.id.replace(/[FB]$/, ''), S = b.id.slice(base.length);
  let n = 2; while (ids.has(base + n + S)) n++;
  const id = base + n + S;
  edit(def => {
    const o = def.bones.find(x => x.id === b.id), half = Math.max(1, Math.round(o.len / 2));
    for (const k of def.bones) if (k.parent === o.id) k.parent = id;
    const { id: _, parent: __, a: ___, len, ...props } = o;
    def.bones.splice(def.bones.indexOf(o) + 1, 0, { ...props, id, parent: o.id, len: len - half, lag: +((o.lag ?? 0) + 0.25).toFixed(2) });
    o.len = half;
  });
  studio.sel = id; studio.also.clear();
}
// merge the selected bone with its only child into one bone: lengths add up, the grandchildren hang from it (keeping
// their angles), and the child's poses, constraints and group places go to it
function mergeBone() {
  if (stanceOnly()) return notice('Merge works on the main body', 'Switch the stance to main to merge bones');
  const def = DEFS[CURRENT], b = selBone(), kids = def.bones.filter(x => x.parent === b?.id);
  if (kids.length !== 1) return notice('Can\'t merge', `Merge joins a bone with its only child; ${b?.id} has ${kids.length} children`);
  const c = kids[0].id;
  edit(def => {
    const o = def.bones.find(x => x.id === b.id), k = def.bones.find(x => x.id === c);
    o.len += k.len;
    for (const g of def.bones) { if (g.parent === c) { g.parent = o.id; g.a = (g.a ?? 0) + (k.a ?? 0); }
      for (const f of ['follow', 'reach']) if (g[f] === c) g[f] = o.id; }
    def.bones = def.bones.filter(x => x !== k);
    for (const [n, ids] of Object.entries(def.groups || {})) def.groups[n] = [...new Set(ids.map(i => i === c ? o.id : i))];
    forEachPose(def, p => { delete p[c]; });
  });
  studio.also.clear();
}
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
