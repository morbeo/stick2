'use strict';
// ---------- shared primitive shapes: props and weapons are drawn from a short list of primitives (line, circle,
// box, polygon) instead of bespoke draw code — the same few shapes, composed differently, can recreate either.
// Each owner defines its own local coordinate space and a toXY(x, y) mapping a primitive's point to the screen:
// a prop's is a plain ground-anchored translate (src/stage.js); a weapon's is distance-along-the-bone and
// perpendicular offset (src/rig.js), so the whole shape rotates and stretches with the live held pose. Every
// primitive is turned into points and transformed through toXY before drawing, so it comes out right either way —
// native ctx.rect/ellipse calls can't do that (they assume the canvas itself is already axis-aligned).
const SHAPE_KINDS = ['line', 'circle', 'box', 'polygon'];
const SHAPE_KIND_TIPS = { line: 'A straight stroke between two points', circle: 'A filled oval (or circle, if its two radii match)',
  box: 'A filled rectangle, optionally with a diagonal cross through it', polygon: 'A filled shape through any number of points, in order' };
// an ellipse as a polygon of points, so it still transforms correctly under rotation (a true ctx.ellipse() can't)
function ellipsePts(cx, cy, rx, ry, n = 16) { return Array.from({ length: n }, (_, i) => { const a = i / n * 7; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; }); }
// a coordinate is usually a plain number; a weapon shape can instead reach for a named live value (its own length,
// so a blade still reaches the tip when the weapon is held at a slightly different stretch than its own len) as a
// string: 'len' (exactly that value) or 'len-4' / 'len+1' (an offset from it) — vars supplies the named values
function resolveNum(v, vars) { if (typeof v === 'number') return v; const m = v.match(/^([a-zA-Z]+)([+-]\d+(?:\.\d+)?)?$/); return (vars[m[1]] ?? 0) + (m[2] ? +m[2] : 0); }
// a primitive's own local points, before toXY: a line is just its two ends, the rest are closed shapes
function shapePts(s, vars) {
  const n = v => resolveNum(v, vars);
  if (s.kind === 'line') return [[n(s.x1), n(s.y1)], [n(s.x2), n(s.y2)]];
  if (s.kind === 'circle') return ellipsePts(n(s.cx), n(s.cy), n(s.rx), n(s.ry ?? s.rx));
  if (s.kind === 'box') { const x = n(s.x), y = n(s.y), w = n(s.w), h = n(s.h); return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
  return s.pts.map(([x, y]) => [n(x), n(y)]); // polygon: already a list of [x, y] points
}
// draws one primitive. toXY(x, y) -> [screenX, screenY] maps its local point to the screen (rotation/stretch and
// all); resolveCol(s.col) turns a primitive's own colour field (a literal, or a owner-specific keyword like
// 'wood' / 'metal') into the string to actually draw with; vars: named live values 'len'-style coordinates can reach
// for; extra: added to every line width (a weapon's active-strike thickening, src/rig.js drawWeapon)
function drawShape(ctx, s, toXY, resolveCol, vars = {}, extra = 0) {
  const col = resolveCol(s.col);
  if (s.kind === 'line') {
    const x1 = resolveNum(s.x1, vars), y1 = resolveNum(s.y1, vars), x2 = resolveNum(s.x2, vars), y2 = resolveNum(s.y2, vars);
    const bend = s.sway ? (vars.sway || 0) * s.sway : 0; // a swaying line (e.g. a reed) curves toward bend instead of running straight
    const p1 = toXY(x1, y1), p2 = toXY(x2 + bend, y2);
    ctx.strokeStyle = col; ctx.lineWidth = (s.w || 2) + extra; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]);
    if (bend) { const cp = toXY(x1 + (x2 - x1) * 0.5 + bend * 0.6, y1 + (y2 - y1) * 0.5); ctx.quadraticCurveTo(cp[0], cp[1], p2[0], p2[1]); } else ctx.lineTo(p2[0], p2[1]);
    ctx.stroke();
    return;
  }
  const pts = shapePts(s, vars).map(([x, y]) => toXY(x, y));
  ctx.beginPath(); pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p[0], p[1])); ctx.closePath();
  if (s.fill !== false) { ctx.fillStyle = col; ctx.fill(); }
  if (s.stroke) { ctx.strokeStyle = resolveCol(s.stroke); ctx.lineWidth = (s.lw || 1) + extra; ctx.stroke(); }
  if (s.kind === 'box' && s.cross) {
    ctx.strokeStyle = s.stroke ? resolveCol(s.stroke) : col; ctx.lineWidth = (s.lw || 2) + extra;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[3][0], pts[3][1]); ctx.stroke();
  }
}
function drawShapes(ctx, shapes, toXY, resolveCol, vars, extra) { for (const s of shapes) drawShape(ctx, s, toXY, resolveCol, vars, extra); }
// a deep-enough copy for editing: a polygon's own pts array (and its [x,y] pairs) must never alias the original,
// or moving a point on a duplicated prop/weapon would silently move it on the one it was copied from too
const cloneShapes = shapes => shapes.map(s => s.kind === 'polygon' ? { ...s, pts: s.pts.map(p => [...p]) } : { ...s });
// a default new primitive of a given kind, small and near the origin so it's visible and editable right away
function newShape(kind) {
  if (kind === 'line') return { kind, x1: 0, y1: 0, x2: 0, y2: -20, w: 3, col: '#333' };
  if (kind === 'circle') return { kind, cx: 0, cy: -10, rx: 8, ry: 8, col: '#888' };
  if (kind === 'box') return { kind, x: -8, y: -20, w: 16, h: 20, col: '#888' };
  return { kind: 'polygon', pts: [[-8, 0], [8, 0], [0, -16]], col: '#888' };
}
