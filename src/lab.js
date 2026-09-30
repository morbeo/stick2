'use strict';
// ---------- lab: play / 3x3 parameter grid / move gallery, each cell an independent World ----------
const $ = id => document.getElementById(id);
const canvas = $('c'), ctx = canvas.getContext('2d'), scopeCv = $('scope'), sctx = scopeCv.getContext('2d');
let dpr = 1;
const lab = { mode: 'play', scen: 'you vs dummy', x: { k: 'hitstop' }, y: { k: '' },
  paused: false, stepOnce: false, speed: 1, loop: true, cells: [], cols: 1, focus: null };

// what the little plot under a grid cell shows, by the swept variable
const GROUP = {
  spring: ['filter', 'dampRate', 'freq', 'zeta', 'response', 'followThru'],
  ease: ['easing'],
  stop: ['hitstop', 'hitstopAtk', 'hitstopFin', 'hitstopDecay', 'hitstopBudget', 'hitShake'],
  move: ['maxSpeed', 'accel', 'decel', 'jumpVel', 'gravity', 'jumpSquat'],
};
const plotKind = k => Object.keys(GROUP).find(g => GROUP[g].includes(k)) || 'scope';
const fmt = v => typeof v === 'number' ? String(+v.toFixed(3)) : String(v);

// n values across [lo, hi] snapped to the slider step; categorical vars just take their options
function axisValues(ax, n) {
  const s = SPEC[ax.k];
  if (s.opts) return s.opts.slice(0, n);
  if (typeof s.v === 'boolean') return [false, true];
  const lo = isNaN(ax.lo) ? s.min : ax.lo, hi = isNaN(ax.hi) ? s.max : ax.hi;
  return Array.from({ length: n }, (_, i) => +(Math.round((lo + (hi - lo) * i / (n - 1)) / s.step) * s.step).toFixed(4));
}

function build() {
  const scen = SCENARIOS[lab.scen];
  lab.cells = []; lab.cols = 3;
  if (lab.mode === 'play') { lab.cells.push({ w: new World(scen) }); lab.cols = 1; }
  else if (lab.mode === 'gallery') for (const m of GALLERY) lab.cells.push({ w: new World(galleryScen(m)), move: m, label: m });
  else {
    const xs = axisValues(lab.x, lab.y.k ? 3 : 9), ys = lab.y.k ? axisValues(lab.y, 3) : [null];
    if (lab.y.k) lab.cols = xs.length;
    for (const yv of ys) for (const xv of xs) {
      const over = { [lab.x.k]: xv };
      if (lab.y.k) over[lab.y.k] = yv;
      // same seed everywhere: every cell replays the identical fight, only the swept values differ
      lab.cells.push({ w: new World(scen, over, 7), over, label: Object.entries(over).map(([k, v]) => `${k}=${fmt(v)}`).join('  ') });
    }
  }
  for (const c of lab.cells) c.w.loop = lab.loop;
  lab.focus = lab.cells[0];
}

function cellRects() {
  const n = lab.cells.length, cols = lab.cols, rows = Math.ceil(n / cols), g = n > 1 ? 4 * dpr : 0;
  const cw = (canvas.width - g * (cols + 1)) / cols, ch = (canvas.height - g * (rows + 1)) / rows;
  return lab.cells.map((c, i) => ({ x: g + (i % cols) * (cw + g), y: g + Math.floor(i / cols) * (ch + g), w: cw, h: ch }));
}

// ---------- render ----------
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ddd7cb'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const play = lab.mode === 'play', rects = cellRects();
  lab.cells.forEach((c, i) => {
    const r = rects[i], ph = play ? 0 : Math.round(r.h * 0.24), scene = { ...r, h: r.h - ph };
    ctx.fillStyle = '#f3f0e8'; ctx.fillRect(r.x, r.y, r.w, r.h);
    c.w.render(ctx, scene, play);
    if (play) return;
    const pr = { x: r.x + 6 * dpr, y: r.y + r.h - ph, w: r.w - 12 * dpr, h: ph - 5 * dpr };
    ctx.fillStyle = '#fbfaf6'; ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
    drawPlot(c, pr);
    const selected = c.over ? Object.entries(c.over).every(([k, v]) => CFG[k] === v) : c === lab.focus;
    ctx.strokeStyle = selected ? '#222' : '#0000'; ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(r.x + dpr, r.y + dpr, r.w - 2 * dpr, r.h - 2 * dpr);
    text(c.label, r.x + 8 * dpr, r.y + 16 * dpr, '#444', 12, 'bold');
    const w = c.w;
    text(`frozen ${Math.round(100 * w.frozenT / (w.simT || 1))}%  ${w.hits} hits`, r.x + 8 * dpr, r.y + 30 * dpr, '#999', 11);
  });
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
  const w = c.w, cfg = w.cfg, kind = c.move ? 'timeline' : plotKind(lab.x.k);
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
    const m = MOVES[c.move], total = m.keys.reduce((s, k) => s + k.d, 0), a = w.a.action;
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
    note(`${Math.round(total / cfg.attackSpeed * 1000)}ms  red = active frames`);
  } else {
    const all = w.hist.tgt.concat(w.hist.disp), lo = Math.min(...all) - 5, hi = Math.max(...all) + 5;
    series(ctx, w.hist.tgt, r, lo, hi, '#bbb', HIST);
    series(ctx, w.hist.disp, r, lo, hi, '#c0392b', HIST);
    note(`${cfg.scope}: target / drawn (red)`);
  }
}

// sidebar oscilloscope: target vs drawn for one joint of the focused cell's left fighter
function drawScope() {
  const w = lab.focus.w, h = w.hist, cw = scopeCv.width, ch = scopeCv.height;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, cw, ch);
  const all = h.tgt.concat(h.disp), lo = Math.min(...all) - 5, hi = Math.max(...all) + 5, r = { x: 0, y: 4, w: cw, h: ch - 8 };
  series(sctx, h.tgt, r, lo, hi, '#bbb', HIST);
  series(sctx, h.disp, r, lo, hi, '#c0392b', HIST);
  $('stats').textContent = `${lab.focus.label || lab.scen} — ${w.cfg.scope}: target (grey) vs drawn (red)\n` +
    `frozen ${Math.round(100 * w.frozenT / (w.simT || 1))}% of ${w.simT.toFixed(1)}s · ${w.hits} hits`;
}

function resize() {
  dpr = devicePixelRatio || 1;
  const st = $('stage');
  canvas.width = st.clientWidth * dpr; canvas.height = st.clientHeight * dpr;
  scopeCv.width = scopeCv.clientWidth * dpr; scopeCv.height = scopeCv.clientHeight * dpr;
}

let last = performance.now();
function frame(now) {
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  const inp = readInput();
  if (!lab.paused || lab.stepOnce) {
    const dt = lab.stepOnce ? 1 / 60 : raw * lab.speed;
    for (const c of lab.cells) c.w.advance(dt, inp);
    lab.stepOnce = false;
  }
  render();
  requestAnimationFrame(frame);
}

// ---------- input ----------
const keys = new Set(), pressed = new Set();
const MAP = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'jump', ArrowUp: 'jump',
  Space: 'jump', KeyS: 'down', ArrowDown: 'down', KeyJ: 'punch', KeyK: 'kick' };
addEventListener('keydown', e => {
  if (e.target.type === 'number') return;
  if (e.code === 'KeyH') { document.body.classList.toggle('noside'); resize(); return; }
  if (e.code === 'KeyR') { build(); return; }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyN') { lab.paused = lab.stepOnce = true; syncTop(); return; }
  const a = MAP[e.code];
  if (!a) return;
  e.preventDefault();
  if (!e.repeat) pressed.add(a);
  keys.add(a);
});
addEventListener('keyup', e => { const a = MAP[e.code]; if (a) keys.delete(a); });
addEventListener('blur', () => keys.clear());
function readInput() {
  const i = { left: keys.has('left'), right: keys.has('right'), down: keys.has('down'),
    jump: pressed.has('jump'), punch: pressed.has('punch'), kick: pressed.has('kick') };
  pressed.clear(); // edges are consumed by the first substep only
  return i;
}
// click a grid cell to adopt its values
canvas.addEventListener('click', e => {
  const b = canvas.getBoundingClientRect(), x = (e.clientX - b.left) * dpr, y = (e.clientY - b.top) * dpr;
  const i = cellRects().findIndex(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  if (i < 0) return;
  const c = lab.cells[i];
  lab.focus = c;
  if (c.over) { Object.assign(CFG, c.over); syncUI(); }
});

// ---------- top bar ----------
function togglePause() { lab.paused = !lab.paused; syncTop(); }
function syncTop() {
  $('pause').textContent = lab.paused ? 'play' : 'pause';
  $('gridctl').hidden = lab.mode !== 'grid';
  $('scenctl').hidden = lab.mode === 'gallery';
}
function setRange(ax, pre) {
  const s = SPEC[ax.k] || {}, num = s.min !== undefined;
  $(pre + 'lo').value = num ? s.min : ''; $(pre + 'hi').value = num ? s.max : '';
  $(pre + 'lo').disabled = $(pre + 'hi').disabled = !num;
  ax.lo = s.min; ax.hi = s.max;
}
function buildTop() {
  for (const k in SCENARIOS) $('scen').add(new Option(k));
  for (const k in SPEC) if (k !== 'scope') { $('xk').add(new Option(k)); $('yk').add(new Option(k)); }
  $('xk').value = lab.x.k; setRange(lab.x, 'x'); setRange(lab.y, 'y');
  const on = (id, ev, fn) => $(id).addEventListener(ev, () => { fn($(id)); $(id).blur(); });
  on('mode', 'change', el => { lab.mode = el.value; syncTop(); build(); resize(); });
  on('scen', 'change', el => { lab.scen = el.value; build(); });
  on('xk', 'change', el => { lab.x.k = el.value; setRange(lab.x, 'x'); build(); });
  on('yk', 'change', el => { lab.y.k = el.value; setRange(lab.y, 'y'); build(); });
  for (const [ax, pre] of [[lab.x, 'x'], [lab.y, 'y']]) for (const end of ['lo', 'hi'])
    $(pre + end).addEventListener('change', e => { ax[end] = parseFloat(e.target.value); build(); });
  on('pause', 'click', togglePause);
  on('step', 'click', () => { lab.paused = lab.stepOnce = true; syncTop(); });
  on('restart', 'click', build);
  on('speed', 'change', el => { lab.speed = +el.value; });
  on('loop', 'change', el => {
    lab.loop = el.checked;
    for (const c of lab.cells) { c.w.loop = lab.loop; if (lab.loop && c.w.done) c.w.reset(); }
  });
  syncTop();
}

// ---------- side panel ----------
const panel = $('panel'), inputs = {};
function syncUI() {
  for (const k in inputs) {
    const { el, val } = inputs[k];
    if (el.type === 'checkbox') el.checked = CFG[k]; else el.value = CFG[k];
    val.textContent = typeof CFG[k] === 'number' ? fmt(CFG[k]) : '';
  }
}
function applyPreset(name) {
  const keep = { ghost: CFG.ghost, scope: CFG.scope, timeScale: CFG.timeScale };
  Object.assign(CFG, DEFAULTS, PRESETS[name], keep);
  syncUI();
}
function buildUI() {
  const bar = document.createElement('div');
  for (const name in PRESETS) {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => { applyPreset(name); b.blur(); };
    bar.append(b);
  }
  panel.append(bar);
  for (const s of SCHEMA) {
    if (Array.isArray(s)) { const h = document.createElement('h3'); h.textContent = s[0]; panel.append(h); continue; }
    const row = document.createElement('label'), name = document.createElement('span'), val = document.createElement('span');
    let el;
    if (s.opts) { el = document.createElement('select'); for (const o of s.opts) el.add(new Option(o)); }
    else if (typeof s.v === 'boolean') { el = document.createElement('input'); el.type = 'checkbox'; }
    else { el = document.createElement('input'); Object.assign(el, { type: 'range', min: s.min, max: s.max, step: s.step }); }
    name.textContent = s.k; val.className = 'v';
    el.addEventListener('input', () => {
      CFG[s.k] = el.type === 'checkbox' ? el.checked : s.opts ? el.value : +el.value;
      val.textContent = typeof CFG[s.k] === 'number' ? fmt(CFG[s.k]) : '';
    });
    el.addEventListener('change', () => el.blur()); // give keys back to the game
    inputs[s.k] = { el, val };
    row.append(name, el, val);
    panel.append(row);
  }
  syncUI();
}

buildUI();
buildTop();
build();
new ResizeObserver(resize).observe($('stage'));
resize();
requestAnimationFrame(frame);
