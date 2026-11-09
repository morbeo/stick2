'use strict';
// ---------- bots: a server-side player that joins a room and fights with the game's own AI (src/engine/brain.js) ----------
// A bot is a guest like any other: it says hello to the host's lobby (src/net/lobby.js), picks a character, readies up, and plays
// its side of the match (src/net/netmatch.js) on the server's copy of the engine, at 60 frames a second. The host still runs the
// fight: a bot only sends its inputs. It leaves when the room closes or the host kicks it. Bots are never rated.
const engine = require('../tools/lib/engine');
const BOTS = { max: 4, levels: ['easy', 'normal', 'hard'], fps: 60, catchUp: 4 };

class Bots {
  // relay: the Relay a bot joins through; max: bots at once (0: none); now: a ms clock; auto: tick on a timer (off in the tests)
  constructor({ relay, max = BOTS.max, now = () => Date.now(), auto = true, rng = Math.random } = {}) {
    Object.assign(this, { relay, max, now, auto, rng, list: new Map(), n: 0, vm: null, timer: null });
  }
  // the engine, loaded once, with the lobby and the match on top
  load() {
    if (this.vm) return this.vm;
    const { run } = engine([...engine.ENGINE, 'lobby', 'netmatch']);
    this.vm = {
      lobby: run('o => new Lobby(o)'), match: run('o => new NetMatch(o)'), brain: run('(seed, level) => new Brain(makeRand(seed), level)'),
      chars: run('Object.keys(CHAR_DEFS).filter(n => !CHAR_DIFFS.some(d => d.name === n))'),
    };
    return this.vm;
  }
  // a bot into a room → its name. opts: { level, char } (char: a character name, else one at random)
  add(room, { level = 'normal', char = null } = {}) {
    if (this.list.size >= this.max) throw new Error(this.max ? `bots: at most ${this.max} at once on this server` : 'bots: this server has bots off (BOTS=0)');
    if (!BOTS.levels.includes(level)) throw new Error(`bots: level is one of ${BOTS.levels.join(', ')}`);
    const vm = this.load(), id = ++this.n;
    if (char && !vm.chars.includes(char)) throw new Error(`bots: no character "${char}"`);
    const bot = { id, level, char: char || vm.chars[Math.floor(this.rng() * vm.chars.length)], room: String(room || '').toUpperCase(), lobby: null, out: [], match: null, brain: null, side: 0, t0: 0, ran: 0, error: null };
    bot.client = { ip: 'bot', bot: true, send: m => this.server(bot, JSON.parse(JSON.stringify(m))) }; // (a copy, as off the wire: never the host's own objects)
    this.list.set(id, bot);
    this.relay.receive(bot.client, { t: 'join', room: bot.room, player: `bot ${bot.char}`, device: `bot:${id}` });
    if (!bot.lobby) { const why = bot.error || 'could not join'; this.drop(bot); throw new Error(why); }
    this.relay.audit?.('bot', { room: bot.room, bot: bot.client.player, level });
    if (this.auto && !this.timer) { this.timer = setInterval(() => this.tick(), 1000 / BOTS.fps); this.timer.unref?.(); }
    return bot.client.player;
  }
  // what the relay sends the bot
  server(bot, m) {
    const L = bot.lobby;
    if (m.t === 'joined') {
      bot.lobby = this.vm.lobby({ role: 'guest', name: m.player, send: x => bot.out.push(x), now: this.now,
        hooks: { change: () => this.lobbyChanged(bot), event: e => this.event(bot, e), match: x => bot.match?.receive(x) } });
      bot.lobby.join('play');
    } else if (m.t === 'msg') L?.receive(null, m.m);
    else if (m.t === 'newhost') L?.rejoin();
    else if (m.t === 'promoted') this.drop(bot); // a bot never hosts: everyone else has gone
    else if (m.t === 'error' && !L) bot.error = m.error;
    else if (m.t === 'closed' || m.t === 'error') L ? L.close(m.why || m.error) : this.drop(bot);
  }
  // in the lobby: pick, then ready (again after every match); closed: gone
  lobbyChanged(bot) {
    const L = bot.lobby, me = L.me;
    if (L.phase === 'closed') return this.drop(bot);
    if (L.phase !== 'lobby' || !me) return;
    if (me.char !== bot.char && !L.state.rules?.bans?.includes(bot.char)) { if (!bot.picked) { bot.picked = true; L.pick(bot.char); } return; }
    bot.picked = false;
    if (me.char && !me.ready) L.ready(true);
  }
  event(bot, e) {
    if (e.type !== 'phase') return;
    if (e.phase === 'match' && bot.lobby.me && e.header) {
      bot.side = Math.max(0, bot.lobby.state.slots.findIndex(s => s?.id === bot.lobby.id));
      bot.match = this.vm.match({ header: e.header, side: bot.side, send: x => bot.lobby.matchSend(x), hooks: { end: () => {} } });
      bot.brain = this.vm.brain((e.header.seed ^ 0x5bd1e995) | 0, bot.level); // its own dice: the fight's own rng stays untouched
      bot.t0 = this.now(); bot.ran = 0;
    } else if (e.phase !== 'match') bot.match = null;
  }
  // every bot's lobby keepalive and match frames, at a steady 60 a second (wall time decides how many frames are due)
  tick() {
    for (const bot of [...this.list.values()]) {
      this.flush(bot);
      bot.lobby?.tick();
      const m = bot.match; if (!m) continue;
      const due = Math.min(BOTS.catchUp, Math.floor((this.now() - bot.t0) * BOTS.fps / 1000) - bot.ran);
      for (let i = 0; i < due && bot.match === m && !m.result; i++) {
        const w = m.world, f = w.fighters[bot.side], o = w.fighters[1 - bot.side];
        m.tick(f && o ? bot.brain.input(f, o, 1 / BOTS.fps) : {});
        bot.ran++;
      }
      this.flush(bot);
      if (due < 0) bot.ran = Math.floor((this.now() - bot.t0) * BOTS.fps / 1000); // (a clock that went back)
    }
  }
  // what the bot says goes out on its tick, never from inside a message to it (as over a real connection)
  flush(bot) { for (const x of bot.out.splice(0)) if (this.list.has(bot.id)) this.relay.receive(bot.client, { t: 'msg', m: x }); }
  drop(bot) {
    if (!this.list.delete(bot.id)) return;
    this.relay.leave(bot.client, 'left'); this.relay.release(bot.client);
    if (!this.list.size && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  // a bot out by name (an admin, or the host kicking it does the same)
  remove(name) { const k = String(name || '').toLowerCase(); for (const b of this.list.values()) if (b.client.player?.toLowerCase() === k) { b.lobby?.leave(); this.drop(b); return true; } return false; }
  view() { return [...this.list.values()].map(b => ({ name: b.client.player, room: b.room, level: b.level, char: b.char, phase: b.lobby?.phase || 'joining' })); }
  close() { for (const b of [...this.list.values()]) this.drop(b); }
}
module.exports = { Bots, BOTS };
