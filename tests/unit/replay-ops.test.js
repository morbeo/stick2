// the replay editor's edit operations one by one, and the timeline maths (frame lookup, the view window); see replay-edit.test.js for whole-fight sync
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), load = require('./load');
const { run } = load([...require('../../tools/lib/engine').ENGINE, 'replay']);
run(`var REPS = ${fs.readFileSync(path.join(__dirname, 'fixtures', 'replays.json'), 'utf8')};`);
run('var snapshot = () => {}, syncAll = () => {}, panels = () => {};');
const js = src => JSON.parse(run(`JSON.stringify((() => { ${src} })())`));
// held frames of key k from the reel's own frames
run(`var held = k => rp.frames.flatMap((f, i) => f[1][k] ? [i] : []);`);

test('duplicate: the span plays twice, later bookmarks move along, earlier ones stay', () => {
  const r = js(`loadReel(JSON.parse(JSON.stringify(REPS[0])));
    rp.reel.rep.marks = [{ f: 5, name: 'early' }, { f: 400, name: 'late' }];
    const p = rp.events.find(e => e.kind === 'press' && e.f > 100 && e.f < 300); rp.sel = new Set([p.i]);
    const [a, b] = selSpan(), n0 = rp.frames.length, before = JSON.stringify(rp.frames.slice(a, b));
    reelEdit(dupSpan);
    return { a, b, grew: rp.frames.length - n0, twice: JSON.stringify(rp.frames.slice(b, 2 * b - a)) === before, marks: rp.reel.rep.marks.map(m => m.f) };`);
  assert.equal(r.grew, r.b - r.a);
  assert.ok(r.twice);
  assert.deepEqual(r.marks, [5, 400 + r.b - r.a]);
});

test('cut: bookmarks inside the span go, later ones move back; nothing selected cuts nothing', () => {
  const r = js(`loadReel(JSON.parse(JSON.stringify(REPS[0])));
    const p = rp.events.find(e => e.kind === 'press' && e.f > 100 && e.f < 300); rp.sel = new Set([p.i]);
    const [a, b] = selSpan(); rp.reel.rep.marks = [{ f: a, name: 'in' }, { f: b + 50, name: 'after' }];
    reelEdit(cutSpan); const marks = rp.reel.rep.marks.map(m => m.f);
    rp.sel = new Set(); const all = cutSpan();
    return { a, b, marks, all };`);
  assert.deepEqual(r.marks, [r.b + 50 - (r.b - r.a)]);
  assert.equal(r.all, null);
});

test('shift by an edge moves only that end of a held span, and clamps to the reel', () => {
  const r = js(`loadReel(JSON.parse(JSON.stringify(REPS[0])));
    const e = rp.events.find(e => e.kind === 'held' && e.end - e.f > 4 && e.f > 20); const k = e.key, a = e.f, b = e.end;
    rp.sel = new Set([e.i]); reelEdit(() => shiftInputs(3, 'end')); const end = held(k).filter(f => f >= a && f <= b + 3);
    const e2 = rp.events.find(x => x.kind === 'held' && x.key === k && x.f === a); rp.sel = new Set([e2.i]); reelEdit(() => shiftInputs(-10000, 'start'));
    return { a, b, end: [end[0], end[end.length - 1]], first: held(k)[0], none: shiftInputs(0) };`);
  assert.deepEqual(r.end, [r.a, r.b + 2]); // end is one past the last held frame
  assert.equal(r.first, 0);
  assert.equal(r.none, null);
});

test('change turns the selected presses into another key on the same frames', () => {
  const r = js(`loadReel(JSON.parse(JSON.stringify(REPS[0])));
    const ps = rp.events.filter(e => e.kind === 'press' && e.key === 'punch').slice(0, 3); rp.sel = new Set(ps.map(e => e.i));
    const fs = ps.map(e => e.f); reelEdit(() => changeInputs('kick'));
    return { fs, kick: fs.every(f => rp.frames[f][1].kick), punch: fs.some(f => rp.frames[f][1].punch), sel: [...rp.sel].map(i => rp.events[i].key) };`);
  assert.ok(r.fs.length > 0 && r.kick && !r.punch, JSON.stringify(r));
  assert.ok(r.sel.length && r.sel.every(k => k === 'kick'));
});

test('insert: a press is one frame, a held key a 12-frame span, at the playhead', () => {
  const r = js(`loadReel(JSON.parse(JSON.stringify(REPS[0]))); rpSeek(50);
    const clear = k => { for (const f of rp.frames) f[1] = { ...f[1], [k]: false }; };
    clear('special'); clear('guard'); reelEdit(() => insertInput('special')); reelEdit(() => insertInput('guard'));
    return { special: held('special'), guard: held('guard') };`);
  assert.deepEqual(r.special, [50]);
  assert.deepEqual(r.guard, Array.from({ length: 12 }, (_, i) => 50 + i));
});

test('frame lookup: frameAt is the last frame starting at or before t, nearFrame rounds to the closest', () => {
  const r = js(`loadReel(REPS[0]); const T = rp.T, f = 10, mid = (T[f] + T[f + 1]) / 2;
    return [frameAt(0), frameAt(T[f]), frameAt(mid), nearFrame(T[f] + 1e-6), nearFrame(mid + 1e-6), frameAt(1e9) === rp.N, frameAt(-1)];`);
  assert.deepEqual(r, [0, 10, 10, 10, 11, true, 0]);
});

test('the view window stays inside the reel with a minimum span; zoom keeps the point under the cursor', () => {
  const r = js(`loadReel(REPS[0]); const end = rpEnd();
    rpView(-5, 1e9); const whole = [...rp.v]; rpView(1, 1.0001); const min = rp.v[1] - rp.v[0];
    rpView(2, 4); const t = 3, k = (t - rp.v[0]) / (rp.v[1] - rp.v[0]); rpZoom(0.5, t); const k2 = (t - rp.v[0]) / (rp.v[1] - rp.v[0]);
    rpView(end + 10, end + 12);
    return { end, whole, min, span: rp.v[1] - rp.v[0], k, k2, last: rp.v[1] };`);
  assert.deepEqual(r.whole, [0, r.end]);
  assert.ok(Math.abs(r.min - 0.2) < 1e-9, r.min);
  assert.ok(Math.abs(r.span - 2) < 1e-9 && Math.abs(r.last - r.end) < 1e-9);
  assert.ok(Math.abs(r.k - r.k2) < 1e-9);
});

test('footage: slow spans set the rate inside them only, camera spans follow the picked fighter, off means none', () => {
  const r = js(`loadReel(JSON.parse(JSON.stringify(REPS[0]))); rpSeek(100);
    addSpan('slow'); addSpan('cam'); const F = foot(), s = F.spans[0]; F.spans[1].follow = 'P2'; rpSeek(s.a + 1);
    const w = rp.view, cam = shotAt(w, s.a + 1), p2 = w.fighters.filter(x => !x.hidden)[1].x;
    F.in = 20; F.out = 1e9;
    return { a: s.a, b: s.b, oneSec: rp.T[s.b] - rp.T[s.a] >= 1 - 1 / 30 || s.b === rp.N, inRate: rateAt(s.a), outRate: rateAt(s.b), offRate: rateAt(s.a, false),
      zoom: cam.zoom, follows: cam.x === p2, off: shotAt(w, s.a + 1, false), range: footRange(), N: rp.N };`);
  assert.equal(r.a, 100);
  assert.ok(r.oneSec, JSON.stringify(r));
  assert.deepEqual([r.inRate, r.outRate, r.offRate], [0.25, 1, 1]);
  assert.equal(r.zoom, 2);
  assert.ok(r.follows);
  assert.equal(r.off, null);
  assert.deepEqual(r.range, [20, r.N]);
});

test('a movie project saves and loads back the same reels and shots', () => {
  const r = js(`var app = globalThis.app || { paused: false }; globalThis.app = app;
    loadReel(JSON.parse(JSON.stringify(REPS[0]))); rp.reels.push({ rep: JSON.parse(JSON.stringify(REPS[1])), name: 'second', edits: 0 });
    rp.movie.shots.push({ reel: 1, a: 10, b: 90 }); const file = JSON.stringify(projectFile());
    rp.reels = []; rp.movie = { shots: [] }; loadProject(JSON.parse(file));
    return { file: JSON.parse(file).format, same: JSON.stringify(projectFile()) === file, n: rp.reels.length, loaded: rp.reel === rp.reels[0], paused: app.paused };`);
  assert.equal(r.file, 'stick2-project');
  assert.ok(r.same && r.loaded && r.paused);
  assert.equal(r.n, 2);
});

test('movie playback plays each shot from its own start, then the next shot, then stops', () => {
  const r = js(`globalThis.app ||= { paused: false }; mvSnapshot = () => null; // no canvas here: transitions only need a picture
    loadReel(JSON.parse(JSON.stringify(REPS[0]))); rp.reels.push({ rep: JSON.parse(JSON.stringify(REPS[1])), name: 'second', edits: 0 });
    rp.movie = { shots: [{ reel: 0, a: 30, b: 60 }, { reel: 1, a: 5, b: 20 }] };
    const at = (rep, n) => { const w = replayWorld(rep); w.loop = false; w.replaying = true; for (let i = 0; i < n; i++) { const [dt, inp, mq, inp2] = w.playback.frames[i]; w.advance(dt, inp, inp2); } return w.stateHash(); };
    setPlayMovie(true); const start = rp.mv.w.stateHash() === at(REPS[0], 30), seen = [];
    for (let i = 0; i < 2000 && !app.paused; i++) { const s = rp.mv?.shotI; mvTick(1 / 60); if (rp.mv && rp.mv.shotI !== s) seen.push([rp.mv.shotI, rp.mv.w.stateHash() === at(REPS[1], 5)]); }
    return { start, seen, paused: app.paused, done: rp.mv === null };`);
  assert.ok(r.start);
  assert.deepEqual(r.seen, [[1, true]]);
  assert.ok(r.paused && r.done);
});
