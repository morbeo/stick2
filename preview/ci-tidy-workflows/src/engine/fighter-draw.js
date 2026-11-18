'use strict';
// Fighter, part 4 of 4: drawing only (never read by the fight). Trails, hit and hurt boxes, the figure itself, the streak warp and the hit flash colour
// the streak teleport's look: the old body as sideways streaks that stretch away and fade (first 35%), then a flash at the new spot
function drawWarp(ctx, f, wf, u) {
  const out = clamp(u / 0.35, 0, 1), col = f.col[0];
  if (out < 1) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineCap = 'round';
    for (const id in wf.P) { const [x, y] = wf.P[id], n = (id.length * 7 + id.charCodeAt(0)) % 5; // a steady spread per joint, no randomness
      ctx.globalAlpha = (1 - out) * 0.8; ctx.lineWidth = 3 * (1 - out) + 0.5;
      ctx.beginPath(); ctx.moveTo(x - wf.dx * out * 10, y); ctx.lineTo(x + wf.dx * out * (40 + n * 14), y + (n - 2) * out * 2); ctx.stroke(); }
    ctx.globalAlpha = 1 - out; drawFigure(ctx, f.ch, wf.P, col, f.col[1], 0, null, null); ctx.restore();
  }
  const fl = clamp((u - 0.3) / 0.35, 0, 1);
  if (fl > 0 && fl < 1) { const P = f.body(), cy = (P.hip?.[1] ?? f.groundY - 60) - 10;
    ctx.save(); ctx.globalAlpha = (1 - fl) * 0.9; ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 3 * (1 - fl) + 1;
    ctx.beginPath(); ctx.ellipse(f.x, cy, 8 + fl * 34, 30 + fl * 50, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }
}
// the hit-flash colour, hotter the longer the combo landing on this fighter runs: white -> yellow -> red
const FLASH_STOPS = [[0, 255, 255, 255], [4, 255, 221, 63], [8, 255, 59, 48]];
function flashCol(combo) {
  const n = Math.max(0, combo - 1);
  let i = 0; while (i < FLASH_STOPS.length - 2 && n >= FLASH_STOPS[i + 1][0]) i++;
  const [n0, r0, g0, b0] = FLASH_STOPS[i], [n1, r1, g1, b1] = FLASH_STOPS[i + 1], t = n1 > n0 ? Math.min(1, (n - n0) / (n1 - n0)) : 1;
  const mix = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${mix(r0, r1)},${mix(g0, g1)},${mix(b0, b1)})`;
}
class FighterDraw {
  recordTrail() {
    const P = this.body();
    this.trail.push(this.ch.tips.map(b => P[b.id]));
    if (this.trail.length > 24) this.trail.shift();
    this.poseHist.push(P); // full-body snapshots for the motionBlur/afterimage looks (drawing only, same P object the frame already built)
    if (this.poseHist.length > 100) this.poseHist.shift();
  }

  // hurtboxes (blue), the held weapon (amber) and the live strike (red), in the pose the collision mode tests
  drawBoxes(ctx) {
    const P = this.c('hitTest') === 'target' ? this.points(this.target) : this.body();
    ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(44,111,176,.22)';
    for (const b of this.ch.bones) if (b.hurt > 0) {
      const e = P[b.id], o = b.shape === 'circle' ? e : P[b.parent || 'hip'];
      ctx.lineWidth = b.hurt * 2; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0] + 0.01, e[1]); ctx.stroke();
    }
    if (this.c('clash') !== 'off') { // the held weapon (amber): it clashes, but isn't hurt
      ctx.strokeStyle = 'rgba(214,140,20,.45)';
      for (const s of this.weaponShapes()) { ctx.lineWidth = s[2] * 2 + this.ch.by[s.id].thick + 2; ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0] + 0.01, s[1][1]); ctx.stroke(); }
    }
    const a = this.action;
    if (a?.m.keys[a.i]?.active) for (const s of this.strikeShapes(a.m)) {
      ctx.strokeStyle = 'rgba(192,57,43,.6)'; ctx.lineWidth = Math.max(3, s[2] * 2);
      ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0] + 0.01, s[1][1]); ctx.stroke();
    }
  }

  draw(ctx, jitter) {
    ctx.save(); ctx.translate(jitter, 0);
    const zk = 1 + this.z * ZK; // depth: lower on screen and bigger toward the camera
    ctx.translate(this.x, this.groundY + this.z * ZS); ctx.scale(zk, zk); ctx.translate(-this.x, -this.groundY);
    drawShadow(ctx, this);

    const n = Math.min(this.c('trail'), this.trail.length - 1), tr = this.trail;
    for (let li = 0; li < this.ch.tips.length; li++) for (let i = 1; i <= n; i++) {
      const a = tr[tr.length - 2 - n + i][li], b = tr[tr.length - 1 - n + i][li];
      ctx.globalAlpha = (i / n) * 0.35; ctx.lineWidth = (i / n) * 5; ctx.strokeStyle = this.col[0];
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const g of this.after) { ctx.globalAlpha = g.t; drawFigure(ctx, this.ch, g.P, this.col[0], this.col[1]); } // teleport after-images
    ctx.globalAlpha = 1;
    const wf = this.warpFx, wu = wf ? wf.t / WARP_T : 1;
    if (wf) drawWarp(ctx, this, wf, wu);
    if (this.c('ghost')) { ctx.globalAlpha = 0.2; drawFigure(ctx, this.ch, this.points(this.target), '#07f', '#07f', -2); ctx.globalAlpha = 1; }
    const P = this.body(), fxs = fxNow(this.ch, this.action), aux = { hist: this.poseHist, vx: this.vx, vy: this.vy };
    drawFx(ctx, P, fxs, this.time, true, aux);
    // the hit flash shifts white -> yellow -> red as the combo landing on this fighter grows, so a long string of hits reads hotter
    if (this.flashT > 0 && this.c('flash')) { const fc = flashCol(this.combo); drawFigure(ctx, this.ch, P, '#111', '#111', 4); drawFigure(ctx, this.ch, P, fc, fc); }
    else if (this.dodgeT > 0) { ctx.globalAlpha = 0.4; drawFigure(ctx, this.ch, P, this.col[0], this.col[1]); ctx.globalAlpha = 1; } // air dodge: see-through
    else if (wu < 1) { // streak teleport: hidden while the old body breaks up, then squeezed thin and snapping out to full width
      const u = clamp((wu - 0.35) / 0.4, 0, 1);
      if (u > 0) { ctx.save(); ctx.translate(this.x, 0); ctx.scale(0.15 + 0.85 * EASE.outBack(u), 1); ctx.translate(-this.x, 0); ctx.globalAlpha = Math.min(1, u * 2);
        drawFigure(ctx, this.ch, P, this.col[0], this.col[1], 0, null, this.mul); ctx.restore(); }
    }
    else drawFigure(ctx, this.ch, P, this.col[0], this.col[1], 0, null, this.growMul() || this.mul);
    if (this.heldProp) { // no held-prop bone (props aren't rigged like a weapon): a small version of it over the head instead
      ctx.save(); ctx.translate(this.x, this.groundY + this.y - 95);
      drawShapes(ctx, PROPS[this.heldProp].shapes, (x, y) => [x * 0.4, y * 0.4], c => c || '#888', { sway: 0 });
      ctx.restore();
    }
    drawFx(ctx, P, fxs, this.time, false, aux);
    if (this.c('boxes')) this.drawBoxes(ctx);
    const a = this.action;
    if (a?.m.keys.some((k, i) => k.unblock && i >= a.i)) for (const id of hitIds(a.m)) if (P[id]) { // unblockable frames coming: the striking limbs glow
      ctx.fillStyle = `rgba(192,57,43,${0.25 + 0.2 * Math.sin(this.time * 40)})`;
      ctx.beginPath(); ctx.arc(P[id][0], P[id][1], 9, 0, 7); ctx.fill();
    }
    if (a?.charge && this.ch.weapon && P.weapon) { // a weapon throw charging: the weapon glows brighter and wider as it charges
      const q = Math.min(1, a.charge / this.c('throwChargeT')), o = P[this.ch.by.weapon.parent], e = P[this.ch.by.weaponTip ? 'weaponTip' : 'weapon'];
      ctx.strokeStyle = `rgba(230,180,34,${0.2 + 0.4 * q})`; ctx.lineWidth = 6 + 10 * q; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
    }
    if (a?.charge && a.m.charge) { // a chargeable move charging: its striking limbs glow brighter as it powers up
      const q = Math.min(1, a.charge / a.m.charge.dur);
      ctx.fillStyle = `rgba(230,180,34,${0.2 + 0.4 * q})`;
      for (const id of hitIds(a.m)) if (P[id]) { ctx.beginPath(); ctx.arc(P[id][0], P[id][1], 6 + 8 * q, 0, 7); ctx.fill(); }
    }
    // health bar and callouts (PARRY, K.O.) over the head (setting hud); hudPos 'top' draws health/stun at the
    // top of the screen instead (World.render), so skip them here to avoid drawing both
    if (!this.c('hud')) return ctx.restore();
    let top = this.groundY; for (const k in P) top = Math.min(top, P[k][1]);
    const hp = this.c('health'), overHead = this.c('hudPos') !== 'top';
    if (overHead && hp > 0) {
      ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.fillRect(this.x - 18, top - 16, 36, 4);
      ctx.fillStyle = this.col[0]; ctx.fillRect(this.x - 18, top - 16, 36 * this.hp / hp, 4);
    }
    const da = this.c('dizzyAt');
    if (overHead && da && this.stunM > 0) { ctx.fillStyle = '#e6b422'; ctx.fillRect(this.x - 18, top - 11, 36 * Math.min(1, this.stunM / da), 2); }
    if (overHead && this.c('superMeter')) { const sa = this.c('superAt'), q = sa > 0 ? Math.min(1, this.power / sa) : 1;
      ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.fillRect(this.x - 18, top - 8, 36, 2);
      ctx.fillStyle = q >= 1 ? '#2d9cdb' : '#5a7a99'; ctx.fillRect(this.x - 18, top - 8, 36 * q, 2); }
    if (this.dizzyT > 0) for (let i = 0; i < 3; i++) { // stars circling over the head
      const a = this.time * 5 + i * 2.1, sx = this.x + Math.cos(a) * 16, sy = top - 4 + Math.sin(a) * 4;
      ctx.fillStyle = '#e6b422'; ctx.beginPath();
      for (let k = 0; k < 10; k++) { const r = k % 2 ? 1.8 : 4.5, q = k * Math.PI / 5 + a; ctx.lineTo(sx + Math.cos(q) * r, sy + Math.sin(q) * r); }
      ctx.fill();
    }
    if (this.labelT > 0) {
      ctx.globalAlpha = Math.min(1, this.labelT * 3); ctx.fillStyle = this.col[0]; ctx.textAlign = 'center';
      ctx.font = 'bold 13px ui-monospace, Menlo, monospace'; ctx.fillText(this.label, this.x, top - 24 - (0.9 - this.labelT) * 20);
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }

    if (this.comboT > 0 && this.comboShown > 1) {
      ctx.globalAlpha = Math.min(1, this.comboT * 3);
      ctx.fillStyle = this.col[0]; ctx.textAlign = 'center';
      ctx.font = `bold ${Math.round(16 * (1 + this.comboPop * 0.8))}px ui-monospace, Menlo, monospace`;
      ctx.fillText(`${this.comboShown} HITS`, this.x, this.groundY - 130);
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }
    ctx.restore();
  }
}
addMethods(Fighter, FighterDraw);
