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
// a character's look (def.look, drawing only). outline: 'halo' (paper rim, separates it from what's behind), 'ink'
// (dark rim), 'double' (ink rim round a paper gap, the classic flash-fight look), 'glow' (a soft blurred rim in the
// figure's own colour, an energy aura) or 'shadow' (a flat copy dropped down-right). ow: width px, oc: its colour
// (else the style's own), oa: opacity, blur: glow softness px. line: 'dashed' or 'sketch' (loose pencil strokes)
const LOOK_INK = '#111111', LOOK_PAPER = '#f3f0e8';
const LOOK_OUTLINES = ['halo', 'ink', 'double', 'glow', 'shadow'];
function drawOutline(ctx, ch, P, col, lk, mul) {
  const w = lk.ow ?? 2, rim = (c, width) => drawBones(ctx, ch, P, c, c, width, () => c, mul, BRUSHES[lk.line] ? lk.line : null); // the rim follows the brush
  ctx.save(); ctx.globalAlpha *= lk.oa ?? (lk.outline === 'shadow' ? 0.35 : 1);
  if (lk.outline === 'double') { rim(lk.oc || LOOK_INK, 4 * w); rim(LOOK_PAPER, 2 * w); }
  else if (lk.outline === 'glow') { const c = lk.oc || col; ctx.shadowColor = c; ctx.shadowBlur = lk.blur ?? 6; rim(c, 2 * w); }
  else if (lk.outline === 'shadow') { ctx.translate(w + 1, w + 1); rim(lk.oc || LOOK_INK, 0); }
  else rim(lk.oc || (lk.outline === 'ink' ? LOOK_INK : LOOK_PAPER), 2 * w);
  ctx.restore();
}
function drawFigure(ctx, ch, P, col, back, extra = 0, tint = null, mul = null) {
  const lk = !extra && !tint ? ch.look : null;
  if (LOOK_OUTLINES.includes(lk?.outline)) drawOutline(ctx, ch, P, col, lk, mul);
  if (lk?.line === 'dashed') { ctx.save(); ctx.setLineDash([6, 4]); drawBones(ctx, ch, P, col, back, extra, tint, mul); ctx.restore(); }
  else drawBones(ctx, ch, P, col, back, extra, tint, mul, BRUSHES[lk?.line] ? lk.line : null);
  if (lk?.line === 'sketch') drawSketch(ctx, ch, P, col, back);
}
// sketch: two thin pencil strokes per bone, each a little off the bone and running past both joints; the offsets
// come from the bone's id, so a figure's lines stay put from frame to frame instead of crawling
function drawSketch(ctx, ch, P, col, back) {
  const hash = (str, k) => { let x = k * 2654435761; for (const c of str) x = Math.imul(x ^ c.charCodeAt(0), 2246822519) >>> 0; return (x % 1000) / 1000 - 0.5; };
  ctx.save(); ctx.lineCap = 'round';
  for (const b of ch.bones) {
    const o = P[b.parent || 'hip'], e = P[b.id];
    if (!o || !e || b.hidden || b.shape === 'socket' || b.role === 'weapon') continue;
    ctx.strokeStyle = (b.side ?? '') === 'b' ? back : col;
    if (b.shape === 'circle') {
      for (const k of [1, 2]) { ctx.globalAlpha = 0.7; ctx.lineWidth = 1.2; ctx.beginPath();
        ctx.ellipse(e[0] + hash(b.id, k) * 5, e[1] + hash(b.id, k + 4) * 5, b.len + 3 + hash(b.id, k + 8) * 4, b.len + 3 + hash(b.id, k + 9) * 4, hash(b.id, k + 2), 0.3, 6.5); ctx.stroke(); }
      continue;
    }
    const dx = e[0] - o[0], dy = e[1] - o[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, w = (b.thick || 3) / 2 + 1.5;
    for (const k of [1, 2, 3]) { // one stroke each side of the bone, just clear of it, and one across it
      const s = k === 3 ? hash(b.id, k) * w : (k === 1 ? 1 : -1) * (w + 1 + Math.abs(hash(b.id, k)) * 4), s1 = s + hash(b.id, k + 9) * 4;
      const over0 = 4 + hash(b.id, k + 3) * 6, over1 = 4 + hash(b.id, k + 6) * 6;
      ctx.globalAlpha = 0.7; ctx.lineWidth = 1.2; ctx.beginPath();
      ctx.moveTo(o[0] - ux * over0 - uy * s, o[1] - uy * over0 + ux * s);
      ctx.lineTo(e[0] + ux * over1 - uy * s1, e[1] + uy * over1 + ux * s1); ctx.stroke();
    }
  }
  ctx.restore();
}
// brush: a line style that draws each straight bone as its own filled stroke (strokeBrush) instead of a plain line
function drawBones(ctx, ch, P, col, back, extra = 0, tint = null, mul = null, brush = null) {
  ctx.lineCap = ctx.lineJoin = 'round';
  const inSpline = new Set(), SIDES = { b: 0, '': 1, f: 2 };
  const rank = b => (b.z || 0) * 3 + (SIDES[b.side ?? ''] ?? 1), order = ch.bones.map((b, i) => [rank(b), i, b]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map(x => x[2]);
  for (const b of order) if (!inSpline.has(b.id)) {
    const side = b.side ?? '', o = P[b.parent || 'hip'], e = P[b.id];
    if (!o || !e) continue;
    let c = tint ? tint(b) : side === 'b' ? back : col;
    if (b.shade && !tint && !extra) c = mixWhite(c, b.shade);
    if (b.hidden && (b.shape === 'circle' ? !(mul?.r?.[b.id] > 0.3) : Math.hypot(e[0] - o[0], e[1] - o[1]) < 0.5)) continue; // a stance's hidden bone (drawn while it shrinks away)
    const a = (b.alpha ?? 1) * (mul?.alpha?.[b.id] ?? 1), thick = b.thick * (mul?.thick?.[b.id] ?? 1);
    if (a < 1) { ctx.save(); ctx.globalAlpha *= a; }
    if (b.shape === 'socket') { if (a < 1) ctx.restore(); continue; }
    if (b.shape === 'circle') { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(e[0], e[1], (mul?.r?.[b.id] ?? b.len) + extra / 2, 0, 7); ctx.fill(); }
    else if (b.role === 'weapon') drawWeapon(ctx, b, o, e, extra || tint?.(b) ? c : null, extra);
    else if (b.shape === 'spline') {
      const run = splineRun(ch, b); run.slice(1).forEach(k => inSpline.add(k.id));
      ctx.strokeStyle = c; strokeSpline(ctx, [o, ...run.map(k => P[k.id])], thick + extra, run[run.length - 1].thick * (mul?.thick?.[run[run.length - 1].id] ?? 1) + extra);
    } else if (b.shape === 'fill') {
      const pts = [o, ...fillRun(ch, b).map(k => P[k.id]), ...b.fillTo && P[b.fillTo] ? [P[b.fillTo]] : []];
      ctx.fillStyle = b.shade || tint || extra ? c : mixWhite(c, 0.55); ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
      if (thick > 0) { ctx.strokeStyle = c; ctx.lineWidth = thick + extra; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); ctx.stroke(); }
    } else if (brush && !b.curve) strokeBrush(ctx, o, e, thick + extra, c, brush, b.id, b.taper || (b.cap === 'point' ? 1 : 0));
    else if ((b.taper || b.cap === 'point') && !b.curve) drawTapered(ctx, o, e, thick + extra, b.cap === 'point' ? 0 : thick * (1 - b.taper) + extra, c, b.cap);
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
// brush line styles: a width profile along the stroke (t 0..1 from the joint out) and a sideways wobble.
// brush: swells in the middle and thins to soft points, like a loaded ink brush; calligraphy: a flat nib held at
// 45°, so the width follows the stroke's direction (thick across the nib, hairline along it); hand: a slightly shaky
// pen line, its width and path wandering a little. All seeded by the bone id, so a line never crawls between frames
const BRUSHES = {
  brush: { width: (t, a) => 0.3 + 0.95 * Math.sin(Math.PI * t) ** 0.7, wob: 0 },
  calligraphy: { width: (t, a) => 0.15 + 1.05 * Math.abs(Math.sin(a - Math.PI / 4)), wob: 0 },
  hand: { width: (t, a, n) => 0.93 + 0.14 * n, wob: 1.6, caps: true }, // wob: px, the same under an outline
};
function strokeBrush(ctx, o, e, w, c, style, id, taper = 0) {
  const B = BRUSHES[style], dx = e[0] - o[0], dy = e[1] - o[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, a = Math.atan2(dy, dx);
  let seed = 7; for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) % 10007;
  const noise = t => Math.sin(t * 3.3 + seed) * 0.65 + Math.sin(t * 6.1 + seed * 1.7) * 0.35, n = Math.max(4, Math.min(16, Math.round(l / 4)));
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, ww = Math.max(0.3, w * B.width(t, a, noise(t)) * (1 - taper * t)) / 2, off = B.wob * noise(t + 0.5) * Math.sin(Math.PI * t);
    const x = o[0] + dx * t - uy * off, y = o[1] + dy * t + ux * off;
    L.push([x - uy * ww, y + ux * ww]); R.push([x + uy * ww, y - ux * ww]);
  }
  ctx.fillStyle = c; ctx.beginPath();
  [...L, ...R.reverse()].forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
  if (B.caps) for (const [p, k] of [[o, 0], [e, 1]]) { ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(0.3, w * B.width(k, a, noise(k)) * (1 - taper * k)) / 2, 0, 7); ctx.fill(); }
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
