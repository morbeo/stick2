'use strict';
// ---------- props and weapons editor: both are built from the same primitive shapes (src/shapes.js) ----------
// a thin, utilitarian editor over shared data (BASE_PROPS/PROPS, src/stage.js; BASE_WEAPONS/WEAPONS, src/rig.js):
// pick a built-in or custom one (side panel: a card grid or a table), tune its own fields and its shape list
// (overlay), revert or delete — same pattern as sounds
let propSel = null, weaponSel = null, propView = 'cards', weaponView = 'cards';
const numInput = (v, set, title) => h('input', { type: 'number', value: fmt(v), tip: title, style: 'flex:none;width:52px',
  onkeydown: e => e.stopPropagation(), onchange: e => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) set(n); } });
// a weapon coordinate can be a plain number or 'len' / 'len-4' (reaches for the live blade length); props never use that
const coordInput = (v, set, title) => h('input', { cls: 'macro', value: String(v), tip: title, style: 'flex:none;width:56px',
  onkeydown: e => e.stopPropagation(), onchange: e => { const s = e.target.value.trim(); const n = parseFloat(s); set(/^-?\d+(\.\d+)?$/.test(s) ? n : s); } });
const colorInput = (v, set, title) => h('input', { type: 'color', value: /^#/.test(v) ? v : '#888888', tip: title || 'Colour', style: 'flex:none;width:28px;padding:0',
  onchange: e => set(e.target.value) });
// rows for one primitive's own fields; weapon: coordInput (numbers or 'len'-relative text); prop: numInput (plain
// pixels). Colour: wood/metal quick picks (weapon only) plus a real swatch either way, so any exact colour works too.
// set(patch) merges a partial update into this shape and re-renders
function shapeRows(s, set, weapon) {
  const num = (k, title) => numInput(s[k], v => set({ [k]: v }), title);
  const coord = (k, title) => coordInput(s[k], v => set({ [k]: v }), title);
  const field = weapon ? coord : num;
  const col = (k = 'col') => h('span', { cls: 'bar' },
    weapon ? seg(['wood', 'metal'], () => s[k], v => set({ [k]: v }), { wood: 'Wood colour', metal: 'Metal colour' }) : null,
    colorInput(s[k], v => set({ [k]: v }), weapon ? 'Pick any exact colour (overrides wood/metal)' : 'Colour'));
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
// a gallery or a table of every entry in a collection; shared by props and weapons — cols: [key, label] pairs beyond
// name/badge, read from each entry directly (p => p.field or a formatter); both views show a real-size thumbnail
// (thumb), so a tiny prop and a tall one are visibly different, not squeezed into the same apparent box
function pickerList(view, names, sel, onPick, thumb, isBuilt, cols) {
  if (view === 'cards') return h('div', { cls: 'cards' }, names.map(n => h('button', { cls: 'card' + (sel === n ? ' on' : ''), onclick: () => onPick(n) },
    thumb(n), h('span', { textContent: n }), h('span', { cls: 'gbadge', textContent: isBuilt(n) ? 'built-in' : 'custom' }))));
  return h('div', { cls: 'mtable' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}), h('th', {}), ...cols.map(([, label]) => h('th', { textContent: label })))),
    h('tbody', {}, names.map(n => h('tr', { cls: sel === n ? 'on' : '', onclick: () => onPick(n) },
      h('td', {}, thumb(n)), h('td', { textContent: n }), ...cols.map(([get]) => h('td', { textContent: get(n) })))))));
}
// the real size of every prop/weapon only varies within one short list each — a shared scale (biggest one nearly
// fills its thumbnail) makes every thumbnail's apparent size a true comparison, not an arbitrary per-item fit
function propsScale() {
  let maxH = 1, maxW = 1;
  for (const n in PROPS) { const e = shapeExtent(PROPS[n].shapes, { sway: 0 }); maxH = Math.max(maxH, -e.minY); maxW = Math.max(maxW, e.maxX - e.minX); }
  return Math.min(56 / maxH, 84 / maxW);
}
function weaponsScale() {
  let maxLen = 1, maxW = 1;
  for (const n in WEAPONS) { const w = WEAPONS[n], e = shapeExtent(w.shapes, { len: w.len }); maxLen = Math.max(maxLen, w.len, e.maxX); maxW = Math.max(maxW, (e.maxY - e.minY)); }
  return Math.min(80 / maxLen, 36 / maxW);
}
// ---------- props ----------
function propCanvas(name) {
  const cv = h('canvas', { width: 90 * dpr, height: 64 * dpr, cls: 'itemthumb' });
  const p = PROPS[name]; if (!p) return cv;
  if (p.bg) cv.style.background = p.bg;
  const ctx = cv.getContext('2d'), gy = cv.height - 8 * dpr, s = dpr * propsScale();
  drawShapes(ctx, p.shapes, (x, y) => [cv.width / 2 + x * s, gy + y * s], c => c || '#888', { sway: 0 });
  ctx.strokeStyle = '#cfc8bb'; ctx.lineWidth = dpr; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(cv.width, gy); ctx.stroke();
  return cv;
}
// a shape's own draggable points, in its local space: position (and, for circle/box, one size handle) — enough to
// reposition and roughly resize by eye; exact values still come from the number fields below. get() reads the
// shape live (so two handles on the same shape, e.g. a box's corner and its size, never go stale against each
// other); set(x, y) returns the patch to apply
const round = v => Math.round(v);
function shapeHandles(s) {
  if (s.kind === 'line') return [['x1', 'y1'], ['x2', 'y2']].map(([xk, yk]) => ({ get: () => [s[xk], s[yk]], set: (x, y) => ({ [xk]: round(x), [yk]: round(y) }) }));
  if (s.kind === 'circle') return [{ get: () => [s.cx, s.cy], set: (x, y) => ({ cx: round(x), cy: round(y) }) },
    { get: () => [s.cx + s.rx, s.cy], set: x => ({ rx: round(Math.max(1, x - s.cx)) }) }];
  if (s.kind === 'box') return [{ get: () => [s.x, s.y], set: (x, y) => ({ x: round(x), y: round(y) }) },
    { get: () => [s.x + s.w, s.y + s.h], set: (x, y) => ({ w: round(Math.max(1, x - s.x)), h: round(Math.max(1, y - s.y)) }) }];
  return s.pts.map((_, i) => ({ get: () => s.pts[i], set: (x, y) => { const pts = s.pts.map(p => [...p]); pts[i] = [round(x), round(y)]; return { pts }; } }));
}
const EDIT_W = 240, EDIT_H = 170;
// the same fit used to draw and to hit-test a drag: biggest dimension nearly fills the canvas, ground-anchored
function fitBox(shapes) {
  const e = shapeExtent(shapes, { sway: 0 }), w = Math.max(e.maxX - e.minX, 20), hh = Math.max(-e.minY, 20);
  return { s: Math.min((EDIT_W * dpr - 24 * dpr) / w, (EDIT_H * dpr - 24 * dpr) / hh), gy: EDIT_H * dpr - 12 * dpr, cx: EDIT_W * dpr / 2 };
}
// a bigger, interactive version of propCanvas for the detail view: every shape's handles are draggable dots; drag
// updates the shape and redraws locally (so the drag itself is smooth and never rebuilds this canvas mid-gesture),
// and onChange (persisting + refilling the rest of the panel) only fires once, on release
function propEditCanvas(shapes, onChange, bg) {
  const cv = h('canvas', { cls: 'shapeedit', width: EDIT_W * dpr, height: EDIT_H * dpr, style: `width:${EDIT_W}px;height:${EDIT_H}px;background:${bg || '#f3f0e8'};border-radius:4px;touch-action:none` });
  const ctx = cv.getContext('2d');
  let drag = null;
  const toXY = (x, y) => { const { s, gy, cx } = fitBox(shapes); return [cx + x * s, gy + y * s]; };
  const fromXY = (px, py) => { const { s, gy, cx } = fitBox(shapes); return [(px - cx) / s, (py - gy) / s]; };
  function draw() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawShapes(ctx, shapes, toXY, c => c || '#888', { sway: 0 });
    const { gy } = fitBox(shapes);
    ctx.strokeStyle = '#444'; ctx.lineWidth = dpr; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(cv.width, gy); ctx.stroke();
    ctx.fillStyle = '#4af';
    for (const s of shapes) for (const hd of shapeHandles(s)) { const [x, y] = toXY(...hd.get()); ctx.beginPath(); ctx.arc(x, y, 4 * dpr, 0, 7); ctx.fill(); }
  }
  function pick(px, py) {
    for (const shape of shapes) for (const hd of shapeHandles(shape)) { const [x, y] = toXY(...hd.get()); if (Math.hypot(x - px, y - py) < 8 * dpr) return { shape, hd }; }
    return null;
  }
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; };
  cv.onpointerdown = e => { const [px, py] = pos(e); drag = pick(px, py); if (drag) { cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; } };
  cv.onpointermove = e => { if (!drag) return; const [px, py] = pos(e); const [x, y] = fromXY(px, py); Object.assign(drag.shape, drag.hd.set(x, y)); draw(); };
  cv.onpointerup = () => { if (drag) { drag = null; cv.style.cursor = 'default'; onChange(); } };
  draw();
  return cv;
}
const PROP_COLS = [[n => PROPS[n].size, 'size'], [n => PROPS[n].h, 'h'], [n => PROPS[n].layer || 'mid', 'layer'],
  [n => PROPS[n].moveable ? '✓' : '', 'move'], [n => PROPS[n].breakable ? (PROPS[n].hp ?? '✓') : '', 'break']];
function propPicker() {
  return pickerList(propView, Object.keys(PROPS), propSel, n => { propSel = n; panels(); }, propCanvas, n => n in BASE_PROPS, PROP_COLS);
}
// a compact "what changed" block for a built-in prop/weapon/etc: no body or animation to show for these (just a
// few flat fields plus shapes), so the generic dotted-path list (objdiff.js) on its own is enough
function assetDiffBlock(base, cur, label) {
  const d = diffObj(base, cur);
  if (!d) return null;
  const lines = describeDiff(d);
  return h('div', {}, h('div', { cls: 'bar' }, h('span', { cls: 'note', textContent: 'changed from the built-in:' }),
    button(':content_copy: copy diff', `Copy this ${label}'s diff as JSON`, () => copyData({ format: `stick2.${label}.diff`, diff: d }), 'mini')),
    h('pre', { cls: 'note', textContent: lines.join('\n') }));
}
function propFields(name, refill) {
  const p = PROPS[name], built = name in BASE_PROPS, set = patch => { saveProp(name, { ...PROPS[name], ...patch }); refill(); };
  const nm = built ? h('b', { textContent: name }) : h('input', { cls: 'macro', value: name, tip: 'Rename this prop', onkeydown: e => e.stopPropagation(),
    onchange: () => { const v = nm.value.trim(); if (!v || v === name || PROPS[v]) { nm.value = name; return; } renameProp(name, v); propSel = v; refill(); } });
  return h('div', {},
    h('div', { cls: 'bar' }, nm, built ? h('span', { cls: 'note', textContent: 'built-in — tunable, revert to go back' }) : null,
      button(built ? ':restart_alt: revert' : ':delete: delete', built ? `Back to ${name}'s shipped values` : `Delete ${name}`,
        () => { resetProp(name); if (!built) propSel = null; refill(); })),
    built ? assetDiffBlock(BASE_PROPS[name], p, 'prop') : null,
    propEditCanvas(p.shapes, () => set({ shapes: p.shapes }), p.bg),
    h('p', { cls: 'note', textContent: 'drag a dot to reposition or resize a shape' }),
    h('div', { cls: 'bar' }, h('span', { textContent: 'preview background' }), colorInput(p.bg || '#f3f0e8', v => set({ bg: v }), 'Background behind this prop\'s own preview (cosmetic only)'),
      p.bg ? button(':restart_alt:', 'Back to the default background', () => set({ bg: undefined }), 'mini') : null),
    h('div', { cls: 'bar' }, h('span', { textContent: 'size / height' }), numInput(p.size, v => set({ size: v }), 'Hit-test half-width'), numInput(p.h, v => set({ h: v }), 'Collidable height from the floor')),
    h('div', { cls: 'bar' }, h('span', { textContent: 'layer' }), seg(['back', 'mid', 'front'], () => p.layer || 'mid', v => set({ layer: v === 'mid' ? undefined : v }),
      { back: 'Behind everything', mid: 'Where fighters are (default)', front: 'In front of everything' })),
    h('div', { cls: 'bar' }, toggle(':sync_alt: moveable', 'Sways on a strike (a shape opts in with its own "sways" toggle), bounces a thrown weapon back, and can be picked up and thrown itself', () => !!p.moveable, v => set({ moveable: v })),
      toggle('breakable', 'Has hit points; destroyed once they run out, dropping debris usable as a weapon', () => !!p.breakable, v => set({ breakable: v })),
      p.breakable ? numInput(p.hp ?? 10, v => set({ hp: v }), 'Hit points') : null),
    h('h4', { textContent: 'shapes' }), shapeList(p.shapes, () => set({ shapes: p.shapes })));
}
function propsPanel() {
  const wrap = h('div', { cls: 'mtable' }), body = h('div');
  if (propSel && !PROPS[propSel]) propSel = null;
  body.replaceChildren(propSel ? propFields(propSel, () => panels()) : h('p', { cls: 'note', textContent: 'pick a prop in the side panel to tune it, or make a new one' }));
  wrap.append(h('div', { cls: 'bar stagehead' }, h('b', { textContent: propSel || 'props' })), body);
  return wrap;
}
function propsSide() {
  return [heading('props', 'Scenery: fixed or moveable, breakable or not, drawn from simple shapes (line, circle, box, polygon). Used by the scenario builder.'),
    h('div', { cls: 'bar' }, seg(['cards', 'table'], () => propView, v => { propView = v; panels(); }, { cards: 'A grid of thumbnails', table: 'A compact table' }),
      button(':add: new prop', 'A new prop, copied from crate', () => { propSel = duplicateProp('crate'); panels(); })),
    propPicker()];
}
// ---------- weapons ----------
function weaponCanvas(name) {
  const cv = h('canvas', { width: 100 * dpr, height: 50 * dpr, cls: 'itemthumb' });
  const w = WEAPONS[name]; if (!w) return cv;
  if (w.bg) cv.style.background = w.bg;
  const ctx = cv.getContext('2d'), y = cv.height / 2, pad = 8 * dpr, s = dpr * weaponsScale();
  drawShapes(ctx, w.shapes, (d, p) => [pad + d * s, y + p * s], raw => raw === 'wood' ? WOOD : raw === 'metal' ? METAL : raw, { len: w.len });
  return cv;
}
// a character (the one being edited, or the class's own default) holding it, in its normal stance pose — the variant
// cache (src/rig.js variant()) is keyed by stance + weapon name only, so it must be cleared first or a live edit
// (length, a shape) would keep showing whatever was compiled the first time this weapon was ever previewed
function weaponHandPreview(name) {
  const ch = currentChar(), base = ch.base || ch; base.variants = {};
  const held = armed(ch, name), cv = h('canvas');
  drawThumb(cv, held, held.poses.stance, 110, 130);
  return cv;
}
const WEAPON_COLS = [[n => WEAPON_CLASSES[WEAPONS[n].cls]?.weapon === n ? WEAPONS[n].cls + ' ★' : WEAPONS[n].cls, 'class'], [n => WEAPONS[n].len, 'len'], [n => WEAPONS[n].weight, 'weight'],
  [n => WEAPONS[n].breakable ? (WEAPONS[n].durability ?? '✓') : '', 'durability']];
function weaponPicker() {
  return pickerList(weaponView, Object.keys(WEAPONS), weaponSel, n => { weaponSel = n; panels(); }, weaponCanvas, n => n in BASE_WEAPONS, WEAPON_COLS);
}
function weaponFields(name, refill) {
  const w = WEAPONS[name], built = name in BASE_WEAPONS, set = patch => { saveWeapon(name, { ...WEAPONS[name], ...patch }); refill(); };
  const nm = built ? h('b', { textContent: name }) : h('input', { cls: 'macro', value: name, tip: 'Rename this weapon', onkeydown: e => e.stopPropagation(),
    onchange: () => { const v = nm.value.trim(); if (!v || v === name || WEAPONS[v]) { nm.value = name; return; } renameWeapon(name, v); weaponSel = v; refill(); } });
  return h('div', {},
    h('div', { cls: 'bar' }, nm, built ? h('span', { cls: 'note', textContent: 'built-in — tunable, revert to go back' }) : null,
      button(built ? ':restart_alt: revert' : ':delete: delete', built ? `Back to ${name}'s shipped values` : `Delete ${name}`,
        () => { resetWeapon(name); if (!built) weaponSel = null; refill(); })),
    built ? assetDiffBlock(BASE_WEAPONS[name], w, 'weapon') : null,
    h('div', { cls: 'bar' }, weaponCanvas(name), weaponHandPreview(name)),
    h('div', { cls: 'bar' }, h('span', { textContent: 'preview background' }), colorInput(w.bg || '#f3f0e8', v => set({ bg: v }), 'Background behind this weapon\'s own preview (cosmetic only)'),
      w.bg ? button(':restart_alt:', 'Back to the default background', () => set({ bg: undefined }), 'mini') : null),
    h('div', { cls: 'bar' }, h('span', { textContent: 'class' }), seg(Object.keys(WEAPON_CLASSES), () => w.cls, v => set({ cls: v }), mapVals(WEAPON_CLASSES, c => c.tip))),
    h('div', { cls: 'bar' }, h('span', { textContent: 'length / weight' }), numInput(w.len, v => set({ len: v }), 'How long it is, in px'), numInput(w.weight, v => set({ weight: v }), 'Heavier hits harder but swings slower')),
    h('div', { cls: 'bar' }, h('span', { textContent: 'grip angle' }), numInput(w.a, v => set({ a: v }), 'Angle in the hand, relative to the fist'),
      numInput(w.back ?? 0, v => set({ back: v || undefined }), 'Length held behind the hand (a staff)')),
    h('div', { cls: 'bar' }, toggle(':sync_alt: two-handed (chain)', 'Two segments on a loose joint (nunchucks); unrelated to the 2h class', () => !!w.chain, v => set({ chain: v || undefined })),
      numInput(w.grip2 ?? 0, v => set({ grip2: v || undefined }), 'Two-handed: where the back hand grips, from the front hand (− behind)')),
    h('div', { cls: 'bar' }, toggle('breakable', 'Clashing and landed hits wear it down; it snaps and drops once durability runs out', () => !!w.breakable, v => set({ breakable: v })),
      w.breakable ? numInput(w.durability ?? 20, v => set({ durability: v }), 'How much clashing it takes before it snaps') : null),
    h('h4', { textContent: 'shapes' }), shapeList(w.shapes, () => set({ shapes: w.shapes }), true));
}
function weaponsPanel() {
  const wrap = h('div', { cls: 'mtable' }), body = h('div');
  if (weaponSel && !WEAPONS[weaponSel]) weaponSel = null;
  body.replaceChildren(weaponSel ? weaponFields(weaponSel, () => panels()) : h('p', { cls: 'note', textContent: 'pick a weapon in the side panel to tune it, or make a new one' }));
  wrap.append(h('div', { cls: 'bar stagehead' }, h('b', { textContent: weaponSel || 'weapons' })), body);
  return wrap;
}
function weaponsSide() {
  return [heading('weapons', 'Held or thrown weapons, drawn along the grip-to-tip axis from the same simple shapes as props. A custom one reuses an existing class\'s moveset.'),
    h('div', { cls: 'bar' }, seg(['cards', 'table'], () => weaponView, v => { weaponView = v; panels(); }, { cards: 'A grid of thumbnails', table: 'A compact table' }),
      button(':add: new weapon', 'A new weapon, copied from sword', () => { weaponSel = duplicateWeapon('sword'); panels(); })),
    weaponPicker()];
}
const propsMode = { enter() {}, restart() {}, worlds: () => [], render: clear, ctxBar: () => [], side: propsSide, overlay: () => [propsPanel()],
  open: ['props'], hint: () => 'pick a prop in the side panel to tune it: size, layer, moveable, breakable, and its shapes' };
const weaponsMode = { enter() {}, restart() {}, worlds: () => [], render: clear, ctxBar: () => [], side: weaponsSide, overlay: () => [weaponsPanel()],
  open: ['weapons'], hint: () => 'pick a weapon in the side panel to tune it: class, length, weight, grip, and its shapes' };
