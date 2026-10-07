// generates itch.io's optional promotional images from the app's own rendering code and icon font (tools/itch-render.html,
// headless Chrome over tools/chrome.js) — no external image files or editors, same philosophy as everything else drawn in code.
// usage: node tools/itch-assets.js   (CHROME=/path/to/chrome to override; writes to out/itch/)
const fs = require('fs'), path = require('path'), url = require('url'), chrome = require('./chrome'), engine = require('./engine');
const OUT = path.join(__dirname, '..', 'out', 'itch');
const PAGE = url.pathToFileURL(path.join(__dirname, 'itch-render.html')).href;

// a free-for-all between four of the roster's own characters (not just two stick recolours), recorded as a replay;
// picks the frame with the best mix of high trauma (camera shake: a real hit, not just movement) and all four
// fighters actually close together (a wide spread makes a messy, empty-feeling composition) - the seed is hand-picked
// from a handful tried for landing a tight, early clash; the shot's zoom/x centres the camera on that cluster, since
// the full arena (tried first) leaves most of the frame as empty sky above the action
function dramaticMoment(chars, seed) {
  const { run } = engine();
  return JSON.parse(run(`JSON.stringify((() => {
    const w = new World({ ...SCENARIOS['ai free-for-all'], chars: ${JSON.stringify(chars)} }, {}, ${seed}); w.loop = false;
    let best = null;
    for (let i = 0; i < 600 && !w.done; i++) {
      w.advance(1 / 60, NOIN);
      const xs = w.fighters.map(f => f.x), spread = Math.max(...xs) - Math.min(...xs), score = w.trauma - spread / 400;
      if (!best || score > best.score) best = { frame: w.log.length, score, x: xs.reduce((a, b) => a + b) / xs.length };
    }
    return { replay: makeReplay(w, 'itch promo'), frame: best.frame, x: best.x };
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
    const { replay, frame, x } = dramaticMoment(['hadoo', 'grumbo', 'sneeko', 'gloomo'], 2);
    const rep = JSON.stringify(replay);
    // hud off: with four fighters clustered this close, their health bars and hit/counter callouts collide and
    // overlap illegibly - a clean action pose reads better as a poster than a cluttered one anyway
    const shot = `{ zoom: 2.6, x: ${x}, hud: false }`;
    // social media image: 1200x630 (the common OG/Twitter card size)
    writePng(await p.js(`renderPromo(${rep}, ${frame}, 1200, 630, ${shot})`), path.join(OUT, 'social.png'));
    // wide cover: itch.io asks for 21:9
    writePng(await p.js(`renderPromo(${rep}, ${frame}, 2100, 900, ${shot})`), path.join(OUT, 'cover-wide.png'));
    // banner: a wide, shareable crop (forum posts, a profile header…) with a different matchup than the cover/social
    // shot above, so anyone seeing both doesn't just get the same picture cropped differently
    const bannerMoment = dramaticMoment(['centaur', 'otkopod', 'houndo', 'hicco'], 2);
    const bannerShot = `{ zoom: 2.2, x: ${bannerMoment.x}, hud: false }`;
    writePng(await p.js(`renderPromo(${JSON.stringify(bannerMoment.replay)}, ${bannerMoment.frame}, 1600, 500, ${bannerShot})`), path.join(OUT, 'banner.png'));
    // background: itch.io's page-theme background (Edit theme → Background image) sits behind the whole page, so it
    // needs to read as atmosphere, not a picture to look at - the same cluster centred (full arena left it a tiny,
    // off-centre blob in an empty frame), blurred, darkened and vignetted at the edges
    writePng(await p.js(`renderScene(${rep}, ${frame}, 1920, 1080, { zoom: 1.6, x: ${x}, hud: false, blur: 14, darken: 0.5, vignette: 0.4 })`), path.join(OUT, 'background.png'));
    // embed background: itch.io's embed options can show an image around the game's iframe (viewport is 1400x800,
    // see docs/development.md) on screens wider than that - same source fight as the background above for a
    // consistent look, cropped tighter and lighter-touch so it frames the game rather than competing with it
    writePng(await p.js(`renderScene(${rep}, ${frame}, 1920, 1080, { zoom: 1.4, x: ${x}, hud: false, blur: 6, darken: 0.35, vignette: 0.25 })`), path.join(OUT, 'embed-bg.png'));
    // favicon: square, the same mark the app's own tab icon uses (src/ui.js)
    writePng(await p.js('renderMark(512)'), path.join(OUT, 'favicon.png'));
    // logo: transparent, horizontal, legible on light or dark (itch.io overlays it on promo modules)
    writePng(await p.js('renderLogo(1200, 300)'), path.join(OUT, 'logo.png'));
  } finally { p.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
