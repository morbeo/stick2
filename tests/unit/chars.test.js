// the per-character files: src/engine/chars/index.json lists each one once, and every page loads them in that order
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const engine = require('../../tools/lib/engine');
const { rebuild, PAGES } = require('../../tools/dev/char-scripts');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(ROOT, 'src', 'engine', 'chars');

test('chars/index.json lists every character file but the base stick exactly once, the kit first', () => {
  const listed = engine.CHAR_FILES.map(f => path.basename(f));
  assert.equal(listed[0], '_kit');
  assert.equal(new Set(listed).size, listed.length);
  assert.deepEqual(['stick', ...listed].sort(), fs.readdirSync(DIR).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort());
});

test('each roster character file defines the character it is named after', () => {
  const { run } = engine();
  for (const f of ['stick', ...engine.CHAR_FILES.map(f => path.basename(f)).filter(f => f !== '_kit')])
    assert.ok(run(`CHAR_DEFS[${JSON.stringify(f)}] && CHARS[${JSON.stringify(f)}]`), f);
});

test('every page loads the character files in index.json order (npm run chars:sync)', () => {
  for (const p of PAGES) assert.equal(fs.readFileSync(path.join(ROOT, p), 'utf8'), rebuild(fs.readFileSync(path.join(ROOT, p), 'utf8')), p);
  assert.equal(rebuild('<p>no roster</p>'), null);
});

test('export as code: every character comes back from its closest built-in plus the diff in its file', () => {
  const { run } = engine();
  const out = JSON.parse(run(`JSON.stringify(Object.keys(CHAR_DEFS).map(n => {
    const def = { ...CHAR_DEFS[n], name: n + 'Copy', speed: 1.23 }, base = closestBase(def);
    const src = charSource(def.name, base, diffObj(CHAR_DEFS[base], def) || {});
    const [, name, b, diff] = src.match(/charFromDiff\\(("[^"]*"), ("[^"]*"), ([\\s\\S]*)\\);\\s*$/);
    return [n, base, JSON.stringify({ ...applyObj(CHAR_DEFS[JSON.parse(b)], JSON.parse(diff)), name: JSON.parse(name) }) === JSON.stringify(def)];
  }))`));
  for (const [n, base, same] of out) { assert.equal(base, n, `${n}'s closest base`); assert.ok(same, n); }
});

test('a character file made by charFromDiff joins the roster after the built-ins, supers and all', () => {
  const { run } = engine([...engine.ENGINE.slice(0, engine.ENGINE.indexOf('roster')), 'engine/objdiff', ...engine.CHAR_FILES]);
  run(`charFromDiff('kicko', 'hadoo', { changed: { speed: [CHAR_DEFS.hadoo.speed, 1.4] } })`);
  for (const f of ['engine/roster', ...engine.ENGINE.slice(engine.ENGINE.indexOf('roster') + 1)]) run(fs.readFileSync(engine.srcFile(f), 'utf8'));
  assert.equal(run('CHAR_DEFS.kicko.speed'), 1.4);
  assert.equal(run('CHAR_DEFS.kicko.name'), 'kicko');
  assert.ok(run('CHARS.kicko && CHAR_DEFS.kicko.moves.super === CHAR_DEFS.hadoo.moves.super || !!CHAR_DEFS.kicko.moves.super'));
});
