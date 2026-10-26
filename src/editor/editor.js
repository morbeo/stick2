'use strict';
// ---------- animate mode: pose keyframes by dragging joints (IK), retime them on a frame timeline, preview with springs ----------
const anim = { move: 'jab', key: 1, t: 0, playing: true, pvLoop: true, pvSpeed: 1, pvFx: true, onion: true, aim: false, aimId: null, reach: 'limb', drag: null, hover: null, anchor: null, pv: null, hold: false, holdEdit: false,
  target: { char: null, stance: 'stand', state: 'idle', facing: 'toward', dist: 'near' }, group: 'type', sort: 'order', filter: '',
  tfilter: '', tsort: { k: null, dir: 1 }, tscroll: 0, // the move table's filter, sort column and scroll
  cmp: null, cmpView: 'off', // the move compared with (compare group): drawn over this one or as filmstrips
  cmpOld: false, pvOld: null }; // side-by-side preview of the built-in character (before) next to the current edits (after)
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
      for (let j = 0; j <= 16; j++) { const t = j / 16, v = easeKey(k, t); ctx[j ? 'lineTo' : 'moveTo'](cx + t * cw, cy + ch - v * ch); }
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
    ik(ch, pose, a.id, [h0.L[a.id][0] - dx, h0.L[a.id][1] - dy], legs, 40); // 40 rounds, as the creator's equivalent uses - 12 (ik's default) lets the ankles drift
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
  if (anim.cmpOld && CHAR_DEFS[CURRENT]) {
    const wo = newWorld(pvScen(), anim.pvFx ? {} : NOJUICE, 1, [makeCharacter(CHAR_DEFS[CURRENT]), CHARS[anim.target.char] || currentChar()]);
    Object.assign(wo, { sfx: () => {}, loop: anim.pvLoop, rawAdvance: wo.advance.bind(wo) }); // muted: only the "after" pane plays sound
    wo.advance = (dt, inp) => wo.rawAdvance(dt * anim.pvSpeed, inp);
    anim.pvOld = wo;
  } else anim.pvOld = null;
}
// re-simulate the preview up to move time t (deterministic, so this is what the fight would show)
function previewAt(t) {
  for (const w of [anim.pv, anim.pvOld]) {
    if (!w) continue;
    const m = w.a.ch.moves[anim.move]; // each pane's own version of the move, not the other pane's object
    w.reset();
    for (let g = 0; g < 240 && w.a.action?.m !== m; g++) w.rawAdvance(F, NOIN);
    for (let i = 0; i < Math.round(t / CFG.attackSpeed * 60); i++) w.rawAdvance(F, NOIN);
  }
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
  let stop = null;
  b.onmouseenter = () => { const t0 = performance.now(); stop = rafLoop(b, () => drawThumb(cv, ch, samplePose(ch, m, (performance.now() - t0) / 1000 % (total(m) + 0.3)))); };
  b.onmouseleave = () => { stop?.(); stop = null; still(); };
  reg(b, () => { b.classList.toggle('on', anim.move === n); if (!stop) still(); });
  return b;
}
const VIEW_TIPS = { cards: 'A drawing of each move (hover to play it)', list: 'Compact: names only',
  dope: 'Dopesheet: the move\'s bones down the side, its keys across (as wide as their frames); a dot where a key turns that bone, bigger for a bigger turn. Click: go to that key · Shift+click: hold the bone (copy the key before) · Alt+click: send the bone back to the stance in that key',
  table: 'Every move in a table over the stage: sort by any column, fuzzy filter, edit the values in place, hover a row to see it play',
  inputs: 'Every input over the stage: direction pads per button show which directions have no move of their own, and a table of all inputs; click one to give it a move',
  combos: 'The combos over the stage: the chain links (P / K, or a direction with it like 6P, after a move chains into the next, chains setting authored) as a tree per starter or a table of routes with damage and frames; add, change and cut links in place',
  looks: 'Design fx looks: every built-in and custom look, a live preview and an experiment grid; a new look is a generic particle effect tuned by sliders (count, life, speed, spread, angle, gravity, size, shape)' };
