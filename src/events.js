'use strict';
// ---------- events: what happens in a fight, recorded from World.ev (moves, hits, callouts) and from the fighters' state frame by frame ----------
// Pure logic (no DOM): the replay tab, the scenario simulator and the MCP server (tools/) share it.

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
// a World.ev event with its type (null: left out, it is already in another one)
function classifyEvent(e) {
  const def = e.type === 'parry' || e.type === 'block' || e.type === 'catch', type = e.type === 'say' ? sayType(e.name) : def ? 'defence' : e.type;
  return type ? { ...e, kind: e.type, type, name: def ? `${e.type} ${e.name}`.trim() : e.name } : null;
}
const fstate = f => ({ kd: f.kd, gr: f.grounded, dash: f.dashT > 0, st: f.stanceI, wp: f.ch.weapon });
// what changed on a fighter this frame (falls, jumps, dashes, stance, weapon) into out
function diffFighter(f, i, prev, out) {
  const p = prev[f.id], s = prev[f.id] = fstate(f);
  if (!p) return;
  const ev = (type, name) => out.push({ f: i, type, kind: 'state', who: f.id, name });
  if (s.kd !== p.kd) ev('fall', s.kd === 'fly' ? 'launched' : s.kd === 'down' ? 'down' : 'wake up');
  if (!s.gr && p.gr && !s.kd && !f.heldBy) ev('movement', 'jump');
  if (s.dash && !p.dash) ev('movement', f.running ? 'run' : 'dash');
  if (s.st !== p.st) ev('meta', 'stance ' + f.st.name);
  if (!s.wp && p.wp) ev('item', 'lost ' + p.wp);
}
// after frame i: each fighter's changes and its lane values (health, stun, frame-meter state), and the shots fired
function recordFrame(w, i, prev, lanes, out) {
  for (const f of w.fighters) {
    diffFighter(f, i, prev, out);
    const l = lanes[f.id] ??= { id: f.id, name: f.ch.name, col: f.col[0], max: f.c('health'), hp: [], stun: [], fs: [] };
    l.hp[i] = f.hp; l.stun[i] = f.stunM / (f.c('dizzyAt') || 1); l.fs[i] = frameState(f);
  }
  for (const s of w.shots) if (!s.seen) { s.seen = true; out.push({ f: i, type: 'item', kind: 'shot', who: s.owner.id, name: 'shot ' + s.look }); }
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
// a whole fight recorded: up to n frames of w (a replay world plays its own frames; else inputs(i) is the human's input, 1/60 s each)
// → { events (in frame order), lanes, N frames, T: the time at each frame }
function recordFight(w, n = Infinity, inputs = null) {
  const out = [], lanes = {}, prev = {}, pb = w.playback, frames = [];
  w.rec = e => { const c = classifyEvent(e); if (c) out.push(c); };
  for (const f of w.fighters) prev[f.id] = fstate(f);
  for (let i = 0; i < n && !w.done && !(pb && i >= pb.frames.length); i++) {
    const fr = pb ? pb.frames[i] : [1 / 60, inputs?.(i) ?? NOIN, null];
    w.advance(fr[0], fr[1], fr[3]); frames.push(fr);
    recordFrame(w, i, prev, lanes, out);
  }
  w.rec = null;
  const N = frames.length, T = frames.reduce((a, f) => (a.push(a[a.length - 1] + f[0]), a), [0]);
  const events = [...inputEvents(frames, w.ctl[0] === 'human' ? w.a.id : -1), ...inputEvents(frames.map(f => [f[0], f[3] || NOIN]), frames.some(f => f[3]) ? w.b.id : -1),
    ...out, ...comboSpans(out)].sort((a, b) => a.f - b.f);
  return { events, lanes, N, T };
}
// per fighter: damage dealt, hits, blocks and parries made, times thrown, the longest and most damaging combo, the frame it went down
function fightStats(events, lanes) {
  return Object.values(lanes).map(l => {
    const mine = e => e.who === l.id, on = e => e.data?.vic === l.id, hits = events.filter(e => e.kind === 'hit' && mine(e)), combos = events.filter(e => e.kind === 'combo' && mine(e));
    const ko = events.find(e => e.kind === 'say' && e.name === 'K.O.' && mine(e));
    return { id: l.id, name: l.name, col: l.col, dealt: Math.round(hits.reduce((s, e) => s + e.data.dmg, 0)), hits: hits.length,
      blocked: events.filter(e => e.kind === 'block' && on(e)).length, parried: events.filter(e => e.kind === 'parry' && on(e)).length,
      thrown: events.filter(e => e.kind === 'say' && e.name === 'THROW' && mine(e)).length,
      bestCombo: combos.length ? Math.max(...combos.map(e => +e.name.split('-')[0])) : 0, topComboDmg: combos.length ? Math.round(Math.max(...combos.map(e => e.data.dmg))) : 0,
      koF: ko ? ko.f : null, hpLeft: l.hp[l.hp.length - 1] };
  });
}
// the best moments of a fight, for a highlights reel: combos of 3 hits or more, K.O.s, parries, counter hits, wall hits, throws, clashes.
// Each is a window (from a little before to a little after, in frames) with a score; windows that overlap merge. Best first
const MOMENT_SCORES = { 'K.O.': 100, parry: 25, COUNTER: 20, WALL: 15, 'WALL BOUNCE': 15, THROW: 15, CLASH: 10 };
function findMoments(events, T, before = 0.6, after = 0.8) {
  const N = T.length - 1, at = t => { let f = 0; while (f < N && T[f + 1] <= t) f++; return f; }, raw = [];
  for (const e of events) {
    if (e.cmp) continue;
    const n = e.kind === 'combo' ? +e.name.split('-')[0] : 0, sc = n >= 3 ? n * 8 + (e.data.dmg || 0) * 0.5 : MOMENT_SCORES[e.kind === 'say' ? e.name : e.kind];
    if (!sc) continue;
    const by = e.kind === 'say' && e.name === 'K.O.' ? `K.O. on P${e.who + 1}` : n ? `${n}-hit combo by P${e.who + 1}` : `${e.kind === 'say' ? e.name.toLowerCase() : e.kind} · P${e.who + 1}`;
    raw.push({ a: at(T[e.f] - before), b: Math.min(N, at(T[e.end ?? e.f] + after) + 1), fin: e.end ?? e.f, score: sc, names: [by] });
  }
  raw.sort((p, q) => p.a - q.a);
  const out = [];
  for (const m of raw) {
    const last = out[out.length - 1];
    if (last && m.a <= last.b) Object.assign(last, { b: Math.max(last.b, m.b), fin: Math.max(last.fin, m.fin), score: last.score + m.score, names: [...last.names, ...m.names] });
    else out.push({ ...m });
  }
  return out.map(m => ({ ...m, score: Math.round(m.score), name: m.names.sort((p, q) => (q.startsWith('K.O.') - p.startsWith('K.O.'))).slice(0, 2).join(' + ') })).sort((p, q) => q.score - p.score);
}
