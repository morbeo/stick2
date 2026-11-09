'use strict';
// ---------- character mode: drag the skeleton, tune bones, watch it fight live; body experiment grid ----------
const creator = { sideTab: (() => { try { return localStorage.getItem('stick2.sideTab') || 'bone'; } catch { return 'bone'; } })(), statTab: (() => { try { return localStorage.getItem('stick2.statTab') || 'ground'; } catch { return 'ground'; } })(), boneView: (() => { try { return localStorage.getItem('stick2.boneView') || 'tree'; } catch { return 'tree'; } })(), preview: 'showcase', opponent: 'self', controlDummy: false, w: null, drag: null, hover: null, anchor: null, expOn: false, table: false, view: null, tfilter: '', tsort: { k: '', dir: 1 },
  headToHead: false, htControl: 'none', // the changes panel's built-in-vs-yours option, instead of each vs the chosen opponent
  exp: { kind: 'body', vars: new Set(['len', 'thick']), limbs: false, spread: 0.15, sym: true, seed: 1, parent: null, cells: [] } };
// quick picks shown as buttons in the preview bar; creator.preview itself can be any SCENARIOS key (scenButton picks from all of them)
const PREVIEW_PRESETS = ['showcase', 'walk', 'ai vs ai', 'solo'];
// the preview's scenario. A human-vs-something one (you vs dummy, you vs ai…) hands your keyboard to the character being
// edited (previewYou; inFight() turns the keys on for it). controlDummy: your keyboard drives the opponent instead, and
// then a is forced off 'human' (there's only one keyboard: both fighters would move together)
// solo is a lone dummy as a scenario, but in the preview it's yours to drive
const previewYou = () => (creator.preview === 'solo' || SCENARIOS[creator.preview]?.a === 'human') && !creator.controlDummy;
const previewScen = () => { const s = SCENARIOS[creator.preview] || SCENARIOS.showcase;
  return { ...s, ...creator.preview === 'solo' && !creator.controlDummy ? { a: 'human' } : null, ...s.a === 'human' && creator.controlDummy ? { a: 'dummy' } : null, ...creator.controlDummy && s.b ? { b: 'human' } : null,
    init: w => { s.init?.(w); w.a.setStance(studio.stance, 'instant'); } }; };
// the opponent's character model for the main preview (not the body-experiment cells, which bring their own)
const previewChars = () => [currentChar(), CHARS[creator.opponent] || currentChar()];
// the changes panel's head-to-head option: the built-in fights your edited version directly (always ai vs ai - a
// balance test, not a demo), with htControl optionally handing one side to your own keyboard
const diffHeadScen = () => { const s = SCENARIOS['ai vs ai'];
  return { ...s, ...creator.htControl === 'base' ? { a: 'human' } : creator.htControl === 'cur' ? { b: 'human' } : null,
    init: w => { s.init?.(w); w.a.setStance(studio.stance, 'instant'); w.b?.setStance(studio.stance, 'instant'); } }; };

// ---------- editor view: the stance pose, big, with a handle on every joint ----------
function edLayout() {
  // the bones panel covers the bottom of the stage: the editor and preview fit above it
  const ew = splitX() - (rigShown() ? RIG_W * dpr : 0), ov = document.querySelector('#over > .btable'), hh = canvas.height - (ov ? ov.offsetHeight * dpr : 0);
  const px = splitX();
  return { ed: { x: 0, y: 0, w: ew, h: hh }, pv: { x: px, y: 0, w: canvas.width - px, h: hh } };
}
// screen transform of the figure; the hips stay put while dragging so the body doesn't jump under the cursor
function edFrame() {
  const ch = viewChar(), r = edLayout().ed, s = Math.min(r.h / 190, r.w / 130), ground = r.y + r.h * 0.85;
  const wa = {}, L = fk(ch, curStance(ch).pose, 1, null, wa);
  const hipH = curStance(ch).hipH;
  if (hipH != null) creator.anchor = [creator.drag === 'hip' ? creator.anchor[0] : r.x + r.w / 2, ground - hipH * s]; // off the floor: the hip at its set height
  else if (!creator.drag) {
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
  if (rig.isolate) ctx.globalAlpha = 0.2; // isolate: everything but the selection ghosted
  drawFx(ctx, L, fxs, ft, true); drawFigure(ctx, ch, L, INK[0], INK[1], 0, roleTint()); drawFx(ctx, L, fxs, ft, false);
  ctx.globalAlpha = 1;
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
  if (creator.rep) { const p = P[creator.rep.id]; ctx.save(); ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.strokeStyle = RED[0]; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(creator.rep.x, creator.rep.y); ctx.stroke(); ctx.restore();
    text(`hang ${creator.rep.id} from ${creator.hover && creator.hover !== creator.rep.id ? creator.hover : '…'}`, creator.rep.x + 10 * dpr, creator.rep.y - 8 * dpr, RED[0], 11); }
  if (creator.hover === 'hip') text('hip · drag: the waist moves, the feet stay', Math.min(P.hip[0] + 10 * dpr, r.x + r.w - 300 * dpr), P.hip[1] - 8 * dpr, '#666', 11);
  const hv = ch.by[creator.hover] || (creator.hover !== 'hip' && sel);
  if (hv) text(`${hv.id} · ${hv.role}${hv.side ? ' · ' + (hv.side === 'f' ? 'front' : 'back') : ''} · ${hv.len}px`,
    Math.min(P[hv.id][0] + 10 * dpr, r.x + r.w - 230 * dpr), P[hv.id][1] - 8 * dpr, '#666', 11);
  text(`${ch.name} · ${ch.bones.filter(b => !b.chainOf).length} bones`, r.x + 10 * dpr, r.y + 18 * dpr, '#444', 12, 'bold');
}
// nearest joint handle, else the nearest bone line
function pickBone(x, y) {
  const { ch, P } = edFrame();
  let best = null, bd = 12 * dpr;
  for (const id of [...ch.ids, 'hip']) { const d = Math.hypot(P[id][0] - x, P[id][1] - y); if (d < bd) { bd = d; best = id; } }
  if (best) return ch.by[best]?.chainOf || best;
  bd = 6 * dpr;
  for (const b of ch.bones) { const d = distSeg([x, y], P[b.parent || 'hip'], P[b.id]); if (d < bd) { bd = d; best = b.id; } }
  return ch.by[best]?.chainOf || best; // a chain's segments edit the chain bone itself
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
    if (!shift && rig.mode !== 'animate' && !b.lenLock && b.shape !== 'circle') boneDef(def, b.id).len = Math.max(2, Math.round(Math.hypot(dx, dy) * (b.chainN || 1) / (stanceBody()?.scale || 1))); // (drawn × the stance's size)
  }, 'drag:' + b.id);
}
// dragging the hip moves the body over the feet in the stance: every leg bends so its ankle stays (as in animate, see hipTo);
// in a stance off the floor (hipH) it raises or lowers the body instead
function hipDrag(x, y) {
  const f = edFrame(), h0 = creator.hip0, dx = (x - h0.x) / f.s, dy = (y - h0.y) / f.s, pose = { ...h0.pose }, chain = [];
  if (h0.hipH != null) { // off the floor: the hip drag only raises or lowers the whole body (the stance's hipH), the legs as they are
    edit(def => { (studio.stance ? def.stances[studio.stance - 1] : (def.main ??= {})).hipH = Math.max(0, Math.round(h0.hipH - dy)); }, 'hipH');
    return;
  }
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
  const { ed, pv } = edLayout();
  if (pv.x > ed.w) { ctx.fillStyle = '#f3f0e8'; ctx.fillRect(ed.w, 0, pv.x - ed.w, ed.h); } // under the rig tools column
  drawEditor();
  drawCell({ w: creator.w, label: 'preview' }, pv, { plot: false });
  drawTipGhost(); drawStepPath();
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
    else if (id && id !== 'hip' && e.altKey && rig.mode !== 'animate') { pickBoneSel(id, false); creator.rep = { id, x, y }; syncAll(); } // Alt+drag: reparent onto the joint it's dropped on
    else if (id === 'hip') { const f = edFrame(); creator.hip0 = { x, y, a: [...f.o], pose: { ...curStance(f.ch).pose }, L: f.L, hipH: curStance(f.ch).hipH }; creator.drag = 'hip'; }
    else if (id) { pickBoneSel(id, false); creator.drag = id; syncAll(); }
  } else if (type === 'move') {
    if (creator.rep) { Object.assign(creator.rep, { x, y }); creator.hover = pickBone(x, y); cursor('alias'); return; }
    if (creator.drag === 'hip') hipDrag(x, y);
    else if (creator.drag) dragTo(x, y, e.shiftKey);
    else creator.hover = x < edLayout().ed.w ? pickBone(x, y) : null;
    cursor(creator.drag ? 'grabbing' : creator.hover ? 'grab' : 'default');
  } else {
    const r = creator.rep; creator.rep = null; creator.drag = null; studio.lastKey = null;
    const to = r && pickBone(x, y);
    if (to && to !== r.id && (to === 'hip' || parentChoices(DEFS[CURRENT], r.id).includes(to))) setParent(r.id, to === 'hip' ? null : to);
  }
}
function creatorKey(e, a) {
  if (creator.expOn) { if (e.code === 'Escape') { setExp(false); return true; } return; }
  if (a === 'deleteBone') { deleteBone(); return true; }
}

// ---------- panels ----------
function creatorCtx() {
  return [charStancePicker(), movesGrp(),
    showGrp(['boxes', 'colours']), toggle(':accessibility: rig', 'Rig tools: a column beside the character view (setup / animate, pose copy and paste, isolate, tip ghost)', () => !rig.hidden, v => { rig.hidden = !v; panels(); }), panelsGrp([...MOVE_PANELS, 'bones', ...CHAR_DEFS[CURRENT] ? ['changes'] : []],
      { ...VIEW_TIPS, bones: 'Bones under the character view: the bone tree or the bone table (switch in its head)', changes: 'What differs from the matching built-in character' }),
  ];
}
// vary body lives in the experiment tab (lab.kind 'body') now; a property's context menu can still jump straight there, pre-set to vary it
function openBodyVary() { lab.kind = 'body'; setMode('experiment'); }
// what the preview plays: under the preview (a lot of free space there), not the toolbar
function previewBar(cls = 'over pvbar') {
  const solo = creator.preview === 'solo';
  const oppB = button('', 'The opponent\'s character in the preview (not just a copy of yours)', (e, el) =>
    charPickerPopup(el, { title: 'opponent', extra: [['self', 'A copy of the character you\'re editing']],
      pick: n => { creator.opponent = n; creatorMode.restart(); panels(); }, on: n => creator.opponent === n }));
  reg(oppB, () => setRich(oppB, ':person: ' + creator.opponent));
  const controlB = toggle(':stadia_controller:', 'Drive the opponent with your own keyboard instead of its script/AI - handy for holding it still, guarding, or moving it into a weapon or throw\'s reach',
    () => creator.controlDummy, v => { creator.controlDummy = v; creatorMode.restart(); });
  const pick = v => { creator.preview = v; creator.controlDummy = false; creatorMode.restart(); panels(); };
  const fight = [seg(PREVIEW_PRESETS, () => creator.preview, pick, mapVals(Object.fromEntries(PREVIEW_PRESETS.map(v => [v, v])), v => scenTip(SCENARIOS[v])), v => v),
    scenButton(pick, () => creator.preview)], send = button(':sports_kabaddi: send to play', 'Jump into Play with this scenario and opponent', () => sendToPlay(creator.preview, creator.opponent));
  // over the stage: a dock of labelled rows (docs/ui.md); in the side panel: one plain bar
  if (!cls.startsWith('over')) return h('div', { cls }, ...fight, solo ? null : oppB, solo ? null : controlB, send);
  return h('div', { cls: cls + ' dock' }, dockRow('preview', 'The live fight next to the editor', ...fight),
    solo ? null : dockRow('opponent', 'Who the preview fights, and whether you drive it', oppB, controlB), dockRow('', '', send));
}
const setProp = (k, v) => edit(def => { for (const b of selDefs(def)) b[k] = v; }, selIds() + '.' + k);
const prop = k => selBone()?.[k] ?? BONE[k];
// rows that only mean something for some shapes (by the selected bone's shape)
const PROP_WHEN = { segs: sh => sh === 'chain', taper: sh => sh === 'line', curve: sh => sh === 'line' };
const only = (when, el) => { if (el) reg(el, () => { el.hidden = !when(); }); return el; };
// a small typed number (a limit), Enter or leaving it sets it
const numBox = (label, get, set, tip) => { const inp = h('input', { cls: 'v num', inputMode: 'decimal', tip: `${label}: ${tip}`, onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); },
  onchange: () => { const v = parseFloat(inp.value.replace(',', '.')); if (Number.isFinite(v)) set(v); syncAll(); } });
  reg(inp, () => { if (document.activeElement !== inp) inp.value = fmt(get()); }); return h('span', { cls: 'numlab' }, label, inp); };
// the roles a chain's root bone also joins, as one button opening the toggles
const alsoButton = () => { const b = button('', '', (e, el) => popup(el, h('b', { textContent: 'also acts as' }), h('div', { cls: 'bar' }, ...Object.keys(ROLE_TIPS).filter(r => r !== prop('role')).map(r =>
  toggle(r, `Also act as ${r}: a chain's own root bone gaits and plants as that role too (houndo's front legs: role arm, also leg)`, () => (prop('also') || []).includes(r), v => edit(d => { for (const x of selDefs(d)) {
    const also = new Set(x.also || []); v ? also.add(r) : also.delete(r); x.also = also.size ? [...also] : undefined; } }))))), 'pick');
  reg(b, () => { const a = prop('also') || []; setRich(b, ':layers: ' + (a.length ? a.join(' ') : 'also') + ' ▾'); b.dataset.tip = 'Other roles this bone\'s chain also joins (gait, planting, weapon-holding), on top of its own role · click: change'; });
  return b; };
const BONE_BASIC = ['len', 'thick', 'hurt', 'lag', 'stretch', 'alpha']; // the rest wait behind "more"
function bonePanel() {
  const title = heading('', 'Properties of the selected bone. Click a joint in the editor or a name above to select; ⌘/Ctrl+click (Shift+click in the tree) adds bones to the selection: the values shown are the last one\'s, a change goes to every selected bone.',
    'drag joint: length + angle · Shift+drag: angle only · drag the hip (square): move the waist over the feet · Del delete bone');
  reg(title, () => { const n = selIds().length; title.firstChild.textContent = `Bone · ${studio.sel}${n > 1 ? ` + ${n - 1}` : ''}${stanceOnly() ? ` · ${curStance().name} only` : ''}`; });
  title.dataset.fold = 'bone';
  const row = (label, tip, ...c) => h('div', { cls: 'row', tip }, h('span', {}, ...rich(label)), h('span', { cls: 'rowc' }, ...c));
  const lim = on => edit(def => {
    for (const b of selDefs(def)) if (on) { b.min = -90; b.max = 90; } else { delete b.min; delete b.max; }
  });
  // defaults: the bone as the built-in character has it (custom bones: the general defaults)
  const own = (k, id = studio.sel) => CHAR_DEFS[CURRENT]?.bones.find(b => b.id === id)?.[k], dflt = k => own(k) ?? BONE[k];
  title.append(groupOps(BONE_PROPS, prop, dflt, vals => edit(def => {
    for (const b of selDefs(def)) for (const k in vals) if (own(k, b.id) === undefined && vals[k] === BONE[k]) delete b[k]; else b[k] = vals[k];
  }),
    ['Experiment: nine bodies varying these properties; click the best to breed around it', () => { BONE_PROPS.forEach(p => creator.exp.vars.add(p.k)); openBodyVary(); }]));
  return [title,
    row(':category: role', 'What the bone does in procedural motion · also: other roles its chain joins too',
      pick(Object.keys(ROLE_TIPS), () => prop('role'), v => edit(d => { for (const b of selDefs(d)) b.role = v; }), ROLE_TIPS), alsoButton()),
    row(':flip: side', 'Draw order and colour', seg(['f', '', 'b'], () => prop('side'), v => edit(d => { for (const b of selDefs(d)) b.side = v; }), SIDE_TIPS,
      o => ({ f: 'front', '': 'centre', b: 'back' })[o])),
    row('shape', 'How the bone is drawn · cap: how a line bone\'s ends are drawn',
      pick(Object.keys(SHAPE_TIPS), () => prop('shape'), v => edit(d => { for (const b of selDefs(d)) b.shape = v; }), SHAPE_TIPS),
      only(() => (prop('shape') ?? 'line') === 'line', pick(Object.keys(CAP_TIPS), () => prop('cap') ?? 'round', v => edit(d => { for (const b of selDefs(d)) if (v === 'round') delete b.cap; else b.cap = v; }), CAP_TIPS, v => 'cap: ' + v))),
    only(() => prop('shape') === 'fill', row('fill to', 'Fill shape only: the bone whose joint closes the filled shape', pick(() => ['—', ...DEFS[CURRENT].bones.map(b => b.id).filter(id => id !== studio.sel)],
      () => prop('fillTo') || '—', v => edit(d => { for (const b of selDefs(d)) if (v === '—') delete b.fillTo; else b.fillTo = v; }), {}, String))),
    subFold(':auto_awesome: fx', fxRows('Effects always drawn on this bone (select several bones for a flaming arm, a glowing body); drawing only, the fight is the same',
      () => prop('fx'), e => setProp('fx', e), null)),
    slider('stance', { min: -270, max: 270, step: 1 }, () => curStance().pose[studio.sel] ?? 0,
      v => edit(def => { for (const id of selIds()) editPose(def)[id] = v; }, 'stance:' + selIds()),
      'Angle in the stance pose, relative to the parent (0 = straight on, root bones: 0 = down, 180 = up). Moves are layered on top.'),
    ...BONE_PROPS.map(p => { const r = bodyExpLink(slider(p.k, p, () => prop(p.k), v => setProp(p.k, v), p.tip), p.k);
      if (PROP_WHEN[p.k]) only(() => PROP_WHEN[p.k](prop('shape') ?? 'line'), r);
      return BONE_BASIC.includes(p.k) ? r : adv(r); }),
    row('limits', 'Clamp how far this joint can bend: on, it bends only between min and max (relative to the parent)',
      toggle(':straighten:', 'On: the joint bends only between min and max (starts at ±90° from the parent); off removes them (undoable)', () => prop('min') !== undefined, lim),
      ...['min', 'max'].map(k => only(() => prop('min') !== undefined, numBox(k, () => prop(k) ?? 0, v => setProp(k, v),
        `Joint limit (${k}), relative to the parent. The drawn pose is clamped after the spring, so overshoot never hyperextends; posing in animate can go past it (the IK prefers to stay inside), and a key posed past it is kept.`)))),
    row('lock', 'Lock: keeps its angle to the parent while posing · length: keeps its length while dragging',
      toggle(':lock: angle', 'Locked: the joint keeps its angle to its parent while posing. Dragging it (or IK through it) turns the first unlocked bone above, so locked bones move as one group.',
        () => !!prop('lock'), v => setProp('lock', v || undefined)),
      toggle(':straighten: length', 'Locked: dragging this joint (or an IK drag through it, like the hip) only turns it, its length stays put - the same as always holding Shift while dragging it.',
      () => !!prop('lenLock'), v => setProp('lenLock', v || undefined)))];
}
// clicking a variable's name: nine bodies varying only that variable
const bodyExpLink = (row, k, preview) => expLink(row, `nine bodies varying ${k}; click the best to breed around it`,
  () => { creator.exp.vars = new Set([k]); if (preview) creator.preview = preview; openBodyVary(); });
// the side panel's top-level tabs: one section at a time (all: every section, folded as before, for scanning or search)
const SIDE_TABS = { bone: 'The selected bone: shape, effects, every property', character: 'The character: name, look, stances and its settings',
  stance: 'Stance pose: presets for the whole stance, and pose → animation', stats: 'Stats, walk & idle and shadow', all: 'Every section, one under the other' };
const SIDE_HEADS = { bone: 'bone', character: 'character', stance: 'stance pose', stats: 'stats' };
function sideTab(v) {
  creator.sideTab = v; try { localStorage.setItem('stick2.sideTab', v); } catch {}
  if (SIDE_HEADS[v]) delete lay().fold[app.mode + ':' + SIDE_HEADS[v]]; // a tab shows its section unfolded
  saveLay(); panels();
}
function bodyPanel() {
  const t = SIDE_TABS[creator.sideTab] ? creator.sideTab : 'bone', on = k => t === 'all' || t === k;
  return [h('div', { cls: 'bar sidetabs' }, seg(Object.keys(SIDE_TABS), () => t, sideTab, SIDE_TABS, k => k)),
    ...on('character') ? charPanel() : [],
    ...on('bone') ? bonePanel() : [],
    ...on('stance') ? stancePosePanel() : [],
    ...on('stats') ? statsSection() : [],
  ];
}
function stancePosePanel() {
  return [heading('Stance pose', 'Set the whole stance from a preset (per limb, so it works for any body), or turn a pose into attacks', ''),
    ...stanceRow(),
    h('div', { cls: 'bar' }, Object.entries(posesFor(currentChar())).flatMap(([k, p]) => [button(k, p.tip, () => edit(def => Object.assign(editPose(def), p.pose()))),
      p.custom && button(':close:', `Delete the saved pose "${k}"`, () => { deleteMyPose(k); panels(); }, 'mini')].filter(Boolean))),
    h('div', { cls: 'bar' }, button(':animation: pose → animation', 'Turn a pose into moves: nine attacks that strike into it from the main stance (each with its own anticipation and timing) in the experiment tab; click one to breed variations, then save it or edit it in animate', (e, b) =>
      popup(b, h('div', { cls: 'bar' }, Object.entries(POSE_TARGETS(currentChar())).map(([n, t]) => button(n, t.tip, () => {
        Object.assign(breed, { pose: n, atk: null }); breed.seed++; lab.kind = 'attacks'; setMode('experiment');
      }))))))];
}
// ground / air / fight stats, walk & idle and shadow: one section, a sub-tab each (the last one picked is remembered)
const STAT_TABS = { ...Object.fromEntries(Object.entries(STAT_GROUPS).map(([g, tip]) => [g, [`${tip}. Multipliers on the fight settings for this character only`, () => statsPanel(g)]])),
  walk: ['The procedural walk and idle', () => gaitPanel()], shadow: ['The shadow under the character in a fight', () => shadowPanel()] };
function statsSection() {
  let tab = creator.statTab;
  if (!STAT_TABS[tab]) tab = 'ground';
  const sub = h('div', { cls: 'subpanel' }, ...STAT_TABS[tab][1]());
  // swap the tab body in place: a full panels() rebuild would let the accordion shut this section
  const tabs = seg(Object.keys(STAT_TABS), () => creator.statTab in STAT_TABS ? creator.statTab : 'ground', v => { creator.statTab = v; try { localStorage.setItem('stick2.statTab', v); } catch {} sub.replaceChildren(...STAT_TABS[v][1]()); syncAll(); },
    mapVals(STAT_TABS, t => t[0]), String);
  return [heading('Stats', 'The character\'s stats, walk & idle and shadow, one tab at a time: ground, air and fight stats (multipliers on the fight settings), walk & idle, shadow'),
    h('div', { cls: 'bar stattabs' }, tabs), sub];
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

// ---------- rig tools: a docked column beside the character view (setup / animate, pose clipboard, isolate, tip ghost) ----------
// setup: dragging a joint sets its angle and length, Alt+drag reparents · animate: angles only, the rig itself can't change
const RIG_W = 210; // css px
const rig = { mode: 'setup', isolate: false, ghost: false, trail: [], steps: false, stepTrail: [],
  clip: (() => { try { return JSON.parse(localStorage.getItem('stick2.poseClip')) || null; } catch { return null; } })() };
layFlag(rig, 'hidden', 'rigHidden');
const rigShown = () => !rig.hidden && !creator.expOn && innerWidth > 700; // narrow screens: a bottom sheet over the stage instead (css)
const rigOn = () => !rig.hidden && !creator.expOn;
// the pose a reset goes back to: the built-in character's, else the pose this stance had when the character was opened
function bindPose() {
  const base = CHAR_DEFS[CURRENT];
  if (base) return (studio.stance ? base.stances?.[studio.stance - 1]?.pose : base.poses?.stance) || {};
  return (rig.bind ||= {})[CURRENT + ':' + studio.stance] ||= { ...curStance().pose };
}
function copyPose() {
  rig.clip = { ...curStance().pose };
  try { localStorage.setItem('stick2.poseClip', JSON.stringify(rig.clip)); } catch {}
}
// only: paste to these bones (the selection), else every bone the clip and the character share
function pastePose(only) {
  const c = rig.clip, ch = viewChar();
  if (!c) return;
  edit(def => { const p = editPose(def); for (const id of only || Object.keys(c)) if (id in c && ch.by[id]) p[id] = c[id]; });
}
function resetBones(ids = selIds()) {
  const b = bindPose();
  edit(def => { const p = editPose(def); for (const id of ids) if (id in b) p[id] = b[id]; else delete p[id]; });
}
// the selected bone's tip in the preview fight, kept for ~1.5 s and drawn as a fading trail (shows the arc of a strike)
function drawTipGhost() {
  const w = creator.w, f = w?.a, id = studio.sel;
  if (!rig.ghost || !w?.view || !f?.ch.by[id]) { rig.trail.length = 0; return; }
  const p = f.body()[id];
  rig.trail.push([p[0], p[1]]);
  if (rig.trail.length > 90) rig.trail.shift();
  const { s, ox, oy } = w.view, r = edLayout().pv;
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.strokeStyle = RED[0]; ctx.lineWidth = 2 * dpr; ctx.lineCap = 'round';
  for (let i = 1; i < rig.trail.length; i++) {
    const a = rig.trail[i - 1], b = rig.trail[i];
    ctx.globalAlpha = i / rig.trail.length;
    ctx.beginPath(); ctx.moveTo(a[0] * s + ox, a[1] * s + oy); ctx.lineTo(b[0] * s + ox, b[1] * s + oy); ctx.stroke();
  }
  ctx.restore();
}
// the walk's step path: every foot's ankle in the preview fight, kept ~1.5 s and drawn as fading trails, to see each
// foot travel as far forward as back while tuning stride, swing, lift and bob (walk & idle; the walk preview shows it best)
function drawStepPath() {
  const w = creator.w, f = w?.a;
  if (!rig.steps || !w?.view || !f) { rig.stepTrail = []; return; }
  const P = f.body(), ank = f.ch.chains.leg.map(c => c[c.length >= 3 ? c.length - 2 : c.length - 1]);
  (rig.stepTrail ??= []).push(ank.map(b => P[b.id]));
  if (rig.stepTrail.length > 90) rig.stepTrail.shift();
  const { s, ox, oy } = w.view, r = edLayout().pv, T = rig.stepTrail;
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.strokeStyle = '#2c7be5'; ctx.lineWidth = 2 * dpr; ctx.lineCap = 'round';
  for (let i = 1; i < T.length; i++) for (let j = 0; j < T[i].length; j++) {
    const a = T[i - 1][j], b = T[i][j]; if (!a || !b) continue;
    ctx.globalAlpha = i / T.length;
    ctx.beginPath(); ctx.moveTo(a[0] * s + ox, a[1] * s + oy); ctx.lineTo(b[0] * s + ox, b[1] * s + oy); ctx.stroke();
  }
  ctx.restore();
}
const RIG_MODE_TIPS = { setup: 'Setup: dragging a joint sets its angle and length; Alt+drag hangs a bone from another',
  animate: 'Animate: dragging a joint only turns it; lengths and parents stay put, so posing can\'t change the rig' };
function rigColumn() {
  const sel = () => selIds().length > 1 ? `${selIds().length} bones` : studio.sel;
  const col = h('div', { cls: 'rigcol' },
    h('div', { cls: 'righead' }, h('b', { textContent: 'Rig tools' }), button(':close:', 'Hide the rig tools (show them again from the toolbar\'s rig button or "rig tools" in the palette)', () => { rig.hidden = true; panels(); }, 'mini')),
    h('div', { cls: 'row' }, h('span', { textContent: 'mode' }), seg(['setup', 'animate'], () => rig.mode, v => { rig.mode = v; }, RIG_MODE_TIPS)),
    h('h4', { tip: 'The stance pose: copy it, paste it onto this or another character (bones with the same names), or reset bones' }, 'Pose'),
    h('div', { cls: 'bar' },
      button(':content_copy: copy', 'Copy the stance pose (every bone angle)', copyPose),
      button(':download: paste', 'Paste the copied pose onto every bone it has (undoable)', () => pastePose()),
      button(':select_all: selected', 'Paste the copied pose onto the selected bones only', () => pastePose(selIds())),
      button(':restart_alt: reset', 'Reset the selected bones to the bind pose: the built-in character\'s stance, else the pose when you opened it', () => resetBones())),
    h('h4', { tip: 'What the selection shows' }, 'Selection'),
    h('div', { cls: 'note rigsel' }),
    h('div', { cls: 'bar' },
      toggle(':visibility: isolate', 'Ghost every bone but the selected ones in the character view', () => rig.isolate, v => { rig.isolate = v; }),
      toggle(':timeline: ghost tip', 'Trail the selected bone\'s tip in the preview fight: the arc of its strikes', () => rig.ghost, v => { rig.ghost = v; rig.trail.length = 0; })),
    h('h4', { tip: 'Bone groups: pick a set of bones in one click. By role (every arm, leg, tail… bone) or your own named sets, saved with the character. Click: select it · Shift+click: add it to the selection' }, 'Groups'),
    ...groupRows(),
    h('h4', { tip: 'Constraints on the selected bones, applied in every fight and the preview fight (the still view shows the stance as authored): follow copies another bone\'s turn, reach bends the bone and its parent so its end touches another bone\'s end (IK). Springs still play on top. rig: clear constraints in the palette removes both' }, 'Constraints'),
    ...consRows(),
    h('h4', { tip: 'Skins: named looks for this character, made only of bone drawing settings (thickness, cap, taper, shade, curve, draw layer). Applying one changes how it is drawn, never how it fights' }, 'Skins'),
    ...skinRows());
  const note = col.querySelector('.rigsel');
  reg(note, () => { note.textContent = `${sel()}${rig.clip ? ' · pose copied' : ''}`; });
  col.style.left = `calc(${splitX() / dpr}px - ${RIG_W}px)`;
  return col;
}

// a constraint's target bone (— = off) and its mix, for the selection; a bone never targets itself or (reach) needs a parent
function consRows() {
  const others = () => ['—', ...DEFS[CURRENT].bones.map(b => b.id).filter(id => !selIds().includes(id))];
  const setT = k => v => edit(d => { for (const b of selDefs(d)) if (v === '—') { delete b[k]; delete b[k + 'Mix']; } else b[k] = v; });
  const mix = (k, r, tip) => only(() => !!prop(k), slider(k + ' mix', r, () => prop(k + 'Mix'), v => setProp(k + 'Mix', v), tip));
  return [
    h('div', { cls: 'row', tip: 'Follow: this bone turns as far as the picked bone turns away from its stance, × follow mix. Hair: follow head, mix 0.6. Cape: follow chest, 0.5. Tail counterswing: follow chest, -0.4. — = off' }, h('span', { textContent: 'follow' }),
      pick(others, () => prop('follow') || '—', setT('follow'), {}, String)),
    mix('follow', { min: -1, max: 1, step: 0.05 }, 'How much of the followed bone\'s turn it copies: 1 = all, 0.5 = half, below 0 = the other way.'),
    h('div', { cls: 'row', tip: 'Reach (IK): this bone and its parent bend so its end touches the picked bone\'s end, × reach mix. Staff: handB reaches the staff tip, mix 1. Hand on hip: reach a hip socket, 0.7. Out of reach: the limb stretches toward it. — = off' }, h('span', { textContent: 'reach' }),
      pick(others, () => prop('reach') || '—', setT('reach'), {}, String)),
    mix('reach', { min: 0, max: 1, step: 0.05 }, 'How far toward reaching it: 0 = its own pose, 1 = all the way.'),
  ];
}

// ---------- skins: named sets of bone drawing settings (def.skins[name] = { boneId: { thick, cap, … } }), applied onto the bones.
// procedural only (no images); only drawing fields, so a skin never changes the fight and replays stay valid
const SKIN_KEYS = ['thick', 'cap', 'taper', 'shade', 'curve', 'z'];
function skinOf(def) {
  return Object.fromEntries(def.bones.map(b => [b.id, Object.fromEntries(SKIN_KEYS.filter(k => b[k] !== undefined).map(k => [k, b[k]]))]));
}
// ---------- bone groups: role sets from the rig, named sets in def.groups ({ name: [bone ids] }); selecting only, never drawing or fighting ----------
function roleGroups(ch) { const g = {}; for (const b of ch.bones) if (!b.hidden && b.role) (g[b.role + 's'] ??= []).push(b.id); return g; }
function selectGroup(ids, add) {
  const ch = viewChar(), ok = ids.filter(id => ch.by[id]); if (!ok.length) return;
  const all = add ? [...new Set([...selIds(), ...ok])] : ok;
  studio.sel = all[0]; studio.also = new Set(all.slice(1)); panels();
}
async function saveGroup() {
  const def = DEFS[CURRENT], name = (await askText('Name of the group', 'group' + (Object.keys(def.groups || {}).length + 1), `Saves the ${selIds().length} selected bones as a group you can pick in one click.`))?.trim();
  if (name) edit(d => { (d.groups ??= {})[name] = selIds(); });
}
function deleteGroup(name) { edit(d => { if (d.groups) { delete d.groups[name]; if (!Object.keys(d.groups).length) delete d.groups; } }); }
function groupRows() {
  const wrap = h('div'), fill = () => {
    const pick = (name, ids, tip) => button(name, `${tip} (${ids.length}: ${ids.join(' ')}) · click: select · Shift+click: add to the selection`, e => selectGroup(ids, e.shiftKey), 'mini');
    const own = DEFS[CURRENT].groups || {};
    wrap.replaceChildren(h('div', { cls: 'bar' }, ...Object.entries(roleGroups(viewChar())).map(([n, ids]) => pick(n, ids, `Every ${n.slice(0, -1)} bone`))),
      Object.keys(own).length ? h('div', { cls: 'bar' }, ...Object.entries(own).flatMap(([n, ids]) => [pick(n, ids, `Your group ${n}`),
        button(':close:', `Delete the group ${n} (the bones stay; undoable)`, () => deleteGroup(n), 'mini')])) : h('div', { cls: 'note', textContent: 'no own groups yet' }),
      h('div', { cls: 'bar' }, button(':add: save group', 'Save the selected bones as a named group', saveGroup)));
  };
  reg(wrap, fill); return [wrap];
}
async function saveSkin() {
  const def = DEFS[CURRENT], name = (await askText('Name of the skin', 'skin' + (Object.keys(def.skins || {}).length + 1), 'Saves every bone\'s thickness, cap, taper, shade, curve and draw layer as they are now.'))?.trim();
  if (name) edit(d => { (d.skins ??= {})[name] = skinOf(d); d.skin = name; });
}
// bones the skin doesn't name keep their look; a field the skin doesn't set goes back to the default
function applySkin(name) {
  edit(d => {
    const sk = d.skins?.[name]; if (!sk) return;
    for (const b of d.bones) if (sk[b.id]) { for (const k of SKIN_KEYS) delete b[k]; Object.assign(b, sk[b.id]); }
    d.skin = name;
  });
}
function deleteSkin(name) { edit(d => { delete d.skins?.[name]; if (d.skins && !Object.keys(d.skins).length) delete d.skins; if (d.skin === name) delete d.skin; }); }
function skinRows() {
  const names = () => Object.keys(DEFS[CURRENT].skins || {});
  const list = h('div', { cls: 'bar' });
  reg(list, () => {
    const cur = DEFS[CURRENT].skin, ns = names();
    list.replaceChildren(...ns.map(n => button((n === cur ? ':check: ' : '') + n, `Apply the ${n} skin (undoable) · Alt+click: update it from the bones as they are now`,
      e => e.altKey ? edit(d => { d.skins[n] = skinOf(d); d.skin = n; }) : applySkin(n), 'mini')),
      ...ns.length ? [] : [h('span', { cls: 'note', textContent: 'none yet' })]);
  });
  return [list, h('div', { cls: 'bar' },
    button(':add: save skin', 'Save the bones\' current look as a new skin: style the bones (thick, cap, taper, shade, curve, z), then save. Example: a "heavy" skin with thick 9, square caps, and a "sketch" skin with thick 2, taper 0.6', saveSkin),
    button(':delete: delete', 'Delete the applied skin (the bones keep their current look)', () => DEFS[CURRENT].skin && deleteSkin(DEFS[CURRENT].skin)))];
}

const creatorMode = {
  preview: () => creator.expOn ? null : edLayout().pv,
  clipRects: () => creator.expOn ? cellRects(9, 3, fullArea()).map((r, i) => ({ key: creator.exp.cells[i], r })) : [{ key: 'preview', r: edLayout().pv }],
  split: () => !creator.expOn,
  homePanel: 'bones',
  enter() {
    creator.w = newWorld(previewScen(), {}, 7, previewChars());
    // the changes panel's "built-in" side: the same scenario/opponent, fighting as the matching built-in instead
    const base = CHAR_DEFS[CURRENT];
    creator.diffW = base ? newWorld(previewScen(), {}, 7, [makeCharacter(base), CHARS[creator.opponent] || makeCharacter(base)]) : null;
    creator.diffHeadW = base ? newWorld(diffHeadScen(), {}, 7, [makeCharacter(base), CHARS[CURRENT]]) : null;
    if (creator.expOn) buildExp();
  },
  restart() { creatorMode.enter(); },
  worlds: () => creator.expOn ? creator.exp.cells.map(c => c.w)
    : stageOpen() === 'changes' && creator.headToHead && creator.diffHeadW ? [creator.diffHeadW]
    : stageOpen() === 'changes' && creator.diffW ? [creator.w, creator.diffW] : [creator.w],
  render: creatorRender,
  ctxBar: creatorCtx,
  side: () => creator.expOn ? expPanel() : bodyPanel(),
  overlay: () => creator.expOn ? [] : [...rigOn() ? [rigColumn()] : [],
    ...(panelInit(lay(), creatorMode.homePanel), stageOpen() === 'bones') ? [bonePanelStage(), previewBar('over pvbar pvtop')] : stageOpen() === 'changes' ? [charDiffPanel()] : moveStage() ? [moveStage()()] : [previewBar()]],
  open: ['character', 'body', 'bone', 'stance pose', 'stats', 'random characters'],
  mouse: creatorMouse,
  key: creatorKey,
  hint: () => creator.expOn ? (creator.exp.kind === 'random' ? 'click a cell to keep it' : 'click a cell to breed around it') + ' · Esc back to the editor'
    : (rig.mode === 'animate' ? 'animate: drag a joint to turn it (lengths and parents locked) · ' : '') + 'drag a joint: length + angle · Shift+drag: angle only · Alt+drag onto a joint: hang it from that bone · drag the hip (square): move the waist over the feet · click: select · ⌘click: add to the selection · Del delete · ⌘Z undo',
};
