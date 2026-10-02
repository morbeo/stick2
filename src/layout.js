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
// show the shown tab's layout: the side panel on or off, then the panels
function layApply() {
  const off = !!lay().hide.side;
  if (document.body.classList.contains('noside') !== off) { document.body.classList.toggle('noside', off); resize(); }
  panels();
}
// hide or show a part: a toolbar group (ctx:<its label>) or a side section (side:<its heading>)
const layShown = id => !lay().hide[id];
function layShow(id, v) { if (v) delete lay().hide[id]; else lay().hide[id] = true; saveLay(); panels(); }
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
  labels: () => cfgShow(':sort_by_alpha:', 'labels'),
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
function laySaveAs() {
  const name = prompt('Name of the new layout (it starts as a copy of this one)', 'layout' + Object.keys(layouts.sets).length)?.trim();
  if (!name) return;
  if (layouts.sets[name] && !confirm(`Replace the layout "${name}"?`)) return;
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
// the head row of every stage panel: its name, its own tools, then × (Esc)
const stageHead = (title, tip, ...tools) => h('div', { cls: 'bar stagehead' }, h('b', { textContent: title, tip }), ...tools, h('span', { cls: 'fill' }),
  button(':close:', `Close the ${title} (Esc)`, closeStage, 'mini'));
const STAGE_LABELS = { table: ':table_rows: table', inputs: ':stadia_controller: inputs', combos: ':trending_up: combos', bones: ':accessibility_new: bones', builder: ':edit: scenario' };
function panelsGrp(names, tips) {
  return grp('panels', 'Tables over the stage, edited in place (click again, × or Esc: close)',
    seg(names, stageOpen, v => openStage(v === stageOpen() ? null : v), mapVals(tips, t => t + ' (click again: close)'), v => STAGE_LABELS[v]));
}
const LAY_TIP = 'Layout: what each tab shows, remembered per tab as you go (toolbar groups, side sections, overlays, folds, "more", the side panel); save it under a name, switch between layouts, reset a tab or all';
// the layout popup (menu bar): what this tab shows, then the named layouts, save as, reset, delete
function layoutPanel(e, b) {
  const tab = tabOf(app.mode), names = Object.keys(layouts.sets);
  const re = () => { closePop(); layoutPanel(null, b); };
  const parts = (kind, title, tip, ...first) => h('div', { cls: 'row', tip }, h('span', { textContent: title }), h('div', { cls: 'bar' }, ...first,
    ...app.parts[kind].map(p => toggle(p, `Show "${p}" (${title}) on this tab`, () => layShown(kind + ':' + p), v => layShow(kind + ':' + p, v)))));
  popup(b, h('b', { textContent: 'layout · ' + tab }),
    parts('ctx', 'toolbar', 'The toolbar groups this tab shows'),
    parts('side', 'side panel', 'The side panel and its sections (hover a heading: × hides it too)',
      toggle('panel', 'The whole side panel' + keyTip('panel'), () => !lay().hide.side, togglePanel)),
    app.shows.length ? h('div', { cls: 'row', tip: 'What is drawn over the fight' }, h('span', { textContent: 'overlays' }), h('div', { cls: 'bar' }, ...app.shows.map(k => SHOW[k]()))) : null,
    h('div', { cls: 'row', tip: 'The layout in use; changes are kept in it as you go' }, h('span', { textContent: 'use' }),
      seg(names, () => layouts.current, n => { layUse(n); re(); }, Object.fromEntries(names.map(n => [n, n === LAY_DEFAULT ? 'The default layout' : `The layout "${n}"`])))),
    h('div', { cls: 'bar' },
      button(':save: save as…', 'Save this layout (every tab) under a new name and use it', () => { laySaveAs(); re(); }),
      button(':restart_alt: reset tab', `The ${tab} tab back to how it starts, in this layout`, () => { layReset(tab); re(); }),
      button(':restart_alt: reset all', 'Every tab back to how it starts, in this layout', () => { layReset(); re(); }),
      layouts.current !== LAY_DEFAULT && button(':delete: delete', `Delete the layout "${layouts.current}" and go back to the default`, () => { layDelete(); re(); })));
}
