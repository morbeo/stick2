'use strict';
// ---------- grid mode: a configurable content-manager browser (characters, moves) ----------
// a thin link-out layer over the existing editors, not a duplicate editing UI: pick a collection, pick which
// variables show on each tile (autocomplete over that collection's own already-documented fields), click a tile to
// open it where it's actually edited (character tab, animate). DOM cards (charCard/moveCard), not a canvas gallery:
// these are static data to browse, not animating effects (see src/fxlab.js for the canvas-gallery pattern used there)
const GRID_STORE = 'stick2.grid';
const gridStore = (() => { try { return JSON.parse(localStorage.getItem(GRID_STORE)) || {}; } catch { return {}; } })();
const gridState = { collection: gridStore.collection || 'characters', filter: '', cols: gridStore.cols || 4,
  fields: { characters: ['speed', 'weight', 'health'], moves: ['damage', 'startup', 'active'], ...gridStore.fields } };
function saveGridStore() { try { localStorage.setItem(GRID_STORE, JSON.stringify({ collection: gridState.collection, cols: gridState.cols, fields: gridState.fields })); } catch {} }

// every character's own stats (CHAR_STATS, rig.js) plus a few basics, each a documented { k, tip, get(name) } —
// no new registry: these are the exact tables the stats panel and radar graph already read from
const CHAR_BASE_FIELDS = [
  { k: 'bones', tip: 'Number of bones', get: n => CHARS[n].bones.length },
  { k: 'moves', tip: 'Number of moves', get: n => Object.keys(CHARS[n].moves).length },
  { k: 'stances', tip: 'Number of stances', get: n => CHARS[n].stances.length },
];
const charFields = () => [...CHAR_BASE_FIELDS, ...CHAR_STATS.map(s => ({ k: s.k, tip: s.tip, get: n => fmt(CHARS[n].stats[s.k]) }))];
// the current character's own moves: every move-table column (TABLE_COLS, editor.js) is already a documented getter
const moveFields = () => TABLE_COLS.filter(c => c.k !== 'name').map(c => ({ k: c.k, tip: c.tip, get: n => { const ch = currentChar(); return c.get(ch.moves[n], n, ch); } }));

// a scenario's own few fields: its group (same grouping the picker popup uses), length, and each side's controller
const scenGridFields = () => [
  { k: 'group', tip: 'Which group it\'s listed under in the picker', get: k => scenGroup(k) },
  { k: 'period', tip: 'Scripted length in seconds (it loops); 0 = free play, not scripted', get: k => SCENARIOS[k].period ?? 0 },
  { k: 'a', tip: 'Fighter 1\'s controller', get: k => typeof SCENARIOS[k].a === 'string' ? SCENARIOS[k].a : 'script' },
  { k: 'b', tip: 'Fighter 2\'s controller', get: k => typeof SCENARIOS[k].b === 'string' ? SCENARIOS[k].b : 'script' },
];
// a plain text card for collections with no live thumbnail (sounds, tracks): name, a badge line, click to open
function simpleCard(name, badge, onClick, isOn) {
  const b = h('button', { cls: 'card', onclick: onClick }, h('span', { textContent: name }), h('span', { cls: 'gbadge', textContent: badge }));
  reg(b, () => b.classList.toggle('on', isOn()));
  return b;
}
const GRID_COLLECTIONS = {
  characters: { tip: 'Every built-in and custom character', items: () => Object.keys(DEFS), fields: charFields,
    card: k => gridCard(charCard(k, kk => { pickChar(kk); setMode('character'); }, kk => CURRENT === kk), k, charFields()) },
  moves: { tip: 'The current character\'s moves', items: () => Object.keys(currentChar().moves), fields: moveFields,
    card: n => gridCard(moveCard(n, `Open ${n} in the keyframe editor`, openMove), n, moveFields()) },
  scenarios: { tip: 'Built-in and your own scenarios', items: () => Object.keys(SCENARIOS), fields: scenGridFields,
    card: k => gridCard(simpleCard(k, k in BASE_SCENARIOS ? 'built-in' : 'yours', () => { lab.scen = k; setMode('play'); }, () => lab.scen === k), k, scenGridFields()) },
  sounds: { tip: 'Every sound (built-in and custom)', items: () => Object.keys(SOUNDS), fields: () => [],
    card: k => simpleCard(k, k in BASE_SOUNDS ? 'built-in' : 'custom', () => { soundSel = k; setMode('sounds'); }, () => soundSel === k) },
  looks: { tip: 'Every fx look (built-in and custom)', items: () => Object.keys(FX_LOOKS), fields: () => [],
    card: k => { const b = h('button', { cls: 'card', onclick: () => { fxState.sel = k; fxState.zoom = true; setMode('fx'); } }, fxCanvas(60, k), h('span', { textContent: k }));
      reg(b, () => b.classList.toggle('on', fxState.sel === k)); return b; } },
  tracks: { tip: 'Your tracker patterns', items: () => Object.keys(myTracks), fields: () => [],
    card: k => simpleCard(k, `${myTracks[k].bpm} bpm · ${myTracks[k].steps} steps`, () => { trackSel = k; setMode('tracker'); }, () => trackSel === k) },
};
// overlays the collection's chosen fields inside the card's own bounds, one per corner (cycling if more than
// 4 are picked), instead of stacking them below the name and growing the cell (charCard/moveCard both end in
// one name <span>; appending more afterward is safe since their own reg() only ever touches the canvas and the .on class)
const GFIELD_CORNERS = ['tl', 'tr', 'bl', 'br'];
function gridCard(card, key, fields) {
  (gridState.fields[gridState.collection] || []).forEach((k, i) => {
    const f = fields.find(x => x.k === k);
    if (f) card.append(h('span', { cls: `gfield ${GFIELD_CORNERS[i % 4]}`, textContent: `${k}: ${f.get(key)}` }));
  });
  return card;
}
// type → fuzzy, ranked suggestions (paletteRank, palette.js) → click to add; the same idiom as the scenario
// builder's settings/move-limit finders (src/scenarios.js), scoped to the current collection's own fields
function gridFieldPicker() {
  const fields = GRID_COLLECTIONS[gridState.collection].fields(), chosen = gridState.fields[gridState.collection] ??= [];
  const list = h('div', { cls: 'plist' });
  const inp = h('input', { cls: 'macro', placeholder: 'add a variable…', tip: 'Fuzzy search over every documented variable this collection has',
    oninput: fill, onkeydown: e => { e.stopPropagation(); if (e.key === 'Escape') { inp.value = ''; fill(); } } });
  function fill() {
    const q = inp.value.trim();
    const shown = fields.filter(f => !chosen.includes(f.k)).map(f => [paletteRank(q, { name: f.k, tip: f.tip, kind: '' }), f])
      .filter(([r]) => r > 0).sort((a, b) => b[0] - a[0]).slice(0, 8).map(([, f]) => f);
    list.replaceChildren(...shown.map(f => h('div', { cls: 'pitem', onmousedown: ev => { ev.preventDefault(); chosen.push(f.k); saveGridStore(); inp.value = ''; panels(); } },
      h('b', { textContent: f.k }), h('span', { cls: 'pt' }, ...rich(f.tip || '')))));
  }
  fill();
  return h('div', {},
    h('div', { cls: 'bar' }, ...chosen.map(k => h('span', { cls: 'chip', style: 'background:#6f6a5c' }, k,
      button(':close:', `Remove ${k}`, () => { chosen.splice(chosen.indexOf(k), 1); saveGridStore(); panels(); }, 'mini')))),
    inp, list);
}
function gridCards() {
  const col = GRID_COLLECTIONS[gridState.collection], items = col.items(), fields = col.fields(), shownKeys = gridState.fields[gridState.collection] || [];
  const q = gridState.filter.trim();
  const matches = k => !q || fuzzy(q, [k, ...shownKeys.map(fk => fields.find(f => f.k === fk)?.get(k))].join(' '));
  return h('div', { cls: 'cards', style: `grid-template-columns: repeat(${gridState.cols}, 1fr)` }, items.filter(matches).map(col.card));
}
function gridPanel() {
  const wrap = h('div', { cls: 'mtable' }), cardsWrap = h('div');
  const fill = () => cardsWrap.replaceChildren(gridCards());
  const search = h('input', { cls: 'macro', value: gridState.filter, placeholder: 'search…', tip: 'Fuzzy filter by name or any shown variable\'s value',
    oninput: e => { gridState.filter = e.target.value; fill(); }, onkeydown: e => { e.stopPropagation(); if (e.key === 'Escape') { search.value = gridState.filter = ''; fill(); } } });
  const hasFields = GRID_COLLECTIONS[gridState.collection].fields().length > 0;
  wrap.append(h('div', { cls: 'bar' }, h('b', { textContent: gridState.collection }), search), hasFields ? gridFieldPicker() : null, cardsWrap);
  fill();
  return wrap;
}
function gridCtx() {
  return [grp('grid', 'Browse and search characters, moves, scenarios, sounds, looks and tracks; pick which variables show on each tile',
    seg(Object.keys(GRID_COLLECTIONS), () => gridState.collection, v => { gridState.collection = v; gridState.filter = ''; saveGridStore(); panels(); }, mapVals(GRID_COLLECTIONS, c => c.tip)),
    slider('cols', { min: 2, max: 8, step: 1 }, () => gridState.cols, v => { gridState.cols = v; saveGridStore(); panels(); }, 'Tiles per row'))];
}
const gridMode = {
  enter() {}, restart() {}, worlds: () => [], render: clear, ctxBar: gridCtx, side: () => [],
  overlay: () => [gridPanel()],
  hint: () => 'click a tile to open it where it\'s edited · type to search · pick variables to show below each name',
};
