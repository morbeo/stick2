'use strict';
// ---------- fight modes: play / grid (parameter sweep) / gallery (every move); each cell is an independent World ----------
const canvas = $('c'), ctx = canvas.getContext('2d');
const cursor = c => { if (canvas.style.cursor !== c) canvas.style.cursor = c; }; // the mouse cursor follows what is under it
let dpr = 1;
const lab = { mode: 'play', scen: 'you vs dummy', rows: null, x: { k: 'hitstop' }, y: { k: '' }, cells: [], cols: 1, focus: null, zoom: false, kind: 'sweep',
  seeds: 1, meter: true, inputs: true, tape: null, rec: false, replay: false, target: 'dummy', playback: null };
const newWorld = (...a) => Object.assign(new World(...a), { loop: app.loop });

// what the little plot under a grid cell shows, by the swept variable
const GROUP = {
  spring: ['filter', 'dampRate', 'freq', 'zeta', 'response', 'followThru'],
  ease: ['easing'],
  stop: ['hitstop', 'hitstopAtk', 'hitstopFin', 'hitstopDecay', 'hitstopBudget', 'hitShake'],
  move: ['maxSpeed', 'accel', 'decel', 'jumpVel', 'gravity', 'jumpSquat'],
};
const plotKind = k => Object.keys(GROUP).find(g => GROUP[g].includes(k)) || 'scope';
const PRESET_TIPS = {
  raw: 'No tween, no spring, no juice: poses snap from key to key.',
  tweened: 'Keyframes eased, no spring, no juice.',
  spring: 'Tween + spring filter, no juice.',
  floaty: 'Slow, loose springs on top of the defaults.',
  juicy: 'Everything on: the defaults.',
};

// n values across [lo, hi] snapped to the slider step; categorical vars just take their options
// 'scenario' (Y only) runs each row on a different scripted fight
// combo fx test (X only): one cell per escalation, each on top of all escalations off
const FX_OFF = { comboStop: 0, comboShake: 0, comboZoom: 0, comboSpeed: 0, comboTime: 0 };
const COMBO_FX = { none: {}, 'longer pauses': { comboStop: 0.3 }, 'shorter pauses': { comboStop: -0.15 }, 'growing shake': { comboShake: 0.5 },
  'growing zoom': { comboZoom: 0.5 }, 'faster attacks': { comboSpeed: 0.2 }, 'faster game': { comboTime: 0.2 }, 'slower game': { comboTime: -0.12 },
  everything: { comboStop: 0.2, comboShake: 0.4, comboZoom: 0.4, comboSpeed: 0.12, comboTime: 0.1 } };
const AXIS_SCENS = ['J,J,K', 'sweep', 'ai vs ai'], CANCEL_SCENS = ['J,J,K', 'air combo', 'J,K→spin'],
  PLANE_SCENS = ['sidestep', 'ninja flip', 'dash & run', 'ai vs ai'];
function axisValues(ax, n) {
  const s = SPEC[ax.k];
  if (ax.k === 'scenario') return lab.rows || AXIS_SCENS;
  if (ax.k === 'comboFx') return Object.keys(COMBO_FX);
  if (s.opts) return s.opts;
  if (typeof s.v === 'boolean') return [false, true];
  const lo = isNaN(ax.lo) ? s.min : ax.lo, hi = isNaN(ax.hi) ? s.max : ax.hi;
  return Array.from({ length: n }, (_, i) => +(Math.round((lo + (hi - lo) * i / (n - 1)) / s.step) * s.step).toFixed(4));
}
const galleryMoves = (ms = currentChar().moves) => [...GALLERY.filter(m => ms[m]), ...Object.keys(ms).filter(m => ms[m].power && !GALLERY.includes(m))];

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

function build() {
  const scen = SCENARIOS[lab.scen];
  lab.cells = []; lab.cols = 3; lab.zoom = false; lab.scroll = 0;
  if (lab.mode === 'play') {
    const replay = lab.replay && lab.tape?.length && scen.a === 'human';
    lab.cells.push({ w: lab.playback ? Object.assign(replayWorld(lab.playback), { loop: app.loop }) : newWorld(replay ? { ...scen, b: { tape: lab.tape } } : scen) }); lab.cols = 1;
  }
  else if (lab.mode === 'impact') for (const [k, [tip, s]] of Object.entries(IMPACTS))
    lab.cells.push({ w: newWorld({ b: 'dummy', period: 3, ...s }, {}, 7, [CHARS.stick, currentChar()]), label: k, tip });
  else if (lab.mode === 'gallery') for (const m of galleryMoves()) lab.cells.push({ w: newWorld({ ...galleryScen(m), ...GALLERY_TARGETS[lab.target][1] }), move: m, label: m });
  else if (lab.kind !== 'sweep') lab.cells = lab.kind === 'breed' ? breedCells() : attackCells();
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
  if (lab.mode === 'grid' && lab.kind !== 'attacks' && lab.seeds > 1)
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
const shown = () => lab.zoom ? [lab.focus] : lab.cells;
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
  c.w.render(ctx, { ...r, h: r.h - ph }, full);
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
  const ly = c.label ? drawLabel(c.label, r, full) : r.y + 16 * dpr;
  if (meter) drawMeter(c.w, { x: r.x + 6 * dpr, y: r.y + r.h - ph - (full ? 40 : 16) * dpr, w: r.w - 12 * dpr, h: (full ? 30 : 10) * dpr }, full);
  if (!full) text(cellStats(c), r.x + 8 * dpr, ly + 14 * dpr, '#999', r.w < 260 * dpr ? 9 : 11);
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
function drawMeter(w, r, full) {
  const fs = w.hist.fs, n = full ? 120 : 60, cw = r.w / n, rh = r.h / 2 - dpr;
  ctx.fillStyle = '#0000000d'; ctx.fillRect(r.x, r.y, r.w, r.h);
  fs.slice(-n).forEach((st, i) => st.forEach((s, j) => {
    if (!METER_COLS[s]) return;
    ctx.fillStyle = METER_COLS[s];
    ctx.fillRect(r.x + (n - Math.min(n, fs.length) + i) * cw, r.y + j * (rh + 2 * dpr), Math.max(dpr, cw - (full ? dpr : 0)), rh);
  }));
  if (full) text(METER_TIPS, r.x, r.y - 4 * dpr, '#aaa', 10);
}
// input display: the human's last inputs in numpad notation, newest on top, with how many frames each was held
function drawInputs(w, x, y) {
  [...w.inputs].reverse().slice(0, 16).forEach((e, i) =>
    text(`${e.n}${e.b ? ' ' + e.b : ''}`.padEnd(6) + String(e.f).padStart(3), x, y + i * 14 * dpr, e.b ? '#c0392b' : '#888', 11, e.b ? 'bold' : ''));
}
function labRender() {
  clear();
  lab.scroll = clamp(lab.scroll, 0, maxScroll()); // the canvas or the column count may have changed
  const cells = shown(), play = lab.mode === 'play', rects = labRects(cells.length);
  cells.forEach((c, i) => drawCell(c, rects[i], { full: play, plot: !play && lab.mode !== 'impact', meter: lab.meter,
    selected: !play && !lab.zoom && (lab.mode === 'grid' && lab.kind !== 'sweep' ? c.parent && 'parent'
      : c.over ? Object.entries(c.over).every(([k, v]) => CFG[k] === v) && 'current settings' : c === lab.focus && 'focused') }));
  if (lab.mode === 'grid' && lab.kind === 'attacks' && !lab.zoom) cells.forEach((c, i) => { c.btns = null; if (i === lab.hover) drawCellButtons(c, rects[i]); });
  if (play && lab.inputs && cells[0].w.ctl[0] === 'human') drawInputs(cells[0].w, 10 * dpr, 60 * dpr);
  if (play && cells[0].w.playback) drawPlayback(cells[0].w);
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
  drawScope();
}

function text(s, x, y, col, size, weight = '', align = 'left') {
  ctx.fillStyle = col; ctx.textAlign = align;
  ctx.font = `${weight} ${size * dpr}px ui-monospace, Menlo, monospace`;
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
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
  const w = c.w, cfg = w.cfg, kind = c.move ? 'timeline' : c.over ? plotKind(c.plot ?? lab.x.k) : 'scope';
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
    note('freeze/hit 0-0.4s: fill got, outline wanted');
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
  } else {
    const all = w.hist.tgt.concat(w.hist.disp), lo = Math.min(...all) - 5, hi = Math.max(...all) + 5;
    series(ctx, w.hist.tgt, r, lo, hi, '#bbb', HIST);
    series(ctx, w.hist.disp, r, lo, hi, '#c0392b', HIST);
    note(`${cfg.scope}: target / drawn (red)`);
  }
}

// sidebar oscilloscope: target vs drawn for one bone of the focused cell's left fighter
const scopeCv = h('canvas', { id: 'scope', tip: 'Oscilloscope: the angle of one bone (the scope setting) over the last seconds of the focused fight.\n' +
  'grey = the target the keyframes ask for · red = what is drawn after the pose filter (springs, damping, follow-through).\n' +
  'Use it to tune the filter: overshoot and wobble show as red ringing around grey, lag as red trailing behind it, flat parts are hit stop.' }), sctx = scopeCv.getContext('2d'), stats = h('div', { cls: 'note' });
function drawScope() {
  if (!scopeCv.isConnected || !lab.focus) return;
  const w = lab.focus.w, hs = w.hist;
  scopeCv.width = scopeCv.clientWidth * dpr; scopeCv.height = scopeCv.clientHeight * dpr;
  const cw = scopeCv.width, ch = scopeCv.height;
  sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, cw, ch);
  const all = hs.tgt.concat(hs.disp), lo = Math.min(...all) - 5, hi = Math.max(...all) + 5, r = { x: 0, y: 4, w: cw, h: ch - 8 };
  series(sctx, hs.tgt, r, lo, hi, '#bbb', HIST);
  series(sctx, hs.disp, r, lo, hi, '#c0392b', HIST);
  stats.textContent = `${lab.focus.label || lab.scen} — ${w.cfg.scope}: target (grey) vs drawn (red)\n` +
    `frozen ${Math.round(100 * w.frozenT / (w.simT || 1))}% of ${w.simT.toFixed(1)}s · ${w.hits} hits` +
    (w.adv === null ? '' : ` · last hit ${w.adv >= 0 ? '+' : ''}${w.adv}f`);
}

// ---------- context bar: scenario, grid axes, focus ----------
const ctlName = c => c === 'human' ? 'you' : c === 'ai' ? 'AI' : Array.isArray(c) ? 'script' : 'dummy';
function scenTip(s) {
  const who = [s.a, s.b, ...(s.more || []).map(m => m.c)].map(ctlName);
  const script = Array.isArray(s.a) ? `\nscript: ${s.a.map(i => typeof i === 'number' ? i + 's' : i.hold ? `hold ${i.hold} ${i.t}s` : i).join(', ')}` : '';
  return `${who[0]} vs ${who.slice(1).join(' + ')}${s.period ? ` · restarts every ${s.period}s` : ''}${script}`;
}
const SCEN_GROUPS = [
  ['you', 'You on the keyboard.', s => s.a === 'human'],
  ['engine AI', 'The built-in AI walks in and throws random chains.', s => !Array.isArray(s.a) && s.a !== 'human'],
  ['scripted tests', 'Repeatable inputs: the same fight every loop, ideal for the grid.', s => Array.isArray(s.a)],
];
function scenButton(onPick) {
  const b = button('', 'Choose who fights', (e, b) => popup(b, ...SCEN_GROUPS.flatMap(([g, info, f]) => [
    h('h4', { textContent: g, tip: info }),
    h('div', { cls: 'bar' }, Object.entries(SCENARIOS).filter(([, s]) => f(s)).map(([k, s]) => {
      const o = button(k, scenTip(s), () => { closePop(); onPick(k); });
      reg(o, () => o.classList.toggle('on', lab.scen === k));
      return o;
    })),
  ])));
  reg(b, () => { setRich(b, `:sports_kabaddi: ${lab.scen}`); });
  return b;
}
// grid axis: pick a variable (grouped like the side panel) and its range
function axisButton(ax, name) {
  const b = button('', `${name} axis: the variable swept across the grid`, (e, b) => {
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
const GALLERY_TARGETS = {
  dummy: ['A dummy stands in range: hits, hit stop and advantage', {}],
  whiff: ['Nobody in range: the move whiffs, pure animation', { bx: 720 }],
  ai: ['The engine AI: moves, attacks back', { b: 'ai' }],
};
const meterToggle = () => toggle(':timeline: meter', METER_TIPS, () => lab.meter, v => { lab.meter = v; });
const boxesToggle = () => toggle(':check_box_outline_blank: boxes', SPEC.boxes.tip, () => CFG.boxes, v => { CFG.boxes = v; });
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
  const file = toggle(':upload: replay file', 'Play a saved replay file (inputs, settings and characters of a recorded fight); click again to stop. A file from another engine version plays out differently: it asks first, and the top line shows where it goes out of sync',
    () => !!lab.playback, v => v ? loadReplay() : (lab.playback = null, build()));
  const save = button(':download: save replay', `Download this fight so far as a replay file: its inputs, settings and characters, pinned to engine v${ENGINE_VERSION} (other versions play it out differently)`, saveReplay);
  return [meterToggle(), toggle(':stadia_controller: inputs', 'Input display: your inputs in numpad notation (6 forward, 2 down, 8 up) and frames held', () => lab.inputs, v => { lab.inputs = v; }),
    rec, rep, save, file, boxesToggle()];
}
// replay files (see makeReplay): download the play fight, or load one and play it in place of the scenario
function saveReplay() {
  const w = lab.cells[0].w, name = lab.playback?.scenario || lab.scen;
  if (!w.log.length) return;
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(makeReplay(w, name))], { type: 'application/json' })),
    download: `${name.replace(/\W+/g, '-')}-${new Date().toISOString().slice(0, 19).replace(/\D/g, '')}.replay.json` });
  a.click(); URL.revokeObjectURL(a.href);
}
function loadReplay() {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => {
    let r;
    try { r = JSON.parse(await inp.files[0].text()); } catch (err) { return alert('Not a replay file: ' + err.message); }
    if (r.format !== REPLAY_FORMAT) return alert('Not a replay file');
    if (r.version !== ENGINE_VERSION && !confirm(`This replay was recorded with engine v${r.version}; this is v${ENGINE_VERSION}. The simulation changed since, so it will play out differently. Play it anyway?`)) return;
    lab.playback = r; app.paused = false; build(); syncAll();
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
  if (lab.mode === 'gallery') return [seg(Object.keys(GALLERY_TARGETS), () => lab.target, v => { lab.target = v; build(); }, mapVals(GALLERY_TARGETS, t => t[0])),
    meterToggle(), boxesToggle(), toggle(':visibility: ghost', SPEC.ghost.tip, () => CFG.ghost, v => { CFG.ghost = v; })];
  if (lab.mode === 'impact') return [
    seg(SPEC.falls.opts, () => CFG.falls, v => setCfg({ falls: v }), SPEC.falls.optTips),
    meterToggle(), boxesToggle(), zoomBack()];
  const els = [];
  if (lab.mode === 'grid') els.push(seg(Object.keys(BREED_TIPS), () => lab.kind, v => { lab.kind = v; build(); panels(); }, BREED_TIPS));
  if (lab.kind !== 'attacks' || lab.mode === 'play') els.push(scenButton(k => { lab.scen = k; lab.playback = null; build(); }));
  if (lab.mode === 'grid' && lab.kind !== 'sweep') els.push(...breedCtx());
  else if (lab.mode === 'grid') {
    const adopt = button(':check: use these values', 'Copy the focused cell\'s values into the settings (side panel)', () => setCfg(lab.focus.over));
    const back = zoomBack();
    reg(adopt, () => { adopt.hidden = !lab.zoom; });
    els.push(axisButton(lab.x, 'X'), axisButton(lab.y, 'Y'),
      button(':target: collision test', 'Every hitTest mode (columns) on three fights (rows): compare hits and whiffs of the collision modes', () => {
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
      }), adopt, back);
  }
  if (lab.mode === 'grid' && lab.kind !== 'attacks') els.push(
    seg([1, 3, 5], () => lab.seeds, v => { lab.seeds = v; build(); }, { 1: 'One fight per cell', 3: 'Each cell fought with 3 seeds; stats averaged (AI fights differ per seed)', 5: '5 seeds per cell, averaged' }, v => `${v} seed${v > 1 ? 's' : ''}`),
    sortButton(), meterToggle());
  if (lab.mode === 'play') els.push(...trainingCtl());
  return els;
}

// ---------- side panel: presets, then every setting with its tooltip; groups have an ⓘ with info and keys ----------
function cfgControl(s) {
  const name = h('span', { textContent: s.k });
  if (s.k === 'scope') {
    const b = button('', 'Pick the bone to plot', (e, b) => popup(b, h('div', { cls: 'bar' }, seg(currentChar().ids, () => CFG.scope, v => { CFG.scope = v; }))));
    reg(b, () => { setRich(b, CFG.scope); });
    return h('div', { cls: 'row', tip: s.tip }, name, b);
  }
  const set = v => setCfg({ [s.k]: v }, 'cfg.' + s.k);
  if (s.opts) return h('div', { cls: 'row', tip: s.tip }, name, seg(s.opts, () => CFG[s.k], set, s.optTips));
  if (typeof s.v === 'boolean') return h('div', { cls: 'row', tip: s.tip }, name, toggle(CFG[s.k] ? 'on' : 'off', s.tip, () => CFG[s.k], set));
  return slider(s.k, s, () => CFG[s.k], set, s.tip);
}
function applyPreset(name) {
  const keep = { ghost: CFG.ghost, boxes: CFG.boxes, scope: CFG.scope, timeScale: CFG.timeScale };
  setCfg({ ...DEFAULTS, ...PRESETS[name], ...keep });
}
// fuzzy match: every query letter appears in order (ignoring case and spaces)
const fuzzy = (q, text) => { let i = 0; text = text.toLowerCase(); for (const c of q.toLowerCase().replace(/\s/g, '')) if ((i = text.indexOf(c, i) + 1) === 0) return false; return true; };
function configPanel() {
  let title = '';
  const rows = SCHEMA.map((s, i) => {
    if (Array.isArray(s)) { title = s[0]; return { el: groupHeading(s, i), head: true }; }
    return { el: s.k === 'scope' ? cfgControl(s) : gridLink(cfgControl(s), s), name: `${s.k} ${title}`, tip: (s.tip || '').toLowerCase() };
  });
  const filter = () => {
    const q = lab.q || '';
    // fuzzy on the name and group title; tooltips only by plain substring (a loose fuzzy match there hits everything)
    for (const r of rows) if (!r.head) r.el.hidden = !!q && !fuzzy(q, r.name) && !r.tip.includes(q.toLowerCase());
    rows.forEach((r, i) => { if (r.head) { let any = false; for (let j = i + 1; j < rows.length && !rows[j].head; j++) any ||= !rows[j].el.hidden; r.el.hidden = !any; } });
  };
  const search = h('div', { cls: 'bar' }, ...rich(':search:'),
    h('input', { cls: 'macro', value: lab.q || '', placeholder: 'search variables', tip: 'Fuzzy search: letters in order match names and groups, plain text matches tooltips · Esc clears',
      oninput: e => { lab.q = e.target.value; filter(); },
      onkeydown: e => { e.stopPropagation(); if (e.key === 'Escape') { e.target.value = lab.q = ''; filter(); } } }));
  filter();
  return [h('div', { cls: 'bar' }, Object.keys(PRESETS).map(n => button(n, PRESET_TIPS[n], () => applyPreset(n))),
      button(':restart_alt: reset', 'All settings back to their defaults', () => applyPreset('juicy'))),
    search, ...rows.map(r => r.el)];
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
    ['Experiment: breed the group\'s variables in the grid, click the best cell to breed around it', () => {
      lab.kind = 'breed'; breed.vars = new Set(ks); breed.cfg = null; setMode('grid');
    }]));
  return el;
}
// clicking a variable's name sweeps it across the grid
function gridLink(row, s) {
  return expLink(row, `test ${s.k} in a grid, one value per cell`,
    () => { lab.kind = 'sweep'; Object.assign(lab.x, { k: s.k, lo: s.min, hi: s.max }); lab.y.k = ''; setMode('grid'); });
}
const labSide = () => [scopeCv, stats, ...configPanel()];

// click focuses a cell; in breed / attacks a click breeds around it and Shift+click focuses
function labClick(x, y, e) {
  if (lab.mode === 'play') return;
  if (lab.zoom) { lab.zoom = false; return; }
  const i = hitRect(labRects(), x, y);
  if (i < 0) return;
  const b = lab.cells[i].btns?.find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  if (b) return saveAttack(b.open, lab.cells[i]);
  lab.focus = lab.cells[i];
  // a pick in a settings experiment also sets those settings (⌘Z undoes it); Shift+click only looks
  if (lab.mode === 'grid' && !e.shiftKey && lab.focus.over) setCfg(lab.focus.over);
  if (lab.mode === 'grid' && lab.kind !== 'sweep' && !e.shiftKey) breedFrom(lab.cells[i]); else lab.zoom = true;
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

const labMode = {
  enter(m) { lab.mode = m; build(); },
  restart: build,
  worlds: () => lab.cells.flatMap(c => [c.w, ...(c.extra || [])]),
  render: labRender,
  ctxBar: labCtx,
  side: labSide,
  mouse(type, x, y, e) {
    if (lab.mode === 'impact' && !e.shiftKey && impactMouse(type, x, y)) return;
    if (type === 'down') labClick(x, y, e);
    lab.hover = hitRect(labRects(), x, y);
    cursor(lab.mode !== 'play' && (lab.zoom || hitRect(labRects(), x, y) >= 0) ? 'pointer' : 'default');
  },
  wheel(dy) { const ms = maxScroll(); if (!ms) return false; lab.scroll = clamp(lab.scroll + dy * dpr, 0, ms); return true; },
  key(e) { if (e.code === 'Escape' && lab.zoom) { lab.zoom = false; return true; } },
  hint: () => lab.mode === 'play' ? fightHint()
    : lab.mode === 'impact' ? 'drag on a body: strike it there (direction and length = the blow, long = knockdown) · click a body: a medium blow · click beside: focus / back · Esc back'
    : lab.mode === 'grid' && lab.kind !== 'sweep' ? (lab.kind === 'attacks' ? 'click a cell: breed around it · its save / edit buttons: keep that attack · Shift+click: focus · Esc back' : 'click a cell: breed around it (and use its values, ⌘Z undoes) · Shift+click: focus · Esc back') : 'click a cell: focus it and use its values (⌘Z undoes) · Shift+click: only focus · Esc back',
};
