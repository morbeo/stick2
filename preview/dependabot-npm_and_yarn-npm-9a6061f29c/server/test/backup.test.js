const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const B = require('../backup');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'stick2-backup-'));
const seed = d => { fs.mkdirSync(path.join(d, 'replays'), { recursive: true }); fs.writeFileSync(path.join(d, 'bans.json'), '{"bans":[]}');
  fs.writeFileSync(path.join(d, 'replays', 'index.json'), '[]'); fs.writeFileSync(path.join(d, 'replays', 'm1.json'), '{}'); fs.writeFileSync(path.join(d, 'notes.txt'), 'x'); };

test('backup: collects every .json under the folder and restores it', () => {
  const a = tmp(), b = tmp(); seed(a);
  const bk = B.backup(a);
  assert.deepEqual(Object.keys(bk.files).sort(), ['bans.json', 'replays/index.json', 'replays/m1.json']);
  assert.deepEqual(B.summary(bk).data, ['bans.json']);
  assert.equal(B.summary(bk).replays, 1);
  assert.equal(B.restore(bk, b).written.length, 3);
  assert.equal(fs.readFileSync(path.join(b, 'replays', 'm1.json'), 'utf8'), '{}');
  fs.writeFileSync(path.join(b, 'bans.json'), 'changed');
  assert.deepEqual(B.restore(bk, b).skipped.length, 3);
  assert.equal(fs.readFileSync(path.join(b, 'bans.json'), 'utf8'), 'changed');
  B.restore(bk, b, true);
  assert.equal(fs.readFileSync(path.join(b, 'bans.json'), 'utf8'), '{"bans":[]}');
});

test('backup: refuses files that are not backups or escape the folder', () => {
  assert.throws(() => B.check({}), /not a stick2 server backup/);
  assert.throws(() => B.check({ format: B.FORMAT, version: B.VERSION + 1, files: {} }), /newer/);
  for (const bad of ['../x.json', '/etc/x.json', 'a/../../x.json', 'x.txt']) assert.throws(() => B.restore({ format: B.FORMAT, version: 1, files: { [bad]: '{}' } }, tmp()), /unsafe/);
  assert.throws(() => B.check({ format: B.FORMAT, version: 1, files: { 'a.json': 1 } }), /unsafe/);
});

test('backup: the command line', () => {
  const a = tmp(), b = tmp(), out = path.join(tmp(), 'bk.json'), lines = [], log = l => lines.push(l); seed(a);
  assert.equal(B.main(['backup', '--out', out], { DB_PATH: a }, log), 0);
  assert.match(lines.pop(), /backed up 3 files \(1 replays, bans.json\)/);
  assert.equal(B.main(['list', out], {}, log), 0);
  assert.equal(JSON.parse(lines.pop()).files, 3);
  assert.equal(B.main(['restore', out, '--db', b], {}, log), 0);
  assert.match(lines.pop(), /restored 3 files/);
  assert.equal(B.main(['restore', out, '--db', b], {}, log), 0);
  assert.match(lines.pop(), /kept 3 existing/);
  assert.equal(B.main([], {}, log), 0);
  assert.equal(B.main(['nope'], {}, log), 2);
  assert.throws(() => B.main(['backup'], {}, log), /DB_PATH/);
  assert.throws(() => B.main(['restore'], { DB_PATH: b }, log), /which backup/);
  assert.throws(() => B.main(['backup', '--db', path.join(a, 'missing')], {}, log), /does not exist/);
});
