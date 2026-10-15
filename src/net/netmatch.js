'use strict';
// ---------- netplay match (layer 4, see docs/netplay.md): both sides run the same World from the lobby's header, fed both players' inputs ----------
// Input delay: our input made at frame f is for frame f + delay, sent at once, so it has usually arrived on the other side by the
// time that frame runs. Then either:
// - lockstep (roll 0): a frame runs only once both inputs for it are in; until then the match waits (a stall);
// - rollback (roll > 0): a frame whose input from them hasn't come runs anyway on a guess (their last input, held, no new
//   presses), up to roll frames ahead of the last frame both inputs are in for (the confirmed frame). When their real input
//   turns out different, the world goes back to the snapshot before that frame and plays forward again, silently, with it.
// Every NETMATCH.sumEvery confirmed frames each side sends its state hash: a different one is a desync. Inputs go as the replay's
// key bitmask, each message carrying every input the other side hasn't acknowledged yet (so a lost one costs nothing). Frame time
// is fixed (1/60 s), never wall time: the same inputs give the same fight. Pure logic, no DOM.
const NETMATCH = { dt: 1 / 60, delay: 2, maxDelay: 8, roll: 7, maxRoll: 12, sumEvery: 30, resend: 30, catchUp: 2 };
const NET_EDGES = ['hop', 'punch', 'kick', 'special']; // presses: they carry over a stall, and a guess never repeats them
const NET_NONE = []; // stands in for the drawing-only histories while a snapshot is taken
// a snapshot leaves out what the world keeps across a restore anyway (KEEP), and its match: world.net points back at the match,
// whose own snapshots would otherwise be copied into every new one
const NET_SKIP = [...KEEP, 'net'];

class NetMatch {
  // header: the lobby's match (a replay header); side: 0 = P1 (the host), 1 = P2; send(m): to the other side
  // hooks: end(result) once the fight is over (confirmed); desync(frame) on the first differing hash;
  //        confirmed(frame, p1, p2, hash?) as each frame is confirmed, with both real inputs (the host relays these to spectators)
  // delay: frames between an input and the frame it's for; roll: how many frames we may run ahead on a guess (0 = lockstep).
  // Both default to the header's (netDelay, netRoll: set by the host, so both sides use the same).
  constructor({ header, side, delay = header.netDelay ?? NETMATCH.delay, roll = header.netRoll ?? 0, send = () => {}, hooks = {} }) {
    const w = this.world = new World({ ...SCENARIOS[header.scenario], ...header.scen }, header.cfg, header.seed, header.chars.map(makeCharacter));
    w.loop = false;
    // rewind is off for a match (netui.js), so its checkpoints only need the hash a replay file keeps, not the full copy of the world
    // (~10 ms each, every second, and again on each rollback that crosses one)
    w.checkpoint = function () { this.sums[this.log.length] = this.stateHash(); };
    w.net = this; // the app drives a world with .net through its match, and keeps it out of rewind, scrub and macros (netui.js)
    delay = Math.max(1, Math.min(NETMATCH.maxDelay, Math.round(delay)));
    roll = Math.max(0, Math.min(NETMATCH.maxRoll, Math.round(roll)));
    // f: the frame the world is at; c: the confirmed frame (every frame before it ran on both real inputs)
    // used[k]: their input frame k ran on (real or a guess); snaps[k]: the world before frame k, for each guessed frame from c to f
    // (only a guess can turn out wrong, so only a guessed frame is ever gone back to); at[k]: the state hash before frame k, at checks
    Object.assign(this, { header, side, delay, roll, send, hooks, keys: header.keys, f: 0, c: 0, next: delay, mine: [], theirs: [], used: [], snaps: {}, at: {},
      acked: -1, pend: 0, sums: {}, theirSums: {}, desync: null, result: null, stalls: 0, rollbacks: 0, rolled: 0 });
    // our first frames, before any input of ours can land, are idle; theirs come over the network like any other (never assumed),
    // so the two sides stay in step even with different delays
    for (let i = 0; i < delay; i++) this.mine[i] = 0;
    this.edges = NET_EDGES.reduce((m, k) => m | 1 << this.keys.indexOf(k), 0);
  }
  mask(inp) { return this.keys.reduce((m, k, i) => m | (inp?.[k] ? 1 << i : 0), 0); }
  unmask(m) { return Object.fromEntries(this.keys.map((k, i) => [k, !!(m >> i & 1)])); }
  // the highest frame we have every input of theirs up to
  have() { let i = this.c; while (this.theirs[i] !== undefined) i++; return i - 1; }

  // one wall-clock frame: our input in, any late input of theirs reconciled (a rollback if a guess was wrong), then as many frames
  // as the inputs allow (a few, to catch up after a stall). → frames run forward
  tick(inp) {
    if (this.result) return 0;
    if (this.next <= this.f + this.delay) { // keep our lead at exactly delay frames; while stalled, only remember the presses
      this.mine[this.next++] = this.mask(inp) | this.pend; this.pend = 0;
    } else this.pend |= this.mask(inp) & this.edges;
    this.flush(); // every tick, stalled or not: if what we sent was lost, both sides would otherwise wait forever
    this.reconcile();
    let ran = 0;
    // a frame per tick of our own input (f trails it by exactly the delay): more only to catch up after a wait, never run off ahead
    while (ran < NETMATCH.catchUp && this.f + this.delay < this.next && !this.world.done && (this.theirs[this.f] !== undefined || this.f - this.c < this.roll)) { this.step(this.f); this.confirm(); ran++; }
    this.confirm();
    if (!ran && !this.result) this.stalls++;
    return ran;
  }
  // every input the other side hasn't acknowledged (at most the last resend), plus how far we've got theirs
  flush() {
    const from = Math.max(this.acked + 1, this.next - NETMATCH.resend);
    this.send({ t: 'in', f: from, b: this.mine.slice(from, this.next), a: this.have() });
  }
  receive(m) {
    if (m.t === 'in') {
      if (typeof m.a === 'number') this.acked = Math.max(this.acked, m.a);
      if (Array.isArray(m.b)) m.b.forEach((b, i) => { this.theirs[m.f + i] ??= b | 0; });
    } else if (m.t === 'sum') { this.theirSums[m.f] = m.h; this.check(m.f); }
  }
  // their input for frame k: the real one, else a guess (their latest known input, held: no new presses)
  guess(k) {
    if (this.theirs[k] !== undefined) return this.theirs[k];
    for (let i = k - 1; i >= 0; i--) if (this.theirs[i] !== undefined) return this.theirs[i] & ~this.edges;
    return 0;
  }
  step(k) {
    if (this.theirs[k] === undefined) this.snaps[k] = this.snapshot();
    if (k % NETMATCH.sumEvery === 0) this.at[k] = this.world.stateHash();
    const them = this.used[k] = this.guess(k), me = this.unmask(this.mine[k]), t = this.unmask(them);
    this.world.advance(NETMATCH.dt, ...this.side ? [t, me] : [me, t]);
    this.f = k + 1;
  }
  // a guessed frame whose real input has come in different: back to before it, and forward again to where we were
  reconcile() {
    let k = this.c;
    while (k < this.f && (this.theirs[k] === undefined || this.theirs[k] === this.used[k])) k++;
    if (k >= this.f) return;
    const to = this.f, w = this.world, sfx = w.sfx;
    this.restore(k);
    w.sfx = null; // what already played isn't played twice
    while (this.f < to && !w.done) this.step(this.f); // (a fight that now ends sooner stops there)
    w.sfx = sfx;
    this.rollbacks++; this.rolled += to - k;
  }
  // the confirmed frame moves up over every frame that ran on their real input: hashes and the end only ever come from there
  confirm() {
    while (this.c < this.f && this.theirs[this.c] !== undefined && this.theirs[this.c] === this.used[this.c]) {
      const k = this.c++, h = this.c % NETMATCH.sumEvery === 0 ? this.sums[this.c] = this.c === this.f ? this.world.stateHash() : this.at[this.c] : undefined;
      delete this.snaps[k]; delete this.at[k];
      if (h !== undefined) { this.send({ t: 'sum', f: this.c, h }); this.check(this.c); }
      this.hooks.confirmed?.(k, ...this.side ? [this.theirs[k], this.mine[k]] : [this.mine[k], this.theirs[k]], h); // for spectators
    }
    if (this.c === this.f && this.world.done && !this.result) { this.result = this.outcome(); this.hooks.end?.(this.result); }
  }
  check(f) {
    if (this.desync !== null || this.sums[f] === undefined || this.theirSums[f] === undefined || this.sums[f] === this.theirSums[f]) return;
    this.desync = f; this.hooks.desync?.(f);
  }

  // ---------- snapshots: the world without what's only drawn (pose and trail histories, the debug graphs), ~20x cheaper ----------
  snapshot() {
    const w = this.world, keep = w.fighters.map(f => [f.poseHist, f.trail]), hist = w.hist;
    for (const f of w.fighters) f.poseHist = f.trail = NET_NONE;
    w.hist = null;
    try { return cloneState(w, new Map([[NET_NONE, NET_NONE]]), NET_SKIP); }
    finally { w.fighters.forEach((f, i) => { [f.poseHist, f.trail] = keep[i]; }); w.hist = hist; }
  }
  // back to the snapshot before frame k: the drawn histories carry on as they were; the log, its checkpoints and every snapshot
  // after k go (they're about to be played again)
  restore(k) {
    const w = this.world, keep = w.fighters.map(f => [f.poseHist, f.trail]), hist = w.hist;
    w.restore(this.snaps[k]);
    w.fighters.forEach((f, i) => { [f.poseHist, f.trail] = keep[i] || [[], []]; });
    w.hist = hist;
    w.log.length = k; w.checkpoints = w.checkpoints.filter(cp => cp.i < k);
    for (const i of Object.keys(this.snaps)) if (+i >= k) delete this.snaps[i]; // (k's own is taken again as it runs again)
    this.f = k;
  }

  // who won: the side still standing; at a time out, the one with more health left (null: a draw)
  outcome() {
    const [a, b] = [this.world.a, this.world.b], ko = f => !!f.ko || f.hp <= 0;
    const winner = ko(a) !== ko(b) ? (ko(a) ? 1 : 0) : a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1;
    return { winner, frames: this.f, hash: this.world.stateHash() };
  }
  // the match so far as a replay file (the header plus every frame's inputs), to save, scrub or compare after a desync
  replay() { return makeReplay(this.world, this.header.scenario); }
}

// ---------- a spectator's match: the fight from the host's confirmed frames (both real inputs), never a guess ----------
// The host batches what its match confirms ({ t: 'watch', f, a: P1 masks, b: P2 masks, s: { frame: hash } }); the spectator plays
// it a little behind (NETWATCH.buffer frames, so an uneven arrival doesn't stutter), one frame per tick, faster when it falls
// further behind, and checks its own state hashes against the host's.
const NETWATCH = { buffer: 4, catchUp: 3, far: 12 };
class NetWatch {
  constructor({ header, hooks = {} }) {
    const w = this.world = new World({ ...SCENARIOS[header.scenario], ...header.scen }, header.cfg, header.seed, header.chars.map(makeCharacter));
    w.loop = false;
    w.checkpoint = function () { this.sums[this.log.length] = this.stateHash(); }; // no rewind here either (see NetMatch)
    w.net = this;
    Object.assign(this, { header, hooks, keys: header.keys, f: 0, p1: [], p2: [], sums: {}, hostSums: {}, desync: null, result: null, stalls: 0, started: false, watching: true });
  }
  unmask(m) { return Object.fromEntries(this.keys.map((k, i) => [k, !!(m >> i & 1)])); }
  get behind() { return this.p1.length - this.f; } // frames received but not yet played
  receive(m) {
    if (m.t !== 'watch') return;
    m.a.forEach((x, i) => { this.p1[m.f + i] = x | 0; this.p2[m.f + i] = m.b[i] | 0; });
    for (const [f, h] of Object.entries(m.s || {})) { this.hostSums[f] = h; this.check(+f); }
  }
  // one wall-clock frame; the input is ignored (a spectator has no say)
  tick() {
    if (this.result) return 0;
    if (!this.started && this.behind >= NETWATCH.buffer) this.started = true; // wait for a small cushion first
    if (!this.started) return 0;
    const n = this.behind > NETWATCH.far ? NETWATCH.catchUp : 1;
    let ran = 0;
    for (; ran < n && this.p1[this.f] !== undefined && !this.world.done; ran++) {
      this.world.advance(NETMATCH.dt, this.unmask(this.p1[this.f]), this.unmask(this.p2[this.f]));
      this.f++;
      if (this.f % NETMATCH.sumEvery === 0) { this.sums[this.f] = this.world.stateHash(); this.check(this.f); }
    }
    if (!ran && !this.world.done) this.stalls++;
    if (this.world.done && !this.result) { this.result = NetMatch.prototype.outcome.call(this); this.hooks.end?.(this.result); }
    return ran;
  }
  check(f) {
    if (this.desync !== null || this.sums[f] === undefined || this.hostSums[f] === undefined || this.sums[f] === this.hostSums[f]) return;
    this.desync = f; this.hooks.desync?.(f);
  }
  replay() { return makeReplay(this.world, this.header.scenario); }
}
