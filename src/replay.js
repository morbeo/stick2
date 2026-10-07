'use strict';
// ---------- replay mode: a recorded fight as a timeline of colour-coded events and an event table ----------
// The reel is a replay file (makeReplay in world.js). A master world plays it once with the event recorder on (World.ev) and keeps
// checkpoints; the shown world seeks by restoring the last checkpoint before a frame and playing the frames after it.

const rp = { reel: null, master: null, view: null, frames: [], T: [0], N: 0, events: [], n: 0, t: 0, show: new Set(Object.keys(EVENT_TYPES)), sel: new Set(),
  footOn: true, fsel: null, reels: [], cmp: null, cmpView: null, moments: [], hl: { picked: new Set(), slow: true, titles: true }, expWhat: 'footage', filter: '', sort: { k: 't', dir: 1 }, hover: null, drag: null, scrollTo: null, lanes: {}, v: [0, 1], fold: new Set(), base: [], mx: -1, my: -1,
  movie: { shots: [] }, playMovie: false, mv: null, shotDrag: null, // the movie: shots across any loaded reel, see "movie" below
  // the scene editor: pose the paused frame by dragging joints (poseOn), and place props on it - both reset on scrub
  // ({[fighterId]: {boneId: angle}}, [{type, x, y, a}]); draw-only (Fighter.poseOverride), never touches the fight itself
  poseOn: false, pose: {}, props: [], propSel: null, propDrag: null };
const fmtT = t => t.toFixed(2) + 's';
const who = id => id < 0 ? '' : 'P' + (id + 1);

// ---------- the reel: the master plays it, recording events and the fighter lanes ----------
// reel: one already listed (a branch) to edit; else rep starts a new list of reels
function loadReel(rep, name, reel = null) {
  rep.marks ||= []; rep.footage ||= { in: null, out: null, spans: [] };
  rp.reel = reel ? Object.assign(reel, { rep }) : { rep, name: name || rep.scenario, edits: 0 };
  // a fresh reel (not a branch, not a project's own): one reel, and the footage in–out becomes the movie's first shot
  if (!reel) { rp.reels = [rp.reel]; rp.cmp = null; rp.movie = { shots: [{ reel: 0, a: rep.footage.in ?? 0, b: rep.footage.out ?? rep.frames.length }] }; rp.playMovie = false; rp.mv = null; }
  else if (rp.cmp?.reel === reel) rp.cmp = null;
  const w = rp.master = replayWorld(rep);
  w.loop = false; // the recording ends at its K.O. (a play fight's log starts at its last restart)
  rp.frames = w.playback.frames; rp.rec = []; rp.lanes = {};
  w.rec = e => { const c = classifyEvent(e); if (c) rp.rec.push(c); };
  simFrom(0);
  rp.reel.desync = w.desync; // against the file's own checksums; edits make those meaningless, so they go
  w.playback.sums = {}; w.playback.end = null;
  rp.v = [0, rpEnd()];
  rp.view = replayWorld(rep); rp.view.loop = false; rp.view.replaying = true;
  rpSeek(0);
}
// play the master from frame k (from its last checkpoint before) to the end or its K.O., recording events and lanes from there
function simFrom(k) {
  const w = rp.master;
  let cp = null;
  for (const c of w.checkpoints) if (c.i <= k) cp = c;
  if (cp && cp.i > 0) {
    w.restore(cp.s); w.log.length = cp.i; w.checkpoints = w.checkpoints.filter(c => c.i < cp.i);
    for (const i in w.sums) if (i >= cp.i) delete w.sums[i];
  } else w.reset();
  const from = w.log.length, prev = {};
  w.done = false; w.desync = null; w.playback.over = false;
  rp.rec = rp.rec.filter(e => e.f < from);
  for (const l of Object.values(rp.lanes)) for (const a of [l.hp, l.stun, l.fs]) a.length = Math.min(a.length, from);
  for (const f of w.fighters) prev[f.id] = fstate(f);
  for (let i = from; i < rp.frames.length && !w.done; i++) {
    w.advance(0, NOIN); // a replay world plays its own frames
    recordFrame(w, i, prev, rp.lanes, rp.rec);
  }
  rp.N = w.log.length;
  rp.T = rp.frames.reduce((a, f) => (a.push(a[a.length - 1] + f[0]), a), [0]);
  const fr = rp.frames.slice(0, rp.N);
  rp.base = [...inputEvents(fr, w.ctl[0] === 'human' ? w.a.id : -1), ...inputEvents(fr.map(f => [f[0], f[3] || NOIN]), fr.some(f => f[3]) ? w.b.id : -1), ...rp.rec, ...comboSpans(rp.rec)];
  rebuildEvents();
}
// the recorded events plus the bookmarks (kept in the replay file as marks: [{ f, name }]), in frame order
// compared with another reel: the events only it has come in too (cmp), and this reel's own are marked (aOnly)
function rebuildEvents() {
  const marks = rp.reel.rep.marks.map((m, j) => ({ f: m.f, type: 'meta', kind: 'mark', who: -1, name: '⚑ ' + m.name, mark: j }));
  let evs = [...rp.base, ...marks];
  if (rp.cmp) {
    const a = new Set(rp.base.map(evKey)), b = new Set(rp.cmp.events.map(evKey));
    evs = [...evs.map(e => e.kind !== 'mark' && !b.has(evKey(e)) ? { ...e, aOnly: true } : e), ...rp.cmp.events.filter(e => !a.has(evKey(e))).map(e => ({ ...e, cmp: true }))];
  }
  rp.events = evs.sort((a, b) => a.f - b.f).map((e, i) => ({ ...e, i }));
  rp.sel.clear();
  rp.moments = findMoments(rp.base, rp.T); // the highlights: the best five picked at first
  rp.hl.picked = new Set(rp.moments.slice(0, 5).map(m => m.a));
}
const evDetail = e => [e.cmp ? 'only in B' : e.aOnly ? 'only in A' : '', e.data?.vic !== undefined && e.data.vic !== e.who ? '→ ' + who(e.data.vic) : '', e.data?.dmg ? Math.round(e.data.dmg) + ' dmg' : '',
  e.kind === 'hit' && e.data.combo > 1 ? e.data.combo + '-hit' : '', e.data?.height || '', e.end !== undefined ? fmtT(rp.T[e.end] - rp.T[e.f]) : ''].filter(Boolean).join(' · ');
const evText = e => `${fmtT(rp.T[e.f])} · ${who(e.who)} ${e.name}${evDetail(e) ? ' · ' + evDetail(e) : ''}`;
const shownEvents = () => rp.events.filter(e => rp.show.has(e.type));

// ---------- editing inputs: every edit changes the frames, then the master plays on from the first changed frame ----------
const selInputs = () => rp.events.filter(e => rp.sel.has(e.i) && e.type === 'input' && e.kind !== 'macro' && !e.cmp);
const encodeFrames = () => rp.frames.map(([dt, inp, mq, inp2]) => { const mask = x => rp.reel.rep.keys.reduce((m, k, i) => m | (x[k] ? 1 << i : 0), 0); // as makeReplay
  return [dt, mask(inp), ...mq || inp2 ? [mq || 0] : [], ...inp2 ? [mask(inp2)] : []]; });
const reelSnap = () => JSON.stringify({ frames: encodeFrames(), marks: rp.reel.rep.marks, footage: rp.reel.rep.footage });
// undo / redo (the shared stack in studio.js): the frames and bookmarks as they were; the master replays from the first frame that differs
function reelRestore(snap) {
  if (!rp.reel) return;
  const { frames, marks, footage } = JSON.parse(snap), keys = rp.reel.rep.keys, now = encodeFrames();
  let k = 0;
  while (k < frames.length && k < now.length && JSON.stringify(frames[k]) === JSON.stringify(now[k])) k++;
  const dec = m => Object.fromEntries(keys.map((key, i) => [key, !!(m >> i & 1)]));
  rp.frames.splice(0, rp.frames.length, ...frames.map(([dt, m, mq, m2]) => [dt, dec(m), mq || null, ...m2 ? [dec(m2)] : []]));
  rp.reel.rep.marks = marks; rp.reel.rep.footage = footage;
  rp.reel.edits++; simFrom(k); rpSeek(Math.min(rp.n, rp.N)); panels();
}
// an edit: fn changes rp.frames and returns the first frame it changed and what to select after (as [frame, key] pairs)
function reelEdit(fn, key = null) {
  const snap = reelSnap(), r = fn();
  if (!r) return;
  snapshot(() => ({ reel: snap }), key);
  rp.reel.edits++;
  simFrom(Math.max(0, r.from));
  if (r.sel) rp.sel = new Set(rp.events.filter(e => e.type === 'input' && r.sel.some(([f, k]) => e.f === f && e.key === k)).map(e => e.i));
  rpSeek(Math.min(rp.n, rp.N)); panels();
}
const setIn = (f, k, v) => { if (f >= 0 && f < rp.frames.length) rp.frames[f][1] = { ...rp.frames[f][1], [k]: v }; };
const spanOf = e => e.kind === 'held' ? [e.f, e.end] : [e.f, e.f + 1];
// move the selected inputs by d frames (edge: 'start' / 'end' moves only that end of the held spans)
function shiftInputs(d, edge) {
  const es = selInputs();
  if (!es.length || !d) return null;
  const last = rp.frames.length;
  for (const e of es) { const [a, b] = spanOf(e); for (let f = a; f < b; f++) setIn(f, e.key, false); }
  const sel = [];
  for (const e of es) {
    let [a, b] = spanOf(e);
    if (!edge || edge === 'start') a += d;
    if (!edge || edge === 'end') b += d;
    a = clamp(a, 0, last - 1); b = clamp(b, a + 1, last);
    for (let f = a; f < b; f++) setIn(f, e.key, true);
    sel.push([a, e.key]);
  }
  return { from: Math.min(...es.map(e => e.f)) + Math.min(0, d), sel };
}
const deleteInputs = () => { const es = selInputs(); if (!es.length) return null; for (const e of es) { const [a, b] = spanOf(e); for (let f = a; f < b; f++) setIn(f, e.key, false); } return { from: Math.min(...es.map(e => e.f)) }; };
// a press of k at the playhead (held keys: a span of 12 frames)
function insertInput(k) {
  const f = Math.min(rp.n, rp.frames.length - 1), held = k in HELD_NAMES;
  for (let i = f; i < (held ? Math.min(rp.frames.length, f + 12) : f + 1); i++) setIn(i, k, true);
  return { from: f, sel: [[f, k]] };
}
function changeInputs(k) {
  const es = selInputs().filter(e => e.kind === 'press');
  if (!es.length) return null;
  for (const e of es) { setIn(e.f, e.key, false); setIn(e.f, k, true); }
  return { from: Math.min(...es.map(e => e.f)), sel: es.map(e => [e.f, k]) };
}
// the frames the selection spans (first frame, one past its last)
function selSpan() {
  const es = rp.events.filter(e => rp.sel.has(e.i));
  return es.length ? [Math.min(...es.map(e => e.f)), Math.max(...es.map(e => (e.end ?? e.f) + 1))] : null;
}
// cut: the selection's frames go (everything after comes earlier); duplicate: they play twice. Bookmarks after it move along
function cutSpan() {
  const s = selSpan();
  if (!s || s[1] - s[0] >= rp.frames.length) return null;
  rp.frames.splice(s[0], s[1] - s[0]);
  rp.reel.rep.marks = rp.reel.rep.marks.filter(m => m.f < s[0] || m.f >= s[1]).map(m => ({ ...m, f: m.f >= s[1] ? m.f - (s[1] - s[0]) : m.f }));
  return { from: s[0] };
}
function dupSpan() {
  const s = selSpan();
  if (!s) return null;
  rp.frames.splice(s[1], 0, ...rp.frames.slice(s[0], s[1]).map(([dt, inp, mq]) => [dt, { ...inp }, mq]));
  rp.reel.rep.marks = rp.reel.rep.marks.map(m => ({ ...m, f: m.f >= s[1] ? m.f + (s[1] - s[0]) : m.f }));
  return { from: s[1] };
}
function zoomToSel() { const s = selSpan(); if (s) { const pad = 0.25; rpView(rp.T[s[0]] - pad, rp.T[Math.min(s[1], rp.N)] + pad); } }
// the edited replay as a replay file: the frames, fresh checksums (the master's), its end state and the bookmarks
function reelFile() {
  const r = rp.reel.rep, w = rp.master;
  return { ...r, frames: encodeFrames().slice(0, rp.N), sums: { ...w.sums }, end: w.stateHash(), marks: r.marks, footage: r.footage };
}
// selection: a click picks one event, ⌘ adds or takes one out, ⇧ takes every shown event between the last picked one and this
function pickEvent(e, ev, list = shownEvents()) {
  if (ev.metaKey || ev.ctrlKey) rp.sel[rp.sel.has(e.i) ? 'delete' : 'add'](e.i);
  else if (ev.shiftKey && rp.anchor !== undefined) {
    const a = list.findIndex(x => x.i === rp.anchor), b = list.findIndex(x => x.i === e.i);
    if (a >= 0 && b >= 0) for (const x of list.slice(Math.min(a, b), Math.max(a, b) + 1)) rp.sel.add(x.i);
  } else if (!rp.sel.has(e.i)) rp.sel = new Set([e.i]);
  rp.anchor = e.i;
}

// ---------- branches: play on from the playhead as P1 or P2, keep the result beside the reel, compare the two ----------
// a world at frame n of rep, live from there: you play side 1 or 2; the other side keeps its recorded inputs (a human) or its AI.
// Taking a side the AI played is saved as scen.takeover, so the branch's own replay file switches it at the same frame
function branchWorld(rep, n, side) {
  const all = replayWorld(rep).playback.frames, w = replayWorld({ ...rep, frames: rep.frames.slice(0, n), sums: {}, end: null });
  w.loop = false;
  for (let i = 0; i < n; i++) w.advance(0, NOIN);
  w.playback = null;
  const was1 = w.ctl[0] === 'human', was2 = w.ctl[1] === 'human2', mine = side === 1 ? was1 : was2;
  if (!mine) { w.scen = { ...w.scen, takeover: { at: n, side } }; w.ctl[side - 1] = side === 1 ? 'human' : 'human2'; }
  w.feed = side === 2 ? (keys, i) => [was1 ? all[i]?.[1] ?? NOIN : NOIN, keys] : was2 ? (keys, i) => [keys, all[i]?.[3] ?? NOIN] : null;
  return w;
}
function branchFrom(side) {
  const reel = rp.reel, n = rp.n, rep = reelFile();
  lab.branch = { reel, n, side, make: () => branchWorld(rep, n, side) };
  lab.mode = 'play'; setMode('play'); app.paused = false;
}
// back from play: the branch fight becomes a reel of its own (listed under the reel), compared with it
function keepBranch() {
  const b = lab.branch, w = lab.cells[0].w, k = rp.reels.filter(r => r.parent === b.reel).length + 1;
  const reel = { rep: JSON.parse(JSON.stringify(makeReplay(w, b.reel.rep.scenario))), name: `${b.reel.name} ↳ ${k} (P${b.side})`, from: b.n, parent: b.reel, edits: 0 };
  lab.branch = null; rp.reels.push(reel);
  setMode('replay'); loadCmp(reel); rp.cmpView ||= 'side'; app.paused = true; panels();
}
function dropBranch() { lab.branch = null; build(); panels(); }
// the reel compared with the edited one: its own master (events, checkpoints) and shown world, kept on the same frame
function loadCmp(reel) {
  if (!reel || reel === rp.reel) { rp.cmp = null; rebuildEvents(); return; }
  const m = replayWorld(reel.rep); m.loop = false;
  const rec = recordFight(m), v = replayWorld(reel.rep); v.loop = false; v.replaying = true;
  rp.cmp = { reel, master: m, view: v, frames: m.playback.frames, N: rec.N, events: rec.events, lanes: rec.lanes, n: 0 };
  rebuildEvents(); cmpSeek(rp.n);
}
function cmpSeek(n) {
  const c = rp.cmp;
  if (!c) return;
  n = clamp(n, 0, c.N);
  let cp = null;
  for (const k of c.master.checkpoints) if (k.i <= n) cp = k;
  c.view.done = false;
  if (cp) c.view.restore(cp.s); else c.view.reset();
  c.n = cp ? cp.i : 0;
  while (c.n < n) cmpStep();
}
function cmpStep() { const c = rp.cmp, [dt, inp, mq, inp2] = c.frames[c.n]; if (mq) c.view.macro = new Script(parseMacro(mq)); c.view.advance(dt, inp, inp2); c.n++; }
const evKey = e => `${e.f}|${e.type}|${e.who}|${e.name}`;

// ---------- seeking and playing ----------
function rpSeek(n) {
  const w = rp.view, cps = rp.master.checkpoints;
  n = clamp(Math.round(n), 0, rp.N);
  let cp = null;
  for (const c of cps) if (c.i <= n) cp = c;
  w.done = false;
  if (cp) w.restore(cp.s); else w.reset();
  rp.n = cp ? cp.i : 0;
  while (rp.n < n) rpStep();
  rp.t = rp.T[rp.n];
  cmpSeek(rp.n);
}
function rpStep() {
  const [dt, inp, mq] = rp.frames[rp.n];
  if (mq) rp.view.macro = new Script(parseMacro(mq));
  rp.view.advance(dt, inp, rp.frames[rp.n][3]);
  rp.n++;
  if (rp.cmp && rp.cmp.n === rp.n - 1 && rp.cmp.n < rp.cmp.N) cmpStep();
}
// the frame playing at time t; nearFrame: the frame that starts nearest to t (for dragging onto frames)
const nearFrame = t => { const f = frameAt(t); return f < rp.N && t - rp.T[f] > (rp.T[f + 1] - rp.T[f]) / 2 ? f + 1 : f; };
const frameAt = t => { let lo = 0, hi = rp.N; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (rp.T[m] <= t) lo = m; else hi = m - 1; } return lo; };

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
// numbers next to each slider: a human drags, an AI (or a script) sets an exact value - both write the same field
const numField = (v, set, w = 50) => h('input', { type: 'number', value: Math.round(v * 10) / 10, style: `width:${w}px`,
  onchange: e => set(+e.target.value) });
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
      h('span', { textContent: 'x' }), numField(p.x, v => scenePropMove(i, v), 55),
      h('span', { textContent: 'rotate' }), slider('a', { min: -180, max: 180, step: 5 }, () => p.a, v => scenePropSet(i, { a: v }, 'scene-prop-a:' + i), 'rotate'),
      numField(p.a, v => scenePropSet(i, { a: v }, 'scene-prop-a:' + i), 45),
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

// ---------- movie: shots cut from any loaded reel (the reel, its branches, an imported file), played and exported one after another ----------
// a project file: every reel the movie uses, plus the movie itself (shots: [{ reel: index into reels, a, b, trans }]); shot fx are a later phase
const PROJECT_FORMAT = 'stick2-project';
function movieEdit(fn, key = null) { snapshot(() => ({ movie: JSON.stringify(rp.movie) }), key); fn(rp.movie); panels(); }
// a shot's transition in from the one before it (shot 0 has none): dur in seconds; fade/flash: col; wipe/slide: dir, the edge the
// new shot enters from. Drawn by blending two frozen frames (the old shot's last, the new one's first), in the preview and export
const TRANS_KINDS = { cut: 'Switches instantly (the default)', fade: 'Fades through a colour', cross: 'Crossfades into the new shot',
  wipe: 'A hard edge wipes the new shot in', slide: 'The new shot slides in, pushing the old one out' };
const TRANS_DIRS = { L: 'from the left', R: 'from the right', U: 'from the top', D: 'from the bottom' };
function transDraw(g, w, h, from, to, trans, p) {
  const { kind, dir = 'R', col = 'black' } = trans;
  if (kind === 'fade') {
    if (p < 0.5) { g.drawImage(from, 0, 0, w, h); g.globalAlpha = p * 2; g.fillStyle = col; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
    else { g.fillStyle = col; g.fillRect(0, 0, w, h); g.globalAlpha = (p - 0.5) * 2; g.drawImage(to, 0, 0, w, h); g.globalAlpha = 1; }
  } else if (kind === 'cross') { g.drawImage(from, 0, 0, w, h); g.globalAlpha = p; g.drawImage(to, 0, 0, w, h); g.globalAlpha = 1; }
  else if (kind === 'wipe') {
    g.drawImage(from, 0, 0, w, h); g.save(); g.beginPath();
    if (dir === 'R') g.rect(w * (1 - p), 0, w * p, h); else if (dir === 'L') g.rect(0, 0, w * p, h);
    else if (dir === 'D') g.rect(0, h * (1 - p), w, h * p); else g.rect(0, 0, w, h * p);
    g.clip(); g.drawImage(to, 0, 0, w, h); g.restore();
  } else if (kind === 'slide') {
    const sign = dir === 'R' || dir === 'D' ? 1 : -1, horiz = dir === 'L' || dir === 'R', size = horiz ? w : h;
    const toOff = size * (1 - p) * sign, fromOff = -size * p * sign;
    if (horiz) { g.drawImage(from, fromOff, 0, w, h); g.drawImage(to, toOff, 0, w, h); } else { g.drawImage(from, 0, fromOff, w, h); g.drawImage(to, 0, toOff, w, h); }
  } else g.drawImage(to, 0, 0, w, h);
}
// a shot's freeze frame { at (frame, relative to the shot; unset: its last), hold (s), zoom, text }: holds on one frame, optionally
// punched in and captioned, before the shot's own frames play on
function drawFreeze(g, w, h, img, zoom, text) {
  if (zoom > 1) { g.save(); g.translate(w / 2, h / 2); g.scale(zoom, zoom); g.drawImage(img, -w / 2, -h / 2, w, h); g.restore(); }
  else g.drawImage(img, 0, 0, w, h);
  if (text) drawTitle(g, text, { x: 0, y: 0, w, h });
}
// a shot's screen effects { shake, vignette, tint: { col, amt }, letterbox, caption }, drawn over its own frames (not over a
// freeze, a transition or a reversed shot's pictures: those are their own, separate phase of the shot)
const shakeOff = amt => amt ? [(Math.random() - 0.5) * amt * 2, (Math.random() - 0.5) * amt * 2] : [0, 0];
// atFrame: the frame being drawn, relative to the shot's own start (0-based) — governs the caption's cue, if it has one
function drawShotFx(g, w, h, fx, atFrame = 0) {
  if (!fx) return;
  if (fx.letterbox) { const bar = h * 0.12; g.fillStyle = '#000'; g.fillRect(0, 0, w, bar); g.fillRect(0, h - bar, w, bar); }
  if (fx.vignette) { const grad = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.65)'); g.fillStyle = grad; g.fillRect(0, 0, w, h); }
  if (fx.tint?.amt) { g.fillStyle = fx.tint.col; g.globalAlpha = fx.tint.amt; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
  if (fx.caption && (fx.capAt === undefined || (atFrame >= fx.capAt && atFrame < fx.capAt + (fx.capDur ?? 2) * 60))) drawTitle(g, fx.caption, { x: 0, y: 0, w, h });
}
// a new shot from this reel: the selection, else the footage in–out, else two seconds from the playhead
function addShot() {
  const s = selSpan(), [a, b] = s || (foot().in != null || foot().out != null ? footRange() : [rp.n, Math.min(rp.N, frameAt(rp.T[rp.n] + 2))]);
  movieEdit(M => { M.shots.push({ reel: rp.reels.indexOf(rp.reel), a, b }); });
}
function importReel() { pickReplay(r => { rp.reels.push({ rep: r, name: r.scenario, edits: 0 }); panels(); }); }
// movie playback: a lightweight world of its own per shot (rp.reel / master / view are untouched, so editing the loaded reel still works).
// transFrom: the previous shot's last frame, when this shot transitions in from it; a frozen blend plays before the shot's own frames do
// shot.speed { rate, reverse }: rate paces how fast its own frames play (not the simulation itself); reverse pre-renders every
// frame of the shot once (the engine can only play forward) and steps through the pictures backward. Freeze is skipped on a
// reversed shot: its "at" frame does not have a clean meaning once the order is flipped
function mvLoad(shotI, transFrom = null) {
  const sh = rp.movie.shots[shotI];
  if (!sh) { rp.mv = null; return false; }
  const reel = rp.reels[sh.reel];
  if (!reel) return mvLoad(shotI + 1, transFrom); // a shot whose reel was removed: skip it
  const w = replayWorld(reel.rep); w.loop = false; w.replaying = true;
  const frames = w.playback.frames, N = Math.min(sh.b, frames.length), a = Math.min(sh.a, N), rate = sh.speed?.rate || 1;
  for (let f = 0; f < a; f++) { const [dt, inp, mq, inp2] = frames[f]; if (mq) w.macro = new Script(parseMacro(mq)); w.advance(dt, inp, inp2); }
  rp.mv = { shotI, w, frames, n: a, N, a, rate, T: frames.slice(a, N).reduce((arr, f) => (arr.push(arr[arr.length - 1] + f[0]), arr), [0]), t: 0, trans: null, freeze: null, rev: null };
  if (sh.speed?.reverse) {
    const pv = rpLayout().pv, imgs = [];
    for (let f = a; f < N; f++) {
      const [dt, inp, mq, inp2] = frames[f]; if (mq) w.macro = new Script(parseMacro(mq)); w.advance(dt, inp, inp2);
      const c = document.createElement('canvas'); c.width = pv.w; c.height = pv.h;
      const g = c.getContext('2d'); g.fillStyle = '#f3f0e8'; g.fillRect(0, 0, pv.w, pv.h); w.render(g, { x: 0, y: 0, w: pv.w, h: pv.h }, true);
      imgs.push({ img: c, dt });
    }
    imgs.reverse(); // index 0 now plays first: the shot's last frame
    rp.mv.rev = { imgs, i: 0, t: 0, T: imgs.reduce((arr, x) => (arr.push(arr[arr.length - 1] + x.dt), arr), [0]) };
  }
  if (transFrom && sh.trans && sh.trans.kind !== 'cut') rp.mv.trans = { ...sh.trans, from: transFrom, to: mvSnapshot(), t: 0 };
  return true;
}
// a snapshot of the current movie frame, at the preview's own size (used to blend a transition either side of it)
function mvSnapshot() {
  const pv = rpLayout().pv, c = document.createElement('canvas'); c.width = pv.w; c.height = pv.h;
  const g = c.getContext('2d'); g.fillStyle = '#f3f0e8'; g.fillRect(0, 0, pv.w, pv.h); rp.mv.w.render(g, { x: 0, y: 0, w: pv.w, h: pv.h }, true);
  return c;
}
function mvStepOnce() {
  const m = rp.mv, sh = rp.movie.shots[m.shotI], [dt, inp, mq, inp2] = m.frames[m.n];
  if (mq) m.w.macro = new Script(parseMacro(mq));
  m.w.advance(dt, inp, inp2);
  const at = sh.freeze && m.a + (sh.freeze.at ?? m.N - m.a - 1);
  if (sh.freeze && m.n === at) m.freeze = { ...sh.freeze, t: 0, hold: sh.freeze.hold ?? 1, zoom: sh.freeze.zoom ?? 1, img: mvSnapshot() };
  m.n++;
}
function mvTick(dt) {
  if (!rp.mv && !mvLoad(0)) { app.paused = true; return; }
  const m = rp.mv;
  if (m.trans) { m.trans.t += dt; if (m.trans.t >= m.trans.dur) m.trans = null; return; } // the shot's own frames wait out the transition
  if (m.freeze) { m.freeze.t += dt; if (m.freeze.t >= m.freeze.hold) m.freeze = null; return; }
  if (m.rev) {
    m.rev.t += dt * m.rate;
    while (m.rev.i < m.rev.imgs.length - 1 && m.rev.T[m.rev.i + 1] <= m.rev.t + 1e-9) m.rev.i++;
    if (m.rev.i >= m.rev.imgs.length - 1 && !mvLoad(m.shotI + 1, m.rev.imgs[m.rev.imgs.length - 1].img)) app.paused = true;
    return;
  }
  m.t += dt * m.rate;
  while (!m.freeze && m.n < m.N && m.T[m.n - m.a + 1] <= m.t + 1e-9) mvStepOnce();
  if (m.n >= m.N) { const img = mvSnapshot(); if (!mvLoad(m.shotI + 1, img)) app.paused = true; }
}
function setPlayMovie(v) { rp.playMovie = v; rp.mv = null; if (v) mvLoad(0); app.paused = false; }
// export: each shot's own reel rendered in turn, cut to cut (a shot's own fx and the transition between shots are a later phase)
async function exportMovie() {
  if (clip.busy) return;
  if (!rp.movie.shots.length) return notice('No shots yet', 'Add one in the movie section first.');
  const o = expSet(), set = clipSet(), fps = set.fps, [W2, H2] = expSize(W / H), fill = set.fit !== 'letterbox';
  const frames = [], total = rp.movie.shots.reduce((n, sh) => n + Math.max(0, sh.b - sh.a), 0);
  let t = 0, next = 0, done = 0;
  clip.busy = 'render 0%'; syncAll();
  const hud = CFG.hud; CFG.hud = o.hud;
  let lastImg = null;
  try {
    for (const [si, sh] of rp.movie.shots.entries()) {
      const reel = rp.reels[sh.reel]; if (!reel) continue;
      const w = replayWorld(reel.rep); w.loop = false; w.replaying = true;
      const fr = w.playback.frames, end = Math.min(sh.b, fr.length);
      for (let f = 0; f < sh.a; f++) { const [dt, inp, mq, inp2] = fr[f]; if (mq) w.macro = new Script(parseMacro(mq)); w.advance(dt, inp, inp2); }
      if (si > 0 && lastImg && sh.trans && sh.trans.kind !== 'cut') { // a frozen blend from the previous shot's last frame to this one's first, before its own frames play
        const toImg = h2canvas(W2, H2), tg = toImg.getContext('2d'); tg.fillStyle = '#f3f0e8'; tg.fillRect(0, 0, W2, H2); w.render(tg, { x: 0, y: 0, w: W2, h: H2 }, true, { ...camAt(reel.rep, w, sh.a), fill });
        const n = Math.max(1, Math.round(sh.trans.dur * fps));
        for (let k = 1; k <= n; k++) { const c = h2canvas(W2, H2), g = c.getContext('2d'); transDraw(g, W2, H2, lastImg, toImg, sh.trans, k / n); frames.push({ c, t: next * 1000 }); next += 1 / fps; lastImg = c; }
        t = next;
      }
      const rate = sh.speed?.rate || 1, reverse = !!sh.speed?.reverse, startIdx = frames.length;
      const freezeAt = sh.freeze && !reverse && sh.a + (sh.freeze.at ?? end - sh.a - 1); // freeze has no clean meaning once reversed
      for (let f = sh.a; f < end; f++) {
        const [dt, inp, mq, inp2] = fr[f]; if (mq) w.macro = new Script(parseMacro(mq));
        const t1 = t + dt / rate;
        if (next <= t1 - 1e-9) {
          const [dx, dy] = shakeOff(sh.fx?.shake), c = h2canvas(W2, H2), g = c.getContext('2d'), r = { x: dx, y: dy, w: W2, h: H2 };
          g.fillStyle = '#f3f0e8'; g.fillRect(0, 0, W2, H2);
          w.render(g, r, true, { ...camAt(reel.rep, w, f), fill });
          if (o.inputs && w.ctl[0] === 'human') drawInputs(w, 10 * dpr, 30 * dpr, g);
          if (o.meter) drawMeter(w, { x: 6 * dpr, y: H2 - 24 * dpr, w: W2 - 12 * dpr, h: 18 * dpr }, true, g);
          drawShotFx(g, W2, H2, sh.fx, f - sh.a);
          for (; next <= t1 - 1e-9; next += 1 / fps) frames.push({ c, t: next * 1000 });
          lastImg = c;
        }
        t = t1; w.advance(dt, inp, inp2);
        if (f === freezeAt && lastImg) { // hold on the last rendered frame, then carry on from here
          const hold = Math.max(1, Math.round((sh.freeze.hold ?? 1) * fps));
          for (let k = 0; k < hold; k++) { const c = h2canvas(W2, H2), g = c.getContext('2d'); drawFreeze(g, W2, H2, lastImg, sh.freeze.zoom ?? 1, sh.freeze.text); frames.push({ c, t: next * 1000 }); next += 1 / fps; }
          t = next;
        }
        if (++done % 30 === 0) { clip.busy = `render ${Math.round(100 * done / total)}%`; syncAll(); await new Promise(r => setTimeout(r)); }
      }
      if (reverse) { // the engine can only play forward: keep the timestamps, just show the pictures back to front
        const pics = frames.slice(startIdx).map(x => x.c);
        for (let k = startIdx; k < frames.length; k++) frames[k].c = pics[frames.length - 1 - k];
        lastImg = frames[frames.length - 1]?.c ?? lastImg;
      }
    }
  } finally { CFG.hud = hud; clip.busy = ''; }
  await saveClip(frames);
}
const projectFile = () => ({ format: PROJECT_FORMAT, version: ENGINE_VERSION, reels: rp.reels.map(r => ({ name: r.name, rep: r.rep })), movie: rp.movie });
const saveProject = () => saveBlob('movie.stick2-project.json', new Blob([JSON.stringify(projectFile())], { type: 'application/json' }));
function pickProject(then) {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => {
    let p; try { p = JSON.parse(await inp.files[0].text()); } catch (err) { return notice('Not a project file', err.message); }
    if (p.format !== PROJECT_FORMAT) return notice('Not a project file', 'This JSON file is not a stick2 movie project.');
    then(p);
  };
  inp.click();
}
function loadProject(p) {
  rp.reels = p.reels.map(r => ({ rep: r.rep, name: r.name, edits: 0 }));
  loadReel(rp.reels[0].rep, rp.reels[0].name, rp.reels[0]); // a listed reel: rp.reels / rp.movie (set next) are left alone
  rp.movie = p.movie; rp.playMovie = false; rp.mv = null;
  app.paused = true;
}
// a shot in the side panel: which reel, its range (seconds while that reel is the one loaded, else frame numbers), trim to the
// playhead (only while editing that reel), duplicate, delete; drag to reorder
// the transition into shot j from the one before it (none for the first shot: nothing plays before it)
function transBtn(j) {
  const cur = () => rp.movie.shots[j].trans || { kind: 'cut', dur: 0.4, col: 'black', dir: 'R' };
  const set = vals => movieEdit(M => { const t = { ...cur(), ...vals }; M.shots[j].trans = t.kind === 'cut' ? undefined : t; });
  const b = button(':theaters:', 'How this shot transitions in from the one before it', (e, btn) => popup(btn, h('b', { textContent: 'transition in' }),
    h('div', { cls: 'row' }, h('span', { textContent: 'kind' }), seg(Object.keys(TRANS_KINDS), () => cur().kind, v => set({ kind: v }), TRANS_KINDS)),
    h('div', { cls: 'row' }, h('span', { textContent: 'for' }), slider('secs', { min: 0.1, max: 2, step: 0.05 }, () => cur().dur, v => set({ dur: v }), 'How long the transition takes')),
    (() => { const r = h('div', { cls: 'row' }, h('span', { textContent: 'colour' }), seg(['black', 'white'], () => cur().col, v => set({ col: v })));
      reg(r, () => { r.hidden = cur().kind !== 'fade'; }); return r; })(),
    (() => { const r = h('div', { cls: 'row' }, h('span', { textContent: 'enters' }), seg(Object.keys(TRANS_DIRS), () => cur().dir, v => set({ dir: v }), TRANS_DIRS));
      reg(r, () => { r.hidden = !['wipe', 'slide'].includes(cur().kind); }); return r; })()), 'mini');
  reg(b, () => setRich(b, `:theaters: ${cur().kind}`));
  return b;
}
// a shot's freeze frame: holds on one of its frames (its last, or wherever the playhead was when "here" was clicked), zoomed and
// captioned if set, before its own frames (after the freeze point) play on
function freezeBtn(j) {
  const on = () => !!rp.movie.shots[j].freeze, cur = () => rp.movie.shots[j].freeze || { hold: 1, zoom: 1, text: '' };
  const set = vals => movieEdit(M => { M.shots[j].freeze = { ...cur(), ...vals }; });
  const b = button(':pause:', 'Hold on a frame of this shot before it plays on', (e, btn) => popup(btn, h('b', { textContent: 'freeze frame' }),
    h('div', { cls: 'row' }, h('span', { textContent: 'freeze' }), toggle(':pause: on', 'Hold on a frame, then play on', on,
      v => movieEdit(M => { if (v) M.shots[j].freeze = cur(); else delete M.shots[j].freeze; }))),
    h('div', { cls: 'row' }, h('span', { textContent: 'at' }), button(':my_location: here', 'Freeze at the playhead (edit this reel first)', () => set({ at: rp.n - rp.movie.shots[j].a }), 'mini'),
      h('span', { cls: 'note', textContent: cur().at !== undefined ? `frame ${cur().at} of the shot` : 'the last frame of the shot' })),
    h('div', { cls: 'row' }, h('span', { textContent: 'hold' }), slider('secs', { min: 0.1, max: 5, step: 0.1 }, () => cur().hold, v => set({ hold: v }), 'How long it holds')),
    h('div', { cls: 'row' }, h('span', { textContent: 'zoom' }), slider('×', { min: 1, max: 3, step: 0.1 }, () => cur().zoom, v => set({ zoom: v }), 'Punch in while held')),
    h('div', { cls: 'row' }, h('span', { textContent: 'caption' }), h('input', { cls: 'macro', value: cur().text, oninput: e2 => set({ text: e2.target.value }) }))), 'mini');
  reg(b, () => b.classList.toggle('on', on()));
  return b;
}
// a shot's own speed: a constant rate (not a ramp: pick a different rate on either side of a cut for that), or reversed
// (pre-rendered once, forward, then shown back to front, since the engine cannot simulate backward)
function speedBtn(j) {
  const cur = () => rp.movie.shots[j].speed || { rate: 1, reverse: false };
  const set = vals => movieEdit(M => { const s = { ...cur(), ...vals }; M.shots[j].speed = s.rate === 1 && !s.reverse ? undefined : s; });
  const b = button(':speed:', 'How fast this shot plays, or reversed', (e, btn) => popup(btn, h('b', { textContent: 'speed' }),
    h('div', { cls: 'row' }, h('span', { textContent: 'rate' }), slider('×', { min: 0.1, max: 3, step: 0.05 }, () => cur().rate, v => set({ rate: v }), 'How fast the shot plays (1 = normal, under 1 slower, over 1 faster)')),
    h('div', { cls: 'row' }, h('span', { textContent: 'reverse' }), toggle(':fast_rewind: reversed', 'Plays the shot back to front', () => cur().reverse, v => set({ reverse: v })))), 'mini');
  reg(b, () => setRich(b, `:speed: ${cur().reverse ? 'reversed' : cur().rate + '×'}`));
  return b;
}
// a shot's screen effects (shake, vignette, tint, letterbox) and a caption shown throughout it; drawn on its own frames only
function fxBtn(j) {
  const cur = () => rp.movie.shots[j].fx || { shake: 0, vignette: false, tint: { col: '#c0392b', amt: 0 }, letterbox: false, caption: '' };
  const set = vals => movieEdit(M => { const f = { ...cur(), ...vals, tint: { ...cur().tint, ...vals.tint } };
    if (!f.caption) { delete f.capAt; delete f.capDur; }
    M.shots[j].fx = f.shake || f.vignette || f.tint.amt || f.letterbox || f.caption ? f : undefined; });
  const b = button(':auto_awesome:', 'Screen effects over this shot: shake, vignette, a colour tint, letterbox bars, a caption', (e, btn) => popup(btn, h('b', { textContent: 'effects' }),
    h('div', { cls: 'row' }, h('span', { textContent: 'shake' }), slider('px', { min: 0, max: 20, step: 1 }, () => cur().shake, v => set({ shake: v }), 'Camera jitter each frame (0 = none)')),
    h('div', { cls: 'row' }, h('span', { textContent: 'vignette' }), toggle(':blur_on: on', 'Darkens the edges of the picture', () => cur().vignette, v => set({ vignette: v }))),
    h('div', { cls: 'row' }, h('span', { textContent: 'tint' }), h('input', { type: 'color', value: cur().tint.col, oninput: e2 => set({ tint: { col: e2.target.value } }) }),
      slider('', { min: 0, max: 1, step: 0.05 }, () => cur().tint.amt, v => set({ tint: { amt: v } }), 'How strong the colour wash is (0 = none)')),
    h('div', { cls: 'row' }, h('span', { textContent: 'letterbox' }), toggle(':crop_landscape: on', 'Black bars top and bottom, for a cinematic look', () => cur().letterbox, v => set({ letterbox: v }))),
    h('div', { cls: 'row' }, h('span', { textContent: 'caption' }), h('input', { cls: 'macro', value: cur().caption, oninput: e2 => set({ caption: e2.target.value }) })),
    (() => { const r = h('div', { cls: 'row' }, h('span', { textContent: 'cue' }),
        toggle(':timer: timed', 'Shows only for a while, instead of the whole shot', () => cur().capAt !== undefined, v => set({ capAt: v ? 0 : undefined })),
        button(':my_location: here', 'Starts the caption at the playhead (edit this reel first)', () => set({ capAt: rp.n - rp.movie.shots[j].a }), 'mini'),
        slider('secs', { min: 0.2, max: 5, step: 0.1 }, () => cur().capDur ?? 2, v => set({ capDur: v }), 'How long the caption shows'));
      reg(r, () => { r.hidden = !cur().caption; }); return r; })()), 'mini');
  reg(b, () => b.classList.toggle('on', !!rp.movie.shots[j].fx));
  return b;
}
function shotRow(sh, j) {
  const reel = rp.reels[sh.reel], active = reel === rp.reel;
  const t = f => active ? fmtT(rp.T[f]) : `frame ${f}`;
  const inBtn = button('[', 'Start the shot at the playhead (edit this reel first)', () => movieEdit(M => { M.shots[j].a = Math.min(rp.n, M.shots[j].b - 1); }), 'mini');
  const outBtn = button(']', 'End the shot at the playhead (edit this reel first)', () => movieEdit(M => { M.shots[j].b = Math.max(rp.n, M.shots[j].a + 1); }), 'mini');
  reg(inBtn, () => { inBtn.disabled = !active; }); reg(outBtn, () => { outBtn.disabled = !active; });
  return h('div', { cls: 'bar', draggable: true, ondragstart: () => { rp.shotDrag = j; },
    ondragover: e => e.preventDefault(), ondrop: e => { e.preventDefault(); if (rp.shotDrag == null || rp.shotDrag === j) return;
      movieEdit(M => { const [s] = M.shots.splice(rp.shotDrag, 1); M.shots.splice(j, 0, s); }); rp.shotDrag = null; } },
    h('span', { cls: 'note', textContent: String(j + 1) }),
    button(reel ? reel.name : '(missing reel)', active ? 'This reel is being edited' : `Edit "${reel?.name}"`, () => { if (reel && !active) loadReel(reel.rep, reel.name, reel); app.paused = true; panels(); }, 'mini'),
    button(':swap_horiz:', 'Use a different reel for this shot', (e, b) => popup(b, h('b', { textContent: 'pick a reel' }),
      h('div', { cls: 'bar col' }, rp.reels.map((r, i) => button(r.name, `Use "${r.name}" for this shot`, () => { movieEdit(M => { M.shots[j].reel = i; }); closePop(); })))), 'mini'),
    h('span', { cls: 'note', textContent: `${t(sh.a)} – ${t(sh.b)}` }),
    inBtn, outBtn, j > 0 ? transBtn(j) : null, freezeBtn(j), speedBtn(j), fxBtn(j),
    button(':content_copy:', 'Duplicate this shot', () => movieEdit(M => { M.shots.splice(j + 1, 0, { ...sh }); }), 'mini'),
    crud({ delete: ['Delete this shot', () => movieEdit(M => { M.shots.splice(j, 1); })] }));
}
function movieSide() {
  return [heading('movie', 'Shots cut from any loaded reel (this one, a branch, or one imported below), played one after another. Saved in a project file alongside the reels it uses.'),
    h('div', { cls: 'bar' }, button(':add: shot', 'Add a shot from this reel: the selection, else the footage in–out, else two seconds from the playhead', addShot),
      button(':upload: import reel', 'Load another replay file to cut shots from, without replacing this one', importReel),
      toggle(':movie: preview', 'Preview the movie instead of this reel: its shots play in turn, cut to cut', () => rp.playMovie, setPlayMovie),
      button(':download: export movie', 'Export the movie as one clip, cuts only (size and format as in footage → export)', exportMovie)),
    ...rp.movie.shots.length ? rp.movie.shots.map((sh, j) => shotRow(sh, j)) : [h('p', { cls: 'note', textContent: 'No shots yet.' })],
    h('div', { cls: 'bar' }, button(':save: save project', 'Save every loaded reel and the movie as one project file', saveProject),
      button(':upload: open project', 'Open a project file: its reels and movie, replacing these', () => pickProject(p => { loadProject(p); panels(); }))),
  ];
}

// ---------- toolbar, side panel ----------
function reelFromPlay() {
  const w = lab.mode === 'play' && lab.cells[0]?.w;
  if (!w?.log.length) return notice('No play fight yet', 'Fight a while in play first, then take it here.');
  loadReel(makeReplay(w, lab.playback?.scenario || lab.scen)); app.paused = true;
  if (app.mode !== 'replay') setMode('replay'); else panels();
}
function rpCtx() {
  const fromPlay = button(':sports_kabaddi: from play', 'Take the fight in play so far (since its last restart) as the replay to edit', reelFromPlay);
  reg(fromPlay, () => { fromPlay.disabled = !(lab.mode === 'play' && lab.cells[0]?.w.log.length); });
  const save = button(':save: save', 'Save this replay as a replay file (with your edits and bookmarks)', () => saveBlob(`${rp.reel.name.replace(/\W+/g, '-')}${rp.reel.edits ? '-edited' : ''}.replay.json`, new Blob([JSON.stringify(reelFile())], { type: 'application/json' })));
  reg(save, () => { save.disabled = !rp.reel; });
  return [
    grp('reel', 'The replay being edited: from the play fight or a file; save it', fromPlay,
      button(':upload: open', 'Open a replay file', () => pickReplay(r => { loadReel(r); app.paused = true; panels(); })), save),
    grp('types', 'The event types shown in the timeline and the table', Object.entries(EVENT_TYPES).map(([k, [col, icon, tip]]) => {
      const t = toggle(`:${icon}:`, `${k}: ${tip}`, () => rp.show.has(k), v => { rp.show[v ? 'add' : 'delete'](k); });
      t.style.color = col; return t;
    }), (() => { const all = toggle('all', 'Show every type, or hide them all when all are shown', () => rp.show.size === Object.keys(EVENT_TYPES).length,
      v => { rp.show = new Set(v ? Object.keys(EVENT_TYPES) : []); }); return all; })()),
    editGrp(),
    grp('footage', 'How the replay is shown and exported: in / out, slow motion, camera, labels (the fight stays the same)',
      button('[ in', 'Start the footage at the playhead (I)', () => footEdit(F => { F.in = rp.n; })), button('out ]', 'End the footage at the playhead (O)', () => footEdit(F => { F.out = rp.n; })),
      button(':close:', 'Clear in and out: the whole fight', () => footEdit(F => { F.in = F.out = null; }), 'mini'),
      ...Object.entries(FOOT_KINDS).map(([k, [, tip]]) => button(`:add: ${k}`, `${tip}. Over the selection, else a second from the playhead`, () => addSpan(k))),
      toggle(':visibility: preview footage', 'Preview the footage: slow motion, camera, labels and the in–out loop in the view (off: the plain fight)', () => rp.footOn, v => { rp.footOn = v; }),
      button(':download: export footage', 'Export the in–out range: format, size and shape, overlays', exportPop)),
    grp('movie', 'Cut shots from any loaded reel into a movie, played one after another (the movie section in the side panel)',
      button(':add: shot', 'Add a shot from this reel: the selection, else the footage in–out, else two seconds from the playhead', addShot),
      toggle(':movie: preview', 'Preview the movie instead of this reel', () => rp.playMovie, setPlayMovie),
      button(':download: export movie', 'Export the movie as one clip, cuts only', exportMovie)),
    grp('branch', 'Play on from the playhead as P1 or P2 (the other side keeps its recording or its AI), keep the result as a branch and compare it with the reel',
      button(':sports_kabaddi: P1', 'Branch: play on from here as P1, in play; then keep it', () => branchFrom(1)), button(':sports_kabaddi: P2', 'Branch: play on from here as P2, in play; then keep it', () => branchFrom(2)),
      seg(['side', 'overlay'], () => rp.cmp && rp.cmpView, v => { rp.cmpView = v; if (!rp.cmp) loadCmp(rp.reels.find(r => r !== rp.reel)); panels(); },
        { side: 'Compare side by side: A (this reel) and B (the compared one), on the same frame', overlay: 'Compare as a ghost: B see-through over A' })),
    grp('view', 'The timeline\'s window: wheel over it zooms, Shift+wheel pans, the minimap moves it',
      button(':zoom_in:', 'Zoom in on the playhead', () => rpZoom(0.5, rp.T[rp.n])), button(':remove:', 'Zoom out', () => rpZoom(2, rp.T[rp.n])),
      button(':unfold_more: fit', 'Show the whole fight', () => rpView(0, rpEnd())), button(':select_all:', 'Zoom to the selection', zoomToSel),
      button(':chevron_left:', 'Previous shown event' + keyTip('prevEvent'), () => rpJump(-1)), button(':chevron_right:', 'Next shown event' + keyTip('nextEvent'), () => rpJump(1))),
    panelsGrp(['events'], { events: 'The events as a table: fuzzy filter, sort, click a row to go there' }),
  ];
}
// per fighter, for the side panel: fightStats as rows
function rpStats() {
  return fightStats(rp.base, rp.lanes).map(st => ({ l: rp.lanes[st.id], rows: [['dealt', st.dealt], ['hits', st.hits], ['blocked', st.blocked], ['parried', st.parried],
    ['thrown', st.thrown], ['best combo', st.bestCombo ? st.bestCombo + ' hits' : '–'], ['top combo dmg', st.topComboDmg || '–'], ['K.O.', st.koF !== null ? fmtT(rp.T[st.koF]) : '–']] }));
}
// a time typed in seconds (Enter or leaving it sets it, on the nearest frame; Esc puts it back); get / set in frames
function secField(get, set, tip) {
  const inp = h('input', { cls: 'v sec', inputMode: 'decimal', tip: tip + ' · type seconds, Enter sets it' });
  const show = () => { inp.value = rp.T[get()]?.toFixed(2) ?? ''; };
  reg(inp, () => { if (document.activeElement !== inp) show(); });
  const put = () => { const t = parseFloat(inp.value.replace(',', '.')); if (isFinite(t)) set(nearFrame(clamp(t, 0, rpEnd()))); show(); };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { put(); inp.blur(); } if (e.key === 'Escape') { show(); inp.blur(); } });
  inp.addEventListener('change', put);
  return inp;
}
// a footage span in the side panel: go there, its settings (rate / zoom and who / caption), delete; the selected one is marked
function spanRow(sp, j) {
  const set = (k, v) => footEdit(() => { sp[k] = v; }, 'span' + j + k), seg2 = (k, opts, lbl = String) => seg(opts, () => sp[k], v => set(k, v), {}, lbl);
  const cap = sp.kind === 'label' && h('input', { cls: 'macro', value: sp.text || '', tip: 'The caption' });
  if (cap) { cap.addEventListener('input', () => set('text', cap.value)); cap.addEventListener('keydown', e => e.stopPropagation()); }
  return h('div', { cls: 'bar' + (rp.fsel === j ? ' on' : '') }, h('span', { cls: 'chip', style: `background:${FOOT_KINDS[sp.kind][0]}`, tip: FOOT_KINDS[sp.kind][1] }, sp.kind),
    button(':my_location:', 'Go to the span and select it', () => { rp.fsel = j; rpSeek(sp.a); app.paused = true; panels(); }, 'mini'),
    secField(() => sp.a, f => footEdit(() => { const len = sp.b - sp.a; sp.a = Math.min(f, rp.N - 1); sp.b = Math.min(rp.N, sp.a + len); }), 'Where the span starts (it keeps its length)'),
    h('span', { cls: 'note', textContent: 'for' }),
    (() => { const len = h('input', { cls: 'v sec', inputMode: 'decimal', tip: 'How long the span lasts · type seconds, Enter sets it' }); const show = () => { len.value = (rp.T[sp.b] - rp.T[sp.a]).toFixed(2); };
      reg(len, () => { if (document.activeElement !== len) show(); });
      const put = () => { const t = parseFloat(len.value.replace(',', '.')); if (t > 0) footEdit(() => { sp.b = Math.max(sp.a + 1, Math.min(rp.N, nearFrame(rp.T[sp.a] + t))); }); show(); };
      len.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { put(); len.blur(); } if (e.key === 'Escape') { show(); len.blur(); } }); len.addEventListener('change', put); return len; })(),
    sp.kind === 'slow' ? seg2('rate', RATES, v => '×' + v) : sp.kind === 'cam' ? [seg2('zoom', ZOOMS, v => v + '×'), seg2('follow', FOLLOW)] : cap,
    button('[', 'Start the span at the playhead', () => footEdit(() => { sp.a = Math.min(rp.n, sp.b - 1); }), 'mini'),
    button(']', 'End the span at the playhead', () => footEdit(() => { sp.b = Math.max(rp.n, sp.a + 1); }), 'mini'),
    button(':remove:', 'A quarter second shorter (from its end)', () => footEdit(() => { sp.b = Math.max(sp.a + 1, frameAt(rp.T[sp.b] - 0.25)); }), 'mini'),
    button(':add:', 'A quarter second longer (at its end)', () => footEdit(() => { sp.b = Math.min(rp.N, frameAt(rp.T[sp.b] + 0.25) + 1); }), 'mini'),
    crud({ delete: ['Delete the span', () => { footEdit(F => { F.spans.splice(j, 1); rp.fsel = null; }); panels(); }] }));
}
// the toolbar's edit group: insert at the playhead, change the selected presses, delete, cut or duplicate the selection's frames
function editGrp() {
  const human = () => rp.reel && rp.master.ctl[0] === 'human', keys = [...Object.entries(BTN_NAMES), ...Object.entries(HELD_NAMES)];
  const ins = button(':add: insert', 'Insert an input at the playhead: a press, or a direction or guard held for 12 frames', (ev, b) => popup(b, h('b', { textContent: 'insert at the playhead' }),
    h('div', { cls: 'bar' }, keys.map(([k, n]) => button(n, k in HELD_NAMES ? `Hold ${n} for 12 frames from the playhead` : `Press ${n} at the playhead`, () => { closePop(); reelEdit(() => insertInput(k)); })))));
  const chg = button(':swap_horiz: change', 'Change the selected presses to another button', (ev, b) => popup(b, h('b', { textContent: 'change the selected presses to' }),
    h('div', { cls: 'bar' }, Object.entries(BTN_NAMES).map(([k, n]) => button(n, `Make them ${n} presses`, () => { closePop(); reelEdit(() => changeInputs(k)); })))));
  const del = button(':delete:', 'Delete the selected inputs' + keyTip('deleteBone'), () => reelEdit(deleteInputs));
  const cut = button(':content_cut:', 'Cut: the frames the selection spans go, everything after comes earlier', () => reelEdit(cutSpan));
  const dup = button(':content_copy:', 'Duplicate: the frames the selection spans play twice', () => reelEdit(dupSpan));
  reg(ins, () => { ins.disabled = !human(); chg.disabled = !selInputs().some(e => e.kind === 'press'); del.disabled = !selInputs().length; cut.disabled = dup.disabled = !rp.sel.size; });
  return grp('edit', 'Edit your inputs (P1 in a play fight): the fight plays again from the first changed frame. Drag selected inputs in the timeline to retime them, , and . nudge them a frame; ⌘Z undoes', ins, chg, del, cut, dup);
}
// ---------- side panel: the reel, what happens at the playhead, the selection, the types (how many, where), footage, bookmarks, reels, stats ----------
// now: refreshed as the playhead moves (rpRender calls rp.sideNow when the frame changed)
function nowPanel() {
  const at = h('div', { cls: 'note' }), list = h('div', { cls: 'bar col' }), fs = h('div');
  rp.sideN = null; // the next frame drawn fills it in
  rp.sideNow = () => {
    if (!at.isConnected) return at.seen && (rp.sideNow = null); // a newer panel took over
    at.seen = true;
    at.textContent = `${fmtT(rp.T[rp.n])} · frame ${rp.n} of ${rp.N}`;
    fs.replaceChildren(...rp.view.fighters.filter(f => !f.hidden).map(f => {
      const max = f.c('health'), act = f.action && !f.action.m.hurt ? f.action.name : '', st = frameState(f);
      return h('div', { cls: 'nowf', tip: `${who(f.id)}: health ${Math.round(f.hp)}${max > 0 ? ' / ' + max : ''}, stun ${Math.round(100 * f.stunM / (f.c('dizzyAt') || 1))}%, frame state ${st}` },
        h('b', { textContent: `${who(f.id)} ${f.ch.name}`, style: `color:${f.col[0]}` }),
        max > 0 ? h('span', { cls: 'hpbar' }, h('i', { style: `width:${100 * clamp(f.hp / max, 0, 1)}%;background:${f.col[0]}` })) : null,
        h('span', { cls: 'note', textContent: [act && `${act} (${st})`, !act && st !== 'idle' && st, f.combo > 1 && `${f.combo}-hit combo`, f.kd, f.dizzyT > 0 && 'dizzy'].filter(Boolean).join(' · ') || 'idle' }));
    }));
    const recent = rp.events.filter(e => e.f <= rp.n && e.f > rp.n - 20 && rp.show.has(e.type) && e.type !== 'input').slice(-5);
    list.replaceChildren(...recent.map(e => button(`:${EVENT_TYPES[e.type][1]}: ${who(e.who)} ${e.name}`, `${evText(e)} · click: select it`, () => { rp.sel = new Set([e.i]); rp.scrollTo = e.i; syncAll(); }, 'mini')));
  };
  return [heading('now', 'What happens at the playhead: each fighter\'s health, stun, move and its phase, combo; the events of the last third of a second (click one to select it).'), at, fs, list];
}
// the selection: what it holds and what to do with it
function selPanel() {
  const box = h('div', { cls: 'bar col' });
  reg(box, () => {
    const es = rp.events.filter(e => rp.sel.has(e.i)), s = selSpan();
    if (!es.length) return box.replaceChildren(h('p', { cls: 'note', textContent: 'Nothing selected: click events in the timeline or the table (⌘ / ⇧ for more), or drag a box over them in the lanes.' }));
    const ins = selInputs().length, by = Object.keys(EVENT_TYPES).map(t => [t, es.filter(e => e.type === t).length]).filter(([, n]) => n);
    box.replaceChildren(...[h('p', { cls: 'note', textContent: `${es.length} event${es.length > 1 ? 's' : ''} · ${fmtT(rp.T[s[0]])}–${fmtT(rp.T[Math.min(s[1], rp.N)])} · ${by.map(([t, n]) => `${n} ${t}`).join(', ')}` }),
      ...es.slice(0, 4).map(e => button(`:${EVENT_TYPES[e.type][1]}: ${who(e.who)} ${e.name}`, evText(e) + ' · click: go there', () => { rpSeek(e.f); rpFollow(); app.paused = true; }, 'mini')),
      es.length > 4 ? h('span', { cls: 'note', textContent: `… and ${es.length - 4} more (the events table lists them)` }) : null,
      h('div', { cls: 'bar' }, button(':select_all: zoom', 'Fit the timeline to the selection', zoomToSel, 'mini'),
        ...Object.keys(FOOT_KINDS).map(k => button(`:add: ${k}`, `${FOOT_KINDS[k][1]}, over the selection`, () => addSpan(k), 'mini')),
        button(':add: bookmark', 'A bookmark at the selection\'s start', async () => { rpSeek(s[0]); await addMark(); }, 'mini'),
        ...ins ? [button(':delete:', `Delete the ${ins} selected input${ins > 1 ? 's' : ''} (the fight plays again from there)`, () => reelEdit(deleteInputs), 'mini')] : [],
        button(':close:', 'Select nothing (Esc)', () => rp.sel.clear(), 'mini'))].filter(Boolean));
  });
  return [heading('selection', 'The events you picked: what they are and when; zoom to them, put slow motion, a camera, a label or a bookmark over them, delete selected inputs.'), box];
}
// the highlights: the best moments found (best first), pick the ones for the reel; slowed finishers and titles; export
function hlPanel() {
  return [heading('highlights', 'The best moments, found from the events (combos of three hits or more, K.O.s, parries, counters, wall hits, throws), best first. Pick the ones for a highlights reel; export joins them in fight order.'),
    h('div', { cls: 'bar' }, toggle(':speed: slow finish', 'Slow each moment\'s finishing blow to a quarter speed', () => rp.hl.slow, v => { rp.hl.slow = v; }),
      toggle('titles', 'Show each moment\'s name over its first second', () => rp.hl.titles, v => { rp.hl.titles = v; }),
      button(':download: export highlights', 'Export the picked moments as one clip (size and format as in footage → export)', () => exportHighlights()),
      button(':movie: make movie', 'Add the picked highlights as shots, in fight order', () => movieEdit(M => { M.shots.push(...hlSegs().map(sg => ({ reel: rp.reels.indexOf(rp.reel), a: sg.a, b: sg.b }))); }))),
    ...rp.moments.length ? rp.moments.slice(0, 12).map(m => h('div', { cls: 'bar trow' },
      toggle(String(m.score), `Score ${m.score}: put it in the highlights reel`, () => rp.hl.picked.has(m.a), v => { rp.hl.picked[v ? 'add' : 'delete'](m.a); }),
      button(`${fmtT(rp.T[m.a])} ${m.name}`, 'Go there and select the span', () => { rpSeek(m.a); rp.v = [rp.T[m.a] - 0.2, rp.T[m.b] + 0.2]; rpView(...rp.v); app.paused = true; }, 'mini')))
      : [h('p', { cls: 'note', textContent: 'No moments yet: combos of three hits, K.O.s, parries, counters, wall hits and throws show here.' })]];
}
// the types: show / hide, how many, where in the fight (a strip: click it to go there), previous / next of that type
function typesPanel() {
  const has = Object.keys(EVENT_TYPES).map(t => [t, rp.events.filter(e => e.type === t)]).filter(([, es]) => es.length);
  return [heading('types', 'Each kind of event: show or hide it (timeline and table), how many there are, where they fall in the fight (click the strip to go there), and the previous / next one from the playhead.'),
    ...has.map(([t, es]) => {
      const [col, icon, tip] = EVENT_TYPES[t], cv = h('canvas', { cls: 'spark', width: 120, height: 16, tip: `Where the ${t} events fall over the fight (darker: more); click to go there` });
      const g = cv.getContext('2d'), bins = new Array(40).fill(0), end = rpEnd();
      for (const e of es) bins[Math.min(39, Math.floor(rp.T[e.f] / end * 40))]++;
      const top = Math.max(...bins); g.fillStyle = col;
      bins.forEach((n, i) => { if (n) { const hh = Math.max(2, 14 * n / top); g.fillRect(i * 3, 16 - hh, 2, hh); } });
      cv.onclick = e => { rpSeek(frameAt(e.offsetX / cv.clientWidth * end)); rpFollow(); app.paused = true; };
      const tg = toggle(`:${icon}: ${t}`, `${tip} · click: ${rp.show.has(t) ? 'hide' : 'show'} them`, () => rp.show.has(t), v => { rp.show[v ? 'add' : 'delete'](t); });
      tg.style.color = col;
      const jump = d => () => { const fs = es.map(e => e.f), f = d > 0 ? Math.min(...fs.filter(f => f > rp.n)) : Math.max(...fs.filter(f => f < rp.n)); if (isFinite(f)) { rpSeek(f); rpFollow(); app.paused = true; } };
      return h('div', { cls: 'bar trow' }, tg, h('span', { cls: 'note', textContent: String(es.length) }), cv,
        button(':chevron_left:', `The previous ${t} event`, jump(-1), 'mini'), button(':chevron_right:', `The next ${t} event`, jump(1), 'mini'));
    })];
}
function footSide() {
  return [
    heading('footage', 'The footage edits: in and out, and the spans (slow motion, camera, label) in the timeline\'s footage row; drag a span to move it, its ends to resize it. Saved in the replay file; the export uses them.'),
    h('div', { cls: 'bar' }, h('span', { cls: 'note', textContent: 'in' }), secField(() => footRange()[0], f => footEdit(F => { F.in = Math.min(f, footRange()[1] - 1); }), 'Where the footage starts'),
      h('span', { cls: 'note', textContent: 'out' }), secField(() => footRange()[1], f => footEdit(F => { F.out = Math.max(f, footRange()[0] + 1); }), 'Where the footage ends')),
    ...foot().spans.map((sp, j) => spanRow(sp, j)),
  ];
}
function markSide() {
  return [
    heading('bookmarks', 'Named moments, saved in the replay file. \\ adds one at the playhead, ⇧[ ⇧] go to the previous / next.'),
    ...rp.reel.rep.marks.map((m, j) => h('div', { cls: 'bar' }, button(`⚑ ${m.name}`, `Go to ${fmtT(rp.T[m.f])} (f${m.f})`, () => { rpSeek(m.f); rpFollow(); app.paused = true; }),
      h('span', { cls: 'note', textContent: fmtT(rp.T[m.f]) }),
      crud({ rename: ['Rename the bookmark', async () => { const n = await askText('Rename the bookmark', m.name); if (n) { m.name = n; rebuildEvents(); panels(); } }], delete: ['Delete the bookmark', () => { rp.reel.rep.marks.splice(j, 1); rebuildEvents(); panels(); }] }))),
    h('div', { cls: 'bar' }, button(':add: bookmark', 'Add a bookmark at the playhead' + keyTip('mark'), addMark)),
  ];
}
function rpSide() {
  if (!rp.reel) return [heading('replay', 'Edit a recorded fight: its events on a timeline and in a table.')];
  const r = rp.reel.rep, w = rp.master, old = r.version !== ENGINE_VERSION;
  return [
    heading('replay', 'The recorded fight: its scenario, length, fighters and engine version. The events are found by playing it once.'),
    h('p', { cls: 'note', textContent: `${rp.reel.name} · ${fmtT(rp.T[rp.N])} · ${rp.N} frames · engine v${r.version}` }),
    rp.reel.edits ? h('p', { cls: 'note warn', textContent: `Edited (${rp.reel.edits} change${rp.reel.edits > 1 ? 's' : ''}): save to keep it.` }) : null,
    old ? h('p', { cls: 'note warn', textContent: `Recorded with engine v${r.version}, this is v${ENGINE_VERSION}: it may play out differently.` }) : null,
    rp.reel.desync !== null ? h('p', { cls: 'note warn', textContent: `The file goes out of sync with its recording from ${fmtT(rp.T[rp.reel.desync] ?? 0)}.` }) : null,
    h('p', { cls: 'note', textContent: w.fighters.map(f => `${who(f.id)} ${f.ch.name}`).join(' · ') }),
    ...nowPanel(), ...selPanel(), ...typesPanel(), ...hlPanel(),
    ...footSide(), ...movieSide(), ...markSide(), ...sceneSide(),
    heading('reels', 'This reel, its branches and any imported for the movie. Edit one, or compare it with the one you edit: side by side or as a ghost; the events only one has are marked (B: amber outline, only in A: amber underline).'),
    ...rp.reels.map(r => h('div', { cls: 'bar' + (r === rp.reel ? ' on' : '') },
      button(r === rp.reel ? `:edit: ${r.name}` : r.name, r === rp.reel ? 'The reel being edited' : `Edit this reel${r.from !== undefined ? ` (branched at ${fmtT(rp.T[Math.min(r.from, rp.N)])})` : ''}`, () => { if (r !== rp.reel) { loadReel(r.rep, r.name, r); app.paused = true; panels(); } }, 'mini'),
      r !== rp.reel && toggle(':sync_alt:', 'Compare it with the reel being edited', () => rp.cmp?.reel === r, v => { loadCmp(v ? r : null); rp.cmpView ||= 'side'; panels(); }),
      (r.parent || r !== rp.reel) && crud({ delete: [r.parent ? 'Delete this branch' : 'Remove this reel (any shots using it go too)', () => {
        const idx = rp.reels.indexOf(r); rp.reels.splice(idx, 1);
        rp.movie.shots = rp.movie.shots.filter(sh => sh.reel !== idx).map(sh => sh.reel > idx ? { ...sh, reel: sh.reel - 1 } : sh);
        if (rp.cmp?.reel === r) loadCmp(null); if (rp.reel === r) loadReel(r.parent.rep, r.parent.name, r.parent); panels();
      }] }))),
    heading('stats', 'Per fighter: damage dealt, hits landed, blocks and parries made, times thrown, its longest and most damaging combo, when it was knocked out.'),
    h('table', { cls: 'stats' }, h('tr', {}, h('th'), ...rpStats().map(({ l }) => h('th', { textContent: `${who(l.id)} ${l.name}`, style: `color:${l.col}` }))),
      ...rpStats()[0]?.rows.map((r, i) => h('tr', {}, h('td', { textContent: r[0] }), ...rpStats().map(st => h('td', { textContent: st.rows[i][1] })))) || []),
    rp.cmp && h('table', { cls: 'stats' }, h('tr', {}, h('th', { textContent: 'B' }), ...fightStats(rp.cmp.events, rp.cmp.lanes).map(st => h('th', { textContent: `${who(st.id)} ${st.name}`, style: `color:${st.col}` }))),
      ...[['dealt', 'dealt'], ['hits', 'hits'], ['blocked', 'blocked'], ['best combo', 'bestCombo']].map(([lbl, k]) => h('tr', {}, h('td', { textContent: lbl }), ...fightStats(rp.cmp.events, rp.cmp.lanes).map(st => h('td', { textContent: st[k] }))))),
  ];
}

const replayMode = {
  enter() { if (!rp.reel && lab.mode === 'play' && lab.cells[0]?.w.log.length) { loadReel(makeReplay(lab.cells[0].w, lab.playback?.scenario || lab.scen)); app.paused = true; } },
  restart() { if (rp.playMovie) mvLoad(0); else if (rp.reel) rpSeek(0); },
  worlds: () => [], // the shown fight is played here (tick), not by the frame loop
  debugWorld: () => rp.playMovie ? rp.mv?.w : rp.view,
  tick(dt) {
    if (!rp.reel || rp.drag || clip.busy) return; // an export plays the shown fight itself
    if (rp.playMovie) { mvTick(dt); return; }
    rp.t += dt * rateAt(rp.n);
    while (rp.n < rp.N && rp.T[rp.n + 1] <= rp.t + 1e-9) rpStep();
    rpFollow();
    const [a, b] = footRange();
    if (rp.n >= (rp.footOn ? b : rp.N)) { if (app.loop) rpSeek(rp.footOn ? a : 0); else app.paused = true; }
  },
  rewind(n) { if (!rp.playMovie && rp.reel) rpSeek(rp.n - n); },
  scrub(f) { if (!rp.playMovie && rp.reel) rpSeek(frameAt(f * rp.T[rp.N])); },
  preview: () => rpLayout().pv,
  clipRects: () => rp.reel ? [{ key: 'replay', r: rpLayout().pv }] : [],
  render: rpRender,
  ctxBar: rpCtx,
  side: rpSide,
  open: ['replay', 'now', 'selection', 'types', 'highlights', 'footage', 'movie', 'bookmarks', 'reels', 'stats', 'scene'],
  overlay: () => rp.reel && stageOpen() === 'events' ? [eventTable()] : [],
  mouse: rpMouse,
  wheel: rpWheel,
  key(e, a) {
    const nudge = d => selInputs().length ? reelEdit(() => shiftInputs(d), 'rp-nudge') : (app.paused = true, rpSeek(rp.n + d));
    const k = { prevEvent: () => rpJump(-1), nextEvent: () => rpJump(1), prevMark: () => rpJump(-1, true), nextMark: () => rpJump(1, true), mark: addMark,
      frameBack: () => nudge(-1), frameFwd: () => nudge(1), deleteBone: () => rp.fsel != null ? footEdit(F => { F.spans.splice(rp.fsel, 1); rp.fsel = null; }) : reelEdit(deleteInputs),
      aim: () => footEdit(F => { F.in = rp.n; }), onion: () => footEdit(F => { F.out = rp.n; }) }[a];
    if (e.code === 'Escape' && rp.sel.size) { rp.sel.clear(); return true; }
    if (!k || !rp.reel) return false;
    k(); return true;
  },
  hint: () => 'ruler: go to a moment (snaps, Alt: not) · lanes: click an event (⌘ / ⇧ more), drag from empty space to box-select · drag selected inputs to retime, their span ends to resize · , . nudge · Delete · ⌘Z · wheel zooms, Shift+wheel pans · [ ] events · ⇧[ ⇧] bookmarks · \\ bookmark',
};
