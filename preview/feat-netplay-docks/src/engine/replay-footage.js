'use strict';
// ---------- the event table: fuzzy filter, sort by any column, click a row to go there ----------
const EV_COLS = [
  { k: 't', tip: 'When it happened (seconds) and the frame', get: e => rp.T[e.f], show: e => `${fmtT(rp.T[e.f])} f${e.f}` },
  { k: 'type', tip: 'The kind of event (the toolbar\'s types filter them)', get: e => e.type },
  { k: 'who', tip: 'The fighter it happened to or who did it (P1 is yours in a play fight)', get: e => who(e.who) },
  { k: 'event', tip: 'What happened: a move, a callout, an input…', get: e => e.name },
  { k: 'details', tip: 'The target, damage, combo, height, how long a span lasted', get: e => evDetail(e) },
];
const ROW_H = 21;
function eventTable() {
  const L = rpLayout(), wrap = h('div', { cls: 'mtable etable' }), tbody = h('tbody');
  const q = h('input', { cls: 'macro', placeholder: 'filter events (fuzzy: "p2 hit", "kok", "jump")…', tip: 'Fuzzy filter: letters in order, over every column' });
  q.value = rp.filter;
  q.addEventListener('input', () => { rp.filter = q.value; fill(); });
  q.addEventListener('keydown', e => e.stopPropagation());
  const count = h('span', { cls: 'note' });
  const head = h('tr', {}, EV_COLS.map(c => { const th = h('th', { tip: c.tip + ' · click: sort' }); th.onclick = () => { rp.sort = { k: c.k, dir: rp.sort.k === c.k ? -rp.sort.dir : 1 }; fill(); }; return th; }));
  let rows = [];
  // only the rows in view are built (a long fight has thousands of events)
  const draw = () => {
    const top = Math.max(0, Math.floor(wrap.scrollTop / ROW_H) - 10), n = Math.ceil(wrap.clientHeight / ROW_H) + 20, cur = rp.events.findLast(e => e.f <= rp.n);
    tbody.replaceChildren(h('tr', { style: `height:${top * ROW_H}px` }), ...rows.slice(top, top + n).map(e => {
      const tr = h('tr', { cls: (rp.sel.has(e.i) ? 'on' : '') + (e === cur ? ' cur' : ''), style: `height:${ROW_H}px` }, EV_COLS.map(c => {
        if (c.k !== 'type') return h('td', { textContent: c.show ? c.show(e) : c.get(e) });
        const [col, icon] = EVENT_TYPES[e.type];
        return h('td', {}, h('span', { cls: 'chip', style: `background:${col}` }, ...rich(`:${icon}: ${e.type}`)));
      }));
      tr.onclick = ev => { pickEvent(e, ev, rows); rpSeek(e.f); app.paused = true; syncAll(); };
      return tr;
    }), h('tr', { style: `height:${Math.max(0, rows.length - top - n) * ROW_H}px` }));
  };
  const fill = () => {
    const c = EV_COLS.find(c => c.k === rp.sort.k);
    rows = shownEvents().filter(e => !rp.filter || fuzzy(rp.filter, EV_COLS.map(c => c.show ? c.show(e) : c.get(e)).join(' ') + ' ' + e.type))
      .sort((a, b) => { const x = c.get(a), y = c.get(b); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * rp.sort.dir || a.i - b.i; });
    [...head.children].forEach((th, i) => { th.textContent = EV_COLS[i].k + (rp.sort.k === EV_COLS[i].k ? (rp.sort.dir > 0 ? ' ▲' : ' ▼') : ''); });
    count.textContent = `${rows.length} of ${rp.events.length}`;
    if (rp.scrollTo !== null) { const r = rows.findIndex(e => e.i === rp.scrollTo); if (r >= 0) wrap.scrollTop = Math.max(0, (r - 3) * ROW_H); rp.scrollTo = null; }
    draw();
  };
  wrap.addEventListener('scroll', () => { rp.tscroll = wrap.scrollTop; draw(); });
  requestAnimationFrame(() => { if (rp.scrollTo === null && rp.tscroll) { wrap.scrollTop = rp.tscroll; draw(); } }); // a rebuilt table (after an edit) stays where it was
  wrap.style.bottom = L.tl.h / dpr + 6 + 'px';
  wrap.append(stageHead('events', 'Every event of the replay, one row each', q, count), h('table', {}, h('thead', {}, head), tbody));
  let shown = '';
  reg(wrap, () => { // the types, the selection or the playhead changed
    wrap.style.bottom = rpLayout().tl.h / dpr + 6 + 'px';
    const key = [...rp.show].join() + rp.events.length;
    if (key !== shown || rp.scrollTo !== null) { shown = key; fill(); } else draw();
  });
  return wrap;
}

// ---------- footage: how the replay is shown and exported (in / out, slow motion, camera, labels); never changes the fight ----------
const FOOT_KINDS = { slow: ['#d4a017', 'Slow motion: plays (and exports) slower over the span'], cam: ['#2c6fb0', 'Camera: zooms in on a fighter or both over the span'],
  label: ['#555', 'Label: a caption over the picture during the span'] };
const RATES = [0.5, 0.25, 0.1], ZOOMS = [1.25, 1.5, 2, 3], FOLLOW = ['both', 'P1', 'P2'];
const foot = () => rp.reel.rep.footage;
const spanAt = (kind, f) => foot().spans.find(s => s.kind === kind && f >= s.a && f < s.b);
const footRange = () => [foot().in ?? 0, Math.min(foot().out ?? rp.N, rp.N)];
// the playback rate, the camera and the caption at frame f (rp.footOn: the preview shows the footage edits)
const rateAt = (f, on = rp.footOn) => on && spanAt('slow', f)?.rate || 1;
function shotAt(w, f, on = rp.footOn) {
  const s = on && spanAt('cam', f);
  if (!s) return null;
  const fs = w.fighters.filter(x => !x.hidden), pick = s.follow === 'P1' ? [fs[0]] : s.follow === 'P2' ? [fs[1] || fs[0]] : fs;
  return { zoom: s.zoom, x: pick.reduce((a, x) => a + x.x, 0) / pick.length };
}
// a movie shot's camera: whatever camera spans are set on its own source reel's footage, at the frame it is showing (a shot has
// no camera of its own — it inherits the reel's, the same spans that reel's own footage preview and export already use)
function camAt(rep, w, f) {
  const s = (rep.footage?.spans || []).find(sp => sp.kind === 'cam' && f >= sp.a && f < sp.b);
  if (!s) return null;
  const fs = w.fighters.filter(x => !x.hidden), pick = s.follow === 'P1' ? [fs[0]] : s.follow === 'P2' ? [fs[1] || fs[0]] : fs;
  return { zoom: s.zoom, x: pick.reduce((a, x) => a + x.x, 0) / pick.length };
}
function drawCaption(c, f, r, on = rp.footOn) { const s = on && spanAt('label', f); if (s?.text) drawTitle(c, s.text, r); }
function drawTitle(c, txt, r) {
  const s = { text: txt }, size = Math.max(12, Math.round(r.h / 18 / dpr));
  c.font = `bold ${size * dpr}px ui-monospace, Menlo, monospace`;
  const w = c.measureText(s.text).width + 16 * dpr, y = r.y + r.h - size * dpr * 1.8;
  c.fillStyle = 'rgba(20,20,20,0.7)'; c.fillRect(r.x + (r.w - w) / 2, y - size * dpr * 1.1, w, size * dpr * 1.6);
  text(s.text, r.x + r.w / 2, y, '#fff', size, 'bold', 'center', c);
}
// footage edits are undoable like input edits (they share the snapshot), but play nothing again
function footEdit(fn, key = null) { const snap = reelSnap(); snapshot(() => ({ reel: snap }), key); fn(foot()); syncAll(); }
// a new span over the selection (at least a second), else a second from the playhead
function addSpan(kind) {
  const s = selSpan(), a = s ? s[0] : rp.n, b = Math.min(rp.N, Math.max(s ? s[1] : 0, frameAt(rp.T[a] + 1)));
  footEdit(F => { F.spans.push({ kind, a, b, rate: 0.25, zoom: 2, follow: 'both', text: kind === 'label' ? 'caption' : undefined }); rp.fsel = F.spans.length - 1; });
  panels();
}
function drawFootRow(L, r) {
  text('footage', L.tl.x + 18 * dpr, r.y + 11 * dpr, '#555', 10, 'bold'); glyph('theaters', L.tl.x + 2 * dpr, r.y + 12 * dpr, '#555', 11);
  ctx.save(); ctx.beginPath(); ctx.rect(L.tx, r.y, L.tw, r.h); ctx.clip();
  foot().spans.forEach((s, j) => {
    const x0 = tToX(L, rp.T[s.a]), x1 = tToX(L, rp.T[s.b]), [col] = FOOT_KINDS[s.kind], row = s.kind === 'label' ? 2 : s.kind === 'cam' ? 1 : 0, y = r.y + 1 * dpr + row * 6 * dpr;
    ctx.fillStyle = col; ctx.globalAlpha = rp.fsel === j ? 1 : 0.7; ctx.fillRect(x0, y, Math.max(6 * dpr, x1 - x0), 5 * dpr); ctx.globalAlpha = 1;
    if (rp.fsel === j) { ctx.strokeStyle = '#222'; ctx.lineWidth = dpr; ctx.strokeRect(x0, y - 0.5 * dpr, x1 - x0, 6 * dpr); }
  });
  ctx.restore();
  // what the spans say, under the row's label when one is under the playhead
  const now = foot().spans.filter(s => rp.n >= s.a && rp.n < s.b).map(spanName).join(' · ');
  if (now) text(now, L.tx + L.tw - 4 * dpr, r.y + r.h - 3 * dpr, '#555', 9, '', 'right');
}
const spanName = s => s.kind === 'slow' ? `slow ×${s.rate}` : s.kind === 'cam' ? `camera ${s.zoom}× ${s.follow}` : `“${s.text}”`;
// in / out: the parts left out are greyed over the whole timeline
function drawTrim(L) {
  const [a, b] = footRange(), shade = (t0, t1) => { const x0 = Math.max(L.tx, tToX(L, t0)), x1 = Math.min(L.tx + L.tw, tToX(L, t1)); if (x1 > x0) { ctx.fillStyle = '#00000022'; ctx.fillRect(x0, L.ruler, x1 - x0, L.tl.y + L.tl.h - L.ruler); } };
  shade(0, rp.T[a]); shade(rp.T[b], rpEnd());
  for (const [f, lbl] of [[foot().in, '['], [foot().out, ']']]) if (f !== null && f !== undefined) { const x = tToX(L, rp.T[f]); ctx.fillStyle = '#222'; ctx.fillRect(x - dpr, L.ruler, 2 * dpr, L.tl.y + L.tl.h - L.ruler); text(lbl, x + (lbl === '[' ? 3 : -9) * dpr, L.ruler + 26 * dpr, '#222', 12, 'bold'); }
}
// the footage row's mouse: a span's ends resize it, its middle moves it; returns true when it took the press
function footMouse(L, r, x, e) {
  const fr = () => nearFrame(xToT(L, x));
  for (let j = foot().spans.length - 1; j >= 0; j--) {
    const s = foot().spans[j], x0 = tToX(L, rp.T[s.a]), x1 = Math.max(x0 + 6 * dpr, tToX(L, rp.T[s.b]));
    if (x < x0 - 4 * dpr || x > x1 + 4 * dpr) continue;
    const part = Math.abs(x - x0) < 4 * dpr ? 'a' : Math.abs(x - x1) < 4 * dpr ? 'b' : 'move';
    rp.fsel = j; rp.drag = { span: s, part, f0: fr(), a: s.a, b: s.b, snap: reelSnap() }; panels();
    return true;
  }
  rp.fsel = null;
  return false;
}
// the footage span under the mouse: what dragging there does
function footHover(L, x) {
  for (let j = foot().spans.length - 1; j >= 0; j--) {
    const s = foot().spans[j], x0 = tToX(L, rp.T[s.a]), x1 = Math.max(x0 + 6 * dpr, tToX(L, rp.T[s.b]));
    if (x < x0 - 4 * dpr || x > x1 + 4 * dpr) continue;
    const end = Math.abs(x - x0) < 4 * dpr || Math.abs(x - x1) < 4 * dpr;
    return { cursor: end ? 'ew-resize' : 'grab', tip: `${spanName(s)} · ${fmtT(rp.T[s.a])}–${fmtT(rp.T[s.b])} · ${end ? 'drag to resize' : 'drag to move, its ends to resize'}; its settings are in the side panel (footage)` };
  }
  return { cursor: 'col-resize', tip: 'Footage: + slow, + cam, + label in the toolbar add spans here; click or drag to go to a moment' };
}
function footDrag(L, x) {
  const d = rp.drag, df = nearFrame(xToT(L, x)) - d.f0, s = d.span;
  if (d.part === 'move') { const len = d.b - d.a; s.a = clamp(d.a + df, 0, rp.N - len); s.b = s.a + len; }
  else if (d.part === 'a') s.a = clamp(d.a + df, 0, s.b - 1); else s.b = clamp(d.b + df, s.a + 1, rp.N);
}
// ---------- export: the in–out range rendered offline at the chosen size (sharp at any size), then saved as a GIF or WebM ----------
const EXP_SIZES = [320, 480, 720, 1080, 1920];
const expSet = () => ui.rexp ??= { size: 720, hud: true, labels: true, inputs: false, meter: false };
function expSize(view) { const a = CLIP_ASPECTS[clipSet().aspect] ?? view, w = expSet().size; return [Math.round(w / 2) * 2, Math.round(w / a / 2) * 2]; }
// the clip of segments [{ a, b, rate(f), shot(w, f), title(f) }] rendered offline one after another at the export size, then saved
async function renderSegments(segs) {
  if (clip.busy) return;
  const o = expSet(), set = clipSet(), fps = set.fps, [W2, H2] = expSize(W / H), fill = set.fit !== 'letterbox';
  const w = rp.view, hud = CFG.hud, frames = [], at = rp.n, total = segs.reduce((n, s) => n + s.b - s.a, 0);
  let t = 0, next = 0, done = 0;
  clip.busy = 'render 0%'; syncAll();
  CFG.hud = o.hud;
  try {
    for (const sg of segs) {
      rpSeek(sg.a);
      for (let f = sg.a; f < sg.b; f++) {
        const t1 = t + rp.frames[f][0] / sg.rate(f);
        if (next <= t1 - 1e-9) { // frames of the clip (slowed, one fight frame lasts several: the same picture, which the GIF merges)
          const c = h2canvas(W2, H2), g = c.getContext('2d'), r = { x: 0, y: 0, w: W2, h: H2 };
          g.fillStyle = '#f3f0e8'; g.fillRect(0, 0, W2, H2);
          w.render(g, r, true, { ...sg.shot(w, f), fill });
          const tt = o.labels && sg.title(f); if (tt) drawTitle(g, tt, r);
          if (o.inputs && w.ctl[0] === 'human') drawInputs(w, 10 * dpr, 30 * dpr, g);
          if (o.meter) drawMeter(w, { x: 6 * dpr, y: H2 - 24 * dpr, w: W2 - 12 * dpr, h: 18 * dpr }, true, g);
          for (; next <= t1 - 1e-9; next += 1 / fps) frames.push({ c, t: next * 1000 });
        }
        t = t1; rpStep();
        if (++done % 30 === 0) { clip.busy = `render ${Math.round(100 * done / total)}%`; syncAll(); await new Promise(r => setTimeout(r)); }
      }
    }
  } finally { CFG.hud = hud; clip.busy = ''; rpSeek(at); }
  await saveClip(frames);
}
// the highlights: the picked moments in fight order, each with its title for its first second and its finishing blow slowed
const hlSegs = () => rp.moments.filter(m => rp.hl.picked.has(m.a)).sort((p, q) => p.a - q.a).map(m => ({ a: m.a, b: m.b,
  rate: f => rp.hl.slow && f >= m.fin - 4 && f < m.fin + 20 ? 0.25 : 1, shot: () => null, title: f => rp.hl.titles && rp.T[f] - rp.T[m.a] < 1 ? m.name : null }));
const exportHighlights = () => hlSegs().length ? renderSegments(hlSegs()) : notice('No highlights picked', 'Pick some moments in the side panel\'s highlights first.');
// the footage: the in–out range with its slow motion, camera and labels
const exportReel = () => { const [a, b] = footRange(); return renderSegments([{ a, b, rate: f => rateAt(f, true), shot: (w, f) => shotAt(w, f, true), title: f => spanAt('label', f)?.text }]); };
function exportPop(e, b) {
  const o = expSet(), set = clipSet(), row = (label, tip, ...els) => h('div', { cls: 'row', tip }, h('span', { textContent: label }), ...els);
  const info = h('p', { cls: 'note' });
  reg(info, () => { const [w, ht] = expSize(W / H), segs = rp.expWhat === 'highlights' ? hlSegs() : [{ a: footRange()[0], b: footRange()[1], rate: f => rateAt(f, true) }];
    let t = 0; for (const sg of segs) for (let f = sg.a; f < sg.b; f++) t += rp.frames[f][0] / sg.rate(f);
    info.textContent = `${rp.expWhat === 'highlights' ? `${segs.length} moments` : `${fmtT(rp.T[segs[0].a])} – ${fmtT(rp.T[segs[0].b])}`} · ${t.toFixed(1)}s out · ${w}×${ht} · about ${Math.ceil(t * set.fps)} frames`; });
  const pick = (obj, k, opts, tips, lbl) => seg(opts, () => obj()[k], v => { obj()[k] = v; saveUi(); }, tips, lbl);
  popup(b, h('b', { textContent: 'export' }), info,
    row('what', 'The footage (in–out, with its slow motion, camera and labels) or the highlights (the moments picked in the side panel)',
      seg(['footage', 'highlights'], () => rp.expWhat, v => { rp.expWhat = v; }, { footage: 'The in–out range with its footage edits', highlights: 'The picked highlights, one after another, in fight order' })),
    row('format', 'GIF or WebM video', pick(clipSet, 'fmt', CLIP_FMTS, CLIP_TIPS, v => v.toUpperCase())),
    row('fps', 'Frames a second of the clip', pick(clipSet, 'fps', CLIP_FPS, CLIP_TIPS, String)),
    row('aspect', 'The clip\'s shape: the arena\'s own, or a fixed one (16:9 video, 1:1 square, 9:16 phone)', pick(clipSet, 'aspect', Object.keys(CLIP_ASPECTS), CLIP_TIPS, String)),
    row('width', 'The clip\'s width in pixels (the picture is drawn at that size, so it stays sharp)', pick(expSet, 'size', EXP_SIZES, {}, String)),
    row('fit', 'Another shape than the arena\'s: crop to fill it, or fit inside it with bars', pick(clipSet, 'fit', ['crop', 'letterbox'], CLIP_TIPS, String)),
    row('show', 'What is drawn over the fight', ...[['hud', 'Health bars and callouts'], ['labels', 'The label spans\' captions'], ['inputs', 'The input display (your presses)'], ['meter', 'The frame meter']]
      .map(([k, tip]) => toggle(k, tip, () => expSet()[k], v => { expSet()[k] = v; saveUi(); }))),
    h('div', { cls: 'bar' }, button(':download: export', 'Render it at this size and save it as a file', () => { closePop(); rp.expWhat === 'highlights' ? exportHighlights() : exportReel(); })));
}
