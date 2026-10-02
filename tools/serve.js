// the live bridge's server: the repo over HTTP on 127.0.0.1, and a channel to the app open in a browser there (src/bridge.js).
// The page listens on /bridge/events (server-sent events) for commands and posts each answer to /bridge/reply.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };

// → Promise of { port, url, command(name, args, ms) → result, pages() → count, close() }
function serve(port = 0, { version = '' } = {}) {
  const pages = new Set(), wait = new Map();
  let nid = 0;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/bridge/hello') return json(200, { stick2: 'bridge', version });
    if (u.pathname === '/bridge/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': hello\n\n');
      pages.add(res); req.on('close', () => pages.delete(res));
      return;
    }
    if (u.pathname === '/bridge/reply' && req.method === 'POST') {
      const parts = [];
      req.on('data', c => parts.push(c));
      req.on('end', () => {
        let m; try { m = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return json(400, { error: 'not JSON' }); }
        const w = wait.get(m.id);
        if (w) { wait.delete(m.id); clearTimeout(w.timer); m.ok ? w.ok(m.result) : w.no(new Error(m.error || 'the page failed')); }
        json(200, { ok: true });
      });
      return;
    }
    // static files under the repo, nothing outside it
    let file; try { file = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname)); } catch { return json(400, { error: 'bad path' }); }
    if (!file.startsWith(ROOT + path.sep) || /[\\/]\./.test(file.slice(ROOT.length))) return json(403, { error: 'outside the repo, or hidden (.git …)' });
    fs.readFile(file, (err, data) => {
      if (err) return json(404, { error: 'not found' });
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  // a command goes to the page that connected last (one tab answers, not every open one)
  const command = (name, args = {}, ms = 15000) => new Promise((ok, no) => {
    const page = [...pages].pop();
    if (!page) return no(new Error(`no page connected: open http://127.0.0.1:${server.address().port}/ in a browser`));
    const id = ++nid, timer = setTimeout(() => { wait.delete(id); no(new Error(`the page did not answer "${name}" within ${ms / 1000} s`)); }, ms);
    wait.set(id, { ok, no, timer });
    page.write(`data: ${JSON.stringify({ id, name, args })}\n\n`);
  });
  return new Promise((ok, no) => {
    server.once('error', no);
    server.listen(port, '127.0.0.1', () => {
      const p = server.address().port;
      ok({ port: p, url: `http://127.0.0.1:${p}/`, command, pages: () => pages.size,
        close: () => { for (const r of pages) r.end(); server.close(); } });
    });
  });
}
module.exports = serve;
