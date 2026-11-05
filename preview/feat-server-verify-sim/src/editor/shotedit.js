'use strict';
// ---------- fx edit (animate): a shot's parts shown where the shot leaves the striking limbs, dragged into place, and listed
// in the shot rows. Hitting parts are red and dashed, cosmetic ones grey and dotted; the green arrow is its launch speed and angle.
// Parts live in move field shot.parts (effects.js); a move without them edits a copy of its one default ball ----------
const shotParts = () => curMove().shot?.parts || [corePart(curMove().shot?.size ?? 12)];
const setParts = (parts, key = null) => setMove('shot', { ...curMove().shot, parts }, key);
const setPart = (i, patch, key = null) => setParts(shotParts().map((p, j) => j === i ? { ...p, ...patch } : p), key);
const fxEditOn = () => !!anim.fxEdit && curMove().keys.some(k => k.shoot);
// the shot's centre on screen: between the striking limbs in the pose at the playhead (where Fighter.shoot fires it from)
function shotOrigin(f) {
  const ps = hitIds(curMove()).map(id => f.P[id]).filter(Boolean);
  return ps.length ? [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length] : [f.o[0] + 30 * f.s, f.o[1] - 60 * f.s];
}
// each part's grab handles on screen: its centre (and a capsule's far end)
function partHandles(f) {
  const [ox, oy] = shotOrigin(f), s = f.s;
  return shotParts().flatMap((p, i) => [{ i, end: false, x: ox + (p.dx || 0) * s, y: oy + (p.dy || 0) * s, r: (p.r ?? 12) * s },
    ...p.shape === 'capsule' ? [{ i, end: true, x: ox + (p.dx2 || 0) * s, y: oy + (p.dy2 || 0) * s, r: (p.r ?? 12) * s }] : []]);
}
function drawShotGizmo(f) {
  if (!fxEditOn()) return;
  const [ox, oy] = shotOrigin(f), s = f.s, sh = curMove().shot || {}, look = sh.look || 'ki', t = performance.now() / 1000;
  ctx.save(); ctx.globalAlpha = 0.6; ctx.translate(ox, oy); ctx.scale(s, s); // the shot itself, as it will look as it leaves (see-through: the figure stays readable)
  for (const p of shotParts()) drawShotPart(ctx, p, look, 1, t, 1);
  ctx.restore();
  ctx.save(); ctx.lineWidth = 1.5 * dpr;
  shotParts().forEach((p, i) => {
    const x = ox + (p.dx || 0) * s, y = oy + (p.dy || 0) * s, r = (p.r ?? 12) * s, hits = p.hits !== false, on = anim.fxPart === i;
    ctx.strokeStyle = hits ? '#c0392b' : '#888'; ctx.setLineDash(hits ? [5 * dpr, 3 * dpr] : [2 * dpr, 3 * dpr]); ctx.lineWidth = (on ? 2.5 : 1.5) * dpr;
    ctx.beginPath();
    if (p.shape === 'capsule') { const x2 = ox + (p.dx2 || 0) * s, y2 = oy + (p.dy2 || 0) * s, a = Math.atan2(y2 - y, x2 - x);
      ctx.arc(x, y, r, a + Math.PI / 2, a - Math.PI / 2); ctx.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2); ctx.closePath(); }
    else ctx.arc(x, y, r, 0, 7);
    ctx.stroke(); ctx.setLineDash([]);
    text(`${p.name || 'part ' + (i + 1)} · ${hits ? 'hits' : 'cosmetic'}`, x + r + 4 * dpr, y - r, hits ? '#c0392b' : '#888', 11);
  });
  for (const hd of partHandles(f)) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#555'; ctx.beginPath(); ctx.arc(hd.x, hd.y, 4 * dpr, 0, 7); ctx.fill(); ctx.stroke(); }
  const sp = (sh.speed ?? 360) * 0.15 * s, ang = (sh.angle || 0) * Math.PI / 180, ex = ox + Math.cos(ang) * sp, ey = oy - Math.sin(ang) * sp; // launch: speed and angle
  ctx.strokeStyle = '#1a8a4a'; ctx.fillStyle = '#1a8a4a'; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 8 * dpr * Math.cos(ang - 0.4), ey + 8 * dpr * Math.sin(ang - 0.4)); ctx.lineTo(ex - 8 * dpr * Math.cos(ang + 0.4), ey + 8 * dpr * Math.sin(ang + 0.4)); ctx.fill();
  text(`speed ${sh.speed ?? 360}`, ex + 6 * dpr, ey + 4 * dpr, '#1a8a4a', 11);
  ctx.restore();
}
// the handle under the pointer (an end before a centre, the nearest first), or null
function pickShotPart(x, y) {
  if (!fxEditOn()) return null;
  let best = null, bd = 10 * dpr;
  for (const hd of partHandles(anFrame())) { const d = Math.hypot(hd.x - x, hd.y - y); if (d < bd || (d < hd.r && !best)) { bd = Math.min(bd, d); best = hd; } }
  return best;
}
// drag: the part (or a capsule's end) follows the pointer, in the character's own units, whole numbers
function dragShotPart(hd, x, y) {
  const f = anFrame(), [ox, oy] = shotOrigin(f), dx = Math.round((x - ox) / f.s), dy = Math.round((y - oy) / f.s);
  setPart(hd.i, hd.end ? { dx2: dx, dy2: dy } : { dx, dy }, 'shot.part:' + hd.i + hd.end);
}
// the parts list under the shot rows: one block per part, then add
function shotPartRows() {
  const rows = shotParts().map((p, i) => h('div', { cls: 'fold sub' },
    h('div', { cls: 'row', tip: 'A part of the shot: its shape, and whether it hits (cosmetic parts are only drawn)' }, h('span', { textContent: p.name || 'part ' + (i + 1) }), h('span', { cls: 'bar' },
      seg(Object.keys(PART_SHAPES), () => shotParts()[i]?.shape || 'circle', v => setPart(i, v === 'capsule' ? { shape: v, dx2: (p.dx || 0) + 30, dy2: p.dy || 0 } : { shape: v, dx2: undefined, dy2: undefined }), PART_SHAPES),
      toggle('hits', 'On: this part hits fighters and clashes with other shots. Off: cosmetic, drawn only', () => shotParts()[i]?.hits !== false, v => setPart(i, { hits: v ? true : false })),
      button(':edit: edit', 'Show the parts on the figure to drag them (fx edit)', () => { anim.fxEdit = true; anim.fxPart = i; panels(); }),
      button(':delete:', 'Delete this part (a shot keeps at least one)', () => { const ps = shotParts(); if (ps.length > 1) setParts(ps.filter((_, j) => j !== i)); }))),
    slider('x', { min: -60, max: 60, step: 1 }, () => shotParts()[i]?.dx || 0, v => setPart(i, { dx: v }, 'shot.dx' + i), 'Forward (+) or back from the shot\'s centre (px); flips with facing'),
    slider('y', { min: -60, max: 60, step: 1 }, () => shotParts()[i]?.dy || 0, v => setPart(i, { dy: v }, 'shot.dy' + i), 'Down (+) or up from the shot\'s centre (px)'),
    slider('size', { min: 2, max: 60, step: 1 }, () => shotParts()[i]?.r ?? 12, v => setPart(i, { r: v }, 'shot.r' + i), 'Radius (px); a capsule\'s half-thickness'),
    ...p.shape === 'capsule' ? [slider('to x', { min: -120, max: 120, step: 1 }, () => shotParts()[i]?.dx2 || 0, v => setPart(i, { dx2: v }, 'shot.dx2' + i), 'The capsule\'s far end, forward (px)'),
      slider('to y', { min: -120, max: 120, step: 1 }, () => shotParts()[i]?.dy2 || 0, v => setPart(i, { dy2: v }, 'shot.dy2' + i), 'The capsule\'s far end, down (px)')] : []));
  return subFold(':grain: shot parts', [
    h('div', { cls: 'row', tip: 'Edit the parts on the figure: drag a part to move it, a capsule\'s far end to aim it' }, h('span', { textContent: '' }), h('span', { cls: 'bar' },
      toggle(':auto_awesome: fx edit', 'Show the shot\'s parts on the figure where it leaves the striking limbs, to drag them (palette: fx edit)', () => !!anim.fxEdit, v => { anim.fxEdit = v; panels(); }),
      button(':add: part', 'Add a part: a cosmetic glow around the centre to start with', () => setParts([...shotParts(), { name: 'part ' + (shotParts().length + 1), shape: 'circle', dx: 0, dy: 0, r: (curMove().shot?.size ?? 12) * 2, hits: false }])))),
    ...rows,
    shotSpecialRows()]);
}
const SHOT_SPARKS = ['hit', 'heavy', 'slash', 'blunt', 'impact', 'explosion']; // the spark kinds a shot can leave (World.spark)
// special properties of the whole shot (move field shot): how it behaves, not how it looks
const setShot = (k, v, key = null) => setMove('shot', { ...curMove().shot, [k]: v }, key);
function shotSpecialRows() {
  return subFold(':auto_awesome: shot special', [
    h('div', { cls: 'row', tip: 'Special properties of the shot as a whole' }, h('span', { textContent: 'special' }), h('span', { cls: 'bar' },
      toggle('unblockable', EFFECT_PROPS.unblockable, () => !!curMove().shot?.unblockable, v => setShot('unblockable', v || undefined)),
      toggle('pass shots', EFFECT_PROPS.noClash, () => !!curMove().shot?.noClash, v => setShot('noClash', v || undefined)),
      toggle('reflectable', EFFECT_PROPS.reflect, () => curMove().shot?.reflect !== false, v => setShot('reflect', v ? undefined : false)))),
    ...[['hitSpark', 'on hit'], ['endSpark', 'on end']].map(([k, label]) => h('div', { cls: 'row', tip: EFFECT_PROPS[k] }, h('span', { textContent: label }),
      seg(['', ...SHOT_SPARKS], () => curMove().shot?.[k] || '', v => setShot(k, v || undefined), { '': 'No extra spark', ...Object.fromEntries(SHOT_SPARKS.map(n => [n, SPARK_TIPS[n]])) }, v => v || ':block:'))),
    slider('grow', { min: 0.2, max: 4, step: 0.1 }, () => curMove().shot?.grow ?? 1, v => setShot('grow', v === 1 ? undefined : v, 'shot.grow'), EFFECT_PROPS.grow),
    slider('homing', { min: 0, max: 360, step: 10 }, () => curMove().shot?.homing ?? 0, v => setShot('homing', v || undefined, 'shot.homing'), EFFECT_PROPS.homing),
    slider('split', { min: 0, max: 8, step: 1 }, () => curMove().shot?.split ?? 0, v => setShot('split', v || undefined, 'shot.split'), EFFECT_PROPS.split),
    ...curMove().shot?.split ? [slider('split spread', { min: 0, max: 360, step: 15 }, () => curMove().shot?.splitSpread ?? 90, v => setShot('splitSpread', v === 90 ? undefined : v, 'shot.splitSpread'), EFFECT_PROPS.splitSpread)] : []]);
}

// ---------- beam parts: stretches along the beam (from / to: 0 the muzzle … 1 its far end), each a width multiplier and hits on/off ----------
const beamParts = () => curMove().beam?.parts || [{ name: 'core', from: 0, to: 1, w: 1, hits: true }];
const setBeamParts = (parts, key = null) => setMove('beam', { ...curMove().beam, parts }, key);
const setBeamPart = (i, patch, key = null) => setBeamParts(beamParts().map((p, j) => j === i ? { ...p, ...patch } : p), key);
function beamPartRows() {
  const rows = beamParts().map((p, i) => h('div', { cls: 'fold sub' },
    h('div', { cls: 'row', tip: 'A stretch of the beam, and whether it hits (cosmetic stretches only glow)' }, h('span', { textContent: p.name || 'part ' + (i + 1) }), h('span', { cls: 'bar' },
      toggle('hits', 'On: this stretch hits fighters. Off: cosmetic, a glow only', () => beamParts()[i]?.hits !== false, v => setBeamPart(i, { hits: v ? true : false })),
      button(':delete:', 'Delete this stretch (a beam keeps at least one)', () => { const ps = beamParts(); if (ps.length > 1) setBeamParts(ps.filter((_, j) => j !== i)); }))),
    slider('from', { min: 0, max: 1, step: 0.05 }, () => beamParts()[i]?.from || 0, v => setBeamPart(i, { from: v }, 'beam.from' + i), 'Where the stretch starts: 0 at the muzzle, 1 at the beam\'s far end'),
    slider('to', { min: 0, max: 1, step: 0.05 }, () => beamParts()[i]?.to ?? 1, v => setBeamPart(i, { to: v }, 'beam.to' + i), 'Where the stretch ends: 1 at the beam\'s far end'),
    slider('width', { min: 0.2, max: 4, step: 0.1 }, () => beamParts()[i]?.w ?? 1, v => setBeamPart(i, { w: v }, 'beam.w' + i), 'Width, times the beam\'s width')));
  return subFold(':grain: beam parts', [
    h('div', { cls: 'row', tip: 'Stretches of the beam: hit only at the tip, or add a wide cosmetic glow' }, h('span', { textContent: '' }), h('span', { cls: 'bar' },
      button(':add: part', 'Add a stretch: a wide cosmetic glow along the whole beam to start with', () => setBeamParts([...beamParts(), { name: 'part ' + (beamParts().length + 1), from: 0, to: 1, w: 2.5, hits: false }])),
      button('tip only', 'Make only the far end hit: the beam becomes a cosmetic line with a hitting tip', () => setBeamParts([{ name: 'line', from: 0, to: 1, w: 0.6, hits: false }, { name: 'tip', from: 0.85, to: 1, w: 1.4, hits: true }])))),
    ...rows]);
}

// ---------- animate side panel tabs: move, key, effect, or all of them one under the other ----------
const ANIM_TABS = { move: 'The move: strike, input, height, what happens on hit', key: 'The selected key: pose timing, easing, flags, key effects',
  effect: 'What the special move puts into the world: its shot (parts, specials) and its beam', all: 'Every section, one under the other' };
function animTab(v) { anim.sideTab = v; try { localStorage.setItem('stick2.animTab', v); } catch {}
  if (v !== 'all') { lay().fold[app.mode + ':' + v] = false; saveLay(); } // a tab shows its section unfolded
  panels(); }
try { anim.sideTab = localStorage.getItem('stick2.animTab') || 'all'; } catch { anim.sideTab = 'all'; }
const animTabs = t => h('div', { cls: 'bar sidetabs' }, seg(Object.keys(ANIM_TABS), () => t, animTab, ANIM_TABS, k => k));
function effectPanel() {
  const title = heading('Effect', 'What this special move puts into the world: a shot (a shoot key) and a beam (a beam key). Parts say which pieces hit; specials how it behaves. fx edit shows the shot on the figure.');
  title.dataset.fold = 'effect';
  const m = curMove(), shoots = m.keys.some(k => k.shoot), beams = m.keys.some(k => k.beam);
  const add = (flag, label, tip) => button(label, tip, () => { edit(def => { def.moves[anim.move].keys[anim.key][flag] = true; }); panels(); });
  return [title,
    ...!shoots || !beams ? [h('div', { cls: 'row', tip: 'Give the move an effect: the selected key fires it (the dopesheet\'s effect rows move it to another key)' }, h('span', { textContent: 'add' }), h('span', { cls: 'bar' },
      ...!shoots ? [add('shoot', ':add: shot', 'Fire a shot from the selected key')] : [], ...!beams ? [add('beam', ':add: beam', 'Hold out a beam from the selected key')] : []))] : [],
    ...effectRows(),
    ...beams ? [beamPartRows()] : []];
}
