'use strict';
// ---------- netplay in the app: the play tab's "netplay" section (host or join, the codes, the lobby) and the match on the stage ----------
// The lobby, the connection and the match live in src/net/lobby.js, src/net/netplay.js and src/net/netmatch.js; this is only their face.
// A match's world is the play tab's fight while it lasts (build() asks netWorld()); it carries .net, so the app drives it here, at
// a fixed 60 frames a second, and leaves it out of everything that would change it locally (rewind, scrub, loop, macros).
const NET_NAME = 'stick2-netname', NET_SEED = 'stick2-nameseed', NET_DEVICE = 'stick2-device';
const net = { public: true, home: null, p2p: false, rooms: null, replays: null, feed: null, rollback: true, peers: [], server: null, lobby: null, sig: null, pin: null, match: null, code: null, codeKind: null, inviting: null, pending: null, err: null, log: [], box: null, status: null, acc: 0, edges: {} };
const netStatus = () => { const m = net.match; if (m.watching) return `watching · frame ${m.f} · ${m.behind} behind${m.desync !== null ? ' · DESYNC' : ''}`; return `frame ${m.f} · delay ${m.delay}${m.roll ? ` · rollbacks ${m.rollbacks}` : ''} · waits ${m.stalls}${m.desync !== null ? ' · DESYNC' : ''}`; };
const ownWorlds = () => mode().worlds().filter(w => !w.net); // the fights only this page runs
const netWorld = () => net.match?.world || null;
// this device's id (for server bans) and its name seed; the name: the one typed, else the seed's generated name (src/net/names.js)
const netKeep = (key, make) => { try { let v = localStorage.getItem(key); if (!v) localStorage.setItem(key, v = make()); return v; } catch { return net[key] ??= make(); } };
const netDevice = () => netKeep(NET_DEVICE, () => nameSeed() + nameSeed());
const netName = () => { try { const n = localStorage.getItem(NET_NAME); if (n && nameClean(n)) return n; } catch {} return nameGen(netKeep(NET_SEED, nameSeed)); };
// a new generated name (and forget the typed one)
function netReroll() { try { localStorage.removeItem(NET_NAME); localStorage.setItem(NET_SEED, nameSeed()); } catch { net[NET_SEED] = nameSeed(); } netSay(`you are ${netName()} now`); }
function netRename(text) {
  const n = nameClean(text);
  if (!n) { net.err = `"${String(text).trim()}" can't be a name: ${NAMES.min}-${NAMES.max} letters, digits, spaces, . _ -, nothing rude or reserved`; return netDraw(); }
  try { localStorage.setItem(NET_NAME, n); } catch {}
  net.err = null; netDraw();
}
// the lobby browser: a server's public rooms (GET /api/rooms); quiet: keep the list showing while it reloads
async function netRooms(server, quiet = false) {
  let url; try { url = netServerUrl(server); } catch (e) { net.err = e.message; return netDraw(); }
  if (!quiet || !net.rooms) { net.rooms = { url, loading: true, rooms: [] }; netDraw(); }
  try { net.rooms = { url, ...(await netServerRooms(url)) }; net.err = null; } catch (e) { net.rooms = null; net.err = `couldn't list the rooms: ${e.message}`; }
  netDraw();
}
// served by a stick2 server (src/net/netserver.js netServerHome): its rooms show straight away, and stay fresh while nobody's in a lobby
async function netHome() {
  const home = await netServerHome(); if (!home) return;
  net.home = home; net.rooms = { ...home };
  try { if (!netServerSaved()) localStorage.setItem(NET_SERVER, netServerName(home.url)); } catch {}
  netDraw();
  setInterval(() => { if (!net.p2p && (!net.lobby || net.lobby.phase === 'closed') && net.box?.isConnected && !document.hidden) netRooms(home.url, true); }, 5000);
}
netHome();
// the lobby's log: chat (from: a name) and the app's own lines (no from), kept to the last 50
const netSay = (text, from = null) => { net.log.push({ text, from, at: new Date() }); if (net.log.length > 50) net.log.shift(); netDraw(); };
const netCodeIn = text => /s2[abc]\.[A-Za-z0-9_~-]{20,}/.test(String(text || '')); // a code (or a link with one) in what was typed or pasted

const netServerSaved = () => { try { return localStorage.getItem(NET_SERVER) || ''; } catch { return ''; } };

// ---------- the lobby's hooks ----------
// server: { url, room?, want? } runs the lobby through a dedicated server (src/net/netserver.js) instead of WebRTC codes
// pin: the guest's, from the link or typed; the host draws a new one (every code it makes and takes is sealed with it)
function netLobby(role, server = null, pin = null) {
  netHangUp(); net.log = []; net.code = null; net.match = null; net.inviting = null; net.pending = null; net.err = null;
  net.pin = role === 'host' ? netPin() : pin;
  net.sig = new ManualSignal((code, kind) => { net.code = code; net.codeKind = kind; if (kind === 'offer') net.inviting = 'waiting'; netDraw(); }, net.pin);
  net.lobby = new Lobby({ role, name: netName(), hooks: {
    change: () => netDraw(),
    match: m => net.match?.receive(m),
    catchup: id => { const m = net.feed?.all(); if (m) net.lobby.sendTo(id, m); },
    // the host picks the input delay from the guest's round trip, and puts it in the match, so both sides use the same
    header: (state, seed, defs) => ({ ...lobbyHeader({ ...state, scenario: netScen() }, seed, defs), netDelay: netDelay(state), netRoll: net.rollback ? NETMATCH.roll : 0 }),
    event: e => {
      if (e.type === 'chat') netSay(e.text, e.name);
      else if (e.type === 'joined') { if (net.inviting === 'connecting') net.inviting = null; net.err = null; netSay(`${e.name} joined`); }
      else if (e.type === 'left') netSay(`${e.name} ${e.why}`);
      else if (e.type === 'error') netSay(':close: ' + e.error);
      else if (e.type === 'phase') netPhase(e);
    } } });
  if (server) netServerConnect(role, server);
  else if (role === 'host') netInvite();
  netDraw();
}
// through a server: the host opens a room (its code and link show in the section), a guest joins one
function netServerConnect(role, { url, room = null, want = 'play' }) {
  try { url = netServerUrl(url); } catch (e) { net.lobby.close(e.message); return; }
  try { localStorage.setItem(NET_SERVER, netServerName(url)); } catch {}
  const device = netDevice();
  net.server = role === 'host'
    ? netServerHost(net.lobby, url, { room: code => { netSay(`room ${code} is open${net.public ? ' (listed in the room browser)' : ''}`); netDraw(); }, isPublic: net.public, device })
    : netServerJoin(net.lobby, url, room, want, { device });
  net.server.url = url;
  netSay(`connecting to ${netServerName(url)}…`);
}
// a #server=…&room=… link (or just #server=…): the play tab, with the server filled in, joining the room if there is one
function netServerFromLink(server, room, watch) {
  setTimeout(() => history.replaceState(null, '', location.pathname + location.search));
  try { localStorage.setItem(NET_SERVER, server); } catch {}
  if (mode() !== labMode || lab.mode !== 'play') setMode('play');
  layShow('side:netplay', true); lay().fold['play:netplay'] = false; saveLay();
  if (room) netLobby('guest', { url: server, room, want: watch ? 'watch' : 'play' });
  panels();
}
// the play tab's scenario, if it's one fight between two (waves, survival and rumbles aren't): else the plain one
const netScen = () => { const s = SCENARIOS[lab.scen]; return s && !s.waves && !s.survival && !s.rumble && !s.more?.length ? lab.scen : 'you vs ai'; };
// the input delay, from the slowest round trip: lockstep covers the whole one-way trip (plus a frame) with it; rollback only all but
// about 3 frames of it, guessing the rest (deeper rollbacks cost more each time and show as bigger corrections)
const netDelay = state => {
  const oneWay = Math.ceil((Math.max(0, ...state.slots.map(s => s?.rtt || 0)) / 2) / (1000 / 60));
  return net.rollback ? clamp(oneWay - 2, 1, NETMATCH.maxDelay) : clamp(oneWay + 1, 2, NETMATCH.maxDelay);
};
function netInvite() {
  net.code = null; net.inviting = 'making'; net.err = null;
  const p = netInviteGuest(net.lobby, net.sig); net.peers.push(p);
  p.ready.catch(e => { net.err = e.message; netDraw(); });
  netDraw();
}
// every connection goes when the lobby does
function netHangUp() { for (const p of net.peers) p.close('left'); net.peers = []; net.server?.close('left'); net.server = null; }
// the host: the guest's answer, checked before it's handed on (a wrong or cut-off one keeps the box, so they can send it again)
async function netAnswer(code) {
  if (!String(code || '').trim() || net.inviting !== 'waiting') return;
  try { await netDecode(await netUnseal(code, net.pin)); } catch (e) { net.err = e.message; netDraw(); return; }
  net.err = null; net.sig.paste(code); net.code = null; net.inviting = 'connecting'; netDraw();
}
// the guest: an invite (link, code or message with one) and its PIN, from the text itself or typed; a sealed invite without one asks
function netEnter(text, pin = null) {
  if (!String(text || '').trim()) return;
  pin = netPinClean(pin || netPinOf(text)) || null;
  if (netSealed(text) && !pin) { net.pending = text; net.err = null; netDraw(); return; }
  netLobby('guest', null, pin);
  const p = netJoinLobby(net.lobby, net.sig); net.peers.push(p);
  // a wrong PIN or a damaged code: back to the start, the invite kept, so only the PIN needs typing again
  p.ready.catch(e => { net.lobby?.close(e.message); netHangUp(); net.lobby = null; net.pending = netSealed(text) ? text : null; net.err = e.message; netDraw(); });
  net.sig.paste(text);
  netDraw();
}
// a #join= link: straight to the play tab, joining
function netJoinFromLink(code, pin = null) {
  // a reload mustn't try the same, used-up code again; cleared a moment later, so the page still knows it was opened by a link (no welcome)
  setTimeout(() => history.replaceState(null, '', location.pathname + location.search));
  if (mode() !== labMode || lab.mode !== 'play') setMode('play');
  netEnter(code, pin);
  panels();
}
function netPhase(e) {
  if (e.phase === 'match' && e.header) {
    const desync = f => netSay(`:close: the fights went different ways at frame ${f}: save the replay and report it`);
    net.feed = new WatchFeed(net.server?.delay || 0); // a server can hold spectators back (SPECTATE_DELAY)
    // a spectator watches the host's confirmed frames; a player plays (and the host passes what it confirms on to the spectators)
    const m = net.match = !net.lobby.me
      ? new NetWatch({ header: e.header, hooks: { desync, end: r => netSay(r.winner === null ? 'draw' : `P${r.winner + 1} wins`) } })
      : new NetMatch({ header: e.header, side: net.lobby.host ? 0 : 1, send: msg => net.lobby.matchSend(msg), hooks: { desync,
        end: r => { netSay(r.winner === null ? 'draw' : r.winner === m.side ? 'you win' : 'you lose'); if (net.lobby.host) { net.lobby.finish(r); net.server?.saveReplay?.(m.replay(), r, net.lobby.state.slots.map(s => s?.name)); } },
        confirmed: net.lobby.host ? netRelay : undefined } });
    m.world.sfx = playSound;
    net.acc = 0;
    if (mode() !== labMode || lab.mode !== 'play') setMode('play');
    build(); netSay('fight!');
  } else if (e.phase === 'lobby' || e.phase === 'closed') {
    if (net.match) { net.match = null; build(); }
    if (e.phase === 'closed') netSay(e.why || 'disconnected');
  }
  netDraw();
}

// the lobby's pings and timeouts on a timer as well: a page in a background tab gets no animation frames, and the others mustn't
// take that for a dropped connection
setInterval(() => net.lobby?.tick(), 1000);

// ---------- every animation frame (app.js): the lobby's pings, and the match's frames at a steady 60 a second ----------
// presses (edges) from frames where no match frame ran wait for the next one, so a quick tap on a fast screen is never lost
function netFrame(raw, inp) {
  net.lobby?.tick();
  const m = net.match; if (!m) return;
  for (const k of NET_EDGES) if (inp[k]) net.edges[k] = true;
  net.acc = Math.min(net.acc + raw, 0.1);
  while (net.acc >= NETMATCH.dt) {
    net.acc -= NETMATCH.dt;
    m.tick({ ...inp, ...net.edges }); net.edges = {};
    if (net.status?.isConnected && m.f % 15 === 0) net.status.textContent = netStatus();
  }
  // the host: what its match confirmed since the last frame (less the spectator delay; all of it once the fight is over), in one
  // message to every spectator
  if (net.lobby?.host && net.feed) {
    const msg = net.feed.take(net.lobby.phase !== 'match');
    if (msg && net.lobby.state.watch.length) net.lobby.watchSend(msg);
  }
}
// the host's match confirmed frame k (both real inputs; hash: the state after it, at checks)
const netRelay = (k, p1, p2, hash) => net.feed?.push(k, p1, p2, hash);
// a finished fight (this one, or one from a server's replays) played again in the play tab, as a replay
function netWatchAgain(r) {
  try { r = readReplay(JSON.parse(JSON.stringify(r))); } catch (e) { net.err = e.message; return netDraw(); }
  net.match = null;
  lab.playback = r; lab.branch = null; app.paused = false;
  if (mode() !== labMode || lab.mode !== 'play') setMode('play'); else build();
  syncAll(); netDraw();
}
// a server's saved replays (GET /api/replays): the newest first, each with watch and save
async function netReplays(server) {
  let url; try { url = netServerUrl(server); } catch (e) { net.err = e.message; return netDraw(); }
  net.replays = { url, loading: true, replays: [] }; netDraw();
  try { net.replays = { url, ...(await netServerReplays(url)) }; net.err = null; } catch (e) { net.replays = null; net.err = `couldn't list the replays: ${e.message}`; }
  netDraw();
}
async function netReplayOpen(url, id, then) {
  try { then(await netServerReplay(url, id)); } catch (e) { net.err = `couldn't get replay ${id}: ${e.message}`; netDraw(); }
}

// ---------- the side section ----------
// to the play tab with the netplay section shown, unfolded and scrolled to (the palette's netplay entries); host: open a lobby too
function openNetplay(host, server = false) {
  if (mode() !== labMode || lab.mode !== 'play') setMode('play');
  layShow('side:netplay', true); lay().fold['play:netplay'] = false; saveLay();
  if (host && (!net.lobby || net.lobby.phase === 'closed')) netLobby('host');
  panels();
  net.box?.scrollIntoView({ block: 'nearest' });
  if (!host) net.box?.querySelector(server ? 'input[placeholder="server address"]' : 'input[placeholder]')?.focus();
}
const netSide = () => lab.mode === 'play' ? [h('h3', { textContent: 'netplay', tip: 'Fight someone online, browser to browser (one hosts, sends a link, gets a code back) or through a stick2 server (room codes). See docs/netplay.md and docs/server.md' }), netBox()] : [];
// built once and filled at once: until a lobby event redraws it, an empty box shows a bare heading
const netBox = () => net.box ?? (net.box = h('div', { cls: 'netplay' }), netDraw(), net.box);
// open the chat: the netplay section, with the chat field focused (the palette's "netplay: chat")
function openNetChat() { openNetplay(false); net.box?.querySelector('.netsay')?.focus(); }
// a code from the camera, where the browser can read QR codes (BarcodeDetector); null when it can't (paste then)
function netScan(done) {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) { netSay(`this browser can't scan: paste the code instead`); return; }
  const video = h('video', { cls: 'netcam', muted: true, playsInline: true }), shade = h('div', { cls: 'netscan' }, video, h('p', { textContent: 'point the camera at the other screen\'s QR code' }));
  let stream = null, live = true;
  const stop = () => { live = false; stream?.getTracks().forEach(t => t.stop()); shade.remove(); };
  shade.append(button(':close: cancel', 'Stop scanning', stop));
  document.body.append(shade);
  const det = new BarcodeDetector({ formats: ['qr_code'] });
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(async s => {
    stream = s; video.srcObject = s; await video.play();
    while (live) {
      const found = (await det.detect(video).catch(() => [])).map(c => c.rawValue).find(netCodeIn);
      if (found) { stop(); done(found); return; }
      await new Promise(r => setTimeout(r, 200));
    }
  }, () => { stop(); netSay(`no camera (or no permission): paste the code instead`); });
}
// a field for a code that acts the moment a whole one lands in it (typed, pasted or scanned), with paste and scan beside it
function netCodeField(placeholder, tip, act) {
  const f = h('input', { cls: 'macro', placeholder, tip, onkeydown: e => { e.stopPropagation(); if (e.code === 'Enter') act(f.value); }, oninput: () => { if (netCodeIn(f.value)) act(f.value); } });
  const paste = navigator.clipboard?.readText ? button(':content_copy: paste', 'Paste from the clipboard', () => navigator.clipboard.readText().then(t => { f.value = t; act(t); }, () => f.focus())) : null;
  const scan = 'BarcodeDetector' in window ? button(':videocam: scan', 'Scan the other screen\'s QR code with the camera', () => netScan(t => { f.value = t; act(t); })) : null;
  return [h('div', { cls: 'netrow' }, f), h('div', { cls: 'bar' }, paste, scan)];
}
const netStep = (n, text) => h('p', { cls: 'netstep', textContent: `${n}. ${text}` });
const netPinBox = pin => h('p', { cls: 'netpin', tip: 'Tell the other player this PIN apart from the link (say it, or another app); the QR code carries both' }, 'PIN ', h('b', { textContent: pin.replace(/(....)/, '$1-') }));
const netQr = (text, tip) => { const qr = qrCanvas(text, 3); if (qr) Object.assign(qr, { className: 'netqr' }).dataset.tip = tip; return qr; };
const netTime = d => d.toTimeString().slice(0, 5);
function netCopy(text, what) { navigator.clipboard?.writeText(text).then(() => netSay(`${what} copied`), () => netSay(`couldn't copy: select it and copy by hand`)); }
const netCodeBox = code => h('textarea', { cls: 'netcode', readOnly: true, value: code, rows: 3, tip: 'Click to select it all', onclick: e => e.target.select() });
function netDraw() {
  const box = net.box; if (!box) return;
  const L = net.lobby, rows = [];
  if (!L || L.phase === 'closed') {
    if (net.err) rows.push(h('p', { cls: 'neterr', textContent: net.err }));
    else if (L?.state?.error) rows.push(h('p', { cls: 'neterr', textContent: L.state.error }));
    if (net.pending) {
      // a sealed invite, waiting for its PIN
      const pin = h('input', { cls: 'macro netpinin', placeholder: 'PIN', maxLength: 9, autocapitalize: 'characters', tip: 'The 8-character PIN the host gave you; Enter joins',
        onkeydown: e => { e.stopPropagation(); if (e.code === 'Enter') netEnter(net.pending, pin.value); },
        oninput: () => { if (netPinClean(pin.value).length === NET_PIN_LEN) netEnter(net.pending, pin.value); } });
      setTimeout(() => pin.isConnected && pin.focus());
      rows.push(netStep(1, 'type the PIN the host gave you:'), h('div', { cls: 'netrow' }, pin, button(':check: join', 'Join with this PIN', () => netEnter(net.pending, pin.value))),
        h('div', { cls: 'bar' }, button(':close: cancel', 'Forget this invite', () => { net.pending = null; net.err = null; netDraw(); })));
    } else {
      const name = h('input', { cls: 'macro', value: netName(), maxLength: NAMES.max, tip: `Your name in the lobby (${NAMES.min}-${NAMES.max} characters); a server adds a #tag if someone there has it already`, onkeydown: e => e.stopPropagation(), onchange: e => netRename(e.target.value) });
      rows.push(h('div', { cls: 'netrow' }, 'name ', name, button(':casino: reroll', 'A new made-up name (it stays on this device until the next reroll)', () => { netReroll(); netDraw(); })),
        ...net.home && !net.p2p ? netHomeRows(net.home) : netOtherRows());
      if (net.home) rows.push(h('div', { cls: 'bar' }, button(net.p2p ? `:arrow_back: back to ${net.home.server || 'this server'}` : ':more_horiz: other ways to play',
        net.p2p ? 'Rooms on the server this page came from' : 'Browser to browser with an invite, or another server', () => { net.p2p = !net.p2p; netDraw(); })));
      if (net.rooms) rows.push(netRoomList(net.rooms));
      if (net.replays) rows.push(netReplayList(net.replays));
    }
  } else {
    const st = L.state, me = L.me;
    if (net.err) rows.push(h('p', { cls: 'neterr', textContent: net.err }));
    // the codes that have to travel, until the link is up: the host's invite (and the guest's answer back), or the guest's answer
    if (L.host && net.inviting === 'waiting' && net.code) {
      const link = netInviteLink(net.code);
      rows.push(netStep(1, 'send the link, and tell them the PIN (or let them scan the QR code):'), netCodeBox(link), netPinBox(net.pin),
        netQr(netInviteLink(net.code, location.href, net.pin), 'Scan it with a phone or a second screen: it carries the PIN too'),
        h('div', { cls: 'bar' }, button(':content_copy: copy link', 'Copy the invite link (without the PIN)', () => netCopy(link, 'link')),
          button(':content_copy: link + PIN', 'Copy the link with the PIN in it: anyone who sees it can join and see your address', () => netCopy(netInviteLink(net.code, location.href, net.pin), 'link with PIN'))),
        netStep(2, 'their answer code (it connects as soon as it lands here):'),
        ...netCodeField('paste their answer code', 'The code the guest sent back, or scan the QR code on their screen', netAnswer));
    } else if (L.host && net.server?.room) {
      const link = netServerLink(net.server.url, net.server.room), qr = qrCanvas(link, 3);
      if (qr) Object.assign(qr, { className: 'netqr' }).dataset.tip = 'Scan it with a phone to join this room';
      rows.push(h('p', {}, 'room ', h('b', { textContent: net.server.room }), ` on ${netServerName(net.server.url)}: share the code, the link or the QR code`), qr,
        h('div', { cls: 'bar' }, button(':content_copy: copy link', 'Copy the room link (players join, or watch once both places are taken)', () => netCopy(link, 'link')),
          button(':visibility: watch link', 'Copy a link that joins as a spectator', () => netCopy(netServerLink(net.server.url, net.server.room, true), 'watch link'))));
    } else if (L.host && net.server) rows.push(h('p', { textContent: 'opening a room…' }));
    else if (L.host && net.inviting === 'making') rows.push(h('p', { textContent: 'making the invite… (a few seconds)' }));
    else if (L.host && net.inviting === 'connecting') rows.push(h('p', { textContent: 'connecting to the guest…' }));
    if (!L.host && net.code && net.codeKind === 'answer' && !st)
      rows.push(netStep(2, 'send this code back to the host, or let them scan it:'), netCodeBox(net.code),
        netQr(net.code, 'The host scans this with the scan button beside their answer field'),
        h('div', { cls: 'bar' }, button(':content_copy: copy code', 'Copy your answer code', () => netCopy(net.code, 'code'))),
        h('p', { textContent: 'waiting for the host…' }));
    else if (!L.host && !st) rows.push(h('p', { textContent: 'opening the invite… (a few seconds)' }));
    if (st) {
      if (st.error) rows.push(h('p', { cls: 'neterr', textContent: st.error }));
      rows.push(...st.slots.map((s, i) => h('div', { cls: 'netslot' + (s?.id === L.id ? ' me' : '') }, `P${i + 1} `,
        s ? h('b', { textContent: s.name }) : h('i', { textContent: 'open' }), s ? ` · ${s.char || '…'}${s.ready ? ' · ready' : ''}${s.id !== 'h' && s.rtt ? ` · ${s.rtt} ms` : ''}` : '', s ? netModerate(L, s) : null)));
      if (st.watch.length) rows.push(h('div', { cls: 'netrow' }, 'watching: ', ...st.watch.flatMap(w => [h('b', { textContent: w.name }), netModerate(L, w), ' '])));
      if (L.host && net.server?.room) rows.push(h('div', { cls: 'bar' }, toggle(':lock: lock room', 'Turn away anyone new (the people already here stay)', () => !!net.server.locked, v => net.server.lock(v))));
      if (st.phase === 'lobby' && me) {
        const pick = h('select', { tip: 'Your character', onchange: e => L.pick(e.target.value) }, Object.keys(CHARS).map(k => h('option', { value: k, textContent: k, selected: k === (me.char || CURRENT) })));
        if (!me.char) setTimeout(() => L.pick(pick.value));
        rows.push(h('div', { cls: 'netrow' }, pick, button(me.ready ? ':check: ready' : ':close: not ready', 'Ready to fight (needs a character; any change clears it)', () => L.ready(!me.ready), me.ready ? 'tog on' : 'tog')));
      }
      if (st.phase === 'lobby' && L.host) {
        const go = button(':play_arrow: start', `Start the fight (${netScen()}, with the stage and settings as they are here) once both are ready`, () => L.start());
        go.disabled = !L.canStart();
        rows.push(h('div', { cls: 'bar' }, go, net.server ? null : button(':person: invite', 'Make another invite: a second player if the slot is open, else a spectator', netInvite),
          toggle(':sync_alt: rollback', 'Rollback: run on without waiting for the other player\'s input (guessing it), and correct the moment it arrives; less input delay, a slight snap on a wrong guess. Off: lockstep, every frame waits for both inputs (more delay, never a correction)', () => net.rollback, v => { net.rollback = v; })));
      }
      if (st.phase === 'sync') rows.push(h('p', { textContent: 'starting: checking both sides built the same fight…' }));
      if (st.phase === 'match' && net.match) rows.push(net.status = h('p', { textContent: netStatus(), tip: 'The online fight: frames run, input delay (frames between a press and its move, the same on both sides), how many frames waited on the other player' }));
      if (st.phase === 'post') rows.push(h('div', { cls: 'bar' }, L.host ? button(':replay: rematch', 'Back to the lobby for another fight', () => L.rematch()) : null,
        net.match ? button(':replay: watch again', 'Play this fight again in the play tab, as a replay', () => netWatchAgain(net.match.replay())) : null,
        net.match ? button(':save: replay', 'Save this fight as a replay file', () => download(`netplay-${Date.now()}.json`, net.match.replay())) : null));
      rows.push(netChat(L));
    }
    rows.push(h('div', { cls: 'bar' }, button(':close: leave', 'Leave the lobby (mid-fight, that\'s a forfeit)', () => { L.leave(); netHangUp(); net.match = null; net.code = null; net.err = null; build(); netDraw(); })));
  }
  const keep = box.querySelector('.netsay'), focused = keep && document.activeElement === keep, draft = keep?.value || '';
  box.replaceChildren(...rows.filter(Boolean));
  // a redraw (any lobby change) mustn't eat a half-typed chat line
  const say = box.querySelector('.netsay'); if (say) { say.value = draft; if (focused) say.focus(); }
  const log = box.querySelector('.netlog'); if (log) log.scrollTop = log.scrollHeight;
}
// the page came from a stick2 server: its rooms first, nothing to type but a room code
function netHomeRows(home) {
  const url = home.url, roomIn = h('input', { cls: 'macro', placeholder: 'room code', tip: 'The room code someone gave you; Enter joins', onkeydown: e => { e.stopPropagation(); if (e.code === 'Enter') netLobby('guest', { url, room: roomIn.value }); } });
  return [h('p', {}, 'playing on ', h('b', { textContent: home.server || netServerName(url) }), home.region ? ` · ${home.region}` : ''),
    h('div', { cls: 'bar' }, button(':add: new room', 'Open a room here and share its code, link or QR code', () => netLobby('host', { url })),
      toggle(':visibility: public', 'List the room below for everyone on this server (off: only people with the code or link can join)', () => net.public, v => { net.public = v; }),
      button(':replay: replays', 'This server\'s saved fights: watch one again or save it', () => netReplays(url))),
    h('div', { cls: 'netrow' }, roomIn, button(':check: join', 'Join a room by its code', () => netLobby('guest', { url, room: roomIn.value })),
      button(':visibility: watch', 'Watch the room\'s fight as a spectator', () => netLobby('guest', { url, room: roomIn.value, want: 'watch' })))];
}
// browser to browser (an invite and its PIN), or any server by its address
function netOtherRows() {
  const srv = h('input', { cls: 'macro', value: netServerSaved(), placeholder: 'server address', tip: 'A stick2 server (see docs/server.md), e.g. play.example.org, or localhost (port 8080 unless you type one)', onkeydown: e => e.stopPropagation() });
  const roomIn = h('input', { cls: 'macro', placeholder: 'room code', tip: 'The room code the host gave you; Enter joins', onkeydown: e => { e.stopPropagation(); if (e.code === 'Enter') netLobby('guest', { url: srv.value, room: roomIn.value }); } });
  return [h('div', { cls: 'bar' }, button(':link: host', 'Open a lobby and make an invite to send to the other player', () => netLobby('host'))),
    h('p', { textContent: 'or join with the invite you got:' }),
    ...netCodeField('paste an invite link or code', 'The link or code the host sent you; it joins as soon as it\'s all here', t => netEnter(t)),
    // or through a dedicated server: no codes, just a room code
    h('p', { textContent: 'or through a server:' }), h('div', { cls: 'netrow' }, srv),
    h('div', { cls: 'bar' }, button(':link: host on server', 'Open a room on the server and share its code or link', () => netLobby('host', { url: srv.value })),
      toggle(':visibility: public', 'List the room in the server\'s room browser (off: only people with the code or link can join)', () => net.public, v => { net.public = v; }),
      button(':list: rooms', 'Browse the server\'s public rooms', () => netRooms(srv.value)),
      button(':replay: replays', 'The server\'s saved fights: watch one again or save it', () => netReplays(srv.value))),
    h('div', { cls: 'netrow' }, roomIn, button(':check: join room', 'Join a room on the server by its code', () => netLobby('guest', { url: srv.value, room: roomIn.value })),
      button(':visibility: watch', 'Watch the room\'s fight as a spectator', () => netLobby('guest', { url: srv.value, room: roomIn.value, want: 'watch' })))];
}
// a server's public rooms, each with join and watch
function netRoomList({ url, server, region, rooms, loading }) {
  const head = h('p', {}, h('b', { textContent: server || netServerName(url) }), region ? ` · ${region}` : '', loading ? ' · loading…' : ` · ${rooms.length} public room${rooms.length === 1 ? '' : 's'}`,
    button(':replay:', 'List the rooms again', () => netRooms(url)), button(':close:', 'Hide the room list', () => { net.rooms = null; netDraw(); }));
  return h('div', { cls: 'netrooms' }, head, rooms.map(r => h('div', { cls: 'netslot' },
    h('b', { textContent: r.name }), ` · ${r.room} · ${r.phase} · ${r.players}/2${r.watchers ? ` · ${r.watchers} watching` : ''}${r.locked ? ' · locked' : ''}`,
    r.locked ? null : button(':check: join', `Join ${r.name}`, () => netLobby('guest', { url, room: r.room })),
    button(':visibility: watch', `Watch ${r.name}`, () => netLobby('guest', { url, room: r.room, want: 'watch' })))));
}
// a server's saved replays, each with watch and save
function netReplayList({ url, server, replays, loading }) {
  const head = h('p', {}, h('b', { textContent: server || netServerName(url) }), loading ? ' · loading…' : ` · ${replays.length} replay${replays.length === 1 ? '' : 's'}`,
    button(':replay:', 'List the replays again', () => netReplays(url)), button(':close:', 'Hide the replays', () => { net.replays = null; netDraw(); }));
  return h('div', { cls: 'netrooms' }, head, replays.map(r => h('div', { cls: 'netslot' },
    h('b', { textContent: (r.players || []).join(' vs ') || r.id }), ` · ${r.scenario} · ${Math.round(r.frames / 60)} s · ${netTime(new Date(r.at))}`,
    button(':play_arrow: watch', 'Watch this fight again', () => netReplayOpen(url, r.id, netWatchAgain)),
    button(':save:', 'Save it as a replay file', () => netReplayOpen(url, r.id, rep => download(`netplay-${r.id}.json`, rep))))));
}
// on a server: the host can kick (and ban from the room) anyone; anyone can report someone else, with the chat as it is
function netModerate(L, who) {
  if (!net.server || who.id === L.id) return null;
  const lines = () => net.log.filter(m => m.from).map(m => `${netTime(m.at)} ${m.from}: ${m.text}`);
  const report = button(':gavel:', `Report ${who.name} to the server's admins (sends the chat log)`, () => {
    const reason = prompt(`Why report ${who.name}?`, ''); if (reason === null) return;
    net.server.report(who.id, reason, lines()); netSay(`reported ${who.name}`);
  });
  if (!L.host) return who.id === 'h' ? report : null;
  return h('span', {}, ' ', button(':close:', `Kick ${who.name}`, () => net.server.kick(who.id)),
    button(':block:', `Kick ${who.name} and keep them out of this room`, () => net.server.kick(who.id, true)), report);
}
// the chat: the log (names, times, the app's own lines apart), a field, and quick lines; keys typed in it never reach the fight
const NET_QUICK = ['gg', 'one more?', 'nice!', 'brb'];
function netChat(L) {
  const say = h('input', { cls: 'macro netsay', placeholder: 'chat', maxLength: 200, tip: 'Enter sends; Esc back to the fight', onkeydown: e => { e.stopPropagation();
    if (e.code === 'Enter' && say.value.trim()) { L.chat(say.value); say.value = ''; } else if (e.code === 'Escape') say.blur(); } });
  return h('div', { cls: 'netchat' },
    h('div', { cls: 'netlog' }, net.log.map(m => h('div', { cls: m.from ? '' : 'netsys', tip: netTime(m.at) },
      h('span', { cls: 'nettime', textContent: netTime(m.at) + ' ' }), m.from ? h('b', { textContent: m.from + ': ' }) : null, m.text))),
    say, h('div', { cls: 'bar' }, NET_QUICK.map(q => button(q, `Say "${q}"`, () => L.chat(q)))));
}
