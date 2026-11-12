'use strict';
// Fighter, part 3 of 4: the ragdoll. Going limp, taking hits while limp, and the verlet step that moves the limp body
class FighterRag {
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
    // a body edited mid-fall (a new bone, a chain's segments) gets its new joints where their parents are
    for (const b of this.ch.bones) if (!this.rag.p[b.id]) { const q = this.rag.p[b.parent || 'hip']; this.rag.p[b.id] = { ...q, vx: q.vx, vy: q.vy, r: b.shape === 'circle' ? b.len : 0 }; }
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
          const pb = ch.by[b.parent], pid = pb ? pb.id : ref.id, a = r.p[b.parent || 'hip'], far = r.p[pb ? pb.parent || 'hip' : ref.id];
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
      // a tech (G just before landing): ← / → held aims it that way, otherwise it recovers back and away as before
      else if (!this.ko && c('techWindow') && within(this.w.simT - this.guardT, c('techWindow'), c('lastFrame'))) {
        const x = this.inp.right - this.inp.left;
        this.endRag(); this.kd = null; this.grounded = true; this.y = 0; this.start('getup'); this.hurtT = 0.3; this.vx = x ? x * 150 : -this.dir * 150; this.say('TECH');
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

}
addMethods(Fighter, FighterRag);
