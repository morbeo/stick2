// the error, disconnect and edge paths of the relay-server client (src/net/netserver.js): a scriptable WebSocket and a recording lobby
// stand in for the browser and src/net/lobby.js, so every server message, every way a link ends and every HTTP helper can be driven
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), vm = require('vm');
const engine = require('../../tools/lib/engine');
const plain = x => JSON.parse(JSON.stringify(x));
const flush = () => new Promise(r => setTimeout(r, 0));

function context() {
  const ctx = vm.createContext({ console, Math, Object, Array, JSON, String, RegExp, Error, Map, Set, Promise, URL, URLSearchParams, setTimeout, clearTimeout, queueMicrotask });
  const run = code => vm.runInContext(code, ctx);
  for (const f of engine.expand([...engine.ENGINE, 'lobby', 'netplay', 'netserver'])) vm.runInContext(fs.readFileSync(engine.srcFile(f), 'utf8'), ctx, { filename: engine.srcFile(f) });
  run(`
    // a WebSocket the test drives: say(m) is the server talking, drop(reason) the connection going; sent is what the client wrote
    var socks = [], WS = class { constructor(url) { this.url = url; this.sent = []; this.readyState = 0; this.closes = []; socks.push(this); }
      up() { this.readyState = 1; return this; } say(m) { this.onmessage?.({ data: typeof m === 'string' ? m : JSON.stringify(m) }); }
      hello(extra = {}) { this.up().say({ t: 'hello', server: 'fake', ...extra }); return this; }
      send(d) { this.sent.push(JSON.parse(d)); } close(code) { this.closes.push(code); this.readyState = 3; }
      drop(reason = '') { this.readyState = 3; this.onclose?.({ reason }); } },
    // a lobby that records what the server client does to it
    mkLobby = (over = {}) => { const L = { name: 'hana', log: [], state: { slots: [{ name: 'hana' }] }, watchers: 0, sends: [],
      link(send, setId) { const id = 'L' + (L.sends.length + 1); L.sends.push(send); L.log.push(['link', id]); return id; },
      receive(id, m) { L.log.push(['receive', id, m]); }, unlink(id, why) { L.log.push(['unlink', id, why]); }, close(why) { L.log.push(['close', why]); },
      join(want) { L.log.push(['join', want]); }, rejoin() { L.log.push(['rejoin']); }, promote(rules) { L.log.push(['promote', rules]); return L.canPromote; }, canPromote: true, ...over }; return L; },
    last = () => socks[socks.length - 1];`);
  return run;
}
const sock = run => plain(run('last().sent'));

test('a server link: bad JSON is ignored, a hello opens it, a signed nonce goes first and a failing signature still opens it', async () => {
  const run = context();
  run(`var opened = [], got = [], l = new ServerLink('ws://x/ws', { open: h => opened.push(h.server), message: m => got.push(m.t), close: w => got.push('close ' + w) }, WS);
    last().up().say('not json'); last().say({ t: 'chat' });`);
  assert.deepEqual(plain(run('[opened, got, l.got, l.open]')), [[], ['chat'], 2, true]);
  run(`last().say({ t: 'hello', server: 'fake' })`);
  assert.deepEqual(plain(run('opened')), ['fake']);
  // a signed nonce: the identity key answers first, then the link opens, and "authed" records who the servers know us as
  run(`ServerLink.auth = async nonce => ({ t: 'auth', sig: 'sig:' + nonce });
    var order = [], l2 = new ServerLink('ws://y/ws', { open: () => order.push('open') }, WS); var s2 = last(); s2.send = d => { s2.sent.push(JSON.parse(d)); order.push('send'); };
    s2.hello({ nonce: 'n1' }); s2.say({ t: 'authed', id: 'acct-7' });`);
  await flush(); await flush();
  assert.deepEqual(plain(run('order')), ['send', 'open']);
  assert.deepEqual(sock(run), [{ t: 'auth', sig: 'sig:n1' }]);
  assert.equal(run('l2.identity'), 'acct-7');
  assert.equal(run('ServerLink.identity'), 'acct-7');
  // a signature that fails, or one that gives nothing, must not stop the link from opening
  run(`ServerLink.auth = async () => { throw new Error('no key'); }; var o3 = [], l3 = new ServerLink('ws://z/ws', { open: () => o3.push(1) }, WS); last().hello({ nonce: 'n2' });`);
  await flush(); await flush();
  run(`ServerLink.auth = async () => null; var o4 = [], l4 = new ServerLink('ws://z/ws', { open: () => o4.push(1) }, WS); last().hello({ nonce: 'n3' });`);
  await flush(); await flush();
  assert.deepEqual(plain(run('[o3, o4, sock = null]')).slice(0, 2), [[1], [1]]);
  assert.deepEqual(sock(run), []);
  // a link closed while the signature was pending does not open afterwards
  run(`ServerLink.auth = () => new Promise(r => setTimeout(() => r({ t: 'auth' }), 5)); var o5 = [], l5 = new ServerLink('ws://z/ws', { open: () => o5.push(1) }, WS); last().hello({ nonce: 'n4' }); l5.close('gone');`);
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(plain(run('o5')), []);
  run('ServerLink.auth = null; ServerLink.identity = null;');
});

test('a server link ends three ways: it never connected, it was lost, or we closed it; sending after that is dropped', () => {
  const run = context();
  run(`var why = [], mk = () => new ServerLink('ws://x/ws', { close: w => why.push(w) }, WS);
    var a = mk(); last().drop('');                       // never said hello
    var b = mk(); last().hello(); last().drop('');       // said hello, then went
    var c = mk(); last().hello(); last().drop('bye');    // the server gave a reason
    var d = mk(); last().hello(); d.close(); d.close('again'); // closed by us, once
    var e = mk(); last().hello(); last().close = () => { throw new Error('already gone'); }; e.close('x'); // a socket that throws on close
    var f = mk(); last().up(); f.send({ t: 'open' }); var sentOpen = f.sent;   // an open socket sends
    var g = mk(); g.send({ t: 'early' }); var sentG = g.sent;                // one still connecting drops it`);
  assert.deepEqual(plain(run('why')), ['could not reach the server', 'lost the server', 'bye', 'closed', 'x']);
  assert.equal(run('d.ws.closes.length'), 1);
  assert.deepEqual(plain(run('d.ws.closes')), [1000]);
  assert.equal(run('sentOpen'), 1);
  assert.equal(run('sentG'), 0);
  assert.equal(run('d.closed && e.closed'), true);
});

test('the host link: every server message reaches the lobby, host tools send the right messages, errors close the lobby', () => {
  const run = context();
  run(`var L = mkLobby(), rooms = [], hl = netServerHost(L, 'ws://x/ws', { room: c => rooms.push(c), isPublic: true, device: 'dev1', quick: 'tk', WS });
    var s = last().hello({}); var verified = [], rated = [], bots = [];
    hl.verified = m => verified.push(m.ok); hl.rated = m => rated.push(m.r); hl.bot = m => bots.push(m.level);
    s.say({ t: 'room', room: 'AB12', player: 'hana#7', delay: 3.9, watchers: 2 }); var rules = [hl.room, hl.player, hl.delay];
    s.say({ t: 'peer', id: 's1' }); s.say({ t: 'peer', id: 's2' });
    s.say({ t: 'from', id: 's1', m: { t: 'chat' } }); s.say({ t: 'from', id: 'nobody', m: { t: 'chat' } });
    s.say({ t: 'gone', id: 's1', why: 'left' }); s.say({ t: 'gone', id: 's2', why: 'kicked' }); s.say({ t: 'gone', id: 'nobody', why: 'left' });
    s.say({ t: 'promoted', room: 'AB12', peers: [{ id: 's9' }] });
    s.say({ t: 'verified', ok: true }); s.say({ t: 'rated', r: 1500 }); s.say({ t: 'bot', level: 'hard' });
    s.say({ t: 'mystery' });`);
  assert.deepEqual(plain(run('rooms')), ['AB12']);
  assert.equal(run('L.name'), 'hana#7');
  assert.equal(run('L.state.slots[0].name'), 'hana#7');
  assert.equal(run('L.watchers'), 2);
  assert.deepEqual(plain(run('rules')), ['AB12', 'hana#7', 3]); // the room's rules, as the server gave them (the delay in whole frames)
  assert.deepEqual(plain(run('[verified, rated, bots]')), [[true], [1500], ['hard']]);
  const log = plain(run('L.log'));
  assert.deepEqual(log.filter(e => e[0] === 'link').length, 3);
  assert.deepEqual(log.filter(e => e[0] === 'receive'), [['receive', 'L1', { t: 'chat' }]]);
  assert.deepEqual(log.filter(e => e[0] === 'unlink'), [['unlink', 'L1', 'left'], ['unlink', 'L2', 'kicked']]);
  // the first thing sent is the host request with the name, device and quick ticket
  assert.deepEqual(plain(run('last().sent[0]')), { t: 'host', name: '', public: true, quick: 'tk', player: 'hana', device: 'dev1' });
  // the host tools
  run(`hl.kick('L3', true); hl.kick('nope'); hl.lock(true); hl.report('L3', 'spam', ['x']); hl.report('nope', 'r'); hl.saveReplay({ f: 1 }, { winner: 0 }, ['a']); hl.addBot(); hl.addBot('hard', 'grumbo');`);
  const sent = sock(run).slice(1);
  assert.deepEqual(sent, [{ t: 'kick', id: 's9', ban: true }, { t: 'lock', locked: true }, { t: 'report', id: 's9', reason: 'spam', lines: ['x'] }, { t: 'report', reason: 'r', lines: [] },
    { t: 'replay', replay: { f: 1 }, result: { winner: 0 }, players: ['a'] }, { t: 'bot', level: 'normal' }, { t: 'bot', level: 'hard', char: 'grumbo' }]);
  assert.equal(run('hl.locked'), true);
  assert.equal(run('hl.hosting'), true);
  // errors and a closed room close the lobby; a dropped connection does too
  run(`last().say({ t: 'error', error: 'room full' }); last().say({ t: 'closed', why: 'the host left' }); last().drop('');`);
  assert.deepEqual(plain(run('L.log.filter(e => e[0] === "close")')), [['close', 'room full'], ['close', 'the host left'], ['close', 'lost the server']]);
});

test('a room with no name from the server keeps the lobby\'s name; an unset hook is skipped', () => {
  const run = context();
  run(`var L = mkLobby({ state: null }), hl = netServerHost(L, 'ws://x/ws', { WS }); last().hello({});
    last().say({ t: 'room', room: 'Q1' }); last().say({ t: 'verified' }); last().say({ t: 'rated' }); last().say({ t: 'bot' });`);
  assert.equal(run('L.name'), 'hana');
  assert.equal(run('hl.room'), 'Q1');
  assert.equal(run('hl.delay'), 0);
});

test('the guest link: join, messages, a promotion to host, a new host, ratings, errors and a lost server', () => {
  const run = context();
  run(`var L = mkLobby(), rated = [], gl = netServerJoin(L, 'ws://x/ws', 'AB12', 'watch', { device: 'd2', WS }); gl.rated = m => rated.push(m.r);
    var s = last().hello({});
    s.say({ t: 'joined', room: 'AB12', player: 'gus#2' }); s.say({ t: 'msg', m: { t: 'state' } });
    s.say({ t: 'newhost' }); s.say({ t: 'rated', r: 1400 });`);
  assert.deepEqual(plain(run('last().sent[0]')), { t: 'join', room: 'AB12', player: 'hana', device: 'd2' });
  assert.equal(run('L.name'), 'gus#2');
  assert.deepEqual(plain(run('[gl.room, gl.player]')), ['AB12', 'gus#2']);
  assert.deepEqual(plain(run('L.log')), [['join', 'watch'], ['receive', null, { t: 'state' }], ['rejoin']]);
  assert.deepEqual(plain(run('rated')), [1400]);
  run(`L.toHost({ t: 'chat' });`);
  assert.deepEqual(sock(run).at(-1), { t: 'msg', m: { t: 'chat' } });
  // a guest can report only the host, or the room
  run(`gl.report('h', 'cheat', ['l']); gl.report('L9', 'other');`);
  assert.deepEqual(sock(run).slice(-2), [{ t: 'report', id: 'h', reason: 'cheat', lines: ['l'] }, { t: 'report', id: null, reason: 'other', lines: [] }]);
  // the host left and we can take over: this link hosts from now on, and takes the promotion message as its first
  run(`L.log.length = 0; last().say({ t: 'promoted', fresh: true, rules: { r: 1 }, peers: [{ id: 'p1' }] });`);
  assert.deepEqual(plain(run('L.log')), [['promote', { r: 1 }], ['link', 'L1']]);
  assert.equal(run('gl.hosting'), true);
  // ... or we cannot, and we leave (a promotion that is not fresh passes no rules)
  run(`var L2 = mkLobby({ canPromote: false }), g2 = netServerJoin(L2, 'ws://x/ws', 'AB12', 'play', { WS }); last().hello({}); last().say({ t: 'promoted' });`);
  assert.deepEqual(plain(run('L2.log')), [['promote', null]]);
  assert.deepEqual(sock(run).at(-1), { t: 'leave' });
  // errors, a closed room, and the connection going
  run(`var L3 = mkLobby(), g3 = netServerJoin(L3, 'ws://x/ws', 'AB12', 'play', { WS }); var s3 = last().hello({});
    s3.say({ t: 'error', error: 'no such room' }); s3.say({ t: 'closed', why: 'the host left' }); g3.close('closed'); `);
  assert.deepEqual(plain(run('L3.log')), [['close', 'no such room'], ['close', 'the host left'], ['close', 'lost the server']]);
  run(`var L4 = mkLobby(), g4 = netServerJoin(L4, 'ws://x/ws', 'AB12', 'play', { WS }); last().drop('');`);
  assert.deepEqual(plain(run('L4.log')), [['close', 'could not reach the server']]);
});

test('quick match: a server error closes the link with its message, and cancelling leaves the queue', async () => {
  const run = context();
  run(`var ev = [], q = netServerQuick('ws://x/ws', 'ann', { device: 'dv', WS, on: { close: w => ev.push('close ' + w) } });
    last().hello({}); last().say({ t: 'error', error: 'queue is full' });`);
  assert.deepEqual(plain(run('[q.state, q.why, ev]')), ['closed', 'queue is full', ['close queue is full']]);
  run(`var ev2 = [], q2 = netServerQuick('ws://x/ws', 'bo', { WS }); last().hello({}); last().say({ t: 'queued', rating: 1500, waiting: 1 }); q2.cancel();`);
  assert.deepEqual(plain(run('last().sent')), [{ t: 'quick', player: 'bo', device: '' }, { t: 'unquick' }]);
  assert.equal(run('q2.state'), 'closed');
  assert.equal(run('q2.why'), 'cancelled');
});

test('an account request: a reply resolves it, a server error rejects it without the prefix, and a dropped link rejects it', async () => {
  const run = context();
  run(`var p1 = netServerAccount('ws://x/ws', { do: 'whoami', device: 'd' }, { WS }); var s1 = last().hello({}); var l1 = socks.length - 1;`);
  assert.deepEqual(plain(run('last().sent')), [{ t: 'account', do: 'whoami', device: 'd' }]);
  run(`s1.say({ t: 'account', name: 'hana', devices: 1 });`);
  assert.deepEqual(plain(await run('p1')), { t: 'account', name: 'hana', devices: 1 });
  assert.deepEqual(plain(run('s1.closes')), [1000]);
  run(`var p2 = netServerAccount('ws://x/ws', { do: 'claim', code: 'bad' }, { WS }); last().hello({}); last().say({ t: 'error', error: 'account: that code is not valid' });`);
  await assert.rejects(run('p2'), /^Error: that code is not valid$/);
  run(`var p3 = netServerAccount('ws://x/ws', { do: 'whoami' }, { WS }); last().drop('');`);
  await assert.rejects(run('p3'), /could not reach the server/);
});

test('the HTTP helpers: each asks the right /api path on the server\'s http(s) address, and a failing answer throws what the server said', async () => {
  const run = context();
  run(`var asked = [], reply = { ok: true, status: 200, json: async () => ({ ok: 1 }) }, fetch = async u => { asked.push(String(u)); return reply; };`);
  const all = await run(`(async () => [await netServerBoard('wss://h.example/ws'), await netServerRooms('ws://h.example:8080/ws'), await netServerReplays('wss://h.example/ws'), await netServerReplay('wss://h.example/ws', 'a b/1')])()`);
  assert.deepEqual(plain(all), [{ ok: 1 }, { ok: 1 }, { ok: 1 }, { ok: 1 }]);
  assert.deepEqual(plain(run('asked')), ['https://h.example/api/leaderboard', 'http://h.example:8080/api/rooms', 'https://h.example/api/replays', 'https://h.example/api/replays/a%20b%2F1']);
  run(`reply = { ok: false, status: 503, json: async () => ({}) };`);
  for (const call of [`netServerBoard('wss://h/ws')`, `netServerRooms('wss://h/ws')`, `netServerReplays('wss://h/ws')`, `netServerReplay('wss://h/ws', 'x')`])
    await assert.rejects(run(call), /^Error: the server said 503$/);
});

test('the home server check: no page, no fetch, a file page, a bad answer, a non-list answer and a slow answer all give null', async () => {
  const run = context();
  const home = (page, get, ms = 50) => run(`netServerHome(${page}, ${get}, ${ms})`);
  assert.equal(await home('null', 'async () => ({})'), null);
  assert.equal(await home(`{ protocol: 'https:', host: 'g.io' }`, 'null'), null);
  assert.equal(await home(`{ protocol: 'file:', host: '' }`, 'async () => ({})'), null);
  assert.equal(await home(`{ protocol: 'https:', host: 'g.io' }`, 'async () => ({ ok: false })'), null);
  assert.equal(await home(`{ protocol: 'https:', host: 'g.io' }`, 'async () => ({ ok: true, json: async () => ({ rooms: 5 }) })'), null);
  assert.equal(await home(`{ protocol: 'https:', host: 'g.io' }`, 'async () => { throw new Error("net"); }'), null);
  assert.equal(await home(`{ protocol: 'https:', host: 'g.io' }`, '() => new Promise(() => {})', 10), null);
  assert.deepEqual(plain(await home(`{ protocol: 'http:', host: 'lan:8080' }`, `async u => ({ ok: true, json: async () => ({ server: 's', rooms: [] }), u })`)), { url: 'ws://lan:8080/ws', server: 's', rooms: [] });
});
