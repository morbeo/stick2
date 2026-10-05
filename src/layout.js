'use strict';
// ---------- layouts: what each tab shows (folds, "more", the side panel), kept per tab as you go; named sets to switch between and reset ----------
// stored as { current, sets: { name: { tabs: { play: state, … } } } }; a tab's state starts empty and empty means the code's defaults
const LAY_STORE = 'stick2.layouts', LAY_DEFAULT = 'default';
const layouts = (() => { try { const l = JSON.parse(localStorage.getItem(LAY_STORE)); if (l?.sets?.[LAY_DEFAULT]) return l; } catch {} return null; })()
  || { current: LAY_DEFAULT, sets: { [LAY_DEFAULT]: { tabs: {} } }, fresh: true };
if (!layouts.sets[layouts.current]) layouts.current = LAY_DEFAULT;
const saveLay = () => { try { const { fresh, ...l } = layouts; localStorage.setItem(LAY_STORE, JSON.stringify(l)); } catch {} };
const laySet = () => layouts.sets[layouts.current];
// the state of a tab (default: the shown one) in the current set
function lay(tab = tabOf(app.mode)) {
  const s = laySet().tabs[tab] ??= {};
  s.hide ??= {}; s.fold ??= {}; s.more ??= {}; s.show ??= {};
  return s;
}
// the folds and "more" from before layouts (ui.fold / ui.more, keyed mode:heading) go to the tab of their mode, once
function layInit() {
  if (layouts.fresh) for (const what of ['fold', 'more']) for (const [k, v] of Object.entries(ui[what] || {})) lay(tabOf(k.split(':')[0]))[what][k] = v;
  delete layouts.fresh; saveLay();
  delete ui.fold; delete ui.more; saveUi();
}
// show the shown tab's layout: the side panel on or off and its width, then the panels
function layApply() {
  const off = !!lay().hide.side, w = sideW() + 'px', bs = document.body.style;
  if (document.body.classList.contains('noside') !== off || bs.getPropertyValue('--side-w') !== w) { document.body.classList.toggle('noside', off); bs.setProperty('--side-w', w); resize(); }
  panels();
}
// sizes, kept in the tab's layout: the side panel's width (the grip on its left edge) and the editor / preview split (drag their boundary, app.js)
const SIDE_W = [220, 300, 560], SPLIT = [0.3, 0.58, 0.8]; // min, default, max
const sideW = () => lay().size?.side ?? SIDE_W[1];
const splitX = () => Math.round(canvas.width * (lay().size?.split ?? SPLIT[1]));
function laySize(k, v) { (lay().size ??= {})[k] = v; saveLay(); }
$('grip').onpointerdown = e => {
  e.preventDefault();
  const w = e => clamp(Math.round(innerWidth - e.clientX), SIDE_W[0], SIDE_W[2]), move = e => { document.body.style.setProperty('--side-w', w(e) + 'px'); resize(); };
  const up = e => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); laySize('side', w(e)); };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
};
$('grip').ondblclick = () => { delete lay().size.side; saveLay(); layApply(); };
// hide or show a part: a toolbar group (ctx:<its label>) or a side section (side:<its heading>)
const layShown = id => !lay().hide[id];
function layShow(id, v) { if (v) delete lay().hide[id]; else lay().hide[id] = true; saveLay(); panels(); }
// the order of the toolbar groups or side sections (kind ctx / side): the named parts take their places in the saved order, the rest stay put
function layOrder(kind, els, name) {
  const order = lay().order?.[kind];
  if (!order) return els;
  const rank = el => { const i = order.indexOf(name(el)); return i < 0 ? order.length : i; };
  const named = els.filter(el => name(el)).sort((a, b) => rank(a) - rank(b));
  return els.map(el => name(el) ? named.shift() : el);
}
// move part p of a kind to just before part q (or to the end)
function layMove(kind, p, q) {
  const o = app.parts[kind].filter(x => x !== p);
  o.splice(q && q !== p ? o.indexOf(q) : o.length, 0, p);
  (lay().order ??= {})[kind] = o; saveLay(); panels();
}
// a tab's own display choice (meter, inputs, colours) as a property of obj, kept in the tab's layout
const layFlag = (obj, k, id = k) => Object.defineProperty(obj, k, { get: () => !!lay().show[id], set: v => { lay().show[id] = !!v; saveLay(); }, enumerable: true });
// the overlay toggles, in this order on every tab; a tab picks the ones it has, its own extras go after them
const cfgShow = (icon, k) => toggle(icon, `${k[0].toUpperCase() + k.slice(1)}: ${SPEC[k].tip}${keymap[k] ? keyTip(k) : ''}`, () => CFG[k], v => setDisplay(k, v));
const SHOW = {
  meter: () => toggle(':timeline:', 'Frame meter · ' + METER_TIPS, () => lab.meter, v => { lab.meter = v; }),
  inputs: () => toggle(':stadia_controller:', 'Input display: your inputs in numpad notation (6 forward, 2 down, 8 up) and frames held', () => lab.inputs, v => { lab.inputs = v; }),
  boxes: () => cfgShow(':check_box_outline_blank:', 'boxes'),
  ghost: () => cfgShow(':visibility:', 'ghost'),
  colours: () => colorsToggle(),
  hud: () => cfgShow(':heart_broken:', 'hud'),
  hudNames: () => cfgShow(':face:', 'hudNames'),
  labels: () => cfgShow(':sort_by_alpha:', 'labels'),
  timer: () => cfgShow(':timer:', 'timer'),
};
function showGrp(keys, ...extra) {
  app.shows = Object.keys(SHOW).filter(k => keys.includes(k));
  return grp('show', 'Overlays: what is drawn over the fight', ...app.shows.map(k => SHOW[k]()), ...extra);
}
function layReset(tab) {
  if (tab) delete laySet().tabs[tab]; else laySet().tabs = {};
  saveLay(); layApply();
}
function layUse(name) { layouts.current = name; saveLay(); layApply(); }
async function laySaveAs() {
  const name = (await askText('Name of the new layout', 'layout' + Object.keys(layouts.sets).length, 'It starts as a copy of this one.'))?.trim();
  if (!name) return;
  if (layouts.sets[name] && !await askYes(`Replace the layout "${name}"?`, 'It becomes a copy of the current one.', ':restart_alt: replace')) return;
  layouts.sets[name] = JSON.parse(JSON.stringify(laySet()));
  layUse(name);
}
function layDelete() {
  if (layouts.current === LAY_DEFAULT) return;
  delete layouts.sets[layouts.current];
  layUse(LAY_DEFAULT);
}
// ---------- stage panels: the tables over the stage, one open per tab (kept in its layout), opened from the toolbar's panels group; Esc or × closes ----------
function openStage(name) { unpeek(); lay().panel = name || null; saveLay(); panels(); }
const closeStage = () => openStage(null);
const stageOpen = () => lay().panel;
// the head row of every stage panel: its name, its own tools, then × (Esc) pinned to the panel's own top-right corner
// (not just pushed to the end of the tools, which can wrap to another line and land it anywhere)
const stageHead = (title, tip, ...tools) => h('div', { cls: 'bar stagehead' }, h('b', { textContent: title, tip }), ...tools,
  button(':close:', `Close the ${title} (Esc)`, closeStage, 'mini closebtn'));
const STAGE_LABELS = { table: ':table_rows: table', inputs: ':stadia_controller: inputs', combos: ':trending_up: combos', bones: ':accessibility_new: bones', builder: ':edit: scenario', compare: ':sync_alt: compare', events: ':list: events' };
function panelsGrp(names, tips) {
  return grp('panels', 'Tables over the stage, edited in place (click again, × or Esc: close)',
    seg(names, stageOpen, v => openStage(v === stageOpen() ? null : v), mapVals(tips, t => t + ' (click again: close)'), v => STAGE_LABELS[v]));
}
const LAY_TIP = 'Layout: what each tab shows, remembered per tab as you go (toolbar groups and side sections and their order, sizes, overlays, folds, "more", the side panel); save it under a name, switch between layouts, reset a tab or all';
// the layout popup (menu bar): what this tab shows, then the named layouts, save as, reset, delete
// a box drawn over the page on hover, showing exactly what a layout toggle controls: solid on its live element if shown,
// dashed over its container if hidden (there is nothing live to point at, but at least which area it would reappear in).
// purely an overlay (fixed, pointer-events: none) — never a class or style on the target itself, so nothing else moves
let hiBox = null;
function layHighlight(rect, hidden) {
  if (!rect) { hiBox?.remove(); hiBox = null; return; }
  hiBox ??= document.body.appendChild(h('div', { cls: 'layhi' }));
  hiBox.classList.toggle('hidden', !!hidden);
  Object.assign(hiBox.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px' });
}
const layTarget = (kind, p) => (kind === 'ctx' ? document.querySelector(`#ctx [data-part="${CSS.escape(p)}"]`)
  : [...document.querySelectorAll('#side > *')].find(s => s.fname === p)) || $(kind);
const layHover = (kind, p) => ({ onmouseenter: () => layHighlight(layTarget(kind, p)?.getBoundingClientRect(), !layShown(kind + ':' + p)), onmouseleave: () => layHighlight(null) });
function layoutPanel(e, b) {
  const tab = tabOf(app.mode), names = Object.keys(layouts.sets);
  const re = () => { layHighlight(null); closePop(); layoutPanel(null, b); };
  // each part a toggle; drag one onto another to put it before that one (onto the row's label: last)
  let drag = null;
  const drop = (el, kind, q) => { el.ondragover = e => { if (drag?.kind === kind) e.preventDefault(); }; el.ondrop = e => { e.preventDefault(); layMove(kind, drag.p, q); re(); }; return el; };
  const part = (kind, title, p) => { const t = toggle(p, `Show "${p}" (${title}) on this tab · drag: move it before another`, () => layShown(kind + ':' + p), v => layShow(kind + ':' + p, v));
    t.draggable = true; t.ondragstart = e => { drag = { kind, p }; e.dataTransfer.setData('text/plain', p); }; Object.assign(t, layHover(kind, p)); return drop(t, kind, p); };
  const parts = (kind, title, tip, ...first) => h('div', { cls: 'row', tip: tip + ' · drag a part to reorder' }, drop(h('span', { textContent: title }), kind, null), h('div', { cls: 'bar' }, ...first,
    ...app.parts[kind].map(p => part(kind, title, p))));
  popup(b, h('b', { textContent: 'layout · ' + tab }),
    h('div', { cls: 'row', tip: 'Edit another tab\'s layout without closing this' }, h('span', { textContent: 'tab' }),
      seg(Object.keys(MODES), () => app.mode, v => { setMode(v); re(); }, MODES)),
    parts('ctx', 'toolbar', 'The toolbar groups this tab shows'),
    parts('side', 'side panel', 'The side panel and its sections (hover a heading: × hides it too)',
      Object.assign(toggle('panel', 'Show or hide the whole side panel on this tab' + keyTip('panel'), () => !lay().hide.side, togglePanel),
        { onmouseenter: () => layHighlight($('side').getBoundingClientRect(), !!lay().hide.side), onmouseleave: () => layHighlight(null) })),
    app.shows.length ? h('div', { cls: 'row', tip: 'What is drawn over the fight' }, h('span', { textContent: 'overlays' }), h('div', { cls: 'bar' }, ...app.shows.map(k => SHOW[k]()))) : null,
    h('div', { cls: 'row', tip: 'The layout in use; changes are kept in it as you go' }, h('span', { textContent: 'use' }),
      seg(names, () => layouts.current, n => { layUse(n); re(); }, Object.fromEntries(names.map(n => [n, n === LAY_DEFAULT ? 'Switch to the default layout' : `Switch to the layout "${n}"`])))),
    h('div', { cls: 'bar' },
      button(':save: save as…', 'Save this layout (every tab) under a new name and use it', async () => { await laySaveAs(); re(); }),
      button(':restart_alt: reset tab', `The ${tab} tab back to how it starts, in this layout`, () => { layReset(tab); re(); }),
      button(':restart_alt: reset all', 'Every tab back to how it starts, in this layout', () => { layReset(); re(); }),
      layouts.current !== LAY_DEFAULT && button(':delete: delete', `Delete the layout "${layouts.current}" and go back to the default`, () => { layDelete(); re(); })));
}
