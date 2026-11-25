'use strict';
// Fighter, part 1 of 6: state, stances, poses and the frame update. The rest of its methods are added by fighter-moves.js, fighter-hits.js, fighter-legs.js, fighter-rag.js and fighter-draw.js (load in that order)
// a key's per-bone multipliers (key.len, key.thick, key.alpha): tweened toward like the pose, 1 = no change, eased back after
// (len feeds the hurtbox and reach too, a Dhalsim limb; thick and alpha are drawing only)
const KEY_MULS = ['len', 'thick', 'alpha'];
const WARP_T = 0.45; // seconds a streak teleport's look takes (drawing only)
// a lying body (pose falls): turned about the hips to the angle where its joints sit lowest over its lowest point,
// so no pose leaves the torso or head hanging in the air above the floor
function settle(ch, L) {
  const rot = (a, f) => { const c = Math.cos(a), s = Math.sin(a); for (const k in L) f(k, L[k][0] * c - L[k][1] * s, L[k][0] * s + L[k][1] * c); };
  const gap = a => { let lo = -Infinity, sum = 0; const ys = [];
    rot(a, (k, x, y) => { const b = ch.by[k], r = b?.shape === 'circle' ? b.len : 0; ys.push(y + r); lo = Math.max(lo, y + r); });
    for (const y of ys) sum += lo - y; return sum; };
  let best = 0, bg = gap(0);
  for (let a = -0.6; a <= 0.6; a += 0.04) { const g = gap(a); if (g < bg) { bg = g; best = a; } }
  if (best) rot(best, (k, x, y) => { L[k] = [x, y]; });
}
class Fighter {
  // drawing-only history: a state copy shares it instead of copying it (cloneState)
  static byRef = ['poseHist', 'trail'];
  constructor(w, x, dir, col, ch, over = {}) {
    Object.assign(this, { id: w.nid++, w, x, groundY: w.groundY, dir, face: dir, col: ch.col || col, ch, over, y: 0, vx: 0, vy: 0, grounded: true,
      time: 0, seed: w.rand(0, 100), walkPh: 0, lean: 0, inp: NOIN,
      action: null, buffer: null, squatT: 0, hurtT: 0, freeze: 0, flashT: 0, crouching: false,
      kd: null, downT: 0, wake: null, won: false, wallB: false, bounces: 0, combo: 0, comboShown: 0, comboT: 0, comboPop: 0, lastHurt: null,
      sq: 0, sqv: 0, trail: [], poseHist: [], dirs: [], pressT: { punch: -1e9, kick: -1e9, special: -1e9 }, guardHeld: false, guardPressT: -1e9, used: [], juggles: 0, jugUsed: 0,
      z: 0, vz: 0, lane: 0, dashT: 0, wallJumpT: 0, passT: 0, invT: 0, after: [], afterT: 0, running: false, tap: null, prevIn: NOIN, flip: 0, spin: 0, airT: 0,
      guarding: false, blockT: 0, parryT: 0, ko: false, label: '', labelT: 0, stunM: 0, power: 0, dizzyT: 0, reelT: 0, splatT: 0, splat: false, gb: false, heldBy: null, heldM: null, heldT: 0, heldAt: 0, blocked: null, flyT: 0, guardT: -9, stanceI: 0,
      airJumps: 0, taking: null, lowAt: -9, superJ: false, airDodged: false, airDashed: false, dodgeT: 0, airDashT: 0, landT: 0, landK: 0, feet: [], planted: null, layerAt: {}, away: false, turnRate: 0, turnMid: null,
      stanceT: 0, stanceCd: {}, stanceUsed: [], morph: null, moveCount: {}, flyHit: [], chainN: 0 }); // time in the stance, when each stance was left, the stances taken (req.once), an auto morph, times each move has started (over.limits); flyHit: ids already clipped this flight (flyHits setting) - a plain array, not a Set, so it survives the replay checkpoint system's JSON state cloning; chainN: how many flyHits dominoes deep this flight is (0 = launched by a real attack)
    this.hp = this.c('health'); this.ch0 = ch.weapon ? armed(ch, '') : ch; // ch0: the character without its weapon
    this.target = this.basePose();
    this.disp = { ...this.target };
    this.prev = { ...this.target };
    this.flt = {}; this.lens = {}; this.mul = Object.fromEntries(KEY_MULS.map(p => [p, {}]));
    for (const b of ch.bones) { this.flt[b.id] = new SecondOrder(this.target[b.id]); this.lens[b.id] = b.len; for (const p of KEY_MULS) this.mul[p][b.id] = 1; }
  }
  // swap the body live (character editor, weapons): new bones start at the base pose, the running move is dropped.
  // keep (a stance body): the move goes on, bones new to the body join it where they are and grow from nothing, lengths ease over
  setChar(ch, keep = false) {
    const old = this.ch;
    this.ch = ch; this.ch0 = ch.weapon ? armed(ch, '') : ch; this.trail = [];
    if (!keep) this.action = null;
    const base = this.basePose();
    for (const b of ch.bones) {
      const fresh = keep && !old.by[b.id];
      if (!this.flt[b.id] || fresh) { this.flt[b.id] = new SecondOrder(base[b.id]); this.target[b.id] = this.disp[b.id] = this.prev[b.id] = base[b.id]; }
      if (!keep) this.lens[b.id] = b.len; else if (fresh) this.lens[b.id] = 0;
      for (const p of KEY_MULS) if (this.mul[p][b.id] === undefined) this.mul[p][b.id] = 1;
    }
    if (keep && this.action) for (const j of ch.ids) { this.action.from[j] ??= this.target[j]; for (const p of KEY_MULS) this.action.fromMul[p][j] ??= this.mul[p][j]; }
  }
  // switch to stance i: its body (stanceChar; a running move goes on) and its transition (MORPH; back to main: the left stance's).
  // how: 'switch' (the stance key), 'exit' (its limits: no transition move), 'instant' (previews: no transition)
  setStance(i, how = 'switch') {
    const old = this.st, from = this.stancePose(), lens = Object.fromEntries(this.ch.ids.map(j => [j, this.lens[j]])), had = Object.fromEntries(this.ch.bones.map(b => [b.id, b.len]));
    this.stanceCd[this.stanceI] = this.w.simT; // cooldown for the one being left (main's too: req.cooldown can gate a return to it)
    this.stanceI = i; this.stanceT = 0; this.morph = null;
    if (this.st.req.once) this.stanceUsed.push(i);
    const ch = stanceChar(this.ch, i);
    if (ch !== this.ch) this.setChar(ch, true);
    const mo = (i ? this.st : old).morph;
    if (how === 'instant') return;
    if (mo.mode === 'auto') this.morph = { from, lens, t: 0, T: Math.max(1, mo.T) / 60, ease: EASE[mo.ease] || mo.ease === 'bezier' ? mo.ease : 'linear', bz: mo.bz,
      gd: mo.grow ? growDelays(this.ch, had, Object.fromEntries(this.ch.bones.map(b => [b.id, b.len]))) : null };
    else if (mo.mode === 'move' && how === 'switch' && this.free && !this.action) {
      const n = (i && mo.move) || morphName(old.name, this.st.name);
      if (this.ch.moves[n]) { this.used = []; this.start(n); }
    }
  }
  // the stance pose the procedural layer builds on: during an auto morph, blended from the pose the switch started at
  stancePose() {
    const m = this.morph, to = this.st.pose;
    if (!m) return to;
    const p = {};
    for (const j in to) p[j] = (m.from[j] ?? to[j]) + (to[j] - (m.from[j] ?? to[j])) * morphAt(m, this.ch.by[j]);
    return p;
  }
  // its limits send it back to main (maxT, exitOn)
  stanceExit() { this.setStance(0, 'exit'); this.say(this.st.name.toUpperCase()); }
  // exitOn: hit | knockdown | block | grab
  exitOn(ev) { if (this.stanceI && this.st.req.exitOn.includes(ev)) this.stanceExit(); }
  // stance i's own requirements (STANCE_REQ), regardless of whether a switch away from the current one is allowed right now
  reqMet(i, where = true) {
    const r = this.ch.stances[i]?.req, mx = this.c('health'), hp = mx > 0 ? this.hp / mx : 1;
    if (!r) return false;
    if (where && !(r.grounded && this.grounded || r.air && !this.grounded)) return false;
    return hp <= r.hpBelow && hp >= r.hpAbove && !(r.once && this.stanceUsed.includes(i))
      && !(r.cooldown && i in this.stanceCd && this.w.simT - this.stanceCd[i] < r.cooldown - 1e-9);
  }
  // whether stance i can be switched to now: its requirements (where only when where is set: the switch itself checks it, a press
  // in the air still lands into the stance) and the current stance's minT (main's too: req.minT can hold it there a while)
  stanceOk(i, where = true) {
    if (i === this.stanceI || this.stanceT < this.st.req.minT - 1e-9) return false;
    return this.reqMet(i, where);
  }
  // req.auto stances need no key: the first one whose requirements hold is taken, and left the moment they stop holding
  checkAuto() {
    if (this.stanceI && this.st.req.auto && this.stanceT >= this.st.req.minT - 1e-9 && !this.reqMet(this.stanceI, false)) { this.stanceExit(); return; }
    for (let i = 1; i < this.ch.stances.length; i++) if (this.ch.stances[i].req.auto && this.stanceOk(i)) { this.say(this.ch.stances[i].name.toUpperCase()); this.setStance(i); return; }
  }
  c(k) { // character stats scale their settings
    const v = this.over[k] ?? this.w.cfg[k], s = STAT_OF[k];
    return !s ? v : s.f ? s.f(v, this.ch.stats) : v * this.ch.stats[s.k];
  }
  get free() { return this.hurtT <= 0 && !this.kd; }
  get st() { return this.ch.stances[this.stanceI] || this.ch.stances[0]; } // the current stance: its pose and binds
  get binds() { return this.st[bindsKey(this.c('plane'))]; } // the stance's input table for this plane (2D or 2.5D)

  // the procedural pose plus the movement layers (LAYERS): each plays from when its state began, adding its keys' offsets from its ref pose
  basePose() {
    const P = this.procPose(), ch = this.ch, t = this.time;
    for (const k in LAYERS) {
      const m = ch.moves[loopName(ch, this.stanceI, k + 'Layer')], wt = m && LAYERS[k][1](this);
      if (!wt) { delete this.layerAt[k]; continue; }
      const L = samplePose(ch, m, (t - (this.layerAt[k] ??= t)) % total(m), this.c('easing')), mix = wt * (m.mix ?? 1);
      for (const j in L) P[j] += (L[j] - (m.ref[j] ?? L[j])) * mix;
    }
    return P;
  }
  // the procedural layer, driven by bone roles so any skeleton breathes, walks and leans
  procPose() {
    const ch = this.ch, ps = ch.poses, base = this.stancePose(), P = { ...base }, t = this.time, g = ch.gait;
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
    if (!this.grounded && !this.st.fly) {
      const k = this.flip ? 0 : clamp(this.vy / 500, 0, 1); // tuck while rising (and through a flip), reach for the ground while falling
      for (const j in ps.air) P[j] = ps.air[j] + ((ps.airFall[j] ?? ps.air[j]) - ps.air[j]) * k;
      this.airLegs(P, turn, flex);
    } else if (this.crouching || this.squatT > 0) Object.assign(P, ps.crouch);
    else {
      const w = Math.min(1.6, Math.hypot(this.vx, this.vz) / this.c('maxSpeed')), ph = this.walkPh, back = this.vx * this.dir < 0;
      const st = back ? g.backStride : 1, id = Math.max(0, 1 - w), s = this.seed, amp = id * g.idleAmt;
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
        const run = back ? 0 : clamp((w - g.runAt) / 0.25, 0, 1) * g.run; // past runAt × top speed the walk becomes a run
        this.walkLegs(P, base, ph, w * (back ? g.backStride : 1), w, run);
        if (run) { turn(spine, 10 * run); ch.chains.arm.forEach(c => flex(c[1], 55 * run)); }
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
    // mid turn the body gathers in (turnTuck): knees bend, arms pull in, the spine hunches, so it reads as a pivot, not a card flipping
    // landing: the knees stay bent a moment after touchdown, as deep as the fall was fast, and straighten (landBend)
    if (this.landT > 0 && this.grounded) { const lk = this.landK * Math.min(1, this.landT / 0.25) * g.landBend; ch.chains.leg.forEach(c => { flex(c[1], 45 * lk); turn(c[0], 22 * lk); }); turn(spine, 8 * lk); }
    // turning on the ground: one pivot step, the back foot swinging through as the body comes round (turnStep)
    const tp = 1 - Math.abs(this.face);
    if (tp && this.grounded && g.turnStep && !this.action) ch.chains.leg.forEach((c, i) => { const sw = Math.sin(Math.PI * (this.face * this.dir + 1) / 2) * (i % 2 ? -1 : 1);
      turn(c[0], sw * 18 * g.turnStep); flex(c[1], Math.max(0, sw) * 30 * g.turnStep); });
    const tk = tp * this.c('turnTuck');
    if (tk) { ch.chains.leg.forEach(c => flex(c[1], 30 * tk)); ch.chains.arm.forEach(c => flex(c[1], 40 * tk)); turn(spine, -10 * tk); }
    turn(spine, this.lean);
    return P;
  }
  update(dt, inp) {
    const c = k => this.c(k);
    this.inp = inp;
    this.time += dt; this.hurtT -= dt; this.flashT -= dt; this.comboT -= dt; this.stanceT += dt;
    if (this.stanceI && this.st.req.maxT && this.stanceT >= this.st.req.maxT - 1e-9) this.stanceExit();
    if (this.morph && (this.morph.t += dt) >= this.morph.T - 1e-9) this.morph = null;
    this.comboPop *= Math.exp(-10 * dt);
    if (this.free) this.combo = 0;
    if (this.heldBy) this.held(dt, inp);
    if (this.taking) this.reach(dt);

    // start a move, or chain into the next one once the current move's active frames are over
    const a0 = this.action;
    if (this.buffer?.b === 'stance' && this.free && !a0 && this.stanceOk(this.buffer.to)) {
      const to = this.buffer.to; this.buffer = null; this.say(this.ch.stances[to].name.toUpperCase()); this.setStance(to);
    } else if (this.free && !a0) this.checkAuto();
    // 2D: J / K with ↑ held in the jump squat is an up attack instead of a jump
    if (this.buffer && this.squatT > 0 && inp.up && this.buffer.b !== 'stance' && this.c('plane') === '2d') this.squatT = 0;
    if (this.buffer && this.free && this.squatT <= 0 && this.face * this.dir > 0 && this.dodgeT <= 0) { // not mid turn or air dodge
      const { b } = this.buffer;
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
      // guard scheme: → / ← pressed with G held (or together with it), free on the ground, rolls that way
      const roll = (k === 'left' || k === 'right') && inp.guard && this.blockT <= 0 && this.free && !this.action && this.grounded && this.squatT <= 0 && this.special(k === fwdK ? 'G6' : 'G4');
      if (roll) { this.used = []; this.start(roll); this.tap = null; continue; }
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
      // air recovery: G a while into a knockdown flight flips the fighter back onto its feet; ← / → held aims the recovery that way
      if (this.kd === 'fly' && !this.ko && c('airRecover') && this.flyT >= c('airRecover') - 1e-9 && this.splatT <= 0) {
        const x = inp.right - inp.left;
        this.endRag(); this.kd = null; this.hurtT = 0; this.flip = -1; this.airT = 0; this.vy = Math.min(this.vy, -250); this.vx = x ? x * 450 : this.vx * 0.3; this.say('RECOVER');
      }
    }
    if (this.kd === 'fly') this.flyT += dt;
    // in blockstun (guard scheme: P / K, motion: → S / ← S): a guard cancel strikes back, a push block shoves the attacker off
    if (this.blockT > 0 && !this.heldBy) {
      const p = this.prevIn, x = (inp.right - inp.left) * this.dir;
      const t = inp.punch && !p.punch ? 'bP' : inp.kick && !p.kick ? 'bK' : inp.special && !p.special && x ? (x > 0 ? 'b6S' : 'b4S') : '';
      const n = t && this.special(t);
      if (n) this.guardOut(n);
    }
    const upTap = inp.up && !this.prevIn.up;
    this.prevIn = inp;
    if (!inp[fwdK] || !this.free || this.action) this.running = false;
    this.dashT -= dt; this.wallJumpT -= dt; this.passT -= dt; this.invT -= dt; this.blockT -= dt; this.parryT -= dt; this.labelT -= dt; this.dodgeT -= dt; this.airDashT -= dt; this.landT -= dt; this.dizzyT -= dt; this.reelT -= dt; this.splatT -= dt;
    if (this.free) this.stunM = Math.max(0, this.stunM - c('dizzyDrain') * dt);
    if (this.grounded && !this.kd) this.jugUsed = 0; // back on its feet: the juggle pool refills
    // guard: held while free on the ground (or in the air: airGuard), and kept through blockstun; with ↓ it is a low guard (in the belt too)
    const busy = this.action && !this.action.m.hurt;
    this.guarding = this.blockT > 0 || inp.guard && this.free && (this.grounded || c('airGuard')) && !busy && this.squatT <= 0;
    this.crouching = (this.free || this.blockT > 0) && inp.down && this.grounded && (c('plane') !== 'belt' || this.guarding);

    // horizontal: accelerate toward desired speed, never snap
    const locked = !this.free || (busy && this.grounded) || this.squatT > 0 || this.crouching || this.dashT > 0 || this.guarding;
    const air = !this.grounded && this.free; // drifting in the air: its own top speed and control
    if (this.chase && (this.grounded ? this.squatT <= 0 : !this.free || this.vy > 0)) this.chase = null; // a chase jump steers on the way up
    const o = air && this.chase, steer = o && clamp((o.x - Math.sign(o.x - this.x || this.dir) * 28 - this.x) * 8, -c('airSpeed') * 1.6, c('airSpeed') * 1.6);
    const want = o ? steer : locked ? 0 : (inp.right - inp.left) * (air ? c('airSpeed') : c('maxSpeed') * (this.running ? c('runSpeed') : 1));
    const drag = this.dashT > 0 ? 0.1 : this.kd === 'fly' ? 0.05 : !this.free ? 0.35 : busy ? 0.4 : 1; // dashes, lunges and knockback slide
    const rate = this.airDashT > 0 || this.dodgeT > 0 ? 0 : o ? c('airAccel') * 2 : air ? c('airAccel') : want && Math.sign(want) === Math.sign(this.vx || want) ? c('accel') : c('decel') * drag;
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
      } else if (this.wallB && imp > 0.15) { // a wall bounce (move flag wallbounce): back out at wallBounceSpeed, a fresh juggle
        this.wallBounced(); this.vx = -Math.sign(this.vx) * c('wallBounceSpeed'); this.vy = Math.min(this.vy, -300); this.flailJolt(imp);
      } else if (wb && imp > 0.15) { // off the wall: back into the arena, popped up a little
        this.vx *= -wb; this.vy = Math.min(this.vy, -120 * imp); this.flailJolt(imp);
        this.w.trauma = Math.min(1, this.w.trauma + 0.2 * imp);
      } else this.vx = 0;
    }
    this.depth(dt, inp, busy);
    const leg = this.ch.chains.leg[0], ll = leg ? leg[0].len + (leg[1]?.len || 0) : 45, back = this.vx * this.dir < 0;
    this.walkPh += Math.hypot(this.vx, this.vz) * (back ? -1 : 1) * dt * 3.3 / ll / (back ? this.ch.gait.backStride : 1) / Math.max(0.3, this.ch.gait.stride); // one cycle per two strides: the feet keep pace with the floor
    this.face = approach(this.face, this.dir, dt * Math.max(c('turnSpeed'), this.turnRate)); // turn through a squashed profile instead of flipping
    if (this.face === this.dir && !this.turnMid) this.turnRate = 0;

    // vertical: jump squat (anticipation) -> launch -> land
    // jump cancel: a move that connected can be jumped out of once its active frames are over (juggles)
    // a launcher that hit: ↑ held (chaseJump press) or nothing (auto) jumps after the victim at once
    const chase = busy && this.action.hit && this.action.m.launcher && c('chaseJump') !== 'off' ? this.action.hits.find(o => o.kd) : null;
    const jc = busy && this.action.hit && (this.action.i >= this.action.m.cancel && c('jumpCancel') || !!chase);
    const hop = inp.hop || flat && upTap || chase && (c('chaseJump') === 'auto' || inp.up); // 2D: ↑ jumps too
    if (inp.down && this.grounded) this.lowAt = this.w.simT; // super jump: ↓ shortly before the jump
    const wall = this.x < 40 + c('wallJumpReach') ? 1 : this.x > W - 40 - c('wallJumpReach') ? -1 : 0;
    // vault: a grounded hop close in front of a grounded foe leapfrogs it instead of jumping (needs the move vault)
    const vFoe = this.w.nearestFoe(this), vr = c('vaultRange');
    const canVault = vr > 0 && this.ch.moves.vault && vFoe && vFoe.grounded && Math.abs(vFoe.z - this.z) <= c('zReach') && (vFoe.x - this.x) * this.dir > 0 && (vFoe.x - this.x) * this.dir <= vr;
    if (hop && canVault && this.grounded && this.free && !busy && this.squatT <= 0 && !this.st.fly) {
      this.start('vault');
    } else if (hop && this.grounded && this.free && (!busy || jc) && this.squatT <= 0 && !this.st.fly) {
      this.superJ = c('superJump') > 1 && this.w.simT - this.lowAt <= c('superJumpWindow');
      this.squatT = (c('jumpSquat') || 1e-6) * (this.superJ ? 1.5 : 1);
      if (jc) this.action = null;
      this.chase = chase;
    } else if (hop && wall && !this.grounded && this.free && !busy && c('wallJump') > 0 && this.airT > 0.1 && !this.st.fly) { // triangle jump: off the wall, up and away
      this.vy = -c('jumpVel') * c('wallJump'); this.vx = wall * c('wallJumpPush'); this.sqv += c('squash') * 20; this.flip = 0; this.airT = 0;
      this.airDodged = this.airDashed = false; this.wallJumpT = 0.3; this.say('WALL JUMP');
    } else if (hop && !this.grounded && this.free && !busy && (this.ch.stats.jumps < 0 || this.airJumps < this.ch.stats.jumps - 1) && !this.st.fly) { // max jumps: another jump in the air (jumps < 0: infinite)
      this.airJumps++; this.vy = -c('jumpVel') * 0.9; this.sqv += c('squash') * 20; this.flip = 0;
      this.vx = (inp.right - inp.left) * Math.max(Math.abs(this.vx), c('airSpeed') * 0.8);
    }
    if (this.squatT > 0 && (this.squatT -= dt) <= 0) {
      this.grounded = false; this.vy = -c('jumpVel') * (this.superJ ? c('superJump') : 1); this.sqv += c('squash') * (this.superJ ? 40 : 25); this.airT = 0;
      if (this.superJ) this.say('SUPER');
      const o = this.chase;
      if (o) { // the chase jump: up to where the victim peaks (or is, already falling)
        const g = c('gravity'), rise = -o.y + (o.vy < 0 ? o.vy * o.vy / (2 * g) : 0);
        this.vy = -clamp(Math.sqrt(2 * g * Math.max(0, rise)), c('jumpVel'), c('jumpVel') * Math.max(1.35, c('superJump')));
        this.say('CHASE');
      }
      const x = inp.right - inp.left, fl = c('flips');
      if (x && (fl === 'always' || fl === '2.5D' && !flat)) this.flip = x * this.dir; // +1 forward flip, -1 back flip
    }
    // a flip turns the body once over the jump; an attack or a hit ends it and the body rights itself
    if (this.flip && (this.action || this.kd)) this.flip = 0;
    if (!this.grounded) this.airT += dt;
    for (const g of this.after) g.t -= dt;
    if (this.warpFx && (this.warpFx.t += dt) > WARP_T) this.warpFx = null;
    // key event after: after-images trail the body while the key plays
    if (this.action?.m.keys[this.action.i]?.after && (this.afterT -= dt) <= 0) { this.afterT = 0.035; const P = this.body(), Q = {}; for (const k in P) Q[k] = [P[k][0], P[k][1]]; this.after.push({ P: Q, t: 0.2 }); }
    this.after = this.after.filter(g => g.t > 0);
    if (this.flip) this.spin = this.flip * 360 * Math.min(1, this.airT / (2 * c('jumpVel') / c('gravity')));
    else if (this.spin) { const to = Math.round(this.spin / 360) * 360; this.spin = approach(this.spin, to, 1440 * dt); if (this.spin === to) this.spin = 0; }
    if (this.action?.m.roll || this.action?.m.vault) { // a roll or vault turns the body once over, the way its lunge goes
      const ks = this.action.m.keys, all = ks.reduce((s, k) => s + k.d, 0), done = ks.slice(0, this.action.i).reduce((s, k) => s + k.d, 0) + this.action.t;
      this.spin = Math.sign(ks.find(k => k.lunge)?.lunge || 1) * 360 * Math.min(1, done / all) % 360;
    }
    // a flying stance hovers: no gravity, no ground, ↑ / ↓ fly up / down instead of jumping; a hit or knockdown drops out of it
    if (this.st.fly && this.free && !this.kd && !this.rag) {
      this.grounded = false; this.airJumps = 0; this.airDodged = this.airDashed = false; this.dodgeT = this.airDashT = 0;
      this.vy = approach(this.vy, (inp.down - inp.up) * c('airSpeed'), c('airAccel') * dt);
      this.y = Math.min(0, this.y + this.vy * dt);
    } else if (!this.grounded && this.splatT <= 0 && !this.rag && !this.heldBy) {
      if (this.airDashT > 0) this.vy = 0;
      else this.vy += c('gravity') * (this.kd && this.combo > 1 ? c('comboGravity') : 1) * dt; // comboGravity: juggles fall faster or float
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
        this.landT = 0.25 * imp; this.landK = imp; // and stay bent a moment (landBend)
        this.jolt(this.ch.chains.spine[0]?.[0], 250 * imp);
        this.w.dust(this.x, this.groundY, imp, this.z);
        if (this.action?.m.air && !this.action.m.otg) this.action = null; // an air move ends on landing, but an off-the-ground one (pounce) lands into its strike
        if (this.kd === 'fly' && !this.gb && !this.ko && c('techWindow') && within(this.w.simT - this.guardT, c('techWindow'), c('lastFrame'))) {
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
          } else { this.kd = 'down'; this.downT = c('downTime'); this.splat = false; }
        }
      }
    }
    if (this.kd === 'down' && !this.ko) {
      // wake-up (wakeUp setting): P / K gets up attacking, → / ← rolling that way, G held lies up to wakeDelay longer
      const wk = c('wakeUp'), stay = wk && inp.guard && this.downT > -c('wakeDelay');
      if (wk && (inp.punch || inp.kick)) this.wake = 'getupAttack';
      else if (wk && inp.left !== inp.right) { // a scrambling tumble if the character has one, else the standing dodge roll
        const fwd = (inp.right - inp.left) * this.dir > 0, tumble = fwd ? 'tumbleFwd' : 'tumbleBack';
        this.wake = this.ch.moves[tumble] ? tumble : (fwd ? 'rollFwd' : 'rollBack');
      }
      if (wk) this.buffer = null; // the press was the wake-up's
      if ((this.downT -= dt) <= 0 && !stay) {
        const m = this.ch.moves[this.wake] ? this.wake : 'getup';
        this.endRag(); this.kd = null; this.wake = null; this.start(m); this.hurtT = m === 'getup' ? 0.5 : 0;
      }
    }

    // squash & stretch spring (sq > 0 = stretch)
    const w = 2 * Math.PI * 4.5;
    this.sqv += (-w * w * this.sq - 2 * 0.3 * w * this.sqv) * dt;
    this.sq += this.sqv * dt;

    // tween layer: keyframes eased from a snapshot toward (live base ⊕ key)
    let base = this.basePose();
    if (this.action) {
      const a = this.action, keys = a.m.keys, ch = this.ch;
      a.t += dt * (a.m.power ? c('attackSpeed') * (1 + c('comboSpeed') * (this.w.combo - 1)) * (a.m.weapon && this.weapon ? weaponSpeed(this.weapon) : 1) : 1);
      // a weapon throw with P+G still held: the key before the release holds its pose, charging up to throwChargeT
      if (a.toss && this.ch.weapon && this.inp.guard && this.inp.punchHeld && a.i === Math.max(0, keys.findIndex(k => k.release) - 1)
        && a.t >= keys[a.i].d && (a.charge || 0) < c('throwChargeT')) { a.charge = (a.charge || 0) + dt; a.t = keys[a.i].d * 0.999; }
      // a chargeable move (key flag charge; move field charge: dur, timeout, min, max) holds at that key while its
      // trigger button stays held, up to charge.timeout; letting go (or reaching it) carries the move on with that charge
      if (a.m.charge && a.chargeBtn && this.inp[a.chargeBtn + 'Held'] && keys[a.i]?.charge
        && a.t >= keys[a.i].d && (a.charge || 0) < a.m.charge.timeout) { a.charge = (a.charge || 0) + dt; a.t = keys[a.i].d * 0.999; }
      while (a.i < keys.length && a.t >= keys[a.i].d) {
        a.t -= keys[a.i].d; a.from = resolve(base, keys[a.i].p);
        a.fromMul = Object.fromEntries(KEY_MULS.map(p => [p, Object.fromEntries(ch.ids.map(j => [j, keys[a.i][p]?.[j] ?? 1]))]));
        this.keyReached(keys[a.i++]);
        if (keys[a.i]?.turn) this.turnKey(keys[a.i]);
        if (keys[a.i]?.lunge) this.vx = this.dir * keys[a.i].lunge;
        if (keys[a.i]?.drop && !this.grounded) this.vy = keys[a.i].drop;
        if (keys[a.i]?.rise) { this.grounded = false; this.vy = -keys[a.i].rise; } // leaves the floor: the move plays on through the air and lands
        if (keys[a.i]?.rehit) a.hits = []; // a multi-hit: whoever it hit can be hit again from this key
      }
      if (this.turnMid?.a === a && keys[a.i] === this.turnMid.k && a.t >= this.turnMid.k.d / 2) { this.turnMid = null; this.halfTurn(); } // a whole turn's second half
      if (a.i >= keys.length) {
        this.action = null;
        const turns = Math.round((this.disp.weapon - base.weapon) / 360) * 360; // a weapon spun whole turns rests where it is, not unwound
        if (turns) { this.disp.weapon -= turns; this.prev.weapon -= turns; this.flt.weapon.y -= turns; this.flt.weapon.xp -= turns; }
      }
      if (this.ch !== ch) base = this.basePose(); // a grip / release key swapped the body
    }
    if (this.action) {
      const a = this.action, k = a.m.keys[a.i], to = resolve(base, k.p);
      const e = easeKey(k, a.t / k.d, c('easing'));
      for (const j of this.ch.ids) {
        this.target[j] = a.from[j] + (to[j] - a.from[j]) * e;
        for (const p of KEY_MULS) this.mul[p][j] = a.fromMul[p][j] + ((k[p]?.[j] ?? 1) - a.fromMul[p][j]) * e;
      }
    } else { Object.assign(this.target, base); for (const j of this.ch.ids) for (const p of KEY_MULS) this.mul[p][j] = 1; }
    constrain(this.ch, this.target);

    // filter layer: displayed pose chases the target pose
    const mode = c('filter'), mo = this.morph;
    // dangling bones (dangle) hang like a rope: turned toward gravity plus the drag of the body's motion, so they droop at rest,
    // stream back from a run and lift in a fall; wa: world angles of the drawn pose, parents first (|| 0: a restored checkpoint has no -0)
    const wa = {}, dd = c('dangleDrag'), blow = Math.atan2(-this.vx * this.dir / dd || 0, 1 - this.vy / dd) / R, gust = this.rag ? 0 : c('dangle');
    // aim bones turn toward the nearest foe's upper body (look-at heads, a tracking arm): from last frame's drawn joints
    const foe = this.ch.aims && !this.rag && !this.spin && !this.kd && this.w.nearestFoe(this), P0 = foe && this.body();
    const fp = foe && foe.body()[foe.ch.chains.head[0]?.[0].parent || foe.ch.chains.spine[0]?.at(-1).id || 'hip'];
    // settings read once per frame, not once per bone (same values: c() is pure within a frame)
    const freq = c('freq'), fthru = c('followThru'), zeta = c('zeta'), resp = c('response'), whip = c('whip'), dk = 1 - Math.exp(-c('dampRate') * dt), lk = 1 - Math.exp(-30 * dt);
    for (const b of this.ch.bones) {
      const j = b.id, wp = b.parent ? wa[b.parent] : 0, t = this.target[j];
      let x = b.dangle && gust ? t + clamp(b.dangle * gust, 0, 1) * wrap180(blow - wp - t) : t;
      if (b.aim && fp) { const o = P0[b.parent || 'hip']; x += clamp(b.aim, 0, 1) * wrap180(Math.atan2((fp[0] - o[0]) * this.dir, fp[1] - o[1]) / R - wp - x); }
      // whip: lags behind a fast-turning parent (its angular velocity, already updated this frame), so a nunchuck's
      // tip bends back out of a swing and springs past straight into the next one instead of staying rigid
      if (b.whip && !this.rag) x -= clamp((this.flt[b.parent]?.yd || 0) * b.whip * whip, -140, 140);
      this.prev[j] = this.disp[j];
      if (mode === 'spring') this.disp[j] = this.flt[j].update(dt, x, freq * b.stiff * fthru ** b.lag, zeta * b.damp, resp);
      else {
        this.disp[j] = mode === 'damp' ? this.disp[j] + (x - this.disp[j]) * dk : x;
        this.flt[j].reset(this.disp[j]);
      }
      // limits are applied after the filter so spring overshoot never hyperextends a joint; a pose authored past a limit is kept
      if (b.min !== undefined) this.disp[j] = clamp(this.disp[j], Math.min(b.min, x), Math.max(b.max, x));
      // stretch: fast-swinging bones lengthen, then ease back; a move's own key.len (this.mul.len) stretches it on purpose (a Dhalsim limb)
      // (an auto morph blends the lengths from the old body's, new bones from nothing)
      const len = (mo ? (mo.lens[j] ?? 0) + (b.len - (mo.lens[j] ?? 0)) * morphAt(mo, b) : b.len) * this.mul.len[j];
      const want = len * (1 + b.stretch * Math.min(1, Math.abs(this.disp[j] - this.prev[j]) / dt / 1500));
      this.lens[j] = mo ? want : this.lens[j] + (want - this.lens[j]) * lk;
      wa[j] = wp + this.disp[j];
    }

    if (this.rag) this.ragStep(dt);
    this.plantFeet(dt);
    this.gripWeapon();
  }
  // two-handed weapons (grip2): the back hand holds the weapon grip2 px along it from the front hand (two-bone IK, the elbow bending
  // the way the animation bends it, the hand parallel to the front one); it lets go, fading, where the point is out of its reach (spins)
  gripWeapon() {
    const ch = this.ch, g = ch.weapon && WEAPONS[ch.weapon].grip2, cn = g && !this.rag && ch.chains.arm.find(c => c[0].side === 'b');
    if (!cn || cn.length < 2 || !ch.by.weapon) return;
    const src = this.planted || this.disp, wa = {}, L = fk(ch, src, 1, this.lens, wa), p = this.planted || { ...src };
    const wb = ch.by.weapon, h0 = L[wb.parent], u = [L.weapon[0] - h0[0], L.weapon[1] - h0[1]], ul = Math.hypot(...u) || 1;
    const th = cn[0], a = cn[1], hand = cn[2], fh = ch.by[wb.parent], hl = hand ? this.lens[hand.id] : 0;
    const o = L[th.parent || 'hip'], l1 = this.lens[th.id], l2 = this.lens[a.id];
    const tx = h0[0] + u[0] / ul * g - Math.sin(wa[fh.id] * R) * hl - o[0], ty = h0[1] + u[1] / ul * g - Math.cos(wa[fh.id] * R) * hl - o[1];
    const dd = Math.hypot(tx, ty), k = clamp((l1 + l2) * 1.25 - dd, 0, (l1 + l2) * 0.25) / ((l1 + l2) * 0.25); // 1 in reach, 0 well out of it
    if (!k) return;
    const d = clamp(dd, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01), base = Math.atan2(tx, ty) / R, al = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)) / R;
    const w1 = [base + al, base - al].reduce((m, w) => Math.abs(wrap180(w - wa[th.id])) < Math.abs(wrap180(m - wa[th.id])) ? w : m);
    const el = [o[0] + Math.sin(w1 * R) * l1, o[1] + Math.cos(w1 * R) * l1], w2 = Math.atan2(o[0] + tx - el[0], o[1] + ty - el[1]) / R;
    const pb = ch.by[th.parent], pw = pb ? wa[pb.id] : 0;
    const set = (b, w, pw, prw) => { p[b.id] = src[b.id] + k * wrap180(w - pw + b.level * (pw - prw) - src[b.id]); };
    set(th, w1, pw, pb ? pb.restW : 0); set(a, w2, w1, th.restW);
    if (hand) set(hand, wa[fh.id], w2, a.restW);
    this.planted = p;
  }
}
// the later fighter-*.js files write their methods as a class of their own; this copies them onto Fighter (getters too)
function addMethods(to, from) {
  for (const k of Object.getOwnPropertyNames(from.prototype)) if (k !== 'constructor') Object.defineProperty(to.prototype, k, Object.getOwnPropertyDescriptor(from.prototype, k));
}
