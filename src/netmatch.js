'use strict';
// ---------- netplay match (layer 4, see docs/netplay.md): both sides run the same World from the lobby's header, fed both players' inputs ----------
// Lockstep with input delay: our input made at frame f is for frame f + delay, sent at once, so it has usually arrived on the
// other side by the time that frame runs. A frame runs only once both inputs for it are in; until then the match waits (a stall).
// Every NETMATCH.sumEvery frames each side sends its state hash: a different one is a desync. Inputs go as the replay's key
// bitmask, each message carrying every input the other side hasn't acknowledged yet (so a lost one costs nothing on an unreliable
// channel later). Frame time is fixed (1/60 s), never wall time: the same inputs give the same fight. Pure logic, no DOM.
const NETMATCH = { dt: 1 / 60, delay: 2, maxDelay: 8, sumEvery: 30, resend: 30, catchUp: 2 };
const NET_EDGES = ['hop', 'punch', 'kick', 'special']; // a press during a stall must not be lost: these carry over to the next input

class NetMatch {
  // header: the lobby's match (a replay header); side: 0 = P1 (the host), 1 = P2; send(m): to the other side
  // hooks: end(result) once the fight is over; desync(frame) on the first differing hash
  // delay: frames between an input and the frame it's for (the header's netDelay, set by the host, else NETMATCH.delay)
  constructor({ header, side, delay = header.netDelay ?? NETMATCH.delay, send = () => {}, hooks = {} }) {
    const w = this.world = new World({ ...SCENARIOS[header.scenario], ...header.scen }, header.cfg, header.seed, header.chars.map(makeCharacter));
    w.loop = false;
    delay = Math.max(1, Math.min(NETMATCH.maxDelay, Math.round(delay)));
    Object.assign(this, { header, side, delay, send, hooks, keys: header.keys, f: 0, next: delay, mine: [], theirs: [], acked: -1, pend: 0,
      sums: {}, theirSums: {}, desync: null, result: null, stalls: 0 });
    // our first frames, before any input of ours can land, are idle; theirs come over the network like any other (never assumed),
    // so the two sides stay in step even with different delays
    for (let i = 0; i < delay; i++) this.mine[i] = 0;
    this.edges = NET_EDGES.reduce((m, k) => m | 1 << this.keys.indexOf(k), 0);
  }
  mask(inp) { return this.keys.reduce((m, k, i) => m | (inp?.[k] ? 1 << i : 0), 0); }
  unmask(m) { return Object.fromEntries(this.keys.map((k, i) => [k, !!(m >> i & 1)])); }
  // the highest frame we have every input of theirs up to
  have() { let i = this.f; while (this.theirs[i] !== undefined) i++; return i - 1; }

  // one wall-clock frame: our input in, then as many frames as both inputs allow (a few, to catch up after a stall). → frames run
  tick(inp) {
    if (this.result) return 0;
    if (this.next <= this.f + this.delay) { // keep our lead at exactly delay frames; while stalled, only remember the presses
      this.mine[this.next++] = this.mask(inp) | this.pend; this.pend = 0;
      this.flush();
    } else { this.pend |= this.mask(inp) & this.edges; this.flush(); } // and resend: if what we sent was lost, both sides would wait forever
    let ran = 0;
    while (ran < NETMATCH.catchUp && this.f < this.next && this.theirs[this.f] !== undefined && !this.result) { this.step(); ran++; }
    if (!ran) this.stalls++;
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
  step() {
    const me = this.unmask(this.mine[this.f]), them = this.unmask(this.theirs[this.f]);
    this.world.advance(NETMATCH.dt, ...this.side ? [them, me] : [me, them]);
    this.f++;
    if (this.f % NETMATCH.sumEvery === 0) { const h = this.sums[this.f] = this.world.stateHash(); this.send({ t: 'sum', f: this.f, h }); this.check(this.f); }
    if (this.world.done) { this.result = this.outcome(); this.hooks.end?.(this.result); }
  }
  check(f) {
    if (this.desync !== null || this.sums[f] === undefined || this.theirSums[f] === undefined || this.sums[f] === this.theirSums[f]) return;
    this.desync = f; this.hooks.desync?.(f);
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
