'use strict';
// ---------- stages: pluggable, procedurally-drawn backgrounds (no image assets) ----------
// draw(ctx, w) runs already inside World.render()'s world-space transform (ctx.transform(s,0,0,s,ox,oy)),
// so everything here is in world coordinates, like the rest of render(); w: the World (cfg, groundY)
const STAGES = {
  plain: { name: 'plain', tip: 'The default: a flat parchment floor and walls.', draw(ctx, w) {
    const cfg = w.cfg, plane = cfg.plane, g = w.groundY;
    ctx.strokeStyle = '#cfc8bb'; ctx.lineWidth = 2;
    if (plane !== '2d') {
      ctx.fillStyle = '#ebe5d9'; ctx.fillRect(-2000, g - ZMAX * ZS, W + 4000, ZMAX * ZS * 2);
      if (plane === 'lanes') for (const l of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(-2000, g + l * LANE * ZS); ctx.lineTo(W + 2000, g + l * LANE * ZS); ctx.stroke(); }
    } else { ctx.beginPath(); ctx.moveTo(-2000, g); ctx.lineTo(W + 2000, g); ctx.stroke(); }
    ctx.fillStyle = '#e4ded2'; ctx.fillRect(-2000, -2000, 2020, 4000); ctx.fillRect(W - 20, -2000, 2000, 4000);
  } },
  dusk: { name: 'dusk', tip: 'A gradient dusk sky over a cooler blue-grey floor.', draw(ctx, w) {
    const cfg = w.cfg, plane = cfg.plane, g = w.groundY;
    const sky = ctx.createLinearGradient(0, -400, 0, g); sky.addColorStop(0, '#e3c3a0'); sky.addColorStop(0.6, '#d7b9c2'); sky.addColorStop(1, '#c7c3d6');
    ctx.fillStyle = sky; ctx.fillRect(-2000, -2000, W + 4000, g + 2000);
    ctx.strokeStyle = '#9a93ab'; ctx.lineWidth = 2;
    if (plane !== '2d') {
      ctx.fillStyle = '#c7c3d6'; ctx.fillRect(-2000, g - ZMAX * ZS, W + 4000, ZMAX * ZS * 2);
      if (plane === 'lanes') for (const l of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(-2000, g + l * LANE * ZS); ctx.lineTo(W + 2000, g + l * LANE * ZS); ctx.stroke(); }
    } else { ctx.beginPath(); ctx.moveTo(-2000, g); ctx.lineTo(W + 2000, g); ctx.stroke(); }
    ctx.fillStyle = '#b7b2c4'; ctx.fillRect(-2000, -2000, 2020, 4000); ctx.fillRect(W - 20, -2000, 2000, 4000);
  } },
  dojo: { name: 'dojo', tip: 'A warm wood floor with a mat edge and a plain horizon band.', draw(ctx, w) {
    const cfg = w.cfg, plane = cfg.plane, g = w.groundY;
    ctx.fillStyle = '#ece3d4'; ctx.fillRect(-2000, -2000, W + 4000, g + 2000);
    ctx.strokeStyle = '#8a6f4e'; ctx.lineWidth = 2;
    if (plane !== '2d') {
      ctx.fillStyle = '#d9b98c'; ctx.fillRect(-2000, g - ZMAX * ZS, W + 4000, ZMAX * ZS * 2);
      if (plane === 'lanes') for (const l of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(-2000, g + l * LANE * ZS); ctx.lineTo(W + 2000, g + l * LANE * ZS); ctx.stroke(); }
    } else { ctx.beginPath(); ctx.moveTo(-2000, g); ctx.lineTo(W + 2000, g); ctx.stroke(); }
    ctx.strokeStyle = '#b89868'; ctx.beginPath(); ctx.moveTo(-2000, g - 6); ctx.lineTo(W + 2000, g - 6); ctx.stroke();
    ctx.fillStyle = '#c9a877'; ctx.fillRect(-2000, -2000, 2020, 4000); ctx.fillRect(W - 20, -2000, 2000, 4000);
  } },
  bridge: { name: 'bridge', tip: 'A stone bridge at full moon: night sky, stars, a pale moon and stone balustrades.', draw(ctx, w) {
    const cfg = w.cfg, plane = cfg.plane, g = w.groundY;
    const sky = ctx.createLinearGradient(0, -400, 0, g); sky.addColorStop(0, '#0e1430'); sky.addColorStop(0.6, '#1c2444'); sky.addColorStop(1, '#2c3252');
    ctx.fillStyle = sky; ctx.fillRect(-2000, -2000, W + 4000, g + 2000);
    ctx.fillStyle = '#eef0ff'; // a fixed star field: deterministic so it doesn't flicker frame to frame
    for (let i = 0; i < 40; i++) { ctx.globalAlpha = 0.3 + (i % 5) * 0.12; ctx.fillRect((i * 137) % (W + 400) - 200, -380 + (i * 71) % 260, 2, 2); }
    ctx.globalAlpha = 1;
    const mx = W * 0.78, my = -300; // full moon with a soft halo
    const halo = ctx.createRadialGradient(mx, my, 10, mx, my, 90); halo.addColorStop(0, 'rgba(233,236,255,.35)'); halo.addColorStop(1, 'rgba(233,236,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(mx, my, 90, 0, 7); ctx.fill();
    ctx.fillStyle = '#eef0f8'; ctx.beginPath(); ctx.arc(mx, my, 34, 0, 7); ctx.fill();
    ctx.fillStyle = '#d7dcef'; ctx.beginPath(); ctx.arc(mx - 10, my - 6, 6, 0, 7); ctx.arc(mx + 8, my + 10, 4, 0, 7); ctx.fill();
    ctx.strokeStyle = '#4a5068'; ctx.lineWidth = 2;
    if (plane !== '2d') {
      ctx.fillStyle = '#5a5f78'; ctx.fillRect(-2000, g - ZMAX * ZS, W + 4000, ZMAX * ZS * 2);
      if (plane === 'lanes') for (const l of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(-2000, g + l * LANE * ZS); ctx.lineTo(W + 2000, g + l * LANE * ZS); ctx.stroke(); }
    } else { ctx.beginPath(); ctx.moveTo(-2000, g); ctx.lineTo(W + 2000, g); ctx.stroke(); }
    ctx.fillStyle = '#6b7088'; ctx.strokeStyle = '#3f4356'; ctx.lineWidth = 2; // stone balustrade posts along the bridge edge
    for (let x = -40; x < W + 60; x += 70) { ctx.fillRect(x - 6, g - 46, 12, 46); ctx.strokeRect(x - 6, g - 46, 12, 46); ctx.beginPath(); ctx.arc(x, g - 46, 7, Math.PI, 0); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#4a4e64'; ctx.fillRect(-2000, -2000, 2020, 4000); ctx.fillRect(W - 20, -2000, 2000, 4000);
  } },
  bamboo: { name: 'bamboo', tip: 'A misty bamboo forest, pale stalks fading into the distance behind darker ones up close.', draw(ctx, w) {
    const cfg = w.cfg, plane = cfg.plane, g = w.groundY;
    const sky = ctx.createLinearGradient(0, -400, 0, g); sky.addColorStop(0, '#dce8d8'); sky.addColorStop(1, '#eef2e4');
    ctx.fillStyle = sky; ctx.fillRect(-2000, -2000, W + 4000, g + 2000);
    const stalks = (n, spacing, top, col, lw) => { // deterministic placement: an index loop, no Math.random (must not flicker)
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      for (let i = 0; i < n; i++) {
        const x = -60 + ((i * spacing + (i % 3) * 23) % (W + 160));
        ctx.beginPath(); ctx.moveTo(x, g + 4); ctx.lineTo(x, top); ctx.stroke();
        for (let s = top + 14; s < g; s += 26) { ctx.beginPath(); ctx.moveTo(x - lw, s); ctx.lineTo(x + lw, s); ctx.stroke(); }
      }
    };
    stalks(10, 95, -260, '#b7c9ac', 5); // misted, distant stalks
    stalks(7, 140, -200, '#6f8f5a', 9); // closer, darker stalks
    ctx.strokeStyle = '#5a6e48'; ctx.lineWidth = 2;
    if (plane !== '2d') {
      ctx.fillStyle = '#8fae78'; ctx.fillRect(-2000, g - ZMAX * ZS, W + 4000, ZMAX * ZS * 2);
      if (plane === 'lanes') for (const l of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(-2000, g + l * LANE * ZS); ctx.lineTo(W + 2000, g + l * LANE * ZS); ctx.stroke(); }
    } else { ctx.beginPath(); ctx.moveTo(-2000, g); ctx.lineTo(W + 2000, g); ctx.stroke(); }
    ctx.fillStyle = '#7fa06a'; ctx.fillRect(-2000, -2000, 2020, 4000); ctx.fillRect(W - 20, -2000, 2000, 4000);
  } },
};

// ---------- props: scenery, placed by a scenario (scen.props: [{type, x, z?}]) ----------
// size: half-width (and collision radius); h: the collidable column's height, from the floor up (generous, so a punch
// or a kick, high or low, both reach it — independent of how tall its own drawing happens to be)
// layer (back/mid/front, default mid): draw order relative to fighters. moveable: sways on a strike, bounces a thrown
// weapon back (a shape opts into the sway with its own `sway` field, in px). breakable: hp, destroyed at 0 (debris).
// bounce: a free body instead of fixed scenery (World.updatePropPhysics) - gravity, floor and wall bounces, rolling
// friction once it settles; a strike or a thrown weapon launches it instead of just making it sway or lose hp.
// All three are independent of each other and of the shapes that draw it (src/shapes.js)
const BASE_PROPS = {
  crate: { size: 20, h: 90, breakable: true, hp: 30, tip: 'A crate: breaks after enough hits', shapes: [
    { kind: 'box', x: -20, y: -48, w: 40, h: 48, col: '#b08a52', stroke: '#7a5c34', lw: 2, cross: true } ] },
  reed: { size: 6, h: 90, moveable: true, tip: 'A reed: bends when struck, never breaks', shapes: [
    { kind: 'line', x1: 0, y1: 0, x2: 0, y2: -44, w: 4, col: '#6a8a4a', sway: 22 } ] },
  spring: { size: 16, h: 90, moveable: true, tip: 'A spring: bounces thrown weapons back', shapes: [
    { kind: 'circle', cx: 0, cy: -4, rx: 16, ry: 6, col: '#c0392b', stroke: '#7a2015', lw: 2 } ] },
  chair: { size: 14, h: 90, breakable: true, hp: 18, tip: 'A chair: breaks after enough hits', shapes: [
    { kind: 'line', x1: -10, y1: -20, x2: -10, y2: 0, w: 4, col: '#8a5a2b' },
    { kind: 'line', x1: 10, y1: -20, x2: 10, y2: 0, w: 4, col: '#8a5a2b' },
    { kind: 'box', x: -12, y: -24, w: 24, h: 6, col: '#a9793f', stroke: '#6b4a26', lw: 2 },
    { kind: 'box', x: -12, y: -54, w: 5, h: 32, col: '#a9793f', stroke: '#6b4a26', lw: 2 },
    { kind: 'box', x: -12, y: -54, w: 24, h: 5, col: '#a9793f', stroke: '#6b4a26', lw: 2 } ] },
  table: { size: 28, h: 90, breakable: true, hp: 26, tip: 'A table: breaks after enough hits', shapes: [
    { kind: 'line', x1: -24, y1: -28, x2: -24, y2: 0, w: 5, col: '#8a5a2b' },
    { kind: 'line', x1: 24, y1: -28, x2: 24, y2: 0, w: 5, col: '#8a5a2b' },
    { kind: 'box', x: -28, y: -34, w: 56, h: 8, col: '#b08a52', stroke: '#7a5c34', lw: 2 } ] },
  door: { size: 8, h: 90, breakable: true, hp: 22, tip: 'A door: breaks after enough hits', shapes: [
    { kind: 'box', x: -16, y: -120, w: 32, h: 120, col: '#8a6238', stroke: '#5c4024', lw: 2, cross: true },
    { kind: 'circle', cx: 10, cy: -60, rx: 3, ry: 3, col: '#d8b84a' } ] },
  window: { size: 10, h: 90, breakable: true, hp: 14, tip: 'A window: breaks after enough hits', shapes: [
    { kind: 'box', x: -18, y: -130, w: 36, h: 46, col: '#bcd9e8', stroke: '#5c4024', lw: 2, cross: true } ] },
  ball: { size: 10, h: 20, bounce: true, tip: 'A ball: bounces and rolls when struck or thrown into - never breaks, never settles for long', shapes: [
    { kind: 'circle', cx: 0, cy: -10, rx: 10, ry: 10, col: '#d35400', stroke: '#7a2e00', lw: 2 } ] },
};
// my props: edits to a built-in, or wholly new ones (same pattern as sounds: myStore -> live table)
const PROP_STORE = 'stick2.props';
const myProps = (() => { try { return JSON.parse(localStorage.getItem(PROP_STORE)) || {}; } catch { return {}; } })();
const PROPS = { ...BASE_PROPS, ...myProps };
function saveProp(name, preset) { myProps[name] = PROPS[name] = preset; saveProps(); }
function resetProp(name) { delete myProps[name]; if (BASE_PROPS[name]) PROPS[name] = { ...BASE_PROPS[name] }; else delete PROPS[name]; saveProps(); }
function renameProp(from, to) { if (!myProps[from] || to === from || PROPS[to]) return; myProps[to] = PROPS[to] = myProps[from]; resetProp(from); }
function saveProps() { try { localStorage.setItem(PROP_STORE, JSON.stringify(myProps)); } catch {} }
function duplicateProp(from) { let n = 1; while (PROPS[from + n]) n++; const name = from + n; saveProp(name, { ...PROPS[from], shapes: cloneShapes(PROPS[from].shapes) }); return name; }
