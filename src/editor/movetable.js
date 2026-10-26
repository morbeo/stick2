'use strict';
// (split from src/editor/editor.js: the animate tab's move table and its hover preview)
// ---------- move table: every move of the character, sortable, fuzzy-filtered, values edited in place ----------
// startup / active / recovery edits retime that phase's keys; height opens its options; hovering a row plays the move by the cursor
const PHASE_TIPS = { startup: 'Startup frames (60 fps) before the first active key. Edit to retime the startup keys.',
  active: 'Active frames: the strike can hit. Edit to retime the active keys.', recovery: 'Recovery frames after the last active key. Edit to retime them.' };
const TABLE_COLS = [
  { k: 'name', tip: 'Click a row to open the move in the keyframe editor, hover it to see it play', get: (m, n) => n },
  { k: 'type', tip: GROUP_TIPS.type, get: (m, n, ch) => MOVE_GROUPS.type(m, ch, n) },
  { k: 'input', tip: 'Inputs that start it (in the moveset of the plane setting: 2D or 2.5D)', get: (m, n, ch) => moveInputs(ch, n).join(' ') },
  { k: 'stance', tip: GROUP_TIPS.stance, get: (m, n, ch) => MOVE_GROUPS.stance(m, ch, n) },
  { k: 'limb', tip: 'Striking bones: the bones that land the hit (set in the move panel)', get: m => m.power ? hitIds(m).join('+') : '' },
  { k: 'height', tip: 'Height: what blocks it (click a value to change it)', get: m => m.power ? m.height || 'mid' : '', height: true },
  ...Object.keys(PHASE_TIPS).map(k => ({ k, tip: PHASE_TIPS[k], get: m => frameData(m)[k], phase: true })),
  ...MOVE_PROPS.map(p => ({ k: p.k, tip: p.tip, get: m => m[p.k] ?? '', prop: p })),
  { k: 'hits', tip: 'The states of the foe it hits (set in the move panel; empty = any)', get: m => m.hits?.join(' ') ?? '' },
  { k: 'flags', tip: 'Move flags (set them in the move panel)', get: m => Object.keys(MOVE_FLAGS).filter(f => m[f]).join(' ') },
];
function setPhase(n, phase, frames) {
  edit(def => {
    let seen = false;
    const ks = def.moves[n].keys.filter(k => (k.active ? (seen = true, 'active') : seen ? 'recovery' : 'startup') === phase), cur = ks.reduce((s, k) => s + k.d, 0);
    if (cur > 0 && frames > 0) for (const k of ks) k.d = +(k.d * frames / 60 / cur).toFixed(4);
  });
}
let peek = null; // the hover preview: the move (or a combo route: several in a row) playing next to the cursor
const peekMove = (n, e) => peekSeq([n], e);
// a route plays each move until its cancel window opens, where the next one starts, and the last one to its end
function peekSeq(ns, e) {
  const label = ns.join(' › ');
  if (!peek || peek.n !== label) {
    peek?.el.remove();
    const segs = [];
    let d = 0;
    ns.forEach((n, i) => { const m = currentChar().moves[n], len = i < ns.length - 1 ? Math.min(total(m), keyStart(m, m.cancel)) : total(m);
      segs.push({ m, ch: withWeapon(currentChar(), m), t0: d }); d += len; });
    const cv = h('canvas'), el = h('div', { cls: 'peek' }, cv, h('span', { textContent: label })), t0 = performance.now();
    peek = { n: label, el, d };
    document.body.append(el);
    rafLoop(el, () => {
      if (peek?.el !== el) return false;
      if (!document.querySelector('.mtable, .pop')) { unpeek(); return false; } // the table or popup closed without a mouseleave - stop animating
      const t = Math.max(0, performance.now() - t0) / 1000 % (d + 0.3), s = segs.findLast(s => s.t0 <= t); // (the first frame's time can be before t0)
      drawThumb(cv, s.ch, samplePose(s.ch, s.m, t - s.t0), 120, 128);
    });
  }
  placeNear(peek.el, { left: e.clientX + 16, right: e.clientX + 16, top: e.clientY - 70, bottom: e.clientY - 70 }, { gap: 0 });
}
const unpeek = () => { peek?.el.remove(); peek = null; };
function moveTable() {
  const body = h('tbody'), head = h('tr'), wrap = h('div', { cls: 'mtable' });
  const fill = () => {
    const ch = currentChar(), q = anim.tfilter.trim(), { k: sk, dir } = anim.tsort, col = TABLE_COLS.find(c => c.k === sk);
    const rows = Object.keys(ch.moves).map(n => ({ n, v: TABLE_COLS.map(c => c.get(ch.moves[n], n, ch)) }))
      .filter(r => !q || fuzzy(q, r.v.filter(v => typeof v === 'string').join(' ')));
    if (col) { const i = TABLE_COLS.indexOf(col), blank = v => v === '' || v === undefined;
      rows.sort((a, b) => blank(a.v[i]) - blank(b.v[i]) || dir * (typeof a.v[i] === 'number' && typeof b.v[i] === 'number' ? a.v[i] - b.v[i] : String(a.v[i]).localeCompare(String(b.v[i])))); }
    head.replaceChildren(...TABLE_COLS.map(c => h('th', { tip: `${c.tip} · click: sort`, textContent: c.k + (c.k === sk ? (dir > 0 ? ' ▲' : ' ▼') : ''),
      onclick: () => { anim.tsort = { k: c.k, dir: c.k === sk ? -dir : 1 }; fill(); } })));
    body.replaceChildren(...rows.map(({ n, v }) => {
      const m = ch.moves[n], tr = h('tr', { cls: anim.move === n ? 'on' : '', onclick: () => { anim.tscroll = wrap.scrollTop; openMove(n); },
        onmousemove: e => peekMove(n, e), onmouseleave: unpeek });
      tr.append(...TABLE_COLS.map((c, i) => {
        const td = h('td');
        if (c.prop || c.phase) {
          const p = c.prop || { min: 1, max: 120, step: 1 };
          td.append(h('input', { type: 'number', step: p.step, value: v[i], placeholder: c.k === 'damage' && m.power ? fmt(moveDamage(m)) : '',
            tip: `${n} · ${c.tip}`, onclick: e => e.stopPropagation(), onkeydown: e => e.stopPropagation(),
            onchange: e => { const x = parseFloat(e.target.value);
              if (c.phase) setPhase(n, c.k, x); else edit(def => { if (x) def.moves[n][c.k] = x; else delete def.moves[n][c.k]; });
              fill(); } }));
        } else if (c.height && v[i]) td.append(button(v[i], `${n}: ${HEIGHT_TIPS[v[i]]} · click to change`, (e, b) => { e.stopPropagation();
          popup(b, seg(Object.keys(HEIGHT_TIPS), () => m.height || 'mid', x => { edit(def => { def.moves[n].height = x; }); closePop(); fill(); }, HEIGHT_TIPS)); }, 'mini'));
        else td.textContent = v[i];
        return td;
      }));
      return tr;
    }));
    if (!rows.length) body.replaceChildren(h('tr', {}, h('td', { colSpan: TABLE_COLS.length, cls: 'note', textContent: 'no move matches the filter' })));
  };
  fill();
  const filter = h('input', { cls: 'macro', value: anim.tfilter, placeholder: 'fuzzy filter: name, type, input, limb, height, flags', tip: 'Letters in order match (e.g. "dk" finds downKick); any column with text counts',
    oninput: e => { anim.tfilter = e.target.value; fill(); }, onkeydown: e => e.stopPropagation() });
  wrap.append(stageHead('move table', VIEW_TIPS.table, filter),
    h('table', {}, h('thead', {}, head), body));
  requestAnimationFrame(() => { wrap.scrollTop = anim.tscroll || 0; });
  return wrap;
}

// ---------- dopesheet: bones × keys of the open move; a dot where the key turns the bone (radius by how far), click to go there ----------
// Shift+click holds the bone (its angle from the key before), Alt+click sends it back to the stance in that key; both undoable
const DOPE_MIN = 0.5; // degrees: smaller changes count as none
function dopeTurns(ch, m) {
  const st = ch.poses.stance;
  return m.keys.map((k, i) => { const p = keyPose(ch, m, i), q = i ? keyPose(ch, m, i - 1) : st;
    return Object.fromEntries(ch.ids.map(id => [id, { a: p[id] ?? 0, d: (p[id] ?? 0) - (q[id] ?? 0), own: !!k.p && id in k.p }])); });
}
function dopeEdit(i, id, how) {
  const ch = edChar(), m = curMove(), prev = i ? keyPose(ch, m, i - 1)[id] : ch.poses.stance[id];
  edit(def => { const k = def.moves[anim.move].keys[i];
    if (how === 'hold') (k.p ??= {})[id] = prev; else if (k.p) delete k.p[id]; });
}
function dopeSheet() {
  const wrap = h('div', { cls: 'mtable dope' }), table = h('table');
  const fill = () => {
    const ch = edChar(), m = curMove(), turns = dopeTurns(ch, m), T = total(m), frames = k => Math.max(1, Math.round(k.d * 60));
    const head = h('tr', {}, h('th', { textContent: 'bone', tip: 'Bones of the character, parents first' }),
      ...m.keys.map((k, i) => h('th', { cls: i === anim.key ? 'on' : '', textContent: `${i + 1} · ${frames(k)}f`, tip: `Key ${i + 1}: ${frames(k)} frames · click: go to it`,
        style: `min-width:${Math.max(28, Math.round(frames(k) / Math.max(1, T * 60) * 600))}px`, onclick: () => { selectKey(i); panels(); } })));
    const rows = ch.bones.filter(b => !b.hidden).map(b => h('tr', {}, h('td', { textContent: b.id, tip: `${b.id} · ${b.role}${b.side ? ' · ' + (b.side === 'f' ? 'front' : 'back') : ''}` }),
      ...turns.map((t, i) => { const c = t[b.id], moved = Math.abs(c.d) >= DOPE_MIN, r = moved ? Math.round(3 + Math.min(1, Math.abs(c.d) / 90) * 6) : 0;
        return h('td', { cls: 'dcell' + (i === anim.key ? ' on' : ''), tip: `${b.id} in key ${i + 1}: ${Math.round(c.a)}°${moved ? ` (turns ${c.d > 0 ? '+' : ''}${Math.round(c.d)}°)` : ' (no change)'}${c.own ? '' : ' · from the stance'} · click: go · Shift+click: hold · Alt+click: back to stance`,
          onclick: e => { if (e.shiftKey) dopeEdit(i, b.id, 'hold'); else if (e.altKey) dopeEdit(i, b.id, 'stance'); selectKey(i); panels(); } },
          moved ? h('span', { cls: 'ddot' + (c.own ? '' : ' st'), style: `width:${r * 2}px;height:${r * 2}px` }) : h('span', { cls: 'dline' })); })));
    table.replaceChildren(h('thead', {}, head), h('tbody', {}, ...rows));
  };
  reg(table, fill);
  wrap.append(stageHead('dopesheet', VIEW_TIPS.dope), table);
  return wrap;
}
