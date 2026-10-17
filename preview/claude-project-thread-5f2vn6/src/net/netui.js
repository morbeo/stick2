'use strict';
// ---------- netplay in the app: the play tab's "netplay" section (host or join, the codes, the lobby) and the match on the stage ----------
// The lobby, the connection and the match live in src/net/lobby.js, src/net/netplay.js and src/net/netmatch.js; this is only their face.
// A match's world is the play tab's fight while it lasts (build() asks netWorld()); it carries .net, so the app drives it here, at
// a fixed 60 frames a second, and leaves it out of everything that would change it locally (rewind, scrub, loop, macros).
const NET_NAME = 'stick2-netname';
const net = { rollback: true, peers: [], server: null, lobby: null, sig: null, match: null, code: null, codeKind: null, inviting: null, log: [], box: null, status: null, acc: 0, edges: {} };
const netStatus = () => { const m = net.match; if (m.watching) return `watching · frame ${m.f} · ${m.behind} behind${m.desync !== null ? ' · DESYNC' : ''}`; return `frame ${m.f} · delay ${m.delay}${m.roll ? ` · rollbacks ${m.rollbacks}` : ''} · waits ${m.stalls}${m.desync !== null ? ' · DESYNC' : ''}`; };
const ownWorlds = () => mode().worlds().filter(w => !w.net); // the fights only this page runs
const netWorld = () => net.match?.world || null;
const netName = () => { try { return localStorage.getItem(NET_NAME) || 'player'; } catch { return 'player'; } };
const netSay = text => { net.log.push(text); if (net.log.length > 8) net.log.shift(); netDraw(); };

const netServerSaved = () => { try { return localStorage.getItem(NET_SERVER) || ''; } catch { return ''; } };

// ---------- the lobby's hooks ----------
// server: { url, room?, want? } runs the lobby through a dedicated server (src/net/netserver.js) instead of WebRTC codes
function netLobby(role, server = null) {
  netHangUp(); net.log = []; net.code = null; net.match = null; net.inviting = null;
  net.sig = new ManualSignal((code, kind) => { net.code = code; net.codeKind = kind; if (kind === 'offer') net.inviting = 'waiting'; netDraw(); });
  net.lobby = new Lobby({ role, name: netName(), hooks: {
    change: () => netDraw(),
    match: m => net.match?.receive(m),
    // the host picks the input delay from the guest's round trip, and puts it in the match, so both sides use the same
    header: (state, seed, defs) => ({ ...lobbyHeader({ ...state, scenario: netScen() }, seed, defs), netDelay: netDelay(state), netRoll: net.rollback ? NETMATCH.roll : 0 }),
    event: e => {
      if (e.type === 'chat') netSay(`${e.name}: ${e.text}`);
      else if (e.type === 'joined') netSay(`${e.name} joined`);
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
  net.server = role === 'host'
    ? netServerHost(net.lobby, url, { room: code => { netSay(`room ${code} is open`); netDraw(); } })
    : netServerJoin(net.lobby, url, room, want);
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
function netInvite() { net.code = null; net.inviting = 'making'; net.peers.push(netInviteGuest(net.lobby, net.sig)); netDraw(); }
// every connection goes when the lobby does
function netHangUp() { for (const p of net.peers) p.close('left'); net.peers = []; net.server?.close('left'); net.server = null; }
function netAnswer(code) { if (!code.trim()) return; net.sig.paste(code); net.code = null; net.inviting = null; netDraw(); }
function netEnter(code) {
  if (!net.lobby || net.lobby.phase === 'closed') netLobby('guest');
  net.peers.push(netJoinLobby(net.lobby, net.sig));
  net.sig.paste(code);
  netDraw();
}
// a #join= link: straight to the play tab, joining
function netJoinFromLink(code) {
  // a reload mustn't try the same, used-up code again; cleared a moment later, so the page still knows it was opened by a link (no welcome)
  setTimeout(() => history.replaceState(null, '', location.pathname + location.search));
  if (mode() !== labMode || lab.mode !== 'play') setMode('play');
  netEnter(code);
  panels();
}
function netPhase(e) {
  if (e.phase === 'match' && e.header) {
    const desync = f => netSay(`:close: the fights went different ways at frame ${f}: save the replay and report it`);
    net.relay = { f: null, a: [], b: [], s: {} };
    // a spectator watches the host's confirmed frames; a player plays (and the host passes what it confirms on to the spectators)
    const m = net.match = !net.lobby.me
      ? new NetWatch({ header: e.header, hooks: { desync, end: r => netSay(r.winner === null ? 'draw' : `P${r.winner + 1} wins`) } })
      : new NetMatch({ header: e.header, side: net.lobby.host ? 0 : 1, send: msg => net.lobby.matchSend(msg), hooks: { desync,
        end: r => { netSay(r.winner === null ? 'draw' : r.winner === m.side ? 'you win' : 'you lose'); if (net.lobby.host) net.lobby.finish(r); },
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
  // the host: what its match confirmed since the last frame, in one message to every spectator
  const r = net.relay;
  if (net.lobby?.host && r?.a.length) {
    if (net.lobby.state.watch.length) net.lobby.watchSend({ t: 'watch', f: r.f, a: r.a, b: r.b, s: r.s });
    Object.assign(r, { f: null, a: [], b: [], s: {} });
  }
}
// the host's match confirmed frame k (both real inputs; hash: the state after it, at checks)
function netRelay(k, p1, p2, hash) {
  const r = net.relay;
  r.f ??= k; r.a.push(p1); r.b.push(p2);
  if (hash !== undefined) r.s[k + 1] = hash;
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
function netCopy(text, what) { navigator.clipboard?.writeText(text).then(() => netSay(`${what} copied`), () => netSay(`couldn't copy: select it and copy by hand`)); }
const netCodeBox = code => h('textarea', { cls: 'netcode', readOnly: true, value: code, rows: 3, tip: 'Click to select it all', onclick: e => e.target.select() });
function netDraw() {
  const box = net.box; if (!box) return;
  const L = net.lobby, rows = [];
  if (!L || L.phase === 'closed') {
    const name = h('input', { cls: 'macro', value: netName(), tip: 'Your name in the lobby', onchange: e => { try { localStorage.setItem(NET_NAME, e.target.value.trim().slice(0, 24)); } catch {} } });
    const paste = h('input', { cls: 'macro', placeholder: 'paste an invite link or code', tip: 'The link or code the host sent you; Enter joins', onkeydown: e => { if (e.code === 'Enter') { e.stopPropagation(); netEnter(paste.value); } else e.stopPropagation(); } });
    if (L?.state?.error) rows.push(h('p', { cls: 'neterr', textContent: L.state.error }));
    rows.push(h('div', { cls: 'netrow' }, 'name ', name),
      h('div', { cls: 'bar' }, button(':link: host', 'Open a lobby and make an invite link to send to the other player', () => netLobby('host'))),
      h('div', { cls: 'netrow' }, paste, button(':check: join', 'Join the lobby of the invite you pasted', () => netEnter(paste.value))));
    // or through a dedicated server: no codes, just a room code
    const srv = h('input', { cls: 'macro', value: netServerSaved(), placeholder: 'server address', tip: 'A stick2 server (see docs/server.md), e.g. play.example.org', onkeydown: e => e.stopPropagation() });
    const roomIn = h('input', { cls: 'macro', placeholder: 'room code', tip: 'The room code the host gave you; Enter joins', onkeydown: e => { e.stopPropagation(); if (e.code === 'Enter') netLobby('guest', { url: srv.value, room: roomIn.value }); } });
    rows.push(h('p', { textContent: 'or through a server:' }), h('div', { cls: 'netrow' }, srv),
      h('div', { cls: 'bar' }, button(':link: host on server', 'Open a room on the server and share its code or link', () => netLobby('host', { url: srv.value }))),
      h('div', { cls: 'netrow' }, roomIn, button(':check: join room', 'Join a room on the server by its code', () => netLobby('guest', { url: srv.value, room: roomIn.value })),
        button(':visibility: watch', 'Watch the room\'s fight as a spectator', () => netLobby('guest', { url: srv.value, room: roomIn.value, want: 'watch' }))));
  } else {
    const st = L.state, me = L.me;
    // the code that has to travel, until the link is up: the host's invite (and then the guest's answer back in), or the guest's answer
    if (L.host && net.inviting === 'waiting' && net.code) {
      const ans = h('input', { cls: 'macro', placeholder: 'paste their answer code', tip: 'The code the guest sent back; Enter connects', onkeydown: e => { e.stopPropagation(); if (e.code === 'Enter') netAnswer(ans.value); } });
      const qr = qrCanvas(netInviteLink(net.code), 3);
      if (qr) Object.assign(qr, { className: 'netqr' }).dataset.tip = 'Scan it with a phone or a second screen to open the invite there';
      rows.push(h('p', { textContent: '1. send this link to the other player, or let them scan it:' }), netCodeBox(netInviteLink(net.code)), qr,
        h('div', { cls: 'bar' }, button(':content_copy: copy link', 'Copy the invite link', () => netCopy(netInviteLink(net.code), 'link')), button(':content_copy: code only', 'Copy just the code (if a link won\'t do)', () => netCopy(net.code, 'code'))),
        h('p', { textContent: '2. paste the code they send back:' }), h('div', { cls: 'netrow' }, ans, button(':check: connect', 'Connect with the guest\'s answer code', () => netAnswer(ans.value))));
    } else if (L.host && net.server?.room) {
      const link = netServerLink(net.server.url, net.server.room), qr = qrCanvas(link, 3);
      if (qr) Object.assign(qr, { className: 'netqr' }).dataset.tip = 'Scan it with a phone to join this room';
      rows.push(h('p', {}, 'room ', h('b', { textContent: net.server.room }), ` on ${netServerName(net.server.url)}: share the code, the link or the QR code`), qr,
        h('div', { cls: 'bar' }, button(':content_copy: copy link', 'Copy the room link (players join, or watch once both places are taken)', () => netCopy(link, 'link')),
          button(':visibility: watch link', 'Copy a link that joins as a spectator', () => netCopy(netServerLink(net.server.url, net.server.room, true), 'watch link'))));
    } else if (L.host && net.server) rows.push(h('p', { textContent: 'opening a room…' }));
    else if (L.host && net.inviting === 'making') rows.push(h('p', { textContent: 'making the invite… (a few seconds)' }));
    if (!L.host && net.code && net.codeKind === 'answer' && !st)
      rows.push(h('p', { textContent: 'send this code back to the host:' }), netCodeBox(net.code), h('div', { cls: 'bar' }, button(':content_copy: copy code', 'Copy your answer code', () => netCopy(net.code, 'code'))));
    else if (!L.host && !st) rows.push(h('p', { textContent: 'connecting…' }));
    if (st) {
      if (st.error) rows.push(h('p', { cls: 'neterr', textContent: st.error }));
      rows.push(...st.slots.map((s, i) => h('div', { cls: 'netslot' + (s?.id === L.id ? ' me' : '') }, `P${i + 1} `,
        s ? h('b', { textContent: s.name }) : h('i', { textContent: 'open' }), s ? ` · ${s.char || '…'}${s.ready ? ' · ready' : ''}${s.id !== 'h' && s.rtt ? ` · ${s.rtt} ms` : ''}` : '')));
      if (st.watch.length) rows.push(h('p', { textContent: 'watching: ' + st.watch.map(w => w.name).join(', ') }));
      if (st.phase === 'lobby' && me) {
        const pick = h('select', { tip: 'Your character', onchange: e => L.pick(e.target.value) }, Object.keys(CHARS).map(k => h('option', { value: k, textContent: k, selected: k === (me.char || CURRENT) })));
        if (!me.char) setTimeout(() => L.pick(pick.value));
        rows.push(h('div', { cls: 'netrow' }, pick, button(me.ready ? ':check: ready' : ':close: not ready', 'Ready to fight (needs a character; any change clears it)', () => L.ready(!me.ready), me.ready ? 'tog on' : 'tog')));
      }
      if (st.phase === 'lobby' && L.host) {
        const go = button(':play_arrow: start', `Start the fight (${netScen()}, with the stage and settings as they are here) once both are ready`, () => L.start());
        go.disabled = !L.canStart();
        rows.push(h('div', { cls: 'bar' }, go, net.server ? null : button(':person: invite', 'Make another invite link: a second player if the slot is open, else a spectator', netInvite),
          toggle(':sync_alt: rollback', 'Rollback: run on without waiting for the other player\'s input (guessing it), and correct the moment it arrives; less input delay, a slight snap on a wrong guess. Off: lockstep, every frame waits for both inputs (more delay, never a correction)', () => net.rollback, v => { net.rollback = v; })));
      }
      if (st.phase === 'sync') rows.push(h('p', { textContent: 'starting: checking both sides built the same fight…' }));
      if (st.phase === 'match' && net.match) rows.push(net.status = h('p', { textContent: netStatus(), tip: 'The online fight: frames run, input delay (frames between a press and its move, the same on both sides), how many frames waited on the other player' }));
      if (st.phase === 'post') rows.push(h('div', { cls: 'bar' }, L.host ? button(':replay: rematch', 'Back to the lobby for another fight', () => L.rematch()) : null,
        net.match ? button(':save: replay', 'Save this fight as a replay file', () => download(`netplay-${Date.now()}.json`, net.match.replay())) : null));
      const say = h('input', { cls: 'macro', placeholder: 'chat', tip: 'Enter sends', onkeydown: e => { e.stopPropagation(); if (e.code === 'Enter' && say.value.trim()) { L.chat(say.value); say.value = ''; } } });
      rows.push(h('div', { cls: 'netlog' }, net.log.map(t => h('div', { textContent: t }))), say);
    }
    rows.push(h('div', { cls: 'bar' }, button(':close: leave', 'Leave the lobby (mid-fight, that\'s a forfeit)', () => { L.leave(); netHangUp(); net.match = null; net.code = null; build(); netDraw(); })));
  }
  box.replaceChildren(...rows);
}
