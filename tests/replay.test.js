// replay files: recorded fights must play back exactly; they are pinned to ENGINE_VERSION (src/core.js)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), load = require('./load');
const { run } = load();
const FILE = path.join(__dirname, 'fixtures', 'replays.json'), VER = run('ENGINE_VERSION');
// fights that cover the engine: you (scripted keys) vs ai with weapons, ai vs ai on the belt, ai 2v2; uneven frame times
const record = () => JSON.parse(run(`JSON.stringify([
  ['you vs ai', { weapon: 'random', weaponStart: 'held' }, [CHARS.stick, CHARS.sneeko], true],
  ['belt ai', {}, [CHARS.grumbo, CHARS.gloomo]],
  ['ai 2v2', {}, [CHARS.lumpo, CHARS.zippa]],
].map(([name, cfg, chars, human]) => {
  const w = new World(SCENARIOS[name], cfg, 5, chars), inp = i => ({ ...NOIN, right: i % 90 < 50, down: i % 70 > 60, punch: i % 23 === 0, kick: i % 37 === 0, guard: i % 140 > 125, special: i % 97 === 0 });
  w.loop = false;
  for (let i = 0; i < 600 && !w.done; i++) w.advance(i % 3 ? 1 / 60 : 1 / 50, human ? inp(i) : NOIN);
  return makeReplay(w, name);
}))`));
// play a replay file (as JSON, the way it is loaded): the first frame that comes out differently, or null
const play = r => run(`(() => { const r = ${JSON.stringify(r)}, w = replayWorld(r); w.loop = false;
  for (let i = 0; i <= r.frames.length; i++) w.advance(0, NOIN); return w.desync; })()`);
const BUMP = `the simulation changed, so replays recorded with engine v${VER} play out differently: bump ENGINE_VERSION in src/core.js, then run UPDATE=1 npm test`;

test('recorded replays play back the same fight (pinned to ENGINE_VERSION)', () => {
  const old = fs.existsSync(FILE) && JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (process.env.UPDATE || !old) {
    if (old && old[0].version === VER) for (const r of old) assert.equal(play(r), null, `"${r.scenario}": ${BUMP}`);
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(record()));
  }
  const rs = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  for (const r of rs) {
    assert.equal(r.version, VER, `the replay fixtures are from engine v${r.version}: run UPDATE=1 npm test`);
    assert.equal(play(r), null, `"${r.scenario}": ${BUMP}`);
  }
});

test('a replay file holds what the fight needs, and a changed one is caught as a desync', () => {
  const r = JSON.parse(fs.readFileSync(FILE, 'utf8'))[0];
  assert.equal(r.format, 'stick2-replay'), assert.ok(r.frames.length > 500 && r.chars.length === 2 && 'hitstop' in r.cfg && Object.keys(r.sums).length >= 9);
  const bad = { ...r, cfg: { ...r.cfg, maxSpeed: r.cfg.maxSpeed * 1.2 } };
  assert.ok(play(bad) > 0, 'other settings: out of sync');
  const tail = { ...r, frames: r.frames.map((f, i) => i === r.frames.length - 5 ? [f[0] * 1.5, f[1]] : f) };
  assert.equal(play(tail), r.frames.length, 'a change after the last checkpoint: caught by the end checksum');
});

test('a fight saved as a replay (through JSON) plays back with the same end state', () => {
  const r = JSON.parse(run(`(() => { const w = new World(SCENARIOS['you vs ai'], {}, 3, [CHARS.stick, CHARS.hadoo]); w.loop = false;
    for (let i = 0; i < 200; i++) w.advance(1 / 60, { ...NOIN, right: i % 50 < 30, punch: i % 17 === 0 });
    return JSON.stringify({ r: makeReplay(w, 'you vs ai'), end: w.stateHash() }); })()`));
  assert.equal(r.r.end, r.end), assert.equal(r.r.frames.length, 200), assert.ok(!('boxes' in r.r.cfg), 'display settings stay out');
  assert.equal(play(r.r), null);
});

test('a replay saved after a round restarts (K.O., loop) plays back in sync', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    const w = new World(SCENARIOS['you vs ai'], {}, 1, [CHARS.stick, CHARS.stick]); let resets = 0;
    for (let i = 0; i < 6000 && !(resets && w.log.length > 120); i++) { const n = w.log.length; w.advance(1 / 60, { ...NOIN, right: i % 120 < 40, punch: i % 23 === 0, kick: i % 37 === 0 }); if (w.log.length < n) resets++; }
    return [resets, makeReplay(w, 'you vs ai')];
  })())`));
  assert.ok(r[0] > 0, 'no round restart happened');
  assert.equal(play(r[1]), null);
});


test('a branch: P2 taken over at a frame (takeover), P1 fed its recorded inputs, plays back in sync from its replay file', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    const w = new World({ ...SCENARIOS['you vs ai'], takeover: { at: 90, side: 2 } }, {}, 3, [CHARS.stick, CHARS.stick]); w.loop = false;
    const p1 = i => ({ ...NOIN, right: i % 80 < 30, punch: i % 19 === 0 }), p2 = i => ({ ...NOIN, left: i % 60 < 20, kick: i % 29 === 0, guard: i % 50 > 40 });
    w.feed = (keys, i) => [p1(i), keys];
    for (let i = 0; i < 400 && !w.done; i++) w.advance(1 / 60, p2(i));
    const rep = JSON.parse(JSON.stringify(makeReplay(w, 'you vs ai'))), p = replayWorld(rep); p.loop = false;
    for (let i = 0; i <= rep.frames.length; i++) p.advance(0, NOIN);
    return [w.ctl[1], rep.frames.some(f => f.length === 4), p.desync, p.stateHash() === w.stateHash()];
  })())`));
  assert.deepEqual(r, ['human2', true, null, true]);
});
