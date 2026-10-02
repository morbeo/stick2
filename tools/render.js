// pictures of a fight for the MCP server: PNGs and GIFs from headless Chrome (tools/render.html)
const fs = require('fs'), path = require('path'), url = require('url'), chrome = require('./chrome');
const PAGE = url.pathToFileURL(path.join(__dirname, 'render.html')).href;

// one Chrome for the whole session, started on first use and killed when the process exits (the exit handler cannot wait: live)
let page = null, live = null;
function browser() {
  page ??= chrome.launch(PAGE).then(async p => {
    live = p;
    for (let i = 0; i < 100 && !(await p.js('typeof renderAt === "function" && typeof gifEncode === "function"')); i++) await new Promise(r => setTimeout(r, 50));
    return p;
  }).catch(e => { page = null; throw e; });
  return page;
}
const stop = () => { live?.close(); live = page = null; };
process.on('exit', stop);

// frames of a replay → [{ frame, png }] (base64)
async function frames(s, replay, list, w, h, opts = {}) {
  const fr = [...list].sort((a, b) => a - b);
  const p = await browser();
  const urls = await p.js(`renderAt(${JSON.stringify(replay)}, ${JSON.stringify(fr)}, ${w}, ${h}, ${JSON.stringify(opts)})`);
  return urls.map((u, i) => ({ frame: fr[i], png: u.slice(u.indexOf(',') + 1) }));
}
// a GIF of frames from..to at fps (the engine runs at 60) written to file → { path, frames, bytes, first (PNG base64) }
async function gif(s, replay, { from, to, fps, w, h, file, ...opts }) {
  const step = Math.max(1, Math.round(60 / fps)), list = [];
  for (let f = from; f <= to; f += step) list.push(f);
  if (list.length > 900) throw new Error(`${list.length} frames is too many for one GIF (900 at most): narrow from / to or lower fps`);
  const p = await browser();
  const r = await p.js(`renderGif(${JSON.stringify(replay)}, ${JSON.stringify(list)}, ${w}, ${h}, ${Math.max(2, Math.round(100 * step / 60))}, ${JSON.stringify(opts)})`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const buf = Buffer.from(r.gif, 'base64');
  fs.writeFileSync(file, buf);
  return { path: file, frames: r.frames, bytes: buf.length, first: r.first.slice(r.first.indexOf(',') + 1) };
}
module.exports = { frames, gif, stop };
