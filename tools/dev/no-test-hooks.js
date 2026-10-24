// fails when src/ branches on being under test (process.env.CI / NODE_ENV / TEST, __TEST__, isTest):
// code must behave the same in tests as in the game, so a test can't be passed by a special case
// usage: npm run lint:src
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..', 'src'), bad = /process\.env\.(CI|NODE_ENV|TEST)\b|__TEST__|\bisTest\b/;
const files = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []);
const hits = files(root).flatMap(f => fs.readFileSync(f, 'utf8').split('\n').map((l, i) => bad.test(l) ? `${path.relative(root, f)}:${i + 1}: ${l.trim()}` : null).filter(Boolean));
if (hits.length) { console.error('test-only branches in src/:\n' + hits.join('\n')); process.exit(1); }
console.log('src/: no test-only branches');
