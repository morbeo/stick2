'use strict';
// ---------- MCP over Streamable HTTP at POST /mcp: the server's rooms, matches, ratings and moderation as tools for an AI client ----------
// JSON-RPC 2.0, one JSON answer per request (no streams). Who may call what, by bearer token:
//   read   everyone, or only MCP_TOKEN holders when it is set: rooms, matches, replays, the leaderboard, health, a metrics summary
//   admin  ADMIN_TOKEN: kick, ban, unban, close_room, list_reports, list_flags, add_bot, list_bots, remove_bot (each call written to the moderation log)
// Resources: stick2://server/rooms, stick2://server/leaderboard, stick2://match/<id>/replay.
const { str, int, version, listTools, checkArgs, asResult, errResult, rpcBody, PARSE_ERROR } = require('../tools/lib/mcp-rpc');

// ctx: { relay, ratings, replays, bans, accounts, metrics (M), reg (Registry), cfg, audit, version }
function mcp(ctx) {
  const { relay, ratings, replays, bans, accounts, M, reg, cfg, audit } = ctx;
  const fail = (msg, code = -32602) => { const e = new Error(msg); e.code = code; throw e; };
  const room = code => { const r = relay.rooms.get(String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')); if (!r) fail('no such room'); return r; };
  const roomView = r => ({ room: r.code, name: r.name, public: r.public, locked: r.locked, phase: r.phase, host: r.host?.player || null, players: r.players, watchers: r.watchers,
    guests: [...r.guests.values()].map(g => g.player), rules: r.rules || null, queue: r.queue || 0, streak: r.streak || null, created: new Date(r.created).toISOString() });
  const TOOLS = {
    // ---------- read ----------
    server_health: { d: 'The server: name, region, version, uptime, rooms, players online, whether it is draining.', run: () => ({ server: cfg.name, region: cfg.region, version: ctx.version,
      uptime: Math.round(process.uptime()), rooms: relay.rooms.size, playersOnline: [...relay.rooms.values()].reduce((n, r) => n + (r.host ? 1 : 0) + r.guests.size, 0), draining: relay.draining }) },
    get_metrics_summary: { d: 'The server\'s Prometheus metrics, optionally only those whose name contains a word (e.g. "verify", "quick", "rtt").', p: { filter: str('part of a metric name') },
      run: a => reg.text().split('\n').filter(l => l && !l.startsWith('#') && (!a.filter || l.includes(String(a.filter)))).slice(0, 300).join('\n') },
    list_rooms: { d: 'Open rooms. Public ones only, unless the caller has the admin token.', run: (a, adm) => [...relay.rooms.values()].filter(r => adm || r.public).map(roomView) },
    get_room: { d: 'One room by its code: who is in it, its rules, phase and queue (a private room needs the admin token).', p: { room: str('room code') }, req: ['room'],
      run: (a, adm) => { const r = room(a.room); if (!r.public && !adm) fail('no such room'); return roomView(r); } },
    get_leaderboard: { d: 'The ranked players, best first (Glicko-2 ratings from verified matches).', p: { limit: int('how many (1-50)', { minimum: 1, maximum: 50 }) },
      run: a => ratings ? ratings.board(Math.min(50, a.limit || 50)) : [] },
    get_player_stats: { d: 'A rated player by name: rating, deviation, games, wins, draws, ranked or not.', p: { player: str('player name') }, req: ['player'],
      run: a => ratings?.byName(a.player) || fail('no rated player by that name') },
    list_matches: { d: 'Finished matches the server kept as replays, newest first: players, scenario, length, winner and the server\'s verify verdict.', p: { limit: int('how many', { minimum: 1, maximum: 200 }) },
      run: a => replays.list().slice(0, a.limit || 20) },
    get_match: { d: 'One kept match by id (the list entry, without the frames; export_replay gives the whole replay file).', p: { id: str('match id') }, req: ['id'],
      run: a => replays.list().find(e => e.id === a.id) || fail('no such match') },
    export_replay: { d: 'A kept match as the game\'s replay file (JSON): load it in the app (replay tab) or in the stick2 MCP tools (replay_import).', p: { id: str('match id') }, req: ['id'],
      run: a => { const t = replays.get(String(a.id)); if (!t) fail('no such match'); return JSON.parse(t); } },
    // ---------- admin ----------
    list_reports: { admin: true, d: 'Players reported by others, newest last, with the reason and the reporter\'s chat lines.', run: () => relay.reports },
    list_flags: { admin: true, d: 'Matches whose replay didn\'t add up when the server played it again (desync, or a wrong winner claimed).', run: () => relay.flags },
    kick: { admin: true, d: 'Send a player off the server\'s rooms (a host\'s room closes).', p: { player: str('player name'), reason: str('shown to them') }, req: ['player'],
      run: a => { const ok = relay.kickPlayer(a.player, a.reason ? `kicked: ${a.reason}` : 'kicked by the server'); if (ok) { M.kicks?.inc({ by: 'admin' }); audit('kick', { by: 'mcp', player: a.player }); } return { ok }; } },
    ban: { admin: true, d: 'Ban a player by name (an online player\'s device and hashed address too). No minutes: permanent.', p: { player: str('player name'), reason: str('why'), minutes: int('how long', { minimum: 0 }) }, req: ['player'],
      run: a => { const c = relay.names.get(String(a.player).toLowerCase()); const b = bans.add({ device: c?.device, ip: c?.ip, name: a.player, reason: a.reason, minutes: a.minutes || 0 });
        M.bans?.inc(); audit('ban', { by: 'mcp', player: a.player, id: b.id }); if (c) relay.kickPlayer(a.player, `banned: ${b.reason || 'by the server'}`); return b; } },
    unban: { admin: true, d: 'Lift a ban by its id (list them with list_bans).', p: { id: int('ban id') }, req: ['id'], run: a => { const ok = bans.remove(a.id); if (ok) audit('unban', { by: 'mcp', id: a.id }); return { ok }; } },
    list_bans: { admin: true, d: 'The bans still running.', run: () => bans.active() },
    list_accounts: { admin: true, d: 'Accounts on this server (accounts.js): name, how many devices, created, last seen. No device ids.', p: { filter: str('part of a name') },
      run: a => { if (!accounts) fail('accounts are off on this server'); return [...accounts.list.values()].filter(x => !a.filter || x.name.toLowerCase().includes(String(a.filter).toLowerCase())).map(x => accounts.view(x)); } },
    get_account: { admin: true, d: 'One account by its name: devices, created, last seen, whether its name is still reserved, its rating and any ban on it.', p: { player: str('account name') }, req: ['player'],
      run: a => { const x = accounts?.byName(a.player) || fail('no such account');
        return { ...accounts.view(x), reserved: accounts.reserved(x.name), rating: ratings?.get('acct:' + x.id) || null, ban: bans.find({ account: x.id }) }; } },
    relink_account: { admin: true, d: 'Link a device to an account (a player who lost every device and the recovery code): the device id the app shows in its account box (netplay section, account).', p: { player: str('account name'), device: str('the device id') }, req: ['player', 'device'],
      run: a => { if (!accounts) fail('accounts are off on this server'); const x = accounts.relink(a.player, String(a.device)); M.accounts?.inc({ action: 'relink' }); audit('relink', { by: 'mcp', player: x.name }); return accounts.view(x); } },
    close_room: { admin: true, d: 'Close a room (everyone in it is told).', p: { room: str('room code') }, req: ['room'],
      run: a => { const ok = relay.close(String(a.room).toUpperCase()); if (ok) audit('close', { by: 'mcp', room: a.room }); return { ok }; } },
    // bots (bots.js): a server-side player with the game's AI, into any room
    add_bot: { admin: true, d: 'Put a bot (the game\'s AI, played on the server) into a room as a player. It readies itself and plays every match until it is kicked or the room closes.',
      p: { room: str('room code'), level: str('how well it plays', { enum: ['easy', 'normal', 'hard'] }), char: str('character name (default: one at random)') }, req: ['room'],
      run: a => { if (!relay.bots) fail('bots are off on this server (BOTS=0)'); try { return { player: relay.bots.add(a.room, { level: a.level || 'normal', char: a.char || null }) }; } catch (e) { fail(e.message); } } },
    list_bots: { admin: true, d: 'The bots playing on this server: name, room, level, character, lobby phase.', run: () => relay.bots?.view() || [] },
    remove_bot: { admin: true, d: 'Take a bot out of its room by name.', p: { player: str('bot name') }, req: ['player'],
      run: a => { const ok = !!relay.bots?.remove(a.player); if (ok) audit('bot out', { by: 'mcp', player: a.player }); return { ok }; } },
  };
  const RESOURCES = [
    { uri: 'stick2://server/rooms', name: 'rooms', description: 'The public rooms', mimeType: 'application/json', read: () => TOOLS.list_rooms.run({}, false) },
    { uri: 'stick2://server/leaderboard', name: 'leaderboard', description: 'The ranked players', mimeType: 'application/json', read: () => TOOLS.get_leaderboard.run({}) },
  ];
  const list = adm => listTools(TOOLS, t => adm || !t.admin, t => t.admin ? ' (admin token)' : '');
  function call(name, args = {}, adm) {
    const t = TOOLS[name];
    if (!t || (t.admin && !adm)) return { content: [{ type: 'text', text: `Error: unknown tool ${name}` }], isError: true };
    const t0 = process.hrtime.bigint();
    let out, ok = true;
    try {
      checkArgs(t, args || {});
      out = asResult(t.run(args || {}, adm));
    } catch (e) { ok = false; out = errResult(e); }
    M.mcpCalls?.inc({ tool: name, result: ok ? 'ok' : 'error' });
    M.mcpSeconds?.observe(Number(process.hrtime.bigint() - t0) / 1e9);
    return out;
  }
  function read(uri, adm) {
    const m = String(uri || '').match(/^stick2:\/\/match\/([\w-]{1,20})\/replay$/);
    if (m) { const t = replays.get(m[1]); if (!t) fail('no such match'); return { uri, mimeType: 'application/json', text: t }; }
    const r = RESOURCES.find(x => x.uri === uri); if (!r) fail('no such resource');
    return { uri, mimeType: r.mimeType, text: JSON.stringify(r.read(adm), null, 2) };
  }
  const METHODS = {
    initialize: p => ({ protocolVersion: version(p?.protocolVersion), capabilities: { tools: {}, resources: {} },
      serverInfo: { name: `stick2-server ${cfg.name}`, version: ctx.version },
      instructions: 'A stick2 game server: rooms where people fight online, the matches it kept and verified, and ratings. Read tools need no special token; admin tools (moderation) need the server\'s admin token.' }),
    ping: () => ({}),
    'tools/list': (p, adm) => ({ tools: list(adm) }),
    'tools/call': (p, adm) => call(p?.name, p?.arguments, adm),
    'resources/list': () => ({ resources: RESOURCES.map(({ read, ...r }) => r) }),
    'resources/templates/list': () => ({ resourceTemplates: [{ uriTemplate: 'stick2://match/{id}/replay', name: 'replay', description: 'A kept match as a replay file', mimeType: 'application/json' }] }),
    'resources/read': (p, adm) => ({ contents: [read(p?.uri, adm)] }),
  };
  // the HTTP side: POST a JSON-RPC message (or a batch) → its answer; GET/DELETE: 405 (no server-sent streams here)
  return function handle(req, res, send) {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const adm = !!cfg.adminToken && bearer === cfg.adminToken;
    if (cfg.mcpToken && !adm && bearer !== cfg.mcpToken) return send(res, 401, JSON.stringify({ error: 'unauthorized' }), 'application/json', 'mcp');
    if (req.method !== 'POST') return send(res, 405, JSON.stringify({ error: 'POST JSON-RPC here' }), 'application/json', 'mcp');
    let body = '', big = false;
    req.on('data', c => { if (!big) body += c; if (body.length > 1e5) { big = true; body = ''; } });
    req.on('end', () => {
      if (big) return send(res, 413, JSON.stringify({ error: 'too big' }), 'application/json', 'mcp');
      let m; try { m = JSON.parse(body); } catch { return send(res, 400, JSON.stringify(PARSE_ERROR), 'application/json', 'mcp'); }
      rpcBody(METHODS, m, adm).then(out => out ? send(res, 200, JSON.stringify(out), 'application/json', 'mcp') : send(res, 202, '', 'application/json', 'mcp'));
    });
  };
}
module.exports = { mcp };
