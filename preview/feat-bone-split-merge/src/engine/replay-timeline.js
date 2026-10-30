'use strict';
// ---------- layout: the fight on top (beside the event table when open), the timeline under it ----------
// the timeline: a minimap of the whole fight, the ruler, then rows: per fighter its health and stun curves (with combo bands) and its
// frame-meter strip (folded: the strip only), then a lane per shown event type. Wheel zooms, Shift+wheel pans, the minimap moves the window
const RP_LABEL = 92, MINI = 12, RULER = 18, PRESS_COLS = { P: '#c0392b', K: '#2c6fb0', S: '#8e44ad', jump: '#27ae60' };
// a lane for every type the replay has, shown or not, so hiding one never resizes the timeline (a hidden lane stays, greyed and empty)
function rpLanes() { const has = new Set(rp.events.map(e => e.type)); return Object.keys(EVENT_TYPES).filter(t => has.has(t)); }
function rpRows() {
  const rows = [];
  for (const l of Object.values(rp.lanes).slice(0, 6)) rows.push(...rp.fold.has(l.id) ? [] : [{ kind: 'hp', l, h: 26 }], { kind: 'meter', l, h: 6 });
  rows.unshift({ kind: 'foot', h: 19 });
  for (const t of rpLanes()) rows.push({ kind: 'type', type: t, h: t === 'input' ? 22 : 14 });
  return rows;
}
function rpLayout() {
  const W = canvas.width, H = canvas.height, rows = rpRows(), top = (MINI + RULER + 4) * dpr;
  let y = 0;
  for (const r of rows) { r.y = y; r.h *= dpr; y += r.h + dpr; }
  const th = Math.min(H * 0.55, top + y + 6 * dpr), tl = { x: 8 * dpr, y: H - th, w: W - 16 * dpr, h: th };
  for (const r of rows) r.y += tl.y + top;
  return { tl, rows, mini: { y: tl.y + 2 * dpr, h: (MINI - 2) * dpr }, ruler: tl.y + MINI * dpr, tx: tl.x + RP_LABEL * dpr, tw: tl.w - RP_LABEL * dpr,
    pv: { x: 0, y: 0, w: stageOpen() === 'events' ? Math.round(W * 0.55) : W, h: H - th - 6 * dpr } };
}
const rpEnd = () => rp.T[rp.N] || 1;
const tToX = (L, t) => L.tx + (t - rp.v[0]) / (rp.v[1] - rp.v[0]) * L.tw;
const xToT = (L, x) => clamp(rp.v[0] + (x - L.tx) / L.tw * (rp.v[1] - rp.v[0]), 0, rpEnd());
const miniX = (L, t) => L.tx + t / rpEnd() * L.tw;
// the shown window: at least a fifth of a second, inside the fight
function rpView(v0, v1) {
  const end = rpEnd(), span = clamp(v1 - v0, Math.min(0.2, end), end);
  v0 = clamp(v0, 0, end - span); rp.v = [v0, v0 + span];
}
const rpZoom = (k, t) => rpView(t - (t - rp.v[0]) * k, t + (rp.v[1] - t) * k);
// the window follows the playhead while playing
function rpFollow() { const t = rp.T[rp.n], span = rp.v[1] - rp.v[0]; if (t > rp.v[1] || t < rp.v[0]) rpView(t - span * 0.1, t + span * 0.9); }
// a step for the ruler's labels: at least 70 px apart (single frames when zoomed in far)
const rulerStep = L => [1 / 60, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find(s => s / (rp.v[1] - rp.v[0]) * L.tw >= 70 * dpr) || 120;
const rowAt = (L, y) => L.rows.find(r => y >= r.y && y < r.y + r.h + dpr);

function drawRpTimeline() {
  const L = rpLayout(), { tl } = L;
  ctx.fillStyle = '#ebe6dc'; ctx.fillRect(tl.x, tl.y, tl.w, tl.h);
  // minimap: every shown event as a line in its colour over the whole fight, the window as a box
  ctx.fillStyle = '#ddd6c8'; ctx.fillRect(L.tx, L.mini.y, L.tw, L.mini.h);
  for (const e of rp.events) if (rp.show.has(e.type)) { ctx.fillStyle = EVENT_TYPES[e.type][0]; ctx.fillRect(miniX(L, rp.T[e.f]), L.mini.y + 2 * dpr, dpr, L.mini.h - 4 * dpr); }
  ctx.strokeStyle = '#333'; ctx.lineWidth = dpr; ctx.strokeRect(miniX(L, rp.v[0]), L.mini.y, Math.max(2 * dpr, miniX(L, rp.v[1]) - miniX(L, rp.v[0])), L.mini.h);
  ctx.fillStyle = RED[0]; ctx.fillRect(miniX(L, rp.T[rp.n]), L.mini.y, dpr, L.mini.h);
  text('whole fight', tl.x + 2 * dpr, L.mini.y + 8 * dpr, '#999', 9);
  ctx.save(); ctx.beginPath(); ctx.rect(L.tx, tl.y, L.tw, tl.h); ctx.clip();
  const st = rulerStep(L);
  for (let k = Math.floor(rp.v[0] / st) * 5; k * st / 5 <= rp.v[1] + 1e-9; k++) { // ruler: a tick each fifth of a step, a label each step
    const t = k * st / 5, x = tToX(L, t), big = k % 5 === 0;
    ctx.fillStyle = big ? '#999' : '#ccc'; ctx.fillRect(x, L.ruler, dpr, big ? 8 * dpr : 4 * dpr);
    if (big) text(st < 0.05 ? `f${frameAt(t + 1e-6)}` : +t.toFixed(2) + 's', x + 3 * dpr, L.ruler + 15 * dpr, '#888', 10);
  }
  for (const m of rp.reel.rep.marks) { // bookmarks: a flag on the ruler and a line down
    const x = tToX(L, rp.T[m.f]); ctx.fillStyle = EVENT_TYPES.meta[0];
    ctx.fillRect(x, L.ruler, dpr, tl.y + tl.h - L.ruler);
    ctx.beginPath(); ctx.moveTo(x, L.ruler); ctx.lineTo(x + 8 * dpr, L.ruler + 4 * dpr); ctx.lineTo(x, L.ruler + 8 * dpr); ctx.fill();
    text(m.name, x + 10 * dpr, L.ruler + 8 * dpr, EVENT_TYPES.meta[0], 9, 'bold');
  }
  ctx.restore();
  L.rows.forEach((r, i) => {
    if (i % 2) { ctx.fillStyle = '#0000000a'; ctx.fillRect(tl.x, r.y, tl.w, r.h); }
    if (r.kind === 'type') drawTypeRow(L, r); else if (r.kind === 'foot') drawFootRow(L, r); else drawFighterRow(L, r);
  });
  drawTrim(L);
  const px = tToX(L, rp.T[rp.n]); // the playhead
  if (px >= L.tx - 1 && px <= L.tx + L.tw + 1) {
    ctx.fillStyle = RED[0]; ctx.fillRect(px - dpr, L.ruler, 2 * dpr, tl.y + tl.h - L.ruler);
    const lbl = `${fmtT(rp.T[rp.n])} · f${rp.n}`, lw = (lbl.length * 6.5 + 8) * dpr, lx = Math.min(px + 4 * dpr, tl.x + tl.w - lw);
    ctx.fillRect(lx, L.ruler, lw, 14 * dpr); text(lbl, lx + 4 * dpr, L.ruler + 11 * dpr, '#fff', 10, 'bold');
  }
  const b = rp.drag?.box;
  if (b) { ctx.strokeStyle = '#333'; ctx.lineWidth = dpr; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.strokeRect(b.x0, b.y0, b.x - b.x0, b.y - b.y0); ctx.setLineDash([]); }
}
// a fighter's rows: health (its colour) and stun (dashed orange) across the window, with bands where it took a combo; the frame-meter strip
function drawFighterRow(L, r) {
  const l = r.l, step = 2 * dpr, at = x => frameAt(xToT(L, x));
  if (r.kind === 'hp' || rp.fold.has(l.id)) text(`${rp.fold.has(l.id) ? '▸' : '▾'} ${who(l.id)} ${l.name}`, L.tl.x + 2 * dpr, r.y + (r.kind === 'hp' ? 11 : 6) * dpr, l.col, 10, 'bold');
  ctx.save(); ctx.beginPath(); ctx.rect(L.tx, r.y, L.tw, r.h); ctx.clip();
  if (r.kind === 'meter') {
    for (let x = L.tx; x < L.tx + L.tw; x += step) { const c = METER_COLS[l.fs[at(x)]]; if (c) { ctx.fillStyle = c; ctx.fillRect(x, r.y, step, r.h); } }
  } else {
    for (const e of rp.events) if (e.kind === 'combo' && e.data.vic === l.id) {
      const x0 = tToX(L, rp.T[e.f]), x1 = tToX(L, rp.T[e.end]);
      ctx.fillStyle = '#c0392b26'; ctx.fillRect(x0, r.y, Math.max(2 * dpr, x1 - x0), r.h);
      if (x1 - x0 > 40 * dpr) text(e.name.replace(' combo', ''), x0 + 3 * dpr, r.y + r.h - 3 * dpr, '#c0392b', 9, 'bold');
    }
    const curve = (arr, f, col, dash) => {
      ctx.beginPath(); let on = false;
      for (let x = L.tx; x <= L.tx + L.tw; x += step) {
        const v = arr[at(x)];
        if (v === undefined) { on = false; continue; }
        const y = r.y + r.h - 2 * dpr - clamp(f(v), 0, 1) * (r.h - 4 * dpr);
        if (on) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        on = true;
      }
      ctx.strokeStyle = col; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash(dash ? [3 * dpr, 2 * dpr] : []); ctx.stroke(); ctx.setLineDash([]);
    };
    if (l.max > 0) curve(l.hp, v => v / l.max, l.col);
    curve(l.stun, v => v, '#e67e22', true);
  }
  ctx.restore();
}
// an event type's lane: ticks, spans as bars; ticks closer than 6 px merge into a count. Inputs: presses (by button colour) on top,
// held directions and guard as thin bars under them, one height per key
function drawTypeRow(L, r) {
  const [c0, icon] = EVENT_TYPES[r.type], inp = r.type === 'input', near = {}, off = !rp.show.has(r.type), col = off ? '#bbb' : c0;
  glyph(icon, L.tl.x + 2 * dpr, r.y + 11 * dpr, col, 11); text(r.type, L.tl.x + 18 * dpr, r.y + 10 * dpr, col, 10, 'bold');
  if (off) { text('hidden · click the name to show', L.tx + 6 * dpr, r.y + 10 * dpr, '#bbb', 9); return; }
  ctx.save(); ctx.beginPath(); ctx.rect(L.tx, r.y, L.tw, r.h); ctx.clip();
  for (const e of rp.events) {
    if (e.type !== r.type) continue;
    const [fa, fb] = evFrames(e), x = tToX(L, rp.T[fa]), xe = fb !== undefined ? tToX(L, rp.T[fb]) : x, on = rp.sel.has(e.i) || rp.hover === e;
    if (xe < L.tx - 2 * dpr || x > L.tx + L.tw + 2 * dpr) continue;
    if (inp && e.kind === 'held') {
      const y = r.y + 10 * dpr + Object.keys(HELD_NAMES).indexOf(e.key) * 2.4 * dpr;
      ctx.fillStyle = on ? '#222' : col; ctx.fillRect(x, y, Math.max(dpr, xe - x), 2 * dpr);
      continue;
    }
    if (e.end !== undefined) { ctx.fillStyle = col; ctx.globalAlpha = 0.5; ctx.fillRect(x, r.y + 4 * dpr, Math.max(dpr, xe - x), r.h - 8 * dpr); ctx.globalAlpha = 1; }
    if (on) { ctx.fillStyle = col; ctx.fillRect(x - 1.5 * dpr, r.y + dpr, 3 * dpr, r.h - 2 * dpr); ctx.strokeStyle = '#222'; ctx.lineWidth = dpr; ctx.strokeRect(x - 3 * dpr, r.y + 0.5 * dpr, 6 * dpr, r.h - dpr); continue; }
    if (e.cmp) { ctx.strokeStyle = '#b9770e'; ctx.lineWidth = 1.5 * dpr; ctx.strokeRect(x - 2 * dpr, r.y + 2 * dpr, 4 * dpr, r.h - 4 * dpr); continue; } // only in B
    if (e.aOnly) { ctx.fillStyle = '#b9770e'; ctx.fillRect(x - 2 * dpr, r.y + r.h - 2 * dpr, 4 * dpr, 2 * dpr); } // only in A
    (near[Math.floor((x - L.tx) / (6 * dpr))] ||= []).push([x, inp ? PRESS_COLS[e.name] || col : col, e]);
  }
  for (const ticks of Object.values(near)) {
    if (ticks.length >= 3) { // a cluster: a badge with the count
      const x = ticks[0][0], s = String(ticks.length), w = (s.length * 6 + 6) * dpr;
      ctx.fillStyle = col; ctx.fillRect(x, r.y + 2 * dpr, w, (inp ? 7 : r.h / dpr - 4) * dpr);
      text(s, x + 3 * dpr, r.y + (inp ? 8 : r.h / dpr - 4) * dpr, '#fff', 9, 'bold');
    } else for (const [x, c, e] of ticks) {
      ctx.fillStyle = c; ctx.fillRect(x - 0.75 * dpr, r.y + 2 * dpr, 1.5 * dpr, (inp ? 7 : r.h / dpr - 4) * dpr);
      if (inp && (rp.v[1] - rp.v[0]) < 1.5) text(e.name[0], x + 2 * dpr, r.y + 8 * dpr, c, 8, 'bold'); // zoomed in: the button's letter
    }
  }
  ctx.restore();
}
// an event's frames as drawn: the selected inputs being dragged show where they will go
function evFrames(e) {
  const d = rp.drag;
  let a = e.f, b = e.end;
  if (d?.move && d.d && rp.sel.has(e.i) && e.type === 'input' && e.kind !== 'macro') {
    if (d.edge !== 'end') a += d.d;
    if (b !== undefined && d.edge !== 'start') b += d.d;
  }
  return [clamp(a, 0, rp.N), b === undefined ? b : clamp(b, 0, rp.N)];
}
// the event under the mouse (within 5 px of its tick, or on its span) in a type lane
function eventAt(L, x, y) {
  const r = rowAt(L, y);
  if (r?.kind !== 'type' || x < L.tx || !rp.show.has(r.type)) return null;
  let best = null, bd = 5 * dpr;
  for (const e of rp.events) {
    if (e.type !== r.type) continue;
    const x0 = tToX(L, rp.T[e.f]), d = e.end !== undefined && x >= x0 && x <= tToX(L, rp.T[e.end]) ? 4 * dpr : Math.abs(x - x0);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
// a time under x, snapped to the nearest shown event or mark within 6 px (Alt: no snapping)
function snapT(L, x, e) {
  const t = xToT(L, x);
  if (e?.altKey) return t;
  let best = t, bd = 6 * dpr;
  for (const ev of rp.events) if (rp.show.has(ev.type)) { const d = Math.abs(tToX(L, rp.T[ev.f]) - x); if (d < bd) { bd = d; best = rp.T[ev.f]; } }
  return best;
}
function rpRender() {
  clear();
  if (!rp.reel) {
    text('No replay yet: fight in play, then come back here (or press "from play"), or open a replay file.', canvas.width / 2, canvas.height / 2, '#888', 13, '', 'center');
    return;
  }
  const pv = rpLayout().pv;
  if (rp.playMovie) { // the movie: each shot's own world, in turn; the timeline below is this reel's, not the movie's (a later phase)
    if (rp.mv?.trans) { const tr = rp.mv.trans, p = Math.min(1, tr.t / tr.dur);
      ctx.save(); ctx.beginPath(); ctx.rect(pv.x, pv.y, pv.w, pv.h); ctx.clip(); ctx.translate(pv.x, pv.y);
      transDraw(ctx, pv.w, pv.h, tr.from, tr.to, tr, p); ctx.restore(); }
    else if (rp.mv?.freeze) { const fr = rp.mv.freeze;
      ctx.save(); ctx.beginPath(); ctx.rect(pv.x, pv.y, pv.w, pv.h); ctx.clip(); ctx.translate(pv.x, pv.y);
      drawFreeze(ctx, pv.w, pv.h, fr.img, fr.zoom, fr.text); ctx.restore(); }
    else if (rp.mv?.rev) ctx.drawImage(rp.mv.rev.imgs[rp.mv.rev.i].img, pv.x, pv.y, pv.w, pv.h);
    else if (rp.mv) { const sh = rp.movie.shots[rp.mv.shotI], reel = rp.reels[sh.reel], [dx, dy] = shakeOff(sh.fx?.shake), shot = { ...pv, x: pv.x + dx, y: pv.y + dy };
      rp.mv.w.fighters.forEach(f => { f.poseOverride = sh.pose?.[f.id]; });
      drawCell({ w: rp.mv.w, shot: reel && camAt(reel.rep, rp.mv.w, rp.mv.n), label: `shot ${rp.mv.shotI + 1}/${rp.movie.shots.length} · ${reel?.name || ''}` }, shot, { full: true, plot: false });
      rp.mv.w.fighters.forEach(f => { f.poseOverride = null; });
      if (sh.props?.length) sceneDrawProps(ctx, shot);
      if (sh.fx) { ctx.save(); ctx.beginPath(); ctx.rect(pv.x, pv.y, pv.w, pv.h); ctx.clip(); ctx.translate(pv.x, pv.y); drawShotFx(ctx, pv.w, pv.h, sh.fx, rp.mv.n - rp.mv.a); ctx.restore(); } }
    else text(rp.movie.shots.length ? 'The movie ended.' : 'No shots yet: add one in the movie section.', pv.x + pv.w / 2, pv.y + pv.h / 2, '#888', 13, '', 'center');
    return;
  }
  const c = rp.cmp, side = c && rp.cmpView === 'side', a = side ? { ...pv, w: Math.floor(pv.w / 2) - 2 * dpr } : pv;
  rp.view.fighters.forEach(f => { f.poseOverride = rp.pose[f.id]; });
  drawCell({ w: rp.view, shot: shotAt(rp.view, rp.n), label: `${c ? 'A · ' : ''}${rp.reel.name} · engine v${rp.reel.rep.version}` }, a, { full: true, plot: false });
  rp.view.fighters.forEach(f => { f.poseOverride = null; });
  sceneDrawProps(ctx, a);
  if (side) drawCell({ w: c.view, label: `B · ${c.reel.name}` }, { ...a, x: a.x + a.w + 4 * dpr }, { full: true, plot: false });
  else if (c) { // overlay: B's picture over A's, see-through
    const off = rp.ghost ??= document.createElement('canvas');
    if (off.width !== a.w || off.height !== a.h) Object.assign(off, { width: a.w, height: a.h });
    const g = off.getContext('2d'); g.clearRect(0, 0, a.w, a.h); c.view.render(g, { x: 0, y: 0, w: a.w, h: a.h }, true);
    ctx.save(); ctx.globalAlpha = 0.4; ctx.drawImage(off, a.x, a.y); ctx.restore();
    text(`ghost: B · ${c.reel.name}`, a.x + a.w - 8 * dpr, a.y + 16 * dpr, '#b9770e', 11, 'bold', 'right');
  }
  drawCaption(ctx, rp.n, a);
  if (rp.sideNow && rp.sideN !== rp.n) { rp.sideN = rp.n; rp.sideNow(); }
  drawRpTimeline();
}
function rpTip(L, x, y) {
  if (rp.hover) return `${rp.hover.type}: ${evText(rp.hover)}`;
  const r = rowAt(L, y);
  if (r?.kind === 'type' && x < L.tx) return `${r.type}: ${EVENT_TYPES[r.type][2]} · click to ${rp.show.has(r.type) ? 'hide' : 'show'} them`;
  if (r?.kind === 'foot' || !r || r.kind === 'type' || x < L.tx) return r?.l ? `${who(r.l.id)} ${r.l.name}: click to ${rp.fold.has(r.l.id) ? 'unfold' : 'fold'} its curves` : '';
  const f = frameAt(xToT(L, x)), l = r.l, st = l.fs[f];
  return `${fmtT(rp.T[f])} · ${who(l.id)} ${l.name}: ${l.max > 0 ? `health ${Math.round(l.hp[f] ?? 0)} / ${l.max} · ` : ''}stun ${Math.round(100 * (l.stun[f] ?? 0))}% · ${st || 'idle'}`;
}
