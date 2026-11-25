'use strict';
// Fighter, part 2 of 6 (after fighter.js): input, picking and starting moves, weapons, shots and beams, reach, turns and warps, charge
class FighterMoves {
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
    // inputLeniency: guard doesn't need to land on the exact same frame as the button for a P+G / K+G / S+G combo —
    // held, or freshly pressed within it, still counts. special likewise doesn't need to land on guard's own frame.
    const tol = this.c('inputLeniency'), pt = this.pressT, fresh = b => t - pt[b] <= tol;
    for (const b of ['punch', 'kick', 'special']) if (inp[b]) pt[b] = t;
    if (inp.guard && !this.guardHeld) this.guardPressT = t; this.guardHeld = inp.guard;
    const guardOn = inp.guard || t - this.guardPressT <= tol;
    // P+G throws, K+G is the second throw; ↑ S+G taunts; S+G (with a direction or not) switches to the stance with that key
    const taunt = guardOn && fresh('special') && inp.up && this.c('taunt');
    const to = guardOn && fresh('special') && !taunt ? this.stanceTo((['', '↓', '↓', '↓', '←', '', '→'][n] || '') + 'S+G') : -1;
    const as = b => !guardOn ? b : b === 'punch' ? 'throw' : b === 'kick' ? 'throw2' : b === 'special' && taunt ? 'taunt' : b === 'special' && to >= 0 ? 'stance' : b;
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
      // meter full, neutral S: the super move, if the character has one, instead of the usual special
      if (slot === 'special' && this.c('superMeter') && this.power >= this.c('superAt') && this.ch.moves[this.binds.super]) return this.binds.super;
      return [this.binds[slot], this.grounded && this.binds.special].find(m => this.ch.moves[m]) || null;
    }
    const B = P ? 'Punch' : 'Kick', has = s => this.ch.moves[this.binds[s]] ? this.binds[s] : null;
    // ← P+G: the back throw; in the air, P+G is the air throw instead (throw2 has no air mirror)
    if (b === 'throw' || b === 'throw2') return this.grounded ? (b === 'throw' && i.right !== i.left && !fwd && has('backThrow')) || has(b) : b === 'throw' ? has('airThrow') : null;
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
    this.action = { m: mv, name, i: 0, t: 0, from: { ...this.target }, fromMul: Object.fromEntries(KEY_MULS.map(p => [p, { ...this.mul[p] }])), hit: false, hits: [] };
    if (mv.charge) this.action.chargeBtn = this.inp.punch ? 'punch' : this.inp.kick ? 'kick' : this.inp.special ? 'special' : null;
    if (mv.super) this.power = 0; // spends the meter the instant the super starts
    if (!mv.hurt) { this.w.ev(this, 'move', name); if (name) this.moveCount[name] = (this.moveCount[name] || 0) + 1; }
    if (this.action.m.roll || this.action.m.vault) this.passT = this.invT = this.c('rollInv'); // a roll or vault: through fighters and untouchable a moment
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
  wield(type) { this.setChar(armed(this.ch0, type)); this.weaponDur = WEAPONS[type].durability; }
  get weapon() { return WEAPONS[this.ch.weapon]; }
  // a clash or a landed hit wears a breakable weapon down (durability); at 0 it snaps and is gone — not dropped,
  // there being nothing simple left to show lying on the floor, unlike a destroyed prop's debris
  wearWeapon(n = 1) {
    if (!this.ch.weapon || !this.weapon.breakable) return;
    this.weaponDur -= n;
    if (this.weaponDur <= 0) { const at = this.weaponAt(); this.w.spark(this.weapon.cls === 'slash' ? 'slash' : 'blunt', [at.x, at.y], this.z, this.dir); this.setChar(this.ch0); this.say('BREAK'); }
  }
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
  // the held prop leaves the hand the same way a weapon does, flying as a floor item (kind: 'prop' draws it from its
  // own shapes and hits for its own, not a weapon's, damage); there's no held-prop bone to throw from, so it leaves
  // from roughly where a hand would be instead of weaponAt()'s exact grip
  letGoProp(live, charge = 0) {
    const w = this.w, type = this.heldProp, it = { type, kind: 'prop', x: this.x + this.dir * 16, y: this.groundY + this.y - 55, z: this.z, rot: 0, owner: this, live, spin: 0, t: 0 };
    const k = 1 + Math.min(1, charge / (this.c('throwChargeT') || 1)) * (this.c('throwCharge') - 1);
    if (live) Object.assign(it, { x: it.x + this.dir * 10, vx: this.dir * this.c('throwSpeed') * k, vy: -60, spin: this.dir * 10 * k, rot: this.dir > 0 ? 0 : Math.PI, power: k });
    else Object.assign(it, { vx: -this.dir * 120 + w.rand(-60, 60), vy: -320, spin: w.rand(-12, 12) });
    if (live && k > 1 && k >= this.c('throwCharge')) this.say('POWER');
    w.items.push(it);
    this.heldProp = null;
  }
  // P+G free on the ground: throw whatever is held (a weapon: weaponThrow leaves the hand at the key marked release;
  // a prop: the same move, letGoProp instead of letGo), or reach for a weapon/prop item at the feet (pickUp: the
  // hand closes at the key marked grip) or a moveable prop standing nearby; false = nothing to do, a grab instead
  weaponGrab() {
    if (this.ch.weapon && !this.weapon.fixed) { this.start(this.ch.moves.weaponThrow || WEAPON_MOVES.weaponThrow); this.action.toss = true; return true; }
    if (this.heldProp) { this.start(this.ch.moves.weaponThrow || WEAPON_MOVES.weaponThrow); this.action.toss = true; this.action.propToss = true; return true; }
    const it = this.w.itemNear(this);
    if (it) { it.taker = this; this.taking = it; this.start(this.ch0.moves.pickUp || WEAPON_MOVES.pickUp); this.action.pick = true; return true; }
    const p = this.w.propNear(this);
    if (!p) return false;
    p.taker = this; this.takingProp = p;
    this.start(this.ch0.moves.pickUp || WEAPON_MOVES.pickUp); this.action.pick = true;
    return true;
  }
  // a key of the running move reached its pose (wield, letGo(Prop) and holding a prop change the character/state, the move goes on)
  keyReached(k) {
    const a = this.action, first = k === a.m.keys[0], grip = k.grip || first && !a.m.keys.some(x => x.grip);
    if (this.taking && a.pick && grip) {
      const it = this.taking; this.taking = null;
      if (this.w.items.includes(it)) { this.w.items.splice(this.w.items.indexOf(it), 1); } // weapon or prop item
      else { this.w.limbs.splice(this.w.limbs.indexOf(it), 1); } // severed limb
      if (it.kind === 'prop') { this.heldProp = it.type; this.action = a; this.say(it.type.toUpperCase()); }
      else {
        this.wield(it.type); this.action = a; this.say(it.type.toUpperCase());
        for (const j of this.ch.ids) { a.from[j] ??= this.target[j]; for (const p of KEY_MULS) a.fromMul[p][j] ??= this.mul[p][j]; } // the weapon's bones join the tween where they are
      }
    }
    if (this.takingProp && a.pick && grip) {
      const p = this.takingProp; this.takingProp = null;
      const i = this.w.props.indexOf(p); if (i >= 0) this.w.props.splice(i, 1); // gone already (destroyed meanwhile)? still fine to hold the type
      this.heldProp = p.type; this.action = a; this.say(p.type.toUpperCase());
    }
    if (k.warp) this.warp(k.warp);
    if (k.shoot) this.shoot(a);
    if (k.beam) this.fireBeam(a);
    if (k.shake) this.w.trauma = Math.min(1, this.w.trauma + k.shake); // key events: screen shake, a sound
    if (k.sound) this.w.sound(k.sound, this.x);
    if (this.ch.weapon && a.toss && (k.release || first && !a.m.keys.some(x => x.release))) { this.letGo(true, a.charge); this.action = a; }
    if (this.heldProp && a.toss && (k.release || first && !a.m.keys.some(x => x.release))) { this.letGoProp(true, a.charge); this.action = a; }
  }
  // a shoot key: the move's projectile (or a count/spread fan of several) leaves from between its striking limbs
  // (shot.maxAlive per fighter at a time, default 1; shots setting)
  shoot(a) {
    const e = moveShot(a.m); // the move's shot effect (move.effects, or read from its older shot field: effects.js)
    if (!e || !this.c('shots') || this.w.shots.filter(s => s.owner === this).length >= (e.props.maxAlive ?? 1)) return;
    const k = this.chargeMul(a.m, a.charge), m = this.chargedHit(a.m, a.charge), mo = e.motion, P = this.body(), ps = hitIds(m).map(id => P[id]).filter(Boolean);
    const pt = ps.length ? [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length] : [this.x + this.dir * 30, this.groundY + this.y - 60];
    const n = mo.count || 1, sp = (mo.speed ?? 360) * k; // a spread fans count shots evenly across spread degrees, centred on angle
    const r = Math.max(...e.parts.map(p => p.r ?? 12)) * k; // drawn size and floor contact: its biggest part
    for (let i = 0; i < n; i++) {
      const ang = ((mo.angle || 0) + (n > 1 ? (i / (n - 1) - 0.5) * (mo.spread || 0) : 0)) * R;
      this.w.shots.push({ x: pt[0], y: pt[1], z: this.z, vx: this.dir * sp * Math.cos(ang), vy: -sp * Math.sin(ang),
        gravity: mo.gravity || 0, bounce: mo.bounce || 0, dir: this.dir, r, k, parts: e.parts, life: e.life ?? 2, t: 0,
        look: e.look || 'ki', owner: this, m, pierce: e.props.pierce || 1, dur: e.props.durability || 1, hits: [], passed: [],
        k0: k, r0: r, grow: e.props.grow ?? 1, homing: e.props.homing || 0, unblock: !!e.props.unblockable, noClash: !!e.props.noClash,
        reflect: e.props.reflect !== false, hitSpark: e.props.hitSpark, endSpark: e.props.endSpark, split: e.props.split || 0, splitSpread: e.props.splitSpread ?? 90 });
    }
    a.hit = true; // fired: not a whiff
  }
  // a beam key: a straight line held out from the striking limbs for its duration, hitting once wherever it touches a foe (beams setting);
  // beam.angle / angleTo sweep it, beam.rehit hits again every rehit seconds, beam.follow keeps it on the striking limbs as they move
  fireBeam(a) {
    if (!this.c('beams') || this.w.beams.some(b => b.owner === this)) return;
    const k = this.chargeMul(a.m, a.charge), m = this.chargedHit(a.m, a.charge), o = m.beam || {}, P = this.body(), ps = hitIds(m).map(id => P[id]).filter(Boolean);
    const pt = ps.length ? [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length] : [this.x + this.dir * 30, this.groundY + this.y - 60];
    this.w.beams.push({ x: pt[0], y: pt[1], z: this.z, dir: this.dir, vx: this.dir, w: (o.width ?? 14) * k, range: (o.range ?? 500) * k, dur: o.duration ?? 0.25, t: 0, hit: false, look: o.look || 'laser', owner: this, m, parts: o.parts || null,
      ang0: o.angle || 0, ang1: o.angleTo ?? o.angle ?? 0, rehit: o.rehit || 0, hitAt: -1, follow: !!o.follow, hitIds: hitIds(m) });
    a.hit = true; // fired: not a whiff
  }
  // reaching for a weapon: it slides and turns on the floor so its handle meets the hand at the grip key; let go if the reach is cut short
  reach(dt) {
    const it = this.taking;
    if (!this.action?.pick) { it.taker = null; this.taking = null; return; }
    const hand = this.body()[(this.ch.chains.arm.find(c => c[0].side === 'f') || this.ch.chains.arm[0])?.at(-1).id];
    if (!hand) return;
    const a = this.action, keys = a.m.keys, g = Math.max(0, keys.findIndex(k => k.grip)), left = keys.slice(a.i, g + 1).reduce((s, k) => s + k.d, -a.t);
    const w = WEAPONS[it.type], half = it.kind === 'prop' ? PROPS[it.type].size : (w.len - (w.back || 0)) / 2, rot = this.dir > 0 ? 0 : Math.PI, k = Math.min(1, dt / Math.max(dt, left)); // the rest of the way in the time left
    if (it.rot !== undefined) { // weapon item (not a limb)
      it.rot += wrap180((rot - it.rot) / R) * R * k;
      it.x += (hand[0] + Math.cos(it.rot) * half - it.x) * k;
    } // limbs stay in place, just held
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
  // style (the key's warp): true leaves after-images along the jump; 'streak' (a Raiden teleport) breaks the body into streaks that
  // fade where it stood, then it flashes in at the new spot and snaps to full width. Where it lands is the same either way
  warp(style = true) {
    const o = this.w.nearestFoe(this), side = o ? Math.sign(o.x - this.x) || this.dir : this.dir, P = this.body(), x0 = this.x;
    this.x = clamp((o ? o.x : this.x) + side * this.c('teleportDist'), 40, W - 40); this.vx = 0; this.dir = -side;
    this.trail = []; this.poseHist = []; // no streak across the jump
    if (style === 'streak') { this.after = []; this.warpFx = { P, dx: Math.sign(this.x - x0) || 1, t: 0 }; return; }
    this.after = [0, 1, 2].map(i => { const dx = (this.x - x0) * i / 3, Q = {}; for (const k in P) Q[k] = [P[k][0] + dx, P[k][1]]; return { P: Q, t: 0.3 - i * 0.08 }; });
  }
  // grow morph (drawing only): a growing or shrinking bone's thickness and a circle's radius follow its length, so a limb
  // swells out of the joint instead of popping in at full width
  growMul() {
    const m = this.morph; if (!m?.gd) return null;
    const thick = { ...this.mul.thick }, r = {};
    for (const id in m.gd) { const b = this.ch.by[id], full = Math.max(m.lens[id] ?? 0, b?.len ?? 0), k = full ? clamp(this.lens[id] / full, 0, 1) : 1;
      thick[id] = (thick[id] ?? 1) * k; if (b?.shape === 'circle') r[id] = full * k; }
    return { ...this.mul, thick, r };
  }
  // a weapon move's blow, by the weight of the weapon held
  weaponHit(m) {
    const w = m.weapon && this.weapon, k = w ? weaponPower(w) : 1;
    if (w) this.wearWeapon();
    return k === 1 ? m : { ...m, power: m.power * k, damage: m.damage * k, knock: m.knock * k };
  }
  // a chargeable move's current power multiplier (move field charge: dur, timeout, min, max; charge = seconds held)
  chargeMul(m, charge) {
    if (!m.charge) return 1;
    const { dur = 1, min = 1, max = 2 } = m.charge;
    return min + Math.min(1, (charge || 0) / dur) * (max - min);
  }
  // a chargeable move's blow, by how long its button was held: scales power, damage and knock
  chargedHit(m, charge) {
    const k = this.chargeMul(m, charge);
    return k === 1 ? m : { ...m, power: m.power * k, damage: m.damage * k, knock: m.knock * k };
  }
}
addMethods(Fighter, FighterMoves);
