// itch.io store screenshots showcasing the editing tools (character, animate, replay, experiment, fx, grid): each
// runs a snippet in the real app, then headless Chrome captures a crop of the page — same technique as tools/screenshots.js
// (the docs shots), just its own crop sizes and output folder. usage: node tools/itch-showcase.js [name …]
// (CHROME=/path/to/chrome to override; writes to out/itch/)
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), outDir = path.join(root, 'out', 'itch');
const chrome = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
if (!chrome) { console.log('no Chrome found (set CHROME)'); process.exit(1); }
const run = n => `for (let i = 0; i < ${n}; i++) { mode().tick?.(1 / 60); for (const w of mode().worlds()) w.advance(1 / 60, NOIN); } mode().render();`;
// crop: [x, y, w, h] in page px of a 1400 × 800 window; sized for a consistent 16:9-ish store screenshot
const SHOTS = {
  'showcase-character': [`setMode('character'); panels(); ${run(30)}`, [0, 40, 1400, 760]],
  'showcase-animate': [`setMode('animate'); anim.move = 'roundhouse'; animMode.enter(); panels(); anim.t = 0.35; anim.playing = false; previewAt(anim.t); mode().render();`, [0, 40, 1400, 760]],
  'showcase-replay': [`lab.scen = 'you vs ai'; setMode('play'); const w = lab.cells[0].w;
    for (let i = 0; i < 400; i++) w.advance(1 / 60, { ...NOIN, right: i % 120 < 40, punch: i % 23 === 0, kick: i % 37 === 0 });
    rp.reel = null; setMode('replay'); panels();`, [0, 40, 1400, 760]],
  'showcase-experiment': [`lab.scen = 'J,J,K'; setMode('experiment'); lab.kind = 'sweep'; lab.x = { k: 'hitstop' }; build(); panels(); ${run(48)}`, [0, 40, 1400, 760]],
  'showcase-fx': [`setMode('fx'); panels(); mode().render();`, [0, 40, 1400, 760]],
  'showcase-grid': [`setMode('grid'); panels(); mode().render();`, [0, 40, 1400, 760]],
};
fs.mkdirSync(outDir, { recursive: true });
const page = path.join(os.tmpdir(), 'stick2-itch-shot.html');
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS)) {
  const [code, [x, y, w, h]] = SHOTS[name];
  fs.writeFileSync(page, fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/(src|fonts)\//g, `file://${root}/$1/`).replace('</body>',
    `<script>localStorage.clear(); setTimeout(() => { document.documentElement.style.cssText = 'width:1400px;height:800px;overflow:hidden;transform:translate(-${x}px,-${y}px)';
      dispatchEvent(new Event('resize')); ${code}; app.speed = 0; }, 300);</script></body>`));
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars', `--window-size=${w},${h}`,
    '--virtual-time-budget=3000', `--screenshot=${path.join(outDir, name + '.png')}`, 'file://' + page], { stdio: 'ignore' });
  console.log('out/itch/' + name + '.png');
}
