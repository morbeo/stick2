'use strict';
// (split from src/editor/studio.js: the menu bar's files: export / import)
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
    button(verb === 'export' ? 'copy' : 'paste', `${verb} ${k} ${verb === 'export' ? 'to' : 'from'} the clipboard: ${tip}`, () => f(k, true), 'mini'),
    verb === 'export' && k === 'character' && CHAR_DEFS[CURRENT]
      ? button('full', `Export the whole character file instead of just a diff against the built-in ${CURRENT}`, () => exportChar(false, true), 'mini') : null,
    verb === 'export' && k === 'character'
      ? button('code', 'Export as src/engine/chars/<name>.js, ready to commit (docs/characters.md)', exportCharCode, 'mini') : null)),
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
function drawThumb(cv, ch, pose = ch.poses.stance, cw = 60, chh = 64, tint = null) {
  const w = cv.width = cw * dpr, hh = cv.height = chh * dpr, c = cv.getContext('2d'), L = fk(ch, pose, 1), s = hh * 0.92 / 125;
  let low = 0, x0 = 0, x1 = 0;
  for (const b of ch.bones) { const p = L[b.id], r = b.shape === 'circle' ? b.len : 0; low = Math.max(low, p[1] + r); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
  c.translate(w / 2 - (x0 + x1) / 2 * s, hh - 3 * dpr - low * s); c.scale(s, s);
  const col = ch.col || INK;
  drawFigure(c, ch, L, col[0], col[1], 0, tint);
}
// hovering a card plays its select animation (the 'select' move, if it has one) once, then settles into its stance
// pose - like the combos editor's hover preview (peekSeq), but animation-only (no World) and into the card's own
// canvas in place, since a popup can show dozens of these at once
let cardPeek = null; // { cv, stop } - only the hovered card animates; every other card stays a still thumbnail
function startCardPreview(cv, k) {
  stopCardPreview();
  const ch = CHARS[k], m = ch.moves.select, wch = m ? withWeapon(ch, m) : null, t0 = performance.now();
  const stop = rafLoop(cv, () => {
    const t = (performance.now() - t0) / 1000;
    drawThumb(cv, wch && t < total(m) ? wch : ch, wch && t < total(m) ? samplePose(wch, m, t) : ch.poses.stance);
  });
  cardPeek = { cv, stop };
}
function stopCardPreview() { cardPeek?.stop(); cardPeek = null; }
// a character as a card; by default clicking it makes it the one every mode edits
function charCard(k, pick = pickChar, on = k => CURRENT === k) {
  const cv = h('canvas'), b = h('button', { cls: 'card', tip: `${CHAR_DEFS[k] ? 'Built-in' : 'Your character'}: ${k}${isDisabled(k) ? ' · disabled (hidden from pickers and random picks)' : ''} · ${CHARS[k].bones.length} bones · speed ${CHARS[k].stats.speed} · click: use it in every mode`,
    onclick: () => { closePop(); pick(k); syncAll(); },
    onmouseenter: () => startCardPreview(cv, k), onmouseleave: () => cardPeek?.cv === cv && stopCardPreview() }, cv, h('span', { textContent: k }));
  reg(b, () => { b.classList.toggle('on', on(k)); b.style.opacity = isDisabled(k) ? 0.4 : ''; if (cardPeek?.cv !== cv) drawThumb(cv, CHARS[k]); });
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
  placeNear(box, btn.getBoundingClientRect());
  stancePreview = box;
}
function hideStancePreview() { stancePreview?.remove(); stancePreview = null; }
// the fuzzy-search character picker popup; pick/on default to switching CURRENT everywhere - pass your own to pick
// something else (e.g. a preview's opponent). extra prepends non-character choices (e.g. "self") as plain buttons
function charPickerPopup(el, { pick = pickChar, on = k => CURRENT === k, title = 'character', extra = [] } = {}) {
  const list = h('div', { cls: 'cards' });
  const fill = () => list.replaceChildren(
    ...extra.filter(([n]) => fuzzy(q.value, n)).map(([n, tip]) => { const b = button(n, tip, () => { closePop(); pick(n); }); reg(b, () => b.classList.toggle('on', on(n))); return b; }),
    ...Object.keys(DEFS).filter(k => fuzzy(q.value, k)).map(k => charCard(k, pick, on)));
  const q = h('input', { cls: 'macro', placeholder: 'search…', tip: 'Fuzzy search: letters in order match the name',
    oninput: fill, onkeydown: e => e.stopPropagation() });
  fill();
  popup(el, h('b', { textContent: title }), q, list);
}
function charStancePicker() {
  const cv = h('canvas'), b = button('', 'The character every mode edits · click: pick another', (e, el) => charPickerPopup(el));
  b.classList.add('fpick');
  reg(b, () => { b.replaceChildren(cv, h('span', { textContent: CURRENT })); drawThumb(cv, currentChar(), undefined, 20, 22); });
  const names = currentChar().stances.map(s => s.name);
  // like seg(), but hovering a stance shows its pose (stanceChar: its own body too, if it has one) in a floating
  // thumbnail instead of just a text tip - stances can look very different, worth seeing before switching
  const stances = names.length > 1 ? h('span', { cls: 'seg' }, names.map((n, i) => {
    const btn = button(n, i ? `Stance ${n}: its own pose, binds and loops` : 'The main stance: the base pose, binds and loops',
      () => { hideStancePreview(); studio.stance = i; panels(); mode().restart(); });
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
    ...CHAR_DEFS[CURRENT] ? {
      ...isDisabled(CURRENT)
        ? { enable: ['Bring this disabled built-in back into pickers and random picks', () => { setDisabled(CURRENT, false); panels(); }] }
        : { disable: ['Remove this built-in from pickers and random picks (not a full delete - enable or revert brings it back)', disableChar] },
      revert: ['Throw away the edits of this built-in character, and re-enable it if disabled (undoable)', revertChar],
    } : { delete: ['Delete this character (asks first, cannot be undone)', deleteChar] },
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
    ...floorRow(i, names[i], own, ref),
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
// a stance off the floor anchor (hipH): the hip stands hipH px above the floor and the feet are free to leave it; on, it
// starts where the body stands now, so nothing jumps; in the character editor dragging the hip then raises or lowers it
function floorRow(i, name, own, ref) {
  const tip = `Off the floor: in ${name} the hip stands at a set height and the feet may leave the floor (a boxer's shuffle, one foot raised); dragging the hip in the editor raises or lowers it. Off: the lowest foot always stands on the floor`;
  const lowest = () => { const ch = currentChar(), L = fk(ch, ch.stances[i].pose, 1); let fy = 0; for (const b of ch.bones) fy = Math.max(fy, L[b.id][1] + (b.shape === 'circle' ? b.len : 0)); return Math.round(fy); };
  const set = v => edit(def => { if (v == null) { delete ref(def).hipH; if (!i) pruneMain(def); } else ref(def).hipH = v; }, 'hipH');
  return [h('div', { cls: 'row', tip }, h('span', {}, ...rich(':footprint: floor')), h('span', { cls: 'bar' },
    toggle(':air: off the floor', tip, () => own()?.hipH != null, v => { set(v ? lowest() : null); panels(); }))),
    own()?.hipH != null ? slider('hip height', { min: 0, max: 160, step: 1 }, () => own()?.hipH ?? 0, v => set(v), `How high the hip stands above the floor in ${name} (px)`) : null];
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
    show(h('div', { cls: 'row', tip: 'Limbs this stance adds or takes away' }, h('span', { textContent: 'grow' }),
      toggle(':accessibility_new: grow limbs', 'Grow: a limb the new stance adds grows out of its parent joint by joint (thickness too), and one it loses pulls back in from the tip; a bone\'s own blend delay still wins', () => !!mo('grow'), v => set({ grow: !!v }))), 'auto'),
    show(h('div', { cls: 'row', tip: 'How the blend eases' }, h('span', { textContent: 'ease' }), seg(['linear', 'inOutCubic', 'outQuad', 'outBack', 'bezier'], () => mo('ease'), v => set({ ease: v }),
      { linear: 'Even', inOutCubic: 'Slow in and out (the default)', outQuad: 'Fast, then settles', outBack: 'Overshoots, then settles',
        bezier: 'Your own curve: drag the two handles in the graph below (above the box overshoots, below it anticipates; double-click resets)' })), 'auto'),
    only(() => mo('mode') === 'auto' && mo('ease') === 'bezier', bezierGraph(() => ({ e: mo('ease'), bz: mo('bz') }), (v, key) => set({ bz: v }, key && 'morph:bz'))),
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
  const picker = colorInput(curCol() || '#222222', set, 'Any colour, not just the presets');
  reg(picker, () => { picker.value = curCol() || '#222222'; });
  return h('div', { cls: 'row', tip: 'This character\'s own colour. Auto: coloured by player slot instead, like every character before this existed.' },
    h('span', {}, ...rich(':palette: colour')), h('span', { cls: 'bar' },
      seg(Object.keys(CHAR_COLS), cur, k => set(CHAR_COLS[k]), { ...Object.fromEntries(Object.keys(CHAR_COLS).map(k => [k, k === 'auto' ? CHAR_COL_TIPS.auto : `This character is always ${k}`])) }),
      picker));
}
