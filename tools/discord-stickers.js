// animated Discord stickers (APNG, 320×320, under the 500 KB upload limit) for a handful of flashy special
// moves / transformations, built the same way as the docs' anim-*.png clips (headless Chrome, stepped frame by frame)
// usage: node tools/discord-stickers.js [name …]   (CHROME=/path/to/chrome to override; no name = every sticker)
// output: out/discord-stickers/<name>.png (out/ is gitignored: these are for uploading to Discord, not checked in)
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, '..'), outDir = path.join(root, 'out', 'discord-stickers');
const { findChrome, devtools } = require('./chrome'), chrome = findChrome();
const { apng } = require('./apng');
if (!chrome) { console.log('no Chrome found (set CHROME)'); process.exit(1); }

// name: [scenario, seconds (one loop), crop [x, y, w, h] in page px of a 1400×800 window (captured square, scaled to 320×320)]
const SQ = [230, 260, 420, 420]; // centred on the stage where every demo fighter stands, head to feet
const STICKERS = {
  'sticker-power-up': ['power up', 2.4, SQ],
  'sticker-fireball': ['fireball', 1.6, [160, 260, 420, 420]],
  'sticker-flash-kick': ['flash kick', 1.6, SQ],
  'sticker-lightning-legs': ['lightning legs', 1.6, SQ],
  'sticker-teleport': ['teleport', 1.6, SQ],
  'sticker-substitution': ['substitution', 2, SQ],
  'sticker-pounce': ['pounce', 2.4, SQ],
  'sticker-win-pose': ['win pose', 2, SQ],
};
const FPS = 20, STEP = 60 / FPS, SIZE = 320; // the engine runs at 60: three engine frames per animation frame

(async () => {
  const page = path.join(os.tmpdir(), 'stick2-sticker.html'), port = 9334;
  fs.writeFileSync(page, fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/(src|fonts)\//g, `file://${root}/$1/`)
    .replace('</body>', '<script>localStorage.clear();</script></body>'));
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars', '--window-size=1400,800',
    `--remote-debugging-port=${port}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'stick2-chrome-'))}`, 'file://' + page], { stdio: 'ignore' });
  try {
    const { ws, send } = await devtools(port), js = async code => { const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    await new Promise(r => setTimeout(r, 800)); // the app starts
    fs.mkdirSync(outDir, { recursive: true });
    for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(STICKERS)) {
      const [scen, secs, [x, y, w, h]] = STICKERS[name], scale = SIZE / w;
      // a fresh fight, the app's own loop stopped: frames come only from the steps below
      await js(`app.speed = 0; lab.scen = ${JSON.stringify(scen)}; setMode('play'); build(); panels(); app.speed = 0; mode().render(); true`);
      const frames = [];
      for (let i = 0; i < Math.round(secs * FPS); i++) {
        frames.push(Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale } })).data, 'base64'));
        await js(`for (let i = 0; i < ${STEP}; i++) { mode().tick?.(1 / 60); for (const w of mode().worlds()) w.advance(1 / 60, NOIN); } mode().render(); true`);
      }
      const file = path.join(outDir, name + '.png');
      fs.writeFileSync(file, apng(frames, Math.round(1000 / FPS)));
      const kb = Math.round(fs.statSync(file).size / 1024);
      console.log(`out/discord-stickers/${name}.png  ${frames.length} frames  ${kb} KB${kb > 500 ? '  (over Discord\'s 500 KB sticker limit!)' : ''}`);
    }
    ws.close();
  } finally { proc.kill(); }
})().catch(e => { console.error(e.message); process.exit(1); });
