'use strict';
// ---------- netplay transport and signaling: a WebRTC data channel between two browsers, no server (see docs/netplay.md) ----------
// Layer 1, transport: NetPeer, one RTCPeerConnection with one ordered, reliable data channel carrying JSON messages.
// Layer 2, signaling: how the host's offer code reaches the guest and the guest's answer code comes back. Every signaler has
// the same four methods, so a server-backed one (room codes, a room list) drops in later without touching anything else:
//   host:  sig.offer(code)  publish our offer       sig.answer() → code   the guest's answer, once it arrives
//   guest: sig.getOffer() → code  the host's offer  sig.reply(code)       send our answer back
// A public STUN server only tells each side its own reachable address; no game data goes through it.
const NET_RTC = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
// the codes' prefixes (a new one if a format changes): s2b compact, s2a the whole description deflated; the longest wait for ICE candidates
const NET_CODE = 's2a', NET_CODE_SHORT = 's2b', NET_GATHER_MS = 5000;

// ---------- codes: a session description as text short enough for a link or a QR code ----------
// Short (s2b, ~150 characters): only what differs between two connections - offer or answer, the ICE username and password, the
// certificate's fingerprint, the candidates (type, address, port) - joined by ~, and the rest of the description rebuilt from the
// standard one-data-channel template on the other side. Anything that doesn't fit that template falls back to the whole
// description, deflated (s2a, ~600 characters). Either way the code is URL-safe as it is.
const netB64 = {
  enc: bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
};
const netPipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
const netIce = { safe: s => s.replace(/\+/g, '-').replace(/\//g, '_'), back: s => s.replace(/-/g, '+').replace(/_/g, '/') }; // (ICE uses + and /, never - or _)
const NET_CAND = { host: 'h', srflx: 's', prflx: 'p', relay: 'r' }, NET_SETUP = { offer: { actpass: 'o' }, answer: { active: 'a', passive: 'p' } };
const netHex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
// the description → its short code, or null if it isn't the plain one-data-channel kind the template rebuilds
function netShort(desc) {
  const L = desc.sdp.split(/\r?\n/), get = k => L.filter(l => l.startsWith(`a=${k}:`)).map(l => l.slice(k.length + 3).trim());
  const [ufrag] = get('ice-ufrag'), [pwd] = get('ice-pwd'), [fp] = get('fingerprint'), [mid] = get('mid'), [setup] = get('setup');
  const kind = NET_SETUP[desc.type]?.[setup];
  if (L.filter(l => l.startsWith('m=')).length !== 1 || !L.some(l => /^m=application \d+ UDP\/DTLS\/SCTP webrtc-datachannel/.test(l))) return null;
  if (!kind || !ufrag || !pwd || mid !== '0' || !/^sha-256 ([0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(fp || '')) return null;
  const cands = [];
  for (const c of get('candidate')) {
    const [, comp, proto, , addr, port, , type] = c.split(' '), t = NET_CAND[type];
    if (comp !== '1' || proto?.toLowerCase() !== 'udp' || !t || !/^\d+$/.test(port)) continue; // (TCP candidates: rarely of use, left out)
    const mdns = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/i.exec(addr);
    const a = mdns ? 'm' + netB64.enc(mdns.slice(1).join('').match(/../g).map(h => parseInt(h, 16)))
      : /^[\d.]+$/.test(addr) ? '4' + addr : /^[0-9a-f:]+$/i.test(addr) ? '6' + addr : null;
    if (a) cands.push(t + a, port);
  }
  if (!cands.length) return null;
  return [NET_CODE_SHORT + '.' + kind, netIce.safe(ufrag), netIce.safe(pwd), netB64.enc(fp.slice(8).split(':').map(h => parseInt(h, 16))), ...cands].join('~');
}
// a short code's fields → the description, from the template
function netLong(body) {
  const [kind, ufrag, pwd, fp, ...cs] = body.split('~'), bytes = fp && netB64.dec(fp);
  if (!/^[oap]$/.test(kind) || !ufrag || !pwd || bytes?.length !== 32 || !cs.length || cs.length % 2) throw new Error('short');
  const types = { h: 'host', s: 'srflx', p: 'prflx', r: 'relay' }, pref = { h: 126, p: 110, s: 100, r: 0 };
  const cands = [];
  for (let i = 0; i < cs.length; i += 2) {
    const t = cs[i][0], v = cs[i].slice(2), port = parseInt(cs[i + 1]);
    if (!types[t] || !(port > 0 && port < 65536)) throw new Error('short');
    const addr = cs[i][1] === 'm' ? netHex(netB64.dec(v)).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5') + '.local' : v;
    // the standard priority for its type, in the order they came
    cands.push(`a=candidate:${i / 2 + 1} 1 udp ${pref[t] * 2 ** 24 + (65535 - i / 2) * 256 + 255} ${addr} ${port} typ ${types[t]}${t === 'h' ? '' : ' raddr 0.0.0.0 rport 0'} generation 0`);
  }
  const sdp = ['v=0', `o=- ${Date.now()} 2 IN IP4 127.0.0.1`, 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0', ...cands, `a=ice-ufrag:${netIce.back(ufrag)}`, `a=ice-pwd:${netIce.back(pwd)}`,
    'a=ice-options:trickle', `a=fingerprint:sha-256 ${netHex(bytes).toUpperCase().match(/../g).join(':')}`,
    `a=setup:${{ o: 'actpass', a: 'active', p: 'passive' }[kind]}`, 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', ''].join('\r\n');
  return { type: kind === 'o' ? 'offer' : 'answer', sdp };
}
async function netEncode(desc) {
  const short = netShort(desc);
  if (short) return short;
  const z = await netPipe(new TextEncoder().encode(JSON.stringify({ type: desc.type, sdp: desc.sdp })), new CompressionStream('deflate-raw'));
  return NET_CODE + '.' + netB64.enc(z);
}
// takes a bare code, a #join= link or a chat message with either in it
async function netDecode(text) {
  const short = new RegExp(NET_CODE_SHORT + '\\.([oap]~[A-Za-z0-9_.~:-]+)').exec(String(text || ''));
  if (short) { try { return netLong(short[1].replace(/[.:~]+$/, '')); } catch { throw new Error('netplay code is damaged (copied only part of it?)'); } }
  const m = new RegExp(NET_CODE + '\\.([A-Za-z0-9_-]+)').exec(String(text || ''));
  if (!m) throw new Error('not a stick2 netplay code');
  try { return JSON.parse(new TextDecoder().decode(await netPipe(netB64.dec(m[1]), new DecompressionStream('deflate-raw')))); }
  catch { throw new Error('netplay code is damaged (copied only part of it?)'); }
}
// a link that opens the app straight into joining; and the code back out of a page's hash
const netInviteLink = (code, base = location.href) => base.replace(/#.*$/, '') + '#join=' + code;
const netJoinCode = hash => /(?:^|[#&])join=([^&]+)/.exec(hash || '')?.[1] || null;

// every ICE candidate has to be in the code (nobody trickles them by hand), so wait for gathering - but not forever
// (an unreachable STUN server can stall it; the candidates found by then still connect a LAN or an open NAT)
function netGathered(pc, ms = NET_GATHER_MS) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(done => {
    const t = setTimeout(finish, ms);
    function finish() { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', check); done(); }
    function check() { if (pc.iceGatheringState === 'complete') finish(); }
    pc.addEventListener('icegatheringstatechange', check);
  });
}

// ---------- layer 1: one connection, either side. on: { open(), close(why), message(m) } ----------
class NetPeer {
  constructor(on = {}, rtc = NET_RTC) {
    Object.assign(this, { on, ch: null, closed: false, sent: 0, got: 0, pc: new RTCPeerConnection(rtc) }); // sent / got: messages, for a status line
    this.pc.ondatachannel = e => this.wire(e.channel);
    this.pc.onconnectionstatechange = () => { if (this.pc.connectionState === 'failed') this.close('connection failed'); };
  }
  wire(ch) {
    this.ch = ch;
    ch.onopen = () => this.on.open?.();
    ch.onclose = () => this.close('closed');
    ch.onmessage = e => { this.got++; let m; try { m = JSON.parse(e.data); } catch { return; } this.on.message?.(m); };
    if (ch.readyState === 'open') queueMicrotask(() => this.on.open?.()); // the guest's end can arrive already open: no open event then
  }
  get open() { return this.ch?.readyState === 'open'; }
  send(m) { if (this.open) { this.ch.send(JSON.stringify(m)); this.sent++; } }
  close(why = 'closed') { if (this.closed) return; this.closed = true; try { this.ch?.close(); this.pc.close(); } catch {} this.on.close?.(why); }
  async local(desc) { await this.pc.setLocalDescription(desc); await netGathered(this.pc); return netEncode(this.pc.localDescription); }
  // host: make the channel and the offer code; then accept the guest's answer code
  async offer() { this.wire(this.pc.createDataChannel('stick2', { ordered: true })); return this.local(await this.pc.createOffer()); }
  async accept(code) { await this.pc.setRemoteDescription(await netDecode(code)); }
  // guest: the host's offer code in, our answer code out
  async answer(code) { await this.pc.setRemoteDescription(await netDecode(code)); return this.local(await this.pc.createAnswer()); }
}

// ---------- layer 2: signalers ----------
// by hand: the code travels however people like (chat, QR, a #join= link). show(code, kind) displays ours ('offer' | 'answer');
// paste(code) is the other side's arriving. A guest opened from a #join= link pastes it straight away.
class ManualSignal {
  constructor(show = () => {}) { Object.assign(this, { show, inbox: [], waiting: null }); }
  paste(code) { if (this.waiting) { this.waiting(code); this.waiting = null; } else this.inbox.push(code); }
  next() { return this.inbox.length ? Promise.resolve(this.inbox.shift()) : new Promise(r => { this.waiting = r; }); }
  offer(code) { this.show(code, 'offer'); }
  answer() { return this.next(); }
  getOffer() { return this.next(); }
  reply(code) { this.show(code, 'answer'); }
}

// one connection over a signaler: the peer comes back at once (so it can be cancelled), peer.ready settles once both codes have
// crossed (the channel opens a moment later: on.open). A host makes one per guest, each with its own offer.
function netHost(sig, on) {
  const p = new NetPeer(on);
  p.ready = (async () => { await sig.offer(await p.offer()); await p.accept(await sig.answer()); })();
  return p;
}
function netJoin(sig, on) {
  const p = new NetPeer(on);
  p.ready = (async () => { await sig.reply(await p.answer(await sig.getOffer())); })();
  return p;
}

// ---------- the lobby (src/lobby.js) over a connection ----------
// host: one invite = one guest's link (call again for each guest); guest: the link to the host. Both return the NetPeer.
function netInviteGuest(lobby, sig) {
  // linked on the channel's open, or on its first message if that comes first (it can: the guest says hello the moment its own
  // end opens, and a message dropped for arriving early would leave the guest waiting for a welcome forever)
  let id = null;
  const link = () => id ??= lobby.link(m => p.send(m));
  const p = netHost(sig, { open: link, message: m => lobby.receive(link(), m), close: why => id && lobby.unlink(id, why === 'closed' ? 'left' : why) });
  return p;
}
function netJoinLobby(lobby, sig, want = 'play') {
  const p = netJoin(sig, { open: () => lobby.join(want), message: m => lobby.receive(null, m), close: why => lobby.close(why === 'closed' ? 'lost the host' : why) });
  lobby.toHost = m => p.send(m);
  return p;
}
