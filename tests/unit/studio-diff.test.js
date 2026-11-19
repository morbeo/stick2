// character diffs (src/editor/studio-diff.js) without a page: base64url links round-trip (UTF-8 too), a diff reads as
// patch lines, #diff= links load or refuse, the changes panel lists changed bones and moves, the move compare and the
// PNG export run, and the roster suggestion dialog (tests/unit/ui-stub.js stands in for the DOM toolkit)
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run, ctx } = load(['core', 'rig', 'fx', 'effects', 'roster', 'fighter', 'world', 'stage', 'brain', 'checks', 'events', 'editor/studio-diff']);
Object.assign(ctx, { TextEncoder, TextDecoder, Uint8Array, btoa, atob, String });
run(require('./ui-stub'));
run(`var clone = o => JSON.parse(JSON.stringify(o)); var DEFS = mapVals(CHAR_DEFS, clone); var dpr = 1;
  var log = []; var errors = []; console = { error: (...a) => errors.push(a.join(' ')) };
  var stripLocal = def => ({ ...def, bones: def.bones.map(({ lenLock, ...b }) => b) });
  var charExport = () => ({ format: 'stick2.character.diff', base: CURRENT, diff: diffObj(CHAR_DEFS[CURRENT], stripLocal(DEFS[CURRENT])) || {} });
  var fromCharDiff = d => { if (!CHAR_DEFS[d.base]) throw new Error('not a built-in: ' + d.base); return applyObj(CHAR_DEFS[d.base], d.diff); };
  var applyCharDiff = async (def, name) => { log.push('apply ' + name); }; var pickChar = n => log.push('pick ' + n); var setMode = m => log.push('mode ' + m); var openStage = s => log.push('stage ' + s);
  var exportChar = () => log.push('export'); var syncAll = () => {}; var creator = { headToHead: false, htControl: 'none' }; var creatorMode = { restart: () => log.push('restart') };
  var previewBar = () => el('div'); var panels = () => log.push('panels'); var keyStart = (m, i) => m.keys.slice(0, i).reduce((s, k) => s + k.d, 0); var drawThumb = () => log.push('thumb');
  var location = { origin: 'https://x.test', pathname: '/stick2/' }; var navigator = { clipboard: { writeText: t => log.push('copy ' + t.slice(0, 30)) } };
  var window = { open: u => log.push('open ' + u) }; var answers = []; var dialog = async () => answers.shift() ?? null;
  var frames = []; requestAnimationFrame = fn => frames.push(fn); var performance = { now: () => 0 }; var attached = true;
  document.body = { contains: () => attached }; var shots = [];
  var _h = h; h = (tag, props, ...kids) => { const e = _h(tag, props, ...kids); if (tag === 'canvas') { e.width = 100; e.height = 80; e.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true }); e.toDataURL = () => 'data:png'; }
    if (tag === 'a') e.click = () => shots.push(e.download); return e; };`);
const js = src => JSON.parse(run(`JSON.stringify((() => { ${src} })())`));
const ajs = async src => JSON.parse(await run(`(async () => { ${src} })().then(r => JSON.stringify(r))`));

test('studio diff: base64url round-trips UTF-8 with no padding or URL-escaped characters; the link carries it', () => {
  const r = js(`const s = JSON.stringify({ a: 'ünï ✓ 字', b: [1, 2, 3], c: '???>>>' }), e = b64url(s);
    return { e, back: fromB64url(e) === s, link: diffEmbedLink({ x: 1 }) };`);
  assert.match(r.e, /^[A-Za-z0-9_-]+$/); assert.ok(r.back);
  assert.match(r.link, /^https:\/\/x\.test\/stick2\/#diff=[A-Za-z0-9_-]+$/);
});

test('studio diff: a diff reads as patch lines: added, removed, changed leaves, nested paths and resized lists', () => {
  const r = js(`return { lines: describeDiff({ added: { a: 1, o: { x: 1 } }, removed: { b: 2 }, changed: { c: [1, [2, 3]], d: { changed: { e: [null, 'x'] } }, f: { full: [1, 2, 3] } } }),
    vals: [fmtDiffVal([1]), fmtDiffVal({}), fmtDiffVal(null), fmtDiffVal(2)],
    colors: diffLinesEl(['+ a', '- b', 'c: 1 → 2']).children.map(c => c.styleText) };`);
  assert.deepEqual(r.lines, ['+ a: 1', '+ o: {…}', '- b', 'c: 1 → [2,3]', 'd.e: null → x', 'f: 3 items (reordered or resized)']);
  assert.deepEqual(r.vals, ['[1]', '{…}', 'null', '2']);
  assert.match(r.colors[0], /#2e8b57/); assert.match(r.colors[1], /#c0392b/); assert.match(r.colors[2], /inherit/);
});

test('studio diff: #diff= links load into the changes panel; bad, foreign and unknown-base links are refused', async () => {
  const r = await ajs(`const d = { format: 'stick2.character.diff', base: CURRENT, diff: {} };
    await loadEmbedDiff(b64url(JSON.stringify(d))); await loadEmbedDiff(JSON.stringify(d)); const ok = log.splice(0);
    await loadEmbedDiff('%%%'); await loadEmbedDiff(b64url('{"format":"other"}')); await loadEmbedDiff(b64url(JSON.stringify({ ...d, base: 'nobody' })));
    return { ok, errors, notices: FAKE.notices };`);
  assert.deepEqual(r.ok.slice(0, 4), [`apply stick`, 'pick stick', 'mode character', 'stage changes'].map(s => s.replace('stick', r.ok[0].split(' ')[1])));
  assert.equal(r.ok.length, 8); assert.equal(r.errors.length, 2); assert.deepEqual(r.notices, ['Unknown base character']);
});

test('studio diff: the changes panel lists changed bones by part and changed moves; every control runs', () => {
  const r = js(`const def = DEFS[CURRENT]; def.bones[1] = { ...def.bones[1], len: def.bones[1].len + 5, extra: 1 }; delete def.bones[2].thick; def.bones[3] = { ...def.bones[3], fresh: 2 };
    def.bones.push({ id: 'newBone', parent: def.bones[0].id, len: 5, role: 'tail' }); const leaf = def.bones.findIndex((b, i) => i > 4 && !def.bones.some(k => k.parent === b.id) && b.role !== 'spine'), gone = def.bones.splice(leaf, 1)[0];
    const mv = Object.keys(def.moves)[0]; def.moves[mv] = { ...def.moves[mv], power: 9, keys: def.moves[mv].keys.map((k, i) => i ? k : { ...k, d: k.d + 0.1 }) }; CHARS[CURRENT] = makeCharacter(def);
    FAKE.regs = []; const p = charDiffPanel(), rows = walk(p).filter(e => e.tag === 'tr').length, cs = controls(p);
    for (const c of cs) { FAKE.pop = null; c.fire('click'); if (FAKE.pop) for (const k of controls(FAKE.pop)) k.fire('click'); }
    const popup = FAKE.pop; const keySpans = popup ? walk(popup).filter(e => e.onclick && e.tag === 'span') : []; keySpans.forEach(s => s.onclick());
    frames.splice(0).forEach(f => f(16)); attached = false; frames.splice(0).forEach(f => f(32)); attached = true;
    creator.headToHead = true; FAKE.regs = []; const ht = charDiffPanel(); for (const c of controls(ht)) c.fire('click'); frames.splice(0).forEach(f => f(16)); creator.headToHead = false;
    DEFS[CURRENT] = clone(CHAR_DEFS[CURRENT]); CHARS[CURRENT] = makeCharacter(DEFS[CURRENT]); const none = walk(charDiffPanel()).some(e => e.textContent === 'No changes from the built-in.');
    const keep = CURRENT; DEFS.mine = clone(DEFS[keep]); CURRENT = 'mine'; const own = walk(charDiffPanel()).some(e => /wholly your own/.test(e.textContent)); CURRENT = keep;
    return { rows, controls: cs.length, spans: keySpans.length, shots, log, none, own, gone: gone.id };`);
  assert.ok(r.rows >= 6, `${r.rows} rows`); assert.ok(r.controls >= 5 && r.spans > 0, JSON.stringify(r));
  assert.ok(r.shots.some(s => s.endsWith('-changes.png')) && r.shots.some(s => /-.+\.png$/.test(s)));
  for (const want of ['export', 'restart', 'thumb']) assert.ok(r.log.includes(want), want);
  assert.ok(r.log.some(l => l.startsWith('copy https://x.test/stick2/#diff='))); assert.ok(r.none && r.own);
});

test('studio diff: suggesting a character exports it and opens a prefilled issue until done', async () => {
  const r = await ajs(`log.length = 0; answers.push('export', 'issue', null); await suggestChar(); const keep = CURRENT; DEFS.newbie = clone(DEFS[keep]); CURRENT = 'newbie';
    answers.push('issue'); await suggestChar(); CURRENT = keep; return log;`);
  assert.equal(r[0], 'export'); assert.match(r[1], /issues\/new\?title=Suggest%20a%20change%20to/); assert.match(r[2], /Suggest%20adding%20newbie/);
});
