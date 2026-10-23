// clip capture: the rolling buffer keeps the last seconds at the set frame rate, crops to the set shape, and starts over on a new subject
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load(['clip']);
// no DOM here: canvases record what was drawn on them, the view is 1600×900, the mode films two cells side by side
run(`var drawn = [], fakeCanvas = () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage: (...a) => drawn.push(a.slice(1)) }) });
  var document = { createElement: fakeCanvas }, canvas = { width: 1600, height: 900 }, dpr = 1, ui = {}, setRich = () => {}, syncAll = () => {};
  var cells = [{ key: 'a', r: { x: 0, y: 0, w: 800, h: 900 } }, { key: 'b', r: { x: 800, y: 0, w: 800, h: 900 } }], mode = () => ({ clipRects: () => cells });
  var reset = set => { clip.frames = []; clip.pool = []; clip.key = null; clip.last = 0; clip.rec = null; clip.mx = clip.my = -1; drawn = []; ui.clip = { fmt: 'gif', secs: 5, size: 480, fps: 30, aspect: 'view', fit: 'crop', ...set }; };`);
const js = src => JSON.parse(run(`JSON.stringify((() => { ${src} })())`));

test('keeps only the last secs of frames, at most fps a second; a paused view adds nothing', () => {
  const r = js(`reset({ secs: 3, fps: 15 });
    for (let t = 0; t <= 10000; t += 1000 / 60) clipCapture(t, true); const n = clip.frames.length, span = clip.frames[n - 1].t - clip.frames[0].t;
    clipCapture(20000, false); return { n, span, after: clip.frames.length };`);
  assert.ok(r.n >= 44 && r.n <= 47, `${r.n} frames for 3 s at 15 fps`);
  assert.ok(r.span <= 3000, r.span);
  assert.equal(r.after, r.n);
});

test('films the cell under the mouse; moving to another cell starts the buffer over and recycles the canvases', () => {
  const r = js(`reset();
    clip.mx = 900; clip.my = 10; for (let t = 0; t < 1000; t += 40) clipCapture(t, true); const first = [clip.key[0], clip.frames.length];
    clip.mx = 10; for (let t = 1000; t < 1100; t += 40) clipCapture(t, true);
    return { first, key: clip.key[0], n: clip.frames.length, pooled: clip.pool.length };`);
  assert.equal(r.first[0], 'b');
  assert.equal(r.key, 'a');
  assert.equal(r.n, 3);
  assert.ok(r.pooled >= r.first[1] - r.n, JSON.stringify(r));
});

test('a recording keeps filming its own cell whatever the mouse does', () => {
  const r = js(`reset(); clip.mx = 900; clip.my = 10; clip.rec = { key: 'b', t0: 0 }; clip.mx = 10;
    for (let t = 0; t < 500; t += 40) clipCapture(t, true); return clip.key[0];`);
  assert.equal(r, 'b');
});

test('crop takes the middle of the cell at the set shape; letterbox draws all of it with bars; sizes are even', () => {
  const r = js(`reset({ aspect: '16:9' }); clip.mx = 10; clip.my = 10; clipCapture(100, true); const crop = [drawn[0], clip.key];
    reset({ aspect: '16:9', fit: 'letterbox' }); clip.mx = 10; clip.my = 10; clipCapture(100, true);
    return { crop, box: drawn[0] };`);
  const [[sx, sy, sw, sh], [, w, h]] = r.crop;
  assert.deepEqual([sx, sw], [0, 800]);
  assert.ok(Math.abs(sw / sh - 16 / 9) < 1e-9 && Math.abs(sy - (900 - sh) / 2) < 1e-9, JSON.stringify(r.crop));
  assert.ok(w % 2 === 0 && h % 2 === 0 && w === 480, `${w}×${h}`);
  assert.deepEqual(r.box.slice(0, 4), [0, 0, 800, 900]); // the whole cell, scaled into the frame
});
