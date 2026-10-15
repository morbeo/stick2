// the netplay lobby (src/net/lobby.js) over fake links, and the invite codes (src/net/netplay.js); the WebRTC part is tools/dev/netplay-test.js
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const engine = require('../../tools/lib/engine');
const { run } = engine([...engine.ENGINE, 'lobby']);
const Lobby = run('Lobby'), VER = run('ENGINE_VERSION');
const plain = x => JSON.parse(JSON.stringify(x)); // out of the vm's realm, for deepEqual

// a host and guests joined by queued links (messages go through JSON and arrive on flush, as over a real channel); t: the shared clock
function room({ guests = 1, verify, header, want } = {}) {
  const q = [], clock = { t: 0 }, now = () => clock.t, events = [];
  const post = (to, from, m) => q.push(() => to.receive(from, JSON.parse(JSON.stringify(m))));
  const hooks = { verify, header, event: e => events.push(e) };
  const host = new Lobby({ role: 'host', name: 'hana', now, hooks });
  const gs = Array.from({ length: guests }, (_, i) => {
    const g = new Lobby({ role: 'guest', name: 'gus' + i, now, hooks: { verify }, send: m => post(host, g.linkId, m) });
    g.linkId = host.link(m => post(g, null, m));
    g.join(want?.[i]);
    return g;
  });
  const flush = () => { while (q.length) q.shift()(); };
  flush();
  return { host, gs, g: gs[0], flush, clock, events, drop: g => { g.toHost = null; } };
}
const ready = (r, chars = ['stick', 'sneeko']) => { r.host.pick(chars[0]); r.g.pick(chars[1]); r.host.ready(); r.g.ready(); r.flush(); };

test('a guest joins: gets the second slot, and its view is the host\'s snapshot', () => {
  const { host, g } = room();
  assert.equal(g.id, 'g1');
  assert.deepEqual(plain(host.state.slots.map(s => s.name)), ['hana', 'gus0']);
  assert.equal(g.state.rev, host.state.rev);
  assert.deepEqual(plain(g.state), plain(host.state));
});

test('two players with the same name get told apart', () => {
  const host = new Lobby({ role: 'host', name: 'player', now: () => 0 });
  for (const n of [1, 2]) host.receive(host.link(() => {}), { t: 'hello', proto: 1, engine: VER, name: 'player' });
  assert.deepEqual(plain([...host.state.slots, ...host.state.watch].map(s => s.name)), ['player', 'player 2', 'player 3']);
});

test('a hello from another engine or protocol version is turned away', () => {
  const host = new Lobby({ role: 'host', now: () => 0 }), got = [];
  const id = host.link(m => got.push(m));
  host.receive(id, { t: 'hello', proto: 1, engine: VER - 1, name: 'old' });
  assert.equal(got[0].t, 'reject'); assert.match(got[0].reason, /engine/);
  assert.equal(host.state.slots[1], null);
  const id2 = host.link(m => got.push(m));
  host.receive(id2, { t: 'hello', proto: 99, engine: VER, name: 'new' });
  assert.match(got[1].reason, /protocol/);
});

test('once both slots are taken, joiners watch; and anyone can ask to watch', () => {
  const { host } = room({ guests: 3, want: ['play', 'watch', 'play'] });
  assert.deepEqual(plain(host.state.slots.map(s => s.id)), ['h', 'g1']);
  assert.deepEqual(plain(host.state.watch.map(s => s.id)), ['g2', 'g3']);
});

test('ready needs a character; a new pick or a scenario change clears ready', () => {
  const r = room(), { host, g, flush } = r;
  g.ready(); flush();
  assert.equal(host.state.slots[1].ready, false, 'ready with no character');
  ready(r);
  assert.ok(host.canStart());
  g.pick('zippa'); flush();
  assert.equal(host.state.slots[1].ready, false);
  g.ready(); flush(); assert.ok(host.canStart());
  host.setScenario('you vs ai', { hitstop: 0 }); flush();
  assert.ok(host.state.slots.every(s => !s.ready));
  assert.ok(!g.state.slots.some(s => s.ready), 'the guest sees it too');
});

test('a guest can\'t act for others or out of phase', () => {
  const r = room({ guests: 2 }), { host, gs, flush } = r;
  assert.deepEqual(plain(host.state.watch.map(w => w.id)), ['g2']); // the host and g1 play, g2 watches
  const rev = host.state.rev;
  gs[1].pick('stick'); gs[1].ready(); flush(); // a watcher has no slot to pick for
  assert.equal(host.state.rev, rev);
  assert.ok(host.state.slots.every(s => s.char === null));
  host.receive('g9', { t: 'pick', char: 'stick' }); // an unknown link
  assert.equal(host.state.slots[0].char, null);
});

test('start: both build the same fight from the header, then the match goes; the header is a replay header', () => {
  const r = room(), { host, g, flush, events } = r;
  ready(r);
  assert.ok(host.start(42));
  assert.equal(host.phase, 'sync');
  flush();
  assert.equal(host.phase, 'match'); assert.equal(g.phase, 'match');
  assert.deepEqual(plain(g.header), plain(host.header));
  const h = host.header;
  assert.equal(h.format, 'stick2-replay'); assert.equal(h.version, VER); assert.equal(h.seed, 42);
  assert.equal(h.scen.a, 'human'); assert.equal(h.scen.b, 'human2');
  assert.deepEqual(plain(h.chars.map(c => c.name)), plain(run('[CHARS.stick.def.name, CHARS.sneeko.def.name]')));
  assert.ok(events.some(e => e.type === 'phase' && e.phase === 'match'));
  // and it plays as a replay once frames are added
  const w = run(`replayWorld(${JSON.stringify({ ...h, frames: [], sums: {}, end: null })})`);
  assert.equal(w.a.ch.def.name, h.chars[0].name);
});

test('a guest that builds a different fight sends the lobby back, ready cleared', () => {
  let n = 0;
  const r = room({ verify: () => 'same' });
  r.g.hooks.verify = () => 'other' + n++;
  ready(r);
  r.host.start(1); r.flush();
  assert.equal(r.host.phase, 'lobby'); assert.equal(r.g.phase, 'lobby');
  assert.match(r.host.state.error, /different fight/);
  assert.ok(!r.host.canStart());
});

test('a character the host doesn\'t have stops the start; a guest\'s own definition works', () => {
  const r = room();
  ready(r, ['stick', 'nobody']);
  assert.equal(r.host.start(1), false);
  assert.match(r.host.state.error, /nobody/);
  const def = run('JSON.parse(JSON.stringify({ ...CHARS.zippa.def, name: "my zippa" }))');
  r.g.pick('my zippa', def); r.g.ready(); r.flush();
  assert.ok(r.host.start(1)); r.flush();
  assert.equal(r.host.phase, 'match');
  assert.equal(r.host.header.chars[1].name, 'my zippa');
});

test('leaving: mid-match is a forfeit; the host leaving closes the guest', () => {
  const r = room();
  ready(r); r.host.start(3); r.flush();
  r.g.leave(); r.flush();
  assert.equal(r.host.phase, 'post');
  assert.equal(r.host.state.result.forfeit, 'g1');
  assert.equal(r.g.phase, 'closed');
  const r2 = room();
  r2.host.leave(); r2.flush();
  assert.equal(r2.g.phase, 'closed'); assert.match(r2.g.state.error, /host closed/);
});

test('after a match: rematch goes back to the lobby with ready cleared', () => {
  const r = room();
  ready(r); r.host.start(3); r.flush();
  r.host.finish({ winner: 'h' }); r.flush();
  assert.equal(r.g.phase, 'post'); assert.deepEqual(plain(r.g.state.result), { winner: 'h' });
  r.host.rematch(); r.flush();
  assert.equal(r.g.phase, 'lobby'); assert.ok(!r.host.canStart());
});

test('keepalive: pings measure round trips; a silent guest is dropped, a silent host closes the guest', () => {
  const r = room(), { host, g, flush, clock } = r;
  clock.t = 1000; host.tick();
  clock.t = 1040; flush();
  assert.equal(host.peers.get('g1').rtt, 40);
  r.drop(g); // the guest's messages stop arriving
  for (clock.t = 2000; clock.t <= 12000; clock.t += 1000) { host.tick(); flush(); }
  assert.equal(host.state.slots[1], null);
  const r2 = room();
  r2.clock.t = 10001; r2.g.tick();
  assert.equal(r2.g.phase, 'closed'); assert.match(r2.g.state.error, /lost the host/);
});

test('keepalive: after our own page stood still, nobody is dropped for the silence', () => {
  const r = room(), { host, g, clock } = r;
  clock.t = 1000; host.tick(); g.tick();
  clock.t = 20000; host.tick(); g.tick(); // 19 s with neither page running: the messages sent meanwhile would still be queued
  assert.ok(host.state.slots[1], 'the host dropped the guest');
  assert.notEqual(g.phase, 'closed', 'the guest gave up on the host');
  for (clock.t = 21000; clock.t <= 31000; clock.t += 1000) host.tick(); // but real silence after that, with the page running, still counts
  assert.equal(host.state.slots[1], null);
});

test('a hello that went unanswered goes again, and the host takes it once', () => {
  const host = new Lobby({ role: 'host', now: () => 0 }), clock = { t: 0 }, sent = [];
  const g = new Lobby({ role: 'guest', now: () => clock.t, send: m => sent.push(m) });
  g.join('watch'); clock.t = 1000; g.tick();
  assert.equal(sent.length, 1);
  clock.t = 2500; g.tick();
  assert.equal(sent.length, 2); assert.equal(sent[1].want, 'watch');
  const id = host.link(m => g.receive(null, m));
  for (const m of sent) host.receive(id, m);
  assert.equal(host.state.watch.length, 1, 'the second hello made a second spectator');
  clock.t = 6000; g.tick();
  assert.equal(sent.length, 2, 'welcomed, it still says hello');
});

test('chat goes through the host to everyone; names and text are trimmed', () => {
  const r = room({ guests: 2 });
  r.gs[1].chat('  hi\u0007 there  ' + 'x'.repeat(500)); r.flush();
  const c = r.events.filter(e => e.type === 'chat');
  assert.equal(c.length, 1); assert.equal(c[0].name, 'gus1'); assert.equal(c[0].text.length, 200); assert.ok(c[0].text.startsWith('hi there'));
});

// ---------- the codes ----------
const net = vm.createContext({ btoa, atob, Blob, Response, CompressionStream, DecompressionStream, TextEncoder, TextDecoder, Uint8Array, JSON, String, RegExp, Error });
vm.runInContext(fs.readFileSync(engine.srcFile('netplay'), 'utf8'), net);
const nrun = code => vm.runInContext(code, net);

test('an invite code round-trips, from a bare code, a link or a chat message, and is shorter than the description', async () => {
  const sdp = 'v=0\r\no=- 46117 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\n' + 'a=candidate:1 1 udp 2122260223 192.168.1.20 50000 typ host generation 0\r\n'.repeat(6);
  const code = await nrun(`netEncode({ type: 'offer', sdp: ${JSON.stringify(sdp)} })`);
  assert.match(code, /^s2a\.[A-Za-z0-9_-]+$/);
  assert.ok(code.length < sdp.length, `${code.length} vs ${sdp.length}`);
  const link = nrun(`netInviteLink(${JSON.stringify(code)}, 'https://morbeo.github.io/stick2/#embed=x')`);
  assert.equal(link, 'https://morbeo.github.io/stick2/#join=' + code);
  assert.equal(nrun(`netJoinCode(${JSON.stringify('#join=' + code)})`), code);
  for (const text of [code, link, `join me: ${code} thanks`]) assert.deepEqual(plain(await nrun(`netDecode(${JSON.stringify(text)})`)), { type: 'offer', sdp });
  await assert.rejects(nrun(`netDecode('hello')`), /not a stick2/);
  await assert.rejects(nrun(`netDecode(${JSON.stringify(code.slice(0, 20))})`), /damaged/);
});

test('the manual signaler hands codes over in either order', async () => {
  const got = await nrun(`(async () => { const shown = [], s = new ManualSignal((c, k) => shown.push(k + ':' + c));
    s.paste('early'); const a = await s.answer(); s.offer('o1'); const p = s.getOffer(); s.paste('late'); s.reply('r1');
    return [a, await p, ...shown]; })()`);
  assert.deepEqual([...got], ['early', 'late', 'offer:o1', 'answer:r1']);
});

// ---------- short codes: only what differs, the rest rebuilt ----------
const CHROME_OFFER = ['v=0', 'o=- 7010035589187511692 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=extmap-allow-mixed', 'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
  'a=candidate:3410262555 1 udp 2113937151 94b9809a-77af-41a1-8063-ee18880816cf.local 55930 typ host generation 0 network-cost 999',
  'a=candidate:842163049 1 udp 1677729535 203.0.113.7 61234 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-cost 999',
  'a=candidate:1 1 udp 2113939711 2001:db8::1:2 50001 typ host generation 0',
  'a=candidate:2 1 tcp 1518280447 192.168.1.5 9 typ host tcptype active generation 0',
  'a=candidate:3 1 udp 41885439 198.51.100.9 3478 typ relay raddr 203.0.113.7 rport 61234 generation 0',
  'a=ice-ufrag:xB+4', 'a=ice-pwd:b3MTNSUM9YJkEu/PToYYdZF9', 'a=ice-options:trickle',
  'a=fingerprint:sha-256 EB:57:8C:35:FF:DD:6D:20:CF:F9:68:AD:A5:6C:BA:5B:C5:58:30:02:EA:29:EC:04:89:07:E6:73:3E:A6:F9:13',
  'a=setup:actpass', 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', ''].join('\r\n');
// what a connection needs out of a description: the ICE credentials, the fingerprint, the role, and each UDP candidate
const essentials = sdp => { const L = sdp.split('\r\n'), a = k => L.filter(l => l.startsWith(`a=${k}:`)).map(l => l.slice(k.length + 3));
  return { ufrag: a('ice-ufrag'), pwd: a('ice-pwd'), fp: a('fingerprint'), setup: a('setup'), mid: a('mid'),
    cands: a('candidate').map(c => c.split(' ')).filter(p => p[2] === 'udp').map(p => [p[4], p[5], p[7]].join(' ')) }; };

test('a short code: about a quarter of the long one, URL-safe, and it rebuilds everything a connection needs', async () => {
  const code = await nrun(`netEncode({ type: 'offer', sdp: ${JSON.stringify(CHROME_OFFER)} })`);
  assert.match(code, /^s2b\.o~[A-Za-z0-9_.~:-]+$/);
  assert.ok(code.length < 200, code.length + ' characters: ' + code);
  assert.equal(encodeURIComponent(code).replace(/%3A/g, ':'), code, 'not URL-safe');
  const back = plain(await nrun(`netDecode(${JSON.stringify('join me: https://x/stick2/#join=' + code + '.')})`));
  assert.equal(back.type, 'offer');
  const want = essentials(CHROME_OFFER), got = essentials(back.sdp);
  want.cands = want.cands.filter(c => !c.includes(' 9 ')); // the TCP one is left out
  assert.deepEqual(got, want);
  assert.match(back.sdp, /^v=0\r\n[\s\S]*m=application 9 UDP\/DTLS\/SCTP webrtc-datachannel\r\n[\s\S]*a=sctp-port:5000\r\na=max-message-size:262144\r\n$/);
});

test('a short code keeps the answer\'s role (active or passive), and falls back to the long code for what the template can\'t rebuild', async () => {
  for (const setup of ['active', 'passive']) {
    const sdp = CHROME_OFFER.replace('a=setup:actpass', 'a=setup:' + setup);
    const code = await nrun(`netEncode({ type: 'answer', sdp: ${JSON.stringify(sdp)} })`);
    assert.match(code, /^s2b\.[ap]~/);
    const back = plain(await nrun(`netDecode(${JSON.stringify(code)})`));
    assert.equal(back.type, 'answer'); assert.deepEqual(essentials(back.sdp).setup, [setup]);
  }
  const odd = [CHROME_OFFER.replace('a=mid:0', 'a=mid:data'), CHROME_OFFER.replace('sha-256 EB', 'sha-384 EB'), CHROME_OFFER + 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',
    CHROME_OFFER.replace(/a=candidate:.*udp.*\r\n/g, '')];
  for (const sdp of odd) {
    const code = await nrun(`netEncode({ type: 'offer', sdp: ${JSON.stringify(sdp)} })`);
    assert.match(code, /^s2a\./);
    assert.equal(plain(await nrun(`netDecode(${JSON.stringify(code)})`)).sdp, sdp);
  }
  await assert.rejects(nrun(`netDecode('s2b.o~abc~def~short~hm~1')`), /damaged/);
});
