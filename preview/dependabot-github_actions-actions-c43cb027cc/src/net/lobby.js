'use strict';
// ---------- netplay lobby: who's in, who plays which character, ready, start (layer 3, see docs/netplay.md) ----------
// The host is the authority: guests send requests, the host applies them and broadcasts the whole lobby with a revision number,
// so a guest's view is always just the latest snapshot. The lobby never touches the network itself: the host links each guest
// with a send function and feeds in what arrives (receive), so it runs the same over WebRTC, a server relay or, in the tests,
// plain function calls. Pure logic, no DOM.
const NET_PROTO = 1; // the lobby protocol's version: a hello with another one is turned away
const LOBBY = { slots: 2, watchers: 6, pingMs: 1000, timeoutMs: 10000, name: 24, char: 40, chat: 200 };

class Lobby {
  // role: 'host' | 'guest'; name: ours; send (guest): message → the host; now: a ms clock (the tests pass their own)
  // hooks: change(lobby) on every new snapshot; event(e) for chat, errors and phase changes (the match's carries its header); match(m) the match's messages;
  //        header(state, seed, defs) → the match a start sends (default: lobbyHeader); verify(header) → its hash (default: lobbyHash)
  //        catchup(id): a spectator joined mid-match (it has the header already): send it the fight so far
  // watchers: how many may watch (a server can set fewer)
  constructor({ role, name = 'player', send = null, hooks = {}, now = () => Date.now(), engine = typeof ENGINE_VERSION !== 'undefined' ? ENGINE_VERSION : 0, watchers = LOBBY.watchers }) {
    Object.assign(this, { role, name: lobbyClip(name, LOBBY.name), toHost: send, hooks, now, engine, watchers, header: null, id: null, peers: new Map(), n: 0, defs: {}, lastPing: 0, heard: now() });
    if (role === 'host') {
      this.id = 'h';
      this.state = { rev: 0, phase: 'lobby', scenario: 'you vs ai', over: {}, slots: [{ id: 'h', name: this.name, char: null, ready: false, rtt: 0 }, null], watch: [], error: null, result: null };
    } else this.state = null; // until the host's first snapshot
  }
  get host() { return this.role === 'host'; }
  get phase() { return this.state?.phase ?? 'joining'; }
  get me() { return this.state?.slots.find(s => s?.id === this.id) || null; }
  emit(e) { this.hooks.event?.(e); }

  // ---------- host: links ----------
  // a new guest's link; their hello comes through receive(id, …). Returns the id to receive with.
  link(send) { const id = 'g' + ++this.n; this.peers.set(id, { send, hello: false, heard: this.now(), rtt: 0 }); return id; }
  unlink(id, why = 'left') {
    const p = this.peers.get(id); if (!p) return;
    this.peers.delete(id);
    if (!p.hello) return;
    const s = this.state, who = this.nameOf(id);
    s.slots = s.slots.map(x => x?.id === id ? null : x); s.watch = s.watch.filter(x => x.id !== id);
    delete this.defs[id];
    this.emit({ type: 'left', id, name: who, why });
    if (s.phase === 'sync') this.abort(`${who} ${why} while the match was starting`);
    else if (s.phase === 'match') this.finish({ forfeit: id, why }, false);
    this.broadcast();
  }
  sendTo(id, m) { this.peers.get(id)?.send(m); }
  broadcast() {
    const s = this.state; s.rev++;
    for (const sl of s.slots) if (sl && sl.id !== 'h') sl.rtt = this.peers.get(sl.id)?.rtt ?? 0;
    for (const [id, p] of this.peers) if (p.hello) p.send({ t: 'lobby', state: s });
    this.hooks.change?.(this);
  }
  nameOf(id) { return [...this.state.slots, ...this.state.watch].find(x => x?.id === id)?.name ?? id; }
  slotOf(id) { return this.state.slots.findIndex(x => x?.id === id); }

  // ---------- both sides: what arrives ----------
  // host: from = the guest's id; guest: from is ignored (everything comes from the host)
  receive(from, m) {
    if (!m || typeof m.t !== 'string') return;
    if (this.host) return this.fromGuest(from, m);
    this.heard = this.now();
    switch (m.t) {
      case 'welcome': this.id = m.id; break;
      case 'reject': this.close(m.reason); break;
      case 'lobby': if (!this.state || m.state.rev > this.state.rev) { const was = this.phase; this.state = m.state; if (was !== m.state.phase) this.emit({ type: 'phase', phase: m.state.phase, ...m.state.phase === 'match' ? { header: this.header } : {} }); this.hooks.change?.(this); } break;
      case 'start': { this.header = m.header; let hash; try { hash = this.verify(m.header); } catch (e) { hash = 'error: ' + e.message; }
        this.toHost?.({ t: 'synced', hash }); break; }
      case 'chat': this.emit({ type: 'chat', from: m.from, name: m.name, text: m.text }); break;
      case 'ping': this.toHost?.({ t: 'pong', at: m.at }); break;
      case 'bye': this.close(m.reason || 'the host closed the lobby'); break;
      case 'in': case 'sum': if (this.phase === 'match') this.hooks.match?.(m); break;
      case 'watch': if ((this.phase === 'match' || this.phase === 'post') && !this.me) this.hooks.match?.(m); break; // a spectator's (NetWatch); the last frames arrive just after the end
    }
  }
  fromGuest(id, m) {
    const p = this.peers.get(id); if (!p) return;
    p.heard = this.now();
    if (m.t === 'hello') return this.hello(id, p, m);
    if (!p.hello) return; // nothing else before a hello
    if (m.t === 'pong') p.rtt = Math.max(0, this.now() - m.at);
    else this.request(id, m);
  }
  // a player's request, the host's own included (id 'h')
  request(id, m) {
    const s = this.state, i = this.slotOf(id);
    switch (m.t) {
      case 'pick': if (i >= 0 && s.phase === 'lobby') { s.slots[i].char = lobbyClip(m.char, LOBBY.char); s.slots[i].ready = false;
        if (m.def && typeof m.def === 'object') this.defs[id] = m.def; else delete this.defs[id]; this.broadcast(); } break;
      case 'ready': if (i >= 0 && s.phase === 'lobby' && (!m.on || s.slots[i].char)) { s.slots[i].ready = !!m.on; this.broadcast(); } break;
      case 'chat': this.relayChat(id, m.text); break;
      case 'synced': this.synced(id, m.hash); break;
      case 'leave': this.unlink(id, 'left'); break;
      case 'in': case 'sum': if (s.phase === 'match' && i >= 0) this.hooks.match?.(m); break; // the match's own (src/net/netmatch.js)
    }
  }
  hello(id, p, m) {
    const s = this.state, no = reason => { p.send({ t: 'reject', reason }); this.peers.delete(id); };
    if (p.hello) return;
    if (m.proto !== NET_PROTO) return no(`lobby protocol v${m.proto}, the host runs v${NET_PROTO}: both reload the page`);
    if (m.engine !== this.engine) return no(`engine v${m.engine}, the host runs v${this.engine}: both reload the page`);
    const who = { id, name: this.freeName(lobbyClip(m.name, LOBBY.name) || 'guest') }, free = s.slots.indexOf(null);
    if (m.want !== 'watch' && free >= 0 && s.phase === 'lobby') s.slots[free] = { ...who, char: null, ready: false, rtt: 0 };
    else if (s.watch.length < this.watchers) s.watch.push(who);
    else return no('the lobby is full');
    p.hello = true;
    p.send({ t: 'welcome', id });
    // mid-match: the match header first, so the snapshot that follows starts its spectator's match; then the fight so far
    const late = s.phase === 'match' && this.header;
    if (late) p.send({ t: 'start', header: this.header });
    this.emit({ type: 'joined', id, name: who.name });
    this.broadcast();
    if (late) this.hooks.catchup?.(id);
  }
  // two players called the same get told apart: player, player 2, player 3…
  freeName(name) {
    const taken = new Set([...this.state.slots, ...this.state.watch].filter(Boolean).map(x => x.name));
    let n = name;
    for (let i = 2; taken.has(n); i++) n = name + ' ' + i;
    return n;
  }
  relayChat(id, text) {
    text = lobbyClip(text, LOBBY.chat); if (!text) return;
    const m = { t: 'chat', from: id, name: this.nameOf(id), text };
    for (const p of this.peers.values()) if (p.hello) p.send(m);
    this.emit({ type: 'chat', from: id, name: m.name, text });
  }

  // ---------- both sides: what we do (a guest's goes to the host as a request; the host's applies at once) ----------
  pick(char, def = null) { if (this.host) this.request('h', { t: 'pick', char, def }); else this.toHost?.({ t: 'pick', char, def }); }
  ready(on = true) { if (this.host) this.request('h', { t: 'ready', on }); else this.toHost?.({ t: 'ready', on }); }
  chat(text) { if (this.host) this.relayChat('h', text); else this.toHost?.({ t: 'chat', text }); }
  // a guest's hello, once its link is open: want 'play' (a free slot, else watch) or 'watch'
  join(want = 'play') { this.want = want; this.helloAt = this.now(); this.toHost?.({ t: 'hello', proto: NET_PROTO, engine: this.engine, name: this.name, want }); }
  leave() { if (this.host) { for (const p of this.peers.values()) p.send({ t: 'bye', reason: 'the host closed the lobby' }); this.peers.clear(); } else this.toHost?.({ t: 'leave' }); this.close('you left'); }
  close(why) { if (this.phase === 'closed') return; this.state = { ...(this.state || { rev: 0, slots: [], watch: [] }), phase: 'closed', error: why }; this.emit({ type: 'phase', phase: 'closed', why }); this.hooks.change?.(this); }

  // ---------- host: the match ----------
  // any change to what's being played clears every ready, so nobody starts on settings they didn't see
  setScenario(scenario, over = {}) {
    const s = this.state; if (!this.host || s.phase !== 'lobby') return;
    Object.assign(s, { scenario, over: JSON.parse(JSON.stringify(over)), error: null });
    for (const sl of s.slots) if (sl) sl.ready = false;
    this.broadcast();
  }
  canStart() { const s = this.state; return this.host && s.phase === 'lobby' && s.slots.every(sl => sl?.char && sl.ready); }
  // send every guest the match; it goes ahead once each has built the same fight (synced)
  start(seed = Math.floor(Math.random() * 2 ** 31)) {
    if (!this.canStart()) return false;
    const s = this.state;
    try { this.header = (this.hooks.header || lobbyHeader)(s, seed, this.defs); }
    catch (e) { s.error = 'could not build the match: ' + e.message; this.broadcast(); return false; }
    this.hash = this.verify(this.header);
    this.waiting = new Set([...s.slots, ...s.watch].filter(x => x && x.id !== 'h').map(x => x.id));
    Object.assign(s, { phase: 'sync', error: null, result: null });
    for (const id of [...this.waiting]) this.sendTo(id, { t: 'start', header: this.header });
    this.emit({ type: 'phase', phase: 'sync' });
    this.broadcast();
    return true;
  }
  synced(id, hash) {
    if (this.state.phase !== 'sync' || !this.waiting?.has(id)) return;
    if (hash !== this.hash) return this.abort(`${this.nameOf(id)} built a different fight (hash ${hash}, host ${this.hash})`);
    this.waiting.delete(id);
    if (this.waiting.size) return;
    this.state.phase = 'match';
    this.broadcast(); // first, so a guest is in the match before any of the match's own messages reach it
    this.emit({ type: 'phase', phase: 'match', header: this.header });
  }
  abort(error) { Object.assign(this.state, { phase: 'lobby', error }); this.waiting = null; for (const sl of this.state.slots) if (sl) sl.ready = false; this.emit({ type: 'error', error }); this.broadcast(); }
  // the match is over: result is whatever the match layer reports (winner, K.O., a forfeit)
  finish(result, send = true) {
    if (!this.host || this.state.phase !== 'match') return;
    Object.assign(this.state, { phase: 'post', result });
    this.emit({ type: 'phase', phase: 'post', result });
    if (send) this.broadcast();
  }
  rematch() {
    const s = this.state; if (!this.host || s.phase !== 'post') return;
    Object.assign(s, { phase: 'lobby', result: null });
    for (const sl of s.slots) if (sl) sl.ready = false;
    this.emit({ type: 'phase', phase: 'lobby' });
    this.broadcast();
  }
  // a match message (src/net/netmatch.js) to the other player: a guest's goes to the host, the host's to the guest in the other slot
  matchSend(m) {
    if (this.phase !== 'match') return;
    if (!this.host) return this.toHost?.(m);
    const other = this.state.slots.find(sl => sl && sl.id !== 'h');
    if (other) this.sendTo(other.id, m);
  }
  // the confirmed fight, to every spectator (src/net/netmatch.js NetWatch)
  watchSend(m) {
    if (!this.host || (this.phase !== 'match' && this.phase !== 'post')) return; // (the last confirmed frames go out just after the end)
    for (const w of this.state.watch) this.sendTo(w.id, m);
  }
  verify(header) { return (this.hooks.verify || lobbyHash)(header); }

  // ---------- both sides: keepalive. Call often (every frame is fine): pings each second, drops anyone silent too long ----------
  tick() {
    const t = this.now();
    if (this.phase === 'closed') return;
    // our own page stood still for a while (a busy or backgrounded tab): what the others sent meanwhile is still queued, unread, so
    // their silence isn't theirs. Start their clocks again instead of dropping them
    if (this.lastTick && t - this.lastTick > LOBBY.timeoutMs / 2) { this.heard = t; for (const p of this.peers.values()) p.heard = t; }
    this.lastTick = t;
    // a hello with no welcome yet goes again every couple of seconds (the host ignores a second one from the same link)
    if (!this.host && !this.id && this.helloAt !== undefined && t - this.helloAt > 2000) this.join(this.want);
    if (!this.host) { if (this.state && t - this.heard > LOBBY.timeoutMs) this.close('lost the host'); return; }
    for (const [id, p] of this.peers) if (t - p.heard > LOBBY.timeoutMs) this.unlink(id, 'timed out');
    if (t - this.lastPing < LOBBY.pingMs) return;
    this.lastPing = t;
    for (const p of this.peers.values()) if (p.hello) p.send({ t: 'ping', at: t });
  }
}
function lobbyClip(v, n) { return String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n); }

// ---------- the match a lobby starts: a replay header (makeReplay with no frames yet), so a finished match saves as a replay ----------
// Both slots are human (P1 'human', P2 'human2'); the characters go as full definitions, so a guest never needs the host's roster.
function lobbyHeader(state, seed, defs = {}) {
  const base = SCENARIOS[state.scenario];
  if (!base) throw new Error(`no scenario "${state.scenario}"`);
  const chars = state.slots.map(sl => defs[sl.id] ? makeCharacter(defs[sl.id]) : CHARS[sl.char]);
  const bad = state.slots.find((sl, i) => !chars[i]);
  if (bad) throw new Error(`${bad.name} picked "${bad.char}", which the host doesn't have`);
  const w = new World({ ...base, a: 'human', b: 'human2' }, state.over, seed, chars);
  const { frames, sums, end, ...header } = makeReplay(w, state.scenario);
  return header;
}
// the fight a header builds, as a short hash: the header's own text plus the state after half a second of standing still
// (so a guest whose engine reads the same header differently is caught before the first real input, not mid-fight)
function lobbyHash(header) {
  const w = new World({ ...SCENARIOS[header.scenario], ...header.scen }, header.cfg, header.seed, header.chars.map(makeCharacter));
  w.loop = false;
  for (let i = 0; i < 30; i++) w.advance(1 / 60, NOIN, NOIN);
  let h = 2166136261; const txt = JSON.stringify(header);
  for (let i = 0; i < txt.length; i++) h = Math.imul(h ^ txt.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36) + ':' + w.stateHash();
}
