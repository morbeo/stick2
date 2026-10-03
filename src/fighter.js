'use strict';
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
  constructor(w, x, dir, col, ch, over = {}) {
    Object.assign(this, { id: w.nid++, w, x, groundY: w.groundY, dir, face: dir, col: ch.col || col, ch, over, y: 0, vx: 0, vy: 0, grounded: true,
      time: 0, seed: w.rand(0, 100), walkPh: 0, lean: 0, inp: NOIN,
      action: null, buffer: null, squatT: 0, hurtT: 0, freeze: 0, flashT: 0, crouching: false,
      kd: null, downT: 0, wake: null, won: false, wallB: false, bounces: 0, combo: 0, comboShown: 0, comboT: 0, comboPop: 0, lastHurt: null,
      sq: 0, sqv: 0, trail: [], dirs: [], used: [], juggles: 0, jugUsed: 0,
      z: 0, vz: 0, lane: 0, dashT: 0, passT: 0, invT: 0, after: [], afterT: 0, running: false, tap: null, prevIn: NOIN, flip: 0, spin: 0, airT: 0,
      guarding: false, blockT: 0, parryT: 0, ko: false, label: '', labelT: 0, stunM: 0, dizzyT: 0, reelT: 0, splatT: 0, splat: false, gb: false, heldBy: null, heldM: null, heldT: 0, heldAt: 0, blocked: null, flyT: 0, guardT: -9, stanceI: 0,
      airJumps: 0, taking: null, lowAt: -9, superJ: false, airDodged: false, airDashed: false, dodgeT: 0, airDashT: 0, feet: [], planted: null, layerAt: {}, away: false, turnRate: 0, turnMid: null,
      stanceT: 0, stanceCd: {}, stanceUsed: [], morph: null, moveCount: {} }); // time in the stance, when each stance was left, the stances taken (req.once), an auto morph, times each move has started (over.limits)
    this.hp = this.c('health'); this.ch0 = ch.weapon ? armed(ch, '') : ch; // ch0: the character without its weapon
    this.target = this.basePose();
    this.disp = { ...this.target };
    this.prev = { ...this.target };
    this.flt = {}; this.lens = {};
    for (const b of ch.bones) { this.flt[b.id] = new SecondOrder(this.target[b.id]); this.lens[b.id] = b.len; }
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
    }
    if (keep && this.action) for (const j of ch.ids) this.action.from[j] ??= this.target[j];
  }
  // switch to stance i: its body (stanceChar; a running move goes on) and its transition (MORPH; back to main: the left stance's).
  // how: 'switch' (the stance key), 'exit' (its limits: no transition move), 'instant' (previews: no transition)
  setStance(i, how = 'switch') {
    const old = this.st, from = this.stancePose(), lens = Object.fromEntries(this.ch.ids.map(j => [j, this.lens[j]]));
    this.stanceCd[this.stanceI] = this.w.simT; // cooldown for the one being left (main's too: req.cooldown can gate a return to it)
    this.stanceI = i; this.stanceT = 0; this.morph = null;
    if (this.st.req.once) this.stanceUsed.push(i);
    const ch = stanceChar(this.ch, i);
    if (ch !== this.ch) this.setChar(ch, true);
    const mo = (i ? this.st : old).morph;
    if (how === 'instant') return;
    if (mo.mode === 'auto') this.morph = { from, lens, t: 0, T: Math.max(1, mo.T) / 60, ease: EASE[mo.ease] ? mo.ease : 'linear' };
    else if (mo.mode === 'move' && how === 'switch' && this.free && !this.action) {
      const n = (i && mo.move) || morphName(old.name, this.st.name);
      if (this.ch.moves[n]) { this.used = []; this.start(n); }
    }
  }
  // the stance pose the procedural layer builds on: during an auto morph, blended from the pose the switch started at
  stancePose() {
    const m = this.morph, to = this.st.pose;
    if (!m) return to;
    const e = EASE[m.ease](Math.min(1, m.t / m.T)), p = {};
    for (const j in to) p[j] = (m.from[j] ?? to[j]) + (to[j] - (m.from[j] ?? to[j])) * e;
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
    // mid turn the body gathers in (turnTuck): knees bend, arms pull in, the spine hunches, so it reads as a pivot, not a card flipping
    const tk = (1 - Math.abs(this.face)) * this.c('turnTuck');
    if (tk) { ch.chains.leg.forEach(c => flex(c[1], 30 * tk)); ch.chains.arm.forEach(c => flex(c[1], 40 * tk)); turn(spine, -10 * tk); }
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
    if (this.away && this.free && !this.action && (inp.left || inp.right || inp.up)) { this.away = false; this.dir = -this.dir; } // back turned: ←, → or ↑ turns it back (↓ crouches with the back turned)
    const n = 5 + (inp.right - inp.left) * this.dir - (inp.down ? 3 : inp.up ? -3 : 0), t = this.w.simT, d = this.dirs;
    if (d[d.length - 1]?.n !== n) d.push({ n, t });
    while (d.length > 1 && t - d[1].t > this.c('motionWindow')) d.shift();
    // P+G throws, K+G is the second throw; ↑ S+G taunts; S+G (with a direction or not) switches to the stance with that key
    const taunt = inp.guard && inp.special && inp.up && this.c('taunt');
    const to = inp.guard && inp.special && !taunt ? this.stanceTo((['', '↓', '↓', '↓', '←', '', '→'][n] || '') + 'S+G') : -1;
    const as = b => !inp.guard ? b : b === 'punch' ? 'throw' : b === 'kick' ? 'throw2' : b === 'special' && taunt ? 'taunt' : b === 'special' && to >= 0 ? 'stance' : b;
    for (const b of ['punch', 'kick', 'special']) if (inp[b]) this.buffer = { b: as(b), t: 0.2, motion: this.motion(), to };
  }
  // the stance a key switches to: the next one after the current among the stances with that key and main whose requirements
  // allow it (-1: no stance has the key; the current one: none allowed, the press is spent)
  stanceTo(key) {
    const c = this.ch.stances.map((s, i) => i).filter(i => !i || this.ch.stances[i].key === key), cur = this.stanceI;
    return c.length < 2 ? -1 : [...c.filter(i => i > cur), ...c.filter(i => i < cur)].find(i => this.stanceOk(i, false)) ?? cur;
  }
  // every special motion in the recent directions, the character's own first (6236 is both →↓↘ and ↓↘→: the first one with a move bound wins)
  motion() {
    const s = this.dirs.map(d => d.n).join(''), all = { ...this.ch.motions, ...MOTIONS };
    return Object.keys(all).filter(k => all[k].test(s));
  }
  // a move count limit (over.limits, a scenario or per-fighter override): 0 bans it outright, a number caps uses this fight
  allowed(m) { const lim = this.over.limits?.[m]; return lim === undefined || (this.moveCount[m] || 0) < lim; }
  // input slot -> the move the character binds to it, filtered by allowed() (see BINDS); a special motion picks its special on the ground
  pick(b, motion) { const m = this.pickRaw(b, motion); return m && this.allowed(m) ? m : null; }
  pickRaw(b, motion) {
    const i = this.inp, fwd = (i.right - i.left) * this.dir > 0, P = b === 'punch';
    if (b === 'special') { // S: a special per direction, the neutral one when that direction has none
      if (!this.grounded && i.down && this.c('pounce') && this.ch.moves.pounce) return 'pounce';
      const n = (i.down ? 1 : i.up ? 7 : 4) + (fwd ? 2 : i.right !== i.left ? 0 : 1); // the direction held, numpad
      const sp = this.grounded && [...(motion || []), n + 'S'].map(t => this.special(t)).find(Boolean); // a scheme's special on a motion or a direction (SPECIAL_SCHEMES)
      if (sp) return sp;
      const slot = !this.grounded ? 'airSpecial' : i.down ? 'downSpecial' : i.up ? 'upSpecial' : fwd ? 'fwdSpecial' : i.right !== i.left ? 'backSpecial' : 'special';
      return [this.binds[slot], this.grounded && this.binds.special].find(m => this.ch.moves[m]) || null;
    }
    const B = P ? 'Punch' : 'Kick', has = s => this.ch.moves[this.binds[s]] ? this.binds[s] : null;
    if (b === 'throw' || b === 'throw2') return this.grounded ? (b === 'throw' && i.right !== i.left && !fwd && has('backThrow')) || has(b) : null; // ← P+G: the back throw
    if (b === 'taunt') return this.grounded && this.ch.moves.taunt ? 'taunt' : null;
    const sp = this.grounded && motion?.map(k => has(k + B)).find(Boolean);
    if (sp) return sp;
    if (!this.grounded) return has('air' + (i.down ? 'Down' : i.up ? 'Up' : '') + B) || has('air' + B);
    if (P && fwd && !i.down && !this.ch.weapon && Math.abs(this.vx) > this.c('maxSpeed') * 0.6 && has('dashPunch')) return has('dashPunch');
    // a direction × button table: ↘K = downFwdKick; a slot without a move falls back to its vertical (downKick), then to neutral
    const v = i.down ? 'down' : i.up ? 'up' : '', hz = fwd ? 'Fwd' : i.right !== i.left ? 'Back' : '';
    const slots = [v && hz && v + hz + B, v ? v + B : hz && hz.toLowerCase() + B, b];
    return slots.map(s => s && has(s)).find(Boolean) || null;
  }
  // the special the scheme plays on an input (a motion name, G4 / G6), if it is switched on and the character has the move
  special(t) {
    const s = SPECIAL_SCHEMES[this.c('specialScheme')] || {};
    return Object.keys(s).find(n => s[n] === t && this.c(SPECIALS[n]) && this.ch.moves[n]) || null;
  }
  // what the running move can be cancelled into, once its cancel window is open (Combos & cancels)
  cancelInto(a, b, motion) { const m = this.cancelIntoRaw(a, b, motion); return m && this.allowed(m) ? m : null; }
  cancelIntoRaw(a, b, motion) {
    if (a.i < a.m.cancel) return null;
    const m = this.pick(b, motion);
    if (m && this.ch.moves[m].special && !a.m.special && a.hit && this.c('specialCancel')) return m;
    const rule = this.c('chains');
    if (rule === 'authored') { // a link on the direction held (6P, 2K…, numpad toward the foe), else the plain P / K / S one
      const i = this.inp, n = 5 + (i.right - i.left) * this.dir - (i.down ? 3 : i.up ? -3 : 0);
      if (b === 'special') { // specials chain on the bind table's own names: diagonals collapse to their vertical, like a bind
        const key = n <= 3 ? 'downSpecial' : n >= 7 ? 'upSpecial' : n === 4 ? 'backSpecial' : n === 6 ? 'fwdSpecial' : null;
        return (key && a.m.next?.[key]) || a.m.next?.special;
      }
      const k = { punch: 'P', kick: 'K' }[b];
      return (k && n !== 5 && a.m.next?.[n + k]) || a.m.next?.[b];
    }
    if (rule === 'free') return a.hit && m && !this.used.includes(m) ? m : null;
    return null;
  }
  start(m) {
    const mv = typeof m === 'string' ? this.ch.moves[m] : m, ms = this.ch.moves;
    const name = typeof m === 'string' ? m : Object.keys(ms).find(k => ms[k] === m) || Object.keys(WEAPON_MOVES).find(k => WEAPON_MOVES[k] === m) || '';
    this.action = { m: mv, name, i: 0, t: 0, from: { ...this.target }, hit: false, hits: [] };
    if (!mv.hurt) { this.w.ev(this, 'move', name); if (name) this.moveCount[name] = (this.moveCount[name] || 0) + 1; }
    if (this.action.m.roll) this.passT = this.invT = this.c('rollInv'); // a roll: through fighters and untouchable a moment
    const keys = this.action.m.keys;
    if (this.away && !this.action.m.hurt && !keys.some(k => k.turn)) { this.away = false; this.dir = -this.dir; } // back turned: a move without turns faces the foe first
    if (keys[0]?.turn) this.turnKey(keys[0]);
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
  // a charged throw (charge = seconds the wind-up was held) flies faster and flatter, spins faster and hits harder: × up to throwCharge
  letGo(live, charge = 0) {
    const w = this.w, at = this.weaponAt(), it = { type: this.ch.weapon, ...at, z: this.z, owner: this, live, spin: 0, t: 0 };
    const k = 1 + Math.min(1, charge / (this.c('throwChargeT') || 1)) * (this.c('throwCharge') - 1);
    if (live) Object.assign(it, { x: at.x + this.dir * 10, vx: this.dir * this.c('throwSpeed') * k, vy: -60, spin: this.dir * (this.weapon.cls === 'pierce' ? 0 : 18) * k, rot: this.dir > 0 ? 0 : Math.PI, power: k });
    else Object.assign(it, { vx: -this.dir * 120 + w.rand(-60, 60), vy: -320, spin: w.rand(-12, 12) });
    if (live && k > 1 && k >= this.c('throwCharge')) this.say('POWER');
    w.items.push(it);
    this.setChar(this.ch0);
  }
  // P+G free on the ground: throw the held weapon (weaponThrow: it leaves the hand at the key marked release), or reach for the one
  // at the feet (pickUp: the hand closes on its handle at the key marked grip); false = nothing to do, a grab instead
  weaponGrab() {
    if (this.ch.weapon) { this.start(this.ch.moves.weaponThrow || WEAPON_MOVES.weaponThrow); this.action.toss = true; return true; }
    const it = this.w.itemNear(this);
    if (!it) return false;
    it.taker = this; this.taking = it;
    this.start(this.ch0.moves.pickUp || WEAPON_MOVES.pickUp); this.action.pick = true;
    return true;
  }
  // a key of the running move reached its pose (wield and letGo change the character, the move goes on)
  keyReached(k) {
    const a = this.action, first = k === a.m.keys[0];
    if (this.taking && a.pick && (k.grip || first && !a.m.keys.some(x => x.grip))) {
      const it = this.taking; this.taking = null;
      this.w.items.splice(this.w.items.indexOf(it), 1); this.wield(it.type); this.action = a; this.say(it.type.toUpperCase());
      for (const j of this.ch.ids) a.from[j] ??= this.target[j]; // the weapon's bones join the tween where they are
    }
    if (k.warp) this.warp();
    if (k.shoot) this.shoot(a);
    if (k.shake) this.w.trauma = Math.min(1, this.w.trauma + k.shake); // key events: screen shake, a sound
    if (k.sound) this.w.sound(k.sound, this.x);
    if (this.ch.weapon && a.toss && (k.release || first && !a.m.keys.some(x => x.release))) { this.letGo(true, a.charge); this.action = a; }
  }
  // a shoot key: the move's projectile leaves from between its striking limbs (one at a time per fighter; shots setting)
  shoot(a) {
    if (!this.c('shots') || this.w.shots.some(s => s.owner === this)) return;
    const m = a.m, o = m.shot || {}, P = this.body(), ps = hitIds(m).map(id => P[id]).filter(Boolean);
    const pt = ps.length ? [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length] : [this.x + this.dir * 30, this.groundY + this.y - 60];
    this.w.shots.push({ x: pt[0], y: pt[1], z: this.z, vx: this.dir * (o.speed ?? 360), dir: this.dir, r: o.size ?? 12, life: o.life ?? 2, t: 0, look: o.look || 'ki', owner: this, m });
    a.hit = true; // fired: not a whiff
  }
  // reaching for a weapon: it slides and turns on the floor so its handle meets the hand at the grip key; let go if the reach is cut short
  reach(dt) {
    const it = this.taking;
    if (!this.action?.pick) { it.taker = null; this.taking = null; return; }
    const hand = this.body()[(this.ch.chains.arm.find(c => c[0].side === 'f') || this.ch.chains.arm[0])?.at(-1).id];
    if (!hand) return;
    const a = this.action, keys = a.m.keys, g = Math.max(0, keys.findIndex(k => k.grip)), left = keys.slice(a.i, g + 1).reduce((s, k) => s + k.d, -a.t);
    const w = WEAPONS[it.type], half = (w.len - (w.back || 0)) / 2, rot = this.dir > 0 ? 0 : Math.PI, k = Math.min(1, dt / Math.max(dt, left)); // the rest of the way in the time left
    it.rot += wrap180((rot - it.rot) / R) * R * k;
    it.x += (hand[0] + Math.cos(it.rot) * half - it.x) * k;
  }
  // key flag turn: the fighter turns around over this key (its face sweeps through the profile in the key's time); turn: 2 is a
  // whole turn, the second half from the middle of the key (spinning kicks). Holding a throw victim it swings the victim round
  // to its other side (a back throw); else a half turn leaves its back to the foe (away)
  turnKey(k) {
    const n = k.turn === 2 ? 2 : 1;
    this.turnRate = 2 * n / Math.max(0.02, k.d); this.turnMid = n === 2 ? { a: this.action, k } : null;
    this.halfTurn();
  }
  halfTurn() {
    this.dir = -this.dir;
    const v = this.w.fighters.find(o => o.heldBy === this);
    if (v) v.dir = -this.dir; else this.away = !this.away;
  }
  // teleport (key flag warp): reappear teleportDist behind the nearest foe, turned to face it, leaving after-images on the way
  warp() {
    const o = this.w.nearestFoe(this), side = o ? Math.sign(o.x - this.x) || this.dir : this.dir, P = this.body(), x0 = this.x;
    this.x = clamp((o ? o.x : this.x) + side * this.c('teleportDist'), 40, W - 40); this.vx = 0; this.dir = -side;
    this.trail = []; // no streak across the jump
    this.after = [0, 1, 2].map(i => { const dx = (this.x - x0) * i / 3, Q = {}; for (const k in P) Q[k] = [P[k][0] + dx, P[k][1]]; return { P: Q, t: 0.3 - i * 0.08 }; });
  }
  // a weapon move's blow, by the weight of the weapon held
  weaponHit(m) {
    const w = m.weapon && this.weapon, k = w ? weaponPower(w) : 1;
    return k === 1 ? m : { ...m, power: m.power * k, damage: m.damage * k, knock: m.knock * k };
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
      // air recovery: G a while into a knockdown flight flips the fighter back onto its feet
      if (this.kd === 'fly' && !this.ko && c('airRecover') && this.flyT >= c('airRecover') - 1e-9 && this.splatT <= 0) {
        this.endRag(); this.kd = null; this.hurtT = 0; this.flip = -1; this.airT = 0; this.vy = Math.min(this.vy, -250); this.vx *= 0.3; this.say('RECOVER');
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
    this.dashT -= dt; this.passT -= dt; this.invT -= dt; this.blockT -= dt; this.parryT -= dt; this.labelT -= dt; this.dodgeT -= dt; this.airDashT -= dt; this.dizzyT -= dt; this.reelT -= dt; this.splatT -= dt;
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
    this.walkPh += Math.hypot(this.vx, this.vz) * (back ? -1 : 1) * dt * 3.3 / ll / (back ? 0.7 : 1); // one step per stride, feet stay planted
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
    if (hop && this.grounded && this.free && (!busy || jc) && this.squatT <= 0 && !this.st.fly) {
      this.superJ = c('superJump') > 1 && this.w.simT - this.lowAt <= c('superJumpWindow');
      this.squatT = (c('jumpSquat') || 1e-6) * (this.superJ ? 1.5 : 1);
      if (jc) this.action = null;
      this.chase = chase;
    } else if (hop && wall && !this.grounded && this.free && !busy && c('wallJump') > 0 && this.airT > 0.1 && !this.st.fly) { // triangle jump: off the wall, up and away
      this.vy = -c('jumpVel') * c('wallJump'); this.vx = wall * c('wallJumpPush'); this.sqv += c('squash') * 20; this.flip = 0; this.airT = 0;
      this.airDodged = this.airDashed = false; this.say('WALL JUMP');
    } else if (hop && !this.grounded && this.free && !busy && this.airJumps < this.ch.stats.jumps - 1 && !this.st.fly) { // max jumps: another jump in the air
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
    // key event after: after-images trail the body while the key plays
    if (this.action?.m.keys[this.action.i]?.after && (this.afterT -= dt) <= 0) { this.afterT = 0.035; const P = this.body(), Q = {}; for (const k in P) Q[k] = [P[k][0], P[k][1]]; this.after.push({ P: Q, t: 0.2 }); }
    this.after = this.after.filter(g => g.t > 0);
    if (this.flip) this.spin = this.flip * 360 * Math.min(1, this.airT / (2 * c('jumpVel') / c('gravity')));
    else if (this.spin) { const to = Math.round(this.spin / 360) * 360; this.spin = approach(this.spin, to, 1440 * dt); if (this.spin === to) this.spin = 0; }
    if (this.action?.m.roll) { // a roll turns the body once over, the way its lunge goes
      const ks = this.action.m.keys, all = ks.reduce((s, k) => s + k.d, 0), done = ks.slice(0, this.action.i).reduce((s, k) => s + k.d, 0) + this.action.t;
      this.spin = Math.sign(ks.find(k => k.lunge)?.lunge || 1) * 360 * Math.min(1, done / all) % 360;
    }
    // a flying stance hovers: no gravity, no ground, ↑ / ↓ fly up / down instead of jumping; a hit or knockdown drops out of it
    if (this.st.fly && this.free && !this.kd && !this.rag) {
      this.grounded = false; this.airJumps = 0; this.airDodged = this.airDashed = false; this.dodgeT = this.airDashT = 0;
      this.vy = approach(this.vy, (inp.down - inp.up) * c('airSpeed'), c('airAccel') * dt);
      this.y = Math.min(0, this.y + this.vy * dt);
    } else if (!this.grounded && this.splatT <= 0 && !this.rag) {
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
      else if (wk && inp.left !== inp.right) this.wake = (inp.right - inp.left) * this.dir > 0 ? 'rollFwd' : 'rollBack';
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
      while (a.i < keys.length && a.t >= keys[a.i].d) {
        a.t -= keys[a.i].d; a.from = resolve(base, keys[a.i].p); this.keyReached(keys[a.i++]);
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
      const e = EASE[c('easing') === 'authored' ? k.e || 'linear' : c('easing')](a.t / k.d);
      for (const j of this.ch.ids) this.target[j] = a.from[j] + (to[j] - a.from[j]) * e;
    } else Object.assign(this.target, base);

    // filter layer: displayed pose chases the target pose
    const mode = c('filter'), mo = this.morph, me = mo && EASE[mo.ease](Math.min(1, mo.t / mo.T));
    // dangling bones (dangle) hang like a rope: turned toward gravity plus the drag of the body's motion, so they droop at rest,
    // stream back from a run and lift in a fall; wa: world angles of the drawn pose, parents first (|| 0: a restored checkpoint has no -0)
    const wa = {}, dd = c('dangleDrag'), blow = Math.atan2(-this.vx * this.dir / dd || 0, 1 - this.vy / dd) / R, gust = this.rag ? 0 : c('dangle');
    for (const b of this.ch.bones) {
      const j = b.id, wp = b.parent ? wa[b.parent] : 0, t = this.target[j], x = b.dangle && gust ? t + clamp(b.dangle * gust, 0, 1) * wrap180(blow - wp - t) : t;
      this.prev[j] = this.disp[j];
      if (mode === 'spring') this.disp[j] = this.flt[j].update(dt, x, c('freq') * b.stiff * c('followThru') ** b.lag, c('zeta') * b.damp, c('response'));
      else {
        this.disp[j] = mode === 'damp' ? this.disp[j] + (x - this.disp[j]) * (1 - Math.exp(-c('dampRate') * dt)) : x;
        this.flt[j].reset(this.disp[j]);
      }
      // limits are applied after the filter so spring overshoot never hyperextends a joint; a pose authored past a limit is kept
      if (b.min !== undefined) this.disp[j] = clamp(this.disp[j], Math.min(b.min, x), Math.max(b.max, x));
      // stretch: fast-swinging bones lengthen, then ease back
      // (an auto morph blends the lengths from the old body's, new bones from nothing)
      const len = mo ? (mo.lens[j] ?? 0) + (b.len - (mo.lens[j] ?? 0)) * me : b.len;
      const want = len * (1 + b.stretch * Math.min(1, Math.abs(this.disp[j] - this.prev[j]) / dt / 1500));
      this.lens[j] = mo ? want : this.lens[j] + (want - this.lens[j]) * (1 - Math.exp(-30 * dt));
      wa[j] = wp + this.disp[j];
    }

    if (this.rag) this.ragStep(dt);
    this.plantFeet(dt);
    this.gripWeapon();
  }
  // foot planting (plant setting): a foot the animation puts on the floor stays at its spot in the world and its leg bends to reach it
  // (two-bone IK on the bones above the ankle, the knee bending the way the animation bends it); a foot left more than plantStep
  // from where the animation puts it steps there, one foot at a time. The result (planted) is what is drawn and hit; the springs keep disp
  plantFeet(dt) {
    const c = k => this.c(k), ch = this.ch;
    this.planted = null;
    if (!c('plant') || !this.grounded || this.kd || this.rag || this.spin || this.y < 0) { this.feet = []; return; }
    const wa = {}, L = fk(ch, this.disp, 1, this.lens, wa), p = { ...this.disp }, k = this.xs * (1 - this.sq * 0.5);
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
  // this substep's strikes against the foes (after every fighter has moved, so two strikes in the same frame can clash)
  // foes: every fighter on another team (one move can hit several)
  // the strikes that land this substep go to out: World.step applies them once every fighter's are found
  strike(foes, out) {
    const c = k => this.c(k), a = this.action, ss = a?.m.keys[a.i].active ? this.strikeShapes(a.m) : [];
    const otg = c('otg') === 'all' || c('otg') === 'flagged' && a?.m.otg;
    if (ss.length) for (const o of foes) if (!a.hits.includes(o) && Math.abs(o.z - this.z) <= c('zReach') * (a.m.wide ? 3 : 1)) {
      if (a.m.height === 'high' && o.crouching) continue; // highs pass over a crouching fighter
      const air = !!o.kd || !o.grounded;
      if (a.m.hits && !o.kd && !a.m.hits.includes(!o.grounded ? 'air' : o.crouching ? 'crouch' : 'stand')) continue; // the move's hits: the states it can hit
      if (air && c('jugglePoints') && o.jugUsed + (a.m.juggle ?? 1) > c('jugglePoints')) continue; // the juggle pool can't pay for it
      if (a.m.throw && (!o.grounded || !o.free || o.heldBy || o.squatT > 0)) continue; // throws only catch a standing, free fighter
      const cl = this.clashWith(o, ss);
      if (cl) { this.w.clash(this, o, cl); break; }
      // several striking bones: the deepest overlap counts, one hit per foe per move
      const h = ss.map(s => o.hurtAt(s, c('hitTest') === 'target', otg)).reduce((best, h) => h && (!best || h.d < best.d) ? h : best, null);
      if (h) { a.hits.push(o); a.hit = true; out.push({ f: this, o, h, a, m: this.weaponHit(a.m), key: a.m.keys[a.i] }); }
    }
    this.lastTips = Object.fromEntries(ss.map(s => [s.id, s[1]]));
    this.lastSegs = Object.fromEntries(ss.filter(s => !s.sweep).map(s => [s.id, [s[0], s[1]]]));
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
        const K = 400 * c('tone') * r.tone, KL = 3000, KS = 150, kin = {};
        for (const b of [...ch.bones].reverse()) kin[b.id] = [b, ...b.kids.flatMap(k => kin[k.id])]; // each bone and all it carries
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
          const fx = far.x - a.x, fy = far.y - a.y, sub = b.role === 'head' ? kin[b.id] : [b];
          const Ic = sub.reduce((t, k) => { const q = r.p[k.id]; return t + ((q.x - a.x) ** 2 + (q.y - a.y) ** 2) / q.im; }, 0), Ip = (fx * fx + fy * fy) / far.im, wc = Ip / (Ic + Ip + 1e-9);
          const dfx = -(dw * (1 - wc)) * fy * d, dfy = (dw * (1 - wc)) * fx * d;
          let px = dfx / far.im, py = dfy / far.im;
          for (const k of sub) { const q = r.p[k.id], dx = (dw * wc) * (q.y - a.y) * d, dy = -(dw * wc) * (q.x - a.x) * d; q.vx += dx; q.vy += dy; px += dx / q.im; py += dy / q.im; Om[k.id] += dw * wc; }
          far.vx += dfx; far.vy += dfy; a.vx -= px * a.im; a.vy -= py * a.im;
          Om[pid] -= dw * (1 - wc);
        }
      }
      const cb = c('ceiling');
      for (const q of ps) { q.ox = q.x; q.oy = q.y; q.vy += c('gravity') * (this.combo > 1 ? c('comboGravity') : 1) * dt; q.pvx = q.vx; q.x += q.vx * dt; q.y += q.vy * dt; q.hit = 0; q.top = 0; }
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
      // a wallbounce victim bounces as soon as any part of it reaches the wall it is flying at
      const side = Math.sign(hip.pvx);
      if (this.wallB && Math.abs(hip.pvx) > 90 && ps.some(q => side > 0 ? q.x >= W - 20 : q.x <= 20)) {
        this.wallBounced(); for (const q of ps) { q.vx = -side * c('wallBounceSpeed'); q.vy = Math.min(q.vy, -300); }
      }
      // the hips hit a wall: splat (move flag wall) or bounce back
      else if ((hip.x <= 40 || hip.x >= W - 40) && Math.sign(hip.pvx) === Math.sign(hip.x - W / 2)) {
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
      else if (!this.ko && c('techWindow') && within(this.w.simT - this.guardT, c('techWindow'), c('lastFrame'))) {
        this.endRag(); this.kd = null; this.grounded = true; this.y = 0; this.start('getup'); this.hurtT = 0.3; this.vx = -this.dir * 150; this.say('TECH');
        return;
      } else if (this.bounces < c('bounces') && land * c('floorBounce') > 150) { // a floor bounce (bounces setting): the whole body pops up
        this.bounces++; r.landed = false; for (const q of ps) q.vy = Math.min(q.vy, -land * c('floorBounce'));
        this.w.dust(hip.x, G, imp, this.z); this.w.trauma = Math.min(1, this.w.trauma + 0.15 * imp);
      } else if (land > 150) { this.w.dust(hip.x, G, imp, this.z); this.w.trauma = Math.min(1, this.w.trauma + 0.15 * imp); }
    }
    // the bone angles from the joints, unwrapped next to the last ones so the springs never spin a full turn afterwards
    // (Wa: the world angles as fk adds them up, turns included: a half-level bone like the neck would flip over otherwise)
    const Wa = {};
    for (const b of ch.bones) {
      const a = r.p[b.parent || 'hip'], e = r.p[b.id], pb = ch.by[b.parent], pw = pb ? Wa[pb.id] : 0;
      const Wb = Math.atan2((e.x - a.x) * d, e.y - a.y) / R;
      const p = pb ? Wb - pw + b.level * (pw - pb.restW) : Wb;
      this.disp[b.id] = this.prev[b.id] + wrap180(p - this.prev[b.id]);
      Wa[b.id] = pw + this.disp[b.id] - b.level * (pw - (pb ? pb.restW : 0));
      this.lens[b.id] = Math.hypot(e.x - a.x, e.y - a.y);
      this.flt[b.id].reset(this.disp[b.id]);
    }
    let low = -1e9; for (const q of ps) low = Math.max(low, q.y + q.r);
    this.x = hip.x; this.y = Math.min(0, low - G); this.face = d; this.sq = this.sqv = 0; this.spin = 0;
    this.vx = ps.reduce((s, q) => s + q.vx, 0) / ps.length; this.vy = ps.reduce((s, q) => s + q.vy, 0) / ps.length;
    // it lies still once it has landed and slowed down (or after a long tumble)
    if (this.kd === 'fly' && this.splatT <= 0 && (r.landed && Math.hypot(this.vx, this.vy) < 60 || this.flyT > 3)) {
      this.kd = 'down'; this.downT = this.c('downTime'); this.splat = false; this.grounded = true;
    }
  }

  // the strike this substep as a capsule [from, to, radius], per the collision mode:
  // drawn = striking joint of the drawn (sprung) pose · target = of the keyframe pose, ignoring springs
  // swept = path of the drawn joint since last substep (fast strikes can't tunnel) · limb = the whole striking bone
  // (one per striking bone, each tagged with its bone id)
  strikeShapes(m) {
    const mode = this.c('hitTest'), P = mode === 'target' ? this.points(this.target) : this.body(), r = this.c('hitR') + (m.reach || 0) + (m.throw ? this.c('grabReach') : 0);
    // a weapon strikes along its whole length (a staff behind the hand too), nunchucks with both sticks
    const ids = hitIds(m).flatMap(id => id === 'weapon' && this.ch.by.weaponTip ? [id, 'weaponTip'] : [id]);
    return ids.map(id => this.ch.by[id]).filter(Boolean).flatMap(b => {
      const tip = P[b.id], o = P[b.parent || 'hip'], k = -(b.back || 0) / b.len;
      const s = b.role === 'weapon' ? [[o[0] + (tip[0] - o[0]) * k, o[1] + (tip[1] - o[1]) * k], tip, r]
        : mode === 'limb' ? [o, tip, r + b.thick / 2] : [mode === 'swept' && this.lastTips?.[b.id] || tip, tip, r];
      s.id = b.id;
      // a weapon sweeps: the in-betweens from where it was last substep, so a fast swing (a staff whirl) can't skip over a body
      const was = b.role === 'weapon' && this.lastSegs?.[b.id];
      if (!was) return [s];
      const n = Math.min(16, Math.ceil(Math.max(Math.hypot(was[0][0] - s[0][0], was[0][1] - s[0][1]), Math.hypot(was[1][0] - s[1][0], was[1][1] - s[1][1])) / 6)), lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      const mid = []; for (let i = 1; i < n; i++) mid.push(Object.assign([lerp(was[0], s[0], i / n), lerp(was[1], s[1], i / n), r], { id: b.id, sweep: true }));
      return [s, ...mid];
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
    if (this.c('inv') === 'untouchable') return null; // a scenario's or play's shield: strikes, shots and thrown weapons pass through
    if (this.kd === 'down' && !otg || a?.m.inv || a?.m.keys[a.i]?.inv || this.dodgeT > 0 || this.invT > 0) return null;
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
    const k = this.action?.m.keys[this.action.i], h = m.height || 'mid';
    const front = (att.owner ? -att.vx : att.x - this.x) * this.dir > 0; // a shot or thrown weapon comes from where it flies from (fired point-blank it can start past the target)
    if (k?.catch && front && (!k.catchH || k.catchH.includes(h))) return 'catch';
    const able = this.guarding || this.parryT > 0 && this.free && this.grounded && !this.action && this.squatT <= 0;
    if (key?.unblock || !able || !front) return null;
    if (!this.grounded) return m.noAirGuard ? null : this.parryT > 0 && this.c('parry') ? 'parry' : 'block'; // air guard: every height
    if (!(h === 'smid' || (this.crouching ? h === 'low' : h !== 'low'))) return null;
    return this.parryT > 0 && this.c('parry') ? 'parry' : 'block';
  }
  blockHit(att, m) {
    // just guard: G tapped within justGuardWindow before the parry window: shorter blockstun, no chip, no push
    const just = this.c('justGuard') && within(this.w.simT - this.guardT, (this.c('parry') ? this.c('parryWindow') : 0) + this.c('justGuardWindow'));
    const bs = (m.bstun || (m.stun || 0.4) * this.c('blockStun')) * (just ? this.c('justGuardStun') : 1);
    this.exitOn('block');
    this.hurtT = this.blockT = bs; this.guarding = true; this.combo = 0; this.buffer = null; this.parryT = 0; this.blocked = att;
    this.vx = just ? 0 : att.dir * (m.bpush || m.knock * this.c('blockPush')) * this.c('powerScale') / this.ch.stats.weight;
    if (this.c('health') > 0 && !just && !this.c('inv')) this.hp = Math.max(1, this.hp - this.damageOf(m, 1) * (m.chip || this.c('chip'))); // chip never knocks out
    if (just) { this.say('JUST'); this.flashT = 0.08; att.vx = -att.dir * this.c('justGuardKnock') * this.c('powerScale') / att.ch.stats.weight; }
    for (const c of this.ch.chains.arm) this.jolt(c[0], -300 * m.power); // the guard gives
    this.sqv -= this.c('squash') * 8 * m.power;
  }
  // out of blockstun into a guard cancel (paid in health) or a push block (the last attacker blocked slides away)
  guardOut(n) {
    const att = this.blocked;
    this.blockT = this.hurtT = 0; this.guarding = false; this.buffer = null; this.used = []; this.start(n);
    if (n === 'guardCancel' && this.c('health') > 0) this.hp = Math.max(1, this.hp - this.c('guardCancelCost'));
    if (n === 'pushBlock' && att) att.vx = -att.dir * this.c('pushBlockForce') * this.c('powerScale') / att.ch.stats.weight;
    this.say(n === 'guardCancel' ? 'GUARD CANCEL' : 'PUSH');
  }
  // off the wall from a wallbounce hit: the juggle count starts over, so the follow-up launches full height
  wallBounced() {
    this.wallB = false; this.juggles = 0; this.say('WALL BOUNCE'); this.w.trauma = Math.min(1, this.w.trauma + 0.3);
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
    o.exitOn('grab');
    o.heldBy = this; o.heldT = this.c('techWindow'); o.heldAt = this.w.simT; o.buffer = null; o.guarding = false; o.blockT = 0; o.dir = -this.dir; o.away = false;
    o.start(makeHurt(o.ch.hurt.mid[0], 9, this.w.rand, o.st.pose)); o.hurtT = 9;
    const toss = this.ch.moves[this.action.m.throw];
    o.heldM = toss || this.action.m;
    if (toss) this.start(toss);
  }
  // held in a throw: pinned in front of the thrower; P+G inside the window breaks free, else the throw lands
  held(dt, inp) {
    const t = this.heldBy;
    const to = t.x + t.dir * 30; // a back throw swings the victim round: it slides to the thrower's other side
    this.x = Math.abs(to - this.x) > 20 ? approach(this.x, to, 1200 * dt) : to; this.z = t.z; this.vx = 0;
    if (inp.punch && inp.guard && this.heldT > 0 && within(this.w.simT - this.heldAt, this.c('techWindow'), this.c('lastFrame'))) {
      this.heldBy = null; this.hurtT = 0; this.action = null; this.buffer = null; this.vx = t.dir * 250; this.say('BREAK');
      t.action = null; t.vx = -t.dir * 250; t.hurtT = 0.15;
    } else if ((this.heldT -= dt) <= 0) {
      this.heldBy = null; this.hurtT = 0; this.action = null;
      const bone = this.ch.chains.spine[0]?.at(-1) || this.ch.bones[0];
      this.say('THROW'); this.w.onHit(t, this, { bone, pt: this.body()[bone.id] }, this.heldM, null);
    }
  }
  damageOf(m, combo) { return (m.damage ?? m.power * 8) * this.c('damage') * this.c('comboDamage') ** (combo - 1); }
  say(text) { this.label = text; this.labelT = 0.9; this.w.ev(this, 'say', text); }
  takeHit(att, m, hit) {
    const a = this.action, own = a && !a.m.hurt;
    const hurt = this.c('health') > 0 && !this.c('inv'); // inv nodamage: every hit reaction, no health lost
    if (own && a.m.keys[a.i]?.armor && (!hurt || this.hp > this.damageOf(m, 1))) { // armor: the damage lands, the move goes on
      if (hurt) this.hp -= this.damageOf(m, 1);
      this.flashT = 0.1; this.say('ARMOR'); this.sqv -= this.c('squash') * 8 * m.power;
      return;
    }
    this.exitOn('hit');
    // disarm: a knockdown or a blow hard enough knocks the weapon loose
    if (this.ch.weapon && !this.rag && this.w.items && (m.kd || m.power * this.c('powerScale') >= this.c('disarm'))) { this.letGo(false); this.say('DISARM'); }
    // counter hit: caught in the startup or active frames of its own attack
    const ck = own && a.m.power && a.i < a.m.cancel ? this.c('counterHit') : 1;
    const combo = this.combo = (this.free ? 0 : this.combo) + 1, dmg = this.damageOf(m, combo) * ck, wasDizzy = this.dizzyT > 0;
    if (ck > 1) this.say('COUNTER');
    if (hurt && (this.hp -= dmg) <= 0) { this.hp = 0; this.ko = true; this.say('K.O.'); }
    this.dizzyT = 0; this.reelT = 0;
    this.stunM = wasDizzy ? 0 : this.stunM + dmg; // a hit wakes a dizzy fighter (and empties the meter)
    this.comboShown = combo; this.comboT = 1; this.comboPop = 1;
    const juggle = !!this.kd || !this.grounded, otg = this.kd === 'down';
    if (juggle) this.jugUsed += m.juggle ?? 1;
    this.dir = -att.dir; this.buffer = null; this.squatT = 0; this.flashT = 0.1;
    const ps = this.c('powerScale');
    this.vx = att.dir * m.knock * ps * (juggle ? 0.6 : 1) * this.c('knockScale') / this.ch.stats.weight;
    if (m.kd || m.crumple || juggle || combo >= 7 || this.ko) {
      this.juggles = this.kd ? this.juggles + 1 : 0;
      this.kd = 'fly'; this.bounces = otg ? 99 : 0; this.grounded = false; this.action = null; this.hurtT = 0; // hit off the ground: a small pop, no bounce
      this.exitOn('knockdown');
      this.vy = -Math.max((m.launch || 300) * ps, this.ko ? 380 : 0) * this.c('juggleDecay') ** this.juggles * this.c('launchScale') / this.ch.stats.weight;
      this.splat = !!m.wall; this.wallB = !!m.wallbounce; this.gb = !!m.bounce && !otg; this.splatT = 0; this.flyT = 0;
      if (m.crumple && !juggle) { this.vx = att.dir * 30; this.vy = -120; this.bounces = 99; this.say('CRUMPLE'); } // folds where it stands
      if (this.c('falls') === 'ragdoll') { if (!this.rag) this.startRag(); this.rag.tone = m.crumple && !juggle ? 0.15 : 1; this.ragHit(hit); }
    } else {
      // a hurt pose other than the last one, kept by zone and index (a restored checkpoint holds copies, not the same objects)
      const zone = this.zone(hit.pt), all = this.ch.hurt[zone], set = all.map((p, i) => zone + i).filter(k => k !== this.lastHurt);
      this.lastHurt = set[Math.floor(this.w.rand() * set.length)];
      const stun = (m.stun ?? 0.4) * ck * Math.max(0.45, 1 - 0.07 * (combo - 1)); // long combos stun less
      this.start(makeHurt(all[+this.lastHurt.slice(zone.length)], stun, this.w.rand, this.st.pose));
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
    return ck; // > 1: a counter hit
  }

  // the drawn width while turning (face goes from -1 to 1): never thinner than turnWidth, mirrored at the halfway point
  get xs() { const w = this.c('turnWidth'), f = this.face; return (Math.sign(f) || this.dir) * (w + (1 - w) * Math.abs(f)); }
  // world-space joints: lowest body point snapped to the ground, then squash/stretch around it
  points(p, lens) {
    const L = fk(this.ch, p, this.xs, lens);
    if (this.kd === 'down' && !this.rag) settle(this.ch, L); // the lie pose rolls to the angle it lies flattest at
    let fy = 0;
    for (const b of this.ch.bones) fy = Math.max(fy, L[b.id][1] + (b.shape === 'circle' ? b.len : 0));
    if (this.spin) {
      let top = 0; for (const k in L) top = Math.min(top, L[k][1]);
      const r = this.spin * this.dir * R, c = Math.cos(r), s = Math.sin(r), cy = (top + fy) / 2;
      for (const k in L) { const x = L[k][0], y = L[k][1] - cy; L[k] = [x * c - y * s, cy + x * s + y * c]; }
      if (this.grounded) { fy = -Infinity; for (const k in L) fy = Math.max(fy, L[k][1]); } // rolling on the floor: kept on it
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
    if (this.c('ghost')) { ctx.globalAlpha = 0.2; drawFigure(ctx, this.ch, this.points(this.target), '#07f', '#07f', -2); ctx.globalAlpha = 1; }
    const P = this.body(), fxs = fxNow(this.ch, this.action);
    drawFx(ctx, P, fxs, this.time, true);
    if (this.flashT > 0 && this.c('flash')) { drawFigure(ctx, this.ch, P, '#111', '#111', 4); drawFigure(ctx, this.ch, P, '#fff', '#fff'); }
    else if (this.dodgeT > 0) { ctx.globalAlpha = 0.4; drawFigure(ctx, this.ch, P, this.col[0], this.col[1]); ctx.globalAlpha = 1; } // air dodge: see-through
    else drawFigure(ctx, this.ch, P, this.col[0], this.col[1]);
    drawFx(ctx, P, fxs, this.time, false);
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
    // health bar and callouts (PARRY, K.O.) over the head (setting hud)
    if (!this.c('hud')) return ctx.restore();
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
