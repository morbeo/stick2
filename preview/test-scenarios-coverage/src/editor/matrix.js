'use strict';
// ---------- tests: the move test matrix (a move, or every move, against each opponent in every target state) and my scenarios ----------
// cells run a few per frame in the background; each is checked (see checks.js); click one to watch it, open it in animate to fix it
const tests = { move: null, opps: 'same', failing: false, res: {}, queue: [], total: 0, sel: null, w: null, cfgKey: '' };
const testMoves = () => tests.move && currentChar().moves[tests.move] ? [tests.move] : Object.keys(currentChar().moves);
const testOpps = () => tests.opps === 'all' ? Object.keys(DEFS).filter(n => CHARS[n]) : [CURRENT];
const cellKey = (mv, opp, ci) => `${mv}|${opp}|${ci}`;
const scenKey = n => `scenario|${n}`;
function rerunTests() {
  tests.res = {}; tests.cfgKey = JSON.stringify(CFG);
  tests.queue = [...testMoves().flatMap(mv => testOpps().flatMap(opp => CHECK_COLS.map((_, ci) => cellKey(mv, opp, ci)))), ...Object.keys(myScens()).map(scenKey)];
  tests.total = tests.queue.length;
  if (tests.sel && !tests.queue.includes(tests.sel)) isolate(null);
}
function runCell(k) {
  const [mv, opp, ci] = k.split('|');
  if (mv === 'scenario') return SCENARIOS[opp] ? runScenCheck(opp) : { out: 'skip', issues: [], why: 'deleted' };
  return currentChar().moves[mv] ? runCheck(currentChar(), CHARS[opp], mv, CHECK_COLS[ci]) : { out: 'skip', issues: [], why: 'no such move now' };
}
// a scenario of mine: played for its period (else 6 s); nothing may become NaN, leave the stage or stay stuck in one state for 5 s
function runScenCheck(n) {
  const w = new World({ ...SCENARIOS[n], period: 0 }, {}, 7, playChars()), T = (SCENARIOS[n].period || 6) * 60, same = w.fighters.map(() => 0), was = [];
  const st = f => f.action ? f.action.m.keys.length + ':' + f.action.i + (f.action.m.name || '') : f.kd || (f.free ? '' : 'hurt');
  for (let i = 0; i < T; i++) {
    w.advance(1 / 60, NOIN);
    if (!w.fighters.every(f => Number.isFinite(f.x + f.y + f.vx + f.vy))) return { out: 'fail', issues: ['a position became NaN'], t: i / 60 };
    w.fighters.forEach((f, j) => { const s = st(f); same[j] = s && s === was[j] ? same[j] + 1 : 0; was[j] = s; });
    if (same.some(n => n > 300)) return { out: 'fail', issues: ['a fighter is stuck in one state for 5 s'], t: i / 60 };
  }
  return w.fighters.some(f => f.x < -40 || f.x > W + 40) ? { out: 'fail', issues: ['a fighter left the stage'], t: T / 60 } : { out: 'ok', issues: [], t: T / 60, why: 'plays without trouble' };
}
const failed = r => r?.issues.length > 0;
const nFailing = () => Object.values(tests.res).filter(failed).length;
// the watched cell: its fight loops on the stage over the table
function isolate(k) {
  tests.sel = k; tests.w = null;
  if (k) {
    const [mv, opp, ci] = k.split('|');
    followMove(mv);
    if (mv === 'scenario') tests.w = newWorld(SCENARIOS[opp], {}, 7, playChars());
    else { const s = targetScen(mv, currentChar().moves[mv], CHECK_COLS[ci]); s.period = Math.max(2.4, (tests.res[k]?.t || 2) + 0.4); tests.w = newWorld(s, {}, 7, [currentChar(), CHARS[opp]]); }
  }
  panels();
}
// fix it in animate: the move with this exact setup as the preview's target
function openInAnimate(k) {
  const [mv, opp, ci] = k.split('|'), c = CHECK_COLS[ci];
  anim.move = mv; anim.target = { char: opp === CURRENT ? null : opp, stance: c.stance, state: c.state, facing: c.facing, dist: c.dist };
  setMode('animate');
}
const OUT_TXT = { hit: 'H', block: 'B', whiff: '·', skip: '–', ok: '✓', fail: '✗' };
const OUT_TIPS = { hit: 'hits', block: 'is blocked', whiff: 'whiffs', skip: 'skipped', ok: 'passes', fail: 'fails' };
const COL_TIPS = { near: 'at the move\'s usual distance', far: `${FAR} px further` };
function cellTip(k) {
  const [mv, opp, ci] = k.split('|'), r = tests.res[k], c = CHECK_COLS[ci];
  const what = mv === 'scenario' ? `my scenario ${opp}` : `${mv} vs ${opp} · ${c.s}, ${c.facing === 'away' ? 'back turned' : 'facing it'}, ${c.dist}`;
  return !r ? `${what}: not run yet` : `${what}: ${OUT_TIPS[r.out]}${r.issues.length ? ` ✗ ${r.issues.join('; ')}` : ` ✓ ${r.why || ''}`} · click: watch it`;
}
const tds = new Map(); // cell key → its td, so results fill in without rebuilding the table
function paintCell(k) {
  const td = tds.get(k), r = tests.res[k];
  if (!td) return;
  td.textContent = r ? OUT_TXT[r.out] : '';
  td.className = 'tcell' + (r ? failed(r) ? ' fail' : r.out === 'skip' ? ' skip' : ' pass' : '') + (tests.sel === k ? ' on' : '');
  td.dataset.tip = cellTip(k);
}
function testTable() {
  const wrap = h('div', { cls: 'mtable tmat' + (tests.sel ? ' iso' : '') }), cell = k => { const td = h('td', { onclick: () => isolate(tests.sel === k ? null : k) }); tds.set(k, td); paintCell(k); return td; };
  tds.clear();
  if (tests.sel) {
    const [mv, opp] = tests.sel.split('|'), r = tests.res[tests.sel];
    wrap.append(h('div', { cls: 'bar' }, ...rich(failed(r) ? ':block:' : ':check:'), h('span', { textContent: cellTip(tests.sel).replace(' · click: watch it', '') }), h('span', { cls: 'fill' }),
      mv !== 'scenario' ? button(':timeline: open in animate', `Edit ${mv} with this exact setup as the preview's target (${opp}, its state, facing and distance)`, () => openInAnimate(tests.sel)) : null,
      button(':close:', 'Stop watching (Esc)', () => isolate(null), 'mini')));
  }
  const keep = row => !tests.failing || row.some(k => failed(tests.res[k]));
  const head1 = h('tr', {}, h('th', { textContent: 'move', tip: 'The move, played by the character being edited' }), h('th', { textContent: 'against', tip: 'The target character' }),
    ...Object.keys(CHECK_STATES).map(s => h('th', { colSpan: 4, textContent: s, tip: TARGET_TIPS[CHECK_STATES[s].state === 'idle' ? CHECK_STATES[s].stance : CHECK_STATES[s].state] })));
  const head2 = h('tr', {}, h('th'), h('th'), ...CHECK_COLS.map(c => h('th', { cls: 'sub', textContent: (c.facing === 'away' ? '↺' : '') + c.dist[0], tip: `${c.s}, ${c.facing === 'away' ? 'back turned (↺)' : 'facing the attacker'}, ${c.dist}: ${COL_TIPS[c.dist]}` })));
  const rows = testMoves().flatMap(mv => testOpps().map(opp => [mv, opp, CHECK_COLS.map((_, ci) => cellKey(mv, opp, ci))])).filter(([, , ks]) => keep(ks));
  const body = h('tbody', {}, ...rows.map(([mv, opp, ks]) => h('tr', {}, h('td', { cls: 'tname', textContent: mv, onmousemove: e => peekMove(mv, e), onmouseleave: unpeek }), h('td', { cls: 'note', textContent: opp }), ...ks.map(cell))));
  const scens = Object.keys(myScens()).map(n => [n, scenKey(n)]).filter(([, k]) => keep([k]));
  if (scens.length) body.append(h('tr', {}, h('th', { colSpan: 2 + CHECK_COLS.length, textContent: 'my scenarios', tip: 'Each scenario of yours played through: nothing may become NaN, leave the stage or stay stuck' })),
    ...scens.map(([n, k]) => h('tr', {}, h('td', { cls: 'tname', colSpan: 2, textContent: n }), cell(k))));
  if (!rows.length && !scens.length) body.append(h('tr', {}, h('td', { colSpan: 2 + CHECK_COLS.length, cls: 'note', textContent: tests.queue.length ? 'nothing failing yet' : 'nothing failing' })));
  wrap.append(h('table', {}, h('thead', {}, head1, head2), body));
  return wrap;
}
const testProgress = h('span', { cls: 'note', tip: 'Cells run so far, and how many fail' });
const showProgress = () => { const n = tests.total - tests.queue.length, f = nFailing(); testProgress.textContent = `${n}/${tests.total}${f ? ` · ${f} failing` : ''}`; };
function testCtx() {
  const mb = button('', 'The move under test: one, or every move of the character', (e, b) => popup(b, h('div', { cls: 'bar' },
    seg([null, ...Object.keys(currentChar().moves)], () => tests.move, v => { tests.move = v; closePop(); followMove(v); rerunTests(); panels(); }, { null: 'Every move of the character (one row per move and opponent)', ...Object.fromEntries(Object.keys(currentChar().moves).map(m => [m, `Test only ${m}`])) }, v => v ?? 'all moves'))), 'mini');
  reg(mb, () => setRich(mb, `:sports_martial_arts: ${tests.move ?? 'all moves'}`));
  showProgress();
  return [grp('move', 'What is tested', mb),
    grp('against', 'Who the move is tried on, and which rows show', seg(['same', 'all'], () => tests.opps, v => { tests.opps = v; rerunTests(); panels(); },
      { same: 'The character being edited, as its own target', all: 'Every character as the target (bodies differ, so does reach)' }),
      toggle(':filter_list: failing only', 'Show only the rows with a failing cell (red), to work through them', () => tests.failing, v => { tests.failing = v; panels(); })),
    grp('status', 'The tests rerun by themselves when the character or a setting changes', button(':replay: rerun', 'Run every cell again', () => { rerunTests(); panels(); }), testProgress)];
}
const testMode = {
  enter() { rerunTests(); tests.sel = null; tests.w = null; },
  restart() { tests.w?.reset(); },
  changed() { rerunTests(); panels(); },
  overlay: () => [testTable()],
  worlds: () => tests.w ? [tests.w] : [],
  clipRects: () => tests.w ? [{ key: tests.w, r: { x: 0, y: 0, w: canvas.width, h: Math.round(canvas.height * 0.5) } }] : [],
  // a few cells per frame, about 8 ms of them, so the page stays smooth
  tick() {
    if (JSON.stringify(CFG) !== tests.cfgKey) { rerunTests(); panels(); }
    const t0 = performance.now();
    let any = false;
    while (tests.queue.length && performance.now() - t0 < 8) { const k = tests.queue.shift(); tests.res[k] = runCell(k); paintCell(k); any = true; }
    if (any) { showProgress(); if (tests.failing && !tests.queue.length) panels(); }
  },
  render() {
    clear();
    if (tests.w) drawCell({ w: tests.w, label: tests.sel.split('|').slice(0, 2).join(' vs ') }, { x: 0, y: 0, w: canvas.width, h: Math.round(canvas.height * 0.5) }, { plot: false });
  },
  ctxBar: testCtx,
  side: moveSide,
  open: ['move', 'key'],
  mouse() {},
  key(e) { if (e.code === 'Escape' && tests.sel) { isolate(null); return true; } },
  hint: () => 'H hit · B blocked · · whiff · red: not what should happen (hover for why) · click a cell: watch it, then open it in animate to fix · Esc back',
};
