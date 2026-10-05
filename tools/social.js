// the GitHub repo's social preview image (1280 × 640, Settings → General → Social preview): a grid of existing
// docs/img screenshots, composited by headless Chrome (CSS background-image, no new dependency). usage: node tools/social.js
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), imgDir = path.join(root, 'docs', 'img'), out = path.join(imgDir, 'social.png');
const { findChrome } = require('./chrome'), chrome = findChrome();
if (!chrome) { console.log('no Chrome found (set CHROME)'); process.exit(1); }

const W = 1280, H = 640, COLS = 3, ROWS = 2, cellW = W / COLS, cellH = H / ROWS;
// one tile per tool, each an existing docs/img shot (node tools/screenshots.js regenerates them)
const TILES = [
  ['play', 'fight'], ['animate', 'animate'], ['experiment', 'experiment'],
  ['character', 'build'], ['fx', 'fx'], ['gallery', 'gallery'],
];
const cells = TILES.map(([img, label], i) => {
  const x = (i % COLS) * cellW, y = Math.floor(i / COLS) * cellH;
  return `<div class="cell" style="left:${x}px;top:${y}px;width:${cellW}px;height:${cellH}px;background-image:url(file://${path.join(imgDir, img + '.png')})"><span>${label}</span></div>`;
}).join('');
const html = `<!doctype html><meta charset="utf-8"><style>
html, body { margin: 0; width: ${W}px; height: ${H}px; background: #222; overflow: hidden; font: 12px ui-monospace, Menlo, monospace; }
.cell { position: absolute; background-size: cover; background-position: center; box-sizing: border-box; border: 2px solid #222; }
.cell span { position: absolute; left: 7px; bottom: 5px; background: #222; color: #f3f0e8; padding: 2px 7px; border-radius: 3px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.badge { position: absolute; left: 16px; top: 13px; z-index: 2; color: #f3f0e8; font-weight: bold; font-size: 24px; letter-spacing: .01em; text-shadow: 0 1px 4px #000; }
.badge b { color: #e0998f; }
</style><body>${cells}<div class="badge">stick2<b>.</b></div></body>`;
const page = path.join(os.tmpdir(), 'stick2-social.html');
fs.writeFileSync(page, html);
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars', `--window-size=${W},${H}`,
  '--virtual-time-budget=2000', `--screenshot=${out}`, 'file://' + page], { stdio: 'inherit' });
console.log(path.relative(root, out));
