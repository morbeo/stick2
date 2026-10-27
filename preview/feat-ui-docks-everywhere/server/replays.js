'use strict';
// ---------- finished matches, saved as replays (the game's own replay format): GET /api/replays lists them, /api/replays/<id> gets one ----------
// The host of a server room sends its match's replay when the fight ends (relay.js, { t: 'replay' }). Kept in DB_PATH/replays/
// (one file each, plus index.json) when there is one, else in memory; only the newest max, oldest dropped first.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const REPLAYS = { name: 24, scenario: 40 };
class Replays {
  constructor({ dir = null, max = 200, now = () => Date.now() } = {}) {
    Object.assign(this, { dir, max, now, index: [], mem: new Map() });
    if (dir) try { this.index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')).filter(e => e && /^[\w-]+$/.test(e.id)); } catch {}
  }
  // a replay file in, its id out; throws on something that isn't one
  add(replay, { room = null, players = [], result = null } = {}) {
    if (!this.max) throw new Error('replays are off');
    if (replay?.format !== 'stick2-replay' || !Array.isArray(replay.frames) || !Array.isArray(replay.chars)) throw new Error('not a stick2 replay');
    const text = JSON.stringify(replay), id = crypto.randomBytes(6).toString('base64url');
    const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, n);
    const e = { id, at: new Date(this.now()).toISOString(), room: room && clip(room, 8), players: (Array.isArray(players) ? players : []).slice(0, 2).map(p => clip(p, REPLAYS.name)),
      scenario: clip(replay.scenario, REPLAYS.scenario), frames: replay.frames.length, winner: Number.isInteger(result?.winner) ? result.winner : null, bytes: text.length };
    if (this.dir) { fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(path.join(this.dir, id + '.json'), text); } else this.mem.set(id, text);
    this.index.push(e);
    while (this.index.length > this.max) this.drop(this.index.shift().id);
    this.save();
    return id;
  }
  drop(id) { if (this.dir) try { fs.unlinkSync(path.join(this.dir, id + '.json')); } catch {} else this.mem.delete(id); }
  // the replay file's text, or null
  get(id) {
    if (!/^[\w-]{1,20}$/.test(id) || !this.index.some(e => e.id === id)) return null;
    if (!this.dir) return this.mem.get(id) ?? null;
    try { return fs.readFileSync(path.join(this.dir, id + '.json'), 'utf8'); } catch { return null; }
  }
  list() { return this.index.slice().reverse().map(({ bytes, ...e }) => e); }
  bytes() { return this.index.reduce((n, e) => n + e.bytes, 0); }
  save() { if (this.dir) try { fs.writeFileSync(path.join(this.dir, 'index.json'), JSON.stringify(this.index)); } catch {} }
}
module.exports = { Replays };
