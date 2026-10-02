'use strict';
// ---------- combos: the chain links (a move's next: P / K, or a direction with it like 6P / 2K → move) as a tree per starter or a table of routes, edited in place ----------
const combos = { view: 'tree' };
const LINK_BTNS = { punch: 'P', kick: 'K' };
// a link key's label (P, K, 6P…), its button (P / K) and direction (numpad, 5: none), and the key for a button and direction
const linkName = b => LINK_BTNS[b] || b, linkBtn = b => LINK_BTNS[b] || b.slice(-1), linkDir = b => LINK_BTNS[b] ? 5 : +b[0];
const linkKey = (L, d) => d === 5 ? (L === 'P' ? 'punch' : 'kick') : d + L;
// an input slot in numpad notation (5P, 6K, j.2P…), from the input pads
const SLOT_NOTE = Object.fromEntries(INPUT_PADS.flatMap(p => p.cells.filter(c => c.own).map(c => [c.chain[0], c.label])));
const COMBO_TIPS = { tree: 'Every starter with its branches: the input that chains into each next move (P, K, or a direction with it like 6P); ✕ cuts a link, + P / + K adds one',
  table: 'One row per route from a starter to its end: inputs, damage (before combo scaling) and frames; click a step to change or cut it, hover one to play the combo up to it, + P / + K extends the route' };
// set (or with '' remove) the link from a move on a button
function setLink(from, b, to) {
  edit(def => {
    const m = def.moves[from], next = { ...m.next, [b]: to };
    if (!to) delete next[b];
    if (Object.keys(next).length) m.next = next; else delete m.next;
  });
}
// a popup of the moves a link can point to: normals of the same kind (air with air, weapon with weapon), and the direction held with the button
function pickLink(anchor, from, b, done) {
  const ch = currentChar(), src = ch.moves[from], cur = src.next?.[b], groups = new Map();
  for (const n of Object.keys(ch.moves)) {
    const m = ch.moves[n];
    if (!m.power || !!m.air !== !!src.air || !!m.weapon !== !!src.weapon) continue;
    const g = MOVE_GROUPS.type(m, ch, n); groups.set(g, [...groups.get(g) || [], n]);
  }
  const set = v => { setLink(from, b, v); closePop(); done(); }, L = linkBtn(b);
  // another direction: an existing link moves to it, a new one is made on it
  const dirs = [7, 8, 9, 4, 5, 6, 1, 2, 3].filter(d => d === linkDir(b) || !src.next?.[linkKey(L, d)]);
  const setDir = d => { const k = linkKey(L, d); if (!cur) { closePop(); return pickLink(anchor, from, k, done); } edit(def => { const m = def.moves[from]; m.next = { ...m.next, [k]: cur }; delete m.next[b]; }); closePop(); done(); };
  const dirTips = Object.fromEntries(dirs.map(d => [d, d === 5 ? `${L} with no direction held (also the fallback for a direction without its own link)` : `${d}${L}: ${L} with ${DIR_ARROW[d]} held (→ toward the foe)`]));
  popup(anchor, h('b', { textContent: `${from} › ${linkName(b)}` }), h('p', { textContent: `The move ${linkName(b)} chains ${from} into, in its cancel window (chains setting authored)` }),
    h('div', { cls: 'bar' }, h('span', { cls: 'note', textContent: 'direction' }), seg(dirs, () => linkDir(b), setDir, dirTips, d => DIR_ARROW[d] || '·')),
    cur ? h('div', { cls: 'bar' }, button(':content_cut: cut', `Remove the link: ${linkName(b)} after ${from} does not chain`, () => set(''))) : null,
    ...[...groups].flatMap(([g, ns]) => [h('h4', { textContent: g }), h('div', { cls: 'bar' }, seg(ns, () => cur, set))]));
}
// + P / + K while the button has a direction without a link: a new link on it (no direction if that is free; the popup picks another)
const addLinks = (from, done) => ['P', 'K'].flatMap(L => {
  const next = currentChar().moves[from].next || {}, d = [5, 6, 4, 2, 8, 3, 1, 9, 7].find(d => !next[linkKey(L, d)]);
  return d ? [button(`:add: ${L}`, `Chain ${from} into a move on ${L} (or a direction with it, like 6${L})`, (e, el) => { e.stopPropagation(); pickLink(el, from, linkKey(L, d), done); }, 'mini')] : [];
});
// a move as a chip: click opens it in the editor, hover plays it (with a route: the route up to it)
const moveChip = (n, route = [n]) => h('button', { cls: 'chip', tip: `${n} · Click: open it in the editor · hover: play ${route.length > 1 ? 'the combo up to it' : 'it'}`, textContent: n,
  onclick: () => openMove(n), onmousemove: e => peekSeq(route, e), onmouseleave: unpeek });
function comboView() {
  const wrap = h('div', { cls: 'mtable ctable' }), body = h('div'), count = h('span', { cls: 'note' });
  const fill = () => {
    const ch = currentChar(), binds = curBinds(ch), bound = new Set(Object.values(binds)), roots = comboRoots(ch, bound);
    const routes = comboRoutes(ch, roots, CFG.attackSpeed), slot = n => { const s = Object.keys(binds).find(s => binds[s] === n); return s && (SLOT_NOTE[s] || s); };
    count.textContent = `${roots.length} starters · ${routes.length} routes`;
    const warn = CFG.chains !== 'authored' && h('div', { cls: 'note warn' }, `The chains setting is ${CFG.chains}: these links only chain with it authored `,
      button('use authored', SPEC.chains.tip, () => { setCfg({ chains: 'authored' }); fill(); }, 'mini'));
    const node = (n, path) => h('div', { cls: 'cnode' }, moveChip(n, path), ...addLinks(n, fill),
      ...linksOf(ch, n).map(([b, t]) => h('div', { cls: 'clink' },
        button(':close:', `Cut the link ${n} › ${linkName(b)} › ${t}`, () => { setLink(n, b, ''); fill(); }, 'mini'),
        button(`${linkName(b)} ›`, `${linkName(b)} after ${n} chains into ${t} · click: change it`, (e, el) => pickLink(el, n, b, fill), 'mini'),
        path.includes(t) ? h('span', { cls: 'note', tip: `${t} is earlier in this route: the chain loops`, textContent: `↺ ${t}` }) : node(t, [...path, t]))));
    const starters = Object.keys(ch.moves).filter(n => bound.has(n) && ch.moves[n].power && !roots.includes(n));
    const addStarter = button(':add: starter', 'Start a new chain from a move bound to an input that has no links yet', (e, el) => popup(el, h('b', { textContent: 'starter' }),
      h('div', { cls: 'bar' }, starters.map(n => button(n, `Chain ${n} into a move on P`, () => { closePop(); pickLink(el, n, 'punch', fill); })))));
    if (combos.view === 'tree') body.replaceChildren(...roots.map(n => h('div', { cls: 'croot' }, h('span', { cls: 'note', textContent: slot(n) || 'no input' }), node(n, [n]))), addStarter);
    else body.replaceChildren(h('table', {}, h('thead', {}, h('tr', {}, ['route', 'inputs', 'damage', 'frames'].map(k => h('th', { textContent: k })))),
      h('tbody', {}, routes.map(r => h('tr', {},
        h('td', {}, ...r.moves.flatMap((n, i) => i ? [h('span', { cls: 'note', textContent: ' › ' }),
          Object.assign(button(n, `${linkName(r.inputs[i])} after ${r.moves[i - 1]} chains into ${n} · click: change or cut it · hover: play the combo up to it`, (e, el) => pickLink(el, r.moves[i - 1], r.inputs[i], fill), 'mini'),
            { onmousemove: e => peekSeq(r.moves.slice(0, i + 1), e), onmouseleave: unpeek })] : [moveChip(n)]),
          ...addLinks(r.moves.at(-1), fill)),
        h('td', { textContent: [slot(r.moves[0]) || '—', ...r.inputs.slice(1).map(linkName)].join(' ') }),
        h('td', { textContent: r.damage }), h('td', { textContent: r.frames + 'f' }))))), addStarter);
    wrap.querySelector('.warn')?.remove();
    if (warn) body.before(warn);
  };
  wrap.append(h('div', { cls: 'bar' },
    seg(Object.keys(COMBO_TIPS), () => combos.view, v => { combos.view = v; fill(); }, COMBO_TIPS, v => v === 'tree' ? ':view_stream: tree' : ':table_rows: table'),
    count, h('span', { cls: 'fill' }),
    button(':close: editor', 'Back to the editor', closeOver)), body);
  fill();
  reg(wrap, fill); // undo and stance changes refresh it
  return wrap;
}
