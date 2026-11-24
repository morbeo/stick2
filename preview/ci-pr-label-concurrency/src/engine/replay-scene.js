'use strict';
// ---------- scene: pose the paused frame by dragging joints, and place and move props on it ----------
// draw-only (Fighter.poseOverride, fighter.js): never touches the fight, so this works on any frame of any reel, or
// any movie shot. sceneWorld/sceneTarget pick which: the main reel (rp.view, rp.pose/rp.props) or, in the movie
// preview, the current shot's own world and its own pose/props (rp.movie.shots[i].pose/.props) - two different
// "scenes" sharing the exact same editing code and undo-key scheme
function sceneWorld() { return rp.playMovie ? rp.mv?.w : rp.view; }
function sceneTarget() {
  if (!rp.playMovie) return rp.reel ? rp : null;
  const sh = rp.movie.shots[rp.mv?.shotI]; if (!sh) return null;
  sh.pose ||= {}; sh.props ||= []; return sh;
}
// edits go through the same snapshot()-based undo stack as every other edit (studio.js): the main reel's scene gets
// its own 'scene' kind, a movie shot's reuses 'movie' (its pose/props already live inside rp.movie, movieEdit's own
// snapshot covers them for free). A key merges repeated calls (a drag, a slider) into one undo step, as elsewhere
function sceneEdit(fn, key = null) {
  if (rp.playMovie) { movieEdit(fn, key); return; }
  snapshot(() => ({ scene: JSON.stringify({ pose: rp.pose, props: rp.props }) }), key);
  fn(); panels();
}
function sceneToWorld(x, y) { const v = sceneWorld()?.view || { s: 1, ox: 0, oy: 0 }; return [(x - v.ox) / v.s, (y - v.oy) / v.s]; }
function scenePickBone(x, y) {
  const w = sceneWorld(); if (!w) return null;
  const [wx, wy] = sceneToWorld(x, y);
  let best = null, bd = 16 / (w.view?.s || 1);
  for (const f of w.fighters) { if (f.hidden) continue; const P = f.body();
    for (const id of f.ch.ids) { const d = Math.hypot(P[id][0] - wx, P[id][1] - wy); if (d < bd) { bd = d; best = { f, id }; } }
  }
  return best;
}
// same inverse-FK as creator.js's dragTo (drag a joint toward a world point), but through a live fighter: fk's own wa
// output gives the parent's accumulated world angle, and f.xs (get xs, fighter.js) is the dir fk() mirrors angles by
function scenePoseDrag(f, id) {
  sceneEdit(() => {
    const t = sceneTarget(); if (!t) return;
    const [wx, wy] = sceneToWorld(rp.mx, rp.my), pose = { ...f.disp, ...t.pose[f.id] }, wa = {};
    fk(f.ch, pose, f.xs, f.lens, wa);
    const b = f.ch.by[id], pb = f.ch.by[b.parent], P = f.body(), pp = P[b.parent] || P.hip, pw = pb ? wa[pb.id] : 0;
    const w = Math.atan2((wx - pp[0]) * f.xs, wy - pp[1]) / R;
    t.pose[f.id] ||= {}; t.pose[f.id][id] = Math.round(w - pw + b.level * (pw - (pb ? pb.restW : 0)));
  }, 'scene-pose:' + f.id + ':' + id);
}
function scenePickProp(x, y) {
  const w = sceneWorld(), t = sceneTarget(); if (!w || !t) return null;
  const [wx, wy] = sceneToWorld(x, y);
  for (let i = t.props.length - 1; i >= 0; i--) { const p = t.props[i], gy = w.groundY - p.lift; if (Math.hypot(p.x - wx, gy - wy) < 26) return i; }
  return null;
}
function sceneAddProp(type) { sceneEdit(() => { const t = sceneTarget(), w = sceneWorld(); if (!t) return; t.props.push({ type, x: w ? w.cam : 400, lift: 0, a: 0 }); rp.propSel = t.props.length - 1; }); }
function scenePropMove(i, x) { sceneEdit(() => { const t = sceneTarget(); if (t) t.props[i].x = Math.round(x); }, 'scene-prop-x:' + i); }
function scenePropSet(i, patch, key) { sceneEdit(() => { const t = sceneTarget(); if (t) Object.assign(t.props[i], patch); }, key); }
function scenePropDelete(i) { sceneEdit(() => { const t = sceneTarget(); if (!t) return; t.props.splice(i, 1); if (rp.propSel === i) rp.propSel = null; }); }
function sceneDrawProps(ctx, r) {
  const w = sceneWorld(), t = sceneTarget(); if (!w || !t || !t.props.length) return;
  const { s, ox, oy } = w.view || { s: 1, ox: 0, oy: 0 }, gy = w.groundY;
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); ctx.transform(s, 0, 0, s, ox, oy);
  t.props.forEach((p, i) => {
    const pt = PROPS[p.type]; if (!pt) return;
    ctx.save(); ctx.translate(p.x, gy - p.lift); ctx.rotate(p.a * R);
    drawShapes(ctx, pt.shapes, (x, y) => [x, y], c => c || '#888', { sway: 0 });
    if (i === rp.propSel) { ctx.strokeStyle = RED[0]; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -pt.h / 2, pt.h / 2 + 6, 0, 7); ctx.stroke(); }
    ctx.restore();
  });
  ctx.restore();
}
function sceneSide() {
  const names = Object.keys(PROPS), w = sceneWorld(), t = sceneTarget(), f0 = w?.fighters[0];
  if (!t) return [];
  return [heading('scene', `Pose either fighter on the paused frame by dragging a joint, and place props from the catalog. Draw-only: never saved with the replay, never touches the fight. Undo (⌘Z) covers every edit here.${rp.playMovie ? ' Editing this shot only.' : ''}`, ''),
    h('div', { cls: 'bar' }, toggle(':accessibility_new: pose', 'Drag a joint on either fighter to pose this frame', () => rp.poseOn, v => { rp.poseOn = v; rp.propSel = null; panels(); }),
      button(':restart_alt: reset pose', 'Clear every pose edit', () => sceneEdit(() => { t.pose = {}; }))),
    f0 && Object.keys(t.pose).length ? h('div', { cls: 'bar' }, h('span', { textContent: 'save as' }),
      h('input', { type: 'text', placeholder: 'pose name', style: 'width:100px', onkeydown: e => {
        if (e.key !== 'Enter' || !e.target.value.trim()) return;
        snapshotPose(e.target.value.trim(), f0.ch, { ...f0.disp, ...t.pose[f0.id] }); e.target.value = ''; panels();
      } })) : null,
    h('div', { cls: 'bar' }, h('span', { textContent: 'add prop' }),
      ...names.map(n => button(n, PROPS[n].tip || n, () => sceneAddProp(n), 'mini'))),
    ...t.props.map((p, i) => h('div', { cls: 'bar' + (i === rp.propSel ? ' on' : '') },
      button(p.type, 'Click to select, drag it on the scene to move', () => { rp.propSel = i; rp.poseOn = false; panels(); }, 'mini'),
      h('span', { textContent: 'x' }), numInput(p.x, v => scenePropMove(i, v), 'x', 55),
      h('span', { textContent: 'rotate' }), slider('a', { min: -180, max: 180, step: 5 }, () => p.a, v => scenePropSet(i, { a: v }, 'scene-prop-a:' + i), 'rotate'),
      numInput(p.a, v => scenePropSet(i, { a: v }, 'scene-prop-a:' + i), 'rotate', 45),
      crud({ delete: ['Remove this prop', () => scenePropDelete(i)] }))),
  ];
}
// the timeline's mouse: the minimap moves the window, a fighter's name folds it, the ruler and fighter rows seek; in the lanes a click
// picks an event (⌘ / ⇧ more) and goes there, dragging selected inputs retimes them (a held span's ends: resize), dragging from empty
// space selects what the box covers and a plain click there seeks
function rpMouse(type, x, y, e) {
  if (!rp.reel) return;
  const L = rpLayout(), inTl = y >= L.tl.y, inMini = inTl && y < L.ruler, d = rp.drag;
  rp.mx = x; rp.my = y;
  const toMini = () => { const span = rp.v[1] - rp.v[0], t = (x - L.tx) / L.tw * rpEnd(); rpView(t - span / 2, t + span / 2); };
  if (type === 'down' && !inTl && (!rp.playMovie || rp.mv?.w)) {
    if (rp.poseOn) { const hit = scenePickBone(x, y); if (hit) { rp.drag = { pose: hit }; scenePoseDrag(hit.f, hit.id); } return; }
    const pi = scenePickProp(x, y);
    if (pi !== null) { rp.propSel = pi; rp.drag = { prop: pi }; panels(); return; }
  }
  if (type === 'down' && inTl) {
    const ev = eventAt(L, x, y), r = rowAt(L, y);
    if (inMini) { rp.drag = { mini: true }; toMini(); }
    else if (r?.l && x < L.tx) rp.fold[rp.fold.has(r.l.id) ? 'delete' : 'add'](r.l.id);
    else if (r?.kind === 'type' && x < L.tx) { rp.show[rp.show.has(r.type) ? 'delete' : 'add'](r.type); syncAll(); } // a lane's name shows / hides its type
    else if (r?.kind === 'foot' && x >= L.tx) { if (!footMouse(L, r, x, e)) { rp.drag = { seek: true }; rpSeek(frameAt(snapT(L, x, e))); } }
    else if (r?.kind === 'type' && x >= L.tx && ev) {
      pickEvent(ev, e); rp.scrollTo = ev.i;
      const near = f => f !== undefined && Math.abs(x - tToX(L, rp.T[f])) < 4 * dpr, edge = ev.kind === 'held' ? near(ev.f) ? 'start' : near(ev.end) ? 'end' : null : null;
      rp.drag = { ev, f0: nearFrame(xToT(L, x)), d: 0, edge, move: ev.type === 'input' && ev.kind !== 'macro' && !e.metaKey && !e.ctrlKey && !e.shiftKey };
    } else if (r?.kind === 'type' && x >= L.tx) rp.drag = { box: { x0: x, y0: y, x, y }, add: e.shiftKey || e.metaKey || e.ctrlKey };
    else if (x >= L.tx) { rp.drag = { seek: true }; rpSeek(frameAt(snapT(L, x, e))); }
    return;
  }
  if (type === 'up') {
    rp.drag = null;
    if (d?.span && (d.span.a !== d.a || d.span.b !== d.b)) { const now = { a: d.span.a, b: d.span.b }; Object.assign(d.span, { a: d.a, b: d.b }); snapshot(() => ({ reel: d.snap }), null); Object.assign(d.span, now); }
    if (d?.ev) {
      if (d.move && d.d) reelEdit(() => shiftInputs(d.d, d.edge));
      else if (!e.metaKey && !e.ctrlKey && !e.shiftKey) { rpSeek(d.ev.f); app.paused = true; }
    }
    if (d?.box) {
      const b = d.box, [x0, x1] = [Math.min(b.x0, b.x), Math.max(b.x0, b.x)], [y0, y1] = [Math.min(b.y0, b.y), Math.max(b.y0, b.y)];
      if (!d.add) rp.sel.clear();
      if (x1 - x0 < 3 * dpr && y1 - y0 < 3 * dpr) { rpSeek(frameAt(xToT(L, b.x0))); return; }
      const rows = L.rows.filter(r => r.kind === 'type' && r.y + r.h > y0 && r.y < y1).map(r => r.type);
      for (const ev of rp.events) if (rows.includes(ev.type)) { const a = tToX(L, rp.T[ev.f]), z = ev.end !== undefined ? tToX(L, rp.T[ev.end]) : a; if (z >= x0 && a <= x1) rp.sel.add(ev.i); }
    }
    return;
  }
  if (d?.pose) return scenePoseDrag(d.pose.f, d.pose.id);
  if (d?.prop != null) { const [wx] = sceneToWorld(x, y); rp.props[d.prop].x = wx; return; }
  if (d?.mini) return toMini();
  if (d?.span) return footDrag(L, x);
  if (d?.seek) return rpSeek(frameAt(snapT(L, x, e)));
  if (d?.ev) { if (d.move) d.d = nearFrame(xToT(L, x)) - d.f0; return; }
  if (d?.box) { Object.assign(d.box, { x, y }); return; }
  rp.hover = inTl ? eventAt(L, x, y) : null;
  const fr = inTl && rowAt(L, y)?.kind === 'foot' && x >= L.tx && footHover(L, x);
  if (fr) { canvas.dataset.tip = fr.tip; cursor(fr.cursor); return; }
  const tip = inTl && rpTip(L, x, y);
  if (tip) canvas.dataset.tip = tip; else delete canvas.dataset.tip;
  const r = inTl && rowAt(L, y), edge = rp.hover?.kind === 'held' && rp.sel.has(rp.hover.i) && [rp.hover.f, rp.hover.end].some(f => Math.abs(x - tToX(L, rp.T[f])) < 4 * dpr);
  cursor(inMini ? 'ew-resize' : edge ? 'ew-resize' : rp.hover?.type === 'input' && rp.sel.has(rp.hover.i) ? 'grab' : rp.hover || (r && r.kind !== 'type' && x < L.tx) ? 'pointer'
    : r?.kind === 'type' ? 'crosshair' : inTl && x >= L.tx ? 'col-resize' : 'default');
}
// wheel over the timeline: zoom around the mouse; Shift (or a sideways swipe): pan
function rpWheel(dy, e) {
  if (!rp.reel) return false;
  const L = rpLayout();
  if (rp.my < L.tl.y) return false;
  const span = rp.v[1] - rp.v[0], dx = e.shiftKey ? dy : e.deltaX || 0;
  if (dx) rpView(rp.v[0] + dx / L.tw * dpr * span, rp.v[1] + dx / L.tw * dpr * span);
  else rpZoom(Math.exp(dy * 0.002), xToT(L, Math.max(rp.mx, L.tx)));
  return true;
}
// jumps: the previous / next shown event (or bookmark) from the playhead
function rpJump(dir, marks) {
  const fs = marks ? rp.reel.rep.marks.map(m => m.f) : shownEvents().map(e => e.f);
  const f = dir > 0 ? Math.min(...fs.filter(f => f > rp.n)) : Math.max(...fs.filter(f => f < rp.n));
  if (!isFinite(f)) return;
  rpSeek(f); app.paused = true; rpFollow();
  const e = rp.events.find(e => e.f === f && (marks ? e.kind === 'mark' : rp.show.has(e.type)));
  if (e) { rp.sel = new Set([e.i]); rp.scrollTo = e.i; }
}
async function addMark() {
  if (!rp.reel) return;
  const marks = rp.reel.rep.marks, f = rp.n, name = await askText(`Bookmark at ${fmtT(rp.T[f])}`, `mark ${marks.length + 1}`);
  if (name === null) return;
  marks.push({ f, name: name || `mark ${marks.length + 1}` }); marks.sort((a, b) => a.f - b.f);
  rebuildEvents(); panels();
}
