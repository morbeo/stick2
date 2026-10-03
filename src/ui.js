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
  crisis_alert: 0xebe9, star: 0xf09a, filter_list: 0xe152,
  view_module: 0xe8f0, list: 0xe896, table_rows: 0xf101, category: 0xe72c, height: 0xea16, sort_by_alpha: 0xe053,
  format_list_numbered: 0xe242, heart_broken: 0xeac2, vertical_align_top: 0xe25a, vertical_align_center: 0xe259, vertical_align_bottom: 0xe258,
  smart_toy: 0xf06c, air: 0xefd8, directions_walk: 0xe536, theaters: 0xe8da, cloud: 0xf15c, grain: 0xe3ea, horizontal_rule: 0xf108,
  circle: 0xef4a, man: 0xe4eb, airline_seat_flat: 0xe630, cyclone: 0xebd5, pets: 0xe91d, face: 0xf008, footprint: 0xf87d,
  keyboard_double_arrow_down: 0xead0, view_stream: 0xe8f2, crop_landscape: 0xe3c3, accessibility: 0xe84e,
  check: 0xe668, save: 0xe161, videocam: 0xe04b, radio_button_checked: 0xe837, history: 0xe8b3, view_in_ar: 0xefc9, content_cut: 0xe14e, more_horiz: 0xe5d3, search: 0xe8b6,
  person_off: 0xe510
};
const ARROWS = { '←': 'arrow_back', '→': 'arrow_forward', '↑': 'arrow_upward', '↓': 'arrow_downward', '↖': 'north_west', '↗': 'north_east', '↙': 'south_west', '↘': 'south_east' };
// icons of option values, shown by seg() unless it is given its own labels
const OPT_ICONS = { cards: 'view_module', list: 'list', table: 'table_rows', inputs: 'stadia_controller', combos: 'trending_up', type: 'category', limb: 'front_hand', height: 'height',
  stance: 'sports_martial_arts', order: 'format_list_numbered', name: 'sort_by_alpha', startup: 'timer', damage: 'heart_broken',
  high: 'vertical_align_top', shigh: 'vertical_align_top', mid: 'vertical_align_center', smid: 'vertical_align_center', low: 'vertical_align_bottom',
  bone: 'straighten', body: 'accessibility_new', stand: 'man', crouch: 'keyboard_double_arrow_down', guard: 'shield', idle: 'man', air: 'air',
  down: 'airline_seat_flat', dizzy: 'cyclone', toward: 'arrow_forward', away: 'arrow_back', sweep: 'tune', breed: 'science', attacks: 'sports_mma',
  dummy: 'person', whiff: 'air', ai: 'smart_toy', showcase: 'theaters', walk: 'directions_walk', 'vs ai': 'smart_toy', '2d': 'crop_landscape',
  lanes: 'view_stream', belt: 'view_in_ar', spine: 'accessibility', head: 'face', arm: 'front_hand', leg: 'footprint', tail: 'pets',
  line: 'horizontal_rule', circle: 'circle', ragdoll: 'sports_kabaddi', pose: 'accessibility_new',
  raw: 'grain', tweened: 'animation', spring: 'waves', floaty: 'cloud', juicy: 'auto_awesome', overlay: 'layers', strip: 'theaters' };
const optLabel = o => OPT_ICONS[o] ? `:${OPT_ICONS[o]}: ${o}` : String(o);
const icon = (name, tip) => h('span', { cls: name === 'close' ? 'ic close' : 'ic', textContent: String.fromCodePoint(ICONS[name]), tip });
// the favicon: drawn from the icon font itself (sports_martial_arts), not an image file, once the font is ready
document.fonts.load('48px Icons').then(() => {
  const cv = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }), c = cv.getContext('2d');
  c.fillStyle = '#f3f0e8'; c.beginPath(); c.arc(32, 32, 32, 0, 7); c.fill();
  c.font = '48px Icons'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#222';
  c.fillText(String.fromCodePoint(ICONS.sports_martial_arts), 32, 35);
  (document.querySelector('link[rel=icon]') || document.head.appendChild(h('link', { rel: 'icon' }))).href = cv.toDataURL();
}).catch(() => {});
// text with icons: ':name:' and the arrows ← → ↑ ↓ ↖ ↗ ↙ ↘ become icon glyphs, the rest stays text
function rich(text) {
  return String(text).split(/(:[a-z_]+:|[←→↑↓↖↗↙↘])/).filter(Boolean)
    .map(p => ARROWS[p] ? icon(ARROWS[p]) : p[0] === ':' && ICONS[p.slice(1, -1)] ? icon(p.slice(1, -1)) : p);
}
// a button whose label is only an icon gets the compact square style (ico)
const setRich = (el, text) => { if (el.dataset.rich !== text) { el.dataset.rich = text; el.replaceChildren(...rich(text)); if (el.tagName === 'BUTTON') el.classList.toggle('ico', /^\s*:[a-z_]+:\s*$/.test(text)); } };

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
function seg(opts, get, set, tips = {}, label = optLabel) {
  return h('span', { cls: 'seg' }, opts.map(o => {
    const b = button(label(o), tips[o], () => set(o));
    reg(b, () => b.classList.toggle('on', get() === o));
    return b;
  }));
}
// a labelled group of toolbar controls (related tools sit together, divided from the next group)
// a named group is a part of the layout (data-part): the layout popup can hide it
const grp = (label, tip, ...els) => { const g = h('span', { cls: 'grp', tip }, label && h('span', { cls: 'gl', textContent: label }), ...els.flat()); if (label) g.dataset.part = label; return g; };
function slider(label, { min, max, step }, get, set, tip) {
  // the value beside it can be typed too (Enter or leaving it sets it): any number, the slider's range is only the usual one; outside it the
  // box turns amber, far outside red (riskOf in core.js)
  const inp = h('input', { type: 'range', min, max, step }), val = h('input', { cls: 'v', inputMode: 'decimal' });
  const tipOf = v => `Type any value (usually ${fmt(min)} … ${fmt(max)}), Enter sets it${riskOf(v, min, max) ? ' · ' + RISK_TIPS[riskOf(v, min, max)] : ''}`;
  inp.addEventListener('input', () => { set(+inp.value); val.value = fmt(+inp.value); });
  inp.addEventListener('change', () => { inp.blur(); syncAll(); });
  val.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Escape') val.value = fmt(get()); val.blur(); } });
  val.addEventListener('change', () => { const v = parseFloat(val.value.replace(',', '.')); if (Number.isFinite(v)) set(v); syncAll(); });
  const row = h('label', { cls: 'row', tip }, h('span', { textContent: label }), inp, val);
  reg(row, () => { const v = get(), r = riskOf(v, min, max); if (document.activeElement !== inp) inp.value = v; if (document.activeElement !== val) val.value = fmt(v);
    val.classList.toggle('warn', r === 'warn'); val.classList.toggle('danger', r === 'danger'); val.dataset.tip = tipOf(v); });
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
  return h('h3', {}, title, info && button(':info:', `About ${title}: what it does and its keys`, (e, b) => popup(b, h('b', { textContent: title }),
    h('p', {}, ...rich(info)), keys && h('p', { cls: 'keys' }, ...rich(keys)),
    docFor(title) && h('div', { cls: 'bar' }, button(':chevron_right: docs', 'Read more in the docs, with live demos', () => openDocs(docFor(title).id)))), 'info'));
}

// ---------- side panel sections: a heading folds what follows it, up to the next heading; rows marked adv wait behind "more" ----------
// both remembered per mode and heading in the tab's layout (layout.js); a search shows everything that matches
const UI_STORE = 'stick2.ui';
const ui = (() => { try { return JSON.parse(localStorage.getItem(UI_STORE)) || {}; } catch { return {}; } })();
ui.seen ??= {};
// interface scale: the whole page zoomed, not the canvas (dpr handles that separately) — applied at once, before first paint
ui.scale ??= 1;
document.documentElement.style.zoom = ui.scale;
const setUiScale = v => { ui.scale = v; saveUi(); document.documentElement.style.zoom = v; resize(); };
const saveUi = () => { try { localStorage.setItem(UI_STORE, JSON.stringify(ui)); } catch {} };
// open: headings shown unfolded until the user folds them
function folds(els, scope, open) {
  const out = [];
  let body = null;
  for (const el of els) {
    if (el.tagName !== 'H3') { if (body) body.append(el); else out.push(el); continue; }
    const name = (el.dataset.fold || el.firstChild?.textContent || '').toLowerCase(), k = scope + ':' + name;
    const sec = h('div', { cls: 'fold' }, el, body = h('div', { cls: 'fbody' }));
    const L = lay();
    sec.classList.toggle('shut', L.fold[k] ?? !open.includes(name));
    sec.classList.toggle('more', !!L.more[k]);
    el.dataset.tip = el.dataset.tip || 'Click the heading to fold or unfold the section';
    el.onclick = e => { if (e.target.closest('button')) return; L.fold[k] = sec.classList.toggle('shut'); saveLay(); };
    el.append(button(':close:', 'Hide this section on this tab (the layout button in the menu bar shows it again)', () => layShow('side:' + name, false), 'mini hidebtn'));
    sec.k = k; sec.fname = name; // (not .part: elements have one, the shadow parts)
    out.push(sec);
  }
  for (const sec of out.filter(s => s.k)) {
    const advs = sec.querySelectorAll('.adv'), n = advs.length;
    if (!n) continue;
    const b = button('', 'Show the less used variables of this group too (a search always shows them)', () => { lay().more[sec.k] = sec.classList.toggle('more'); saveLay(); }, 'mini morebtn');
    reg(b, () => setRich(b, sec.classList.contains('more') ? ':unfold_less: fewer' : `:unfold_more: ${n} more`));
    advs[n - 1].after(b); // where the hidden rows show up
  }
  return out;
}
const adv = el => { el.classList.add('adv'); return el; };
// a smaller fold for a handful of rows that are a unit within a bigger section (e.g. the fx stack on a bone, a move or a key):
// an <h4> toggles a nested .fbody, the same way a heading does; folded state persists under its own name, per mode
function subFold(name, els) {
  const k = app.mode + ':sub:' + name.replace(/:[a-z_]+:/g, '').trim().toLowerCase();
  const hd = h('h4', { tip: 'Click to fold or unfold this group' }, ...rich(name));
  const sec = h('div', { cls: 'fold sub' }, hd, h('div', { cls: 'fbody' }, els));
  sec.classList.toggle('shut', !!lay().fold[k]);
  hd.onclick = () => { lay().fold[k] = sec.classList.toggle('shut'); saveLay(); };
  return sec;
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
addEventListener('keydown', e => { if (e.code === 'Escape' && pop) { closePop(); e.stopImmediatePropagation(); } }); // one Esc closes one thing

// ---------- dialogs: the app's own in place of the browser's prompt / confirm / alert, centred over the page ----------
// buttons: [[label, value, tip]], the first is the default (Enter); Esc or a click beside it gives null. input: a text field's start value
function dialog(title, text, buttons, input = null) {
  return new Promise(done => {
    const field = input !== null && h('input', { cls: 'macro', value: input, tip: 'Type here; Enter confirms, Esc cancels' });
    const box = h('div', { cls: 'pop modal' }, h('b', { textContent: title }), text && h('p', { textContent: text }), field || null,
      h('div', { cls: 'bar' }, buttons.map(([label, v, tip]) => button(label, tip || label, () => end(field && v !== null ? field.value : v)))));
    const back = h('div', { cls: 'modalback' }, box);
    const end = v => { back.remove(); removeEventListener('keydown', key, true); done(v); };
    const key = e => { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); end(null); }
      else if (e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); end(field ? field.value : buttons[0][1]); } else if (field) e.stopPropagation(); };
    back.addEventListener('mousedown', e => { if (e.target === back) end(null); });
    addEventListener('keydown', key, true);
    document.body.append(back);
    (field || box.querySelector('button'))?.focus(); if (field) field.select();
  });
}
const askText = (title, value = '', text = '') => dialog(title, text, [[':check: ok', true, 'Use this text (Enter)'], [':close: cancel', null, 'Close without changing anything (Esc)']], value); // → the text, or null
const askYes = (title, text, yes = ':check: ok', no = ':close: cancel') => dialog(title, text, [[yes, true, 'Go ahead (Enter)'], [no, false, 'Leave things as they are (Esc)']]).then(Boolean);
const notice = (title, text) => dialog(title, text, [[':check: ok', true, 'Close this message (Enter)']]);

// ---------- tooltips: any element with data-tip, shown instantly next to the cursor ----------
const tipEl = h('div', { cls: 'tip' });
addEventListener('DOMContentLoaded', () => document.body.append(tipEl));
function showTip(e) {
  const t = e.target.closest?.('[data-tip]')?.dataset.tip;
  tipEl.style.display = t ? 'block' : 'none';
  if (!t) return;
  setRich(tipEl, t);
  const w = tipEl.offsetWidth, ht = tipEl.offsetHeight;
  const left = Math.min(e.clientX + 14, innerWidth - w - 6), p = document.querySelector('.peek')?.getBoundingClientRect();
  let top = e.clientY + 18 + ht > innerHeight ? e.clientY - ht - 10 : e.clientY + 18;
  // a hover preview next to the cursor: the tip goes under it (or above it)
  if (p && left < p.right && p.left < left + w && top < p.bottom && p.top < top + ht) top = p.bottom + 4 + ht <= innerHeight ? p.bottom + 4 : Math.max(0, p.top - ht - 4);
  tipEl.style.left = left + 'px';
  tipEl.style.top = top + 'px';
}
addEventListener('mousemove', showTip);
addEventListener('mousedown', () => { tipEl.style.display = 'none'; });
