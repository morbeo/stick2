'use strict';
// ---------- the built-in roster: the plain stick plus a dozen fighting-game stereotypes ----------
// each character lives in its own file in src/engine/chars/ (listed in chars/index.json); this file runs after them all
// every character's super (S, meter full — see superMeter/superAt in core.js, pickRaw in fighter.js): its own hardest-hitting
// special, amplified and armored on the way in, so no new animations are needed per character
function addSuper(def) {
  const cands = Object.entries(def.moves).filter(([, m]) => m.special && m.damage && m.keys && !m.throw && !m.counter);
  if (!cands.length) return;
  const [, m] = cands.reduce((a, b) => b[1].damage > a[1].damage ? b : a);
  def.moves.super = { ...m, damage: Math.round(m.damage * 1.6), knock: Math.round(m.knock * 1.3),
    launch: m.launch ? Math.round(m.launch * 1.3) : m.launch, stun: m.stun ? +(m.stun * 1.15).toFixed(2) : m.stun,
    super: true, keys: m.keys.map((k, i) => i === 0 ? { ...k, inv: true } : k) };
  def.binds = { ...def.binds, super: 'super' }; def.binds25 = { ...def.binds25, super: 'super' };
}
for (const def of Object.values(CHAR_DEFS)) addSuper(def);
const CHARS = mapVals(CHAR_DEFS, makeCharacter);
let CURRENT = 'stick';
const currentChar = () => CHARS[CURRENT];
