'use strict';
// ---------- the relay: rooms, and messages passed between a room's host and its guests ----------
// The browser that hosts a room still runs the lobby and the match (src/net/lobby.js, src/net/netmatch.js); the server only
// replaces the WebRTC data channel and the copy-and-paste codes. Each connection is a "client" with send(obj) and close(code, why).
// Protocol (JSON, one object per WebSocket message; see docs/server.md):
//   client → server   { t: 'host', name?, public?, player?, device? }
//                                                       open a room, as its host        → { t: 'room', room, player, delay, watchers }
//                     { t: 'join', room, player?, device? }
//                                                       join a room, as a guest         → { t: 'joined', room, player }, host gets { t: 'peer', id, player }
//                     { t: 'to', id, m }                host → one guest                → guest gets { t: 'msg', m }
//                     { t: 'msg', m }                   guest → its host                → host gets { t: 'from', id, m }
//                     { t: 'leave' }                    leave the room
//                     { t: 'list' }                     the public rooms                → { t: 'rooms', rooms }
//                     { t: 'kick', id, ban? }           (host) send a guest away; ban: not back into this room
//                     { t: 'lock', locked }             (host) refuse new guests while locked
//                     { t: 'report', id?, reason, lines? }  report a player (or the room) to the server's admins → { t: 'reported' }
//                     { t: 'auth', key, sig, device? }  prove an identity key (signs the hello's nonce) → { t: 'authed', id }
//                     { t: 'bot', level?, char? }         (host) a server bot joins the room (bots.js) → { t: 'bot', player } or { t: 'bot', error }
//                     { t: 'replay', replay, result?, players? }  (host) the finished match, for the server's replays → { t: 'saved', id },
//                       then, once the server has played it again (verify.js), { t: 'verified', id, verdict, why? }
//   server → client   { t: 'gone', id, why }            (host) a guest left
//                     { t: 'promoted', room, player, peers: [{ id, player }], delay, watchers }  (guest) the host left: you host the room now
//                     { t: 'newhost', player }          (guest) the host left and someone else hosts now: say hello to them
//                     { t: 'closed', why }              (guest) the room closed (or the guest was kicked)
//                     { t: 'error', error }             a request was refused
const RELAY = { code: 6, alphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', guests: 16, name: 24, reports: 200, reason: 200, lines: 50 };
const { nameClean, nameGen } = require('../src/net/names');
const crypto = require('crypto');
// an identity key (src/net/identity.js): an ECDSA P-256 public key; its id is the device id it stands for on every server
const keyId = jwk => 'k' + crypto.createHash('sha256').update(`${jwk.x}.${jwk.y}`).digest('hex').slice(0, 31);

class Relay {
  // limits: { maxRooms }; metrics: the counters and gauges it updates (server.js); rng: () → [0, 1), the tests pass their own
  // bans: a Bans (moderation.js) or null; blocklist: more words the name filter refuses; audit(action, detail): the moderation log
  // replays: a Replays (replays.js) or null; delay: frames spectators watch behind (anti-ghosting); watchers: spectators a room may have
  constructor({ maxRooms = 500, guests = RELAY.guests, metrics = null, rng = Math.random, now = () => Date.now(), bans = null, blocklist = [], audit = () => {}, replays = null, verifier = null, ratings = null, accounts = null, idleMs = 0, delay = 0, watchers = 14 } = {}) {
    Object.assign(this, { maxRooms, guests, metrics, rng, now, bans, blocklist, audit, replays, verifier, ratings, accounts, idleMs, delay, watchers, rooms: new Map(), names: new Map(), reports: [], flags: [], quick: [], tickets: new Map(), draining: false, spectatorPeak: 0 });
  }
  // the name a connection plays under on this server: its own if the filter takes it, else the one its device id generates;
  // a #tag only when someone else already has it
  // the device a message stands for: a proven key (auth) wins over the id a client merely says
  dev(client, m) { return client.key || String(m.device || client.device || '').slice(0, 64); }
  // { t: 'auth', key, sig, device? }: the key signs the hello's nonce, so this connection is that key's from now on. The device id the
  // app used before keys (device) hands over its account and rating to the key, once → { t: 'authed', id } or { t: 'error' }
  auth(client, m) {
    const k = m.key;
    if (client.key || client.player) return this.error(client, 'auth: too late (before anything else, once)');
    if (!client.nonce || !k || typeof k !== 'object' || k.kty !== 'EC' || k.crv !== 'P-256' || typeof k.x !== 'string' || typeof k.y !== 'string' || typeof m.sig !== 'string') return this.error(client, 'auth: bad key');
    let ok = false;
    try { ok = crypto.verify('sha256', Buffer.from('stick2-auth:' + client.nonce), { key: { kty: 'EC', crv: 'P-256', x: k.x, y: k.y }, format: 'jwk', dsaEncoding: 'ieee-p1363' }, Buffer.from(m.sig, 'base64url')); } catch {}
    if (!ok) return this.error(client, 'auth: the signature does not match');
    client.key = keyId(k); client.nonce = null;
    const old = String(m.device || '').slice(0, 64);
    if (old && old !== client.key) {
      const A = this.accounts, a = A?.of(old);
      if (a && !A.of(client.key)) { A.attach(a, client.key); this.audit('account', { action: 'key', name: a.name }); }
      else if (!a) this.ratings?.move(old, client.key);
    }
    this.metrics?.auths?.inc({});
    client.send({ t: 'authed', id: client.key });
  }
  claim(client, m) {
    if (client.player) return client.player;
    const device = this.dev(client, m), acct = this.accounts?.of(device);
    // an account plays under its own name; anyone else can't take a name an account keeps (accounts.js)
    const base = acct?.name || nameClean(m.player, this.blocklist) || nameGen(String(device || client.ip || this.rng()));
    let name = base;
    for (let i = 2; this.names.has(name.toLowerCase()) || (!acct && this.accounts?.reserved(name, device)); i++) name = `${base}#${i}`;
    this.names.set(name.toLowerCase(), client);
    Object.assign(client, { player: name, device, account: acct?.id || null, who: acct ? 'acct:' + acct.id : device });
    this.accounts?.seen(acct);
    return name;
  }
  release(client) {
    this.quickLeave(client); if (client.player && this.names.get(client.player.toLowerCase()) === client) this.names.delete(client.player.toLowerCase()); }
  banned(client) { return this.bans?.find({ device: client.device, ip: client.ip, name: client.player, account: client.account }); }
  code() {
    for (let tries = 0; tries < 100; tries++) {
      let c = '';
      for (let i = 0; i < RELAY.code; i++) c += RELAY.alphabet[Math.floor(this.rng() * RELAY.alphabet.length)];
      if (!this.rooms.has(c)) return c;
    }
    throw new Error('no free room code');
  }
  error(client, error) { client.send({ t: 'error', error }); this.metrics?.refused.inc({ reason: error.split(':')[0] }); }

  // a message from a connection; returns nothing (replies go through client.send)
  receive(client, m) {
    if (!m || typeof m.t !== 'string') return this.error(client, 'bad message');
    switch (m.t) {
      case 'host': return this.host(client, m);
      case 'join': return this.join(client, m);
      case 'to': return this.toGuest(client, m);
      case 'msg': return this.toHost(client, m);
      case 'leave': return this.leave(client, 'left');
      case 'list': return client.send({ t: 'rooms', rooms: this.list() });
      case 'kick': return this.kick(client, m);
      case 'lock': return this.lock(client, m);
      case 'report': return this.report(client, m);
      case 'replay': return this.replay(client, m);
      case 'quick': return this.quickJoin(client, m);
      case 'unquick': return this.quickLeave(client, true);
      case 'account': return this.account(client, m);
      case 'auth': return this.auth(client, m);
      case 'bot': return this.bot(client, m);
      default: return this.error(client, 'unknown message');
    }
  }
  host(client, m) {
    if (this.draining) return this.error(client, 'draining: the server is restarting, try again in a moment');
    if (client.room) return this.error(client, 'already in a room');
    if (this.rooms.size >= this.maxRooms) return this.error(client, 'full: the server has no free rooms');
    const player = this.claim(client, m), ban = this.banned(client);
    if (ban) return this.error(client, `banned: ${ban.reason || 'by the server'}`);
    const room = this.code(), name = nameClean(m.name, this.blocklist)?.slice(0, RELAY.name) || `${player}'s room`;
    this.rooms.set(room, { code: room, name, public: !!m.public, host: client, guests: new Map(), n: 0, phase: 'lobby', players: 1, watchers: 0, created: this.now(), started: 0, locked: false, banned: new Set() });
    Object.assign(client, { room, role: 'host', id: 'h' });
    this.metrics?.rooms.inc({});
    client.send({ t: 'room', room, player, delay: this.delay, watchers: this.watchers });
    const tk = m.quick && this.tickets.get(String(m.quick));
    if (tk) { this.tickets.delete(String(m.quick)); this.metrics?.quickMatches?.inc({}); tk.b.send({ t: 'matched', role: 'guest', room, vs: player }); }
  }
  join(client, m) {
    if (this.draining) return this.error(client, 'draining: the server is restarting, try again in a moment');
    if (client.room) return this.error(client, 'already in a room');
    const r = this.rooms.get(String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (r && !r.host && this.now() - r.empty >= this.idleMs) this.remove(r);
    if (!r || !this.rooms.has(r.code)) return this.error(client, 'no room: that room code is unknown or the room has closed');
    const player = this.claim(client, m), ban = this.banned(client);
    if (ban) return this.error(client, `banned: ${ban.reason || 'by the server'}`);
    if ((client.device && r.banned.has(client.device)) || r.banned.has(client.ip)) return this.error(client, 'kicked: the host sent you away from this room');
    if (r.locked) return this.error(client, 'locked: the host locked the room');
    if (r.guests.size >= this.guests) return this.error(client, 'full: the room has no free places');
    if (!r.host) { // an empty room, still open (ROOM_IDLE): the first one in hosts it, with the room's last rules
      Object.assign(client, { room: r.code, role: 'host', id: 'h' });
      Object.assign(r, { host: client, empty: 0, phase: 'lobby', players: 1, watchers: 0, saved: false });
      this.metrics?.joins.inc({});
      client.send({ t: 'promoted', room: r.code, player, peers: [], delay: this.delay, watchers: this.watchers, fresh: true, rules: r.rules || null });
      this.audit('reopen', { room: r.code, to: player });
      return;
    }
    const id = 's' + ++r.n;
    r.guests.set(id, client);
    Object.assign(client, { room: r.code, role: 'guest', id });
    this.metrics?.joins.inc({});
    client.send({ t: 'joined', room: r.code, player });
    r.host.send({ t: 'peer', id, player });
  }
  toGuest(client, m) {
    const r = client.role === 'host' && this.rooms.get(client.room);
    if (!r) return this.error(client, 'not hosting');
    const g = r.guests.get(m.id);
    if (g) g.send({ t: 'msg', m: m.m });
    this.watch(r, m.m);
  }
  toHost(client, m) {
    const r = client.role === 'guest' && this.rooms.get(client.room);
    if (!r) return this.error(client, 'not in a room');
    r.host.send({ t: 'from', id: client.id, m: m.m });
  }
  // the host sends a guest away (ban: and keeps them out of this room)
  kick(client, m) {
    const r = client.role === 'host' && this.rooms.get(client.room);
    if (!r) return this.error(client, 'not hosting');
    const g = r.guests.get(m.id);
    if (!g) return this.error(client, 'no such guest');
    if (m.ban) r.banned.add(g.device || g.ip);
    this.metrics?.kicks.inc({ by: 'host' });
    this.audit('kick', { by: 'host', room: r.code, player: g.player, ban: !!m.ban });
    this.drop(r, m.id, 'kicked by the host');
  }
  // a guest out of its room, told why; the host hears it left
  drop(r, id, why) {
    const g = r.guests.get(id); if (!g) return;
    g.send({ t: 'closed', why });
    r.guests.delete(id);
    g.room = g.role = g.id = null;
    r.host.send({ t: 'gone', id, why });
  }
  lock(client, m) {
    const r = client.role === 'host' && this.rooms.get(client.room);
    if (!r) return this.error(client, 'not hosting');
    r.locked = !!m.locked;
  }
  // a report: kept (the last RELAY.reports) for the admins, with what the reporter's chat showed
  report(client, m) {
    const r = this.rooms.get(client.room), who = r && (m.id === 'h' ? r.host : r.guests.get(m.id));
    const lines = Array.isArray(m.lines) ? m.lines.slice(-RELAY.lines).map(l => String(l).slice(0, 300)) : [];
    this.reports.push({ at: new Date(this.now()).toISOString(), by: client.player || null, room: client.room || null, player: who?.player || null, device: who?.device || null, reason: String(m.reason || '').slice(0, RELAY.reason), lines });
    if (this.reports.length > RELAY.reports) this.reports.shift();
    this.metrics?.reports.inc({});
    this.audit('report', { by: client.player, room: client.room, player: who?.player || null });
    client.send({ t: 'reported' });
  }
  // the host's finished match, kept as a replay (once per match)
  replay(client, m) {
    const r = client.role === 'host' && this.rooms.get(client.room);
    if (!r) return this.error(client, 'not hosting');
    if (!this.replays && !this.verifier) return this.error(client, 'off: this server keeps no replays');
    if (r.saved) return this.error(client, 'already saved: one replay per match');
    if (m.replay?.format !== 'stick2-replay' || !Array.isArray(m.replay.frames)) return this.error(client, 'bad replay: not a stick2 replay');
    let id = null;
    if (this.replays) { try { id = this.replays.add(m.replay, { room: r.code, players: m.players, result: m.result }); } catch (e) { return this.error(client, `bad replay: ${e.message}`); } }
    r.saved = true;
    if (id) { this.metrics?.replays?.inc({}); client.send({ t: 'saved', id }); }
    const players = Array.isArray(m.players) ? m.players.slice(0, 2).map(p => String(p ?? '').slice(0, 24)) : [];
    // the two who fought, as the server knows them (the host names them; only someone in the room counts): rated on an ok verdict
    const inRoom = [r.host, ...r.guests.values()], fighters = players.map(n => inRoom.find(c => c.player && c.player === n) || null);
    this.verify(m.replay, m.result, { id, room: r.code, player: client.player, device: client.device, players, fighters });
  }
  // the server plays the match again (verify.js): a verdict on the replay, gameplay metrics, and a flag on a host whose match doesn't add up
  async verify(replay, result, who) {
    if (!this.verifier) return null;
    const v = await this.verifier.verify(replay, result && typeof result === 'object' ? result : null);
    this.metrics?.verified?.inc({ verdict: v.verdict });
    this.metrics?.verifySeconds?.observe(v.seconds);
    if (v.stats && (v.verdict === 'ok' || v.verdict === 'result')) this.metrics?.match?.(v.stats);
    if (who.id) this.replays?.mark?.(who.id, { verdict: v.verdict, ...(v.why ? { why: v.why } : {}), ...(v.stats ? { end: v.stats.end, winner: v.stats.winner } : {}) });
    if (v.verdict === 'desync' || v.verdict === 'result') {
      this.metrics?.flags?.inc({ verdict: v.verdict });
      this.audit('flagged', { verdict: v.verdict, why: v.why, room: who.room, host: who.player, replay: who.id });
      this.flags.unshift({ at: new Date(this.now()).toISOString(), verdict: v.verdict, why: v.why, room: who.room, host: who.player, players: who.players, replay: who.id });
      this.flags.length = Math.min(this.flags.length, RELAY.reports);
    }
    // ratings (ratings.js): a fight that played out as recorded, between two devices, that nobody left
    const f = who.fighters || [];
    if (v.verdict === 'ok' && this.ratings && f.length === 2 && f[0] && f[1] && !f[0].bot && !f[1].bot && !(result && result.forfeit !== undefined)) {
      const ch = this.ratings.record(...f.map(c => ({ device: c.who || c.device, name: c.player })), v.stats.winner);
      if (ch) {
        this.metrics?.rated?.inc({});
        const news = f.map((c, i) => ({ name: c.player, ...this.ratings.get(c.who || c.device), change: ch[i] }));
        for (const c of f) c.send({ t: 'rated', players: news });
      }
    }
    const host = this.rooms.get(who.room)?.host;
    host?.send({ t: 'verified', id: who.id, verdict: v.verdict, ...(v.why ? { why: v.why } : {}) });
    return v;
  }
  // { t: 'bot', level?, char? } (host) a server bot (bots.js) joins the room as a guest → { t: 'bot', player } (or { t: 'bot', error })
  bot(client, m) {
    const r = client.role === 'host' && this.rooms.get(client.room);
    if (!r) return this.error(client, 'not hosting');
    // (a refusal comes back as { t: 'bot', error }, never an error: that would close the host's lobby)
    if (!this.bots) return client.send({ t: 'bot', error: 'bots: this server has bots off (BOTS=0)' });
    try { client.send({ t: 'bot', player: this.bots.add(r.code, { level: m.level || 'normal', char: m.char || null }) }); }
    catch (e) { client.send({ t: 'bot', error: e.message }); }
  }
  // admin: every room with who's in it (names only: no addresses)
  detail() {
    return [...this.rooms.values()].map(r => ({ room: r.code, name: r.name, public: r.public, locked: r.locked, phase: r.phase, host: r.host?.player || null, empty: !r.host, created: new Date(r.created).toISOString(),
      guests: [...r.guests].map(([id, g]) => ({ id, player: g.player })) }));
  }
  // admin: close a room, or send one player (by name) off the server's rooms; returns whether anything happened
  close(code, why = 'closed by the server') {
    const r = this.rooms.get(code); if (!r) return false;
    if (!r.host) { this.remove(r); return true; }
    for (const id of [...r.guests.keys()]) this.drop(r, id, why);
    r.host.send({ t: 'closed', why });
    this.leave(r.host, why, false);
    return true;
  }
  kickPlayer(name, why = 'kicked by the server') {
    const c = this.names.get(String(name).toLowerCase()); if (!c) return false;
    const r = this.rooms.get(c.room);
    if (r && c.role === 'host') this.close(r.code, why);
    else if (r) this.drop(r, c.id, why);
    c.close?.(4000, why);
    return true;
  }
  // what the host's lobby broadcasts tells the server the room's phase and who's in it (for the room list and the metrics)
  watch(r, m) {
    if (m?.t !== 'lobby' || !m.state) return;
    const s = m.state, was = r.phase;
    r.players = (s.slots || []).filter(Boolean).length; r.watchers = (s.watch || []).length;
    // for the room browser: the rules, the queue, who holds the longest streak (names come from the host's lobby: clipped)
    const clip = (v, n) => String(v ?? '').slice(0, n), rl = s.rules || {};
    r.rules = { rotation: clip(rl.rotation || 'off', 8), cap: rl.cap | 0, bestOf: rl.bestOf | 0 || 1, timer: rl.timer | 0, rollback: rl.rollback !== false, bans: Array.isArray(rl.bans) ? rl.bans.length : 0 };
    r.queue = Array.isArray(s.queue) ? s.queue.length : 0;
    const people = [...(s.slots || []), ...(s.watch || [])].filter(Boolean);
    let best = null; for (const [id, sc] of Object.entries(s.score || {})) if ((sc?.streak | 0) > 1 && (!best || sc.streak > best.streak)) best = { name: clip(people.find(p => p.id === id)?.name, RELAY.name), streak: sc.streak | 0 };
    r.streak = best;
    let n = 0; for (const x of this.rooms.values()) n += x.watchers;
    this.spectatorPeak = Math.max(this.spectatorPeak, n);
    if (s.phase === was) return;
    r.phase = String(s.phase);
    if (r.phase === 'match') { r.started = this.now(); r.saved = false; this.metrics?.matches.inc({}); }
    if (was === 'match' && r.phase === 'post') { this.metrics?.finished.inc({}); this.metrics?.matchSeconds.observe((this.now() - r.started) / 1000); }
  }
  // a connection leaving its room (it left, or the socket closed). A host that leaves a room with guests in it hands it over to the
  // guest who has been there longest (handover: false, an admin closing it or a drain, closes it instead)
  leave(client, why = 'left', handover = !this.draining) {
    const r = this.rooms.get(client.room);
    if (!r) return;
    if (client.role === 'host' && handover && r.guests.size) {
      const [nid, next] = r.guests.entries().next().value;
      r.guests.delete(nid);
      r.host = next; Object.assign(next, { role: 'host', id: 'h' });
      client.room = client.role = client.id = null;
      next.send({ t: 'promoted', room: r.code, player: next.player, peers: [...r.guests].map(([id, g]) => ({ id, player: g.player })), delay: this.delay, watchers: this.watchers });
      for (const g of r.guests.values()) g.send({ t: 'newhost', player: next.player });
      this.metrics?.handovers?.inc({});
      this.audit('handover', { room: r.code, from: client.player, to: next.player });
      return;
    }
    if (client.role === 'host' && handover && this.idleMs && !r.locked) { // the last one out: the room stays open, empty, for ROOM_IDLE
      Object.assign(r, { host: null, empty: this.now(), phase: 'lobby', players: 0, watchers: 0, queue: 0, streak: null });
      this.audit('empty', { room: r.code, from: client.player });
    } else if (client.role === 'host') {
      for (const g of r.guests.values()) { g.send({ t: 'closed', why: 'the host closed the room' }); g.room = g.role = g.id = null; }
      this.remove(r);
    } else {
      r.guests.delete(client.id);
      r.host.send({ t: 'gone', id: client.id, why });
    }
    client.room = client.role = client.id = null;
  }
  remove(r) {
    if (!this.rooms.delete(r.code)) return;
    this.metrics?.rooms.dec({});
    this.metrics?.roomSeconds.observe((this.now() - r.created) / 1000);
  }
  // empty rooms whose ROOM_IDLE ran out close (the server calls this every few seconds)
  sweep() { this.matchmake(); for (const r of [...this.rooms.values()]) if (!r.host && this.now() - r.empty >= this.idleMs) this.remove(r); }
  // ---------- accounts (accounts.js), on a connection outside any room ----------
  // { t: 'account', do: 'whoami' | 'register' | 'link' | 'claim' | 'unlink', device, player?, code? } → { t: 'account', name, devices?,
  // recovery? (register only, shown once), code?, until? (link) } or an error
  account(client, m) {
    if (!this.accounts) return this.error(client, 'off: this server has no accounts');
    const device = this.dev(client, m), A = this.accounts;
    if (!device) return this.error(client, 'no device id');
    const ban = this.bans?.find({ device, ip: client.ip, account: A.of(device)?.id });
    if (ban && m.do !== 'whoami') return this.error(client, `banned: ${ban.reason || 'by the server'}`);
    const reply = (a, extra = {}) => client.send({ t: 'account', name: a?.name || null, devices: a?.devices.length || 0, ...extra });
    try {
      if (m.do === 'whoami') return reply(A.of(device));
      if (m.do === 'register') {
        const name = nameClean(m.player, this.blocklist);
        if (!name) return this.error(client, 'bad name: pick another one');
        const holder = this.names.get(name.toLowerCase());
        if (holder && holder.device !== device) return this.error(client, 'taken: someone is playing under that name now');
        const { account, recovery } = A.register(device, name);
        this.ratings?.move(device, 'acct:' + account.id); this.ratings?.rename('acct:' + account.id, name);
        this.metrics?.accounts?.inc({ action: 'register' });
        this.audit('account', { action: 'register', name });
        return reply(account, { recovery });
      }
      if (m.do === 'link') { const l = A.linkCode(device); this.metrics?.accounts?.inc({ action: 'link' }); return reply(A.of(device), { code: l.code, until: l.until }); }
      if (m.do === 'claim') {
        const a = A.claim(device, m.code);
        this.metrics?.accounts?.inc({ action: 'claim' });
        this.audit('account', { action: 'claim', name: a.name });
        return reply(a);
      }
      if (m.do === 'unlink') { A.unlink(device); return reply(null); }
    } catch (e) { return this.error(client, `account: ${e.message}`); }
    return this.error(client, 'unknown account action');
  }
  // ---------- quick match: a queue of players looking for a fight, paired by rating ----------
  // { t: 'quick', player?, device? } → { t: 'queued', rating, waiting }; paired, the one waiting longer gets { t: 'matched', role: 'host',
  // ticket, vs } and opens a room with { t: 'host', quick: ticket }, then the other gets { t: 'matched', role: 'guest', room, vs }
  quickJoin(client, m) {
    if (this.draining) return this.error(client, 'draining: the server is restarting, try again in a moment');
    if (client.room) return this.error(client, 'already in a room');
    const player = this.claim(client, m), ban = this.banned(client);
    if (ban) return this.error(client, `banned: ${ban.reason || 'by the server'}`);
    if (!this.quick.some(q => q.client === client)) this.quick.push({ client, rating: this.ratings?.get(client.who || client.device)?.rating ?? 1500, at: this.now() });
    client.send({ t: 'queued', player, rating: this.quick.find(q => q.client === client).rating, waiting: this.quick.length });
    this.matchmake();
  }
  quickLeave(client, say = false) {
    const i = this.quick.findIndex(q => q.client === client);
    if (i >= 0) this.quick.splice(i, 1);
    for (const [k, t] of this.tickets) if (t.b === client) this.tickets.delete(k); // (the host side's quick link closes on purpose: it opens the room on a new one)
    if (say) client.send({ t: 'unqueued' });
  }
  requeue(c) { if (!this.quick.some(q => q.client === c)) this.quick.unshift({ client: c, rating: this.ratings?.get(c.who || c.device)?.rating ?? 1500, at: this.now() - 30000 }); }
  // how far apart two ratings may be: 100, widening by 50 every 10 s the longer one has waited
  window(q) { return 100 + 50 * Math.floor((this.now() - q.at) / 10000); }
  matchmake() {
    for (const [k, t] of this.tickets) if (this.now() > t.expires) { this.tickets.delete(k); this.requeue(t.b); } // a host that never opened its room
    const q = this.quick;
    for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) {
      const a = q[i], b = q[j];
      if (a.client.device && a.client.device === b.client.device) continue;
      if (Math.abs(a.rating - b.rating) > Math.max(this.window(a), this.window(b))) continue;
      q.splice(j, 1); q.splice(i, 1);
      const ticket = Math.floor(this.rng() * 2 ** 48).toString(36);
      this.tickets.set(ticket, { a: a.client, b: b.client, expires: this.now() + 15000 });
      this.metrics?.quickWait?.observe((this.now() - a.at) / 1000); this.metrics?.quickWait?.observe((this.now() - b.at) / 1000);
      a.client.send({ t: 'matched', role: 'host', ticket, vs: b.client.player });
      b.client.send({ t: 'found', vs: a.client.player });
      i--; break;
    }
  }
  list() {
    return [...this.rooms.values()].filter(r => r.public).map(r => ({ room: r.code, name: r.name, host: r.host?.player || null, empty: !r.host, phase: r.phase, players: r.players, watchers: r.watchers, locked: r.locked,
      rules: r.rules || null, queue: r.queue || 0, streak: r.streak || null }));
  }
  phases() { const c = {}; for (const r of this.rooms.values()) c[r.phase] = (c[r.phase] || 0) + 1; return c; }
}

module.exports = { Relay, RELAY };
