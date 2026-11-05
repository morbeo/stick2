// server bots (server/bots.js): a bot joins a host's room through the relay, picks, readies and fights its side to the end
const test = require('node:test'), assert = require('node:assert/strict');
const { Relay } = require('../relay');
const { Bots } = require('../bots');
const engine = require('../../tools/lib/engine');

// a host on its own engine, in the same process: its lobby over a fake relay connection, its match on idle inputs
function host(relay, run) {
  const h = { got: [], match: null };
  h.client = { ip: 'h', send: m => {
    h.got.push(m);
    if (m.t === 'peer') h.ids.set(m.id, h.lobby.link(x => relay.receive(h.client, { t: 'to', id: m.id, m: x })));
    else if (m.t === 'from') h.lobby.receive(h.ids.get(m.id), m.m);
  } };
  h.ids = new Map();
  h.lobby = run('o => new Lobby(o)')({ role: 'host', name: 'hosty', hooks: {
    event: e => { if (e.type === 'phase' && e.phase === 'match') h.match = run('o => new NetMatch(o)')({ header: e.header, side: 0, send: x => h.lobby.matchSend(x), hooks: { end: r => { h.result = r; h.lobby.finish(r); } } }); },
    match: x => h.match?.receive(x) } });
  relay.receive(h.client, { t: 'host', player: 'hosty', device: 'dev-h' });
  h.room = h.got.find(m => m.t === 'room').room;
  return h;
}

test('a bot joins, readies, plays a whole match in sync, and readies again', () => {
  let t = 0; const now = () => t;
  const relay = new Relay({ now }), bots = relay.bots = new Bots({ relay, now, auto: false, rng: () => 0 });
  const { run } = engine([...engine.ENGINE, 'lobby', 'netmatch']);
  const h = host(relay, run);
  relay.receive(h.client, { t: 'bot', level: 'hard', char: 'hadoo' });
  const name = h.got.find(m => m.t === 'bot')?.player;
  for (let i = 0; i < 3; i++) bots.tick(); // hello, pick, ready
  assert.match(name, /hadoo/);
  assert.deepEqual(bots.view().map(b => [b.room, b.level, b.char]), [[h.room, 'hard', 'hadoo']]);
  const slot = h.lobby.state.slots[1];
  assert.equal(slot.char, 'hadoo'); assert.equal(slot.ready, true);
  h.lobby.pick('hadoo'); h.lobby.ready(true);
  h.lobby.setScenario('you vs ai', { roundTime: 10 });
  bots.tick(); bots.tick(); // ready again after the scenario change
  assert.ok(h.lobby.state.slots[1].ready);
  h.lobby.ready(true);
  assert.ok(h.lobby.start(7)); bots.tick(); // synced
  assert.equal(h.lobby.phase, 'match'); assert.ok(h.match);
  const bot = [...bots.list.values()][0];
  for (let i = 0; i < 60 * 120 && !h.result; i++) { t += 1000 / 60; bots.tick(); h.match.tick({}); }
  assert.ok(h.result, 'the match ended');
  assert.equal(h.match.desync, null); assert.equal(bot.match?.desync ?? null, null);
  assert.equal(h.result.winner, 1, 'the bot beats a host who stands still');
  assert.ok(bot.match === null || bot.match.f > 0);
  h.lobby.rematch(); bots.tick();
  assert.equal(h.lobby.state.slots[1].ready, true, 'ready for the next one');
});

test('bots: off, a cap, bad levels and characters, leaving, not rated', () => {
  const relay = new Relay({});
  const { run } = engine([...engine.ENGINE, 'lobby', 'netmatch']);
  const h = host(relay, run);
  relay.receive(h.client, { t: 'bot' });
  assert.match(h.got.at(-1).error, /bots off/);
  const bots = relay.bots = new Bots({ relay, max: 1, auto: false });
  assert.throws(() => bots.add(h.room, { level: 'godlike' }), /level is one of/);
  assert.throws(() => bots.add(h.room, { char: 'nobody' }), /no character/);
  assert.throws(() => bots.add('NOROOM'), /no room/);
  const name = bots.add(h.room); bots.tick();
  assert.throws(() => bots.add(h.room), /at most 1/);
  assert.equal(relay.rooms.get(h.room).guests.size, 1);
  assert.ok(bots.remove(name)); assert.equal(bots.view().length, 0);
  assert.equal(relay.rooms.get(h.room).guests.size, 0);
  bots.add(h.room); relay.receive(h.client, { t: 'leave' }); // the room closes: the bot goes
  assert.equal(bots.view().length, 0);
  relay.receive({ ip: 'x', send: () => {} }, { t: 'bot' }); // only a host
});
