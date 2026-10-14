#!/usr/bin/env node
// Netplay end to end in two independent browser processes, peer to peer: the app's own src/netplay.js and src/lobby.js
// connect over a WebRTC data channel, the guest joins the host's lobby, both pick and ready, and the match starts only once
// both built the same fight. Node only stands in for the humans: it carries each side's code to the other, as a chat would.
// No signaling server runs anywhere. usage: node tools/netplay-test.js   (CHROME=/path/to/chrome overrides the browser)
const path = require('path'), { pathToFileURL } = require('url');
const { launch } = require('./chrome');
const APP = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const until = async (side, expr, what, ms = 15000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms;) { const v = await side.js(expr); if (v) return v; await new Promise(r => setTimeout(r, 100)); }
  throw new Error('timed out waiting for ' + what);
};
// each side, in one namespaced object (the app has globals of its own, sig among them): a lobby, a manual signaler whose
// shown code lands in T.code, and the lobby's events in T.seen
const SETUP = role => `(() => { const T = window.T = { seen: [], code: null };
  T.sig = new ManualSignal(c => { T.code = c; });
  T.lobby = new Lobby({ role: '${role}', name: '${role}', hooks: { event: e => T.seen.push(e.type + (e.phase ? ':' + e.phase : '')) } });
  return true; })()`;

async function main() {
  const host = await launch(APP), guest = await launch(APP);
  try {
    for (const side of [host, guest]) { await until(side, `typeof Lobby === 'function' && typeof NetPeer === 'function'`, 'the app to load'); await side.js(SETUP(side === host ? 'host' : 'guest')); }

    await host.js(`T.peer = netInviteGuest(T.lobby, T.sig); true`);
    const offer = await until(host, 'T.code', 'the host\'s offer code');
    console.log(`host offer code: ${offer.length} chars`);
    const link = await host.js(`netInviteLink(${JSON.stringify(offer)}, 'https://morbeo.github.io/stick2/')`);

    await guest.js(`T.peer = netJoinLobby(T.lobby, T.sig); T.sig.paste(netJoinCode(${JSON.stringify(new URL(link).hash)})); true`);
    const answer = await until(guest, 'T.code', 'the guest\'s answer code');
    console.log(`guest answer code: ${answer.length} chars`);
    await host.js(`T.sig.paste(${JSON.stringify(answer)}); true`);

    await until(guest, `T.lobby.state?.slots[1]?.id === T.lobby.id`, 'the guest to take the second slot');
    console.log('lobby:', await host.js(`T.lobby.state.slots.map(s => s.name).join(' vs ')`));

    await host.js(`T.lobby.pick('stick'); T.lobby.ready(); true`);
    await guest.js(`T.lobby.pick('sneeko'); T.lobby.ready(); true`);
    await until(host, 'T.lobby.canStart()', 'both players ready');
    await host.js('T.lobby.start(1234)');
    await until(guest, `T.lobby.phase === 'match'`, 'the match to start on the guest');
    const same = await guest.js(`T.lobby.verify(T.lobby.header) === ${JSON.stringify(await host.js('T.lobby.hash'))}`);
    if (!same) throw new Error('the guest built a different fight');
    console.log('match started, same fight on both sides; guest saw:', (await guest.js('T.seen.join(", ")')));

    await guest.js('T.lobby.leave(); true');
    await until(host, `T.lobby.phase === 'post'`, 'the host to see the forfeit');
    console.log('guest left mid-match: host result', JSON.stringify(await host.js('T.lobby.state.result')));

    console.log('\nPASS: two browsers, peer to peer, through the lobby to a synced match start, no server.');
  } finally { host.close(); guest.close(); }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
