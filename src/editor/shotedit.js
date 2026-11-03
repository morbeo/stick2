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
    ...rows]);
}
