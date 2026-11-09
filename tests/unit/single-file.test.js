// npm run single: one page with every script of index.html inlined in order and the icon font as a data URL
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..', '..');

test('single-file build inlines every script in order and the font, and points at no files', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stick2-single-')), 'stick2.html');
  execFileSync('node', [path.join(root, 'tools', 'dev', 'single-file.js'), out], { cwd: root, stdio: 'pipe' });
  const html = fs.readFileSync(out, 'utf8'), src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const want = [...src.matchAll(/<script src="([^"?]+)"><\/script>/g)].map(m => m[1]);
  const got = [...html.matchAll(/<script>\/\* ([^ ]+) \*\//g)].map(m => m[1]);
  assert.ok(want.length > 50); assert.deepEqual(got, want);
  assert.doesNotMatch(html, /(src|href)="(src|fonts)\//);
  assert.match(html, /url\(data:font\/woff2;base64,/);
  // an inlined script never closes its own tag early
  assert.equal(html.split('</script>').length - 1, want.length);
});
