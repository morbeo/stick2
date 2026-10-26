// the small engine and UI modules that need no page: shapes, stages and props, looks, sounds and the tracker, run against
// stand-ins for the canvas, localStorage and WebAudio (a call recorder), so each one is covered line for line
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { ENGINE } = require('../../tools/lib/engine');
const { run } = load([...ENGINE, 'sound', 'tracker']);

// a canvas context / audio node that takes any call or property and records the calls by name
run(`var calls = [], fake = () => new Proxy(function () {}, {
  get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k in t ? t[k] : (t[k] = new Proxy(function () {}, { apply: () => (calls.push(k), fake()), get: (_, j) => j === Symbol.toPrimitive ? () => 0 : fake()[j] })),
  set: (t, k, v) => (t[k] = v, true), apply: () => fake() });
var store = {}; var localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };`);

test('shapes: a new shape of each kind, its extent from the origin, and a copy that shares no points', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    const shapes = SHAPE_KINDS.map(newShape), copy = cloneShapes(shapes); copy[3].pts[0][0] = 99;
    return { kinds: shapes.map(s => s.kind), ext: shapeExtent(shapes), orig: shapes[3].pts[0][0] };
  })())`));
  assert.deepEqual(r.kinds, ['line', 'circle', 'box', 'polygon']);
  assert.ok(r.ext.minX <= -8 && r.ext.maxX >= 8 && r.ext.minY <= -20 && r.ext.maxY === 0, JSON.stringify(r.ext));
  assert.equal(r.orig, -8);
});

test('stages: every background draws on every plane', () => {
  const n = run(`calls.length = 0; for (const k in STAGES) for (const plane of ['2d', 'lanes', 'free']) STAGES[k].draw(fake(), { cfg: { plane }, groundY: 300 }); calls.length`);
  assert.ok(n > 100, `only ${n} canvas calls`);
});

test('props: save, duplicate, rename and reset, stored as they change', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    const name = duplicateProp('ball'), dup = PROPS[name].shapes !== PROPS.ball.shapes;
    renameProp(name, 'myball'); renameProp('ball', 'x'); const renamed = [!!PROPS[name], !!PROPS.myball, !!PROPS.x];
    saveProp('ball', { ...PROPS.ball, size: 99 }); const saved = JSON.parse(store['stick2.props']).ball.size;
    resetProp('ball'); resetProp('myball');
    return { name, dup, renamed, saved, ball: PROPS.ball.size, gone: !PROPS.myball, left: Object.keys(JSON.parse(store['stick2.props'])) };
  })())`));
  assert.equal(r.name, 'ball1');
  assert.ok(r.dup);
  assert.deepEqual(r.renamed, [false, true, false]);
  assert.equal(r.saved, 99);
  assert.equal(r.ball, 10);
  assert.ok(r.gone);
  assert.deepEqual(r.left, []);
});

test('looks: a tuned built-in and its reset, a copy renamed and deleted, the trail looks drawn', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    const base = FX_BUILTIN.blood.params.size;
    saveBuiltinFx('blood', { params: { size: base + 5 } }); const tuned = FX_BUILTIN.blood.params.size;
    resetBuiltinFx('blood'); const reset = FX_BUILTIN.blood.params.size;
    const copy = duplicateBuiltinLook('blood'); renameLook(copy, 'gore'); renameLook('gore', 'gore');
    const had = [!!FX_LOOKS[copy], !!FX_LOOKS.gore]; deleteLook('gore');
    const segs = [{ i: 1, w: 4, id: 'arm', parent: 'hip', a: [0, 0], b: [10, 10] }, { i: 2, w: 4, id: 'head', parent: 'hip', c: [0, -20], r: 6 }, { i: 3, w: 4, id: 'leg', parent: 'knee', a: [0, 0], b: [0, 9] }];
    const hist = [...Array(12)].map((_, j) => ({ hip: [j, 0], arm: [j * 3, 2], head: [j, -20] }));
    calls.length = 0;
    for (const k of ['motionBlur', 'afterimage', 'speedLines']) {
      FX_DRAW[k](fake(), segs, '0,0,0', 1, 0.5); FX_DRAW[k](fake(), segs, '0,0,0', 1, 0.5, null, { hist: hist.slice(0, 1), vx: 1 });
      FX_DRAW[k](fake(), segs, '0,0,0', 1, 0.5, { gap: 1 }, { hist, vx: 900, vy: 40 });
      FX_DRAW[k](fake(), segs, '0,0,0', 1, 0.5, { gap: 1 }, { hist: [{}, ...hist.map(() => ({}))], vx: 0 });
    }
    return { base, tuned, reset, had, gone: !FX_LOOKS.gore, drawn: calls.length };
  })())`));
  assert.equal(r.tuned, r.base + 5);
  assert.equal(r.reset, r.base);
  assert.deepEqual(r.had, [false, true]);
  assert.ok(r.gone);
  assert.ok(r.drawn > 20, `only ${r.drawn} canvas calls`);
});

test('sounds: muted, saved and reset, synthesized live and offline with every layer', async () => {
  run(`var ui = {}, saveUi = () => {}, navigator = { webdriver: true };
    var AudioContext = function () { const c = fake(); c.state = 'suspended'; c.currentTime = 0; c.sampleRate = 8;
      c.createBuffer = () => ({ getChannelData: () => new Float32Array(8) }); return c; };
    var OfflineAudioContext = function () { const c = new AudioContext(); c.startRendering = async () => ({ getChannelData: () => new Float32Array(4) }); return c; };`);
  const r = JSON.parse(run(`JSON.stringify((() => {
    const m0 = muted(); toggleMute(); const m1 = muted();
    calls.length = 0; for (const k in SOUNDS) playSound(k, 0.2); playSound('nope'); const played = calls.length;
    saveSound('hit', { ...SOUNDS.hit, dur: 1 }); saveSound('zap', { ...SOUNDS.bell, q: 3 }); renameSound('zap', 'zip'); renameSound('zip', 'hit');
    const saved = Object.keys(JSON.parse(store['stick2.sounds']));
    resetSound('hit'); resetSound('zip');
    snd.ctx = { get state() { throw 1; } }; playSound('hit'); snd.ctx = null; // no audio: silent
    return { m0, m1, played, saved, hit: SOUNDS.hit.dur, zip: !!SOUNDS.zip };
  })())`));
  assert.deepEqual([r.m0, r.m1], [true, false]);
  assert.ok(r.played > 50, `only ${r.played} audio calls`);
  assert.deepEqual(r.saved, ['hit', 'zip']);
  assert.equal(r.hit, 0.09);
  assert.equal(r.zip, false);
  assert.equal(await run(`renderSound({ ...SOUNDS.kick, dur: 0 })`).then(d => d.length), 4);
});

test('tracker: tracks saved, renamed, copied and deleted; playback schedules pitched steps on the audio clock', () => {
  run(`if (typeof clone !== 'function') var clone = o => JSON.parse(JSON.stringify(o));
  var timers = [], setInterval = f => (timers.push(f), timers.length), clearInterval = () => {};`);
  const r = JSON.parse(run(`JSON.stringify((() => {
    const row = newRow('kick', 4); row.cells = [0, null, 12, null];
    saveTrack('beat', { name: 'beat', bpm: 120, steps: 4, rows: [row, { sound: 'gone', cells: [0, 0, 0, 0] }] });
    const copy = duplicateTrack('beat'); renameTrack(copy, 'beat2'); renameTrack('beat2', 'beat');
    const pitched = pitchedSound(SOUNDS.kick, 12).tf0 / SOUNDS.kick.tf0, same = pitchedSound(SOUNDS.kick, 0) === SOUNDS.kick;
    const idle = curStep(myTracks.beat);
    ui.mute = false; playTrack('beat'); renameTrack('beat', 'loop');
    calls.length = 0; snd.ctx.currentTime = 1; timers.at(-1)(); const played = calls.length;
    const step = curStep(myTracks.loop), early = (snd.ctx.currentTime = 0, curStep(myTracks.loop));
    delete myTracks.loop; timers.at(-1)(); const stopped = !tracker.playing;
    saveTrack('x', myTracks.beat2); playTrack('x'); deleteTrack('beat2'); deleteTrack('x');
    return { copy, names: Object.keys(myTracks), pitched, same, idle, played, step, early, stopped, playing: tracker.playing };
  })())`));
  assert.equal(r.copy, 'beat1');
  assert.deepEqual(r.names, []);
  assert.equal(r.pitched, 2);
  assert.ok(r.same);
  assert.equal(r.idle, -1);
  assert.ok(r.played > 20, `only ${r.played} audio calls`);
  assert.equal(r.step, 3);
  assert.equal(r.early, -1);
  assert.ok(r.stopped);
  assert.equal(r.playing, false);
});
