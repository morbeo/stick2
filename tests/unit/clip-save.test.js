// saving clips (src/engine/clip.js) without a page: record / stop, save the last seconds as a GIF or a WebM (the browser's
// encoder and download faked), "nothing yet" for too few frames, and the clip group's controls and settings popup
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load(['clip']);
run(require('./ui-stub').replace(/^var saveBlob = .*$/m, '')); // clip.js has its own saveBlob
run(`var now = 0, timers = [], saves = [], syncs = 0, uiSaves = 0;
  var performance = { now: () => now }, setTimeout = fn => { Promise.resolve().then(fn); }, flush = async () => { for (let i = 0; i < 20; i++) await null; };
  var px = () => ({ data: new Uint8ClampedArray(4 * 4 * 4).fill(200) }), canv = () => ({ width: 4, height: 4, captureStream: () => ({ getVideoTracks: () => [{ requestFrame() {} }] }),
    getContext: () => ({ getImageData: px, drawImage() {}, fillRect() {} }) });
  document.createElement = canv; var canvas = { width: 1600, height: 900 }, dpr = 1, ui = {}, saveUi = () => uiSaves++, syncAll = () => syncs++;
  var app = { mode: 'play' }; var URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} }; var Blob = function (parts, o) { this.type = o.type; this.n = parts.length; };
  var _h = h; h = (tag, props, ...kids) => { const e = _h(tag, props, ...kids); if (tag === 'a') e.click = () => saves.push(e.download); return e; };
  var MediaRecorder = function () { this.start = () => {}; this.stop = () => { this.ondataavailable({ data: 'chunk' }); this.onstop(); }; };
  MediaRecorder.isTypeSupported = t => t === 'video/webm';
  var cells = [{ key: 'a', r: { x: 0, y: 0, w: 800, h: 900 } }], mode = () => ({ clipRects: () => cells });
  var reset = set => { clip.frames = []; clip.pool = []; clip.key = null; clip.last = 0; clip.rec = null; clip.busy = ''; clip.mx = clip.my = 10; saves = []; ui.clip = { fmt: 'gif', secs: 5, size: 480, fps: 30, aspect: 'view', fit: 'crop', ...set }; };
  var film = (from, to) => { for (now = from; now < to; now += 40) clipCapture(now, true); };`);
const ajs = async src => JSON.parse(await run(`(async () => { ${src} })().then(r => JSON.stringify(r))`));

test('clips: too few frames says nothing yet; the last seconds save as a GIF named by mode and time', async () => {
  const r = await ajs(`reset(); saveLast(); const nothing = clip.busy; await flush(); const after = clip.busy;
    film(0, 1000); const p = saveClip(clip.frames); const twice = saveClip(clip.frames); await p; await twice;
    return { nothing, after, saves, busy: clip.busy };`);
  assert.equal(r.nothing, 'nothing yet'); assert.equal(r.after, '');
  assert.equal(r.saves.length, 1); assert.match(r.saves[0], /^stick2-play-\d{4}-\d\d-\d\d-\d{6}\.gif$/); assert.equal(r.busy, '');
});

test('clips: a recording films until pressed again or the limit, then saves a WebM through the browser encoder', async () => {
  const r = await ajs(`reset({ fmt: 'webm' }); now = 0; toggleRecord(); const rec = !!clip.rec;
    film(0, 600); toggleRecord(); for (let i = 0; i < 40; i++) await flush();
    const first = saves.slice();
    reset(); cells.length = 0; toggleRecord(); const none = clip.rec; cells.push({ key: 'a', r: { x: 0, y: 0, w: 800, h: 900 } });
    reset(); now = 0; toggleRecord(); film(0, (REC_MAX + 1) * 1000); const stopped = clip.rec;
    clip.busy = 'x'; toggleRecord(); const busy = clip.rec;
    return { rec, first, none, stopped, busy };`);
  assert.ok(r.rec); assert.equal(r.first.length, 1); assert.match(r.first[0], /\.webm$/);
  assert.equal(r.none, null, 'nothing to film: no recording'); assert.equal(r.stopped, null, 'stops itself at REC_MAX'); assert.equal(r.busy, null, 'busy: ignored');
});

test('clips: the clip group shows its state, and every setting in its popup is saved', () => {
  const r = JSON.parse(run(`JSON.stringify((() => { reset(); FAKE.regs = []; const g = clipGroup(); const [save, rec, opts] = controls(g);
    const label = save.label; clip.busy = 'GIF…'; refresh(); const busy = save.label; clip.busy = '';
    opts.click(); const segs = controls(FAKE.pop).filter(c => c.tag === 'seg'); segs.forEach(s => s.click());
    clip.rec = { key: 'a', t0: 0 }; refresh(); const on = rec.classList.contains('on'); clip.rec = null; refresh();
    return { label, busy, segs: segs.length, uiSaves, fmt: ui.clip.fmt, on, el: clip.el };
  })())`));
  assert.equal(r.label, ':videocam: 5s'); assert.equal(r.busy, ':hourglass_empty: GIF…');
  assert.equal(r.segs, 6); assert.equal(r.uiSaves, 6); assert.equal(r.fmt, 'webm'); assert.ok(r.on); assert.equal(r.el, null);
});
