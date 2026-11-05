// headless verify (server/verify.js): a finished match played again on the server, with a verdict, stats and flags (relay.js)
const test = require('node:test'), assert = require('node:assert/strict');
const engine = require('../../tools/lib/engine');
const { Verifier } = require('../verify');
const { Relay } = require('../relay');

// a real fight, recorded the way the app records one (makeReplay), plus what it came to
const { run } = engine();
const fight = run(`(() => { const w = new World(SCENARIOS['you vs ai'], {}, 5, null); w.loop = false; let n = 0;
  const press = i => ({ ...NOIN, right: i % 90 < 40, punch: i % 13 === 0, kick: i % 29 === 0 }); // P1 is the player: its keys are the recording
  while (!w.done && n < 5400) w.advance(1 / 60, press(n++));
  const ko = f => !!f.ko || f.hp <= 0, [a, b] = [w.a, w.b];
  return JSON.parse(JSON.stringify({ replay: makeReplay(w, 'you vs ai'), winner: ko(a) !== ko(b) ? (ko(a) ? 1 : 0) : a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1 })); })()`);
const copy = () => JSON.parse(JSON.stringify(fight.replay));

test('a fight as recorded is ok, with its stats; tampered inputs, a wrong winner, another engine and junk are each called out', async () => {
  const v = new Verifier();
  try {
    const ok = await v.verify(copy(), { winner: fight.winner });
    assert.equal(ok.verdict, 'ok', ok.why);
    assert.equal(ok.stats.winner, fight.winner);
    assert.equal(ok.stats.frames, fight.replay.frames.length);
    assert.equal(ok.stats.chars.length, 2);
    assert.ok(ok.seconds >= 0);
    const t = copy(); for (let i = 10; i < t.frames.length; i += 7) t.frames[i][1] ^= 0b111; // presses the recording never had
    const bad = await v.verify(t, { winner: fight.winner });
    assert.equal(bad.verdict, 'desync'); assert.match(bad.why, /frame \d+/);
    assert.equal((await v.verify(copy(), { winner: fight.winner === 0 ? 1 : 0 })).verdict, 'result');
    assert.equal((await v.verify(copy(), { forfeit: 'host', why: 'left' })).verdict, 'ok', 'a forfeit claims no winner');
    assert.equal((await v.verify({ ...copy(), version: 1 })).verdict, 'version');
    assert.equal((await v.verify({ format: 'nope' })).verdict, 'error');
  } finally { await v.close(); }
});

test('a full queue says so; a hung worker times out and the next one starts fresh', async () => {
  const v = new Verifier({ queue: 1, timeoutMs: 1 });
  try {
    const [a, b] = [v.verify(copy()), v.verify(copy())];
    assert.equal((await b).why, 'the verify queue is full');
    assert.equal((await a).why, 'timed out');
    v.timeoutMs = 20000;
    assert.equal((await v.verify(copy(), { winner: fight.winner })).verdict, 'ok');
  } finally { await v.close(); }
});

test('the relay verifies a hosted match: the host hears the verdict, a match that does not add up is flagged and audited', async () => {
  const verifier = new Verifier(), audit = [], seen = [], stats = [];
  const metrics = { rooms: { inc() {} }, verified: { inc: l => seen.push(l.verdict) }, verifySeconds: { observe() {} }, flags: { inc() {} }, match: st => stats.push(st) };
  const relay = new Relay({ verifier, metrics, audit: (a, d) => audit.push([a, d]) });
  const host = { sent: [], send(m) { this.sent.push(m); }, close() {} };
  try {
    relay.receive(host, { t: 'host', name: 'hana' });
    const room = host.sent.find(m => m.t === 'room').room;
    relay.rooms.get(room).saved = false;
    const t = copy(); for (let i = 10; i < t.frames.length; i += 7) t.frames[i][1] ^= 0b111;
    await relay.verify(t, { winner: fight.winner }, { room, player: 'hana', players: ['hana', 'gus'] });
    assert.deepEqual(seen, ['desync']);
    assert.equal(host.sent.at(-1).t, 'verified'); assert.equal(host.sent.at(-1).verdict, 'desync');
    assert.equal(relay.flags[0].host, 'hana'); assert.equal(audit.at(-1)[0], 'flagged');
    await relay.verify(copy(), { winner: fight.winner }, { room, player: 'hana', players: [] });
    assert.deepEqual(seen, ['desync', 'ok']); assert.equal(stats.length, 1, 'stats only from fights that play out as recorded');
    assert.equal(relay.flags.length, 1);
  } finally { await verifier.close(); }
});
