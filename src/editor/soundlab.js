'use strict';
// (split from src/editor/editor.js: the sounds, looks and tracker editors of the fx tab)
// ---------- sounds: every one is tunable, built-ins included (revert goes back to the shipped values) ----------
let soundSel = null;
function duplicateSound(from) {
  let n = 1; while (SOUNDS[from + n]) n++;
  const name = from + n; saveSound(name, { ...SOUNDS[from] }); soundSel = name; return name;
}
const SOUND_FIELD_TIPS = { noise: 'The noise layer\'s filter type, or none for no noise layer', nf0: 'Noise filter start frequency (Hz)',
  nf1: 'Noise filter end frequency (Hz), swept over the sound\'s duration', ngain: 'Noise layer volume',
  q: 'Noise filter resonance: higher narrows and emphasises the band around the filter frequency (a whistly, ringing noise)',
  tone: 'The tone layer\'s oscillator waveform, or none for no tone layer', tf0: 'Tone start frequency (Hz)',
  tf1: 'Tone end frequency (Hz), swept over the sound\'s duration', tgain: 'Tone layer volume',
  detune: 'Tone pitch offset in cents (100 = a semitone): a quick way to try a variant without retyping both frequencies',
  attack: 'Ramp-up time before the decay starts (0: an instant hard onset, like every built-in)', dur: 'Total length, in seconds' };
// the sound's actual rendered waveform (noise + tone layers, gain and all), redrawn whenever the preset it was built for changes
function soundWave(name) {
  const cv = h('canvas', { width: 280, height: 60, cls: 'wave' });
  (async () => {
    const s = SOUNDS[name]; if (!s) return;
    let data; try { data = await renderSound(s); } catch { return; }
    if (!cv.isConnected || SOUNDS[name] !== s) return; // the panel moved on (deleted, or another edit already redrew it)
    const ctx = cv.getContext('2d'), w = cv.width, hh = cv.height;
    ctx.clearRect(0, 0, w, hh);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, hh / 2); ctx.lineTo(w, hh / 2); ctx.stroke();
    ctx.strokeStyle = '#4ac1e0'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let x = 0; x < w; x++) { const v = data[Math.floor(x / w * data.length)] || 0, y = hh / 2 - v * (hh / 2 - 2); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  })();
  return cv;
}
function soundFields(name, refill) {
  const s = SOUNDS[name], built = name in BASE_SOUNDS, set = (k, v) => { saveSound(name, { ...SOUNDS[name], [k]: v }); refill(); };
  // a built-in keeps its name (other moves already reference it by that name); only a custom one can rename or disappear for good
  const nm = built ? h('b', { textContent: name }) : h('input', { cls: 'macro', value: name, tip: 'Rename this sound', onkeydown: e => e.stopPropagation(),
    onchange: () => { const v = nm.value.trim(); if (!v || v === name || SOUNDS[v]) { nm.value = name; return; } renameSound(name, v); soundSel = v; refill(); } });
  return h('div', {},
    h('div', { cls: 'bar' }, nm, built ? h('span', { cls: 'note', textContent: 'built-in — tunable, revert to go back' }) : null,
      button(':play_arrow: test', `Play ${name}`, () => playSound(name)),
      button(built ? ':restart_alt: revert' : ':delete: delete', built ? `Back to ${name}'s shipped values` : `Delete ${name}`,
        () => { resetSound(name); if (!built) soundSel = null; refill(); })),
    built ? assetDiffBlock(BASE_SOUNDS[name], s, 'sound') : null,
    soundWave(name),
    h('div', { cls: 'bar' }, h('span', { textContent: 'noise' }), seg(['bandpass', 'lowpass', 'highpass', 'none'], () => s.noise, v => set('noise', v),
      Object.fromEntries(['bandpass', 'lowpass', 'highpass', 'none'].map(v => [v, SOUND_FIELD_TIPS.noise])))),
    slider('noise start', { min: 50, max: 6000, step: 10 }, () => s.nf0, v => set('nf0', v), SOUND_FIELD_TIPS.nf0),
    slider('noise end', { min: 50, max: 6000, step: 10 }, () => s.nf1, v => set('nf1', v), SOUND_FIELD_TIPS.nf1),
    slider('noise gain', { min: 0, max: 1, step: 0.05 }, () => s.ngain, v => set('ngain', v), SOUND_FIELD_TIPS.ngain),
    slider('noise resonance', { min: 0.1, max: 20, step: 0.1 }, () => s.q ?? 1, v => set('q', v), SOUND_FIELD_TIPS.q),
    h('div', { cls: 'bar' }, h('span', { textContent: 'tone' }), seg(['sine', 'square', 'sawtooth', 'triangle', 'none'], () => s.tone, v => set('tone', v),
      Object.fromEntries(['sine', 'square', 'sawtooth', 'triangle', 'none'].map(v => [v, SOUND_FIELD_TIPS.tone])))),
    slider('tone start', { min: 20, max: 2000, step: 5 }, () => s.tf0, v => set('tf0', v), SOUND_FIELD_TIPS.tf0),
    slider('tone end', { min: 20, max: 2000, step: 5 }, () => s.tf1, v => set('tf1', v), SOUND_FIELD_TIPS.tf1),
    slider('tone gain', { min: 0, max: 1, step: 0.05 }, () => s.tgain, v => set('tgain', v), SOUND_FIELD_TIPS.tgain),
    slider('tone detune', { min: -1200, max: 1200, step: 10 }, () => s.detune ?? 0, v => set('detune', v), SOUND_FIELD_TIPS.detune),
    slider('attack', { min: 0, max: 0.3, step: 0.01 }, () => s.attack, v => set('attack', v), SOUND_FIELD_TIPS.attack),
    slider('duration', { min: 0.02, max: 1, step: 0.01 }, () => s.dur, v => set('dur', v), SOUND_FIELD_TIPS.dur));
}
function soundsPanel() {
  const wrap = h('div', { cls: 'mtable' }), body = h('div');
  const fill = () => {
    if (soundSel && !SOUNDS[soundSel]) soundSel = null;
    const row = n => h('div', { cls: 'bar' + (soundSel === n ? ' on' : ''), onclick: () => { soundSel = n; fill(); } },
      h('b', { textContent: n }), n in BASE_SOUNDS ? h('span', { cls: 'note', textContent: 'built-in' }) : null,
      button(':play_arrow:', `Play ${n}`, e => { e.stopPropagation(); playSound(n); }, 'mini'));
    body.replaceChildren(...Object.keys(SOUNDS).map(row), h('h4', { textContent: soundSel || 'pick a sound' }),
      soundSel ? soundFields(soundSel, fill) : h('p', { cls: 'note', textContent: 'click a sound above to hear it, tune it, or tune a copy of it' }));
  };
  // a fx-tab view (src/editor/fxlab.js), not a toggleable stage panel: no close button, there's nothing to close to
  wrap.append(h('div', { cls: 'bar stagehead' }, h('b', { textContent: 'sounds', tip: 'Every sound is synthesized live (no files). A slider per parameter, built-ins included — revert goes back to a built-in\'s shipped values. A custom (or customized) sound plays anywhere that name is picked (the key events row).' }),
    button(':add: new sound', 'A new sound, copied from whoosh', () => { duplicateSound('whoosh'); fill(); })), body);
  fill();
  return wrap;
}
// ---------- looks: fx look definitions and tunables used by the fx tab (src/editor/fxlab.js), which has its own gallery,
// preview and editor UI now — this just keeps the data every look needs (a custom look's defaults and its 8 sliders,
// the 3 particle shapes) and the "new look" action, shared with the fx toolbar ----------
const DEFAULT_LOOK = { count: 6, life: 0.5, speed: 60, spread: 40, angle: -90, gravity: 200, size0: 3, size1: 0, shape: 'dot', col: 'white', back: false };
function newLook() {
  let n = 1; while (FX_LOOKS['custom' + n]) n++;
  const name = 'custom' + n; saveLook(name, { ...DEFAULT_LOOK }); return name;
}
const LOOK_SHAPE_TIPS = { dot: 'A filled circle', line: 'A short trailing streak (sparks, speed lines)', ring: 'A stroked ring (an expanding shockwave)' };
// a custom look's own knobs: [key, { min, max, step }, tip, label?]
const CUSTOM_SLIDERS = [
  ['count', { min: 1, max: 20, step: 1 }, 'Particles spawned per point along the wrapped bones, looping'],
  ['life', { min: 0.1, max: 2, step: 0.05 }, 'One particle\'s lifetime in seconds before it loops'],
  ['speed', { min: 0, max: 300, step: 5 }, 'Launch speed (px/s)'],
  ['spread', { min: 0, max: 360, step: 5 }, 'Random spread around the launch angle, in degrees'],
  ['angle', { min: -180, max: 180, step: 5 }, 'Launch angle, in degrees (-90: straight up, 0: forward, along facing)'],
  ['gravity', { min: -400, max: 600, step: 10 }, 'Downward acceleration (px/s²); negative floats upward'],
  ['size0', { min: 0, max: 12, step: 0.5 }, 'Size at birth', 'size start'],
  ['size1', { min: 0, max: 12, step: 0.5 }, 'Size at the end of its life (0: shrinks to nothing)', 'size end'],
];
// ---------- tracker: a simple step sequencer (rows of sounds, a grid of beats) that loops at a tempo ----------
let trackSel = null;
function newTrack() {
  let n = 1; while (myTracks['track' + n]) n++;
  const name = 'track' + n; saveTrack(name, { bpm: 120, steps: 16, rows: [newRow()] }); trackSel = name; return name;
}
function trackFields(name, refill) {
  // every mutator reads myTracks[name] fresh (not a captured copy): refill() fully rebuilds this panel on every edit
  // (like soundFields), so a stale closure from a previous build must never write back an outdated snapshot
  const t = myTracks[name], playingThis = () => tracker.playing && tracker.name === name;
  const set = (k, v) => { saveTrack(name, { ...myTracks[name], [k]: v }); refill(); };
  const setRow = (i, k, v) => { saveTrack(name, { ...myTracks[name], rows: myTracks[name].rows.map((r, j) => j === i ? { ...r, [k]: v } : r) }); refill(); };
  const setSteps = n => { const live = myTracks[name];
    saveTrack(name, { ...live, steps: n, rows: live.rows.map(r => ({ ...r, cells: Array.from({ length: n }, (_, i) => r.cells[i] ?? null) })) }); refill(); };
  const nm = h('input', { cls: 'macro', value: name, tip: 'Rename this track', onkeydown: e => e.stopPropagation(),
    onchange: () => { const v = nm.value.trim(); if (!v || v === name || myTracks[v]) { nm.value = name; return; } renameTrack(name, v); trackSel = v; refill(); } });
  const grid = h('table', { cls: 'trk' });
  const rowTr = (row, i) => h('tr', {},
    h('td', {}, button(row.sound, 'Sound for this row (click to change)', (e, el) => popup(el, seg(Object.keys(SOUNDS), () => row.sound, v => { closePop(); setRow(i, 'sound', v); },
      Object.fromEntries(Object.keys(SOUNDS).map(s => [s, s])))), 'mini')),
    ...row.cells.map((v, c) => { const on = v != null;
      const b = button(on && v ? (v > 0 ? `+${v}` : `${v}`) : '', `${row.sound} · step ${c + 1} (click: toggle, scroll over it: pitch, playing: highlighted)`,
        () => setRow(i, 'cells', myTracks[name].rows[i].cells.map((x, k) => k === c ? (x == null ? 0 : null) : x)), 'mini cell' + (on ? ' on' : ''));
      b.dataset.col = c;
      b.onwheel = e => { if (myTracks[name].rows[i].cells[c] == null) return; e.preventDefault();
        const cs = myTracks[name].rows[i].cells.slice(); cs[c] = clamp((cs[c] || 0) - Math.sign(e.deltaY), -12, 12); setRow(i, 'cells', cs); };
      return h('td', {}, b);
    }),
    h('td', { cls: 'bar' },
      button(':select_all:', row.cells.every(v => v != null) ? 'Turn every step in this row off' : 'Turn every step in this row on',
        () => { const allOn = row.cells.every(v => v != null); setRow(i, 'cells', row.cells.map(v => allOn ? null : (v ?? 0))); }, 'mini'),
      button(':swap_horiz:', 'Invert this row: on steps off, off steps on', () => setRow(i, 'cells', row.cells.map(v => v == null ? 0 : null)), 'mini'),
      button(':casino:', 'Randomize this row (keeps each step\'s pitch, picks which are on)', () => setRow(i, 'cells', row.cells.map(v => Math.random() < 0.5 ? (v ?? 0) : null)), 'mini'),
      button(':delete:', 'Remove this row', () => { saveTrack(name, { ...myTracks[name], rows: myTracks[name].rows.filter((_, j) => j !== i) }); refill(); }, 'mini')));
  grid.append(h('thead', {}, h('tr', {}, h('th', {}), ...Array.from({ length: t.steps }, (_, c) => h('th', { cls: 'stepnum', textContent: c + 1 })), h('th', {}))),
    h('tbody', {}, t.rows.map(rowTr)));
  const paint = () => { if (!grid.isConnected) return; const cur = curStep(myTracks[name] || t);
    for (const c of grid.querySelectorAll('.cell')) c.classList.toggle('cur', +c.dataset.col === cur);
    if (playingThis()) requestAnimationFrame(paint); };
  requestAnimationFrame(paint);
  return h('div', {},
    h('div', { cls: 'bar' }, nm,
      button(playingThis() ? ':stop: stop' : ':play_arrow: play', playingThis() ? `Stop ${name}` : `Play ${name} on a loop`,
        () => { playingThis() ? stopTrack() : playTrack(name); refill(); }),
      button(':content_copy: duplicate', `Duplicate ${name}`, () => { trackSel = duplicateTrack(name); refill(); }),
      button(':delete: delete', `Delete ${name}`, () => { deleteTrack(name); trackSel = null; refill(); })),
    slider('tempo', { min: 60, max: 220, step: 1 }, () => t.bpm, v => set('bpm', v), 'Beats per minute'),
    h('div', { cls: 'bar' }, h('span', { textContent: 'steps' }), seg([8, 16, 32], () => t.steps, setSteps,
      { 8: '8 steps', 16: '16 steps (a bar of 4/4)', 32: '32 steps' })),
    grid,
    button(':add: row', 'Add a sound row', () => { const live = myTracks[name]; saveTrack(name, { ...live, rows: [...live.rows, newRow(Object.keys(SOUNDS)[0], live.steps)] }); refill(); }));
}
function trackerPanel() {
  const wrap = h('div', { cls: 'mtable' }), body = h('div');
  const fill = () => {
    if (trackSel && !myTracks[trackSel]) trackSel = null;
    const names = Object.keys(myTracks);
    const tr = n => { const t = myTracks[n], playing = tracker.playing && tracker.name === n;
      return h('tr', { cls: trackSel === n ? 'on' : '', onclick: () => { trackSel = n; fill(); } },
        h('td', { textContent: n }), h('td', { textContent: t.bpm }), h('td', { textContent: t.steps }), h('td', { textContent: t.rows.length }),
        h('td', { cls: 'bar' },
          button(playing ? ':stop:' : ':play_arrow:', playing ? `Stop ${n}` : `Play ${n} on a loop`, e => { e.stopPropagation(); playing ? stopTrack() : playTrack(n); fill(); }, 'mini'),
          button(':content_copy:', `Duplicate ${n}`, e => { e.stopPropagation(); trackSel = duplicateTrack(n); fill(); }, 'mini'),
          button(':delete:', `Delete ${n}`, e => { e.stopPropagation(); deleteTrack(n); if (trackSel === n) trackSel = null; fill(); }, 'mini'))); };
    body.replaceChildren(
      h('table', {}, h('thead', {}, h('tr', {}, ...['name', 'bpm', 'steps', 'rows', ''].map(k => h('th', { textContent: k })))),
        h('tbody', {}, names.length ? names.map(tr) : h('tr', {}, h('td', { colSpan: 5, cls: 'note', textContent: 'no tracks yet' })))),
      h('h4', { textContent: trackSel || 'pick a track' }),
      trackSel ? trackFields(trackSel, fill) : h('p', { cls: 'note', textContent: 'new track starts a 16-step pattern; its rows pick from your sounds' }));
  };
  // a fx-tab view (src/editor/fxlab.js), not a toggleable stage panel: no close button, there's nothing to close to
  wrap.append(h('div', { cls: 'bar stagehead' }, h('b', { textContent: 'tracker', tip: 'A simple step sequencer: each row plays one of your sounds on a loop of steps, at a tempo — a tiny drum machine built from the sounds you\'ve made.' }),
    button(':add: new track', 'A new 16-step track', () => { newTrack(); fill(); })), body);
  fill();
  return wrap;
}
// the move picker (the move group's popup): the moves as cards or a list, grouped, sorted and filtered
function moveList() {
  const pick = n => { closePop(); pickMove(n); }, view = () => lay('animate').movesView || 'cards', list = h('div'), fill = () => {
    const ch = currentChar(), q = anim.filter.trim().toLowerCase(), fd = n => frameData(ch.moves[n], 1);
    const names = Object.keys(ch.moves).filter(n => !q || [n, MOVE_GROUPS[anim.group](ch.moves[n], ch, n), ...moveInputs(ch, n)].join(' ').toLowerCase().includes(q));
    const by = { name: (a, b) => a.localeCompare(b), startup: (a, b) => fd(a).startup - fd(b).startup, damage: (a, b) => moveDamage(ch.moves[b]) - moveDamage(ch.moves[a]) }[anim.sort];
    if (by) names.sort(by);
    const groups = new Map(), rank = g => (GROUP_ORDER.indexOf(g) + 1 || 99);
    for (const n of names) { const g = MOVE_GROUPS[anim.group](ch.moves[n], ch, n); groups.set(g, [...groups.get(g) || [], n]); }
    const tips = Object.fromEntries(names.map(n => { const m = ch.moves[n], d = fd(n);
      return [n, `${d.startup}f startup · ${d.active} active · ${d.recovery} recovery${m.power ? ` · ${fmt(moveDamage(m))} damage · ${m.height || 'mid'}` : ''} · input: ${moveInputs(ch, n).join(' ') || 'none'}`]; }));
    list.replaceChildren(...[...groups].sort((a, b) => rank(a[0]) - rank(b[0])).flatMap(([g, ns]) =>
      [g && h('h4', { textContent: g }), view() !== 'list' ? h('div', { cls: 'cards' }, ns.map(n => moveCard(n, tips[n], pick)))
        : h('div', { cls: 'bar' }, seg(ns, () => anim.move, pick, tips))]));
    if (!names.length) list.replaceChildren(h('div', { cls: 'note', textContent: 'no move matches the filter' }));
    syncAll();
  };
  fill();
  return [
    h('div', { cls: 'row', tip: 'Show the moves as drawn cards or as a compact list of names' }, h('span', { textContent: 'view' }), seg(['cards', 'list'], view, v => { lay('animate').movesView = v; saveLay(); unpeek(); fill(); }, VIEW_TIPS)),
    adv(h('div', { cls: 'row', tip: 'Split the moves into headed groups: by type, limb, height, stance or style' }, h('span', { textContent: 'group' }), seg(Object.keys(MOVE_GROUPS), () => anim.group, v => { anim.group = v; fill(); }, GROUP_TIPS))),
    adv(h('div', { cls: 'row', tip: 'The order of the moves inside each group' }, h('span', { textContent: 'sort' }), seg(Object.keys(SORT_TIPS), () => anim.sort, v => { anim.sort = v; fill(); }, SORT_TIPS))),
    h('div', { cls: 'row', tip: 'Show only moves whose name, group or input contains this text (e.g. kick, air, qcf)' }, h('span', { textContent: 'filter' }),
      h('input', { cls: 'macro filter', value: anim.filter, placeholder: 'name, group or input', oninput: e => { anim.filter = e.target.value; fill(); }, onkeydown: e => e.stopPropagation() })),
    list];
}
const MOVE_BASIC = ['power', 'knock', 'launch', 'stun', 'damage']; // the rest wait behind "more"
const MOVE_VARS = [...MOVE_PROPS, { k: 'height', opts: ['high', 'shigh', 'mid', 'smid', 'low'] }];
function moveHeading() {
  const el = heading('Move', 'What happens on hit. Frame data (60 fps) is in the bar above the timeline.', '');
  el.append(groupOps(MOVE_VARS, k => curMove()[k] ?? (k === 'height' ? 'mid' : 0), k => { const b = builtInMove(); return b ? b[k] : curMove()[k]; },
    vals => edit(def => { const m = def.moves[anim.move]; for (const k in vals) if (vals[k]) m[k] = vals[k]; else delete m[k]; })));
  return el;
}
// + loop / layer: a keyframed idle or walk loop, or a movement layer for a state, for this stance where it has none yet
function addButton() {
  const ch = currentChar(), st = ch.stances[studio.stance].name;
  const loops = ['idle', 'walk'].filter(k => !ch.moves[loopName(ch, studio.stance, k)]), free = Object.keys(LAYERS).filter(k => !ch.moves[loopName(ch, studio.stance, k + 'Layer')]);
  if (!loops.length && !free.length) return null;
  return button(':add: :expand_more:', `A keyframed loop or movement layer for the ${st} stance`, (e, b) => popup(b, h('div', { onclick: closePop },
    loops.length ? h('h4', { textContent: 'loop' }) : null,
    loops.length ? h('div', { cls: 'bar' }, loops.map(k => button(`${loopName(ch, studio.stance, k)} loop`,
      `A keyframed ${k} loop for the ${st} stance, made from the procedural ${k}, to edit like a move; it replaces the procedural ${k} in this stance (delete it to go back)`, () => makeLoop(k)))) : null,
    free.length ? h('h4', { textContent: 'layer' }) : null,
    free.length ? h('div', { cls: 'bar' }, free.map(k => button(k, `${LAYERS[k][0]}: a ${k} layer. Its keys start at the procedural pose of that state and what you change is added on top of the procedural / IK motion while the fighter is in it (the mix slider sets how much; delete it to go back)`, () => makeLayer(k)))) : null)));
}
// an effect stack: up to FX_MAX effects drawn together, each with its look, the bones it wraps (ons; null: one bone), its colour and size
// get: the stored fx (none, one effect or a list); one effect is stored as a plain object, as before stacks.
// inherit: a key's, whose fx can also be "same" (as the keys before or the move say: undefined) or "none" (false)
const FX_COL_TIPS = { auto: 'The look\'s own colour (aura blue, fire orange, lightning cyan, smoke grey)', ...mapVals(FX_COLS, () => 'This colour') };
const fxOns = ch => ['strike', 'body', ...['arm', 'leg', 'head', 'tail', 'weapon'].filter(r => ch.chains[r].length)];
function fxRows(tip, get, set, ons, inherit) {
  const own = () => fxList(get()), put = (l, key) => set(l.length > 1 ? l : l[0] || (inherit ? false : undefined), key);
  const fresh = l => ({ look: Object.keys(FX_LOOKS).find(k => !l.some(e => e.look === k)) || 'aura' }); // a look not used yet
  const add = crud({ new: [`Add an effect (up to ${FX_MAX}): they all draw at once, in this order`, () => {
    const l = inherit && get() === undefined ? inherit() : own(); if (l.length < FX_MAX) put([...l, fresh(l)]); }] });
  reg(add, () => { add.hidden = own().length >= FX_MAX; });
  const none = h('span', { cls: 'note', textContent: 'none' });
  reg(none, () => { none.hidden = own().length > 0; });
  const head = h('div', { cls: 'row', tip }, h('span', {}, ...rich(':auto_awesome: effect')), h('span', { cls: 'bar' },
    inherit ? seg(['same', 'none', 'own'], () => get() === undefined ? 'same' : own().length ? 'own' : 'none',
      v => v === 'same' ? set(undefined) : v === 'none' ? set(false) : !own().length && put(inherit().length ? inherit() : [fresh([])]),
      { same: 'As the keys before (or the move) say', none: 'No effect from this key on', own: 'Its own effects from this key on (starting from the ones playing)' }) : none, add));
  const slot = i => {
    const e = () => own()[i], upd = (k, v, key) => put(own().map((x, j) => j === i ? { ...x, [k]: v } : x), key);
    const swap = d => { const l = own(), j = i + d; if (l[j]) { [l[i], l[j]] = [l[j], l[i]]; put(l); } };
    const up = button(':arrow_upward:', 'Move this effect up the stack: drawn before (under) the ones after it', () => swap(-1), 'mini');
    const down = button(':arrow_downward:', 'Move this effect down the stack: drawn after (over) the ones before it', () => swap(1), 'mini');
    reg(up, () => { up.hidden = !i; }); reg(down, () => { down.hidden = !own()[i + 1]; });
    const rows = [h('div', { cls: 'row', tip: `Effect ${i + 1}: its look (aura and smoke draw behind the body, fire and lightning over it)` }, h('span', { textContent: `fx ${i + 1}` }), h('span', { cls: 'bar' },
        seg(Object.keys(FX_LOOKS), () => e()?.look, v => upd('look', v), FX_LOOKS),
        crud({ delete: ['Remove this effect', () => put(own().filter((_, j) => j !== i))] }, up, down))),
      ons && h('div', { cls: 'row', tip: 'The bones the effect wraps' }, h('span', { textContent: 'fx on' }), seg(ons, () => e()?.on || 'strike', v => upd('on', v), FX_ON)),
      h('div', { cls: 'row', tip: 'The effect\'s colour' }, h('span', { textContent: 'fx colour' }),
        seg(['auto', ...Object.keys(FX_COLS)], () => e()?.col || 'auto', v => upd('col', v === 'auto' ? undefined : v), FX_COL_TIPS)),
      slider('fx size', { min: 0.3, max: 3, step: 0.1 }, () => e()?.size ?? 1, v => upd('size', v === 1 ? undefined : v, 'fx.size' + i), 'How big the effect draws (1 = as designed)'),
      slider('fx speed', { min: 0.2, max: 3, step: 0.1 }, () => e()?.spd ?? 1, v => upd('spd', v === 1 ? undefined : v, 'fx.spd' + i), 'How fast the effect animates (1 = as designed)')].filter(Boolean);
    for (const r of rows) reg(r, () => { r.hidden = !e(); });
    return rows;
  };
  return [head, ...Array.from({ length: FX_MAX }, (_, i) => slot(i)).flat()];
}
function movePanel() {
  // the striking bone: the limb ends as buttons, any other bone from the popup or by Shift+clicking its joint
  // click = strike with this bone only, Shift+click = add or remove it (several limbs strike at once)
  const m = () => curMove(), boneB = (id, tip) => { const b = button(id, tip, e => pickHit(id, e.shiftKey)); reg(b, () => b.classList.toggle('on', hitIds(m()).includes(id))); return b; };
  const hitB = button('', 'Any other bone as the strike (or Shift+click its joint in the editor)', (e, b) =>
    popup(b, h('div', { cls: 'bar' }, h('span', { cls: 'seg' }, edChar().ids.map(id => boneB(id, `Strike with ${id} · Shift+click: add or remove it`))))));
  reg(hitB, () => { const off = hitIds(m()).filter(id => !edChar().tips.some(b => b.id === id)); setRich(hitB, off.join(' ') || (hitIds(m()).length ? ':more_horiz:' : 'none')); });
  const tipSeg = h('span', { cls: 'seg' }, edChar().tips.map(b => boneB(b.id, `Strike with the end of ${b.id} (${b.role}) · Shift+click: add or remove it, so several limbs strike`)));
  const bindB = button('', 'Inputs that trigger this move. Click to bind it to other inputs (copies of moves become playable this way).', (e, b) =>
    popup(b, h('div', { cls: 'bar' }, Object.keys(slotsOf(CFG.plane)).map(s => toggle(s, `${SLOT_TIPS[s]} · now: ${curBinds(edChar())[s] || 'none'}`, () => curBinds(edChar())[s] === anim.move, () => toggleBind(s))))));
  reg(bindB, () => { setRich(bindB, boundSlots().join(' ') || 'none (combo only)'); });
  return [moveHeading(),
    m().ref ? slider('mix', { min: 0, max: 1, step: 0.05 }, () => m().mix ?? 1, v => setMove('mix', v === 1 ? undefined : v, 'm.mix'),
      'Layer strength: how much of this layer\'s offsets (its keys minus the procedural pose it was made from) is added on top of the procedural / IK motion in a fight. 0 = off, 1 = as keyed') : null,
    h('div', { cls: 'row', tip: 'Striking bones: each end is a strike (in limb mode the whole bone); with several, the one that lands counts, one hit per target. Shift+click a joint in the editor to pick it, ⌘/Ctrl+Shift+click to add or remove it.' },
      h('span', { textContent: 'hit' }), h('span', { cls: 'bar' }, tipSeg, hitB)),
    h('div', { cls: 'row', tip: 'Which inputs start this move in a fight' }, h('span', { textContent: 'input' }), h('span', { cls: 'bar' }, bindB,
      button(':stadia_controller:', 'All inputs: which directions and buttons have no move, and what each one starts', () => openStage('inputs'), 'mini')),
      seg(['2d', '25'], () => CFG.plane === '2d' ? '2d' : '25', v => { setCfg({ plane: v === '2d' ? '2d' : 'lanes' }); panels(); mode().restart(); },
        { '2d': '2D moveset: ↑ jumps, air moves by direction (also sets the plane setting)', '25': '2.5D moveset (VF-style): every direction × button is a ground move, Space jumps (also sets the plane to lanes)' },
        v => v === '2d' ? '2D' : '2.5D')),
    h('div', { cls: 'row', tip: 'Where the move is aimed; a hit reaction still follows the actual impact point' }, h('span', { textContent: 'height' }),
      seg(['high', 'shigh', 'mid', 'smid', 'low'], () => m().height, v => setMove('height', v), HEIGHT_TIPS)),
    subFold(':auto_awesome: move fx', fxRows('Effects drawn on the move\'s bones while it plays (a key can change them from there on); drawing only, the fight is the same',
      () => m().fx, (e, key) => setMove('fx', e, key), fxOns(edChar()))),
    adv(h('div', { cls: 'row', tip: 'Hits: the states of the foe this move can hit (hits; all lit = any); a lying foe: the otg flag' }, h('span', { textContent: 'hits' }), h('span', { cls: 'bar' },
      ...Object.entries(HITS_TIPS).map(([s, tip]) => toggle(s, tip, () => (m().hits || HIT_STATES).includes(s),
        v => { const next = HIT_STATES.filter(x => x === s ? v : (m().hits || HIT_STATES).includes(x)); setMove('hits', next.length === HIT_STATES.length ? undefined : next); }))))),
    ...MOVE_PROPS.map(p => { const r = slider(p.k, p, () => m()[p.k] ?? p.def ?? 0, v => setMove(p.k, v === (p.def ?? 0) ? undefined : v, 'm.' + p.k), p.tip); return MOVE_BASIC.includes(p.k) ? r : adv(r); }),
    h('div', { cls: 'bar' }, Object.entries(MOVE_FLAGS).map(([f, tip]) => toggle(f, tip, () => !!m()[f], v => setMove(f, v || undefined)))),
    throwRow(),
    ...(m().throw ? holdOptionsRows() : []),
    counterRow(),
    isThrowTarget() ? holdRow() : null,
    ...keyPanel(),
    ...charPanel(),
  ];
}

// the moves toolbar (character and animate tabs): any move opened in animate; the move table, inputs and combos are stage panels (panels group)
function movesGrp() {
  const pick = button(':timeline: edit :expand_more:', 'Pick a move to open in the keyframe editor (animate)', (e, b) =>
    popup(b, h('div', { cls: 'bar' }, Object.keys(currentChar().moves).sort().map(n => button(n, `Open ${n} in the keyframe editor`, () => { closePop(); openMove(n); })))));
  return grp('moves', 'The character\'s moves: pick one to open in the keyframe editor (or click a move in the table, inputs or combos)', pick);
}
const MOVE_PANELS = ['table', 'dope', 'inputs', 'combos'],
  moveStage = () => ({ table: moveTable, dope: dopeSheet, inputs: inputTable, combos: comboView })[stageOpen()];
// the move toolbar (animate): previous / next, the move being edited with the picker, its actions and the stance
function moveGrp() {
  const ch = currentChar(), names = Object.keys(ch.moves), step = d => pickMove(names[(names.indexOf(anim.move) + d + names.length) % names.length]);
  const cur = button('', 'The move being edited: click to pick another (cards or a list, grouped, sorted, filtered)', (e, b) => {
    popup(b, h('div', { cls: 'movepop' }, ...moveList())); pop?.querySelector('.filter').focus();
  });
  reg(cur, () => setRich(cur, `${anim.move} :expand_more:`));
  const st = ch.stances.map(s => s.name);
  return grp('move', 'The move being edited. Copies can be tuned freely; the built-in names are the ones the controls trigger. Enter play/pause · O onion · I aim',
    button(':chevron_left:', 'Previous move', () => step(-1), 'mini'), cur, button(':chevron_right:', 'Next move', () => step(1), 'mini'),
    crud({ copy: ['New move copied from this one, named with a number (jab → jab2); undoable', copyMove], export: ['Export this move as a file (JSON)', exportMove], delete: ['Delete this move and its binds (only copies; built-ins stay); undoable', deleteMove] }, addButton()),
    st.length > 1 ? seg(st.map((_, i) => i), () => studio.stance, i => { studio.stance = i; panels(); mode().restart(); },
      Object.fromEntries(st.map((n, i) => [i, `Stance ${n}: the one the input and loop edits change and previews start in (stances are made in the character tab)`])), i => st[i]) : null);
}
function animCtx() {
  return [charStancePicker(), moveGrp(), showGrp(['boxes', 'ghost', 'colours']), panelsGrp(MOVE_PANELS, VIEW_TIPS)];
}
const CMP_TIPS = { off: 'Off: show only the move being edited', overlay: 'The compared move drawn over this one in amber, at the same moment',
  strip: 'Filmstrip: this move and the compared one frame by frame on one time scale, tinted by phase (click a frame to go there)' };
// under the preview (there is a lot of empty space there), not the toolbar — it only matters while watching the preview
function compareBar() {
  const pick = button('', 'The move to compare with', () => pickCompare(pick), 'mini');
  reg(pick, () => setRich(pick, `:theaters: ${cmpMove() ? anim.cmp : 'pick'}`));
  return h('div', { cls: 'over cmpbar' }, pick,
    seg(Object.keys(CMP_TIPS), () => anim.cmpView, v => { anim.cmpView = v; if (v === 'overlay' && !cmpMove()) pickCompare(pick); }, CMP_TIPS));
}
function pickCompare(anchor) {
  const ch = currentChar(), groups = new Map(), rank = g => (GROUP_ORDER.indexOf(g) + 1 || 99);
  for (const n of Object.keys(ch.moves)) { const g = MOVE_GROUPS[anim.group](ch.moves[n], ch, n); groups.set(g, [...groups.get(g) || [], n]); }
  const set = v => { anim.cmp = v; if (anim.cmpView === 'off') anim.cmpView = 'overlay'; closePop(); };
  const btn = n => { const b = button(n, `Compare with ${n}: overlay or filmstrip, as picked in the toolbar`, () => set(n));
    b.onmousemove = e => peekMove(n, e); b.onmouseleave = unpeek;
    reg(b, () => b.classList.toggle('on', anim.cmp === n)); return b; };
  popup(anchor, h('b', { textContent: 'compare with' }), ...[...groups].sort((a, b) => rank(a[0]) - rank(b[0]))
    .flatMap(([g, ns]) => [g && h('h4', { textContent: g }), h('div', { cls: 'bar' }, ns.map(btn))]));
}

// controls over the canvas: transport and key edits above the timeline, the preview's target under the preview
function timelineBar() {
  const play = button('', 'Play / pause the move in the preview' + keyTip('playMove'), () => { anim.playing = !anim.playing; }, 'mini');
  reg(play, () => { setRich(play, anim.playing ? ':pause:' : ':play_arrow:'); });
  const frames = h('span', { cls: 'v', tip: 'Length of the selected key in 60 fps frames' }), fd = h('span', { cls: 'fd' });
  reg(frames, () => { frames.textContent = `${Math.round(curMove().keys[anim.key].d * 60)}f`; });
  reg(fd, () => { const d = frameData(curMove(), 1); fd.textContent = `${d.startup} · ${d.active} · ${d.recovery}f`;
    fd.dataset.tip = `Frame data (60 fps): ${d.startup} startup · ${d.active} active · ${d.recovery} recovery`; });
  const b = (l, tip, f) => button(l, tip, f, 'mini');
  return h('div', { cls: 'over tlbar' },
    b(':skip_previous:', 'Select the first key', () => selectKey(0)), b(':chevron_left:', 'Select the previous key' + keyTip('prevKey'), () => selectKey(anim.key - 1)),
    b(':fast_rewind:', 'Step back one 60 fps frame (paused, the preview follows along)' + keyTip('frameBack'), () => stepFrame(-1)), play, b(':fast_forward:', 'Step forward one 60 fps frame (paused, the preview follows along)' + keyTip('frameFwd'), () => stepFrame(1)),
    b(':chevron_right:', 'Select the next key' + keyTip('nextKey'), () => selectKey(anim.key + 1)), b(':skip_next:', 'Select the last key', () => selectKey(curMove().keys.length - 1)),
    h('span', { cls: 'sep' }),
    b(':add: key', 'Insert a key after the selected one, starting from its pose', addKey),
    b(':content_cut: split', 'Split the selected key in two at its middle (double-click a key: split it there)', () => splitKey(keyStart(curMove(), anim.key) + curMove().keys[anim.key].d / 2)),
    b(':delete:', 'Delete the selected key (undoable)' + keyTip('deleteBone'), deleteKey),
    h('span', { cls: 'sep' }),
    b(':remove:', 'Make the selected key one frame shorter: the move gets quicker', () => keyFrames(-1)), frames, b(':add:', 'Make the selected key one frame longer: the move gets slower', () => keyFrames(1)),
    h('span', { cls: 'sep' }),
    toggle(':layers:', 'Onion skin: ghosts of the previous (blue) and next (green) keys' + keyTip('onion'), () => anim.onion, v => { anim.onion = v; }),
    toggle(':my_location:', 'Aim: the striking limb follows the cursor through IK; click to set the pose. Double-click any joint to make that one follow' + keyTip('aim'), () => anim.aim, v => { anim.aim = v; anim.aimId = null; }),
    seg(Object.keys(REACH_TIPS), () => anim.reach, v => { anim.reach = v; }, REACH_TIPS),
    fd);
}
function targetBar() {
  const tg = anim.target, set = (k, v) => { tg[k] = v; anim.t = 0; anim.playing = true; buildPreview(); };
  const who = button('', 'The character the preview\'s move is played against (same: the one being edited)', (e, b) =>
    popup(b, h('div', { cls: 'bar' }, seg([null, ...Object.keys(DEFS)], () => tg.char, v => { set('char', v); closePop(); }, { null: 'The character being edited' }, v => v ?? 'same'))), 'mini');
  reg(who, () => { setRich(who, ':person: ' + (tg.char && DEFS[tg.char] ? tg.char : 'same')); });
  const sg = (k, opts) => seg(opts, () => tg[k], v => set(k, v), TARGET_TIPS);
  const speedTips = { 0.25: 'Quarter speed', 0.5: 'Half speed', 1: 'Real time', 2: 'Double speed' };
  return h('div', { cls: 'over tgt', tip: 'The preview\'s target: who, how it stands, its state, facing and distance; changing it restarts the preview' }, who, sg('stance', Object.keys(STANCES)), sg('state', ['idle', 'jump', 'air', 'down', 'dizzy']), sg('facing', ['toward', 'away']), sg('dist', ['near', 'far']),
    h('span', { cls: 'sep' }),
    toggle(':repeat:', 'Loop the preview when the move ends; off: play once and hold the last frame', () => anim.pvLoop, v => { anim.pvLoop = v; anim.pv.loop = v; }),
    toggle(':flash_on:', 'Hit stop, screen shake and juice in the preview; off: a clean, undisturbed look at the raw motion', () => anim.pvFx, v => { anim.pvFx = v; buildPreview(); }),
    CHAR_DEFS[CURRENT] ? toggle(':compare_arrows:', 'Side by side: the built-in move (before) next to your edited one (after), same move, same moment. Record it with the clips toolbar to export the comparison',
      () => anim.cmpOld, v => { anim.cmpOld = v; buildPreview(); previewAt(anim.t); }) : null,
    seg(Object.keys(speedTips).map(Number), () => anim.pvSpeed, v => { anim.pvSpeed = v; }, speedTips, v => ({ 0.25: '¼×', 0.5: '½×', 1: '1×', 2: '2×' })[v]),
    h('span', { cls: 'sep' }),
    button(':sports_kabaddi: send to play', 'Jump into Play against this target, keyboard in hand', () => sendToPlay('you vs ai', tg.char), 'mini'));
}

const animMode = {
  preview: () => anLayout().pv,
  clipRects: () => [{ key: 'preview', r: anLayout().pv }],
  enter() { if (!curMove()) anim.move = Object.keys(currentChar().moves)[0]; selectKey(Math.min(anim.key, curMove().keys.length - 1)); anim.playing = true; buildPreview(); },
  restart() { anim.t = 0; buildPreview(); },
  // playing/paused is the preview's own clock: it keeps looping (or holding, paused) regardless of which
  // key you've selected or scrubbed to in the editor below it (that only moves the editor's own cursor)
  worlds: () => (anim.hold || !anim.playing) ? [] : anim.pvOld ? [anim.pv, anim.pvOld] : [anim.pv],
  // scrub: mouse x = time through the move; paused, the preview re-simulates to the same moment; playing, it keeps running
  scrub(f) { const m = curMove(); anim.t = f * (total(m) - 1e-6); anim.key = keyAt(m, anim.t); if (!anim.playing) previewAt(anim.t); },
  changed() { if (anim.drag) previewAt(anim.t); else buildPreview(); },
  render() {
    clear(); drawAnimEditor(); drawTimeline();
    if (anim.pvOld) {
      const [ro, rn] = cellRects(2, 2, anLayout().pv);
      drawCell({ w: anim.pvOld, label: 'before (built-in)' }, ro, { plot: false });
      drawCell({ w: anim.pv, label: 'after (edited)' }, rn, { plot: false });
    } else drawCell({ w: anim.pv, label: 'preview (springs + hit stop)' }, anLayout().pv, { plot: false });
  },
  ctxBar: animCtx,
  split: () => true,
  side: movePanel,
  open: ['move', 'key'],
  overlay: () => moveStage() ? [moveStage()()] : [timelineBar(), compareBar(), targetBar()],
  mouse: animMouse,
  key: animKey,
  hint: () => 'drag a joint: IK · Alt+drag: one bone · timeline: click a key to select, drag it to reorder, drag its edge to retime, double-click to split, drag the ruler to scrub · , . frame step · Delete key',
};
