'use strict';
// ---------- grid mode: a configurable content-manager browser (characters, moves) ----------
// a thin link-out layer over the existing editors, not a duplicate editing UI: pick a collection, pick which
// variables show on each tile (autocomplete over that collection's own already-documented fields). Click a tile once
// to pick it (outlined; a live preview where the collection has one - characters/moves already animate on hover,
// scenarios play out for real, sounds play once); click the picked tile again to open it where it's actually edited
// (character tab, animate, …). DOM cards (charCard/moveCard), not a canvas gallery: these are static data to browse,
// not animating effects (see src/fxlab.js for the canvas-gallery pattern used there)
const GRID_STORE = 'stick2.grid';
const gridStore = (() => { try { return JSON.parse(localStorage.getItem(GRID_STORE)) || {}; } catch { return {}; } })();
const gridState = { collection: gridStore.collection || 'characters', filter: '', cols: gridStore.cols || 4, soundAutoplay: gridStore.soundAutoplay ?? true,
  fields: { characters: ['speed', 'weight', 'health'], moves: ['damage', 'startup', 'active'], ...gridStore.fields }, sort: { ...gridStore.sort },
  sel: {} }; // per collection: the one cell a click has picked but not yet opened (session only, not saved) — see gridPick
// one click picks a cell (highlighted, live preview where the collection has one); clicking the already-picked cell
// opens it for real (focus) - so browsing the grid doesn't bounce you straight out of it on every click. onPick, if
// given, runs once when a cell becomes picked (a preview side effect: play its sound, start its animation)
function gridPick(k, focus, onPick) {
  if (gridState.sel[gridState.collection] === k) focus();
  else { gridState.sel[gridState.collection] = k; onPick?.(); panels(); }
}
function saveGridStore() { try { localStorage.setItem(GRID_STORE, JSON.stringify({ collection: gridState.collection, cols: gridState.cols, soundAutoplay: gridState.soundAutoplay, fields: gridState.fields, sort: gridState.sort })); } catch {} }
// name, or any shown field: click picks it (ascending), click again reverses — the same idiom as the move table's headers
function gridSort(items, fields, shownKeys) {
  const s = gridState.sort[gridState.collection];
  if (!s?.k) return items;
  const val = k => s.k === 'name' ? k : fields.find(f => f.k === s.k)?.get(k);
  return [...items].sort((a, b) => { const va = val(a), vb = val(b);
    return s.dir * (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))); });
}

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
// a static snapshot of the scenario's starting positions (stage, props, every fighter's idle pose) — drawn once
// (not kept live: replaying every scenario in the grid at once would be slow and distracting), reusing the exact
// same World/render a real fight uses, just never advanced a single frame
function scenThumb(k) {
  const cv = h('canvas', { width: 100 * dpr, height: 56 * dpr, cls: 'scenthumb' });
  try { newWorld(SCENARIOS[k], {}, 1, null).render(cv.getContext('2d'), { x: 0, y: 0, w: cv.width, h: cv.height }, true); } catch { /* a broken custom scenario: a blank thumbnail, not a broken grid */ }
  return cv;
}
// picking a scenario card plays it out in place (the real World, actually advanced, not just a static start-position
// frame) until the card is no longer on screen — the grid's own version of startCardPreview (studio.js)/moveCard's
// hover preview; only the picked card animates, everything else stays a still thumbnail
let scenPeek = null;
function startScenPreview(cv, k) {
  stopScenPreview();
  let w; try { w = newWorld(SCENARIOS[k], {}, 1, null); w.loop = true; } catch { return; }
  const loop = () => {
    if (!cv.isConnected || scenPeek?.cv !== cv) return;
    w.advance(1 / 60, NOIN);
    w.render(cv.getContext('2d'), { x: 0, y: 0, w: cv.width, h: cv.height }, true);
    scenPeek.raf = requestAnimationFrame(loop);
  };
  scenPeek = { cv, raf: requestAnimationFrame(loop) };
}
function stopScenPreview() { if (scenPeek) cancelAnimationFrame(scenPeek.raf); scenPeek = null; }
// who fights, as small icon + count badges (you / AI / dummy / script), so the grid tells a 1v1 from a free-for-all at a glance
const CTL_ICONS = { you: 'keyboard', AI: 'smart_toy', dummy: 'person', script: 'timeline' };
function scenActors(k) {
  const s = SCENARIOS[k], who = [s.a, s.b, ...(s.more || []).map(m => m.c)].map(ctlName);
  const counts = new Map(); for (const w of who) counts.set(w, (counts.get(w) || 0) + 1);
  return h('span', { cls: 'gbadge actors', tip: [...counts].map(([w, n]) => `${n} ${w}`).join(' · ') },
    ...[...counts].flatMap(([w, n]) => [...rich(`:${CTL_ICONS[w]}:`), `${n} `]));
}
function scenCard(k, onclick = () => { lab.scen = k; setMode('play'); }, picked = false) {
  const cv = scenThumb(k);
  if (picked) startScenPreview(cv, k);
  const b = h('button', { cls: 'card', onclick },
    cv, h('span', { textContent: k }), h('span', { cls: 'gbadge', textContent: k in BASE_SCENARIOS ? 'built-in' : 'yours' }), scenActors(k));
  reg(b, () => b.classList.toggle('on', lab.scen === k));
  return b;
}
const GRID_COLLECTIONS = {
  characters: { tip: 'Every built-in and custom character', items: () => Object.keys(DEFS), fields: charFields,
    card: k => gridCard(charCard(k, kk => gridPick(kk, () => { pickChar(kk); setMode('character'); }), kk => CURRENT === kk), k, charFields()) },
  moves: { tip: 'The current character\'s moves', items: () => Object.keys(currentChar().moves), fields: moveFields,
    card: n => gridCard(moveCard(n, `Click to pick it, click again to open ${n} in the keyframe editor`, nm => gridPick(nm, () => openMove(nm))), n, moveFields()) },
  scenarios: { tip: 'Built-in and your own scenarios', items: () => Object.keys(SCENARIOS), fields: scenGridFields,
    card: k => gridCard(scenCard(k, () => gridPick(k, () => { lab.scen = k; setMode('play'); }), gridState.sel.scenarios === k), k, scenGridFields()) },
  sounds: { tip: 'Every sound (built-in and custom)', items: () => Object.keys(SOUNDS), fields: () => [],
    card: k => gridCard((() => { const b = h('button', { cls: 'card', onclick: () => gridPick(k, () => { soundSel = k; setMode('sounds'); }, () => playSound(k)),
        onmouseenter: () => { if (gridState.soundAutoplay) playSound(k); } },
      soundWave(k), h('span', { textContent: k }), h('span', { cls: 'gbadge', textContent: k in BASE_SOUNDS ? 'built-in' : 'custom' }));
      reg(b, () => b.classList.toggle('on', soundSel === k)); return b; })(), k, []) },
  looks: { tip: 'Every fx look (built-in and custom)', items: () => Object.keys(FX_LOOKS), fields: () => [],
    card: k => gridCard((() => { const b = h('button', { cls: 'card', onclick: () => gridPick(k, () => { fxState.sel = k; fxState.zoom = true; setMode('fx'); }) }, fxCanvas(60, k), h('span', { textContent: k }));
      reg(b, () => b.classList.toggle('on', fxState.sel === k)); return b; })(), k, []) },
  tracks: { tip: 'Your tracker patterns', items: () => Object.keys(myTracks), fields: () => [],
    card: k => gridCard(simpleCard(k, `${myTracks[k].bpm} bpm · ${myTracks[k].steps} steps`, () => gridPick(k, () => { trackSel = k; setMode('tracker'); }), () => trackSel === k), k, []) },
};
// overlays the collection's chosen fields inside the card's own bounds, one per corner (cycling if more than
// 4 are picked), instead of stacking them below the name and growing the cell (charCard/moveCard both end in
// one name <span>; appending more afterward is safe since their own reg() only ever touches the canvas and the .on class)
const GFIELD_CORNERS = ['tl', 'tr', 'bl', 'br'];
function gridCard(card, key, fields) {
  card.classList.toggle('gridsel', gridState.sel[gridState.collection] === key);
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
  return h('div', { cls: 'cards', style: `grid-template-columns: repeat(${gridState.cols}, 1fr)` }, gridSort(items.filter(matches), fields, shownKeys).map(col.card));
}
function gridPanel() {
  const wrap = h('div', { cls: 'mtable' }), cardsWrap = h('div');
  const fill = () => cardsWrap.replaceChildren(gridCards());
  const search = h('input', { cls: 'macro', value: gridState.filter, placeholder: 'search…', tip: 'Fuzzy filter by name or any shown variable\'s value',
    oninput: e => { gridState.filter = e.target.value; fill(); }, onkeydown: e => { e.stopPropagation(); if (e.key === 'Escape') { search.value = gridState.filter = ''; fill(); } } });
  wrap.append(h('div', { cls: 'bar' }, search), cardsWrap);
  fill();
  return wrap;
}
// the side panel: what this collection is (a description, behind the heading's info button, as everywhere else) and,
// where it applies, the variable picker — the overlay above the cards used to hold both, leaving the side panel empty
function gridSide() {
  const col = GRID_COLLECTIONS[gridState.collection];
  return [heading(gridState.collection, col.tip), col.fields().length ? gridFieldPicker() : h('p', { cls: 'note', textContent: 'This collection has no pickable variables — just name and a badge.' })];
}
function gridCtx() {
  const sortOpts = ['name', ...(gridState.fields[gridState.collection] || [])];
  const sort = gridState.sort[gridState.collection] ??= { k: null, dir: 1 };
  const sortLabel = v => v === null ? 'unsorted' : v + (sort.k === v ? (sort.dir > 0 ? ' ▲' : ' ▼') : '');
  return [grp('grid', 'Browse and search characters, moves, scenarios, sounds, looks and tracks; pick which variables show on each tile',
    seg(Object.keys(GRID_COLLECTIONS), () => gridState.collection, v => { gridState.collection = v; gridState.filter = ''; saveGridStore(); panels(); }, mapVals(GRID_COLLECTIONS, c => c.tip)),
    slider('cols', { min: 2, max: 8, step: 1 }, () => gridState.cols, v => { gridState.cols = v; saveGridStore(); panels(); }, 'Tiles per row'),
    seg([null, ...sortOpts], () => sort.k, v => { if (sort.k === v) sort.dir *= -1; else { sort.k = v; sort.dir = 1; } saveGridStore(); panels(); },
      { null: 'No sort: the order each collection lists them in', ...Object.fromEntries(sortOpts.map(k => [k, `Sort by ${k}; click again to reverse`])) }, sortLabel),
    gridState.collection === 'sounds' ? toggle(':volume_up:', 'Play a sound when you hover its card', () => gridState.soundAutoplay, v => { gridState.soundAutoplay = v; saveGridStore(); }) : null)];
}
const gridMode = {
  enter() {}, restart() {}, worlds: () => [], render: clear, ctxBar: gridCtx, side: gridSide,
  get open() { return [gridState.collection]; },
  overlay: () => [gridPanel()],
  hint: () => 'click a tile to pick it (shows a live preview where this collection has one) · click it again to open it where it\'s edited · type to search · pick variables to show below each name',
};
