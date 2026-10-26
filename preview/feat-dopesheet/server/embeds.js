'use strict';
// ---------- short embed links: POST /api/embeds {hash} -> {id}; GET /e/<id> redirects to the game with that hash ----------
// For embed links too long to paste (a long inline replay, a big config). Kept in DB_PATH/embeds.json when there is one,
// else in memory. The same hash always gets the same id (a content hash), so posting twice stores nothing new.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const MAX_HASH = 64 * 1024;
class Embeds {
  constructor({ file = null, max = 10000 } = {}) {
    this.file = file; this.max = max; this.map = new Map();
    if (file) try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) this.map.set(k, v); } catch {}
  }
  // the id for a hash, storing it; throws on one that can't be an embed hash
  add(hash) {
    if (typeof hash !== 'string' || !hash || hash.length > MAX_HASH) throw new Error(`hash must be 1..${MAX_HASH} characters`);
    if (/[\s<>"]/.test(hash)) throw new Error('hash must be URL-encoded');
    const id = crypto.createHash('sha256').update(hash).digest('base64url').slice(0, 10);
    if (!this.map.has(id)) {
      if (this.map.size >= this.max) throw new Error('short link store is full');
      this.map.set(id, hash); this.save();
    }
    return id;
  }
  get(id) { return this.map.get(id) ?? null; }
  save() {
    if (!this.file) return;
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.map))); } catch {}
  }
}
module.exports = { Embeds, MAX_HASH };
