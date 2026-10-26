// the netplay transports end to end, with fakes for the browser's parts: two lobbies (src/net/lobby.js) over NetPeer + ManualSignal
// with a fake RTCPeerConnection (src/net/netplay.js), and over a fake relay server's WebSockets (src/net/netserver.js)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), vm = require('vm');
const engine = require('../../tools/lib/engine');
const plain = x => JSON.parse(JSON.stringify(x));
const flush = () => new Promise(r => setTimeout(r, 0));

// a fake WebRTC: a description's sdp names its connection, so setRemoteDescription finds the other end; channels deliver async
function fakeRtc() {
  const conns = new Map(); let n = 0;
  class Channel {
    constructor(label) { Object.assign(this, { label, readyState: 'connecting', other: null }); }
    send(d) { if (this.readyState !== 'open') throw new Error('not open'); const o = this.other; setTimeout(() => o.readyState === 'open' && o.onmessage?.({ data: d })); }
    close() { for (const c of [this, this.other]) if (c && c.readyState !== 'closed') { c.readyState = 'closed'; setTimeout(() => c.onclose?.()); } }
  }
  class RTCPeerConnection {
    constructor() { this.id = 'pc' + ++n; conns.set(this.id, this); this.iceGatheringState = 'new'; this.listeners = {}; this.connectionState = 'new'; }
    addEventListener(k, f) { (this.listeners[k] ||= []).push(f); }
    removeEventListener(k, f) { this.listeners[k] = (this.listeners[k] || []).filter(x => x !== f); }
    createDataChannel(label) { return this.ch = new Channel(label); }
    async createOffer() { return { type: 'offer', sdp: `v=0\r\no=- ${this.id}\r\n` }; }
    async createAnswer() { return { type: 'answer', sdp: `v=0\r\no=- ${this.id}\r\n` }; }
    async setLocalDescription(d) { this.localDescription = d; setTimeout(() => { this.iceGatheringState = 'complete'; for (const f of this.listeners.icegatheringstatechange || []) f(); }); }
    async setRemoteDescription(d) {
      const other = conns.get(/o=- (pc\d+)/.exec(d.sdp)[1]); this.remote = other;
      if (d.type === 'answer') { // the host's end: the channel opens on both sides, the guest's arrives through ondatachannel
        const mine = this.ch, theirs = new Channel(mine.label); mine.other = theirs; theirs.other = mine;
        setTimeout(() => { mine.readyState = theirs.readyState = 'open'; other.ondatachannel?.({ channel: theirs }); mine.onopen?.(); });
      }
    }
    close() { this.connectionState = 'closed'; }
  }
  return RTCPeerConnection;
}
// a fake relay server, speaking the protocol of server/ (host → room, join → joined, to/from/msg, gone)
function fakeServer() {
  const rooms = new Map(); let n = 0;
  class WS {
    constructor(url) { this.url = url; this.readyState = 0; setTimeout(() => { this.readyState = 1; this.deliver({ t: 'hello', server: 'fake' }); }); }
    deliver(m) { setTimeout(() => this.readyState === 1 && this.onmessage?.({ data: JSON.stringify(m) })); }
    send(d) {
      const m = JSON.parse(d);
      if (m.t === 'host') { this.room = 'R' + ++n + 'AB'; rooms.set(this.room, { host: this, guests: new Map() }); this.deliver({ t: 'room', room: this.room }); }
      else if (m.t === 'join') { const r = rooms.get(m.room); if (!r) return this.deliver({ t: 'error', error: 'no such room' });
        this.room = m.room; this.gid = 'u' + ++n; r.guests.set(this.gid, this); r.host.deliver({ t: 'peer', id: this.gid }); this.deliver({ t: 'joined', room: m.room }); }
      else if (m.t === 'to') rooms.get(this.room).guests.get(m.id)?.deliver({ t: 'msg', m: m.m });
      else if (m.t === 'msg') rooms.get(this.room).host.deliver({ t: 'from', id: this.gid, m: m.m });
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; const r = rooms.get(this.room);
      if (r && this.gid) { r.guests.delete(this.gid); r.host.deliver({ t: 'gone', id: this.gid, why: 'left' }); }
      if (r && r.host === this) for (const g of r.guests.values()) g.deliver({ t: 'closed', why: 'the host left' });
      setTimeout(() => this.onclose?.({ reason: '' })); }
  }
  return WS;
}
function context() {
  const ctx = vm.createContext({ console, Math, Object, Array, JSON, String, RegExp, Error, Map, Set, Promise, URL, URLSearchParams, setTimeout, clearTimeout, queueMicrotask,
    btoa, atob, Blob, Response, CompressionStream, DecompressionStream, TextEncoder, TextDecoder, Uint8Array, crypto, RTCPeerConnection: fakeRtc() });
  for (const f of engine.expand([...engine.ENGINE, 'lobby', 'netplay', 'netserver'])) vm.runInContext(fs.readFileSync(engine.srcFile(f), 'utf8'), ctx, { filename: engine.srcFile(f) });
  return code => vm.runInContext(code, ctx);
}
const settle = async (cond, max = 200) => { for (let i = 0; i < max && !cond(); i++) await flush(); return cond(); };

for (const pin of [null, 'K7M2Q9XA']) test(`two lobbies over a data channel, codes handed over by hand${pin ? ', sealed with a PIN' : ''}: join, chat, the guest leaves`, async () => {
  const run = context();
  run(`var shown = [], hostSig = new ManualSignal(c => shown.push(['offer', c]), ${JSON.stringify(pin)}), guestSig = new ManualSignal(c => shown.push(['answer', c]), ${JSON.stringify(pin)});
    var chats = [], host = new Lobby({ role: 'host', name: 'hana', now: () => 0, hooks: { event: e => e.type === 'chat' && chats.push(e.name + ': ' + e.text) } }), guest = new Lobby({ role: 'guest', name: 'gus', now: () => 0 });
    var hp = netInviteGuest(host, hostSig), gp = netJoinLobby(guest, guestSig);`);
  assert.ok(await settle(() => run('shown.length') === 1));
  run(`guestSig.paste(shown[0][1])`);
  assert.ok(await settle(() => run('shown.length') === 2));
  const codes = plain(run('shown.map(s => s[1])'));
  for (const c of codes) assert.match(c, pin ? /^s2c\./ : /^s2a\./);
  run(`hostSig.paste(shown[1][1])`);
  assert.ok(await settle(() => run('guest.phase') === 'lobby'), 'guest never reached the lobby: ' + run('guest.phase'));
  assert.deepEqual(plain(run('host.state.slots.map(s => s && s.name)')), ['hana', 'gus']);
  assert.deepEqual(plain(run('guest.state')), plain(run('host.state')));
  run(`guest.chat('hi there')`);
  assert.ok(await settle(() => run('chats.length') > 0));
  assert.deepEqual(plain(run('chats')), ['gus: hi there']);
  run('gp.close()');
  assert.ok(await settle(() => run('host.state.slots[1]') === null), 'the guest\'s slot was not freed');
  assert.ok(run('hp.closed && gp.closed && hp.sent > 0 && gp.got > 0'));
});

test('a code sealed with one PIN does not open with another', async () => {
  const run = context();
  run(`var shown = [], hostSig = new ManualSignal(c => shown.push(c), 'K7M2Q9XA'), guestSig = new ManualSignal(() => {}, 'WRONG234');
    var host = new Lobby({ role: 'host', name: 'hana', now: () => 0 }), guest = new Lobby({ role: 'guest', name: 'gus', now: () => 0 });
    netInviteGuest(host, hostSig); var gp = netJoinLobby(guest, guestSig), err = null; gp.ready.catch(e => { err = e.message; });`);
  assert.ok(await settle(() => run('shown.length') === 1));
  run('guestSig.paste(shown[0])');
  assert.ok(await settle(() => run('err') !== null));
  assert.equal(run('err'), 'wrong PIN, or the code is damaged');
});

test('ICE gathering: done at once when complete, else on the event, else at the timeout', async () => {
  const run = context();
  const r = await run(`(async () => { const t0 = Date.now(), ls = {}, pc = s => ({ iceGatheringState: s, addEventListener: (k, f) => { ls[k] = f; }, removeEventListener: k => { delete ls[k]; } });
    await netGathered(pc('complete'), 10000); const now = Date.now() - t0;
    const p = pc('gathering'), wait = netGathered(p, 10000); p.iceGatheringState = 'complete'; ls.icegatheringstatechange(); await wait; const ev = Date.now() - t0;
    await netGathered(pc('gathering'), 30); const late = Date.now() - t0;
    return [now < 50, ev < 50, late >= 25, Object.keys(ls).length]; })()`);
  assert.deepEqual(plain(r), [true, true, true, 0]);
});

test('server addresses: what people type becomes a ws(s) URL on /ws; links carry the server, room and watch flag', () => {
  const run = context();
  const urls = plain(run(`['example.org', 'example.org:8080', 'https://example.org', 'http://example.org/x', 'localhost:8080', '192.168.1.4', 'ws://h/ws', 'wss://h/custom']
    .map(s => netServerUrl(s, { protocol: 'https:' }))`));
  assert.deepEqual(urls, ['wss://example.org/ws', 'wss://example.org:8080/ws', 'wss://example.org/ws', 'ws://example.org/x', 'ws://localhost:8080/ws', 'ws://192.168.1.4/ws', 'ws://h/ws', 'wss://h/custom']);
  assert.equal(run(`netServerUrl('example.org', { protocol: 'http:' })`), 'ws://example.org/ws');
  assert.throws(() => run(`netServerUrl('  ')`), /no server address/);
  assert.throws(() => run(`netServerUrl('ftp://x')`), /not a server address/);
  assert.deepEqual(plain(run(`['wss://example.org/ws', 'ws://localhost:8080/ws', 'wss://h/custom'].map(netServerName)`)), ['example.org', 'ws://localhost:8080', 'h/custom']);
  assert.equal(run(`netServerLink('wss://example.org/ws', 'AB12', true, 'https://g.io/stick2/#old')`), 'https://g.io/stick2/#server=example.org&room=AB12&spectate=1');
  assert.equal(run(`netServerLink('wss://example.org/ws', null, false, 'https://g.io/')`), 'https://g.io/#server=example.org');
});

test('two lobbies through a relay server: the host gets a room code, the guest joins it, leaves, and a closed host closes the guest', async () => {
  const run = context();
  run(`var WS = (${fakeServer.toString()})(), code = null;
    var host = new Lobby({ role: 'host', name: 'hana', now: () => 0 }), g1 = new Lobby({ role: 'guest', name: 'gus', now: () => 0 }), g2 = new Lobby({ role: 'guest', name: 'ida', now: () => 0 });
    var hl = netServerHost(host, 'wss://fake/ws', { room: c => { code = c; }, WS });`);
  assert.ok(await settle(() => run('code') !== null));
  run(`var l1 = netServerJoin(g1, 'wss://fake/ws', code, 'play', { WS }), l2 = netServerJoin(g2, 'wss://fake/ws', code, 'watch', { WS });`);
  assert.ok(await settle(() => run('g1.phase') === 'lobby' && run('g2.phase') === 'lobby'));
  assert.deepEqual(plain(run('host.state.slots.map(s => s && s.name)')), ['hana', 'gus']);
  assert.deepEqual(plain(run('host.state.watch.map(w => w.name)')), ['ida']);
  run('l1.close()');
  assert.ok(await settle(() => run('host.state.slots[1]') === null));
  assert.equal(run('g1.phase'), 'closed');
  run('hl.close()');
  assert.ok(await settle(() => run('g2.phase') === 'closed'));
  assert.equal(run('g2.state.error'), 'the host left');
  run(`var g3 = new Lobby({ role: 'guest', name: 'x', now: () => 0 }); netServerJoin(g3, 'wss://fake/ws', 'NOPE', 'play', { WS });`);
  assert.ok(await settle(() => run('g3.phase') === 'closed'));
  assert.equal(run('g3.state.error'), 'no such room');
});
