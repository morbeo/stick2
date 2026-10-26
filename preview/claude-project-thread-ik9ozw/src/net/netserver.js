'use strict';
// ---------- netplay through a dedicated server (server/, see docs/server.md): the lobby over a WebSocket relay instead of WebRTC ----------
// The server only passes messages between a room's host and its guests: the lobby and the match still run in the browsers, exactly
// as over a data channel (the lobby never touches the network itself). No codes to copy: the host opens a room and gets a short
// room code; guests join with it, or with a #server=…&room=… link or its QR code.
const NET_SERVER = 'stick2-server'; // the last server used (localStorage)
const NET_ROOM_RE = /^[A-Z0-9]{4,8}$/;

// what a person types → the WebSocket URL: "example.org", "example.org:8080", "https://example.org", "ws://localhost:8080/ws"
function netServerUrl(text, page = typeof location !== 'undefined' ? location : null) {
  let s = String(text || '').trim();
  if (!s) throw new Error('no server address');
  if (!/^[a-z]+:\/\//i.test(s)) {
    const local = /^(localhost|127\.|\[?::1\]?|192\.168\.|10\.)/.test(s) || page?.protocol === 'http:';
    s = (local ? 'ws://' : 'wss://') + s;
  }
  const u = new URL(s.replace(/^http/i, 'ws'));
  if (u.protocol !== 'ws:' && u.protocol !== 'wss:') throw new Error('not a server address');
  if (u.pathname === '/' || u.pathname === '') u.pathname = '/ws';
  u.hash = '';
  return u.toString();
}
// the server as people write it (no ws://, no /ws): for links and the name box
const netServerName = url => url.replace(/^wss:\/\//, '').replace(/^ws:\/\//, 'ws://').replace(/\/ws$/, '');
// a link that opens the app and joins: the server alone, a room on it, or a room to watch
function netServerLink(server, room = null, watch = false, base = location.href) {
  const p = new URLSearchParams({ server: netServerName(server) });
  if (room) p.set('room', room);
  if (watch) p.set('spectate', '1');
  return base.replace(/#.*$/, '') + '#' + p.toString();
}

// ---------- one WebSocket to a server. on: { open(hello), message(m), close(why) } ----------
class ServerLink {
  constructor(url, on = {}, WS = typeof WebSocket !== 'undefined' ? WebSocket : null) {
    Object.assign(this, { url, on, closed: false, sent: 0, got: 0, hello: null });
    const ws = this.ws = new WS(url);
    ws.onmessage = e => {
      this.got++;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'hello') { this.hello = m; this.on.open?.(m); } else this.on.message?.(m);
    };
    ws.onclose = e => this.close(e.reason || (this.hello ? 'lost the server' : 'could not reach the server'));
    ws.onerror = () => {};
  }
  get open() { return this.ws.readyState === 1; }
  send(m) { if (this.open) { this.ws.send(JSON.stringify(m)); this.sent++; } }
  close(why = 'closed') { if (this.closed) return; this.closed = true; try { this.ws.close(1000); } catch {} this.on.close?.(why); }
}

// ---------- the lobby (src/net/lobby.js) over a server ----------
// who we are to the server: the name we picked (the server may add a #tag) and this device's id (src/net/names.js), for bans
const netServerWho = (lobby, device) => ({ player: lobby.name, device });
// host: opens a room; room(code) once the server has given it one. Each guest the server announces is linked like a data channel.
// The link can kick(lobbyId, ban), lock(on) and report(lobbyId, reason, lines).
function netServerHost(lobby, url, { room = () => {}, isPublic = false, device = '', WS } = {}) {
  const ids = new Map(); // the server's guest id → the lobby's
  const link = new ServerLink(url, {
    open: () => link.send({ t: 'host', name: '', public: isPublic, ...netServerWho(lobby, device) }),
    message: m => {
      if (m.t === 'room') { link.room = m.room; link.player = m.player; if (m.player && lobby.state?.slots[0]) lobby.state.slots[0].name = lobby.name = m.player; room(m.room); }
      else if (m.t === 'peer') ids.set(m.id, lobby.link(x => link.send({ t: 'to', id: m.id, m: x })));
      else if (m.t === 'from' && ids.has(m.id)) lobby.receive(ids.get(m.id), m.m);
      else if (m.t === 'gone' && ids.has(m.id)) { lobby.unlink(ids.get(m.id), m.why === 'left' ? 'left' : m.why); ids.delete(m.id); }
      else if (m.t === 'error' || m.t === 'closed') lobby.close(m.error || m.why);
    },
    close: why => lobby.close(why),
  }, WS);
  const sid = lobbyId => [...ids].find(([, v]) => v === lobbyId)?.[0];
  link.kick = (lobbyId, ban = false) => { const id = sid(lobbyId); if (id) link.send({ t: 'kick', id, ban }); };
  link.lock = on => { link.locked = !!on; link.send({ t: 'lock', locked: !!on }); };
  link.report = (lobbyId, reason, lines = []) => link.send({ t: 'report', id: sid(lobbyId), reason, lines });
  return link;
}
// guest: joins a room; want 'play' (a free slot, else watch) or 'watch'
function netServerJoin(lobby, url, roomCode, want = 'play', { device = '', WS } = {}) {
  const link = new ServerLink(url, {
    open: () => link.send({ t: 'join', room: roomCode, ...netServerWho(lobby, device) }),
    message: m => {
      if (m.t === 'joined') { link.room = m.room; link.player = m.player; if (m.player) lobby.name = m.player; lobby.toHost = x => link.send({ t: 'msg', m: x }); lobby.join(want); }
      else if (m.t === 'msg') lobby.receive(null, m.m);
      else if (m.t === 'closed') lobby.close(m.why);
      else if (m.t === 'error') lobby.close(m.error);
    },
    close: why => lobby.close(why === 'closed' ? 'lost the server' : why),
  }, WS);
  // a guest can only report the host (or the room)
  link.report = (lobbyId, reason, lines = []) => link.send({ t: 'report', id: lobbyId === 'h' ? 'h' : null, reason, lines });
  return link;
}
// the public rooms of a server, over HTTP (GET /api/rooms) → { server, region, rooms: [{ room, name, host, phase, players, watchers, locked }] }
async function netServerRooms(url) {
  const u = new URL(url.replace(/^ws/, 'http')); u.pathname = '/api/rooms';
  const r = await fetch(u); if (!r.ok) throw new Error(`the server said ${r.status}`);
  return r.json();
}

