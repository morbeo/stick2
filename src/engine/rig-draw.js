'use strict';
// ---------- drawing a figure ----------
// back limbs first in the second colour, then the body, then front limbs. extra = added stroke width (outlines)
// tint(bone) overrides the colour per bone (the editors colour-code by role)
// a weapon bone from o (the hand) to e (the tip), in wood and metal unless col gives it one colour
const METAL = '#7f8a93', WOOD = '#9b7653';
function drawWeapon(ctx, b, o, e, col, extra = 0) {
  const l = Math.hypot(e[0] - o[0], e[1] - o[1]) || 1, ux = (e[0] - o[0]) / l, uy = (e[1] - o[1]) / l;
  const toXY = (d, s) => [o[0] + ux * d - uy * s, o[1] + uy * d + ux * s];
  const resolveCol = raw => col || (raw === 'wood' ? WOOD : raw === 'metal' ? METAL : raw);
  drawShapes(ctx, WEAPONS[b.type].shapes, toXY, resolveCol, { len: l }, extra);
}
// mul: a fighter's live per-bone key.thick / key.alpha multipliers (mid-move), or null outside one
function drawFigure(ctx, ch, P, col, back, extra = 0, tint = null, mul = null) {
  ctx.lineCap = ctx.lineJoin = 'round';
  const inSpline = new Set(), SIDES = { b: 0, '': 1, f: 2 };
  const rank = b => (b.z || 0) * 3 + (SIDES[b.side ?? ''] ?? 1), order = ch.bones.map((b, i) => [rank(b), i, b]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map(x => x[2]);
  for (const b of order) if (!inSpline.has(b.id)) {
    const side = b.side ?? '', o = P[b.parent || 'hip'], e = P[b.id];
    if (!o || !e) continue;
    let c = tint ? tint(b) : side === 'b' ? back : col;
    if (b.shade && !tint && !extra) c = mixWhite(c, b.shade);
    if (b.hidden && (b.shape === 'circle' || Math.hypot(e[0] - o[0], e[1] - o[1]) < 0.5)) continue; // a stance's hidden bone (drawn while it shrinks away)
    const a = (b.alpha ?? 1) * (mul?.alpha?.[b.id] ?? 1), thick = b.thick * (mul?.thick?.[b.id] ?? 1);
    if (a < 1) { ctx.save(); ctx.globalAlpha *= a; }
    if (b.shape === 'socket') { if (a < 1) ctx.restore(); continue; }
    if (b.shape === 'circle') { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(e[0], e[1], b.len + extra / 2, 0, 7); ctx.fill(); }
    else if (b.role === 'weapon') drawWeapon(ctx, b, o, e, extra || tint?.(b) ? c : null, extra);
    else if (b.shape === 'spline') {
      const run = splineRun(ch, b); run.slice(1).forEach(k => inSpline.add(k.id));
      ctx.strokeStyle = c; strokeSpline(ctx, [o, ...run.map(k => P[k.id])], thick + extra, run[run.length - 1].thick * (mul?.thick?.[run[run.length - 1].id] ?? 1) + extra);
    } else if (b.shape === 'fill') {
      const pts = [o, ...fillRun(ch, b).map(k => P[k.id]), ...b.fillTo && P[b.fillTo] ? [P[b.fillTo]] : []];
      ctx.fillStyle = b.shade || tint || extra ? c : mixWhite(c, 0.55); ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
      if (thick > 0) { ctx.strokeStyle = c; ctx.lineWidth = thick + extra; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); ctx.stroke(); }
    } else if ((b.taper || b.cap === 'point') && !b.curve) drawTapered(ctx, o, e, thick + extra, b.cap === 'point' ? 0 : thick * (1 - b.taper) + extra, c, b.cap);
    else {
      ctx.lineCap = LINE_CAPS[b.cap] || 'round';
      ctx.strokeStyle = c; ctx.lineWidth = thick + extra; ctx.beginPath(); ctx.moveTo(o[0], o[1]);
      if (b.curve) {
        const dx = e[0] - o[0], dy = e[1] - o[1], l = Math.hypot(dx, dy) || 1;
        const mx = (o[0] + e[0]) / 2 - (dy / l) * b.curve * l, my = (o[1] + e[1]) / 2 + (dx / l) * b.curve * l;
        ctx.quadraticCurveTo(mx, my, e[0], e[1]);
      } else ctx.lineTo(e[0], e[1]);
      ctx.stroke(); ctx.lineCap = 'round';
    }
    if (a < 1) ctx.restore();
  }
}
const LINE_CAPS = { round: 'round', square: 'square', flat: 'butt', point: 'round' };
// a colour (#rgb / #rrggbb) a fraction t of the way to white; anything else (named, rgba) unchanged
function mixWhite(c, t) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c || '');
  if (!m) return c;
  const hx = m[1].length === 3 ? [...m[1]].map(x => x + x).join('') : m[1];
  return '#' + [0, 2, 4].map(i => Math.round(parseInt(hx.slice(i, i + 2), 16) + (255 - parseInt(hx.slice(i, i + 2), 16)) * clamp(t, 0, 1)).toString(16).padStart(2, '0')).join('');
}
// a straight line from o (width w0) to e (width w1) as one filled outline; cap: round ends, square (pushed out by half
// the width) or flat (cut at the joints); point is w1 = 0 with a round start
function drawTapered(ctx, o, e, w0, w1, c, cap = 'round') {
  const dx = e[0] - o[0], dy = e[1] - o[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux, a = Math.atan2(ny, nx);
  ctx.fillStyle = c; ctx.beginPath();
  if (cap === 'round' || cap === 'point' || !cap) {
    ctx.arc(o[0], o[1], w0 / 2, a, a + Math.PI);
    ctx.arc(e[0], e[1], Math.max(0.01, w1 / 2), a + Math.PI, a + 2 * Math.PI);
  } else {
    const k0 = cap === 'square' ? w0 / 2 : 0, k1 = cap === 'square' ? w1 / 2 : 0, p = (q, k, w, s) => [q[0] + ux * k + nx * w / 2 * s, q[1] + uy * k + ny * w / 2 * s];
    for (const [x, y] of [p(o, -k0, w0, 1), p(e, k1, w1, 1), p(e, k1, w1, -1), p(o, -k0, w0, -1)]) ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill();
}
// collect all bones from rootBone down to leaves, as segments relative to rootBone's own position (x, y) at the
// moment of the hit — so World.drawLimbs can just translate by the tracked, physically-updated (x, y) as it falls,
// instead of the segments staying frozen at their world pose forever while only the (unseen) physics moved
function collectLimbSegments(ch, rootBone, P, col) {
  const [ax, ay] = P[rootBone.id];
  const walk = (b, out = []) => {
    const o = P[b.parent || 'hip'], e = P[b.id];
    const thick = b.thick || BONE.thick;
    out.push([o[0] - ax, o[1] - ay, e[0] - ax, e[1] - ay, thick]);
    for (const child of ch.bones.filter(x => x.parent === b.id)) walk(child, out);
    return out;
  };
  return { segs: walk(rootBone), x: ax, y: ay, z: 0, col, t: 0 };
}
