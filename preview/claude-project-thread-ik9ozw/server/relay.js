'use strict';
// ---------- the relay: rooms, and messages passed between a room's host and its guests ----------
// The browser that hosts a room still runs the lobby and the match (src/net/lobby.js, src/net/netmatch.js); the server only
// replaces the WebRTC data channel and the copy-and-paste codes. Each connection is a "client" with send(obj) and close(code, why).
// Protocol (JSON, one object per WebSocket message; see docs/server.md):
//   client → server   { t: 'host', name?, public? }     open a room, as its host        → { t: 'room', room }
//                     { t: 'join', room }               join a room, as a guest         → { t: 'joined', room }, host gets { t: 'peer', id }
//                     { t: 'to', id, m }                host → one guest                → guest gets { t: 'msg', m }
//                     { t: 'msg', m }                   guest → its host                → host gets { t: 'from', id, m }
//                     { t: 'leave' }                    leave the room
//                     { t: 'list' }                     the public rooms                → { t: 'rooms', rooms }
//   server → client   { t: 'gone', id, why }            (host) a guest left
//                     { t: 'closed', why }              (guest) the room closed
//                     { t: 'error', error }             a request was refused
const RELAY = { code: 6, alphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', guests: 8, name: 24 };

class Relay {
  // limits: { maxRooms }; metrics: the counters and gauges it updates (server.js); rng: () → [0, 1), the tests pass their own
  constructor({ maxRooms = 500, guests = RELAY.guests, metrics = null, rng = Math.random, now = () => Date.now() } = {}) {
    Object.assign(this, { maxRooms, guests, metrics, rng, now, rooms: new Map(), draining: false });
  }
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
      default: return this.error(client, 'unknown message');
    }
  }
  host(client, m) {
    if (this.draining) return this.error(client, 'draining: the server is restarting, try again in a moment');
    if (client.room) return this.error(client, 'already in a room');
    if (this.rooms.size >= this.maxRooms) return this.error(client, 'full: the server has no free rooms');
    const room = this.code(), name = String(m.name || 'room').slice(0, RELAY.name);
    this.rooms.set(room, { code: room, name, public: !!m.public, host: client, guests: new Map(), n: 0, phase: 'lobby', players: 1, watchers: 0, created: this.now(), started: 0 });
    Object.assign(client, { room, role: 'host', id: 'h' });
    this.metrics?.rooms.inc({});
    client.send({ t: 'room', room });
  }
  join(client, m) {
    if (this.draining) return this.error(client, 'draining: the server is restarting, try again in a moment');
    if (client.room) return this.error(client, 'already in a room');
    const r = this.rooms.get(String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (!r) return this.error(client, 'no room: that room code is unknown or the room has closed');
    if (r.guests.size >= this.guests) return this.error(client, 'full: the room has no free places');
    const id = 's' + ++r.n;
    r.guests.set(id, client);
    Object.assign(client, { room: r.code, role: 'guest', id });
    this.metrics?.joins.inc({});
    client.send({ t: 'joined', room: r.code });
    r.host.send({ t: 'peer', id });
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
    return [...this.rooms.values()].filter(r => r.public).map(r => ({ room: r.code, name: r.name, phase: r.phase, players: r.players, watchers: r.watchers }));
  }
  phases() { const c = {}; for (const r of this.rooms.values()) c[r.phase] = (c[r.phase] || 0) + 1; return c; }
}

module.exports = { Relay, RELAY };
