'use strict';
// ---------- player names: the seeded default name generator and the name filter (the app and server/ share this file) ----------
// A device keeps a random seed (localStorage); its default name is nameGen(seed), so it stays the same on that device until a
// reroll picks a new seed. Bizarre character-style names: gogili, xamol, shpinga, kobokobo, zuga-zuga. nameClean() is the filter
// both sides run on a typed name: length and charset limits, lookalikes folded, reserved and rude words refused.
const NAMES = {
  min: 3, max: 16,
  prefix: ['mega', 'zub', 'shmo', 'ploo', 'gug', 'wob', 'snu', 'zig', 'dr', 'bo', 'flo', 'kik'],
  onset: ['g', 'x', 'shp', 'gl', 'shm', 'pf', 'tsk', 'bz', 'k', 'b', 'd', 'dr', 'fl', 'l', 'm', 'z', 'w', 'bl'],
  vowel: ['a', 'e', 'i', 'o', 'u', 'oo', 'ee', 'ai', 'ou'],
  middle: ['go', 'li', 'ro', 'ba', 'mi', 'ku', 'za', 'do'],
  suffix: ['i', 'ol', 'inga', 'ush', 'oop', 'onk', 'izzle', 'umba', 'oko', 'uff', 'ango', 'opolis', 'ster', 'bert', 'wump', 'ilda', 'ix'],
  reserved: ['admin', 'administrator', 'mod', 'moderator', 'server', 'system', 'host', 'guest', 'player', 'stick2', 'root', 'null', 'undefined'],
  // matched inside the folded name; kept short and obvious on purpose (a server can add its own with NAME_BLOCKLIST)
  rude: ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'whore', 'slut', 'dick', 'cock', 'pussy', 'penis', 'anal', 'porn'],
};
// lookalikes and leetspeak → plain letters, for the filter's comparisons only (the name keeps how it was typed)
const NAME_FOLD = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'l',
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'к': 'k', 'м': 'm', 'т': 't', 'в': 'b', 'н': 'h' };
const nameFold = s => String(s).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/./gu, c => NAME_FOLD[c] ?? c).replace(/[^a-z]/g, '');

// a small seeded PRNG (mulberry32) from a string or number seed
function nameRng(seed) {
  let a = 0;
  for (const c of String(seed)) a = Math.imul(a ^ c.charCodeAt(0), 2654435761) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// the default name for a seed: always the same for the same seed, 3-10 letters, never refused by nameClean
function nameGen(seed) {
  const r = nameRng(seed), pick = a => a[Math.floor(r() * a.length)];
  for (let tries = 0; ; tries++) {
    let w = (r() < 0.3 ? pick(NAMES.prefix) : '') + pick(NAMES.onset) + pick(NAMES.vowel);
    if (r() < 0.5) w += pick(NAMES.middle);
    w += pick(NAMES.suffix);
    w = w.replace(/([aeiou])\1\1+/g, '$1$1');
    // ~20% doubled (kobokobo), ~10% hyphen doubles (zuga-zuga), from a short core
    const d = r(), core = pick(NAMES.onset) + pick(NAMES.vowel) + (r() < 0.5 ? pick(NAMES.onset) + pick(NAMES.vowel) : '');
    if (d < 0.2) w = core + core;
    else if (d < 0.3) w = core + '-' + core;
    if (w.length >= NAMES.min && w.replace('-', '').length <= 10 && nameClean(w) === w) return w;
    if (tries > 50) return 'gogili';
  }
}
// a typed name → the name to use, or null when the filter refuses it; extra: more words to refuse (a server's own list)
function nameClean(text, extra = []) {
  const s = String(text ?? '').normalize('NFKC').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').replace(/\s+/g, ' ').trim();
  if (s.length < NAMES.min || s.length > NAMES.max) return null;
  if (!/^[\p{L}\p{N} _.-]+$/u.test(s)) return null;
  const f = nameFold(s);
  if (f.length < 2 || NAMES.reserved.includes(f)) return null;
  if ([...NAMES.rude, ...extra].some(w => w && f.includes(nameFold(w)))) return null;
  return s;
}
// a new random seed for this device (rerolls too)
const nameSeed = () => Math.random().toString(36).slice(2, 10);

if (typeof module !== 'undefined') module.exports = { NAMES, nameGen, nameClean, nameFold, nameSeed };
