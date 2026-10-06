'use strict';
// ---------- animate mode: pose keyframes by dragging joints (IK), retime them on a frame timeline, preview with springs ----------
const anim = { move: 'jab', key: 1, t: 0, playing: true, pvLoop: true, pvSpeed: 1, pvFx: true, onion: true, aim: false, aimId: null, reach: 'limb', drag: null, hover: null, anchor: null, pv: null, hold: false, holdEdit: false,
  target: { char: null, stance: 'stand', state: 'idle', facing: 'toward', dist: 'near' }, group: 'type', sort: 'order', filter: '',
  tfilter: '', tsort: { k: null, dir: 1 }, tscroll: 0, // the move table's filter, sort column and scroll
  cmp: null, cmpView: 'off' }; // the move compared with (compare group): drawn over this one or as filmstrips
const curMove = () => currentChar().moves[anim.move];
const cmpMove = () => anim.cmp && currentChar().moves[anim.cmp];
const edChar = () => withWeapon(currentChar(), curMove()); // a weapon move is edited in the hand of its class's weapon
const defMove = () => DEFS[CURRENT].moves[anim.move];
const F = 1 / 60; // one frame
const keyStart = (m, i) => m.keys.slice(0, i).reduce((s, k) => s + k.d, 0);
const keyEnd = (m, i) => keyStart(m, i + 1);
const keyAt = (m, t) => { let i = 0; while (i < m.keys.length - 1 && t >= keyEnd(m, i)) i++; return i; };

const keyPose = (ch, m, i) => resolve(ch.poses.stance, m.keys[i].p);

// ---------- layout and view ----------
function anLayout() {
  const ew = splitX(), th = 124 * dpr; // the top 34 px hold the control bar (timelineBar)
  return { ed: { x: 0, y: 0, w: ew, h: canvas.height - th }, tl: { x: 8 * dpr, y: canvas.height - th + 34 * dpr, w: ew - 16 * dpr, h: th - 40 * dpr },
    pv: { x: ew, y: 0, w: canvas.width - ew, h: canvas.height } };
}
// the pose at the playhead; while dragging, the hips stay where they were so the body doesn't slide under the cursor
function anFrame() {
  const ch = edChar(), r = anLayout().ed, s = Math.min(r.h / 170, r.w / 150), ground = r.y + r.h * 0.86;
  const pose = samplePose(ch, curMove(), anim.t), wa = {}, L = fk(ch, pose, 1, null, wa);
  if (!anim.drag) {
    let low = 0;
    for (const b of ch.bones) low = Math.max(low, L[b.id][1] + (b.shape === 'circle' ? b.len : 0));
    anim.anchor = [r.x + r.w * 0.45, ground - low * s];
  }
  const o = anim.anchor, toScreen = p => [o[0] + p[0] * s, o[1] + p[1] * s];
  return { ch, r, s, o, pose, L, P: mapVals(L, toScreen), wa, ground, toLocal: (x, y) => [(x - o[0]) / s, (y - o[1]) / s] };
}
// a move some other move's throw points at: the toss, not the grab (holdPose/holdAt live here, see fighter.js seize/held)
const isThrowTarget = (name = anim.move) => Object.values(currentChar().moves).some(m => m.throw === name);
// the held victim, for the hold editor: same character, posed by holdPose (generic stance if unset) at holdAt's offset
// from the thrower's own anchor/scale — a second body overlaid on the preview, dragged the same way anFrame's is
function holdFrame() {
  const ch = edChar(), f = anFrame(), at = curMove().holdAt || {}, dx = at.dx ?? 30, dy = at.dy ?? 0;
  const pose = { ...ch.poses.stance, ...(defMove().holdPose || {}) }, L = fk(ch, pose, 1);
  const o = [f.o[0] + dx * f.s, f.o[1] + dy * f.s], toScreen = p => [o[0] + p[0] * f.s, o[1] + p[1] * f.s];
  return { ch, s: f.s, o, dx, dy, pose, L, P: mapVals(L, toScreen), toLocal: (x, y) => [(x - o[0]) / f.s, (y - o[1]) / f.s] };
}

const AMBER = '#d68c14';
const lowest = (ch, L) => Math.max(...ch.bones.map(b => L[b.id][1] + (b.shape === 'circle' ? b.len : 0)));
function drawAnimEditor() {
  if (anim.cmpView === 'strip') return drawStrip();
  const f = anFrame(), { ch, r, s, o, L, P, ground } = f, m = curMove(), ki = keyAt(m, anim.t);
  const hf = isThrowTarget(anim.move) ? holdFrame() : null; // the held victim, shown whenever this move is a throw's target
  ctx.fillStyle = '#f3f0e8'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#cfc8bb'; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.moveTo(r.x, ground); ctx.lineTo(r.x + r.w, ground); ctx.stroke();
  ctx.save(); ctx.translate(o[0], o[1]); ctx.scale(s, s);
  if (anim.onion) { // previous key (blue) and next key (green) as faint ghosts
    ctx.globalAlpha = 0.18;
    if (ki > 0) drawFigure(ctx, ch, fk(ch, keyPose(ch, m, ki - 1), 1), '#07f', '#07f', -1);
    if (ki < m.keys.length - 1) drawFigure(ctx, ch, fk(ch, keyPose(ch, m, ki + 1), 1), '#1a8a4a', '#1a8a4a', -1);
    ctx.globalAlpha = 1;
  }
  const cm = cmpMove();
  if (cm && anim.cmpView === 'overlay') { // the compared move at the same moment (held at its end), feet on the same ground, in amber
    const c2 = withWeapon(currentChar(), cm), L2 = fk(c2, samplePose(c2, cm, Math.min(anim.t, total(cm) - 1e-6)), 1);
    ctx.save(); ctx.translate(0, lowest(ch, L) - lowest(c2, L2)); ctx.globalAlpha = 0.45;
    drawFigure(ctx, c2, L2, AMBER, AMBER, -1); ctx.restore();
  }
  const fxs = fxNow(ch, { m, i: ki }), ft = performance.now() / 1000;
  drawFx(ctx, L, fxs, ft, true); drawFigure(ctx, ch, L, INK[0], INK[1], 0, roleTint()); drawFx(ctx, L, fxs, ft, false);
  if (m.keys[ki].active) for (const id of hitIds(m)) if (L[id]) { // the strikes: red joints, radius = hitR
    const e = L[id];
    ctx.fillStyle = 'rgba(192,57,43,.35)'; ctx.beginPath(); ctx.arc(e[0], e[1], Math.max(2.5, CFG.hitR), 0, 7); ctx.fill();
  }
  if (hf) { // the held victim: amber, faint when holdPose is still the generic default (nothing authored yet)
    ctx.save(); ctx.translate(hf.dx, hf.dy); ctx.globalAlpha = curMove().holdPose ? 0.85 : 0.35;
    drawFigure(ctx, hf.ch, hf.L, AMBER, AMBER, -1); ctx.restore();
  }
  ctx.restore();
  const editing = Math.abs(anim.t - keyEnd(m, anim.key)) < 1e-6, hits = hitIds(m);
  const hch = anim.holdEdit && hf ? hf.ch : ch, hP = anim.holdEdit && hf ? hf.P : P, hPose = anim.holdEdit && hf ? hf.pose : f.pose;
  for (const b of hch.bones) {
    const p = hP[b.id], hov = b.id === anim.hover || b.id === anim.drag, hit = !anim.holdEdit && hits.includes(b.id);
    ctx.beginPath(); ctx.arc(p[0], p[1], (hov ? 5.5 : 4) * dpr, 0, 7);
    ctx.fillStyle = hov ? '#ffd' : '#fff'; ctx.fill();
    ctx.strokeStyle = hit ? RED[0] : '#555'; ctx.lineWidth = (hit ? 2.5 : 1.5) * dpr; ctx.stroke();
  }
  { const [x, y] = hP.hip, hov = anim.hover === 'hip' || anim.drag === 'hip', q = (hov ? 5.5 : 4) * dpr; // the hip: a square handle
    ctx.fillStyle = hov ? '#ffd' : '#fff'; ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5 * dpr; ctx.fillRect(x - q, y - q, q * 2, q * 2); ctx.strokeRect(x - q, y - q, q * 2, q * 2); }
  if (!anim.holdEdit && anim.aim && P[aimBone()]) { // the joint that follows the cursor: a crosshair ring
    const [x, y] = P[aimBone()], q = 9 * dpr;
    ctx.beginPath(); ctx.arc(x, y, q, 0, 7);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * q * 0.6, y + dy * q * 0.6); ctx.lineTo(x + dx * q * 1.5, y + dy * q * 1.5); }
    ctx.strokeStyle = '#07f'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
  }
  if (anim.hover === 'hip' || anim.drag === 'hip') text(anim.holdEdit ? 'hip: slides the victim (holdAt)' : 'hip: the body moves, the feet stay', Math.min(hP.hip[0] + 10 * dpr, r.x + r.w - 220 * dpr), hP.hip[1] - 8 * dpr, '#666', 11);
  const hv = hch.by[anim.drag || anim.hover];
  if (hv) text(`${hv.id} ${Math.round(hPose[hv.id])}°`, Math.min(hP[hv.id][0] + 10 * dpr, r.x + r.w - 120 * dpr), hP[hv.id][1] - 8 * dpr, '#666', 11);
  text(`${anim.move} · key ${anim.key + 1}/${m.keys.length}${editing ? '' : ' (drag a joint to jump to the selected key)'}`, r.x + 10 * dpr, r.y + 18 * dpr, '#444', 12, 'bold');
  text(anim.holdEdit ? 'hold editor: drag a joint to pose the held victim (holdPose) · drag the hip to reposition it (holdAt)'
    : anim.aim ? `aim: ${anim.aimId || 'the striking limb'} follows the cursor (reach: ${anim.reach}) · click to set`
    : `drag: IK (reach: ${anim.reach}) · Alt+drag: rotate one bone · double-click a joint: it follows the cursor`, r.x + 10 * dpr, r.y + 34 * dpr, '#999', 11);
  if (cm && anim.cmpView === 'overlay') text(`amber: ${anim.cmp} at the same moment`, r.x + 10 * dpr, r.y + 50 * dpr, AMBER, 11);
  else if (hf && !anim.holdEdit) text(`amber: the held victim${curMove().holdPose ? '' : ' (generic pose - not customized yet)'}`, r.x + 10 * dpr, r.y + 50 * dpr, AMBER, 11);
}
// filmstrip (compare: strip): the move and the compared one under it, a cell every few frames on one time scale,
// tinted by phase; the playhead's cell is outlined, a click goes to that frame
function stripCells(r) {
  const ms = [curMove(), cmpMove()].filter(Boolean), T = Math.max(...ms.map(total)), fit = Math.max(2, Math.floor(r.w / (60 * dpr)));
  const step = Math.ceil(T / F / (fit - 1)) * F; // whole frames
  return { ms, step, n: Math.floor(T / step + 1e-6) + 1, cw: r.w / fit, top: r.y + 24 * dpr, rh: (r.h - 24 * dpr) / ms.length };
}
function drawStrip() {
  const r = anLayout().ed, { ms, step, n, cw, top, rh } = stripCells(r), s = Math.min((rh - 40 * dpr) / 135, cw / 80);
  ctx.fillStyle = '#f3f0e8'; ctx.fillRect(r.x, r.y, r.w, r.h);
  text(`filmstrip · a frame every ${Math.round(step * 60)}f · click one to go there`, r.x + 10 * dpr, r.y + 16 * dpr, '#999', 11);
  ms.forEach((m, row) => {
    const ch = withWeapon(currentChar(), m), y0 = top + row * rh, ground = y0 + rh - 10 * dpr, d = frameData(m, 1);
    const first = m.keys.findIndex(k => k.active), last = m.keys.findLastIndex(k => k.active);
    text(`${row ? anim.cmp : anim.move} · ${d.startup} · ${d.active} · ${d.recovery}f`, r.x + 10 * dpr, y0 + 14 * dpr, row ? AMBER : '#444', 12, 'bold');
    for (let i = 0; i < n; i++) {
      const t = i * step, x0 = r.x + i * cw;
      if (t > total(m) - 1e-6) continue; // the move is over
      const ki = keyAt(m, t), phase = first < 0 ? 'none' : ki < first ? 'startup' : ki > last ? 'recovery' : 'active';
      ctx.fillStyle = PHASE_COL[phase]; ctx.globalAlpha = 0.5; ctx.fillRect(x0 + dpr, y0 + 20 * dpr, cw - 2 * dpr, rh - 24 * dpr); ctx.globalAlpha = 1;
      if (!row && Math.round(anim.t / step) === i) { ctx.strokeStyle = '#444'; ctx.lineWidth = 2 * dpr; ctx.strokeRect(x0 + dpr, y0 + 20 * dpr, cw - 2 * dpr, rh - 24 * dpr); }
      text(`${Math.round(t * 60)}`, x0 + 4 * dpr, y0 + 32 * dpr, '#999', 9);
      const L = fk(ch, samplePose(ch, m, t), 1);
      ctx.save(); ctx.translate(x0 + cw / 2, ground - lowest(ch, L) * s); ctx.scale(s, s);
      drawFigure(ctx, ch, L, row ? AMBER : INK[0], row ? AMBER : INK[1]); ctx.restore();
    }
  });
}

// timeline: ruler (scrub) on top, one block per key (width = frames); drag a block's right edge to retime,
// drag a block to reorder, double-click to split. Block colour = phase (green startup, red active, blue recovery, sand: no hits),
// hatching = inv (blue /), unblock (red crosshatch), armor (amber stripes); the curve = easing, the arrow = lunge, icons below
const PHASE_COL = { startup: '#cfe0c6', active: '#e0998f', recovery: '#c8d6e6', none: '#e4ded2' };
function glyph(name, x, y, col, size) { ctx.fillStyle = col; ctx.font = `${size * dpr}px Icons`; ctx.fillText(String.fromCodePoint(ICONS[name]), x, y); }
function hatch(x, y, w, h, col, dirs, gap = 6 * dpr) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.strokeStyle = col; ctx.lineWidth = dpr; ctx.beginPath();
  for (const d of dirs) for (let i = -h; i < w + h; i += gap) {
    if (d === '-') { if (i >= 0 && i < h) { ctx.moveTo(x, y + i); ctx.lineTo(x + w, y + i); } continue; }
    ctx.moveTo(x + i, y + (d === '/' ? h : 0)); ctx.lineTo(x + i + h, y + (d === '/' ? 0 : h));
  }
  ctx.stroke(); ctx.restore();
}
function drawTimeline() {
  const r = anLayout().tl, m = curMove(), T = total(m), px = r.w / T, rh = 16 * dpr;
  ctx.fillStyle = '#fbfaf6'; ctx.fillRect(r.x, r.y, r.w, r.h);
  for (let i = 0; i <= Math.round(T * 60); i++) {
    const x = r.x + i * F * px, big = i % 5 === 0;
    ctx.fillStyle = big ? '#aaa' : '#ddd'; ctx.fillRect(x, r.y + (big ? 4 : 9) * dpr, dpr, (big ? 12 : 7) * dpr);
    if (i % 10 === 0 && i) text(String(i), x + 2 * dpr, r.y + 12 * dpr, '#aaa', 9);
  }
  const first = m.keys.findIndex(k => k.active), last = m.keys.findLastIndex(k => k.active);
  m.keys.forEach((k, i) => {
    const x = r.x + keyStart(m, i) * px, w = k.d * px, y = r.y + rh + 4 * dpr, h = r.h - rh - 6 * dpr, bx = x + dpr, bw = w - 2 * dpr;
    const phase = first < 0 ? 'none' : k.active ? 'active' : i < first ? 'startup' : i > last ? 'recovery' : 'active';
    const hold = i > 0 && k.p && JSON.stringify(k.p) === JSON.stringify(m.keys[i - 1].p);
    ctx.fillStyle = PHASE_COL[phase]; if (!k.active && phase === 'active') ctx.globalAlpha = 0.5; // a gap between active keys
    ctx.fillRect(bx, y, bw, h); ctx.globalAlpha = 1;
    if (k.inv) hatch(bx, y, bw, h, '#2c6fb0aa', ['/']);
    if (k.unblock) hatch(bx, y, bw, h, RED[0] + 'aa', ['/', '\\'], 8 * dpr);
    if (k.armor) hatch(bx, y, bw, h, '#b07a2caa', ['-'], 5 * dpr);
    if (!k.p) { ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.strokeStyle = '#999'; ctx.lineWidth = dpr; ctx.strokeRect(bx + dpr, y + dpr, bw - 2 * dpr, h - 2 * dpr); ctx.setLineDash([]); }
    if (i === anim.key) { ctx.strokeStyle = '#222'; ctx.lineWidth = 2 * dpr; ctx.strokeRect(x + 2 * dpr, y + dpr, w - 4 * dpr, h - 2 * dpr); }
    ctx.fillStyle = '#888'; ctx.fillRect(x + w - 3 * dpr, y + h * 0.3, 2 * dpr, h * 0.4); // resize grip
    ctx.save(); ctx.beginPath(); ctx.rect(bx, y, bw - 4 * dpr, h); ctx.clip();
    text(`${Math.round(k.d * 60)}f`, x + 5 * dpr, y + 14 * dpr, '#444', 11, 'bold');
    // the easing curve, top right
    const cw = Math.min(26 * dpr, bw - 40 * dpr), ch = 14 * dpr, cx = x + w - cw - 7 * dpr, cy = y + 4 * dpr;
    if (cw > 10 * dpr) {
      ctx.strokeStyle = '#666'; ctx.lineWidth = 1.2 * dpr; ctx.beginPath();
      for (let j = 0; j <= 16; j++) { const t = j / 16, v = EASE[k.e || 'linear'](t); ctx[j ? 'lineTo' : 'moveTo'](cx + t * cw, cy + ch - v * ch); }
      ctx.stroke();
    }
    if (w > 70 * dpr) text(k.p ? hold ? 'hold' : k.e || 'linear' : 'to stance', x + 5 * dpr, y + 27 * dpr, '#777', 9);
    // the lunge: an arrow, longer for a stronger push
    if (k.lunge) {
      const sg = Math.sign(k.lunge), l = Math.max(8 * dpr, Math.min(bw - 12 * dpr, Math.abs(k.lunge) / 600 * bw)), ay = y + 36 * dpr;
      const ax = x + 5 * dpr + (sg < 0 ? l : 0), al = sg * l; // backward (below 0): it points left
      ctx.strokeStyle = ctx.fillStyle = '#2d7a3e'; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + al, ay); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax + al + sg * 4 * dpr, ay); ctx.lineTo(ax + al - sg * 2 * dpr, ay - 4 * dpr); ctx.lineTo(ax + al - sg * 2 * dpr, ay + 4 * dpr); ctx.fill();
    }
    // flag icons along the bottom
    const icons = [k.active && ['my_location', RED[0]], k.inv && ['block', '#2c6fb0'], k.unblock && ['crisis_alert', RED[0]], k.armor && ['shield', '#b07a2c'],
      k.catch && ['back_hand', '#2c6fb0'], k.warp && ['blur_on', '#8e44ad'], k.turn && [k.turn === 2 ? 'rotate_right' : 'swap_horiz', '#8e44ad'], (k.sound || k.shake || k.after || k.spark) && ['auto_awesome', '#c0392b'], k.grip && ['pan_tool', '#b07a2c'], k.release && ['sports_handball', '#b07a2c'], i === m.cancel && ['sync_alt', '#8e44ad'], !k.p && ['accessibility_new', '#888'], hold && ['pause', '#888']].filter(Boolean);
    icons.forEach(([n, c], j) => glyph(n, x + (4 + j * 14) * dpr, y + h - 4 * dpr, c, 13));
    ctx.restore();
  });
  // the cancel window: a purple bar from the key it opens at to the end
  const cx = r.x + keyStart(m, m.cancel) * px;
  ctx.fillStyle = '#8e44ad'; ctx.fillRect(cx, r.y + rh + dpr, r.x + r.w - cx, 3 * dpr);
  const x = r.x + anim.t * px;
  ctx.fillStyle = '#222'; ctx.fillRect(x - dpr, r.y, 2 * dpr, r.h);
  const lbl = `${Math.round(anim.t * 60)}/${Math.round(T * 60)}`, lw = (lbl.length * 6 + 8) * dpr, lx = Math.min(x + 2 * dpr, r.x + r.w - lw);
  ctx.fillStyle = '#222'; ctx.fillRect(lx, r.y, lw, 14 * dpr);
  text(lbl, lx + 4 * dpr, r.y + 11 * dpr, '#f3f0e8', 10, 'bold');
}

// ---------- posing ----------
// joints the drag bends, by reach: bone = only the bone · limb = the bone and up to two ancestors of the same role
// (dragging a hand bends the arm, not the spine) · body = every ancestor, so the torso leans and turns with the reach
// locked bones are skipped (they turn with their parent)
const REACH_TIPS = { bone: 'Dragging a joint turns only its bone (also Alt+drag)', limb: 'Dragging a joint bends its limb (a hand bends the arm)',
  body: 'Dragging a joint moves everything it hangs from: reach with a hand and the torso leans after it' };
function ikChain(ch, id, single, reach = anim.reach) {
  const b0 = ch.by[id], c = [];
  if (single || reach === 'bone') { const u = unlockedAbove(ch, b0); return u ? [u] : []; }
  for (let b = b0; b && (reach === 'body' || c.length < 3); b = ch.by[b.parent]) {
    if (reach !== 'body' && b !== b0 && b.role !== b0.role && b0.role !== 'spine') break;
    if (!b.lock) c.push(b);
  }
  return c;
}
const limit = (b, v, lim = true) => !lim || b.min === undefined ? v : clamp(v, b.min, b.max);
const wrap = d => ((d % 360) + 540) % 360 - 180;
// cyclic coordinate descent: turn each joint of the chain so the end of bone id points at the target (rig space)
// joint limits shape the solve (knees bend the right way), but never stop a drag: if they keep the end from the target, it solves without them
function ik(ch, pose, id, target, chain, rounds = 12, lim = true) {
  const ang = (p, q) => Math.atan2(q[0] - p[0], q[1] - p[1]) / R, p0 = { ...pose };
  for (let it = 0; it < rounds; it++) for (const b of chain) {
    const P = fk(ch, pose, 1), pv = P[b.parent || 'hip'];
    pose[b.id] = limit(b, pose[b.id] + wrap(ang(pv, target) - ang(pv, P[id])), lim);
  }
  const miss = q => { const e = fk(ch, q, 1)[id]; return Math.hypot(e[0] - target[0], e[1] - target[1]); };
  if (lim) { const free = ik(ch, p0, id, target, chain, rounds, false); if (miss(free) < miss(pose) - 0.5) return free; }
  return pose;
}
// the hip (the root): dragging it moves the body over the feet, every leg bends so its ankle stays where it was
const ankleOf = c => c[c.length >= 3 ? c.length - 2 : c.length - 1];
// (measured from where the drag began, anim.hip0; the view follows the hip so the feet stay put on screen)
function hipTo(f, x, y) {
  const ch = f.ch, h0 = anim.hip0, dx = (x - h0.x) / f.s, dy = (y - h0.y) / f.s, pose = { ...h0.pose }, chain = [];
  anim.anchor = [h0.a[0] + x - h0.x, h0.a[1] + y - h0.y];
  for (const c of ch.chains.leg) {
    const a = ankleOf(c), legs = c.slice(0, c.indexOf(a) + 1).filter(b => !b.lock).reverse(); // end first (CCD)
    ik(ch, pose, a.id, [h0.L[a.id][0] - dx, h0.L[a.id][1] - dy], legs);
    chain.push(...legs);
  }
  return { pose, chain };
}
function poseTo(id, x, y, single) {
  // the held victim's hip: not a walking hip-IK (there are no feet to keep planted), just slides holdAt under the cursor
  if (id === 'hip' && anim.holdEdit) {
    const h0 = anim.hip0;
    setMove('holdAt', { ...h0.at0, dx: Math.round(h0.at0.dx + (x - h0.x) / h0.s), dy: Math.round(h0.at0.dy + (y - h0.y) / h0.s) }, 'm.holdAt:drag');
    return;
  }
  const f = anim.holdEdit ? holdFrame() : anFrame(), ch = f.ch;
  const { chain, pose } = id === 'hip' ? hipTo(f, x, y) : (c => ({ chain: c, pose: ik(ch, { ...f.pose }, id, f.toLocal(x, y), c, single ? 1 : 12) }))(ikChain(ch, id, single));
  if (anim.holdEdit) {
    edit(def => {
      const m = def.moves[anim.move];
      m.holdPose = m.holdPose || {};
      for (const b of chain) m.holdPose[b.id] = Math.round(pose[b.id] * 10) / 10;
    }, 'hold:' + anim.move + id);
  } else edit(def => {
    const k = def.moves[anim.move].keys[anim.key];
    k.p = k.p || {};
    for (const b of chain) k.p[b.id] = Math.round(pose[b.id] * 10) / 10;
  }, 'pose:' + anim.key + id);
}
const aimBone = () => anim.aimId || hitIds(curMove())[0]; // what aim moves: a double-clicked joint, else the striking bone
function pickJoint(x, y) {
  const { ch, P } = anim.holdEdit ? holdFrame() : anFrame();
  let best = null, bd = 12 * dpr;
  for (const id of [...ch.ids, 'hip']) { const d = Math.hypot(P[id][0] - x, P[id][1] - y); if (d < bd) { bd = d; best = id; } }
  return best;
}
function selectKey(i) {
  const m = curMove();
  anim.key = clamp(i, 0, m.keys.length - 1);
  anim.t = keyEnd(m, anim.key);
  if (!anim.playing) previewAt(anim.t); // playing: the preview runs on its own clock, undisturbed by picking a key to edit
}

// ---------- preview: the real engine (springs, hit stop) playing the move against a target ----------
// the target: any character, standing / crouching / guarding, idle / in the air / lying / dizzy, facing toward or away, near or far (targetScen in checks.js)
const TARGET_TIPS = {
  stand: 'The target stands still', crouch: 'The target crouches: highs pass over it', guard: 'The target holds guard: blocks highs and mids from the front',
  low: 'The target holds a low guard: blocks lows and special mids from the front',
  idle: 'The target is on the ground and free', jump: 'The target jumps on repeat, for a look at the move against a moving target (not timed to it, unlike air)',
  air: 'The target jumps so it is near the top of its jump when the move becomes active',
  down: 'The target lies on the floor: only off-the-ground (otg) moves hit it', dizzy: 'The target is dizzy: the next hit wakes it',
  toward: 'The target faces the attacker', away: 'The target turns its back: guard and parry only work from the front (it stays turned while crouching or holding a low guard)',
  near: 'The target stands at the move\'s usual distance', far: `The target stands ${FAR} px further away`,
};
function pvScen() {
  const s = targetScen(anim.move, curMove(), anim.target), init = s.init;
  s.init = w => { w.a.setStance(studio.stance, 'instant'); init(w); };
  return s;
}
// rawAdvance: the real per-frame step, always at its natural rate — previewAt resimulates to an exact move
// time and must land there regardless of pvSpeed; advance (what the generic frame loop calls while the
// preview free-runs) is the one scaled by pvSpeed, so speed only affects live playback, not scrubbing
function buildPreview() {
  const w = newWorld(pvScen(), anim.pvFx ? {} : NOJUICE, 1, [currentChar(), CHARS[anim.target.char] || currentChar()]);
  Object.assign(w, { sfx: playSound, loop: anim.pvLoop, rawAdvance: w.advance.bind(w) });
  w.advance = (dt, inp) => w.rawAdvance(dt * anim.pvSpeed, inp);
  anim.pv = w;
}
// re-simulate the preview up to move time t (deterministic, so this is what the fight would show)
function previewAt(t) {
  const w = anim.pv, m = curMove();
  w.reset();
  for (let g = 0; g < 240 && w.a.action?.m !== m; g++) w.rawAdvance(F, NOIN);
  for (let i = 0; i < Math.round(t / CFG.attackSpeed * 60); i++) w.rawAdvance(F, NOIN);
}

// ---------- mouse ----------
function animMouse(type, x, y, e) {
  const L = anLayout(), m = curMove(), inTl = y >= L.tl.y - 4 * dpr && x < L.ed.w, tl = L.tl, px = tl.w / total(m), ruler = inTl && y < tl.y + 18 * dpr;
  const tAt = () => clamp((x - tl.x) / px, 0, total(m) - 1e-6), edge = () => inTl && !ruler ? m.keys.findIndex((k, i) => Math.abs(x - tl.x - keyEnd(m, i) * px) < 6 * dpr) : -1;
  if (anim.cmpView === 'strip' && !inTl && x < L.ed.w) { // filmstrip: a click goes to that frame
    if (type === 'down') { const { step, cw } = stripCells(L.ed); anim.t = Math.min(Math.floor(x / cw) * step, total(m) - 1e-6); anim.key = keyAt(m, anim.t); if (!anim.playing) previewAt(anim.t); }
    return;
  }
  if (type === 'down') {
    if (anim.aim) { anim.aim = false; anim.aimId = null; studio.lastKey = null; return; }
    if (inTl) {
      if (ruler) { anim.drag = { scrub: true }; }
      else {
        const g = edge(); // grabbed a right edge?
        if (g >= 0) anim.drag = { key: g, x0: x, d0: m.keys[g].d, px };
        else if (e.detail === 2) splitKey(tAt());
        else { selectKey(keyAt(m, tAt())); anim.drag = { order: anim.key, x0: x }; }
      }
    } else {
      const id = pickJoint(x, y);
      if (id === 'hip' && (e.shiftKey || e.detail === 2)) return; // the hip neither strikes nor aims
      if (id && e.shiftKey) { pickHit(id, e.metaKey || e.ctrlKey); return; } // Shift+click: the striking bone (⌘/Ctrl too: add or remove it)
      if (id && e.detail === 2) { anim.aim = true; anim.aimId = id; return; } // double-click: that joint follows the cursor
      if (id === 'hip' && anim.holdEdit) { anim.drag = id; anim.hold = true; anim.hip0 = { x, y, s: holdFrame().s, at0: { dx: 30, dy: 0, dz: 0, ...curMove().holdAt } }; }
      else if (id) { selectKey(anim.key); const f = anim.holdEdit ? holdFrame() : anFrame(); anim.drag = id; anim.hold = true; anim.hip0 = { x, y, a: [...f.o], L: f.L, pose: f.pose }; } // anFrame/holdFrame: re-anchor before freezing
    }
  }
  if (type === 'move') {
    const d = anim.drag;
    if (d?.scrub) { anim.t = tAt(); anim.key = keyAt(m, anim.t); }
    else if (d?.order !== undefined) { const to = keyAt(m, tAt()); if (Math.abs(x - d.x0) > 4 * dpr && to !== d.order) { moveKey(d.order, to); d.order = to; d.moved = true; } }
    else if (d?.key !== undefined) {
      const frames = Math.max(1, Math.round((d.d0 + (x - d.x0) / d.px) * 60));
      edit(def => { def.moves[anim.move].keys[d.key].d = frames / 60; }, 'dur:' + d.key);
      anim.key = d.key; anim.t = keyEnd(curMove(), d.key);
    } else if (typeof d === 'string') poseTo(d, x, y, e.altKey);
    else if (anim.aim && x < L.ed.w && !inTl && aimBone()) { if (!anim.playing) selectKey(anim.key); poseTo(aimBone(), x, y, false); }
    else anim.hover = x < L.ed.w && !inTl ? pickJoint(x, y) : null;
    if (d?.scrub && !anim.playing) previewAt(anim.t);
    cursor(d?.scrub || ruler ? 'col-resize' : d?.key !== undefined || edge() >= 0 ? 'ew-resize' : d?.order !== undefined || typeof d === 'string' ? 'grabbing'
      : inTl ? 'pointer' : anim.aim && x < L.ed.w ? 'crosshair' : anim.hover ? 'grab' : 'default');
  }
  if (type === 'up' && anim.drag) {
    const posed = typeof anim.drag === 'string' || anim.drag.moved;
    anim.drag = null; anim.hold = false; studio.lastKey = null;
    if (posed) buildPreview();
  }
}
function animKey(e, a) {
  if (a === 'prevKey') { selectKey(anim.key - 1); return true; }
  if (a === 'nextKey') { selectKey(anim.key + 1); return true; }
  if (a === 'frameBack') { stepFrame(-1); return true; }
  if (a === 'frameFwd') { stepFrame(1); return true; }
  if (a === 'deleteBone') { deleteKey(); return true; } // Delete: the selected key
  if (a === 'playMove') { anim.playing = !anim.playing; return true; }
  if (a === 'onion') { anim.onion = !anim.onion; return true; }
  if (a === 'aim') { anim.aim = !anim.aim; anim.aimId = null; return true; }
}

function stepFrame(n) { anim.t = clamp(anim.t + n * F, 0, total(curMove()) - 1e-6); anim.key = keyAt(curMove(), anim.t); if (!anim.playing) previewAt(anim.t); }

// ---------- key and move edits ----------
// the key's pose with every front bone (id ending in F) swapped with its back twin (B)
function mirrorKey() {
  const ch = edChar(), p = keyPose(ch, curMove(), anim.key), out = { ...p };
  for (const id of ch.ids) { const tw = id.slice(0, -1) + ({ F: 'B', B: 'F' })[id.slice(-1)]; if (tw !== id && ch.by[tw] && p[tw] !== undefined) out[id] = p[tw]; }
  setKey('p', out);
}
const setKey = (k, v, key = null) => edit(def => { def.moves[anim.move].keys[anim.key][k] = v; }, key);
const setMove = (k, v, key = null) => edit(def => { def.moves[anim.move][k] = v; }, key);
// a key's per-bone multipliers (KEY_MULS: len, thick, alpha) tween the picked bones toward it, eased in from the key before
// and back out after; 1 = no change. len also feeds the hurtbox and reach (a Dhalsim limb); thick and alpha are drawing only
const KEY_MUL_ROWS = { len: ['stretch', 'Stretch', { min: 1, max: 6, step: 0.1 }, 2, 'How much the picked bones stretch at this key (× their normal length); it also reaches further.'],
  thick: ['girth', 'Girth', { min: 0.2, max: 4, step: 0.1 }, 1.8, 'How much the picked bones thicken at this key (× their normal width); drawing only.'],
  alpha: ['fade', 'Fade', { min: 0, max: 1, step: 0.05 }, 0.2, 'How visible the picked bones are at this key (0 invisible … 1 normal); drawing only.'] };
function toggleMul(prop, id, def0) {
  edit(def => {
    const k = def.moves[anim.move].keys[anim.key], m = { ...k[prop] };
    if (id in m) delete m[id]; else m[id] = def0;
    k[prop] = Object.keys(m).length ? m : undefined;
  });
}
function mulRow(prop) {
  const [label, title, range, def0, tip] = KEY_MUL_ROWS[prop];
  const k = () => curMove().keys[anim.key], ids = () => Object.keys(k()[prop] || {});
  const boneB = id => { const b = button(id, `${title} ${id} during this key`, () => toggleMul(prop, id, def0)); reg(b, () => b.classList.toggle('on', ids().includes(id))); return b; };
  const pickB = button('', `Pick which bones ${label.toLowerCase()} during this key`, (e, b) =>
    popup(b, h('div', { cls: 'bar' }, h('span', { cls: 'seg' }, edChar().ids.map(boneB)))));
  reg(pickB, () => setRich(pickB, ids().join(' ') || 'none'));
  return h('div', { cls: 'row', tip }, h('span', { textContent: label }), h('span', { cls: 'bar' }, pickB,
    ...ids().length ? [slider('×', range, () => k()[prop][ids()[0]], v => edit(def => {
      const key = def.moves[anim.move].keys[anim.key]; for (const id of ids()) key[prop][id] = v;
    }), tip)] : []));
}
function boneMulRows() { return Object.keys(KEY_MUL_ROWS).map(mulRow); }
// the striking bones: only this one, or (add) add / remove it so several limbs strike at once
function pickHit(id, add) {
  const cur = hitIds(curMove()), next = !add ? [id] : cur.includes(id) ? cur.filter(k => k !== id) : [...cur, id];
  if (next.join() !== cur.join()) setMove('hit', next.length > 1 ? next : next[0] || '');
  buildPreview();
}
function keyFrames(delta) {
  edit(def => { const k = def.moves[anim.move].keys[anim.key]; k.d = Math.max(1, Math.round(k.d * 60) + delta) / 60; });
  selectKey(anim.key);
}
function addKey() {
  edit(def => {
    const keys = def.moves[anim.move].keys, k = keys[anim.key];
    keys.splice(anim.key + 1, 0, { d: 4 / 60, e: 'outQuad', p: clone(keyPose(edChar(), curMove(), anim.key)) });
  });
  selectKey(anim.key + 1);
}
// split the key under move time t into two: the first ends on the in-between pose at t
function splitKey(t) {
  const m = curMove(), i = keyAt(m, t), f = Math.round((t - keyStart(m, i)) * 60), n = Math.round(m.keys[i].d * 60);
  if (f < 1 || f >= n) return selectKey(i);
  const p = mapVals(samplePose(edChar(), m, keyStart(m, i) + f / 60), v => Math.round(v * 10) / 10);
  edit(def => {
    const ks = def.moves[anim.move].keys, k = ks[i];
    ks.splice(i, 0, { ...k, d: f / 60, p, grip: undefined, release: undefined }); // the first part starts where the key did: it keeps the lunge and cancel
    k.d = (n - f) / 60; delete k.lunge; delete k.cancel;
  });
  selectKey(i);
}
function moveKey(from, to) {
  edit(def => { const ks = def.moves[anim.move].keys; ks.splice(to, 0, ks.splice(from, 1)[0]); }, 'order');
  selectKey(to);
}
function deleteKey() {
  if (curMove().keys.length <= 1) return;
  edit(def => { def.moves[anim.move].keys.splice(anim.key, 1); });
  selectKey(Math.min(anim.key, curMove().keys.length - 1));
}
function copyMove() {
  let n = 2;
  while (DEFS[CURRENT].moves[anim.move + n]) n++;
  const name = anim.move + n;
  edit(def => { def.moves[name] = clone(def.moves[anim.move]); });
  pickMove(name);
}
function deleteMove() {
  if (CHAR_DEFS[CURRENT]?.moves[anim.move]) return; // built-in moves are used by the controls and combos
  const gone = anim.move;
  anim.move = Object.keys(DEFS[CURRENT].moves)[0];
  edit(def => {
    delete def.moves[gone];
    for (const o of [def, ...(def.stances || [])]) for (const b of [o.binds, o.binds25]) for (const s in b || {}) if (b[s] === gone) delete b[s];
  });
  pickMove(anim.move);
}
// input slots (see BINDS): clicking one makes it trigger this move; clicking it again gives it back its default
const SLOT_TIPS = { punch: 'J standing (5P)', kick: 'K standing (5K)', downPunch: '↓ J crouching (2P)', downKick: '↓ K crouching (2K)',
  fwdPunch: '→ J (6P), else J', fwdKick: '→ K (6K), else K', backPunch: '← J (4P), else J', backKick: '← K (4K), else K',
  upPunch: '↑ J (8P), else J; in 2D press ↑ and J together (the jump squat turns into the attack)', upKick: '↑ K (8K), else K; in 2D press ↑ and K together', upFwdPunch: '↗ J (9P), else ↑ J', upFwdKick: '↗ K (9K), else ↑ K',
  upBackPunch: '↖ J (7P), else ↑ J', upBackKick: '↖ K (7K), else ↑ K', downFwdPunch: '↘ J (3P), else ↓ J', downFwdKick: '↘ K (3K), else ↓ K',
  downBackPunch: '↙ J (1P), else ↓ J', downBackKick: '↙ K (1K), else ↓ K', throw: 'J while holding guard (P+G): a throw', throw2: 'K while holding guard (K+G): the second throw', backThrow: '← held, then J with guard (4P+G): the back throw, else the P+G throw',
  dashPunch: 'J while running forward', airPunch: 'J in the air', airKick: 'K in the air',
  airUpPunch: '↑ J in the air, else J in the air', airUpKick: '↑ K in the air, else K in the air', airDownPunch: '↓ J in the air, else J in the air', airDownKick: '↓ K in the air, else K in the air',
  qcfPunch: '↓↘→ J', qcfKick: '↓↘→ K', qcbPunch: '↓↙← J', qcbKick: '↓↙← K', dpPunch: '→↓↘ J', dpKick: '→↓↘ K',
  special: 'S (U), and any direction without its own special', fwdSpecial: '→ S', backSpecial: '← S', upSpecial: '↑ S', downSpecial: '↓ S', airSpecial: 'S in the air' };
// binds of the stance picked in the character panel; in an extra stance, unbinding a slot it inherits blanks it there.
// A weapon move binds for its class in every stance (def.wbinds), over the binds while such a weapon is held
const boundSlots = () => Object.keys(slotsOf(CFG.plane)).filter(s => curBinds(edChar())[s] === anim.move);
const toggleBind = s => edit(def => {
  const cls = curMove().weapon;
  if (cls) {
    const b = (def.wbinds ??= {})[cls] ??= {};
    if (curBinds(edChar())[s] !== anim.move) b[s] = anim.move;
    else if (WEAPON_CLASSES[cls].binds[s] === anim.move) b[s] = '';
    else delete b[s];
    return;
  }
  const b = editBinds(def);
  if (curBinds()[s] !== anim.move) b[s] = anim.move;
  else if (studio.stance && !(s in b)) b[s] = '';
  else delete b[s];
});
function pickMove(name) {
  anim.move = name; anim.key = 0; anim.t = 0; anim.playing = true; anim.holdEdit = false;
  buildPreview(); panels();
}
// the gallery and tests views show the move panel too: it edits the move last picked there (or in the editor)
function moveSide() { if (!curMove()) anim.move = Object.keys(currentChar().moves)[0]; anim.key = Math.min(anim.key, curMove().keys.length - 1); return movePanel(); }
function followMove(n) { if (anim.move === n || !currentChar().moves[n]) return; anim.move = n; anim.key = 0; anim.t = 0; panels(); }
// a move clicked in the move table, inputs or combos: opened in the keyframe editor (from the character tab too)
function openMove(n) { unpeek(); lay('animate').panel = null; saveLay(); if (app.mode !== 'animate') setMode('animate'); else panels(); pickMove(n); }

const EASE_TIPS = {
  step: 'Snap to the pose at the end of the key (no in-between).', linear: 'Constant speed.',
  outQuad: 'Fast start, gentle stop.', outCubic: 'Faster start, softer stop.', outExpo: 'Explosive start, long settle: strikes.',
  inOutCubic: 'Slow in, slow out: recoveries.', outBack: 'Overshoots the pose, then settles back.', outElastic: 'Overshoots and wobbles.',
};
const MOVE_PROPS = [
  { k: 'power', min: 0.2, max: 3, step: 0.1, tip: 'Scales hit stop, shake, sparks and the impact spin. Moves with power are sped up by attackSpeed.' },
  { k: 'knock', min: 0, max: 600, step: 10, tip: 'Knockback speed given to the victim (px/s).' },
  { k: 'launch', min: 0, max: 800, step: 10, tip: 'Upward speed on a knockdown (px/s). Also tilts the impact spin upward.' },
  { k: 'stun', min: 0, max: 1, step: 0.02, tip: 'Hitstun (s): how long the victim cannot act. Shrinks along a combo. Blockstun is a fraction of it (blockStun). Unset = 0.4.', def: 0.4 },
  { k: 'damage', min: 0, max: 40, step: 1, tip: 'Health taken on hit (× damage setting, scaled down along a combo). Unset = power × 8.' },
  { k: 'chip', min: 0, max: 1, step: 0.01, tip: 'Fraction of the damage this move still does when blocked (never knocks out). 0 = the chip setting.' },
  { k: 'stop', min: 0, max: 0.4, step: 0.01, tip: 'Hit stop (s): how long both fighters freeze on impact (shrinks along a combo, half on block). 0 = power × the hitstop setting.' },
  { k: 'bstun', min: 0, max: 1, step: 0.02, tip: 'Blockstun (s): how long a blocking defender is stuck in guard. 0 = stun × the blockStun setting.' },
  { k: 'bpush', min: 0, max: 600, step: 10, tip: 'Pushback on block (px/s). 0 = knock × the blockPush setting.' },
  { k: 'juggle', min: 0, max: 10, step: 1, tip: 'Juggle cost: points it spends from the victim\'s juggle pool when it hits a foe in the air or lying (jugglePoints setting; 0 there = no limit). Unset = 1.', def: 1 },
  { k: 'range', min: 10, max: 300, step: 5, tip: 'Setup distance (px between the two fighters) where the gallery, the animate preview and the Tests view put the target: where the move is meant to land. Unset = 45 (dashPunch 100).', def: 45 },
  { k: 'reach', min: 0, max: 20, step: 1, tip: 'Extra strike radius (px) around the striking joint, on top of the hitR setting: lets a short strike (a knee) land on a foe whose body keeps it a little away. Unset = 0.' },
];
// what each height is blocked by (guard and parry are front only)
const HEIGHT_TIPS = {
  high: 'High: blocked standing; passes over a crouching fighter.',
  shigh: 'Special high (overhead, jump-ins): blocked standing only; hits a crouching guard and cannot be ducked.',
  mid: 'Mid: blocked standing; hits a crouching guard.',
  smid: 'Special mid: blocked standing or crouching.',
  low: 'Low: blocked crouching only; hits a standing guard. No upward push.',
};
const HITS_TIPS = { stand: 'Hits a standing foe', crouch: 'Hits a crouching foe (off: passes over it, like a high)', air: 'Hits a foe in the air (off: no anti-air, no juggle)' };
const HIT_STATES = Object.keys(HITS_TIPS);
const MOVE_FLAGS = {
  kd: 'Knockdown: the victim is launched, bounces and lies down.',
  air: 'Air move: performed while jumping, cancelled on landing.',
  inv: 'Invincible for the whole move (get-ups).',
  special: 'Special: normals that hit can be cancelled into it (if specialCancel is on).',
  otg: 'Off the ground: hits a fighter lying on the floor and pops it up (otg setting: flagged).',
  wide: 'Wide: in 2.5D it reaches 3× zReach in depth, so a sidestep does not dodge it.',
  crumple: 'Crumple: the victim folds to the floor where it stands, open to a follow-up before it lands.',
  wall: 'Wall splat: a victim knocked into the arena wall sticks to it a moment instead of bouncing off.',
  wallbounce: 'Wall bounce: a victim knocked into the arena wall bounces back out at wallBounceSpeed, popped up, its juggle count reset for a follow-up (spin).',
  bounce: 'Ground bounce: a knocked-down victim bounces high off the floor once, open to a juggle.',
  noAirGuard: 'No air guard: hits a fighter guarding in the air (airGuard setting).',
  launcher: 'Launcher: on hit, ↑ jumps after the launched victim (chaseJump setting), up to its height and steering to it, for an air combo.',
  roll: 'Roll: invincible and passing through fighters for rollInv from its start; the body turns over once, the way its lunge goes (rollFwd, rollBack).',
  vault: 'Vault: like roll (invincible, turns over once), but leaves the ground on a key marked rise - a grounded hop within vaultRange of a grounded foe plays this instead of a plain jump.',
};
// throw (m.throw, a move name): on connect this move holds the foe for techWindow, pinned in front of the THROWER, who
// plays the named move (the foe just hangs there in a generic hurt pose); its damage lands on the foe when the hold ends
// (see grab / toss, bound to P+G by default). Any move can be a throw: bind it like any other.
function throwRow() {
  const m = () => curMove(), names = () => Object.keys(currentChar().moves).filter(n => n !== anim.move);
  const pick = (e, b) => popup(b, h('b', { textContent: 'throw: the move the thrower plays' }),
    seg(['', ...names()], () => m().throw || '', v => { setMove('throw', v || undefined); closePop(); },
      { '': 'Off: this move strikes normally', ...Object.fromEntries(names().map(n => [n, `The thrower plays ${n} (the held foe hangs in a generic hurt pose); its damage lands on the foe when the hold ends`])) }));
  const moveBtn = button('', 'The move the thrower plays once this throw connects · click: pick another', pick, 'mini');
  reg(moveBtn, () => setRich(moveBtn, `:sports_handball: ${m().throw || 'not a throw'}`));
  const mk = () => { let n = anim.move + 'Toss', i = 2; while (DEFS[CURRENT].moves[n]) n = anim.move + 'Toss' + i++;
    edit(def => { def.moves[n] = clone(CHAR_DEFS.stick.moves.toss); def.moves[anim.move].throw = n; }); openMove(n); };
  return h('div', { cls: 'row', tip: 'A throw: no need for active keys of its own — on connect it holds the foe for techWindow, pinned in front of the thrower, who plays the move picked here; its damage lands on the foe when the hold ends. Make a teleport with the warp key flag, a fireball with the shoot key flag.' },
    h('span', { textContent: 'throw' }), h('span', { cls: 'bar' }, moveBtn,
      button(':add: new toss move', 'Make a new move for the thrower to play (starts as a copy of the built-in toss) and set it here', mk, 'mini')));
}
// counter (m.counter, a move name): a key marked catch answers a caught strike with this move at once, landing its damage
// on the attacker (← S is catch, a counter stance, by default). Any move can be a counter: bind it like any other.
function counterRow() {
  const m = () => curMove(), names = () => Object.keys(currentChar().moves).filter(n => n !== anim.move);
  const pick = (e, b) => popup(b, h('b', { textContent: 'counter: the move that answers a catch' }),
    seg(['', ...names()], () => m().counter || '', v => { setMove('counter', v || undefined); closePop(); },
      { '': 'Off: a catch key just no-sells the strike, with no reversal', ...Object.fromEntries(names().map(n => [n, `A caught strike is answered with ${n} at once, its damage landing on the attacker`])) }));
  const moveBtn = button('', 'The move that answers a strike caught by a catch key · click: pick another', pick, 'mini');
  reg(moveBtn, () => setRich(moveBtn, `:back_hand: ${m().counter || 'no reversal'}`));
  const mk = () => { let n = anim.move + 'Reversal', i = 2; while (DEFS[CURRENT].moves[n]) n = anim.move + 'Reversal' + i++;
    edit(def => { def.moves[n] = clone(CHAR_DEFS.stick.moves.reversal); def.moves[anim.move].counter = n; }); openMove(n); };
  return h('div', { cls: 'row', tip: 'Counter: a key marked catch (keyPanel) answers a strike caught during it with the move picked here, at once — its damage lands on the attacker. No catch key: this has no effect.' },
    h('span', { textContent: 'counter' }), h('span', { cls: 'bar' }, moveBtn,
      button(':add: new counter move', 'Make a new reversal move (starts as a copy of the built-in reversal) and set it here', mk, 'mini')));
}
// hold (holdPose/holdAt, on a toss move — one some other move's throw points at): how the victim hangs while held, instead
// of today's generic randomized hurt pose and fixed "30px in front" offset. The hold editor (toggle below) overlays the
// victim on the preview in amber; while it's on, dragging a joint poses the victim and dragging the hip repositions it.
function holdRow() {
  const m = () => curMove(), at = () => ({ dx: 30, dy: 0, dz: 0, ...m().holdAt });
  const setAt = (k, v) => setMove('holdAt', { ...at(), [k]: v }, 'm.holdAt');
  const editBtn = toggle('hold editor', 'Pose the held victim and drag it into position, overlaid on the preview in amber. While on, dragging a joint moves the victim, not this move\'s own keyframe.',
    () => anim.holdEdit, v => { anim.holdEdit = v; });
  return h('div', { cls: 'row', tip: 'How the victim hangs while held by the throw that plays this move: its pose (holdPose) and position relative to the thrower (holdAt). Unset: the generic randomized hurt pose, 30px in front, same height and depth as today.' },
    h('span', { textContent: 'hold' }), h('span', { cls: 'bar' },
      editBtn,
      button('reset pose', 'Clear the custom hold pose: back to the generic randomized hurt flinch', () => setMove('holdPose', undefined), 'mini'),
      slider('dx', { min: -100, max: 250, step: 2 }, () => at().dx, v => setAt('dx', v), 'Forward offset (px) from the thrower, the way it faces'),
      slider('dy', { min: -150, max: 150, step: 2 }, () => at().dy, v => setAt('dy', v), 'Vertical offset (px); negative lifts the victim up'),
      adv(slider('dz', { min: -100, max: 100, step: 2 }, () => at().dz, v => setAt('dz', v), 'Depth offset (px); outside the 2D plane only (lanes/belt) — not shown in this 2D preview')),
      button('reset pos', 'Clear the custom position: back to 30px in front, same height and depth', () => setMove('holdAt', undefined), 'mini')));
}
// holdOptions (on the GRAB move itself, the one with m.throw set): command-grab follow-ups. Holding punch, kick or
// special through the grab's startup (not just as it connects — a button press is otherwise edge-confined to one
// instant) plays that option's toss instead of the plain throw above; the first matching option wins.
const HOLD_INPUTS = ['punch', 'kick', 'special'];
function holdOptionsRows() {
  const m = () => curMove(), opts = () => m().holdOptions || [], names = () => Object.keys(currentChar().moves).filter(n => n !== anim.move);
  const setOpts = next => setMove('holdOptions', next.length ? next : undefined);
  const optRow = (opt, i) => {
    const tossBtn = button('', 'The toss this plays · click: pick another', (e, b) => popup(b, h('b', { textContent: `holding ${opt.input}: plays` }),
      seg(names(), () => opt.throw, v => { setOpts(opts().map((o, j) => j === i ? { ...o, throw: v } : o)); closePop(); })), 'mini');
    reg(tossBtn, () => setRich(tossBtn, `:sports_handball: ${opt.throw || 'pick a move'}`));
    return h('div', { cls: 'row', tip: `Holding ${opt.input} from this grab's startup through to the moment it connects plays the toss picked here instead.` },
      h('span', { textContent: i === 0 ? 'holds' : '' }), h('span', { cls: 'bar' },
        seg(HOLD_INPUTS, () => opt.input, v => setOpts(opts().map((o, j) => j === i ? { ...o, input: v } : o))),
        tossBtn, button(':close:', 'Remove this follow-up', () => setOpts(opts().filter((_, j) => j !== i)), 'mini')));
  };
  return [...opts().map(optRow),
    h('div', { cls: 'row', tip: 'Command-grab follow-ups: holding one of these buttons through the grab\'s startup plays its own toss instead of the plain throw above. None held, or none set here: the plain throw plays, as always.' },
      h('span', { textContent: opts().length ? '' : 'holds' }), h('span', { cls: 'bar' },
        button(':add: add a follow-up', 'Hold a button through the grab\'s startup to play a different toss', () => setOpts([...opts(), { input: 'kick', throw: m().throw }]), 'mini')))];
}

// what normalize returns to: the built-in move of the same name (copies like jab2: the move they were copied from)
const builtInMove = () => (CHAR_DEFS[CURRENT] || CHAR_DEFS.stick).moves[anim.move.replace(/\d+$/, '')];
const SHOT_TIPS = { ki: 'A blue ball of energy', fire: 'A flickering fireball', dark: 'A dark purple orb', wave: 'A crescent wave (sonic boom)', star: 'A spinning shuriken' };
const BEAM_TIPS = { laser: 'A bright red-hot line' };
const SPARK_TIPS = { hit: 'Hit spark: the plain sparks and ring when a strike during this key lands', heavy: 'Heavy: a big flash, a wide ring and thick sparks',
  slash: 'Slash: a cut across the point of impact (blades)', blunt: 'Blunt: a flash and chunky bits (clubs, stomps)', none: 'No spark' };
const SOUND_TIPS = { '': 'No sound as this key is reached (hits and blocks still sound)', whoosh: 'Sound: a whoosh as this key is reached (swings)',
  hit: 'Sound: a slap as this key is reached', thud: 'Sound: a low thud as this key is reached (landings, stomps)', block: 'Sound: a sharp block as this key is reached' };
const KEY_VARS = [{ k: 'e', opts: Object.keys(EASE) }, { k: 'lunge', min: 0, max: 600, step: 10 }];
function keyPanel() {
  const title = heading('', 'The selected key: the pose reached at its end, how long it takes and how it eases. Drag joints in the editor to pose it. Adding, splitting, deleting and retiming keys: the bar above the timeline.',
    'Shift+←/→ prev/next key · , / . step a frame · Enter play/pause · Delete deletes the key');
  reg(title, () => { title.firstChild.textContent = `Key ${anim.key + 1} / ${curMove().keys.length}`; });
  title.dataset.fold = 'key';
  const k = () => curMove().keys[anim.key];
  title.append(groupOps(KEY_VARS, n => k()[n] ?? (n === 'e' ? 'linear' : 0), n => builtInMove()?.keys[anim.key]?.[n] ?? k()[n],
    vals => edit(def => { const key = def.moves[anim.move].keys[anim.key]; for (const n in vals) if (vals[n]) key[n] = vals[n]; else delete key[n]; })));
  return [title,
    h('div', { cls: 'bar' },
      button(':accessibility_new: stance', 'This key returns to the stance (clears its pose)', () => setKey('p', null)),
      button(':flip: mirror', 'Swap the front and back limbs in this key (left arm takes the right arm\'s angles and back)', mirrorKey),
      button(':pause: hold', 'Copy the previous key\'s pose (hold still)', () => setKey('p', clone(keyPose(edChar(), curMove(), Math.max(0, anim.key - 1))))),
      button(':accessibility_new: pose', 'Start this key from a preset pose', (e, b) => popup(b, h('div', { cls: 'bar' }, Object.entries(POSES).map(([n, p]) =>
        button(n, p.tip, () => setKey('p', { ...keyPose(edChar(), curMove(), anim.key), ...presetPose(edChar(), p) }))))))),
    h('div', { cls: 'row', tip: 'Easing: how the motion into this key\'s pose speeds up and slows down' }, h('span', { textContent: 'easing' }),
      seg(Object.keys(EASE), () => k().e || 'linear', v => setKey('e', v), EASE_TIPS)),
    h('div', { cls: 'row', tip: 'Active: the keys during which the strike can hit (red on the frame meter)' }, h('span', { textContent: 'active' }),
      toggle(':my_location: hits', 'Active: the strike can connect during this key', () => !!k().active, v => setKey('active', v || undefined))),
    ...boneMulRows(),
    h('div', { cls: 'row', tip: 'Key flags: what happens in a fight from this key (cancel, invincible, unblockable, armor, catch, warp, turn, shoot, rehit, spin)' }, h('span', { textContent: 'flags' }), h('span', { cls: 'bar' },
      toggle(':sync_alt: cancel', 'The cancel window opens at this key (chains, specials, jump). Unmarked: after the last active key.', () => !!k().cancel,
        v => edit(def => { def.moves[anim.move].keys.forEach((x, i) => { if (i === anim.key && v) x.cancel = true; else delete x.cancel; }); })),
      toggle(':block: inv', 'Invincible during this key (reversals like rising)', () => !!k().inv, v => setKey('inv', v || undefined)),
      toggle(':crisis_alert: unblock', 'Unblockable: a hit during this key goes through guard and parry. The striking limb glows red while unblockable frames are coming.',
        () => !!k().unblock, v => setKey('unblock', v || undefined)),
      toggle(':shield: armor', 'Armor: a hit during this key does its damage, but the move goes on (no flinch, no knockdown) unless it would knock out.',
        () => !!k().armor, v => setKey('armor', v || undefined)),
      toggle(':back_hand: catch', 'Catch: a strike from the front landing during this key is caught, and the move named in the move\'s counter answers it (← S catch → reversal).',
        () => !!k().catch, v => setKey('catch', v || undefined)),
      toggle(':blur_on: warp', 'Warp: as this key is reached the fighter reappears teleportDist behind the foe, turned to face it, leaving after-images (teleport).',
        () => !!k().warp, v => setKey('warp', v || undefined)),
      toggle(':swap_horiz: turn', 'Turn: the fighter turns around during this key. Once leaves its back to the foe (turnaround: no guard until ←, → or ↑ or a move faces it again; ↓ crouches still turned); holding a throw victim it swings the victim round behind (back throw).',
        () => k().turn === true, v => setKey('turn', v || undefined)),
      toggle(':bolt: shoot', 'Shoot: the move\'s projectile leaves the striking limbs as this key is reached (shots setting); it hits with this move\'s power, damage and height. Its look, speed and size are under shot.',
        () => !!k().shoot, v => setKey('shoot', v || undefined)),
      toggle(':horizontal_rule: beam', 'Beam: a straight line held out from the striking limbs as this key is reached (beams setting), hitting once wherever it touches a foe, with this move\'s power, damage and height. Its look, width, range and duration are under beam.',
        () => !!k().beam, v => setKey('beam', v || undefined)),
      toggle(':repeat: rehit', 'Rehit: the move can hit again from this key, whoever it already hit (multi-hits: lightning legs, hundred-hand slap).',
        () => !!k().rehit, v => setKey('rehit', v || undefined)),
      toggle(':rotate_right: spin', 'Spin: a whole turn during this key (turn: 2), its back showing halfway; spinning kicks wind up with it and strike facing the foe.',
        () => k().turn === 2, v => setKey('turn', v ? 2 : undefined)),
      toggle(':hourglass_empty: charge', 'Charge: the move holds at this key while its button stays held, powering up (the striking limbs glow) up to charge.timeout; letting go (or a plain tap) carries it on with whatever charge it reached. Its duration, timeout and power range are under charge.',
        () => !!k().charge, v => setKey('charge', v || undefined)))),
    adv(h('div', { cls: 'row', tip: 'Catch keys only: the heights of strike this key catches (catchH; all lit = every height)' }, h('span', { textContent: 'catches' }), h('span', { cls: 'bar' },
      ...Object.keys(HEIGHT_TIPS).map(ht => toggle(ht, 'Catch ' + HEIGHT_TIPS[ht].replace(/:.*/, '').toLowerCase() + ' strikes (catchHigh: high + shigh, catch: mid + smid, catchLow: low)',
        () => (k().catchH || Object.keys(HEIGHT_TIPS)).includes(ht),
        v => { const cur = (k().catchH || Object.keys(HEIGHT_TIPS)).filter(x => x !== ht), next = v ? Object.keys(HEIGHT_TIPS).filter(x => x === ht || cur.includes(x)) : cur;
          setKey('catchH', next.length === 5 ? undefined : next); }))))),
    adv(h('div', { cls: 'row', tip: 'Key events: effects played as this key is reached or hits; they change nothing in the fight' }, h('span', { textContent: 'events' }), h('span', { cls: 'bar' },
      seg(['hit', 'heavy', 'slash', 'blunt', 'none'], () => k().spark || 'hit', v => setKey('spark', v === 'hit' ? undefined : v), SPARK_TIPS, v => v === 'hit' ? ':auto_awesome: hit' : v),
      seg(['', ...Object.keys(SOUNDS)], () => k().sound || '', v => setKey('sound', v || undefined),
        { '': SOUND_TIPS[''], ...Object.fromEntries(Object.keys(SOUNDS).map(n => [n, SOUND_TIPS[n] || `Sound: ${n} (custom, in the sounds panel)`])) }, v => v || ':block:'),
      toggle(':blur_on: after', 'After-images: the fighter leaves fading copies of itself while this key plays (fast dashes, teleports)', () => !!k().after, v => setKey('after', v || undefined))))),
    subFold(':auto_awesome: key fx', fxRows('The effects from this key on (until a later key changes them): the same as before, none, or its own stack; drawing only, the fight is the same',
      () => k().fx, (e, key) => setKey('fx', e, key), fxOns(edChar()), () => fxAt(curMove(), anim.key - 1))),
    ...curMove().keys.some(x => x.shoot) ? [h('div', { cls: 'row', tip: 'The projectile this move shoots (move field shot)' }, h('span', { textContent: 'shot' }), h('span', { cls: 'bar' },
      seg(Object.keys(SHOT_TIPS), () => curMove().shot?.look || 'ki', v => setMove('shot', { ...curMove().shot, look: v }), SHOT_TIPS))),
      slider('shot speed', { min: 100, max: 900, step: 20 }, () => curMove().shot?.speed ?? 360, v => setMove('shot', { ...curMove().shot, speed: v }, 'shot.speed'), 'How fast the shot flies (px/s).'),
      slider('shot size', { min: 4, max: 30, step: 1 }, () => curMove().shot?.size ?? 12, v => setMove('shot', { ...curMove().shot, size: v }, 'shot.size'), 'The shot\'s radius (px): its hitbox and how big it draws.'),
      slider('shot life', { min: 0.2, max: 4, step: 0.1 }, () => curMove().shot?.life ?? 2, v => setMove('shot', { ...curMove().shot, life: v }, 'shot.life'), 'Seconds before the shot fizzles out (a short one is a close-range blast).'),
      adv(slider('shot angle', { min: -60, max: 60, step: 5 }, () => curMove().shot?.angle ?? 0, v => setMove('shot', { ...curMove().shot, angle: v || undefined }, 'shot.angle'), 'Launch angle (degrees above level); positive arcs upward.')),
      adv(slider('shot gravity', { min: 0, max: 2000, step: 50 }, () => curMove().shot?.gravity ?? 0, v => setMove('shot', { ...curMove().shot, gravity: v || undefined }, 'shot.gravity'), 'Pulls the shot down (px/s²); 0 flies dead level forever. With angle, it arcs and falls.')),
      adv(slider('shot bounce', { min: 0, max: 1, step: 0.05 }, () => curMove().shot?.bounce ?? 0, v => setMove('shot', { ...curMove().shot, bounce: v || undefined }, 'shot.bounce'), 'With gravity: how much speed it keeps bouncing off the floor (0 = pops on landing, 1 = bounces forever).')),
      adv(slider('shot pierce', { min: 1, max: 6, step: 1 }, () => curMove().shot?.pierce ?? 1, v => setMove('shot', { ...curMove().shot, pierce: v === 1 ? undefined : v }, 'shot.pierce'), 'Foes it can hit before it\'s spent (each only once); 1 pops on the first.')),
      adv(slider('shot durability', { min: 1, max: 6, step: 1 }, () => curMove().shot?.durability ?? 1, v => setMove('shot', { ...curMove().shot, durability: v === 1 ? undefined : v }, 'shot.durability'), 'Clashes with an opposing shot it survives before popping; the tougher shot punches through.')),
      adv(slider('shot count', { min: 1, max: 8, step: 1 }, () => curMove().shot?.count ?? 1, v => setMove('shot', { ...curMove().shot, count: v === 1 ? undefined : v }, 'shot.count'), 'How many shots fire at once, fanned evenly across spread.')),
      adv(slider('shot spread', { min: 0, max: 120, step: 5 }, () => curMove().shot?.spread ?? 0, v => setMove('shot', { ...curMove().shot, spread: v || undefined }, 'shot.spread'), 'Total fan angle (degrees) the count shots spread across, centred on angle.')),
      adv(slider('shot max alive', { min: 1, max: 8, step: 1 }, () => curMove().shot?.maxAlive ?? 1, v => setMove('shot', { ...curMove().shot, maxAlive: v === 1 ? undefined : v }, 'shot.maxAlive'), 'How many of this fighter\'s shots can be in flight at once before the button does nothing.'))] : [],
    ...curMove().keys.some(x => x.beam) ? [h('div', { cls: 'row', tip: 'The beam this move holds out (move field beam)' }, h('span', { textContent: 'beam' }), h('span', { cls: 'bar' },
      seg(Object.keys(BEAM_TIPS), () => curMove().beam?.look || 'laser', v => setMove('beam', { ...curMove().beam, look: v }), BEAM_TIPS))),
      slider('beam width', { min: 4, max: 40, step: 1 }, () => curMove().beam?.width ?? 14, v => setMove('beam', { ...curMove().beam, width: v }, 'beam.width'), 'The beam\'s width (px): its hitbox and how thick it draws.'),
      slider('beam range', { min: 100, max: 900, step: 20 }, () => curMove().beam?.range ?? 500, v => setMove('beam', { ...curMove().beam, range: v }, 'beam.range'), 'How far the beam reaches (px).'),
      slider('beam duration', { min: 0.05, max: 1, step: 0.05 }, () => curMove().beam?.duration ?? 0.25, v => setMove('beam', { ...curMove().beam, duration: v }, 'beam.duration'), 'Seconds the beam stays out; it hits once, the moment it touches a foe.')] : [],
    ...curMove().keys.some(x => x.charge) ? [h('div', { cls: 'row', tip: 'How holding the move\'s button at its charge key powers it up (move field charge)' }, h('span', { textContent: 'charge' })),
      slider('charge duration', { min: 0.1, max: 2, step: 0.05 }, () => curMove().charge?.dur ?? 0.6, v => setMove('charge', { ...curMove().charge, dur: v }, 'charge.dur'), 'Seconds held at the charge key to reach full power.'),
      slider('charge timeout', { min: 0.2, max: 5, step: 0.1 }, () => curMove().charge?.timeout ?? 1.5, v => setMove('charge', { ...curMove().charge, timeout: v }, 'charge.timeout'), 'Seconds it can be held before it fires anyway, at whatever charge it has reached by then.'),
      slider('charge min', { min: 0.5, max: 3, step: 0.1 }, () => curMove().charge?.min ?? 1, v => setMove('charge', { ...curMove().charge, min: v }, 'charge.min'), 'The power multiplier at no charge (a plain tap): scales damage, knockback, and a shot or beam\'s size, speed or reach.'),
      slider('charge max', { min: 0.5, max: 5, step: 0.1 }, () => curMove().charge?.max ?? 2, v => setMove('charge', { ...curMove().charge, max: v }, 'charge.max'), 'The power multiplier at full charge.')] : [],
    adv(slider('shake', { min: 0, max: 1, step: 0.05 }, () => k().shake || 0, v => setKey('shake', v || undefined, 'shake'),
      'Key event: screen shake added as this key is reached (0 none … 1 the most; a heavy landing, a stomp).')),
    ...curMove().weapon ? [h('div', { cls: 'row', tip: 'Weapon hand: where pick-up and throw moves take or let go of the weapon' }, h('span', { textContent: 'hand' }), h('span', { cls: 'bar' },
      ...[['grip', ':pan_tool: grip', 'Grip: picking up (P+G over a weapon), the hand closes on the handle as this key is reached; the weapon slides to the hand until then. Unmarked: the first key.'],
        ['release', ':sports_handball: release', 'Release: throwing (P+G armed), the weapon leaves the hand as this key is reached. Unmarked: the first key.']].map(([n, l, t]) =>
        toggle(l, t, () => !!k()[n], v => edit(def => { def.moves[anim.move].keys.forEach((x, i) => { if (i === anim.key && v) x[n] = true; else delete x[n]; }); })))))] : [],
    slider('lunge', { min: -600, max: 600, step: 10 }, () => k().lunge || 0, v => setKey('lunge', v || undefined, 'lunge'),
      'Forward speed given when this key starts (px/s): steps into the strike; below 0 it moves back (rollBack).'),
    slider('drop', { min: -900, max: 900, step: 10 }, () => k().drop || 0, v => setKey('drop', v || undefined, 'drop'),
      'In the air: vertical speed given when this key starts (px/s): above 0 drives down (pounce), below 0 lifts.'),
    slider('rise', { min: 0, max: 900, step: 10 }, () => k().rise || 0, v => setKey('rise', v || undefined, 'rise'),
      'Upward speed given when this key starts (px/s): the fighter leaves the floor and the move plays on through the air and lands (flash kick, body press).'),
  ];
}
// ---------- move list: grouped by type / striking limb / height, sorted, filtered by name or input ----------
const MOVE_GROUPS = {
  type: m => m.ref ? 'layer' : m.weapon ? 'weapon' : m.air ? 'air' : m.throw ? 'throw' : m.special ? 'special' : m.power ? 'normal' : 'other',
  limb: (m, ch) => m.power ? [...new Set(hitIds(m).map(id => ch.by[id]?.role || 'none'))].join(' + ') || 'none' : 'other',
  height: m => m.power ? m.height || 'mid' : 'other',
  // the stance whose own binds start the move (main: only the main binds; unbound: no input in any stance)
  stance: (m, ch, n) => (ch = withWeapon(ch, m)).stances.slice(1).filter((s, i) => Object.values(DEFS[CURRENT].stances[i][bkey()] || {}).includes(n)).map(s => s.name).join(' + ')
    || (Object.values(ch.stances[0][bkey()]).includes(n) ? 'main' : 'unbound'),
  style: m => m.style || (m.power ? 'basic' : 'other'),
  none: () => '',
};
const GROUP_ORDER = ['main', 'normal', 'special', 'throw', 'weapon', 'air', 'arm', 'leg', 'head', 'spine', 'tail', 'high', 'shigh', 'mid', 'smid', 'low', 'boxing', 'karate', 'muay thai', 'capoeira', 'kung fu', 'taekwondo', 'wrestling', 'basic', 'none', 'layer', 'other', 'unbound'];
const GROUP_TIPS = { type: 'Group by type: normal, special, throw, weapon (played while holding a weapon of its class), air, layer (movement layers), other (not attacks)', limb: 'Group by the striking limb', height: 'Group by height', stance: 'Group by the stance whose binds start the move', style: 'Group by fighting style: boxing, karate, muay thai, capoeira, kung fu, taekwondo, wrestling (the style property), basic', none: 'One list' };
const SORT_TIPS = { order: 'As defined', name: 'By name', startup: 'Fastest first (startup frames)', damage: 'Most damage first' };
const moveInputs = (ch, n) => [...Object.keys(slotsOf(CFG.plane)), ...Object.keys(ch.motions).flatMap(k => [k + 'Punch', k + 'Kick'])].filter(s => curBinds(withWeapon(ch, ch.moves[n]))[s] === n);
// a keyframed idle or walk loop sampled from the procedural cycle (8 keys over one cycle), to edit from there
function makeLoop(kind) {
  const ch = currentChar(), n = 8, name = loopName(ch, studio.stance, kind), T = kind === 'walk' ? 0.8 : 2.4;
  const f = Object.assign(Object.create(Fighter.prototype), { ch: { ...ch, moves: {} }, w: { cfg: CFG }, over: {}, stanceI: studio.stance,
    seed: 1, dir: 1, grounded: true, lean: 0, vy: 0, vz: 0, time: 0, walkPh: 0 });
  f.vx = kind === 'walk' ? f.c('maxSpeed') : 0;
  const keys = Array.from({ length: n }, (_, i) => {
    const u = (i + 1) / n;
    if (kind === 'walk') f.walkPh = u * 2 * Math.PI; else f.time = u * T;
    return { d: T / n, e: 'inOutCubic', p: mapVals(f.procPose(), v => Math.round(v)) };
  });
  edit(def => { def.moves[name] = { keys }; });
  pickMove(name);
}
// a movement layer (LAYERS): two keys at the procedural pose of the state, its ref; edits are offsets from it, added on top in a fight
const LAYER_STATE = {
  crouch: { crouching: true }, rise: { grounded: false, vy: -300 }, fall: { grounded: false, vy: 300 }, flip: { grounded: false, flip: 1 },
  run: { running: true, vx: 1.6 }, dash: { vx: 2 }, backDash: { vx: -2 }, backWalk: { vx: -1 }, airDash: { grounded: false }, wallJump: { grounded: false, vy: -300, vx: 1 }, guard: { guarding: true },
  hurt: {}, tumble: { kd: 'fly', vy: -200 }, lying: { kd: 'down' }, dizzy: { dizzyT: 1 }, turn: { face: 0 },
};
function makeLayer(kind) {
  const ch = currentChar(), name = loopName(ch, studio.stance, kind + 'Layer'), s = LAYER_STATE[kind];
  const f = Object.assign(Object.create(Fighter.prototype), { ch: { ...ch, moves: {} }, w: { cfg: CFG }, over: {}, stanceI: studio.stance,
    seed: 1, dir: 1, face: 1, grounded: true, lean: 0, vx: 0, vy: 0, vz: 0, time: 0, walkPh: 0, flip: 0, reelT: 0, dizzyT: 0 }, s);
  f.vx = (s.vx || 0) * f.c('maxSpeed');
  const ref = mapVals(f.procPose(), v => Math.round(v));
  edit(def => { def.moves[name] = { ref, keys: [{ d: 0.3, e: 'inOutCubic', p: { ...ref } }, { d: 0.3, e: 'inOutCubic', p: { ...ref } }] }; });
  pickMove(name);
}
// a move as a card: a drawing of its strike (the first active key); hovering plays it
function moveCard(n, tip, pick = pickMove) {
  const cv = h('canvas'), b = h('button', { cls: 'card', tip, onclick: () => pick(n) }, cv, h('span', { textContent: n }));
  const m = currentChar().moves[n], ch = withWeapon(currentChar(), m);
  const still = () => drawThumb(cv, ch, keyPose(ch, m, Math.max(0, m.keys.findIndex(k => k.active))));
  let raf = 0;
  b.onmouseenter = () => {
    const t0 = performance.now(), loop = now => {
      if (!b.isConnected) return;
      drawThumb(cv, ch, samplePose(ch, m, (now - t0) / 1000 % (total(m) + 0.3)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  };
  b.onmouseleave = () => { cancelAnimationFrame(raf); raf = 0; still(); };
  reg(b, () => { b.classList.toggle('on', anim.move === n); if (!raf) still(); });
  return b;
}
const VIEW_TIPS = { cards: 'A drawing of each move (hover to play it)', list: 'Compact: names only',
  table: 'Every move in a table over the stage: sort by any column, fuzzy filter, edit the values in place, hover a row to see it play',
  inputs: 'Every input over the stage: direction pads per button show which directions have no move of their own, and a table of all inputs; click one to give it a move',
  combos: 'The combos over the stage: the chain links (P / K, or a direction with it like 6P, after a move chains into the next, chains setting authored) as a tree per starter or a table of routes with damage and frames; add, change and cut links in place',
  looks: 'Design fx looks: every built-in and custom look, a live preview and an experiment grid; a new look is a generic particle effect tuned by sliders (count, life, speed, spread, angle, gravity, size, shape)' };
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
    const loop = now => {
      if (peek?.el !== el) return; if (!document.querySelector('.mtable')) return unpeek();
      const t = Math.max(0, now - t0) / 1000 % (d + 0.3), s = segs.findLast(s => s.t0 <= t); // (the first frame's time can be before t0)
      drawThumb(cv, s.ch, samplePose(s.ch, s.m, t - s.t0), 120, 128); requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  peek.el.style.left = Math.min(e.clientX + 16, innerWidth - 140) + 'px'; peek.el.style.top = Math.max(4, Math.min(e.clientY - 70, innerHeight - 160)) + 'px';
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
// ---------- sounds: every one is tunable, built-ins included (revert goes back to the shipped values) ----------
let soundSel = null;
function duplicateSound(from) {
  let n = 1; while (SOUNDS[from + n]) n++;
  const name = from + n; saveSound(name, { ...SOUNDS[from] }); soundSel = name; return name;
}
const SOUND_FIELD_TIPS = { noise: 'The noise layer\'s filter type, or none for no noise layer', nf0: 'Noise filter start frequency (Hz)',
  nf1: 'Noise filter end frequency (Hz), swept over the sound\'s duration', ngain: 'Noise layer volume',
  q: 'Noise filter resonance: higher narrows and emphasises the band around the filter frequency (a whistly, ringing noise)',
  tone: 'The tone layer\'s oscillator waveform, or none for no tone layer', tf0: 'Tone start frequency (Hz)',
  tf1: 'Tone end frequency (Hz), swept over the sound\'s duration', tgain: 'Tone layer volume',
  detune: 'Tone pitch offset in cents (100 = a semitone): a quick way to try a variant without retyping both frequencies',
  attack: 'Ramp-up time before the decay starts (0: an instant hard onset, like every built-in)', dur: 'Total length, in seconds' };
// the sound's actual rendered waveform (noise + tone layers, gain and all), redrawn whenever the preset it was built for changes
function soundWave(name) {
  const cv = h('canvas', { width: 280, height: 60, cls: 'wave' });
  (async () => {
    const s = SOUNDS[name]; if (!s) return;
    let data; try { data = await renderSound(s); } catch { return; }
    if (!cv.isConnected || SOUNDS[name] !== s) return; // the panel moved on (deleted, or another edit already redrew it)
    const ctx = cv.getContext('2d'), w = cv.width, hh = cv.height;
    ctx.clearRect(0, 0, w, hh);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, hh / 2); ctx.lineTo(w, hh / 2); ctx.stroke();
    ctx.strokeStyle = '#4ac1e0'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let x = 0; x < w; x++) { const v = data[Math.floor(x / w * data.length)] || 0, y = hh / 2 - v * (hh / 2 - 2); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  })();
  return cv;
}
function soundFields(name, refill) {
  const s = SOUNDS[name], built = name in BASE_SOUNDS, set = (k, v) => { saveSound(name, { ...SOUNDS[name], [k]: v }); refill(); };
  // a built-in keeps its name (other moves already reference it by that name); only a custom one can rename or disappear for good
  const nm = built ? h('b', { textContent: name }) : h('input', { cls: 'macro', value: name, tip: 'Rename this sound', onkeydown: e => e.stopPropagation(),
    onchange: () => { const v = nm.value.trim(); if (!v || v === name || SOUNDS[v]) { nm.value = name; return; } renameSound(name, v); soundSel = v; refill(); } });
  return h('div', {},
    h('div', { cls: 'bar' }, nm, built ? h('span', { cls: 'note', textContent: 'built-in — tunable, revert to go back' }) : null,
      button(':play_arrow: test', `Play ${name}`, () => playSound(name)),
      button(built ? ':restart_alt: revert' : ':delete: delete', built ? `Back to ${name}'s shipped values` : `Delete ${name}`,
        () => { resetSound(name); if (!built) soundSel = null; refill(); })),
    soundWave(name),
    h('div', { cls: 'bar' }, h('span', { textContent: 'noise' }), seg(['bandpass', 'lowpass', 'highpass', 'none'], () => s.noise, v => set('noise', v),
      Object.fromEntries(['bandpass', 'lowpass', 'highpass', 'none'].map(v => [v, SOUND_FIELD_TIPS.noise])))),
    slider('noise start', { min: 50, max: 6000, step: 10 }, () => s.nf0, v => set('nf0', v), SOUND_FIELD_TIPS.nf0),
    slider('noise end', { min: 50, max: 6000, step: 10 }, () => s.nf1, v => set('nf1', v), SOUND_FIELD_TIPS.nf1),
    slider('noise gain', { min: 0, max: 1, step: 0.05 }, () => s.ngain, v => set('ngain', v), SOUND_FIELD_TIPS.ngain),
    slider('noise resonance', { min: 0.1, max: 20, step: 0.1 }, () => s.q ?? 1, v => set('q', v), SOUND_FIELD_TIPS.q),
    h('div', { cls: 'bar' }, h('span', { textContent: 'tone' }), seg(['sine', 'square', 'sawtooth', 'triangle', 'none'], () => s.tone, v => set('tone', v),
      Object.fromEntries(['sine', 'square', 'sawtooth', 'triangle', 'none'].map(v => [v, SOUND_FIELD_TIPS.tone])))),
    slider('tone start', { min: 20, max: 2000, step: 5 }, () => s.tf0, v => set('tf0', v), SOUND_FIELD_TIPS.tf0),
    slider('tone end', { min: 20, max: 2000, step: 5 }, () => s.tf1, v => set('tf1', v), SOUND_FIELD_TIPS.tf1),
    slider('tone gain', { min: 0, max: 1, step: 0.05 }, () => s.tgain, v => set('tgain', v), SOUND_FIELD_TIPS.tgain),
    slider('tone detune', { min: -1200, max: 1200, step: 10 }, () => s.detune ?? 0, v => set('detune', v), SOUND_FIELD_TIPS.detune),
    slider('attack', { min: 0, max: 0.3, step: 0.01 }, () => s.attack, v => set('attack', v), SOUND_FIELD_TIPS.attack),
    slider('duration', { min: 0.02, max: 1, step: 0.01 }, () => s.dur, v => set('dur', v), SOUND_FIELD_TIPS.dur));
}
function soundsPanel() {
  const wrap = h('div', { cls: 'mtable' }), body = h('div');
  const fill = () => {
    if (soundSel && !SOUNDS[soundSel]) soundSel = null;
    const row = n => h('div', { cls: 'bar' + (soundSel === n ? ' on' : ''), onclick: () => { soundSel = n; fill(); } },
      h('b', { textContent: n }), n in BASE_SOUNDS ? h('span', { cls: 'note', textContent: 'built-in' }) : null,
      button(':play_arrow:', `Play ${n}`, e => { e.stopPropagation(); playSound(n); }, 'mini'));
    body.replaceChildren(...Object.keys(SOUNDS).map(row), h('h4', { textContent: soundSel || 'pick a sound' }),
      soundSel ? soundFields(soundSel, fill) : h('p', { cls: 'note', textContent: 'click a sound above to hear it, tune it, or tune a copy of it' }));
  };
  // a fx-tab view (src/fxlab.js), not a toggleable stage panel: no close button, there's nothing to close to
  wrap.append(h('div', { cls: 'bar stagehead' }, h('b', { textContent: 'sounds', tip: 'Every sound is synthesized live (no files). A slider per parameter, built-ins included — revert goes back to a built-in\'s shipped values. A custom (or customized) sound plays anywhere that name is picked (the key events row).' }),
    button(':add: new sound', 'A new sound, copied from whoosh', () => { duplicateSound('whoosh'); fill(); })), body);
  fill();
  return wrap;
}
// ---------- looks: fx look definitions and tunables used by the fx tab (src/fxlab.js), which has its own gallery,
// preview and editor UI now — this just keeps the data every look needs (a custom look's defaults and its 8 sliders,
// the 3 particle shapes) and the "new look" action, shared with the fx toolbar ----------
const DEFAULT_LOOK = { count: 6, life: 0.5, speed: 60, spread: 40, angle: -90, gravity: 200, size0: 3, size1: 0, shape: 'dot', col: 'white', back: false };
function newLook() {
  let n = 1; while (FX_LOOKS['custom' + n]) n++;
  const name = 'custom' + n; saveLook(name, { ...DEFAULT_LOOK }); return name;
}
const LOOK_SHAPE_TIPS = { dot: 'A filled circle', line: 'A short trailing streak (sparks, speed lines)', ring: 'A stroked ring (an expanding shockwave)' };
// a custom look's own knobs: [key, { min, max, step }, tip, label?]
const CUSTOM_SLIDERS = [
  ['count', { min: 1, max: 20, step: 1 }, 'Particles spawned per point along the wrapped bones, looping'],
  ['life', { min: 0.1, max: 2, step: 0.05 }, 'One particle\'s lifetime in seconds before it loops'],
  ['speed', { min: 0, max: 300, step: 5 }, 'Launch speed (px/s)'],
  ['spread', { min: 0, max: 360, step: 5 }, 'Random spread around the launch angle, in degrees'],
  ['angle', { min: -180, max: 180, step: 5 }, 'Launch angle, in degrees (-90: straight up, 0: forward, along facing)'],
  ['gravity', { min: -400, max: 600, step: 10 }, 'Downward acceleration (px/s²); negative floats upward'],
  ['size0', { min: 0, max: 12, step: 0.5 }, 'Size at birth', 'size start'],
  ['size1', { min: 0, max: 12, step: 0.5 }, 'Size at the end of its life (0: shrinks to nothing)', 'size end'],
];
// ---------- tracker: a simple step sequencer (rows of sounds, a grid of beats) that loops at a tempo ----------
let trackSel = null;
function newTrack() {
  let n = 1; while (myTracks['track' + n]) n++;
  const name = 'track' + n; saveTrack(name, { bpm: 120, steps: 16, rows: [newRow()] }); trackSel = name; return name;
}
function trackFields(name, refill) {
  // every mutator reads myTracks[name] fresh (not a captured copy): refill() fully rebuilds this panel on every edit
  // (like soundFields), so a stale closure from a previous build must never write back an outdated snapshot
  const t = myTracks[name], playingThis = () => tracker.playing && tracker.name === name;
  const set = (k, v) => { saveTrack(name, { ...myTracks[name], [k]: v }); refill(); };
  const setRow = (i, k, v) => { saveTrack(name, { ...myTracks[name], rows: myTracks[name].rows.map((r, j) => j === i ? { ...r, [k]: v } : r) }); refill(); };
  const setSteps = n => { const live = myTracks[name];
    saveTrack(name, { ...live, steps: n, rows: live.rows.map(r => ({ ...r, cells: Array.from({ length: n }, (_, i) => r.cells[i] ?? null) })) }); refill(); };
  const nm = h('input', { cls: 'macro', value: name, tip: 'Rename this track', onkeydown: e => e.stopPropagation(),
    onchange: () => { const v = nm.value.trim(); if (!v || v === name || myTracks[v]) { nm.value = name; return; } renameTrack(name, v); trackSel = v; refill(); } });
  const grid = h('table', { cls: 'trk' });
  const rowTr = (row, i) => h('tr', {},
    h('td', {}, button(row.sound, 'Sound for this row (click to change)', (e, el) => popup(el, seg(Object.keys(SOUNDS), () => row.sound, v => { closePop(); setRow(i, 'sound', v); },
      Object.fromEntries(Object.keys(SOUNDS).map(s => [s, s])))), 'mini')),
    ...row.cells.map((v, c) => { const on = v != null;
      const b = button(on && v ? (v > 0 ? `+${v}` : `${v}`) : '', `${row.sound} · step ${c + 1} (click: toggle, scroll over it: pitch, playing: highlighted)`,
        () => setRow(i, 'cells', myTracks[name].rows[i].cells.map((x, k) => k === c ? (x == null ? 0 : null) : x)), 'mini cell' + (on ? ' on' : ''));
      b.dataset.col = c;
      b.onwheel = e => { if (myTracks[name].rows[i].cells[c] == null) return; e.preventDefault();
        const cs = myTracks[name].rows[i].cells.slice(); cs[c] = clamp((cs[c] || 0) - Math.sign(e.deltaY), -12, 12); setRow(i, 'cells', cs); };
      return h('td', {}, b);
    }),
    h('td', { cls: 'bar' },
      button(':select_all:', row.cells.every(v => v != null) ? 'Turn every step in this row off' : 'Turn every step in this row on',
        () => { const allOn = row.cells.every(v => v != null); setRow(i, 'cells', row.cells.map(v => allOn ? null : (v ?? 0))); }, 'mini'),
      button(':swap_horiz:', 'Invert this row: on steps off, off steps on', () => setRow(i, 'cells', row.cells.map(v => v == null ? 0 : null)), 'mini'),
      button(':casino:', 'Randomize this row (keeps each step\'s pitch, picks which are on)', () => setRow(i, 'cells', row.cells.map(v => Math.random() < 0.5 ? (v ?? 0) : null)), 'mini'),
      button(':delete:', 'Remove this row', () => { saveTrack(name, { ...myTracks[name], rows: myTracks[name].rows.filter((_, j) => j !== i) }); refill(); }, 'mini')));
  grid.append(h('thead', {}, h('tr', {}, h('th', {}), ...Array.from({ length: t.steps }, (_, c) => h('th', { cls: 'stepnum', textContent: c + 1 })), h('th', {}))),
    h('tbody', {}, t.rows.map(rowTr)));
  const paint = () => { if (!grid.isConnected) return; const cur = curStep(myTracks[name] || t);
    for (const c of grid.querySelectorAll('.cell')) c.classList.toggle('cur', +c.dataset.col === cur);
    if (playingThis()) requestAnimationFrame(paint); };
  requestAnimationFrame(paint);
  return h('div', {},
    h('div', { cls: 'bar' }, nm,
      button(playingThis() ? ':stop: stop' : ':play_arrow: play', playingThis() ? `Stop ${name}` : `Play ${name} on a loop`,
        () => { playingThis() ? stopTrack() : playTrack(name); refill(); }),
      button(':content_copy: duplicate', `Duplicate ${name}`, () => { trackSel = duplicateTrack(name); refill(); }),
      button(':delete: delete', `Delete ${name}`, () => { deleteTrack(name); trackSel = null; refill(); })),
    slider('tempo', { min: 60, max: 220, step: 1 }, () => t.bpm, v => set('bpm', v), 'Beats per minute'),
    h('div', { cls: 'bar' }, h('span', { textContent: 'steps' }), seg([8, 16, 32], () => t.steps, setSteps,
      { 8: '8 steps', 16: '16 steps (a bar of 4/4)', 32: '32 steps' })),
    grid,
    button(':add: row', 'Add a sound row', () => { const live = myTracks[name]; saveTrack(name, { ...live, rows: [...live.rows, newRow(Object.keys(SOUNDS)[0], live.steps)] }); refill(); }));
}
function trackerPanel() {
  const wrap = h('div', { cls: 'mtable' }), body = h('div');
  const fill = () => {
    if (trackSel && !myTracks[trackSel]) trackSel = null;
    const names = Object.keys(myTracks);
    const tr = n => { const t = myTracks[n], playing = tracker.playing && tracker.name === n;
      return h('tr', { cls: trackSel === n ? 'on' : '', onclick: () => { trackSel = n; fill(); } },
        h('td', { textContent: n }), h('td', { textContent: t.bpm }), h('td', { textContent: t.steps }), h('td', { textContent: t.rows.length }),
        h('td', { cls: 'bar' },
          button(playing ? ':stop:' : ':play_arrow:', playing ? `Stop ${n}` : `Play ${n} on a loop`, e => { e.stopPropagation(); playing ? stopTrack() : playTrack(n); fill(); }, 'mini'),
          button(':content_copy:', `Duplicate ${n}`, e => { e.stopPropagation(); trackSel = duplicateTrack(n); fill(); }, 'mini'),
          button(':delete:', `Delete ${n}`, e => { e.stopPropagation(); deleteTrack(n); if (trackSel === n) trackSel = null; fill(); }, 'mini'))); };
    body.replaceChildren(
      h('table', {}, h('thead', {}, h('tr', {}, ...['name', 'bpm', 'steps', 'rows', ''].map(k => h('th', { textContent: k })))),
        h('tbody', {}, names.length ? names.map(tr) : h('tr', {}, h('td', { colSpan: 5, cls: 'note', textContent: 'no tracks yet' })))),
      h('h4', { textContent: trackSel || 'pick a track' }),
      trackSel ? trackFields(trackSel, fill) : h('p', { cls: 'note', textContent: 'new track starts a 16-step pattern; its rows pick from your sounds' }));
  };
  // a fx-tab view (src/fxlab.js), not a toggleable stage panel: no close button, there's nothing to close to
  wrap.append(h('div', { cls: 'bar stagehead' }, h('b', { textContent: 'tracker', tip: 'A simple step sequencer: each row plays one of your sounds on a loop of steps, at a tempo — a tiny drum machine built from the sounds you\'ve made.' }),
    button(':add: new track', 'A new 16-step track', () => { newTrack(); fill(); })), body);
  fill();
  return wrap;
}
// the move picker (the move group's popup): the moves as cards or a list, grouped, sorted and filtered
function moveList() {
  const pick = n => { closePop(); pickMove(n); }, view = () => lay('animate').movesView || 'cards', list = h('div'), fill = () => {
    const ch = currentChar(), q = anim.filter.trim().toLowerCase(), fd = n => frameData(ch.moves[n], 1);
    const names = Object.keys(ch.moves).filter(n => !q || [n, MOVE_GROUPS[anim.group](ch.moves[n], ch, n), ...moveInputs(ch, n)].join(' ').toLowerCase().includes(q));
    const by = { name: (a, b) => a.localeCompare(b), startup: (a, b) => fd(a).startup - fd(b).startup, damage: (a, b) => moveDamage(ch.moves[b]) - moveDamage(ch.moves[a]) }[anim.sort];
    if (by) names.sort(by);
    const groups = new Map(), rank = g => (GROUP_ORDER.indexOf(g) + 1 || 99);
    for (const n of names) { const g = MOVE_GROUPS[anim.group](ch.moves[n], ch, n); groups.set(g, [...groups.get(g) || [], n]); }
    const tips = Object.fromEntries(names.map(n => { const m = ch.moves[n], d = fd(n);
      return [n, `${d.startup}f startup · ${d.active} active · ${d.recovery} recovery${m.power ? ` · ${fmt(moveDamage(m))} damage · ${m.height || 'mid'}` : ''} · input: ${moveInputs(ch, n).join(' ') || 'none'}`]; }));
    list.replaceChildren(...[...groups].sort((a, b) => rank(a[0]) - rank(b[0])).flatMap(([g, ns]) =>
      [g && h('h4', { textContent: g }), view() !== 'list' ? h('div', { cls: 'cards' }, ns.map(n => moveCard(n, tips[n], pick)))
        : h('div', { cls: 'bar' }, seg(ns, () => anim.move, pick, tips))]));
    if (!names.length) list.replaceChildren(h('div', { cls: 'note', textContent: 'no move matches the filter' }));
    syncAll();
  };
  fill();
  return [
    h('div', { cls: 'row', tip: 'Show the moves as drawn cards or as a compact list of names' }, h('span', { textContent: 'view' }), seg(['cards', 'list'], view, v => { lay('animate').movesView = v; saveLay(); unpeek(); fill(); }, VIEW_TIPS)),
    adv(h('div', { cls: 'row', tip: 'Split the moves into headed groups: by type, limb, height, stance or style' }, h('span', { textContent: 'group' }), seg(Object.keys(MOVE_GROUPS), () => anim.group, v => { anim.group = v; fill(); }, GROUP_TIPS))),
    adv(h('div', { cls: 'row', tip: 'The order of the moves inside each group' }, h('span', { textContent: 'sort' }), seg(Object.keys(SORT_TIPS), () => anim.sort, v => { anim.sort = v; fill(); }, SORT_TIPS))),
    h('div', { cls: 'row', tip: 'Show only moves whose name, group or input contains this text (e.g. kick, air, qcf)' }, h('span', { textContent: 'filter' }),
      h('input', { cls: 'macro filter', value: anim.filter, placeholder: 'name, group or input', oninput: e => { anim.filter = e.target.value; fill(); }, onkeydown: e => e.stopPropagation() })),
    list];
}
const MOVE_BASIC = ['power', 'knock', 'launch', 'stun', 'damage']; // the rest wait behind "more"
const MOVE_VARS = [...MOVE_PROPS, { k: 'height', opts: ['high', 'shigh', 'mid', 'smid', 'low'] }];
function moveHeading() {
  const el = heading('Move', 'What happens on hit. Frame data (60 fps) is in the bar above the timeline.', '');
  el.append(groupOps(MOVE_VARS, k => curMove()[k] ?? (k === 'height' ? 'mid' : 0), k => { const b = builtInMove(); return b ? b[k] : curMove()[k]; },
    vals => edit(def => { const m = def.moves[anim.move]; for (const k in vals) if (vals[k]) m[k] = vals[k]; else delete m[k]; })));
  return el;
}
// + loop / layer: a keyframed idle or walk loop, or a movement layer for a state, for this stance where it has none yet
function addButton() {
  const ch = currentChar(), st = ch.stances[studio.stance].name;
  const loops = ['idle', 'walk'].filter(k => !ch.moves[loopName(ch, studio.stance, k)]), free = Object.keys(LAYERS).filter(k => !ch.moves[loopName(ch, studio.stance, k + 'Layer')]);
  if (!loops.length && !free.length) return null;
  return button(':add: :expand_more:', `A keyframed loop or movement layer for the ${st} stance`, (e, b) => popup(b, h('div', { onclick: closePop },
    loops.length ? h('h4', { textContent: 'loop' }) : null,
    loops.length ? h('div', { cls: 'bar' }, loops.map(k => button(`${loopName(ch, studio.stance, k)} loop`,
      `A keyframed ${k} loop for the ${st} stance, made from the procedural ${k}, to edit like a move; it replaces the procedural ${k} in this stance (delete it to go back)`, () => makeLoop(k)))) : null,
    free.length ? h('h4', { textContent: 'layer' }) : null,
    free.length ? h('div', { cls: 'bar' }, free.map(k => button(k, `${LAYERS[k][0]}: a ${k} layer. Its keys start at the procedural pose of that state and what you change is added on top of the procedural / IK motion while the fighter is in it (the mix slider sets how much; delete it to go back)`, () => makeLayer(k)))) : null)));
}
// an effect stack: up to FX_MAX effects drawn together, each with its look, the bones it wraps (ons; null: one bone), its colour and size
// get: the stored fx (none, one effect or a list); one effect is stored as a plain object, as before stacks.
// inherit: a key's, whose fx can also be "same" (as the keys before or the move say: undefined) or "none" (false)
const FX_COL_TIPS = { auto: 'The look\'s own colour (aura blue, fire orange, lightning cyan, smoke grey)', ...mapVals(FX_COLS, () => 'This colour') };
const fxOns = ch => ['strike', 'body', ...['arm', 'leg', 'head', 'tail', 'weapon'].filter(r => ch.chains[r].length)];
function fxRows(tip, get, set, ons, inherit) {
  const own = () => fxList(get()), put = (l, key) => set(l.length > 1 ? l : l[0] || (inherit ? false : undefined), key);
  const fresh = l => ({ look: Object.keys(FX_LOOKS).find(k => !l.some(e => e.look === k)) || 'aura' }); // a look not used yet
  const add = crud({ new: [`Add an effect (up to ${FX_MAX}): they all draw at once, in this order`, () => {
    const l = inherit && get() === undefined ? inherit() : own(); if (l.length < FX_MAX) put([...l, fresh(l)]); }] });
  reg(add, () => { add.hidden = own().length >= FX_MAX; });
  const none = h('span', { cls: 'note', textContent: 'none' });
  reg(none, () => { none.hidden = own().length > 0; });
  const head = h('div', { cls: 'row', tip }, h('span', {}, ...rich(':auto_awesome: effect')), h('span', { cls: 'bar' },
    inherit ? seg(['same', 'none', 'own'], () => get() === undefined ? 'same' : own().length ? 'own' : 'none',
      v => v === 'same' ? set(undefined) : v === 'none' ? set(false) : !own().length && put(inherit().length ? inherit() : [fresh([])]),
      { same: 'As the keys before (or the move) say', none: 'No effect from this key on', own: 'Its own effects from this key on (starting from the ones playing)' }) : none, add));
  const slot = i => {
    const e = () => own()[i], upd = (k, v, key) => put(own().map((x, j) => j === i ? { ...x, [k]: v } : x), key);
    const swap = d => { const l = own(), j = i + d; if (l[j]) { [l[i], l[j]] = [l[j], l[i]]; put(l); } };
    const up = button(':arrow_upward:', 'Move this effect up the stack: drawn before (under) the ones after it', () => swap(-1), 'mini');
    const down = button(':arrow_downward:', 'Move this effect down the stack: drawn after (over) the ones before it', () => swap(1), 'mini');
    reg(up, () => { up.hidden = !i; }); reg(down, () => { down.hidden = !own()[i + 1]; });
    const rows = [h('div', { cls: 'row', tip: `Effect ${i + 1}: its look (aura and smoke draw behind the body, fire and lightning over it)` }, h('span', { textContent: `fx ${i + 1}` }), h('span', { cls: 'bar' },
        seg(Object.keys(FX_LOOKS), () => e()?.look, v => upd('look', v), FX_LOOKS),
        crud({ delete: ['Remove this effect', () => put(own().filter((_, j) => j !== i))] }, up, down))),
      ons && h('div', { cls: 'row', tip: 'The bones the effect wraps' }, h('span', { textContent: 'fx on' }), seg(ons, () => e()?.on || 'strike', v => upd('on', v), FX_ON)),
      h('div', { cls: 'row', tip: 'The effect\'s colour' }, h('span', { textContent: 'fx colour' }),
        seg(['auto', ...Object.keys(FX_COLS)], () => e()?.col || 'auto', v => upd('col', v === 'auto' ? undefined : v), FX_COL_TIPS)),
      slider('fx size', { min: 0.3, max: 3, step: 0.1 }, () => e()?.size ?? 1, v => upd('size', v === 1 ? undefined : v, 'fx.size' + i), 'How big the effect draws (1 = as designed)'),
      slider('fx speed', { min: 0.2, max: 3, step: 0.1 }, () => e()?.spd ?? 1, v => upd('spd', v === 1 ? undefined : v, 'fx.spd' + i), 'How fast the effect animates (1 = as designed)')].filter(Boolean);
    for (const r of rows) reg(r, () => { r.hidden = !e(); });
    return rows;
  };
  return [head, ...Array.from({ length: FX_MAX }, (_, i) => slot(i)).flat()];
}
function movePanel() {
  // the striking bone: the limb ends as buttons, any other bone from the popup or by Shift+clicking its joint
  // click = strike with this bone only, Shift+click = add or remove it (several limbs strike at once)
  const m = () => curMove(), boneB = (id, tip) => { const b = button(id, tip, e => pickHit(id, e.shiftKey)); reg(b, () => b.classList.toggle('on', hitIds(m()).includes(id))); return b; };
  const hitB = button('', 'Any other bone as the strike (or Shift+click its joint in the editor)', (e, b) =>
    popup(b, h('div', { cls: 'bar' }, h('span', { cls: 'seg' }, edChar().ids.map(id => boneB(id, `Strike with ${id} · Shift+click: add or remove it`))))));
  reg(hitB, () => { const off = hitIds(m()).filter(id => !edChar().tips.some(b => b.id === id)); setRich(hitB, off.join(' ') || (hitIds(m()).length ? ':more_horiz:' : 'none')); });
  const tipSeg = h('span', { cls: 'seg' }, edChar().tips.map(b => boneB(b.id, `Strike with the end of ${b.id} (${b.role}) · Shift+click: add or remove it, so several limbs strike`)));
  const bindB = button('', 'Inputs that trigger this move. Click to bind it to other inputs (copies of moves become playable this way).', (e, b) =>
    popup(b, h('div', { cls: 'bar' }, Object.keys(slotsOf(CFG.plane)).map(s => toggle(s, `${SLOT_TIPS[s]} · now: ${curBinds(edChar())[s] || 'none'}`, () => curBinds(edChar())[s] === anim.move, () => toggleBind(s))))));
  reg(bindB, () => { setRich(bindB, boundSlots().join(' ') || 'none (combo only)'); });
  return [moveHeading(),
    m().ref ? slider('mix', { min: 0, max: 1, step: 0.05 }, () => m().mix ?? 1, v => setMove('mix', v === 1 ? undefined : v, 'm.mix'),
      'Layer strength: how much of this layer\'s offsets (its keys minus the procedural pose it was made from) is added on top of the procedural / IK motion in a fight. 0 = off, 1 = as keyed') : null,
    h('div', { cls: 'row', tip: 'Striking bones: each end is a strike (in limb mode the whole bone); with several, the one that lands counts, one hit per target. Shift+click a joint in the editor to pick it, ⌘/Ctrl+Shift+click to add or remove it.' },
      h('span', { textContent: 'hit' }), h('span', { cls: 'bar' }, tipSeg, hitB)),
    h('div', { cls: 'row', tip: 'Which inputs start this move in a fight' }, h('span', { textContent: 'input' }), h('span', { cls: 'bar' }, bindB,
      button(':stadia_controller:', 'All inputs: which directions and buttons have no move, and what each one starts', () => openStage('inputs'), 'mini')),
      seg(['2d', '25'], () => CFG.plane === '2d' ? '2d' : '25', v => { setCfg({ plane: v === '2d' ? '2d' : 'lanes' }); panels(); mode().restart(); },
        { '2d': '2D moveset: ↑ jumps, air moves by direction (also sets the plane setting)', '25': '2.5D moveset (VF-style): every direction × button is a ground move, Space jumps (also sets the plane to lanes)' },
        v => v === '2d' ? '2D' : '2.5D')),
    h('div', { cls: 'row', tip: 'Where the move is aimed; a hit reaction still follows the actual impact point' }, h('span', { textContent: 'height' }),
      seg(['high', 'shigh', 'mid', 'smid', 'low'], () => m().height, v => setMove('height', v), HEIGHT_TIPS)),
    subFold(':auto_awesome: move fx', fxRows('Effects drawn on the move\'s bones while it plays (a key can change them from there on); drawing only, the fight is the same',
      () => m().fx, (e, key) => setMove('fx', e, key), fxOns(edChar()))),
    adv(h('div', { cls: 'row', tip: 'Hits: the states of the foe this move can hit (hits; all lit = any); a lying foe: the otg flag' }, h('span', { textContent: 'hits' }), h('span', { cls: 'bar' },
      ...Object.entries(HITS_TIPS).map(([s, tip]) => toggle(s, tip, () => (m().hits || HIT_STATES).includes(s),
        v => { const next = HIT_STATES.filter(x => x === s ? v : (m().hits || HIT_STATES).includes(x)); setMove('hits', next.length === HIT_STATES.length ? undefined : next); }))))),
    ...MOVE_PROPS.map(p => { const r = slider(p.k, p, () => m()[p.k] ?? p.def ?? 0, v => setMove(p.k, v === (p.def ?? 0) ? undefined : v, 'm.' + p.k), p.tip); return MOVE_BASIC.includes(p.k) ? r : adv(r); }),
    h('div', { cls: 'bar' }, Object.entries(MOVE_FLAGS).map(([f, tip]) => toggle(f, tip, () => !!m()[f], v => setMove(f, v || undefined)))),
    throwRow(),
    ...(m().throw ? holdOptionsRows() : []),
    counterRow(),
    isThrowTarget() ? holdRow() : null,
    ...keyPanel(),
    ...charPanel(),
  ];
}

// the moves toolbar (character and animate tabs): any move opened in animate; the move table, inputs and combos are stage panels (panels group)
function movesGrp() {
  const pick = button(':timeline: edit :expand_more:', 'Pick a move to open in the keyframe editor (animate)', (e, b) =>
    popup(b, h('div', { cls: 'bar' }, Object.keys(currentChar().moves).sort().map(n => button(n, `Open ${n} in the keyframe editor`, () => { closePop(); openMove(n); })))));
  return grp('moves', 'The character\'s moves: pick one to open in the keyframe editor (or click a move in the table, inputs or combos)', pick);
}
const MOVE_PANELS = ['table', 'inputs', 'combos'],
  moveStage = () => ({ table: moveTable, inputs: inputTable, combos: comboView })[stageOpen()];
// the move toolbar (animate): previous / next, the move being edited with the picker, its actions and the stance
function moveGrp() {
  const ch = currentChar(), names = Object.keys(ch.moves), step = d => pickMove(names[(names.indexOf(anim.move) + d + names.length) % names.length]);
  const cur = button('', 'The move being edited: click to pick another (cards or a list, grouped, sorted, filtered)', (e, b) => {
    popup(b, h('div', { cls: 'movepop' }, ...moveList())); pop?.querySelector('.filter').focus();
  });
  reg(cur, () => setRich(cur, `${anim.move} :expand_more:`));
  const st = ch.stances.map(s => s.name);
  return grp('move', 'The move being edited. Copies can be tuned freely; the built-in names are the ones the controls trigger. Enter play/pause · O onion · I aim',
    button(':chevron_left:', 'Previous move', () => step(-1), 'mini'), cur, button(':chevron_right:', 'Next move', () => step(1), 'mini'),
    crud({ copy: ['New move copied from this one, named with a number (jab → jab2); undoable', copyMove], delete: ['Delete this move and its binds (only copies; built-ins stay); undoable', deleteMove] }, addButton()),
    st.length > 1 ? seg(st.map((_, i) => i), () => studio.stance, i => { studio.stance = i; panels(); mode().restart(); },
      Object.fromEntries(st.map((n, i) => [i, `Stance ${n}: the one the input and loop edits change and previews start in (stances are made in the character tab)`])), i => st[i]) : null);
}
function animCtx() {
  return [moveGrp(), showGrp(['boxes', 'ghost', 'colours']), panelsGrp(MOVE_PANELS, VIEW_TIPS)];
}
const CMP_TIPS = { off: 'Off: show only the move being edited', overlay: 'The compared move drawn over this one in amber, at the same moment',
  strip: 'Filmstrip: this move and the compared one frame by frame on one time scale, tinted by phase (click a frame to go there)' };
// under the preview (there is a lot of empty space there), not the toolbar — it only matters while watching the preview
function compareBar() {
  const pick = button('', 'The move to compare with', () => pickCompare(pick), 'mini');
  reg(pick, () => setRich(pick, `:theaters: ${cmpMove() ? anim.cmp : 'pick'}`));
  return h('div', { cls: 'over cmpbar' }, pick,
    seg(Object.keys(CMP_TIPS), () => anim.cmpView, v => { anim.cmpView = v; if (v === 'overlay' && !cmpMove()) pickCompare(pick); }, CMP_TIPS));
}
function pickCompare(anchor) {
  const ch = currentChar(), groups = new Map(), rank = g => (GROUP_ORDER.indexOf(g) + 1 || 99);
  for (const n of Object.keys(ch.moves)) { const g = MOVE_GROUPS[anim.group](ch.moves[n], ch, n); groups.set(g, [...groups.get(g) || [], n]); }
  const set = v => { anim.cmp = v; if (anim.cmpView === 'off') anim.cmpView = 'overlay'; closePop(); };
  popup(anchor, h('b', { textContent: 'compare with' }), ...[...groups].sort((a, b) => rank(a[0]) - rank(b[0]))
    .flatMap(([g, ns]) => [g && h('h4', { textContent: g }), h('div', { cls: 'bar' }, seg(ns, () => anim.cmp, set, Object.fromEntries(ns.map(n => [n, `Compare with ${n}: overlay or filmstrip, as picked in the toolbar`]))))]));
}

// controls over the canvas: transport and key edits above the timeline, the preview's target under the preview
function timelineBar() {
  const play = button('', 'Play / pause the move in the preview' + keyTip('playMove'), () => { anim.playing = !anim.playing; }, 'mini');
  reg(play, () => { setRich(play, anim.playing ? ':pause:' : ':play_arrow:'); });
  const frames = h('span', { cls: 'v', tip: 'Length of the selected key in 60 fps frames' }), fd = h('span', { cls: 'fd' });
  reg(frames, () => { frames.textContent = `${Math.round(curMove().keys[anim.key].d * 60)}f`; });
  reg(fd, () => { const d = frameData(curMove(), 1); fd.textContent = `${d.startup} · ${d.active} · ${d.recovery}f`;
    fd.dataset.tip = `Frame data (60 fps): ${d.startup} startup · ${d.active} active · ${d.recovery} recovery`; });
  const b = (l, tip, f) => button(l, tip, f, 'mini');
  return h('div', { cls: 'over tlbar' },
    b(':skip_previous:', 'Select the first key', () => selectKey(0)), b(':chevron_left:', 'Select the previous key' + keyTip('prevKey'), () => selectKey(anim.key - 1)),
    b(':fast_rewind:', 'Step back one 60 fps frame (paused, the preview follows along)' + keyTip('frameBack'), () => stepFrame(-1)), play, b(':fast_forward:', 'Step forward one 60 fps frame (paused, the preview follows along)' + keyTip('frameFwd'), () => stepFrame(1)),
    b(':chevron_right:', 'Select the next key' + keyTip('nextKey'), () => selectKey(anim.key + 1)), b(':skip_next:', 'Select the last key', () => selectKey(curMove().keys.length - 1)),
    h('span', { cls: 'sep' }),
    b(':add: key', 'Insert a key after the selected one, starting from its pose', addKey),
    b(':content_cut: split', 'Split the selected key in two at its middle (double-click a key: split it there)', () => splitKey(keyStart(curMove(), anim.key) + curMove().keys[anim.key].d / 2)),
    b(':delete:', 'Delete the selected key (undoable)' + keyTip('deleteBone'), deleteKey),
    h('span', { cls: 'sep' }),
    b(':remove:', 'Make the selected key one frame shorter: the move gets quicker', () => keyFrames(-1)), frames, b(':add:', 'Make the selected key one frame longer: the move gets slower', () => keyFrames(1)),
    h('span', { cls: 'sep' }),
    toggle(':layers:', 'Onion skin: ghosts of the previous (blue) and next (green) keys' + keyTip('onion'), () => anim.onion, v => { anim.onion = v; }),
    toggle(':my_location:', 'Aim: the striking limb follows the cursor through IK; click to set the pose. Double-click any joint to make that one follow' + keyTip('aim'), () => anim.aim, v => { anim.aim = v; anim.aimId = null; }),
    seg(Object.keys(REACH_TIPS), () => anim.reach, v => { anim.reach = v; }, REACH_TIPS),
    fd);
}
function targetBar() {
  const tg = anim.target, set = (k, v) => { tg[k] = v; anim.t = 0; anim.playing = true; buildPreview(); };
  const who = button('', 'The character the preview\'s move is played against (same: the one being edited)', (e, b) =>
    popup(b, h('div', { cls: 'bar' }, seg([null, ...Object.keys(DEFS)], () => tg.char, v => { set('char', v); closePop(); }, { null: 'The character being edited' }, v => v ?? 'same'))), 'mini');
  reg(who, () => { setRich(who, ':person: ' + (tg.char && DEFS[tg.char] ? tg.char : 'same')); });
  const sg = (k, opts) => seg(opts, () => tg[k], v => set(k, v), TARGET_TIPS);
  const speedTips = { 0.25: 'Quarter speed', 0.5: 'Half speed', 1: 'Real time', 2: 'Double speed' };
  return h('div', { cls: 'over tgt', tip: 'The preview\'s target: who, how it stands, its state, facing and distance; changing it restarts the preview' }, who, sg('stance', Object.keys(STANCES)), sg('state', ['idle', 'jump', 'air', 'down', 'dizzy']), sg('facing', ['toward', 'away']), sg('dist', ['near', 'far']),
    h('span', { cls: 'sep' }),
    toggle(':repeat:', 'Loop the preview when the move ends; off: play once and hold the last frame', () => anim.pvLoop, v => { anim.pvLoop = v; anim.pv.loop = v; }),
    toggle(':flash_on:', 'Hit stop, screen shake and juice in the preview; off: a clean, undisturbed look at the raw motion', () => anim.pvFx, v => { anim.pvFx = v; buildPreview(); }),
    seg(Object.keys(speedTips).map(Number), () => anim.pvSpeed, v => { anim.pvSpeed = v; }, speedTips, v => ({ 0.25: '¼×', 0.5: '½×', 1: '1×', 2: '2×' })[v]));
}

const animMode = {
  preview: () => anLayout().pv,
  clipRects: () => [{ key: 'preview', r: anLayout().pv }],
  enter() { if (!curMove()) anim.move = Object.keys(currentChar().moves)[0]; selectKey(Math.min(anim.key, curMove().keys.length - 1)); anim.playing = true; buildPreview(); },
  restart() { anim.t = 0; buildPreview(); },
  // playing/paused is the preview's own clock: it keeps looping (or holding, paused) regardless of which
  // key you've selected or scrubbed to in the editor below it (that only moves the editor's own cursor)
  worlds: () => (anim.hold || !anim.playing) ? [] : [anim.pv],
  // scrub: mouse x = time through the move; paused, the preview re-simulates to the same moment; playing, it keeps running
  scrub(f) { const m = curMove(); anim.t = f * (total(m) - 1e-6); anim.key = keyAt(m, anim.t); if (!anim.playing) previewAt(anim.t); },
  changed() { if (anim.drag) previewAt(anim.t); else buildPreview(); },
  render() { clear(); drawAnimEditor(); drawTimeline(); drawCell({ w: anim.pv, label: 'preview (springs + hit stop)' }, anLayout().pv, { plot: false }); },
  ctxBar: animCtx,
  split: () => true,
  side: movePanel,
  open: ['move', 'key'],
  overlay: () => moveStage() ? [moveStage()()] : [timelineBar(), compareBar(), targetBar()],
  mouse: animMouse,
  key: animKey,
  hint: () => 'drag a joint: IK · Alt+drag: one bone · timeline: click a key to select, drag it to reorder, drag its edge to retime, double-click to split, drag the ruler to scrub · , . frame step · Delete key',
};
