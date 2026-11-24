'use strict';
// ---------- headless verify: the server plays every finished match again on its own copy of the engine ----------
// The host sends its match as a replay (relay.js, { t: 'replay' }). A worker thread plays it through (tools/lib/engine.js, no DOM)
// and checks the replay's own checksums and the host's claimed winner against what the engine makes of the inputs:
//   ok       the fight plays out as recorded, and the winner matches
//   desync   the inputs don't give the recorded checksums (a tampered replay, or a build that plays differently)
//   result   the fight is in sync, but the host claimed another winner
//   version  recorded with another engine version: this server can't check it
//   error    not playable (a broken replay, a timeout)
// A verdict also carries the fight's stats (who played, who won, how long, how it ended) for the metrics.
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');
const VERIFY = { timeoutMs: 20000, queue: 50, frames: 60 * 60 * 15 }; // a replay longer than 15 minutes isn't checked

// the worker: one engine, loaded once, plays replays one at a time
function worker() {
  const engine = require(path.join(__dirname, '..', 'tools', 'lib', 'engine'));
  const { run } = engine();
  const check = run(`(r, claim, max) => {
    try { r = readReplay(r); } catch (e) { return { verdict: 'error', why: e.message }; }
    if (r.version !== ENGINE_VERSION) return { verdict: 'version', why: 'recorded with engine v' + r.version + ', this server runs v' + ENGINE_VERSION };
    if (r.frames.length > max) return { verdict: 'error', why: 'too long to check (' + r.frames.length + ' frames)' };
    const w = replayWorld(r); w.loop = false;
    for (let n = 0; !w.done && !w.playback.over && n <= max; n++) w.advance(1 / 60, NOIN);
    if (!w.done && !w.playback.over) w.advance(0, NOIN); // past the last frame: the end checksum
    if (w.done && w.desync === null && r.end && w.log.length === r.frames.length && w.stateHash() !== r.end) w.desync = w.log.length;
    const [a, b] = [w.a, w.b], ko = f => !!f.ko || f.hp <= 0;
    const winner = ko(a) !== ko(b) ? (ko(a) ? 1 : 0) : a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1;
    const end = ko(a) && ko(b) ? 'double ko' : ko(a) || ko(b) ? 'ko' : 'time';
    const stats = { winner, end, frames: w.log.length, chars: w.fighters.slice(0, 2).map(f => f.ch.name), hp: [a, b].map(f => Math.max(0, Math.round(f.hp))) };
    if (w.desync !== null) return { verdict: 'desync', why: 'came out differently at frame ' + w.desync, frame: w.desync, stats };
    if (claim && claim.forfeit === undefined && claim.winner !== undefined && claim.winner !== winner) return { verdict: 'result', why: 'the host claimed winner ' + claim.winner + ', the fight gives ' + winner, stats };
    return { verdict: 'ok', stats };
  }`);
  parentPort.on('message', ({ id, replay, claim, max }) => {
    let out; try { out = check(replay, claim, max); } catch (e) { out = { verdict: 'error', why: String(e?.message || e).slice(0, 200) }; }
    parentPort.postMessage({ id, out: JSON.parse(JSON.stringify(out)) });
  });
}

// the server's side: a queue in front of one worker (started on first use, started again if it dies or hangs)
class Verifier {
  constructor({ timeoutMs = VERIFY.timeoutMs, queue = VERIFY.queue, frames = VERIFY.frames, now = () => Date.now() } = {}) {
    Object.assign(this, { timeoutMs, max: queue, frames, now, w: null, jobs: [], busy: null, n: 0 });
  }
  // a replay and the host's claimed result in, a promise of { verdict, why?, stats?, seconds } out (never rejects)
  verify(replay, claim = null) {
    return new Promise(done => {
      if (this.queued >= this.max) return done({ verdict: 'error', why: 'the verify queue is full', seconds: 0 });
      this.jobs.push({ id: ++this.n, replay, claim, done });
      this.next();
    });
  }
  get queued() { return this.jobs.length + (this.busy ? 1 : 0); }
  start() {
    const w = this.w = new Worker(__filename), mine = () => this.w === w; // an old worker's last words (after a timeout) are ignored
    w.unref();
    w.on('message', ({ id, out }) => { if (mine() && this.busy?.id === id) this.end(out); });
    w.on('error', e => { if (mine()) this.fail(String(e?.message || e)); });
    w.on('exit', () => { if (!mine()) return; this.w = null; if (this.busy) this.fail('the verify worker stopped'); });
  }
  next() {
    if (this.busy || !this.jobs.length) return;
    if (!this.w) this.start();
    const j = this.busy = this.jobs.shift();
    j.t0 = this.now();
    j.timer = setTimeout(() => { const w = this.w; this.w = null; w?.terminate(); this.fail('timed out'); }, this.timeoutMs);
    j.timer.unref?.();
    this.w.postMessage({ id: j.id, replay: j.replay, claim: j.claim, max: this.frames });
  }
  end(out) {
    const j = this.busy; if (!j) return;
    clearTimeout(j.timer); this.busy = null;
    j.done({ ...out, seconds: (this.now() - j.t0) / 1000 });
    this.next();
  }
  fail(why) { this.end({ verdict: 'error', why }); }
  close() { const w = this.w; this.w = null; this.jobs.splice(0).forEach(j => j.done({ verdict: 'error', why: 'server closed', seconds: 0 })); if (this.busy) this.fail('server closed'); return w?.terminate(); }
}

if (!isMainThread) worker();
module.exports = { Verifier, VERIFY };
