#!/usr/bin/env node
// Netplay through the dedicated server, end to end in two browser processes: the host opens a room from the play tab, the guest
// opens the room's #server=…&room=… link, both pick and ready, and the match runs on both stages with no desync.
// usage: node tools/dev/server-test.js   (needs: npm ci --prefix server; CHROME=/path/to/chrome overrides the browser)
const { launch } = require('../lib/chrome');
const { start, config } = require('../../server/server');
const FLAGS = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const STATE = `JSON.stringify({ phase: net.lobby?.phase, id: net.lobby?.id, room: net.server?.room, error: net.lobby?.state?.error, log: net.log.slice(-4), f: net.match?.f, desync: net.match?.desync })`;
let sides = [];
const until = async (side, expr, what, ms = 20000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms;) { const v = await side.js(expr); if (v) return v; await new Promise(r => setTimeout(r, 100)); }
  const states = await Promise.all(sides.map(([name, s]) => s.js(STATE).then(x => name + ' ' + x, e => name + ' ' + e.message)));
  throw new Error('timed out waiting for ' + what + '\n  ' + states.join('\n  '));
};

async function main() {
  const srv = await start(config({ PORT: '0', HOST: '127.0.0.1', LOG_LEVEL: 'quiet', DRAIN_TIMEOUT: '1' }));
  const base = `http://127.0.0.1:${srv.port}/`;
  const host = await launch(base, FLAGS);
  sides = [['host', host]];
  try {
    await until(host, `typeof netLobby === 'function' && typeof netServerHost === 'function'`, 'the app to load');
    await host.js(`openNetplay(false, true); netLobby('host', { url: '127.0.0.1:${srv.port}' }); true`);
    const room = await until(host, `net.server?.room`, 'a room code');
    const link = await host.js(`netServerLink(net.server.url, net.server.room)`);
    console.log(`room ${room}: ${link}`);
    const guest = await launch(link, FLAGS);
    sides.push(['guest', guest]);
    await until(guest, `typeof net !== 'undefined' && net.lobby?.id`, 'the guest to join from the link');
    await until(host, `net.lobby.state.slots.filter(Boolean).length === 2`, 'the host to see the guest');
    for (const s of [host, guest]) await s.js(`net.lobby.pick('stick'); true`);
    await new Promise(r => setTimeout(r, 300));
    for (const s of [host, guest]) await s.js(`net.lobby.ready(); true`);
    await until(host, `net.lobby.canStart()`, 'both ready');
    await host.js(`net.lobby.start(); true`);
    for (const [name, s] of sides) await until(s, `net.match?.f > 180`, `${name}'s match to run`);
    for (const [name, s] of sides) { const d = await s.js(`net.match.desync`); if (d !== null) throw new Error(`${name} desynced at frame ${d}`); }
    const metrics = await (await fetch(base + 'metrics')).text();
    if (!/stick2_matches_total 1/.test(metrics)) throw new Error('the server didn\'t count the match');
    console.log('ok: a match through the server, no desync');
  } finally {
    for (const [, s] of sides) await s.close?.();
    await srv.stop();
  }
}
main().then(() => process.exit(0), e => { console.error(e.message); process.exit(1); });
