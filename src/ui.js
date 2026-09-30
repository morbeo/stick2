'use strict';
// ---------- tiny DOM toolkit: buttons, toggles, segmented choices, sliders, popups, instant tooltips ----------
const $ = id => document.getElementById(id);
const fmt = v => typeof v === 'number' ? String(+v.toFixed(3)) : String(v);

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
  return h('button', { textContent: label, tip, cls, onclick: e => { const b = e.currentTarget; fn(e, b); b.blur(); syncAll(); } });
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
// a group heading with an ⓘ button that pops up what the group does and its keys
function heading(title, info, keys) {
  return h('h3', {}, title, info && button('i', 'about this group', (e, b) => popup(b, h('b', { textContent: title }),
    h('p', { textContent: info }), keys && h('p', { cls: 'keys', textContent: keys })), 'info'));
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
  tipEl.textContent = t;
  const w = tipEl.offsetWidth, ht = tipEl.offsetHeight;
  tipEl.style.left = Math.min(e.clientX + 14, innerWidth - w - 6) + 'px';
  tipEl.style.top = (e.clientY + 18 + ht > innerHeight ? e.clientY - ht - 10 : e.clientY + 18) + 'px';
}
addEventListener('mousemove', showTip);
addEventListener('mousedown', () => { tipEl.style.display = 'none'; });
