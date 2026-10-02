'use strict';
// ---------- replay mode: a recorded fight as a timeline of colour-coded events and an event table ----------
// The reel is a replay file (makeReplay in world.js). A master world plays it once with the event recorder on (World.ev) and keeps
// checkpoints; the shown world seeks by restoring the last checkpoint before a frame and playing the frames after it.

// event types: colour, icon, what they are
const EVENT_TYPES = {
  input: ['#7f8c8d', 'keyboard', 'Your inputs: button presses, held directions and guard, macros'],
  move: ['#2c6fb0', 'sports_martial_arts', 'Moves started (attacks, specials, throws, rolls, getups)'],
  hit: ['#c0392b', 'bolt', 'Hits that landed, combos (two hits or more), clashes'],
  defence: ['#16a085', 'shield', 'Blocks, parries, catches, just guards, guard cancels and push blocks'],
  throw: ['#8e44ad', 'sports_kabaddi', 'Throws landed and throws broken'],
  fall: ['#d35400', 'airline_seat_flat', 'Launches, knockdowns, bounces, wall hits, techs, air recoveries, wake-ups'],
  state: ['#d4a017', 'star', 'K.O., counter hits, dizzy, stagger, armor, crumple, disarm'],
  movement: ['#27ae60', 'directions_run', 'Jumps, dashes, super jumps, wall jumps'],
  item: ['#7d5a3c', 'swords', 'Weapons picked up and lost, shots fired'],
  meta: ['#666', 'layers', 'Stance switches, waves'],
};
// callouts (Fighter.say) by type; parries and catches come from the hits already, a weapon's name is its pick-up
const SAY_TYPES = { 'K.O.': 'state', COUNTER: 'state', DIZZY: 'state', STAGGER: 'state', ARMOR: 'state', CRUMPLE: 'state', DISARM: 'state',
  JUST: 'defence', 'GUARD CANCEL': 'defence', PUSH: 'defence', THROW: 'throw', BREAK: 'throw', WALL: 'fall', 'WALL BOUNCE': 'fall', BOUNCE: 'fall',
  TECH: 'fall', RECOVER: 'fall', SUPER: 'movement', CHASE: 'movement', 'WALL JUMP': 'movement', CLASH: 'hit', DEFLECT: 'hit', POWER: 'item', PARRY: null, CATCH: null };
const sayType = s => s in SAY_TYPES ? SAY_TYPES[s] : WEAPONS[s] ? 'item' : 'meta'; // the rest: waves, stance names
const BTN_NAMES = { punch: 'P', kick: 'K', special: 'S', hop: 'jump' }, HELD_NAMES = { left: '←', right: '→', up: '↑', down: '↓', guard: 'G' };

const rp = { reel: null, master: null, view: null, frames: [], T: [0], N: 0, events: [], n: 0, t: 0, show: new Set(Object.keys(EVENT_TYPES)), sel: new Set(),
  footOn: true, fsel: null, filter: '', sort: { k: 't', dir: 1 }, hover: null, drag: null, scrollTo: null, lanes: {}, v: [0, 1], fold: new Set(), base: [], mx: -1, my: -1 };
const fmtT = t => t.toFixed(2) + 's';
const who = id => id < 0 ? '' : 'P' + (id + 1);

// ---------- the reel: the master plays it, recording events and the fighter lanes ----------
function loadReel(rep, name) {
  rep.marks ||= []; rep.footage ||= { in: null, out: null, spans: [] };
  rp.reel = { rep, name: name || rep.scenario, edits: 0 };
  const w = rp.master = replayWorld(rep);
  w.loop = false; // the recording ends at its K.O. (a play fight's log starts at its last restart)
  rp.frames = w.playback.frames; rp.rec = []; rp.lanes = {};
  w.rec = e => { const def = e.type === 'parry' || e.type === 'block' || e.type === 'catch', type = e.type === 'say' ? sayType(e.name) : def ? 'defence' : e.type;
    if (type) rp.rec.push({ ...e, kind: e.type, type, name: def ? `${e.type} ${e.name}`.trim() : e.name }); };
  simFrom(0);
  rp.reel.desync = w.desync; // against the file's own checksums; edits make those meaningless, so they go
  w.playback.sums = {}; w.playback.end = null;
  rp.v = [0, rpEnd()];
  rp.view = replayWorld(rep); rp.view.loop = false; rp.view.replaying = true;
  rpSeek(0);
}
const fstate = f => ({ kd: f.kd, gr: f.grounded, dash: f.dashT > 0, st: f.stanceI, wp: f.ch.weapon });
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
    for (const f of w.fighters) {
      diffFighter(f, i, prev);
      const l = rp.lanes[f.id] ??= { id: f.id, name: f.ch.name, col: f.col[0], max: f.c('health'), hp: [], stun: [], fs: [] }; // per frame, for the fighter rows
      l.hp[i] = f.hp; l.stun[i] = f.stunM / (f.c('dizzyAt') || 1); l.fs[i] = frameState(f);
    }
    for (const s of w.shots) if (!s.seen) { s.seen = true; rp.rec.push({ f: i, type: 'item', kind: 'shot', who: s.owner.id, name: 'shot ' + s.look }); }
  }
  rp.N = w.log.length;
  rp.T = rp.frames.reduce((a, f) => (a.push(a[a.length - 1] + f[0]), a), [0]);
  rp.base = [...inputEvents(rp.frames.slice(0, rp.N), w.ctl[0] === 'human' ? w.a.id : -1), ...rp.rec, ...comboSpans(rp.rec)];
  rebuildEvents();
}
// the recorded events plus the bookmarks (kept in the replay file as marks: [{ f, name }]), in frame order
function rebuildEvents() {
  const marks = rp.reel.rep.marks.map((m, j) => ({ f: m.f, type: 'meta', kind: 'mark', who: -1, name: '⚑ ' + m.name, mark: j }));
  rp.events = [...rp.base, ...marks].sort((a, b) => a.f - b.f).map((e, i) => ({ ...e, i }));
  rp.sel.clear();
}
// combos: the hits in a row on one fighter (each hit carries its count), as spans from the first hit to the last
function comboSpans(evs) {
  const open = {}, out = [], close = c => { if (c?.n > 1) out.push({ f: c.f, end: c.last, type: 'hit', kind: 'combo', who: c.att, name: `${c.n}-hit combo`, data: { vic: c.vic, dmg: c.dmg } }); };
  for (const e of evs) {
    if (e.kind !== 'hit') continue;
    const v = e.data.vic, c = open[v];
    if (e.data.combo > 1 && c) Object.assign(c, { n: e.data.combo, last: e.f, dmg: c.dmg + e.data.dmg });
    else { close(c); open[v] = { f: e.f, last: e.f, n: 1, att: e.who, vic: v, dmg: e.data.dmg }; }
  }
  Object.values(open).forEach(close);
  return out;
}
// what changed on a fighter this frame: falls, jumps, dashes, stance and weapon
function diffFighter(f, i, prev) {
  const p = prev[f.id], s = prev[f.id] = fstate(f);
  if (!p) return;
  const ev = (type, name) => rp.rec.push({ f: i, type, kind: 'state', who: f.id, name });
  if (s.kd !== p.kd) ev('fall', s.kd === 'fly' ? 'launched' : s.kd === 'down' ? 'down' : 'wake up');
  if (!s.gr && p.gr && !s.kd && !f.heldBy) ev('movement', 'jump');
  if (s.dash && !p.dash) ev('movement', f.running ? 'run' : 'dash');
  if (s.st !== p.st) ev('meta', 'stance ' + f.st.name);
  if (!s.wp && p.wp) ev('item', 'lost ' + p.wp);
}
// the human's inputs: presses as points, held directions and guard as spans, macros
function inputEvents(frames, id) {
  if (id < 0) return [];
  const out = [], open = {};
  frames.forEach(([, inp, mq], i) => {
    for (const k in BTN_NAMES) if (inp[k]) out.push({ f: i, type: 'input', kind: 'press', who: id, name: BTN_NAMES[k], key: k });
    for (const k in HELD_NAMES) {
      if (inp[k] && open[k] === undefined) open[k] = i;
      if (!inp[k] && open[k] !== undefined) { out.push({ f: open[k], end: i, type: 'input', kind: 'held', who: id, name: HELD_NAMES[k], key: k }); delete open[k]; }
    }
    if (mq) out.push({ f: i, type: 'input', kind: 'macro', who: id, name: 'macro ' + mq });
  });
  for (const k in open) out.push({ f: open[k], end: frames.length, type: 'input', kind: 'held', who: id, name: HELD_NAMES[k], key: k });
  return out;
}
const evDetail = e => [e.data?.vic !== undefined && e.data.vic !== e.who ? '→ ' + who(e.data.vic) : '', e.data?.dmg ? Math.round(e.data.dmg) + ' dmg' : '',
  e.kind === 'hit' && e.data.combo > 1 ? e.data.combo + '-hit' : '', e.data?.height || '', e.end !== undefined ? fmtT(rp.T[e.end] - rp.T[e.f]) : ''].filter(Boolean).join(' · ');
const evText = e => `${fmtT(rp.T[e.f])} · ${who(e.who)} ${e.name}${evDetail(e) ? ' · ' + evDetail(e) : ''}`;
const shownEvents = () => rp.events.filter(e => rp.show.has(e.type));

// ---------- editing inputs: every edit changes the frames, then the master plays on from the first changed frame ----------
const selInputs = () => rp.events.filter(e => rp.sel.has(e.i) && e.type === 'input' && e.kind !== 'macro');
const encodeFrames = () => rp.frames.map(([dt, inp, mq]) => [dt, rp.reel.rep.keys.reduce((m, k, i) => m | (inp[k] ? 1 << i : 0), 0), ...mq ? [mq] : []]);
const reelSnap = () => JSON.stringify({ frames: encodeFrames(), marks: rp.reel.rep.marks, footage: rp.reel.rep.footage });
// undo / redo (the shared stack in studio.js): the frames and bookmarks as they were; the master replays from the first frame that differs
function reelRestore(snap) {
  if (!rp.reel) return;
  const { frames, marks, footage } = JSON.parse(snap), keys = rp.reel.rep.keys, now = encodeFrames();
  let k = 0;
  while (k < frames.length && k < now.length && JSON.stringify(frames[k]) === JSON.stringify(now[k])) k++;
  rp.frames.splice(0, rp.frames.length, ...frames.map(([dt, m, mq]) => [dt, Object.fromEntries(keys.map((key, i) => [key, !!(m >> i & 1)])), mq || null]));
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
}
function rpStep() {
  const [dt, inp, mq] = rp.frames[rp.n];
  if (mq) rp.view.macro = new Script(parseMacro(mq));
  rp.view.advance(dt, inp);
  rp.n++;
}
// the frame playing at time t; nearFrame: the frame that starts nearest to t (for dragging onto frames)
const nearFrame = t => { const f = frameAt(t); return f < rp.N && t - rp.T[f] > (rp.T[f + 1] - rp.T[f]) / 2 ? f + 1 : f; };
const frameAt = t => { let lo = 0, hi = rp.N; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (rp.T[m] <= t) lo = m; else hi = m - 1; } return lo; };

// ---------- layout: the fight on top (beside the event table when open), the timeline under it ----------
// the timeline: a minimap of the whole fight, the ruler, then rows: per fighter its health and stun curves (with combo bands) and its
// frame-meter strip (folded: the strip only), then a lane per shown event type. Wheel zooms, Shift+wheel pans, the minimap moves the window
const RP_LABEL = 92, MINI = 12, RULER = 18, PRESS_COLS = { P: '#c0392b', K: '#2c6fb0', S: '#8e44ad', jump: '#27ae60' };
function rpLanes() { const has = new Set(rp.events.map(e => e.type)); return Object.keys(EVENT_TYPES).filter(t => rp.show.has(t) && has.has(t)); }
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
  const [col, icon] = EVENT_TYPES[r.type], inp = r.type === 'input', near = {};
  glyph(icon, L.tl.x + 2 * dpr, r.y + 11 * dpr, col, 11); text(r.type, L.tl.x + 18 * dpr, r.y + 10 * dpr, col, 10, 'bold');
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
  if (r?.kind !== 'type' || x < L.tx) return null;
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
  drawCell({ w: rp.view, shot: shotAt(rp.view, rp.n), label: `${rp.reel.name} · engine v${rp.reel.rep.version}` }, pv, { full: true, plot: false });
  drawCaption(ctx, rp.n, pv);
  drawRpTimeline();
}
function rpTip(L, x, y) {
  if (rp.hover) return `${rp.hover.type}: ${evText(rp.hover)}`;
  const r = rowAt(L, y);
  if (!r || r.kind === 'type' || x < L.tx) return r && r.kind !== 'type' ? `${who(r.l.id)} ${r.l.name}: click to ${rp.fold.has(r.l.id) ? 'unfold' : 'fold'} its curves` : '';
  const f = frameAt(xToT(L, x)), l = r.l, st = l.fs[f];
  return `${fmtT(rp.T[f])} · ${who(l.id)} ${l.name}: ${l.max > 0 ? `health ${Math.round(l.hp[f] ?? 0)} / ${l.max} · ` : ''}stun ${Math.round(100 * (l.stun[f] ?? 0))}% · ${st || 'idle'}`;
}
// the timeline's mouse: the minimap moves the window, a fighter's name folds it, the ruler and fighter rows seek; in the lanes a click
// picks an event (⌘ / ⇧ more) and goes there, dragging selected inputs retimes them (a held span's ends: resize), dragging from empty
// space selects what the box covers and a plain click there seeks
function rpMouse(type, x, y, e) {
  if (!rp.reel) return;
  const L = rpLayout(), inTl = y >= L.tl.y, inMini = inTl && y < L.ruler, d = rp.drag;
  rp.mx = x; rp.my = y;
  const toMini = () => { const span = rp.v[1] - rp.v[0], t = (x - L.tx) / L.tw * rpEnd(); rpView(t - span / 2, t + span / 2); };
  if (type === 'down' && inTl) {
    const ev = eventAt(L, x, y), r = rowAt(L, y);
    if (inMini) { rp.drag = { mini: true }; toMini(); }
    else if (r && r.kind !== 'type' && x < L.tx) rp.fold[rp.fold.has(r.l.id) ? 'delete' : 'add'](r.l.id);
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
  if (d?.mini) return toMini();
  if (d?.span) return footDrag(L, x);
  if (d?.seek) return rpSeek(frameAt(snapT(L, x, e)));
  if (d?.ev) { if (d.move) d.d = nearFrame(xToT(L, x)) - d.f0; return; }
  if (d?.box) { Object.assign(d.box, { x, y }); return; }
  rp.hover = inTl ? eventAt(L, x, y) : null;
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
function addMark() {
  if (!rp.reel) return;
  const marks = rp.reel.rep.marks, name = prompt('Bookmark name', `mark ${marks.length + 1}`);
  if (name === null) return;
  marks.push({ f: rp.n, name: name || `mark ${marks.length + 1}` }); marks.sort((a, b) => a.f - b.f);
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
function drawCaption(c, f, r, on = rp.footOn) {
  const s = on && spanAt('label', f);
  if (!s?.text) return;
  const size = Math.max(12, Math.round(r.h / 18 / dpr));
  c.font = `bold ${size * dpr}px ui-monospace, Menlo, monospace`;
  const w = c.measureText(s.text).width + 16 * dpr, y = r.y + r.h - size * dpr * 1.8;
  c.fillStyle = 'rgba(20,20,20,0.7)'; c.fillRect(r.x + (r.w - w) / 2, y - size * dpr * 1.1, w, size * dpr * 1.6);
  text(s.text, r.x + r.w / 2, y, '#fff', size, 'bold', 'center', c);
}
// footage edits are undoable like input edits (they share the snapshot), but play nothing again
function footEdit(fn, key = null) { const snap = reelSnap(); snapshot(() => ({ reel: snap }), key); fn(foot()); syncAll(); }
// a new span over the selection, else a second from the playhead
function addSpan(kind) {
  const s = selSpan(), a = s ? s[0] : rp.n, b = s ? Math.max(s[1], a + 6) : Math.min(rp.N, frameAt(rp.T[rp.n] + 1));
  footEdit(F => { F.spans.push({ kind, a, b, rate: 0.25, zoom: 2, follow: 'both', text: kind === 'label' ? 'caption' : undefined }); rp.fsel = F.spans.length - 1; });
  panels();
}
function drawFootRow(L, r) {
  text('footage', L.tl.x + 18 * dpr, r.y + 11 * dpr, '#555', 10, 'bold'); glyph('theaters', L.tl.x + 2 * dpr, r.y + 12 * dpr, '#555', 11);
  ctx.save(); ctx.beginPath(); ctx.rect(L.tx, r.y, L.tw, r.h); ctx.clip();
  foot().spans.forEach((s, j) => {
    const x0 = tToX(L, rp.T[s.a]), x1 = tToX(L, rp.T[s.b]), [col] = FOOT_KINDS[s.kind], row = s.kind === 'label' ? 2 : s.kind === 'cam' ? 1 : 0, y = r.y + 1 * dpr + row * 6 * dpr;
    ctx.fillStyle = col; ctx.globalAlpha = rp.fsel === j ? 1 : 0.7; ctx.fillRect(x0, y, Math.max(2 * dpr, x1 - x0), 5 * dpr); ctx.globalAlpha = 1;
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
    const s = foot().spans[j], x0 = tToX(L, rp.T[s.a]), x1 = tToX(L, rp.T[s.b]);
    if (x < x0 - 4 * dpr || x > x1 + 4 * dpr) continue;
    const part = Math.abs(x - x0) < 4 * dpr ? 'a' : Math.abs(x - x1) < 4 * dpr ? 'b' : 'move';
    rp.fsel = j; rp.drag = { span: s, part, f0: fr(), a: s.a, b: s.b, snap: reelSnap() }; panels();
    return true;
  }
  rp.fsel = null;
  return false;
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
async function exportReel() {
  if (clip.busy) return;
  const [a, b] = footRange(), o = expSet(), set = clipSet(), fps = set.fps, [W2, H2] = expSize(W / H), fill = set.fit !== 'letterbox';
  const w = rp.view, hud = CFG.hud, frames = [], at = rp.n;
  clip.busy = 'render 0%'; syncAll();
  CFG.hud = o.hud;
  try {
    rpSeek(a);
    let t = 0, next = 0;
    for (let f = a; f < b; f++) {
      if (t >= next - 1e-9) { // a frame of the clip (slowed, one fight frame lasts several: the same picture, which the GIF merges)
        const c = h2canvas(W2, H2), g = c.getContext('2d'), r = { x: 0, y: 0, w: W2, h: H2 };
        g.fillStyle = '#f3f0e8'; g.fillRect(0, 0, W2, H2);
        w.render(g, r, true, { ...shotAt(w, f, true), fill });
        if (o.labels) drawCaption(g, f, r, true);
        if (o.inputs && w.ctl[0] === 'human') drawInputs(w, 10 * dpr, 30 * dpr, g);
        if (o.meter) drawMeter(w, { x: 6 * dpr, y: H2 - 24 * dpr, w: W2 - 12 * dpr, h: 18 * dpr }, true, g);
        const t1 = t + rp.frames[f][0] / rateAt(f, true);
        for (; next <= t1 - 1e-9 || next <= t + 1e-9; next += 1 / fps) frames.push({ c, t: next * 1000 });
      }
      t += rp.frames[f][0] / rateAt(f, true);
      rpStep();
      if ((f - a) % 30 === 0) { clip.busy = `render ${Math.round(100 * (f - a) / (b - a))}%`; syncAll(); await new Promise(r => setTimeout(r)); }
    }
  } finally { CFG.hud = hud; clip.busy = ''; rpSeek(at); }
  await saveClip(frames);
}
function exportPop(e, b) {
  const o = expSet(), set = clipSet(), row = (label, tip, ...els) => h('div', { cls: 'row', tip }, h('span', { textContent: label }), ...els);
  const info = h('p', { cls: 'note' });
  reg(info, () => { const [a, z] = footRange(), [w, ht] = expSize(W / H); let t = 0; for (let f = a; f < z; f++) t += rp.frames[f][0] / rateAt(f, true);
    info.textContent = `${fmtT(rp.T[a])} – ${fmtT(rp.T[z])} · ${t.toFixed(1)}s out · ${w}×${ht} · about ${Math.ceil(t * set.fps)} frames`; });
  const pick = (obj, k, opts, tips, lbl) => seg(opts, () => obj()[k], v => { obj()[k] = v; saveUi(); }, tips, lbl);
  popup(b, h('b', { textContent: 'export the footage' }), info,
    row('format', 'GIF or WebM video', pick(clipSet, 'fmt', CLIP_FMTS, CLIP_TIPS, v => v.toUpperCase())),
    row('fps', 'Frames a second of the clip', pick(clipSet, 'fps', CLIP_FPS, CLIP_TIPS, String)),
    row('aspect', 'The clip\'s shape: the arena\'s own, or a fixed one (16:9 video, 1:1 square, 9:16 phone)', pick(clipSet, 'aspect', Object.keys(CLIP_ASPECTS), CLIP_TIPS, String)),
    row('width', 'The clip\'s width in pixels (the picture is drawn at that size, so it stays sharp)', pick(expSet, 'size', EXP_SIZES, {}, String)),
    row('fit', 'Another shape than the arena\'s: crop to fill it, or fit inside it with bars', pick(clipSet, 'fit', ['crop', 'letterbox'], CLIP_TIPS, String)),
    row('show', 'What is drawn over the fight', ...[['hud', 'Health bars and callouts'], ['labels', 'The label spans\' captions'], ['inputs', 'The input display (your presses)'], ['meter', 'The frame meter']]
      .map(([k, tip]) => toggle(k, tip, () => expSet()[k], v => { expSet()[k] = v; saveUi(); }))),
    h('div', { cls: 'bar' }, button(':download: export', 'Render the in–out range with its slow motion, camera and labels, and save it', () => { closePop(); exportReel(); })));
}

// ---------- toolbar, side panel ----------
function reelFromPlay() {
  const w = lab.mode === 'play' && lab.cells[0]?.w;
  if (!w?.log.length) return alert('No play fight to take: fight a while in play first.');
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
    }), button('all', 'Show every type', () => { rp.show = new Set(Object.keys(EVENT_TYPES)); }, 'mini')),
    editGrp(),
    grp('footage', 'How the replay is shown and exported: in / out, slow motion, camera, labels (the fight stays the same)',
      button('[ in', 'Start the footage at the playhead (I)', () => footEdit(F => { F.in = rp.n; })), button('out ]', 'End the footage at the playhead (O)', () => footEdit(F => { F.out = rp.n; })),
      button(':close:', 'Clear in and out: the whole fight', () => footEdit(F => { F.in = F.out = null; }), 'mini'),
      ...Object.entries(FOOT_KINDS).map(([k, [, tip]]) => button(`:add: ${k}`, `${tip}. Over the selection, else a second from the playhead`, () => addSpan(k))),
      toggle(':visibility:', 'Preview the footage: slow motion, camera, labels and the in–out loop in the view (off: the plain fight)', () => rp.footOn, v => { rp.footOn = v; }),
      button(':download: export', 'Export the in–out range: format, size and shape, overlays', exportPop)),
    grp('view', 'The timeline\'s window: wheel over it zooms, Shift+wheel pans, the minimap moves it',
      button(':zoom_in:', 'Zoom in on the playhead', () => rpZoom(0.5, rp.T[rp.n])), button(':remove:', 'Zoom out', () => rpZoom(2, rp.T[rp.n])),
      button(':unfold_more: fit', 'Show the whole fight', () => rpView(0, rpEnd())), button(':select_all:', 'Zoom to the selection', zoomToSel),
      button(':chevron_left:', 'Previous shown event' + keyTip('prevEvent'), () => rpJump(-1)), button(':chevron_right:', 'Next shown event' + keyTip('nextEvent'), () => rpJump(1))),
    panelsGrp(['events'], { events: 'The events as a table: fuzzy filter, sort, click a row to go there' }),
  ];
}
// per fighter: damage dealt, hits, blocks and parries made, times thrown, the longest and the most damaging combo, when it went down
function rpStats() {
  return Object.values(rp.lanes).map(l => {
    const mine = e => e.who === l.id, on = e => e.data?.vic === l.id, hits = rp.base.filter(e => e.kind === 'hit' && mine(e)), combos = rp.base.filter(e => e.kind === 'combo' && mine(e));
    const ko = rp.base.find(e => e.kind === 'say' && e.name === 'K.O.' && mine(e));
    return { l, rows: [['dealt', Math.round(hits.reduce((s, e) => s + e.data.dmg, 0))], ['hits', hits.length],
      ['blocked', rp.base.filter(e => e.kind === 'block' && on(e)).length], ['parried', rp.base.filter(e => e.kind === 'parry' && on(e)).length],
      ['thrown', rp.base.filter(e => e.kind === 'say' && e.name === 'THROW' && mine(e)).length],
      ['best combo', combos.length ? Math.max(...combos.map(e => +e.name.split('-')[0])) + ' hits' : '–'],
      ['top combo dmg', combos.length ? Math.round(Math.max(...combos.map(e => e.data.dmg))) : '–'], ['K.O.', ko ? fmtT(rp.T[ko.f]) : '–']] };
  });
}
// a footage span in the side panel: go there, its settings (rate / zoom and who / caption), delete; the selected one is marked
function spanRow(sp, j) {
  const set = (k, v) => footEdit(() => { sp[k] = v; }, 'span' + j + k), seg2 = (k, opts, lbl = String) => seg(opts, () => sp[k], v => set(k, v), {}, lbl);
  const cap = sp.kind === 'label' && h('input', { cls: 'macro', value: sp.text || '', tip: 'The caption' });
  if (cap) { cap.addEventListener('input', () => set('text', cap.value)); cap.addEventListener('keydown', e => e.stopPropagation()); }
  return h('div', { cls: 'bar' + (rp.fsel === j ? ' on' : '') }, h('span', { cls: 'chip', style: `background:${FOOT_KINDS[sp.kind][0]}`, tip: FOOT_KINDS[sp.kind][1] }, sp.kind),
    button(`${fmtT(rp.T[sp.a])}–${fmtT(rp.T[sp.b])}`, 'Go to the span and select it', () => { rp.fsel = j; rpSeek(sp.a); app.paused = true; panels(); }, 'mini'),
    sp.kind === 'slow' ? seg2('rate', RATES, v => '×' + v) : sp.kind === 'cam' ? [seg2('zoom', ZOOMS, v => v + '×'), seg2('follow', FOLLOW)] : cap,
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
function rpSide() {
  if (!rp.reel) return [heading('replay', 'Edit a recorded fight: its events on a timeline and in a table.')];
  const r = rp.reel.rep, w = rp.master, old = r.version !== ENGINE_VERSION;
  const counts = Object.keys(EVENT_TYPES).map(t => [t, rp.events.filter(e => e.type === t).length]).filter(([, n]) => n);
  return [
    heading('replay', 'The recorded fight: its scenario, length, fighters and engine version. The events are found by playing it once.'),
    h('p', { cls: 'note', textContent: `${rp.reel.name} · ${fmtT(rp.T[rp.N])} · ${rp.N} frames · engine v${r.version}` }),
    rp.reel.edits ? h('p', { cls: 'note warn', textContent: `Edited (${rp.reel.edits} change${rp.reel.edits > 1 ? 's' : ''}): save to keep it.` }) : null,
    old ? h('p', { cls: 'note warn', textContent: `Recorded with engine v${r.version}, this is v${ENGINE_VERSION}: it may play out differently.` }) : null,
    rp.reel.desync !== null ? h('p', { cls: 'note warn', textContent: `The file goes out of sync with its recording from ${fmtT(rp.T[rp.reel.desync] ?? 0)}.` }) : null,
    h('p', { cls: 'note', textContent: w.fighters.map(f => `${who(f.id)} ${f.ch.name}`).join(' · ') }),
    heading('stats', 'Per fighter: damage dealt, hits landed, blocks and parries made, times thrown, its longest and most damaging combo, when it was knocked out.'),
    h('table', { cls: 'stats' }, h('tr', {}, h('th'), ...rpStats().map(({ l }) => h('th', { textContent: `${who(l.id)} ${l.name}`, style: `color:${l.col}` }))),
      ...rpStats()[0]?.rows.map((r, i) => h('tr', {}, h('td', { textContent: r[0] }), ...rpStats().map(st => h('td', { textContent: st.rows[i][1] })))) || []),
    heading('footage', 'The footage edits: in and out, and the spans (slow motion, camera, label) in the timeline\'s footage row; drag a span to move it, its ends to resize it. Saved in the replay file; the export uses them.'),
    h('p', { cls: 'note', textContent: `in ${fmtT(rp.T[footRange()[0]])} · out ${fmtT(rp.T[footRange()[1]])}` }),
    ...foot().spans.map((sp, j) => spanRow(sp, j)),
    heading('bookmarks', 'Named moments, saved in the replay file. \\ adds one at the playhead, ⇧[ ⇧] go to the previous / next.'),
    ...rp.reel.rep.marks.map((m, j) => h('div', { cls: 'bar' }, button(`⚑ ${m.name}`, `Go to ${fmtT(rp.T[m.f])} (f${m.f})`, () => { rpSeek(m.f); rpFollow(); app.paused = true; }),
      h('span', { cls: 'note', textContent: fmtT(rp.T[m.f]) }),
      crud({ rename: ['Rename the bookmark', () => { const n = prompt('Bookmark name', m.name); if (n) { m.name = n; rebuildEvents(); panels(); } }], delete: ['Delete the bookmark', () => { rp.reel.rep.marks.splice(j, 1); rebuildEvents(); panels(); }] }))),
    h('div', { cls: 'bar' }, button(':add: bookmark', 'Add a bookmark at the playhead' + keyTip('mark'), addMark)),
    heading('events', 'How many events of each type the replay has (the toolbar\'s types show and hide them).'),
    h('div', { cls: 'bar' }, counts.map(([t, n]) => { const s = h('span', { cls: 'chip', style: `background:${EVENT_TYPES[t][0]}`, tip: EVENT_TYPES[t][2] }, ...rich(`:${EVENT_TYPES[t][1]}: ${t} ${n}`)); return s; })),
  ];
}

const replayMode = {
  enter() { if (!rp.reel && lab.mode === 'play' && lab.cells[0]?.w.log.length) { loadReel(makeReplay(lab.cells[0].w, lab.playback?.scenario || lab.scen)); app.paused = true; } },
  restart() { if (rp.reel) rpSeek(0); },
  worlds: () => [], // the shown fight is played here (tick), not by the frame loop
  debugWorld: () => rp.view,
  tick(dt) {
    if (!rp.reel || rp.drag || clip.busy) return; // an export plays the shown fight itself
    rp.t += dt * rateAt(rp.n);
    while (rp.n < rp.N && rp.T[rp.n + 1] <= rp.t + 1e-9) rpStep();
    rpFollow();
    const [a, b] = footRange();
    if (rp.n >= (rp.footOn ? b : rp.N)) { if (app.loop) rpSeek(rp.footOn ? a : 0); else app.paused = true; }
  },
  rewind(n) { if (rp.reel) rpSeek(rp.n - n); },
  scrub(f) { if (rp.reel) rpSeek(frameAt(f * rp.T[rp.N])); },
  preview: () => rpLayout().pv,
  clipRects: () => rp.reel ? [{ key: 'replay', r: rpLayout().pv }] : [],
  render: rpRender,
  ctxBar: rpCtx,
  side: rpSide,
  open: ['replay', 'footage', 'stats', 'bookmarks', 'events'],
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
