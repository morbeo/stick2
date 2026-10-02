// the replay editor: events recorded while a replay plays, without changing the fight; seeking lands on the same state as playing there
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), load = require('./load');
const { run } = load(['core', 'rig', 'fx', 'roster', 'fighter', 'world', 'brain', 'checks', 'replay']);
const reps = fs.readFileSync(path.join(__dirname, 'fixtures', 'replays.json'), 'utf8');
run(`var REPS = ${reps};`);

test('the event recorder changes no fight: same checksums, same end state', () => {
  const r = JSON.parse(run(`JSON.stringify(REPS.map(r => {
    const play = rec => { const w = replayWorld(r); w.loop = false; let n = 0; if (rec) w.rec = () => n++;
      for (let i = 0; i <= r.frames.length; i++) w.advance(0, NOIN); return [w.desync, w.stateHash(), n]; };
    return [play(false), play(true)];
  }))`));
  for (const [plain, rec] of r) {
    assert.deepEqual(rec.slice(0, 2), plain.slice(0, 2));
    assert.equal(rec[0], null);
    assert.ok(rec[2] > 10, `only ${rec[2]} events recorded`);
  }
});

test('a reel\'s events: the same every time, in frame order, of every main type; combos span their hits', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    const ev = () => { loadReel(REPS[0]); return rp.events.map(e => [e.f, e.type, e.who, e.name, e.end ?? null]); };
    const a = ev(), b = ev(), types = [...new Set(a.map(e => e[1]))], combo = rp.events.find(e => e.kind === 'combo');
    const hitsIn = combo && rp.events.filter(e => e.kind === 'hit' && e.data.vic === combo.data.vic && e.f >= combo.f && e.f <= combo.end).length;
    return { same: JSON.stringify(a) === JSON.stringify(b), sorted: a.every((e, i) => !i || a[i - 1][0] <= e[0]), inside: a.every(e => e[0] >= 0 && e[0] < rp.N), types,
      combo: combo && [combo.name, hitsIn], n: a.length };
  })())`));
  assert.ok(r.same && r.sorted && r.inside, JSON.stringify(r));
  for (const t of ['input', 'move', 'hit', 'fall']) assert.ok(r.types.includes(t), `no ${t} events: ${r.types}`);
  assert.ok(r.combo, 'no combo');
  assert.equal(r.combo[0], `${r.combo[1]}-hit combo`);
});

test('seeking to a frame gives the state of playing the replay up to it', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    loadReel(REPS[0]);
    return [0, 1, 59, 60, 61, 247, 400, rp.N].map(n => {
      rpSeek(n); const got = rp.view.stateHash();
      const w = replayWorld(REPS[0]); w.loop = false; for (let i = 0; i < n; i++) w.advance(0, NOIN);
      return [n, got === w.stateHash()];
    });
  })())`));
  for (const [n, ok] of r) assert.ok(ok, `frame ${n}`);
});
