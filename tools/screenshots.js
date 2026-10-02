// the README / docs screenshots: each shot runs a snippet in the app, then Chrome captures a crop of the page into docs/img
// usage: node tools/screenshots.js [name …]   (CHROME=/path/to/chrome to override; no name = every shot)
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), outDir = path.join(root, 'docs', 'img');
const chrome = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
if (!chrome) { console.log('no Chrome found (set CHROME)'); process.exit(1); }
// advance every world of the mode n frames, then draw once (headless Chrome barely runs requestAnimationFrame)
const run = n => `for (let i = 0; i < ${n}; i++) { mode().tick?.(1 / 60); for (const w of mode().worlds()) w.advance(1 / 60, NOIN); } mode().render();`;
// crop: [x, y, w, h] in page px of a 1400 × 800 window
const SHOTS = {
  play: [`lab.scen = 'ai vs ai'; setMode('play'); lab.meter = true; build(); panels(); ${run(150)}`, [0, 400, 1100, 370]],
  animate: [`setMode('animate'); anim.move = 'roundhouse'; animMode.enter(); panels(); anim.t = 0.35; anim.playing = false; previewAt(anim.t); mode().render();`, [0, 80, 1100, 720]],
  character: [`setMode('character'); panels(); ${run(30)}`, [0, 80, 1400, 720]],
  gallery: [`setMode('gallery'); panels(); ${run(40)}`, [0, 80, 1100, 600]],
  grid: [`lab.scen = 'J,J,K'; setMode('grid'); lab.kind = 'sweep'; lab.x = { k: 'hitstop' }; build(); panels(); ${run(48)}`, [0, 80, 1100, 600]],
  tests: [`setMode('tests'); tests.move = null; rerunTests(); panels(); for (let i = 0; i < 400 && tests.queue.length; i++) testMode.tick(); panels();
    isolate(Object.keys(tests.res).find(k => failed(tests.res[k]))); ${run(45)}`, [0, 80, 1100, 600]],
  impact: [`setMode('impact'); panels(); ${run(25)}`, [0, 80, 1100, 600]],
};
fs.mkdirSync(outDir, { recursive: true });
const page = path.join(os.tmpdir(), 'stick2-shot.html');
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS)) {
  const [code, [x, y, w, h]] = SHOTS[name];
  // the page keeps its 1400 × 800 layout and slides up-left so the crop lands in a window of the crop's size
  fs.writeFileSync(page, fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/(src|fonts)\//g, `file://${root}/$1/`).replace('</body>',
    `<script>localStorage.clear(); setTimeout(() => { document.documentElement.style.cssText = 'width:1400px;height:800px;overflow:hidden;transform:translate(-${x}px,-${y}px)';
      dispatchEvent(new Event('resize')); ${code}; app.speed = 0; }, 300);</script></body>`));
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars', `--window-size=${w},${h}`,
    '--virtual-time-budget=3000', `--screenshot=${path.join(outDir, name + '.png')}`, 'file://' + page], { stdio: 'ignore' });
  console.log('docs/img/' + name + '.png');
}
