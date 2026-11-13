'use strict';
// ---------- accounts: one player on several devices, with no passwords (kept in DB_PATH/accounts.json) ----------
// An account is a name and the devices linked to it (the app's device ids, only stored hashed). Its name is reserved on this server
// (anyone else gets a #tag) until it goes unused for ACCOUNTS.reserveDays. A second device links with a short code the first one
// shows (a QR code too, ACCOUNTS.linkMs to use it); a lost one comes back with the recovery code shown once when the account was
// made, or an admin relinks it. Ratings and bans follow the account, not the device.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ACCOUNTS = { reserveDays: 90, linkMs: 5 * 60000, devices: 8, codeLen: 6, alphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', max: 100000 };
const sha = (salt, s) => crypto.createHash('sha256').update(salt + s).digest('hex');

class Accounts {
  constructor({ file = null, now = () => Date.now(), rng = () => crypto.randomInt(2 ** 30) / 2 ** 30 } = {}) {
    Object.assign(this, { file, now, rng, list: new Map(), links: new Map(), salt: crypto.randomBytes(16).toString('hex') });
    if (file) try {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (d.salt) this.salt = d.salt;
      for (const a of d.accounts || []) if (a && /^a[0-9a-f]{12}$/.test(a.id)) this.list.set(a.id, a);
    } catch {}
  }
  dev(device) { return device ? sha(this.salt, 'd:' + device).slice(0, 24) : null; }
  code(n) { let c = ''; for (let i = 0; i < n; i++) c += ACCOUNTS.alphabet[Math.floor(this.rng() * ACCOUNTS.alphabet.length)]; return c; }
  // the account a device is linked to, or null
  of(device) { const d = this.dev(device); if (!d) return null; for (const a of this.list.values()) if (a.devices.includes(d)) return a; return null; }
  byName(name) { const k = String(name || '').toLowerCase().replace(/#\d+$/, ''); for (const a of this.list.values()) if (a.name.toLowerCase() === k) return a; return null; }
  // is this name kept for an account other than the device's own? (unused for reserveDays: no longer)
  reserved(name, device = null) {
    const k = String(name || '').toLowerCase(); let a = null; for (const x of this.list.values()) if (x.name.toLowerCase() === k) a = x;
    return !!a && this.now() - a.last < ACCOUNTS.reserveDays * 86400e3 && a !== this.of(device);
  }
  // a new account for this device under this name → { account, recovery } (the recovery code is never stored, only its hash)
  register(device, name) {
    if (!device) throw new Error('no device id');
    if (this.of(device)) throw new Error('this device already has an account');
    if (!name || this.reserved(name)) throw new Error('that name is taken on this server');
    const recovery = `${this.code(4)}-${this.code(4)}-${this.code(4)}`;
    const a = { id: 'a' + sha(this.salt, device + this.now() + this.rng()).slice(0, 12), name, devices: [this.dev(device)], recovery: sha(this.salt, 'r:' + recovery), created: this.now(), last: this.now() };
    this.list.set(a.id, a);
    while (this.list.size > ACCOUNTS.max) { let old = null; for (const x of this.list.values()) if (!old || x.last < old.last) old = x; this.list.delete(old.id); }
    this.save();
    return { account: a, recovery };
  }
  // a short code the device's account can be linked with from another device, for linkMs
  linkCode(device) {
    const a = this.of(device); if (!a) throw new Error('this device has no account');
    for (const [c, l] of this.links) if (l.id === a.id || l.until < this.now()) this.links.delete(c);
    let c; do c = this.code(ACCOUNTS.codeLen); while (this.links.has(c));
    this.links.set(c, { id: a.id, until: this.now() + ACCOUNTS.linkMs });
    return { code: c, until: this.now() + ACCOUNTS.linkMs };
  }
  // this device joins an account: by a link code, or by the recovery code (which works any time) → the account
  claim(device, code) {
    if (!device) throw new Error('no device id');
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    let a = null;
    const l = this.links.get(c);
    if (l && l.until >= this.now()) { a = this.list.get(l.id); this.links.delete(c); }
    else if (c.length === 12) { const h = sha(this.salt, 'r:' + `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`); for (const x of this.list.values()) if (x.recovery === h) a = x; }
    if (!a) throw new Error('that code is wrong or has run out');
    return this.attach(a, device);
  }
  // an admin links a device to an account by its name
  relink(name, device) { const a = this.byName(name); if (!a) throw new Error('no such account'); return this.attach(a, device); }
  attach(a, device) {
    const other = this.of(device);
    if (other && other !== a) other.devices = other.devices.filter(d => d !== this.dev(device));
    if (!a.devices.includes(this.dev(device))) a.devices.push(this.dev(device));
    while (a.devices.length > ACCOUNTS.devices) a.devices.shift(); // the oldest link goes
    a.last = this.now(); this.save();
    return a;
  }
  // this device off its account (the account stays with its other devices)
  unlink(device) { const a = this.of(device); if (!a) return false; a.devices = a.devices.filter(d => d !== this.dev(device)); this.save(); return true; }
  seen(a) { if (a && this.now() - a.last > 3600e3) { a.last = this.now(); this.save(); } } // (saved at most hourly: it only keeps the name reserved)
  // for the admin API: no hashes
  view(a) { return a && { id: a.id, name: a.name, devices: a.devices.length, created: new Date(a.created).toISOString(), last: new Date(a.last).toISOString() }; }
  save() {
    if (!this.file) return;
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify({ salt: this.salt, accounts: [...this.list.values()] })); } catch {}
  }
}
module.exports = { Accounts, ACCOUNTS };
