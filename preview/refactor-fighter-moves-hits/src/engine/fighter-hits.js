'use strict';
// Fighter, part 3 of 6 (after fighter-moves.js): strikes, clashes, hurtboxes, guarding, parries, catches, grabs, taking hits, body points
class FighterHits {
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
      // throws only catch a standing, free fighter; an air throw (move flag air) is the mirror: only an airborne one.
      // catchFly is additional, not exclusive: it also catches a foe still flying from an earlier launch (kd 'fly'),
      // a throw chain - a normal/air throw still needs the usual grounded/airborne + free fighter if that foe isn't one
      if (a.m.throw) {
        const reach = a.m.catchFly && o.kd === 'fly' ? true : (a.m.air ? !o.grounded : o.grounded) && o.free;
        if (!reach || o.heldBy || o.squatT > 0) continue;
      }
      const cl = this.clashWith(o, ss);
      if (cl) { this.w.clash(this, o, cl); break; }
      // several striking bones: the deepest overlap counts, one hit per foe per move
      const h = ss.map(s => o.hurtAt(s, c('hitTest') === 'target', otg)).reduce((best, h) => h && (!best || h.d < best.d) ? h : best, null);
      if (h) { a.hits.push(o); a.hit = true; out.push({ f: this, o, h, a, m: this.weaponHit(this.chargedHit(a.m, a.charge)), key: a.m.keys[a.i] }); }
    }
    this.lastTips = Object.fromEntries(ss.map(s => [s.id, s[1]]));
    this.lastSegs = Object.fromEntries(ss.filter(s => !s.sweep).map(s => [s.id, [s[0], s[1]]]));
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
  // active strikes that meet: the meeting point and which side(s) met it with a weapon (so a clash can wear a
  // breakable one down), or null (clash setting: only when a weapon is in it, or any strikes)
  clashWith(o, ss) {
    const mode = this.c('clash'), oa = o.action;
    if (mode === 'off' || this.action.m.throw || !oa?.m.keys[oa.i]?.active || oa.m.throw || oa.hits.includes(this)) return null;
    const wpn = (f, s) => f.ch.by[s.id]?.role === 'weapon', half = (f, s) => (f.ch.by[s.id]?.thick ?? BONE.thick) / 2;
    for (const s of ss) for (const t of o.strikeShapes(oa.m))
      if ((mode === 'all' || wpn(this, s) || wpn(o, t)) && distSegSeg(s[0], s[1], t[0], t[1]) < s[2] + t[2] + half(this, s) + half(o, t))
        return { pt: [(s[1][0] + t[1][0]) / 2, (s[1][1] + t[1][1]) / 2], aWeapon: wpn(this, s), bWeapon: wpn(o, t) };
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
  // a strike caught by a catch key: the counter move answers it at once (its damage lands now, its keys only animate).
  // counter: 'MIRROR' plays the attacker's own connecting move back at them instead of one fixed named move - a true
  // mirror/reversal, since what lands depends on whatever move the opponent actually threw, not what this move's author picked
  catchHit(att, hit) {
    const named = this.action.m.counter;
    const m = named === 'MIRROR' ? att.action?.m : this.ch.moves[named];
    this.say('CATCH');
    if (!m) return;
    this.start(m);
    this.w.onHit(this, att, { bone: att.ch.by[hitIds(att.action?.m)[0]] || hit.bone, pt: hit.pt }, m, null);
  }
  // a throw connected: the victim is held for the tech window, then thrown by the move named in the grab's throw.
  // ← / → held as it lands aims it: back throws the other way (whichever grab move caught them), forward or neutral keeps it.
  // holdOptions (command-grab follow-ups): holding punch/kick/special as it connects plays that toss instead; first match wins
  seize(o) {
    o.exitOn('grab');
    o.heldBy = this; o.heldT = this.c('techWindow'); o.heldAt = this.w.simT; o.buffer = null; o.guarding = false; o.blockT = 0; o.dir = -this.dir; o.away = false;
    o.kd = null; // caught out of a fall (catchFly): held now, not still "falling" alongside it
    const backGrab = (this.inp.right - this.inp.left) * this.dir < 0 && this.ch.moves[this.binds.backThrow];
    const grab = backGrab || this.action.m;
    const picked = grab.holdOptions?.find(opt => this.inp[opt.input + 'Held'] && this.ch.moves[opt.throw]);
    const toss = this.ch.moves[picked?.throw] || this.ch.moves[grab.throw];
    o.heldM = toss || this.action.m;
    const hold = o.heldM.holdPose; // toss.holdPose: hang in an authored pose instead of the generic randomized flinch
    o.start(hold ? { hurt: true, keys: [{ d: 0.08, e: 'outExpo', p: hold }, { d: 9, e: 'linear', p: hold }] } : makeHurt(o.ch.hurt.mid[0], 9, this.w.rand, o.st.pose));
    o.hurtT = 9;
    if (toss) this.start(toss);
  }
  // held in a throw: pinned in front of the thrower (or at toss.holdAt's offset); P+G inside the window breaks free, else the throw lands
  held(dt, inp) {
    const t = this.heldBy, at = this.heldM?.holdAt;
    const to = t.x + t.dir * (at?.dx ?? 30); // a back throw swings the victim round: it slides to the thrower's other side
    this.x = Math.abs(to - this.x) > 20 ? approach(this.x, to, 1200 * dt) : to; this.z = t.z + (at?.dz ?? 0); this.vx = 0;
    this.y = t.y + (at?.dy ?? 0); this.vy = 0; // an air throw: held at the thrower's height, gravity held off (see update(), gated on heldBy)
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
    if (this.ch.weapon && !this.weapon.fixed && !this.rag && this.w.items && (m.kd || m.power * this.c('powerScale') >= this.c('disarm'))) { this.letGo(false); this.say('DISARM'); }
    if (this.heldProp && !this.rag && this.w.items && (m.kd || m.power * this.c('powerScale') >= this.c('disarm'))) { this.letGoProp(false); this.say('DISARM'); }
    // counter hit: caught in the startup or active frames of its own attack
    const ck = own && a.m.power && a.i < a.m.cancel ? this.c('counterHit') : 1;
    const combo = this.combo = (this.free ? 0 : this.combo) + 1, dmg = this.damageOf(m, combo) * ck, wasDizzy = this.dizzyT > 0;
    if (ck > 1) this.say('COUNTER');
    if (hurt && (this.hp -= dmg) <= 0) { this.hp = 0; this.ko = true; this.say('K.O.'); }
    // super meter: both fighters gain it on a landed hit, the attacker from dealing it, the defender from taking it
    if (this.c('superMeter')) { this.power = Math.min(this.c('superAt'), this.power + dmg * this.c('superGain')); att.power = Math.min(att.c('superAt'), att.power + dmg * att.c('superGain')); }
    // dismemberment: a lethal slash severs the struck limb — or, on the spine, a full cleave: everything above the
    // hit (chest/neck/head, both arms) comes off as one piece, same mechanism, just a bigger one. Either way the
    // fighter's own remaining bones (always including the hip and both legs) carry on into the normal K.O. fall
    if (this.ko && m.hit === 'weapon' && m.weapon === 'slash' && this.c('dismember') && hit.bone.role && ['arm', 'leg', 'tail', 'head', 'spine'].includes(hit.bone.role)) {
      const P = this.body(), cleave = hit.bone.role === 'spine';
      const limb = collectLimbSegments(this.ch, hit.bone, P, this.col[0]);
      limb.vx = att.dir * Math.abs(this.vx) * 0.6 + this.w.rand(-60, 60);
      limb.vy = -Math.abs(this.vy) * 0.5 + this.w.rand(-80, -20);
      limb.type = 'limb'; // pickable as a weapon
      this.w.limbs.push(limb);
      // sever: hide the struck bone and everything below it
      const severed = bodyDef(this.ch.def, { bones: { [hit.bone.id]: { hidden: true } } });
      this.setChar(makeCharacter(severed), true);
      // blood spray: more of it for a full cleave than a single limb
      for (let i = 0; i < (cleave ? 16 : 8); i++) {
        const a = this.w.rand() * 6.283, sp = (80 + this.w.rand() * 120);
        const life = 0.5 + this.w.rand() * 0.3;
        this.w.parts.push({ t: 'spark', x: hit.pt[0], y: hit.pt[1], z: this.z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life, max: life, col: '#8a2d26' });
      }
    }
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
      this.splat = !!m.wall; this.wallB = !!m.wallbounce; this.gb = !!m.bounce && !otg; this.splatT = 0; this.flyT = 0; this.flyHit.length = 0; this.chainN = 0; // flyClip corrects this right after, for a domino launch
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
  // world-space joints: lowest body point snapped to the ground, then squash/stretch around it.
  // free (the scene editor's poseOverride only): skip the ground snap so a dragged pose can leave the floor entirely
  points(p, lens, free) {
    // a bone with turnSnap (default: role 'head') mirrors to face (dir) right away instead of squashing through xs
    // with the rest of the body, so it doesn't gather into the chest mid-turn (the turnTuck squish) - a second head,
    // a tail, antennae... anything that should snap around instead of squashing can opt in with turnSnap: true,
    // and a head that should squash normally with the body can opt out with turnSnap: false
    const L = fk(this.ch, p, b => (b.turnSnap ?? b.role === 'head') ? this.dir : this.xs, lens);
    if (this.kd === 'down' && !this.rag) settle(this.ch, L); // the lie pose rolls to the angle it lies flattest at
    let fy = free ? 0 : this.floorY(L);
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
  // poseOverride (replay.js's scene editor only): bone id -> angle, merged over the real pose for drawing only. Never
  // set during a live fight or w.advance() - only bracketed around a single render() call - so hit detection and
  // replay determinism never see it; it exists purely to let the replay editor pose a paused frame by dragging joints.
  // While it's set, pose from disp (not the frozen foot-plant IK result in planted) and skip the ground snap, so no
  // leg stays anchored to its last live-sim planted spot and a free pose isn't pulled back down onto the floor
  body() {
    if (this.poseOverride) return this.points({ ...this.disp, ...this.poseOverride }, this.lens, true);
    return this.points(this.planted || this.disp, this.lens);
  }
}
addMethods(Fighter, FighterHits);
