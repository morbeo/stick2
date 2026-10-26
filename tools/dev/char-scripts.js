// keeps the <script> tags for the character files (src/engine/chars/index.json) in every page that loads the roster,
// in order, right before roster.js. Run after adding a character; --check only reports (exit 1 if a page is stale)
// usage: node tools/dev/char-scripts.js [--check]
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { CHAR_FILES } = require('../lib/engine');
const PAGES = ['index.html', 'tools/render/render.html', 'tools/render/icons.html', 'tools/itch/itch-render.html'];

// the page's text with the character tags rebuilt (null if it doesn't load roster.js)
function rebuild(html) {
  const lines = html.split('\n').filter(l => !/src\/engine\/chars\//.test(l));
  const i = lines.findIndex(l => /src\/engine\/roster\.js"><\/script>/.test(l));
  if (i < 0) return null;
  const tag = lines[i];
  lines.splice(i, 0, ...CHAR_FILES.map(f => tag.replace('engine/roster', f)));
  return lines.join('\n');
}
module.exports = { rebuild, PAGES };

if (require.main === module) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const p of PAGES) {
    const file = path.join(ROOT, p), html = fs.readFileSync(file, 'utf8'), next = rebuild(html);
    if (next === null) { console.error(`${p}: no roster.js script tag`); process.exit(2); }
    if (next === html) continue;
    stale++;
    if (check) console.error(`${p}: character script tags out of date (run node tools/dev/char-scripts.js)`);
    else { fs.writeFileSync(file, next); console.log(`${p}: updated`); }
  }
  process.exit(check && stale ? 1 : 0);
}
