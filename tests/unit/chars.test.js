// the per-character files: src/engine/chars/index.json lists each one once, and every page loads them in that order
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const engine = require('../../tools/lib/engine');
const { rebuild, PAGES } = require('../../tools/dev/char-scripts');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(ROOT, 'src', 'engine', 'chars');

test('chars/index.json lists every character file exactly once, the kit first', () => {
  const listed = engine.CHAR_FILES.map(f => path.basename(f));
  assert.equal(listed[0], '_kit');
  assert.equal(new Set(listed).size, listed.length);
  assert.deepEqual([...listed].sort(), fs.readdirSync(DIR).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort());
});

test('each roster character file defines the character it is named after', () => {
  const { run } = engine();
  for (const f of engine.CHAR_FILES.map(f => path.basename(f)).filter(f => f !== '_kit'))
    assert.ok(run(`CHAR_DEFS[${JSON.stringify(f)}] && CHARS[${JSON.stringify(f)}]`), f);
});

test('every page loads the character files in index.json order (npm run chars:sync)', () => {
  for (const p of PAGES) assert.equal(fs.readFileSync(path.join(ROOT, p), 'utf8'), rebuild(fs.readFileSync(path.join(ROOT, p), 'utf8')), p);
  assert.equal(rebuild('<p>no roster</p>'), null);
});
