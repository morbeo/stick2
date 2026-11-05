'use strict';
// ---------- stick2 dedicated server: serves the game, relays netplay rooms over WebSocket, reports health and metrics ----------
//   GET /            the game itself (the repository's static files), so a #server= link opens it from here
//   GET /healthz     200 "ok", or 503 "draining" while shutting down
//   GET /metrics     Prometheus metrics (a bearer token if METRICS_TOKEN is set)
//   GET /api/rooms   the public rooms, as JSON (the lobby browser)
//   GET /api/leaderboard  rated players, best first; GET /api/players/<name> one (ratings.js)
//   GET /api/replays  finished matches, newest first; GET /api/replays/<id> one, as a replay file (replays.js)
//   POST /api/embeds  a short embed link: {hash} -> {id} (embeds.js); GET /e/<id> redirects to the game with that hash
//   /api/admin/…     moderation, with the ADMIN_TOKEN as a bearer token (off without one): rooms, reports, bans, flags, accounts, kick, relink, ban, unban, close
//   POST /mcp        MCP (JSON-RPC) for AI clients: rooms, matches, ratings; moderation with the ADMIN_TOKEN (mcp.js)
//   WS  /ws          the relay (relay.js)
// Configured by environment variables, every one with a default (see docs/server.md):
const fs = require('fs'), path = require('path'), http = require('http');
const { WebSocketServer } = require('ws');
const { Relay } = require('./relay');
const { Registry } = require('./metrics');
const { Bans } = require('./moderation');
const { Embeds, MAX_HASH } = require('./embeds');
const { Replays } = require('./replays');
const { Verifier } = require('./verify');
const { Ratings } = require('./ratings');
const { mcp } = require('./mcp');
const { Accounts } = require('./accounts');

const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };
function config(env = process.env) {
  return {
    port: num(env.PORT, 8080),
    host: env.HOST || '0.0.0.0',
    name: env.SERVER_NAME || 'stick2 server',
    region: env.REGION || '',
    staticDir: env.STATIC_DIR === '' ? null : path.resolve(env.STATIC_DIR || path.join(__dirname, '..')),
    maxRooms: num(env.MAX_ROOMS, 500),
    roomIdle: num(env.ROOM_IDLE, 120), // seconds an empty room stays open for someone to come back and host it (0: it closes with its last player)
    maxConns: num(env.MAX_CONNECTIONS, 2000),
    perIp: num(env.MAX_PER_IP, 16),
    msgRate: num(env.MSG_RATE, 200), // messages a second per connection (a match sends ~60)
    maxBytes: num(env.MAX_MESSAGE_BYTES, 1 << 20), // a match header carries whole character definitions
    drainMs: num(env.DRAIN_TIMEOUT, 600) * 1000,
    metricsToken: env.METRICS_TOKEN || '',
    adminToken: env.ADMIN_TOKEN || '',
    dbPath: env.DB_PATH || '', // a folder for bans.json and embeds.json; none: they live in memory only
    maxEmbeds: num(env.MAX_EMBEDS, 10000), // short embed links kept (0: short links off)
    maxReplays: num(env.MAX_REPLAYS, 200), // finished matches kept as replays (0: off)
    mcp: env.MCP !== '0', // MCP for AI clients at POST /mcp (mcp.js): read tools for everyone (or MCP_TOKEN holders), admin tools with ADMIN_TOKEN
    mcpToken: env.MCP_TOKEN || '',
    accounts: env.ACCOUNTS !== '0', // accounts: a name kept for a player across devices, no passwords (accounts.js)
    ratings: env.RATINGS !== '0', // Glicko-2 ratings from verified matches (needs VERIFY), a leaderboard and quick match by rating
    verify: env.VERIFY !== '0', // play every finished match again on the server, for verdicts, gameplay stats and cheat flags
    spectateDelay: num(env.SPECTATE_DELAY, 180), // frames (60 a second) spectators watch behind the players
    maxSpectators: num(env.MAX_SPECTATORS, 14), // people a room may have besides its two fighters (spectators and the queue)
    blocklist: (env.NAME_BLOCKLIST || '').split(',').map(w => w.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY === '1',
    log: env.LOG_LEVEL || 'info',
  };
}
// the roster's characters (src/engine/chars/index.json, without the kit), the only names a metric label takes
const CHARS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'engine', 'chars', 'index.json'), 'utf8')).filter(n => !n.startsWith('_')).concat('stick'); } catch { return ['stick']; } })();
const VERSION = (() => { try { return require('../package.json').version || require('./package.json').version || 'dev'; } catch { return 'dev'; } })();
const COMMIT = process.env.COMMIT || 'dev';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
// nothing from the server itself, dependencies, git or dotfiles
const HIDDEN = /(^|\/)(\.|node_modules(\/|$)|server(\/|$)|tools(\/|$)|tests(\/|$)|package(-lock)?\.json$)/;

// the card for a short link: a title from what the hash plays (a preset, a scenario, a replay), then on to the game
const esc = t => String(t).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
function embedCard(hash, origin) {
  const p = new URLSearchParams(hash), what = p.get('challenge') === '1' ? 'a challenge' : p.get('replay') ? 'a replay' : p.get('scenario') || p.get('embed') || p.get('preset') || 'a fight';
  const title = `stick2: ${what}`, to = '/index.html#' + hash;
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="A stick-figure fight you can play, replay and jump into.">
<meta property="og:image" content="${esc(origin)}/docs/img/anim-fireball.png"><meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(to)}"><script>location.replace(${JSON.stringify(to)})</script><a href="${esc(to)}">${esc(title)}</a>`;
}

function start(cfg = config()) {
  const log = (level, msg, extra = {}) => { if (cfg.log === 'quiet' || (level === 'debug' && cfg.log !== 'debug')) return; process.stdout.write(JSON.stringify({ time: new Date().toISOString(), level, msg, ...extra }) + '\n'); };
  const reg = new Registry(), started = Date.now();
  const M = {
    build: reg.gauge('build_info', 'Version and commit of the running server', () => ({ [`version="${VERSION}",commit="${COMMIT}"`]: 1 })),
    uptime: reg.gauge('uptime_seconds', 'Seconds since the server started', () => (Date.now() - started) / 1000),
    draining: reg.gauge('draining', '1 while the server is shutting down', () => relay.draining ? 1 : 0),
    conns: reg.gauge('connections', 'Open WebSocket connections'),
    rooms: reg.gauge('rooms', 'Open rooms'),
    emptyRooms: reg.gauge('rooms_empty', 'Open rooms with nobody in them, waiting for someone to host them (ROOM_IDLE)', () => { let n = 0; for (const r of relay.rooms.values()) if (!r.host) n++; return n; }),
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
    kicks: reg.counter('kicks_total', 'Players sent away, by who did it'),
    bans: reg.counter('bans_total', 'Bans added'),
    reports: reg.counter('reports_total', 'Players reported'),
    replays: reg.counter('replays_saved_total', 'Finished matches saved as replays'),
    handovers: reg.counter('host_handovers_total', 'Rooms handed to a guest when their host left'),
    replayBytes: reg.gauge('replay_storage_bytes', 'Bytes of the saved replays', () => replays.bytes()),
    verified: reg.counter('verify_total', 'Finished matches the server played again, by verdict (ok, desync, result, version, error)'),
    verifySeconds: reg.histogram('verify_seconds', 'How long the server takes to play a finished match again', [0.1, 0.25, 0.5, 1, 2, 5, 10, 20]),
    verifyQueue: reg.gauge('verify_queue', 'Finished matches waiting to be played again', () => verifier?.queued ?? 0),
    mcpCalls: reg.counter('mcp_calls_total', 'MCP tool calls, by tool and result'),
    mcpSeconds: reg.histogram('mcp_call_seconds', 'How long MCP tool calls take', [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]),
    accounts: reg.counter('account_actions_total', 'Account actions: register, link (a code shown), claim (a device linked), relink (by an admin)'),
    accountCount: reg.gauge('accounts', 'Accounts on this server', () => accounts?.list.size ?? 0),
    rated: reg.counter('rated_matches_total', 'Verified matches that moved two players\' ratings'),
    quickQueue: reg.gauge('quick_queue', 'Players waiting in quick match', () => relay.quick.length),
    quickMatches: reg.counter('quick_matches_total', 'Quick matches that opened a room'),
    quickWait: reg.histogram('quick_wait_seconds', 'How long players waited in quick match before a pairing', [5, 10, 20, 30, 60, 120, 300]),
    ratedPlayers: reg.gauge('rated_players', 'Players with a rating', () => ratings?.players.size ?? 0),
    flags: reg.counter('flagged_total', 'Matches whose replay does not add up (desync: the inputs give other checksums; result: another winner than claimed)'),
    ends: reg.counter('match_ends_total', 'Verified matches, by how they ended (ko, double ko, time) and which side won (p1, p2, draw)'),
    frames: reg.histogram('match_frames', 'Length of verified matches in frames (60 a second)', [600, 1800, 3600, 5400, 7200, 10800, 18000]),
    picks: reg.counter('character_picks_total', 'Characters played in verified matches (roster names; anything else is custom)'),
    wins: reg.counter('character_wins_total', 'Characters that won verified matches'),
    hpLeft: reg.histogram('winner_hp_left', "The winner's health left at the end of a verified match", [10, 25, 50, 75, 100, 150, 200]),
    spectatorPeak: reg.gauge('spectator_peak', 'Most spectators in rooms at once since the server started', () => relay.spectatorPeak),
  };
  // gameplay stats from a verified match (low cardinality: roster characters by name, every other one as custom)
  const ROSTER = new Set(CHARS), char = n => ROSTER.has(n) ? n : 'custom';
  M.match = st => {
    M.ends.inc({ end: st.end, side: st.winner === 0 ? 'p1' : st.winner === 1 ? 'p2' : 'draw' });
    M.frames.observe(st.frames);
    for (const c of st.chars) M.picks.inc({ char: char(c) });
    if (st.winner === 0 || st.winner === 1) { M.wins.inc({ char: char(st.chars[st.winner]) }); M.hpLeft.observe(st.hp[st.winner]); }
  };
  const verifier = cfg.verify ? new Verifier() : null;
  const accounts = cfg.accounts ? new Accounts({ file: cfg.dbPath ? path.join(cfg.dbPath, 'accounts.json') : null }) : null;
  const ratings = cfg.ratings && cfg.verify ? new Ratings({ file: cfg.dbPath ? path.join(cfg.dbPath, 'ratings.json') : null }) : null;
  const bans = new Bans({ file: cfg.dbPath ? path.join(cfg.dbPath, 'bans.json') : null });
  const embeds = new Embeds({ file: cfg.dbPath ? path.join(cfg.dbPath, 'embeds.json') : null, max: cfg.maxEmbeds });
  const embedRate = new Map(); // address -> [window start, count]: 60 short links an hour each
  const audit = (action, detail) => log('info', 'moderation', { action, ...detail });
  const replays = new Replays({ dir: cfg.dbPath ? path.join(cfg.dbPath, 'replays') : null, max: cfg.maxReplays });
  const relay = new Relay({ maxRooms: cfg.maxRooms, idleMs: cfg.roomIdle * 1000, metrics: M, bans, blocklist: cfg.blocklist, audit, replays: cfg.maxReplays ? replays : null, verifier, ratings, accounts,
    delay: cfg.spectateDelay, watchers: Math.min(cfg.maxSpectators, 14) }); // (the relay takes 16 guests at most)

  const mcpHandle = cfg.mcp ? mcp({ relay, ratings, replays, bans, accounts, M, reg, cfg, audit, version: VERSION }) : null;

  // ---------- moderation over HTTP (admin token) ----------
  function admin(req, res, route) {
    if (!cfg.adminToken) return send(res, 404, 'not found\n', undefined, 'admin');
    if (req.headers.authorization !== `Bearer ${cfg.adminToken}`) return send(res, 401, 'unauthorized\n', undefined, 'admin');
    const json = (status, body) => send(res, status, JSON.stringify(body), 'application/json', 'admin');
    if (req.method === 'GET') {
      if (route === 'rooms') return json(200, { rooms: relay.detail() });
      if (route === 'reports') return json(200, { reports: relay.reports });
      if (route === 'bans') return json(200, { bans: bans.active() });
      if (route === 'flags') return json(200, { flags: relay.flags });
      if (route === 'accounts') return json(200, { accounts: accounts ? [...accounts.list.values()].map(a => accounts.view(a)) : [] });
      return json(404, { error: 'unknown' });
    }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => {
      let b; try { b = JSON.parse(body || '{}'); } catch { return json(400, { error: 'bad json' }); }
      if (route === 'kick') {
        const ok = relay.kickPlayer(b.player, b.reason ? `kicked: ${b.reason}` : 'kicked by the server');
        if (ok) { M.kicks.inc({ by: 'admin' }); audit('kick', { by: 'admin', player: b.player }); }
        return json(ok ? 200 : 404, { ok });
      }
      if (route === 'close') { const ok = relay.close(String(b.room || '').toUpperCase()); if (ok) audit('close', { by: 'admin', room: b.room }); return json(ok ? 200 : 404, { ok }); }
      if (route === 'ban') {
        // an online player by name takes their device and address too; or a device id, or just a name
        const c = b.player && relay.names.get(String(b.player).toLowerCase());
        let ban;
        // an account's ban covers all its devices: the player's (online or not), or the device's
        const acct = c?.account || accounts?.byName(b.player)?.id || (b.device && accounts?.of(b.device)?.id) || undefined;
        try { ban = bans.add({ device: b.device || c?.device, ip: c?.ip, name: b.player, account: acct, reason: b.reason, minutes: Number(b.minutes) || 0 }); } catch (e) { return json(400, { error: e.message }); }
        M.bans.inc(); audit('ban', { by: 'admin', player: b.player || null, minutes: Number(b.minutes) || 0, id: ban.id });
        if (c) relay.kickPlayer(b.player, `banned: ${ban.reason || 'by the server'}`);
        return json(200, { ok: true, ban });
      }
      if (route === 'relink') {
        if (!accounts) return json(404, { error: 'accounts are off' });
        try { const a = accounts.relink(b.player, String(b.device || '')); M.accounts.inc({ action: 'relink' }); audit('relink', { by: 'admin', player: a.name }); return json(200, { ok: true, account: accounts.view(a) }); }
        catch (e) { return json(400, { error: e.message }); }
      }
      if (route === 'unban') { const ok = bans.remove(b.id); if (ok) audit('unban', { by: 'admin', id: b.id }); return json(ok ? 200 : 404, { ok }); }
      return json(404, { error: 'unknown' });
    });
  }

  // ---------- short embed links (the embed builder posts here from any page, so CORS is open; nothing in it is private) ----------
  function shortLink(req, res) {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
    const json = (status, body) => { M.http.inc({ route: 'embeds', status }); res.writeHead(status, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(body)); };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (req.method !== 'POST' || !cfg.maxEmbeds) return json(cfg.maxEmbeds ? 405 : 404, { error: cfg.maxEmbeds ? 'POST only' : 'short links are off' });
    const ip = (cfg.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?', now = Date.now();
    const r = embedRate.get(ip); if (!r || now - r[0] > 3600e3) embedRate.set(ip, [now, 1]); else if (++r[1] > 60) return json(429, { error: 'too many short links, try later' });
    let body = '', big = false;
    req.on('data', c => { if (!big) body += c; if (body.length > MAX_HASH + 100) { big = true; body = ''; } }); // read on, keep nothing: a 413, not a dropped connection
    req.on('end', () => {
      if (big) return json(413, { error: `hash must be 1..${MAX_HASH} characters` });
      let b; try { b = JSON.parse(body || '{}'); } catch { return json(400, { error: 'bad json' }); }
      try { return json(200, { id: embeds.add(b.hash) }); } catch (e) { return json(400, { error: e.message }); }
    });
  }

  // ---------- HTTP ----------
  const send = (res, status, body, type = 'text/plain; charset=utf-8', route = 'other') => {
    M.http.inc({ route, status });
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    res.end(body);
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const adm = url.pathname.match(/^\/api\/admin\/([a-z]+)$/);
    if (adm && (req.method === 'GET' || req.method === 'POST')) return admin(req, res, adm[1]);
    if (url.pathname === '/api/embeds') return shortLink(req, res);
    if (url.pathname === '/mcp' && mcpHandle) return mcpHandle(req, res, send);
    const short = url.pathname.match(/^\/e\/([\w-]{1,20})$/);
    if (short && req.method === 'GET') {
      const hash = cfg.maxEmbeds ? embeds.get(short[1]) : null;
      if (!hash) return send(res, 404, 'no such embed link\n', undefined, 'embed');
      // a page, not a bare redirect: link unfurlers (Discord, Slack…) read its card, browsers go straight on to the game
      return send(res, 200, embedCard(hash, `${cfg.trustProxy && req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`), 'text/html; charset=utf-8', 'embed');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    if (url.pathname === '/healthz') return relay.draining ? send(res, 503, 'draining\n', undefined, 'healthz') : send(res, 200, 'ok\n', undefined, 'healthz');
    if (url.pathname === '/metrics') {
      if (cfg.metricsToken && req.headers.authorization !== `Bearer ${cfg.metricsToken}`) return send(res, 401, 'unauthorized\n', undefined, 'metrics');
      return send(res, 200, reg.text(), 'text/plain; version=0.0.4; charset=utf-8', 'metrics');
    }
    if (url.pathname === '/api/replays') return send(res, 200, JSON.stringify({ server: cfg.name, replays: replays.list() }), 'application/json', 'replays');
    const rep = url.pathname.match(/^\/api\/replays\/([\w-]{1,20})$/);
    if (rep) { const text = replays.get(rep[1]); return text ? send(res, 200, text, 'application/json', 'replays') : send(res, 404, 'no such replay\n', undefined, 'replays'); }
    if (url.pathname === '/api/leaderboard') return send(res, 200, JSON.stringify({ server: cfg.name, players: ratings ? ratings.board(50) : [] }), 'application/json', 'ratings');
    const pl = url.pathname.match(/^\/api\/players\/([^/]{1,40})$/);
    if (pl) { let n; try { n = decodeURIComponent(pl[1]); } catch { n = ''; } const p = ratings?.byName(n); return p ? send(res, 200, JSON.stringify(p), 'application/json', 'ratings') : send(res, 404, 'no such player\n', undefined, 'ratings'); }
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
      room: null, role: null, id: null, player: null, device: '', ip: bans.hash(ip),
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
      M.msgs.inc({ dir: 'in', type: typeof m?.t === 'string' && /^(host|join|to|msg|leave|list|kick|lock|report|replay|quick|unquick|account)$/.test(m.t) ? m.t : 'other' });
      relay.receive(client, m);
    });
    ws.on('close', code => {
      relay.leave(client, 'lost connection'); relay.release(client);
      M.conns.dec(); M.disconnects.inc({ reason: code === 1000 || code === 1001 ? 'normal' : code === 1006 ? 'dropped' : 'other' });
      const n = (perIp.get(ip) || 1) - 1; if (n) perIp.set(ip, n); else perIp.delete(ip);
    });
    ws.on('error', () => {});
    client.send({ t: 'hello', server: cfg.name, region: cfg.region, version: VERSION });
  });
  // pings find dead connections (and measure the round trip)
  const pinger = setInterval(() => { for (const ws of wss.clients) ws.ping$?.(); }, 15000);
  const sweeper = setInterval(() => relay.sweep(), 2000); sweeper.unref(); // empty rooms past ROOM_IDLE

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
        clearInterval(check); clearInterval(pinger); clearInterval(sweeper);
        for (const ws of wss.clients) ws.close(1001, 'server restarting');
        wss.close(); verifier?.close(); server.close(() => done());
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
