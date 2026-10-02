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
  filter: '', sort: { k: 't', dir: 1 }, hover: null, drag: false, scrollTo: null };
const fmtT = t => t.toFixed(2) + 's';
const who = id => id < 0 ? '' : 'P' + (id + 1);

// ---------- the reel: simulate once, recording events ----------
function loadReel(rep, name) {
  rp.reel = { rep, name: name || rep.scenario };
  const w = replayWorld(rep), evs = [];
  w.loop = false; // the recording ends at its K.O. (a play fight's log starts at its last restart)
  w.rec = e => { const type = e.type === 'say' ? sayType(e.name) : e.type === 'parry' || e.type === 'block' || e.type === 'catch' ? 'defence' : e.type;
    if (type) evs.push({ ...e, kind: e.type, type, name: e.type === 'block' || e.type === 'parry' || e.type === 'catch' ? `${e.type} ${e.name}`.trim() : e.name }); };
  const frames = w.playback.frames, prev = {};
  for (let i = 0; i < frames.length && !w.done; i++) {
    w.advance(frames[i][0], NOIN);
    for (const f of w.fighters) diffFighter(f, i, prev, evs);
    for (const s of w.shots) if (!s.seen) { s.seen = true; evs.push({ f: i, type: 'item', kind: 'shot', who: s.owner.id, name: 'shot ' + s.look }); }
  }
  evs.push(...comboSpans(evs));
  rp.master = w; rp.N = w.log.length; rp.frames = frames.slice(0, rp.N);
  rp.T = rp.frames.reduce((a, f) => (a.push(a[a.length - 1] + f[0]), a), [0]);
  rp.events = [...inputEvents(rp.frames, w.ctl[0] === 'human' ? w.a.id : -1), ...evs].sort((a, b) => a.f - b.f).map((e, i) => ({ ...e, i }));
  rp.view = replayWorld(rep); rp.view.loop = false; rp.view.replaying = true;
  rp.sel.clear(); rpSeek(0);
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
function diffFighter(f, i, prev, evs) {
  const p = prev[f.id], s = { kd: f.kd, gr: f.grounded, dash: f.dashT > 0, st: f.stanceI, wp: f.ch.weapon };
  prev[f.id] = s;
  if (!p) return;
  const ev = (type, name, data) => evs.push({ f: i, type, kind: 'state', who: f.id, name, data });
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
const frameAt = t => { let lo = 0, hi = rp.N; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (rp.T[m] <= t) lo = m; else hi = m - 1; } return lo; };

// ---------- layout: the fight on top (beside the event table when open), the timeline under it ----------
const RP_LABEL = 92;
function rpLanes() { const has = new Set(rp.events.map(e => e.type)); return Object.keys(EVENT_TYPES).filter(t => rp.show.has(t) && has.has(t)); }
function rpLayout() {
  const W = canvas.width, H = canvas.height, lh = 14 * dpr, th = Math.min(H * 0.5, 24 * dpr + Math.max(1, rpLanes().length) * lh + 8 * dpr);
  const tl = { x: 8 * dpr, y: H - th, w: W - 16 * dpr, h: th, lh }, table = stageOpen() === 'events';
  return { tl, tx: tl.x + RP_LABEL * dpr, tw: tl.w - RP_LABEL * dpr, pv: { x: 0, y: 0, w: table ? Math.round(W * 0.55) : W, h: H - th - 6 * dpr } };
}
const tToX = (L, t) => L.tx + t / (rp.T[rp.N] || 1) * L.tw;
const xToT = (L, x) => clamp((x - L.tx) / L.tw, 0, 1) * rp.T[rp.N];
// a step for the ruler's labels: at least 70 px apart
const rulerStep = (L) => [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find(s => s / (rp.T[rp.N] || 1) * L.tw >= 70 * dpr) || 120;

function drawRpTimeline() {
  const L = rpLayout(), { tl } = L, end = rp.T[rp.N] || 1;
  ctx.fillStyle = '#ebe6dc'; ctx.fillRect(tl.x, tl.y, tl.w, tl.h);
  const st = rulerStep(L);
  for (let t = 0; t <= end + 1e-9; t += st / 5) { // ruler: a tick each fifth of a step, a label each step
    const x = tToX(L, t), big = Math.abs(t / st - Math.round(t / st)) < 1e-6;
    ctx.fillStyle = big ? '#999' : '#ccc'; ctx.fillRect(x, tl.y, dpr, big ? 8 * dpr : 4 * dpr);
    if (big) text(+t.toFixed(2) + 's', x + 3 * dpr, tl.y + 16 * dpr, '#888', 10);
  }
  rpLanes().forEach((type, li) => {
    const [col, icon] = EVENT_TYPES[type], y = tl.y + 24 * dpr + li * tl.lh;
    if (li % 2) { ctx.fillStyle = '#0000000a'; ctx.fillRect(tl.x, y, tl.w, tl.lh); }
    glyph(icon, tl.x + 2 * dpr, y + 11 * dpr, col, 11); text(type, tl.x + 18 * dpr, y + 10 * dpr, col, 10, 'bold');
    for (const e of rp.events) {
      if (e.type !== type) continue;
      const x = tToX(L, rp.T[e.f]), on = rp.sel.has(e.i) || rp.hover === e;
      ctx.fillStyle = col;
      if (e.end !== undefined) { ctx.globalAlpha = 0.55; ctx.fillRect(x, y + 4 * dpr, Math.max(dpr, tToX(L, rp.T[e.end]) - x), tl.lh - 8 * dpr); ctx.globalAlpha = 1; }
      ctx.fillRect(x - (on ? 1.5 : 0.75) * dpr, y + 2 * dpr, (on ? 3 : 1.5) * dpr, tl.lh - 4 * dpr);
      if (on) { ctx.strokeStyle = '#222'; ctx.lineWidth = dpr; ctx.strokeRect(x - 3 * dpr, y + 1 * dpr, 6 * dpr, tl.lh - 2 * dpr); }
    }
  });
  const px = tToX(L, rp.T[rp.n]); // the playhead
  ctx.fillStyle = RED[0]; ctx.fillRect(px - dpr, tl.y, 2 * dpr, tl.h);
  const lbl = `${fmtT(rp.T[rp.n])} · f${rp.n}`, lw = (lbl.length * 6.5 + 8) * dpr, lx = Math.min(px + 4 * dpr, tl.x + tl.w - lw);
  ctx.fillStyle = RED[0]; ctx.fillRect(lx, tl.y, lw, 14 * dpr); text(lbl, lx + 4 * dpr, tl.y + 11 * dpr, '#fff', 10, 'bold');
}
// the event under the mouse in the timeline (within 4 px of its tick, or inside its span)
function eventAt(L, x, y) {
  const li = Math.floor((y - L.tl.y - 24 * dpr) / L.tl.lh), type = rpLanes()[li];
  if (!type || x < L.tx) return null;
  let best = null, bd = 5 * dpr;
  for (const e of rp.events) {
    if (e.type !== type) continue;
    const x0 = tToX(L, rp.T[e.f]), d = e.end !== undefined && x >= x0 && x <= tToX(L, rp.T[e.end]) ? 4 * dpr : Math.abs(x - x0);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function rpRender() {
  clear();
  const L = rpLayout();
  if (!rp.reel) {
    text('No replay yet: fight in play, then come back here (or press "from play"), or open a replay file.', canvas.width / 2, canvas.height / 2, '#888', 13, '', 'center');
    return;
  }
  drawCell({ w: rp.view, label: `${rp.reel.name} · engine v${rp.reel.rep.version}` }, L.pv, { full: true, plot: false });
  drawRpTimeline();
}
function rpMouse(type, x, y, e) {
  if (!rp.reel) return;
  const L = rpLayout(), inTl = y >= L.tl.y;
  if (type === 'down' && inTl) {
    const ev = eventAt(L, x, y);
    if (ev) { rp.sel = new Set([ev.i]); rp.scrollTo = ev.i; rpSeek(ev.f); app.paused = true; }
    else if (x >= L.tx) { rp.drag = true; rpSeek(frameAt(xToT(L, x))); }
    return;
  }
  if (type === 'up') { rp.drag = false; return; }
  if (rp.drag) { rpSeek(frameAt(xToT(L, x))); return; }
  rp.hover = inTl ? eventAt(L, x, y) : null;
  if (rp.hover) canvas.dataset.tip = `${rp.hover.type}: ${evText(rp.hover)}`; else delete canvas.dataset.tip;
  cursor(rp.hover ? 'pointer' : inTl && x >= L.tx ? 'col-resize' : 'default');
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
      tr.onclick = () => { rp.sel = new Set([e.i]); rpSeek(e.f); app.paused = true; syncAll(); };
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
  wrap.addEventListener('scroll', draw);
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
  const save = button(':save: save', 'Save this replay as a replay file', () => saveBlob(`${rp.reel.name.replace(/\W+/g, '-')}.replay.json`, new Blob([JSON.stringify(rp.reel.rep)], { type: 'application/json' })));
  reg(save, () => { save.disabled = !rp.reel; });
  return [
    grp('reel', 'The replay being edited: from the play fight or a file; save it', fromPlay,
      button(':upload: open', 'Open a replay file', () => pickReplay(r => { loadReel(r); app.paused = true; panels(); })), save),
    grp('types', 'The event types shown in the timeline and the table', Object.entries(EVENT_TYPES).map(([k, [col, icon, tip]]) => {
      const t = toggle(`:${icon}:`, `${k}: ${tip}`, () => rp.show.has(k), v => { rp.show[v ? 'add' : 'delete'](k); });
      t.style.color = col; return t;
    }), button('all', 'Show every type', () => { rp.show = new Set(Object.keys(EVENT_TYPES)); }, 'mini')),
    panelsGrp(['events'], { events: 'The events as a table: fuzzy filter, sort, click a row to go there' }),
  ];
}
function rpSide() {
  if (!rp.reel) return [heading('replay', 'Edit a recorded fight: its events on a timeline and in a table.')];
  const r = rp.reel.rep, w = rp.master, old = r.version !== ENGINE_VERSION;
  const counts = Object.keys(EVENT_TYPES).map(t => [t, rp.events.filter(e => e.type === t).length]).filter(([, n]) => n);
  return [
    heading('replay', 'The recorded fight: its scenario, length, fighters and engine version. The events are found by playing it once.'),
    h('p', { cls: 'note', textContent: `${rp.reel.name} · ${fmtT(rp.T[rp.N])} · ${rp.N} frames · engine v${r.version}` }),
    old ? h('p', { cls: 'note warn', textContent: `Recorded with engine v${r.version}, this is v${ENGINE_VERSION}: it may play out differently.` }) : null,
    w.desync !== null ? h('p', { cls: 'note warn', textContent: `Out of sync with the recording from ${fmtT(rp.T[w.desync] ?? 0)}.` }) : null,
    h('p', { cls: 'note', textContent: w.fighters.map(f => `${who(f.id)} ${f.ch.name}`).join(' · ') }),
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
    if (!rp.reel || rp.drag) return;
    rp.t += dt;
    while (rp.n < rp.N && rp.T[rp.n + 1] <= rp.t + 1e-9) rpStep();
    if (rp.n >= rp.N) { if (app.loop) rpSeek(0); else app.paused = true; }
  },
  rewind(n) { if (rp.reel) rpSeek(rp.n - n); },
  scrub(f) { if (rp.reel) rpSeek(frameAt(f * rp.T[rp.N])); },
  preview: () => rpLayout().pv,
  clipRects: () => rp.reel ? [{ key: 'replay', r: rpLayout().pv }] : [],
  render: rpRender,
  ctxBar: rpCtx,
  side: rpSide,
  open: ['replay', 'events'],
  overlay: () => rp.reel && stageOpen() === 'events' ? [eventTable()] : [],
  mouse: rpMouse,
  hint: () => 'timeline: click or drag to go to a moment · click an event to select it · hover: what happened · the types in the toolbar filter the lanes and the table',
};
