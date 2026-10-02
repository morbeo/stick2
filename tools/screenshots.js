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
  // the itch.io cover image (630 × 500)
  cover: [`lab.scen = 'ai vs ai'; setMode('play'); lab.meter = true; build(); panels(); ${run(150)}`, [440, 268, 630, 500]],
  animate: [`setMode('animate'); anim.move = 'roundhouse'; animMode.enter(); panels(); anim.t = 0.35; anim.playing = false; previewAt(anim.t); mode().render();`, [0, 80, 1100, 720]],
  character: [`setMode('character'); panels(); ${run(30)}`, [0, 80, 1400, 720]],
  gallery: [`setMode('gallery'); panels(); ${run(40)}`, [0, 80, 1100, 600]],
  grid: [`lab.scen = 'J,J,K'; setMode('grid'); lab.kind = 'sweep'; lab.x = { k: 'hitstop' }; build(); panels(); ${run(48)}`, [0, 80, 1100, 600]],
  tests: [`setMode('tests'); tests.move = null; rerunTests(); panels(); for (let i = 0; i < 400 && tests.queue.length; i++) testMode.tick(); panels();
    isolate(Object.keys(tests.res).find(k => failed(tests.res[k]))); ${run(45)}`, [0, 80, 1100, 600]],
  impact: [`setMode('impact'); panels(); ${run(25)}`, [0, 80, 1100, 600]],
  ragdoll: [`setMode('impact'); lab.impact = 'ragdoll'; build(); panels(); ${run(5)} blow(lab.cells[0].w, 'launcher'); ${run(24)}`, [0, 40, 1100, 640]],
  hip: [`setMode('character'); panels(); creator.hover = 'hip'; ${run(30)}`, [0, 80, 1100, 600]],
  movepicker: [`setMode('animate'); anim.move = 'roundhouse'; animMode.enter(); panels(); ${run(10)} [...document.querySelectorAll('#ctx [data-part="move"] button')].find(b => b.textContent.includes('roundhouse')).click(); Object.assign(pop.style, { left: '368px', top: '83px', maxHeight: 'none' }); pop.firstChild.style.maxHeight = '570px';`, [340, 40, 660, 630]],
  combos: [`setMode('animate'); lay('animate').panel = 'combos'; panels(); mode().render();`, [0, 80, 1100, 600]],
  movetable: [`setMode('animate'); lay('animate').panel = 'table'; panels(); mode().render();`, [0, 80, 1100, 600]],
  inputs: [`setMode('animate'); lay('animate').panel = 'inputs'; panels(); mode().render();`, [0, 80, 1100, 600]],
  bonetable: [`setMode('character'); lay('character').panel = 'bones'; panels(); ${run(10)}`, [0, 80, 1100, 600]],
  builder: [`setMode('play'); newScen(); ${run(30)}`, [0, 440, 1100, 360]],
  fighters: [`lab.scen = 'ai 2v2'; setMode('play'); build(); panels(); ${run(30)} document.querySelectorAll('.fpick')[2].click();`, [0, 0, 1000, 480]],
  menubar: [`setMode('play'); panels(); ${run(30)} [...document.querySelectorAll('#global button')].find(b => b.dataset.tip?.startsWith('Export')).click();`, [0, 0, 1400, 130]],
  // a popup is placed to fit the small capture window: put it back where it opens in the full page
  layout: [`setMode('play'); panels(); ${run(30)} $('global').querySelector('button[data-tip^="Layout:"]').click(); Object.assign(pop.style, { left: '560px', top: '32px', maxHeight: 'none' });`, [540, 20, 460, 540]],
  debug: [`setMode('play'); panels(); ${run(90)} debugBtn().click(); Object.assign(pop.style, { left: '955px', top: '32px', maxHeight: 'none' }); dbgT = 0; drawDebug(); drawScope();`, [940, 20, 400, 540]],
  palette: [`setMode('play'); panels(); ${run(30)} openPalette(); const i = document.querySelector('#palette input'); i.value = 'table'; i.dispatchEvent(new Event('input'));`, [250, 0, 900, 520]],
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
