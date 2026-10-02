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
  filter: '', sort: { k: 't', dir: 1 }, hover: null, drag: null, scrollTo: null, lanes: {}, v: [0, 1], fold: new Set(), base: [], mx: -1, my: -1 };
const fmtT = t => t.toFixed(2) + 's';
const who = id => id < 0 ? '' : 'P' + (id + 1);

// ---------- the reel: simulate once, recording events ----------
function loadReel(rep, name) {
  rp.reel = { rep, name: name || rep.scenario };
  const w = replayWorld(rep), evs = [];
  w.loop = false; // the recording ends at its K.O. (a play fight's log starts at its last restart)
  w.rec = e => { const type = e.type === 'say' ? sayType(e.name) : e.type === 'parry' || e.type === 'block' || e.type === 'catch' ? 'defence' : e.type;
    if (type) evs.push({ ...e, kind: e.type, type, name: e.type === 'block' || e.type === 'parry' || e.type === 'catch' ? `${e.type} ${e.name}`.trim() : e.name }); };
  const frames = w.playback.frames, prev = {}, lanes = {};
  for (let i = 0; i < frames.length && !w.done; i++) {
    w.advance(frames[i][0], NOIN);
    for (const f of w.fighters) {
      diffFighter(f, i, prev, evs);
      const l = lanes[f.id] ??= { id: f.id, name: f.ch.name, col: f.col[0], max: f.c('health'), hp: [], stun: [], fs: [] }; // per frame, for the fighter rows
      l.hp[i] = f.hp; l.stun[i] = f.stunM / (f.c('dizzyAt') || 1); l.fs[i] = frameState(f);
    }
    for (const s of w.shots) if (!s.seen) { s.seen = true; evs.push({ f: i, type: 'item', kind: 'shot', who: s.owner.id, name: 'shot ' + s.look }); }
  }
  evs.push(...comboSpans(evs));
  rp.master = w; rp.N = w.log.length; rp.frames = frames.slice(0, rp.N);
  rp.T = rp.frames.reduce((a, f) => (a.push(a[a.length - 1] + f[0]), a), [0]);
  rp.base = [...inputEvents(rp.frames, w.ctl[0] === 'human' ? w.a.id : -1), ...evs];
  rp.lanes = lanes; rp.v = [0, rp.T[rp.N] || 1]; rep.marks ||= [];
  rebuildEvents();
  rp.view = replayWorld(rep); rp.view.loop = false; rp.view.replaying = true;
  rpSeek(0);
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
// the timeline: a minimap of the whole fight, the ruler, then rows: per fighter its health and stun curves (with combo bands) and its
// frame-meter strip (folded: the strip only), then a lane per shown event type. Wheel zooms, Shift+wheel pans, the minimap moves the window
const RP_LABEL = 92, MINI = 12, RULER = 18, PRESS_COLS = { P: '#c0392b', K: '#2c6fb0', S: '#8e44ad', jump: '#27ae60' };
function rpLanes() { const has = new Set(rp.events.map(e => e.type)); return Object.keys(EVENT_TYPES).filter(t => rp.show.has(t) && has.has(t)); }
function rpRows() {
  const rows = [];
  for (const l of Object.values(rp.lanes).slice(0, 6)) rows.push(...rp.fold.has(l.id) ? [] : [{ kind: 'hp', l, h: 26 }], { kind: 'meter', l, h: 6 });
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
    if (r.kind === 'type') drawTypeRow(L, r); else drawFighterRow(L, r);
  });
  const px = tToX(L, rp.T[rp.n]); // the playhead
  if (px >= L.tx - 1 && px <= L.tx + L.tw + 1) {
    ctx.fillStyle = RED[0]; ctx.fillRect(px - dpr, L.ruler, 2 * dpr, tl.y + tl.h - L.ruler);
    const lbl = `${fmtT(rp.T[rp.n])} · f${rp.n}`, lw = (lbl.length * 6.5 + 8) * dpr, lx = Math.min(px + 4 * dpr, tl.x + tl.w - lw);
    ctx.fillRect(lx, L.ruler, lw, 14 * dpr); text(lbl, lx + 4 * dpr, L.ruler + 11 * dpr, '#fff', 10, 'bold');
  }
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
    const x = tToX(L, rp.T[e.f]), xe = e.end !== undefined ? tToX(L, rp.T[e.end]) : x, on = rp.sel.has(e.i) || rp.hover === e;
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
  drawCell({ w: rp.view, label: `${rp.reel.name} · engine v${rp.reel.rep.version}` }, rpLayout().pv, { full: true, plot: false });
  drawRpTimeline();
}
function rpTip(L, x, y) {
  if (rp.hover) return `${rp.hover.type}: ${evText(rp.hover)}`;
  const r = rowAt(L, y);
  if (!r || r.kind === 'type' || x < L.tx) return r && r.kind !== 'type' ? `${who(r.l.id)} ${r.l.name}: click to ${rp.fold.has(r.l.id) ? 'unfold' : 'fold'} its curves` : '';
  const f = frameAt(xToT(L, x)), l = r.l, st = l.fs[f];
  return `${fmtT(rp.T[f])} · ${who(l.id)} ${l.name}: ${l.max > 0 ? `health ${Math.round(l.hp[f] ?? 0)} / ${l.max} · ` : ''}stun ${Math.round(100 * (l.stun[f] ?? 0))}% · ${st || 'idle'}`;
}
function rpMouse(type, x, y, e) {
  if (!rp.reel) return;
  const L = rpLayout(), inTl = y >= L.tl.y, inMini = inTl && y < L.ruler;
  rp.mx = x; rp.my = y;
  if (type === 'down' && inTl) {
    const ev = eventAt(L, x, y), r = rowAt(L, y);
    if (inMini) { rp.drag = { mini: true }; const span = rp.v[1] - rp.v[0], t = (x - L.tx) / L.tw * rpEnd(); rpView(t - span / 2, t + span / 2); }
    else if (r && r.kind !== 'type' && x < L.tx) { rp.fold[rp.fold.has(r.l.id) ? 'delete' : 'add'](r.l.id); }
    else if (ev) { rp.sel = new Set([ev.i]); rp.scrollTo = ev.i; rpSeek(ev.f); app.paused = true; }
    else if (x >= L.tx) { rp.drag = { seek: true }; rpSeek(frameAt(snapT(L, x, e))); }
    return;
  }
  if (type === 'up') { rp.drag = null; return; }
  if (rp.drag?.mini) { const span = rp.v[1] - rp.v[0], t = (x - L.tx) / L.tw * rpEnd(); rpView(t - span / 2, t + span / 2); return; }
  if (rp.drag?.seek) { rpSeek(frameAt(snapT(L, x, e))); return; }
  rp.hover = inTl ? eventAt(L, x, y) : null;
  const tip = inTl && rpTip(L, x, y);
  if (tip) canvas.dataset.tip = tip; else delete canvas.dataset.tip;
  const r = inTl && rowAt(L, y);
  cursor(inMini ? 'ew-resize' : rp.hover || (r && r.kind !== 'type' && x < L.tx) ? 'pointer' : inTl && x >= L.tx ? 'col-resize' : 'default');
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
    grp('view', 'The timeline\'s window: wheel over it zooms, Shift+wheel pans, the minimap moves it',
      button(':zoom_in:', 'Zoom in on the playhead', () => rpZoom(0.5, rp.T[rp.n])), button(':remove:', 'Zoom out', () => rpZoom(2, rp.T[rp.n])),
      button(':unfold_more: fit', 'Show the whole fight', () => rpView(0, rpEnd())),
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
    heading('stats', 'Per fighter: damage dealt, hits landed, blocks and parries made, times thrown, its longest and most damaging combo, when it was knocked out.'),
    h('table', { cls: 'stats' }, h('tr', {}, h('th'), ...rpStats().map(({ l }) => h('th', { textContent: `${who(l.id)} ${l.name}`, style: `color:${l.col}` }))),
      ...rpStats()[0]?.rows.map((r, i) => h('tr', {}, h('td', { textContent: r[0] }), ...rpStats().map(st => h('td', { textContent: st.rows[i][1] })))) || []),
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
    if (!rp.reel || rp.drag) return;
    rp.t += dt;
    while (rp.n < rp.N && rp.T[rp.n + 1] <= rp.t + 1e-9) rpStep();
    rpFollow();
    if (rp.n >= rp.N) { if (app.loop) rpSeek(0); else app.paused = true; }
  },
  rewind(n) { if (rp.reel) rpSeek(rp.n - n); },
  scrub(f) { if (rp.reel) rpSeek(frameAt(f * rp.T[rp.N])); },
  preview: () => rpLayout().pv,
  clipRects: () => rp.reel ? [{ key: 'replay', r: rpLayout().pv }] : [],
  render: rpRender,
  ctxBar: rpCtx,
  side: rpSide,
  open: ['replay', 'stats', 'bookmarks', 'events'],
  overlay: () => rp.reel && stageOpen() === 'events' ? [eventTable()] : [],
  mouse: rpMouse,
  wheel: rpWheel,
  key(e, a) {
    const k = { prevEvent: () => rpJump(-1), nextEvent: () => rpJump(1), prevMark: () => rpJump(-1, true), nextMark: () => rpJump(1, true), mark: addMark }[a];
    if (!k || !rp.reel) return false;
    k(); return true;
  },
  hint: () => 'timeline: click or drag to go to a moment (snaps to events, Alt: not) · click an event to select it · wheel zooms, Shift+wheel pans, drag the minimap · [ ] previous / next event · ⇧[ ⇧] bookmarks · \\ add a bookmark · click a fighter\'s name: fold its curves',
};
