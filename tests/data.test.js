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
      if (m.reach != null && !(Number.isFinite(m.reach) && m.reach >= 0)) bad.push(at + ': reach ' + m.reach);
      if (m.range != null && !(Number.isFinite(m.range) && m.range > 0)) bad.push(at + ': range ' + m.range + ' (the setup distance must be positive)');
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

test('character stats and gait vars: unique keys, a tooltip, sane ranges — the fields the stats panel, radar graph and grid tab all read from', () => {
  assert.deepEqual(problems(`
    for (const [table, list] of [['CHAR_STATS', CHAR_STATS], ['GAIT_VARS', GAIT_VARS]]) {
      const seen = new Set();
      for (const s of list) {
        if (seen.has(s.k)) bad.push(table + '.' + s.k + ': listed twice'); seen.add(s.k);
        if (!s.tip) bad.push(table + '.' + s.k + ': no tooltip');
        if (!s.opts && !(s.min < s.max && s.step > 0)) bad.push(table + '.' + s.k + ': range ' + s.min + '…' + s.max + ' step ' + s.step);
        for (const o in s.optTips || {}) if (!s.opts?.includes(o)) bad.push(table + '.' + s.k + ': a tip for option ' + o + ', which it does not have');
      }
    }`), []);
});

// MOVE_PROPS/MOVE_FLAGS live in src/editor.js (a DOM-dependent UI file), not the headless engine list every other test
// in this file shares — loaded here on its own, isolated context so a UI-only dependency can't affect the other tests
test('move properties and flags: unique keys, a tooltip, sane ranges — the fields the move table and grid tab read from', () => {
  const { run: runEditor } = load(['core', 'rig', 'fx', 'roster', 'fighter', 'world', 'stage', 'brain', 'checks', 'events', 'editor']);
  const bad = JSON.parse(runEditor(`JSON.stringify((() => { const bad = [];
    const seen = new Set();
    for (const p of MOVE_PROPS) {
      if (seen.has(p.k)) bad.push('MOVE_PROPS.' + p.k + ': listed twice'); seen.add(p.k);
      if (!p.tip) bad.push('MOVE_PROPS.' + p.k + ': no tooltip');
      if (!(p.min < p.max && p.step > 0)) bad.push('MOVE_PROPS.' + p.k + ': range ' + p.min + '…' + p.max + ' step ' + p.step);
    }
    for (const [f, tip] of Object.entries(MOVE_FLAGS)) if (!tip) bad.push('MOVE_FLAGS.' + f + ': no tooltip');
    return bad; })())`));
  assert.deepEqual(bad, []);
});

// fromScen/toScen (src/scenarios.js, the builder's own data round-trip) must be able to recreate every built-in
// scenario, field for field — otherwise the builder silently can't reproduce something only BASE_SCENARIOS can say
test('the scenario builder can recreate every built-in scenario: fromScen/toScen round-trips every field', () => {
  const { run: runScen } = load(['core', 'rig', 'fx', 'roster', 'fighter', 'world', 'stage', 'brain', 'checks', 'events', 'scenarios']);
  const bad = JSON.parse(runScen(`JSON.stringify((() => { const bad = [];
    for (const [name, s] of Object.entries(BASE_SCENARIOS)) {
      const back = toScen(fromScen(s, null));
      if ((back.aw || null) !== (s.aw || null)) bad.push(name + ': aw ' + back.aw + ' vs ' + s.aw);
      if ((back.bw || null) !== (s.bw || null)) bad.push(name + ': bw ' + back.bw + ' vs ' + s.bw);
      if (JSON.stringify(back.items || null) !== JSON.stringify(s.items || null)) bad.push(name + ': items ' + JSON.stringify(back.items) + ' vs ' + JSON.stringify(s.items));
      if (!!back.waves !== !!s.waves) bad.push(name + ': waves');
      if (!!back.survival !== !!s.survival) bad.push(name + ': survival');
    }
    return bad; })())`));
  assert.deepEqual(bad, []);
});

test('props and weapons: every shape is well-formed and draws without NaN or throwing', () => {
  assert.deepEqual(problems(`
    const check = (kind, name, shapes, vars) => {
      if (!shapes || !shapes.length) { bad.push(kind + ' ' + name + ': no shapes'); return; }
      for (const s of shapes) {
        if (!SHAPE_KINDS.includes(s.kind)) bad.push(kind + ' ' + name + ': unknown shape kind ' + s.kind);
        if (s.kind === 'polygon' && (!s.pts || s.pts.length < 3)) bad.push(kind + ' ' + name + ': polygon needs 3+ points');
      }
      let nan = false;
      const ctx = new Proxy({}, { get: () => (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) nan = true; } });
      try { drawShapes(ctx, shapes, (x, y) => [x, y], c => c || '#888', vars); } catch (e) { bad.push(kind + ' ' + name + ': threw ' + e.message); }
      if (nan) bad.push(kind + ' ' + name + ': NaN while drawing');
    };
    for (const [name, p] of Object.entries(BASE_PROPS)) { if (!p.tip) bad.push('prop ' + name + ': no tooltip'); check('prop', name, p.shapes, { sway: 1 }); }
    for (const [name, w] of Object.entries(BASE_WEAPONS)) { if (!w.tip) bad.push('weapon ' + name + ': no tooltip'); check('weapon', name, w.shapes, { len: w.len }); }
  `), []);
});

test('stances and binds: every bound input names a move the character has; stance keys are real inputs', () => {
  assert.deepEqual(problems(`
    for (const [n, ch] of Object.entries(CHARS)) for (const s of ch.stances) {
      for (const bk of ['binds', 'binds25']) for (const [slot, mv] of Object.entries(s[bk] || {})) if (mv && !ch.moves[mv]) bad.push(n + ' ' + s.name + ' ' + bk + '.' + slot + ': ' + mv + ' is not a move');
      if (s.name !== 'main' && !s.key) bad.push(n + ' ' + s.name + ': no key switches to it');
    }`), []);
});
