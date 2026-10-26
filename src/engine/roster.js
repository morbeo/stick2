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
for (const { name, base, diff } of CHAR_DIFFS) CHAR_DEFS[name] = { ...applyObj(CHAR_DEFS[base], diff), name };
const CHARS = mapVals(CHAR_DEFS, makeCharacter);
let CURRENT = 'stick';
const currentChar = () => CHARS[CURRENT];
// the source of a character file (src/engine/chars/<name>.js) for a character that is base plus diff (objdiff.js)
const charSource = (name, base, diff) => `'use strict';
// ${name}: made in the character editor, exported as code (docs/characters.md): the built-in ${base} plus these changes
charFromDiff(${JSON.stringify(name)}, ${JSON.stringify(base)}, ${JSON.stringify(diff, null, 1).replace(/\n */g, ' ')});
`;
// the built-in a character differs least from (the base for exporting it as code)
const closestBase = def => Object.keys(CHAR_DEFS).filter(n => !CHAR_DIFFS.some(d => d.name === n))
  .map(n => [n, JSON.stringify(diffObj(CHAR_DEFS[n], def) || {}).length]).sort((a, b) => a[1] - b[1])[0][0];
