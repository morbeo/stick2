'use strict';
// ---------- moderation: server bans (by device id, hashed address or name), kept in DB_PATH/bans.json when there is one ----------
// A ban: { id, device?, ip?, name?, reason, by, at, until? } (until: a ms time; none = permanent). Addresses are only ever hashed
// (with a salt kept beside the bans), so the file never holds a real IP.
const fs = require('fs'), path = require('path'), crypto = require('crypto');

class Bans {
  // file: where to keep them (null: memory only); now: a ms clock (the tests pass their own)
  constructor({ file = null, now = () => Date.now() } = {}) {
    Object.assign(this, { file, now, list: [], salt: crypto.randomBytes(16).toString('hex'), n: 0 });
    if (file) try {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(d.bans)) this.list = d.bans;
      if (d.salt) this.salt = d.salt;
      this.n = Math.max(0, ...this.list.map(b => b.id || 0));
    } catch {}
  }
  hash(ip) { return ip ? crypto.createHash('sha256').update(this.salt + ip).digest('hex').slice(0, 16) : ''; }
  save() {
    if (!this.file) return;
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify({ salt: this.salt, bans: this.list }, null, 1)); } catch {}
  }
  // the bans still running (expired ones drop out)
  active() {
    const t = this.now(), before = this.list.length;
    this.list = this.list.filter(b => !b.until || b.until > t);
    if (this.list.length !== before) this.save();
    return this.list;
  }
  // the ban that covers this player, if any: { device, ip (hashed), name }
  find({ device, ip, name } = {}) {
    const n = name && String(name).toLowerCase().replace(/#\d+$/, '');
    return this.active().find(b => (b.device && b.device === device) || (b.ip && b.ip === ip) || (b.name && b.name === n)) || null;
  }
  // minutes: 0 or none = permanent
  add({ device, ip, name, reason = '', by = 'admin', minutes = 0 }) {
    if (!device && !ip && !name) throw new Error('a ban needs a device, an address or a name');
    const b = { id: ++this.n, reason: String(reason).slice(0, 200), by, at: new Date(this.now()).toISOString() };
    if (device) b.device = String(device);
    if (ip) b.ip = String(ip);
    if (name) b.name = String(name).toLowerCase().replace(/#\d+$/, '');
    if (minutes > 0) b.until = this.now() + minutes * 60000;
    this.list.push(b); this.save();
    return b;
  }
  remove(id) { const before = this.list.length; this.list = this.list.filter(b => b.id !== Number(id)); this.save(); return this.list.length !== before; }
}

module.exports = { Bans };
