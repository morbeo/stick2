'use strict';
// ---------- character mode: drag the skeleton, tune bones, watch it fight live; body experiment grid ----------
const creator = { preview: 'showcase', w: null, drag: null, hover: null, anchor: null, expOn: false, table: false, view: null, tfilter: '', tsort: { k: '', dir: 1 },
  exp: { kind: 'body', vars: new Set(['len', 'thick']), limbs: false, spread: 0.15, sym: true, seed: 1, parent: null, cells: [] } };
const PREVIEWS = {
  showcase: ['showcase', 'Scripted demo: walk in, J,J,K chain, sweep, jump kick, back off.'],
  walk: ['walk', 'Walk forward and back: check the walk cycle and arm swing.'],
  'vs ai': ['ai vs ai', 'Two copies fight each other with the engine AI.'],
  impact: [null, 'The body alone, no attacker: strike it low, mid, high… with the blow buttons and watch it fall (the ragdoll).'],
};
// the preview's scenario (impact: the experiment grid plays the showcase)
const previewScen = () => { const s = SCENARIOS[PREVIEWS[creator.preview][0] || 'showcase']; return { ...s, init: w => { s.init?.(w); w.a.setStance(studio.stance, 'instant'); } }; };

// ---------- editor view: the stance pose, big, with a handle on every joint ----------
function edLayout() {
  const ew = splitX();
  return { ed: { x: 0, y: 0, w: ew, h: canvas.height }, pv: { x: ew, y: 0, w: canvas.width - ew, h: canvas.height } };
}
// screen transform of the figure; the hips stay put while dragging so the body doesn't jump under the cursor
function edFrame() {
  const ch = viewChar(), r = edLayout().ed, s = Math.min(r.h / 190, r.w / 130), ground = r.y + r.h * 0.85;
  const wa = {}, L = fk(ch, curStance(ch).pose, 1, null, wa);
  if (!creator.drag) {
    let low = 0;
    for (const b of ch.bones) low = Math.max(low, L[b.id][1] + (b.shape === 'circle' ? b.len : 0));
    creator.anchor = [r.x + r.w / 2, ground - low * s];
  }
  const o = creator.anchor, P = mapVals(L, p => [o[0] + p[0] * s, o[1] + p[1] * s]);
  return { ch, r, s, o, L, P, wa, ground };
}
function drawEditor() {
  const { ch, r, s, o, L, P, ground } = edFrame(), sel = ch.by[studio.sel];
  ctx.fillStyle = '#f3f0e8'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#cfc8bb'; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.moveTo(r.x, ground); ctx.lineTo(r.x + r.w, ground); ctx.stroke();
  ctx.save(); ctx.translate(o[0], o[1]); ctx.scale(s, s);
  if (CFG.boxes) {
    ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(44,111,176,.22)';
    for (const b of ch.bones) if (b.hurt > 0) {
      const e = L[b.id], a = b.shape === 'circle' ? e : L[b.parent || 'hip'];
      ctx.lineWidth = b.hurt * 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0] + 0.01, e[1]); ctx.stroke();
    }
  }
  const fxs = fxNow(ch, null), ft = performance.now() / 1000;
  drawFx(ctx, L, fxs, ft, true); drawFigure(ctx, ch, L, INK[0], INK[1], 0, roleTint()); drawFx(ctx, L, fxs, ft, false);
  for (const sel of selIds().map(id => ch.by[id])) { // the selected bones in red: a line, or a filled disc for circles
    const a = L[sel.parent || 'hip'], e = L[sel.id];
    ctx.strokeStyle = ctx.fillStyle = RED[0]; ctx.lineWidth = sel.thick;
    ctx.beginPath();
    if (sel.shape === 'circle') { ctx.arc(e[0], e[1], sel.len, 0, 7); ctx.fill(); } else { ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]); ctx.stroke(); }
  }
  ctx.restore();
  for (const b of ch.bones) {
    const p = P[b.id], on = selIds().includes(b.id), hov = b.id === creator.hover;
    ctx.beginPath(); ctx.arc(p[0], p[1], (on ? 6 : hov ? 5.5 : 4) * dpr, 0, 7);
    ctx.fillStyle = hov ? '#ffd' : '#fff'; ctx.fill();
    ctx.strokeStyle = on ? RED[0] : '#555'; ctx.lineWidth = (on ? 2 : 1.5) * dpr; ctx.stroke();
  }
  { const p = P.hip, on = creator.drag === 'hip', hov = creator.hover === 'hip'; // the hip: a square handle, the waist and legs start there
    const r2 = (on ? 6 : hov ? 5.5 : 4.5) * dpr;
    ctx.fillStyle = hov || on ? '#ffd' : '#fff'; ctx.fillRect(p[0] - r2, p[1] - r2, r2 * 2, r2 * 2);
    ctx.strokeStyle = on ? RED[0] : '#555'; ctx.lineWidth = 1.5 * dpr; ctx.strokeRect(p[0] - r2, p[1] - r2, r2 * 2, r2 * 2); }
  if (creator.hover === 'hip') text('hip · drag: the waist moves, the feet stay', Math.min(P.hip[0] + 10 * dpr, r.x + r.w - 300 * dpr), P.hip[1] - 8 * dpr, '#666', 11);
  const hv = ch.by[creator.hover] || (creator.hover !== 'hip' && sel);
  if (hv) text(`${hv.id} · ${hv.role}${hv.side ? ' · ' + (hv.side === 'f' ? 'front' : 'back') : ''} · ${hv.len}px`,
    Math.min(P[hv.id][0] + 10 * dpr, r.x + r.w - 230 * dpr), P[hv.id][1] - 8 * dpr, '#666', 11);
  text(`${ch.name} · ${ch.bones.length} bones`, r.x + 10 * dpr, r.y + 18 * dpr, '#444', 12, 'bold');
}
// nearest joint handle, else the nearest bone line
function pickBone(x, y) {
  const { ch, P } = edFrame();
  let best = null, bd = 12 * dpr;
  for (const id of [...ch.ids, 'hip']) { const d = Math.hypot(P[id][0] - x, P[id][1] - y); if (d < bd) { bd = d; best = id; } }
  if (best) return best;
  bd = 6 * dpr;
  for (const b of ch.bones) { const d = distSeg([x, y], P[b.parent || 'hip'], P[b.id]); if (d < bd) { bd = d; best = b.id; } }
  return best;
}
// dragging a joint sets the bone's stance angle and length (Shift or circles: angle only)
function dragTo(x, y, shift) {
  const f = edFrame(), b = f.ch.by[creator.drag], pb = f.ch.by[b.parent];
  if (b.lock) { // a locked bone swings its group from the first unlocked bone above
    const u = unlockedAbove(f.ch, b), pv = u && f.P[u.parent || 'hip'], ang = (p, q) => Math.atan2(q[0] - p[0], q[1] - p[1]) / R;
    if (u) edit(def => { editPose(def)[u.id] = Math.round(curStance(f.ch).pose[u.id] + wrap(ang(pv, [x, y]) - ang(pv, f.P[b.id]))); }, 'drag:' + b.id);
    return;
  }
  const pp = f.P[b.parent || 'hip'], dx = (x - pp[0]) / f.s, dy = (y - pp[1]) / f.s;
  const pw = pb ? f.wa[pb.id] : 0, cur = curStance(f.ch).pose[b.id];
  let local = Math.atan2(dx, dy) / R - pw + b.level * (pw - (pb ? pb.restW : 0)); // inverse of fk's world angle
  local = cur + ((local - cur) % 360 + 540) % 360 - 180; // continuous with the current angle
  edit(def => {
    editPose(def)[b.id] = Math.round(local);
    if (!shift && b.shape !== 'circle') boneDef(def, b.id).len = Math.max(2, Math.round(Math.hypot(dx, dy) / (stanceBody()?.scale || 1))); // (drawn × the stance's size)
  }, 'drag:' + b.id);
}
// dragging the hip moves the body over the feet in the stance: every leg bends so its ankle stays (as in animate, see hipTo)
function hipDrag(x, y) {
  const f = edFrame(), h0 = creator.hip0, dx = (x - h0.x) / f.s, dy = (y - h0.y) / f.s, pose = { ...h0.pose }, chain = [];
  creator.anchor = [h0.a[0] + x - h0.x, h0.a[1] + y - h0.y];
  for (const c of f.ch.chains.leg) {
    const a = ankleOf(c), legs = c.slice(0, c.indexOf(a) + 1).filter(b => !b.lock).reverse();
    ik(f.ch, pose, a.id, [h0.L[a.id][0] - dx, h0.L[a.id][1] - dy], legs, 40);
    chain.push(...legs);
  }
  edit(def => { for (const b of chain) editPose(def)[b.id] = Math.round(pose[b.id]); }, 'drag:hip');
}

// ---------- body experiment: 9 mutants of a parent body; click one to breed around it ----------
// lv: per bone property, one distinct level per cell (see levels in breed.js); exaggerate (breed.exag) scales the spread
function mutate(def, rand, lv, i) {
  const d = clone(def), ex = creator.exp;
  const vary = (v, key, p) => +clamp(Math.round(bounce(v + (lv[key] ??= levels(8, rand))[i - 1] * ex.spread * breed.exag * (p.max - p.min), p.min, p.max) / p.step) * p.step, p.min, p.max).toFixed(3);
  for (const p of CHAR_STATS) if (ex.vars.has(p.k)) d[p.k] = vary(d[p.k] ?? 1, p.k, p); // stats live on the definition itself
  for (const p of GAIT_VARS) if (!p.opts && ex.vars.has(p.k)) d.gait = { ...d.gait, [p.k]: vary(d.gait?.[p.k] ?? p.v, p.k, p) };
  for (const b of d.bones) for (const p of BONE_PROPS) if (ex.vars.has(p.k))
    b[p.k] = vary(b[p.k] ?? BONE[p.k], (ex.sym ? b.id.replace(/[FB]$/, '') : b.id) + '.' + p.k, p); // F/B partners share a level
  return d;
}
// experimental limbs: add a limb at a random torso bone, drop a limb, or grow a joint on a limb's end
function mutateLimbs(d, rand) {
  const pick = a => a[Math.floor(rand() * a.length)], spine = d.bones.filter(b => b.role === 'spine');
  const roots = d.bones.filter(b => b.role !== 'spine' && (!b.parent || spine.some(s => s.id === b.parent)));
  const legs = roots.filter(b => b.role === 'leg'), r = rand();
  if (r < 0.45) { const kind = pick(Object.keys(LIMBS)), at = pick(spine)?.id; return '+' + attachLimb(d, kind, at) + (at ? ' @' + at : ''); }
  if (r < 0.75) {
    const gone = pick(roots.filter(b => b.role !== 'leg' || legs.length > 2)); // keep a pair of legs
    if (!gone) return '';
    const ids = new Set(subtree(d, gone.id));
    d.bones = d.bones.filter(b => !ids.has(b.id));
    forEachPose(d, p => { for (const id of ids) delete p[id]; });
    return '−' + gone.id;
  }
  const end = pick(d.bones.filter(b => b.role !== 'spine' && !d.bones.some(k => k.parent === b.id)));
  if (!end) return '';
  let n = 1;
  while (d.bones.some(b => b.id === 'bone' + n)) n++;
  d.bones.push({ id: 'bone' + n, parent: end.id, len: Math.round(rand(4, 14)), a: Math.round(rand(-60, 60)), role: end.role, side: end.side ?? '',
    lag: (end.lag ?? 0) + 0.5, thick: Math.max(1, (end.thick ?? BONE.thick) - 1) });
  return '+joint @' + end.id;
}
function buildExp() {
  const ex = creator.exp, rand = makeRand(ex.seed * 7919), lv = {};
  if (ex.kind === 'random') { // nine random characters, each against the current one
    ex.cells = Array.from({ length: 9 }, (_, i) => { const def = randomDef(makeRand(ex.seed * 7919 + i)), kept = ex.kept?.[ex.seed + ':' + i];
      return { def, w: newWorld(previewScen(), {}, 7, [makeCharacter(def), currentChar()]), label: def.name + (kept && DEFS[kept] ? ` · kept as ${kept}` : '') }; });
    return;
  }
  ex.parent ??= clone(DEFS[CURRENT]);
  ex.cells = Array.from({ length: 9 }, (_, i) => {
    const def = i ? mutate(ex.parent, rand, lv, i) : ex.parent, note = i && ex.limbs ? mutateLimbs(def, rand) : '';
    // the mutant fights an unchanged copy of the current character, same seed in every cell
    return { def, w: newWorld(previewScen(), {}, 7, [makeCharacter(def), currentChar()]), label: i ? `#${i} ${note}` : 'parent' };
  });
}
function setExp(on, kind = 'body') {
  creator.expOn = on; creator.exp.kind = kind;
  if (on) { creator.exp.parent = null; buildExp(); }
  panels();
}

function randomExp() {
  closePop();
  if (app.mode === 'character') return setExp(true, 'random');
  creator.expOn = true; creator.exp.kind = 'random'; setMode('character');
}

function creatorRender() {
  clear();
  if (creator.expOn) {
    const rects = cellRects(9, 3, fullArea());
    creator.exp.cells.forEach((c, i) => drawCell(c, rects[i], { plot: false, selected: creator.exp.kind === 'body' && i === 0 && 'parent' }));
    return;
  }
  const { pv } = edLayout();
  drawEditor();
  drawCell({ w: creator.w, label: 'preview' }, pv, { plot: false });
}
// keeping a random cell adds it once; clicking it again offers to update that character instead of adding a copy
async function keepRandom(i) {
  const ex = creator.exp, id = ex.seed + ':' + i, name = (ex.kept ||= {})[id], def = ex.cells[i].def;
  if (!name || !DEFS[name]) { addChar(def); ex.kept[id] = CURRENT; return; }
  if (!await askYes('Update the kept character?', `This character is already kept as "${name}". Update "${name}" with it (your edits to it are replaced)?`, ':restart_alt: update')) return;
  DEFS[name] = { ...clone(def), name }; CHARS[name] = makeCharacter(DEFS[name]); pickChar(name);
}
function creatorMouse(type, x, y, e) {
  if (creator.expOn) {
    const ex = creator.exp, i = hitRect(cellRects(9, 3, fullArea()), x, y);
    cursor(i >= 0 ? 'pointer' : 'default');
    if (type === 'down' && i >= 0 && ex.kind === 'random') keepRandom(i);
    else if (type === 'down' && i >= 0) { ex.parent = ex.cells[i].def; ex.seed++; buildExp(); }
    return;
  }
  if (type === 'down') {
    const id = pickBone(x, y);
    if (id && (e.metaKey || e.ctrlKey)) { pickBoneSel(id, true); syncAll(); } // ⌘/Ctrl+click: add to / take out of the selection
    else if (id === 'hip') { const f = edFrame(); creator.hip0 = { x, y, a: [...f.o], pose: { ...curStance(f.ch).pose }, L: f.L }; creator.drag = 'hip'; }
    else if (id) { pickBoneSel(id, false); creator.drag = id; syncAll(); }
  } else if (type === 'move') {
    if (creator.drag === 'hip') hipDrag(x, y);
    else if (creator.drag) dragTo(x, y, e.shiftKey);
    else creator.hover = x < edLayout().ed.w ? pickBone(x, y) : null;
    cursor(creator.drag ? 'grabbing' : creator.hover ? 'grab' : 'default');
  } else { creator.drag = null; studio.lastKey = null; }
}
function creatorKey(e, a) {
  if (creator.expOn) { if (e.code === 'Escape') { setExp(false); return true; } return; }
  if (a === 'deleteBone') { deleteBone(); return true; }
}

// ---------- panels ----------
function creatorCtx() {
  return [movesGrp(),
    grp('experiment', 'Breed body variations: nine bodies at once, keep the best', toggle(':science: experiment', 'Grid of 9 random variations of the body (sizes, springs…). Click a cell to breed new variations around it; keep the one you like.',
      () => creator.expOn && creator.exp.kind === 'body', on => setExp(on))),
    showGrp(['boxes', 'colours']), panelsGrp([...MOVE_PANELS, 'bones'], { ...VIEW_TIPS, bones: BONES_TIP }),
  ];
}
// what the preview plays: under the preview (a lot of free space there), not the toolbar
function previewBar() {
  return h('div', { cls: 'over pvbar' }, seg(Object.keys(PREVIEWS), () => creator.preview, v => { creator.preview = v; creatorMode.restart(); panels(); }, mapVals(PREVIEWS, p => p[1])));
}
const setProp = (k, v) => edit(def => { for (const b of selDefs(def)) b[k] = v; }, selIds() + '.' + k);
const prop = k => selBone()?.[k] ?? BONE[k];
const BONE_BASIC = ['len', 'thick', 'hurt', 'lag', 'stretch']; // the rest wait behind "more"
function bonePanel() {
  const title = heading('', 'Properties of the selected bone. Click a joint in the editor or a name above to select; ⌘/Ctrl+click (Shift+click in the tree) adds bones to the selection: the values shown are the last one\'s, a change goes to every selected bone.',
    'drag joint: length + angle · Shift+drag: angle only · drag the hip (square): move the waist over the feet · Del delete bone');
  reg(title, () => { const n = selIds().length; title.firstChild.textContent = `Bone · ${studio.sel}${n > 1 ? ` + ${n - 1}` : ''}${stanceOnly() ? ` · ${curStance().name} only` : ''}`; });
  title.dataset.fold = 'bone';
  const row = (label, tip, ...c) => h('div', { cls: 'row', tip }, h('span', {}, ...rich(label)), ...c);
  const lim = on => edit(def => {
    for (const b of selDefs(def)) if (on) { b.min = -90; b.max = 90; } else { delete b.min; delete b.max; }
  });
  const limRows = ['min', 'max'].map(k => slider(k, { min: -180, max: 180, step: 1 }, () => prop(k) ?? 0, v => setProp(k, v),
    `Joint limit (${k}), relative to the parent. The drawn pose is clamped after the spring, so overshoot never hyperextends; posing in animate can go past it (the IK prefers to stay inside), and a key posed past it is kept.`));
  for (const r of limRows) reg(r, () => { r.hidden = prop('min') === undefined; });
  // defaults: the bone as the built-in character has it (custom bones: the general defaults)
  const own = (k, id = studio.sel) => CHAR_DEFS[CURRENT]?.bones.find(b => b.id === id)?.[k], dflt = k => own(k) ?? BONE[k];
  title.append(groupOps(BONE_PROPS, prop, dflt, vals => edit(def => {
    for (const b of selDefs(def)) for (const k in vals) if (own(k, b.id) === undefined && vals[k] === BONE[k]) delete b[k]; else b[k] = vals[k];
  }),
    ['Experiment: nine bodies varying these properties; click the best to breed around it', () => { BONE_PROPS.forEach(p => creator.exp.vars.add(p.k)); setExp(true); }]));
  return [title,
    row(':category: role', 'What the bone does in procedural motion', seg(Object.keys(ROLE_TIPS), () => prop('role'), v => edit(d => { for (const b of selDefs(d)) b.role = v; }), ROLE_TIPS)),
    row(':flip: side', 'Draw order and colour', seg(['f', '', 'b'], () => prop('side'), v => edit(d => { for (const b of selDefs(d)) b.side = v; }), SIDE_TIPS,
      o => ({ f: 'front', '': 'centre', b: 'back' })[o])),
    row('shape', 'How the bone is drawn', seg(['line', 'circle'], () => prop('shape'), v => edit(d => { for (const b of selDefs(d)) b.shape = v; }), SHAPE_TIPS)),
    subFold(':auto_awesome: fx', fxRows('Effects always drawn on this bone (select several bones for a flaming arm, a glowing body); drawing only, the fight is the same',
      () => prop('fx'), e => setProp('fx', e), null)),
    slider('stance', { min: -270, max: 270, step: 1 }, () => curStance().pose[studio.sel] ?? 0,
      v => edit(def => { for (const id of selIds()) editPose(def)[id] = v; }, 'stance:' + selIds()),
      'Angle in the stance pose, relative to the parent (0 = straight on, root bones: 0 = down, 180 = up). Moves are layered on top.'),
    ...BONE_PROPS.map(p => { const r = bodyExpLink(slider(p.k, p, () => prop(p.k), v => setProp(p.k, v), p.tip), p.k); return BONE_BASIC.includes(p.k) ? r : adv(r); }),
    row('limits', 'Clamp how far this joint can bend', toggle(':straighten: limits', 'On: the joint bends only between min and max (starts at ±90° from the parent); off removes them (undoable)', () => prop('min') !== undefined, lim)),
    ...limRows,
    stanceOnly() ? row('hidden', 'Hidden in this stance', toggle(':visibility: hidden', 'Hidden in this stance: the bone and everything below it are not drawn, have no hurtbox and take no part in walking (Del does the same here)',
      () => !!viewChar().by[studio.sel]?.hidden, v => edit(def => { for (const b of selDefs(def)) if (v) b.hidden = true; else delete b.hidden; }))) : null,
    row('lock', 'Lock to the parent', toggle(':lock: lock', 'Locked: the joint keeps its angle to its parent while posing. Dragging it (or IK through it) turns the first unlocked bone above, so locked bones move as one group.',
      () => !!prop('lock'), v => setProp('lock', v || undefined)))];
}
// clicking a variable's name: nine bodies varying only that variable
const bodyExpLink = (row, k, preview) => expLink(row, `nine bodies varying ${k}; click the best to breed around it`,
  () => { creator.exp.vars = new Set([k]); if (preview) creator.preview = preview; setExp(true); });
// ---------- radar: the character's chosen stats, other characters overlaid to compare ----------
const radar = { vars: new Set(['speed', 'dash', 'traction', 'weight', 'jump', 'airSpeed', 'health', 'tempo']), chars: new Set() };
const RADAR_COLS = ['#c0392b', '#2a6fb0', '#2e8b57', '#b8860b', '#7b4ea3', '#d35400', '#555'];
const statOf = (k, st) => DEFS[k][st.k] ?? 1;
function radarPanel() {
  const cv = h('canvas', { cls: 'radar' }), legend = h('div', { cls: 'legend' });
  const draw = () => {
    const S = 250, c = cv.getContext('2d'), axes = CHAR_STATS.filter(st => radar.vars.has(st.k)), n = axes.length, R = 80, cx = S / 2, cy = S / 2;
    cv.width = cv.height = S * dpr; c.scale(dpr, dpr); c.font = '10px ui-monospace, Menlo, monospace'; c.textAlign = 'center';
    const ks = [CURRENT, ...[...radar.chars].filter(k => k !== CURRENT && DEFS[k])];
    legend.replaceChildren(...ks.map((k, i) => h('span', { textContent: k, style: `color: ${RADAR_COLS[i % RADAR_COLS.length]}` })));
    if (n < 3) { c.fillStyle = '#999'; c.fillText('pick 3 or more stats', cx, cy); return; }
    const pt = (i, f) => { const a = -Math.PI / 2 + i / n * 2 * Math.PI; return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f]; };
    const shape = f => { c.beginPath(); axes.forEach((st, i) => c.lineTo(...pt(i, f(st)))); c.closePath(); };
    const norm = (v, st) => clamp((v - st.min) / (st.max - st.min), 0, 1);
    c.strokeStyle = '#ddd'; c.lineWidth = 1;
    for (const f of [0.25, 0.5, 0.75, 1]) { shape(() => f); c.stroke(); }
    axes.forEach((st, i) => { c.beginPath(); c.moveTo(cx, cy); c.lineTo(...pt(i, 1)); c.stroke(); });
    c.setLineDash([3, 3]); c.strokeStyle = '#aaa'; shape(st => norm(1, st)); c.stroke(); c.setLineDash([]); // 1 = as the settings say
    ks.slice().reverse().forEach(k => { // the current character on top
      const col = RADAR_COLS[ks.indexOf(k) % RADAR_COLS.length];
      shape(st => norm(statOf(k, st), st)); c.globalAlpha = 0.15; c.fillStyle = col; c.fill();
      c.globalAlpha = 1; c.strokeStyle = col; c.lineWidth = k === CURRENT ? 2 : 1.5; c.stroke();
    });
    c.fillStyle = '#555';
    axes.forEach((st, i) => { const [x, y] = pt(i, 1.18); c.fillText(st.k, x, y + 3); });
  };
  reg(cv, draw);
  const head = h('h3', { textContent: 'radar', tip: 'Stats on a radar: each axis runs from the stat\'s minimum (centre) to its maximum (rim); the dashed ring is 1 (as the settings say). Pick the axes and the characters to compare.' });
  head.append(h('span', { cls: 'gops' },
    button(':tune:', 'Pick the stats the radar shows as axes', (e, b) => popup(b, h('div', { cls: 'bar' }, CHAR_STATS.map(st =>
      toggle(st.k, `${st.g} · ${st.tip}`, () => radar.vars.has(st.k), on => radar.vars[on ? 'add' : 'delete'](st.k))))), 'mini'),
    button(':person:', 'Characters to compare with this one', (e, b) => popup(b, h('div', { cls: 'bar' }, Object.keys(DEFS).filter(k => k !== CURRENT).map(k =>
      toggle(k, `Overlay ${k}'s stats on the radar to compare`, () => radar.chars.has(k), on => radar.chars[on ? 'add' : 'delete'](k))))), 'mini')));
  return [head, cv, legend];
}
// the character's stats; defaults are the built-in's values (custom characters: 1)
// (in stance only: the stance body's stats over the character's; health stays the character's)
function statsPanel() {
  const own = stanceOnly(), get = k => (own ? stanceBody()?.stats?.[k] : undefined) ?? DEFS[CURRENT][k] ?? 1, dflt = k => own ? DEFS[CURRENT][k] ?? 1 : CHAR_DEFS[CURRENT]?.[k] ?? 1;
  const put = (def, vals) => Object.assign(own ? editBody(def).stats ??= {} : def, vals);
  // one heading per group (ground / air / fight), each with its group buttons
  return Object.keys(STAT_GROUPS).flatMap(g => {
    const specs = CHAR_STATS.filter(s => s.g === g && !(own && s.k === 'health'));
    const title = h('h3', { textContent: `${g} stats`, tip: `${STAT_GROUPS[g]}. Multipliers on the fight settings for this character only (1 = as the settings say)` });
    title.append(groupOps(specs, get, dflt, vals => edit(def => put(def, vals)),
      [`Experiment: nine bodies varying the ${g} stats; click the best to breed around it`, () => { creator.exp.vars = new Set(specs.map(s => s.k)); setExp(true); }]));
    return [title, ...specs.map(s => bodyExpLink(slider(s.k, s, () => get(s.k), v => edit(def => put(def, { [s.k]: v }), 'stat:' + s.k), s.tip), s.k))];
  });
}
// walk and idle knobs; keyframed loops (moves named idle / walk, made in animate) replace them
function gaitPanel() {
  const own = stanceOnly(), spec = k => GAIT_VARS.find(s => s.k === k), main = k => DEFS[CURRENT].gait?.[k] ?? spec(k).v;
  const get = k => (own ? stanceBody()?.gait?.[k] : undefined) ?? main(k), dflt = k => own ? main(k) : CHAR_DEFS[CURRENT]?.gait?.[k] ?? spec(k).v;
  const set = vals => edit(def => { if (own) { const b = editBody(def); b.gait = { ...b.gait, ...vals }; } else def.gait = { ...def.gait, ...vals }; }, 'gait:' + Object.keys(vals).join());
  const title = h('h3', { textContent: 'walk & idle', tip: 'The procedural walk and idle of this character. Preview: walk shows the cycle. A keyframed idle or walk loop (animate) replaces them.' });
  title.append(groupOps(GAIT_VARS, get, dflt, set,
    ['Experiment: nine bodies varying the walk and idle; click the best to breed around it', () => { creator.exp.vars = new Set(GAIT_VARS.filter(s => !s.opts).map(s => s.k)); creator.preview = 'walk'; setExp(true); }]));
  const loops = ['idle', 'walk'].map(n => loopName(currentChar(), studio.stance, n)).filter(n => currentChar().moves[n]);
  return [title, loops.length ? h('div', { cls: 'note', textContent: `keyframed ${loops.join(' and ')} loop replaces the procedural one` }) : null,
    ...GAIT_VARS.map(s => s.opts ? h('div', { cls: 'row', tip: s.tip }, h('span', { textContent: s.k }), seg(s.opts, () => get(s.k), v => set({ [s.k]: v }), s.optTips))
      : bodyExpLink(slider(s.k, s, () => get(s.k), v => set({ [s.k]: v }), s.tip), s.k, 'walk'))];
}
// the shadow under the fighter (def.shadow, only what differs from SHADOW is saved); drawing only
const SHADOW_VARS = [
  { k: 'w', min: 0, max: 60, step: 1, tip: 'Width: the half-width of the oval, the radius of the circle (px); body: the figure\'s width (22 = as wide as the fighter)' },
  { k: 'h', min: 0, max: 30, step: 0.5, only: ['ellipse', 'body'], tip: 'Height: the half-height of the oval (px); body: how much of the figure\'s height shows on the floor (22 = all of it)' },
  { k: 'alpha', min: 0, max: 0.6, step: 0.01, tip: 'Darkness: 0 invisible … 0.6 nearly solid' },
  { k: 'dx', min: -40, max: 40, step: 1, tip: 'Moves the shadow forward (+) or back (−) from the feet (px; on the screen, not by facing)' },
  { k: 'dy', min: -20, max: 20, step: 1, tip: 'Moves the shadow down (+) or up (−) from the floor line (px)' },
  { k: 'lift', min: 0, max: 3, step: 0.1, tip: 'How fast the shadow shrinks as the fighter rises: 1 = to a third at 140 px up, 0 = never' },
  { k: 'skew', min: -2, max: 2, step: 0.05, only: ['body'], tip: 'Body only: how far the shadow leans, per px of height (the light from the side; 0 = straight down)' },
];
function shadowPanel() {
  const get = k => ({ ...SHADOW, ...DEFS[CURRENT].shadow })[k], dflt = k => ({ ...SHADOW, ...CHAR_DEFS[CURRENT]?.shadow })[k];
  const set = vals => edit(def => {
    const sh = { ...def.shadow, ...vals };
    for (const k in sh) if (sh[k] === SHADOW[k]) delete sh[k];
    if (Object.keys(sh).length) def.shadow = sh; else delete def.shadow; // a character without its own shadow saves none
  }, 'shadow:' + Object.keys(vals).join());
  const title = h('h3', { textContent: 'shadow', tip: 'The shadow under this character in a fight: its shape, size, darkness, colour and place. Drawing only, the fight is the same.' });
  title.append(groupOps(SHADOW_VARS, get, dflt, set));
  const off = (r, only) => { reg(r, () => { r.hidden = get('shape') === 'none' || !!only && !only.includes(get('shape')); }); return r; };
  return [title,
    h('div', { cls: 'row', tip: 'The shadow\'s shape' }, h('span', { textContent: 'shape' }),
      seg(Object.keys(SHADOW_SHAPES), () => get('shape'), v => set({ shape: v }), SHADOW_SHAPES, o => o === 'none' ? ':block: off' : optLabel(o))),
    off(h('div', { cls: 'row', tip: 'The shadow\'s colour' }, h('span', {}, ...rich(':palette: colour')),
      seg(['black', ...Object.keys(FX_COLS)], () => get('col'), v => set({ col: v }), { black: 'A plain dark shadow', ...mapVals(FX_COLS, () => 'This colour (a glow under a ghost, coloured light)') }))),
    ...SHADOW_VARS.map(s => off(slider(s.k, s, () => get(s.k), v => set({ [s.k]: v }), s.tip), s.only))];
}
// ---------- bone table: every bone with its properties, edited in place; a row click selects (⌘/Ctrl/Shift+click adds) ----------
// an edit in a selected row goes to every selected bone, in any other row to that bone only
const BONE_TIPS = { role: 'What the bone does in procedural motion (click to change)', side: 'Draw order and colour (click to change)', shape: 'How the bone is drawn (click to change)' };
const BONE_COLS = [
  { k: 'id', tip: 'Click a row to select the bone (⌘/Ctrl/Shift+click adds it to the selection) · drag the id onto another bone to move it before that one: inside front, centre and back, earlier bones draw underneath (unsorted and unfiltered only)', get: b => b.id },
  { k: 'parent', tip: 'The bone it hangs from (hip: a root)', get: b => b.parent || '' },
  ...['role', 'side', 'shape'].map(k => ({ k, tip: BONE_TIPS[k], get: b => b[k] ?? BONE[k] ?? '', opts: { role: ROLE_TIPS, side: SIDE_TIPS, shape: SHAPE_TIPS }[k] })),
  { k: 'stance', tip: 'Angle in the stance pose, relative to the parent', get: b => curStance().pose[b.id] ?? 0, num: { min: -270, max: 270, step: 1 } },
  ...BONE_PROPS.map(p => ({ k: p.k, tip: p.tip, get: b => b[p.k] ?? BONE[p.k], num: p })),
  ...['min', 'max'].map(k => ({ k, tip: `Joint limit (${k}) relative to the parent; empty = no limits`, get: b => b[k] ?? '', num: { min: -180, max: 180, step: 1 } })),
  { k: 'lock', tip: 'Locked: keeps its angle to its parent while posing (click to switch)', get: b => b.lock ? 'lock' : '' },
];
const SIDE_NAMES = { f: 'front', '': 'centre', b: 'back' };
function setBoneCol(id, k, v) {
  const ids = selIds().includes(id) ? selIds() : [id];
  edit(def => {
    for (const id of ids) {
      if (k === 'stance') { editPose(def)[id] = v; continue; }
      const b = boneDef(def, id);
      if (!b) continue;
      if (k === 'min' || k === 'max') {
        if (v === null) { delete b.min; delete b.max; } else { b[k] = v; b.min ??= -180; b.max ??= 180; }
      } else if (v === undefined) delete b[k]; else b[k] = v;
    }
  });
}
const BONES_TIP = 'Bone table: every bone and its properties in a table over the stage; edit values in place, click rows to select (⌘/Ctrl/Shift+click adds), an edit in a selected row goes to every selected bone';
function boneTable() {
  const body = h('tbody'), head = h('tr'), wrap = h('div', { cls: 'mtable btable' });
  let sig = '';
  const fill = () => {
    const def = DEFS[CURRENT], q = creator.tfilter.trim(), { k: sk, dir } = creator.tsort, col = BONE_COLS.find(c => c.k === sk);
    sig = JSON.stringify([def.bones, stanceBody(), curStance().pose]);
    const rows = viewChar().bones.map(cb => boneView(cb.id)).filter(Boolean).map(b => ({ b, v: BONE_COLS.map(c => c.get(b)) }))
      .filter(r => !q || fuzzy(q, r.v.filter(v => typeof v === 'string').join(' ')));
    if (col) { const i = BONE_COLS.indexOf(col);
      rows.sort((a, b) => dir * (typeof a.v[i] === 'number' && typeof b.v[i] === 'number' ? a.v[i] - b.v[i] : String(a.v[i]).localeCompare(String(b.v[i])))); }
    head.replaceChildren(...BONE_COLS.map(c => h('th', { tip: `${c.tip} · click: sort (again: reverse, a third time: back to the bone order)`, textContent: c.k + (c.k === sk ? (dir > 0 ? ' ▲' : ' ▼') : ''),
      onclick: () => { creator.tsort = c.k === sk && dir < 0 ? { k: '', dir: 1 } : { k: c.k, dir: c.k === sk ? -dir : 1 }; fill(); } })));
    body.replaceChildren(...rows.map(({ b, v }) => {
      const tr = h('tr', { onclick: e => { pickBoneSel(b.id, e.shiftKey || e.metaKey || e.ctrlKey); syncAll(); } });
      reg(tr, () => tr.classList.toggle('on', selIds().includes(b.id)));
      const stop = e => e.stopPropagation();
      tr.append(...BONE_COLS.map((c, i) => {
        const td = h('td'), tip = `${b.id} · ${c.tip}${selIds().length > 1 && selIds().includes(b.id) ? ' · goes to every selected bone' : ''}`;
        if (c.k === 'id') { td.textContent = v[i]; td.style.borderLeft = `4px solid ${ROLE_COLS[b.role][b.side === 'b' ? 1 : 0]}`;
          Object.assign(td, { ondblclick: e => { stop(e); renameBone(b.id).then(fill); } });
          td.dataset.tip = tip + ' · double-click: rename';
          if (!sk && !q) Object.assign(td, { draggable: true, className: 'drag', ondragstart: e => { e.dataTransfer?.setData('text/plain', b.id); },
            ondragover: e => { e.preventDefault(); td.classList.add('dropto'); }, ondragleave: () => td.classList.remove('dropto'),
            ondrop: e => { e.preventDefault(); const id = e.dataTransfer?.getData('text/plain'); if (def.bones.some(x => x.id === id)) { moveBone(id, b.id); fill(); } } }); }
        else if (c.k === 'parent') td.append(button(v[i] || 'hip', tip + ' · click: hang it from another bone', (e, el) => { stop(e);
          popup(el, h('b', { textContent: `${b.id} hangs from` }), seg(['hip', ...parentChoices(def, b.id)], () => b.parent || 'hip', x => { closePop(); setParent(b.id, x === 'hip' ? null : x); fill(); },
            Object.fromEntries(['hip', ...parentChoices(def, b.id)].map(x => [x, x === 'hip' ? 'The hip: a root, like the legs and the waist' : `Hang ${b.id} (and what hangs from it) from ${x}`])))); }, 'mini'));
        else if (c.num) td.append(h('input', { type: 'number', step: c.num.step, value: v[i], tip, onclick: stop, onkeydown: stop,
          onchange: e => { const x = parseFloat(e.target.value), blank = e.target.value === '';
            setBoneCol(b.id, c.k, c.k === 'min' || c.k === 'max' ? (blank ? null : x) : blank ? (c.k === 'stance' ? 0 : undefined) : x); fill(); } }));
        else if (c.opts) td.append(button(c.k === 'side' ? SIDE_NAMES[v[i]] : v[i], tip, (e, el) => { stop(e);
          popup(el, seg(Object.keys(c.opts), () => b[c.k] ?? BONE[c.k], x => { setBoneCol(b.id, c.k, x); closePop(); fill(); }, c.opts, c.k === 'side' ? o => SIDE_NAMES[o] : optLabel)); }, 'mini'));
        else if (c.k === 'lock') td.append(button(b.lock ? ':lock:' : '—', tip, e => { stop(e); setBoneCol(b.id, 'lock', b.lock ? undefined : true); fill(); }, 'mini'));
        else td.textContent = v[i];
        return td;
      }));
      return tr;
    }));
    if (!rows.length) body.replaceChildren(h('tr', {}, h('td', { colSpan: BONE_COLS.length, cls: 'note', textContent: 'no bone matches the filter' })));
  };
  fill();
  // undo, joint drags and panel edits change the bones from outside: refill (not while a cell is being typed in)
  reg(wrap, () => { if (!wrap.contains(document.activeElement) && JSON.stringify([DEFS[CURRENT].bones, stanceBody(), curStance().pose]) !== sig) fill(); });
  const filter = h('input', { cls: 'macro', value: creator.tfilter, placeholder: 'fuzzy filter: id, parent, role, side, shape', tip: 'Letters in order match (e.g. "shf" finds shinF); any column with text counts',
    oninput: e => { creator.tfilter = e.target.value; fill(); }, onkeydown: e => e.stopPropagation() });
  wrap.append(stageHead('bone table', BONES_TIP, filter),
    h('table', {}, h('thead', {}, head), body));
  return wrap;
}
function bodyPanel() {
  return [...charPanel(),
    heading('Body', 'Build the skeleton. Limbs are role-based: legs walk, arms swing, tails follow through. New parts attach to the selected torso bone.',
      '⌘Z undo · ⇧⌘Z redo · Del delete · drag joints in the editor'),
    h('div', { cls: 'bar' }, ...Object.keys(LIMBS).map(k => button(`:add: :${OPT_ICONS[k]}: ${k}`, LIMB_TIPS[k], () => addLimb(k)))),
    h('h4', { tip: 'Click to select · ▾ ▸ fold a branch' }, ...rich(':straighten: bones'), crud({
      new: ['Add one bone at the end of the selected bone (same role and side)', addBone],
      copy: ['Copy the selected bone and everything below it to the other side (front ↔ back)', copyLimb],
      rename: ['Rename the selected bone (follows it into moves, poses and stance bodies)', () => renameBone()],
      delete: ['Delete the selected bone and everything below it (Del)', deleteBone] },
      button(':select_all: select all', 'Select every bone, so an edit goes to all of them at once', selectAllBones, 'mini'))),
    boneTree(),
    ...bonePanel(),
    heading('Stance pose', 'Set the whole stance from a preset (per limb, so it works for any body), or turn a pose into attacks', ''),
    ...stanceRow(),
    h('div', { cls: 'bar' }, Object.entries(POSES).map(([k, p]) => button(k, p.tip, () => edit(def => Object.assign(editPose(def), presetPose(currentChar(), p)))))),
    h('div', { cls: 'bar' }, button(':animation: pose → animation', 'Turn a pose into moves: nine attacks that strike into it from the main stance (each with its own anticipation and timing) in the attack grid; click one to breed variations, then save it or edit it in animate', (e, b) =>
      popup(b, h('div', { cls: 'bar' }, Object.entries(POSE_TARGETS(currentChar())).map(([n, t]) => button(n, t.tip, () => {
        Object.assign(breed, { pose: n, atk: null }); breed.seed++; lab.kind = 'attacks'; setMode('grid');
      })))))),
    ...radarPanel(),
    ...statsPanel(),
    ...gaitPanel(),
    ...shadowPanel(),
  ];
}
function expPanel() {
  const ex = creator.exp;
  if (ex.kind === 'random') return [
    heading('Random characters', 'Nine random characters drawn from the variables below, each fighting your current character. Click one to keep it as a new character; clicking a kept one again offers to update that character.',
      'click a cell: keep it · Esc: back to the editor'),
    h('div', { cls: 'bar' }, button(':casino: reroll', 'Nine new random characters', () => { ex.seed++; buildExp(); })),
    ...randomPanel(buildExp)];
  return [
    heading('Body experiment', 'Nine bodies: the parent (framed) and 8 random variations of the chosen properties. Click a cell to make it the parent and breed new variations; repeat to home in, then keep it.',
      'click a cell: breed · Esc: back to the editor'),
    h('div', { cls: 'bar' },
      button(':lock: keep parent', 'Make the parent body your character (undoable)', () => edit(def => Object.assign(def, clone(ex.parent)))),
      button(':casino: reroll', 'New random variations around the same parent', () => { ex.seed++; buildExp(); }),
      button(':restart_alt: restart', 'Start again from your current character', () => { ex.parent = null; buildExp(); })),
    h('h4', { tip: 'Which bone properties and stats the variations change' }, ...rich(':tune: vary')),
    h('div', { cls: 'bar' }, [...BONE_PROPS, ...CHAR_STATS, ...GAIT_VARS.filter(s => !s.opts)].map(p => toggle(p.k, p.tip, () => ex.vars.has(p.k), on => { ex.vars[on ? 'add' : 'delete'](p.k); buildExp(); })),
      toggle(':add: limbs', 'Experimental limbs: each variation also adds a random limb, drops one, or grows an extra joint', () => ex.limbs, v => { ex.limbs = v; buildExp(); })),
    slider('spread', { min: 0.02, max: 0.5, step: 0.01 }, () => ex.spread, v => { ex.spread = v; },
      'How far variations stray from the parent, as a fraction of each property\'s range. Applied on the next breed or reroll.'),
    h('div', { cls: 'row', tip: 'Multiply the spread so the differences between bodies stand out' }, h('span', { textContent: 'exaggerate' }), exagSeg(buildExp)),
    h('div', { cls: 'bar' }, toggle(':flip: symmetric', 'Front and back partners (handF/handB…) change together', () => ex.sym, v => { ex.sym = v; buildExp(); })),
  ];
}

const creatorMode = {
  preview: () => creator.expOn ? null : edLayout().pv,
  clipRects: () => creator.expOn ? cellRects(9, 3, fullArea()).map((r, i) => ({ key: creator.exp.cells[i], r })) : [{ key: 'preview', r: edLayout().pv }],
  split: () => !creator.expOn,
  enter() { creator.w = creator.preview === 'impact' ? ragdollWorld() : newWorld(previewScen()); if (creator.expOn) buildExp(); },
  restart() { creatorMode.enter(); },
  worlds: () => creator.expOn ? creator.exp.cells.map(c => c.w) : [creator.w],
  render: creatorRender,
  ctxBar: creatorCtx,
  side: () => creator.expOn ? expPanel() : bodyPanel(),
  overlay: () => creator.expOn ? [] : stageOpen() === 'bones' ? [boneTable()] : moveStage() ? [moveStage()()] :
    creator.preview === 'impact' ? [previewBar(), blowBar(() => creator.w, () => creatorMode.restart(), true)] : [previewBar()],
  open: ['character', 'body', 'bone', 'stance pose', 'random characters', 'body experiment'],
  mouse: creatorMouse,
  key: creatorKey,
  hint: () => creator.expOn ? (creator.exp.kind === 'random' ? 'click a cell to keep it' : 'click a cell to breed around it') + ' · Esc back to the editor'
    : 'drag a joint: length + angle · Shift+drag: angle only · drag the hip (square): move the waist over the feet · click: select · ⌘click: add to the selection · Del delete · ⌘Z undo',
};
