// the README / docs screenshots: each shot runs a snippet in the app, then Chrome captures a crop of the page into docs/img
// usage: node tools/render/screenshots.js [name …]   (CHROME=/path/to/chrome to override; no name = every shot)
//        node tools/render/screenshots.js --changed [ref]   only the shots whose sources changed since ref (default origin/master)
// required (release-notes.js): shoot(names, { root, out }) renders another checkout's app into another folder
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const here = path.join(__dirname, '..', '..');
const findChrome = () => process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
// advance every world of the mode n frames, then draw once (headless Chrome barely runs requestAnimationFrame)
const run = n => `for (let i = 0; i < ${n}; i++) { mode().tick?.(1 / 60); for (const w of mode().worlds()) w.advance(1 / 60, NOIN); } mode().render();`;
// crop: [x, y, w, h] in page px of a 1400 × 800 window; an optional third [w, h] sets another page size (a phone)
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
  debug: [`setMode('play'); panels(); ${run(90)} debugBtn().click(); Object.assign(pop.style, { left: '955px', top: '32px', maxHeight: 'none' }); dbgT = 0; drawDebug();`, [940, 20, 400, 540]],
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
  // the play tab's netplay section with a hosted lobby open; the invite fills in once WebRTC has made the offer, and its
  // link is shown as the Pages URL (the QR still holds the local file's)
  netplay: [`closeWelcome(); lab.scen = 'you vs ai'; setMode('play'); build(); ${run(30)} openNetplay(true); $('side').scrollTop = 0;
    setInterval(() => net.box.querySelectorAll('textarea').forEach(t => t.value = t.value.replace(/^file:.*?#/, 'https://morbeo.github.io/stick2/#')), 100);`, [600, 40, 800, 760]],
  // a phone held upright: the mobile layout with the on-screen pad
  phone: [`closeWelcome(); touchPad(true); lab.scen = 'you vs ai'; setMode('play'); build(); panels(); ${run(60)} tpSync?.();`, [0, 0, 390, 844], [390, 844]],
};
// the sources each shot shows: a change to one of these (path prefixes) puts the shot in --changed and in the release notes.
// every shot also depends on src/ui/ui.js and index.html, which would select all of them, so those are left out
const PLAY = ['src/editor/lab.js', 'src/engine/'], ANIM = ['src/editor/studio.js', 'src/engine/clip.js', 'src/engine/rig.js'];
const TOUCHES = {
  play: PLAY, animate: ANIM, character: ['src/editor/creator.js', 'src/engine/roster.js', 'src/engine/shapes.js', 'src/engine/rig.js'],
  gallery: ['src/engine/roster.js', 'gallery.html'], experiment: ['src/editor/lab.js', 'src/editor/matrix.js'], grid: ['src/editor/gridlab.js'],
  fx: ['src/editor/fxlab.js', 'src/engine/fx.js'], tests: ['src/engine/checks.js'], impact: ['src/engine/fighter.js', 'src/engine/world.js'],
  ragdoll: ['src/engine/fighter.js', 'src/engine/world.js'], hip: ['src/editor/creator.js'], movepicker: ['src/editor/studio.js', 'src/editor/propedit.js'],
  compare: ['src/editor/compare.js'], effects: ['src/engine/fx.js'], combos: ['src/engine/combos.js'], movetable: ['src/editor/studio.js', 'src/editor/tracker.js'],
  inputs: ['src/engine/inputs.js'], bonetable: ['src/editor/creator.js', 'src/engine/shapes.js'], builder: ['src/engine/scenarios.js', 'src/engine/brain.js'],
  stancereq: ['src/editor/creator.js'], fighters: ['src/engine/roster.js', 'src/editor/lab.js'], menubar: ['src/ui/layout.js', 'src/ui/app.js'],
  layout: ['src/ui/layout.js'], debug: ['src/ui/app.js'], palette: ['src/ui/palette.js'], statsradar: ['src/editor/creator.js'], keys: ['src/ui/keys.js'],
  docspanel: ['src/ui/docs.js'], replay: ['src/engine/replay.js'], netplay: ['src/net/'], phone: ['src/ui/touch.js'],
};
// the shots that show any of the changed files, closest match first (a file named outright beats a whole folder)
const affected = files => Object.keys(SHOTS).map(n => [n, Math.max(0, ...(TOUCHES[n] || []).filter(t => files.some(f => f.startsWith(t))).map(t => t.length))])
  .filter(([, s]) => s).sort((a, b) => b[1] - a[1]).map(([n]) => n);

// renders names from the app in root into out (both default to this checkout's docs/img) → the written paths
function shoot(names = Object.keys(SHOTS), { root = here, out = path.join(here, 'docs', 'img') } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error('no Chrome found (set CHROME=/path/to/chrome)');
  fs.mkdirSync(out, { recursive: true });
  const page = path.join(os.tmpdir(), 'stick2-shot.html'), done = [];
  for (const name of names) {
    if (!SHOTS[name]) throw new Error(`unknown shot ${name} (one of: ${Object.keys(SHOTS).join(', ')})`);
    const [code, [x, y, w, h], [pw, ph] = [1400, 800]] = SHOTS[name];
    // the page keeps its layout (1400 × 800 unless the shot sets one) and slides up-left so the crop lands in a window of the crop's size
    fs.writeFileSync(page, fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/(src|fonts)\//g, `file://${root}/$1/`).replace('</body>',
      `<script>localStorage.clear(); setTimeout(() => { document.documentElement.style.cssText = 'width:${pw}px;height:${ph}px;overflow:hidden;transform:translate(-${x}px,-${y}px)';
        dispatchEvent(new Event('resize')); ${code}; app.speed = 0; }, 300);</script></body>`));
    const file = path.join(out, name + '.png');
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files', '--hide-scrollbars', `--window-size=${w},${h}`,
      '--virtual-time-budget=6000', `--screenshot=${file}`, 'file://' + page], { stdio: 'ignore' });
    done.push(file);
  }
  return done;
}

module.exports = { SHOTS, TOUCHES, affected, shoot };

if (require.main === module) {
  const args = process.argv.slice(2);
  let names = args.length ? args : undefined;
  if (args[0] === '--changed') {
    const files = execFileSync('git', ['diff', '--name-only', `${args[1] || 'origin/master'}...HEAD`], { cwd: here, encoding: 'utf8' }).split('\n').filter(Boolean);
    names = affected(files);
    if (!names.length) { console.log('no shot shows the changed files'); process.exit(0); }
  }
  try { for (const f of shoot(names)) console.log(path.relative(here, f)); } catch (e) { console.error(e.message); process.exit(1); }
}
