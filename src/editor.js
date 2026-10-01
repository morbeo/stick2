'use strict';
// ---------- animate mode: pose keyframes by dragging joints (IK), retime them on a frame timeline, preview with springs ----------
const anim = { move: 'jab', key: 1, t: 0, playing: true, onion: true, aim: false, aimId: null, reach: 'limb', drag: null, hover: null, anchor: null, pv: null, hold: false,
  target: { char: null, stance: 'stand', state: 'idle', facing: 'toward' }, group: 'type', sort: 'order', filter: '', view: 'cards',
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
  const ew = Math.round(canvas.width * 0.58), th = 124 * dpr; // the top 34 px hold the control bar (timelineBar)
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

const AMBER = '#d68c14';
const lowest = (ch, L) => Math.max(...ch.bones.map(b => L[b.id][1] + (b.shape === 'circle' ? b.len : 0)));
function drawAnimEditor() {
  if (anim.cmpView === 'strip') return drawStrip();
  const f = anFrame(), { ch, r, s, o, L, P, ground } = f, m = curMove(), ki = keyAt(m, anim.t);
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
  drawFigure(ctx, ch, L, INK[0], INK[1], 0, roleTint());
  if (m.keys[ki].active) for (const id of hitIds(m)) if (L[id]) { // the strikes: red joints, radius = hitR
    const e = L[id];
    ctx.fillStyle = 'rgba(192,57,43,.35)'; ctx.beginPath(); ctx.arc(e[0], e[1], Math.max(2.5, CFG.hitR), 0, 7); ctx.fill();
  }
  ctx.restore();
  const editing = Math.abs(anim.t - keyEnd(m, anim.key)) < 1e-6, hits = hitIds(m);
  for (const b of ch.bones) {
    const p = P[b.id], hov = b.id === anim.hover || b.id === anim.drag, hit = hits.includes(b.id);
    ctx.beginPath(); ctx.arc(p[0], p[1], (hov ? 5.5 : 4) * dpr, 0, 7);
    ctx.fillStyle = hov ? '#ffd' : '#fff'; ctx.fill();
    ctx.strokeStyle = hit ? RED[0] : '#555'; ctx.lineWidth = (hit ? 2.5 : 1.5) * dpr; ctx.stroke();
  }
  { const [x, y] = P.hip, hov = anim.hover === 'hip' || anim.drag === 'hip', q = (hov ? 5.5 : 4) * dpr; // the hip: a square handle
    ctx.fillStyle = hov ? '#ffd' : '#fff'; ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5 * dpr; ctx.fillRect(x - q, y - q, q * 2, q * 2); ctx.strokeRect(x - q, y - q, q * 2, q * 2); }
  if (anim.aim && P[aimBone()]) { // the joint that follows the cursor: a crosshair ring
    const [x, y] = P[aimBone()], q = 9 * dpr;
    ctx.beginPath(); ctx.arc(x, y, q, 0, 7);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * q * 0.6, y + dy * q * 0.6); ctx.lineTo(x + dx * q * 1.5, y + dy * q * 1.5); }
    ctx.strokeStyle = '#07f'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
  }
  if (anim.hover === 'hip' || anim.drag === 'hip') text('hip: the body moves, the feet stay', Math.min(P.hip[0] + 10 * dpr, r.x + r.w - 220 * dpr), P.hip[1] - 8 * dpr, '#666', 11);
  const hv = ch.by[anim.drag || anim.hover];
  if (hv) text(`${hv.id} ${Math.round(f.pose[hv.id])}°`, Math.min(P[hv.id][0] + 10 * dpr, r.x + r.w - 120 * dpr), P[hv.id][1] - 8 * dpr, '#666', 11);
  text(`${anim.move} · key ${anim.key + 1}/${m.keys.length}${editing ? '' : ' (drag a joint to jump to the selected key)'}`, r.x + 10 * dpr, r.y + 18 * dpr, '#444', 12, 'bold');
  text(anim.aim ? `aim: ${anim.aimId || 'the striking limb'} follows the cursor (reach: ${anim.reach}) · click to set`
    : `drag: IK (reach: ${anim.reach}) · Alt+drag: rotate one bone · double-click a joint: it follows the cursor`, r.x + 10 * dpr, r.y + 34 * dpr, '#999', 11);
  if (cm && anim.cmpView === 'overlay') text(`amber: ${anim.cmp} at the same moment`, r.x + 10 * dpr, r.y + 50 * dpr, AMBER, 11);
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
      k.catch && ['back_hand', '#2c6fb0'], k.warp && ['blur_on', '#8e44ad'], k.grip && ['pan_tool', '#b07a2c'], k.release && ['sports_handball', '#b07a2c'], i === m.cancel && ['sync_alt', '#8e44ad'], !k.p && ['accessibility_new', '#888'], hold && ['pause', '#888']].filter(Boolean);
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
  const f = anFrame(), ch = f.ch;
  const { chain, pose } = id === 'hip' ? hipTo(f, x, y) : (c => ({ chain: c, pose: ik(ch, { ...f.pose }, id, f.toLocal(x, y), c, single ? 1 : 12) }))(ikChain(ch, id, single));
  edit(def => {
    const k = def.moves[anim.move].keys[anim.key];
    k.p = k.p || {};
    for (const b of chain) k.p[b.id] = Math.round(pose[b.id] * 10) / 10;
  }, 'pose:' + anim.key + id);
}
const aimBone = () => anim.aimId || hitIds(curMove())[0]; // what aim moves: a double-clicked joint, else the striking bone
function pickJoint(x, y) {
  const { ch, P } = anFrame();
  let best = null, bd = 12 * dpr;
  for (const id of [...ch.ids, 'hip']) { const d = Math.hypot(P[id][0] - x, P[id][1] - y); if (d < bd) { bd = d; best = id; } }
  return best;
}
function selectKey(i) {
  const m = curMove();
  anim.key = clamp(i, 0, m.keys.length - 1);
  anim.t = keyEnd(m, anim.key); anim.playing = false;
}

// ---------- preview: the real engine (springs, hit stop) playing the move against a target ----------
// the target: any character, standing / crouching / guarding, idle / in the air / lying / dizzy, facing toward or away
const STANCES = { stand: 'dummy', crouch: [{ hold: 'down', t: 99 }], guard: [{ hold: 'guard', t: 99 }], low: [{ hold: 'down+guard', t: 99 }] };
const TARGET_TIPS = {
  stand: 'The target stands still', crouch: 'The target crouches: highs pass over it', guard: 'The target holds guard: blocks highs and mids from the front',
  low: 'The target holds a low guard: blocks lows and special mids from the front',
  idle: 'The target is on the ground and free', air: 'The target jumps so it is near the top of its jump when the move becomes active',
  down: 'The target lies on the floor: only off-the-ground (otg) moves hit it', dizzy: 'The target is dizzy: the next hit wakes it',
  toward: 'The target faces the attacker', away: 'The target turns its back: guard and parry only work from the front',
};
function pvScen() {
  const m = curMove(), tg = anim.target, s = galleryScen(anim.move, !!m.air);
  s.b = tg.state === 'air' ? [Math.max(0, 0.1 + frameData(m, CFG.attackSpeed).startup / 60 - 0.25), 'hop'] : STANCES[tg.stance];
  s.init = w => {
    const b = w.b;
    w.a.stanceI = studio.stance;
    if ((b.away = tg.facing === 'away')) b.dir = -b.dir;
    if (tg.state === 'down') Object.assign(b, { kd: 'down', downT: 99 });
    if (tg.state === 'dizzy') Object.assign(b, { dizzyT: 99, hurtT: 99 });
  };
  return s;
}
function buildPreview() { anim.pv = newWorld(pvScen(), {}, 1, [currentChar(), CHARS[anim.target.char] || currentChar()]); }
// re-simulate the preview up to move time t (deterministic, so this is what the fight would show)
function previewAt(t) {
  const w = anim.pv, m = curMove();
  w.reset();
  for (let g = 0; g < 240 && w.a.action?.m !== m; g++) w.advance(F, NOIN);
  for (let i = 0; i < Math.round(t / CFG.attackSpeed * 60); i++) w.advance(F, NOIN);
}

// ---------- mouse ----------
function animMouse(type, x, y, e) {
  const L = anLayout(), m = curMove(), inTl = y >= L.tl.y - 4 * dpr && x < L.ed.w, tl = L.tl, px = tl.w / total(m), ruler = inTl && y < tl.y + 18 * dpr;
  const tAt = () => clamp((x - tl.x) / px, 0, total(m) - 1e-6), edge = () => inTl && !ruler ? m.keys.findIndex((k, i) => Math.abs(x - tl.x - keyEnd(m, i) * px) < 6 * dpr) : -1;
  if (anim.cmpView === 'strip' && !inTl && x < L.ed.w) { // filmstrip: a click goes to that frame
    if (type === 'down') { const { step, cw } = stripCells(L.ed); anim.playing = false; anim.t = Math.min(Math.floor(x / cw) * step, total(m) - 1e-6); anim.key = keyAt(m, anim.t); previewAt(anim.t); }
    return;
  }
  if (type === 'down') {
    if (anim.aim) { anim.aim = false; anim.aimId = null; studio.lastKey = null; return; }
    if (inTl) {
      if (ruler) { anim.drag = { scrub: true }; anim.playing = false; }
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
      if (id) { selectKey(anim.key); const f = anFrame(); anim.drag = id; anim.hold = true; anim.hip0 = { x, y, a: [...f.o], L: f.L, pose: f.pose }; } // anFrame: re-anchor at the key pose before freezing
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
    if (d?.scrub) previewAt(anim.t);
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

function stepFrame(n) { anim.playing = false; anim.t = clamp(anim.t + n * F, 0, total(curMove()) - 1e-6); anim.key = keyAt(curMove(), anim.t); previewAt(anim.t); }

// ---------- key and move edits ----------
// the key's pose with every front bone (id ending in F) swapped with its back twin (B)
function mirrorKey() {
  const ch = edChar(), p = keyPose(ch, curMove(), anim.key), out = { ...p };
  for (const id of ch.ids) { const tw = id.slice(0, -1) + ({ F: 'B', B: 'F' })[id.slice(-1)]; if (tw !== id && ch.by[tw] && p[tw] !== undefined) out[id] = p[tw]; }
  setKey('p', out);
}
const setKey = (k, v, key = null) => edit(def => { def.moves[anim.move].keys[anim.key][k] = v; }, key);
const setMove = (k, v, key = null) => edit(def => { def.moves[anim.move][k] = v; }, key);
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
  downBackPunch: '↙ J (1P), else ↓ J', downBackKick: '↙ K (1K), else ↓ K', throw: 'J while holding guard (P+G): a throw', throw2: 'K while holding guard (K+G): the second throw',
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
  anim.move = name; anim.key = 0; anim.t = 0; anim.playing = true;
  buildPreview(); panels();
}

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
];
// what each height is blocked by (guard and parry are front only)
const HEIGHT_TIPS = {
  high: 'High: blocked standing; passes over a crouching fighter.',
  shigh: 'Special high (overhead, jump-ins): blocked standing only; hits a crouching guard and cannot be ducked.',
  mid: 'Mid: blocked standing; hits a crouching guard.',
  smid: 'Special mid: blocked standing or crouching.',
  low: 'Low: blocked crouching only; hits a standing guard. No upward push.',
};
const MOVE_FLAGS = {
  kd: 'Knockdown: the victim is launched, bounces and lies down.',
  air: 'Air move: performed while jumping, cancelled on landing.',
  inv: 'Invincible for the whole move (get-ups).',
  special: 'Special: normals that hit can be cancelled into it (if specialCancel is on).',
  otg: 'Off the ground: hits a fighter lying on the floor and pops it up (otg setting: flagged).',
  wide: 'Wide: in 2.5D it reaches 3× zReach in depth, so a sidestep does not dodge it.',
  crumple: 'Crumple: the victim folds to the floor where it stands, open to a follow-up before it lands.',
  wall: 'Wall splat: a victim knocked into the arena wall sticks to it a moment instead of bouncing off.',
  bounce: 'Ground bounce: a knocked-down victim bounces high off the floor once, open to a juggle.',
  roll: 'Roll: invincible and passing through fighters for rollInv from its start; the body turns over once, the way its lunge goes (rollFwd, rollBack).',
};

// what normalize returns to: the built-in move of the same name (copies like jab2: the move they were copied from)
const builtInMove = () => (CHAR_DEFS[CURRENT] || CHAR_DEFS.stick).moves[anim.move.replace(/\d+$/, '')];
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
    h('div', { cls: 'row', tip: 'Easing curve into this key\'s pose' }, h('span', { textContent: 'easing' }),
      seg(Object.keys(EASE), () => k().e || 'linear', v => setKey('e', v), EASE_TIPS)),
    h('div', { cls: 'row', tip: 'Active frames can hit' }, h('span', { textContent: 'active' }),
      toggle(':my_location: hits', 'Active: the strike can connect during this key', () => !!k().active, v => setKey('active', v || undefined))),
    h('div', { cls: 'row', tip: 'Cancel window and invincibility' }, h('span', { textContent: 'flags' }), h('span', { cls: 'bar' },
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
        () => !!k().warp, v => setKey('warp', v || undefined)))),
    adv(h('div', { cls: 'row', tip: 'Catch keys only: the heights of strike this key catches (catchH; all lit = every height)' }, h('span', { textContent: 'catches' }), h('span', { cls: 'bar' },
      ...Object.keys(HEIGHT_TIPS).map(ht => toggle(ht, 'Catch ' + HEIGHT_TIPS[ht].replace(/:.*/, '').toLowerCase() + ' strikes (catchHigh: high + shigh, catch: mid + smid, catchLow: low)',
        () => (k().catchH || Object.keys(HEIGHT_TIPS)).includes(ht),
        v => { const cur = (k().catchH || Object.keys(HEIGHT_TIPS)).filter(x => x !== ht), next = v ? Object.keys(HEIGHT_TIPS).filter(x => x === ht || cur.includes(x)) : cur;
          setKey('catchH', next.length === 5 ? undefined : next); }))))),
    ...curMove().weapon ? [h('div', { cls: 'row', tip: 'Weapon hand: where pick-up and throw moves take or let go of the weapon' }, h('span', { textContent: 'hand' }), h('span', { cls: 'bar' },
      ...[['grip', ':pan_tool: grip', 'Grip: picking up (P+G over a weapon), the hand closes on the handle as this key is reached; the weapon slides to the hand until then. Unmarked: the first key.'],
        ['release', ':sports_handball: release', 'Release: throwing (P+G armed), the weapon leaves the hand as this key is reached. Unmarked: the first key.']].map(([n, l, t]) =>
        toggle(l, t, () => !!k()[n], v => edit(def => { def.moves[anim.move].keys.forEach((x, i) => { if (i === anim.key && v) x[n] = true; else delete x[n]; }); })))))] : [],
    slider('lunge', { min: -600, max: 600, step: 10 }, () => k().lunge || 0, v => setKey('lunge', v || undefined, 'lunge'),
      'Forward speed given when this key starts (px/s): steps into the strike; below 0 it moves back (rollBack).'),
  ];
}
// ---------- move list: grouped by type / striking limb / height, sorted, filtered by name or input ----------
const MOVE_GROUPS = {
  type: m => m.weapon ? 'weapon' : m.air ? 'air' : m.throw ? 'throw' : m.special ? 'special' : m.power ? 'normal' : 'other',
  limb: (m, ch) => m.power ? [...new Set(hitIds(m).map(id => ch.by[id]?.role || 'none'))].join(' + ') || 'none' : 'other',
  height: m => m.power ? m.height || 'mid' : 'other',
  // the stance whose own binds start the move (main: only the main binds; unbound: no input in any stance)
  stance: (m, ch, n) => (ch = withWeapon(ch, m)).stances.slice(1).filter((s, i) => Object.values(DEFS[CURRENT].stances[i][bkey()] || {}).includes(n)).map(s => s.name).join(' + ')
    || (Object.values(ch.stances[0][bkey()]).includes(n) ? 'main' : 'unbound'),
  style: m => m.style || (m.power ? 'basic' : 'other'),
  none: () => '',
};
const GROUP_ORDER = ['main', 'normal', 'special', 'throw', 'weapon', 'air', 'arm', 'leg', 'head', 'spine', 'tail', 'high', 'shigh', 'mid', 'smid', 'low', 'boxing', 'karate', 'muay thai', 'capoeira', 'kung fu', 'taekwondo', 'wrestling', 'basic', 'none', 'other', 'unbound'];
const GROUP_TIPS = { type: 'Group by type: normal, special, throw, weapon (played while holding a weapon of its class), air, other (not attacks)', limb: 'Group by the striking limb', height: 'Group by height', stance: 'Group by the stance whose binds start the move', style: 'Group by fighting style: boxing, karate, muay thai, capoeira, kung fu, taekwondo, wrestling (the style property), basic', none: 'One list' };
const SORT_TIPS = { order: 'As defined', name: 'By name', startup: 'Fastest first (startup frames)', damage: 'Most damage first' };
const moveDamage = m => m.power ? m.damage ?? m.power * 8 : 0;
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
    return { d: T / n, e: 'inOutCubic', p: mapVals(f.basePose(), v => Math.round(v)) };
  });
  edit(def => { def.moves[name] = { keys }; });
  pickMove(name);
}
// a move as a card: a drawing of its strike (the first active key); hovering plays it
function moveCard(n, tip) {
  const cv = h('canvas'), b = h('button', { cls: 'card', tip, onclick: () => pickMove(n) }, cv, h('span', { textContent: n }));
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
  inputs: 'Every input over the stage: direction pads per button show which directions have no move of their own, and a table of all inputs; click one to give it a move' };
// ---------- move table: every move of the character, sortable, fuzzy-filtered, values edited in place ----------
// startup / active / recovery edits retime that phase's keys; height opens its options; hovering a row plays the move by the cursor
const PHASE_TIPS = { startup: 'Startup frames (60 fps) before the first active key. Edit to retime the startup keys.',
  active: 'Active frames: the strike can hit. Edit to retime the active keys.', recovery: 'Recovery frames after the last active key. Edit to retime them.' };
const TABLE_COLS = [
  { k: 'name', tip: 'Click a row to open the move in the keyframe editor, hover it to see it play', get: (m, n) => n },
  { k: 'type', tip: GROUP_TIPS.type, get: (m, n, ch) => MOVE_GROUPS.type(m, ch, n) },
  { k: 'input', tip: 'Inputs that start it (in the moveset of the plane setting: 2D or 2.5D)', get: (m, n, ch) => moveInputs(ch, n).join(' ') },
  { k: 'stance', tip: GROUP_TIPS.stance, get: (m, n, ch) => MOVE_GROUPS.stance(m, ch, n) },
  { k: 'limb', tip: 'Striking bones', get: m => m.power ? hitIds(m).join('+') : '' },
  { k: 'height', tip: 'Height: what blocks it (click a value to change it)', get: m => m.power ? m.height || 'mid' : '', height: true },
  ...Object.keys(PHASE_TIPS).map(k => ({ k, tip: PHASE_TIPS[k], get: m => frameData(m)[k], phase: true })),
  ...MOVE_PROPS.map(p => ({ k: p.k, tip: p.tip, get: m => m[p.k] ?? '', prop: p })),
  { k: 'flags', tip: 'Move flags (set them in the move panel)', get: m => Object.keys(MOVE_FLAGS).filter(f => m[f]).join(' ') },
];
function setPhase(n, phase, frames) {
  edit(def => {
    let seen = false;
    const ks = def.moves[n].keys.filter(k => (k.active ? (seen = true, 'active') : seen ? 'recovery' : 'startup') === phase), cur = ks.reduce((s, k) => s + k.d, 0);
    if (cur > 0 && frames > 0) for (const k of ks) k.d = +(k.d * frames / 60 / cur).toFixed(4);
  });
}
let peek = null; // the hover preview: the move playing next to the cursor
function peekMove(n, e) {
  if (!peek || peek.n !== n) {
    peek?.el.remove();
    const cv = h('canvas'), el = h('div', { cls: 'peek' }, cv, h('span', { textContent: n })), m = currentChar().moves[n], ch = withWeapon(currentChar(), m), t0 = performance.now();
    peek = { n, el };
    document.body.append(el);
    const loop = now => { if (peek?.el !== el) return; if (!document.querySelector('.mtable')) return unpeek(); drawThumb(cv, ch, samplePose(ch, m, (now - t0) / 1000 % (total(m) + 0.3)), 120, 128); requestAnimationFrame(loop); };
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
      const m = ch.moves[n], tr = h('tr', { cls: anim.move === n ? 'on' : '', onclick: () => { anim.tscroll = wrap.scrollTop; anim.view = 'cards'; unpeek(); pickMove(n); },
        onmousemove: e => peekMove(n, e), onmouseleave: unpeek });
      tr.append(...TABLE_COLS.map((c, i) => {
        const td = h('td');
        if (c.prop || c.phase) {
          const p = c.prop || { min: 1, max: 120, step: 1 };
          td.append(h('input', { type: 'number', min: p.min, max: p.max, step: p.step, value: v[i], placeholder: c.k === 'damage' && m.power ? fmt(moveDamage(m)) : '',
            tip: `${n} · ${c.tip}`, onclick: e => e.stopPropagation(), onkeydown: e => e.stopPropagation(),
            onchange: e => { const x = parseFloat(e.target.value);
              if (c.phase) setPhase(n, c.k, x); else edit(def => { if (x) def.moves[n][c.k] = clamp(x, p.min, p.max); else delete def.moves[n][c.k]; });
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
  wrap.append(h('div', { cls: 'bar' }, filter, button(':close: editor', 'Back to the keyframe editor (cards view)', () => { anim.view = 'cards'; unpeek(); panels(); })),
    h('table', {}, h('thead', {}, head), body));
  requestAnimationFrame(() => { wrap.scrollTop = anim.tscroll || 0; });
  return wrap;
}
function moveList() {
  const list = h('div'), fill = () => {
    const ch = currentChar(), q = anim.filter.trim().toLowerCase(), fd = n => frameData(ch.moves[n], 1);
    const names = Object.keys(ch.moves).filter(n => !q || [n, MOVE_GROUPS[anim.group](ch.moves[n], ch, n), ...moveInputs(ch, n)].join(' ').toLowerCase().includes(q));
    const by = { name: (a, b) => a.localeCompare(b), startup: (a, b) => fd(a).startup - fd(b).startup, damage: (a, b) => moveDamage(ch.moves[b]) - moveDamage(ch.moves[a]) }[anim.sort];
    if (by) names.sort(by);
    const groups = new Map(), rank = g => (GROUP_ORDER.indexOf(g) + 1 || 99);
    for (const n of names) { const g = MOVE_GROUPS[anim.group](ch.moves[n], ch, n); groups.set(g, [...groups.get(g) || [], n]); }
    const tips = Object.fromEntries(names.map(n => { const m = ch.moves[n], d = fd(n);
      return [n, `${d.startup}f startup · ${d.active} active · ${d.recovery} recovery${m.power ? ` · ${fmt(moveDamage(m))} damage · ${m.height || 'mid'}` : ''} · input: ${moveInputs(ch, n).join(' ') || 'none'}`]; }));
    list.replaceChildren(...[...groups].sort((a, b) => rank(a[0]) - rank(b[0])).flatMap(([g, ns]) =>
      [g && h('h4', { textContent: g }), anim.view !== 'list' ? h('div', { cls: 'cards' }, ns.map(n => moveCard(n, tips[n])))
        : h('div', { cls: 'bar' }, seg(ns, () => anim.move, pickMove, tips))]));
    if (!names.length) list.replaceChildren(h('div', { cls: 'note', textContent: 'no move matches the filter' }));
    if (anim.view === 'table') list.replaceChildren(h('div', { cls: 'note', textContent: 'the move table is over the stage' }));
    syncAll();
  };
  fill();
  return [
    h('div', { cls: 'row', tip: 'How the moves are shown' }, h('span', { textContent: 'view' }), seg(Object.keys(VIEW_TIPS), () => anim.view, v => { anim.view = v; unpeek(); panels(); }, VIEW_TIPS)),
    adv(h('div', { cls: 'row', tip: 'How the moves are grouped' }, h('span', { textContent: 'group' }), seg(Object.keys(MOVE_GROUPS), () => anim.group, v => { anim.group = v; fill(); }, GROUP_TIPS))),
    adv(h('div', { cls: 'row', tip: 'Order within a group' }, h('span', { textContent: 'sort' }), seg(Object.keys(SORT_TIPS), () => anim.sort, v => { anim.sort = v; fill(); }, SORT_TIPS))),
    h('div', { cls: 'row', tip: 'Show only moves whose name, group or input contains this text (e.g. kick, air, qcf)' }, h('span', { textContent: 'filter' }),
      h('input', { cls: 'macro', value: anim.filter, placeholder: 'name, group or input', oninput: e => { anim.filter = e.target.value; fill(); }, onkeydown: e => e.stopPropagation() })),
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
  const head = heading('Moves', 'Pick a move to edit. Copies can be tuned freely; the built-in names are the ones the controls trigger.', 'Enter play/pause · O onion · I aim');
  head.append(crud({ copy: ['New move copied from this one, under a new name', copyMove], delete: ['Delete this move (only copies)', deleteMove] }));
  const loops = ['idle', 'walk'].filter(k => !currentChar().moves[loopName(currentChar(), studio.stance, k)]);
  return [...charPanel(),
    head,
    ...stanceRow(),
    ...moveList(),
    loops.length ? h('div', { cls: 'bar' }, loops.map(k => button(`:add: ${loopName(currentChar(), studio.stance, k)} loop`,
      `A keyframed ${k} loop for the ${currentChar().stances[studio.stance].name} stance, made from the procedural ${k}, to edit like a move; it replaces the procedural ${k} in this stance (delete it to go back)`, () => makeLoop(k)))) : null,
    moveHeading(),
    h('div', { cls: 'row', tip: 'Striking bones: each end is a strike (in limb mode the whole bone); with several, the one that lands counts, one hit per target. Shift+click a joint in the editor to pick it, ⌘/Ctrl+Shift+click to add or remove it.' },
      h('span', { textContent: 'hit' }), h('span', { cls: 'bar' }, tipSeg, hitB)),
    h('div', { cls: 'row', tip: 'Which inputs start this move in a fight' }, h('span', { textContent: 'input' }), h('span', { cls: 'bar' }, bindB,
      button(':stadia_controller:', 'All inputs: which directions and buttons have no move, and what each one starts', () => { anim.view = 'inputs'; panels(); }, 'mini')),
      seg(['2d', '25'], () => CFG.plane === '2d' ? '2d' : '25', v => { setCfg({ plane: v === '2d' ? '2d' : 'lanes' }); panels(); mode().restart(); },
        { '2d': '2D moveset: ↑ jumps, air moves by direction (also sets the plane setting)', '25': '2.5D moveset (VF-style): every direction × button is a ground move, Space jumps (also sets the plane to lanes)' },
        v => v === '2d' ? '2D' : '2.5D')),
    h('div', { cls: 'row', tip: 'Where the move is aimed; a hit reaction still follows the actual impact point' }, h('span', { textContent: 'height' }),
      seg(['high', 'shigh', 'mid', 'smid', 'low'], () => m().height, v => setMove('height', v), HEIGHT_TIPS)),
    ...MOVE_PROPS.map(p => { const r = slider(p.k, p, () => m()[p.k] ?? p.def ?? 0, v => setMove(p.k, v === (p.def ?? 0) ? undefined : v, 'm.' + p.k), p.tip); return MOVE_BASIC.includes(p.k) ? r : adv(r); }),
    h('div', { cls: 'bar' }, Object.entries(MOVE_FLAGS).map(([f, tip]) => toggle(f, tip, () => !!m()[f], v => setMove(f, v || undefined)))),
    ...keyPanel(),
  ];
}

function animCtx() {
  return [grp('show', 'Overlays', toggle(':visibility:', 'Ghost: ' + SPEC.ghost.tip + ' (G)', () => CFG.ghost, v => { CFG.ghost = v; }),
    toggle(':check_box_outline_blank:', 'Boxes: ' + SPEC.boxes.tip + ' (B)', () => CFG.boxes, v => { CFG.boxes = v; }), colorsToggle()), compareGrp()];
}
const CMP_TIPS = { off: 'No comparison', overlay: 'The compared move drawn over this one in amber, at the same moment',
  strip: 'Filmstrip: this move and the compared one frame by frame on one time scale, tinted by phase (click a frame to go there)' };
function compareGrp() {
  const pick = button('', 'The move to compare with', () => pickCompare(pick));
  reg(pick, () => setRich(pick, `:theaters: ${cmpMove() ? anim.cmp : 'pick'}`));
  return grp('compare', 'Compare the move with another: drawn on top of each other or as two filmstrips', pick,
    seg(Object.keys(CMP_TIPS), () => anim.cmpView, v => { anim.cmpView = v; if (v === 'overlay' && !cmpMove()) pickCompare(pick); }, CMP_TIPS));
}
function pickCompare(anchor) {
  const ch = currentChar(), groups = new Map(), rank = g => (GROUP_ORDER.indexOf(g) + 1 || 99);
  for (const n of Object.keys(ch.moves)) { const g = MOVE_GROUPS[anim.group](ch.moves[n], ch, n); groups.set(g, [...groups.get(g) || [], n]); }
  const set = v => { anim.cmp = v; if (anim.cmpView === 'off') anim.cmpView = 'overlay'; closePop(); };
  popup(anchor, h('b', { textContent: 'compare with' }), ...[...groups].sort((a, b) => rank(a[0]) - rank(b[0]))
    .flatMap(([g, ns]) => [g && h('h4', { textContent: g }), h('div', { cls: 'bar' }, seg(ns, () => anim.cmp, set))]));
}

// controls over the canvas: transport and key edits above the timeline, the preview's target under the preview
function timelineBar() {
  const play = button('', 'Play / pause the move (Enter)', () => { anim.playing = !anim.playing; }, 'mini');
  reg(play, () => { setRich(play, anim.playing ? ':pause:' : ':play_arrow:'); });
  const frames = h('span', { cls: 'v', tip: 'Length of the selected key in 60 fps frames' }), fd = h('span', { cls: 'fd' });
  reg(frames, () => { frames.textContent = `${Math.round(curMove().keys[anim.key].d * 60)}f`; });
  reg(fd, () => { const d = frameData(curMove(), 1); fd.textContent = `${d.startup} · ${d.active} · ${d.recovery}f`;
    fd.dataset.tip = `Frame data (60 fps): ${d.startup} startup · ${d.active} active · ${d.recovery} recovery`; });
  const b = (l, tip, f) => button(l, tip, f, 'mini');
  return h('div', { cls: 'over tlbar' },
    b(':skip_previous:', 'First key', () => selectKey(0)), b(':chevron_left:', 'Previous key (Shift+←)', () => selectKey(anim.key - 1)),
    b(':fast_rewind:', 'Back one frame (,)', () => stepFrame(-1)), play, b(':fast_forward:', 'Forward one frame (.)', () => stepFrame(1)),
    b(':chevron_right:', 'Next key (Shift+→)', () => selectKey(anim.key + 1)), b(':skip_next:', 'Last key', () => selectKey(curMove().keys.length - 1)),
    h('span', { cls: 'sep' }),
    b(':add: key', 'Insert a key after the selected one, starting from its pose', addKey),
    b(':content_cut: split', 'Split the selected key in two at its middle (double-click a key: split it there)', () => splitKey(keyStart(curMove(), anim.key) + curMove().keys[anim.key].d / 2)),
    b(':delete:', 'Delete the selected key (Delete)', deleteKey),
    h('span', { cls: 'sep' }),
    b(':remove:', 'One frame shorter', () => keyFrames(-1)), frames, b(':add:', 'One frame longer', () => keyFrames(1)),
    h('span', { cls: 'sep' }),
    toggle(':layers:', 'Onion skin: ghosts of the previous (blue) and next (green) keys (O)', () => anim.onion, v => { anim.onion = v; }),
    toggle(':my_location:', 'Aim: the striking limb follows the cursor through IK; click to set the pose (I). Double-click any joint to make that one follow', () => anim.aim, v => { anim.aim = v; anim.aimId = null; }),
    seg(Object.keys(REACH_TIPS), () => anim.reach, v => { anim.reach = v; }, REACH_TIPS),
    fd);
}
function targetBar() {
  const tg = anim.target, set = (k, v) => { tg[k] = v; anim.t = 0; anim.playing = true; buildPreview(); };
  const who = button('', 'The target character in the preview', (e, b) =>
    popup(b, h('div', { cls: 'bar' }, seg([null, ...Object.keys(DEFS)], () => tg.char, v => { set('char', v); closePop(); }, { null: 'The character being edited' }, v => v ?? 'same'))), 'mini');
  reg(who, () => { setRich(who, ':person: ' + (tg.char && DEFS[tg.char] ? tg.char : 'same')); });
  const sg = (k, opts) => seg(opts, () => tg[k], v => set(k, v), TARGET_TIPS);
  return h('div', { cls: 'over tgt', tip: 'The target of the preview' }, who, sg('stance', Object.keys(STANCES)), sg('state', ['idle', 'air', 'down', 'dizzy']), sg('facing', ['toward', 'away']));
}

const animMode = {
  preview: () => anLayout().pv,
  enter() { if (!curMove()) anim.move = Object.keys(currentChar().moves)[0]; selectKey(Math.min(anim.key, curMove().keys.length - 1)); anim.playing = true; buildPreview(); },
  restart() { anim.t = 0; buildPreview(); },
  worlds: () => anim.hold ? [] : [anim.pv],
  tick(dt) {
    if (!anim.playing || anim.drag) return;
    const m = curMove();
    anim.t = (anim.t + dt * (m.power ? CFG.attackSpeed : 1)) % total(m);
    anim.key = keyAt(m, anim.t);
  },
  // scrub: mouse x = time through the move; the preview is re-simulated to the same moment
  scrub(f) { const m = curMove(); anim.playing = false; anim.t = f * (total(m) - 1e-6); anim.key = keyAt(m, anim.t); previewAt(anim.t); },
  changed() { if (anim.drag) previewAt(anim.t); else buildPreview(); },
  render() { clear(); drawAnimEditor(); drawTimeline(); drawCell({ w: anim.pv, label: 'preview (springs + hit stop)' }, anLayout().pv, { plot: false }); },
  ctxBar: animCtx,
  side: movePanel,
  open: ['character', 'moves', 'move', 'key'],
  overlay: () => anim.view === 'table' ? [moveTable()] : anim.view === 'inputs' ? [inputTable()] : [timelineBar(), targetBar()],
  mouse: animMouse,
  key: animKey,
  hint: () => 'drag a joint: IK · Alt+drag: one bone · timeline: click a key to select, drag it to reorder, drag its edge to retime, double-click to split, drag the ruler to scrub · , . frame step · Delete key',
};
