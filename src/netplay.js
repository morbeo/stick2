'use strict';
// ---------- netplay transport and signaling: a WebRTC data channel between two browsers, no server (see docs/netplay.md) ----------
// Layer 1, transport: NetPeer, one RTCPeerConnection with one ordered, reliable data channel carrying JSON messages.
// Layer 2, signaling: how the host's offer code reaches the guest and the guest's answer code comes back. Every signaler has
// the same four methods, so a server-backed one (room codes, a room list) drops in later without touching anything else:
//   host:  sig.offer(code)  publish our offer       sig.answer() → code   the guest's answer, once it arrives
//   guest: sig.getOffer() → code  the host's offer  sig.reply(code)       send our answer back
// A public STUN server only tells each side its own reachable address; no game data goes through it.
const NET_RTC = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const NET_CODE = 's2a', NET_GATHER_MS = 5000; // the code's prefix (bump it if the format changes); the longest wait for ICE candidates

// ---------- codes: a session description, deflated and base64url'd behind the prefix, short enough for a link or a QR code ----------
const netB64 = {
  enc: bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
};
const netPipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
async function netEncode(desc) {
  const z = await netPipe(new TextEncoder().encode(JSON.stringify({ type: desc.type, sdp: desc.sdp })), new CompressionStream('deflate-raw'));
  return NET_CODE + '.' + netB64.enc(z);
}
// takes a bare code, a #join= link or a chat message with either in it
async function netDecode(text) {
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
    Object.assign(this, { on, ch: null, closed: false, pc: new RTCPeerConnection(rtc) });
    this.pc.ondatachannel = e => this.wire(e.channel);
    this.pc.onconnectionstatechange = () => { if (this.pc.connectionState === 'failed') this.close('connection failed'); };
  }
  wire(ch) {
    this.ch = ch;
    ch.onopen = () => this.on.open?.();
    ch.onclose = () => this.close('closed');
    ch.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } this.on.message?.(m); };
  }
  get open() { return this.ch?.readyState === 'open'; }
  send(m) { if (this.open) this.ch.send(JSON.stringify(m)); }
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
  let id = null;
  const p = netHost(sig, { open: () => { id = lobby.link(m => p.send(m)); }, message: m => id && lobby.receive(id, m), close: why => id && lobby.unlink(id, why === 'closed' ? 'left' : why) });
  return p;
}
function netJoinLobby(lobby, sig, want = 'play') {
  const p = netJoin(sig, { open: () => lobby.join(want), message: m => lobby.receive(null, m), close: why => lobby.close(why === 'closed' ? 'lost the host' : why) });
  lobby.toHost = m => p.send(m);
  return p;
}
