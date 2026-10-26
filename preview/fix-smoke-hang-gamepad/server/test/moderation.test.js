// the server's names, room moderation (kick, ban from a room, lock, reports) and the admin API with its bans
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const { start, config } = require('../server');
const { Bans } = require('../moderation');

const boot = (env = {}) => start(config({ PORT: '0', HOST: '127.0.0.1', LOG_LEVEL: 'quiet', DRAIN_TIMEOUT: '0', ...env }));
const get = (s, p, headers = {}) => fetch(`http://127.0.0.1:${s.port}${p}`, { headers });
const post = (s, p, body, token = 'adm') => fetch(`http://127.0.0.1:${s.port}${p}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
function client(s) {
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`), got = [], waiting = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); const w = waiting.findIndex(x => !x.t || x.t === m.t); if (w >= 0) waiting.splice(w, 1)[0].done(m); else got.push(m); };
  return {
    ws, send: m => ws.send(JSON.stringify(m)),
    next: t => { const i = got.findIndex(m => !t || m.t === t); if (i >= 0) return Promise.resolve(got.splice(i, 1)[0]); return new Promise(done => waiting.push({ t, done })); },
    closed: new Promise(done => { ws.onclose = e => done(e); }),
  };
}
const quiet = async (s, fn) => { try { await fn(); } finally { await s.stop(); } };
async function connect(s, n) { const cs = Array.from({ length: n }, () => client(s)); await Promise.all(cs.map(c => c.next('hello'))); return cs; }

test('names: the typed one if the filter takes it, else the device\'s generated one; a #tag on clashes; the room list shows the host', async () => {
  const s = await boot();
  await quiet(s, async () => {
    const [a, b, c] = await connect(s, 3);
    a.send({ t: 'host', public: true, player: 'gogili', device: 'd1' });
    const { room, player } = await a.next('room');
    assert.equal(player, 'gogili');
    b.send({ t: 'join', room, player: 'GOGILI', device: 'd2' });
    assert.equal((await b.next('joined')).player, 'GOGILI#2');
    assert.equal((await a.next('peer')).player, 'GOGILI#2');
    c.send({ t: 'join', room, player: 'adm1n', device: 'd3' });
    assert.match((await c.next('joined')).player, /^[a-z-]{3,}$/);
    const [r] = (await (await get(s, '/api/rooms')).json()).rooms;
    assert.deepEqual([r.name, r.host, r.locked], ["gogili's room", 'gogili', false]);
    for (const x of [a, b, c]) x.ws.close();
  });
});

test('the host kicks, bans from the room and locks it; anyone reports', async () => {
  const s = await boot();
  await quiet(s, async () => {
    const [h, g, g2] = await connect(s, 3);
    h.send({ t: 'host', device: 'hd' }); const { room } = await h.next('room');
    g.send({ t: 'join', room, device: 'gd' }); await g.next('joined'); const { id } = await h.next('peer');
    h.send({ t: 'kick', id });
    assert.equal((await g.next('closed')).why, 'kicked by the host');
    assert.equal((await h.next('gone')).id, id);
    g.send({ t: 'join', room }); await g.next('joined'); const p2 = await h.next('peer');
    h.send({ t: 'kick', id: p2.id, ban: true }); await g.next('closed');
    g.send({ t: 'join', room }); assert.match((await g.next('error')).error, /^kicked/);
    h.send({ t: 'lock', locked: true });
    g2.send({ t: 'join', room }); assert.match((await g2.next('error')).error, /^locked/);
    h.send({ t: 'lock', locked: false });
    g2.send({ t: 'join', room }); await g2.next('joined'); await h.next('peer');
    g2.send({ t: 'report', id: 'h', reason: 'rude', lines: ['12:00 x: hi'] });
    await g2.next('reported');
    assert.equal(s.relay.reports.length, 1);
    assert.deepEqual([s.relay.reports[0].reason, s.relay.reports[0].lines], ['rude', ['12:00 x: hi']]);
    const m = await (await get(s, '/metrics')).text();
    assert.match(m, /stick2_kicks_total\{by="host"\} 2/); assert.match(m, /stick2_reports_total 1/);
    for (const x of [h, g, g2]) x.ws.close();
  });
});

test('admin API: off without a token, 401 with a wrong one; rooms, kick, ban (kept on disk), unban, close', async () => {
  const off = await boot();
  await quiet(off, async () => assert.equal((await get(off, '/api/admin/rooms')).status, 404));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stick2-'));
  const s = await boot({ ADMIN_TOKEN: 'adm', DB_PATH: dir });
  await quiet(s, async () => {
    assert.equal((await get(s, '/api/admin/rooms', { authorization: 'Bearer no' })).status, 401);
    const [h, g] = await connect(s, 2);
    h.send({ t: 'host', player: 'hana', device: 'hd' }); const { room } = await h.next('room');
    g.send({ t: 'join', room, player: 'gus', device: 'gd' }); await g.next('joined');
    const { rooms } = await (await get(s, '/api/admin/rooms', { authorization: 'Bearer adm' })).json();
    assert.deepEqual(rooms[0].guests.map(x => x.player), ['gus']);
    assert.equal((await post(s, '/api/admin/ban', { player: 'gus', reason: 'spam', minutes: 5 })).status, 200);
    assert.match((await g.next('closed')).why, /^banned: spam/);
    await g.closed;
    const g2 = client(s); await g2.next('hello');
    g2.send({ t: 'join', room, player: 'other', device: 'gd' });
    assert.match((await g2.next('error')).error, /^banned/);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'bans.json'), 'utf8'));
    assert.equal(saved.bans[0].device, 'gd'); assert.match(saved.bans[0].ip, /^[0-9a-f]{16}$/); assert.doesNotMatch(JSON.stringify(saved), /127\.0\.0\.1/);
    assert.equal((await post(s, '/api/admin/unban', { id: saved.bans[0].id })).status, 200);
    g2.send({ t: 'join', room, player: 'other', device: 'gd' }); await g2.next('joined');
    assert.equal((await post(s, '/api/admin/close', { room })).status, 200);
    assert.equal((await h.next('closed')).why, 'closed by the server');
    assert.equal((await post(s, '/api/admin/kick', { player: 'nobody' })).status, 404);
    h.ws.close(); g2.ws.close();
  });
});

test('bans expire, and load back from their file', () => {
  let t = 1000;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stick2-')), 'bans.json');
  const a = new Bans({ file, now: () => t });
  a.add({ name: 'Gogili#3', minutes: 1 }); a.add({ device: 'd' });
  assert.ok(a.find({ name: 'gogili' })); assert.throws(() => a.add({}));
  const b = new Bans({ file, now: () => t });
  assert.equal(b.salt, a.salt); assert.equal(b.hash('1.2.3.4'), a.hash('1.2.3.4'));
  t += 61000;
  assert.equal(b.find({ name: 'gogili' }), null); assert.ok(b.find({ device: 'd' }));
});
