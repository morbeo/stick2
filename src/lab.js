'use strict';
// ---------- fight modes: play / grid (parameter sweep) / gallery (every move); each cell is an independent World ----------
const canvas = $('c'), ctx = canvas.getContext('2d');
let dpr = 1;
const lab = { mode: 'play', scen: 'you vs dummy', rows: null, x: { k: 'hitstop' }, y: { k: '' }, cells: [], cols: 1, focus: null, zoom: false, kind: 'sweep',
  seeds: 1, meter: true, inputs: true, tape: null, rec: false, replay: false, target: 'dummy' };
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
const AXIS_SCENS = ['J,J,K', 'sweep', 'ai vs ai'], CANCEL_SCENS = ['J,J,K', 'air combo', 'J,K→spin'];
function axisValues(ax, n) {
  const s = SPEC[ax.k];
  if (ax.k === 'scenario') return lab.rows || AXIS_SCENS;
  if (s.opts) return s.opts;
  if (typeof s.v === 'boolean') return [false, true];
  const lo = isNaN(ax.lo) ? s.min : ax.lo, hi = isNaN(ax.hi) ? s.max : ax.hi;
  return Array.from({ length: n }, (_, i) => +(Math.round((lo + (hi - lo) * i / (n - 1)) / s.step) * s.step).toFixed(4));
}
const galleryMoves = (ms = currentChar().moves) => [...GALLERY.filter(m => ms[m]), ...Object.keys(ms).filter(m => ms[m].power && !GALLERY.includes(m))];

function build() {
  const scen = SCENARIOS[lab.scen];
  lab.cells = []; lab.cols = 3; lab.zoom = false;
  if (lab.mode === 'play') {
    const replay = lab.replay && lab.tape?.length && scen.a === 'human';
    lab.cells.push({ w: newWorld(replay ? { ...scen, b: { tape: lab.tape } } : scen) }); lab.cols = 1;
  }
  else if (lab.mode === 'gallery') for (const m of galleryMoves()) lab.cells.push({ w: newWorld({ ...galleryScen(m), ...GALLERY_TARGETS[lab.target][1] }), move: m, label: m });
  else if (lab.kind !== 'sweep') lab.cells = lab.kind === 'breed' ? breedCells() : attackCells();
  else {
    const xs = axisValues(lab.x, lab.y.k ? 3 : 9), ys = lab.y.k ? axisValues(lab.y, 3) : [null];
    if (lab.y.k) lab.cols = xs.length;
    for (const yv of ys) for (const xv of xs) {
      const over = { [lab.x.k]: xv }, sy = lab.y.k === 'scenario';
      if (lab.y.k && !sy) over[lab.y.k] = yv;
      // same seed everywhere: every cell replays the identical fight, only the swept values differ
      lab.cells.push({ w: newWorld(sy ? SCENARIOS[yv] : scen, over, 7), over,
        label: Object.entries(over).map(([k, v]) => `${k}=${fmt(v)}`).join('  ') + (sy ? `  ${yv}` : '') });
    }
  }
  // extra seeds: the same cell fought again with other random rolls (AI, sparks); the stats average them
  if (lab.mode === 'grid' && lab.kind !== 'attacks' && lab.seeds > 1)
    for (const c of lab.cells) c.extra = Array.from({ length: lab.seeds - 1 }, (_, i) => newWorld(c.w.scen, c.over, 8 + i));
  lab.focus = lab.cells[0];
}

// rects of n cells in cols columns inside area (device px)
function cellRects(n, cols, area) {
  const rows = Math.ceil(n / cols), g = n > 1 ? 4 * dpr : 0;
  const cw = (area.w - g * (cols + 1)) / cols, ch = (area.h - g * (rows + 1)) / rows;
  return Array.from({ length: n }, (_, i) => ({ x: area.x + g + (i % cols) * (cw + g), y: area.y + g + Math.floor(i / cols) * (ch + g), w: cw, h: ch }));
}
const fullArea = () => ({ x: 0, y: 0, w: canvas.width, h: canvas.height });
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
  if (c.label) text(c.label, r.x + 8 * dpr, r.y + 16 * dpr, '#444', 12, 'bold');
  if (meter) drawMeter(c.w, { x: r.x + 6 * dpr, y: r.y + r.h - ph - (full ? 40 : 16) * dpr, w: r.w - 12 * dpr, h: (full ? 30 : 10) * dpr }, full);
  if (!full) text(cellStats(c), r.x + 8 * dpr, r.y + 30 * dpr, '#999', 11);
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
    (w.adv === null ? '' : `  ${w.adv >= 0 ? '+' : ''}${w.adv}f`);
}
// frame meter: one column per frame, newest on the right; top row = left fighter, bottom = right fighter
const METER_COLS = { idle: null, air: '#cfd8e0', move: '#b3a79a', startup: '#3a9d5d', active: '#c0392b', recovery: '#2c6fb0', cancel: '#8e44ad', hit: '#e6b422', down: '#e8dcb5', stop: '#fff' };
const METER_TIPS = 'frame meter: green startup · red active · blue recovery · purple cancel window · yellow hitstun · pale knocked down · white hit stop · grey air / other';
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
  const cells = shown(), play = lab.mode === 'play', rects = cellRects(cells.length, lab.zoom ? 1 : lab.cols, fullArea());
  cells.forEach((c, i) => drawCell(c, rects[i], { full: play, plot: !play, meter: lab.meter,
    selected: !play && !lab.zoom && (lab.mode === 'grid' && lab.kind !== 'sweep' ? c.parent && 'parent'
      : c.over ? Object.entries(c.over).every(([k, v]) => CFG[k] === v) && 'current settings' : c === lab.focus && 'focused') }));
  if (play && lab.inputs && cells[0].w.ctl[0] === 'human') drawInputs(cells[0].w, 10 * dpr, 60 * dpr);
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
const scopeCv = h('canvas', { id: 'scope' }), sctx = scopeCv.getContext('2d'), stats = h('div', { cls: 'note' });
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
  reg(b, () => { b.textContent = `⚔ ${lab.scen}`; });
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
      button('scenario', `One row per fight: ${AXIS_SCENS.join(' · ')}`, () => { lab.rows = null; pick('scenario'); closePop(); })),
      ...groups.flatMap(([g, vars]) => [h('h4', { textContent: g }), h('div', { cls: 'bar' }, vars.map(s => {
        const o = button(s.k, s.tip, () => pick(s.k));
        reg(o, () => o.classList.toggle('on', ax.k === s.k));
        return o;
      }))]),
      h('h4', { textContent: 'range' }), h('div', { cls: 'bar' }, 'from', range[0], 'to', range[1]));
  });
  reg(b, () => { b.textContent = `${name}: ${ax.k || 'none'}`; });
  return b;
}
const GALLERY_TARGETS = {
  dummy: ['A dummy stands in range: hits, hit stop and advantage', {}],
  whiff: ['Nobody in range: the move whiffs, pure animation', { bx: 720 }],
  ai: ['The engine AI: moves, attacks back', { b: 'ai' }],
};
const meterToggle = () => toggle('meter', METER_TIPS, () => lab.meter, v => { lab.meter = v; });
const boxesToggle = () => toggle('boxes', SPEC.boxes.tip, () => CFG.boxes, v => { CFG.boxes = v; });
// training tools (play): record your inputs, then the dummy replays them (mirrored to its facing)
function trainingCtl() {
  const human = () => SCENARIOS[lab.scen].a === 'human';
  const rec = toggle('rec', 'Record your inputs (from now until you switch it off); the replay dummy then plays them back', () => lab.rec, v => {
    const w = lab.cells[0].w;
    lab.rec = v;
    if (v) { lab.replay = false; w.tape = []; } else { lab.tape = w.tape; w.tape = null; }
  });
  const rep = toggle('replay', 'The dummy plays your recording in a loop: practise against your own combo or pressure', () => lab.replay, v => { lab.replay = v; build(); });
  reg(rec, () => { rec.disabled = !human(); });
  reg(rep, () => { rep.disabled = !human() || lab.rec || !lab.tape?.length; });
  return [meterToggle(), toggle('inputs', 'Input display: your inputs in numpad notation (6 forward, 2 down, 8 jump) and frames held', () => lab.inputs, v => { lab.inputs = v; }),
    rec, rep, boxesToggle()];
}
function sortButton() {
  return button('sort', 'Reorder the cells once by a metric (they keep running)', (e, b) => popup(b, h('div', { cls: 'bar' },
    Object.entries(METRICS).map(([k, [tip, f]]) => button(k, tip, () => { lab.cells.sort((p, q) => avg(q, f) - avg(p, f)); closePop(); })))));
}
function labCtx() {
  if (lab.mode === 'gallery') return [seg(Object.keys(GALLERY_TARGETS), () => lab.target, v => { lab.target = v; build(); }, mapVals(GALLERY_TARGETS, t => t[0])),
    meterToggle(), boxesToggle(), toggle('ghost', SPEC.ghost.tip, () => CFG.ghost, v => { CFG.ghost = v; })];
  const els = [];
  if (lab.mode === 'grid') els.push(seg(Object.keys(BREED_TIPS), () => lab.kind, v => { lab.kind = v; build(); panels(); }, BREED_TIPS));
  if (lab.kind !== 'attacks' || lab.mode === 'play') els.push(scenButton(k => { lab.scen = k; build(); }));
  if (lab.mode === 'grid' && lab.kind !== 'sweep') els.push(...breedCtx());
  else if (lab.mode === 'grid') {
    const adopt = button('use these values', 'Copy the focused cell\'s values into the settings (side panel)', () => Object.assign(CFG, lab.focus.over));
    const back = button('◱ back to grid', 'Show all cells again (Esc)', () => { lab.zoom = false; });
    reg(adopt, () => { adopt.hidden = !lab.zoom; }); reg(back, () => { back.hidden = !lab.zoom; });
    els.push(axisButton(lab.x, 'X'), axisButton(lab.y, 'Y'),
      button('collision test', 'Every hitTest mode (columns) on three fights (rows): compare hits and whiffs of the collision modes', () => {
        Object.assign(lab.x, { k: 'hitTest' }); Object.assign(lab.y, { k: 'scenario' }); lab.rows = null; build();
      }),
      button('cancel test', `Every chain rule (columns) on combo fights (rows: ${CANCEL_SCENS.join(' · ')}): what each rule lets through; the meter shows cancel windows in purple`, () => {
        Object.assign(lab.x, { k: 'chains' }); Object.assign(lab.y, { k: 'scenario' }); lab.rows = CANCEL_SCENS; lab.meter = true; build();
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
    reg(b, () => { b.textContent = CFG.scope; });
    return h('div', { cls: 'row', tip: s.tip }, name, b);
  }
  if (s.opts) return h('div', { cls: 'row', tip: s.tip }, name, seg(s.opts, () => CFG[s.k], v => { CFG[s.k] = v; }, s.optTips));
  if (typeof s.v === 'boolean') return h('div', { cls: 'row', tip: s.tip }, name, toggle(CFG[s.k] ? 'on' : 'off', s.tip, () => CFG[s.k], v => { CFG[s.k] = v; }));
  return slider(s.k, s, () => CFG[s.k], v => { CFG[s.k] = v; }, s.tip);
}
function applyPreset(name) {
  const keep = { ghost: CFG.ghost, boxes: CFG.boxes, scope: CFG.scope, timeScale: CFG.timeScale };
  Object.assign(CFG, DEFAULTS, PRESETS[name], keep);
}
function configPanel() {
  return [h('div', { cls: 'bar' }, Object.keys(PRESETS).map(n => button(n, PRESET_TIPS[n], () => applyPreset(n))),
      button('reset', 'All settings back to their defaults', () => applyPreset('juicy'))),
    ...SCHEMA.map((s, i) => Array.isArray(s) ? groupHeading(s, i) : s.k === 'scope' ? cfgControl(s) : gridLink(cfgControl(s), s))];
}
// buttons on a group heading that change all of its variables at once
const groupKeys = i => { const k = []; for (let j = i + 1; j < SCHEMA.length && !Array.isArray(SCHEMA[j]); j++) k.push(SCHEMA[j].k); return k; };
const nudge = f => (s, v) => typeof s.v === 'boolean' ? f > 0 : s.opts ? v : snap(s, v + f * (s.max - s.min));
const GROUP_OPS = {
  '⚄': ['Randomize: every variable of the group gets a random value', s => typeof s.v === 'boolean' ? Math.random() < 0.5
    : s.opts ? s.opts[Math.floor(Math.random() * s.opts.length)] : snap(s, s.min + Math.random() * (s.max - s.min))],
  '↺': ['Normalize: the group back to its defaults', s => s.v],
  '▲': ['Empower: numbers up by 15% of their range, switches on', nudge(0.15)],
  '▼': ['Diminish: numbers down by 15% of their range, switches off', nudge(-0.15)],
};
function groupHeading(s, i) {
  const el = heading(...s), ks = groupKeys(i).filter(k => k !== 'scope');
  if (s[0] === 'Debug') return el;
  el.append(h('span', { cls: 'gops' }, ...Object.entries(GROUP_OPS).map(([l, [tip, f]]) =>
    button(l, tip, () => { for (const k of ks) CFG[k] = f(SPEC[k], CFG[k]); }, 'mini')),
    button('▦', 'Experiment: breed the group\'s variables in the grid, click the best cell to breed around it', () => {
      lab.kind = 'breed'; breed.vars = new Set(ks); breed.cfg = null; setMode('grid');
    }, 'mini')));
  return el;
}
// clicking a variable's name sweeps it across the grid
function gridLink(row, s) {
  const n = row.firstChild;
  n.className = 'vname'; n.dataset.tip = `${s.tip} · Click the name: test ${s.k} in a grid`;
  n.onclick = e => { e.preventDefault(); lab.kind = 'sweep'; Object.assign(lab.x, { k: s.k, lo: s.min, hi: s.max }); lab.y.k = ''; setMode('grid'); };
  return row;
}
const labSide = () => [scopeCv, stats, ...configPanel()];

// click focuses a cell; in breed / attacks a click breeds around it and Shift+click focuses
function labClick(x, y, e) {
  if (lab.mode === 'play') return;
  if (lab.zoom) { lab.zoom = false; return; }
  const i = hitRect(cellRects(lab.cells.length, lab.cols, fullArea()), x, y);
  if (i < 0) return;
  lab.focus = lab.cells[i];
  if (lab.mode === 'grid' && lab.kind !== 'sweep' && !e.shiftKey) breedFrom(lab.cells[i]); else lab.zoom = true;
}

const labMode = {
  enter(m) { lab.mode = m; build(); },
  restart: build,
  worlds: () => lab.cells.flatMap(c => [c.w, ...(c.extra || [])]),
  render: labRender,
  ctxBar: labCtx,
  side: labSide,
  mouse(type, x, y, e) { if (type === 'down') labClick(x, y, e); },
  key(e) { if (e.code === 'Escape' && lab.zoom) { lab.zoom = false; return true; } },
  hint: () => lab.mode === 'play' ? fightHint()
    : lab.mode === 'grid' && lab.kind !== 'sweep' ? 'click a cell: breed around it · Shift+click: focus · Esc back' : 'click a cell to focus it · Esc back',
};
