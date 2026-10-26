// the coverage gate CI runs: the unit tests with V8 coverage of src/, failing if line coverage drops below the floor
// overall, or below 100% for any file listed in FULL (small modules kept fully covered; add one once it gets there)
// usage: node tools/dev/coverage-check.js [--floor 80]
const { spawnSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FLOOR = 80;
const FULL = ['engine/brain', 'engine/checks', 'engine/core', 'engine/events', 'engine/objdiff', 'engine/roster', 'engine/shapes', 'engine/stage',
  'net/netmatch', 'net/netplay', 'editor/tracker', 'ui/sound', 'ui/panelstate'];

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
const short = FULL.filter(f => !files[f] || files[f].lh < files[f].lf);
for (const f of short) console.error(`coverage: src/${f}.js must stay fully covered: ${files[f] ? `${files[f].lf - files[f].lh} line(s) not run` : 'not loaded by any test'}`);
const all = Object.values(files).reduce((a, f) => [a[0] + f.lh, a[1] + f.lf], [0, 0]);
console.log(`coverage: ${(100 * all[0] / all[1]).toFixed(2)}% of src/ lines (floor ${floor}%), ${FULL.length - short.length}/${FULL.length} files kept at 100%`);
process.exit(r.status || (short.length ? 1 : 0));
