// keeps the <script> tags of the engine's file groups (tools/lib/engine.js GROUPS: the rig files, and every character
// file in src/engine/chars/index.json plus roster.js) in every page, in load order where the group's first tag was.
// Run after adding a character; --check only reports (exit 1 if a page is stale)
// usage: node tools/dev/char-scripts.js [--check]
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { GROUPS } = require('../lib/engine');
const PAGES = ['index.html', 'tools/render/render.html', 'tools/render/icons.html', 'tools/itch/itch-render.html'];

const src = f => `src/${f}.js"></script>`;
// the page's text with the tags of each group it loads rebuilt (null if it loads none)
function rebuild(html) {
  let lines = html.split('\n'), found = 0;
  for (const files of Object.values(GROUPS)) {
    const i = lines.findIndex(l => files.some(f => l.endsWith(src(f))));
    if (i < 0) continue;
    found++;
    const tag = lines[i], at = files.find(f => tag.endsWith(src(f)));
    lines = lines.filter((l, j) => j === i || !files.some(f => l.endsWith(src(f))));
    lines.splice(i, 1, ...files.map(f => tag.replace(src(at), src(f))));
  }
  return found ? lines.join('\n') : null;
}
module.exports = { rebuild, PAGES };

if (require.main === module) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const p of PAGES) {
    const file = path.join(ROOT, p), html = fs.readFileSync(file, 'utf8'), next = rebuild(html);
    if (next === null) { console.error(`${p}: loads none of the engine groups`); process.exit(2); }
    if (next === html) continue;
    stale++;
    if (check) console.error(`${p}: character script tags out of date (run node tools/dev/char-scripts.js)`);
    else { fs.writeFileSync(file, next); console.log(`${p}: updated`); }
  }
  process.exit(check && stale ? 1 : 0);
}
