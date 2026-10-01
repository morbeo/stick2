'use strict';
class Fighter {
  constructor(w, x, dir, col, ch, over = {}) {
    Object.assign(this, { w, x, groundY: w.groundY, dir, face: dir, col, ch, over, y: 0, vx: 0, vy: 0, grounded: true,
      time: 0, seed: w.rand(0, 100), walkPh: 0, lean: 0, inp: NOIN,
      action: null, buffer: null, squatT: 0, hurtT: 0, freeze: 0, flashT: 0, crouching: false,
      kd: null, downT: 0, bounces: 0, combo: 0, comboShown: 0, comboT: 0, comboPop: 0, lastHurt: null,
      sq: 0, sqv: 0, trail: [], dirs: [], used: [], juggles: 0,
      z: 0, vz: 0, lane: 0, dashT: 0, passT: 0, running: false, tap: null, prevIn: NOIN, flip: 0, spin: 0, airT: 0,
      guarding: false, blockT: 0, parryT: 0, ko: false, label: '', labelT: 0, stunM: 0, dizzyT: 0, reelT: 0, splatT: 0, splat: false, gb: false, heldBy: null, heldM: null, heldT: 0, flyT: 0, guardT: -9, stanceI: 0 });
    this.hp = this.c('health');
    this.target = this.basePose();
    this.disp = { ...this.target };
    this.prev = { ...this.target };
    this.flt = {}; this.lens = {};
    for (const b of ch.bones) { this.flt[b.id] = new SecondOrder(this.target[b.id]); this.lens[b.id] = b.len; }
  }
  // swap the body live (character editor): new bones start at the base pose, the running move is dropped
  setChar(ch) {
    this.ch = ch; this.action = null; this.trail = [];
    const base = this.basePose();
    for (const b of ch.bones) {
      if (!this.flt[b.id]) { this.flt[b.id] = new SecondOrder(base[b.id]); this.target[b.id] = this.disp[b.id] = this.prev[b.id] = base[b.id]; }
      this.lens[b.id] = b.len;
    }
  }
  c(k) { const v = this.over[k] ?? this.w.cfg[k]; return STAT_OF[k] ? v * this.ch.stats[STAT_OF[k]] : v; } // character stats scale their settings
  get free() { return this.hurtT <= 0 && !this.kd; }
  get st() { return this.ch.stances[this.stanceI] || this.ch.stances[0]; } // the current stance: its pose and binds

  // the procedural layer, driven by bone roles so any skeleton breathes, walks and leans
  basePose() {
    const ch = this.ch, ps = ch.poses, base = this.st.pose, P = { ...base }, t = this.time, g = ch.gait;
    if (this.kd === 'down') return Object.assign(P, ps.lie);
    if (this.kd) {
      // tumbling: arch while rising, reach for the floor while dropping, limbs flailing
      const k = clamp(this.vy / 600, -1, 1), fl = this.c('flail');
      Object.assign(P, ps.fall);
      if (k > 0) for (const j in ps.lie) P[j] += (ps.lie[j] - P[j]) * k * 0.4;
      ch.bones.forEach((b, i) => { P[b.id] += wander(t * 3 + this.seed + i * 7) * fl * (b.role === 'spine' ? 6 : 25); });
      return P;
    }
    const turn = (b, d) => { if (b) P[b.id] += b.fwd * d; }; // + swings the bone's end forward
    const flex = (b, d) => { if (b) P[b.id] += b.flex * d; };
    const spine = ch.chains.spine[0]?.[0], br = Math.sin(t * 2.2) * g.breath;
    turn(spine, br * 1.5); for (const c of ch.chains.arm) turn(c[0], br * 2); // breathing
    // slow idle wander, stronger on loose bones; legs excluded so planted feet don't slide
    ch.bones.forEach((b, i) => { if (b.role !== 'leg') P[b.id] += wander(t * 0.8 + this.seed + i * 13) * (1.5 + 2.2 * b.lag); });
    if (!this.grounded) {
      const k = this.flip ? 0 : clamp(this.vy / 500, 0, 1); // tuck while rising (and through a flip), reach for the ground while falling
      for (const j in ps.air) P[j] = ps.air[j] + ((ps.airFall[j] ?? ps.air[j]) - ps.air[j]) * k;
    } else if (this.crouching || this.squatT > 0) Object.assign(P, ps.crouch);
    else {
      const w = Math.min(1.6, Math.hypot(this.vx, this.vz) / this.c('maxSpeed')), ph = this.walkPh, back = this.vx * this.dir < 0;
      const st = back ? 0.7 : 1, id = Math.max(0, 1 - w), s = this.seed, amp = id * g.idleAmt;
      // keyframed loops (moves named idle / walk) replace the procedural cycles, blended by how fast the fighter moves
      const loop = (m, time, k) => { const L = samplePose(ch, m, time, this.c('easing'), base); for (const j in L) P[j] += (L[j] - base[j]) * k; };
      const idleL = ch.moves.idle, walkL = ch.moves.walk;
      // idle: each fighter has its own stance width and one of three idles (weight shift, boxer bounce, sway)
      const style = g.idle === 'auto' ? Math.floor(s) % 3 : ['shift', 'bounce', 'sway'].indexOf(g.idle), shift = Math.sin(t * 0.9 + s), bounce = 1 + Math.sin(t * 5.5 + s);
      ch.chains.leg.forEach((c, i) => {
        const side = i % 2 ? -1 : 1;
        turn(c[0], side * ((s % 1) - 0.5) * 10 * id);
        if (idleL) return;
        if (style === 0) flex(c[1], Math.max(0, shift * side) * 10 * amp);
        if (style === 1) { turn(c[0], bounce * 4 * amp); flex(c[1], bounce * 7 * amp); }
      });
      if (idleL) loop(idleL, t % total(idleL), id);
      else if (style === 2) turn(spine, wander(t * 1.3 + s) * 5 * amp);
      // walk: legs alternate (a centaur trots: diagonal pairs), each arm counter-swings the leg on its side,
      // shorter steps and a raised guard walking backwards; a walk loop plays one cycle (two steps) per 2π of the phase
      if (walkL) loop(walkL, ((ph / (2 * Math.PI)) % 1 + 1) % 1 * total(walkL), Math.min(1, w));
      else {
        ch.chains.leg.forEach((c, i) => { const q = ph + i * Math.PI; turn(c[0], Math.sin(q) * 28 * g.stride * w * st); flex(c[1], Math.max(0, Math.cos(q)) * 40 * g.lift * w * st); });
        ch.chains.arm.forEach((c, i) => { const q = ph + (i + 1) * Math.PI; turn(c[0], Math.sin(q) * 22 * g.armSwing * w * st * st); flex(c[1], Math.max(0, Math.sin(q)) * 15 * g.armSwing * w + (back ? 20 * w : 0)); });
      }
      turn(spine, 4 * g.lean * w * Math.sign(this.vx * this.dir));
    }
    // reeling (stagger) or dizzy: the body sways on wobbly knees, the head lolls
    const reel = this.dizzyT > 0 ? 1 : clamp(this.reelT * 3, 0, 1);
    if (reel) {
      turn(spine, Math.sin(t * 4.5 + this.seed) * 14 * reel - 8 * reel);
      for (const c of ch.chains.head) turn(c[0], Math.sin(t * 3.1 + this.seed) * 20 * reel);
      ch.chains.leg.forEach((c, i) => flex(c[1], (1 + Math.sin(t * 4.5 + i * 2)) * 14 * reel));
      ch.chains.arm.forEach((c, i) => turn(c[0], -20 * reel + Math.sin(t * 3 + i) * 15 * reel));
    }
    if (this.guarding) ch.chains.arm.forEach((c, i) => { turn(c[0], i ? 50 : 40); flex(c[1], 25); }); // guard: forearms up in front of the face
    turn(spine, this.lean);
    return P;
  }
  doubleTap(k) {
    if (!this.free || !this.grounded || this.action || this.squatT > 0) return;
    if (k === 'up' || k === 'down') { if (this.c('plane') === 'lanes') this.lane = clamp(this.lane + (k === 'down' ? 1 : -1), -1, 1); return; }
    if (!this.c('dash')) return;
    const d = k === 'right' ? 1 : -1, fwd = d === this.dir;
    this.vx = d * this.c('maxSpeed') * (fwd ? 2.2 : 1.8); this.dashT = fwd ? 0.18 : 0.22; this.passT = this.c('dashPass'); this.running = fwd;
    this.sqv -= this.c('squash') * 10; this.lean = (fwd ? 8 : -6);
  }
  // 2.5D depth: walk on the belt or slide to the lane; attacks home in on the target's depth during startup
  depth(dt, inp, busy) {
    const plane = this.c('plane');
    if (plane === '2d') { this.z = this.vz = 0; return; }
    const a = this.action, o = this.w.nearestFoe(this);
    const homing = busy && o && a.m.power && a.i < a.m.keys.findIndex(k => k.active) ? this.c('zAssist') : 0;
    if (plane === 'lanes') {
      const tz = this.lane * LANE + (homing && o.z - this.lane * LANE) * homing;
      this.vz = (tz - this.z) * 12;
    } else {
      const want = this.free && !busy && !this.guarding && this.grounded && this.squatT <= 0 ? (inp.down - inp.up) * this.c('zSpeed') : 0;
      this.vz = approach(this.vz, want, this.c('accel') * dt);
      if (homing) this.vz += (o.z - this.z) * homing * 10;
    }
    this.z = clamp(this.z + this.vz * dt, -ZMAX, ZMAX);
  }
  // a bounce: every limb gets a kick, heavier at the loose ends
  flailJolt(imp) {
    const k = imp * this.c('flail');
    for (const b of this.ch.bones) this.flt[b.id].yd += this.w.rand(-1, 1) * 900 * k * (b.lag + 0.5);
  }
  // push a bone's spring: + swings its end forward
  jolt(b, v) { if (b) this.flt[b.id].yd += b.fwd * v; }

  // runs every substep, hit stop included: directions are remembered for special motions, buttons are buffered
  bufferInput(inp) {
    const n = 5 + (inp.right - inp.left) * this.dir - (inp.down ? 3 : 0), t = this.w.simT, d = this.dirs;
    if (d[d.length - 1]?.n !== n) d.push({ n, t });
    while (d.length > 1 && t - d[1].t > this.c('motionWindow')) d.shift();
    // P+G throws; K+G switches stance (when the character has more than one)
    const as = b => !inp.guard ? b : b === 'punch' ? 'throw' : b === 'kick' && this.ch.stances.length > 1 ? 'stance' : b;
    for (const b of ['punch', 'kick', 'special']) if (inp[b]) this.buffer = { b: as(b), t: 0.2, motion: this.motion() };
  }
  // every special motion in the recent directions (6236 is both →↓↘ and ↓↘→: the first one with a move bound wins)
  motion() {
    const s = this.dirs.map(d => d.n).join('');
    return Object.keys(MOTIONS).filter(k => MOTIONS[k].test(s));
  }
  // input slot -> the move the character binds to it (see BINDS); a special motion picks its special on the ground
  pick(b, motion) {
    const i = this.inp, fwd = (i.right - i.left) * this.dir > 0, P = b === 'punch';
    if (b === 'special') { // S: a special per direction, the neutral one when that direction has none
      const slot = !this.grounded ? 'airSpecial' : i.down ? 'downSpecial' : i.up ? 'upSpecial' : fwd ? 'fwdSpecial' : i.right !== i.left ? 'backSpecial' : 'special';
      return [this.st.binds[slot], this.grounded && this.st.binds.special].find(m => this.ch.moves[m]) || null;
    }
    const B = P ? 'Punch' : 'Kick', has = s => this.ch.moves[this.st.binds[s]] ? this.st.binds[s] : null;
    if (b === 'throw') return this.grounded ? has('throw') : null;
    const sp = this.grounded && motion?.map(k => has(k + B)).find(Boolean);
    if (sp) return sp;
    if (!this.grounded) return has('air' + B);
    if (P && fwd && !i.down && Math.abs(this.vx) > this.c('maxSpeed') * 0.6 && has('dashPunch')) return has('dashPunch');
    // a direction × button table: ↘K = downFwdKick; a slot without a move falls back to its vertical (downKick), then to neutral
    const v = i.down ? 'down' : i.up ? 'up' : '', hz = fwd ? 'Fwd' : i.right !== i.left ? 'Back' : '';
    const slots = [v && hz && v + hz + B, v ? v + B : hz && hz.toLowerCase() + B, b];
    return slots.map(s => s && has(s)).find(Boolean) || null;
  }
  // what the running move can be cancelled into, once its cancel window is open (Combos & cancels)
  cancelInto(a, b, motion) {
    if (a.i < a.m.cancel) return null;
    const m = this.pick(b, motion);
    if (m && this.ch.moves[m].special && !a.m.special && a.hit && this.c('specialCancel')) return m;
    const rule = this.c('chains');
    if (rule === 'authored') return a.m.next?.[b];
    if (rule === 'free') return a.hit && m && !this.used.includes(m) ? m : null;
    return null;
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
    if (this.heldBy) this.held(dt, inp);

    // start a move, or chain into the next one once the current move's active frames are over
    const a0 = this.action;
    if (this.buffer?.b === 'stance' && this.free && !a0 && this.grounded) {
      this.stanceI = (this.stanceI + 1) % this.ch.stances.length; this.buffer = null; this.say(this.st.name.toUpperCase());
    }
    if (this.buffer && this.free && this.squatT <= 0) {
      const { b, motion } = this.buffer, fresh = !a0 || a0.m.hurt;
      const m = fresh ? this.pick(b, motion) : this.cancelInto(a0, b, motion);
      if (m) {
        if (fresh) this.used = [];
        this.used.push(m); this.start(m); this.buffer = null;
        if (this.ch.moves[m].special) this.dirs = this.dirs.slice(-1); // the motion is spent
      }
    }
    if (this.buffer && (this.buffer.t -= dt) < 0) this.buffer = null;

    // double taps: → / ← dash, ↑ / ↓ sidestep a lane. Any other direction in between breaks it (→↓↘ is not a dash)
    const flat = c('plane') === '2d', fwdK = this.dir > 0 ? 'right' : 'left';
    for (const k of ['left', 'right', 'up', 'down']) if (inp[k] && !this.prevIn[k]) {
      if (this.tap?.k === k && this.w.simT - this.tap.t < 0.25) { this.tap = null; this.doubleTap(k); }
      else this.tap = { k, t: this.w.simT };
    }
    if (inp.guard && !this.prevIn.guard) {
      this.parryT = c('parryWindow'); this.guardT = this.w.simT;
      // air recovery: G a while into a knockdown flight flips the fighter back onto its feet
      if (this.kd === 'fly' && !this.ko && c('airRecover') && this.flyT >= c('airRecover') && this.splatT <= 0) {
        this.kd = null; this.hurtT = 0; this.flip = -1; this.airT = 0; this.vy = Math.min(this.vy, -250); this.vx *= 0.3; this.say('RECOVER');
      }
    }
    if (this.kd === 'fly') this.flyT += dt;
    this.prevIn = inp;
    if (!inp[fwdK] || !this.free || this.action) this.running = false;
    this.dashT -= dt; this.passT -= dt; this.blockT -= dt; this.parryT -= dt; this.labelT -= dt; this.dizzyT -= dt; this.reelT -= dt; this.splatT -= dt;
    if (this.free) this.stunM = Math.max(0, this.stunM - c('dizzyDrain') * dt);
    // guard: held while free on the ground, and kept through blockstun; with ↓ it is a low guard (in the belt too)
    const busy = this.action && !this.action.m.hurt;
    this.guarding = this.blockT > 0 || inp.guard && this.free && this.grounded && !busy && this.squatT <= 0;
    this.crouching = (this.free || this.blockT > 0) && inp.down && this.grounded && (c('plane') !== 'belt' || this.guarding);

    // horizontal: accelerate toward desired speed, never snap
    const locked = !this.free || (busy && this.grounded) || this.squatT > 0 || this.crouching || this.dashT > 0 || this.guarding;
    const want = locked ? 0 : (inp.right - inp.left) * c('maxSpeed') * (this.running ? c('runSpeed') : 1);
    const drag = this.dashT > 0 ? 0.1 : this.kd === 'fly' ? 0.05 : !this.free ? 0.35 : busy ? 0.4 : 1; // dashes, lunges and knockback slide
    const rate = want && Math.sign(want) === Math.sign(this.vx || want) ? c('accel') : c('decel') * drag;
    const pvx = this.vx;
    this.vx = approach(this.vx, want, rate * dt);
    // lean toward the direction of travel while speeding up or braking
    const leanT = this.grounded ? clamp(Math.abs(this.vx - pvx) / dt * 0.004, 0, 10) * Math.sign(this.vx) * this.dir : 0;
    this.lean += (leanT - this.lean) * (1 - Math.exp(-12 * dt));
    this.x += this.vx * dt;
    if (this.x < 40 || this.x > W - 40) {
      this.x = clamp(this.x, 40, W - 40);
      const wb = this.kd === 'fly' ? c('wallBounce') : 0, imp = Math.min(1, Math.abs(this.vx) / 600);
      if (this.splat && imp > 0.15) { // a wall splat (move flag wall): stuck flat on the wall a moment, then it slides off
        this.splat = false; this.vx = 0; this.vy = 0; this.splatT = 0.35; this.flailJolt(imp); this.say('WALL');
        this.w.trauma = Math.min(1, this.w.trauma + 0.3 * imp);
      } else if (wb && imp > 0.15) { // off the wall: back into the arena, popped up a little
        this.vx *= -wb; this.vy = Math.min(this.vy, -120 * imp); this.flailJolt(imp);
        this.w.trauma = Math.min(1, this.w.trauma + 0.2 * imp);
      } else this.vx = 0;
    }
    this.depth(dt, inp, busy);
    const leg = this.ch.chains.leg[0], ll = leg ? leg[0].len + (leg[1]?.len || 0) : 45, back = this.vx * this.dir < 0;
    this.walkPh += Math.hypot(this.vx, this.vz) * (back ? -1 : 1) * dt * 3.3 / ll / (back ? 0.7 : 1); // one step per stride, feet stay planted
    this.face = approach(this.face, this.dir, dt * 12); // turn through a squashed profile instead of flipping

    // vertical: jump squat (anticipation) -> launch -> land
    // jump cancel: a move that connected can be jumped out of once its active frames are over (juggles)
    const jc = busy && this.action.hit && this.action.i >= this.action.m.cancel && c('jumpCancel');
    if (inp.hop && this.grounded && this.free && (!busy || jc) && this.squatT <= 0) {
      this.squatT = c('jumpSquat') || 1e-6;
      if (jc) this.action = null;
    }
    if (this.squatT > 0 && (this.squatT -= dt) <= 0) {
      this.grounded = false; this.vy = -c('jumpVel'); this.sqv += c('squash') * 25; this.airT = 0;
      const x = inp.right - inp.left, fl = c('flips');
      if (x && (fl === 'always' || fl === '2.5D' && !flat)) this.flip = x * this.dir; // +1 forward flip, -1 back flip
    }
    // a flip turns the body once over the jump; an attack or a hit ends it and the body rights itself
    if (this.flip && (this.action || this.kd)) this.flip = 0;
    if (!this.grounded) this.airT += dt;
    if (this.flip) this.spin = this.flip * 360 * Math.min(1, this.airT / (2 * c('jumpVel') / c('gravity')));
    else if (this.spin) { const to = Math.round(this.spin / 360) * 360; this.spin = approach(this.spin, to, 1440 * dt); if (this.spin === to) this.spin = 0; }
    if (!this.grounded && this.splatT <= 0) {
      this.vy += c('gravity') * dt; this.y += this.vy * dt;
      if (this.y >= 0) {
        const imp = Math.min(1, this.vy / 800);
        this.y = 0; this.vy = 0; this.grounded = true; this.flip = 0; this.spin = 0;
        this.sqv -= c('squash') * 25 * imp;
        this.ch.chains.leg.forEach((c, i) => { if (c[1]) this.flt[c[1].id].yd += c[1].flex * (i ? 400 : 500) * imp; }); // knees absorb
        this.jolt(this.ch.chains.spine[0]?.[0], 250 * imp);
        this.w.dust(this.x, this.groundY, imp, this.z);
        if (this.action?.m.air) this.action = null;
        if (this.kd === 'fly' && !this.gb && !this.ko && c('techWindow') && this.w.simT - this.guardT < c('techWindow')) {
          this.kd = null; this.start('getup'); this.hurtT = 0.3; this.vx = -this.dir * 150; this.say('TECH'); // G just before landing: a quick get-up
        } else if (this.kd === 'fly') {
          const up = -imp * 800 * c('floorBounce');
          this.flailJolt(imp);
          if (this.gb) { // a ground bounce (move flag bounce): high off the floor, open to a juggle
            this.gb = false; this.grounded = false; this.vy = -Math.max(420, -up); this.vx *= 0.6; this.say('BOUNCE');
            this.w.trauma = Math.min(1, this.w.trauma + 0.25 * imp);
          } else if (this.bounces < c('bounces') && up < -60) {
            this.bounces++; this.grounded = false; this.vy = up; this.vx *= 0.7;
            this.w.trauma = Math.min(1, this.w.trauma + 0.15 * imp);
          } else { this.kd = 'down'; this.downT = 0.6; this.splat = false; }
        }
      }
    }
    if (this.kd === 'down' && !this.ko && (this.downT -= dt) <= 0) { this.kd = null; this.start('getup'); this.hurtT = 0.5; }

    // squash & stretch spring (sq > 0 = stretch)
    const w = 2 * Math.PI * 4.5;
    this.sqv += (-w * w * this.sq - 2 * 0.3 * w * this.sqv) * dt;
    this.sq += this.sqv * dt;

    // tween layer: keyframes eased from a snapshot toward (live base ⊕ key)
    const base = this.basePose();
    if (this.action) {
      const a = this.action, keys = a.m.keys;
      a.t += dt * (a.m.power ? c('attackSpeed') * (1 + c('comboSpeed') * (this.w.combo - 1)) : 1);
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

    const a = this.action, ss = a?.m.keys[a.i].active ? this.strikeShapes(a.m) : [];
    const otg = c('otg') === 'all' || c('otg') === 'flagged' && a?.m.otg;
    if (ss.length) for (const o of foes) if (!a.hits.includes(o) && Math.abs(o.z - this.z) <= c('zReach') * (a.m.wide ? 3 : 1)) {
      if (a.m.height === 'high' && o.crouching) continue; // highs pass over a crouching fighter
      if (a.m.throw && (!o.grounded || !o.free || o.heldBy || o.squatT > 0)) continue; // throws only catch a standing, free fighter
      // several striking bones: the deepest overlap counts, one hit per foe per move
      const h = ss.map(s => o.hurtAt(s, c('hitTest') === 'target', otg)).reduce((best, h) => h && (!best || h.d < best.d) ? h : best, null);
      if (h && a.m.throw) { a.hits.push(o); a.hit = true; this.seize(o); }
      else if (h) { a.hits.push(o); a.hit = true; this.w.onHit(this, o, h, a.m, o.defend(this, a.m, a.m.keys[a.i])); }
    }
    this.lastTips = Object.fromEntries(ss.map(s => [s.id, s[1]]));
  }

  // the strike this substep as a capsule [from, to, radius], per the collision mode:
  // drawn = striking joint of the drawn (sprung) pose · target = of the keyframe pose, ignoring springs
  // swept = path of the drawn joint since last substep (fast strikes can't tunnel) · limb = the whole striking bone
  // (one per striking bone, each tagged with its bone id)
  strikeShapes(m) {
    const mode = this.c('hitTest'), P = mode === 'target' ? this.points(this.target) : this.body(), r = this.c('hitR');
    return hitIds(m).map(id => this.ch.by[id]).filter(Boolean).map(b => {
      const tip = P[b.id], s = mode === 'limb' ? [P[b.parent || 'hip'], tip, r + b.thick / 2] : [mode === 'swept' && this.lastTips?.[b.id] || tip, tip, r];
      s.id = b.id; return s;
    });
  }
  // the hurt bone the strike overlaps most, or null
  hurtAt([s0, s1, r], useTarget, otg) {
    const a = this.action;
    if (this.kd === 'down' && !otg || a?.m.inv || a?.m.keys[a.i]?.inv) return null;
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
  // a strike connected: 'parry' (guard tapped just before), 'block' (guarding), or null = it hits.
  // Front only. Standing guard: high, special high, mid, special mid · crouching guard: low, special mid
  // key: the attacker's current key (unblockable is a property of frames, not of the whole move)
  defend(att, m, key) {
    const k = this.action?.m.keys[this.action.i];
    if (k?.catch && (att.x - this.x) * this.dir > 0) return 'catch';
    const able = this.guarding || this.parryT > 0 && this.free && this.grounded && !this.action && this.squatT <= 0;
    if (key?.unblock || !able || (att.x - this.x) * this.dir <= 0) return null;
    const h = m.height || 'mid';
    if (!(h === 'smid' || (this.crouching ? h === 'low' : h !== 'low'))) return null;
    return this.parryT > 0 && this.c('parry') ? 'parry' : 'block';
  }
  blockHit(att, m) {
    const bs = (m.stun || 0.4) * this.c('blockStun');
    this.hurtT = this.blockT = bs; this.guarding = true; this.combo = 0; this.buffer = null; this.parryT = 0;
    this.vx = att.dir * m.knock * this.c('blockPush') / this.ch.stats.weight;
    if (this.c('health') > 0) this.hp = Math.max(1, this.hp - this.damageOf(m, 1) * (m.chip || this.c('chip'))); // chip never knocks out
    for (const c of this.ch.chains.arm) this.jolt(c[0], -300 * m.power); // the guard gives
    this.sqv -= this.c('squash') * 8 * m.power;
  }
  // a parry: the defender is free at once, the attacker staggers
  parryHit(att) {
    this.parryT = 0; this.say('PARRY');
    const set = att.ch.hurt.high, stun = this.c('parryStun');
    att.buffer = null; att.start(makeHurt(set[Math.floor(this.w.rand() * set.length)], stun, this.w.rand, att.st.pose)); att.hurtT = stun;
  }
  // a strike caught by a catch key: the counter move answers it at once (its damage lands now, its keys only animate)
  catchHit(att, hit) {
    const m = this.ch.moves[this.action.m.counter];
    this.say('CATCH');
    if (!m) return;
    this.start(m);
    this.w.onHit(this, att, { bone: att.ch.by[hitIds(att.action?.m)[0]] || hit.bone, pt: hit.pt }, m, null);
  }
  // a throw connected: the victim is held for the tech window, then thrown by the move named in the grab's throw
  seize(o) {
    o.heldBy = this; o.heldT = this.c('techWindow'); o.buffer = null; o.guarding = false; o.blockT = 0; o.dir = -this.dir;
    o.start(makeHurt(o.ch.hurt.mid[0], 9, this.w.rand, o.st.pose)); o.hurtT = 9;
    const toss = this.ch.moves[this.action.m.throw];
    o.heldM = toss || this.action.m;
    if (toss) this.start(toss);
  }
  // held in a throw: pinned in front of the thrower; P+G inside the window breaks free, else the throw lands
  held(dt, inp) {
    const t = this.heldBy;
    this.x = t.x + t.dir * 30; this.z = t.z; this.vx = 0;
    if (inp.punch && inp.guard && this.heldT > 0) {
      this.heldBy = null; this.hurtT = 0; this.action = null; this.buffer = null; this.vx = t.dir * 250; this.say('BREAK');
      t.action = null; t.vx = -t.dir * 250; t.hurtT = 0.15;
    } else if ((this.heldT -= dt) <= 0) {
      this.heldBy = null; this.hurtT = 0; this.action = null;
      const bone = this.ch.chains.spine[0]?.at(-1) || this.ch.bones[0];
      this.say('THROW'); this.w.onHit(t, this, { bone, pt: this.body()[bone.id] }, this.heldM, null);
    }
  }
  damageOf(m, combo) { return (m.damage ?? m.power * 8) * this.c('damage') * this.c('comboDamage') ** (combo - 1); }
  say(text) { this.label = text; this.labelT = 0.9; }
  takeHit(att, m, hit) {
    const a = this.action, own = a && !a.m.hurt;
    if (own && a.m.keys[a.i]?.armor && (this.c('health') <= 0 || this.hp > this.damageOf(m, 1))) { // armor: the damage lands, the move goes on
      if (this.c('health') > 0) this.hp -= this.damageOf(m, 1);
      this.flashT = 0.1; this.say('ARMOR'); this.sqv -= this.c('squash') * 8 * m.power;
      return;
    }
    // counter hit: caught in the startup or active frames of its own attack
    const ck = own && a.m.power && a.i < a.m.cancel ? this.c('counterHit') : 1;
    const combo = this.combo = (this.free ? 0 : this.combo) + 1, dmg = this.damageOf(m, combo) * ck, wasDizzy = this.dizzyT > 0;
    if (ck > 1) this.say('COUNTER');
    if (this.c('health') > 0 && (this.hp -= dmg) <= 0) { this.hp = 0; this.ko = true; this.say('K.O.'); }
    this.dizzyT = 0; this.reelT = 0;
    this.stunM = wasDizzy ? 0 : this.stunM + dmg; // a hit wakes a dizzy fighter (and empties the meter)
    this.comboShown = combo; this.comboT = 1; this.comboPop = 1;
    const juggle = !!this.kd || !this.grounded, otg = this.kd === 'down';
    this.dir = -att.dir; this.buffer = null; this.squatT = 0; this.flashT = 0.1;
    this.vx = att.dir * m.knock * (juggle ? 0.6 : 1) / this.ch.stats.weight;
    if (m.kd || m.crumple || juggle || combo >= 7 || this.ko) {
      this.juggles = this.kd ? this.juggles + 1 : 0;
      this.kd = 'fly'; this.bounces = otg ? 99 : 0; this.grounded = false; this.action = null; this.hurtT = 0; // hit off the ground: a small pop, no bounce
      this.vy = -Math.max(m.launch || 300, this.ko ? 380 : 0) * this.c('juggleDecay') ** this.juggles / this.ch.stats.weight;
      this.splat = !!m.wall; this.gb = !!m.bounce && !otg; this.splatT = 0; this.flyT = 0;
      if (m.crumple && !juggle) { this.vx = att.dir * 30; this.vy = -120; this.bounces = 99; this.say('CRUMPLE'); } // folds where it stands
    } else {
      const set = this.ch.hurt[this.zone(hit.pt)].filter(p => p !== this.lastHurt);
      this.lastHurt = set[Math.floor(this.w.rand() * set.length)];
      const stun = m.stun * ck * Math.max(0.45, 1 - 0.07 * (combo - 1)); // long combos stun less
      this.start(makeHurt(this.lastHurt, stun, this.w.rand, this.st.pose));
      this.hurtT = stun;
      const da = this.c('dizzyAt'), sa = this.c('staggerAt');
      if (da && this.stunM >= da) { this.dizzyT = this.c('dizzyTime'); this.hurtT = Math.max(stun, this.dizzyT); this.stunM = da; this.say('DIZZY'); }
      else if (sa && this.damageOf(m, 1) >= sa) { this.reelT = this.c('staggerStun'); this.hurtT = stun + this.reelT; this.vx *= 1.3; this.say('STAGGER'); }
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
    if (this.spin) {
      let top = 0; for (const k in L) top = Math.min(top, L[k][1]);
      const r = this.spin * this.dir * R, c = Math.cos(r), s = Math.sin(r), cy = (top + fy) / 2;
      for (const k in L) { const x = L[k][0], y = L[k][1] - cy; L[k] = [x * c - y * s, cy + x * s + y * c]; }
    }
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

  // hurtboxes (blue) and the live strike (red), in the pose the collision mode tests
  drawBoxes(ctx) {
    const P = this.c('hitTest') === 'target' ? this.points(this.target) : this.body();
    ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(44,111,176,.22)';
    for (const b of this.ch.bones) if (b.hurt > 0) {
      const e = P[b.id], o = b.shape === 'circle' ? e : P[b.parent || 'hip'];
      ctx.lineWidth = b.hurt * 2; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0] + 0.01, e[1]); ctx.stroke();
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
    if (this.c('boxes')) this.drawBoxes(ctx);
    const a = this.action;
    if (a?.m.keys.some((k, i) => k.unblock && i >= a.i)) for (const id of hitIds(a.m)) if (P[id]) { // unblockable frames coming: the striking limbs glow
      ctx.fillStyle = `rgba(192,57,43,${0.25 + 0.2 * Math.sin(this.time * 40)})`;
      ctx.beginPath(); ctx.arc(P[id][0], P[id][1], 9, 0, 7); ctx.fill();
    }
    // health bar and callouts (PARRY, K.O.) over the head
    let top = this.groundY; for (const k in P) top = Math.min(top, P[k][1]);
    const hp = this.c('health');
    if (hp > 0) {
      ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.fillRect(this.x - 18, top - 16, 36, 4);
      ctx.fillStyle = this.col[0]; ctx.fillRect(this.x - 18, top - 16, 36 * this.hp / hp, 4);
    }
    const da = this.c('dizzyAt');
    if (da && this.stunM > 0) { ctx.fillStyle = '#e6b422'; ctx.fillRect(this.x - 18, top - 11, 36 * Math.min(1, this.stunM / da), 2); }
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
