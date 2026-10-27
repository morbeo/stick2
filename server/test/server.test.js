// the dedicated server (server/): HTTP routes, the relay's rooms, limits, the drain, and a real lobby + match through it
const test = require('node:test'), assert = require('node:assert/strict'), path = require('path');
const { start, config } = require('../server');
const engine = require('../../tools/lib/engine');

const boot = (env = {}) => start(config({ PORT: '0', HOST: '127.0.0.1', LOG_LEVEL: 'quiet', DRAIN_TIMEOUT: '1', ...env }));
const get = (s, p, headers = {}) => fetch(`http://127.0.0.1:${s.port}${p}`, { headers });
// a client: its messages queue up; next(t) waits for the next one (of type t)
function client(s) {
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`), got = [], waiting = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); const w = waiting.findIndex(x => !x.t || x.t === m.t); if (w >= 0) waiting.splice(w, 1)[0].done(m); else got.push(m); };
  const c = {
    ws, send: m => ws.send(JSON.stringify(m)),
    next: t => { const i = got.findIndex(m => !t || m.t === t); if (i >= 0) return Promise.resolve(got.splice(i, 1)[0]); return new Promise(done => waiting.push({ t, done })); },
    closed: new Promise(done => { ws.onclose = e => done(e); }),
  };
  return c;
}
const quiet = async (s, fn) => { try { await fn(); } finally { await s.stop(); } };

test('health, rooms, metrics and the game\'s static files; server files stay hidden', async () => {
  const s = await boot();
  await quiet(s, async () => {
    assert.equal(await (await get(s, '/healthz')).text(), 'ok\n');
    assert.deepEqual((await (await get(s, '/api/rooms')).json()).rooms, []);
    const m = await (await get(s, '/metrics')).text();
    assert.match(m, /# TYPE stick2_connections gauge/);
    assert.match(m, /stick2_build_info\{version="[^"]+",commit="[^"]+"\} 1/);
    const index = await get(s, '/');
    assert.equal(index.status, 200); assert.match(await index.text(), /src\/net\/netserver\.js/);
    for (const p of ['/server/server.js', '/package.json', '/.git/config', '/node_modules/x', '/../etc/passwd', '/%2e%2e/etc/passwd']) assert.equal((await get(s, p)).status, 404, p);
  });
});

test('a metrics token keeps /metrics private', async () => {
  const s = await boot({ METRICS_TOKEN: 'sekrit' });
  await quiet(s, async () => {
    assert.equal((await get(s, '/metrics')).status, 401);
    assert.equal((await get(s, '/metrics', { authorization: 'Bearer sekrit' })).status, 200);
  });
});

test('a host opens a room, a guest joins it, messages pass both ways, leaving tells the other side', async () => {
  const s = await boot();
  await quiet(s, async () => {
    const h = client(s), g = client(s);
    assert.equal((await h.next('hello')).t, 'hello'); await g.next('hello');
    h.send({ t: 'host', name: 'arena', public: true });
    const { room } = await h.next('room');
    assert.match(room, /^[A-Z2-9]{6}$/);
    assert.deepEqual((await (await get(s, '/api/rooms')).json()).rooms.map(r => r.room), [room]);
    g.send({ t: 'join', room: room.toLowerCase() });
    assert.equal((await g.next('joined')).room, room);
    const { id } = await h.next('peer');
    g.send({ t: 'msg', m: { t: 'hello', name: 'gus' } });
    assert.deepEqual(await h.next('from'), { t: 'from', id, m: { t: 'hello', name: 'gus' } });
    h.send({ t: 'to', id, m: { t: 'welcome', id: 'g1' } });
    assert.deepEqual(await g.next('msg'), { t: 'msg', m: { t: 'welcome', id: 'g1' } });
    g.ws.close();
    assert.equal((await h.next('gone')).id, id);
    const g2 = client(s); await g2.next('hello');
    g2.send({ t: 'join', room }); await g2.next('joined'); await h.next('peer');
    h.ws.close();
    assert.equal((await g2.next('closed')).t, 'closed');
    g2.send({ t: 'join', room });
    assert.match((await g2.next('error')).error, /^no room/);
    g2.ws.close();
  });
});

test('limits: unknown messages, rooms on a full server, connections per address', async () => {
  const s = await boot({ MAX_ROOMS: '1', MAX_PER_IP: '3' });
  await quiet(s, async () => {
    const a = client(s), b = client(s), c = client(s);
    await Promise.all([a.next('hello'), b.next('hello'), c.next('hello')]);
    a.send({ t: 'nope' }); assert.equal((await a.next('error')).error, 'unknown message');
    a.ws.send('not json'); assert.equal((await a.next('error')).error, 'bad message');
    a.send({ t: 'host' }); await a.next('room');
    b.send({ t: 'host' }); assert.match((await b.next('error')).error, /^full/);
    const d = client(s);
    assert.equal((await d.closed).code, 1013);
    assert.match(await (await get(s, '/metrics')).text(), /stick2_connections_rejected_total\{reason="per_ip"\} 1/);
    for (const x of [a, b, c]) x.ws.close();
  });
});

test('draining: health turns 503 and new rooms are refused', async () => {
  const s = await boot({ DRAIN_TIMEOUT: '0' });
  const a = client(s); await a.next('hello');
  const stopped = s.stop();
  assert.equal((await get(s, '/healthz').catch(() => ({ status: 503 }))).status, 503);
  a.send({ t: 'host' });
  assert.match((await a.next('error')).error, /^draining/);
  await stopped;
});

test('a real lobby and match through the server: both sides fight the same fight to the same end', async () => {
  const { ctx, run } = engine([...engine.ENGINE, 'lobby', 'netmatch', 'netserver']);
  ctx.URL = URL; // (the vm has no URL of its own)
  const s = await boot();
  await quiet(s, async () => {
    const url = run('netServerUrl')(`127.0.0.1:${s.port}`);
    assert.equal(url, `ws://127.0.0.1:${s.port}/ws`);
    const Lobby = run('Lobby'), NetMatch = run('NetMatch');
    const ev = { host: [], guest: [] };
    const mk = (role, name) => new Lobby({ role, name, hooks: { event: e => ev[role].push(e), match: m => matches[role]?.receive(m) } });
    const matches = {}, host = mk('host', 'hana'), guest = mk('guest', 'gus');
    let room; const opened = new Promise(done => run('netServerHost')(host, url, { room: r => { room = r; done(); }, WS: WebSocket }));
    await opened;
    const joined = new Promise(done => { const t = setInterval(() => { if (guest.id) { clearInterval(t); done(); } }, 10); });
    run('netServerJoin')(guest, url, room, 'play', { WS: WebSocket });
    await joined;
    host.pick('stick'); guest.pick('sneeko');
    await new Promise(r => setTimeout(r, 100));
    host.ready(); guest.ready();
    await new Promise(r => setTimeout(r, 100));
    host.start();
    const until = (fn, ms = 5000) => new Promise((done, fail) => { const t0 = Date.now(), t = setInterval(() => { if (fn()) { clearInterval(t); done(); } else if (Date.now() - t0 > ms) { clearInterval(t); fail(new Error('timed out')); } }, 5); });
    await until(() => host.phase === 'match' && guest.phase === 'match');
    const header = ev.host.find(e => e.phase === 'match').header;
    matches.host = new NetMatch({ header, side: 0, send: m => host.matchSend(m) });
    matches.guest = new NetMatch({ header: ev.guest.find(e => e.phase === 'match').header, side: 1, send: m => guest.matchSend(m) });
    const NO = {};
    await until(() => { for (const m of Object.values(matches)) m.tick(NO); return matches.host.f >= 120 && matches.guest.f >= 120; }, 15000);
    assert.equal(matches.host.desync, null); assert.equal(matches.guest.desync, null);
    assert.ok(Object.keys(matches.host.sums).length > 0);
    for (const f of Object.keys(matches.guest.sums)) if (matches.host.sums[f] !== undefined) assert.equal(matches.guest.sums[f], matches.host.sums[f]);
    assert.match(await (await get(s, '/metrics')).text(), /stick2_matches_total 1/);
  });
});

test('short embed links: POST /api/embeds stores a hash, /e/<id> is a link card that goes on to the game', async () => {
  const s = await boot();
  await quiet(s, async () => {
    const post = body => fetch(`http://127.0.0.1:${s.port}/api/embeds`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const r = await post({ hash: 'preset=arcade&p1=bonko' });
    assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), '*');
    const { id } = await r.json();
    assert.equal((await (await post({ hash: 'preset=arcade&p1=bonko' })).json()).id, id); // the same hash, the same id
    const go = await fetch(`http://127.0.0.1:${s.port}/e/${id}`, { redirect: 'manual' });
    const card = await go.text();
    assert.equal(go.status, 200); assert.match(card, /og:title" content="stick2: arcade"/);
    assert.match(card, /location\.replace\("\/index\.html#preset=arcade&p1=bonko"\)/);
    const evil = (await (await post({ hash: 'scenario=%3Cb%3E&ui=hud' })).json()).id; // names are escaped in the card
    assert.doesNotMatch(await (await get(s, '/e/' + evil)).text(), /<b>/);
    assert.equal((await get(s, '/e/nothere')).status, 404);
    assert.equal((await post({ hash: 'a b' })).status, 400);
    assert.equal((await post({ hash: 'x'.repeat(70000) })).status, 413);
    assert.equal((await fetch(`http://127.0.0.1:${s.port}/api/embeds`, { method: 'OPTIONS' })).status, 204);
  });
});

test('replays: the host saves its finished match once, /api/replays lists it and serves the file; the room tells the spectator rules', async () => {
  const s = await boot({ SPECTATE_DELAY: '120', MAX_SPECTATORS: '3' });
  await quiet(s, async () => {
    const h = client(s), g = client(s);
    await h.next('hello'); await g.next('hello');
    h.send({ t: 'host', player: 'hana' });
    const room = await h.next('room');
    assert.deepEqual([room.delay, room.watchers], [120, 3]);
    g.send({ t: 'replay', replay: {} });
    assert.match((await g.next('error')).error, /^not hosting/);
    const replay = { format: 'stick2-replay', fv: 1, scenario: 'you vs ai', chars: [], frames: Array(90).fill([1 / 60, 0]) };
    h.send({ t: 'replay', replay: { nope: 1 } });
    assert.match((await h.next('error')).error, /^bad replay/);
    h.send({ t: 'replay', replay, result: { winner: 1 }, players: ['hana', 'gus\n'] });
    const { id } = await h.next('saved');
    h.send({ t: 'replay', replay });
    assert.match((await h.next('error')).error, /^already saved/);
    const list = (await (await get(s, '/api/replays')).json()).replays;
    assert.equal(list.length, 1);
    assert.deepEqual([list[0].id, list[0].room, list[0].players, list[0].frames, list[0].winner], [id, room.room, ['hana', 'gus'], 90, 1]);
    assert.deepEqual(await (await get(s, `/api/replays/${id}`)).json(), JSON.parse(JSON.stringify(replay)));
    assert.equal((await get(s, '/api/replays/nope')).status, 404);
    const m = await (await get(s, '/metrics')).text();
    assert.match(m, /stick2_replays_saved_total 1/);
    assert.match(m, /stick2_replay_storage_bytes [1-9]/);
  });
});

test('replays off: MAX_REPLAYS=0 refuses them', async () => {
  const s = await boot({ MAX_REPLAYS: '0' });
  await quiet(s, async () => {
    const h = client(s); await h.next('hello');
    h.send({ t: 'host' }); await h.next('room');
    h.send({ t: 'replay', replay: { format: 'stick2-replay', chars: [], frames: [] } });
    assert.match((await h.next('error')).error, /^off/);
  });
});
