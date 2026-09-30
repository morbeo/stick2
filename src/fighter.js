'use strict';
class Fighter {
  constructor(w, x, dir, col, over = {}) {
    Object.assign(this, { w, x, groundY: w.groundY, dir, face: dir, col, over, y: 0, vx: 0, vy: 0, grounded: true,
      time: 0, seed: w.rand(0, 100), walkPh: 0, lean: 0, inp: NOIN,
      action: null, buffer: null, squatT: 0, hurtT: 0, freeze: 0, flashT: 0, crouching: false,
      kd: null, downT: 0, bounced: false, combo: 0, comboShown: 0, comboT: 0, comboPop: 0, lastHurt: null,
      sq: 0, sqv: 0, trail: [] });
    this.target = this.basePose();
    this.disp = { ...this.target };
    this.flt = {};
    for (const j of JOINTS) this.flt[j] = new SecondOrder(this.target[j]);
  }
  c(k) { return this.over[k] ?? this.w.cfg[k]; }
  get free() { return this.hurtT <= 0 && !this.kd; }

  basePose() {
    const P = { ...STANCE }, t = this.time;
    if (this.kd) return Object.assign(P, this.kd === 'down' ? LIE : FALL);
    const br = Math.sin(t * 2.2);
    P.torso += br * 1.5; P.afU += br * 2; P.abU += br * 2; // breathing
    for (const j in WANDER) P[j] += wander(t * 0.8 + this.seed + JOINTS.indexOf(j) * 13) * WANDER[j];
    if (!this.grounded) {
      const k = clamp(this.vy / 500, 0, 1); // tuck while rising, reach for the ground while falling
      for (const j in AIR) P[j] = AIR[j] + (AIR_FALL[j] - AIR[j]) * k;
    } else if (this.crouching || this.squatT > 0) Object.assign(P, CROUCH);
    else {
      const w = Math.min(1, Math.abs(this.vx) / this.c('maxSpeed')), ph = this.walkPh, s = Math.sin(ph);
      P.lfU += s * 28 * w; P.lbU -= s * 28 * w;
      P.lfL -= Math.max(0, Math.cos(ph)) * 40 * w; P.lbL -= Math.max(0, -Math.cos(ph)) * 40 * w;
      P.afU -= s * 22 * w; P.abU += s * 22 * w; // arms counter-swing the legs
      P.afL += Math.max(0, -s) * 15 * w; P.abL += Math.max(0, s) * 15 * w;
      P.torso += 4 * w * Math.sign(this.vx * this.dir);
    }
    P.torso += this.lean;
    return P;
  }

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
    this.action = { m: typeof m === 'string' ? MOVES[m] : m, i: 0, t: 0, from: { ...this.target }, hit: false };
  }

  update(dt, inp, opp) {
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
        this.flt.lfL.yd -= 500 * imp; this.flt.lbL.yd -= 400 * imp; this.flt.torso.yd += 250 * imp; // knees absorb
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
      for (const j of JOINTS) this.target[j] = a.from[j] + (to[j] - a.from[j]) * e;
    } else Object.assign(this.target, base);

    // filter layer: displayed pose chases the target pose
    const mode = c('filter');
    for (const j of JOINTS) {
      const x = this.target[j];
      if (mode === 'spring') {
        this.disp[j] = this.flt[j].update(dt, x, c('freq') * c('followThru') ** DEPTH[j], c('zeta'), c('response'));
        continue;
      }
      this.disp[j] = mode === 'damp' ? this.disp[j] + (x - this.disp[j]) * (1 - Math.exp(-c('dampRate') * dt)) : x;
      this.flt[j].reset(this.disp[j]);
    }
    for (const j in LIMITS) this.disp[j] = clamp(this.disp[j], ...LIMITS[j]);

    // hits are tested against what is drawn, not the target
    const a = this.action;
    if (a && opp && !a.hit && a.m.keys[a.i].active) {
      const pt = this.points(this.disp)[a.m.hit];
      if (opp.hurtBy(pt)) { a.hit = true; this.w.onHit(this, opp, pt, a.m); }
    }
  }

  hurtBy(pt) {
    if (this.kd === 'down' || this.action?.m.inv) return false;
    const P = this.points(this.disp);
    return distSeg(pt, P.hip, P.neck) < 12 || Math.hypot(pt[0] - P.head[0], pt[1] - P.head[1]) < B.head + 4 ||
      [[P.hip, P.fk], [P.fk, P.ff], [P.hip, P.bk], [P.bk, P.bf]].some(([a, b]) => distSeg(pt, a, b) < 8);
  }
  takeHit(att, m) {
    const combo = this.combo = (this.free ? 0 : this.combo) + 1;
    this.comboShown = combo; this.comboT = 1; this.comboPop = 1;
    const juggle = this.kd === 'fly' || !this.grounded;
    this.dir = -att.dir; this.buffer = null; this.squatT = 0; this.flashT = 0.1;
    this.vx = att.dir * m.knock * (juggle ? 0.6 : 1);
    if (m.kd || juggle || combo >= 7) {
      this.kd = 'fly'; this.bounced = false; this.grounded = false; this.action = null; this.hurtT = 0;
      this.vy = -(m.launch || 300);
    } else {
      const set = HURT[m.height].filter(p => p !== this.lastHurt);
      this.lastHurt = set[Math.floor(this.w.rand() * set.length)];
      const stun = m.stun * Math.max(0.45, 1 - 0.07 * (combo - 1)); // long combos stun less
      this.start(makeHurt(this.lastHurt, stun, this.w.rand));
      this.hurtT = stun;
    }
    // kick the limb springs so every impact lands a little differently
    const k = 200 * m.power;
    for (const j of JOINTS) this.flt[j].yd += this.w.rand(-1, 1) * k * (DEPTH[j] + 0.5);
    if (m.height === 'high') this.flt.head.yd -= 4 * k;
    else if (m.height === 'mid') this.flt.torso.yd += 2 * k;
    this.sqv -= this.c('squash') * 15 * m.power;
  }

  // world-space joints: lowest body point snapped to the ground, then squash/stretch around it
  points(p) {
    const L = fk(p, this.face);
    const fy = Math.max(L.ff[1], L.bf[1], L.fk[1], L.bk[1], L.hip[1], L.sh[1], L.head[1] + B.head);
    const sx = 1 - this.sq * 0.5, sy = 1 + this.sq, ax = this.x, ay = this.groundY + this.y, P = {};
    for (const k in L) P[k] = [ax + L[k][0] * sx, ay + (L[k][1] - fy) * sy];
    return P;
  }
  recordTrail() {
    const P = this.points(this.disp);
    this.trail.push([P.fh, P.ff, P.bh, P.bf]);
    if (this.trail.length > 24) this.trail.shift();
  }

  draw(ctx, jitter) {
    ctx.save(); ctx.translate(jitter, 0);
    const s = Math.max(0.3, 1 + this.y / 200);
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    ctx.beginPath(); ctx.ellipse(this.x, this.groundY + 1, 22 * s, 4 * s, 0, 0, 7); ctx.fill();

    const n = Math.min(this.c('trail'), this.trail.length - 1), tr = this.trail;
    for (let li = 0; li < 4; li++) for (let i = 1; i <= n; i++) {
      const a = tr[tr.length - 2 - n + i][li], b = tr[tr.length - 1 - n + i][li];
      ctx.globalAlpha = (i / n) * 0.35; ctx.lineWidth = (i / n) * 5; ctx.strokeStyle = this.col[0];
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (this.c('ghost')) { ctx.globalAlpha = 0.2; drawFigure(ctx, this.points(this.target), '#07f', '#07f', 3); ctx.globalAlpha = 1; }
    const P = this.points(this.disp);
    if (this.flashT > 0 && this.c('flash')) { drawFigure(ctx, P, '#111', '#111', 9); drawFigure(ctx, P, '#fff', '#fff', 5); }
    else drawFigure(ctx, P, this.col[0], this.col[1], 5);

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
