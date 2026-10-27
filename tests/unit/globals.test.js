// the scripts in src/ share one global scope (index.html loads them in order): a top-level name declared twice either stops the
// later script (const, let, class) or, for a function, silently replaces the earlier one everywhere
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');

test('no top-level name is declared in two src/ scripts (or twice in one)', () => {
  const files = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script src="(src\/[^"]+\.js)"/g)].map(m => m[1]);
  assert.ok(files.length > 20, 'found the scripts index.html loads');
  const seen = {}, twice = [];
  for (const f of files) {
    if (!fs.existsSync(path.join(ROOT, f))) continue; // src/build.js: generated
    for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/^(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (seen[m[1]]) twice.push(`${m[1]}: ${seen[m[1]]} and ${f}`); else seen[m[1]] = f;
    }
  }
  assert.deepEqual(twice, []);
});

// a script that doesn't parse loses every name in it, and the page breaks only where those names are used: a stray quote in
// docs.js's help text once took readHash with it, so #join= links did nothing and only the netplay test noticed
test('every script index.html loads parses', () => {
  const vm = require('vm');
  const files = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script src="(src\/[^"]+\.js)"/g)].map(m => m[1]);
  const bad = files.filter(f => fs.existsSync(path.join(ROOT, f))).flatMap(f => {
    try { new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }); return []; } catch (e) { return [f + ': ' + e.message]; }
  });
  assert.deepEqual(bad, []);
});
