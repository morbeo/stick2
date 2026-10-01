'use strict';
// ---------- tiny DOM toolkit: buttons, toggles, segmented choices, sliders, popups, instant tooltips ----------
const $ = id => document.getElementById(id);
const fmt = v => typeof v === 'number' ? String(+v.toFixed(3)) : String(v);

// ---------- icons: a subset of Material Symbols (fonts/icons.woff2, rebuilt from this list by tools/icons.py) ----------
const ICONS = {
  arrow_back: 0xe5c4, arrow_forward: 0xe5c8, arrow_upward: 0xe5d8, arrow_downward: 0xe5db, north_west: 0xf1e2,
  north_east: 0xf1e1, south_west: 0xf1e5, south_east: 0xf1e4, play_arrow: 0xe037, pause: 0xe034, skip_next: 0xe044,
  skip_previous: 0xe045, restart_alt: 0xf053, replay: 0xe042, fast_rewind: 0xe020, fast_forward: 0xe01f,
  fiber_manual_record: 0xe061, stop: 0xe047, repeat: 0xe040, mouse: 0xe323, view_sidebar: 0xf114, keyboard: 0xe312,
  help: 0xe8fd, info: 0xe88e, close: 0xe5cd, add: 0xe145, remove: 0xe15b, delete: 0xe92e, content_copy: 0xe14d,
  edit: 0xf097, download: 0xf090, upload: 0xf09b, undo: 0xe166, redo: 0xe15a, casino: 0xeb40, science: 0xea4b,
  arrow_drop_up: 0xe5c7, arrow_drop_down: 0xe5c5, grid_view: 0xe9b0, person: 0xf0d3, sports_martial_arts: 0xeae9,
  shield: 0xe9e0, swords: 0xf889, visibility: 0xe8f4, check_box_outline_blank: 0xe835, lock: 0xe899,
  lock_open: 0xe898, palette: 0xe40a, sort: 0xe164, timeline: 0xe922, tune: 0xe429, layers: 0xe53b,
  sports_kabaddi: 0xea34, directions_run: 0xe566, bolt: 0xea0b, back_hand: 0xe764, front_hand: 0xe769,
  sports_mma: 0xea2c, gavel: 0xe90e, animation: 0xe71c, accessibility_new: 0xe92c, unfold_more: 0xe5d7,
  unfold_less: 0xe5d6, chevron_right: 0xe5cc, chevron_left: 0xe5cb, expand_more: 0xe5cf, settings: 0xe8b8, ssid_chart: 0xeb66,
  speed: 0xe9e4, vibration: 0xf2cb, zoom_in: 0xe8ff, timer: 0xe425, my_location: 0xe55c, straighten: 0xe41c,
  rotate_right: 0xe41a, open_with: 0xe89f, pan_tool: 0xe925, swap_horiz: 0xe8d4, flip: 0xe3e8, auto_awesome: 0xe65f,
  waves: 0xe176, stadia_controller: 0xf135, blur_on: 0xe3a5, sync_alt: 0xea18, sports_handball: 0xea33,
  target: 0xe719, trending_up: 0xe8e5, hourglass_empty: 0xe88b, select_all: 0xe162, block: 0xf08c,
  crisis_alert: 0xebe9, star: 0xf09a,
  check: 0xe668, save: 0xe161, history: 0xe8b3, view_in_ar: 0xefc9, content_cut: 0xe14e, more_horiz: 0xe5d3, search: 0xe8b6
};
const ARROWS = { '←': 'arrow_back', '→': 'arrow_forward', '↑': 'arrow_upward', '↓': 'arrow_downward', '↖': 'north_west', '↗': 'north_east', '↙': 'south_west', '↘': 'south_east' };
const icon = (name, tip) => h('span', { cls: 'ic', textContent: String.fromCodePoint(ICONS[name]), tip });
// text with icons: ':name:' and the arrows ← → ↑ ↓ ↖ ↗ ↙ ↘ become icon glyphs, the rest stays text
function rich(text) {
  return String(text).split(/(:[a-z_]+:|[←→↑↓↖↗↙↘])/).filter(Boolean)
    .map(p => ARROWS[p] ? icon(ARROWS[p]) : p[0] === ':' && ICONS[p.slice(1, -1)] ? icon(p.slice(1, -1)) : p);
}
const setRich = (el, text) => { if (el.dataset.rich !== text) { el.dataset.rich = text; el.replaceChildren(...rich(text)); } };

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in props) {
    if (k === 'tip') { if (props.tip) e.dataset.tip = props.tip; }
    else if (k === 'cls') e.className = props.cls;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]);
    else e[k] = props[k];
  }
  e.append(...kids.flat().filter(k => k != null && k !== false));
  return e;
}

// controls register a refresh so the UI follows state changed elsewhere (clicks, keys, undo)
const syncs = new Set();
function reg(el, f) {
  let seen = false;
  const s = () => { if (el.isConnected) seen = true; else if (seen) return syncs.delete(s); f(); };
  syncs.add(s); f();
}
function syncAll() { for (const s of [...syncs]) s(); }

function button(label, tip, fn, cls = '') {
  const b = h('button', { tip, cls, onclick: e => { const b = e.currentTarget; fn(e, b); b.blur(); syncAll(); } });
  setRich(b, label);
  return b;
}
function toggle(label, tip, get, set) {
  const b = button(label, tip, () => set(!get()), 'tog');
  reg(b, () => b.classList.toggle('on', !!get()));
  return b;
}
// one-of-many as a row of buttons (instead of a dropdown). tips: { option: text }
function seg(opts, get, set, tips = {}, label = o => String(o)) {
  return h('span', { cls: 'seg' }, opts.map(o => {
    const b = button(label(o), tips[o], () => set(o));
    reg(b, () => b.classList.toggle('on', get() === o));
    return b;
  }));
}
function slider(label, { min, max, step }, get, set, tip) {
  const inp = h('input', { type: 'range', min, max, step }), val = h('span', { cls: 'v' });
  inp.addEventListener('input', () => { set(+inp.value); val.textContent = fmt(+inp.value); });
  inp.addEventListener('change', () => { inp.blur(); syncAll(); });
  const row = h('label', { cls: 'row', tip }, h('span', { textContent: label }), inp, val);
  reg(row, () => { const v = get(); if (document.activeElement !== inp) inp.value = v; val.textContent = fmt(v); });
  return row;
}
// a variable row whose name starts an experiment with that variable when clicked (dotted underline, a flask on hover)
function expLink(row, what, fn) {
  const n = row.firstChild;
  n.className = 'vname'; n.dataset.tip = `${row.dataset.tip || ''} · Click the name: ${what}`;
  n.onclick = e => { e.preventDefault(); fn(); };
  return row;
}
// the actions on a thing (character, move, bone, stance), always in this order and with these icons, as small buttons on its heading
// (variable groups carry the group buttons in the same place); ops: { kind: [tip, fn] }, extra: more buttons after them
const CRUD = { new: 'add', random: 'casino', copy: 'content_copy', rename: 'edit', revert: 'history', delete: 'delete', import: 'upload', export: 'download' };
function crud(ops, ...extra) {
  return h('span', { cls: 'gops' }, ...Object.keys(CRUD).filter(k => ops[k]).map(k => button(`:${CRUD[k]}:`, ops[k][0], ops[k][1], 'mini')), ...extra);
}
// a group heading with an ⓘ button that pops up what the group does and its keys
function heading(title, info, keys) {
  return h('h3', {}, title, info && button(':info:', 'about this group', (e, b) => popup(b, h('b', { textContent: title }),
    h('p', {}, ...rich(info)), keys && h('p', { cls: 'keys' }, ...rich(keys))), 'info'));
}

// ---------- popup: a floating panel under a button; click elsewhere (or the button again) to close ----------
let pop = null;
function popup(anchor, ...content) {
  const same = pop?.anchor === anchor;
  closePop();
  if (same) return;
  pop = h('div', { cls: 'pop' }, ...content);
  pop.anchor = anchor;
  document.body.append(pop);
  const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  pop.style.left = Math.max(4, Math.min(r.left, innerWidth - pw - 8)) + 'px';
  pop.style.top = (r.bottom + ph + 8 > innerHeight ? Math.max(4, r.top - ph - 4) : r.bottom + 4) + 'px';
}
function closePop() { pop?.remove(); pop = null; }
addEventListener('mousedown', e => { if (pop && !pop.contains(e.target) && !pop.anchor.contains(e.target)) closePop(); });
addEventListener('keydown', e => { if (e.code === 'Escape') closePop(); });

// ---------- tooltips: any element with data-tip, shown instantly next to the cursor ----------
const tipEl = h('div', { cls: 'tip' });
addEventListener('DOMContentLoaded', () => document.body.append(tipEl));
function showTip(e) {
  const t = e.target.closest?.('[data-tip]')?.dataset.tip;
  tipEl.style.display = t ? 'block' : 'none';
  if (!t) return;
  setRich(tipEl, t);
  const w = tipEl.offsetWidth, ht = tipEl.offsetHeight;
  tipEl.style.left = Math.min(e.clientX + 14, innerWidth - w - 6) + 'px';
  tipEl.style.top = (e.clientY + 18 + ht > innerHeight ? e.clientY - ht - 10 : e.clientY + 18) + 'px';
}
addEventListener('mousemove', showTip);
addEventListener('mousedown', () => { tipEl.style.display = 'none'; });
