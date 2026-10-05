'use strict';
// ---------- fx mode: a gallery of every look (built-ins + custom), a big zoomed preview, a tunable side panel
// (sliders with per-variable and all-at-once randomize, colour/behind, revert/delete) and a two-variable experiment grid.
// Pure drawing, like the looks themselves: nothing here is part of the simulation (mode().worlds() is empty) ----------
const fxState = { sel: null, zoom: false, scroll: 0, char: 'self', part: 'segment', bg: '#f3f0e8', gx: null, gy: null, gridDock: 'bottom', gridSize: 0.26, cellSize: 60 };
const fxChar = () => fxState.char === 'self' ? currentChar() : (CHARS[fxState.char] || currentChar());
// preview targets: a plain fixed segment (no character needed), the whole body, or one role's chains (only if the character has one)
const fxParts = ch => ['segment', 'body', ...['arm', 'leg', 'head', 'tail', 'weapon'].filter(r => ch.chains[r]?.length)];
const fxCol = name => name in BASE_BUILTIN ? FX_BUILTIN[name].col : (myLooks[name]?.col || 'white');
const fxNames = () => Object.keys(FX_LOOKS);
// a look's own tunable fields: [key, { min, max, step }, tip, label?] — built-ins each have a few hand-picked knobs
// (BUILTIN_SLIDERS, fx.js); a custom one either the 8 generic particle sliders (CUSTOM_SLIDERS, editor.js), or — if
// duplicated from a built-in (duplicateBuiltinLook, fx.js) — that built-in's own knobs, since it reuses its algorithm
const fxAlgo = name => name in BASE_BUILTIN ? name : (myLooks[name]?.algo || 'particle');
const fxFields = name => { const a = fxAlgo(name); return a === 'particle' ? CUSTOM_SLIDERS : BUILTIN_SLIDERS[a]; };

// draws one look into the 0,0-origin area w×h of ctx (a sub-rect of the shared canvas, translated there by the caller;
// or a small DOM canvas of its own — fxPaint doesn't care which, both are already in their own device-pixel space)
function fxPaint(ctx, w, h, name, override) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = fxState.bg; ctx.fillRect(0, 0, w, h);
  if (!name) return;
  const t = performance.now() / 1000, rgb = FX_COLS[fxCol(name)] || FX_COLS.white, k = Math.min(w, h) / 140;
  if (fxState.part === 'segment') {
    ctx.save(); ctx.translate(w / 2, h * 0.78);
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h * 0.55); ctx.stroke();
    FX_DRAW[name]?.(ctx, [{ i: fxSeed(name), w: 4, a: [0, 0], b: [0, -h * 0.55] }], rgb, k, t, override);
    ctx.restore();
    return;
  }
  const ch = fxChar(), wa = {}, L = fk(ch, curStance(ch).pose, 1, null, wa);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const id of ch.ids) { const [x, y] = L[id]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const pad = Math.min(w, h) * 0.12, s = Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxY - minY || 1));
  const bones = fxState.part === 'body' ? ch.bones : fxBones(ch, fxState.part, null);
  const back = FX_BACK.has(name), segs = () => fxSegs(L, bones);
  ctx.save(); ctx.translate(w / 2 - s * (minX + maxX) / 2, h / 2 - s * (minY + maxY) / 2); ctx.scale(s, s);
  if (back) FX_DRAW[name]?.(ctx, segs(), rgb, 1, t, override);
  drawFigure(ctx, ch, L, INK[0], INK[1]);
  if (!back) FX_DRAW[name]?.(ctx, segs(), rgb, 1, t, override);
  ctx.restore();
}
// a small self-animating DOM preview (the big zoom-free panel header, and each experiment-grid cell)
function fxCanvas(size, name, override) {
  const cv = h('canvas', { width: size, height: size });
  const loop = () => { if (!cv.isConnected) return; fxPaint(cv.getContext('2d'), size, size, name, override); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return cv;
}

// ---------- the gallery: every look as a tile on the shared canvas, like the move gallery; click to open + zoom ----------
const fxShown = () => fxState.zoom ? [fxState.sel] : fxNames();
function fxRects(n = fxShown().length) { return cellRects(n, fxState.zoom ? 1 : 4, fullArea(), 0, fxState.zoom ? 0 : fxState.scroll); }
function fxMaxScroll() {
  const r = fxRects();
  return r.length ? Math.max(0, r[r.length - 1].y + r[r.length - 1].h + fxState.scroll + 4 * dpr - canvas.height) : 0;
}
function fxRender() {
  clear();
  fxState.scroll = clamp(fxState.scroll, 0, fxMaxScroll());
  const names = fxShown(), rects = fxRects();
  names.forEach((name, i) => {
    const r = rects[i];
    if (r.y + r.h < 0 || r.y > canvas.height) return; // off-screen: skip, like the move gallery's onScreen()
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); ctx.translate(r.x, r.y);
    fxPaint(ctx, r.w, r.h, name);
    ctx.restore();
    if (fxState.sel === name && !fxState.zoom) { ctx.strokeStyle = RED[0]; ctx.lineWidth = 4 * dpr; ctx.strokeRect(r.x + 2 * dpr, r.y + 2 * dpr, r.w - 4 * dpr, r.h - 4 * dpr); }
    if (CFG.labels) {
      const label = name + (name in BASE_BUILTIN ? '' : '  custom');
      ctx.fillStyle = 'rgba(243,240,232,0.8)'; ctx.fillRect(r.x + 4 * dpr, r.y + 4 * dpr, (label.length * 7 + 8) * dpr, 16 * dpr);
      text(label, r.x + 8 * dpr, r.y + 16 * dpr, '#444', 11, 'bold');
    }
  });
}
function fxClick(x, y) {
  if (fxState.zoom) { fxState.zoom = false; return; }
  const i = hitRect(fxRects(), x, y);
  if (i < 0) return;
  fxState.sel = fxNames()[i]; fxState.zoom = true; fxState.gx = null; fxState.gy = null;
  panels(); // the side panel now shows this look's editor
}

// the standard character picker (studio.js: charPanel's .charpick + a popup of charCard tiles), pointed at fxState.char
// instead of the globally-edited CURRENT character; a hand-built "self" card stands in for "whatever you're editing"
function fxCharButton() {
  const cv = h('canvas'), label = h('b');
  const selfCard = () => {
    const b = h('button', { cls: 'card', tip: 'The character you\'re editing or playing', onclick: () => { fxState.char = 'self'; closePop(); syncAll(); } }, h('canvas'), h('span', { textContent: 'self' }));
    reg(b, () => { drawThumb(b.firstChild, currentChar()); b.classList.toggle('on', fxState.char === 'self'); });
    return b;
  };
  const pick = h('button', { cls: 'charpick', tip: 'The character to preview the look on · click: pick another',
    onclick: () => popup(pick, h('div', { cls: 'cards' }, selfCard(), Object.keys(DEFS).map(k => charCard(k, kk => { fxState.char = kk; closePop(); }, kk => fxState.char === kk)))) },
    cv, label, ...rich(':expand_more:'));
  reg(pick, () => { drawThumb(cv, fxChar(), undefined, 36, 40); label.textContent = fxState.char === 'self' ? 'self' : fxState.char; });
  return pick;
}
// ---------- side panel: preview target/background, then (a look selected) its editor ----------
function fxPreviewSide() {
  const ch = fxChar(), parts = fxParts(ch);
  return [
    heading('Preview', 'What the gallery and the zoomed preview draw the look on, and a preview-only background colour (never saved with the look).', ''),
    h('div', { cls: 'bar' }, h('span', { textContent: 'on' }),
      seg(parts, () => fxState.part, v => { fxState.part = v; panels(); }, // panels(): the character row only shows for a non-segment part
        { segment: 'A plain fixed line, no character (the classic preview)', body: 'The whole body', arm: 'The arms', leg: 'The legs', head: 'The head', tail: 'The tails', weapon: 'The weapon' })),
    fxState.part !== 'segment' ? h('div', { cls: 'bar' }, h('span', { textContent: 'character' }), fxCharButton()) : null,
    h('div', { cls: 'bar' }, h('span', { textContent: 'background' }),
      h('input', { type: 'color', value: fxState.bg, tip: 'Preview-only background colour (not saved with the look)', oninput: e => { fxState.bg = e.target.value; } }),
      ...['#f3f0e8', '#ffffff', '#222222', '#17304a'].map(c => {
        // setRich (ui.js) auto-toggles .ico based on the label being a pure icon code; an empty label doesn't match
        // that and would strip it right back off, so it's added after button() returns instead of passed as a class
        const b = button('', `Background ${c}`, () => { fxState.bg = c; }, 'mini');
        b.classList.add('ico');
        b.style.backgroundColor = c;
        return b;
      })),
  ];
}
// a colour picker like seg(), but each option shows a swatch of its actual colour, not just its name
function fxColorSeg(get, set) {
  return h('span', { cls: 'seg' }, Object.keys(FX_COLS).map(c => {
    const b = button('', `Default colour: ${c} (a move can still override it)`, () => set(c), 'mini');
    b.prepend(h('span', { cls: 'swatch', style: `background:rgb(${FX_COLS[c]})` }));
    reg(b, () => b.classList.toggle('on', get() === c));
    return b;
  }));
}
// a look's live data, read fresh on every call: saveBuiltinFx/saveLook each replace FX_BUILTIN[name] or myLooks[name]
// wholesale (applyBuiltin, fx.js), so any value captured once in a closure goes stale the moment something else is saved
// — every get() below must be a function that re-reads these, not a snapshot, or toggles/segs stop reflecting changes
const fxLive = name => name in BASE_BUILTIN ? FX_BUILTIN[name] : myLooks[name];
const fxParams = name => name in BASE_BUILTIN ? fxLive(name).params : fxLive(name);
// X / Y axis pickers for the experiment grid, among this look's own fields
function fxAxisButton(label, fields, get, set) {
  const b = button('', `${label} axis: a variable swept across the grid below`, (e, b) => {
    popup(b, h('div', { cls: 'bar' },
      label === 'Y' ? button('none', 'Only one axis: 4 values of X', () => { set(null); closePop(); panels(); }) : null,
      ...fields.map(([k, , tip, lbl]) => button(lbl || k, tip, () => { set(k); closePop(); panels(); }))));
  });
  reg(b, () => setRich(b, `${label}: ${get() || 'none'}`));
  return b;
}
const fxAxisVals = opts => [0, 1 / 3, 2 / 3, 1].map(f => Math.round((opts.min + (opts.max - opts.min) * f) / opts.step) * opts.step);
const DOCK_ICONS = { bottom: 'arrow_downward', top: 'arrow_upward', left: 'arrow_back', right: 'arrow_forward' };
// the experiment grid: a dockable panel over the stage (like the replay editor's events table, or the scenario builder),
// next to the preview rather than buried in the scrolling side panel — only shown with a look open (fxState.sel, zoomed)
const CELL_SIZES = [40, 60, 90, 130];
// a drag handle on the panel's inner edge (the one next to the preview); mirrors $('grip')'s side-panel-width drag
function fxResizeHandle(dock, panel, sizeProp) {
  const grip = h('div', { cls: 'fxresize ' + dock, tip: 'Drag: resize this panel' });
  grip.onpointerdown = e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const calc = e => clamp(
      dock === 'bottom' ? (r.bottom - e.clientY) / r.height : dock === 'top' ? (e.clientY - r.top) / r.height
        : dock === 'left' ? (e.clientX - r.left) / r.width : (r.right - e.clientX) / r.width,
      0.15, 0.7);
    const move = e => { panel.style[sizeProp] = (calc(e) * 100) + '%'; };
    const up = e => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); fxState.gridSize = calc(e); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  return grip;
}
function fxGridPanel(name) {
  const fields = fxFields(name);
  if (!fields.some(([k]) => k === fxState.gx)) fxState.gx = fields[0][0];
  if (fxState.gy && !fields.some(([k]) => k === fxState.gy)) fxState.gy = null;
  const specOf = k => fields.find(([fk]) => fk === k)[1];
  const xs = fxAxisVals(specOf(fxState.gx)), ys = fxState.gy ? fxAxisVals(specOf(fxState.gy)) : [undefined];
  const cells = [];
  for (const yv of ys) for (const xv of xs) cells.push(fxCanvas(fxState.cellSize, name, fxState.gy ? { [fxState.gx]: xv, [fxState.gy]: yv } : { [fxState.gx]: xv }));
  const dock = fxState.gridDock, sizeProp = (dock === 'left' || dock === 'right') ? 'width' : 'maxHeight';
  const panel = h('div', { cls: 'fxgrid ' + dock, style: `${sizeProp}:${fxState.gridSize * 100}%` },
    h('div', { cls: 'bar' }, h('b', { textContent: 'experiment' }),
      seg(Object.keys(DOCK_ICONS), () => dock, v => { fxState.gridDock = v; panels(); },
        { bottom: 'Dock under the preview', top: 'Dock above the preview', left: 'Dock left of the preview', right: 'Dock right of the preview' },
        v => `:${DOCK_ICONS[v]}:`),
      ...rich(':zoom_in:'), seg(CELL_SIZES, () => fxState.cellSize, v => { fxState.cellSize = v; panels(); },
        Object.fromEntries(CELL_SIZES.map(v => [v, `${v}px cells`])), String)),
    h('div', { cls: 'bar' }, fxAxisButton('X', fields, () => fxState.gx, k => { fxState.gx = k; panels(); }), fxAxisButton('Y', fields, () => fxState.gy, k => { fxState.gy = k; panels(); })),
    h('p', { cls: 'note', textContent: `columns (${fxState.gx}): ${xs.map(fmt).join(' · ')}` }),
    fxState.gy ? h('p', { cls: 'note', textContent: `rows (${fxState.gy}): ${ys.map(fmt).join(' · ')}` }) : null,
    h('div', { cls: 'bar', style: `display:grid; grid-template-columns: repeat(${xs.length}, ${fxState.cellSize}px); gap: 3px` }, ...cells));
  panel.prepend(fxResizeHandle(dock, panel, sizeProp));
  return panel;
}
function fxLookSide(name) {
  const built = name in BASE_BUILTIN;
  const set = (k, v) => { if (built) saveBuiltinFx(name, { params: { [k]: v } }); else saveLook(name, { ...myLooks[name], [k]: v }); };
  const setCol = v => { if (built) saveBuiltinFx(name, { col: v }); else saveLook(name, { ...myLooks[name], col: v }); };
  const setBack = v => { if (built) saveBuiltinFx(name, { back: v }); else saveLook(name, { ...myLooks[name], back: v || undefined }); };
  const nm = built ? h('b', { textContent: name }) : h('input', { cls: 'macro', value: name, tip: 'Rename this look', onkeydown: e => e.stopPropagation(),
    onchange: () => { const v = nm.value.trim(); if (!v || v === name || FX_LOOKS[v]) { nm.value = name; return; } renameLook(name, v); fxState.sel = v; panels(); } });

  const fields = fxFields(name), isParticle = fxAlgo(name) === 'particle';
  const randomOne = ([k, opts]) => { set(k, snap(opts, opts.min + Math.random() * (opts.max - opts.min))); };
  const randomAll = () => { for (const f of fields) randomOne(f); };
  const sliders = fields.map(f => {
    const [key, opts, tip, label] = f;
    const row = slider(label || key, opts, () => fxParams(name)[key], v => set(key, v), tip);
    row.classList.add('dice'); // a 4th column for the randomize button (plain .row is 3 columns, built for label/slider/value only)
    row.append(button(':casino:', `Randomize ${label || key}`, () => randomOne(f), 'mini'));
    return row;
  });
  const duplicate = () => { const n = duplicateBuiltinLook(name); fxState.sel = n; fxState.gx = null; fxState.gy = null; panels(); };

  return [
    heading('Look', 'Every look is tunable, built-ins included — revert puts one back to its shipped values, duplicate fully recreates it as an independent custom look (editing a built-in never touches a duplicate, or the other way round). A plain new look is a generic particle effect instead; only a custom one (new or duplicated) can be renamed or deleted.', ''),
    h('div', { cls: 'bar' }, nm, built ? h('span', { cls: 'note', textContent: 'built-in' }) : null,
      button(':casino: randomize all', 'Every slider below gets a random value', randomAll),
      built ? button(':content_copy: duplicate', `A new custom look, an independent copy of ${name}'s current values using the same algorithm — fully recreates it, free to tune or delete without touching the original`, duplicate) : null,
      button(built ? ':restart_alt: revert' : ':delete: delete', built ? `Back to ${name}'s shipped values` : `Delete ${name}`,
        () => { if (built) resetBuiltinFx(name); else { deleteLook(name); fxState.sel = null; fxState.zoom = false; } panels(); })),
    h('div', { cls: 'bar' },
      !built && isParticle && h('span', { textContent: 'shape' }), !built && isParticle && seg(Object.keys(LOOK_SHAPE_TIPS), () => fxParams(name).shape, v => set('shape', v), LOOK_SHAPE_TIPS),
      h('span', { textContent: 'colour' }), fxColorSeg(() => fxLive(name).col, setCol),
      toggle(':layers: behind', 'Draws behind the body (like aura, smoke) instead of in front', () => !!fxLive(name).back, setBack)),
    !built && !isParticle ? h('p', { cls: 'note', textContent: `Duplicated from ${fxAlgo(name)}: the same hand-coded algorithm, its own independent knobs.` }) : null,
    ...sliders,
  ];
}
function fxSide() {
  return [...fxPreviewSide(), ...(fxState.sel ? fxLookSide(fxState.sel) : [h('p', { cls: 'note', textContent: 'click a look in the gallery to tune it' })])];
}

function fxCtx() {
  const backBtn = button(':arrow_back: back to gallery', 'Show every look again (Esc)', () => { fxState.zoom = false; });
  reg(backBtn, () => { backBtn.hidden = !fxState.zoom; });
  return [grp('fx', 'Design fx looks: built-ins are hand-coded with a few tunable knobs each; a new look is a generic particle effect tuned by 8 sliders',
    button(':add: new look', 'A new custom look, starting from simple rising dots', () => { const n = newLook(); fxState.sel = n; fxState.zoom = true; fxState.gx = null; fxState.gy = null; panels(); }),
    backBtn)];
}
const fxMode = {
  enter() {},
  restart() {},
  worlds: () => [],
  render: fxRender,
  ctxBar: fxCtx,
  side: fxSide,
  overlay: () => fxState.zoom && fxState.sel ? [fxGridPanel(fxState.sel)] : [],
  open: ['preview', 'look'],
  mouse(type, x, y) { if (type === 'down') fxClick(x, y); else cursor(fxState.zoom || hitRect(fxRects(), x, y) >= 0 ? 'pointer' : 'default'); },
  wheel(dy) { const ms = fxMaxScroll(); if (!ms) return false; fxState.scroll = clamp(fxState.scroll + dy * dpr, 0, ms); return true; },
  key(e) { if (e.code === 'Escape' && fxState.zoom) { fxState.zoom = false; return true; } },
  hint: () => fxState.zoom ? 'Esc or click: back to the gallery' : 'click a look: open it, tune it, try it on a character · scroll for more',
};
// ---------- sounds and tracker: views of the fx tab (VIEWS.fx), not toggleable stage panels — soundsPanel/trackerPanel
// (src/editor.js) are full-stage DOM content here, same as the gallery is for the fx view itself; no live worlds ----------
const soundsMode = {
  enter() {}, restart() {}, worlds: () => [], render: clear, ctxBar: () => [], side: () => [],
  overlay: () => [soundsPanel()],
  hint: () => 'every sound, synthesized live · built-ins are tunable too, revert undoes it',
};
const trackerMode = {
  enter() {}, restart() {}, worlds: () => [], render: clear, ctxBar: () => [], side: () => [],
  overlay: () => [trackerPanel()],
  hint: () => 'a step sequencer built from your sounds · play loops it',
};
