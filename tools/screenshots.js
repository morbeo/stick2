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
  experiment: [`lab.scen = 'J,J,K'; setMode('experiment'); lab.kind = 'sweep'; lab.x = { k: 'hitstop' }; build(); panels(); ${run(48)}`, [0, 80, 1100, 600]],
  // the content-manager grid tab: characters, its default collection, with its default variables shown per card
  grid: [`setMode('grid'); panels(); mode().render();`, [0, 80, 1100, 600]],
  fx: [`setMode('fx'); panels(); mode().render();`, [0, 80, 1100, 600]],
  tests: [`setMode('tests'); tests.move = null; rerunTests(); panels(); for (let i = 0; i < 400 && tests.queue.length; i++) testMode.tick(); panels();
    isolate(Object.keys(tests.res).find(k => failed(tests.res[k]))); ${run(45)}`, [0, 80, 1100, 600]],
  impact: [`setMode('impact'); panels(); ${run(25)}`, [0, 80, 1100, 600]],
  // crop reaches the page bottom (800) so the blow bar (under the preview, not the toolbar) is in frame
  ragdoll: [`setMode('impact'); lab.impact = 'ragdoll'; build(); panels(); ${run(5)} blow(lab.cells[0].w, 'launcher'); ${run(24)}`, [0, 40, 1100, 760]],
  hip: [`setMode('character'); panels(); creator.hover = 'hip'; ${run(30)}`, [0, 80, 1100, 600]],
  movepicker: [`setMode('animate'); anim.move = 'roundhouse'; animMode.enter(); panels(); ${run(10)} [...document.querySelectorAll('#ctx [data-part="move"] button')].find(b => b.textContent.includes('roundhouse')).click(); Object.assign(pop.style, { left: '368px', top: '83px', maxHeight: 'none' }); pop.firstChild.style.maxHeight = '570px';`, [340, 40, 660, 630]],
  compare: [`lab.scen = 'ai vs ai'; setMode('play'); build(); cmp.a = { name: 'current' }; cmp.b = { name: 'raw' }; setCfg({ hitstop: 0.12, gravity: 2600 }); openStage('compare'); ${run(10)}`, [0, 436, 1100, 340]],
  // the four effect looks, one per fighter (on every bone)
  effects: [`lab.scen = 'you vs 3 dummies'; setMode('play'); build(); panels(); ${run(40)}
    lab.cells[0].w.fighters.forEach((f, i) => { const look = ['lightning', 'aura', 'fire', 'smoke'][i]; f.ch = { ...f.ch, bones: f.ch.bones.map(b => ({ ...b, fx: { look } })) }; f.x = 180 + i * 240; }); ${run(12)}`, [0, 400, 1100, 370]],
  // setLink shows a chain into a special (6S) too, not just P / K
  combos: [`setMode('animate'); lay('animate').panel = 'combos'; setLink('jab', 'fwdSpecial', 'shoulderCharge'); panels(); mode().render();`, [0, 80, 1100, 600]],
  movetable: [`setMode('animate'); lay('animate').panel = 'table'; panels(); mode().render();`, [0, 80, 1100, 600]],
  inputs: [`setMode('animate'); lay('animate').panel = 'inputs'; panels(); mode().render();`, [0, 80, 1100, 600]],
  bonetable: [`setMode('character'); lay('character').panel = 'bones'; panels(); ${run(10)}`, [0, 80, 1100, 600]],
  // P2 set to AI to show the style / skill / limits row (otherwise only a human or dummy controller shows)
  builder: [`setMode('play'); newScen(); ${run(10)}
    [...document.querySelector('[data-p="1"]').querySelectorAll('button')].find(b => b.textContent.trim() === 'AI').click(); ${run(20)}`, [0, 440, 1100, 400]],
  // a stance's requirements, fly and transition rows, scrolled into view in the side panel
  stancereq: [`setMode('character'); pickChar('stick'); studio.stance = 1; lay().fold['character:stance pose'] = false; panels(); ${run(5)}
    [...document.querySelectorAll('#side h3')].find(el => el.textContent.toLowerCase().includes('stance pose')).scrollIntoView();`, [1080, 60, 320, 740]],
  fighters: [`lab.scen = 'ai 2v2'; setMode('play'); build(); panels(); ${run(30)} document.querySelectorAll('.fpick')[2].click();`, [0, 0, 1000, 700]],
  menubar: [`setMode('play'); panels(); ${run(30)} [...document.querySelectorAll('#global button')].find(b => b.dataset.tip?.startsWith('Export')).click();`, [0, 0, 1400, 160]],
  // a popup is placed to fit the small capture window: put it back where it opens in the full page
  layout: [`setMode('play'); panels(); ${run(30)} $('global').querySelector('button[data-tip^="Layout:"]').click(); Object.assign(pop.style, { left: '560px', top: '32px', maxHeight: 'none' });`, [540, 20, 460, 540]],
  debug: [`setMode('play'); panels(); ${run(90)} debugBtn().click(); Object.assign(pop.style, { left: '955px', top: '32px', maxHeight: 'none' }); dbgT = 0; drawDebug(); drawScope();`, [940, 20, 400, 540]],
  palette: [`setMode('play'); panels(); ${run(30)} openPalette(); const i = document.querySelector('#palette input'); i.value = 'table'; i.dispatchEvent(new Event('input'));`, [250, 0, 900, 520]],
  // the stats radar, scrolled into view in the side panel
  statsradar: [`setMode('character'); pickChar('stick'); panels(); ${run(5)}
    const sec = [...document.querySelectorAll('#side .fold')].find(s => s.querySelector('h3')?.textContent.toLowerCase().includes('radar'));
    sec.classList.remove('shut'); sec.querySelector('canvas').scrollIntoView({ block: 'start' });`, [1080, 330, 320, 310]],
  keys: [`setMode('play'); panels(); ${run(30)} const b = [...document.querySelectorAll('#global button')].find(x => x.dataset.tip?.startsWith('Keys:')); keysPanel(null, b);
    Object.assign(pop.style, { left: '680px', top: '32px', maxHeight: 'none' });`, [660, 20, 400, 700]],
  docspanel: [`setMode('play'); panels(); openDocs('specials'); docsFrame(); docsFrame();`, [0, 0, 1400, 800]],
  replay: [`lab.scen = 'you vs ai'; setMode('play'); const w = lab.cells[0].w;
    for (let i = 0; i < 400; i++) w.advance(1 / 60, { ...NOIN, right: i % 120 < 40, punch: i % 23 === 0, kick: i % 37 === 0 });
    rp.reel = null; setMode('replay'); panels();`, [0, 80, 1400, 600]],
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
