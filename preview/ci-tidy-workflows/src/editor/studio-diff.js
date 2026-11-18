// ---------- studio, diffs: #diff= links, describe a diff, the changes panel, roster suggestions (split from studio.js) ----------
// base64url (RFC 4648 §5: + → -, / → _, no = padding), so the URL hash never needs %-escaping at all - JSON's braces,
// quotes and colons each cost 3 chars escaped (encodeURIComponent), base64 none, so this alone shrinks a diff link by
// more than half. atob/btoa only take Latin1 strings, so UTF-8 bytes go through one at a time, not spread (a long
// diff could otherwise overflow the call stack through String.fromCharCode(...bytes))
function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/'), bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
// ---------- #diff=<base64url json> in the URL hash (readHash, src/ui/docs.js): a direct link to a character diff, opened
// straight into the character tab's changes panel - the same payload exportChar()/the changes panel's "embed link" produce
async function loadEmbedDiff(raw) {
  let d; try { d = JSON.parse(raw[0] === '{' ? raw : fromB64url(raw)); } catch (err) { return console.error('stick2: bad #diff value', err); } // raw[0]: an older %-escaped JSON link still works
  if (d.format !== 'stick2.character.diff') return console.error('stick2: #diff is not a character diff');
  let def; try { def = fromCharDiff(d); } catch (err) { return notice('Unknown base character', err.message); }
  await applyCharDiff(def, d.base);
  pickChar(d.base); setMode('character'); openStage('changes');
}
const diffEmbedLink = d => `${location.origin}${location.pathname}#diff=${b64url(JSON.stringify(d))}`;
// a path-prefixed, readable line per leaf change in a diffObj()/diffArr() result - generic over whatever it's run on
// (bones, moves, stances, gait, stats…), so a new field never needs its own formatting added here
const fmtDiffVal = v => Array.isArray(v) ? JSON.stringify(v) : typeof v === 'object' && v !== null ? '{…}' : String(v);
function describeDiff(d, path = []) {
  const lines = [];
  for (const k in d.added || {}) lines.push(`+ ${[...path, k].join('.')}: ${fmtDiffVal(d.added[k])}`);
  for (const k in d.removed || {}) lines.push(`- ${[...path, k].join('.')}`);
  for (const k in d.changed || {}) {
    const v = d.changed[k], p = [...path, k];
    if (Array.isArray(v)) lines.push(`${p.join('.')}: ${fmtDiffVal(v[0])} → ${fmtDiffVal(v[1])}`);
    else if ('full' in v) lines.push(`${p.join('.')}: ${v.full.length} items (reordered or resized)`);
    else lines.push(...describeDiff(v, p));
  }
  return lines;
}
// colors a describeDiff() line list like a patch: + green (added), - red (removed), a changed leaf (→) left plain
function diffLinesEl(lines) {
  return h('pre', { cls: 'note' }, lines.map(l => h('div', { style: `color: ${l[0] === '+' ? '#2e8b57' : l[0] === '-' ? '#c0392b' : 'inherit'}`, textContent: l })));
}
// composites a few labelled canvases (plus optional text lines) into one PNG and downloads it - the same visuals
// the diff views already draw, just flattened into one shareable image for patch notes, docs, or an issue/PR
function exportDiffImage(filename, cells, lines = []) {
  const pad = 10, lineH = 14, cw = Math.max(...cells.map(c => c.cv.width / dpr)), ch = Math.max(...cells.map(c => c.cv.height / dpr));
  const w = cells.length * (cw + pad) + pad, out = h('canvas');
  out.width = w; out.height = ch + pad * 3 + 16 + (lines.length ? lines.length * lineH + pad : 0);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#f3f0e8'; ctx.fillRect(0, 0, w, out.height);
  ctx.font = '12px ui-monospace, Menlo, monospace'; ctx.fillStyle = '#222'; ctx.textBaseline = 'top';
  cells.forEach((c, i) => { const x = pad + i * (cw + pad); ctx.fillText(c.label, x, pad); ctx.drawImage(c.cv, x, pad + 16, cw, ch); });
  let y = pad * 2 + 16 + ch; for (const l of lines) { ctx.fillText(l, pad, y); y += lineH; }
  h('a', { href: out.toDataURL('image/png'), download: filename }).click();
}
// a changed move, side by side: both versions looping in sync on a shared playhead, each move's own timeline below
// it with the changed keys (by index - the diff's keys.changed map) highlighted, click a key to scrub to its start
function moveDiffView(name) {
  const baseCh = makeCharacter(CHAR_DEFS[CURRENT]), curCh = CHARS[CURRENT], bm = baseCh.moves[name], cm = curCh.moves[name];
  const changedKeys = new Set(Object.keys(diffObj(bm, cm)?.changed?.keys?.changed || {}).map(Number));
  const state = { t: 0, playing: true };
  const cvBase = h('canvas'), cvCur = h('canvas');
  const render = () => {
    drawThumb(cvBase, baseCh, samplePose(baseCh, bm, state.t % Math.max(0.001, total(bm))), 110, 120);
    drawThumb(cvCur, curCh, samplePose(curCh, cm, state.t % Math.max(0.001, total(cm))), 110, 120);
  };
  const timeline = m => h('div', { cls: 'bar' }, m.keys.map((k, i) => h('span', {
    tip: `key ${i} (${k.d.toFixed(2)}s)${changedKeys.has(i) ? ' - changed' : ''} · click: scrub here`,
    style: `display:inline-block; width:${Math.max(4, k.d * 160)}px; height:14px; margin-right:1px; cursor:pointer; background:${changedKeys.has(i) ? '#c0392b' : '#bbb'};`,
    onclick: () => { state.t = keyStart(m, i); state.playing = false; render(); syncAll(); },
  })));
  const playBtn = button('', 'Play / pause both previews', () => { state.playing = !state.playing; }, 'mini');
  reg(playBtn, () => setRich(playBtn, state.playing ? ':pause:' : ':play_arrow:'));
  let last = performance.now();
  const loop = now => { if (!document.body.contains(cvBase)) return; if (state.playing) { state.t += (now - last) / 1000; render(); } last = now; requestAnimationFrame(loop); };
  requestAnimationFrame(loop); render();
  return h('div', {}, h('b', { textContent: name }), h('div', { cls: 'bar' }, playBtn,
    button(':download: export image', 'Download a PNG of this exact moment, both versions side by side', () =>
      exportDiffImage(`${CURRENT}-${name}.png`, [{ cv: cvBase, label: 'built-in' }, { cv: cvCur, label: 'yours' }]), 'mini')),
    h('div', { cls: 'bar' }, h('div', {}, h('b', { textContent: 'built-in' }), cvBase, timeline(bm)),
      h('div', {}, h('b', { textContent: 'yours' }), cvCur, timeline(cm))));
}
// ---------- character diff view (a stage panel, "changes"): what differs from the matching built-in, for reviewing
// an edit before exporting/suggesting it - the two bodies side by side with changed bones highlighted, and every
// other change (moves, stances, stats…) as a flat list of dotted paths, from the same diff the export uses
// bone property name -> its part, for grouping the change table (unlisted/custom bones fall under their own id)
const partOf = (ch, id) => ch.by[id]?.role || '';
const PART_ORDER = ['spine', 'head', 'arm', 'leg', 'tail'];
function charDiffPanel() {
  const wrap = h('div', { cls: 'mtable' }), base = CHAR_DEFS[CURRENT];
  if (!base) { wrap.append(stageHead('changes', 'What differs from the matching built-in character'),
    h('p', { cls: 'note', textContent: 'This character has no built-in to compare against (it\'s wholly your own).' })); return wrap; }
  const baseCh = makeCharacter(base), curCh = CHARS[CURRENT];
  const d = diffObj(base, stripLocal(DEFS[CURRENT])) || {};
  // one row per changed bone property (not per bone - a bone with 3 changed fields gets 3 rows), grouped by part
  const bd = d.changed?.bones || {};
  const boneRows = [];
  for (const id in bd.changed || {}) { const fd = bd.changed[id];
    for (const k in fd.added || {}) boneRows.push([id, k, '—', fmtDiffVal(fd.added[k])]);
    for (const k in fd.removed || {}) boneRows.push([id, k, fmtDiffVal(fd.removed[k]), '—']);
    for (const k in fd.changed || {}) boneRows.push([id, k, fmtDiffVal(fd.changed[k][0]), fmtDiffVal(fd.changed[k][1])]); }
  for (const id in bd.added || {}) boneRows.push([id, '(new bone)', '—', '—']);
  for (const id in bd.removed || {}) boneRows.push([id, '(removed)', '—', '—']);
  const parts = {};
  for (const row of boneRows) (parts[partOf(curCh, row[0]) || partOf(baseCh, row[0])] ??= []).push(row);
  const partKeys = [...PART_ORDER.filter(p => parts[p]), ...Object.keys(parts).filter(p => !PART_ORDER.includes(p))];
  const boneTable = boneRows.length ? h('table', {}, h('tbody', {}, partKeys.flatMap(part => [
    h('tr', {}, h('td', { colSpan: 5, textContent: part || '(other)', style: 'font-weight: bold; background: #e8e3d8' })),
    ...parts[part].map(([id, field, from, to]) => h('tr', {},
      h('td', { textContent: id }), h('td', { textContent: field }),
      h('td', { textContent: from, style: to === '—' ? 'color: #c0392b' : '' }), h('td', { textContent: '→' }),
      h('td', { textContent: to, style: from === '—' ? 'color: #2e8b57' : '' }))),
  ]))) : null;
  const lines = describeDiff(d).filter(l => !l.replace(/^[+-] /, '').startsWith('bones.') && !/^[+-] bones\b/.test(l)); // the bone table above covers these
  const changedMoves = Object.keys(d.changed?.moves?.changed || {});
  // the comparison itself is the fully interactive preview (same controls as the regular preview - scripted demo,
  // walk, AI vs AI, driving the opponent yourself…), built-in on one side and the live edited character on the other.
  // head-to-head swaps that for the built-in fighting your edited version directly (always ai vs ai, a balance test
  // rather than a look at them side by side), with htControl optionally handing one side to your own keyboard
  const htToggle = toggle(':swords: head-to-head', 'Fight the built-in against your edited version directly, instead of each against the same opponent - a balance test, not just a look', () => creator.headToHead, v => { creator.headToHead = v; creatorMode.restart(); panels(); });
  const htControl = h('span', { cls: 'seg' }, [['none', 'the engine AI'], ['base', 'built-in: you'], ['cur', 'yours: you']].map(([v, label]) => {
    const b = button(label, `Drive the ${v === 'none' ? 'both sides' : v === 'base' ? 'built-in' : 'edited'} side with your own keyboard instead of the engine AI`, () => { creator.htControl = v; creatorMode.restart(); });
    reg(b, () => b.classList.toggle('on', creator.htControl === v)); return b;
  }));
  const cvBase = h('canvas'), cvCur = h('canvas'), cvHead = h('canvas');
  for (const cv of [cvBase, cvCur]) { cv.width = 320 * dpr; cv.height = 200 * dpr; cv.style.width = '320px'; cv.style.height = '200px'; }
  cvHead.width = 660 * dpr; cvHead.height = 200 * dpr; cvHead.style.width = '660px'; cvHead.style.height = '200px';
  const paint = (cv, w) => { const c = cv.getContext('2d'), r = { x: 0, y: 0, w: cv.width, h: cv.height };
    c.fillStyle = '#f3f0e8'; c.fillRect(r.x, r.y, r.w, r.h); w?.render(c, r); };
  const loop = () => {
    if (!document.body.contains(cvBase) && !document.body.contains(cvHead)) return;
    if (creator.headToHead) paint(cvHead, creator.diffHeadW); else { paint(cvBase, creator.diffW); paint(cvCur, creator.w); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  wrap.append(...[stageHead('changes', 'What differs from the matching built-in character',
    button(':download: export diff', 'Export just this diff (the default character export)', () => exportChar(false), 'mini'),
    button(':download: export image', 'Download a PNG of this comparison - the bodies and the change list, for patch notes or docs', () =>
      exportDiffImage(`${CURRENT}-changes.png`, creator.headToHead ? [{ cv: cvHead, label: 'built-in vs yours' }] : [{ cv: cvBase, label: 'built-in' }, { cv: cvCur, label: 'yours' }], lines), 'mini'),
    button(':content_copy: embed link', 'Copy a link that opens this exact diff, straight into this changes panel, for anyone (#diff=…)', () =>
      navigator.clipboard?.writeText(diffEmbedLink(charExport(false))), 'mini')),
    h('div', { cls: 'bar' }, htToggle, creator.headToHead ? htControl : null),
    creator.headToHead ? null : previewBar('bar'),
    creator.headToHead ? h('div', {}, h('b', { textContent: 'built-in vs yours' }), cvHead)
      : h('div', { cls: 'bar' }, h('div', {}, h('b', { textContent: 'built-in' }), cvBase), h('div', {}, h('b', { textContent: 'yours' }), cvCur)),
    boneTable,
    lines.length ? diffLinesEl(lines) : h('p', { cls: 'note', textContent: 'No changes from the built-in.' }),
    changedMoves.length ? h('div', { cls: 'bar' }, h('span', { textContent: 'changed moves:' }),
      changedMoves.map(n => button(n, `Compare ${n} side by side, both versions looping in sync`, (e, el) => popup(el, moveDiffView(n)), 'mini'))) : null].filter(Boolean));
  return wrap;
}
// ---------- suggest a character for the roster: an issue + an attached file, no local git, no sign-in beyond GitHub ----------
// used to pre-fill GitHub's "new file" page instead (a PR draft) - a character alone is ~70 KB, well past any URL
// GitHub will accept (it refuses an oversized request outright, not just truncates it), so that page almost always
// opened empty anyway, and still needed a fork + "propose changes" even once pasted. An issue with the exported file
// attached needs neither: any signed-in account can open one, and dragging a file in is a familiar step.
async function suggestChar() {
  const name = CURRENT, add = !CHAR_DEFS[name];
  const text = `1. Export this character as a file (below) — you'll attach it to the issue.\n2. Open a new issue on GitHub (below) and drag the exported file in.\n3. Say what's new or changed; a maintainer folds it into the roster (see CONTRIBUTING.md).`;
  for (;;) {
    const v = await dialog(`Suggest ${add ? `adding ${name}` : `a change to ${name}`}`, text, [
      [':download: export character file', 'export', 'Download this character as a JSON file to attach to the issue'],
      [':north_east: open a new issue', 'issue', 'Opens a new GitHub issue on this repo — attach the exported file there'],
      [':check: done', null, 'Close this'],
    ]);
    if (v === 'export') exportChar(false);
    else if (v === 'issue') window.open(`https://github.com/morbeo/stick2/issues/new?title=${encodeURIComponent(`Suggest ${add ? `adding ${name}` : `a change to ${name}`}`)}`, '_blank');
    else break;
  }
}
