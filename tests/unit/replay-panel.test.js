// the replay editor's panels without a page (tests/unit/ui-stub.js stands in for the DOM toolkit): the toolbar, the side
// panel, the event table, footage and movie controls, export and the movie preview; every control runs and the reel stays in sync
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), load = require('./load');
const { run } = load([...require('../../tools/lib/engine').ENGINE, 'replay']);
run(require('./ui-stub'));
run(`var REPS = ${fs.readFileSync(path.join(__dirname, 'fixtures', 'replays.json'), 'utf8')};`);
// a canvas context that takes any call or property and counts the calls (as in replay-timeline.test.js)
run(`var calls = 0, fake = () => new Proxy(function () {}, {
  get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k in t ? t[k] : (t[k] = new Proxy(function () {}, { apply: () => (calls++, fake()), get: (_, j) => j === Symbol.toPrimitive ? () => 0 : fake()[j] })),
  set: (t, k, v) => (t[k] = v, true), apply: () => fake() });
var Blob = function (parts) { this.parts = parts; }, setTimeout = fn => fn();
var snapshots = 0, snapshot = () => { snapshots++; }, syncAll = () => {}, panels = () => {}, cursor = () => {}, clear = () => {}, text = () => {}, stageOpen = () => 'events',
  drawCell = () => {}, glyph = () => {}, METER_COLS = { active: '#c00' }, setMode = m => { app.mode = m; }, saveUi = () => {}, drawInputs = () => {}, drawMeter = () => {};
var app = { paused: true, loop: true }, ctx = fake(), canvas = { width: 1200, height: 700, dataset: {} }, dpr = 1, ui = {};
var lab = { mode: 'replay', cells: [] }, clip = { busy: '' }, CLIP_ASPECTS = { '16:9': 16 / 9 }, CLIP_FMTS = ['gif', 'webm'], CLIP_FPS = [10, 30], CLIP_TIPS = {};
var clipSet = () => ({ fps: 10, aspect: 'arena', fit: 'crop', fmt: 'gif' }), h2canvas = () => el('canvas'), saveClip = async frames => { FAKE.clip = frames; };
var poses = [], snapshotPose = (name, ch, pose) => poses.push(name);
var fuzzy = (q, s) => { s = s.toLowerCase(); let i = 0; for (const c of q.toLowerCase().replace(/\\s/g, '')) { i = s.indexOf(c, i) + 1; if (!i) return false; } return true; };
var copy = o => JSON.parse(JSON.stringify(o));
// a fresh editor on a copy of a recorded fight: the state the panels keep between reels put back too
var fresh = (rep = REPS[0]) => {
  Object.assign(FAKE, { pop: null, answer: undefined, pick: null, clip: null }); Object.assign(app, { paused: true, loop: true, mode: 'replay' });
  Object.assign(lab, { mode: 'replay', cells: [], branch: null }); clip.busy = '';
  loadReel(copy(rep)); rp.show = new Set(Object.keys(EVENT_TYPES)); rp.sel = new Set(); rp.hl.picked.clear();
  Object.assign(rp, { pose: {}, props: [], poseOn: false, propSel: null, footOn: false, fsel: null, filter: '', scrollTo: null, tscroll: 0, cmpView: null });
};
var bar = () => { FAKE.regs = []; return h('div', {}, rpCtx()); };
var side = () => { FAKE.regs = []; return h('div', {}, rpSide()); };
// the control whose label starts with (or is) label
var pick = (root, label) => controls(root).find(c => typeof c.label === 'string' && (c.label === label || c.label.startsWith(label)));
var tap = (c, ev) => Promise.all(c.fire('click', ev));
var inSync = () => { const w = replayWorld(reelFile()); w.loop = false; for (let i = 0; i <= rp.N; i++) w.advance(0, NOIN); return w.desync; };`);
const js = src => JSON.parse(run(`JSON.stringify((() => { ${src} })())`));
const ajs = async src => JSON.parse(await run(`(async () => { ${src} })().then(r => JSON.stringify(r))`));

test('every control in the toolbar, the side panel, the event table and their popups runs, and the reel stays in sync', async () => {
  const r = await ajs(`
    fresh(); FAKE.pick = copy(REPS[1]); FAKE.answer = 'mark';
    rp.reel.rep.marks = [{ f: 100, name: 'm' }]; rebuildEvents();
    rpSeek(120); addSpan('slow'); addSpan('cam'); addSpan('label'); addShot();
    rp.sel = new Set([rp.events.find(e => e.type === 'input' && e.kind === 'press').i]); rp.hl.picked.add(rp.moments[0].a);
    const build = () => { FAKE.regs = []; return h('div', {}, rpCtx(), rpSide(), eventTable()); };
    const errors = [], done = new Set();
    let clicked = 0, fields = 0;
    for (let i = 0; i < controls(build()).length; i++) {
      const c = controls(build())[i]; if (!c) break;
      const name = c.label || c.tip || c.tag;
      try {
        FAKE.pop = null; await tap(c); clicked++;
        const pop = FAKE.pop; if (pop) for (const p of controls(pop)) { await tap(p); clicked++; }
        lab.mode = 'replay'; build(); refresh(); // back from a branch in play, and the panels rebuilt as panels() would
      } catch (e) { errors.push(name + ': ' + e.message); }
      done.add(name);
    }
    // the typed fields: a value, Enter, Escape, then change
    for (let i = 0; i < walk(build()).length; i++) {
      const f = walk(build())[i]; if (!f || f.tag !== 'input') continue;
      try { f.value = '1.5'; f.fire('keydown', { key: 'Enter' }); f.fire('keydown', { key: 'Escape' }); f.value = '2'; f.fire('change'); f.fire('input'); fields++; }
      catch (e) { errors.push('field ' + (f.tip || f.placeholder) + ': ' + e.message); }
    }
    return { errors, clicked, fields, sync: rp.reel ? inSync() : 'no reel' };`);
  assert.deepEqual(r.errors, []);
  assert.ok(r.clicked > 100, `only ${r.clicked} controls clicked`);
  assert.ok(r.fields > 5, `only ${r.fields} fields typed in`);
  assert.equal(r.sync, null);
});

test('toolbar: in and out at the playhead and cleared, the type filters, zoom and fit, previous / next event', async () => {
  const r = await ajs(`
    fresh(); const b = () => bar(), out = {};
    rpSeek(50); await tap(pick(b(), '[ in')); rpSeek(400); await tap(pick(b(), 'out ]')); out.range = footRange();
    await tap(pick(b(), ':close:')); out.cleared = footRange();
    const types = Object.keys(EVENT_TYPES); await tap(pick(b(), ':' + EVENT_TYPES[types[0]][1] + ':')); out.hidden = !rp.show.has(types[0]);
    await tap(pick(b(), 'all')); out.all = rp.show.size; await tap(pick(b(), 'all')); out.none = rp.show.size;
    rp.show = new Set(types);
    await tap(pick(b(), ':unfold_more: fit')); out.fit = rp.v[1] - rp.v[0];
    await tap(pick(b(), ':zoom_in:')); out.zoomed = rp.v[1] - rp.v[0]; await tap(pick(b(), ':remove:')); out.unzoomed = rp.v[1] - rp.v[0];
    rpSeek(0); await tap(pick(b(), ':chevron_right:')); out.next = rp.n; await tap(pick(b(), ':chevron_left:')); out.prev = rp.n;
    await tap(pick(b(), ':save: save')); out.saved = FAKE.saved.at(-1);
    lab.mode = 'replay'; await tap(pick(b(), ':sports_kabaddi: from play')); out.notice = FAKE.notices.at(-1);
    return { ...out, N: rp.N };`);
  assert.deepEqual(r.range, [50, 400]);
  assert.deepEqual(r.cleared, [0, r.N]);
  assert.ok(r.hidden);
  assert.ok(r.all > 0 && r.none === 0, `all ${r.all}, none ${r.none}`);
  assert.ok(r.zoomed < r.fit && r.unzoomed > r.zoomed, JSON.stringify(r));
  assert.ok(r.next > 0 && r.prev <= r.next);
  assert.match(r.saved, /\.replay\.json$/);
  assert.equal(r.notice, 'No play fight yet');
});

test('a play fight taken into the replay editor, and a branch from the playhead', async () => {
  const r = await ajs(`
    lab.mode = 'play'; const w = replayWorld(copy(REPS[1])); w.loop = false; for (let i = 0; i < 200; i++) w.advance(1 / 60, NOIN);
    lab.cells = [{ w }]; rp.reel = null; app.mode = 'play';
    replayMode.enter(); const entered = !!rp.reel && rp.N > 0;
    lab.mode = 'play'; await tap(pick(bar(), ':sports_kabaddi: from play')); const taken = rp.N;
    rpSeek(60); await tap(pick(bar(), ':sports_kabaddi: P2')); const br = lab.branch && [lab.branch.n, lab.branch.side, lab.mode];
    lab.cells = []; lab.mode = 'replay'; lab.branch = null;
    return { entered, taken, br };`);
  assert.ok(r.entered);
  assert.ok(r.taken > 100);
  assert.deepEqual(r.br, [60, 2, 'play']);
});

test('side panel: footage spans set by typed seconds, resized, retuned and deleted; bookmarks added, renamed and deleted', async () => {
  const r = await ajs(`
    fresh(); rpSeek(60); addSpan('slow'); const sp = foot().spans[0], len = sp.b - sp.a, out = {};
    const row = () => walk(side()).find(e => e.className === 'bar on' && e.children.some(c => c.className === 'chip'));
    const [start, dur] = walk(row()).filter(e => e.tag === 'input');
    start.value = '2'; start.fire('keydown', { key: 'Enter' }); out.start = [sp.a, sp.b - sp.a, len, nearFrame(2)];
    dur.value = '0,5'; dur.fire('change'); out.dur = rp.T[sp.b] - rp.T[sp.a];
    dur.value = 'x'; dur.fire('keydown', { key: 'Escape' }); out.kept = dur.value;
    const rate = controls(row()).find(c => c.tag === 'seg'); rate.set(0.1); out.rate = sp.rate;
    const b0 = sp.b; await tap(pick(row(), ':add:')); out.longer = sp.b > b0; await tap(pick(row(), ':remove:')); out.shorter = sp.b === b0;
    rpSeek(sp.a + 5); await tap(pick(row(), ']')); out.end = sp.b; await tap(pick(row(), '[')); out.st = sp.a;
    await tap(pick(row(), ':my_location:')); out.went = rp.n === sp.a;
    await tap(pick(row(), 'delete')); out.gone = foot().spans.length;
    rpSeek(90); FAKE.answer = 'big hit'; await tap(pick(side(), ':add: bookmark')); out.mark = rp.reel.rep.marks.map(m => [m.f, m.name]);
    FAKE.answer = 'renamed'; await tap(pick(side(), 'rename')); out.renamed = rp.reel.rep.marks[0].name;
    rpSeek(0); await tap(pick(side(), '⚑ renamed')); out.at = rp.n;
    FAKE.answer = null; await addMark(); out.cancel = rp.reel.rep.marks.length;
    await tap(controls(side()).filter(c => c.label === 'delete').at(-1)); out.marks = rp.reel.rep.marks.length;
    return out;`);
  assert.equal(r.start[0], r.start[3], 'starts on the frame nearest 2 s');
  assert.equal(r.start[1], r.start[2], 'the span keeps its length');
  assert.ok(Math.abs(r.dur - 0.5) < 0.02, `duration ${r.dur}`);
  assert.equal(r.rate, 0.1);
  assert.ok(r.longer && r.shorter);
  assert.ok(r.went);
  assert.equal(r.gone, 0);
  assert.deepEqual(r.mark, [[90, 'big hit']]);
  assert.equal(r.renamed, 'renamed');
  assert.equal(r.at, 90);
  assert.equal(r.cancel, 1);
  assert.equal(r.marks, 0);
});

test('side panel: the now panel follows the playhead, the selection lists its events, types jump, stats per fighter', async () => {
  const r = await ajs(`
    fresh(); const s = side(), out = {};
    rpSeek(200); rp.sideNow(); out.now = walk(s).find(e => e.className === 'note' && /frame 200 of/.test(e.textContent))?.textContent;
    out.fighters = walk(s).filter(e => e.className === 'nowf').length;
    rp.sel = new Set(rp.events.filter(e => e.f > 100 && e.f < 300).slice(0, 6).map(e => e.i)); refresh();
    out.sel = walk(s).find(e => / events? · /.test(e.textContent))?.textContent;
    out.more = walk(s).some(e => /and \\d+ more/.test(e.textContent));
    await tap(pick(s, ':close:')); out.cleared = rp.sel.size;
    const t = side(), type = rp.events.find(e => e.type !== 'input').type;
    rpSeek(0); await tap(controls(t).filter(c => c.tip === 'The next ' + type + ' event')[0]); out.next = rp.n > 0;
    const f = rp.n; await tap(controls(t).filter(c => c.tip === 'The previous ' + type + ' event')[0]); out.prev = rp.n < f || f === rp.events.find(e => e.type === type).f;
    const spark = walk(t).find(e => e.className === 'spark'); spark.onclick({ offsetX: 60 }); out.spark = rp.n;
    out.stats = walk(t).filter(e => e.tag === 'table')[0].children.length;
    return out;`);
  assert.match(r.now, /frame 200 of 600/);
  assert.equal(r.fighters, 2);
  assert.match(r.sel, /^6 events · /);
  assert.ok(r.more);
  assert.equal(r.cleared, 0);
  assert.ok(r.next && r.prev);
  assert.ok(Math.abs(r.spark - 300) < 20, `spark click went to ${r.spark}`);
  assert.equal(r.stats, 9, 'a header row and 8 stats');
});

test('side panel: an old, edited or desynced reel says so; reels compared, edited and removed', async () => {
  const r = await ajs(`
    const old = copy(REPS[0]); old.version = 'v0'; fresh(old); rp.reel.edits = 2; rp.reel.desync = 30;
    const warns = walk(side()).filter(e => e.className === 'note warn').map(e => e.textContent);
    fresh(); FAKE.pick = copy(REPS[2]); await tap(pick(bar(), ':upload: open')); const opened = rp.N;
    rp.reels.push({ rep: copy(REPS[1]), name: 'other', edits: 0 });
    const tg = controls(side()).find(c => c.tip === 'Compare it with the reel being edited'); await tap(tg);
    const cmp = [!!rp.cmp, rp.cmpView, walk(side()).filter(e => e.tag === 'table').length];
    await tap(controls(bar()).find(c => c.tag === 'seg' && c.label === 'side|overlay')); const view = rp.cmpView;
    await tap(pick(side(), 'other')); const edited = rp.reel.name;
    await tap(controls(side()).filter(c => c.label === 'delete').at(-1));
    return { warns: warns.length, opened, cmp, view, edited, reels: rp.reels.length };`);
  assert.equal(r.warns, 3);
  assert.equal(r.opened, 600);
  assert.deepEqual(r.cmp, [true, 'side', 2]);
  assert.equal(r.view, 'overlay');
  assert.equal(r.edited, 'other');
  assert.equal(r.reels, 1);
});

test('event table: fuzzy filter, sort by a column both ways, a row click selects and goes there, scrolling keeps its place', () => {
  const r = js(`
    fresh(); FAKE.regs = []; const t = eventTable(), out = {};
    const count = () => walk(t).find(e => e.className === 'note').textContent;
    out.all = count();
    const q = walk(t).find(e => e.tag === 'input'); q.value = 'p2 hit'; q.fire('input'); out.filtered = count();
    q.value = ''; q.fire('input');
    const th = walk(t).filter(e => e.tag === 'th'), heads = () => th.map(e => e.textContent);
    th[3].onclick(); out.asc = heads()[3]; th[3].onclick(); out.desc = heads()[3];
    const row = walk(t).find(e => e.tag === 'tr' && e.onclick); row.onclick({}); out.sel = rp.sel.size;
    t.scrollTop = 210; t.fire('scroll'); out.tscroll = rp.tscroll;
    rp.scrollTo = rp.events.at(-1).i; refresh(); out.scrolled = t.scrollTop > 210;
    return out;`);
  const [n, total] = r.all.split(' of ').map(Number);
  assert.equal(n, total);
  assert.ok(Number(r.filtered.split(' of ')[0]) < n, r.filtered);
  assert.equal(r.asc, 'event ▲');
  assert.equal(r.desc, 'event ▼');
  assert.equal(r.sel, 1);
  assert.equal(r.tscroll, 210);
  assert.ok(r.scrolled);
});

test('footage export: the in–out range with slow motion takes longer, highlights export the picked moments, nothing picked says so', async () => {
  const r = await ajs(`
    fresh(); foot().in = 100; foot().out = 160; const out = {};
    await exportReel(); out.plain = FAKE.clip.length;
    foot().spans.push({ kind: 'slow', a: 100, b: 130, rate: 0.25 }, { kind: 'cam', a: 100, b: 160, zoom: 2, follow: 'P1' }, { kind: 'label', a: 100, b: 160, text: 'hi' });
    ui.rexp = { size: 480, hud: true, labels: true, inputs: true, meter: true }; await exportReel(); out.slow = FAKE.clip.length;
    clip.busy = 'x'; FAKE.clip = null; await exportReel(); out.busy = FAKE.clip; clip.busy = '';
    rp.hl.picked.clear(); exportHighlights(); out.none = FAKE.notices.at(-1);
    rp.hl.picked.add(rp.moments[0].a); rp.hl.slow = true; rp.hl.titles = true; await exportHighlights(); out.hl = FAKE.clip.length;
    out.n = rp.n; out.size = expSize(W / H); out.square = (CLIP_ASPECTS['1:1'] = 1, clipSet = () => ({ fps: 10, aspect: '1:1', fit: 'letterbox' }), expSize(W / H));
    clipSet = () => ({ fps: 10, aspect: 'arena', fit: 'crop', fmt: 'gif' });
    rp.expWhat = 'highlights'; exportPop({}, el('button')); const info = walk(FAKE.pop).find(e => e.className === 'note').textContent;
    return { ...out, info };`);
  assert.ok(r.plain >= 9 && r.plain <= 12, `60 frames at 10 fps: ${r.plain}`);
  assert.ok(r.slow > r.plain, `slowed ${r.slow} vs ${r.plain}`);
  assert.equal(r.busy, null);
  assert.equal(r.none, 'No highlights picked');
  assert.ok(r.hl > 0);
  assert.deepEqual(r.size, [480, 270]);
  assert.deepEqual(r.square, [480, 480]);
  assert.match(r.info, /^1 moments · /);
});

test('movie: shots added from the selection, footage or playhead; trimmed, retimed, reordered, duplicated and deleted', async () => {
  const r = await ajs(`
    fresh(); rp.movie.shots = []; const out = {};
    rpSeek(30); addShot(); foot().in = 100; foot().out = 200; addShot();
    rp.sel = new Set([rp.events.find(e => e.f > 300).i]); addShot(); rp.sel.clear(); foot().in = foot().out = null;
    out.shots = rp.movie.shots.map(s => [s.a, s.b]);
    const rows = () => walk(side()).filter(e => e.draggable), row = j => rows()[j];
    rpSeek(60); await tap(pick(row(0), '[')); rpSeek(90); await tap(pick(row(0), ']')); out.trim = [rp.movie.shots[0].a, rp.movie.shots[0].b];
    row(2).ondragstart(); row(0).ondragover({ preventDefault() {} }); row(0).ondrop({ preventDefault() {} }); out.moved = rp.movie.shots[0].a;
    row(1).ondragstart(); row(1).ondrop({ preventDefault() {} });
    await tap(pick(row(0), ':content_copy:')); out.dup = rp.movie.shots.length;
    await tap(controls(row(0)).find(c => c.label === 'delete')); out.del = rp.movie.shots.length;
    rp.reels.push({ rep: copy(REPS[1]), name: 'other', edits: 0 });
    await tap(pick(row(0), ':swap_horiz:')); await tap(pick(FAKE.pop, 'other')); out.reel = rp.movie.shots[0].reel;
    out.label = walk(row(0)).find(e => /^frame \\d+ – frame \\d+$/.test(e.textContent))?.textContent;
    await tap(pick(row(0), 'other')); out.editing = rp.reel.name;
    FAKE.pick = copy(REPS[2]); await tap(pick(side(), ':upload: import reel')); out.reels = rp.reels.length;
    return out;`);
  assert.ok(r.shots[0][0] === 30 && r.shots[0][1] > 130, 'two seconds from the playhead');
  assert.deepEqual(r.shots[1], [100, 200]);
  assert.ok(r.shots[2][0] > 300);
  assert.deepEqual(r.trim, [60, 90]);
  assert.ok(r.moved > 300, 'the dragged shot is first');
  assert.equal(r.dup, 4);
  assert.equal(r.del, 3);
  assert.equal(r.reel, 1);
  assert.ok(r.label);
  assert.equal(r.editing, 'other');
  assert.equal(r.reels, 3);
});

test('movie: transition, freeze, speed and effects popups set the shot; plain values clear it', async () => {
  const r = await ajs(`
    fresh(); rp.movie.shots = [{ reel: 0, a: 0, b: 60 }, { reel: 0, a: 100, b: 160 }]; const out = {};
    const row = () => walk(side()).filter(e => e.draggable)[1], open = async lbl => { FAKE.pop = null; await tap(pick(row(), lbl)); return FAKE.pop; };
    let p = await open(':theaters:'); controls(p).find(c => c.tag === 'seg').set('fade'); controls(p).find(c => c.tag === 'slider').set(1);
    p = await open(':theaters:'); refresh(); out.colour = walk(p).find(e => e.children?.some(c => c.textContent === 'colour')).hidden;
    out.trans = rp.movie.shots[1].trans; out.label = pick(row(), ':theaters:').label;
    controls(p).find(c => c.tag === 'seg').set('cut'); out.cut = rp.movie.shots[1].trans;
    p = await open(':pause:'); await tap(pick(p, ':pause: on')); rpSeek(120); p = await open(':pause:'); await tap(pick(p, ':my_location: here'));
    controls(p).filter(c => c.tag === 'slider').forEach(s => s.set(2)); walk(p).find(e => e.tag === 'input').oninput({ target: { value: 'wow' } });
    out.freeze = rp.movie.shots[1].freeze; p = await open(':pause:'); await tap(pick(p, ':pause: on')); out.unfrozen = rp.movie.shots[1].freeze;
    p = await open(':speed:'); controls(p).find(c => c.tag === 'slider').set(0.5); await tap(pick(p, ':fast_rewind: reversed')); out.speed = rp.movie.shots[1].speed;
    p = await open(':speed:'); controls(p).find(c => c.tag === 'slider').set(1); await tap(pick(p, ':fast_rewind: reversed')); out.normal = rp.movie.shots[1].speed;
    p = await open(':auto_awesome:'); const sl = controls(p).filter(c => c.tag === 'slider'); sl[0].set(4); sl[1].set(0.3);
    await tap(pick(p, ':blur_on: on')); await tap(pick(p, ':crop_landscape: on')); controls(p).find(c => c.tag === 'color').set('#00ff00');
    walk(p).find(e => e.tag === 'input').oninput({ target: { value: 'cap' } });
    p = await open(':auto_awesome:'); await tap(pick(p, ':timer: timed')); await tap(pick(p, ':my_location: here')); controls(p).filter(c => c.tag === 'slider').at(-1).set(3);
    out.fx = rp.movie.shots[1].fx;
    walk(p).find(e => e.tag === 'input').oninput({ target: { value: '' } }); out.nocap = 'capAt' in rp.movie.shots[1].fx;
    return out;`);
  assert.equal(r.colour, false, 'the colour row shows for a fade');
  assert.deepEqual(r.trans, { kind: 'fade', dur: 1, col: 'black', dir: 'R' });
  assert.equal(r.label, ':theaters: fade');
  assert.equal(r.cut, undefined);
  assert.deepEqual(r.freeze, { hold: 2, zoom: 2, text: 'wow', at: 20 });
  assert.equal(r.unfrozen, undefined);
  assert.deepEqual(r.speed, { rate: 0.5, reverse: true });
  assert.equal(r.normal, undefined);
  assert.deepEqual(r.fx, { shake: 4, vignette: true, tint: { col: '#00ff00', amt: 0.3 }, letterbox: true, caption: 'cap', capAt: 20, capDur: 3 });
  assert.equal(r.nocap, false);
});

test('movie preview plays every shot in turn (transition, freeze, reversed) and pauses at the end; export renders them all', async () => {
  const r = await ajs(`
    fresh(); rp.reels.push({ rep: copy(REPS[1]), name: 'b', edits: 0 });
    rp.movie.shots = [{ reel: 0, a: 0, b: 30, freeze: { hold: 0.2 }, fx: { shake: 2, vignette: true, tint: { col: '#f00', amt: 0.2 }, letterbox: true, caption: 'c', capAt: 0 } },
      { reel: 1, a: 40, b: 70, trans: { kind: 'fade', dur: 0.2 }, speed: { rate: 2 } }, { reel: 5, a: 0, b: 10 },
      { reel: 0, a: 100, b: 120, trans: { kind: 'cross', dur: 0.1 }, speed: { rate: 1, reverse: true } }];
    const out = { seen: [] };
    await tap(pick(bar(), ':movie: preview')); out.on = rp.playMovie && rp.mv.shotI;
    app.paused = false; let n = 0;
    while (!app.paused && n++ < 2000) { replayMode.tick(1 / 60); if (rp.mv && out.seen.at(-1) !== rp.mv.shotI) out.seen.push(rp.mv.shotI); if (rp.mv?.trans) out.trans = true; if (rp.mv?.freeze) out.freeze = true; if (rp.mv) out.debug = replayMode.debugWorld() === rp.mv.w; }
    out.ticks = n; replayMode.restart(); out.restart = rp.mv.shotI;
    await exportMovie(); out.frames = FAKE.clip.length;
    const empty = rp.movie.shots; rp.movie.shots = []; await exportMovie(); out.none = FAKE.notices.at(-1); rp.movie.shots = empty;
    setPlayMovie(false); rp.movie.shots = []; rp.playMovie = true; rp.mv = null; app.paused = false; replayMode.tick(1 / 60); out.emptyPause = app.paused; rp.playMovie = false;
    return out;`);
  assert.equal(r.on, 0);
  assert.deepEqual(r.seen, [0, 1, 3], 'the shot with a missing reel is skipped');
  assert.ok(r.trans && r.freeze);
  assert.ok(r.ticks < 2000, 'the preview ends');
  assert.ok(r.debug);
  assert.equal(r.restart, 0);
  assert.ok(r.frames > 6, `${r.frames} frames`);
  assert.equal(r.none, 'No shots yet');
  assert.ok(r.emptyPause);
});

test('transitions and shot effects draw every kind and edge', () => {
  const r = js(`
    const c0 = calls, g = fake(), a = el('canvas'), b = el('canvas');
    for (const kind of ['fade', 'cross', 'wipe', 'slide', 'cut']) for (const dir of ['L', 'R', 'U', 'D']) for (const p of [0.25, 0.75]) transDraw(g, 100, 60, a, b, { kind, dir }, p);
    drawFreeze(g, 100, 60, a, 2, 'held'); drawFreeze(g, 100, 60, a, 1);
    drawShotFx(g, 100, 60, null); drawShotFx(g, 100, 60, { letterbox: true, vignette: true, tint: { col: '#f00', amt: 0.5 }, caption: 'x', capAt: 10, capDur: 1 }, 5);
    return { drawn: calls - c0, shake: shakeOff(0), jitter: shakeOff(5).every(v => Math.abs(v) <= 5) };`);
  assert.ok(r.drawn > 100, `${r.drawn} calls`);
  assert.deepEqual(r.shake, [0, 0]);
  assert.ok(r.jitter);
});

test('movie project: saved with its reels and opened again; a file that is not a project says so', async () => {
  const r = await ajs(`
    fresh(); rp.movie.shots = [{ reel: 0, a: 10, b: 50 }]; const out = {};
    await tap(pick(side(), ':save: save project')); out.saved = FAKE.saved.at(-1);
    const file = JSON.stringify(projectFile()); rp.movie.shots = [];
    await tap(pick(side(), ':upload: open project')); FAKE.input.files = [{ text: async () => file }]; await FAKE.input.onchange(); out.shots = rp.movie.shots.length;
    await tap(pick(side(), ':upload: open project')); FAKE.input.files = [{ text: async () => '{"format":"x"}' }]; await FAKE.input.onchange(); out.wrong = FAKE.notices.at(-1);
    await tap(pick(side(), ':upload: open project')); FAKE.input.files = [{ text: async () => 'not json' }]; await FAKE.input.onchange(); out.bad = FAKE.notices.length;
    return out;`);
  assert.equal(r.saved, 'movie.stick2-project.json');
  assert.equal(r.shots, 1);
  assert.equal(r.wrong, 'Not a project file');
  assert.ok(r.bad > 0);
});

test('scene: pose a joint by dragging it, reset, save the pose; props added, moved, rotated, dragged and removed', async () => {
  const r = await ajs(`
    fresh(); rpSeek(100); rpRender(); const out = {}, sc = () => h('div', {}, sceneSide());
    await tap(pick(sc(), ':accessibility_new: pose')); out.poseOn = rp.poseOn;
    const f = rp.view.fighters[0], P = f.body(), id = f.ch.ids.find(i => i !== 'hip'), v = rp.view.view || { s: 1, ox: 0, oy: 0 };
    const sx = P[id][0] * v.s + v.ox, sy = P[id][1] * v.s + v.oy;
    rpMouse('down', sx, sy, {}); rpMouse('move', sx + 20, sy + 10, {}); rpMouse('up', sx + 20, sy + 10, {});
    out.posed = Object.keys(rp.pose[f.id] || {}).length;
    const name = walk(sc()).find(e => e.placeholder === 'pose name'); name.onkeydown({ key: 'Enter', target: { value: ' guard up ' } }); out.poses = poses.slice();
    name.onkeydown({ key: 'a', target: { value: 'x' } });
    await tap(pick(sc(), ':restart_alt: reset pose')); out.reset = Object.keys(rp.pose).length;
    rp.poseOn = false; await tap(pick(sc(), Object.keys(PROPS)[0])); out.props = rp.props.length;
    const row = () => walk(sc()).find(e => e.className === 'bar on');
    controls(row()).find(c => c.tag === 'num').set(321); out.x = rp.props[0].x;
    controls(row()).find(c => c.tag === 'slider').set(45); out.a = rp.props[0].a;
    rp.propSel = null; const propRow = walk(sc()).find(e => e.className === 'bar' && controls(e).some(c => c.tag === 'num'));
    await tap(pick(propRow, rp.props[0].type)); out.sel = rp.propSel;
    sceneDrawProps(fake(), { x: 0, y: 0, w: 1200, h: 500 });
    const p = rp.props[0], px = p.x * v.s + v.ox, py = (rp.view.groundY - p.lift) * v.s + v.oy;
    rpMouse('down', px, py, {}); rpMouse('move', px + 30, py, {}); rpMouse('up', px + 30, py, {}); out.dragged = rp.props[0].x !== 321;
    await tap(controls(row()).find(c => c.label === 'delete')); out.left = rp.props.length;
    rp.reel = null; out.noReel = sceneSide().length;
    return out;`);
  assert.ok(r.poseOn);
  assert.ok(r.posed > 0, 'dragging a joint poses it');
  assert.deepEqual(r.poses, ['guard up']);
  assert.equal(r.reset, 0);
  assert.equal(r.props, 1);
  assert.equal(r.x, 321);
  assert.equal(r.a, 45);
  assert.equal(r.sel, 0);
  assert.ok(r.dragged);
  assert.equal(r.left, 0);
  assert.equal(r.noReel, 0);
});

test('scene in the movie preview edits the current shot only', () => {
  const r = js(`
    fresh(); rp.movie.shots = [{ reel: 0, a: 0, b: 40 }]; setPlayMovie(true);
    const main0 = rp.props.length; sceneAddProp(Object.keys(PROPS)[0]); scenePropSet(0, { lift: 5 }, 'k'); const shot = rp.movie.shots[0].props.length, main = rp.props.length - main0;
    scenePropDelete(0); const left = rp.movie.shots[0].props.length; rp.movie.shots = []; const none = sceneTarget();
    setPlayMovie(false);
    return { shot, main, left, none };`);
  assert.deepEqual(r, { shot: 1, main: 0, left: 0, none: null });
});

test('replay mode hooks: keys, tick with footage loop and slow motion, rewind, scrub, wheel, overlay and hint', async () => {
  const r = await ajs(`
    fresh(); const out = {}, key = (a, code = '') => replayMode.key({ code }, a);
    rpSeek(100); out.mark = key('mark'); for (let i = 0; i < 5; i++) await null; out.marked = rp.reel.rep.marks.length; key('frameFwd'); out.fwd = rp.n; key('frameBack'); out.back = rp.n;
    key('nextEvent'); out.next = rp.n > 100; key('prevEvent'); key('nextMark'); key('prevMark');
    rpSeek(50); key('aim'); rpSeek(80); key('onion'); out.range = footRange();
    addSpan('slow'); key('deleteBone'); out.spans = foot().spans.length;
    rp.sel = new Set([rp.events.find(e => e.type === 'input' && e.kind === 'press').i]); out.esc = key(null, 'Escape') && rp.sel.size === 0;
    out.unknown = key('nope');
    rp.footOn = true; foot().spans.push({ kind: 'slow', a: 50, b: 80, rate: 0.5 }); rpSeek(50); app.paused = false; app.loop = true;
    let looped = false; for (let i = 0; i < 200; i++) { replayMode.tick(1 / 60); if (rp.n === 50 && i > 5) looped = true; } out.looped = looped;
    app.loop = false; rpSeek(79); replayMode.tick(0.5); out.stopped = app.paused; rp.footOn = false;
    replayMode.rewind(10); out.rewound = rp.n; replayMode.scrub(0.5); out.scrub = rp.n;
    out.wheelTop = rpWheel(100, {}); const L = rpLayout(); rp.my = L.tl.y + 10; rp.mx = L.tx + 50;
    const v0 = rp.v[1] - rp.v[0]; rpWheel(-200, {}); out.zoomed = rp.v[1] - rp.v[0] < v0; const a0 = rp.v[0]; rpWheel(50, { shiftKey: true }); out.panned = rp.v[0] !== a0;
    out.overlay = replayMode.overlay().length; out.rects = replayMode.clipRects().length; out.pv = !!replayMode.preview(); out.worlds = replayMode.worlds().length;
    out.hint = replayMode.hint().length > 20; out.open = replayMode.open.length;
    rp.reel = null; out.noReel = [key('mark'), rpWheel(1, {}), replayMode.clipRects().length, rpSide().length];
    return out;`);
  assert.ok(r.mark);
  assert.equal(r.marked, 1);
  assert.equal(r.fwd, 101);
  assert.equal(r.back, 100);
  assert.ok(r.next);
  assert.deepEqual(r.range, [50, 80]);
  assert.equal(r.spans, 0);
  assert.ok(r.esc);
  assert.equal(r.unknown, false);
  assert.ok(r.looped, 'the footage loops in to out');
  assert.ok(r.stopped);
  assert.ok(r.zoomed && r.panned);
  assert.equal(r.wheelTop, false);
  assert.equal(r.overlay, 1);
  assert.equal(r.rects, 1);
  assert.ok(r.pv && r.hint);
  assert.equal(r.worlds, 0);
  assert.deepEqual(r.noReel, [false, false, 0, 1]);
});
