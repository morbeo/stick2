'use strict';
// ---------- ratings: Glicko-2 for every verified match between two devices (verify.js), kept in DB_PATH/ratings.json ----------
// A player is a device (src/net/names.js makes its id; the file only holds it hashed), shown under the name it last played as.
// Each match is its own rating period: both sides move at once, from the ratings they had before it. Rating deviation grows
// again while a player stays away (one period a day), so a returning player moves fast. Ranked = deviation under RATING.ranked.
const fs = require('fs'), crypto = require('crypto');
const RATING = { start: 1500, rd: 350, vol: 0.06, tau: 0.5, scale: 173.7178, ranked: 150, dayMs: 86400e3, max: 100000 };

// one Glicko-2 step: a player (r, rd, vol) after games [{ r, rd, score }] (score 1 win, 0.5 draw, 0 loss)
function glicko(p, games) {
  const S = RATING.scale, mu = (p.r - 1500) / S, phi = p.rd / S, g = ph => 1 / Math.sqrt(1 + 3 * ph * ph / (Math.PI * Math.PI));
  if (!games.length) return { ...p, rd: Math.min(RATING.rd, Math.sqrt(phi * phi + p.vol * p.vol) * S) };
  const os = games.map(o => { const mj = (o.r - 1500) / S, pj = o.rd / S, gj = g(pj), E = 1 / (1 + Math.exp(-gj * (mu - mj))); return { gj, E, s: o.score }; });
  const v = 1 / os.reduce((n, o) => n + o.gj * o.gj * o.E * (1 - o.E), 0);
  const delta = v * os.reduce((n, o) => n + o.gj * (o.s - o.E), 0);
  // the new volatility (Illinois iteration, as in Glickman's paper)
  const a = Math.log(p.vol * p.vol), t2 = RATING.tau * RATING.tau;
  const f = x => { const ex = Math.exp(x), d = phi * phi + v + ex; return ex * (delta * delta - d) / (2 * d * d) - (x - a) / t2; };
  let A = a, B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * RATING.tau) < 0) k++; B = a - k * RATING.tau; }
  let fA = f(A), fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) { const C = A + (A - B) * fA / (fB - fA), fC = f(C); if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2; B = C; fB = fC; }
  const vol = Math.exp(A / 2), pre = Math.sqrt(phi * phi + vol * vol), phi2 = 1 / Math.sqrt(1 / (pre * pre) + 1 / v);
  const mu2 = mu + phi2 * phi2 * os.reduce((n, o) => n + o.gj * (o.s - o.E), 0);
  return { ...p, r: mu2 * S + 1500, rd: Math.min(RATING.rd, phi2 * S), vol };
}

class Ratings {
  constructor({ file = null, now = () => Date.now(), salt = null } = {}) {
    Object.assign(this, { file, now, players: new Map(), salt: salt || crypto.randomBytes(16).toString('hex') });
    if (file) try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); this.salt = salt || d.salt || this.salt; for (const p of d.players || []) if (p && /^[0-9a-f]{16}$/.test(p.id)) this.players.set(p.id, p); } catch {}
  }
  key(device) { return device ? crypto.createHash('sha256').update(this.salt + device).digest('hex').slice(0, 16) : null; }
  // a player as they stand now: rating deviation grown for the days away
  get(device) { return this.view(this.players.get(this.key(device))); }
  view(p) {
    if (!p) return null;
    let x = { ...p };
    for (let d = Math.floor((this.now() - p.last) / RATING.dayMs); d > 0 && x.rd < RATING.rd; d--) x = glicko(x, []);
    return { name: x.name, rating: Math.round(x.r), rd: Math.round(x.rd), games: x.games, wins: x.wins, draws: x.draws || 0, ranked: x.rd < RATING.ranked, last: new Date(x.last).toISOString() };
  }
  raw(device, name) {
    const id = this.key(device);
    const p = this.players.get(id) || { id, name, r: RATING.start, rd: RATING.rd, vol: RATING.vol, games: 0, wins: 0, draws: 0, last: this.now() };
    let x = p; for (let d = Math.floor((this.now() - p.last) / RATING.dayMs); d > 0 && x.rd < RATING.rd; d--) x = glicko(x, []);
    return { ...x, name: name || p.name };
  }
  // a verified match: a and b are { device, name }; winner 0 (a), 1 (b) or null (a draw). Returns both sides' change, or null
  record(a, b, winner) {
    if (!a?.device || !b?.device || this.key(a.device) === this.key(b.device)) return null;
    const pa = this.raw(a.device, a.name), pb = this.raw(b.device, b.name), sa = winner === 0 ? 1 : winner === 1 ? 0 : 0.5;
    const na = glicko(pa, [{ r: pb.r, rd: pb.rd, score: sa }]), nb = glicko(pb, [{ r: pa.r, rd: pa.rd, score: 1 - sa }]), t = this.now();
    const done = (p, n, s) => ({ ...n, games: p.games + 1, wins: p.wins + (s === 1), draws: (p.draws || 0) + (s === 0.5), last: t });
    this.players.set(pa.id, done(pa, na, sa)); this.players.set(pb.id, done(pb, nb, 1 - sa));
    while (this.players.size > RATING.max) { let old = null; for (const p of this.players.values()) if (!old || p.last < old.last) old = p; this.players.delete(old.id); }
    this.save();
    return [Math.round(na.r - pa.r), Math.round(nb.r - pb.r)];
  }
  // a device's rating moves to its new account (accounts.js: rated as 'acct:<id>' from then on); kept if the account has one already
  move(from, to) {
    const a = this.key(from), b = this.key(to), p = this.players.get(a);
    if (!p || a === b) return false;
    this.players.delete(a); if (!this.players.has(b)) this.players.set(b, { ...p, id: b });
    this.save(); return true;
  }
  rename(who, name) { const p = this.players.get(this.key(who)); if (p && p.name !== name) { p.name = name; this.save(); } }
  // the ranked players, best first
  board(n = 50) { return [...this.players.values()].map(p => this.view(p)).filter(p => p.ranked).sort((x, y) => y.rating - x.rating).slice(0, n); }
  byName(name) { const k = String(name || '').toLowerCase(); for (const p of this.players.values()) if (p.name.toLowerCase() === k) return this.view(p); return null; }
  save() { if (this.file) try { fs.writeFileSync(this.file, JSON.stringify({ salt: this.salt, players: [...this.players.values()] })); } catch {} }
}
module.exports = { Ratings, glicko, RATING };
