// the docs' short animations: each clip plays a scenario in the app (headless Chrome, stepped frame by frame) and saves one
// loop of it as an animated PNG in docs/img (plays like a GIF on GitHub, in full colour; built with node's zlib, no dependencies)
// usage: node tools/animations.js [name …]   (CHROME=/path/to/chrome to override; no name = every clip)
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, '..'), outDir = path.join(root, 'docs', 'img');
const { findChrome, devtools } = require('./chrome'), chrome = findChrome();
const { apng } = require('./apng');
if (!chrome) { console.log('no Chrome found (set CHROME)'); process.exit(1); }
// name: [scenario, seconds (one loop: the scenario's period), crop [x, y, w, h] in page px of a 1400 × 800 window, settings]
const CROP = [220, 395, 500, 200];
const CLIPS = {
  'anim-chain': ['J,J,K', 1.6, CROP],
  'anim-parry': ['parry', 2, CROP],
  'anim-just-guard': ['just guard', 2, CROP],
  'anim-throw': ['throw', 2.4, CROP],
  'anim-throw-break': ['throw break', 2.4, CROP],
  'anim-tech': ['tech', 2.4, CROP],
  'anim-air-recover': ['air recover', 2.4, [220, 395, 600, 200]],
  'anim-wall-bounce': ['wall bounce', 2.4, [520, 395, 500, 200]],
  'anim-fireball': ['fireball', 2, [90, 395, 820, 200]],
  'anim-laser-beam': ['laser beam', 2, [90, 395, 820, 200]],
  'anim-grenade': ['grenade', 2.6, [90, 300, 820, 300]],
  'anim-multi-shot': ['multi shot', 2, [90, 350, 820, 250]],
  'anim-fireball-reflect': ['fireball reflect', 2.2, [90, 395, 820, 200]],
  'anim-chase-jump': ['chase jump', 2.4, CROP],
  'anim-catch': ['catch', 2.4, CROP],
  'anim-substitution': ['substitution', 2.4, CROP],
  'anim-roll-through': ['roll through', 2, CROP],
  'anim-teleport': ['teleport', 2, CROP],
  'anim-wall-jump': ['wall jump', 1.2, [0, 220, 300, 400]],
  'anim-ninja-run': ['ninja run', 1.4, [60, 395, 820, 200]],
  'anim-guard-cancel': ['guard cancel', 2, CROP],
  'anim-push-block': ['push block', 2, CROP],
  'anim-wake-up-attack': ['wake-up attack', 2.6, CROP],
  'anim-wake-up-roll': ['wake-up roll', 2.6, CROP],
  'anim-taunt': ['taunt', 1.6, CROP],
  'anim-power-up': ['power up', 2.4, CROP],
  'anim-win-pose': ['win pose', 3, CROP],
  'anim-pounce': ['pounce', 3, CROP],
  'anim-flash-kick': ['flash kick', 2, CROP],
  'anim-lightning-legs': ['lightning legs', 2, CROP],
  'anim-pickup-slash': ['pick up & slash', 5, CROP],
  'anim-weapon-clash': ['weapon clash', 2, CROP],
};
const FPS = 20, STEP = 60 / FPS; // the engine runs at 60: three engine frames per animation frame

(async () => {
  const page = path.join(os.tmpdir(), 'stick2-anim.html'), port = 9333;
  fs.writeFileSync(page, fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/(src|fonts)\//g, `file://${root}/$1/`)
    .replace('</body>', '<script>localStorage.clear();</script></body>'));
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars', '--window-size=1400,800',
    `--remote-debugging-port=${port}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'stick2-chrome-'))}`, 'file://' + page], { stdio: 'ignore' });
  try {
    const { ws, send } = await devtools(port), js = async code => { const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    await new Promise(r => setTimeout(r, 800)); // the app starts
    fs.mkdirSync(outDir, { recursive: true });
    for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CLIPS)) {
      const [scen, secs, [x, y, w, h], cfg] = CLIPS[name];
      // a fresh fight, the app's own loop stopped: frames come only from the steps below
      await js(`app.speed = 0; lab.scen = ${JSON.stringify(scen)}; ${cfg ? `setCfg(${JSON.stringify(cfg)});` : ''} setMode('play'); build(); panels(); app.speed = 0; mode().render(); true`);
      const frames = [];
      for (let i = 0; i < Math.round(secs * FPS); i++) {
        frames.push(Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 } })).data, 'base64'));
        await js(`for (let i = 0; i < ${STEP}; i++) { mode().tick?.(1 / 60); for (const w of mode().worlds()) w.advance(1 / 60, NOIN); } mode().render(); true`);
      }
      const file = path.join(outDir, name + '.png');
      fs.writeFileSync(file, apng(frames, Math.round(1000 / FPS)));
      console.log(`docs/img/${name}.png  ${frames.length} frames  ${Math.round(fs.statSync(file).size / 1024)} KB`);
    }
    ws.close();
  } finally { proc.kill(); }
})().catch(e => { console.error(e.message); process.exit(1); });
