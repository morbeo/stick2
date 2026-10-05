// regression: every scripted scenario and every character pair must play out exactly as in the snapshot
// (UPDATE=1 npm test rewrites the snapshots after an intended change)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), load = require('./load');
const { run } = load();
const snap = (name, text) => {
  const f = path.join(__dirname, 'snapshots', name + '.txt');
  if (process.env.UPDATE || !fs.existsSync(f)) fs.writeFileSync(f, text);
  assert.equal(text, fs.readFileSync(f, 'utf8'));
};

// a scenario with a 'random' character slot is excluded: it picks a fresh one each time by design, so it can't be snapshotted
test('scenarios', () => snap('scenarios', run(`Object.keys(SCENARIOS).filter(n => SCENARIOS[n].a !== 'human' && !SCENARIOS[n].chars?.includes('random')).map(n => {
  const w = new World(SCENARIOS[n], {}, 7); w.loop = false;
  for (let i = 0; i < 360 && !w.done; i++) w.advance(1/60, NOIN);
  return [n.padEnd(14), 'hits', w.hits, 'blocks', w.blocks, 'hp', w.a.hp.toFixed(1), w.b.hp.toFixed(1), 'x', w.a.x.toFixed(0), w.b.x.toFixed(0)].join(' ');
}).join('\\n') + '\\n'`)));

test('characters', () => snap('characters', run(`Object.keys(CHARS).map(n => {
  const sc = { a: 'ai', b: 'ai', ax: 300, bx: 420, period: 9 };
  const w = new World(sc, {}, 7, [CHARS[n], CHARS.stick]); w.loop = false;
  for (let i = 0; i < 600 && !w.done; i++) w.advance(1/60, NOIN);
  return [n.padEnd(10), 'hits', w.hits, 'hp', w.a.hp.toFixed(1), w.b.hp.toFixed(1)].join(' ');
}).join('\\n') + '\\n'`)));
