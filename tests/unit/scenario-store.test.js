// my scenarios (src/engine/scenarios.js): scripts as text and bookmarks, the saved store layered over the built-ins, embed links,
// and the random-character scenarios the snapshot test leaves out, played over several seeds
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load(['core', 'rig', 'fx', 'roster', 'fighter', 'world', 'stage', 'brain', 'checks', 'events', 'scenarios']);
run(`var panels = () => {}, lab = { scen: null }, setMode = m => { lab.mode = m; }, setTheater = () => {}, build = () => {};`);
const js = src => JSON.parse(run(`JSON.stringify((() => { ${src} })())`));

test('a script as text: waits keep a dot, holds read "hold key secs"; bookmarks fall on each action\'s frame', () => {
  const r = js(`const a = ['punch', 0.5, { hold: 'down', t: 0.25 }, 1, '!kick+punch'];
    return [scriptText(a), scriptBookmarks(a)];`);
  assert.equal(r[0], 'punch, 0.5, hold down 0.25, 1.0, !kick+punch');
  assert.deepEqual(r[1], [{ f: 0, name: 'punch' }, { f: 30, name: 'hold down' }, { f: 105, name: 'kick + punch' }]);
});

test('every scripted built-in survives the text form: parsed back it is the same script', () => {
  const r = js(`return Object.entries(SCENARIOS).flatMap(([n, s]) => [s.a, s.b, ...(s.more || []).map(m => m.c)].filter(Array.isArray)
    .map(a => [n, JSON.stringify(parseMacro(scriptText(a))) === JSON.stringify(a)])).filter(([, ok]) => !ok).map(([n]) => n);`);
  assert.deepEqual(r, []);
});

test('the store: an import registers its scenarios as user ones; removing one brings back the built-in it shadowed', () => {
  const r = js(`const base = SCENARIOS['ai vs ai'], u = fromScen(base, null); u.period = 3;
    importScens(JSON.stringify({ 'ai vs ai': u, 'mine': fromScen(SCENARIOS['ai vs dummy'], null) }));
    const after = [SCENARIOS['ai vs ai'].user, SCENARIOS['ai vs ai'].period, !!SCENARIOS.mine?.user, JSON.parse(exportScens()).mine !== undefined];
    delete myStore['ai vs ai']; delete myStore.mine; saveScens();
    return { after, back: SCENARIOS['ai vs ai'] === BASE_SCENARIOS['ai vs ai'], gone: !('mine' in SCENARIOS) };`);
  assert.deepEqual(r.after, [true, 3, true, true]);
  assert.ok(r.back && r.gone);
});

test('embed: every slug names a scenario; random picks a solo one with an edge for the player; a bad value loads nothing', () => {
  const r = js(`const missing = Object.entries(EMBED_SLUGS).filter(([, n]) => !SCENARIOS[n]).map(([k]) => k).concat(EMBED_RANDOM_POOL.filter(n => !SCENARIOS[n]));
    loadEmbedScenario('vsai'); const slug = lab.scen;
    loadEmbedScenario('random'); const e = SCENARIOS[EMBED_KEY];
    lab.scen = null; const err = console.error; console.error = () => {}; loadEmbedScenario('{nope'); console.error = err;
    return { missing, slug, scen: lab.scen, mode: lab.mode, edge: e.aover.health > CFG.health && e.bover.damage > 1, chars: e.chars };`);
  assert.deepEqual(r.missing, []);
  assert.equal(r.slug, 'you vs ai');
  assert.equal(r.scen, null);
  assert.equal(r.mode, 'play');
  assert.ok(r.edge);
  assert.deepEqual(r.chars, ['random', 'random', 'random', 'random']);
});

test('random-character scenarios play through on several seeds: finite positions and health, nobody stuck at full health', () => {
  const r = js(`return Object.keys(SCENARIOS).filter(n => SCENARIOS[n].chars?.includes('random') && SCENARIOS[n].a !== 'human').flatMap(n => [1, 2, 3, 4, 5].map(seed => {
    const w = new World(SCENARIOS[n], {}, seed); w.loop = false;
    for (let i = 0; i < 600 && !w.done; i++) w.advance(1 / 60, NOIN);
    const ok = w.fighters.every(f => Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.hp));
    return [n, seed, ok, w.hits];
  }));`);
  assert.ok(r.length > 0, 'no random scenarios');
  for (const [n, seed, ok] of r) assert.ok(ok, `${n} seed ${seed}: a non-finite fighter`);
  for (const n of new Set(r.map(x => x[0]))) assert.ok(r.filter(x => x[0] === n).some(x => x[3] > 0), `${n}: no hits on any seed`);
});
