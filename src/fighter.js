'use strict';
class Fighter {
  constructor(w, x, dir, col, ch, over = {}) {
    Object.assign(this, { w, x, groundY: w.groundY, dir, face: dir, col, ch, over, y: 0, vx: 0, vy: 0, grounded: true,
      time: 0, seed: w.rand(0, 100), walkPh: 0, lean: 0, inp: NOIN,
      action: null, buffer: null, squatT: 0, hurtT: 0, freeze: 0, flashT: 0, crouching: false,
      kd: null, downT: 0, bounced: false, combo: 0, comboShown: 0, comboT: 0, comboPop: 0, lastHurt: null,
      sq: 0, sqv: 0, trail: [] });
    this.target = this.basePose();
    this.disp = { ...this.target };
    this.prev = { ...this.target };
    this.flt = {}; this.lens = {};
    for (const b of ch.bones) { this.flt[b.id] = new SecondOrder(this.target[b.id]); this.lens[b.id] = b.len; }
  }
  c(k) { return this.over[k] ?? this.w.cfg[k]; }
  get free() { return this.hurtT <= 0 && !this.kd; }

  // the procedural layer, driven by bone roles so any skeleton breathes, walks and leans
  basePose() {
    const ch = this.ch, ps = ch.poses, P = { ...ps.stance }, t = this.time;
    if (this.kd) return Object.assign(P, this.kd === 'down' ? ps.lie : ps.fall);
    const turn = (b, d) => { if (b) P[b.id] += b.fwd * d; }; // + swings the bone's end forward
    const flex = (b, d) => { if (b) P[b.id] += b.flex * d; };
    const spine = ch.chains.spine[0]?.[0], br = Math.sin(t * 2.2);
    turn(spine, br * 1.5); for (const c of ch.chains.arm) turn(c[0], br * 2); // breathing
    // slow idle wander, stronger on loose bones; legs excluded so planted feet don't slide
    ch.bones.forEach((b, i) => { if (b.role !== 'leg') P[b.id] += wander(t * 0.8 + this.seed + i * 13) * (1.5 + 2.2 * b.lag); });
    if (!this.grounded) {
      const k = clamp(this.vy / 500, 0, 1); // tuck while rising, reach for the ground while falling
      for (const j in ps.air) P[j] = ps.air[j] + ((ps.airFall[j] ?? ps.air[j]) - ps.air[j]) * k;
    } else if (this.crouching || this.squatT > 0) Object.assign(P, ps.crouch);
    else {
      const w = Math.min(1, Math.abs(this.vx) / this.c('maxSpeed')), ph = this.walkPh;
      // legs alternate; each arm counter-swings the leg on its side
      ch.chains.leg.forEach((c, i) => { const q = ph + i * Math.PI; turn(c[0], Math.sin(q) * 28 * w); flex(c[1], Math.max(0, Math.cos(q)) * 40 * w); });
      ch.chains.arm.forEach((c, i) => { const q = ph + (i + 1) * Math.PI; turn(c[0], Math.sin(q) * 22 * w); flex(c[1], Math.max(0, Math.sin(q)) * 15 * w); });
      turn(spine, 4 * w * Math.sign(this.vx * this.dir));
    }
    turn(spine, this.lean);
    return P;
  }
  // push a bone's spring: + swings its end forward
  jolt(b, v) { if (b) this.flt[b.id].yd += b.fwd * v; }

  bufferInput(inp) {
    if (inp.punch) this.buffer = { b: 'punch', t: 0.2 };
    if (inp.kick) this.buffer = { b: 'kick', t: 0.2 };
  }
  pick(b) {
    const i = this.inp, fwd = (i.right - i.left) * this.dir > 0;
    if (!this.grounded) return b === 'punch' ? 'airPunch' : 'airKick';
    if (i.down) return b === 'punch' ? 'jab' : 'sweep';
    if (b === 'punch' && fwd && Math.abs(this.vx) > this.c('maxSpeed') * 0.6) return 'dashPunch';
    return b === 'punch' ? 'jab' : 'kick';
  }
  start(m) {
    this.action = { m: typeof m === 'string' ? this.ch.moves[m] : m, i: 0, t: 0, from: { ...this.target }, hit: false, hits: [] };
  }

  // foes: every fighter on another team (one move can hit several)
  update(dt, inp, foes) {
    const c = k => this.c(k);
    this.inp = inp;
    this.time += dt; this.hurtT -= dt; this.flashT -= dt; this.comboT -= dt;
    this.comboPop *= Math.exp(-10 * dt);
    if (this.free) this.combo = 0;

    // start a move, or chain into the next one once the current move's active frames are over
    const a0 = this.action;
    if (this.buffer && this.free && this.squatT <= 0) {
      const b = this.buffer.b;
      const m = !a0 || a0.m.hurt ? this.pick(b) : a0.i >= a0.m.cancel && a0.m.next?.[b];
      if (m) { this.start(m); this.buffer = null; }
    }
    if (this.buffer && (this.buffer.t -= dt) < 0) this.buffer = null;

    // horizontal: accelerate toward desired speed, never snap
    this.crouching = this.free && inp.down && this.grounded;
    const busy = this.action && !this.action.m.hurt;
    const locked = !this.free || (busy && this.grounded) || this.squatT > 0 || this.crouching;
    const want = locked ? 0 : (inp.right - inp.left) * c('maxSpeed');
    const drag = this.kd === 'fly' ? 0.05 : !this.free ? 0.35 : busy ? 0.4 : 1; // lunges and knockback slide
    const rate = want && Math.sign(want) === Math.sign(this.vx || want) ? c('accel') : c('decel') * drag;
    const pvx = this.vx;
    this.vx = approach(this.vx, want, rate * dt);
    // lean toward the direction of travel while speeding up or braking
    const leanT = this.grounded ? clamp(Math.abs(this.vx - pvx) / dt * 0.004, 0, 10) * Math.sign(this.vx) * this.dir : 0;
    this.lean += (leanT - this.lean) * (1 - Math.exp(-12 * dt));
    this.x += this.vx * dt;
    if (this.x < 40 || this.x > W - 40) { this.x = clamp(this.x, 40, W - 40); this.vx = 0; }
    this.walkPh += this.vx * this.dir * dt * 0.075;
    this.face = approach(this.face, this.dir, dt * 12); // turn through a squashed profile instead of flipping

    // vertical: jump squat (anticipation) -> launch -> land
    // jump cancel: a move that connected can be jumped out of once its active frames are over (juggles)
    const jc = busy && this.action.hit && this.action.i >= this.action.m.cancel;
    if (inp.jump && this.grounded && this.free && (!busy || jc) && this.squatT <= 0) {
      this.squatT = c('jumpSquat') || 1e-6;
      if (jc) this.action = null;
    }
    if (this.squatT > 0 && (this.squatT -= dt) <= 0) {
      this.grounded = false; this.vy = -c('jumpVel'); this.sqv += c('squash') * 25;
    }
    if (!this.grounded) {
      this.vy += c('gravity') * dt; this.y += this.vy * dt;
      if (this.y >= 0) {
        const imp = Math.min(1, this.vy / 800);
        this.y = 0; this.vy = 0; this.grounded = true;
        this.sqv -= c('squash') * 25 * imp;
        this.ch.chains.leg.forEach((c, i) => { if (c[1]) this.flt[c[1].id].yd += c[1].flex * (i ? 400 : 500) * imp; }); // knees absorb
        this.jolt(this.ch.chains.spine[0]?.[0], 250 * imp);
        this.w.dust(this.x, this.groundY, imp);
        if (this.action?.m.air) this.action = null;
        if (this.kd === 'fly') {
          if (!this.bounced) { this.bounced = true; this.grounded = false; this.vy = -180; this.w.trauma = Math.min(1, this.w.trauma + 0.15); }
          else { this.kd = 'down'; this.downT = 0.6; }
        }
      }
    }
    if (this.kd === 'down' && (this.downT -= dt) <= 0) { this.kd = null; this.start('getup'); this.hurtT = 0.5; }

    // squash & stretch spring (sq > 0 = stretch)
    const w = 2 * Math.PI * 4.5;
    this.sqv += (-w * w * this.sq - 2 * 0.3 * w * this.sqv) * dt;
    this.sq += this.sqv * dt;

    // tween layer: keyframes eased from a snapshot toward (live base ⊕ key)
    const base = this.basePose();
    if (this.action) {
      const a = this.action, keys = a.m.keys;
      a.t += dt * (a.m.power ? c('attackSpeed') : 1);
      while (a.i < keys.length && a.t >= keys[a.i].d) {
        a.t -= keys[a.i].d; a.from = resolve(base, keys[a.i].p); a.i++;
        if (keys[a.i]?.lunge) this.vx = this.dir * keys[a.i].lunge;
      }
      if (a.i >= keys.length) this.action = null;
    }
    if (this.action) {
      const a = this.action, k = a.m.keys[a.i], to = resolve(base, k.p);
      const e = EASE[c('easing') === 'authored' ? k.e || 'linear' : c('easing')](a.t / k.d);
      for (const j of this.ch.ids) this.target[j] = a.from[j] + (to[j] - a.from[j]) * e;
    } else Object.assign(this.target, base);

    // filter layer: displayed pose chases the target pose
    const mode = c('filter');
    for (const b of this.ch.bones) {
      const j = b.id, x = this.target[j];
      this.prev[j] = this.disp[j];
      if (mode === 'spring') this.disp[j] = this.flt[j].update(dt, x, c('freq') * b.stiff * c('followThru') ** b.lag, c('zeta') * b.damp, c('response'));
      else {
        this.disp[j] = mode === 'damp' ? this.disp[j] + (x - this.disp[j]) * (1 - Math.exp(-c('dampRate') * dt)) : x;
        this.flt[j].reset(this.disp[j]);
      }
      // limits are applied after the filter so spring overshoot never hyperextends a joint
      if (b.min !== undefined) this.disp[j] = clamp(this.disp[j], b.min, b.max);
      // stretch: fast-swinging bones lengthen, then ease back
      const want = b.len * (1 + b.stretch * Math.min(1, Math.abs(this.disp[j] - this.prev[j]) / dt / 1500));
      this.lens[j] += (want - this.lens[j]) * (1 - Math.exp(-30 * dt));
    }

    const a = this.action, s = a?.m.keys[a.i].active && this.strikeShape(a.m);
    if (s) for (const o of foes) if (!a.hits.includes(o)) {
      const h = o.hurtAt(s, c('hitTest') === 'target');
      if (h) { a.hits.push(o); a.hit = true; this.w.onHit(this, o, h, a.m); }
    }
    this.lastTip = s ? s[1] : null;
  }

  // the strike this substep as a capsule [from, to, radius], per the collision mode:
  // drawn = striking joint of the drawn (sprung) pose · target = of the keyframe pose, ignoring springs
  // swept = path of the drawn joint since last substep (fast strikes can't tunnel) · limb = the whole striking bone
  strikeShape(m) {
    const b = this.ch.by[m.hit];
    if (!b) return null;
    const mode = this.c('hitTest'), P = mode === 'target' ? this.points(this.target) : this.body(), tip = P[b.id], r = this.c('hitR');
    if (mode === 'limb') return [P[b.parent || 'hip'], tip, r + b.thick / 2];
    return [mode === 'swept' && this.lastTip || tip, tip, r];
  }
  // the hurt bone the strike overlaps most, or null
  hurtAt([s0, s1, r], useTarget) {
    if (this.kd === 'down' || this.action?.m.inv) return null;
    const P = useTarget ? this.points(this.target) : this.body();
    let best = null;
    for (const b of this.ch.bones) if (b.hurt > 0) {
      const e = P[b.id], d = distSegSeg(s0, s1, b.shape === 'circle' ? e : P[b.parent || 'hip'], e) - b.hurt - r;
      if (d < 0 && (!best || d < best.d)) best = { d, bone: b, pt: s1 };
    }
    return best;
  }
  // react to where the blow landed: impact height as a fraction of the body's height
  zone(pt) {
    const P = this.body(), g = this.groundY + this.y;
    let top = g;
    for (const b of this.ch.bones) top = Math.min(top, P[b.id][1] - (b.shape === 'circle' ? b.len : 0));
    const f = (g - pt[1]) / (g - top || 1);
    return f > 0.68 ? 'high' : f > 0.28 ? 'mid' : 'low';
  }
  takeHit(att, m, hit) {
    const combo = this.combo = (this.free ? 0 : this.combo) + 1;
    this.comboShown = combo; this.comboT = 1; this.comboPop = 1;
    const juggle = this.kd === 'fly' || !this.grounded;
    this.dir = -att.dir; this.buffer = null; this.squatT = 0; this.flashT = 0.1;
    this.vx = att.dir * m.knock * (juggle ? 0.6 : 1);
    if (m.kd || juggle || combo >= 7) {
      this.kd = 'fly'; this.bounced = false; this.grounded = false; this.action = null; this.hurtT = 0;
      this.vy = -(m.launch || 300);
    } else {
      const set = this.ch.hurt[this.zone(hit.pt)].filter(p => p !== this.lastHurt);
      this.lastHurt = set[Math.floor(this.w.rand() * set.length)];
      const stun = m.stun * Math.max(0.45, 1 - 0.07 * (combo - 1)); // long combos stun less
      this.start(makeHurt(this.lastHurt, stun, this.w.rand, this.ch.poses.stance));
      this.hurtT = stun;
    }
    // impact: the blow spins every bone from the struck one down to the hips, harder on a longer lever
    // and lighter bones; the push is along the attack, lifting for launchers
    const P = this.body(), sd = Math.sign(this.face) || 1, k = 30000 * m.power * this.c('impact');
    const fx = att.dir, fy = m.launch ? -0.6 : m.height === 'low' ? 0 : -0.2, fn = Math.hypot(fx, fy);
    for (let b = hit.bone; b; b = this.ch.by[b.parent]) {
      const o = P[b.parent || 'hip'], rx = hit.pt[0] - o[0], ry = hit.pt[1] - o[1];
      this.flt[b.id].yd += (fx * ry - fy * rx) * sd / fn * k / b.inertia; // force · tangent of the pivot's rotation
    }
    // plus a little noise so repeated hits never land identically
    for (const b of this.ch.bones) this.flt[b.id].yd += this.w.rand(-1, 1) * 80 * m.power * (b.lag + 0.5);
    this.sqv -= this.c('squash') * 15 * m.power;
  }

  // world-space joints: lowest body point snapped to the ground, then squash/stretch around it
  points(p, lens) {
    const L = fk(this.ch, p, this.face, lens);
    let fy = 0;
    for (const b of this.ch.bones) fy = Math.max(fy, L[b.id][1] + (b.shape === 'circle' ? b.len : 0));
    const sx = 1 - this.sq * 0.5, sy = 1 + this.sq, ax = this.x, ay = this.groundY + this.y, P = {};
    for (const k in L) P[k] = [ax + L[k][0] * sx, ay + (L[k][1] - fy) * sy];
    return P;
  }
  body() { return this.points(this.disp, this.lens); }
  recordTrail() {
    const P = this.body();
    this.trail.push(this.ch.tips.map(b => P[b.id]));
    if (this.trail.length > 24) this.trail.shift();
  }

  draw(ctx, jitter) {
    ctx.save(); ctx.translate(jitter, 0);
    const s = Math.max(0.3, 1 + this.y / 200);
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    ctx.beginPath(); ctx.ellipse(this.x, this.groundY + 1, 22 * s, 4 * s, 0, 0, 7); ctx.fill();

    const n = Math.min(this.c('trail'), this.trail.length - 1), tr = this.trail;
    for (let li = 0; li < this.ch.tips.length; li++) for (let i = 1; i <= n; i++) {
      const a = tr[tr.length - 2 - n + i][li], b = tr[tr.length - 1 - n + i][li];
      ctx.globalAlpha = (i / n) * 0.35; ctx.lineWidth = (i / n) * 5; ctx.strokeStyle = this.col[0];
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (this.c('ghost')) { ctx.globalAlpha = 0.2; drawFigure(ctx, this.ch, this.points(this.target), '#07f', '#07f', -2); ctx.globalAlpha = 1; }
    const P = this.body();
    if (this.flashT > 0 && this.c('flash')) { drawFigure(ctx, this.ch, P, '#111', '#111', 4); drawFigure(ctx, this.ch, P, '#fff', '#fff'); }
    else drawFigure(ctx, this.ch, P, this.col[0], this.col[1]);

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
