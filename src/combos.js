'use strict';
// ---------- combos: the chain links (a move's next: P / K → move) as a tree per starter or a table of routes, edited in place ----------
const combos = { view: 'tree' };
const LINK_BTNS = { punch: 'P', kick: 'K' };
// an input slot in numpad notation (5P, 6K, j.2P…), from the input pads
const SLOT_NOTE = Object.fromEntries(INPUT_PADS.flatMap(p => p.cells.filter(c => c.own).map(c => [c.chain[0], c.label])));
const COMBO_TIPS = { tree: 'Every starter with its branches: the button that chains into each next move; ✕ cuts a link, + P / + K adds one',
  table: 'One row per route from a starter to its end: inputs, damage (before combo scaling) and frames; click a step to change or cut it, + P / + K extends the route' };
// set (or with '' remove) the link from a move on a button
function setLink(from, b, to) {
  edit(def => {
    const m = def.moves[from], next = { ...m.next, [b]: to };
    if (!to) delete next[b];
    if (Object.keys(next).length) m.next = next; else delete m.next;
  });
}
// a popup of the moves a link can point to: normals of the same kind (air with air, weapon with weapon)
function pickLink(anchor, from, b, done) {
  const ch = currentChar(), src = ch.moves[from], cur = src.next?.[b], groups = new Map();
  for (const n of Object.keys(ch.moves)) {
    const m = ch.moves[n];
    if (!m.power || !!m.air !== !!src.air || !!m.weapon !== !!src.weapon) continue;
    const g = MOVE_GROUPS.type(m, ch, n); groups.set(g, [...groups.get(g) || [], n]);
  }
  const set = v => { setLink(from, b, v); closePop(); done(); };
  popup(anchor, h('b', { textContent: `${from} › ${LINK_BTNS[b]}` }), h('p', { textContent: `The move ${LINK_BTNS[b]} chains ${from} into, in its cancel window (chains setting authored)` }),
    cur ? h('div', { cls: 'bar' }, button(':content_cut: cut', `Remove the link: ${LINK_BTNS[b]} after ${from} does not chain`, () => set(''))) : null,
    ...[...groups].flatMap(([g, ns]) => [h('h4', { textContent: g }), h('div', { cls: 'bar' }, seg(ns, () => cur, set))]));
}
// + P / + K for the buttons a move has no link on yet
const addLinks = (from, done) => Object.keys(LINK_BTNS).filter(b => !currentChar().moves[from].next?.[b])
  .map(b => button(`:add: ${LINK_BTNS[b]}`, `Chain ${from} into a move on ${LINK_BTNS[b]}`, (e, el) => { e.stopPropagation(); pickLink(el, from, b, done); }, 'mini'));
// a move as a chip: click opens it in the editor, hover plays it
const moveChip = (n, tip = 'Click: open it in the editor · hover: play it') => h('button', { cls: 'chip', tip: `${n} · ${tip}`, textContent: n,
  onclick: () => { anim.view = 'cards'; unpeek(); pickMove(n); }, onmousemove: e => peekMove(n, e), onmouseleave: unpeek });
function comboView() {
  const wrap = h('div', { cls: 'mtable ctable' }), body = h('div'), count = h('span', { cls: 'note' });
  const fill = () => {
    const ch = currentChar(), binds = curBinds(ch), bound = new Set(Object.values(binds)), roots = comboRoots(ch, bound);
    const routes = comboRoutes(ch, roots, CFG.attackSpeed), slot = n => { const s = Object.keys(binds).find(s => binds[s] === n); return s && (SLOT_NOTE[s] || s); };
    count.textContent = `${roots.length} starters · ${routes.length} routes`;
    const warn = CFG.chains !== 'authored' && h('div', { cls: 'note warn' }, `The chains setting is ${CFG.chains}: these links only chain with it authored `,
      button('use authored', SPEC.chains.tip, () => { setCfg({ chains: 'authored' }); fill(); }, 'mini'));
    const node = (n, path) => h('div', { cls: 'cnode' }, moveChip(n), ...addLinks(n, fill),
      ...linksOf(ch, n).map(([b, t]) => h('div', { cls: 'clink' },
        button(':close:', `Cut the link ${n} › ${LINK_BTNS[b]} › ${t}`, () => { setLink(n, b, ''); fill(); }, 'mini'),
        button(`${LINK_BTNS[b]} ›`, `${LINK_BTNS[b]} after ${n} chains into ${t} · click: change it`, (e, el) => pickLink(el, n, b, fill), 'mini'),
        path.includes(t) ? h('span', { cls: 'note', tip: `${t} is earlier in this route: the chain loops`, textContent: `↺ ${t}` }) : node(t, [...path, t]))));
    const starters = Object.keys(ch.moves).filter(n => bound.has(n) && ch.moves[n].power && !roots.includes(n));
    const addStarter = button(':add: starter', 'Start a new chain from a move bound to an input that has no links yet', (e, el) => popup(el, h('b', { textContent: 'starter' }),
      h('div', { cls: 'bar' }, starters.map(n => button(n, `Chain ${n} into a move on P`, () => { closePop(); pickLink(el, n, 'punch', fill); })))));
    if (combos.view === 'tree') body.replaceChildren(...roots.map(n => h('div', { cls: 'croot' }, h('span', { cls: 'note', textContent: slot(n) || 'no input' }), node(n, [n]))), addStarter);
    else body.replaceChildren(h('table', {}, h('thead', {}, h('tr', {}, ['route', 'inputs', 'damage', 'frames'].map(k => h('th', { textContent: k })))),
      h('tbody', {}, routes.map(r => h('tr', {},
        h('td', {}, ...r.moves.flatMap((n, i) => i ? [h('span', { cls: 'note', textContent: ' › ' }),
          button(n, `${LINK_BTNS[r.inputs[i]]} after ${r.moves[i - 1]} chains into ${n} · click: change or cut it`, (e, el) => pickLink(el, r.moves[i - 1], r.inputs[i], fill), 'mini')] : [moveChip(n)]),
          ...addLinks(r.moves.at(-1), fill)),
        h('td', { textContent: [slot(r.moves[0]) || '—', ...r.inputs.slice(1).map(b => LINK_BTNS[b])].join(' ') }),
        h('td', { textContent: r.damage }), h('td', { textContent: r.frames + 'f' }))))), addStarter);
    wrap.querySelector('.warn')?.remove();
    if (warn) body.before(warn);
  };
  wrap.append(h('div', { cls: 'bar' },
    seg(Object.keys(COMBO_TIPS), () => combos.view, v => { combos.view = v; fill(); }, COMBO_TIPS, v => v === 'tree' ? ':view_stream: tree' : ':table_rows: table'),
    count, h('span', { cls: 'fill' }),
    button(':close: editor', 'Back to the keyframe editor', () => { anim.view = 'cards'; unpeek(); panels(); })), body);
  fill();
  reg(wrap, fill); // undo and stance changes refresh it
  return wrap;
}
