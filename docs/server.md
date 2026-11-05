# Server

[← docs index](README.md)

The dedicated server (`server/`) makes online play "just connect": the host opens a room and gets a short room code, players join with the code, a link or a QR code. No codes travel back and forth, and nobody sees anyone else's IP address. It also serves the game itself, reports its health, and exports Prometheus metrics. It has a room browser, player names, moderation, spectating (mid-match too, held back against ghosting) and saved replays. Later phases add gameplay stats and an MCP endpoint.

Status: **phase 2, the lobby:** the relay, the room browser, names and moderation. Peer-to-peer [netplay](netplay.md) still works without a server.

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
npm run test:server       # installs server deps, then its tests: routes, rooms, limits, the drain, a real lobby and match through it
npm run test:server-browser  # two browsers: host a room in the play tab, join by its link, fight, no desync
```

Then open http://localhost:8080 and go to the play tab. A page the server serves finds the server by itself (it asks `/api/rooms` on its own address), so the netplay section skips the address box. It shows **playing on** the server's name, **new room**, a room code field with **join** and **watch**, **replays**, and the public rooms, refreshed every 5 seconds. **other ways to play** brings back invites and other servers. From another device on your network, open `http://<your computer's address>:8080`.

Typed by hand, a local address without a port (`localhost`, `127.0.0.1`, `192.168.…`, `10.…`) gets port 8080.

Docker (build from the repo root):

```sh
docker build -f server/Dockerfile -t stick2-server .
docker run -p 8080:8080 -v stick2:/data stick2-server
docker compose -f server/docker-compose.yml up -d
docker compose -f server/docker-compose.full.yml up -d   # plus Prometheus and Grafana (see Monitoring)
```

Releases publish `ghcr.io/morbeo/stick2-server` for amd64 and arm64 (the `image` job of `.github/workflows/release.yml`). Open `http://<host>:8080/` to play from the server itself. For players on the internet, put it behind HTTPS (Caddy, nginx, Cloudflare) and set `TRUST_PROXY=1`: a game page served over HTTPS can only open `wss://`.

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
| `ROOM_IDLE` | `120` | Seconds an empty room stays open after its last player leaves; the first one to join it then hosts it, with its rules. `0`: a room closes with its last player |
| `MAX_CONNECTIONS` | `2000` | WebSocket connections at once |
| `MAX_PER_IP` | `16` | Connections from one address |
| `MSG_RATE` | `200` | Messages a second per connection (bursts of twice that); a match sends about 60 |
| `MAX_MESSAGE_BYTES` | `1048576` | Largest message (a match header carries whole characters) |
| `DRAIN_TIMEOUT` | `600` | Seconds running matches get to finish on shutdown |
| `METRICS_TOKEN` | (none) | If set, `/metrics` needs `Authorization: Bearer <token>` |
| `TRUST_PROXY` | off | `1`: take the client address from `X-Forwarded-For` |
| `LOG_LEVEL` | `info` | `debug`, `info` or `quiet`; logs are JSON lines on stdout |
| `ADMIN_TOKEN` | (none) | Turns on the [admin API](#moderation); requests need `Authorization: Bearer <token>` |
| `DB_PATH` | (none; `/data` in the image) | Folder for `bans.json` and `embeds.json`; none: they last until a restart |
| `SPECTATE_DELAY` | `180` | Frames (60 a second) spectators watch behind the players, so they can't call out what's coming; `0` for live |
| `MAX_SPECTATORS` | `14` | People a room may have besides its two fighters: spectators and the queue (at most 14; a room holds 16) |
| `MCP` | `1` | MCP for AI clients at `POST /mcp` (see [MCP](#mcp)); `0` turns it off |
| `MCP_TOKEN` | (none) | Set: MCP read tools need it as a bearer token (the admin token works too) |
| `ACCOUNTS` | `1` | Accounts: a name kept across linked devices, no passwords (see [Accounts](#accounts)); `0` turns them off |
| `BOTS` | `4` | Server bots that may play at once (see [Bots](#bots)). `0`: off |
| `RATINGS` | `1` | Glicko-2 ratings from verified matches, the leaderboard, and quick match by rating (see [Quick match and ratings](#quick-match-and-ratings)); needs `VERIFY`. `0`: quick match still pairs, everyone at 1500 |
| `VERIFY` | `1` | Play every finished match again on the server (see [Verify](#verify)); `0` turns it off |
| `MAX_REPLAYS` | `200` | Finished matches kept as replays (in `DB_PATH/replays/` if set, else in memory), oldest dropped first; `0` turns them off |
| `MAX_EMBEDS` | `10000` | Short embed links kept ([embed short links](embed.md#short-links)); `0` turns them off |
| `NAME_BLOCKLIST` | (none) | More words names may not contain, comma separated |
| `COMMIT` | `dev` | Shown in `stick2_build_info` (the image sets it) |

## Routes

| Route | What |
|---|---|
| `GET /` | The game (`STATIC_DIR`). Server code, `tools/`, `tests/`, dependencies and dotfiles are never served |
| `GET /healthz` | `200 ok`, or `503 draining` while shutting down |
| `GET /metrics` | Prometheus metrics |
| `GET /api/rooms` | `{ server, region, version, rooms: [{ room, name, host, phase, players, watchers, locked, rules, queue, streak }] }`, public rooms only (the room browser). `rules`: `{ rotation, cap, bestOf, timer, rollback, bans }` (`bans` a count), `queue`: how many are in line, `streak`: `{ name, streak }` of the longest one, from the host's lobby |
| `POST /api/embeds` | `{ hash }` → `{ id }`: a short embed link (CORS open, 60 an hour per address, hash up to 64 KB) |
| `GET /e/<id>` | Redirects to `/index.html#<hash>` |
| `/api/admin/…` | Moderation, with `ADMIN_TOKEN` (404 without one) |
| `GET /api/replays` | `{ server, replays: [{ id, at, room, players, scenario, frames, winner }] }`, newest first |
| `GET /api/replays/<id>` | One saved match, as a [replay file](fighting.md) |
| `GET /api/leaderboard` | `{ server, players: [{ name, rating, rd, games, wins, draws, ranked, last }] }`: the 50 best ranked players |
| `GET /api/players/<name>` | One rated player, by the name they last played under (404: none) |
| `POST /mcp` | MCP (JSON-RPC over Streamable HTTP) for AI clients, see [MCP](#mcp) |
| `WS /ws` | The relay |

## Rooms as pools

A server room holds up to 16 people. Two fight, the rest watch and queue, and the host picks a rotation (winner stays, loser stays, both rotate, or the same two) with an optional streak cap. The host can sit out and still run the room. See [the pool](netplay.md#the-pool-queue-and-rotation). Rooms have rules (best of, fight length, character bans, rollback), and the room browser shows them with the queue and the longest streak; **open** shows only rooms you could fight in soon. A room survives its host: when the host leaves (or its connection drops) and guests are still in it, the guest who has been there longest hosts it now, with the same room code, rules, queue and scores (see [the pool](netplay.md#the-pool-queue-and-rotation), handover). When the last one leaves, the room stays open, empty, for `ROOM_IDLE` seconds (2 minutes by default): the room browser shows it as **empty: join to host it**, and the first one to join hosts it with the same code and rules (not bans). A locked room, an admin close or a drain still closes it at once.

## Spectating and replays

- **Watching.** Anyone can watch a room: **watch** in the room browser, a watch link or QR code, or **join** once both places are taken. The host's browser sends spectators the confirmed frames (see [spectators](netplay.md#spectators)).
- **Joining mid-match.** A spectator who arrives during a fight gets the match header and every frame shown so far, and fast-forwards to the live fight.
- **Delay.** The server tells the host `SPECTATE_DELAY` when the room opens. The host holds spectators that many frames behind, catch-up included. The last frames go out when the fight ends.
- **Replays.** When a fight ends, the host sends its replay (once per match). The netplay section's **replays** lists the server's saved fights, with **watch** (plays it in the play tab) and save. After any online fight, **watch again** plays it back.

## Verify

When a fight ends, the host sends its replay (above). The server plays it again from its inputs, on its own copy of the engine, in a worker thread so rooms don't wait. Its verdict:

| Verdict | Means |
|---|---|
| `ok` | The fight plays out as recorded, with the winner the host said |
| `desync` | The inputs give other checksums: a tampered replay, or a client on another build |
| `result` | In sync, but the host claimed another winner |
| `version` | Recorded with another engine version than the server's: not checked |
| `error` | Not playable, too long (over 15 minutes), the queue is full (50), or it took over 20 s |

The host hears the verdict (`verified`), and the room log says so when a fight doesn't add up. A saved replay keeps its verdict, so **replays** marks each fight **verified**, **doesn't add up**, **wrong winner** or **not checked**. A `desync` or `result` is flagged: a `moderation` log line (`flagged`), `GET /api/admin/flags`, and the `flagged_total` metric. Gameplay metrics (how fights end, characters, length) count only `ok` and `result` fights, so a tampered replay can't skew them.

With `MAX_REPLAYS=0` the server still verifies (no replay is kept); with `VERIFY=0` as well it refuses replays.

## Quick match and ratings

- **Ratings.** Every verified match (verdict `ok`, see [Verify](#verify)) between two players in the room moves both their ratings, by [Glicko-2](http://www.glicko.net/glicko/glicko2.pdf): a win, a loss or a draw, weighed by how sure each rating is (its deviation, `rd`). A forfeit or a fight that doesn't add up rates nobody. Both fighters hear the change (`rated`), and the room log shows it. A player is their [account](#accounts), or else their device (the app's device id, only stored hashed), under the name they last played as. New players start at 1500 ± 350. The deviation shrinks with each fight and grows again while a player stays away. **Ranked** (on the leaderboard) once it's under 150, after about ten fights. Kept in `DB_PATH/ratings.json`.
- **Quick match.** **quick match** in the netplay section (or the palette's `netplay: quick match`) waits in the server's queue. Two players pair when their ratings are within 100, a window that widens by 50 every 10 seconds either has waited. The one who waited longer opens a private room by itself, and the other is sent into it: pick, ready, fight. **cancel** leaves the queue. If the host side never opens its room (15 s), the other goes back to the front of the line.
- **Leaderboard.** **leaderboard** (or `netplay: leaderboard`) lists the server's ranked players.

## Bots

A host on a server can add a **bot**: the game's own AI, played by the server, as a player in the room. In the lobby, the host's row has a level (easy, normal, hard) and **add bot** (or the palette's `netplay: add bot`). The bot joins like a guest, named after its character (`bot hadoo`), picks a character at random, readies itself, and plays every match from its side, on the server's copy of the engine (the host still runs the fight, the bot only sends its inputs). It readies again after each match, so it fits a room's rotation too. **kick** takes it out; it leaves by itself when the room closes. Bots are never rated. `BOTS` caps how many play at once over the whole server; admins can add and remove them over the admin API or MCP.

## Identity keys

The app makes an identity key once (an ECDSA P-256 key pair, kept in the browser, `src/net/identity.js`). On connecting, the server's `hello` carries a fresh nonce. The app signs it (`{ t: 'auth', key, sig }`), and from then on the server knows the connection by the key's id rather than by a device id the app merely says. Accounts, ratings and bans all go by that id. Every server sees the same key, with nothing shared between them, and nobody can pass for you by copying an id.

- **Carrying it.** The account box shows the key's fingerprint, with **copy key** and **paste key** (or the palette's `netplay: copy key` / `netplay: paste key`). Pasting your key on another device makes it the same player on every server at once. Keep the key secret: whoever has it plays as you.
- **From before keys.** On its first signed connection, the app also sends its old device id once. An account linked to that id gets the key linked too, and a rating without an account moves over to the key.
- **Pages without Web Crypto** (plain http on a non-local address) have no key, and connect by device id as before.

## Accounts

No passwords: an account is a name and the devices linked to it (the app's device ids, only stored hashed, in `DB_PATH/accounts.json`). **account** in the netplay section (or the palette's `netplay: account`):

- **make account** keeps your current name on this server. Nobody else can play under it (they get a `#tag`), until it goes unused for 90 days. You see a **recovery code** once: write it down.
- **link a device** shows a 6-character code and a QR code for 5 minutes. On the other device, scan the QR code (it opens the game and links) or type the code under **account**. That device plays under the account's name from then on.
- **Lost device:** type the recovery code under **account** on the new one, or ask the server's admin to relink it: give them the **this device** id the account box shows (`POST /api/admin/relink`, or the MCP tool `relink_account`).
- **unlink** takes this device off the account.
- **Ratings** follow the account: making one moves the device's rating to it, and every linked device plays under it. **Bans** do too: banning an account's player (by name, or one of its devices) bans every linked device.

## MCP

The server speaks [MCP](https://modelcontextprotocol.io) at `POST /mcp` (Streamable HTTP, one JSON answer per request), so an AI client can look at it and moderate it:

```sh
claude mcp add --transport http stick2-server http://localhost:8080/mcp
claude mcp add --transport http stick2-admin http://localhost:8080/mcp --header "Authorization: Bearer $ADMIN_TOKEN"
```

| Tools | Who |
|---|---|
| `server_health`, `get_metrics_summary`, `list_rooms`, `get_room`, `get_leaderboard`, `get_player_stats`, `list_matches`, `get_match`, `export_replay` | Anyone (or `MCP_TOKEN` holders when it is set) |
| `list_reports`, `list_flags`, `list_bans`, `kick`, `ban`, `unban`, `close_room`, `list_accounts`, `get_account`, `relink_account`, `add_bot`, `list_bots`, `remove_bot` | `ADMIN_TOKEN` only; each call goes to the moderation log like the admin API |

Resources: `stick2://server/rooms`, `stick2://server/leaderboard`, and `stick2://match/<id>/replay` (a kept match as a replay file). A replay from `export_replay` loads in the game's replay tab, or in the game's own MCP tools (`replay_import`, see [mcp.md](mcp.md)). Calls are counted in `mcp_calls_total{tool,result}` and timed in `mcp_call_seconds`.

## Monitoring

`server/docker-compose.full.yml` runs the server with Prometheus and Grafana, all self-hosted:

- **Prometheus** (http://localhost:9090) scrapes `/metrics` every 15 s, with alert rules in `server/monitoring/alerts.yml`: server down, a desync spike, a wrong result, round trip p95 over 200 ms, a verify backlog. With `METRICS_TOKEN` set, add it to `server/monitoring/prometheus.yml`.
- **Grafana** (http://localhost:3000, `admin` / `GRAFANA_PASSWORD`) opens on the provisioned **stick2 server** dashboard (light theme): players, rooms, matches an hour, desync-free ratio, verify verdicts and flags, round trip, verify time, match length, character picks and win rates, how fights end.

```sh
GRAFANA_PASSWORD=pick-one docker compose -f server/docker-compose.full.yml up -d
```

## Shutting down

`SIGTERM` (what `docker stop` sends) starts a **graceful drain**: `/healthz` answers 503 so a load balancer stops sending players, new rooms and joins are refused, and running matches get up to `DRAIN_TIMEOUT` to finish. Then every connection closes and the process exits. Set the orchestrator's grace period to match (`stop_grace_period` in compose). A second `SIGINT` exits at once.

## Abuse limits

Connections per address and in total, a per-connection message rate (a connection that keeps flooding is closed), a size cap on messages, pings every 15 s that drop dead connections, room codes from 32⁶ (about a billion) so they can't be guessed, and no IP addresses ever passed to other players.

## Names

Every player has a name on the server. The app sends the name typed in the netplay section, or the one generated from this device's seed (`src/net/names.js`: gogili, shpinga, kobokobo, zuga-zuga…; **reroll** picks a new seed). Both the app and the server run it through the same filter: 3-16 letters, digits, spaces and `. _ -`, invisible characters dropped, lookalikes and leetspeak folded before the check, reserved names (admin, server, host, …) and rude words refused, plus `NAME_BLOCKLIST`. A refused name falls back to the generated one. If someone on the server already has the name, the newcomer gets a `#2`, `#3`… tag.

## Moderation

- **The host** can **kick** a guest, **ban** them from the room (by device id, or hashed address), and **lock** the room against newcomers.
- **Anyone** can **report** a player (a guest can report the host) with a reason. The report keeps the last 50 chat lines the reporter saw. The server holds the last 200 reports in memory.
- **Admins** (`ADMIN_TOKEN`), each action written to the log as a `moderation` line:

| Route | Body | What |
|---|---|---|
| `GET /api/admin/rooms` | | Every room, public or not, with its players' names |
| `GET /api/admin/reports` | | The reports |
| `GET /api/admin/bans` | | Running bans |
| `GET /api/admin/accounts` | | Every account: name, how many devices, created, last seen (no device ids) |
| `POST /api/admin/relink` | `{ player, device }` | Link a device to the account with that name (a player who lost every device and the recovery code) |
| `GET /api/admin/flags` | | The last 200 matches that didn't add up ([Verify](#verify)): verdict, why, room, host, players, replay id |
| `POST /api/admin/kick` | `{ player, reason? }` | Send a player off (a host's room closes) |
| `POST /api/admin/ban` | `{ player? , device?, reason?, minutes? }` | Ban by name; an online player's device and hashed address too. No `minutes`: permanent |
| `POST /api/admin/unban` | `{ id }` | Lift a ban |
| `POST /api/admin/close` | `{ room }` | Close a room |
| `GET /api/admin/bots` | | The bots playing: name, room, level, character, phase |
| `POST /api/admin/bot` | `{ room, level?, char? }` or `{ remove: name }` | Put a [bot](#bots) into a room, or take one out |

```sh
curl -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"player":"gogili","minutes":60,"reason":"spam"}' http://localhost:8080/api/admin/ban
```

Bans live in `DB_PATH/bans.json`. Addresses are only stored hashed with a salt kept in the same file, so the file never holds a real IP. Chat filtering is not done on the server: chat travels inside the host's lobby messages.

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
| `kicks_total{by}`, `bans_total`, `reports_total` | counter | Moderation (`by`: host or admin) |
| `replays_saved_total`, `replay_storage_bytes`, `spectator_peak` | counter, gauge, gauge | Saved replays, their size, most spectators at once |
| `host_handovers_total` | counter | Rooms handed to a guest when their host left |
| `verify_total{verdict}`, `verify_seconds`, `verify_queue` | counter, histogram, gauge | Finished matches played again, how long it took, how many wait |
| `flagged_total{verdict}` | counter | Matches that didn't add up (`desync`, `result`) |
| `match_ends_total{end,side}`, `match_frames` | counter, histogram | Verified fights: `ko`, `double ko` or `time`, won by `p1`, `p2` or `draw`; length in frames |
| `character_picks_total{char}`, `character_wins_total{char}`, `winner_hp_left` | counter, counter, histogram | Roster characters by name (any other is `custom`), and the winner's health left |
| `mcp_calls_total{tool,result}`, `mcp_call_seconds` | counter, histogram | MCP tool calls |
| `identity_auths_total` | counter | Connections that proved an identity key |
| `account_actions_total{action}`, `accounts` | counter, gauge | Accounts: register, link, claim, relink; how many there are |
| `rated_matches_total`, `rated_players` | counter, gauge | Matches that moved two ratings, players with a rating |
| `quick_queue`, `quick_matches_total`, `quick_wait_seconds` | gauge, counter, histogram | Quick match: waiting now, rooms opened, how long players waited |
| `rooms_empty` | gauge | Open rooms with nobody in them, waiting out `ROOM_IDLE` |
| `bots` | gauge | [Bots](#bots) playing in rooms |

## Protocol

JSON, one object per WebSocket message. On connecting, the server sends `{ t: 'hello', server, region, version, nonce }`.

| From | Message | Answer |
|---|---|---|
| host | `{ t: 'host', name?, public?, player?, device? }` | `{ t: 'room', room, player, delay, watchers }` (`player`: the name the server gave; `delay`, `watchers`: the spectator rules) |
| guest | `{ t: 'join', room, player?, device? }` | `{ t: 'joined', room, player }`; the host gets `{ t: 'peer', id, player }` |
| host | `{ t: 'to', id, m }` | that guest gets `{ t: 'msg', m }` |
| guest | `{ t: 'msg', m }` | the host gets `{ t: 'from', id, m }` |
| either | `{ t: 'leave' }` | the host gets `{ t: 'gone', id, why }`. If the host leaves a room with guests, the longest-staying guest gets `{ t: 'promoted', room, player, peers, delay, watchers }` and hosts it, and the others get `{ t: 'newhost', player }`. The last one out leaves the room empty for `ROOM_IDLE`; whoever joins it then gets `{ t: 'promoted', room, player, peers: [], delay, watchers, fresh: true, rules }` instead of `joined` |
| either | `{ t: 'list' }` | `{ t: 'rooms', rooms }` |
| host | `{ t: 'kick', id, ban? }` | the guest gets `{ t: 'closed', why }`, the host `{ t: 'gone', id, why }` |
| host | `{ t: 'lock', locked }` | joins are refused while locked |
| either | `{ t: 'auth', key, sig, device? }` (first, once) | `{ t: 'authed', id }`: `sig` signs `stick2-auth:<nonce>` from `hello` (see [Identity keys](#identity-keys)) |
| host | `{ t: 'bot', level?, char? }` | a [bot](#bots) joins the room; `{ t: 'bot', player }`, or `{ t: 'bot', error }` when refused |
| either | `{ t: 'report', id?, reason, lines? }` | `{ t: 'reported' }` |
| either | `{ t: 'quick', player?, device? }` (not in a room) | `{ t: 'queued', player, rating, waiting }`; paired: the longer waiting gets `{ t: 'matched', role: 'host', ticket, vs }`, the other `{ t: 'found', vs }` |
| host | `{ t: 'host', …, quick: ticket }` | as `host`, then the other side gets `{ t: 'matched', role: 'guest', room, vs }` |
| either | `{ t: 'account', do, device, player?, code? }` (`do`: `whoami`, `register`, `link`, `claim`, `unlink`) | `{ t: 'account', name, devices, recovery? (register, once), code?, until? (link) }` |
| either | `{ t: 'unquick' }` | `{ t: 'unqueued' }`: out of the queue |
| fighters | (after a verified match) | `{ t: 'rated', players: [{ name, rating, rd, games, wins, draws, ranked, change }] }` |
| host | `{ t: 'replay', replay, result?, players? }` | `{ t: 'saved', id }`: the finished match, kept for `/api/replays`; then `{ t: 'verified', id, verdict, why? }` once the server played it again |
| server | `{ t: 'error', error }` | a refused request: `full: …`, `no room: …`, `locked: …`, `kicked: …`, `banned: …`, `draining: …`, `bad message`, … |

`m` is a [lobby](netplay.md) or match message, passed on untouched.
