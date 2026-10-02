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
  s.hide ??= {}; s.fold ??= {}; s.more ??= {};
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
const LAY_TIP = 'Layout: what each tab shows, remembered per tab as you go (folded sections, "more", the side panel); save it under a name, switch between layouts, reset a tab or all';
// the layout popup (menu bar): the named layouts, save as, reset, delete
function layoutPanel(e, b) {
  const tab = tabOf(app.mode), names = Object.keys(layouts.sets);
  const re = () => { closePop(); layoutPanel(null, b); };
  popup(b, h('b', { textContent: 'layout · ' + tab }),
    h('div', { cls: 'row', tip: 'The layout in use; changes are kept in it as you go' }, h('span', { textContent: 'use' }),
      seg(names, () => layouts.current, n => { layUse(n); re(); }, Object.fromEntries(names.map(n => [n, n === LAY_DEFAULT ? 'The default layout' : `The layout "${n}"`])))),
    h('div', { cls: 'bar' },
      button(':save: save as…', 'Save this layout (every tab) under a new name and use it', () => { laySaveAs(); re(); }),
      button(':restart_alt: reset tab', `The ${tab} tab back to how it starts, in this layout`, () => { layReset(tab); re(); }),
      button(':restart_alt: reset all', 'Every tab back to how it starts, in this layout', () => { layReset(); re(); }),
      layouts.current !== LAY_DEFAULT && button(':delete: delete', `Delete the layout "${layouts.current}" and go back to the default`, () => { layDelete(); re(); })));
}
