'use strict';
// Fighter, part 2 of 4 (after fighter.js): feet and legs. Walk and air leg poses over the IK below, the floor under each foot, planted feet
// two-bone IK: thigh th and shin a turn so a's end reaches (tx, ty), in the unflipped rig space of L / wa (fk of P); the
// knee bends the way it bends now. P is changed in place
// fk of a stance's own pose, per character (stance bodies share a pose object but not their lengths): the walk's rest
// spots, recomputed only when the pose object changes (an edit or a morph makes a new one)
const BASE_FK = new WeakMap();
function baseFk(ch, pose) {
  let m = BASE_FK.get(pose); if (!m) BASE_FK.set(pose, m = new WeakMap());
  let L = m.get(ch); if (!L) m.set(ch, L = fk(ch, pose, 1));
  return L;
}
function legIK(ch, P, wa, L, th, a, tx, ty, lens) {
  const pb = ch.by[th.parent], pw = pb ? wa[pb.id] : 0, o = L[th.parent || 'hip'], l1 = lens?.[th.id] ?? th.len, l2 = lens?.[a.id] ?? a.len;
  tx -= o[0]; ty -= o[1];
  const d = clamp(Math.hypot(tx, ty), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const base = Math.atan2(tx, ty) / R, al = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)) / R;
  const local = (b, w, pw, prw) => P[b.id] + wrap180(w - pw + b.level * (pw - prw) - P[b.id]);
  const out = (b, v) => Math.max(0, (b.min ?? -1e9) - v, v - (b.max ?? 1e9)); // how far past its joint limits
  // the two knee solutions: the one inside the joint limits (the knee never bends backwards), else the nearer to the pose now
  const sol = [base + al, base - al].map(w1 => {
    const kn = [o[0] + Math.sin(w1 * R) * l1, o[1] + Math.cos(w1 * R) * l1], w2 = Math.atan2(o[0] + tx - kn[0], o[1] + ty - kn[1]) / R;
    const v1 = local(th, w1, pw, pb ? pb.restW : 0), v2 = local(a, w2, w1, th.restW);
    return { v1, v2, cost: (out(th, v1) + out(a, v2)) * 1e3 + Math.abs(wrap180(w1 - wa[th.id])) };
  }).reduce((m, x) => x.cost < m.cost ? x : m);
  P[th.id] = sol.v1; P[a.id] = sol.v2;
}
class FighterLegs {
  // where the floor is under the rig-space joints L: the body's lowest point stands on it, or, in a stance off the floor
  // anchor (hipH), the hip stands hipH above it whatever the feet do (not knocked down, crouching or in the jump squat)
  floorY(L) {
    const h = this.st.hipH;
    if (h != null && !this.kd && !this.rag && !this.crouching && !(this.squatT > 0)) return h;
    let fy = 0; for (const b of this.ch.bones) fy = Math.max(fy, L[b.id][1] + (b.shape === 'circle' ? b.len : 0));
    return fy;
  }
  // the procedural walk's legs: each ankle follows a step path in the hip's space, solved with two-bone IK, so a foot
  // travels as far forward as back (stride, swing), lifts on the way forward (lift) and steps around its stance spot or
  // under its hip (stepCenter); legs alternate (a centaur trots: diagonal pairs). A one-bone leg just swings
  walkLegs(P, base, ph, k, w, run = 0) {
    if (!w) return; // standing: the stance as authored (an IK round trip would nudge a straight leg)
    const ch = this.ch, g = ch.gait, wa = {}, L = fk(ch, P, 1, null, wa), R0 = baseFk(ch, base), mix = Math.min(1, w * 4), Q = { ...P };
    ch.chains.leg.forEach((cn, i) => {
      const q = ph + i * Math.PI, ai = cn.length >= 3 ? cn.length - 2 : cn.length - 1, a = cn[ai], th = cn[ai - 1];
      if (!th) { P[cn[0].id] += cn[0].fwd * Math.sin(q) * 28 * g.stride * k; return; }
      const o = L[th.parent || 'hip'], ll = th.len + a.len, x0 = R0[a.id][0], cx = x0 + (o[0] - x0) * g.stepCenter * Math.min(1, w);
      const amp = Math.sin(28 * R) * ll * g.stride * k * (1 + 0.35 * run), x = cx + amp * (Math.sin(q) + g.swing), dx = x - o[0], top = ll * 0.97;
      // out of the leg's reach at that height the foot rises onto the reach circle, so it still gets as far as the other way
      // bob: both feet a little higher when both are down (the hip dips between steps, the floor snap carries it)
      const y = Math.min(R0[a.id][1] - Math.max(0, Math.cos(q)) * ll * 0.22 * g.lift * k * (1 + 0.8 * run) - Math.abs(Math.sin(q)) * ll * 0.06 * g.bob * k, o[1] + Math.sqrt(Math.max(0, top * top - dx * dx)));
      legIK(ch, Q, wa, L, th, a, x, y);
      for (const b of [th, a]) P[b.id] += (Q[b.id] - P[b.id]) * mix; // eased in from standing
      // foot roll: toes up as the heel strikes in front, down as the toes push off behind, flat in between
      const ft = cn[ai + 1];
      const roll = ft && g.footRoll ? Math.sin(q) * 22 * g.footRoll * k * Math.sign(Math.sin(ft.restW * R) || 1) : 0;
      if (roll) P[ft.id] += roll;
      // a toe after the foot bends at the ball: it stays on the floor as the heel lifts behind (push-off)
      const toe = cn[ai + 2];
      if (toe && roll && Math.sin(q) < 0) P[toe.id] -= roll;
    });
  }
  // in the air the legs are never still: they trail the body's speed (airDrag) and cycle a little (airKick) on top of the
  // air / airFall poses, and reach down for the floor as the fighter drops toward it (airReach)
  airLegs(P, turn, flex) {
    const g = this.ch.gait, t = this.airT, fall = clamp(this.vy / 600, -1, 1), near = clamp(1 + this.y / 90, 0, 1);
    // an air dash streams the legs out behind the burst, knees folded back, easing out with it
    const dash = this.airDashT > 0 ? clamp(this.airDashT / 0.1, 0, 1) * Math.sign(this.vx * this.dir || 1) : 0;
    const drag = (clamp(-this.vx * this.dir / 400, -1, 1) * 18 - dash * 22) * g.airDrag;
    this.ch.chains.leg.forEach((c, i) => {
      const q = t * 7 + i * Math.PI, ease = Math.max(Math.abs(dash), Math.min(1, t * 4));
      turn(c[0], (drag + Math.sin(q) * 10 * g.airKick) * ease);
      flex(c[1], (Math.abs(dash) * 35 * g.airDrag + Math.max(0, Math.cos(q)) * 14 * g.airKick - (fall > 0 ? fall * near * 30 * g.airReach : 0)) * ease);
    });
  }
  // foot planting (plant setting): a foot the animation puts on the floor stays at its spot in the world and its leg bends to reach it
  // (two-bone IK on the bones above the ankle, the knee bending the way the animation bends it); a foot left more than plantStep
  // from where the animation puts it steps there, one foot at a time. The result (planted) is what is drawn and hit; the springs keep disp
  plantFeet(dt) {
    const c = k => this.c(k), ch = this.ch;
    this.planted = null;
    if (!c('plant') || !this.grounded || this.kd || this.rag || this.spin || this.y < 0) { this.feet = []; return; }
    const wa = {}, L = fk(ch, this.disp, 1, this.lens, wa), p = { ...this.disp }, k = this.xs * (1 - this.sq * 0.5);
    const fy = this.floorY(L);
    ch.chains.leg.forEach((cn, i) => {
      const ai = cn.length >= 3 ? cn.length - 2 : cn.length - 1, a = cn[ai], th = cn[ai - 1], tip = cn[cn.length - 1];
      // lifted by the animation: it leads · forcePlant (cn[0]) skips this for a leg that never reaches the body's own lowest point
      // (a short or high-set extra leg), so it still steps instead of just swinging in place, uncorrected, forever "in the air"
      if (!th || (!cn[0].forcePlant && fy - Math.max(L[a.id][1], L[tip.id][1]) > 4)) { this.feet[i] = null; return; }
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
}
addMethods(Fighter, FighterLegs);
