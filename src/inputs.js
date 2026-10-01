'use strict';
// ---------- input table: the move each input starts, in the moveset of the plane setting and the stance being edited ----------
// direction pads per button (numpad layout, 6 = toward the opponent) show the directions without a move of their own;
// the table under them lists every input slot. Click either to give the input a move.
const PAD = [7, 8, 9, 4, 5, 6, 1, 2, 3];
const DIR_V = { 7: 'up', 8: 'up', 9: 'up', 1: 'down', 2: 'down', 3: 'down' }, DIR_H = { 7: 'Back', 4: 'Back', 1: 'Back', 9: 'Fwd', 6: 'Fwd', 3: 'Fwd' };
const DIR_ARROW = { 7: '↖', 8: '↑', 9: '↗', 4: '←', 5: '', 6: '→', 1: '↙', 2: '↓', 3: '↘' };
// a cell: its label, the slots it tries in order (as Fighter.pick does) and whether the first is its own
const groundCell = (d, B) => { const v = DIR_V[d] || '', hz = DIR_H[d] || '';
  return { chain: [v && hz && v + hz + B, v ? v + B : hz && hz.toLowerCase() + B, B.toLowerCase()].filter(Boolean), own: true }; };
const airCell = (d, B) => { const v = { up: 'Up', down: 'Down' }[DIR_V[d]] || ''; return { chain: ['air' + v + B, 'air' + B], own: !DIR_H[d] }; };
const specialCell = d => { const v = DIR_V[d], hz = DIR_H[d];
  return { chain: [v ? v + 'Special' : hz ? hz.toLowerCase() + 'Special' : 'special', 'special'], own: !(v && hz) }; };
const INPUT_PADS = [
  { name: 'P', tip: 'Punch (J) with each direction: a diagonal without a move uses its vertical, then the neutral P', cells: PAD.map(d => ({ d, label: d + 'P', ...groundCell(d, 'Punch') })) },
  { name: 'K', tip: 'Kick (K) with each direction, falling back the same way', cells: PAD.map(d => ({ d, label: d + 'K', ...groundCell(d, 'Kick') })) },
  { name: 'S', tip: 'Special (U) with each direction; diagonals count as their vertical, a direction without a special uses the neutral S', cells: PAD.map(d => ({ d, label: d + 'S', ...specialCell(d) })) },
  { name: 'air P', tip: 'Punch in the air: ↑ / ↓ have their own slots in 2D, else the air P', cells: PAD.map(d => ({ d, label: 'j.' + d + 'P', ...airCell(d, 'Punch') })) },
  { name: 'air K', tip: 'Kick in the air, as air P', cells: PAD.map(d => ({ d, label: 'j.' + d + 'K', ...airCell(d, 'Kick') })) },
  { name: 'motions', tip: 'Special motions (numpad notation): if the motion has no move, the button plays its normal', cols: 2,
    cells: [['236', 'qcf'], ['214', 'qcb'], ['623', 'dp']].flatMap(([n, k]) => ['Punch', 'Kick'].map(B => ({ label: n + B[0], chain: [k + B], own: true }))) },
  { name: 'other', tip: 'Run + P, P + G and S in the air', cols: 1,
    cells: [['66P', 'dashPunch'], ['P+G', 'throw'], ['j.S', 'airSpecial']].map(([label, s]) => ({ label, chain: [s], own: true })) },
];
const inputs = { hand: '', unset: false };
const HAND_TIPS = { '': 'Unarmed binds', ...Object.fromEntries(Object.entries(WEAPON_CLASSES).map(([k, c]) => [k, `Holding a ${k} weapon (${c.weapon}): ${c.tip}. Its binds hold in every stance and replace the unarmed ones`])) };
const handChar = () => inputs.hand ? withWeapon(currentChar(), { weapon: inputs.hand }) : currentChar();
// what a cell does now: its own slot (if the plane has it), the move it starts and the slot that move comes from
function cellState(c, binds, ch) {
  const own = c.own && c.chain[0] in slotsOf(CFG.plane) ? c.chain[0] : null;
  const from = c.chain.find(s => ch.moves[binds[s]]), move = from ? binds[from] : null;
  return { own, move, from, st: !own ? 'alias' : from === own ? 'set' : move ? 'fall' : 'none' };
}
// what clearing a slot gives back: the weapon class's move, the main stance's, or the built-in table's
const defaultBind = s => inputs.hand ? WEAPON_CLASSES[inputs.hand].binds[s] || '(unarmed)' : studio.stance ? currentChar().stances[0][bkey()][s] : slotsOf(CFG.plane)[s];
const assign = (s, v) => edit(def => {
  const b = inputs.hand ? ((def.wbinds ??= {})[inputs.hand] ??= {}) : editBinds(def);
  if (v === undefined) delete b[s]; else b[s] = v;
});
const STATE_TIPS = { set: 'has its own move', fall: 'no move of its own: plays the one shown after ↪', none: 'no move: nothing happens', alias: 'no slot of its own here: plays the one shown after =' };
function pickBind(s, anchor, done) {
  const ch = handChar(), cur = curBinds(ch)[s], groups = new Map();
  for (const n of Object.keys(ch.moves)) { const g = MOVE_GROUPS.type(ch.moves[n], ch, n); groups.set(g, [...groups.get(g) || [], n]); }
  const set = v => { assign(s, v); closePop(); done(); };
  popup(anchor, h('b', { textContent: s }), h('p', {}, ...rich(SLOT_TIPS[s] || '')),
    h('div', { cls: 'bar' },
      ch.moves[anim.move] && button(`:check: ${anim.move}`, 'The move open in the editor', () => set(anim.move)),
      button(`:history: default: ${defaultBind(s) || 'none'}`, 'Back to the default', () => set(undefined)),
      button(':block: none', inputs.hand ? 'No weapon move: the unarmed bind plays' : 'No move on this input', () => set(''))),
    ...[...groups].sort((a, b) => (GROUP_ORDER.indexOf(a[0]) + 1 || 99) - (GROUP_ORDER.indexOf(b[0]) + 1 || 99))
      .flatMap(([g, ns]) => [h('h4', { textContent: g }), h('div', { cls: 'bar' }, seg(ns, () => cur, set))]));
}
function inputTable() {
  const wrap = h('div', { cls: 'mtable itable' }), pads = h('div', { cls: 'pads' }), body = h('tbody'), count = h('span', { cls: 'note' });
  const fill = () => {
    const ch = handChar(), binds = curBinds(ch), table = slotsOf(CFG.plane), seen = new Set(), rows = [];
    const label = (c, x) => x.st === 'set' ? x.move : x.st === 'fall' ? '↪ ' + x.move : x.st === 'alias' ? (x.move ? '= ' + x.move : '') : '—';
    pads.replaceChildren(...INPUT_PADS.map(p => h('div', { cls: 'pad' }, h('h4', { tip: p.tip, textContent: p.name }),
      h('div', { cls: 'grid', style: `grid-template-columns: repeat(${p.cols || 3}, 1fr)` }, p.cells.map(c => {
        const x = cellState(c, binds, ch), tip = `${c.label}: ${x.own ? SLOT_TIPS[x.own] + ' · ' : ''}${STATE_TIPS[x.st]}${x.move ? ` (${x.move}${x.from !== x.own ? ' from ' + x.from : ''})` : ''}${x.own ? ' · click: pick a move' : ''}`;
        if (x.own && !seen.has(x.own)) { seen.add(x.own); rows.push({ c, x }); }
        const b = h('button', { cls: `${x.st}${x.move && x.move === anim.move ? ' cur' : ''}`, tip,
          onclick: () => x.own && pickBind(x.own, b, fill), onmousemove: e => x.move && peekMove(x.move, e), onmouseleave: unpeek },
          h('span', { cls: 'd' }, ...rich(`${DIR_ARROW[c.d] || ''} ${c.label}`)), h('span', { textContent: label(c, x) }));
        return b;
      })))));
    for (const s of Object.keys(table)) if (!seen.has(s)) rows.push({ c: { label: s, chain: [s] }, x: cellState({ chain: [s], own: true }, binds, ch) });
    const unset = rows.filter(r => r.x.st !== 'set');
    count.textContent = `${unset.length} of ${rows.length} inputs without a move of their own (${rows.filter(r => r.x.st === 'none').length} do nothing)`;
    body.replaceChildren(...rows.filter(r => !inputs.unset || r.x.st !== 'set').map(({ c, x }) => {
      const m = x.move && ch.moves[x.move], fd = m && frameData(m), mv = button(x.st === 'set' ? x.move : '—', 'Pick a move', (e, b) => { e.stopPropagation(); pickBind(x.own, b, fill); }, 'mini');
      return h('tr', { cls: x.st, onclick: () => pickBind(x.own, mv, fill), onmousemove: e => m && peekMove(x.move, e), onmouseleave: unpeek },
        h('td', {}, ...rich(`${DIR_ARROW[c.d] || ''} ${c.label}`)), h('td', { textContent: x.own }), h('td', {}, mv),
        h('td', { textContent: x.st === 'fall' ? '↪ ' + x.move : x.st === 'none' ? 'nothing' : '' }), h('td', { textContent: SLOT_TIPS[x.own] || '' }),
        h('td', { textContent: fd ? fd.startup : '' }), h('td', { textContent: m?.power ? m.height || 'mid' : '' }), h('td', { textContent: m?.power ? fmt(moveDamage(m)) : '' }));
    }));
  };
  const ch = currentChar(), names = ch.stances.map(s => s.name);
  wrap.append(
    h('div', { cls: 'bar' },
      seg(names.map((_, i) => i), () => studio.stance, i => { studio.stance = i; panels(); }, { 0: 'The main stance' }, i => names[i]),
      seg(['2d', '25'], () => CFG.plane === '2d' ? '2d' : '25', v => { setCfg({ plane: v === '2d' ? '2d' : 'lanes' }); panels(); mode().restart(); },
        { '2d': '2D moveset: ↑ jumps (↑ with P / K together is an up attack), air moves by direction', '25': '2.5D moveset (VF-style): every direction × button is a ground move' }, v => v === '2d' ? '2D' : '2.5D'),
      seg(Object.keys(HAND_TIPS), () => inputs.hand, v => { inputs.hand = v; fill(); }, HAND_TIPS, v => v ? ':swords: ' + v : ':back_hand: unarmed'),
      toggle(':filter_list: unassigned', 'Only list the inputs without a move of their own', () => inputs.unset, v => { inputs.unset = v; fill(); }),
      h('span', { cls: 'fill' }),
      button(':close: editor', 'Back to the keyframe editor', () => { anim.view = 'cards'; unpeek(); panels(); })),
    h('div', { cls: 'legend' }, ...Object.entries({ set: 'own move', fall: '↪ falls back', none: '— nothing', alias: '= same as' }).map(([k, l]) => h('span', { cls: 'key ' + k, tip: STATE_TIPS[k], textContent: l })), count),
    pads,
    h('table', {}, h('thead', {}, h('tr', {}, ['input', 'slot', 'move', 'plays', 'keys', 'startup', 'height', 'damage'].map(k => h('th', { textContent: k })))), body));
  reg(wrap, fill); // undo, plane and stance changes refresh it
  return wrap;
}
