# Netplay

[← docs index](README.md)

Online play between two browsers, with no server: the design, and what's built so far. Status: **all four layers, rollback, spectators, and the play tab's netplay section are built and tested.** Spectators can join mid-match. Time sync is next.

## Constraints

- **No server.** The app is static files (GitHub Pages, itch.io). Players connect directly over a WebRTC data channel. A public STUN server only tells each browser its own address.
- **The engine is deterministic.** The same scenario, settings, seed and character definitions give the same fight, so the players only need to send each other their inputs.
- **Characters can be edited.** A match sends full character definitions, the way a replay does, never just names.
- **A server is optional.** The connection is set up by a swappable *signaler*. The [dedicated server](server.md) replaces the data channel and the copy-and-paste step with a WebSocket relay (`src/net/netserver.js`); the lobby and the match are the same.

## Layers

| Layer | File | Job |
|---|---|---|
| 1. Transport | `src/net/netplay.js` (`NetPeer`) | One `RTCPeerConnection` with one ordered, reliable data channel (negotiated: both sides make it, id 0, no in-band open handshake), carrying JSON messages |
| 2. Signaling | `src/net/netplay.js` (`ManualSignal`, `netHost`, `netJoin`) | Gets the host's offer code to the guest, and the guest's answer code back |
| 3. Lobby | `src/net/lobby.js` (`Lobby`) | Who's in, who plays which character, ready, start, rematch, leave |
| 4. Match | `src/net/netmatch.js` (`NetMatch`) | Inputs every frame with a fixed input delay, desync checks, the result, the replay |
| UI | `src/net/netui.js` | The play tab's **netplay** section, `#join=` links, and running the match on the stage |

The lobby never touches the network. The host links each guest with a send function and passes whatever arrives to `receive`. So the same lobby runs over WebRTC, over a server relay, or (in the tests) over plain function calls.

## Connecting (layers 1–2)

1. **The host** creates an invite: `netInviteGuest(lobby, sig)`. The signaler shows the **offer code**, or a link with it: `netInviteLink(code)` gives `…/stick2/#join=s2a.…`.
2. **The guest** opens the link or pastes the code: `netJoinLobby(lobby, sig)`, then `sig.paste(code)`. The signaler shows the **answer code**.
3. **The host** pastes the answer code. The channel opens, and the guest sends its hello.

Each invite is for one guest. To let in another guest or a spectator, the host creates another invite.

**Codes.** A code carries one browser's session description: offer or answer, connection credentials, and network candidates. `netDecode` finds the code inside a bare code, a link, or a whole chat message. Codes come in two forms:

- **Short, `s2b.`** (about 110–150 characters). Only what differs between two connections is kept, joined by `~`:
  - offer or answer, with the answer's role (`o`, `a` for active, or `p` for passive);
  - the ICE username and password, with `+` and `/` mapped to `-` and `_`;
  - the certificate's SHA-256 fingerprint, as base64url;
  - each UDP candidate's type (host, srflx, prflx or relay), address and port. An mDNS `….local` name is packed into 22 characters, and TCP candidates are left out.

  The other side rebuilds the rest of the description from the standard one-data-channel template, giving each candidate the standard priority for its type.
- **Long, `s2a.`** (about 600 characters). This is the whole description, compressed with `deflate-raw` and encoded as base64url. It's the fallback for anything the template can't rebuild: more than one media section, a different `mid`, a fingerprint other than SHA-256, or no UDP candidate.

Both forms are URL-safe as they are.

**Sealed codes, `s2c.`** The plain codes carry each side's network candidates, so anyone who sees a link sees the host's local and public IP addresses and ports. The app therefore seals every code by default. Each hosted lobby gets an 8-character **PIN** (`netPin()`, from 31 characters that can't be mistaken for each other, about 40 bits). `netSeal(code, pin)` encrypts the code with AES-GCM under a key derived from the PIN with PBKDF2-SHA-256 (100,000 rounds), using a fresh IV each time, and `netUnseal(text, pin)` reverses it. A wrong PIN fails with "wrong PIN". The guest's answer is sealed with the same PIN.
- The link the host copies leaves the PIN out: `#join=s2c.…`. The PIN is shown on its own, so the host can say it aloud or send it through another app.
- The QR code carries both (`#join=s2c.…&pin=…`), because whoever scans it is standing at the screen. **link + PIN** copies that form too.
- `ManualSignal(show, pin)` passes the PIN to its peers, which seal what they send and unseal what they receive. Without a PIN, codes stay plain, as before.

**QR code.** The host's invite link shows as a QR code, and so does the guest's answer (`src/net/qr.js`), so a phone or a second screen can scan it. It's written from scratch, with no library and no image:
- byte mode at error-correction level M (about 15% of the code can be smudged and it still reads), versions 1–20;
- Reed-Solomon error correction per block, then interleaving;
- the eight masks, keeping the one with the lowest penalty.

A typical invite link is version 8 or 9. The encoder was checked against an independent decoder (jsQR) across every version and mask, and in the app the rendered canvas decodes back to the exact link.

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

## The match (layer 4)

When the lobby reaches `match`, each side builds a `NetMatch` from the header (P1 is the host, `side: 0`). Each side then calls `tick(input)` once per 1/60 s of wall time.

- **Input delay.** An input made at frame `f` is for frame `f + delay` and is sent at once, so by the time that frame runs it has usually arrived. Each tick runs one frame (`f` stays exactly `delay` behind our latest input), and up to two only to catch up after a wait.
- **Lockstep** (`roll` 0). A frame runs only once both inputs for it are in. Otherwise the match waits (a *stall*, counted in `stalls`).
- **Rollback** (`roll` > 0, the default in the app). A frame whose input from the other side hasn't arrived runs anyway on a guess: their latest input, held, with no new presses. Up to `roll` frames (7) can run past the *confirmed* frame `c`, the last frame both real inputs are in for; beyond that the match waits.
  - **A wrong guess.** When the real input arrives and differs, the world goes back to the snapshot before that frame and plays forward again to where it was. Sound is muted on the replay, so nothing plays twice. `rollbacks` counts these and `rolled` counts the frames played again.
  - **Snapshots** are taken only before guessed frames, since only a guess can turn out wrong. They leave out what's only drawn (each fighter's pose and trail histories, and the debug graphs), which the restored world keeps from before. That makes a snapshot about 0.5 ms instead of 9. The match world's own rewind checkpoints keep only their hash.
  - **What's never guessed.** Desync hashes and the end of the fight come only from confirmed frames, so a guess can't end a fight that the real inputs don't.
- **Setting the delay.** The host picks the delay from the guest's round trip and puts it in the header (`netDelay`, and `netRoll` for rollback), so both sides use the same values.
  - **Lockstep:** the delay covers the whole one-way trip plus a frame (between 2 and 8).
  - **Rollback:** the delay covers all but about 3 frames of it (at least 1), and the guess covers the rest. Shallow rollbacks are cheaper and show smaller corrections.
  - **Measured** (Node, one side's tick): at 50 ms each way, rollback is about 2 ms on average, 5 ms at p95 and 11 ms at worst. At 165 ms each way, rollback waits 3 times in 600 frames where lockstep waits 142.
- **Nothing is assumed about the other side's inputs,** not even the idle first frames. So the two sides can't drift apart, even with different delays.
- **Inputs** travel as the replay's key bitmask: `in {f, b: [masks], a}`. Each message carries every input the other side hasn't acknowledged yet (`a` is how far we've got theirs), up to the last 30. A lost message costs nothing, and a stalled side keeps resending, so a loss can't freeze both sides.
- **A press during a stall** (hop, punch, kick, special) carries over to the next input, so a quick tap is never lost.
- **Frame time is fixed** at 1/60 s, never wall time. The same inputs always give the same fight.
- **Desync checks.** Every 30 frames each side sends `sum {f, h}` with `world.stateHash()`. The first difference fires `hooks.desync(frame)`.
- **The end.** When the world is done, `result` is `{ winner: 0 | 1 | null, frames, hash }` (by K.O., or by health at a time out). The host passes it to `lobby.finish`, which moves the lobby to `post`. `replay()` is the match as a replay file.

Match messages go through the lobby: `lobby.matchSend(m)` sends them, and `hooks.match(m)` receives them, only in `match`.

### Spectators

A spectator's match is a `NetWatch`, not a `NetMatch`:

- **What the host relays.** The host's match reports each frame it confirms through `hooks.confirmed(frame, p1, p2, hash?)`, with both players' real inputs. Once per animation frame, the host batches these into one message for every spectator: `watch {f, a: [P1 masks], b: [P2 masks], s: {frame: hash}}`, sent with `lobby.watchSend`.
- **How the spectator plays it.** The spectator never guesses, so it never rolls back. It waits for a cushion of 4 frames, then plays one frame per tick, or 3 per tick when it falls more than 12 behind.
- **Checks.** It compares its own state hashes with the host's (`desync`), reaches the same end, and saves the same replay.
- **The last frames** reach the spectator just after the host's lobby has moved to `post`, so `watch` messages are accepted in `post` too.
- **Joining mid-match.** A spectator who joins during a fight gets `start {header}` right after `welcome` (it answers `synced`, which the host ignores), then the snapshot, then `hooks.catchup(id)`: the host sends one `watch` with every frame shown so far. More than 60 frames behind, the spectator fast-forwards (up to 600 frames a tick, silently).
- **Delay.** The host's `WatchFeed` (`src/net/netmatch.js`) holds spectators a number of frames behind the players (0 browser to browser; a server sets `SPECTATE_DELAY`), so they can't call out what's coming. The catch-up never goes past what's been shown, and the rest goes out when the fight ends.
- **Watch again.** After the fight, **watch again** plays it in the play tab as a replay. On a server, the host also sends it to the server's [replays](server.md#spectating-and-replays).

## In the app

The play tab's **netplay** section (`src/net/netui.js`), first in the side panel and unfolded by default; the command palette's **netplay**, **netplay: host**, **netplay: server**, **netplay: rooms**, **netplay: reroll name**, **netplay: chat** and **netplay: scan** entries go straight to it (`openNetplay`):

- **Before connecting:** your name (made up from this device's seed until you type one; **reroll** makes a new one, see [server names](server.md#names)), **host**, and a field for an invite. Code fields act as soon as a whole code lands in them, whether it was typed, pasted or scanned, so there's nothing to press. **paste** reads the clipboard. **scan** reads a QR code with the camera, in browsers that have `BarcodeDetector` (Chrome on Android, for example).
- **On a page the server serves:** the server's rooms come first, with no address to type (see [running it](server.md#running-it)); **other ways to play** shows the rest of this list.
- **Through a server:** the server address, **host on server** (with **public** to list the room), **rooms** (the server's room browser: each public room with **join** and **watch**), and a room code to join or watch. In a server room the host can kick, ban from the room and **lock room**, and anyone can report (see [moderation](server.md#moderation)).
- **PIN:** a sealed invite without its PIN asks for it, and joins once 8 characters are typed. Case, spaces and dashes don't matter, and O, I and L read as 0 and 1. A wrong PIN comes back to the same prompt with the invite kept.
- **Host:** two numbered steps. Step 1 is the invite link, the PIN, the QR code, and **copy link** and **link + PIN** buttons. Step 2 is the field for the guest's answer code. A wrong or cut-off answer shows an error and keeps the field, so the guest can just send it again.
- **Guest:** the answer code to send back, with its own QR code for the host's **scan**. A `#join=` link opens the play tab already joining; the code then leaves the address bar, so a reload doesn't reuse it.
- **In the lobby:** the slots (name, character, ready, round trip), your character, **ready**, and chat. Chat keeps the last 50 lines, with times, and shows joins, leaves and results apart from what people say. It has quick lines (**gg**, **one more?**, **nice!**, **brb**), keeps a half-typed line through redraws, and Esc returns to the fight. The host also has **start**, **invite** (another invite: a second player if a slot is open, else a spectator), and **rollback** (on by default; off is lockstep).
- **During the fight:** frame, delay, rollbacks and waits; a spectator sees `watching`, the frame, and how many frames behind it is.
- **After the fight:** **rematch** (host) and **replay** (save the fight).

The fight uses the host's play-tab scenario if it's a one-on-one, otherwise `you vs ai`, always with both sides human. While a match lasts, its world is the play tab's fight. The world carries `.net`, so the frame loop drives it through `netFrame` at a steady 60 frames a second, and it keeps running while the page is paused. It is also kept out of everything that would change it on one side only: rewind, scrub, the loop toggle, and macros (`ownWorlds()`).

**Staying connected.**
- **Keepalive runs on a timer.** The lobby's pings and timeouts also run once a second on a timer, so a tab in the background (no animation frames) isn't taken for a dropped one.
- **A frozen page doesn't drop anyone.** After our own page has stood still for more than 5 seconds, the silence clocks start again instead of timing anyone out, because what the others sent meanwhile is still queued and unread.
- **An already-open channel counts as opened.** The guest's end of the channel can arrive already open, with no open event.
- **The host links a guest on its first message** if that comes before the open event.
- **An unanswered hello is repeated** every 2 seconds.
- **Leave closes every connection.**

## Next

- **Time sync:** each side reports how far ahead it runs, and the side that's ahead skips a tick now and then. Today, a side that runs ahead only finds out when it reaches the rollback window and waits.
- **A server signaler,** for short room codes and a room list. It only replaces `ManualSignal`.

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

Call `lobby.tick()` often (every frame is fine) on both sides, for pings and timeouts. Then the match:

```js
hooks.event = e => { if (e.phase === 'match') match = new NetMatch({ header: e.header, side: lobby.host ? 0 : 1, send: m => lobby.matchSend(m), hooks: { end: r => lobby.host && lobby.finish(r) } }); };
hooks.match = m => match?.receive(m);
// every 1/60 s: match.tick(readInput()); draw match.world
```

## Tests

- `tests/unit/lobby.test.js` (`npm test`) covers the lobby over fake links: join, version reject, spectators, ready rules, start and sync, desync, a guest's own character, leave and forfeit, rematch, keepalive and timeouts, chat. It also tests the codes and the manual signaler.
- `tests/unit/netmatch.test.js` (`npm test`) covers the match over a simulated network: low latency, latency above the delay (stalls), 30% lost messages, different delays on each side, a tampered input caught as a desync, a press kept through a stall, the result and a replay that plays back the same, and a match started by a lobby. The rollback tests cover:
  - high latency, with fewer waits than lockstep and rollbacks that really happen;
  - lost messages, and latency beyond the rollback window;
  - tampering;
  - the confirmed end and its replay;
  - drawing histories that survive a rollback;
  - snapshots that stay small (the world's link back to its match isn't copied).

  A spectator test runs a host, a player and a spectator over one lobby with rollback on, and checks that the spectator saw the same fight, reached the same end and saved the same replay.
- `tests/unit/lobby.test.js` also covers the short codes, using real Chrome descriptions with every kind of candidate:
  - they're under 200 characters and URL-safe;
  - they rebuild the credentials, fingerprint, role and candidates exactly;
  - an answer keeps its active or passive role;
  - anything the template can't rebuild falls back to the long code.
- `tests/unit/qr.test.js` checks the QR structure (finders, timing lines, dark module, smallest version that fits) and two matrices pinned from the jsQR-checked encoder.
- `tests/unit/globals.test.js` checks that no top-level name is declared in two `src/` scripts. A second `function` of the same name would silently replace the first, as nearly happened here.
- `node tools/dev/netplay-test.js` runs separate headless Chromes (two, then three), connected peer to peer through the app's own `src/` files:
  - through the lobby to a synced match start, then the guest leaves mid-match;
  - then through the play tab: the guest opens the host's invite link and both ready. Match messages get 80 ms of extra latency and both sides press keys, so rollback really guesses wrong on the real stages. A third browser joins through a second invite as a spectator. All three compare state hashes. Chrome runs with its background throttling off, so that three windows at once all get animation frames. When a wait runs out, the test prints each side's connection (messages sent and received), lobby and match.

  Node only carries the codes between them.
- Through the [server](server.md): `npm run test:server` (the relay, and a real lobby and match over it) and `node tools/dev/server-test.js` (two browsers: the host opens a room in the play tab, the guest opens its `#server=…&room=…` link, they fight).


