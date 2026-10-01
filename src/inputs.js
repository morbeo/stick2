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
const inputs = { hand: '', unset: false, table: false };
// the character's own motions (def.motions, see customMotions): two cells each, P and K, after the built-in motions
const customCells = () => Object.entries(DEFS[CURRENT].motions || {}).flatMap(([k, d]) => ['Punch', 'Kick'].map(B => ({ label: d + B[0], chain: [k + B], own: true, custom: k })));
const motionArrows = d => d.split('').map(n => DIR_ARROW[n] || '·').join('');
const slotTip = s => SLOT_TIPS[s] || (/^m\d+(Punch|Kick)$/.test(s) ? `Motion ${motionArrows(s.slice(1).replace(/\D+$/, ''))} (${s.slice(1).replace(/\D+$/, '')}) + ${s.endsWith('Punch') ? 'J' : 'K'}, on the ground; tried before the built-in motions, longest first` : '');
const HAND_TIPS = { '': 'Unarmed binds', ...Object.fromEntries(Object.entries(WEAPON_CLASSES).map(([k, c]) => [k, `Holding a ${k} weapon (${c.weapon}): ${c.tip}. Its binds hold in every stance and replace the unarmed ones`])) };
const handChar = () => inputs.hand ? withWeapon(currentChar(), { weapon: inputs.hand }) : currentChar();
// what a cell does now: its own slot (if the plane has it), the move it starts and the slot that move comes from
function cellState(c, binds, ch) {
  const own = c.own && (c.custom || c.chain[0] in slotsOf(CFG.plane)) ? c.chain[0] : null;
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
  popup(anchor, h('b', { textContent: s }), h('p', {}, ...rich(slotTip(s))),
    h('div', { cls: 'bar' },
      ch.moves[anim.move] && button(`:check: ${anim.move}`, 'The move open in the editor', () => set(anim.move)),
      button(`:history: default: ${defaultBind(s) || 'none'}`, 'Back to the default', () => set(undefined)),
      button(':block: none', inputs.hand ? 'No weapon move: the unarmed bind plays' : 'No move on this input', () => set(''))),
    ...[...groups].sort((a, b) => (GROUP_ORDER.indexOf(a[0]) + 1 || 99) - (GROUP_ORDER.indexOf(b[0]) + 1 || 99))
      .flatMap(([g, ns]) => [h('h4', { textContent: g }), h('div', { cls: 'bar' }, seg(ns, () => cur, set))]));
}
// a new input: a motion in numpad notation (6 = toward the opponent) + P or K; it is added and its move picked
function addInput(anchor, done) {
  let d = '', B = 'Punch';
  const shown = h('b', { cls: 'motion' }), add = button(':add: add', 'Add this input and pick its move', () => {
    const k = 'm' + d;
    edit(def => { (def.motions ??= {})[k] = d; });
    closePop(); done(); pickBind(k + B, anchor, done);
  });
  const show = () => { setRich(shown, d ? `${motionArrows(d)} ${d}${B[0]}` : 'press directions'); add.disabled = d.length < 2; };
  popup(anchor, h('b', { textContent: 'New input' }), h('p', {}, ...rich('A motion: the directions in order (numpad notation, 6 = toward the opponent, held within motionWindow), then the button. E.g. 41236 is ←↙↓↘→.')),
    h('div', { cls: 'grid', style: 'display: grid; grid-template-columns: repeat(3, 34px); gap: 2px; margin: 6px 0' },
      PAD.map(n => button(n === 5 ? '·' : DIR_ARROW[n], `${n}`, () => { if (n !== 5 && d.slice(-1) !== String(n)) { d += n; show(); } }))),
    h('div', { cls: 'bar' }, shown, button(':undo:', 'Remove the last direction', () => { d = d.slice(0, -1); show(); }),
      seg(['Punch', 'Kick'], () => B, v => { B = v; show(); }, { Punch: 'J', Kick: 'K' }, v => v[0]), add));
  show();
}
const removeInput = k => edit(def => {
  delete def.motions[k];
  for (const o of [def, ...def.stances || []]) for (const bk of ['binds', 'binds25']) for (const B of ['Punch', 'Kick']) delete o[bk]?.[k + B];
  for (const wb of Object.values(def.wbinds || {})) for (const B of ['Punch', 'Kick']) delete wb[k + B];
});
// a frame data cell of the move an input plays, edited in place (it changes the move, so every input playing it): startup retimes its keys
function moveCell(n, m, k, fill) {
  if (!m?.power) return h('td');
  const v = k === 'startup' ? frameData(m).startup : k === 'damage' ? moveDamage(m) : m[k], p = MOVE_PROPS.find(q => q.k === k) || { min: 1, max: 120, step: 1 };
  if (!DEFS[CURRENT].moves[n]) return h('td', { textContent: k === 'height' ? m.height || 'mid' : fmt(v ?? '') }); // a weapon class's built-in move: read only
  if (k === 'height') return h('td', {}, button(m.height || 'mid', `${n}: ${HEIGHT_TIPS[m.height || 'mid']} · click to change (every input playing ${n})`, (e, b) => { e.stopPropagation();
    popup(b, seg(Object.keys(HEIGHT_TIPS), () => m.height || 'mid', x => { edit(def => { def.moves[n].height = x; }); closePop(); fill(); }, HEIGHT_TIPS)); }, 'mini'));
  return h('td', {}, h('input', { type: 'number', min: p.min, max: p.max, step: p.step, value: k === 'damage' ? m.damage ?? '' : v ?? '', placeholder: k === 'damage' ? fmt(moveDamage(m)) : '',
    tip: `${n} · ${k === 'startup' ? PHASE_TIPS.startup : p.tip} (every input playing ${n})`, onclick: e => e.stopPropagation(), onkeydown: e => e.stopPropagation(),
    onchange: e => { const x = parseFloat(e.target.value);
      if (k === 'startup') setPhase(n, k, x); else edit(def => { if (x || x === 0 && k === 'damage') def.moves[n][k] = clamp(x, p.min, p.max); else delete def.moves[n][k]; });
      fill(); } }));
}
function inputTable() {
  const wrap = h('div', { cls: 'mtable itable' }), pads = h('div', { cls: 'pads' }), body = h('tbody'), count = h('span', { cls: 'note' });
  const fill = () => {
    const ch = handChar(), binds = curBinds(ch), table = slotsOf(CFG.plane), seen = new Set(), rows = [];
    const label = (c, x) => x.st === 'set' ? x.move : x.st === 'fall' ? '↪ ' + x.move : x.st === 'alias' ? (x.move ? '= ' + x.move : '') : '—';
    const padList = INPUT_PADS.map(p => p.name === 'motions' ? { ...p, cells: [...p.cells, ...customCells()] } : p);
    pads.replaceChildren(...padList.map(p => h('div', { cls: 'pad' }, h('h4', { tip: p.tip, textContent: p.name }),
      h('div', { cls: 'grid', style: `grid-template-columns: repeat(${p.cols || 3}, 1fr)` }, p.cells.map(c => {
        const x = cellState(c, binds, ch), tip = `${c.label}: ${x.own ? slotTip(x.own) + ' · ' : ''}${STATE_TIPS[x.st]}${x.move ? ` (${x.move}${x.from !== x.own ? ' from ' + x.from : ''})` : ''}${x.own ? ' · click: pick a move' : ''}`;
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
      const m = x.move && ch.moves[x.move], mv = button(x.st === 'set' ? x.move : '—', 'Pick a move', (e, b) => { e.stopPropagation(); pickBind(x.own, b, fill); }, 'mini');
      return h('tr', { cls: x.st, onclick: () => pickBind(x.own, mv, fill), onmousemove: e => m && peekMove(x.move, e), onmouseleave: unpeek },
        h('td', {}, ...rich(`${DIR_ARROW[c.d] || ''} ${c.custom ? motionArrows(DEFS[CURRENT].motions[c.custom]) + ' ' : ''}${c.label}`),
          c.custom && button(':delete:', `Remove the input ${c.custom.slice(1)} (P and K) and its binds`, e => { e.stopPropagation(); removeInput(c.custom); fill(); }, 'mini')),
        h('td', { textContent: x.own }), h('td', {}, mv),
        h('td', { textContent: x.st === 'fall' ? '↪ ' + x.move : x.st === 'none' ? 'nothing' : '' }), h('td', { textContent: slotTip(x.own) }),
        ...['startup', 'height', 'damage', 'power', 'stun'].map(k => moveCell(x.move, m, k, fill)));
    }));
  };
  const ch = currentChar(), names = ch.stances.map(s => s.name);
  let table;
  wrap.append(
    h('div', { cls: 'bar' },
      seg(names.map((_, i) => i), () => studio.stance, i => { studio.stance = i; panels(); }, { 0: 'The main stance' }, i => names[i]),
      seg(['2d', '25'], () => CFG.plane === '2d' ? '2d' : '25', v => { setCfg({ plane: v === '2d' ? '2d' : 'lanes' }); panels(); mode().restart(); },
        { '2d': '2D moveset: ↑ jumps (↑ with P / K together is an up attack), air moves by direction', '25': '2.5D moveset (VF-style): every direction × button is a ground move' }, v => v === '2d' ? '2D' : '2.5D'),
      seg(Object.keys(HAND_TIPS), () => inputs.hand, v => { inputs.hand = v; fill(); }, HAND_TIPS, v => v ? ':swords: ' + v : ':back_hand: unarmed'),
      toggle(':table_rows: details', 'The table of every input under the pads: its slot, move and keys, and the move\'s startup, height, damage, power and stun (edit them in place)', () => inputs.table, v => { inputs.table = v; table.hidden = !v; }),
      toggle(':filter_list: unassigned', 'Only list the inputs without a move of their own (in the table)', () => inputs.unset, v => { inputs.unset = v; fill(); }),
      button(':add: input', 'Add an input: a motion (e.g. 41236 = ←↙↓↘→) + P or K, then pick its move', (e, b) => addInput(b, fill)),
      h('span', { cls: 'fill' }),
      button(':close: editor', 'Back to the keyframe editor', () => { anim.view = 'cards'; unpeek(); panels(); })),
    h('div', { cls: 'legend' }, ...Object.entries({ set: 'own move', fall: '↪ falls back', none: '— nothing', alias: '= same as' }).map(([k, l]) => h('span', { cls: 'key ' + k, tip: STATE_TIPS[k], textContent: l })), count),
    pads,
    table = h('table', { hidden: !inputs.table }, h('thead', {}, h('tr', {}, ['input', 'slot', 'move', 'plays', 'keys', 'startup', 'height', 'damage', 'power', 'stun'].map(k => h('th', { textContent: k })))), body));
  reg(wrap, fill); // undo, plane and stance changes refresh it
  return wrap;
}
