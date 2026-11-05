// the replay store (server/replays.js): checks, the newest kept, kept across restarts in a folder
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const { Replays } = require('../replays');
const rep = n => ({ format: 'stick2-replay', scenario: 'you vs ai', chars: [], frames: Array(n).fill([1 / 60, 0]) });

test('only replay files go in; the oldest go when there are too many', () => {
  const r = new Replays({ max: 2 });
  assert.throws(() => r.add({ format: 'x' }), /not a stick2 replay/);
  const a = r.add(rep(1)), b = r.add(rep(2)), c = r.add(rep(3));
  assert.equal(r.get(a), null);
  assert.deepEqual(r.list().map(e => e.id), [c, b]);
  assert.equal(JSON.parse(r.get(c)).frames.length, 3);
  assert.equal(r.bytes(), r.get(b).length + r.get(c).length);
  assert.equal(r.get('../etc'), null);
  assert.throws(() => new Replays({ max: 0 }).add(rep(1)), /off/);
});

test('in a folder: files on disk, and the list survives a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replays-'));
  try {
    const r = new Replays({ dir, max: 1 });
    const a = r.add(rep(1)), b = r.add(rep(2));
    assert.ok(!fs.existsSync(path.join(dir, a + '.json')), 'the dropped one is deleted');
    const again = new Replays({ dir, max: 1 });
    assert.deepEqual(again.list().map(e => e.id), [b]);
    assert.equal(JSON.parse(again.get(b)).frames.length, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
