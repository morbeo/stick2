// the coverage gate CI runs: the unit tests with V8 coverage of src/, failing if line coverage drops below the floor
// overall, or below 100% for any file listed in FULL (small modules kept fully covered; add one once it gets there)
// usage: node tools/dev/coverage-check.js [--floor 90]
const { spawnSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FLOOR = 90;
const FULL = ['engine/brain', 'engine/checks', 'engine/core', 'engine/effects', 'engine/events', 'engine/objdiff', 'engine/roster', 'engine/shapes', 'engine/stage',
  'net/netmatch', 'net/netplay', 'editor/tracker', 'ui/sound', 'ui/panelstate',
  'engine/rig', 'engine/rig-pose', 'engine/rig-chars', 'net/names', 'engine/replay-movie', 'engine/replay-panel',
  'engine/inputs', 'engine/combos', 'ui/keys', 'ui/gamepad', 'ui/embed-schema', 'ui/embed-presets', 'engine/clip', 'engine/rig-draw', 'engine/replay-timeline', 'engine/breed', 'editor/studio-diff',
  // every character file (not the shared _kit), so a new one joins on arrival
  ...fs.readdirSync(path.join(ROOT, 'src', 'engine', 'chars')).filter(f => /^[a-z]\w*\.js$/.test(f)).map(f => `engine/chars/${f.slice(0, -3)}`)];

const i = process.argv.indexOf('--floor'), floor = i > 0 ? Number(process.argv[i + 1]) : FLOOR;
if (!(floor >= 0 && floor <= 100)) { console.error('usage: node tools/dev/coverage-check.js [--floor 0-100]'); process.exit(2); }
const lcov = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stick2-cov-')), 'lcov.info');
const tests = fs.readdirSync(path.join(ROOT, 'tests', 'unit')).filter(f => f.endsWith('.test.js')).map(f => path.join('tests', 'unit', f));
const r = spawnSync(process.execPath, ['--test', '--experimental-test-coverage', '--test-coverage-include=src/**', `--test-coverage-lines=${floor}`,
  '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=lcov', `--test-reporter-destination=${lcov}`, ...tests], { cwd: ROOT, stdio: 'inherit' });

// per file: lines found / hit, from the lcov report
const files = {};
let cur = null;
for (const line of fs.readFileSync(lcov, 'utf8').split('\n')) {
  if (line.startsWith('SF:')) cur = files[path.relative(path.join(ROOT, 'src'), line.slice(3)).replace(/\\/g, '/').replace(/\.js$/, '')] = {};
  else if (line.startsWith('LF:')) cur.lf = +line.slice(3);
  else if (line.startsWith('LH:')) cur.lh = +line.slice(3);
}
// files no unit test loads count as not run at all and fail the gate, so a new module can't slip in untested; the DOM-heavy
// panels below are left to the browser smoke test (npm run test:browser) instead. A new file goes in a test or in this list
const BROWSER = ['build', 'editor/compare', 'editor/creator', 'editor/creator-bones', 'editor/creator-stats', 'editor/files', 'editor/fxlab', 'editor/gridlab',
  'editor/lab', 'editor/labpanel', 'editor/matrix', 'editor/propedit', 'editor/shotedit', 'editor/soundlab', 'editor/studio', 'net/netui',
  'ui/app', 'ui/bridge', 'ui/docs', 'ui/embed', 'ui/kitchensink', 'ui/layout', 'ui/palette', 'ui/touch', 'ui/ui', 'ui/welcome'];
const SRC = path.join(ROOT, 'src'), unloaded = [];
for (const f of fs.readdirSync(SRC, { recursive: true }).filter(f => f.endsWith('.js')).map(f => f.replace(/\\/g, '/').replace(/\.js$/, ''))) {
  if (files[f] || BROWSER.includes(f)) continue;
  unloaded.push(f); files[f] = { lf: fs.readFileSync(path.join(SRC, f + '.js'), 'utf8').split('\n').length, lh: 0 };
  console.error(`coverage: src/${f}.js is not loaded by any unit test (counted as 0%): test it, or list it in BROWSER in tools/dev/coverage-check.js if only the browser test can reach it`);
}
const short = FULL.filter(f => !files[f] || files[f].lh < files[f].lf);
for (const f of short) console.error(`coverage: src/${f}.js must stay fully covered: ${files[f] ? `${files[f].lf - files[f].lh} line(s) not run` : 'not loaded by any test'}`);
const all = Object.values(files).reduce((a, f) => [a[0] + f.lh, a[1] + f.lf], [0, 0]);
console.log(`coverage: ${(100 * all[0] / all[1]).toFixed(2)}% of src/ lines outside BROWSER (floor ${floor}%), ${FULL.length - short.length}/${FULL.length} files kept at 100%`);
process.exit(r.status || (short.length || unloaded.length || 100 * all[0] / all[1] < floor ? 1 : 0));
