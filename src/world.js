'use strict';
// ---------- world: one self-contained fight (the grid runs nine of them side by side) ----------
const W = 800, H = 450, GROUND = 360;
const INK = ['#222', '#8a8580'], RED = ['#c0392b', '#e0998f'];
const COLS = [INK, RED, ['#2c6fb0', '#94b7d8'], ['#2e8b57', '#97c5ab'], ['#8e44ad', '#c6a2d6'], ['#b9770e', '#e0c08a']];
const NOIN = { left: false, right: false, down: false, jump: false, punch: false, kick: false };
const HIST = 240;

// what a training-mode frame meter shows for a fighter this frame
function frameState(f) {
  if (f.freeze > 0) return 'stop';
  if (f.kd) return 'down';
  if (!f.free) return 'hit';
  const a = f.action;
  if (!a) return f.grounded ? 'idle' : 'air';
  if (!a.m.power) return 'move';
  const ks = a.m.keys, first = ks.findIndex(k => k.active), last = ks.findLastIndex(k => k.active);
  return a.i < first ? 'startup' : a.i <= last ? 'active' : a.i >= a.m.cancel && (a.hit || a.m.next) ? 'cancel' : 'recovery';
}

class World {
  // over: config overrides on top of the live CFG. scen: { a, b, ax?, bx?, more?, period? } (see brain.js)
  // chars: character per fighter slot (the last one fills the rest); default = the current character
  constructor(scen, over = {}, seed = 1, chars = null) {
    Object.assign(this, { scen, over, seed, chars, groundY: GROUND, loop: true, camW: 420 });
    this.cfg = Object.assign(Object.create(CFG), over);
    this.reset();
  }
  reset() {
    const s = this.scen, scripted = Array.isArray(s.a);
    Object.assign(this, { rand: makeRand(this.seed), parts: [], trauma: 0, zoom: 0, slowT: 0, T: 0, simT: 0,
      frozenT: 0, hits: 0, freezes: [], victim: null, done: false, bank: this.cfg.hitstopBudget,
      pend: null, adv: null, hist: { tgt: [], disp: [], vx: [], y: [], fs: [] }, whiffs: 0, acts: [], inputs: [] });
    // a vs b, plus any extra fighters: { c: controller, x, team }
    const specs = [{ c: s.a, x: s.ax ?? (scripted ? 330 : 300), team: 0 }, { c: s.b, x: s.bx ?? (scripted ? 375 : 500), team: 1 }, ...(s.more || [])];
    const chars = this.chars || [currentChar()];
    this.fighters = specs.map((sp, i) => Object.assign(
      new Fighter(this, sp.x, i < 2 ? 1 - 2 * i : sp.x < W / 2 ? 1 : -1, COLS[i % COLS.length], chars[Math.min(i, chars.length - 1)]),
      { team: sp.team ?? i }));
    [this.a, this.b] = this.fighters;
    this.ctl = specs.map(sp => makeCtl(sp.c, this));
    this.cam = (this.a.x + this.b.x) / 2;
  }
  // a character was edited: fighters wearing the old build switch to the new one mid-fight
  swapChar(from, to) {
    if (this.chars) this.chars = this.chars.map(c => c === from ? to : c);
    for (const f of this.fighters) if (f.ch === from) f.setChar(to);
  }
  foes(f) { return this.fighters.filter(o => o.team !== f.team); }
  nearestFoe(f) {
    let best = null;
    for (const o of this.foes(f)) if (!best || Math.abs(o.x - f.x) < Math.abs(best.x - f.x)) best = o;
    return best;
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
    h.tgt.push(this.a.target[j] ?? 0); h.disp.push(this.a.disp[j] ?? 0); h.vx.push(this.a.vx); h.y.push(this.a.y);
    h.fs.push([frameState(this.a), frameState(this.b)]);
    if (this.ctl[0] === 'human') this.logInput(inp);
    if (h.tgt.length > HIST) for (const k in h) h[k].shift();
  }

  // input display: the human's input in numpad notation (6 = forward, 2 = down, 8 = jump…) + buttons, repeats merged
  logInput(i) {
    const x = (i.right - i.left) * this.a.dir, n = 5 + x + (i.down ? -3 : i.jump ? 3 : 0), b = (i.punch ? 'P' : '') + (i.kick ? 'K' : '');
    const last = this.inputs[this.inputs.length - 1];
    if (last && last.n === n && !b && !last.b) last.f++;
    else { this.inputs.push({ n, b, f: 1 }); if (this.inputs.length > 20) this.inputs.shift(); }
  }

  step(h, inp) {
    const cfg = this.cfg;
    this.T += h; this.simT += h;
    this.trauma = Math.max(0, this.trauma - h * 1.6);
    this.zoom *= Math.exp(-h * 10);
    this.bank = Math.min(cfg.hitstopBudget, this.bank + h * cfg.hitstopBudget);
    if (this.frozen) this.frozenT += h;
    this.updateParticles(h);

    const fs = this.fighters, tg = fs.map(f => this.nearestFoe(f));
    const ins = this.ctl.map((c, i) => c === 'human' ? inp : !c || !tg[i] ? NOIN : c.input(fs[i], tg[i], h));
    fs.forEach((f, i) => f.bufferInput(ins[i]));
    // recording for the replay dummy: one entry per substep the human is not frozen, directions relative to facing
    if (this.tape && this.ctl[0] === 'human' && this.a.freeze <= 0) {
      const i = ins[0], d = this.a.dir > 0;
      this.tape.push({ fwd: d ? i.right : i.left, back: d ? i.left : i.right, down: i.down, jump: i.jump, punch: i.punch, kick: i.kick });
    }
    fs.forEach((f, i) => {
      if (f.freeze > 0) f.freeze -= h; // hit stop: this fighter sits out the substep
      else f.update(h, ins[i], this.foes(f));
    });
    // push apart (unless someone is knocked down), then face the nearest foe
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i], b = fs[j], d = b.x - a.x;
      if (Math.abs(d) < 38 && Math.abs(a.y - b.y) < 60 && !a.kd && !b.kd) {
        const push = (38 - Math.abs(d)) / 2 * (Math.sign(d) || 1);
        a.x -= push; b.x += push;
      }
    }
    fs.forEach((f, i) => { if (tg[i] && !f.action && f.free && f.grounded) f.dir = Math.sign(tg[i].x - f.x) || f.dir; });
    // whiff: an attack that ended (or was interrupted) without touching anyone
    fs.forEach((f, i) => { const a = this.acts[i]; if (a && a !== f.action && a.m.power && !a.hit) this.whiffs++; this.acts[i] = f.action; });

    // frame advantage of the last hit: who can act first afterwards, in 60 fps frames (+ = attacker)
    const pd = this.pend;
    if (pd) {
      if (pd.at === null && idle(pd.att)) pd.at = this.simT;
      if (pd.vt === null && idle(pd.vic)) pd.vt = this.simT;
      if (pd.at !== null && pd.vt !== null) { this.adv = Math.round((pd.vt - pd.at) * 60); this.pend = null; }
    }

    const p = this.scen.period;
    if (p && this.simT >= p) { if (this.loop) this.reset(); else this.done = true; }
  }

  // ---------- juice ----------
  onHit(att, vic, hit, m) {
    const cfg = this.cfg, pt = hit.pt;
    vic.takeHit(att, m, hit);
    this.pend = { att, vic, at: null, vt: null };
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
    // the camera widens to keep every fighter in view
    const xs = this.fighters.map(f => f.x), lo = Math.min(...xs), hi = Math.max(...xs), mid = (lo + hi) / 2;
    this.camW += (clamp(hi - lo + 260, 420, W) - this.camW) * 0.15;
    const cfg = this.cfg, vw = full ? W : this.camW, vh = vw * H / W;
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
