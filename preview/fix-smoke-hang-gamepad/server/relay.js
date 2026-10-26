'use strict';
// ---------- the relay: rooms, and messages passed between a room's host and its guests ----------
// The browser that hosts a room still runs the lobby and the match (src/net/lobby.js, src/net/netmatch.js); the server only
// replaces the WebRTC data channel and the copy-and-paste codes. Each connection is a "client" with send(obj) and close(code, why).
// Protocol (JSON, one object per WebSocket message; see docs/server.md):
//   client → server   { t: 'host', name?, public?, player?, device? }
//                                                       open a room, as its host        → { t: 'room', room, player }
//                     { t: 'join', room, player?, device? }
//                                                       join a room, as a guest         → { t: 'joined', room, player }, host gets { t: 'peer', id, player }
//                     { t: 'to', id, m }                host → one guest                → guest gets { t: 'msg', m }
//                     { t: 'msg', m }                   guest → its host                → host gets { t: 'from', id, m }
//                     { t: 'leave' }                    leave the room
//                     { t: 'list' }                     the public rooms                → { t: 'rooms', rooms }
//                     { t: 'kick', id, ban? }           (host) send a guest away; ban: not back into this room
//                     { t: 'lock', locked }             (host) refuse new guests while locked
//                     { t: 'report', id?, reason, lines? }  report a player (or the room) to the server's admins → { t: 'reported' }
//   server → client   { t: 'gone', id, why }            (host) a guest left
//                     { t: 'closed', why }              (guest) the room closed (or the guest was kicked)
//                     { t: 'error', error }             a request was refused
const RELAY = { code: 6, alphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', guests: 8, name: 24, reports: 200, reason: 200, lines: 50 };
const { nameClean, nameGen } = require('../src/net/names');

class Relay {
  // limits: { maxRooms }; metrics: the counters and gauges it updates (server.js); rng: () → [0, 1), the tests pass their own
  // bans: a Bans (moderation.js) or null; blocklist: more words the name filter refuses; audit(action, detail): the moderation log
  constructor({ maxRooms = 500, guests = RELAY.guests, metrics = null, rng = Math.random, now = () => Date.now(), bans = null, blocklist = [], audit = () => {} } = {}) {
    Object.assign(this, { maxRooms, guests, metrics, rng, now, bans, blocklist, audit, rooms: new Map(), names: new Map(), reports: [], draining: false });
  }
  // the name a connection plays under on this server: its own if the filter takes it, else the one its device id generates;
  // a #tag only when someone else already has it
  claim(client, m) {
    if (client.player) return client.player;
    const base = nameClean(m.player, this.blocklist) || nameGen(String(m.device || client.ip || this.rng()));
    let name = base;
    for (let i = 2; this.names.has(name.toLowerCase()); i++) name = `${base}#${i}`;
    this.names.set(name.toLowerCase(), client);
    client.player = name; client.device = String(m.device || '').slice(0, 64);
    return name;
  }
  release(client) { if (client.player && this.names.get(client.player.toLowerCase()) === client) this.names.delete(client.player.toLowerCase()); }
  banned(client) { return this.bans?.find({ device: client.device, ip: client.ip, name: client.player }); }
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
    client.send({ t: 'room', room, player });
  }
  join(client, m) {
    if (this.draining) return this.error(client, 'draining: the server is restarting, try again in a moment');
    if (client.room) return this.error(client, 'already in a room');
    const r = this.rooms.get(String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (!r) return this.error(client, 'no room: that room code is unknown or the room has closed');
    const player = this.claim(client, m), ban = this.banned(client);
    if (ban) return this.error(client, `banned: ${ban.reason || 'by the server'}`);
    if ((client.device && r.banned.has(client.device)) || r.banned.has(client.ip)) return this.error(client, 'kicked: the host sent you away from this room');
    if (r.locked) return this.error(client, 'locked: the host locked the room');
    if (r.guests.size >= this.guests) return this.error(client, 'full: the room has no free places');
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
  // admin: every room with who's in it (names only: no addresses)
  detail() {
    return [...this.rooms.values()].map(r => ({ room: r.code, name: r.name, public: r.public, locked: r.locked, phase: r.phase, host: r.host.player, created: new Date(r.created).toISOString(),
      guests: [...r.guests].map(([id, g]) => ({ id, player: g.player })) }));
  }
  // admin: close a room, or send one player (by name) off the server's rooms; returns whether anything happened
  close(code, why = 'closed by the server') {
    const r = this.rooms.get(code); if (!r) return false;
    for (const id of [...r.guests.keys()]) this.drop(r, id, why);
    r.host.send({ t: 'closed', why });
    this.leave(r.host, why);
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
    if (s.phase === was) return;
    r.phase = String(s.phase);
    if (r.phase === 'match') { r.started = this.now(); this.metrics?.matches.inc({}); }
    if (was === 'match' && r.phase === 'post') { this.metrics?.finished.inc({}); this.metrics?.matchSeconds.observe((this.now() - r.started) / 1000); }
  }
  // a connection leaving its room (it left, or the socket closed)
  leave(client, why = 'left') {
    const r = this.rooms.get(client.room);
    if (!r) return;
    if (client.role === 'host') {
      for (const g of r.guests.values()) { g.send({ t: 'closed', why: 'the host closed the room' }); g.room = g.role = g.id = null; }
      this.rooms.delete(r.code);
      this.metrics?.rooms.dec({});
      this.metrics?.roomSeconds.observe((this.now() - r.created) / 1000);
    } else {
      r.guests.delete(client.id);
      r.host.send({ t: 'gone', id: client.id, why });
    }
    client.room = client.role = client.id = null;
  }
  list() {
    return [...this.rooms.values()].filter(r => r.public).map(r => ({ room: r.code, name: r.name, host: r.host.player || null, phase: r.phase, players: r.players, watchers: r.watchers, locked: r.locked }));
  }
  phases() { const c = {}; for (const r of this.rooms.values()) c[r.phase] = (c[r.phase] || 0) + 1; return c; }
}

module.exports = { Relay, RELAY };
