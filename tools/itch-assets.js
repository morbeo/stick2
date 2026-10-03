// generates itch.io's optional promotional images from the app's own rendering code and icon font (tools/itch-render.html,
// headless Chrome over tools/chrome.js) — no external image files or editors, same philosophy as everything else drawn in code.
// usage: node tools/itch-assets.js   (CHROME=/path/to/chrome to override; writes to out/itch/)
const fs = require('fs'), path = require('path'), url = require('url'), chrome = require('./chrome'), engine = require('./engine');
const OUT = path.join(__dirname, '..', 'out', 'itch');
const PAGE = url.pathToFileURL(path.join(__dirname, 'itch-render.html')).href;

// a short ai vs ai fight, recorded as a replay; the frame where the camera shake (trauma) peaks is the most dramatic moment
function dramaticMoment() {
  const { run } = engine();
  return JSON.parse(run(`JSON.stringify((() => {
    const w = new World(SCENARIOS['ai vs ai'], {}, 3); w.loop = false;
    let bestFrame = 0, bestTrauma = 0;
    for (let i = 0; i < 300 && !w.done; i++) {
      w.advance(1 / 60, NOIN);
      if (w.trauma > bestTrauma) { bestTrauma = w.trauma; bestFrame = w.log.length; }
    }
    return { replay: makeReplay(w, 'itch promo'), frame: bestFrame };
  })())`));
}

function writePng(dataUrl, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
  console.log('wrote', path.relative(process.cwd(), file));
}

(async () => {
  const p = await chrome.launch(PAGE);
  try {
    for (let i = 0; i < 100 && !(await p.js('typeof renderPromo === "function"')); i++) await new Promise(r => setTimeout(r, 50));
    const { replay, frame } = dramaticMoment();
    const rep = JSON.stringify(replay);
    // social media image: 1200x630 (the common OG/Twitter card size)
    writePng(await p.js(`renderPromo(${rep}, ${frame}, 1200, 630, {})`), path.join(OUT, 'social.png'));
    // wide cover: itch.io asks for 21:9
    writePng(await p.js(`renderPromo(${rep}, ${frame}, 2100, 900, {})`), path.join(OUT, 'cover-wide.png'));
    // favicon: square, the same mark the app's own tab icon uses (src/ui.js)
    writePng(await p.js('renderMark(512)'), path.join(OUT, 'favicon.png'));
    // logo: transparent, horizontal, legible on light or dark (itch.io overlays it on promo modules)
    writePng(await p.js('renderLogo(1200, 300)'), path.join(OUT, 'logo.png'));
  } finally { p.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
