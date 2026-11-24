# State machines

The app's explicit state machines: where each lives, its states and the moves between them. Each table in the code is the source of truth; keep these diagrams in step when you change one.

| Machine | Code | Inspect it |
|---|---|---|
| [Lobby phase](#lobby-phase) | `LOBBY_PHASES`, `lobby.go()` in `src/net/lobby.js` | `lobby.inspect()`, ⌘K **netplay: lobby state** |
| [Spectator playback](#spectator-playback) | `NETWATCH_STATES`, `NetWatch.watchState` in `src/net/netmatch.js` | the netplay status line |
| [Quick match](#quick-match) | `QUICK_STATES`, `netServerQuick()` in `src/net/netserver.js` | `link.state`, `quickStatus(link)` |
| [Lab view](#lab-view) | `LAB_MODES`, `labIs()` in `src/editor/lab.js` | the play / gallery / experiment tabs |

## Lobby phase

The host moves only along `LOBBY_PHASES`; guests take the host's snapshots. The server shows only these phases in its room list, metrics and MCP tools. Every change is kept in `lobby.trail` (last 20). See [netplay.md](netplay.md#the-lobby-layer-3).

```mermaid
stateDiagram-v2
    [*] --> joining: guest
    [*] --> lobby: host
    joining --> lobby: first snapshot
    joining --> sync: snapshot
    joining --> match: snapshot (joined mid-match)
    joining --> post: snapshot
    lobby --> sync: start
    sync --> match: every hash matched
    sync --> lobby: abort (hash mismatch, someone left)
    match --> post: finish (result, forfeit)
    match --> lobby: new host calls off an unplayed fight
    post --> lobby: rematch / next
    lobby --> closed
    sync --> closed
    match --> closed
    post --> closed
    joining --> closed
    closed --> [*]
```

## Spectator playback

Worked out from `started` and how many frames the spectator holds (`behind`), by the same thresholds `tick()` uses (`NETWATCH`). It changes nothing about playback.

```mermaid
stateDiagram-v2
    [*] --> buffering
    buffering --> playing: 4 frames in hand (buffer)
    playing --> catching_up: over 12 behind (far)
    catching_up --> playing: 12 or fewer behind
    playing --> jumping: over 60 behind (jump)
    catching_up --> jumping: over 60 behind
    jumping --> catching_up: fast-forwarded
    playing --> waiting: no frame in hand
    waiting --> playing: frames arrive
    playing --> over: result
    catching_up --> over: result
    over --> [*]
    catching_up: catching up (3 frames a tick)
    jumping: jumping (silent fast-forward)
```

## Quick match

The client side of the server's quick-match queue. A message out of order (a late `queued` after `found`) is ignored. The side that waited longer is sent `matched` straight from `queued` and opens the room; the other gets `found` first. See [server.md](server.md#quick-match-and-ratings).

```mermaid
stateDiagram-v2
    [*] --> connecting
    connecting --> queued: queued
    queued --> queued: queued (waiting count)
    queued --> found: found (the other side opens the room)
    queued --> matched: matched, role host
    found --> matched: matched, role guest
    connecting --> closed: error / cancel
    queued --> closed: cancel / error
    found --> closed: error
    matched --> closed: link closes, lobby opens
    closed --> [*]
```

## Lab view

One mode at a time, set by the tab (`setMode` → `labMode.enter`; anything else falls back to play). In experiment, `lab.kind` (`BREED_TIPS`; any kind can follow any other, the diagram shows them from the default) picks what the nine cells compare, and impact has `lab.impact` on top. Ask with `labIs(mode, ...kinds)` and `labRagdoll()`.

```mermaid
stateDiagram-v2
    [*] --> play
    play --> gallery: tab
    play --> experiment: tab
    gallery --> play: tab / load replay
    experiment --> play: tab
    gallery --> experiment: tab
    experiment --> gallery: tab
    state experiment {
        [*] --> sweep
        sweep --> breed: kind
        sweep --> attacks: kind
        sweep --> compare: kind
        sweep --> impact: kind
        sweep --> body: kind
        state impact {
            [*] --> hits
            hits --> ragdoll: impact
            ragdoll --> hits: impact
        }
    }
```

Not a state machine here: the world's run (KO countdown, done, replaying) stays as flags in `src/engine/world.js`, because it is determinism-critical engine code.
