// one square transparent PNG per built-in character's stance, sized for Discord's emoji upload (512, Discord downscales to 128)
// usage: node tools/discord-emojis.js [name …]   (CHROME=/path/to/chrome to override; no name = every built-in)
// output: out/discord-emojis/<name>.png (out/ is gitignored: these are for uploading to Discord, not checked in)
const fs = require('fs'), path = require('path'), url = require('url'), chrome = require('./chrome');
const root = path.join(__dirname, '..'), outDir = path.join(root, 'out', 'discord-emojis');
const PAGE = url.pathToFileURL(path.join(__dirname, 'icons.html')).href;

(async () => {
  const page = await chrome.launch(PAGE);
  try {
    for (let i = 0; i < 100 && !(await page.js('typeof charIcon === "function"')); i++) await new Promise(r => setTimeout(r, 50));
    const names = process.argv.slice(2).length ? process.argv.slice(2) : await page.js('charIconNames()');
    fs.mkdirSync(outDir, { recursive: true });
    for (const name of names) {
      const u = await page.js(`charIcon(${JSON.stringify(name)}, 512)`);
      fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(u.slice(u.indexOf(',') + 1), 'base64'));
    }
    console.log(`${names.length} icon(s) -> ${outDir}`);
  } finally { page.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
