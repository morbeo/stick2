// the replay editor without a page: input edits (insert, change, move, delete, cut, duplicate), the timeline window, jumps,
// and the timeline and preview drawn and clicked on a stand-in canvas; every edit leaves a reel that plays in sync
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), load = require('./load');
const { run } = load([...require('../../tools/lib/engine').ENGINE, 'replay']);
run(`var REPS = ${fs.readFileSync(path.join(__dirname, 'fixtures', 'replays.json'), 'utf8')};`);
// a canvas context that takes any call or property and counts the calls
run(`var calls = 0, fake = () => new Proxy(function () {}, {
  get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k in t ? t[k] : (t[k] = new Proxy(function () {}, { apply: () => (calls++, fake()), get: (_, j) => j === Symbol.toPrimitive ? () => 0 : fake()[j] })),
  set: (t, k, v) => (t[k] = v, true), apply: () => fake() });
var snapshot = () => {}, syncAll = () => {}, panels = () => {}, cursor = () => {}, clear = () => {}, text = () => {}, stageOpen = () => null, drawCell = () => {}, glyph = () => {}, METER_COLS = { active: '#c00' };
var app = { paused: true }, ctx = fake(), canvas = { width: 1200, height: 700, dataset: {} }, dpr = 1;`);

const inSync = () => run(`(() => { const w = replayWorld(reelFile()); w.loop = false; for (let i = 0; i <= rp.N; i++) w.advance(0, NOIN); return w.desync; })()`);

test('input edits: insert, change, move, delete, cut and duplicate each change the frames and keep the reel in sync', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    loadReel(REPS[0]); const n0 = rp.frames.length, out = {};
    const pick = kind => { const e = rp.events.find(e => e.type === 'input' && e.kind === kind && !e.cmp); rp.sel = new Set(e ? [e.i] : []); return e; };
    rpSeek(30); reelEdit(() => insertInput('P')); out.insert = rp.frames[30][1].P;
    reelEdit(() => insertInput(Object.keys(HELD_NAMES)[0]));
    const press = pick('press'); reelEdit(() => changeInputs('K')); out.changed = rp.frames[press.f][1].K;
    pick('held'); reelEdit(() => shiftInputs(3, 'end')); pick('held'); reelEdit(() => shiftInputs(-2, 'start'));
    pick('press'); reelEdit(() => deleteInputs());
    out.none = [(rp.sel = new Set(), deleteInputs()), changeInputs('P'), shiftInputs(1), cutSpan(), dupSpan(), selSpan()];
    rp.reel.rep.marks = [{ f: 5, name: 'a' }, { f: rp.N - 5, name: 'b' }];
    pick('press'); const s = selSpan(); reelEdit(() => dupSpan()); out.dup = rp.frames.length - n0;
    pick('press'); zoomToSel(); out.zoom = rp.v[1] - rp.v[0] < rpEnd();
    reelEdit(() => cutSpan()); out.cut = rp.frames.length - n0; out.span = s[1] - s[0];
    return out;
  })())`));
  assert.ok(r.insert && r.changed, JSON.stringify(r));
  assert.deepEqual(r.none, [null, null, null, null, null, null]);
  assert.equal(r.dup, r.span);
  assert.equal(r.cut, 0);
  assert.ok(r.zoom);
  assert.equal(inSync(), null);
});

test('picking events: a click picks one, ⌘ toggles, ⇧ takes the range', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    loadReel(REPS[0]); const list = shownEvents(), [a, b, c] = [list[0], list[3], list[5]];
    pickEvent(a, {}); const one = [...rp.sel];
    pickEvent(c, { shiftKey: true }); const range = rp.sel.size;
    pickEvent(b, { metaKey: true }); const off = rp.sel.has(b.i); pickEvent(b, { ctrlKey: true });
    return { one, a: a.i, range, off, back: rp.sel.has(b.i), text: evText(a).length > 0 };
  })())`));
  assert.deepEqual(r.one, [r.a]);
  assert.equal(r.range, 6);
  assert.equal(r.off, false);
  assert.ok(r.back && r.text);
});

test('the timeline window: at least a fifth of a second, inside the fight; zoom, follow, jumps between events and bookmarks', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    loadReel(REPS[0]); const end = rpEnd();
    rpView(1, 1.05); const small = rp.v.slice(); rpView(-5, end + 9); const whole = rp.v.slice();
    rpZoom(0.5, end / 2); const zoomed = rp.v[1] - rp.v[0];
    rpView(0, 0.5); rpSeek(rp.N - 1); rpFollow(); const followed = rp.v[1] >= rp.T[rp.n];
    rpSeek(0); rpJump(1); const next = rp.n; rpJump(-1); const back = rp.n;
    rp.reel.rep.marks = [{ f: 40, name: 'm' }]; rebuildEvents(); rpJump(1, true); const mark = rp.n; rpJump(1, true);
    const frames = [frameAt(0), frameAt(rp.T[10]), nearFrame(rp.T[10] + 0.001), nearFrame(rp.T[11] - 0.001)];
    return { small, whole, end, zoomed, followed, next, back, mark, after: rp.n, frames };
  })())`));
  assert.ok(Math.abs(r.small[1] - r.small[0] - 0.2) < 1e-9 && r.small[0] === 1, JSON.stringify(r.small));
  assert.deepEqual(r.whole, [0, r.end]);
  assert.ok(Math.abs(r.zoomed - r.end / 2) < 1e-9);
  assert.ok(r.followed);
  assert.ok(r.next > 0);
  assert.equal(r.back, 0);
  assert.equal(r.mark, 40);
  assert.equal(r.after, 40);
  assert.deepEqual(r.frames, [0, 10, 10, 11]);
});

test('the timeline and preview draw, and the mouse and wheel pick, scrub, select and zoom on it', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    rp.reel = null; rpRender(); const none = [rpMouse('down', 0, 0, {}), rpWheel(10, {})];
    loadReel(REPS[0]); rp.reel.rep.marks = [{ f: 40, name: 'm' }]; rebuildEvents(); rpSeek(60);
    calls = 0; rpRender(); drawRpTimeline(); const drawn = calls;
    rp.fold.add(Object.keys(rp.lanes)[0]); drawRpTimeline(); rp.fold.clear();
    const L = rpLayout(), x = tToX(L, rp.T[60]), moves = [];
    for (const row of L.rows) {
      const y = row.y + row.h / 2;
      for (const type of ['move', 'down', 'move', 'up']) { rpMouse(type, x + (type === 'move' ? 20 : 0), y, {}); moves.push(rp.n); }
      rpMouse('down', L.tl.x + 4, y, {}); rpMouse('up', L.tl.x + 4, y, {});
    }
    rpMouse('down', x, L.mini.y + 2, {}); rpMouse('move', x + 50, L.mini.y + 2, {}); rpMouse('up', x + 50, L.mini.y + 2, {});
    rpMouse('down', x, L.ruler + 4, {}); rpMouse('move', x + 30, L.ruler + 4, {}); rpMouse('up', x + 30, L.ruler + 4, {});
    rp.my = L.tl.y + 30; rp.mx = x; const before = rp.v[1] - rp.v[0];
    rpWheel(-200, {}); const zoomed = rp.v[1] - rp.v[0]; rpWheel(50, { shiftKey: true }); rpWheel(0, { deltaX: 30 });
    rp.my = 0; const above = rpWheel(10, {});
    return { none, drawn, scrubbed: moves.some(n => n !== 60), zoomed: zoomed < before, above, step: rulerStep(L) > 0 };
  })())`));
  assert.equal(r.none[1], false);
  assert.ok(r.drawn > 200, `only ${r.drawn} canvas calls`);
  assert.ok(r.scrubbed && r.zoomed && r.step);
  assert.equal(r.above, false);
});
