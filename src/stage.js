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
};

// ---------- props: simple collidable scenery, placed by a scenario (scen.props: [{type, x, z?}]) ----------
// size: half-width (and collision radius); h: the collidable column's height, from the floor up (generous, so a punch
// or a kick, high or low, both reach it — independent of how tall its own drawing happens to be)
// breakable: takes damage from strikes and thrown weapons, destroyed (debris) at 0 hp
// bendable: never damaged or destroyed, just bends briefly where it's struck (bendDir/bendT, set in World.updateProps)
// bouncy: never damaged; a thrown weapon that hits it reflects instead of landing
// draw(ctx, p, w) runs in world space, like STAGES; w: the World (for w.groundY)
const PROPS = {
  crate: { size: 20, h: 90, hp: 30, breakable: true, draw(ctx, p, w) {
    ctx.save(); ctx.translate(p.x, w.groundY - 24); ctx.fillStyle = '#b08a52'; ctx.strokeStyle = '#7a5c34'; ctx.lineWidth = 2;
    ctx.fillRect(-20, -24, 40, 48); ctx.strokeRect(-20, -24, 40, 48);
    ctx.beginPath(); ctx.moveTo(-20, -24); ctx.lineTo(20, 24); ctx.moveTo(20, -24); ctx.lineTo(-20, 24); ctx.stroke();
    ctx.restore();
  } },
  reed: { size: 6, h: 90, bendable: true, draw(ctx, p, w) {
    const bend = (p.bendDir || 0) * Math.min(1, (p.bendT || 0) / 0.08) * 22;
    ctx.save(); ctx.translate(p.x, w.groundY); ctx.strokeStyle = '#6a8a4a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(bend * 0.6, -22, bend, -44); ctx.stroke();
    ctx.restore();
  } },
  spring: { size: 16, h: 90, bouncy: true, draw(ctx, p, w) {
    ctx.save(); ctx.translate(p.x, w.groundY - 4); ctx.fillStyle = '#c0392b'; ctx.strokeStyle = '#7a2015'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 6, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  } },
};
