'use strict';
// ---------- replay mode: a recorded fight as a timeline of colour-coded events and an event table ----------
// The reel is a replay file (makeReplay in world.js). A master world plays it once with the event recorder on (World.ev) and keeps
// checkpoints; the shown world seeks by restoring the last checkpoint before a frame and playing the frames after it.
// Split by concern: replay.js (reel, editing, branches, seeking), replay-timeline.js, replay-scene.js, replay-footage.js
// (event table, footage, export), replay-movie.js and replay-panel.js (toolbar, side panel), loaded in that order

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
