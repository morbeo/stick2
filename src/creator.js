'use strict';
// ---------- character mode: drag the skeleton, tune bones, watch it fight live; body experiment grid ----------
const creator = { preview: 'showcase', w: null, drag: null, hover: null, anchor: null, expOn: false,
  exp: { vars: new Set(['len', 'thick']), spread: 0.15, sym: true, seed: 1, parent: null, cells: [] } };
const PREVIEWS = {
  showcase: ['showcase', 'Scripted demo: walk in, J,J,K chain, sweep, jump kick, back off.'],
  walk: ['walk', 'Walk forward and back: check the walk cycle and arm swing.'],
  'vs ai': ['ai vs ai', 'Two copies fight each other with the engine AI.'],
};
const previewScen = () => SCENARIOS[PREVIEWS[creator.preview][0]];

// ---------- editor view: the stance pose, big, with a handle on every joint ----------
function edLayout() {
  const ew = Math.round(canvas.width * 0.58);
  return { ed: { x: 0, y: 0, w: ew, h: canvas.height }, pv: { x: ew, y: 0, w: canvas.width - ew, h: canvas.height } };
}
// screen transform of the figure; the hips stay put while dragging so the body doesn't jump under the cursor
function edFrame() {
  const ch = currentChar(), r = edLayout().ed, s = Math.min(r.h / 190, r.w / 130), ground = r.y + r.h * 0.85;
  const wa = {}, L = fk(ch, ch.poses.stance, 1, null, wa);
  if (!creator.drag) {
    let low = 0;
    for (const b of ch.bones) low = Math.max(low, L[b.id][1] + (b.shape === 'circle' ? b.len : 0));
    creator.anchor = [r.x + r.w / 2, ground - low * s];
  }
  const o = creator.anchor, P = mapVals(L, p => [o[0] + p[0] * s, o[1] + p[1] * s]);
  return { ch, r, s, o, L, P, wa, ground };
}
function drawEditor() {
  const { ch, r, s, o, L, P, ground } = edFrame(), sel = ch.by[studio.sel];
  ctx.fillStyle = '#f3f0e8'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#cfc8bb'; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.moveTo(r.x, ground); ctx.lineTo(r.x + r.w, ground); ctx.stroke();
  ctx.save(); ctx.translate(o[0], o[1]); ctx.scale(s, s);
  if (CFG.boxes) {
    ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(44,111,176,.22)';
    for (const b of ch.bones) if (b.hurt > 0) {
      const e = L[b.id], a = b.shape === 'circle' ? e : L[b.parent || 'hip'];
      ctx.lineWidth = b.hurt * 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0] + 0.01, e[1]); ctx.stroke();
    }
  }
  drawFigure(ctx, ch, L, INK[0], INK[1]);
  if (sel) { // the selected bone in red
    const a = L[sel.parent || 'hip'], e = L[sel.id];
    ctx.strokeStyle = RED[0]; ctx.lineWidth = sel.thick;
    ctx.beginPath();
    if (sel.shape === 'circle') ctx.arc(e[0], e[1], sel.len, 0, 7); else { ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]); }
    ctx.stroke();
  }
  ctx.restore();
  for (const b of ch.bones) {
    const p = P[b.id], on = b === sel, hov = b.id === creator.hover;
    ctx.beginPath(); ctx.arc(p[0], p[1], (on ? 6 : hov ? 5.5 : 4) * dpr, 0, 7);
    ctx.fillStyle = hov ? '#ffd' : '#fff'; ctx.fill();
    ctx.strokeStyle = on ? RED[0] : '#555'; ctx.lineWidth = (on ? 3 : 1.5) * dpr; ctx.stroke();
  }
  const hv = ch.by[creator.hover] || sel;
  if (hv) text(`${hv.id} · ${hv.role}${hv.side ? ' · ' + (hv.side === 'f' ? 'front' : 'back') : ''} · ${hv.len}px`,
    Math.min(P[hv.id][0] + 10 * dpr, r.x + r.w - 230 * dpr), P[hv.id][1] - 8 * dpr, '#666', 11);
  text(`${ch.name} · ${ch.bones.length} bones`, r.x + 10 * dpr, r.y + 18 * dpr, '#444', 12, 'bold');
}
// nearest joint handle, else the nearest bone line
function pickBone(x, y) {
  const { ch, P } = edFrame();
  let best = null, bd = 12 * dpr;
  for (const b of ch.bones) { const d = Math.hypot(P[b.id][0] - x, P[b.id][1] - y); if (d < bd) { bd = d; best = b.id; } }
  if (best) return best;
  bd = 6 * dpr;
  for (const b of ch.bones) { const d = distSeg([x, y], P[b.parent || 'hip'], P[b.id]); if (d < bd) { bd = d; best = b.id; } }
  return best;
}
// dragging a joint sets the bone's stance angle and length (Shift or circles: angle only)
function dragTo(x, y, shift) {
  const f = edFrame(), b = f.ch.by[creator.drag], pb = f.ch.by[b.parent];
  const pp = f.P[b.parent || 'hip'], dx = (x - pp[0]) / f.s, dy = (y - pp[1]) / f.s;
  const pw = pb ? f.wa[pb.id] : 0, cur = f.ch.poses.stance[b.id];
  let local = Math.atan2(dx, dy) / R - pw + b.level * (pw - (pb ? pb.restW : 0)); // inverse of fk's world angle
  local = cur + ((local - cur) % 360 + 540) % 360 - 180; // continuous with the current angle
  edit(def => {
    def.poses.stance[b.id] = Math.round(local);
    if (!shift && b.shape !== 'circle') def.bones.find(d => d.id === b.id).len = Math.max(2, Math.round(Math.hypot(dx, dy)));
  }, 'drag:' + b.id);
}

// ---------- body experiment: 9 mutants of a parent body; click one to breed around it ----------
function mutate(def, rand) {
  const d = clone(def), ex = creator.exp, dice = {};
  for (const b of d.bones) for (const k of ex.vars) {
    const p = BONE_PROPS.find(p => p.k === k), key = (ex.sym ? b.id.replace(/[FB]$/, '') : b.id) + '.' + k; // F/B partners share a roll
    const v = (b[k] ?? BONE[k]) + (dice[key] ??= rand(-1, 1)) * ex.spread * (p.max - p.min);
    b[k] = +clamp(Math.round(v / p.step) * p.step, p.min, p.max).toFixed(3);
  }
  return d;
}
function buildExp() {
  const ex = creator.exp, rand = makeRand(ex.seed * 7919);
  ex.parent ??= clone(DEFS[CURRENT]);
  ex.cells = Array.from({ length: 9 }, (_, i) => {
    const def = i ? mutate(ex.parent, rand) : ex.parent;
    // the mutant fights an unchanged copy of the current character, same seed in every cell
    return { def, w: newWorld(previewScen(), {}, 7, [makeCharacter(def), currentChar()]), label: i ? `#${i}` : 'parent' };
  });
}
function setExp(on) {
  creator.expOn = on;
  if (on) { creator.exp.parent = null; buildExp(); }
  panels();
}

function creatorRender() {
  clear();
  if (creator.expOn) {
    const rects = cellRects(9, 3, fullArea());
    creator.exp.cells.forEach((c, i) => drawCell(c, rects[i], { plot: false, selected: i === 0 }));
    return;
  }
  const { pv } = edLayout();
  drawEditor();
  drawCell({ w: creator.w, label: 'preview' }, pv, { plot: false });
}
function creatorMouse(type, x, y, e) {
  if (creator.expOn) {
    if (type !== 'down') return;
    const ex = creator.exp, i = hitRect(cellRects(9, 3, fullArea()), x, y);
    if (i >= 0) { ex.parent = ex.cells[i].def; ex.seed++; buildExp(); }
    return;
  }
  if (type === 'down') {
    const id = pickBone(x, y);
    if (id) { studio.sel = id; creator.drag = id; syncAll(); }
  } else if (type === 'move') {
    if (creator.drag) dragTo(x, y, e.shiftKey);
    else creator.hover = x < edLayout().ed.w ? pickBone(x, y) : null;
  } else { creator.drag = null; studio.lastKey = null; }
}
function creatorKey(e) {
  if (creator.expOn) { if (e.code === 'Escape') { setExp(false); return true; } return; }
  if (e.code === 'Delete' || e.code === 'Backspace') { deleteBone(); return true; }
}

// ---------- panels ----------
function creatorCtx() {
  return [
    h('span', { cls: 'note', textContent: 'preview' }),
    seg(Object.keys(PREVIEWS), () => creator.preview, v => { creator.preview = v; creatorMode.restart(); }, mapVals(PREVIEWS, p => p[1])),
    toggle('experiment', 'Grid of 9 random variations of the body (sizes, springs…). Click a cell to breed new variations around it; keep the one you like.',
      () => creator.expOn, setExp),
    toggle('boxes', SPEC.boxes.tip, () => CFG.boxes, v => { CFG.boxes = v; }),
  ];
}
const setProp = (k, v) => edit(def => { def.bones.find(b => b.id === studio.sel)[k] = v; }, studio.sel + '.' + k);
const prop = k => selBone()?.[k] ?? BONE[k];
function bonePanel() {
  const title = heading('', 'Properties of the selected bone. Click a joint in the editor or a name above to select.',
    'drag joint: length + angle · Shift+drag: angle only · Del delete bone');
  reg(title, () => { title.firstChild.textContent = `Bone · ${studio.sel}`; });
  const row = (label, tip, ...c) => h('div', { cls: 'row', tip }, h('span', { textContent: label }), ...c);
  const lim = on => edit(def => {
    const b = def.bones.find(b => b.id === studio.sel);
    if (on) { b.min = -90; b.max = 90; } else { delete b.min; delete b.max; }
  });
  const limRows = ['min', 'max'].map(k => slider(k, { min: -180, max: 180, step: 1 }, () => prop(k) ?? 0, v => setProp(k, v),
    `Joint limit (${k}), relative to the parent. The drawn pose is clamped after the spring, so overshoot never hyperextends.`));
  for (const r of limRows) reg(r, () => { r.hidden = prop('min') === undefined; });
  return [title,
    row('role', 'What the bone does in procedural motion', seg(Object.keys(ROLE_TIPS), () => prop('role'), v => edit(d => { d.bones.find(b => b.id === studio.sel).role = v; }), ROLE_TIPS)),
    row('side', 'Draw order and colour', seg(['f', '', 'b'], () => prop('side'), v => edit(d => { d.bones.find(b => b.id === studio.sel).side = v; }), SIDE_TIPS,
      o => ({ f: 'front', '': 'centre', b: 'back' })[o])),
    row('shape', 'How the bone is drawn', seg(['line', 'circle'], () => prop('shape'), v => edit(d => { d.bones.find(b => b.id === studio.sel).shape = v; }), SHAPE_TIPS)),
    slider('stance', { min: -270, max: 270, step: 1 }, () => currentChar().poses.stance[studio.sel] ?? 0,
      v => edit(def => { def.poses.stance[studio.sel] = v; }, 'stance:' + studio.sel),
      'Angle in the stance pose, relative to the parent (0 = straight on, root bones: 0 = down, 180 = up). Moves are layered on top.'),
    ...BONE_PROPS.map(p => slider(p.k, p, () => prop(p.k), v => setProp(p.k, v), p.tip)),
    row('limits', 'Clamp how far this joint can bend', toggle('limits', 'Clamp how far this joint can bend', () => prop('min') !== undefined, lim)),
    ...limRows];
}
function bodyPanel() {
  return [
    heading('Body', 'Build the skeleton. Limbs are role-based: legs walk, arms swing, tails follow through. New parts attach to the selected torso bone.',
      '⌘Z undo · ⇧⌘Z redo · Del delete · drag joints in the editor'),
    h('div', { cls: 'bar' },
      ...Object.keys(LIMBS).map(k => button(`+ ${k}`, LIMB_TIPS[k], () => addLimb(k))),
      button('+ joint', 'Add one bone at the end of the selected bone (same role and side)', addBone)),
    h('div', { cls: 'bar' },
      button('copy', 'Copy the selected bone and everything below it to the other side (front ↔ back)', copyLimb),
      button('delete', 'Delete the selected bone and everything below it (Del)', deleteBone),
      button('↶ undo', 'Undo (⌘Z)', undo), button('↷ redo', 'Redo (⇧⌘Z)', redo)),
    h('h4', { textContent: 'bones' }),
    h('div', { cls: 'bar' }, seg(currentChar().ids, () => studio.sel, v => { studio.sel = v; })),
    ...bonePanel(),
  ];
}
function expPanel() {
  const ex = creator.exp;
  return [
    heading('Body experiment', 'Nine bodies: the parent (framed) and 8 random variations of the chosen properties. Click a cell to make it the parent and breed new variations; repeat to home in, then keep it.',
      'click a cell: breed · Esc: back to the editor'),
    h('div', { cls: 'bar' },
      button('keep parent', 'Make the parent body your character (undoable)', () => edit(def => Object.assign(def, clone(ex.parent)))),
      button('reroll', 'New random variations around the same parent', () => { ex.seed++; buildExp(); }),
      button('restart', 'Start again from your current character', () => { ex.parent = null; buildExp(); })),
    h('h4', { textContent: 'vary', tip: 'Which bone properties the variations change' }),
    h('div', { cls: 'bar' }, BONE_PROPS.map(p => toggle(p.k, p.tip, () => ex.vars.has(p.k), on => { ex.vars[on ? 'add' : 'delete'](p.k); buildExp(); }))),
    slider('spread', { min: 0.02, max: 0.5, step: 0.01 }, () => ex.spread, v => { ex.spread = v; },
      'How far variations stray from the parent, as a fraction of each property\'s range. Applied on the next breed or reroll.'),
    h('div', { cls: 'bar' }, toggle('symmetric', 'Front and back partners (handF/handB…) change together', () => ex.sym, v => { ex.sym = v; buildExp(); })),
  ];
}

const creatorMode = {
  enter() { creator.w = newWorld(previewScen()); if (creator.expOn) buildExp(); },
  restart() { creatorMode.enter(); },
  worlds: () => creator.expOn ? creator.exp.cells.map(c => c.w) : [creator.w],
  render: creatorRender,
  ctxBar: creatorCtx,
  side: () => creator.expOn ? expPanel() : bodyPanel(),
  mouse: creatorMouse,
  key: creatorKey,
  hint: () => creator.expOn ? 'click a cell to breed around it · Esc back to the editor'
    : 'drag a joint: length + angle · Shift+drag: angle only · click: select · Del delete · ⌘Z undo',
};
