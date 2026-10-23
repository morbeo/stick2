'use strict';
// ---------- stick2 dedicated server: serves the game, relays netplay rooms over WebSocket, reports health and metrics ----------
//   GET /            the game itself (the repository's static files), so a #server= link opens it from here
//   GET /healthz     200 "ok", or 503 "draining" while shutting down
//   GET /metrics     Prometheus metrics (a bearer token if METRICS_TOKEN is set)
//   GET /api/rooms   the public rooms, as JSON
//   WS  /ws          the relay (relay.js)
// Configured by environment variables, every one with a default (see docs/server.md):
const fs = require('fs'), path = require('path'), http = require('http');
const { WebSocketServer } = require('ws');
const { Relay } = require('./relay');
const { Registry } = require('./metrics');

const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };
function config(env = process.env) {
  return {
    port: num(env.PORT, 8080),
    host: env.HOST || '0.0.0.0',
    name: env.SERVER_NAME || 'stick2 server',
    region: env.REGION || '',
    staticDir: env.STATIC_DIR === '' ? null : path.resolve(env.STATIC_DIR || path.join(__dirname, '..')),
    maxRooms: num(env.MAX_ROOMS, 500),
    maxConns: num(env.MAX_CONNECTIONS, 2000),
    perIp: num(env.MAX_PER_IP, 16),
    msgRate: num(env.MSG_RATE, 200), // messages a second per connection (a match sends ~60)
    maxBytes: num(env.MAX_MESSAGE_BYTES, 1 << 20), // a match header carries whole character definitions
    drainMs: num(env.DRAIN_TIMEOUT, 600) * 1000,
    metricsToken: env.METRICS_TOKEN || '',
    trustProxy: env.TRUST_PROXY === '1',
    log: env.LOG_LEVEL || 'info',
  };
}
const VERSION = (() => { try { return require('../package.json').version || require('./package.json').version || 'dev'; } catch { return 'dev'; } })();
const COMMIT = process.env.COMMIT || 'dev';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
// nothing from the server itself, dependencies, git or dotfiles
const HIDDEN = /(^|\/)(\.|node_modules(\/|$)|server(\/|$)|tools(\/|$)|tests(\/|$)|package(-lock)?\.json$)/;

function start(cfg = config()) {
  const log = (level, msg, extra = {}) => { if (cfg.log === 'quiet' || (level === 'debug' && cfg.log !== 'debug')) return; process.stdout.write(JSON.stringify({ time: new Date().toISOString(), level, msg, ...extra }) + '\n'); };
  const reg = new Registry(), started = Date.now();
  const M = {
    build: reg.gauge('build_info', 'Version and commit of the running server', () => ({ [`version="${VERSION}",commit="${COMMIT}"`]: 1 })),
    uptime: reg.gauge('uptime_seconds', 'Seconds since the server started', () => (Date.now() - started) / 1000),
    draining: reg.gauge('draining', '1 while the server is shutting down', () => relay.draining ? 1 : 0),
    conns: reg.gauge('connections', 'Open WebSocket connections'),
    rooms: reg.gauge('rooms', 'Open rooms'),
    roomPhase: reg.gauge('rooms_by_phase', 'Open rooms by lobby phase', () => Object.fromEntries(Object.entries(relay.phases()).map(([p, n]) => [`phase="${p}"`, n]))),
    players: reg.gauge('players_online', 'Players and spectators in rooms', () => { let n = 0; for (const r of relay.rooms.values()) n += 1 + r.guests.size; return n; }),
    spectators: reg.gauge('spectators', 'Spectators in rooms (as the hosts report them)', () => { let n = 0; for (const r of relay.rooms.values()) n += r.watchers; return n; }),
    connsTotal: reg.counter('connections_total', 'WebSocket connections accepted'),
    rejected: reg.counter('connections_rejected_total', 'WebSocket connections turned away, by reason'),
    disconnects: reg.counter('disconnects_total', 'WebSocket connections closed, by reason'),
    msgs: reg.counter('ws_messages_total', 'WebSocket messages, by direction and type'),
    bytes: reg.counter('ws_bytes_total', 'WebSocket bytes, by direction'),
    limited: reg.counter('ratelimited_total', 'Messages dropped by the rate limit'),
    refused: reg.counter('requests_refused_total', 'Requests refused, by reason'),
    joins: reg.counter('joins_total', 'Guests that joined a room'),
    matches: reg.counter('matches_total', 'Matches started'),
    finished: reg.counter('matches_finished_total', 'Matches played to the end'),
    matchSeconds: reg.histogram('match_duration_seconds', 'How long matches last', [15, 30, 60, 90, 120, 180, 300, 600]),
    roomSeconds: reg.histogram('room_lifetime_seconds', 'How long rooms stay open', [30, 60, 300, 900, 1800, 3600, 7200]),
    rtt: reg.histogram('rtt_seconds', 'Round trip between the server and its clients (WebSocket ping)', [0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.5, 1]),
    http: reg.counter('http_requests_total', 'HTTP requests, by route and status'),
  };
  const relay = new Relay({ maxRooms: cfg.maxRooms, metrics: M });

  // ---------- HTTP ----------
  const send = (res, status, body, type = 'text/plain; charset=utf-8', route = 'other') => {
    M.http.inc({ route, status });
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    res.end(body);
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    if (url.pathname === '/healthz') return relay.draining ? send(res, 503, 'draining\n', undefined, 'healthz') : send(res, 200, 'ok\n', undefined, 'healthz');
    if (url.pathname === '/metrics') {
      if (cfg.metricsToken && req.headers.authorization !== `Bearer ${cfg.metricsToken}`) return send(res, 401, 'unauthorized\n', undefined, 'metrics');
      return send(res, 200, reg.text(), 'text/plain; version=0.0.4; charset=utf-8', 'metrics');
    }
    if (url.pathname === '/api/rooms') return send(res, 200, JSON.stringify({ server: cfg.name, region: cfg.region, version: VERSION, rooms: relay.list() }), 'application/json', 'api');
    if (!cfg.staticDir) return send(res, 404, 'not found\n');
    let rel;
    try { rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'; } catch { return send(res, 400, 'bad path\n'); }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(cfg.staticDir, rel);
    if (!file.startsWith(cfg.staticDir + path.sep) || HIDDEN.test(rel)) return send(res, 404, 'not found\n', undefined, 'static');
    fs.readFile(file, (err, data) => err ? send(res, 404, 'not found\n', undefined, 'static') : send(res, 200, req.method === 'HEAD' ? '' : data, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'static'));
  });

  // ---------- WebSocket ----------
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: cfg.maxBytes });
  const perIp = new Map();
  wss.on('connection', (ws, req) => {
    const ip = (cfg.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
    const reject = reason => { M.rejected.inc({ reason }); ws.close(1013, reason); };
    if (relay.draining) return reject('draining');
    if (wss.clients.size > cfg.maxConns) return reject('full');
    if ((perIp.get(ip) || 0) >= cfg.perIp) return reject('per_ip');
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    M.connsTotal.inc(); M.conns.inc();
    // a token bucket: msgRate a second, bursts of twice that
    let tokens = cfg.msgRate * 2, last = Date.now(), strikes = 0, alive = true, pingAt = 0;
    const client = {
      room: null, role: null, id: null,
      send: obj => { if (ws.readyState !== 1) return; const s = JSON.stringify(obj); ws.send(s); M.msgs.inc({ dir: 'out', type: obj.t }); M.bytes.inc({ dir: 'out' }, s.length); },
      close: (code, why) => ws.close(code, why),
    };
    ws.on('pong', () => { alive = true; if (pingAt) M.rtt.observe((Date.now() - pingAt) / 1000); });
    ws.ping$ = () => { if (!alive) return ws.terminate(); alive = false; pingAt = Date.now(); ws.ping(); };
    ws.on('message', (data, binary) => {
      const t = Date.now();
      tokens = Math.min(cfg.msgRate * 2, tokens + (t - last) / 1000 * cfg.msgRate); last = t;
      if (tokens < 1) { M.limited.inc(); if (++strikes > cfg.msgRate * 5) ws.close(1008, 'too many messages'); return; }
      tokens--;
      M.bytes.inc({ dir: 'in' }, data.length);
      if (binary) return client.send({ t: 'error', error: 'bad message' });
      let m; try { m = JSON.parse(data); } catch { return client.send({ t: 'error', error: 'bad message' }); }
      M.msgs.inc({ dir: 'in', type: typeof m?.t === 'string' && /^(host|join|to|msg|leave|list)$/.test(m.t) ? m.t : 'other' });
      relay.receive(client, m);
    });
    ws.on('close', code => {
      relay.leave(client, 'lost connection');
      M.conns.dec(); M.disconnects.inc({ reason: code === 1000 || code === 1001 ? 'normal' : code === 1006 ? 'dropped' : 'other' });
      const n = (perIp.get(ip) || 1) - 1; if (n) perIp.set(ip, n); else perIp.delete(ip);
    });
    ws.on('error', () => {});
    client.send({ t: 'hello', server: cfg.name, region: cfg.region, version: VERSION });
  });
  // pings find dead connections (and measure the round trip)
  const pinger = setInterval(() => { for (const ws of wss.clients) ws.ping$?.(); }, 15000);

  // ---------- graceful drain: no new rooms or joins, matches finish, then exit ----------
  let stopping = null;
  function stop() {
    if (stopping) return stopping;
    relay.draining = true;
    log('info', 'draining', { rooms: relay.rooms.size, timeoutMs: cfg.drainMs });
    return stopping = new Promise(done => {
      const until = Date.now() + cfg.drainMs;
      const check = setInterval(() => {
        const playing = [...relay.rooms.values()].some(r => r.phase === 'match' || r.phase === 'sync');
        if (playing && Date.now() < until) return;
        clearInterval(check); clearInterval(pinger);
        for (const ws of wss.clients) ws.close(1001, 'server restarting');
        wss.close(); server.close(() => done());
        setTimeout(done, 2000).unref();
      }, 250);
    });
  }

  return new Promise(resolve => server.listen(cfg.port, cfg.host, () => {
    log('info', 'listening', { port: server.address().port, name: cfg.name, version: VERSION, static: cfg.staticDir });
    resolve({ server, wss, relay, metrics: reg, port: server.address().port, stop });
  }));
}

if (require.main === module) {
  start().then(s => {
    const bye = sig => { s.stop().then(() => process.exit(0)); if (sig === 'SIGINT') process.once('SIGINT', () => process.exit(1)); };
    process.once('SIGTERM', () => bye('SIGTERM'));
    process.once('SIGINT', () => bye('SIGINT'));
  });
}

module.exports = { start, config };
