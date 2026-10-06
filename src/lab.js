'use strict';
// ---------- fight modes: play / grid (parameter sweep) / gallery (every move); each cell is an independent World ----------
const canvas = $('c'), ctx = canvas.getContext('2d');
const cursor = c => { if (canvas.style.cursor !== c) canvas.style.cursor = c; }; // the mouse cursor follows what is under it
let dpr = 1;
const lab = { mode: 'play', scen: 'you vs dummy', rows: null, x: { k: 'hitstop' }, y: { k: '' }, cells: [], cols: 1, focus: null, zoom: false, kind: 'sweep',
  seeds: 1, tape: null, rec: false, replay: false, target: 'dummy', playback: null, chars: [null, null], inv: [], impact: 'hits', blowPower: 'normal', blowSide: 'front', filter: '',
  plot: '' }; // what a cell's own little graph shows; unset (auto) keeps today's behavior, picked from the swept axis
layFlag(lab, 'meter'); layFlag(lab, 'inputs'); // per tab, in the layout
const newWorld = (...a) => Object.assign(new World(...a), { loop: app.loop });

// what the little plot under a grid cell shows, by the swept variable
const GROUP = {
  spring: ['filter', 'dampRate', 'freq', 'zeta', 'response', 'followThru'],
  ease: ['easing'],
  stop: ['hitstop', 'hitstopAtk', 'hitstopFin', 'hitstopDecay', 'hitstopBudget', 'hitShake'],
  move: ['maxSpeed', 'accel', 'decel', 'jumpVel', 'gravity', 'jumpSquat'],
};
const plotKind = k => SCOPE_SERIES[k] ? k : Object.keys(GROUP).find(g => GROUP[g].includes(k)) || 'scope';
const PRESET_TIPS = {
  raw: 'No tween, no spring, no juice: poses snap from key to key.',
  tweened: 'Keyframes eased, no spring, no juice.',
  spring: 'Tween + spring filter, no juice.',
  floaty: 'Slow, loose springs on top of the defaults.',
  juicy: 'Everything on: the defaults.',
};
const POWER_TIPS = {
  normal: 'Default hit power and bounces.',
  heavy: 'Harder blows (power × 1.6), longer hit stop, a second floor bounce.',
  smash: 'Blows send bodies across the screen (power × 2.3): bouncy floor and walls, and a ceiling.',
  pinball: 'Power × 3, everything bounces: floor, walls and ceiling nearly lossless, the floor slippery.',
};
const POWER_ICONS = { normal: 'sports_mma', heavy: 'gavel', smash: 'crisis_alert', pinball: 'cyclone' };

// n values across [lo, hi] snapped to the slider step; categorical vars just take their options
// 'scenario' (Y only) runs each row on a different scripted fight
// combo fx test (X only): one cell per escalation, each on top of all escalations off
const FX_OFF = { comboStop: 0, comboShake: 0, comboZoom: 0, comboSpeed: 0, comboTime: 0 };
const COMBO_FX = { none: {}, 'longer pauses': { comboStop: 0.3 }, 'shorter pauses': { comboStop: -0.15 }, 'growing shake': { comboShake: 0.5 },
  'growing zoom': { comboZoom: 0.5 }, 'faster attacks': { comboSpeed: 0.2 }, 'faster game': { comboTime: 0.2 }, 'slower game': { comboTime: -0.12 },
  everything: { comboStop: 0.2, comboShake: 0.4, comboZoom: 0.4, comboSpeed: 0.12, comboTime: 0.1 } };
const AXIS_SCENS = ['J,J,K', 'sweep', 'ai vs ai'], CANCEL_SCENS = ['J,J,K', 'air combo', 'J,K→spin'],
  PLANE_SCENS = ['sidestep', 'ninja flip', 'dash & run', 'ai vs ai'], EDGE_SCENS = ['break inside', 'break edge', 'tech inside', 'tech edge'];
function axisValues(ax, n) {
  const s = SPEC[ax.k];
  if (ax.k === 'scenario') return (lab.rows || AXIS_SCENS).filter(k => SCENARIOS[k]); // a row can go stale (its "my scenario" deleted)
  if (ax.k === 'comboFx') return Object.keys(COMBO_FX);
  if (s.opts) return s.opts;
  if (typeof s.v === 'boolean') return [false, true];
  const lo = isNaN(ax.lo) ? s.min : ax.lo, hi = isNaN(ax.hi) ? s.max : ax.hi;
  return Array.from({ length: n }, (_, i) => +(Math.round((lo + (hi - lo) * i / (n - 1)) / s.step) * s.step).toFixed(4));
}

// impact: standard hits on the current character, struck by the stick fighter
const IMPACTS = {
  'jab (high)': ['A light high jab: a short hit reaction, no fall', { a: [0.1, '@jab'] }],
  'kick (mid)': ['A mid kick: a heavier hit reaction', { a: [0.1, '@kick'] }],
  'sweep (low)': ['Takes the legs: a fall from the feet', { a: [0.1, '@sweep'], bx: 380 }],
  roundhouse: ['A high knockdown: the body tips over its feet', { a: [0.1, '@roundhouse'], bx: 385 }],
  launcher: ['Launched up into the air, then the fall', { a: [0.1, '@launcher'] }],
  'wall splat': ['Kicked into the wall: it sticks for a moment, then drops', { a: [0.1, '@turnKick'], ax: 640, bx: 700 }],
  'ground bounce': ['An overhead that bounces it off the floor', { a: [0.1, '@hammer'] }],
  crumple: ['Folds where it stands', { a: [0.1, '@charge'], bx: 380 }],
  'K.O.': ['The fight\'s last hit: the body goes limp', { a: [0.1, '@roundhouse'], bx: 385, cfg: { health: 100 }, init: w => { w.b.hp = 1; } }],
};

// impact's ragdoll view: one body alone, struck by blows from nobody (buttons) or drags. A blow: a stick move's hit (no damage) on the bone
// at a share of the body's height ([move, height share, tip]); K.O. takes the last health first
const BLOWS = {
  high: ['jab', 0.9, 'A light high hit to the head: a short reaction'], mid: ['kick', 0.6, 'A mid kick to the body'],
  low: [{ power: 1, knock: 140, stun: 0.35, height: 'low' }, 0.15, 'A low kick to the shin: a stagger, no fall'],
  sweep: ['sweep', 0.1, 'Takes the legs: a fall from the feet'], launcher: ['launcher', 0.6, 'Launched up into the air, then the fall'],
  overhead: ['hammer', 0.9, 'An overhead that bounces it off the floor'], knockdown: ['roundhouse', 0.9, 'A high knockdown: the body tips over its feet'],
  crumple: ['charge', 0.6, 'Folds where it stands'], 'K.O.': ['roundhouse', 0.9, 'The last hit: the body goes limp (the fight restarts after it)'],
};
const BLOW_POWER = { light: 0.6, normal: 1, heavy: 1.7 };
const ragdollWorld = (ch = currentChar()) => newWorld({ a: 'dummy', b: 'dummy', ax: 330, bx: 400, period: 0, init: w => { w.a.hidden = true; } }, {}, 7, [CHARS.stick, ch]);
function blow(w, k) {
  const [mv, share] = BLOWS[k], vic = w.b, P = vic.body(), sc = BLOW_POWER[lab.blowPower], side = lab.blowSide === 'front' ? -vic.dir : vic.dir;
  const { keys, next, lunge, hit, style, cancel, ...m0 } = typeof mv === 'string' ? CHARS.stick.moves[mv] : mv;
  const m = { ...m0, damage: 0, power: m0.power * sc, knock: (m0.knock || 0) * sc, launch: (m0.launch || 0) * sc };
  const bones = vic.ch.bones.filter(b => b.role !== 'weapon'), ys = bones.flatMap(b => [P[b.id][1], P[b.parent || 'hip'][1]]);
  const top = Math.min(...ys), y = vic.y - share * (vic.y - top), mid = b => b.shape === 'circle' ? P[b.id] : P[b.parent || 'hip'].map((v, i) => (v + P[b.id][i]) / 2);
  const bone = bones.reduce((a, b) => Math.abs(mid(b)[1] - y) < Math.abs(mid(a)[1] - y) ? b : a);
  if (k === 'K.O.') vic.hp = 1, m.damage = 1;
  w.strike(vic, bone, mid(bone), m, side);
}

const bred = () => lab.kind === 'breed' || lab.kind === 'attacks'; // the experiment kinds that breed cells (sweep and compare set settings)
const bodyKind = () => lab.mode === 'experiment' && lab.kind === 'body'; // vary body: creator.js's own expOn grid, reused as-is
// a gallery cell builds its fight when it is needed (scrolled into view) and drops it off screen, so it never runs a stale character
const lazyCell = (mk, c) => Object.defineProperty(c, 'w', { get() { return this._w ??= mk(); }, enumerable: true });
function build() {
  const scen = SCENARIOS[lab.scen];
  lab.cells = []; lab.cols = 3; lab.zoom = false; lab.scroll = 0;
  // vary body (a character-editor feature) lives here as a kind now; leaving it turns its own expOn flag back off,
  // so a later visit to the character tab itself doesn't still show its grid
  if (!bodyKind()) creator.expOn = false;
  if (lab.mode === 'play') {
    const replay = lab.replay && lab.tape?.length && scen.a === 'human';
    lab.cells.push({ w: lab.branch ? lab.branch.make() : lab.playback ? Object.assign(replayWorld(lab.playback), { loop: app.loop }) : newWorld(withInv(replay ? { ...scen, b: { tape: lab.tape } } : scen), {}, 1, playChars()) });
    lab.cells[0].w.sfx = playSound; lab.cols = 1;
  }
  else if (lab.mode === 'experiment' && lab.kind === 'impact' && lab.impact === 'ragdoll') { lab.cells.push({ w: ragdollWorld() }); lab.cols = 1; }
  else if (lab.mode === 'experiment' && lab.kind === 'impact') for (const [k, [tip, s]] of Object.entries(IMPACTS))
    lab.cells.push({ w: newWorld({ b: 'dummy', period: 3, ...s, init: w => { s.init?.(w); w.a.hidden = lab.solo; } }, {}, 7, [CHARS.stick, currentChar()]), label: k, tip });
  else if (bodyKind()) { // nine body variations (creator.js's own buildExp/expPanel; its cells, render and side panel are reused as-is)
    if (!creator.expOn) { creator.expOn = true; creator.exp.kind = 'body'; creator.exp.parent = null; }
    buildExp();
  }
  else if (lab.mode === 'gallery') {
    for (const m of galleryMoves()) lab.cells.push(lazyCell(() => newWorld({ ...galleryScen(m, undefined, currentChar().moves[m]), ...GALLERY_TARGETS[lab.target][1] }), { move: m, label: m }));
    for (const [k, [tip, s]] of Object.entries(MOVEMENTS)) lab.cells.push(lazyCell(() => newWorld({ period: 2.4, ...s }), { motion: true, label: k, tip: `${k}: ${tip}` }));
  }
  else if (bred()) lab.cells = lab.kind === 'breed' ? breedCells() : attackCells();
  else if (lab.kind === 'compare') { // the same seed in both: only the settings differ
    lab.cols = 2;
    for (const s of ['a', 'b']) { const over = cmpCfg(cmp[s]); lab.cells.push({ w: newWorld(scen, over, 7), over, label: `${s.toUpperCase()} · ${cmp[s].name}` }); }
  }
  else {
    const xs = axisValues(lab.x, lab.y.k ? 3 : 9), ys = lab.y.k ? axisValues(lab.y, 3) : [null];
    if (lab.y.k) lab.cols = xs.length;
    for (const yv of ys) for (const xv of xs) {
      const fx = lab.x.k === 'comboFx', over = fx ? { ...FX_OFF, ...COMBO_FX[xv] } : { [lab.x.k]: xv }, sy = lab.y.k === 'scenario';
      if (lab.y.k && !sy) over[lab.y.k] = yv;
      // same seed everywhere: every cell replays the identical fight, only the swept values differ
      lab.cells.push({ w: newWorld(sy ? SCENARIOS[yv] : scen, over, 7), over,
        label: (fx ? xv : Object.entries(over).map(([k, v]) => `${k}=${fmt(v)}`).join('  ')) + (sy ? `  ${yv}` : '') });
    }
  }
  // extra seeds: the same cell fought again with other random rolls (AI, sparks); the stats average them
  if (lab.mode === 'experiment' && lab.kind !== 'attacks' && lab.kind !== 'impact' && lab.kind !== 'body' && lab.seeds > 1)
    for (const c of lab.cells) c.extra = Array.from({ length: lab.seeds - 1 }, (_, i) => newWorld(c.w.scen, c.over, 8 + i));
  lab.focus = lab.cells[0];
}

// rects of n cells in cols columns inside area (device px); with minH the cells keep at least that height and scroll
function cellRects(n, cols, area, minH = 0, scroll = 0) {
  const rows = Math.ceil(n / cols), g = n > 1 ? 4 * dpr : 0;
  const cw = (area.w - g * (cols + 1)) / cols, ch = Math.max(minH, (area.h - g * (rows + 1)) / rows);
  return Array.from({ length: n }, (_, i) => ({ x: area.x + g + (i % cols) * (cw + g), y: area.y + g + Math.floor(i / cols) * (ch + g) - scroll, w: cw, h: ch }));
}
const fullArea = () => ({ x: 0, y: 0, w: canvas.width, h: canvas.height });
// the lab's cells; the gallery keeps its cells readable and scrolls (mouse wheel) instead of shrinking them
const labRects = (n = shown().length) => cellRects(n, lab.zoom ? 1 : lab.cols, fullArea(), lab.mode === 'gallery' && !lab.zoom ? 190 * dpr : 0, lab.zoom ? 0 : lab.scroll);
const maxScroll = () => { const r = labRects(); return r.length ? Math.max(0, r[r.length - 1].y + r[r.length - 1].h + lab.scroll + 4 * dpr - canvas.height) : 0; };
const shown = () => lab.zoom ? [lab.focus] : lab.mode === 'gallery' && lab.filter.trim() ? lab.cells.filter(c => fuzzy(lab.filter, c.label)) : lab.cells;
// the shown cells whose rect is on the canvas: only these are drawn, and in the gallery only these run
const onScreen = () => { const r = labRects(); return shown().filter((c, i) => r[i].y + r[i].h > 0 && r[i].y < canvas.height); };
const hitRect = (rects, x, y) => rects.findIndex(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

// ---------- render ----------
function clear() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ddd7cb'; ctx.fillRect(0, 0, canvas.width, canvas.height);
}
// one cell: arena, then (small cells) a plot strip, label and stats. selected = red frame (a string = its tag)
function drawCell(c, r, { full = false, plot = true, selected = false, meter = false } = {}) {
  const ph = plot ? Math.round(r.h * 0.24) : 0;
  ctx.fillStyle = '#f3f0e8'; ctx.fillRect(r.x, r.y, r.w, r.h);
  c.w.render(ctx, { ...r, h: r.h - ph }, full, c.shot);
  if (plot) {
    const pr = { x: r.x + 6 * dpr, y: r.y + r.h - ph, w: r.w - 12 * dpr, h: ph - 5 * dpr };
    ctx.fillStyle = '#fbfaf6'; ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
    drawPlot(c, pr);
  }
  if (selected) { // red frame + a tag in the corner
    ctx.strokeStyle = RED[0]; ctx.lineWidth = 4 * dpr;
    ctx.strokeRect(r.x + 2 * dpr, r.y + 2 * dpr, r.w - 4 * dpr, r.h - 4 * dpr);
    const tag = typeof selected === 'string' ? selected : 'selected', tw = (tag.length * 7 + 12) * dpr;
    ctx.fillStyle = RED[0]; ctx.fillRect(r.x + r.w - tw - 2 * dpr, r.y + 2 * dpr, tw, 16 * dpr);
    text(tag, r.x + r.w - tw / 2 - 2 * dpr, r.y + 14 * dpr, '#fff', 11, 'bold', 'center');
  }
  const ly = c.label && CFG.labels ? drawLabel(c.label, r, full) : r.y + 16 * dpr;
  if (meter) drawMeter(c.w, { x: r.x + 6 * dpr, y: r.y + r.h - ph - (full ? 40 : 16) * dpr, w: r.w - 12 * dpr, h: (full ? 30 : 10) * dpr }, full);
  if (!full && CFG.labels) text(cellStats(c), r.x + 8 * dpr, ly + 14 * dpr, '#999', r.w < 260 * dpr ? 9 : 11);
}
// the label's parts (split on double spaces, e.g. k=v pairs) wrapped to the cell width, smaller in small cells; returns the last line's y
function drawLabel(label, r, full) {
  const size = full || r.w > 360 * dpr ? 12 : r.w > 220 * dpr ? 10 : 9, cw = 0.62 * size * dpr, max = Math.max(4, Math.floor((r.w - 16 * dpr) / cw));
  const lines = [];
  for (const p of label.split(/\s{2,}/)) {
    const part = p.length > max ? p.slice(0, max - 1) + '…' : p, last = lines.length - 1;
    if (last >= 0 && lines[last].length + 2 + part.length <= max) lines[last] += '  ' + part; else lines.push(part);
  }
  const lh = (size + 3) * dpr, y0 = r.y + (size + 4) * dpr;
  ctx.fillStyle = 'rgba(243,240,232,0.8)';
  ctx.fillRect(r.x + 4 * dpr, r.y + 4 * dpr, Math.max(...lines.map(l => l.length)) * cw + 8 * dpr, lines.length * lh + 2 * dpr);
  lines.forEach((l, i) => text(l, r.x + 8 * dpr, y0 + i * lh, '#444', size, 'bold'));
  return y0 + (lines.length - 1) * lh;
}
// hits / whiffs / frozen % (averaged over the cell's seeds) and the last hit's frame advantage
const METRICS = {
  hits: ['Most hits first', w => w.hits], whiffs: ['Most whiffs first', w => w.whiffs],
  frozen: ['Most time in hit stop first', w => w.frozenT / (w.simT || 1)], adv: ['Best frame advantage first', w => w.adv ?? -99],
};
const avg = (c, f) => { const ws = [c.w, ...(c.extra || [])]; return ws.reduce((s, w) => s + f(w), 0) / ws.length; };
function cellStats(c) {
  const n = v => c.extra ? v.toFixed(1) : v, w = c.w;
  return `frozen ${Math.round(100 * avg(c, METRICS.frozen[1]))}%  ${n(avg(c, METRICS.hits[1]))} hits  ${n(avg(c, METRICS.whiffs[1]))} whiffs` +
    (w.blocks ? `  ${w.blocks} blocked` : '') + (w.parries ? `  ${w.parries} parried` : '') +
    (w.adv === null ? '' : `  ${w.adv >= 0 ? '+' : ''}${w.adv}f`);
}
// frame meter: one column per frame, newest on the right; top row = left fighter, bottom = right fighter
const METER_COLS = { idle: null, air: '#cfd8e0', move: '#b3a79a', startup: '#3a9d5d', active: '#c0392b', recovery: '#2c6fb0', cancel: '#8e44ad', hit: '#e6b422', block: '#7fb3d5', dizzy: '#e67e22', down: '#e8dcb5', stop: '#fff' };
const METER_TIPS = 'frame meter: green startup · red active · blue recovery · purple cancel window · yellow hitstun · light blue blockstun · orange dizzy · pale knocked down · white hit stop · grey air / other';
// c: the canvas context (another one: the replay editor's export)
function drawMeter(w, r, full, c = ctx) {
  const fs = w.hist.fs, n = full ? 120 : 60, cw = r.w / n, rh = r.h / 2 - dpr;
  c.fillStyle = '#0000000d'; c.fillRect(r.x, r.y, r.w, r.h);
  fs.slice(-n).forEach((st, i) => st.forEach((s, j) => {
    if (!METER_COLS[s]) return;
    c.fillStyle = METER_COLS[s];
    c.fillRect(r.x + (n - Math.min(n, fs.length) + i) * cw, r.y + j * (rh + 2 * dpr), Math.max(dpr, cw - (full ? dpr : 0)), rh);
  }));
  if (full && ui.hints && c === ctx) text(METER_TIPS, r.x, r.y - 4 * dpr, '#aaa', 10);
}
// input display: the human's last inputs in numpad notation, newest on top, with how many frames each was held
function drawInputs(w, x, y, c = ctx) {
  [...w.inputs].reverse().slice(0, 16).forEach((e, i) =>
    text(`${e.n}${e.b ? ' ' + e.b : ''}`.padEnd(6) + String(e.f).padStart(3), x, y + i * 14 * dpr, e.b ? '#c0392b' : '#888', 11, e.b ? 'bold' : '', 'left', c));
}
function labRender() {
  clear();
  lab.scroll = clamp(lab.scroll, 0, maxScroll()); // the canvas or the column count may have changed
  const cells = shown(), play = lab.mode === 'play', onImpact = lab.mode === 'experiment' && lab.kind === 'impact', rag = onImpact && lab.impact === 'ragdoll', rects = labRects(cells.length);
  if (lab.mode === 'gallery' && !cells.length) text('no move matches the filter', canvas.width / 2, canvas.height / 2, '#999', 13, '', 'center');
  cells.forEach((c, i) => !(rects[i].y + rects[i].h > 0 && rects[i].y < canvas.height) ? delete c._w : drawCell(c, rects[i], { full: play || rag, plot: !play && !onImpact, meter: lab.meter,
    selected: !play && !rag && !lab.zoom && (lab.mode === 'experiment' && bred() ? c.parent && 'parent'
      : c.over ? Object.entries(c.over).every(([k, v]) => CFG[k] === v) && 'current settings' : c === lab.focus && 'focused') }));
  if (lab.mode === 'experiment' && lab.kind === 'attacks' && !lab.zoom) cells.forEach((c, i) => { c.btns = null; if (i === lab.hover) drawCellButtons(c, rects[i]); });
  if (play && cells[0]) refreshMovelist(cells[0].w.a); // live: a mid-fight stance switch updates the side panel's movelist, not just on the next click
  if (play && lab.inputs && cells[0].w.ctl[0] === 'human') drawInputs(cells[0].w, 10 * dpr, 60 * dpr);
  if (play && cells[0].w.playback) drawPlayback(cells[0].w);
  if (play && lab.branch) text(`branch of ${lab.branch.reel.name} · you are P${lab.branch.side} · restart: back to the fork · keep it in the toolbar`, canvas.width / 2, 20 * dpr, '#b9770e', 12, 'bold', 'center');
  const d = lab.drag;
  if (d) { // the blow being dragged: from the struck point, its direction and strength
    ctx.strokeStyle = RED[0]; ctx.lineWidth = 3 * dpr; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x, d.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(d.x0, d.y0, 5 * dpr, 0, 7); ctx.fillStyle = RED[0]; ctx.fill();
  }
  const ms = maxScroll();
  if (ms > 0) { // scrollbar
    const h = canvas.height * canvas.height / (canvas.height + ms);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(canvas.width - 5 * dpr, lab.scroll / ms * (canvas.height - h), 3 * dpr, h);
  }
}

function text(s, x, y, col, size, weight = '', align = 'left', c = ctx) {
  c.fillStyle = col; c.textAlign = align;
  c.font = `${weight} ${size * dpr}px ui-monospace, Menlo, monospace`;
  c.fillText(s, x, y);
  c.textAlign = 'left';
}
function series(c, arr, r, lo, hi, col, len = arr.length) {
  c.strokeStyle = col; c.lineWidth = 1.5 * dpr; c.beginPath();
  arr.forEach((v, i) => c.lineTo(r.x + i / (len - 1) * r.w, r.y + r.h - (clamp(v, lo, hi) - lo) / (hi - lo) * r.h));
  c.stroke();
}
function hline(r, lo, hi, v) {
  const y = r.y + r.h - (v - lo) / (hi - lo) * r.h;
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = dpr; ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke();
}

// unit step through the pose filter: how a joint chases a new target with this cell's settings
function stepResponse(cfg, depth) {
  const so = new SecondOrder(0), out = [];
  let d = 0;
  for (let i = 0; i < 90; i++) {
    const dt = 1 / 120;
    if (cfg.filter === 'spring') out.push(so.update(dt, 1, cfg.freq * cfg.followThru ** depth, cfg.zeta, cfg.response));
    else if (cfg.filter === 'damp') out.push(d += (1 - d) * (1 - Math.exp(-cfg.dampRate * dt)));
    else out.push(1);
  }
  return out;
}

function drawPlot(c, r) {
  const w = c.w, cfg = w.cfg, kind = c.move ? 'timeline' : c.motion ? 'move' : c.over ? plotKind(lab.plot || (c.plot ?? lab.x.k)) : 'scope';
  const note = s => text(s, r.x + 4 * dpr, r.y + 11 * dpr, '#aaa', 10);
  if (kind === 'spring') {
    hline(r, -0.5, 1.8, 0); hline(r, -0.5, 1.8, 1);
    series(ctx, stepResponse(cfg, 2), r, -0.5, 1.8, '#e0998f');
    series(ctx, stepResponse(cfg, 0), r, -0.5, 1.8, '#c0392b');
    note('step response: torso / forearm (light)');
  } else if (kind === 'ease') {
    const curve = e => Array.from({ length: 61 }, (_, i) => EASE[e](i / 60));
    hline(r, -0.3, 1.3, 0); hline(r, -0.3, 1.3, 1);
    if (cfg.easing === 'authored') for (const e of ['outQuad', 'outExpo', 'inOutCubic']) series(ctx, curve(e), r, -0.3, 1.3, '#c0392b');
    else series(ctx, curve(cfg.easing), r, -0.3, 1.3, '#c0392b');
    note(cfg.easing === 'authored' ? 'per key: outQuad/outExpo/inOutCubic' : cfg.easing);
  } else if (kind === 'stop') {
    // one bar per hit: outline = freeze asked for (after decay), fill = freeze granted by the budget
    const bw = r.w / 12, max = 0.4;
    w.freezes.forEach((f, i) => {
      const x = r.x + i * bw + bw * 0.15, hw = r.h * Math.min(1, f.want / max), hh = r.h * Math.min(1, f.hs / max);
      ctx.fillStyle = f.fin ? '#c0392b' : '#444'; ctx.fillRect(x, r.y + r.h - hh, bw * 0.7, hh);
      ctx.strokeStyle = '#999'; ctx.lineWidth = dpr; ctx.strokeRect(x, r.y + r.h - hw, bw * 0.7, hw);
    });
    // no hits yet looks the same as an empty graph otherwise: say so, instead of leaving it blank with only the generic note
    note(w.freezes.length ? 'freeze/hit 0-0.4s: fill got, outline wanted' : 'no hits yet');
  } else if (kind === 'move') {
    hline(r, -700, 700, 0);
    series(ctx, w.hist.vx, r, -700, 700, '#222', HIST);
    series(ctx, w.hist.y.map(y => y * 3.5), r, -700, 700, '#c0392b', HIST);
    note('vx (black) / height (red)');
  } else if (kind === 'timeline') {
    // keyframes of the move: width = duration, red = active, marker = current key
    const m = w.a.ch.moves[c.move], total = m.keys.reduce((s, k) => s + k.d, 0), a = w.a.action;
    let x = r.x, at = null;
    m.keys.forEach((k, i) => {
      const kw = k.d / total * r.w;
      ctx.fillStyle = k.active ? '#e0998f' : i === 0 ? '#ddd' : '#eee';
      ctx.fillRect(x + dpr, r.y + r.h * 0.45, kw - 2 * dpr, r.h * 0.5);
      text(k.e || 'linear', x + 3 * dpr, r.y + r.h * 0.8, '#888', 9);
      if (a?.m === m && a.i === i) at = x + Math.min(1, a.t / k.d) * kw;
      x += kw;
    });
    if (at !== null) { ctx.fillStyle = '#222'; ctx.fillRect(at - dpr, r.y + r.h * 0.4, 2 * dpr, r.h * 0.6); }
    const f = frameData(m, cfg.attackSpeed), adv = w.adv === null ? '' : `  ${w.adv >= 0 ? '+' : ''}${w.adv} on hit`;
    note(`${f.startup}f startup · ${f.active} active · ${f.recovery} recovery${adv}`);
  } else if (SCOPE_SERIES[kind]) { // explicitly picked (plotButton), not tied to the swept axis: health, stun or speed over the fight
    const { a, b, label } = SCOPE_SERIES[kind](w), all = a.concat(b), lo = Math.min(...all, 0) - 5, hi = Math.max(...all, 0) + 5;
    series(ctx, a, r, lo, hi, '#bbb', HIST);
    if (b !== a) series(ctx, b, r, lo, hi, '#c0392b', HIST);
    note(label);
  } else {
    const all = w.hist.tgt.concat(w.hist.disp), lo = Math.min(...all) - 5, hi = Math.max(...all) + 5;
    series(ctx, w.hist.tgt, r, lo, hi, '#bbb', HIST);
    series(ctx, w.hist.disp, r, lo, hi, '#c0392b', HIST);
    note(`${cfg.scope}: target / drawn (red)`);
  }
}

// the debug popup's oscilloscope: a couple of seconds of the shown fight, grey = P1 (or a bone's target), red = P2 (or drawn)
const SCOPE_SERIES = {
  angle: w => ({ a: w.hist.tgt, b: w.hist.disp, label: `${w.cfg.scope}: target (grey) vs drawn (red)` }),
  health: w => ({ a: w.hist.hpA, b: w.hist.hpB, label: 'health: P1 (grey) vs P2 (red)' }),
  stun: w => ({ a: w.hist.stunA, b: w.hist.stunB, label: 'stun meter: P1 (grey) vs P2 (red)' }),
  speed: w => ({ a: w.hist.vx, b: w.hist.vx, label: 'P1 horizontal speed, vx (grey)' }),
};
const scopeCv = h('canvas', { id: 'scope', tip: 'Oscilloscope: the scopeKind setting plotted over the last seconds of the focused fight.\n' +
  'angle: grey = the keyframe target, red = what is drawn after the pose filter (springs, damping, follow-through) — tune overshoot, wobble and lag.\n' +
  'health / stun: grey = P1, red = P2. speed: P1\'s vx.' }), sctx = scopeCv.getContext('2d'), stats = h('div', { cls: 'note' });
function drawScope() {
  const w = scopeCv.isConnected && dbgWorld();
  if (!w) return;
  const { a, b, label } = SCOPE_SERIES[CFG.scopeKind](w);
  scopeCv.width = scopeCv.clientWidth * dpr; scopeCv.height = scopeCv.clientHeight * dpr;
  const cw = scopeCv.width, ch = scopeCv.height;
  sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, cw, ch);
  const all = a.concat(b), lo = Math.min(...all, 0) - 5, hi = Math.max(...all, 0) + 5, r = { x: 0, y: 4, w: cw, h: ch - 8 };
  series(sctx, a, r, lo, hi, '#bbb', HIST);
  if (b !== a) series(sctx, b, r, lo, hi, '#c0392b', HIST);
  stats.textContent = `${mode() === labMode ? lab.focus?.label || lab.scen : app.mode} — ${label}\n` +
    `frozen ${Math.round(100 * w.frozenT / (w.simT || 1))}% of ${w.simT.toFixed(1)}s · ${w.hits} hits` +
    (w.adv === null ? '' : ` · last hit ${w.adv >= 0 ? '+' : ''}${w.adv}f`);
}

// play's fighters: P1, P2, P3… by name, null = the character being edited (P3 on: the same as P2); a scenario's own chars win
const pickName = i => CHARS[lab.chars[i]] ? lab.chars[i] : i >= 2 ? pickName(1) : CURRENT;
const playChars = () => lab.chars.some(Boolean) ? Array.from({ length: Math.max(2, lab.chars.length) }, (_, i) => CHARS[pickName(i)]) : null;
// how many fighters the scenario starts with (waves, survival: you and the first enemy, P2)
const fighterCount = s => s.waves || s.survival ? 2 : 2 + (s.more?.length || 0);
function fighterPick(i) {
  const set = v => { lab.chars[i] = v; build(); }, cv = h('canvas'), name = () => pickName(i);
  const who = i === 0 ? 'the fighter you play (the left one)' : i === 1 ? 'the opponent' : 'an extra fighter (unset: the same as P2)';
  const b = button('', `P${i + 1}: ${who} · click: pick from every character`, (e, el) => popup(el,
    h('b', { textContent: `P${i + 1}` }), h('p', { textContent: SCENARIOS[lab.scen].chars ? 'This scenario brings its own fighters; the pick applies to the others.' : `Who fights as P${i + 1}` }),
    h('div', { cls: 'bar' }, toggle(i >= 2 ? ':content_copy: as P2' : ':edit: editor', i >= 2 ? 'The same character as P2' : `Follow the character being edited (now ${CURRENT})`, () => !lab.chars[i], () => { closePop(); set(null); }),
      button(':casino: random', 'A random character from the roster', () => { closePop(); const ks = Object.keys(DEFS); set(ks[Math.floor(Math.random() * ks.length)]); }),
      i ? button(':content_copy: mirror', 'The same character as P1', () => { closePop(); set(lab.chars[0]); }) : null),
    h('div', { cls: 'cards' }, Object.keys(DEFS).map(k => charCard(k, set, k => name() === k && !!lab.chars[i])))));
  b.classList.add('fpick');
  reg(b, () => { b.replaceChildren(cv, h('span', { textContent: `P${i + 1} ${name()}` })); drawThumb(cv, CHARS[name()], undefined, 20, 22); });
  return b;
}
// a scenario flagged select (the builder's "select screen" toggle): a full-screen picker for P1 and P2 over its roster
// (empty roster = every character), instead of the small per-slot popup. Confirm sets lab.chars like fighterPick does
function selectScreen() {
  const scen = SCENARIOS[lab.scen], roster = scen.roster?.length ? scen.roster : Object.keys(DEFS);
  const picks = [lab.chars[0], lab.chars[1]];
  const box = h('div', { cls: 'pop modal' });
  const end = () => { back.remove(); lab.chars[0] = picks[0] ?? null; lab.chars[1] = picks[1] ?? null; build(); };
  const render = () => box.replaceChildren(h('b', { textContent: 'select your fighter' }),
    h('p', {}, ...rich('P1 is you, P2 the opponent (any extra fighter keeps its own pick).')),
    ...[0, 1].map(i => h('div', {}, h('h4', { textContent: `P${i + 1}` }),
      h('div', { cls: 'cards' }, roster.map(k => charCard(k, v => { picks[i] = v; render(); }, k => (picks[i] ?? pickName(i)) === k))))),
    h('div', { cls: 'bar' }, button(':sports_kabaddi: fight!', 'Start the fight with these fighters', end)));
  const back = h('div', { cls: 'modalback' }, box);
  back.addEventListener('mousedown', e => { if (e.target === back) end(); });
  document.body.append(back); render();
}
// play's shields: invulnerability per fighter (null, nodamage, untouchable), put in the scen as the fighters' overrides so replays keep it
const INV_OPTS = [null, 'nodamage', 'untouchable'];
const withInv = s => s.user || !lab.inv.some(Boolean) ? s : { ...s, ...lab.inv[0] && { aover: { ...s.aover, inv: lab.inv[0] } }, ...lab.inv[1] && { bover: { ...s.bover, inv: lab.inv[1] } },
  ...s.more && { more: s.more.map((m, i) => lab.inv[i + 2] ? { ...m, over: { ...m.over, inv: lab.inv[i + 2] } } : m) } };
function shieldButton(i) {
  const b = button('', '', () => { lab.inv[i] = INV_OPTS[(INV_OPTS.indexOf(lab.inv[i] ?? null) + 1) % 3]; build(); }, 'tog');
  reg(b, () => { const v = lab.inv[i];
    setRich(b, v ? `:shield: ${v === 'nodamage' ? 'no damage' : 'untouchable'}` : ':shield:'); b.classList.toggle('on', !!v);
    b.dataset.tip = `P${i + 1}'s shield, now ${v === 'nodamage' ? 'no damage: hit reactions, but no health lost' : v ? 'untouchable: nothing hits it' : 'off'} · click: off → no damage → untouchable`; });
  return b;
}
const swapFighters = () => button(':swap_horiz:', 'Swap the characters of P1 and P2 (the fight restarts)', () => { [lab.chars[0], lab.chars[1]] = [lab.chars[1] ?? null, lab.chars[0] ?? null]; build(); });

// ---------- context bar: scenario, grid axes, focus ----------
const ctlName = c => c === 'human' ? 'you' : c === 'ai' ? 'AI' : Array.isArray(c) ? 'script' : 'dummy';
function scenTip(s) {
  const who = [s.a, s.b, ...(s.more || []).map(m => m.c)].map(ctlName);
  const script = Array.isArray(s.a) ? `\nscript: ${s.a.map(i => typeof i === 'number' ? i + 's' : i.hold ? `hold ${i.hold} ${i.t}s` : i).join(', ')}` : '';
  return `${who[0]} vs ${who.slice(1).join(' + ')}${s.period ? ` · restarts every ${s.period}s` : ''}${script}`;
}
// who fights, then the scripted tests by topic ([name, icon, tip, test]); a scenario goes in the first group that takes it
const SCEN_GROUPS = [
  ['my scenarios', 'person', 'Built by you in this browser (new scenario, or copy in the builder)', (s, k) => s.user && !BASE_SCENARIOS[k]],
  ['you', 'keyboard', 'You on the keyboard.', s => s.a === 'human'],
  ['engine AI', 'smart_toy', 'The built-in AI walks in and throws random chains.', s => !Array.isArray(s.a) && s.a !== 'human'],
  ['chains', 'timeline', 'Scripted: normals chaining into each other and into specials.', ['jab spam', 'J,J,J', 'K,K', 'J,J,K', 'J,K,K', 'sweep', 'dash punch', 'J→rush', 'J,K→spin', 'sandwich', 'showcase']],
  ['juggles & falls', 'trending_up', 'Scripted: launchers, air combos, knockdowns and getting up.', ['juggle', 'rising', 'chase jump', 'air combo', 'tech', 'tech edge', 'tech inside', 'air recover', 'wall bounce', 'OTG stomp', 'pounce', 'wake-up attack', 'wake-up roll']],
  ['guard & counters', 'shield', 'Scripted: guards, parries, throws and counters.', ['vs guard', 'vs low guard', 'parry', 'just guard', 'push block', 'guard cancel', 'throw', 'back throw', 'throw break', 'break edge', 'break inside', 'catch', 'high counter', 'low counter']],
  ['specials', 'bolt', 'Scripted: specials, projectiles and the roster\'s signature moves.', ['specials (S)', 'super showcase', 'claws stance', 'fireball', 'fireball clash', 'fireball reflect', 'grenade', 'multi shot', 'laser beam', 'flash kick', 'lightning legs', 'turnaround', 'roll through', 'roll back', 'teleport', 'taunt', 'win pose']],
  ['movement', 'directions_run', 'Scripted: walking, jumping, dashes and the 2.5D sidestep.', ['walk', 'jump', 'air kick', 'sidestep', 'ninja flip', 'dash & run']],
  ['weapons', 'swords', 'Scripted: picking up, throwing and clashing weapons.', ['pick up & slash', 'weapon throw', 'disarm', 'weapon clash', 'deflect']],
  ['other tests', 'science', 'Scripted: repeatable inputs, the same fight every loop, ideal for the experiment tab.', s => Array.isArray(s.a)],
];
const scenGroup = k => SCEN_GROUPS.find(([, , , f]) => Array.isArray(f) ? f.includes(k) : f(SCENARIOS[k], k))?.[0];
function scenButton(onPick) {
  const b = button('', 'Choose who fights · scenarios grouped by who fights, scripted tests by topic', (e, b) => {
    const pick = k => { closePop(); onPick(k); }, rows = [];
    const q = h('input', { cls: 'macro', placeholder: 'filter scenarios…', tip: 'Letters of a scenario or group name narrow the list · Enter picks the first one left',
      oninput: () => { const t = q.value.toLowerCase(); for (const [hd, bar, os] of rows) { let any = false; for (const o of os) any = !(o.hidden = !(o.textContent.toLowerCase().includes(t) || hd.textContent.toLowerCase().includes(t))) || any; hd.hidden = bar.hidden = !any; } },
      onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') { const o = rows.flatMap(r => r[2]).find(o => !o.hidden); if (o) pick(o.textContent); } else if (e.key === 'Escape') closePop(); } });
    popup(b, h('div', { cls: 'bar' }, q, button(':add: new scenario', 'A scenario of your own, starting from this one: pick the characters, who controls them (or a script), where they stand and the settings it brings', () => { closePop(); newScen(); })),
      ...SCEN_GROUPS.flatMap(([g, ic, info]) => {
      const os = Object.entries(SCENARIOS).filter(([k]) => scenGroup(k) === g).map(([k, s]) => {
        const o = button(k, scenTip(s), () => pick(k));
        reg(o, () => o.classList.toggle('on', lab.scen === k));
        return o;
      });
      if (!os.length) return [];
      const hd = h('h4', { tip: info }, ...rich(`:${ic}: ${g}`)), bar = h('div', { cls: 'bar' }, os);
      rows.push([hd, bar, os]);
      return [hd, bar];
    }));
    q.focus();
  });
  reg(b, () => { setRich(b, `:sports_kabaddi: ${lab.scen}`); });
  return b;
}
// next/previous scenario hotkeys: step through the same flat order scenButton lists them in (grouped, then as entered)
function stepScenario(d) {
  if (mode() !== labMode) return;
  const list = SCEN_GROUPS.flatMap(([g]) => Object.keys(SCENARIOS).filter(k => scenGroup(k) === g));
  const i = list.indexOf(lab.scen);
  lab.scen = list[(i + d + list.length) % list.length]; lab.playback = lab.branch = null; build(); panels();
}
const prevScenario = () => stepScenario(-1), nextScenario = () => stepScenario(1);
// grid axis: pick a variable (grouped like the side panel) and its range
function axisButton(ax, name) {
  const b = button('', `${name} axis: the variable swept across the cells`, (e, b) => {
    const groups = [];
    for (const s of SCHEMA) {
      if (Array.isArray(s)) groups.push([s[0], []]);
      else if (s.k !== 'scope') groups[groups.length - 1][1].push(s);
    }
    const range = ['lo', 'hi'].map(end => {
      const inp = h('input', { type: 'number', onchange: () => { ax[end] = parseFloat(inp.value); build(); } });
      reg(inp, () => { const s = SPEC[ax.k]; inp.disabled = !s || s.min === undefined; inp.value = inp.disabled ? '' : ax[end] ?? s[end === 'lo' ? 'min' : 'max']; });
      return inp;
    });
    const pick = k => { ax.k = k; ax.lo = SPEC[k]?.min; ax.hi = SPEC[k]?.max; build(); };
    popup(b, name === 'Y' && h('div', { cls: 'bar' }, button('none', 'Only one axis: 9 values of X', () => { pick(''); closePop(); }),
      button(':sports_kabaddi: scenario', `One row per fight: ${AXIS_SCENS.join(' · ')}`, () => { lab.rows = null; pick('scenario'); closePop(); })),
      ...groups.flatMap(([g, vars]) => [h('h4', { textContent: g }), h('div', { cls: 'bar' }, vars.map(s => {
        const o = button(s.k, s.tip, () => pick(s.k));
        reg(o, () => o.classList.toggle('on', ax.k === s.k));
        return o;
      }))]),
      h('h4', { textContent: 'range' }), h('div', { cls: 'bar' }, 'from', range[0], 'to', range[1]));
  });
  reg(b, () => { setRich(b, `${name}: ${ax.k || 'none'}`); });
  return b;
}
// what a cell's own little graph shows: auto (today's default, from the swept axis) or any of these, explicitly -
// health, stun and speed were never otherwise reachable here, only in the debug popup's oscilloscope (same SCOPE_SERIES)
const PLOT_TIPS = { spring: 'Pose filter step response (torso / forearm)', ease: 'Easing curves', stop: 'Hit-stop bars: freeze wanted (outline) vs granted (fill)', move: 'Velocity (black) + height (red)',
  angle: 'Bone angle (cfg.scope): target (grey) vs drawn (red)', health: 'Health: P1 (grey) vs P2 (red)', stun: 'Stun meter: P1 (grey) vs P2 (red)', speed: 'P1 horizontal speed (vx)' };
function plotButton() {
  const b = button('', 'What the cells\' own little graph shows · fuzzy search', (e, anchor) => {
    const list = h('div', { cls: 'plist' });
    const inp = h('input', { cls: 'macro', placeholder: 'plot…', tip: 'Fuzzy search over what a cell\'s little graph can show',
      oninput: fill, onkeydown: ev => { ev.stopPropagation(); if (ev.key === 'Escape') { inp.value = ''; fill(); } } });
    const pick = k => { lab.plot = k; closePop(); build(); };
    function fill() {
      const q = inp.value.trim();
      const shown = [['', 'Auto: from the swept axis (today\'s default)'], ...Object.entries(PLOT_TIPS)]
        .map(([k, tip]) => [paletteRank(q, { name: k || 'auto', tip, kind: '' }), k, tip]).filter(([r]) => r > 0).sort((a, c) => c[0] - a[0]).slice(0, 8);
      list.replaceChildren(...shown.map(([, k, tip]) => h('div', { cls: 'pitem', onmousedown: ev => { ev.preventDefault(); pick(k); } },
        h('b', { textContent: k || 'auto' }), h('span', { cls: 'pt' }, ...rich(tip)))));
    }
    popup(anchor, h('b', { textContent: 'plot' }), inp, list); fill(); inp.focus();
  }, 'mini');
  reg(b, () => setRich(b, `:timeline: ${lab.plot || 'auto'}`));
  return b;
}
const GALLERY_TARGETS = {
  dummy: ['A dummy stands in range: hits, hit stop and advantage', {}],
  whiff: ['Nobody in range: the move whiffs, pure animation', { bx: 720 }],
  ai: ['The engine AI: moves, attacks back', { b: 'ai' }],
};
// training tools (play): record your inputs, then the dummy replays them (mirrored to its facing)
function trainingCtl() {
  const human = () => SCENARIOS[lab.scen].a === 'human';
  const rec = toggle(':fiber_manual_record: rec', 'Record your inputs (from now until you switch it off); the replay dummy then plays them back', () => lab.rec, v => {
    const w = lab.cells[0].w;
    lab.rec = v;
    if (v) { lab.replay = false; w.tape = []; } else { lab.tape = w.tape; w.tape = null; }
  });
  const rep = toggle(':replay: replay', 'The dummy plays your recording in a loop: practise against your own combo or pressure', () => lab.replay, v => { lab.replay = v; build(); });
  reg(rec, () => { rec.disabled = !human(); });
  reg(rep, () => { rep.disabled = !human() || lab.rec || !lab.tape?.length; });
  return [grp('dummy', 'Record your inputs for the dummy to play back', rec, rep)];
}
// the export/import menus' replay items: export the play fight so far (play only), import one to play back (switches to play)
function replayExportItem() {
  const b = button('replay', `Export the play fight so far as a replay file: its inputs, settings and characters, pinned to engine v${ENGINE_VERSION} (other versions play it out differently)`, saveReplay);
  reg(b, () => { b.disabled = app.mode !== 'play' || !lab.cells[0]?.w.log.length; });
  return b;
}
const replayImportItem = () => button('replay', 'Play a saved replay file in play (inputs, settings and characters of a recorded fight). A file from another engine version plays out differently: it asks first, and the top line shows where it goes out of sync', loadReplay);
// the menu bar's replay group: only a loaded replay file needs stopping (picking a scenario already clears it)
function stopReplayButton() {
  const b = button(':close: stop', 'Stop playing this replay file and return to the live fight', () => { lab.playback = null; build(); });
  reg(b, () => { b.disabled = !lab.playback; });
  return b;
}
// the blow controls (impact's ragdoll, the creator's impact preview): what, how hard, from which side, and stand it up again
// under the preview, not the toolbar — it is its own thing to play with, not a setting of the view
// (inPv: the creator/animate split layout, where the preview is only the right-hand pane, not the whole canvas)
function blowBar(w, reset, inPv) {
  return h('div', { cls: 'over blowbar' + (inPv ? ' inpv' : '') },
    ...Object.entries(BLOWS).map(([k, [, , tip]]) => button(k, tip, () => blow(w(), k), 'mini')),
    h('span', { cls: 'sep' }),
    seg(Object.keys(BLOW_POWER), () => lab.blowPower, v => { lab.blowPower = v; }, { light: 'Light blows: power × 0.6', normal: 'The move\'s own power', heavy: 'Heavy blows: power × 1.7' }),
    seg(['front', 'back'], () => lab.blowSide, v => { lab.blowSide = v; }, { front: 'Blows from in front of the body', back: 'Blows from behind it' }),
    h('span', { cls: 'sep' }),
    button(':restart_alt: stand up', 'Put the body back on its feet', reset, 'mini'));
}
// replay files (see makeReplay): download the play fight, or load one and play it in place of the scenario
function saveReplay() {
  const w = lab.cells[0].w, name = lab.playback?.scenario || lab.scen;
  if (!w.log.length) return;
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(makeReplay(w, name))], { type: 'application/json' })),
    download: `${name.replace(/\W+/g, '-')}-${new Date().toISOString().slice(0, 19).replace(/\D/g, '')}.replay.json` });
  a.click(); URL.revokeObjectURL(a.href);
}
function loadReplay() { pickReplay(r => { lab.playback = r; lab.branch = null; app.paused = false; if (app.mode === 'play') build(); else setMode('play'); syncAll(); }); }
// a replay file from disk, checked (format, engine version: asks), handed to then
function pickReplay(then) {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => {
    let r;
    try { r = JSON.parse(await inp.files[0].text()); } catch (err) { return notice('Not a replay file', err.message); }
    if (r.format !== REPLAY_FORMAT) return notice('Not a replay file', 'This JSON file is not a stick2 replay.');
    if (r.version !== ENGINE_VERSION && !await askYes('Open an old replay?', `This replay was recorded with engine v${r.version}; this is v${ENGINE_VERSION}. The simulation changed since, so it will play out differently. Open it anyway?`, ':play_arrow: open')) return;
    then(r);
  };
  inp.click();
}
// the playing replay: engine version, time, and where it went out of sync
function drawPlayback(w) {
  const pb = w.playback, at = pb.at ??= pb.frames.reduce((a, f) => (a.push(a[a.length - 1] + f[0]), a), [0]), t = n => at[Math.min(n, at.length - 1)].toFixed(1);
  const old = pb.version !== ENGINE_VERSION, out = w.desync !== null;
  text(`replay · engine v${pb.version}${old ? ` (this is v${ENGINE_VERSION})` : ''} · ${t(w.log.length)} / ${t(pb.frames.length)} s${out ? ` · out of sync from ${t(w.desync)} s` : pb.over ? ' · matches the recording' : ''}`,
    canvas.width / 2, 20 * dpr, out || old ? RED[0] : '#2e8b57', 12, 'bold', 'center');
}
function sortButton() {
  return button(':sort: sort', 'Reorder the cells once by a metric (they keep running)', (e, b) => popup(b, h('div', { cls: 'bar' },
    Object.entries(METRICS).map(([k, [tip, f]]) => button(k, tip, () => { lab.cells.sort((p, q) => avg(q, f) - avg(p, f)); closePop(); })))));
}
function zoomBack() {
  const back = button(':grid_view: back to grid', 'Show all cells again (Esc)', () => { lab.zoom = false; });
  reg(back, () => { back.hidden = !lab.zoom; });
  return back;
}
function labCtx() {
  if (lab.mode === 'gallery') return [charStancePicker(),
    grp('target', 'What the moves play against', seg(Object.keys(GALLERY_TARGETS), () => lab.target, v => { lab.target = v; build(); }, mapVals(GALLERY_TARGETS, t => t[0]))),
    grp('filter', 'Fuzzy filter by move name: letters in order match (e.g. "lk" finds lowKick)', h('input', { cls: 'macro', value: lab.filter, placeholder: 'fuzzy filter…',
      oninput: e => { lab.filter = e.target.value; lab.scroll = 0; }, onkeydown: e => e.stopPropagation() })),
    showGrp(['meter', 'boxes', 'ghost', 'hud', 'labels'])];
  const els = [];
  if (lab.mode === 'play' && lab.branch) els.push(grp('branch', `A branch of the replay "${lab.branch.reel.name}" from ${lab.branch.n} frames in: you play P${lab.branch.side}`,
    button(':history: keep', 'Keep this branch: back to the replay tab, compared with its reel', keepBranch), button(':close: drop', 'Drop the branch: back to the normal fight', dropBranch)));
  if (lab.mode === 'experiment') els.push(grp('experiment', 'What the nine cells compare', seg(Object.keys(BREED_TIPS), () => lab.kind, v => { lab.kind = v; build(); panels(); }, BREED_TIPS)));
  if ((lab.kind !== 'attacks' && lab.kind !== 'impact' && lab.kind !== 'body') || lab.mode === 'play') els.push(grp('scenario', 'Who fights', scenButton(k => { lab.scen = k; lab.playback = lab.branch = null; build(); panels(); })));
  if (lab.mode === 'play' && !SCENARIOS[lab.scen]?.user) els.push(grp('fighters', 'Who fights: P1 (you), P2 and any extra fighters of the scenario, each any character; unset = the one being edited (P3 on: as P2)',
    SCENARIOS[lab.scen]?.select ? button(':sports_kabaddi: select screen', 'Open the character-select screen for this scenario', selectScreen) : null,
    fighterPick(0), shieldButton(0), swapFighters(), fighterPick(1), shieldButton(1), Array.from({ length: fighterCount(SCENARIOS[lab.scen]) - 2 }, (_, i) => [fighterPick(i + 2), shieldButton(i + 2)])));
  if (lab.mode === 'play' && SCENARIOS[lab.scen]?.waves) els.push(grp('waves', SPEC.waves.tip + ' Changing it starts over at wave 1',
    seg(SPEC.waves.opts, () => CFG.waves, v => { setCfg({ waves: v }); mode().restart(); }, SPEC.waves.optTips),
    toggle(':casino: mixed', SPEC.waveMix.tip, () => CFG.waveMix, v => { setCfg({ waveMix: v }); mode().restart(); })));
  if (lab.mode === 'experiment' && bred()) els.push(...breedCtx());
  else if (lab.mode === 'experiment' && lab.kind === 'compare') els.push(grp('sides', 'The settings of the two cells (the compare panel lists what differs)', cmpSource('a'), cmpSource('b')), zoomBack());
  else if (bodyKind()) { /* its controls are the side panel, expPanel() */ }
  else if (lab.mode === 'experiment' && lab.kind === 'impact') els.push(
    grp('kind', 'The nine scripted hits, or one body alone to strike', seg(['hits', 'ragdoll'], () => lab.impact, v => { lab.impact = v; build(); panels(); },
      { hits: 'Nine scripted hits on the character, struck by the stick fighter', ragdoll: 'One body alone, no attacker: strike it low, mid, high… with the buttons, or drag on it' },
      v => v === 'hits' ? ':grid_view: hits' : ':accessibility_new: ragdoll')),
    grp('falls', SPEC.falls.tip, seg(SPEC.falls.opts, () => CFG.falls, v => setCfg({ falls: v }), SPEC.falls.optTips)),
    showGrp(['meter', 'boxes', 'hud', 'labels'], lab.impact === 'ragdoll' ? null : toggle(':person_off: no attacker', 'Hide the attacker: only the struck body, its blows still land the same way (and drags strike it unobstructed)', () => lab.solo, v => { lab.solo = v; build(); })), zoomBack());
  else if (lab.mode === 'experiment') {
    const adopt = button(':check: use these values', 'Copy the focused cell\'s values into the settings (side panel)', () => setCfg(lab.focus.over));
    const back = zoomBack();
    reg(adopt, () => { adopt.hidden = !lab.zoom; });
    els.push(grp('axes', 'The variables swept across the cells', axisButton(lab.x, 'X'), axisButton(lab.y, 'Y'), plotButton()),
      grp('tests', 'Ready-made comparisons', button(':science: tests :expand_more:', 'Ready-made comparisons: collision modes, chain rules, combo effects, planes', (e, tb) => popup(tb, h('div', { cls: 'bar col', onclick: closePop }, button(':target: collision test', 'Every hitTest mode (columns) on three fights (rows): compare hits and whiffs of the collision modes', () => {
        Object.assign(lab.x, { k: 'hitTest' }); Object.assign(lab.y, { k: 'scenario' }); lab.rows = null; build();
      }),
      button(':sync_alt: cancel test', `Every chain rule (columns) on combo fights (rows: ${CANCEL_SCENS.join(' · ')}): what each rule lets through; the meter shows cancel windows in purple`, () => {
        Object.assign(lab.x, { k: 'chains' }); Object.assign(lab.y, { k: 'scenario' }); lab.rows = CANCEL_SCENS; lab.meter = true; build();
      }),
      button(':auto_awesome: combo fx test', 'One cell per combo escalation (longer pauses, growing shake, faster attacks, faster game…) on the air combo: pick the feel, then copy its values', () => {
        Object.assign(lab.x, { k: 'comboFx' }); lab.y.k = ''; lab.scen = 'air combo'; build();
      }),
      button(':view_in_ar: 2.5D test', `Every plane (columns: 2D, lanes, belt) on depth fights (rows: ${PLANE_SCENS.join(' · ')}): sidesteps dodge, flips, dashes, AI lining up`, () => {
        Object.assign(lab.x, { k: 'plane' }); Object.assign(lab.y, { k: 'scenario' }); lab.rows = PLANE_SCENS; build();
      }),
      button(':timer: window edge test', `lastFrame off and on (columns) on presses one frame inside the tech window and on its last frame (rows: ${EDGE_SCENS.join(' · ')}): off, the edge press is too late (THROW, no TECH); on, it still counts (BREAK, TECH)`, () => {
        Object.assign(lab.x, { k: 'lastFrame' }); Object.assign(lab.y, { k: 'scenario' }); lab.rows = EDGE_SCENS; build();
      }))))), adopt, back);
  }
  if (lab.mode === 'experiment' && lab.kind !== 'attacks' && lab.kind !== 'impact' && lab.kind !== 'body') els.push(grp('stats', 'How the cells are measured and ordered',
    seg([1, 3, 5], () => lab.seeds, v => { lab.seeds = v; build(); }, { 1: 'One fight per cell', 3: 'Each cell fought with 3 seeds; stats averaged (AI fights differ per seed)', 5: '5 seeds per cell, averaged' }, v => `${v} seed${v > 1 ? 's' : ''}`),
    sortButton()));
  if (!(lab.mode === 'experiment' && lab.kind === 'impact')) els.push(showGrp(['meter', ...lab.mode === 'play' ? ['inputs'] : [], 'boxes', 'ghost', 'hud', 'labels', 'timer']));
  // compare settings only in experiment (it drives its own compare kind); play just gets its scenario builder, if it has one
  const panelNames = [...lab.mode === 'experiment' && lab.kind !== 'impact' && lab.kind !== 'body' ? ['compare'] : [], ...lab.mode === 'play' ? ['builder'] : []];
  if (panelNames.length) els.push(panelsGrp(panelNames, { compare: CMP_PANEL_TIP, builder: BUILDER_TIP }));
  if (lab.mode === 'play') els.push(...trainingCtl(),
    grp('theater', 'No toolbars, no side panel, just the fight — for streaming or recording (Esc, or the key again, leaves it); health bars, frame meter, timer and labels are set in the show group',
      toggle(':crop_landscape: theater', 'Theater mode: no toolbars, no side panel, just the fight, and tries for fullscreen' + keyTip('theater') + ' (Esc, or the key again, leaves it)',
        () => app.theater, setTheater),
      seg(SPEC.hudPos.opts, () => CFG.hudPos, v => setCfg({ hudPos: v }), SPEC.hudPos.optTips, v => v === 'top' ? ':vertical_align_top: top' : ':person: body'),
      CFG.hudPos === 'top' ? SHOW.hudNames() : null));
  return els;
}

// ---------- side panel: presets, then every setting with its tooltip; groups have an ⓘ with info and keys ----------
function cfgControl(s) {
  const name = h('span', { textContent: s.k });
  if (s.k === 'scope') {
    const b = button('', 'The bone whose angle the scope plots · click: pick another', (e, b) => popup(b, h('div', { cls: 'bar' }, seg(currentChar().ids, () => CFG.scope, v => setDisplay('scope', v), Object.fromEntries(currentChar().ids.map(id => [id, `Plot the angle of ${id}`]))))));
    reg(b, () => { setRich(b, CFG.scope); });
    return h('div', { cls: 'row', tip: s.tip }, name, b);
  }
  const set = v => setCfg({ [s.k]: v }, 'cfg.' + s.k);
  if (s.opts) return h('div', { cls: 'row', tip: s.tip }, name, seg(s.opts, () => CFG[s.k], set, s.optTips));
  if (typeof s.v === 'boolean') return h('div', { cls: 'row', tip: s.tip }, name, toggle(CFG[s.k] ? 'on' : 'off', s.tip, () => CFG[s.k], set));
  return slider(s.k, s, () => CFG[s.k], set, s.tip);
}
function applyPreset(name) {
  const keep = { ...Object.fromEntries(DISPLAY.map(k => [k, CFG[k]])), timeScale: CFG.timeScale };
  setCfg({ ...DEFAULTS, ...PRESETS[name], ...keep });
}
// the settings shown in each group without "more" (the ones most worth turning first)
const BASIC_CFG = new Set(['plant', 'plantStep', 'maxSpeed', 'jumpVel', 'gravity', 'dashSpeed', 'airSpeed', 'fallSpeed', 'easing', 'attackSpeed', 'filter', 'response',
  'hitstop', 'hitShake', 'hitTest', 'powerScale', 'chains', 'chaseJump', 'juggleDecay', 'health', 'damage', 'chip', 'parry', 'staggerAt', 'dizzyAt',
  'grabReach', 'techWindow', 'weapon', 'weaponStart', 'disarm', 'falls', 'floorBounce', 'wallBounce', 'ceiling', 'plane', 'flips', 'dash',
  'comboStop', 'comboShake', 'comboSpeed', 'shake', 'zoomPunch', 'squash', 'sparks', 'slowmoT', 'punchIn', 'knockScale', 'impactFrames', ...DISPLAY]);
// fuzzy match: every query letter appears in order (ignoring case and spaces)
const fuzzy = (q, text) => { let i = 0; text = text.toLowerCase(); for (const c of q.toLowerCase().replace(/\s/g, '')) if ((i = text.indexOf(c, i) + 1) === 0) return false; return true; };

// ---------- movelist (play): P1's current character and stance, every bound move with its input notation (slotTip) ----------
// grouped normals first, then specials/motions/throws; several slots for the same move (e.g. special and qcfSpecial both
// playing it) collapse into one row with every notation that reaches it
function movelistEntries(ch, stanceI) {
  const binds = ch.stances[stanceI]?.[bindsKey(CFG.plane)] || {}, byMove = new Map();
  for (const [slot, m] of Object.entries(binds)) {
    if (!m || !ch.moves[m]) continue;
    const row = byMove.get(m) ?? byMove.set(m, { move: m, notes: [], special: /special|qcf|qcb|dp|^m\d+|throw/i.test(slot) }).get(m);
    const note = slotTip(slot) || slot; if (!row.notes.includes(note)) row.notes.push(note);
  }
  return [...byMove.values()].sort((a, b) => a.special - b.special || a.move.localeCompare(b.move));
}
const movelist = { el: null, q: '', key: '' };
// cheap: only touches the DOM when the played character, its stance or the filter actually changed; called every
// render frame (labRender) so a mid-fight stance switch updates it live, not just after a click (syncAll)
function refreshMovelist(f) {
  if (!movelist.el?.isConnected || !f) return;
  const key = `${f.ch.name}:${f.stanceI}:${movelist.q}`;
  if (key === movelist.key) return; movelist.key = key;
  const rows = movelistEntries(f.ch, f.stanceI).filter(r => !movelist.q || fuzzy(movelist.q, r.move));
  const els = [];
  let special = null; // a small label the first time the group changes (normals, then specials/motions/throws)
  for (const r of rows) { if (r.special !== special) { special = r.special; els.push(h('div', { cls: 'note', textContent: special ? 'specials' : 'normals' })); }
    els.push(h('div', { cls: 'bar' }, h('span', { textContent: r.notes.join(' / ') }), h('span', { textContent: r.move }))); }
  movelist.el.replaceChildren(...els.length ? els : [h('div', { cls: 'note', textContent: 'no move matches' })]);
}
function movelistSection() {
  const body = h('div'); movelist.el = body; movelist.key = ''; // force a fill on (re)mount
  const q = h('input', { cls: 'macro', value: movelist.q, placeholder: 'filter moves…', tip: 'Fuzzy filter by move name',
    onkeydown: e => e.stopPropagation(), oninput: e => { movelist.q = e.target.value; movelist.key = ''; refreshMovelist(lab.cells[0]?.w?.a); } });
  return [heading('Movelist', "The played character's own moves, each with the input that plays it: punches and kicks first, then specials, motions and throws. Updates live as you switch stance or character.", ''),
    h('div', { cls: 'bar' }, q), body];
}
// the scope: an oscilloscope over the focused cell's last few seconds, for the experiment tab specifically - watching
// a curve as you sweep a setting across cells (or breed, or compare A/B) catches things a single end-state number
// hides: a spring that overshoots and rings instead of settling, a stun meter that spikes instead of draining, which
// seed in a sweep made the AI's speed swing wildly. Reading it off one fight after the fact is possible but tedious;
// this is for watching it happen as you turn a dial.
function scopePanel() {
  return [heading('Monitor', "An oscilloscope over the focused cell's last few seconds. angle: a bone's keyframe target (grey) against what's actually drawn (red) after springs, damping and follow-through - the gap between them is overshoot, wobble or lag, which a hit stop or stun number alone won't show you. health / stun: both fighters' meters over time (P1 grey, P2 red) - whether one drains steadily or gets ground down by a snowballing combo. speed: P1's horizontal velocity - whether a dash or knockback is a clean curve or a jitter. Most useful paired with a sweep or breed below: change a setting, watch the shape change.", ''),
    h('div', { cls: 'row', tip: SPEC.scopeKind.tip }, h('span', { textContent: 'scope' }), h('div', { cls: 'bar' }, seg(SPEC.scopeKind.opts, () => CFG.scopeKind, v => setDisplay('scopeKind', v), SPEC.scopeKind.optTips))),
    (() => { const r = h('div', { cls: 'row', tip: SPEC.scope.tip }, h('span', { textContent: 'bone' }), h('div', { cls: 'bar' }, seg(currentChar().ids, () => CFG.scope, v => setDisplay('scope', v), Object.fromEntries(currentChar().ids.map(id => [id, `Plot the angle of ${id}`])))));
      reg(r, () => { r.hidden = CFG.scopeKind !== 'angle'; }); return r; })(),
    scopeCv, stats];
}
function configPanel() {
  let title = '';
  const rows = SCHEMA.map((s, i) => {
    if (Array.isArray(s)) { title = s[0]; return { el: groupHeading(s, i), head: true }; }
    if (s.k === 'scope' || s.k === 'scopeKind') return null; // their own panel now, experiment tab only: scopePanel()
    const el = gridLink(cfgControl(s), s);
    return { el: BASIC_CFG.has(s.k) ? el : adv(el), name: `${s.k} ${title}`, tip: (s.tip || '').toLowerCase() };
  }).filter(Boolean);
  const filter = () => {
    const q = lab.q || '';
    // fuzzy on the name and group title; tooltips only by plain substring (a loose fuzzy match there hits everything)
    for (const r of rows) if (!r.head) r.el.hidden = !!q && !fuzzy(q, r.name) && !r.tip.includes(q.toLowerCase());
    $('side').classList.toggle('searching', !!q); // folded sections and advanced rows open while searching
    rows.forEach((r, i) => { if (r.head) { let any = false; for (let j = i + 1; j < rows.length && !rows[j].head; j++) any ||= !rows[j].el.hidden; r.el.hidden = !any; } });
  };
  const search = h('div', { cls: 'bar' }, ...rich(':search:'),
    h('input', { cls: 'macro', value: lab.q || '', placeholder: 'search variables', tip: 'Fuzzy search: letters in order match names and groups, plain text matches tooltips · Esc clears',
      oninput: e => { lab.q = e.target.value; filter(); },
      onkeydown: e => { e.stopPropagation(); if (e.key === 'Escape') { e.target.value = lab.q = ''; filter(); } } }));
  filter();
  const first = rows.findIndex((r, i) => i && r.head);
  return [search, ...lab.mode === 'play' ? movelistSection() : [], ...lab.mode === 'experiment' ? scopePanel() : [], heading('Presets', 'Whole sets of settings at once: from raw (no smoothing) to juicy (the defaults). Your view settings (ghost, boxes, hud, labels, timer) stay.', ''),
    h('div', { cls: 'bar' }, Object.keys(PRESETS).map(n => button(optLabel(n), PRESET_TIPS[n], () => applyPreset(n))),
      button(':restart_alt: reset', 'All settings back to their defaults (same as juicy); the view settings stay, ⌘Z undoes', () => applyPreset('juicy'))),
    heading('Power', 'How hard blows land and how far bodies fly and bounce (off the floor, the walls and the ceiling). Only those settings change.', ''),
    h('div', { cls: 'bar' }, seg(Object.keys(POWER), () => Object.keys(POWER).find(n => Object.entries(POWER[n]).every(([k, v]) => CFG[k] === v)),
      n => setCfg({ ...POWER[n] }), POWER_TIPS, n => `:${POWER_ICONS[n]}: ${n}`)),
    ...rows.slice(first).map(r => r.el)];
}
// buttons on a group heading that change all of its variables at once
const groupKeys = i => { const k = []; for (let j = i + 1; j < SCHEMA.length && !Array.isArray(SCHEMA[j]); j++) k.push(SCHEMA[j].k); return k; };
// spec s: { min, max, step } for numbers, { opts } for choices, { v: boolean } for switches; v = current value, d = default
const nudge = f => (s, v) => typeof s.v === 'boolean' ? f > 0 : s.opts ? v : snap(s, v + f * (s.max - s.min));
const GROUP_OPS = {
  ':casino:': ['Randomize: every variable of the group gets a random value', s => typeof s.v === 'boolean' ? Math.random() < 0.5
    : s.opts ? s.opts[Math.floor(Math.random() * s.opts.length)] : snap(s, s.min + Math.random() * (s.max - s.min))],
  ':restart_alt:': ['Normalize: the group back to its defaults', (s, v, d) => d],
  ':arrow_drop_up:': ['Empower: numbers up by 15% of their range, switches on', nudge(0.15)],
  ':arrow_drop_down:': ['Diminish: numbers down by 15% of their range, switches off', nudge(-0.15)],
};
// the group buttons for any variables: specs (with k), get(k) / dflt(k) the current and default value, apply({ k: v }) in one
// undo step; exp: [tip, fn] for an experiment button
function groupOps(specs, get, dflt, apply, exp) {
  return h('span', { cls: 'gops' }, ...Object.entries(GROUP_OPS).map(([l, [tip, f]]) =>
    button(l, tip, () => apply(Object.fromEntries(specs.map(s => [s.k, f(s, get(s.k), dflt(s.k))]))), 'mini')),
    exp && button(':science:', exp[0], exp[1], 'mini'));
}
function groupHeading(s, i) {
  const el = heading(...s), ks = groupKeys(i).filter(k => k !== 'scope');
  if (s[0] === 'Debug') return el;
  el.append(groupOps(ks.map(k => SPEC[k]), k => CFG[k], k => SPEC[k].v, vals => setCfg(vals),
    ['Experiment: breed the group\'s variables in the experiment tab, click the best cell to breed around it', () => {
      lab.kind = 'breed'; breed.vars = new Set(ks); breed.cfg = null; setMode('experiment');
    }]));
  return el;
}
// clicking a variable's name sweeps it across the cells, in the experiment tab
function gridLink(row, s) {
  return expLink(row, `test ${s.k} in a grid, one value per cell`,
    () => { lab.kind = 'sweep'; Object.assign(lab.x, { k: s.k, lo: s.min, hi: s.max }); lab.y.k = ''; setMode('experiment'); });
}
const labSide = () => lab.mode === 'gallery' ? moveSide() : configPanel();
// the debug popup (menu bar): the Debug settings, the debug information, report a bug, reset and factory reset
// (the scope bone and the monitor live in the experiment tab now - see scopePanel)
function debugPanel(e, b) {
  const row = k => h('div', { cls: 'row', tip: SPEC[k].tip }, h('span', { textContent: k }), toggle(CFG[k] ? 'on' : 'off', SPEC[k].tip, () => CFG[k], v => setCfg({ [k]: v }, 'cfg.' + k)));
  popup(b, h('b', { textContent: 'debug' }), row('ghost'), row('boxes'), row('hud'), row('labels'),
    dbgInfo, h('div', { cls: 'bar' }, button(':bug_report: report a bug', 'Shows the report (build, settings changed from default, the shown fight), to copy and paste into a new GitHub issue', (e, b) => reportBug(b), 'bugbtn'),
      button(':restart_alt: reset settings', 'Every setting back to its default; the display aids (ghost, boxes, scope, hud, labels, timer) stay (⌘Z undoes)', () => { applyPreset('juicy'); mode().restart(); }),
      button(':delete: factory reset', 'Delete all local data: edited characters, settings, keys and macros, layout; then reload as new (asks first)', () => factoryReset())),
    h('div', { cls: 'bar' }, button(':code: github', 'Open the stick2 repository on GitHub, in a new tab', () => window.open('https://github.com/morbeo/stick2', '_blank'), 'mini')));
  pop.classList.add('dbgpop'); dbgT = 0; drawDebug();
}
const debugBtn = () => [...$('global').querySelectorAll('button')].find(b => b.dataset.tip?.startsWith('Debug:'));
// the fight the debug popup reports on: the focused cell in play / grid, else the mode's first world
const dbgWorld = () => mode() === labMode ? lab.focus?.w || lab.cells[0]?.w : mode().debugWorld?.() || mode().worlds()[0];
// the debug information: build, engine and runtime numbers and the shown fight's state, refreshed twice a second
const dbgInfo = h('pre', { cls: 'note dbg', tip: 'Debug information: the build (npm run build-info writes it), engine version, frame rate, and the focused fight: seed, frame, state hash, each fighter' });
// build, engine and runtime numbers and the shown fight's state, computed fresh (not just refreshed while the debug popup is open)
function debugText() {
  const b = typeof BUILD === 'object' ? BUILD : null, w = dbgWorld();
  const name = f => f.action ? (f.action.m.hurt ? 'hurt' : Object.keys(f.ch.moves).find(k => f.ch.moves[k] === f.action.m) || 'move') : f.kd || '';
  let kb = 0; try { for (const k in localStorage) if (localStorage.hasOwnProperty(k)) kb += (k.length + localStorage[k].length) / 512; } catch {}
  return [
    b ? `build ${b.commit}${b.dirty ? ' + changes' : ''} (${b.branch}) · ${b.date.slice(0, 16).replace('T', ' ')}` : 'build unknown (npm run build-info)',
    `engine v${ENGINE_VERSION} · ${app.fps} fps · ${app.frameMs.toFixed(1)} ms/frame, worst ${app.worstMs.toFixed(0)} ms`,
    `${app.mode} / ${lab.mode} · ${mode().worlds().length} worlds · ${Object.keys(DEFAULTS).filter(k => CFG[k] !== DEFAULTS[k]).length} settings changed`,
    ...w ? [`fight: seed ${w.seed} · frame ${w.log.length} · ${w.simT.toFixed(2)} s · hash ${w.stateHash()} · ${w.hits} hits`,
      ...w.fighters.map((f, i) => `P${i + 1} ${f.ch.name}: x ${f.x | 0} y ${f.y | 0} vx ${f.vx | 0} · hp ${Math.round(f.hp)} · ${frameState(f)} ${name(f)}`)] : [],
    `canvas ${canvas.width}×${canvas.height} @${dpr} · storage ${kb.toFixed(0)} KB · ${navigator.userAgent.match(/(Firefox|Chrome|Version)\/[\d.]+/)?.[0] || ''}`,
  ].join('\n');
}
let dbgT = 0;
function drawDebug() {
  if (!dbgInfo.isConnected || performance.now() < dbgT) return;
  dbgT = performance.now() + 500;
  dbgInfo.textContent = debugText();
}
// shows the debug info plus the actual settings changed from default (the count alone isn't actionable in a report);
// one button copies it and opens a new GitHub issue to paste it into. A saved replay (play: save replay) is the other
// half of a good report, so it's called out here too
function reportBug(anchor) {
  const settings = cfgData(), text = [debugText(),
    Object.keys(settings).length ? 'settings changed from default: ' + JSON.stringify(settings) : 'settings: all default'].join('\n');
  popup(anchor, h('b', { textContent: 'report a bug' }),
    h('p', {}, 'This is copied for you below. Describe what happened, paste it in, and attach a saved replay if you can reproduce it (play: the save replay button).'),
    h('pre', { cls: 'note dbg', textContent: text }),
    h('div', { cls: 'bar' }, button(':bug_report: copy & open a new issue', 'Copy this to your clipboard and open a new GitHub issue to paste it into', () => {
      navigator.clipboard?.writeText(text); window.open('https://github.com/morbeo/stick2/issues/new?template=bug_report.md', '_blank'); closePop();
    }, 'bugbtn')));
}

// click focuses a cell; in breed / attacks a click breeds around it and Shift+click focuses
function labClick(x, y, e) {
  if (lab.mode === 'play') return;
  if (lab.zoom) { lab.zoom = false; return; }
  const i = hitRect(labRects(), x, y);
  if (i < 0) return;
  const b = lab.cells[i].btns?.find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  if (b) return saveAttack(b.open, lab.cells[i]);
  lab.focus = lab.cells[i];
  if (lab.mode === 'gallery') followMove(lab.focus.move);
  // a pick in a settings experiment also sets those settings (⌘Z undoes it); Shift+click only looks
  if (lab.mode === 'experiment' && !e.shiftKey && lab.focus.over) setCfg(lab.focus.over);
  if (lab.mode === 'experiment' && bred() && !e.shiftKey) breedFrom(lab.cells[i]); else lab.zoom = true;
}

// impact: drag from a point on a body to strike it there; a plain click is a medium blow from the front
function impactMouse(type, x, y) {
  const d = lab.drag;
  if (type === 'down') {
    const rects = labRects(), i = hitRect(rects, x, y), w = shown()[i]?.w;
    if (!w?.view) return false;
    lab.drag = { w, x0: x, y0: y, x, y };
    cursor('crosshair');
    return true;
  }
  if (!d) { cursor(hitRect(labRects(), x, y) >= 0 ? 'crosshair' : 'default'); return true; }
  Object.assign(d, { x, y });
  if (type === 'up') {
    lab.drag = null;
    const v = d.w.view, wx = (d.x0 - v.ox) / v.s, wy = (d.y0 - v.oy) / v.s;
    let dx = (x - d.x0) / v.s, dy = (y - d.y0) / v.s;
    if (Math.hypot(dx, dy) < 4) { const f = d.w.fighters.reduce((a, b) => Math.abs(b.x - wx) < Math.abs(a.x - wx) ? b : a); dx = -f.dir * 50; dy = -10; }
    if (!d.w.poke(wx, wy, dx, dy) && Math.hypot(dx, dy) < 4) { lab.focus = shown().find(c => c.w === d.w); lab.zoom = !lab.zoom; } // a click off the bodies: focus / back
  }
  return true;
}

// the scenario builder open over play: drag a fighter or a prop on the stage to reposition it (the x slider in the
// builder does the same thing; this is just a quicker way). Dragged live (cheap: just the fighter/prop's x) and only
// written back to the saved scenario (scenChanged, which rebuilds the preview) once the drag ends
function builderMouse(type, x, y) {
  const d = lab.drag, w = lab.cells[0]?.w;
  if (!w?.view) return false;
  const v = w.view, wx = clamp((x - v.ox) / v.s, 20, W - 20);
  const near = () => { let best = null, bd = 40;
    w.fighters.forEach((f, i) => { const dd = Math.abs(f.x - wx); if (dd < bd) { bd = dd; best = { kind: 'fighter', i }; } });
    w.props.forEach((p, i) => { const dd = Math.abs(p.x - wx); if (dd < bd) { bd = dd; best = { kind: 'prop', i }; } });
    return best; };
  if (type === 'down') {
    const hit = near();
    if (!hit) return false;
    lab.drag = { w, ...hit }; cursor('grabbing');
    return true;
  }
  if (!d) { cursor(near() ? 'grab' : 'default'); return true; }
  d.w[d.kind === 'fighter' ? 'fighters' : 'props'][d.i].x = wx;
  if (type === 'up') {
    lab.drag = null; cursor('default');
    const u = myStore[lab.scen], list = u && (d.kind === 'fighter' ? u.p : u.props);
    if (list?.[d.i]) { list[d.i].x = Math.round(wx); scenChanged(); }
  }
  return true;
}
const labMode = {
  enter(m) { lab.mode = m; build(); },
  restart: build,
  overlay: () => bodyKind() ? [] : stageOpen() === 'compare' ? [compareView()] : stageOpen() === 'builder' && lab.mode === 'play' ? [scenBuilder()] :
    lab.mode === 'experiment' && lab.kind === 'impact' && lab.impact === 'ragdoll' && lab.cells[0] ? [blowBar(() => lab.cells[0].w, build)] : [],
  worlds: () => bodyKind() ? creator.exp.cells.map(c => c.w) : (lab.mode === 'gallery' ? onScreen() : lab.cells).flatMap(c => [c.w, ...(c.extra || [])]),
  clipRects: () => bodyKind() ? creatorMode.clipRects() : (() => { const r = labRects(); return shown().map((c, i) => ({ key: c, r: r[i] })); })(),
  render: () => bodyKind() ? creatorRender() : labRender(),
  ctxBar: labCtx,
  side: () => bodyKind() ? expPanel() : labSide(),
  get open() { return bodyKind() ? ['body experiment'] : lab.mode === 'gallery' ? ['move', 'key'] : lab.mode === 'play' ? ['presets', 'movelist'] : ['presets']; },
  mouse(type, x, y, e) {
    if (bodyKind()) return creatorMouse(type, x, y, e);
    if (lab.mode === 'experiment' && lab.kind === 'impact' && !e.shiftKey && impactMouse(type, x, y)) return;
    if (lab.mode === 'play' && stageOpen() === 'builder' && builderMouse(type, x, y)) return;
    if (type === 'down') labClick(x, y, e);
    lab.hover = hitRect(labRects(), x, y);
    const tip = shown()[lab.hover]?.tip; // a cell's tip (gallery movements, impacts) shows on hover
    if (tip) canvas.dataset.tip = tip; else delete canvas.dataset.tip;
    cursor(lab.mode !== 'play' && (lab.zoom || hitRect(labRects(), x, y) >= 0) ? 'pointer' : 'default');
  },
  wheel(dy) { const ms = maxScroll(); if (!ms) return false; lab.scroll = clamp(lab.scroll + dy * dpr, 0, ms); return true; },
  key(e) {
    if (e.code === 'Escape' && bodyKind()) { lab.kind = 'sweep'; build(); panels(); return true; }
    if (e.code === 'Escape' && lab.zoom) { lab.zoom = false; return true; }
  },
  hint: () => bodyKind() ? 'click a cell: breed around it · Esc: back to sweep'
    : lab.mode === 'play' && stageOpen() === 'builder' ? 'drag a fighter or a prop on the stage to reposition it · ' + fightHint()
    : lab.mode === 'play' ? fightHint()
    : lab.mode === 'experiment' && lab.kind === 'impact' ? 'drag on a body: strike it there (direction and length = the blow, long = knockdown) · click a body: a medium blow · click beside: focus / back · Esc back'
    : lab.mode === 'experiment' && bred() ? (lab.kind === 'attacks' ? 'click a cell: breed around it · its save / edit buttons: keep that attack · Shift+click: focus · Esc back' : 'click a cell: breed around it (and use its values, ⌘Z undoes) · Shift+click: focus · Esc back') : 'click a cell: focus it and use its values (⌘Z undoes) · Shift+click: only focus · Esc back',
};
