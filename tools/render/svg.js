// a Canvas 2D context that records what is drawn as SVG: the renderer used when there is no Chrome (no dependencies, so no rasterizing)
// Covers the subset the engine draws with (World.render, Fighter.draw, fx). Points are transformed to device space as they are added,
// the way a canvas does; arcs and ellipses become short polylines so a squashed (non-uniform) transform stays right.
// Unknown methods do nothing, unknown properties are kept, so a new drawing call costs a detail, not a crash.
const r1 = v => Math.round(v * 10) / 10;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
// a fill or stroke style as an SVG paint: colours pass through; a gradient or pattern falls back to its first colour
const paint = s => typeof s === 'string' ? s : s?.stops?.[0]?.[1] || '#000';

function svgContext(w, h) {
  const els = [], defs = [];
  let path = [], cur = null, start = null, nclip = 0;
  const st = { m: [1, 0, 0, 1, 0, 0], fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', globalAlpha: 1,
    font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', dash: [], clip: null };
  const stack = [];
  const pt = (x, y) => { const m = st.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; };
  const P = ([x, y]) => `${r1(x)} ${r1(y)}`;
  const scale = () => Math.sqrt(Math.abs(st.m[0] * st.m[3] - st.m[1] * st.m[2])) || 1;
  const add = (cmd, p) => { path.push(cmd + P(p)); cur = p; if (cmd === 'M') start = p; };
  const lineTo = p => cur ? add('L', p) : add('M', p);
  // a stretch of an ellipse (centre, radii, rotation, angles) as points; the count follows its size on screen
  const ellipsePts = (x, y, rx, ry, rot, a0, a1, ccw) => {
    let sweep = a1 - a0;
    if (ccw) { if (sweep > 0) sweep = (sweep % (2 * Math.PI)) - 2 * Math.PI; if (a0 - a1 >= 2 * Math.PI) sweep = -2 * Math.PI; }
    else { if (sweep < 0) sweep = (sweep % (2 * Math.PI)) + 2 * Math.PI; if (a1 - a0 >= 2 * Math.PI) sweep = 2 * Math.PI; }
    const n = Math.max(4, Math.min(64, Math.ceil(Math.abs(sweep) * Math.max(rx, ry) * scale() / 3))), c = Math.cos(rot), s = Math.sin(rot), out = [];
    for (let i = 0; i <= n; i++) { const a = a0 + sweep * i / n, ex = rx * Math.cos(a), ey = ry * Math.sin(a); out.push(pt(x + ex * c - ey * s, y + ex * s + ey * c)); }
    return out;
  };
  const curve = pts => pts.forEach(p => cur ? add('L', p) : add('M', p)); // joined to the current point by a line, as on a canvas
  const common = () => `${st.globalAlpha < 1 ? ` opacity="${r1(st.globalAlpha * 100) / 100}"` : ''}${st.clip ? ` clip-path="url(#${st.clip})"` : ''}`;
  const font = () => { const m = /(\d+(?:\.\d+)?)px/.exec(st.font); return { size: m ? +m[1] : 10, css: st.font }; };
  const ctx = {
    save() { stack.push({ ...st, m: [...st.m], dash: [...st.dash] }); },
    restore() { if (stack.length) Object.assign(st, stack.pop()); },
    transform(a, b, c, d, e, f) { st.m = mul(st.m, [a, b, c, d, e, f]); },
    setTransform(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) { if (typeof a === 'object') ({ a, b, c, d, e, f } = a); st.m = [a, b, c, d, e, f]; },
    resetTransform() { st.m = [1, 0, 0, 1, 0, 0]; },
    getTransform() { const [a, b, c, d, e, f] = st.m; return { a, b, c, d, e, f }; },
    translate(x, y) { st.m = mul(st.m, [1, 0, 0, 1, x, y]); },
    scale(x, y) { st.m = mul(st.m, [x, 0, 0, y, 0, 0]); },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); st.m = mul(st.m, [c, s, -s, c, 0, 0]); },
    beginPath() { path = []; cur = start = null; },
    moveTo(x, y) { add('M', pt(x, y)); },
    lineTo(x, y) { lineTo(pt(x, y)); },
    closePath() { if (path.length) { path.push('Z'); cur = start; } },
    rect(x, y, rw, rh) { add('M', pt(x, y)); add('L', pt(x + rw, y)); add('L', pt(x + rw, y + rh)); add('L', pt(x, y + rh)); path.push('Z'); cur = start; },
    roundRect(x, y, rw, rh) { ctx.rect(x, y, rw, rh); },
    arc(x, y, r, a0, a1, ccw) { curve(ellipsePts(x, y, r, r, 0, a0, a1, ccw)); },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw) { curve(ellipsePts(x, y, rx, ry, rot, a0, a1, ccw)); },
    arcTo(x1, y1) { lineTo(pt(x1, y1)); },
    quadraticCurveTo(cx, cy, x, y) { if (!cur) add('M', pt(cx, cy)); path.push(`Q${P(pt(cx, cy))} ${P(cur = pt(x, y))}`); },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { if (!cur) add('M', pt(c1x, c1y)); path.push(`C${P(pt(c1x, c1y))} ${P(pt(c2x, c2y))} ${P(cur = pt(x, y))}`); },
    fill(rule) { if (path.length) els.push(`<path d="${path.join('')}" fill="${esc(paint(st.fillStyle))}"${rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}${common()}/>`); },
    stroke() {
      if (!path.length) return;
      const k = scale(), dash = st.dash.length ? ` stroke-dasharray="${st.dash.map(d => r1(d * k)).join(' ')}"` : '';
      els.push(`<path d="${path.join('')}" fill="none" stroke="${esc(paint(st.strokeStyle))}" stroke-width="${r1(st.lineWidth * k)}"${st.lineCap !== 'butt' ? ` stroke-linecap="${st.lineCap}"` : ''}${st.lineJoin !== 'miter' ? ` stroke-linejoin="${st.lineJoin}"` : ''}${dash}${common()}/>`);
    },
    // the current path clips what follows (nested in the clip before it) until the restore
    clip() {
      const id = 'c' + ++nclip;
      defs.push(`<clipPath id="${id}"${st.clip ? ` clip-path="url(#${st.clip})"` : ''}><path d="${path.join('') || 'M0 0'}"/></clipPath>`);
      st.clip = id;
    },
    fillRect(x, y, rw, rh) { const p = path; ctx.beginPath(); ctx.rect(x, y, rw, rh); ctx.fill(); path = p; },
    strokeRect(x, y, rw, rh) { const p = path; ctx.beginPath(); ctx.rect(x, y, rw, rh); ctx.stroke(); path = p; },
    clearRect(x, y, rw, rh) { const p = path, f = st.fillStyle; st.fillStyle = '#fff'; ctx.beginPath(); ctx.rect(x, y, rw, rh); ctx.fill(); st.fillStyle = f; path = p; },
    text(s, x, y, how) {
      const f = font(), m = st.m, anchor = { center: 'middle', right: 'end', end: 'end' }[st.textAlign] || 'start';
      const base = { top: 'hanging', hanging: 'hanging', middle: 'central', bottom: 'text-after-edge', ideographic: 'ideographic' }[st.textBaseline];
      // the clip goes on a group around it: on the text itself it would be read in the text's transformed space
      const t = `<text transform="matrix(${m.map((v, i) => i < 4 ? Math.round(v * 1e4) / 1e4 : r1(v)).join(' ')})" x="${r1(x)}" y="${r1(y)}" style="font:${esc(f.css)}" text-anchor="${anchor}"${base ? ` dominant-baseline="${base}"` : ''} ${how}${st.globalAlpha < 1 ? ` opacity="${r1(st.globalAlpha * 100) / 100}"` : ''}>${esc(s)}</text>`;
      els.push(st.clip ? `<g clip-path="url(#${st.clip})">${t}</g>` : t);
    },
    fillText(s, x, y) { ctx.text(s, x, y, `fill="${esc(paint(st.fillStyle))}"`); },
    strokeText(s, x, y) { ctx.text(s, x, y, `fill="none" stroke="${esc(paint(st.strokeStyle))}" stroke-width="${r1(st.lineWidth)}"`); },
    measureText(s) { return { width: String(s).length * font().size * 0.6 }; },
    setLineDash(d) { st.dash = [...d]; },
    getLineDash() { return [...st.dash]; },
    createLinearGradient() { const g = { stops: [], addColorStop: (o, c) => g.stops.push([o, c]) }; return g; },
    createRadialGradient() { return ctx.createLinearGradient(); },
    createPattern() { return null; },
    toString: () => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${els.join('')}</svg>`,
  };
  const styles = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha', 'font', 'textAlign', 'textBaseline'], extra = {};
  const proxy = new Proxy(ctx, {
    get: (t, k) => k in t ? t[k] : styles.includes(k) ? st[k] : k in extra ? extra[k] : typeof k === 'string' ? () => {} : undefined,
    set: (t, k, v) => { if (styles.includes(k)) { if (k === 'globalAlpha' ? Number.isFinite(v) : k !== 'lineWidth' || (Number.isFinite(v) && v > 0)) st[k] = v; } else extra[k] = v; return true; },
  });
  return { ctx: proxy, toString: ctx.toString };
}
module.exports = svgContext;
