// the docs' short animations: each clip plays a scenario in the app (headless Chrome, stepped frame by frame) and saves one
// loop of it as an animated PNG in docs/img (plays like a GIF on GitHub, in full colour; built with node's zlib, no dependencies)
// usage: node tools/animations.js [name …]   (CHROME=/path/to/chrome to override; no name = every clip)
const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib'), { spawn } = require('child_process');
const root = path.join(__dirname, '..'), outDir = path.join(root, 'docs', 'img');
const { findChrome, devtools } = require('./chrome'), chrome = findChrome();
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
};
const FPS = 20, STEP = 60 / FPS; // the engine runs at 60: three engine frames per animation frame

// a PNG's pixels (8-bit RGB or RGBA, not interlaced, as Chrome writes them): { w, h, bpp, px, ihdr }
function decode(png) {
  const cs = []; for (let i = 8; i < png.length;) { const n = png.readUInt32BE(i); cs.push([png.toString('ascii', i + 4, i + 8), png.subarray(i + 8, i + 8 + n)]); i += 12 + n; }
  const ihdr = cs.find(c => c[0] === 'IHDR')[1], w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4), bpp = { 2: 3, 6: 4 }[ihdr[9]];
  if (ihdr[8] !== 8 || !bpp || ihdr[12]) throw new Error('not an 8-bit RGB / RGBA PNG');
  const raw = zlib.inflateSync(Buffer.concat(cs.filter(c => c[0] === 'IDAT').map(c => c[1]))), row = w * bpp, px = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) { const f = raw[y * (row + 1)], src = y * (row + 1) + 1, o = y * row;
    for (let x = 0; x < row; x++) { const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - row + x] : 0, c = x >= bpp && y ? px[o - row + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      px[o + x] = raw[src + x] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]; } }
  return { w, h, bpp, px, ihdr };
}
// a rectangle of pixels, each row filtered the way that leaves the smallest sum (the usual PNG heuristic), deflated
function encode({ w, bpp, px }, rx, ry, rw, rh) {
  const row = rw * bpp, out = Buffer.alloc((row + 1) * rh), at = (x, y) => (y * w + rx) * bpp + x;
  for (let y = 0; y < rh; y++) {
    let best = null;
    for (let f = 0; f < 5; f++) { const line = Buffer.alloc(row + 1); line[0] = f; let sum = 0;
      for (let x = 0; x < row; x++) { const v = px[at(x, ry + y)], a = x >= bpp ? px[at(x - bpp, ry + y)] : 0, b = y ? px[at(x, ry + y - 1)] : 0, c = x >= bpp && y ? px[at(x - bpp, ry + y - 1)] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const d = (v - [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255; line[x + 1] = d; sum += d < 128 ? d : 256 - d; }
      if (!best || sum < best.sum) best = { sum, line }; }
    best.line.copy(out, y * (row + 1));
  }
  return zlib.deflateSync(out, { level: 9 });
}
// an animated PNG: the first frame whole (a plain viewer shows it), then each frame only the rectangle that changed since the one before
// (the stage stays put, so that is about the fighters); a frame that changes nothing lengthens the one before it
function apng(pngs, delayMs) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4);
    len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const caps = pngs.map(decode), { w, h, bpp: cbpp } = caps[0];
  // one palette for every frame, like a GIF: the 256 commonest colours (flat art: almost every pixel), the rest (anti-aliased edges) to the nearest
  const count = new Map();
  for (const c of caps) for (let o = 0; o < c.px.length; o += cbpp) { const k = c.px.readUIntBE(o, 3); count.set(k, (count.get(k) || 0) + 1); }
  const pal = [...count.keys()].sort((a, b) => count.get(b) - count.get(a)).slice(0, 256), idx = new Map();
  const near = k => { if (!idx.has(k)) { let best = 0, bd = Infinity;
    pal.forEach((p, i) => { const d = ((p >> 16) - (k >> 16)) ** 2 + ((p >> 8 & 255) - (k >> 8 & 255)) ** 2 + ((p & 255) - (k & 255)) ** 2; if (d < bd) { bd = d; best = i; } }); idx.set(k, best); }
    return idx.get(k); };
  const frames = caps.map(c => { const px = Buffer.alloc(w * h); for (let i = 0; i < px.length; i++) px[i] = near(c.px.readUIntBE(i * cbpp, 3)); return { w, bpp: 1, px }; });
  const bpp = 1, ihdr = Buffer.alloc(13), plte = Buffer.alloc(pal.length * 3);
  ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 3; // 8-bit indexed colour
  pal.forEach((p, i) => plte.writeUIntBE(p, i * 3, 3));
  const shots = [{ rect: [0, 0, w, h], i: 0, n: 1 }];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].px, b = frames[i].px; let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * bpp;
      if (a.compare(b, o, o + bpp, o, o + bpp)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
    if (x1 < 0) shots.at(-1).n++; else shots.push({ rect: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], i, n: 1 });
  }
  const parts = [pngs[0].subarray(0, 8), chunk('IHDR', ihdr), chunk('PLTE', plte)];
  const actl = Buffer.alloc(8); actl.writeUInt32BE(shots.length); actl.writeUInt32BE(0, 4); parts.push(chunk('acTL', actl)); // 0 = loop forever
  let seq = 0;
  for (const [k, { rect: [x, y, rw, rh], i, n }] of shots.entries()) {
    const f = Buffer.alloc(26); f.writeUInt32BE(seq++); f.writeUInt32BE(rw, 4); f.writeUInt32BE(rh, 8); f.writeUInt32BE(x, 12); f.writeUInt32BE(y, 16);
    f.writeUInt16BE(delayMs * n, 20); f.writeUInt16BE(1000, 22); // dispose none, blend source: the rectangle replaces what was there
    parts.push(chunk('fcTL', f));
    const data = encode(frames[i], x, y, rw, rh);
    if (!k) parts.push(chunk('IDAT', data));
    else { const s = Buffer.alloc(4); s.writeUInt32BE(seq++); parts.push(chunk('fdAT', Buffer.concat([s, data]))); }
  }
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

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
