#!/usr/bin/env node
// Netplay end to end in two independent browser processes, peer to peer: the app's own src/net/netplay.js and src/net/lobby.js
// connect over a WebRTC data channel, the guest joins the host's lobby, both pick and ready, and the match starts only once
// both built the same fight. Node only stands in for the humans: it carries each side's code to the other, as a chat would.
// Then the same through the app's own play tab. No signaling server runs anywhere.
// usage: node tools/dev/netplay-test.js   (CHROME=/path/to/chrome overrides the browser)
const path = require('path'), { pathToFileURL } = require('url');
const { launch } = require('../lib/chrome');
const APP = pathToFileURL(path.join(__dirname, '..', '..', 'index.html')).href;
// several headless windows at once: without these, Chrome starves the ones it thinks are in the background of animation frames
const FLAGS = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion'];
// and each page held active and focused: a page Chrome freezes still answers DevTools, but runs none of its own events (no channel
// open, no message), which on a busy CI runner left the host deaf to the guest while every check still read 'open'
const open = async url => { const side = await launch(url, FLAGS);
  await side.send('Page.enable'); await side.send('Page.setWebLifecycleState', { state: 'active' }); await side.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return side; };
// what each side looks like when a wait runs out: the connection's state, and the lobby's and the match's
const STATE = `JSON.stringify((() => { const N = window.T || (typeof net !== 'undefined' ? net : null), p = N?.peer || N?.peers?.at(-1), L = N?.lobby, m = N?.match;
  return { vis: document.visibilityState, focus: document.hasFocus(), pc: p?.pc?.connectionState, ch: p?.ch?.readyState, peers: (N?.peers || [p]).filter(Boolean).map(x => x.ch?.readyState + ':' + x.sent + '/' + x.got).join(' '), phase: L?.phase, id: L?.id, rev: L?.state?.rev, error: L?.state?.error, log: N?.log?.slice(-4),
    match: m && { f: m.f, c: m.c, waits: m.stalls, behind: m.behind } }; })())`;
let sides = [];
const until = async (side, expr, what, ms = 20000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms;) { const v = await side.js(expr); if (v) return v; await new Promise(r => setTimeout(r, 100)); }
  const states = await Promise.all(sides.map(([name, s]) => s.js(STATE).then(x => name + ' ' + x, e => name + ' ' + e.message)));
  throw new Error('timed out waiting for ' + what + '\n  ' + states.join('\n  '));
};
// each side, in one namespaced object (the app has globals of its own, sig among them): a lobby, a manual signaler whose
// shown code lands in T.code, and the lobby's events in T.seen
const SETUP = role => `(() => { const T = window.T = { seen: [], code: null };
  T.sig = new ManualSignal(c => { T.code = c; });
  T.lobby = new Lobby({ role: '${role}', name: '${role}', hooks: { event: e => T.seen.push(e.type + (e.phase ? ':' + e.phase : '')) } });
  return true; })()`;

async function main() {
  const host = await open(APP), guest = await open(APP);
  sides = [['host', host], ['guest', guest]];
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

    console.log('PASS: two browsers, peer to peer, through the lobby to a synced match start, no server.\n');
  } finally { host.close(); guest.close(); }
  await app();
}

// the same through the app's play tab (src/net/netui.js): the host's invite link opened by the guest, the match on both stages,
// and a spectator's (a third browser, through a second invite), run by both frame loops with 80 ms of added latency and key presses on both sides (so rollback really guesses wrong and goes
// back), checked against each other every NETMATCH.sumEvery frames
async function app() {
  const host = await open(APP + '#tool=play'), guest = await open('about:blank'), watcher = await open('about:blank');
  sides = [['host', host], ['guest', guest], ['spectator', watcher]];
  try {
    await until(host, `typeof netLobby === 'function' && !!document.querySelector('#side')`, 'the app to load');
    await host.js(`netLobby('host'); panels(); true`);
    const link = await until(host, `net.inviting === 'waiting' && netInviteLink(net.code, location.href, net.pin)`, 'the invite link');
    await guest.send('Page.navigate', { url: link });
    const answer = await until(guest, `typeof net !== 'undefined' && net.codeKind === 'answer' && net.code`, 'the guest\'s answer code');
    if (await guest.js('!!document.querySelector(".modalback")')) throw new Error('a dialog covers the page the invite link opened');
    await host.js(`netAnswer(${JSON.stringify(answer)}); true`);
    await until(host, `net.lobby.state.slots[1]?.char`, 'the guest in the lobby, with a character');
    // a second invite, for a spectator: both slots are taken, so the lobby makes them a watcher
    await host.js('netInvite(); true');
    await watcher.send('Page.navigate', { url: await until(host, `net.inviting === 'waiting' && netInviteLink(net.code, location.href, net.pin)`, 'the second invite link') });
    await host.js(`netAnswer(${JSON.stringify(await until(watcher, `typeof net !== 'undefined' && net.codeKind === 'answer' && net.code`, 'the spectator\'s answer code'))}); true`);
    await until(host, 'net.lobby.state.watch.length === 1', 'the spectator in the lobby');
    await guest.js(`net.lobby.ready(); true`); await host.js(`net.lobby.ready(); true`);
    await until(host, 'net.lobby.canStart()', 'both ready');
    // 80 ms more each way for the match's messages (localhost answers at once, so rollback would never have to guess), then a few
    // key presses on each side mid-fight: guesses that turn out wrong, and rollbacks on the real stage
    for (const side of [host, guest]) await side.js(`{ const send = net.lobby.matchSend.bind(net.lobby); net.lobby.matchSend = m => setTimeout(() => send(m), 80); } true`);
    await host.js('net.lobby.start(99)');
    await until(guest, 'net.match?.f > 30', 'the guest\'s match to start running', 60000);
    const key = async (side, code, key) => { for (const type of ['keyDown', 'keyUp']) await side.send('Input.dispatchKeyEvent', { type, code, key }); };
    for (let i = 0; i < 6; i++) { await key(guest, 'KeyJ', 'j'); await key(host, 'KeyK', 'k'); await key(host, 'KeyD', 'd'); await new Promise(r => setTimeout(r, 250)); }
    await until(guest, 'net.match?.c > 240', 'the guest\'s match to confirm 240 frames', 60000);
    await until(host, 'net.match?.c > 240', 'the host\'s match to confirm 240 frames', 60000);
    await until(watcher, 'net.match?.f > 240', 'the spectator to see 240 frames', 60000);
    const [a, b] = await Promise.all([host, guest].map(s => s.js('JSON.stringify(net.match.sums)').then(JSON.parse)));
    const both = Object.keys(a).filter(f => f in b);
    if (!both.length) throw new Error('no state hashes to compare yet');
    const bad = both.find(f => a[f] !== b[f]);
    if (bad) throw new Error(`the two stages went different ways by frame ${bad}`);
    if (!await host.js('lab.cells[0].w === net.match.world')) throw new Error('the play tab isn\'t showing the match');
    const w = JSON.parse(await watcher.js('JSON.stringify({ watching: !!net.match.watching, sums: net.match.sums, onStage: lab.cells[0].w === net.match.world })'));
    const seen = Object.keys(w.sums).filter(f => f in a);
    if (!w.watching || !w.onStage) throw new Error('the spectator isn\'t watching the match on its stage');
    if (!seen.length || seen.some(f => w.sums[f] !== a[f])) throw new Error(`the spectator saw a different fight (${seen.length} hashes compared)`);
    console.log(`app: the spectator saw the same fight (${seen.length} state hashes compared)`);
    const stats = await Promise.all([host, guest].map(s => s.js('JSON.stringify({ roll: net.match.roll, delay: net.match.delay, rollbacks: net.match.rollbacks, waits: net.match.stalls, hist: net.match.world.a.poseHist.length })').then(JSON.parse)));
    if (!stats.every(x => x.roll > 0)) throw new Error('the app didn\'t start a rollback match');
    if (!stats.some(x => x.rollbacks > 0)) throw new Error('no rollback happened: the latency or the key presses didn\'t reach the match');
    console.log(`app: both stages ran the match, ${both.length} state hashes compared, all the same; host ${JSON.stringify(stats[0])}, guest ${JSON.stringify(stats[1])}`);
    console.log('PASS: the play tab\'s netplay section, invite link to a running match.');
  } finally { host.close(); guest.close(); watcher.close(); }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
