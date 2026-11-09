'use strict';
// ---------- netplay through a dedicated server (server/, see docs/server.md): the lobby over a WebSocket relay instead of WebRTC ----------
// The server only passes messages between a room's host and its guests: the lobby and the match still run in the browsers, exactly
// as over a data channel (the lobby never touches the network itself). No codes to copy: the host opens a room and gets a short
// room code; guests join with it, or with a #server=…&room=… link or its QR code.
const NET_SERVER = 'stick2-server'; // the last server used (localStorage)
const NET_ROOM_RE = /^[A-Z0-9]{4,8}$/;
const NET_PORT = 8080; // the server's default port: a local address typed without one gets it
const NET_LAN = /^(localhost|127\.|\[?::1\]?|192\.168\.|10\.)/;

// what a person types → the WebSocket URL: "example.org", "example.org:8080", "https://example.org", "ws://localhost:8080/ws"
function netServerUrl(text, page = typeof location !== 'undefined' ? location : null) {
  let s = String(text || '').trim();
  if (!s) throw new Error('no server address');
  const typed = s;
  if (!/^[a-z]+:\/\//i.test(s)) {
    const local = NET_LAN.test(s) || page?.protocol === 'http:';
    s = (local ? 'ws://' : 'wss://') + s;
  }
  const u = new URL(s.replace(/^http/i, 'ws'));
  if (u.protocol !== 'ws:' && u.protocol !== 'wss:') throw new Error('not a server address');
  if (!u.port && NET_LAN.test(u.hostname) && !/^(\w+:\/\/)?(\[[^\]]*\]|[^/:]+)(:\d+|\/\w)/.test(typed)) u.port = NET_PORT; // a local server: its port, unless one (or a full /ws address) was typed
  if (u.pathname === '/' || u.pathname === '') u.pathname = '/ws';
  u.hash = '';
  return u.toString();
}
// the server as people write it (no ws://, no /ws): for links and the name box
const netServerName = url => url.replace(/^wss:\/\//, '').replace(/^ws:\/\//, 'ws://').replace(/\/ws$/, '');
// a link that opens the app and joins: the server alone, a room on it, or a room to watch
function netServerLink(server, room = null, watch = false, base = location.href, link = null) {
  const p = new URLSearchParams({ server: netServerName(server) });
  if (room) p.set('room', room);
  if (link) p.set('link', link); // a device link code (accounts): opening it links this device
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
      if (m.t === 'hello') {
        this.hello = m;
        // an identity key (src/net/identity.js) signs the server's nonce first, so everything after comes from that key
        if (m.nonce && ServerLink.auth) ServerLink.auth(m.nonce).then(a => { if (a) this.send(a); }, () => {}).finally(() => { if (!this.closed) this.on.open?.(m); });
        else this.on.open?.(m);
      } else if (m.t === 'authed') this.identity = ServerLink.identity = m.id; // (the id servers know this key by)
      else this.on.message?.(m);
    };
    ws.onclose = e => this.close(e.reason || (this.hello ? 'lost the server' : 'could not reach the server'));
    ws.onerror = () => {};
  }
  get open() { return this.ws.readyState === 1; }
  send(m) { if (this.open) { this.ws.send(JSON.stringify(m)); this.sent++; } }
  close(why = 'closed') { if (this.closed) return; this.closed = true; try { this.ws.close(1000); } catch {} this.on.close?.(why); }
}

// nonce → the auth message (or null): the app sets it to sign with its identity key (netui.js); none, no auth
ServerLink.auth = null;
ServerLink.identity = null;

// ---------- the lobby (src/net/lobby.js) over a server ----------
// who we are to the server: the name we picked (the server may add a #tag) and this device's id (src/net/names.js), for bans
const netServerWho = (lobby, device) => ({ player: lobby.name, device });
// host: opens a room; room(code) once the server has given it one. Each guest the server announces is linked like a data channel.
// The link can kick(lobbyId, ban), lock(on) and report(lobbyId, reason, lines).
function netServerHost(lobby, url, { room = () => {}, isPublic = false, device = '', quick = null, WS } = {}) {
  const link = new ServerLink(url, {
    open: () => link.send({ t: 'host', name: '', public: isPublic, ...quick ? { quick } : {}, ...netServerWho(lobby, device) }),
    close: why => lobby.close(why),
  }, WS);
  netServerHosting(lobby, link, room);
  return link;
}
// a link that hosts: the server's messages to the lobby, and the host's tools (kick, lock, report, saveReplay). A guest's link
// turns into one when the server hands it the room (promoted)
function netServerHosting(lobby, link, room = () => {}) {
  const ids = new Map(); // the server's guest id → the lobby's
  const add = sid => { const ref = { id: null }; ref.id = lobby.link(x => link.send({ t: 'to', id: sid, m: x }), to => { ref.id = to; }); ids.set(sid, ref); };
  // the server's spectator rules: how far behind they watch (frames) and how many may
  const rules = m => { link.room = m.room; link.player = m.player; link.delay = m.delay | 0; if (m.watchers >= 0) lobby.watchers = m.watchers; };
  link.on.message = m => {
    if (m.t === 'room') { rules(m); if (m.player && lobby.state?.slots[0]) lobby.state.slots[0].name = lobby.name = m.player; room(m.room); }
    else if (m.t === 'promoted') { rules(m); for (const p of m.peers || []) add(p.id); }
    else if (m.t === 'peer') add(m.id);
    else if (m.t === 'from' && ids.has(m.id)) lobby.receive(ids.get(m.id).id, m.m);
    else if (m.t === 'gone' && ids.has(m.id)) { lobby.unlink(ids.get(m.id).id, m.why === 'left' ? 'left' : m.why); ids.delete(m.id); }
    else if (m.t === 'verified') link.verified?.(m); // the server played the finished match again (server/verify.js)
    else if (m.t === 'rated') link.rated?.(m); // and moved both players' ratings (server/ratings.js)
    else if (m.t === 'bot') link.bot?.(m); // a bot came in, or was refused (server/bots.js)
    else if (m.t === 'error' || m.t === 'closed') lobby.close(m.error || m.why);
  };
  const sid = lobbyId => [...ids].find(([, v]) => v.id === lobbyId)?.[0];
  link.kick = (lobbyId, ban = false) => { const id = sid(lobbyId); if (id) link.send({ t: 'kick', id, ban }); };
  link.lock = on => { link.locked = !!on; link.send({ t: 'lock', locked: !!on }); };
  link.report = (lobbyId, reason, lines = []) => link.send({ t: 'report', id: sid(lobbyId), reason, lines });
  // a finished match, for the server's replays (GET /api/replays)
  link.saveReplay = (replay, result, players = []) => link.send({ t: 'replay', replay, result, players });
  // a server bot into the room (server/bots.js): level easy, normal or hard
  link.addBot = (level = 'normal', char = null) => link.send({ t: 'bot', level, ...char ? { char } : {} });
  link.hosting = true;
  return link;
}
// guest: joins a room; want 'play' (a free slot, else watch) or 'watch'
function netServerJoin(lobby, url, roomCode, want = 'play', { device = '', WS } = {}) {
  const link = new ServerLink(url, {
    open: () => link.send({ t: 'join', room: roomCode, ...netServerWho(lobby, device) }),
    message: m => {
      if (m.t === 'joined') { link.room = m.room; link.player = m.player; if (m.player) lobby.name = m.player; lobby.toHost = x => link.send({ t: 'msg', m: x }); lobby.join(want); }
      else if (m.t === 'msg') lobby.receive(null, m.m);
      // the host left: we host now (from our last snapshot), or someone else does and we say hello to them again
      else if (m.t === 'promoted') { if (lobby.promote(m.fresh ? m.rules : null)) { netServerHosting(lobby, link); link.on.message(m); } else link.send({ t: 'leave' }); }
      else if (m.t === 'newhost') lobby.rejoin();
      else if (m.t === 'rated') link.rated?.(m);
      else if (m.t === 'closed') lobby.close(m.why);
      else if (m.t === 'error') lobby.close(m.error);
    },
    close: why => lobby.close(why === 'closed' ? 'lost the server' : why),
  }, WS);
  // a guest can only report the host (or the room)
  link.report = (lobbyId, reason, lines = []) => link.send({ t: 'report', id: lobbyId === 'h' ? 'h' : null, reason, lines });
  return link;
}
// quick match: waits in the server's queue for someone of a similar rating. on: { queued({ player, rating, waiting }), found(vs),
// matched({ role, ticket?, room?, vs }), close(why) }. Paired, the host side opens a room with netServerHost(…, { quick: ticket }),
// and the other side joins the room it's given.
function netServerQuick(url, name, { device = '', on = {}, WS } = {}) {
  const link = new ServerLink(url, {
    open: () => link.send({ t: 'quick', player: name, device }),
    message: m => {
      if (m.t === 'queued') on.queued?.(m);
      else if (m.t === 'found') on.found?.(m.vs);
      else if (m.t === 'matched') { link.matched = m; on.matched?.(m); link.close('matched'); }
      else if (m.t === 'error') link.close(m.error);
    },
    close: why => on.close?.(why),
  }, WS);
  link.cancel = () => { link.send({ t: 'unquick' }); link.close('cancelled'); };
  return link;
}
// an account action on a server (server/accounts.js): req { do: 'whoami' | 'register' | 'link' | 'claim' | 'unlink', device, player?, code? }
// → a promise of { name, devices, recovery?, code?, until? } (name null: no account), over a connection of its own
function netServerAccount(url, req, { WS } = {}) {
  return new Promise((done, fail) => {
    const link = new ServerLink(url, {
      open: () => link.send({ t: 'account', ...req }),
      message: m => { if (m.t === 'account') { done(m); link.close('done'); } else if (m.t === 'error') { fail(new Error(m.error.replace(/^account: /, ''))); link.close('done'); } },
      close: why => fail(new Error(why)),
    }, WS);
  });
}
// a server's leaderboard (GET /api/leaderboard) → { server, players: [{ name, rating, rd, games, wins, draws, ranked, last }] }, best first
async function netServerBoard(url) {
  const u = new URL(url.replace(/^ws/, 'http')); u.pathname = '/api/leaderboard';
  const r = await fetch(u); if (!r.ok) throw new Error(`the server said ${r.status}`);
  return r.json();
}
// the server this page came from, if a stick2 server serves it (its GET /api/rooms answers): { url, server, region, rooms } or null.
// A static host (GitHub Pages, a file) answers 404 or nothing, so the app stays as it is there.
async function netServerHome(page = typeof location !== 'undefined' ? location : null, get = typeof fetch !== 'undefined' ? fetch : null, ms = 1500) {
  if (!page || !get || !/^https?:$/.test(page.protocol)) return null;
  try {
    const r = await Promise.race([get(`${page.protocol}//${page.host}/api/rooms`), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
    const j = r.ok ? await r.json() : null;
    if (!Array.isArray(j?.rooms)) return null;
    return { url: `${page.protocol === 'https:' ? 'wss' : 'ws'}://${page.host}/ws`, ...j };
  } catch { return null; }
}
// the public rooms of a server, over HTTP (GET /api/rooms) → { server, region, rooms: [{ room, name, host, phase, players, watchers, locked }] }
async function netServerRooms(url) {
  const u = new URL(url.replace(/^ws/, 'http')); u.pathname = '/api/rooms';
  const r = await fetch(u); if (!r.ok) throw new Error(`the server said ${r.status}`);
  return r.json();
}
// a server's saved replays (GET /api/replays) → { server, replays: [{ id, at, room, players, scenario, frames, winner, verify? }] }, newest first;
// and one of them, as a replay file (GET /api/replays/<id>)
async function netServerReplays(url) {
  const u = new URL(url.replace(/^ws/, 'http')); u.pathname = '/api/replays';
  const r = await fetch(u); if (!r.ok) throw new Error(`the server said ${r.status}`);
  return r.json();
}
async function netServerReplay(url, id) {
  const u = new URL(url.replace(/^ws/, 'http')); u.pathname = `/api/replays/${encodeURIComponent(id)}`;
  const r = await fetch(u); if (!r.ok) throw new Error(`the server said ${r.status}`);
  return r.json();
}
