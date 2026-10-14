// the netplay match (src/netmatch.js): two sides over a simulated network (latency, loss) must play the very same fight
const test = require('node:test'), assert = require('node:assert/strict');
const engine = require('../tools/engine');
const { run } = engine([...engine.ENGINE, 'lobby', 'netmatch']);
const NetMatch = run('NetMatch'), Lobby = run('Lobby');
const plain = x => JSON.parse(JSON.stringify(x));
const header = (period = 0) => { const h = plain(run(`lobbyHeader({ scenario: 'you vs ai', over: {}, slots: [{ id: 'h', char: 'stick' }, { id: 'g1', char: 'sneeko' }] }, 77)`)); if (period) h.scen.period = period; return h; };

// each side presses something every few frames (different for each), so the fight really moves
const press = (side, t) => ({ left: side ? t % 50 < 30 : false, right: side ? false : t % 60 < 35, down: t % 45 > 40, hop: t % 97 === side * 7,
  punch: t % (11 + side * 4) === 0, kick: t % (17 + side * 2) === 0, special: t % 131 === side * 9, guard: t % 80 > 70 });

// a network between two matches: each message lands `lat` ticks later; loss: the share of input messages dropped (seeded)
function net({ lat = 1, loss = 0, delay = 2, frames = 300, period = 0, tamper = false } = {}) {
  const h = header(period), q = [];
  let t = 0, seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ms = [0, 1].map(side => new NetMatch({ header: h, side, delay, send: m => {
    if (m.t === 'in' && rnd() < loss) return;
    q.push({ at: t + lat, to: 1 - side, m: plain(m) });
  } }));
  // tamper: side 1 hears every key flipped for P1's frames 40-60
  if (tamper) { const r = ms[1].receive.bind(ms[1]); ms[1].receive = m => { if (m.t === 'in') m.b = m.b.map((b, i) => m.f + i >= 40 && m.f + i <= 60 ? b ^ 0xff : b); r(m); }; }
  for (; t < frames * 4 && ms.some(m => m.f < frames && !m.result); t++) {
    for (let i = q.length - 1; i >= 0; i--) if (q[i].at <= t) { ms[q[i].to].receive(q[i].m); q.splice(i, 1); }
    ms.forEach((m, side) => m.tick(press(side, t)));
  }
  return ms;
}
const agree = ([a, b]) => { const fs = Object.keys(a.sums).filter(f => f in b.sums); assert.ok(fs.length > 3, 'too few checks: ' + fs.length); for (const f of fs) assert.equal(a.sums[f], b.sums[f], 'frame ' + f); };

test('low latency: the two sides play the same fight, waiting only for the first input', () => {
  const ms = net({ lat: 1 });
  agree(ms);
  assert.ok(ms.every(m => m.desync === null));
  assert.ok(ms.every(m => m.stalls <= 2), 'stalls: ' + ms.map(m => m.stalls)); // only the first frame waits, for their first input
  assert.ok(ms[0].world.hits + ms[0].world.blocks > 0, 'nothing connected: the inputs don\'t reach the fight');
});

test('the two sides can use different delays and still agree', () => {
  const h = header(), q = [], ms = [2, 5].map((delay, side) => new NetMatch({ header: h, side, delay, send: m => q.push([1 - side, plain(m)]) }));
  for (let t = 0; t < 400; t++) { for (const [to, m] of q.splice(0)) ms[to].receive(m); ms.forEach((m, side) => m.tick(press(side, t))); }
  agree(ms);
  assert.equal(new NetMatch({ header: { ...h, netDelay: 4 }, side: 0 }).delay, 4, 'the header\'s delay');
});

test('latency above the input delay: the match waits, and still plays the same fight', () => {
  const ms = net({ lat: 6, delay: 2 });
  agree(ms);
  assert.ok(ms[0].stalls > 0);
  assert.ok(ms.every(m => m.desync === null));
});

test('lost input messages are covered by the next ones', () => {
  const ms = net({ lat: 2, loss: 0.3 });
  agree(ms);
  assert.ok(ms.every(m => m.desync === null && m.f >= 300));
});

test('a different input is caught as a desync at the next check', () => {
  const ms = net({ tamper: true });
  assert.ok(ms.some(m => m.desync !== null));
  assert.ok(ms.find(m => m.desync !== null).desync <= 90);
});

test('a press made while the match waits is kept for the next input', () => {
  const m = new NetMatch({ header: header(), side: 0, delay: 1 }), punch = 1 << m.keys.indexOf('punch');
  m.receive({ t: 'in', f: 0, b: [0] });
  m.tick({}); m.tick({}); // frame 0 runs; then it waits on theirs for frame 1
  m.tick({ punch: true }); // already a frame ahead: the press can't go yet
  assert.equal(m.next, 3); assert.equal(m.f, 1);
  m.receive({ t: 'in', f: 1, b: [0, 0] });
  m.tick({}); m.tick({}); // frames 1 and 2 run, then there's room: the punch goes with this input
  assert.ok(m.mine[3] & punch);
});

test('the match ends with a result, and saves as a replay that plays back the same', () => {
  const ms = net({ frames: 400, period: 3 }); // a 3 s round
  for (const m of ms) assert.ok(m.result, 'no result');
  assert.deepEqual(plain(ms[0].result), plain(ms[1].result));
  const r = plain(ms[0].replay());
  assert.deepEqual(r.frames, plain(ms[1].replay()).frames);
  const desync = run(`(() => { const r = ${JSON.stringify(r)}, w = replayWorld(r); w.loop = false; for (let i = 0; i <= r.frames.length; i++) w.advance(0, NOIN); return w.desync; })()`);
  assert.equal(desync, null);
});

test('over a lobby: the match event starts both sides, and their messages go through it', () => {
  const q = [], flush = () => { while (q.length) q.shift()(); };
  const ms = {}, mk = (lobby, side) => e => { if (e.type === 'phase' && e.phase === 'match') ms[side] = new NetMatch({ header: e.header, side, send: m => lobby.matchSend(m) }); };
  const host = new Lobby({ role: 'host', now: () => 0, hooks: { match: m => ms[0]?.receive(m) } });
  host.hooks.event = mk(host, 0);
  const g = new Lobby({ role: 'guest', now: () => 0, send: m => q.push(() => host.receive(g.id, plain(m))), hooks: { match: m => ms[1]?.receive(m) } });
  g.hooks.event = mk(g, 1);
  g.id = host.link(m => q.push(() => g.receive(null, plain(m)))); g.join(); flush();
  host.pick('stick'); g.pick('zippa'); host.ready(); g.ready(); flush();
  host.start(5); flush();
  assert.ok(ms[0] && ms[1], 'both sides made a match');
  for (let t = 0; t < 200; t++) { ms[0].tick(press(0, t)); ms[1].tick(press(1, t)); flush(); }
  agree([ms[0], ms[1]]);
  assert.ok(ms[0].f > 150);
});
