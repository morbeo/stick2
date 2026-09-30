'use strict';
// ---------- world: one self-contained fight (the grid runs nine of them side by side) ----------
const W = 800, H = 450, GROUND = 360;
const INK = ['#222', '#8a8580'], RED = ['#c0392b', '#e0998f'];
const NOIN = { left: false, right: false, down: false, jump: false, punch: false, kick: false };
const HIST = 240;

class World {
  // over: config overrides on top of the live CFG. scen: { a, b, ax?, bx?, period? } (see brain.js)
  constructor(scen, over = {}, seed = 1) {
    Object.assign(this, { scen, over, seed, groundY: GROUND, loop: true });
    this.cfg = Object.assign(Object.create(CFG), over);
    this.reset();
  }
  reset() {
    const s = this.scen, scripted = Array.isArray(s.a);
    Object.assign(this, { rand: makeRand(this.seed), parts: [], trauma: 0, zoom: 0, slowT: 0, T: 0, simT: 0,
      frozenT: 0, hits: 0, freezes: [], victim: null, done: false, bank: this.cfg.hitstopBudget,
      hist: { tgt: [], disp: [], vx: [], y: [] } });
    this.a = new Fighter(this, s.ax ?? (scripted ? 330 : 300), 1, INK, CHARS.stick);
    this.b = new Fighter(this, s.bx ?? (scripted ? 375 : 500), -1, RED, CHARS.stick);
    this.fighters = [this.a, this.b];
    this.ctl = [makeCtl(s.a, this), makeCtl(s.b, this)];
    this.cam = (this.a.x + this.b.x) / 2;
  }
  get frozen() { return this.fighters.some(f => f.freeze > 0); }

  // one frame of wall time; inp = the human's input for this frame (edges included)
  advance(raw, inp) {
    if (this.done) return;
    const slow = this.slowT > 0 && !this.frozen; // finisher slow-mo starts once the freeze is over
    if (slow) this.slowT -= raw;
    const dt = raw * this.cfg.timeScale * (slow ? 0.3 : 1);
    if (dt <= 0) return;
    // fixed-size substeps (<= 1/120 s) keep springs and physics identical at any refresh rate
    const n = Math.ceil(dt * 120);
    for (let i = 0; i < n && !this.done; i++) this.step(dt / n, i ? { ...inp, jump: false, punch: false, kick: false } : inp);
    for (const f of this.fighters) if (f.freeze <= 0) f.recordTrail();
    const h = this.hist, j = this.cfg.scope;
    h.tgt.push(this.a.target[j]); h.disp.push(this.a.disp[j]); h.vx.push(this.a.vx); h.y.push(this.a.y);
    if (h.tgt.length > HIST) for (const k in h) h[k].shift();
  }

  step(h, inp) {
    const cfg = this.cfg;
    this.T += h; this.simT += h;
    this.trauma = Math.max(0, this.trauma - h * 1.6);
    this.zoom *= Math.exp(-h * 10);
    this.bank = Math.min(cfg.hitstopBudget, this.bank + h * cfg.hitstopBudget);
    if (this.frozen) this.frozenT += h;
    this.updateParticles(h);

    const [a, b] = this.fighters;
    const ins = this.ctl.map((c, i) => !c ? NOIN : c === 'human' ? inp : c.input(this.fighters[i], this.fighters[1 - i], h));
    this.fighters.forEach((f, i) => f.bufferInput(ins[i]));
    this.fighters.forEach((f, i) => {
      if (f.freeze > 0) f.freeze -= h; // hit stop: this fighter sits out the substep
      else f.update(h, ins[i], this.fighters[1 - i]);
    });
    // push apart (unless someone is knocked down), then face each other
    const d = b.x - a.x;
    if (Math.abs(d) < 38 && Math.abs(a.y - b.y) < 60 && !a.kd && !b.kd) {
      const push = (38 - Math.abs(d)) / 2 * (Math.sign(d) || 1);
      a.x -= push; b.x += push;
    }
    for (const [f, o] of [[a, b], [b, a]])
      if (!f.action && f.free && f.grounded) f.dir = Math.sign(o.x - f.x) || f.dir;

    const p = this.scen.period;
    if (p && this.simT >= p) { if (this.loop) this.reset(); else this.done = true; }
  }

  // ---------- juice ----------
  onHit(att, vic, pt, m) {
    const cfg = this.cfg;
    vic.takeHit(att, m);
    const fin = vic.kd === 'fly', power = m.power * (fin ? cfg.hitstopFin : 1);
    // freeze shrinks along a combo, and a budget caps total frozen time so long strings don't turn to stop-motion
    const want = cfg.hitstop * power * cfg.hitstopDecay ** (vic.combo - 1);
    let hs = want;
    if (cfg.hitstopBudget > 0) { hs = Math.min(hs, this.bank); this.bank -= hs; }
    vic.freeze = hs; att.freeze = hs * cfg.hitstopAtk;
    this.freezes.push({ hs, want, fin });
    if (this.freezes.length > 12) this.freezes.shift();
    this.hits++;
    this.trauma = Math.min(1, this.trauma + 0.3 * power);
    this.zoom += cfg.zoomPunch * power;
    if (fin && cfg.slowmo) this.slowT = 0.35;
    this.victim = vic;
    if (cfg.sparks > 0) {
      this.parts.push({ t: 'ring', x: pt[0], y: pt[1], life: 0.16, max: 0.16 });
      for (let i = 0; i < cfg.sparks * power; i++) {
        const a = this.rand(-0.8, 0.8) + (att.dir > 0 ? 0 : Math.PI), s = this.rand(250, 700), life = this.rand(0.12, 0.3);
        this.parts.push({ t: 'spark', x: pt[0], y: pt[1], vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life });
      }
    }
  }
  dust(x, y, imp) {
    if (this.cfg.squash <= 0) return;
    for (let i = 0; i < 3 + imp * 6; i++) {
      const life = this.rand(0.25, 0.45);
      this.parts.push({ t: 'dust', x: x + this.rand(-8, 8), y: y - 2, vx: this.rand(-1, 1) * 140 * imp, vy: -this.rand(10, 50), r: this.rand(2, 5), life, max: life });
    }
  }
  updateParticles(dt) {
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if ((p.life -= dt) <= 0) { parts.splice(i, 1); continue; }
      if (p.vx !== undefined) {
        const drag = Math.exp(-(p.t === 'spark' ? 6 : 4) * dt);
        p.vx *= drag; p.vy *= drag; p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }
  }
  drawParticles(ctx) {
    for (const p of this.parts) {
      const k = p.life / p.max;
      if (p.t === 'spark') {
        ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 2.5 * k;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
      } else if (p.t === 'ring') {
        ctx.strokeStyle = '#222'; ctx.lineWidth = 3 * k;
        ctx.beginPath(); ctx.arc(p.x, p.y, 6 + (1 - k) * 36, 0, 7); ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(120,110,100,${0.35 * k})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (2 - k), 0, 7); ctx.fill();
      }
    }
  }

  // draw into rect r (device px). full = whole arena, otherwise a closer camera following the fight
  render(ctx, r, full) {
    const cfg = this.cfg, vw = full ? W : 420, vh = vw * H / W;
    const mid = (this.a.x + this.b.x) / 2;
    this.cam += (clamp(mid, vw / 2 - 20, W - vw / 2 + 20) - this.cam) * 0.15;
    const cx = full ? W / 2 : this.cam, cy = full ? H / 2 : this.groundY - vh * 0.3;
    const s = Math.min(r.w / vw, r.h / vh) * (1 + this.zoom), tr = this.trauma ** 2 * cfg.shake;
    const T = this.T, sx = tr * (Math.sin(T * 71) + Math.sin(T * 113 + 1)) * 0.5;
    const sy = tr * (Math.sin(T * 89 + 2) + Math.sin(T * 127 + 3)) * 0.5;
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.transform(s, 0, 0, s, r.x + r.w / 2 + (sx - cx) * s, r.y + r.h / 2 + (sy - cy) * s);
    ctx.strokeStyle = '#cfc8bb'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-2000, this.groundY); ctx.lineTo(W + 2000, this.groundY); ctx.stroke();
    ctx.fillStyle = '#e4ded2'; ctx.fillRect(-2000, -2000, 2020, 4000); ctx.fillRect(W - 20, -2000, 2000, 4000); // walls
    for (const f of this.fighters)
      f.draw(ctx, f.freeze > 0 && f === this.victim ? Math.sin(T * 170) * cfg.hitShake : 0);
    this.drawParticles(ctx);
    ctx.restore();
  }
}
