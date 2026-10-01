'use strict';
// ---------- animate mode: pose keyframes by dragging joints (IK), retime them on a frame timeline, preview with springs ----------
const anim = { move: 'jab', key: 1, t: 0, playing: true, onion: true, aim: false, drag: null, hover: null, anchor: null, pv: null, hold: false };
const curMove = () => currentChar().moves[anim.move];
const defMove = () => DEFS[CURRENT].moves[anim.move];
const F = 1 / 60; // one frame
const total = m => m.keys.reduce((s, k) => s + k.d, 0);
const keyStart = (m, i) => m.keys.slice(0, i).reduce((s, k) => s + k.d, 0);
const keyEnd = (m, i) => keyStart(m, i + 1);
const keyAt = (m, t) => { let i = 0; while (i < m.keys.length - 1 && t >= keyEnd(m, i)) i++; return i; };

// the keyframe layer of move m at time t: eased from the stance, key by key (what the springs then chase)
function samplePose(ch, m, t) {
  const base = ch.poses.stance;
  let from = base;
  for (const k of m.keys) {
    const to = resolve(base, k.p);
    if (t < k.d) {
      const e = EASE[CFG.easing === 'authored' ? k.e || 'linear' : CFG.easing](t / k.d), p = {};
      for (const j of ch.ids) p[j] = from[j] + (to[j] - from[j]) * e;
      return p;
    }
    t -= k.d; from = to;
  }
  return from;
}
const keyPose = (ch, m, i) => resolve(ch.poses.stance, m.keys[i].p);

// ---------- layout and view ----------
function anLayout() {
  const ew = Math.round(canvas.width * 0.58), th = 86 * dpr;
  return { ed: { x: 0, y: 0, w: ew, h: canvas.height - th }, tl: { x: 8 * dpr, y: canvas.height - th + 4 * dpr, w: ew - 16 * dpr, h: th - 12 * dpr },
    pv: { x: ew, y: 0, w: canvas.width - ew, h: canvas.height } };
}
// the pose at the playhead; while dragging, the hips stay where they were so the body doesn't slide under the cursor
function anFrame() {
  const ch = currentChar(), r = anLayout().ed, s = Math.min(r.h / 170, r.w / 150), ground = r.y + r.h * 0.86;
  const pose = samplePose(ch, curMove(), anim.t), wa = {}, L = fk(ch, pose, 1, null, wa);
  if (!anim.drag) {
    let low = 0;
    for (const b of ch.bones) low = Math.max(low, L[b.id][1] + (b.shape === 'circle' ? b.len : 0));
    anim.anchor = [r.x + r.w * 0.45, ground - low * s];
  }
  const o = anim.anchor, toScreen = p => [o[0] + p[0] * s, o[1] + p[1] * s];
  return { ch, r, s, o, pose, L, P: mapVals(L, toScreen), wa, ground, toLocal: (x, y) => [(x - o[0]) / s, (y - o[1]) / s] };
}

function drawAnimEditor() {
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
  drawFigure(ctx, ch, L, INK[0], INK[1], 0, roleTint());
  const hb = ch.by[m.hit];
  if (hb && m.keys[ki].active) { // the strike: red joint, radius = hitR
    const e = L[hb.id];
    ctx.fillStyle = 'rgba(192,57,43,.35)'; ctx.beginPath(); ctx.arc(e[0], e[1], Math.max(2.5, CFG.hitR), 0, 7); ctx.fill();
  }
  ctx.restore();
  const editing = Math.abs(anim.t - keyEnd(m, anim.key)) < 1e-6;
  for (const b of ch.bones) {
    const p = P[b.id], hov = b.id === anim.hover || b.id === anim.drag, hit = b.id === m.hit;
    ctx.beginPath(); ctx.arc(p[0], p[1], (hov ? 5.5 : 4) * dpr, 0, 7);
    ctx.fillStyle = hov ? '#ffd' : '#fff'; ctx.fill();
    ctx.strokeStyle = hit ? RED[0] : '#555'; ctx.lineWidth = (hit ? 2.5 : 1.5) * dpr; ctx.stroke();
  }
  const hv = ch.by[anim.drag || anim.hover];
  if (hv) text(`${hv.id} ${Math.round(f.pose[hv.id])}°`, Math.min(P[hv.id][0] + 10 * dpr, r.x + r.w - 120 * dpr), P[hv.id][1] - 8 * dpr, '#666', 11);
  text(`${anim.move} · key ${anim.key + 1}/${m.keys.length}${editing ? '' : ' (drag a joint to jump to the selected key)'}`, r.x + 10 * dpr, r.y + 18 * dpr, '#444', 12, 'bold');
  text(anim.aim ? 'aim: the striking limb follows the cursor · click to set' : 'drag: IK · Alt+drag: rotate one bone', r.x + 10 * dpr, r.y + 34 * dpr, '#999', 11);
}

// timeline: ruler (scrub) on top, one block per key (width = frames, red = active); drag a block's right edge to retime
function drawTimeline() {
  const r = anLayout().tl, m = curMove(), T = total(m), px = r.w / T, rh = 16 * dpr;
  ctx.fillStyle = '#fbfaf6'; ctx.fillRect(r.x, r.y, r.w, r.h);
  for (let i = 0; i <= Math.round(T * 60); i++) {
    const x = r.x + i * F * px, big = i % 5 === 0;
    ctx.fillStyle = big ? '#aaa' : '#ddd'; ctx.fillRect(x, r.y + (big ? 4 : 9) * dpr, dpr, (big ? 12 : 7) * dpr);
    if (i % 10 === 0 && i) text(String(i), x + 2 * dpr, r.y + 12 * dpr, '#aaa', 9);
  }
  m.keys.forEach((k, i) => {
    const x = r.x + keyStart(m, i) * px, w = k.d * px, y = r.y + rh + 4 * dpr, h = r.h - rh - 6 * dpr;
    ctx.fillStyle = k.active ? '#e0998f' : '#e4ded2'; ctx.fillRect(x + dpr, y, w - 2 * dpr, h);
    if (i === anim.key) { ctx.strokeStyle = '#222'; ctx.lineWidth = 2 * dpr; ctx.strokeRect(x + 2 * dpr, y + dpr, w - 4 * dpr, h - 2 * dpr); }
    ctx.fillStyle = '#888'; ctx.fillRect(x + w - 3 * dpr, y + h * 0.3, 2 * dpr, h * 0.4); // resize grip
    text(`${Math.round(k.d * 60)}f`, x + 5 * dpr, y + 14 * dpr, '#444', 11, 'bold');
    if (w > 60 * dpr) text(`${k.e || 'linear'}${k.p ? '' : ' → stance'}`, x + 5 * dpr, y + 28 * dpr, '#888', 9);
    if (k.inv) text('inv', x + 5 * dpr, y + h - 5 * dpr, '#2c6fb0', 9, 'bold');
  });
  // the cancel window: a purple bar from the key it opens at to the end
  const cx = r.x + keyStart(m, m.cancel) * px;
  ctx.fillStyle = '#8e44ad'; ctx.fillRect(cx, r.y + rh + dpr, r.x + r.w - cx, 3 * dpr);
  const x = r.x + anim.t * px;
  ctx.fillStyle = '#222'; ctx.fillRect(x - dpr, r.y, 2 * dpr, r.h);
  const fd = frameData(m, 1);
  text(`${fd.startup}f startup · ${fd.active} active · ${fd.recovery} recovery · frame ${Math.round(anim.t * 60)}/${Math.round(T * 60)}`,
    r.x + r.w, r.y - 6 * dpr, '#888', 10, '', 'right');
}

// ---------- posing ----------
// joints the drag bends: the bone and up to two ancestors of the same role (dragging a hand bends the arm, not the spine)
// the bone and up to 2 ancestors of its role; locked bones are skipped (they turn with their parent)
function ikChain(ch, id, single) {
  const b0 = ch.by[id], c = [];
  if (single) { const u = unlockedAbove(ch, b0); return u ? [u] : []; }
  for (let b = b0; b && c.length < 3; b = ch.by[b.parent]) {
    if (b !== b0 && b.role !== b0.role && b0.role !== 'spine') break;
    if (!b.lock) c.push(b);
  }
  return c;
}
const limit = (b, v) => b.min === undefined ? v : clamp(v, b.min, b.max);
const wrap = d => ((d % 360) + 540) % 360 - 180;
// cyclic coordinate descent: turn each joint of the chain so the end of bone id points at the target (rig space)
function ik(ch, pose, id, target, chain, rounds = 12) {
  const ang = (p, q) => Math.atan2(q[0] - p[0], q[1] - p[1]) / R;
  for (let it = 0; it < rounds; it++) for (const b of chain) {
    const P = fk(ch, pose, 1), pv = P[b.parent || 'hip'];
    pose[b.id] = limit(b, pose[b.id] + wrap(ang(pv, target) - ang(pv, P[id])));
  }
  return pose;
}
function poseTo(id, x, y, single) {
  const f = anFrame(), ch = f.ch, chain = ikChain(ch, id, single), pose = ik(ch, { ...f.pose }, id, f.toLocal(x, y), chain, single ? 1 : 12);
  edit(def => {
    const k = def.moves[anim.move].keys[anim.key];
    k.p = k.p || {};
    for (const b of chain) k.p[b.id] = Math.round(pose[b.id] * 10) / 10;
  }, 'pose:' + anim.key + id);
}
function pickJoint(x, y) {
  const { ch, P } = anFrame();
  let best = null, bd = 12 * dpr;
  for (const b of ch.bones) { const d = Math.hypot(P[b.id][0] - x, P[b.id][1] - y); if (d < bd) { bd = d; best = b.id; } }
  return best;
}
function selectKey(i) {
  const m = curMove();
  anim.key = clamp(i, 0, m.keys.length - 1);
  anim.t = keyEnd(m, anim.key); anim.playing = false;
}

// ---------- preview: the real engine (springs, hit stop) playing the move against a dummy ----------
const pvScen = () => galleryScen(anim.move, !!curMove().air);
function buildPreview() { anim.pv = newWorld(pvScen()); }
// re-simulate the preview up to move time t (deterministic, so this is what the fight would show)
function previewAt(t) {
  const w = anim.pv, m = curMove();
  w.reset();
  for (let g = 0; g < 240 && w.a.action?.m !== m; g++) w.advance(F, NOIN);
  for (let i = 0; i < Math.round(t / CFG.attackSpeed * 60); i++) w.advance(F, NOIN);
}

// ---------- mouse ----------
function animMouse(type, x, y, e) {
  const L = anLayout(), m = curMove(), inTl = y >= L.tl.y - 4 * dpr && x < L.ed.w, tl = L.tl, px = tl.w / total(m);
  if (type === 'down') {
    if (anim.aim) { anim.aim = false; studio.lastKey = null; return; }
    if (inTl) {
      if (y < tl.y + 18 * dpr) { anim.drag = { scrub: true }; anim.playing = false; }
      else {
        const e = m.keys.findIndex((k, i) => Math.abs(x - tl.x - keyEnd(m, i) * px) < 6 * dpr); // grabbed a right edge?
        if (e >= 0) anim.drag = { key: e, x0: x, d0: m.keys[e].d, px };
        else selectKey(keyAt(m, (x - tl.x) / px));
      }
    } else {
      const id = pickJoint(x, y);
      if (id) { selectKey(anim.key); anFrame(); anim.drag = id; anim.hold = true; } // anFrame: re-anchor at the key pose before freezing
    }
  }
  if (type === 'move') {
    const d = anim.drag;
    if (d?.scrub) { anim.t = clamp((x - tl.x) / px, 0, total(m) - 1e-6); anim.key = keyAt(m, anim.t); }
    else if (d?.key !== undefined) {
      const frames = Math.max(1, Math.round((d.d0 + (x - d.x0) / d.px) * 60));
      edit(def => { def.moves[anim.move].keys[d.key].d = frames / 60; }, 'dur:' + d.key);
      anim.key = d.key; anim.t = keyEnd(curMove(), d.key);
    } else if (typeof d === 'string') poseTo(d, x, y, e.altKey);
    else if (anim.aim && x < L.ed.w && !inTl && curMove().hit) { if (!anim.playing) selectKey(anim.key); poseTo(curMove().hit, x, y, false); }
    else anim.hover = x < L.ed.w && !inTl ? pickJoint(x, y) : null;
    if (d?.scrub) previewAt(anim.t);
  }
  if (type === 'up' && anim.drag) {
    const posed = typeof anim.drag === 'string';
    anim.drag = null; anim.hold = false; studio.lastKey = null;
    if (posed) buildPreview();
  }
}
function animKey(e, a) {
  if (a === 'prevKey') { selectKey(anim.key - 1); return true; }
  if (a === 'nextKey') { selectKey(anim.key + 1); return true; }
  if (a === 'frameBack') { anim.playing = false; anim.t = Math.max(0, anim.t - F); anim.key = keyAt(curMove(), anim.t); previewAt(anim.t); return true; }
  if (a === 'frameFwd') { anim.playing = false; anim.t = Math.min(total(curMove()) - 1e-6, anim.t + F); anim.key = keyAt(curMove(), anim.t); previewAt(anim.t); return true; }
  if (a === 'playMove') { anim.playing = !anim.playing; return true; }
  if (a === 'onion') { anim.onion = !anim.onion; return true; }
  if (a === 'aim') { anim.aim = !anim.aim; return true; }
}

// ---------- key and move edits ----------
const setKey = (k, v, key = null) => edit(def => { def.moves[anim.move].keys[anim.key][k] = v; }, key);
const setMove = (k, v, key = null) => edit(def => { def.moves[anim.move][k] = v; }, key);
function keyFrames(delta) {
  edit(def => { const k = def.moves[anim.move].keys[anim.key]; k.d = Math.max(1, Math.round(k.d * 60) + delta) / 60; });
  selectKey(anim.key);
}
function addKey() {
  edit(def => {
    const keys = def.moves[anim.move].keys, k = keys[anim.key];
    keys.splice(anim.key + 1, 0, { d: 4 / 60, e: 'outQuad', p: clone(keyPose(currentChar(), curMove(), anim.key)) });
  });
  selectKey(anim.key + 1);
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
    for (const s in def.binds) if (def.binds[s] === gone) delete def.binds[s];
  });
  pickMove(anim.move);
}
// input slots (see BINDS): clicking one makes it trigger this move; clicking it again gives it back its default
const SLOT_TIPS = { punch: 'J standing', kick: 'K standing', downPunch: 'S+J crouching', downKick: 'S+K crouching',
  dashPunch: 'J while running forward', airPunch: 'J in the air', airKick: 'K in the air',
  qcfPunch: '↓↘→ J', qcfKick: '↓↘→ K', qcbPunch: '↓↙← J', qcbKick: '↓↙← K', dpPunch: '→↓↘ J', dpKick: '→↓↘ K' };
const boundSlots = () => Object.keys(BINDS).filter(s => currentChar().binds[s] === anim.move);
const toggleBind = s => edit(def => {
  def.binds ??= {};
  if (currentChar().binds[s] === anim.move) delete def.binds[s]; else def.binds[s] = anim.move;
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
  { k: 'stun', min: 0, max: 1, step: 0.02, tip: 'Hitstun (s): how long the victim cannot act. Shrinks along a combo.' },
];
const MOVE_FLAGS = {
  kd: 'Knockdown: the victim is launched, bounces and lies down.',
  air: 'Air move: performed while jumping, cancelled on landing.',
  inv: 'Invincible for the whole move (get-ups).',
  special: 'Special: normals that hit can be cancelled into it (if specialCancel is on).',
  otg: 'Off the ground: hits a fighter lying on the floor and pops it up (otg setting: flagged).',
  wide: 'Wide: in 2.5D it reaches 3× zReach in depth, so a sidestep does not dodge it.',
};

function keyPanel() {
  const title = heading('', 'The selected key: the pose reached at its end, how long it takes and how it eases. Drag joints in the editor to pose it.',
    'Shift+←/→ prev/next key · , / . step a frame · Enter play/pause');
  reg(title, () => { title.firstChild.textContent = `Key ${anim.key + 1} / ${curMove().keys.length}`; });
  const k = () => curMove().keys[anim.key], frames = h('span', { cls: 'v' });
  reg(frames, () => { frames.textContent = `${Math.round(k().d * 60)}f`; });
  return [title,
    h('div', { cls: 'bar' },
      button(':chevron_left:', 'Previous key (Shift+←)', () => selectKey(anim.key - 1)), button(':chevron_right:', 'Next key (Shift+→)', () => selectKey(anim.key + 1)),
      button(':add: key', 'Insert a key after this one, starting from its pose', addKey), button(':delete: delete', 'Delete this key', deleteKey),
      button(':accessibility_new: stance', 'This key returns to the stance (clears its pose)', () => setKey('p', null)),
      button('hold', 'Copy the previous key\'s pose (hold still)', () => setKey('p', clone(keyPose(currentChar(), curMove(), Math.max(0, anim.key - 1))))),
      button(':accessibility_new: pose', 'Start this key from a preset pose', (e, b) => popup(b, h('div', { cls: 'bar' }, Object.entries(POSES).map(([n, p]) =>
        button(n, p.tip, () => setKey('p', { ...keyPose(currentChar(), curMove(), anim.key), ...presetPose(currentChar(), p) }))))))),
    h('div', { cls: 'row', tip: 'Duration in 60 fps frames' }, h('span', { textContent: 'frames' }),
      h('span', { cls: 'bar' }, button('−', 'One frame shorter', () => keyFrames(-1)), frames, button(':add:', 'One frame longer', () => keyFrames(1)))),
    h('div', { cls: 'row', tip: 'Easing curve into this key\'s pose' }, h('span', { textContent: 'easing' }),
      seg(Object.keys(EASE), () => k().e || 'linear', v => setKey('e', v), EASE_TIPS)),
    h('div', { cls: 'row', tip: 'Active frames can hit' }, h('span', { textContent: 'active' }),
      toggle(':my_location: hits', 'Active: the strike can connect during this key', () => !!k().active, v => setKey('active', v || undefined))),
    h('div', { cls: 'row', tip: 'Cancel window and invincibility' }, h('span', { textContent: 'flags' }), h('span', { cls: 'bar' },
      toggle(':sync_alt: cancel', 'The cancel window opens at this key (chains, specials, jump). Unmarked: after the last active key.', () => !!k().cancel,
        v => edit(def => { def.moves[anim.move].keys.forEach((x, i) => { if (i === anim.key && v) x.cancel = true; else delete x.cancel; }); })),
      toggle(':block: inv', 'Invincible during this key (reversals like rising)', () => !!k().inv, v => setKey('inv', v || undefined)))),
    slider('lunge', { min: 0, max: 600, step: 10 }, () => k().lunge || 0, v => setKey('lunge', v || undefined, 'lunge'),
      'Forward speed given when this key starts (px/s): steps into the strike.'),
  ];
}
function movePanel() {
  const m = () => curMove(), hitB = button('', 'The bone whose end is the strike (and whose limb is tested in limb mode)', (e, b) =>
    popup(b, h('div', { cls: 'bar' }, seg(currentChar().ids, () => m().hit, v => setMove('hit', v)))));
  reg(hitB, () => { setRich(hitB, m().hit || 'none'); });
  const bindB = button('', 'Inputs that trigger this move. Click to bind it to other inputs (copies of moves become playable this way).', (e, b) =>
    popup(b, h('div', { cls: 'bar' }, Object.keys(BINDS).map(s => toggle(s, `${SLOT_TIPS[s]} · now: ${currentChar().binds[s]}`, () => currentChar().binds[s] === anim.move, () => toggleBind(s))))));
  reg(bindB, () => { setRich(bindB, boundSlots().join(' ') || 'none (combo only)'); });
  return [...charPanel(),
    heading('Moves', 'Pick a move to edit. Copies can be tuned freely; the built-in names are the ones the controls trigger.', 'Enter play/pause · O onion · I aim'),
    h('div', { cls: 'bar' }, seg(Object.keys(currentChar().moves), () => anim.move, pickMove)),
    h('div', { cls: 'bar' }, button(':content_copy: copy', 'Duplicate this move under a new name', copyMove),
      button(':delete: delete', 'Delete this move (only copies)', deleteMove)),
    ...keyPanel(),
    heading('Move', 'What happens on hit. Frame data (60 fps) is under the timeline.', ''),
    h('div', { cls: 'row', tip: 'Striking bone' }, h('span', { textContent: 'hit' }), hitB),
    h('div', { cls: 'row', tip: 'Which inputs start this move in a fight' }, h('span', { textContent: 'input' }), bindB),
    h('div', { cls: 'row', tip: 'Where the move is aimed; a hit reaction still follows the actual impact point' }, h('span', { textContent: 'height' }),
      seg(['high', 'mid', 'low'], () => m().height, v => setMove('height', v), { high: 'Aimed at the head', mid: 'Aimed at the body', low: 'Aimed at the legs: no upward push' })),
    ...MOVE_PROPS.map(p => slider(p.k, p, () => m()[p.k] || 0, v => setMove(p.k, v || undefined, 'm.' + p.k), p.tip)),
    h('div', { cls: 'bar' }, Object.entries(MOVE_FLAGS).map(([f, tip]) => toggle(f, tip, () => !!m()[f], v => setMove(f, v || undefined)))),
  ];
}

function animCtx() {
  const play = button('', 'Play / pause the move (Enter)', () => { anim.playing = !anim.playing; });
  reg(play, () => { setRich(play, anim.playing ? ':pause: move' : ':play_arrow: move'); });
  return [play,
    button(':skip_previous:', 'First key', () => selectKey(0)), button(':skip_next:', 'Last key', () => selectKey(curMove().keys.length - 1)),
    toggle(':layers: onion', 'Ghosts of the previous (blue) and next (green) keys (O)', () => anim.onion, v => { anim.onion = v; }),
    toggle(':my_location: aim', 'The striking limb follows the cursor through IK; click to set the pose (I)', () => anim.aim, v => { anim.aim = v; }),
    toggle(':visibility: ghost', SPEC.ghost.tip, () => CFG.ghost, v => { CFG.ghost = v; }),
    toggle(':check_box_outline_blank: boxes', SPEC.boxes.tip, () => CFG.boxes, v => { CFG.boxes = v; }), colorsToggle()];
}

const animMode = {
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
  mouse: animMouse,
  key: animKey,
  hint: () => 'drag a joint: IK · Alt+drag: one bone · timeline: click key, drag edge to retime, drag ruler to scrub · , . frame step',
};
