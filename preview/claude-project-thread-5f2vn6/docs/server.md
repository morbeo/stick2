# Server

[← docs index](README.md)

The dedicated server (`server/`) makes online play "just connect": the host opens a room and gets a short room code, players join with the code, a link or a QR code. No codes travel back and forth, and nobody sees anyone else's IP address. It also serves the game itself, reports its health, and exports Prometheus metrics. Later phases add a lobby browser, spectating mid-match, gameplay stats and an MCP endpoint.

Status: **phase 1, the relay.** Peer-to-peer [netplay](netplay.md) still works without a server.

## How it works

The server is a **relay**. It replaces the WebRTC data channel and nothing else: the host's browser still runs the [lobby](netplay.md#layers) and both browsers run the match with input delay and rollback, exactly as peer to peer. The server passes each message between the room's host and its guests over one WebSocket each. It reads the host's lobby snapshots only to know a room's phase and head count, for the room list and the metrics.

| Piece | File | Job |
|---|---|---|
| Relay | `server/relay.js` | Rooms, room codes, passing messages, leaving |
| Server | `server/server.js` | HTTP routes, WebSocket, limits, pings, drain, logs |
| Metrics | `server/metrics.js` | Counters, gauges, histograms in the Prometheus text format |
| Client | `src/net/netserver.js` | `ServerLink`, `netServerHost`, `netServerJoin`, server addresses and links |

## Running it

```sh
npm run server            # from the repo root (after: npm ci --prefix server)
npm run test:server       # its tests: routes, rooms, limits, the drain, a real lobby and match through it
npm run test:server-browser  # two browsers: host a room in the play tab, join by its link, fight, no desync
```

Docker (build from the repo root):

```sh
docker build -f server/Dockerfile -t stick2-server .
docker run -p 8080:8080 -v stick2:/data stick2-server
docker compose -f server/docker-compose.yml up -d
```

Releases publish `ghcr.io/morbeo/stick2-server` for amd64 and arm64 (`.github/workflows/server.yml`). Open `http://<host>:8080/` to play from the server itself. For players on the internet, put it behind HTTPS (Caddy, nginx, Cloudflare) and set `TRUST_PROXY=1`: a game page served over HTTPS can only open `wss://`.

## Settings

Environment variables, each with a default:

| Variable | Default | What |
|---|---|---|
| `PORT` | `8080` | HTTP and WebSocket port |
| `HOST` | `0.0.0.0` | Address to listen on |
| `SERVER_NAME` | `stick2 server` | Shown to clients and in `/api/rooms` |
| `REGION` | (none) | Shown to clients |
| `STATIC_DIR` | the repo root | The game's files, served at `/`; empty: serve no game |
| `MAX_ROOMS` | `500` | Rooms open at once |
| `MAX_CONNECTIONS` | `2000` | WebSocket connections at once |
| `MAX_PER_IP` | `16` | Connections from one address |
| `MSG_RATE` | `200` | Messages a second per connection (bursts of twice that); a match sends about 60 |
| `MAX_MESSAGE_BYTES` | `1048576` | Largest message (a match header carries whole characters) |
| `DRAIN_TIMEOUT` | `600` | Seconds running matches get to finish on shutdown |
| `METRICS_TOKEN` | (none) | If set, `/metrics` needs `Authorization: Bearer <token>` |
| `TRUST_PROXY` | off | `1`: take the client address from `X-Forwarded-For` |
| `LOG_LEVEL` | `info` | `debug`, `info` or `quiet`; logs are JSON lines on stdout |
| `COMMIT` | `dev` | Shown in `stick2_build_info` (the image sets it) |

## Routes

| Route | What |
|---|---|
| `GET /` | The game (`STATIC_DIR`). Server code, `tools/`, `tests/`, dependencies and dotfiles are never served |
| `GET /healthz` | `200 ok`, or `503 draining` while shutting down |
| `GET /metrics` | Prometheus metrics |
| `GET /api/rooms` | `{ server, region, version, rooms: [{ room, name, phase, players, watchers }] }`, public rooms only |
| `WS /ws` | The relay |

## Shutting down

`SIGTERM` (what `docker stop` sends) starts a **graceful drain**: `/healthz` answers 503 so a load balancer stops sending players, new rooms and joins are refused, and running matches get up to `DRAIN_TIMEOUT` to finish. Then every connection closes and the process exits. Set the orchestrator's grace period to match (`stop_grace_period` in compose). A second `SIGINT` exits at once.

## Abuse limits

Connections per address and in total, a per-connection message rate (a connection that keeps flooding is closed), a size cap on messages, pings every 15 s that drop dead connections, room codes from 32⁶ (about a billion) so they can't be guessed, and no IP addresses ever passed to other players. Moderation, chat filters and bans come with the lobby phase.

## Metrics

All prefixed `stick2_`. Labels never carry names, ids or room codes.

| Metric | Type | What |
|---|---|---|
| `build_info{version,commit}` | gauge | The running build |
| `uptime_seconds`, `draining` | gauge | Process state |
| `connections`, `rooms`, `rooms_by_phase{phase}`, `players_online`, `spectators` | gauge | Now |
| `connections_total`, `connections_rejected_total{reason}`, `disconnects_total{reason}` | counter | Connections |
| `ws_messages_total{dir,type}`, `ws_bytes_total{dir}`, `ratelimited_total` | counter | Traffic |
| `requests_refused_total{reason}`, `joins_total` | counter | Rooms |
| `matches_total`, `matches_finished_total` | counter | Matches started, played to the end |
| `match_duration_seconds`, `room_lifetime_seconds`, `rtt_seconds` | histogram | Match length, room length, ping to clients |
| `http_requests_total{route,status}` | counter | HTTP |

## Protocol

JSON, one object per WebSocket message. On connecting, the server sends `{ t: 'hello', server, region, version }`.

| From | Message | Answer |
|---|---|---|
| host | `{ t: 'host', name?, public? }` | `{ t: 'room', room }` |
| guest | `{ t: 'join', room }` | `{ t: 'joined', room }`; the host gets `{ t: 'peer', id }` |
| host | `{ t: 'to', id, m }` | that guest gets `{ t: 'msg', m }` |
| guest | `{ t: 'msg', m }` | the host gets `{ t: 'from', id, m }` |
| either | `{ t: 'leave' }` | the host gets `{ t: 'gone', id, why }`; if the host leaves, guests get `{ t: 'closed', why }` |
| either | `{ t: 'list' }` | `{ t: 'rooms', rooms }` |
| server | `{ t: 'error', error }` | a refused request: `full: …`, `no room: …`, `draining: …`, `bad message`, … |

`m` is a [lobby](netplay.md) or match message, passed on untouched.
