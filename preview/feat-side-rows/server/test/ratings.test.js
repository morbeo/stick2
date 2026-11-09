// Glicko-2 ratings (server/ratings.js) and quick match (relay.js): the paper's example, a match moving both sides, the leaderboard, the queue
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const { Ratings, glicko, RATING } = require('../ratings');
const { Relay } = require('../relay');

test('Glicko-2 gives the example in Glickman\'s paper', () => {
  const p = glicko({ r: 1500, rd: 200, vol: 0.06 }, [{ r: 1400, rd: 30, score: 1 }, { r: 1550, rd: 100, score: 0 }, { r: 1700, rd: 300, score: 0 }]);
  assert.equal(p.r.toFixed(2), '1464.05'); assert.equal(p.rd.toFixed(2), '151.52'); assert.equal(p.vol.toFixed(5), '0.06000');
  assert.ok(glicko({ r: 1500, rd: 50, vol: 0.06 }, []).rd > 50, 'a period away: less sure');
});

test('a match moves both sides, the same device never rates itself, players show by name, ranked once sure, kept in a file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratings-')), file = path.join(dir, 'ratings.json');
  let t = 0; const r = new Ratings({ file, now: () => t });
  try {
    assert.equal(r.record({ device: 'd1', name: 'amy' }, { device: 'd1', name: 'amy' }, 0), null);
    assert.equal(r.record({ device: 'd1', name: 'amy' }, { device: '', name: 'bob' }, 0), null);
    const [ca, cb] = r.record({ device: 'd1', name: 'amy' }, { device: 'd2', name: 'bob' }, 0);
    assert.ok(ca > 0 && cb < 0 && ca === -cb, 'even ratings: one gains what the other loses');
    assert.deepEqual([r.get('d1').games, r.get('d1').wins, r.get('d2').wins], [1, 1, 0]);
    r.record({ device: 'd1', name: 'amy' }, { device: 'd2', name: 'bob' }, null);
    assert.equal(r.get('d2').draws, 1);
    assert.deepEqual(r.board(), [], 'nobody is sure enough yet');
    for (let i = 0; i < 20; i++) r.record({ device: 'd1', name: 'amy' }, { device: 'd2', name: 'bobby' }, i % 4 ? 0 : 1);
    const b = r.board();
    assert.deepEqual(b.map(p => p.name), ['amy', 'bobby'], 'the name last played under');
    assert.ok(b[0].rating > b[1].rating && b[0].rd < RATING.ranked);
    assert.equal(r.byName('BOBBY').games, 22);
    t += 30 * RATING.dayMs; assert.ok(r.get('d1').rd > b[0].rd, 'away a month: deviation grows again');
    const again = new Ratings({ file, now: () => t });
    assert.equal(again.get('d1').games, 22, 'the file holds them');
    assert.ok(!fs.readFileSync(file, 'utf8').includes('"d1"'), 'devices only hashed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('quick match pairs close ratings at once, far ones as the window widens; the host side opens the room, the other is sent there', () => {
  let t = 0; const ratings = new Ratings({ now: () => t });
  for (let i = 0; i < 30; i++) ratings.record({ device: 'pro', name: 'pro' }, { device: 'x' + i, name: 'x' + i }, 0);
  const relay = new Relay({ ratings, now: () => t, rng: () => 0.5 });
  const mk = () => ({ sent: [], send(m) { this.sent.push(m); }, close() {}, last(tp) { return this.sent.filter(m => m.t === tp).at(-1); } });
  const a = mk(), b = mk(), p = mk();
  relay.receive(p, { t: 'quick', player: 'pro', device: 'pro' });
  relay.receive(a, { t: 'quick', player: 'amy', device: 'da' });
  assert.ok(p.last('queued').rating > 1700); assert.equal(a.last('queued').rating, 1500);
  assert.equal(relay.quick.length, 2, 'too far apart');
  relay.receive(b, { t: 'quick', player: 'bob', device: 'db' });
  assert.equal(relay.quick.length, 1, 'amy and bob pair at once');
  const m = a.last('matched');
  assert.deepEqual([m.role, m.vs, b.last('found').vs], ['host', 'bob', 'amy']);
  relay.receive(a, { t: 'host', quick: m.ticket });
  const room = a.last('room').room;
  assert.deepEqual(b.last('matched'), { t: 'matched', role: 'guest', room, vs: 'amy' });
  assert.equal(relay.rooms.get(room).public, false);
  // the pro waits: the window widens until someone fits
  const c = mk(); relay.receive(c, { t: 'quick', player: 'cal', device: 'dc' });
  assert.equal(relay.quick.length, 2);
  t += 120000; relay.sweep();
  assert.equal(relay.quick.length, 0); assert.ok(p.last('matched') || c.last('matched'));
  // a host that never opens its room: the other goes back in line
  const d = mk(), e = mk(); relay.receive(d, { t: 'quick', device: 'dd' }); relay.receive(e, { t: 'quick', device: 'de' });
  assert.equal(relay.quick.length, 0);
  t += 16000; relay.sweep(); assert.deepEqual(relay.quick.map(q => q.client), [e]);
  relay.receive(e, { t: 'unquick' }); assert.equal(relay.quick.length, 0); assert.equal(e.last('unqueued').t, 'unqueued');
  const f = mk(); relay.receive(f, { t: 'quick', device: 'df' }); relay.release(f); assert.equal(relay.quick.length, 0, 'a dropped connection leaves the queue');
  relay.receive(a, { t: 'quick' }); assert.match(a.last('error').error, /already in a room/);
});
