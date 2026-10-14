# Netplay

[← docs index](README.md)

Online play between two browsers, with no server: the design, and what's built so far. Status: **layers 1–3 are built and tested** (connection, invite codes, lobby). Layer 4 (match inputs) and the lobby UI are not built yet.

## Constraints

- **No server.** The app is static files (GitHub Pages, itch.io). Players connect directly over a WebRTC data channel. A public STUN server only tells each browser its own address.
- **The engine is deterministic.** The same scenario, settings, seed and character definitions give the same fight, so the players only need to send each other their inputs.
- **Characters can be edited.** A match sends full character definitions, the way a replay does, never just names.
- **A server can come later.** The connection is set up by a swappable *signaler*. A server would replace the copy-and-paste step and nothing else.

## Layers

| Layer | File | Job |
|---|---|---|
| 1. Transport | `src/netplay.js` (`NetPeer`) | One `RTCPeerConnection` with one ordered, reliable data channel, carrying JSON messages |
| 2. Signaling | `src/netplay.js` (`ManualSignal`, `netHost`, `netJoin`) | Gets the host's offer code to the guest, and the guest's answer code back |
| 3. Lobby | `src/lobby.js` (`Lobby`) | Who's in, who plays which character, ready, start, rematch, leave |
| 4. Match | not built yet | Inputs every frame, input delay, then rollback |

The lobby never touches the network. The host links each guest with a send function and passes whatever arrives to `receive`. So the same lobby runs over WebRTC, over a server relay, or (in the tests) over plain function calls.

## Connecting (layers 1–2)

1. **The host** creates an invite: `netInviteGuest(lobby, sig)`. The signaler shows the **offer code**, or a link with it: `netInviteLink(code)` gives `…/stick2/#join=s2a.…`.
2. **The guest** opens the link or pastes the code: `netJoinLobby(lobby, sig)`, then `sig.paste(code)`. The signaler shows the **answer code**.
3. **The host** pastes the answer code. The channel opens, and the guest sends its hello.

Each invite is for one guest. To let in another guest or a spectator, the host creates another invite.

**Codes.** A code is the session description, compressed with `deflate-raw` and encoded as base64url, behind an `s2a.` prefix that versions the format. Codes are currently about 600 characters: fine for a link or a chat message, too long to type by hand. `netDecode` finds the code inside a bare code, a link, or a whole chat message.

**ICE.** Every candidate has to be in the code, since nobody passes candidates along by hand as they arrive. So a code waits for candidate gathering to finish, for at most `NET_GATHER_MS` (5 s). If the STUN server can't be reached, the candidates found by then still connect on a LAN or through an open NAT. Two players both behind strict (symmetric) NATs would need a TURN relay, which is out of scope.

### The signaler interface

Every signaler has these four methods. A server-backed one is a drop-in replacement:

| Side | Method | Does |
|---|---|---|
| host | `offer(code)` | publish our offer |
| host | `answer() → Promise<code>` | the guest's answer, once it arrives |
| guest | `getOffer() → Promise<code>` | the host's offer |
| guest | `reply(code)` | send our answer back |

`ManualSignal(show)` is the serverless signaler. `show(code, 'offer' | 'answer')` displays our code, and `paste(code)` hands over the other side's. A server signaler would instead `offer` by posting the code under a room code such as `ABCD`, and `answer` by waiting for the reply. That gives short room codes, and a public room list could come later.

## The lobby (layer 3)

The host is the authority. Guests send requests; the host applies them and broadcasts the whole lobby with a revision number (`rev`). A guest's view is always just the latest snapshot, so the two sides can't drift apart.

```
lobby → sync → match → post
  ↑                     │
  └────── rematch ──────┘          (any phase → closed: left, rejected, timed out)
```

| Phase | What happens |
|---|---|
| `lobby` | Players pick characters and toggle ready. The host picks the scenario and settings. |
| `sync` | The host has sent the match. Each guest builds the fight and replies with its hash. |
| `match` | Every hash matched. Layer 4 runs the fight. |
| `post` | Result shown. The host can call a rematch. |
| `closed` | We left, were turned away, or lost the host. `state.error` says which. |

**The snapshot:** `{ rev, phase, scenario, over, slots: [{ id, name, char, ready, rtt }, …], watch: [{ id, name }], error, result }`. The host's id is `h` and guests are `g1`, `g2`, …. There are two slots; anyone after that, or anyone who asks to, watches (up to 6).

**Rules.**
- Ready needs a character.
- A new pick clears that player's ready.
- A scenario or settings change clears everyone's, so nobody starts on settings they didn't see.
- Start needs both slots filled and ready.
- Names, characters and chat are trimmed and length-capped.
- Requests from a spectator or out of phase are ignored.

### Messages

| Message | From | Purpose |
|---|---|---|
| `hello {proto, engine, name, want}` | guest | Join as `'play'` (a free slot, otherwise watch) or `'watch'` |
| `welcome {id}` / `reject {reason}` | host | Let in, or turn away: other protocol (`NET_PROTO`) or engine version (`ENGINE_VERSION`), lobby full |
| `lobby {state}` | host | The whole snapshot, after every change |
| `pick {char, def?}` / `ready {on}` | guest | Requests. `def` is a full character definition, for a character the host doesn't have. |
| `chat {text}` → `chat {from, name, text}` | both | Sent to the host, which sends it to everyone |
| `start {header}` | host | The match |
| `synced {hash}` | guest | The hash of the fight the guest built from the header |
| `ping {at}` / `pong {at}` | both | Every second. Measures round-trip time (`rtt`, for input delay later) and keeps the link alive. |
| `leave` / `bye {reason}` | guest / host | A clean exit. Otherwise 10 s of silence drops the link. |

### Starting a match

`start(seed)` builds the match with `lobbyHeader`: a **replay header**, meaning `makeReplay` with no frames yet. It holds the scenario with P1 set to `human` and P2 to `human2`, the settings, the seed, and both characters as full definitions. So a finished match saves as an ordinary replay.

Each guest rebuilds the fight from the header and replies with `lobbyHash`: a hash of the header's text, plus the world's `stateHash()` after half a second of no input. If any hash differs from the host's, the lobby goes back to `lobby` with an error and everyone's ready cleared. That catches a mismatch before the first real input instead of in the middle of the fight.

A player leaving during `sync` sends the lobby back to `lobby`. Leaving during `match` is a forfeit: the lobby moves to `post` with `result: { forfeit: id }`.

## Layer 4: next

- **Inputs:** `input {f, bits}` every frame, using the replay's key bitmask, with the last few frames resent each time so a lost message doesn't stall the fight. Probably on a second, unordered and unreliable channel.
- **Input delay first:** a fixed 2–3 frames, set from the lobby's `rtt`. **Then rollback**, using the world's `restore` and checkpoints.
- **Desync checks:** `sum {f, hash}` every K frames, using the same checksums replays keep.
- **Spectators:** the host relays both players' inputs to them, and they run the fight themselves.
- **Lobby UI:** a panel with host/join, the code with copy and QR buttons, slots, character pick, ready, chat. A `#join=` link opens it.
- **Shorter codes:** strip the SDP down to ufrag, pwd, fingerprint and candidates to get a code of about 150 characters.

## Using it

```js
// host
const lobby = new Lobby({ role: 'host', name: 'hana', hooks: { change: l => render(l.state), event: e => log(e) } });
const sig = new ManualSignal(code => showCode(code));
netInviteGuest(lobby, sig);         // shows the offer code; then, when the guest's answer comes back:
sig.paste(answerCode);
lobby.pick('stick'); lobby.ready(); // … once both are ready:
lobby.start();                      // hooks.event gets { type: 'phase', phase: 'match', header }

// guest
const lobby = new Lobby({ role: 'guest', name: 'gus', hooks: { … } });
const sig = new ManualSignal(code => showCode(code));
netJoinLobby(lobby, sig);
sig.paste(netJoinCode(location.hash) || pastedCode); // shows the answer code to send back
```

Call `lobby.tick()` often (every frame is fine) on both sides, for pings and timeouts.

## Tests

- `tests/lobby.test.js` (`npm test`) covers the lobby over fake links: join, version reject, spectators, ready rules, start and sync, desync, a guest's own character, leave and forfeit, rematch, keepalive and timeouts, chat. It also tests the codes and the manual signaler.
- `node tools/netplay-test.js` runs two separate headless Chromes, connected peer to peer through the app's own `src/` files. They go through the lobby to a synced match start, then the guest leaves mid-match. Node only carries the codes between them.

`prototype/netplay.html` is the original connection-only proof of concept, which `src/netplay.js` replaces.
