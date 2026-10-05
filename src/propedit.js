'use strict';
// ---------- props and weapons editor: both are built from the same primitive shapes (src/shapes.js) ----------
// a thin, utilitarian editor over shared data (BASE_PROPS/PROPS, src/stage.js; BASE_WEAPONS/WEAPONS, src/rig.js):
// pick a built-in or custom one, tune its own fields and its shape list, revert or delete — same pattern as sounds
let propSel = null, weaponSel = null;
const numInput = (v, set, title) => h('input', { type: 'number', value: fmt(v), tip: title, style: 'flex:none;width:52px',
  onkeydown: e => e.stopPropagation(), onchange: e => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) set(n); } });
// a weapon coordinate can be a plain number or 'len' / 'len-4' (reaches for the live blade length); props never use that
const coordInput = (v, set, title) => h('input', { cls: 'macro', value: String(v), tip: title, style: 'flex:none;width:56px',
  onkeydown: e => e.stopPropagation(), onchange: e => { const s = e.target.value.trim(); const n = parseFloat(s); set(/^-?\d+(\.\d+)?$/.test(s) ? n : s); } });
const colorInput = (v, set) => h('input', { type: 'color', value: /^#/.test(v) ? v : '#888888', tip: 'Colour', style: 'flex:none;width:28px;padding:0',
  onchange: e => set(e.target.value) });
// rows for one primitive's own fields; weapon: coordInput (numbers or 'len'-relative text) and a wood/metal/custom colour seg;
// prop: numInput (plain pixels) and a colour picker. set(patch) merges a partial update into this shape and re-renders
function shapeRows(s, set, weapon) {
  const num = (k, title) => numInput(s[k], v => set({ [k]: v }), title);
  const coord = (k, title) => coordInput(s[k], v => set({ [k]: v }), title);
  const field = weapon ? coord : num;
  const col = (k = 'col') => weapon
    ? seg(['wood', 'metal', 'custom'], () => s[k] === 'wood' || s[k] === 'metal' ? s[k] : 'custom', v => set({ [k]: v === 'custom' ? '#888888' : v }), {}, v => v)
    : colorInput(s[k] || '#888888', v => set({ [k]: v }));
  const rows = [];
  if (s.kind === 'line') rows.push(
    h('div', { cls: 'bar' }, h('span', { textContent: weapon ? 'from' : 'x1,y1' }), field('x1', weapon ? 'Distance along the blade, from the grip' : 'x'), field('y1', weapon ? 'Perpendicular offset' : 'y')),
    h('div', { cls: 'bar' }, h('span', { textContent: weapon ? 'to' : 'x2,y2' }), field('x2', weapon ? 'Distance along the blade (or len / len-4 to reach the tip)' : 'x'), field('y2', weapon ? 'Perpendicular offset' : 'y')),
    h('div', { cls: 'bar' }, h('span', { textContent: 'width' }), num('w', 'Line width'), col()),
    !weapon ? h('div', { cls: 'bar' }, toggle(':swap_horiz: sways', 'This line leans when the prop is struck (moveable must be on too) — its own px of lean', () => !!s.sway, v => set({ sway: v ? 22 : undefined })),
      s.sway ? num('sway', 'How far it leans, in px') : null) : null);
  else if (s.kind === 'circle') rows.push(
    h('div', { cls: 'bar' }, h('span', { textContent: 'centre' }), field('cx', 'Centre'), field('cy', 'Centre')),
    h('div', { cls: 'bar' }, h('span', { textContent: 'radius' }), num('rx', 'Horizontal radius'), num('ry', 'Vertical radius (same as horizontal: a circle)'), col()));
  else if (s.kind === 'box') rows.push(
    h('div', { cls: 'bar' }, h('span', { textContent: 'from' }), field('x', 'Top-left corner'), field('y', 'Top-left corner')),
    h('div', { cls: 'bar' }, h('span', { textContent: 'size' }), num('w', 'Width'), num('h', 'Height'), col()),
    h('div', { cls: 'bar' }, toggle('cross', 'A diagonal cross through it (a crate\'s planks)', () => !!s.cross, v => set({ cross: v }))));
  else rows.push( // polygon
    ...s.pts.map((pt, i) => h('div', { cls: 'bar' }, h('span', { textContent: 'point ' + (i + 1) }),
      coordInput(pt[0], v => { const pts = s.pts.map(p => [...p]); pts[i][0] = v; set({ pts }); }, 'x'),
      coordInput(pt[1], v => { const pts = s.pts.map(p => [...p]); pts[i][1] = v; set({ pts }); }, 'y'),
      s.pts.length > 3 ? button(':close:', 'Remove this point', () => set({ pts: s.pts.filter((_, j) => j !== i) }), 'mini') : null)),
    h('div', { cls: 'bar' }, button(':add: point', 'Add a point after the last one', () => set({ pts: [...s.pts, [0, 0]] }), 'mini'), col()));
  return rows;
}
// the shape list itself: add, reorder isn't needed (later ones just draw over earlier ones, like fx stacks), remove.
// each shape's own fields stay visible (not foldable: #side's fold/shut CSS doesn't reach into this overlay panel)
function shapeList(shapes, onChange, weapon) {
  const wrap = h('div', {});
  const fill = () => wrap.replaceChildren(...shapes.map((s, i) => h('div', { cls: 'shaperow' },
    h('div', { cls: 'bar' }, h('b', { textContent: `${i + 1}. ${s.kind}` }),
      button(':close:', 'Remove this shape', () => { shapes.splice(i, 1); onChange(); fill(); }, 'mini')),
    ...shapeRows(s, patch => { Object.assign(s, patch); onChange(); fill(); }, weapon))));
  fill();
  return h('div', {}, wrap, h('div', { cls: 'bar' }, ...SHAPE_KINDS.map(k => button(`:add: ${k}`, `Add a ${k}: ${SHAPE_KIND_TIPS[k]}`, () => { shapes.push(newShape(k)); onChange(); fill(); }, 'mini'))));
}
// ---------- props ----------
function propCanvas(name) {
  const cv = h('canvas', { width: 90 * dpr, height: 64 * dpr, cls: 'scenthumb' });
  const p = PROPS[name]; if (!p) return cv;
  const ctx = cv.getContext('2d'), gy = cv.height - 8 * dpr, s = dpr * 0.9;
  drawShapes(ctx, p.shapes, (x, y) => [cv.width / 2 + x * s, gy + y * s], c => c || '#888', { sway: 0 });
  ctx.strokeStyle = '#cfc8bb'; ctx.lineWidth = dpr; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(cv.width, gy); ctx.stroke();
  return cv;
}
function propFields(name, refill) {
  const p = PROPS[name], built = name in BASE_PROPS, set = patch => { saveProp(name, { ...PROPS[name], ...patch }); refill(); };
  const nm = built ? h('b', { textContent: name }) : h('input', { cls: 'macro', value: name, tip: 'Rename this prop', onkeydown: e => e.stopPropagation(),
    onchange: () => { const v = nm.value.trim(); if (!v || v === name || PROPS[v]) { nm.value = name; return; } renameProp(name, v); propSel = v; refill(); } });
  return h('div', {},
    h('div', { cls: 'bar' }, nm, built ? h('span', { cls: 'note', textContent: 'built-in — tunable, revert to go back' }) : null,
      button(built ? ':restart_alt: revert' : ':delete: delete', built ? `Back to ${name}'s shipped values` : `Delete ${name}`,
        () => { resetProp(name); if (!built) propSel = null; refill(); })),
    propCanvas(name),
    h('div', { cls: 'bar' }, h('span', { textContent: 'size / height' }), numInput(p.size, v => set({ size: v }), 'Hit-test half-width'), numInput(p.h, v => set({ h: v }), 'Collidable height from the floor')),
    h('div', { cls: 'bar' }, h('span', { textContent: 'layer' }), seg(['back', 'mid', 'front'], () => p.layer || 'mid', v => set({ layer: v === 'mid' ? undefined : v }),
      { back: 'Behind everything', mid: 'Where fighters are (default)', front: 'In front of everything' })),
    h('div', { cls: 'bar' }, toggle(':sync_alt: moveable', 'Sways on a strike (a shape opts in with its own "sways" toggle) and bounces a thrown weapon back', () => !!p.moveable, v => set({ moveable: v })),
      toggle('breakable', 'Has hit points; destroyed once they run out', () => !!p.breakable, v => set({ breakable: v })),
      p.breakable ? numInput(p.hp ?? 10, v => set({ hp: v }), 'Hit points') : null),
    h('h4', { textContent: 'shapes' }), shapeList(p.shapes, () => set({ shapes: p.shapes })));
}
function propsPanel() {
  const wrap = h('div', { cls: 'mtable' }), body = h('div');
  const fill = () => {
    if (propSel && !PROPS[propSel]) propSel = null;
    const row = n => h('button', { cls: 'card' + (propSel === n ? ' on' : ''), onclick: () => { propSel = n; fill(); } },
      propCanvas(n), h('span', { textContent: n }), h('span', { cls: 'gbadge', textContent: n in BASE_PROPS ? 'built-in' : 'custom' }));
    body.replaceChildren(h('div', { cls: 'cards' }, Object.keys(PROPS).map(row)), h('h4', { textContent: propSel || 'pick a prop' }),
      propSel ? propFields(propSel, fill) : h('p', { cls: 'note', textContent: 'click a prop above to tune it, or make a new one' }));
  };
  wrap.append(h('div', { cls: 'bar stagehead' }, h('b', { textContent: 'props', tip: 'Scenery: fixed or moveable, breakable or not, drawn from simple shapes (line, circle, box, polygon). Used by the scenario builder.' }),
    button(':add: new prop', 'A new prop, copied from crate', () => { propSel = duplicateProp('crate'); fill(); })), body);
  fill();
  return wrap;
}
// ---------- weapons ----------
function weaponCanvas(name) {
  const cv = h('canvas', { width: 100 * dpr, height: 50 * dpr, cls: 'scenthumb' });
  const w = WEAPONS[name]; if (!w) return cv;
  const ctx = cv.getContext('2d'), y = cv.height / 2, pad = 10 * dpr, len = (cv.width - pad * 2);
  drawShapes(ctx, w.shapes, (d, s) => [pad + d / w.len * len, y + s * dpr], raw => raw === 'wood' ? WOOD : raw === 'metal' ? METAL : raw, { len: len / dpr });
  return cv;
}
function weaponFields(name, refill) {
  const w = WEAPONS[name], built = name in BASE_WEAPONS, set = patch => { saveWeapon(name, { ...WEAPONS[name], ...patch }); refill(); };
  const nm = built ? h('b', { textContent: name }) : h('input', { cls: 'macro', value: name, tip: 'Rename this weapon', onkeydown: e => e.stopPropagation(),
    onchange: () => { const v = nm.value.trim(); if (!v || v === name || WEAPONS[v]) { nm.value = name; return; } renameWeapon(name, v); weaponSel = v; refill(); } });
  return h('div', {},
    h('div', { cls: 'bar' }, nm, built ? h('span', { cls: 'note', textContent: 'built-in — tunable, revert to go back' }) : null,
      button(built ? ':restart_alt: revert' : ':delete: delete', built ? `Back to ${name}'s shipped values` : `Delete ${name}`,
        () => { resetWeapon(name); if (!built) weaponSel = null; refill(); })),
    weaponCanvas(name),
    h('div', { cls: 'bar' }, h('span', { textContent: 'class' }), seg(Object.keys(WEAPON_CLASSES), () => w.cls, v => set({ cls: v }), mapVals(WEAPON_CLASSES, c => c.tip))),
    h('div', { cls: 'bar' }, h('span', { textContent: 'length / weight' }), numInput(w.len, v => set({ len: v }), 'How long it is, in px'), numInput(w.weight, v => set({ weight: v }), 'Heavier hits harder but swings slower')),
    h('div', { cls: 'bar' }, h('span', { textContent: 'grip angle' }), numInput(w.a, v => set({ a: v }), 'Angle in the hand, relative to the fist'),
      numInput(w.back ?? 0, v => set({ back: v || undefined }), 'Length held behind the hand (a staff)')),
    h('div', { cls: 'bar' }, toggle(':sync_alt: two-handed (chain)', 'Two segments on a loose joint (nunchucks); unrelated to the 2h class', () => !!w.chain, v => set({ chain: v || undefined })),
      numInput(w.grip2 ?? 0, v => set({ grip2: v || undefined }), 'Two-handed: where the back hand grips, from the front hand (− behind)')),
    h('h4', { textContent: 'shapes' }), shapeList(w.shapes, () => set({ shapes: w.shapes }), true));
}
function weaponsPanel() {
  const wrap = h('div', { cls: 'mtable' }), body = h('div');
  const fill = () => {
    if (weaponSel && !WEAPONS[weaponSel]) weaponSel = null;
    const row = n => h('button', { cls: 'card' + (weaponSel === n ? ' on' : ''), onclick: () => { weaponSel = n; fill(); } },
      weaponCanvas(n), h('span', { textContent: n }), h('span', { cls: 'gbadge', textContent: n in BASE_WEAPONS ? 'built-in' : 'custom' }));
    body.replaceChildren(h('div', { cls: 'cards' }, Object.keys(WEAPONS).map(row)), h('h4', { textContent: weaponSel || 'pick a weapon' }),
      weaponSel ? weaponFields(weaponSel, fill) : h('p', { cls: 'note', textContent: 'click a weapon above to tune it, or make a new one' }));
  };
  wrap.append(h('div', { cls: 'bar stagehead' }, h('b', { textContent: 'weapons', tip: 'Held or thrown, drawn along the grip-to-tip axis from simple shapes (line, circle, box, polygon). A custom weapon reuses an existing class\'s moveset.' }),
    button(':add: new weapon', 'A new weapon, copied from sword', () => { weaponSel = duplicateWeapon('sword'); fill(); })), body);
  fill();
  return wrap;
}
const propsMode = { enter() {}, restart() {}, worlds: () => [], render: clear, ctxBar: () => [], side: () => [], overlay: () => [propsPanel()],
  hint: () => 'click a prop to tune it: size, layer, moveable, breakable, and its shapes' };
const weaponsMode = { enter() {}, restart() {}, worlds: () => [], render: clear, ctxBar: () => [], side: () => [], overlay: () => [weaponsPanel()],
  hint: () => 'click a weapon to tune it: class, length, weight, grip, and its shapes' };
