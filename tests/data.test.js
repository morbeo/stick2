// data validation: settings, presets, scenarios, characters, moves and binds hold only values the engine can use
// each check lists every problem it finds (a readable line each), so one run shows all of them
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load();
const problems = code => JSON.parse(run(`JSON.stringify((() => { const bad = []; ${code}; return bad; })())`));

// a value fits a setting: one of its options, within min / max, or of its default's type
const FITS = `const fits = (k, v) => { const s = SPEC[k]; if (!s) return 'no such setting';
  if (s.opts) return s.opts.includes(v) ? '' : 'not one of ' + s.opts.join(' / ');
  if (typeof v !== typeof s.v) return 'a ' + typeof v + ', the setting is a ' + typeof s.v;
  if (typeof v === 'number' && (!Number.isFinite(v) || v < s.min || v > s.max)) return 'outside ' + s.min + '…' + s.max;
  return ''; };`;

test('settings: unique keys, every default within its own range or options, sane ranges', () => {
  assert.deepEqual(problems(`${FITS}
    const seen = new Set();
    for (const s of SCHEMA) if (!Array.isArray(s)) {
      if (seen.has(s.k)) bad.push(s.k + ': listed twice'); seen.add(s.k);
      if (!s.tip) bad.push(s.k + ': no tooltip');
      if (typeof s.v === 'number' && !s.opts && !(s.min < s.max && s.step > 0)) bad.push(s.k + ': range ' + s.min + '…' + s.max + ' step ' + s.step);
      const why = fits(s.k, s.v); if (why) bad.push(s.k + ' = ' + JSON.stringify(s.v) + ': ' + why);
      for (const o in s.optTips || {}) if (!s.opts?.includes(o)) bad.push(s.k + ': a tip for option ' + o + ', which it does not have');
    }`), []);
});

test('presets, power presets and scenario settings: real settings with values that fit them', () => {
  assert.deepEqual(problems(`${FITS}
    const check = (where, cfg) => { for (const [k, v] of Object.entries(cfg || {})) { const why = fits(k, v); if (why) bad.push(where + ': ' + k + ' = ' + JSON.stringify(v) + ': ' + why); } };
    for (const [n, p] of Object.entries(PRESETS)) check('preset ' + n, p);
    for (const [n, p] of Object.entries(POWER)) check('power ' + n, p);
    for (const [n, s] of Object.entries(SCENARIOS)) {
      check('scenario ' + n, s.cfg);
      for (const c of s.chars || []) if (c && !CHARS[c]) bad.push('scenario ' + n + ': no character ' + c);
    }`), []);
});

test('bones: unique ids, every parent exists, positive lengths, joint limits min < max', () => {
  assert.deepEqual(problems(`
    for (const [n, ch] of Object.entries(CHARS)) {
      const ids = ch.bones.map(b => b.id);
      ids.forEach((id, i) => { if (ids.indexOf(id) !== i) bad.push(n + ': bone ' + id + ' twice'); });
      for (const b of ch.bones) {
        if (b.parent && !ids.includes(b.parent)) bad.push(n + '.' + b.id + ': parent ' + b.parent + ' missing');
        if (!(b.len > 0)) bad.push(n + '.' + b.id + ': length ' + b.len);
        if (b.min !== undefined && !(b.min < b.max)) bad.push(n + '.' + b.id + ': limits ' + b.min + '…' + b.max);
      }
    }`), []);
});

test('moves: valid heights and hits, striking bones that exist, poses of real bones, positive durations, links to real moves', () => {
  assert.deepEqual(problems(`
    const HEIGHTS = [undefined, null, 'high', 'mid', 'low', 'shigh', 'smid'], HITS = ['stand', 'crouch', 'air'];
    for (const [n, ch] of Object.entries(CHARS)) for (const [k, m] of Object.entries(ch.moves)) {
      const at = n + '.' + k, ids = new Set([...ch.bones.map(b => b.id), 'weapon']);
      if (!HEIGHTS.includes(m.height)) bad.push(at + ': height ' + m.height);
      for (const h of m.hits || []) if (!HITS.includes(h)) bad.push(at + ': hits ' + h);
      for (const b of [m.hit].flat()) if (b && !ids.has(b)) bad.push(at + ': strikes with ' + b + ', a bone it does not have');
      for (const f of ['power', 'damage', 'stun']) if (m[f] != null && !(Number.isFinite(m[f]) && m[f] >= 0)) bad.push(at + ': ' + f + ' = ' + m[f]);
      for (const f of ['knock', 'lunge', 'launch']) if (m[f] != null && !Number.isFinite(m[f])) bad.push(at + ': ' + f + ' = ' + m[f]); // negative: backward (a fade kick, a suplex)
      if (!m.keys.length) bad.push(at + ': no keys');
      m.keys.forEach((key, i) => {
        if (!(key.d >= 0 && Number.isFinite(key.d))) bad.push(at + ' key ' + i + ': duration ' + key.d);
        for (const b in key.p || {}) if (!ids.has(b)) bad.push(at + ' key ' + i + ': poses ' + b + ', a bone it does not have');
      });
      if (!(total(m) > 0)) bad.push(at + ': lasts ' + total(m) + ' s');
      for (const [btn, to] of Object.entries(m.next || {})) if (!ch.moves[to]) bad.push(at + ': ' + btn + ' chains into ' + to + ', not a move');
      for (const f of ['throw', 'counter']) if (typeof m[f] === 'string' && !ch.moves[m[f]]) bad.push(at + ': ' + f + ' ' + m[f] + ' is not a move');
    }`), []);
});

test('stances and binds: every bound input names a move the character has; stance keys are real inputs', () => {
  assert.deepEqual(problems(`
    for (const [n, ch] of Object.entries(CHARS)) for (const s of ch.stances) {
      for (const bk of ['binds', 'binds25']) for (const [slot, mv] of Object.entries(s[bk] || {})) if (mv && !ch.moves[mv]) bad.push(n + ' ' + s.name + ' ' + bk + '.' + slot + ': ' + mv + ' is not a move');
      if (s.name !== 'main' && !s.key) bad.push(n + ' ' + s.name + ': no key switches to it');
    }`), []);
});
