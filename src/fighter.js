'use strict';
class Fighter {
  constructor(w, x, dir, col, ch, over = {}) {
    Object.assign(this, { w, x, groundY: w.groundY, dir, face: dir, col, ch, over, y: 0, vx: 0, vy: 0, grounded: true,
      time: 0, seed: w.rand(0, 100), walkPh: 0, lean: 0, inp: NOIN,
      action: null, buffer: null, squatT: 0, hurtT: 0, freeze: 0, flashT: 0, crouching: false,
      kd: null, downT: 0, bounces: 0, combo: 0, comboShown: 0, comboT: 0, comboPop: 0, lastHurt: null,
      sq: 0, sqv: 0, trail: [], dirs: [], used: [], juggles: 0,
      z: 0, vz: 0, lane: 0, dashT: 0, passT: 0, running: false, tap: null, prevIn: NOIN, flip: 0, spin: 0, airT: 0,
      guarding: false, blockT: 0, parryT: 0, ko: false, label: '', labelT: 0, stunM: 0, dizzyT: 0, reelT: 0, splatT: 0, splat: false, gb: false, heldBy: null, heldM: null, heldT: 0, flyT: 0, guardT: -9, stanceI: 0,
      airJumps: 0, airDodged: false, airDashed: false, dodgeT: 0, airDashT: 0, feet: [], planted: null });
    this.hp = this.c('health'); this.ch0 = ch.base || ch; // ch0: the character without its weapon
    this.target = this.basePose();
    this.disp = { ...this.target };
    this.prev = { ...this.target };
    this.flt = {}; this.lens = {};
    for (const b of ch.bones) { this.flt[b.id] = new SecondOrder(this.target[b.id]); this.lens[b.id] = b.len; }
  }
  // swap the body live (character editor): new bones start at the base pose, the running move is dropped
  setChar(ch) {
    this.ch = ch; this.ch0 = ch.base || ch; this.action = null; this.trail = [];
    const base = this.basePose();
    for (const b of ch.bones) {
      if (!this.flt[b.id]) { this.flt[b.id] = new SecondOrder(base[b.id]); this.target[b.id] = this.disp[b.id] = this.prev[b.id] = base[b.id]; }
      this.lens[b.id] = b.len;
    }
  }
  c(k) { // character stats scale their settings
    const v = this.over[k] ?? this.w.cfg[k], s = STAT_OF[k];
    return !s ? v : s.f ? s.f(v, this.ch.stats) : v * this.ch.stats[s.k];
  }
  get free() { return this.hurtT <= 0 && !this.kd; }
  get st() { return this.ch.stances[this.stanceI] || this.ch.stances[0]; } // the current stance: its pose and binds
  get binds() { return this.st[bindsKey(this.c('plane'))]; } // the stance's input table for this plane (2D or 2.5D)

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
    ch.bones.forEach((b, i) => { if (b.role !== 'leg') P[b.id] += wander(t * 0.8 + this.seed + i * 13) * (1.5 + 2.2 * b.lag) * b.sway; });
    if (!this.grounded) {
      const k = this.flip ? 0 : clamp(this.vy / 500, 0, 1); // tuck while rising (and through a flip), reach for the ground while falling
      for (const j in ps.air) P[j] = ps.air[j] + ((ps.airFall[j] ?? ps.air[j]) - ps.air[j]) * k;
    } else if (this.crouching || this.squatT > 0) Object.assign(P, ps.crouch);
    else {
      const w = Math.min(1.6, Math.hypot(this.vx, this.vz) / this.c('maxSpeed')), ph = this.walkPh, back = this.vx * this.dir < 0;
      const st = back ? 0.7 : 1, id = Math.max(0, 1 - w), s = this.seed, amp = id * g.idleAmt;
      // keyframed loops (moves named idle / walk) replace the procedural cycles, blended by how fast the fighter moves
      const loop = (m, time, k) => { const L = samplePose(ch, m, time, this.c('easing'), base); for (const j in L) P[j] += (L[j] - base[j]) * k; };
      const idleL = ch.moves[loopName(ch, this.stanceI, 'idle')], walkL = ch.moves[loopName(ch, this.stanceI, 'walk')];
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
    if (!this.grounded && this.free && !this.action && (k === 'left' || k === 'right') && !this.airDashed && this.c('airDash') > 0) {
      this.airDashed = true; this.airDashT = 0.15; this.vx = (k === 'right' ? 1 : -1) * this.c('airDash'); this.vy = 0; this.flip = 0; // an air dash: level for a moment
      return;
    }
    if (!this.free || !this.grounded || this.action || this.squatT > 0) return;
    if (k === 'up' || k === 'down') { if (this.c('plane') === 'lanes') this.lane = clamp(this.lane + (k === 'down' ? 1 : -1), -1, 1); return; }
    if (!this.c('dash')) return;
    const d = k === 'right' ? 1 : -1, fwd = d === this.dir;
    this.vx = d * this.c('maxSpeed') * this.c('dashSpeed') * (fwd ? 1 : 0.8); this.dashT = fwd ? 0.18 : 0.22; this.passT = this.c('dashPass'); this.running = fwd;
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
    for (const b of this.ch.bones) this.flt[b.id].yd += this.w.rand(-1, 1) * 900 * k * (b.lag + 0.5) * b.react;
  }
  // push a bone's spring: + swings its end forward
  jolt(b, v) { if (b) this.flt[b.id].yd += b.fwd * v * b.react; }

  // runs every substep, hit stop included: directions are remembered for special motions, buttons are buffered
  bufferInput(inp) {
    const n = 5 + (inp.right - inp.left) * this.dir - (inp.down ? 3 : inp.up ? -3 : 0), t = this.w.simT, d = this.dirs;
    if (d[d.length - 1]?.n !== n) d.push({ n, t });
    while (d.length > 1 && t - d[1].t > this.c('motionWindow')) d.shift();
    // P+G throws; K+G (with a direction or not) switches to the stance with that key
    const to = inp.guard && inp.kick ? this.stanceTo((['', '↓', '↓', '↓', '←', '', '→'][n] || '') + 'K+G') : -1;
    const as = b => !inp.guard ? b : b === 'punch' ? 'throw' : b === 'kick' && to >= 0 ? 'stance' : b;
    for (const b of ['punch', 'kick', 'special']) if (inp[b]) this.buffer = { b: as(b), t: 0.2, motion: this.motion(), to };
  }
  // the stance a key switches to: the next one after the current among the stances with that key and main (-1: none)
  stanceTo(key) {
    const c = this.ch.stances.map((s, i) => i).filter(i => !i || this.ch.stances[i].key === key);
    return c.length < 2 ? -1 : c.find(i => i > this.stanceI) ?? c[0];
  }
  // every special motion in the recent directions, the character's own first (6236 is both →↓↘ and ↓↘→: the first one with a move bound wins)
  motion() {
    const s = this.dirs.map(d => d.n).join(''), all = { ...this.ch.motions, ...MOTIONS };
    return Object.keys(all).filter(k => all[k].test(s));
  }
  // input slot -> the move the character binds to it (see BINDS); a special motion picks its special on the ground
  pick(b, motion) {
    const i = this.inp, fwd = (i.right - i.left) * this.dir > 0, P = b === 'punch';
    if (b === 'special') { // S: a special per direction, the neutral one when that direction has none
      const slot = !this.grounded ? 'airSpecial' : i.down ? 'downSpecial' : i.up ? 'upSpecial' : fwd ? 'fwdSpecial' : i.right !== i.left ? 'backSpecial' : 'special';
      return [this.binds[slot], this.grounded && this.binds.special].find(m => this.ch.moves[m]) || null;
    }
    const B = P ? 'Punch' : 'Kick', has = s => this.ch.moves[this.binds[s]] ? this.binds[s] : null;
    if (b === 'throw') return this.grounded ? has('throw') : null;
    const sp = this.grounded && motion?.map(k => has(k + B)).find(Boolean);
    if (sp) return sp;
    if (!this.grounded) return has('air' + (i.down ? 'Down' : i.up ? 'Up' : '') + B) || has('air' + B);
    if (P && fwd && !i.down && !this.ch.weapon && Math.abs(this.vx) > this.c('maxSpeed') * 0.6 && has('dashPunch')) return has('dashPunch');
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
  // a move by name, taking up its class's weapon first if it is a weapon move (scripts, the gallery)
  force(n) {
    const m = this.ch.moves[n] || WEAPON_MOVES[n];
    if (m?.weapon && WEAPONS[this.ch.weapon]?.cls !== m.weapon) this.wield(WEAPON_CLASSES[m.weapon].weapon);
    if (this.ch.moves[n]) this.start(n);
  }

  // ---------- weapons (see WEAPONS): held = the character compiled with the weapon bone (armed) ----------
  wield(type) { this.setChar(armed(this.ch0, type)); }
  get weapon() { return WEAPONS[this.ch.weapon]; }
  // where the held weapon's bones are, as a lying item would be: its centre and angle
  weaponAt() {
    const P = this.body(), b = this.ch.by.weapon, o = P[b.parent], e = P[this.ch.by.weaponTip ? 'weaponTip' : 'weapon'];
    return { x: (o[0] + e[0]) / 2, y: (o[1] + e[1]) / 2, rot: Math.atan2(e[1] - o[1], e[0] - o[0]) };
  }
  // the weapon leaves the hand: thrown (live: it hits foes) or knocked loose
  letGo(live) {
    const w = this.w, at = this.weaponAt(), it = { type: this.ch.weapon, ...at, z: this.z, owner: this, live, spin: 0, t: 0 };
    if (live) Object.assign(it, { x: at.x + this.dir * 10, vx: this.dir * this.c('throwSpeed'), vy: -60, spin: this.dir * (this.weapon.cls === 'pierce' ? 0 : 18), rot: this.dir > 0 ? 0 : Math.PI });
    else Object.assign(it, { vx: -this.dir * 120 + w.rand(-60, 60), vy: -320, spin: w.rand(-12, 12) });
    w.items.push(it);
    this.setChar(this.ch0);
  }
  // P+G free on the ground: throw the held weapon, or pick up the one at the feet (null = nothing to do, a grab instead)
  weaponGrab() {
    if (this.ch.weapon) { this.letGo(true); this.start({ keys: [{ d: 0.06, e: 'outQuad', p: this.ch.moves.jab?.keys[1].p || {} }, { d: 0.18, e: 'inOutCubic', p: null }] }); return true; }
    const it = this.w.itemNear(this);
    if (!it) return false;
    this.w.items.splice(this.w.items.indexOf(it), 1);
    this.wield(it.type);
    this.start({ keys: [{ d: 0.12, e: 'outQuad', p: this.ch.poses.crouch }, { d: 0.14, e: 'inOutCubic', p: null }] });
    this.say(it.type.toUpperCase());
    return true;
  }
  // a weapon move's blow, by the weight of the weapon held
  weaponHit(m) {
    const w = m.weapon && this.weapon, k = w ? weaponPower(w) : 1;
    return k === 1 ? m : { ...m, power: m.power * k, damage: m.damage * k, knock: m.knock * k };
  }

  update(dt, inp) {
    const c = k => this.c(k);
    this.inp = inp;
    this.time += dt; this.hurtT -= dt; this.flashT -= dt; this.comboT -= dt;
    this.comboPop *= Math.exp(-10 * dt);
    if (this.free) this.combo = 0;
    if (this.heldBy) this.held(dt, inp);

    // start a move, or chain into the next one once the current move's active frames are over
    const a0 = this.action;
    if (this.buffer?.b === 'stance' && this.free && !a0 && this.grounded) {
      this.stanceI = this.buffer.to; this.buffer = null; this.say(this.st.name.toUpperCase());
    }
    // 2D: J / K with ↑ held in the jump squat is an up attack instead of a jump
    if (this.buffer && this.squatT > 0 && inp.up && this.buffer.b !== 'stance' && this.c('plane') === '2d') this.squatT = 0;
    if (this.buffer && this.free && this.squatT <= 0 && this.face * this.dir > 0 && this.dodgeT <= 0) { // not mid turn or air dodge
      const { b, motion } = this.buffer, fresh = !a0 || a0.m.hurt;
      if (b === 'throw' && !a0 && this.grounded && this.w.items && this.weaponGrab()) this.buffer = null;
    }
    if (this.buffer && this.free && this.squatT <= 0 && this.face * this.dir > 0 && this.dodgeT <= 0) {
      const { b, motion } = this.buffer, fresh = !this.action || this.action.m.hurt;
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
      // air dodge: intangible a moment, with a direction a burst that way; once per jump
      if (!this.grounded && this.free && !this.action && !this.airDodged && c('airDodge') > 0) {
        const x = inp.right - inp.left, y = inp.down - inp.up, n = Math.hypot(x, y) || 1;
        this.airDodged = true; this.dodgeT = c('airDodge'); this.flip = 0;
        if (x || y) { this.vx = x / n * 450; this.vy = y / n * 450; } else this.vy = Math.min(this.vy, 0) * 0.3;
      }
      // air recovery: G a while into a knockdown flight flips the fighter back onto its feet
      if (this.kd === 'fly' && !this.ko && c('airRecover') && this.flyT >= c('airRecover') && this.splatT <= 0) {
        this.endRag(); this.kd = null; this.hurtT = 0; this.flip = -1; this.airT = 0; this.vy = Math.min(this.vy, -250); this.vx *= 0.3; this.say('RECOVER');
      }
    }
    if (this.kd === 'fly') this.flyT += dt;
    const upTap = inp.up && !this.prevIn.up;
    this.prevIn = inp;
    if (!inp[fwdK] || !this.free || this.action) this.running = false;
    this.dashT -= dt; this.passT -= dt; this.blockT -= dt; this.parryT -= dt; this.labelT -= dt; this.dodgeT -= dt; this.airDashT -= dt; this.dizzyT -= dt; this.reelT -= dt; this.splatT -= dt;
    if (this.free) this.stunM = Math.max(0, this.stunM - c('dizzyDrain') * dt);
    // guard: held while free on the ground, and kept through blockstun; with ↓ it is a low guard (in the belt too)
    const busy = this.action && !this.action.m.hurt;
    this.guarding = this.blockT > 0 || inp.guard && this.free && this.grounded && !busy && this.squatT <= 0;
    this.crouching = (this.free || this.blockT > 0) && inp.down && this.grounded && (c('plane') !== 'belt' || this.guarding);

    // horizontal: accelerate toward desired speed, never snap
    const locked = !this.free || (busy && this.grounded) || this.squatT > 0 || this.crouching || this.dashT > 0 || this.guarding;
    const air = !this.grounded && this.free; // drifting in the air: its own top speed and control
    const want = locked ? 0 : (inp.right - inp.left) * (air ? c('airSpeed') : c('maxSpeed') * (this.running ? c('runSpeed') : 1));
    const drag = this.dashT > 0 ? 0.1 : this.kd === 'fly' ? 0.05 : !this.free ? 0.35 : busy ? 0.4 : 1; // dashes, lunges and knockback slide
    const rate = this.airDashT > 0 || this.dodgeT > 0 ? 0 : air ? c('airAccel') : want && Math.sign(want) === Math.sign(this.vx || want) ? c('accel') : c('decel') * drag;
    const pvx = this.vx;
    this.vx = approach(this.vx, want, rate * dt);
    // lean toward the direction of travel while speeding up or braking
    const leanT = this.grounded ? clamp(Math.abs(this.vx - pvx) / dt * 0.004, 0, 10) * Math.sign(this.vx) * this.dir : 0;
    this.lean += (leanT - this.lean) * (1 - Math.exp(-12 * dt));
    if (!this.rag) this.x += this.vx * dt; // a ragdoll moves itself (ragStep)
    if (!this.rag && (this.x < 40 || this.x > W - 40)) {
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
    this.face = approach(this.face, this.dir, dt * c('turnSpeed')); // turn through a squashed profile instead of flipping

    // vertical: jump squat (anticipation) -> launch -> land
    // jump cancel: a move that connected can be jumped out of once its active frames are over (juggles)
    const jc = busy && this.action.hit && this.action.i >= this.action.m.cancel && c('jumpCancel');
    const hop = inp.hop || flat && upTap; // 2D: ↑ jumps too
    if (hop && this.grounded && this.free && (!busy || jc) && this.squatT <= 0) {
      this.squatT = c('jumpSquat') || 1e-6;
      if (jc) this.action = null;
    } else if (hop && !this.grounded && this.free && !busy && this.airJumps < this.ch.stats.jumps - 1) { // max jumps: another jump in the air
      this.airJumps++; this.vy = -c('jumpVel') * 0.9; this.sqv += c('squash') * 20; this.flip = 0;
      this.vx = (inp.right - inp.left) * Math.max(Math.abs(this.vx), c('airSpeed') * 0.8);
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
    if (!this.grounded && this.splatT <= 0 && !this.rag) {
      if (this.airDashT > 0) this.vy = 0;
      else this.vy += c('gravity') * dt;
      if (this.free && this.dodgeT <= 0) this.vy = Math.min(this.vy, c('fallSpeed')); // top falling speed (not when knocked flying)
      if (this.free && inp.down && this.vy > 0 && !busy) this.vy = Math.max(this.vy, c('fallSpeed')); // fast fall
      this.y += this.vy * dt;
      // the ceiling (setting): a body knocked flying to the top of the screen comes back down
      const cb = this.kd === 'fly' && this.vy < 0 && c('ceiling');
      if (cb) { const top = Math.min(...Object.values(this.body()).map(q => q[1])), imp = Math.min(1, -this.vy / 800);
        if (top < CEIL) { this.y += CEIL - top; this.vy *= -cb; this.flailJolt(imp); this.w.trauma = Math.min(1, this.w.trauma + 0.2 * imp); } }
      if (this.y >= 0) {
        const imp = Math.min(1, this.vy / 800);
        this.y = 0; this.vy = 0; this.grounded = true; this.flip = 0; this.spin = 0;
        this.airJumps = 0; this.airDodged = this.airDashed = false; this.dodgeT = this.airDashT = 0;
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
    if (this.kd === 'down' && !this.ko && (this.downT -= dt) <= 0) { this.endRag(); this.kd = null; this.start('getup'); this.hurtT = 0.5; }

    // squash & stretch spring (sq > 0 = stretch)
    const w = 2 * Math.PI * 4.5;
    this.sqv += (-w * w * this.sq - 2 * 0.3 * w * this.sqv) * dt;
    this.sq += this.sqv * dt;

    // tween layer: keyframes eased from a snapshot toward (live base ⊕ key)
    const base = this.basePose();
    if (this.action) {
      const a = this.action, keys = a.m.keys;
      a.t += dt * (a.m.power ? c('attackSpeed') * (1 + c('comboSpeed') * (this.w.combo - 1)) * (a.m.weapon && this.weapon ? weaponSpeed(this.weapon) : 1) : 1);
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
      // limits are applied after the filter so spring overshoot never hyperextends a joint; a pose authored past a limit is kept
      if (b.min !== undefined) this.disp[j] = clamp(this.disp[j], Math.min(b.min, x), Math.max(b.max, x));
      // stretch: fast-swinging bones lengthen, then ease back
      const want = b.len * (1 + b.stretch * Math.min(1, Math.abs(this.disp[j] - this.prev[j]) / dt / 1500));
      this.lens[j] += (want - this.lens[j]) * (1 - Math.exp(-30 * dt));
    }

    if (this.rag) this.ragStep(dt);
    this.plantFeet(dt);
  }
  // foot planting (plant setting): a foot the animation puts on the floor stays at its spot in the world and its leg bends to reach it
  // (two-bone IK on the bones above the ankle, the knee bending the way the animation bends it); a foot left more than plantStep
  // from where the animation puts it steps there, one foot at a time. The result (planted) is what is drawn and hit; the springs keep disp
  plantFeet(dt) {
    const c = k => this.c(k), ch = this.ch;
    this.planted = null;
    if (!c('plant') || !this.grounded || this.kd || this.rag || this.spin || this.y < 0) { this.feet = []; return; }
    const wa = {}, L = fk(ch, this.disp, 1, this.lens, wa), p = { ...this.disp }, k = this.face * (1 - this.sq * 0.5);
    let fy = 0; for (const b of ch.bones) fy = Math.max(fy, L[b.id][1] + (b.shape === 'circle' ? b.len : 0));
    ch.chains.leg.forEach((cn, i) => {
      const ai = cn.length >= 3 ? cn.length - 2 : cn.length - 1, a = cn[ai], th = cn[ai - 1], tip = cn[cn.length - 1];
      if (!th || fy - Math.max(L[a.id][1], L[tip.id][1]) > 4) { this.feet[i] = null; return; } // lifted by the animation: it leads
      const wx = this.x + L[a.id][0] * k, f = this.feet[i] ??= { x: wx, from: wx, t: 1 }; // t < 1: stepping from from to x
      const far = Math.abs(f.x - wx), busy = this.feet.some(o => o && o !== f && o.t < 1);
      if (f.t >= 1 && far > c('plantStep') && (!busy || far > c('plantStep') * 2.5)) { f.from = f.x; f.t = 0; }
      let fx = f.x, lift = 0;
      if (f.t < 1) {
        f.x = wx + (wx - f.from) * 0.25; // lands a little past where the animation wants it
        f.t = Math.min(1, f.t + dt / c('plantStepT'));
        fx = f.from + (f.x - f.from) * EASE.inOutCubic(f.t); lift = Math.sin(Math.PI * f.t) * c('plantLift');
      }
      // the leg: thigh (th) from its root o, shin (a) to the ankle at (tx, ty), in the unflipped rig space
      const pb = ch.by[th.parent], pw = pb ? wa[pb.id] : 0, o = L[th.parent || 'hip'], l1 = this.lens[th.id], l2 = this.lens[a.id];
      const tx = (fx - this.x) / k - o[0], ty = L[a.id][1] - lift - o[1], d = clamp(Math.hypot(tx, ty), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
      const base = Math.atan2(tx, ty) / R, al = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)) / R;
      const w1 = [base + al, base - al].reduce((m, w) => Math.abs(wrap180(w - wa[th.id])) < Math.abs(wrap180(m - wa[th.id])) ? w : m);
      const kn = [o[0] + Math.sin(w1 * R) * l1, o[1] + Math.cos(w1 * R) * l1], w2 = Math.atan2(o[0] + tx - kn[0], o[1] + ty - kn[1]) / R;
      const set = (b, w, pw, prw) => { p[b.id] = this.disp[b.id] + wrap180(w - pw + b.level * (pw - prw) - this.disp[b.id]); };
      set(th, w1, pw, pb ? pb.restW : 0); set(a, w2, w1, th.restW);
    });
    this.planted = p;
  }
  // this substep's strikes against the foes (after every fighter has moved, so two strikes in the same frame can clash)
  // foes: every fighter on another team (one move can hit several)
  // the strikes that land this substep go to out: World.step applies them once every fighter's are found
  strike(foes, out) {
    const c = k => this.c(k), a = this.action, ss = a?.m.keys[a.i].active ? this.strikeShapes(a.m) : [];
    const otg = c('otg') === 'all' || c('otg') === 'flagged' && a?.m.otg;
    if (ss.length) for (const o of foes) if (!a.hits.includes(o) && Math.abs(o.z - this.z) <= c('zReach') * (a.m.wide ? 3 : 1)) {
      if (a.m.height === 'high' && o.crouching) continue; // highs pass over a crouching fighter
      if (a.m.throw && (!o.grounded || !o.free || o.heldBy || o.squatT > 0)) continue; // throws only catch a standing, free fighter
      const cl = this.clashWith(o, ss);
      if (cl) { this.w.clash(this, o, cl); break; }
      // several striking bones: the deepest overlap counts, one hit per foe per move
      const h = ss.map(s => o.hurtAt(s, c('hitTest') === 'target', otg)).reduce((best, h) => h && (!best || h.d < best.d) ? h : best, null);
      if (h) { a.hits.push(o); a.hit = true; out.push({ f: this, o, h, a, m: this.weaponHit(a.m), key: a.m.keys[a.i] }); }
    }
    this.lastTips = Object.fromEntries(ss.map(s => [s.id, s[1]]));
  }

  // ---------- ragdoll (falls setting): a knocked-down body as point masses joined by its bones ----------
  // it starts from the drawn joints; ragStep simulates it and writes the bone angles back, so drawing and hit tests stay as they are
  startRag() {
    const P = this.body(), p = {};
    for (const id in P) {
      const b = this.ch.by[id];
      p[id] = { x: P[id][0], y: P[id][1], vx: 0, vy: 0, r: b?.shape === 'circle' ? b.len : 0,
        im: 1 / (b ? Math.max(40, b.len * (b.thick ?? BONE.thick) * (b.shape === 'circle' ? 3 : 1)) : 150) }; // (tiny bones aren't featherweight: they'd jitter)
    }
    this.rag = { p, tone: 1, landed: false };
  }
  endRag() { if (this.rag) { this.rag = null; this.y = Math.min(0, this.y); } }
  // a blow: the body's speed changes to the knockback (this.vx, this.vy), the topple share concentrated at the joints near the impact
  ragHit(hit) {
    const ps = Object.values(this.rag.p), n = ps.length, tp = this.c('topple');
    const dx = this.vx - ps.reduce((s, q) => s + q.vx, 0) / n, dy = this.vy - ps.reduce((s, q) => s + q.vy, 0) / n;
    const w = ps.map(q => Math.exp(-Math.hypot(q.x - hit.pt[0], q.y - hit.pt[1]) / 18)), ws = w.reduce((s, v) => s + v, 0) || 1;
    ps.forEach((q, i) => { const k = (1 - tp) + tp * Math.min(4, w[i] / ws * n); q.vx += dx * k; q.vy += dy * k; });
    this.rag.landed = false;
  }
  ragStep(dt) {
    const r = this.rag, ch = this.ch, c = k => this.c(k), G = this.groundY, d = this.dir, ps = Object.values(r.p), hip = r.p.hip;
    const ref = ch.chains.spine[0]?.[0], tw = {};
    fk(ch, this.target, 1, null, tw); // the fall pose's world angles: the muscles pull toward its joint angles
    let land = -1; // > -1: the body (not just the feet) touched the floor this substep, at that speed
    // limp: on the floor the muscles let go within a few tenths of a second, a knocked-out body already in the air
    if (r.landed || this.kd === 'down' || this.ko) r.tone = Math.max(0.05, r.tone * Math.exp(-(this.ko ? 4 : 6) * dt));
    if (this.splatT > 0) for (const q of ps) q.vx = q.vy = 0; // stuck on the wall
    else {
      // muscle tone toward the fall pose, and the joint limits, as damped springs on each joint's angular speed
      // (an equal and opposite push on the bone and its parent, so the body gains no spin or drift from its own muscles;
      // roots like the thighs are measured against the spine's root, which itself turns freely: the body tumbles;
      // every joint is relative to its parent, even ones the poses keep level like the feet, or they fight the floor)
      if (ref) {
        const A = {}, Om = {};
        for (const b of ch.bones) {
          const a = r.p[b.parent || 'hip'], e = r.p[b.id], ex = e.x - a.x, ey = e.y - a.y, l2 = ex * ex + ey * ey || 1e-6;
          A[b.id] = Math.atan2(ex * d, ey) / R; Om[b.id] = (ey * (e.vx - a.vx) - ex * (e.vy - a.vy)) * d / l2;
        }
        const K = 400 * c('tone') * r.tone, KL = 3000, KS = 150;
        for (const b of ch.bones) {
          if (b === ref) continue;
          const pb = ch.by[b.parent], pid = pb ? pb.id : ref.id, a = r.p[b.parent || 'hip'], e = r.p[b.id], far = r.p[pb ? pb.parent || 'hip' : ref.id];
          const rel = A[b.id] - (pb ? A[pid] : A[pid] - ref.restW), tgt = pb ? tw[b.id] - tw[pb.id] : tw[b.id] - (tw[ref.id] - ref.restW);
          const om = Om[b.id] - Om[pid];
          let k = K, f = K * wrap180(tgt - rel) * R;
          if (b.min !== undefined) {
            const mid = (b.min + b.max) / 2, x = mid + wrap180(rel - mid), over = x < b.min ? b.min - x : x > b.max ? b.max - x : 0;
            if (over) { k += KL; f += KL * over * R; }
            // slack: a limp body's hinges (knees, elbows: rest angle at one end of the range) still settle bent, not straight as a rope
            // (the less tone, the more slack): about to the middle of their range, a different amount per joint and body
            const z = clamp(b.a ?? 0, b.min, b.max), ks = KS * (1 - c('tone') * r.tone);
            if (pb && Math.min(z - b.min, b.max - z) < (b.max - b.min) / 5) { k += ks; f += ks * (z + (mid - z) * (0.8 + 0.4 * wander(this.seed + ch.bones.indexOf(b) * 3.7)) - x) * R; }
          }
          // implicit (backward Euler) spring and critical damper: stable however stiff
          const dw = (om + dt * f) / (1 + 2 * Math.sqrt(k) * dt + k * dt * dt) - om;
          const ex = e.x - a.x, ey = e.y - a.y, fx = far.x - a.x, fy = far.y - a.y;
          const Ic = (ex * ex + ey * ey) / e.im, Ip = (fx * fx + fy * fy) / far.im, wc = Ip / (Ic + Ip + 1e-9);
          const dex = (dw * wc) * ey * d, dey = -(dw * wc) * ex * d, dfx = -(dw * (1 - wc)) * fy * d, dfy = (dw * (1 - wc)) * fx * d;
          e.vx += dex; e.vy += dey; far.vx += dfx; far.vy += dfy;
          a.vx -= (dex / e.im + dfx / far.im) * a.im; a.vy -= (dey / e.im + dfy / far.im) * a.im;
          Om[b.id] += dw * wc; Om[pid] -= dw * (1 - wc);
        }
      }
      const cb = c('ceiling');
      for (const q of ps) { q.ox = q.x; q.oy = q.y; q.vy += c('gravity') * dt; q.pvx = q.vx; q.x += q.vx * dt; q.y += q.vy * dt; q.hit = 0; q.top = 0; }
      for (let it = 0; it < 4; it++) {
        // bones keep their length
        for (const b of ch.bones) {
          const a = r.p[b.parent || 'hip'], e = r.p[b.id], ex = e.x - a.x, ey = e.y - a.y, l = Math.hypot(ex, ey) || 1e-6, s = (l - b.len) / l / (a.im + e.im);
          a.x += ex * s * a.im; a.y += ey * s * a.im; e.x -= ex * s * e.im; e.y -= ey * s * e.im;
        }
        // floor and arena edges
        for (const q of ps) {
          if (q.y > G - q.r) { q.hit = q.hit || Math.max(1, q.vy); q.y = G - q.r; }
          if (cb && q.y < CEIL + q.r) { q.top = Math.min(q.top, q.vy); q.y = CEIL + q.r; }
          q.x = clamp(q.x, 20, W - 20);
        }
      }
      const damp = Math.exp(-0.8 * dt);
      let ceil = 0;
      for (const [id, q] of Object.entries(r.p)) {
        q.vx = (q.x - q.ox) / dt * damp; q.vy = (q.y - q.oy) / dt * damp;
        const sp = Math.hypot(q.vx, q.vy); if (sp > 2500) { q.vx *= 2500 / sp; q.vy *= 2500 / sp; }
        if (q.hit) { // on the floor: friction, and a bounce off a hard landing
          q.vx *= Math.max(0, 1 - c('floorGrip') * dt);
          if (q.hit > 150) q.vy = -q.hit * c('floorBounce') * 0.6;
          if (ch.by[id]?.role !== 'leg') land = Math.max(land, q.hit);
        }
        if (q.top < 0) { q.vy = -q.top * cb; ceil = Math.max(ceil, -q.top); } // off the ceiling
      }
      if (ceil > 150) this.w.trauma = Math.min(1, this.w.trauma + 0.2 * Math.min(1, ceil / 800));
      // the hips hit a wall: splat (move flag wall) or bounce back
      if ((hip.x <= 40 || hip.x >= W - 40) && Math.sign(hip.pvx) === Math.sign(hip.x - W / 2)) {
        const imp = Math.min(1, Math.abs(hip.pvx) / 600), wb = c('wallBounce');
        if (this.splat && imp > 0.15) { this.splat = false; this.splatT = 0.35; this.say('WALL'); this.w.trauma = Math.min(1, this.w.trauma + 0.3 * imp); }
        else if (wb && imp > 0.15) { for (const q of ps) q.vx = -q.pvx * wb; this.w.trauma = Math.min(1, this.w.trauma + 0.2 * imp); }
      }
    }
    // the first landing of a flight: a ground bounce, a tech (G just before), or dust
    if (land > -1 && this.kd === 'fly' && !r.landed) {
      r.landed = true;
      const imp = Math.min(1, land / 800);
      if (this.gb) { this.gb = false; for (const q of ps) q.vy = Math.min(q.vy, -420); r.landed = false; this.say('BOUNCE'); this.w.trauma = Math.min(1, this.w.trauma + 0.25 * imp); }
      else if (!this.ko && c('techWindow') && this.w.simT - this.guardT < c('techWindow')) {
        this.endRag(); this.kd = null; this.grounded = true; this.y = 0; this.start('getup'); this.hurtT = 0.3; this.vx = -this.dir * 150; this.say('TECH');
        return;
      } else if (this.bounces < c('bounces') && land * c('floorBounce') > 150) { // a floor bounce (bounces setting): the whole body pops up
        this.bounces++; r.landed = false; for (const q of ps) q.vy = Math.min(q.vy, -land * c('floorBounce'));
        this.w.dust(hip.x, G, imp, this.z); this.w.trauma = Math.min(1, this.w.trauma + 0.15 * imp);
      } else if (land > 150) { this.w.dust(hip.x, G, imp, this.z); this.w.trauma = Math.min(1, this.w.trauma + 0.15 * imp); }
    }
    // the bone angles from the joints, unwrapped next to the last ones so the springs never spin a full turn afterwards
    const Wa = {};
    for (const b of ch.bones) {
      const a = r.p[b.parent || 'hip'], e = r.p[b.id], pb = ch.by[b.parent];
      const Wb = Wa[b.id] = Math.atan2((e.x - a.x) * d, e.y - a.y) / R;
      const p = pb ? Wb - Wa[pb.id] + b.level * (Wa[pb.id] - pb.restW) : Wb;
      this.disp[b.id] = this.prev[b.id] + wrap180(p - this.prev[b.id]);
      this.lens[b.id] = Math.hypot(e.x - a.x, e.y - a.y);
      this.flt[b.id].reset(this.disp[b.id]);
    }
    let low = -1e9; for (const q of ps) low = Math.max(low, q.y + q.r);
    this.x = hip.x; this.y = Math.min(0, low - G); this.face = d; this.sq = this.sqv = 0; this.spin = 0;
    this.vx = ps.reduce((s, q) => s + q.vx, 0) / ps.length; this.vy = ps.reduce((s, q) => s + q.vy, 0) / ps.length;
    // it lies still once it has landed and slowed down (or after a long tumble)
    if (this.kd === 'fly' && this.splatT <= 0 && (r.landed && Math.hypot(this.vx, this.vy) < 60 || this.flyT > 3)) {
      this.kd = 'down'; this.downT = 0.6; this.splat = false; this.grounded = true;
    }
  }

  // the strike this substep as a capsule [from, to, radius], per the collision mode:
  // drawn = striking joint of the drawn (sprung) pose · target = of the keyframe pose, ignoring springs
  // swept = path of the drawn joint since last substep (fast strikes can't tunnel) · limb = the whole striking bone
  // (one per striking bone, each tagged with its bone id)
  strikeShapes(m) {
    const mode = this.c('hitTest'), P = mode === 'target' ? this.points(this.target) : this.body(), r = this.c('hitR') + (m.throw ? this.c('grabReach') : 0);
    // a weapon strikes along its whole length (a staff behind the hand too), nunchucks with both sticks
    const ids = hitIds(m).flatMap(id => id === 'weapon' && this.ch.by.weaponTip ? [id, 'weaponTip'] : [id]);
    return ids.map(id => this.ch.by[id]).filter(Boolean).map(b => {
      const tip = P[b.id], o = P[b.parent || 'hip'], k = -(b.back || 0) / b.len;
      const s = b.role === 'weapon' ? [[o[0] + (tip[0] - o[0]) * k, o[1] + (tip[1] - o[1]) * k], tip, r]
        : mode === 'limb' ? [o, tip, r + b.thick / 2] : [mode === 'swept' && this.lastTips?.[b.id] || tip, tip, r];
      s.id = b.id; return s;
    });
  }
  // the held weapon's shapes (as if it struck), for clashes and the boxes view
  weaponShapes() { return this.ch.weapon ? this.strikeShapes({ hit: 'weapon' }) : []; }
  // active strikes that meet: the meeting point, or null (clash setting: only when a weapon is in it, or any strikes)
  clashWith(o, ss) {
    const mode = this.c('clash'), oa = o.action;
    if (mode === 'off' || this.action.m.throw || !oa?.m.keys[oa.i]?.active || oa.m.throw || oa.hits.includes(this)) return null;
    const wpn = (f, s) => f.ch.by[s.id]?.role === 'weapon', half = (f, s) => (f.ch.by[s.id]?.thick ?? BONE.thick) / 2;
    for (const s of ss) for (const t of o.strikeShapes(oa.m))
      if ((mode === 'all' || wpn(this, s) || wpn(o, t)) && distSegSeg(s[0], s[1], t[0], t[1]) < s[2] + t[2] + half(this, s) + half(o, t)) return [(s[1][0] + t[1][0]) / 2, (s[1][1] + t[1][1]) / 2];
    return null;
  }
  // the hurt bone the strike overlaps most, or null
  hurtAt([s0, s1, r], useTarget, otg) {
    const a = this.action;
    if (this.kd === 'down' && !otg || a?.m.inv || a?.m.keys[a.i]?.inv || this.dodgeT > 0) return null;
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
    const bs = m.bstun || (m.stun || 0.4) * this.c('blockStun');
    this.hurtT = this.blockT = bs; this.guarding = true; this.combo = 0; this.buffer = null; this.parryT = 0;
    this.vx = att.dir * (m.bpush || m.knock * this.c('blockPush')) * this.c('powerScale') / this.ch.stats.weight;
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
    // disarm: a knockdown or a blow hard enough knocks the weapon loose
    if (this.ch.weapon && !this.rag && this.w.items && (m.kd || m.power * this.c('powerScale') >= this.c('disarm'))) { this.letGo(false); this.say('DISARM'); }
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
    const ps = this.c('powerScale');
    this.vx = att.dir * m.knock * ps * (juggle ? 0.6 : 1) / this.ch.stats.weight;
    if (m.kd || m.crumple || juggle || combo >= 7 || this.ko) {
      this.juggles = this.kd ? this.juggles + 1 : 0;
      this.kd = 'fly'; this.bounces = otg ? 99 : 0; this.grounded = false; this.action = null; this.hurtT = 0; // hit off the ground: a small pop, no bounce
      this.vy = -Math.max((m.launch || 300) * ps, this.ko ? 380 : 0) * this.c('juggleDecay') ** this.juggles / this.ch.stats.weight;
      this.splat = !!m.wall; this.gb = !!m.bounce && !otg; this.splatT = 0; this.flyT = 0;
      if (m.crumple && !juggle) { this.vx = att.dir * 30; this.vy = -120; this.bounces = 99; this.say('CRUMPLE'); } // folds where it stands
      if (this.c('falls') === 'ragdoll') { if (!this.rag) this.startRag(); this.rag.tone = m.crumple && !juggle ? 0.15 : 1; this.ragHit(hit); }
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
    const P = this.body(), sd = Math.sign(this.face) || 1, k = 30000 * m.power * ps * this.c('impact');
    const fx = att.dir, fy = m.launch ? -0.6 : m.height === 'low' ? 0 : -0.2, fn = Math.hypot(fx, fy);
    for (let b = hit.bone; b; b = this.ch.by[b.parent]) {
      const o = P[b.parent || 'hip'], rx = hit.pt[0] - o[0], ry = hit.pt[1] - o[1];
      this.flt[b.id].yd += (fx * ry - fy * rx) * sd / fn * k / b.inertia * b.react; // force · tangent of the pivot's rotation
    }
    // plus a little noise so repeated hits never land identically
    for (const b of this.ch.bones) this.flt[b.id].yd += this.w.rand(-1, 1) * 80 * m.power * (b.lag + 0.5) * b.react;
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
  body() { return this.points(this.planted || this.disp, this.lens); }
  recordTrail() {
    const P = this.body();
    this.trail.push(this.ch.tips.map(b => P[b.id]));
    if (this.trail.length > 24) this.trail.shift();
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
    else if (this.dodgeT > 0) { ctx.globalAlpha = 0.4; drawFigure(ctx, this.ch, P, this.col[0], this.col[1]); ctx.globalAlpha = 1; } // air dodge: see-through
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
