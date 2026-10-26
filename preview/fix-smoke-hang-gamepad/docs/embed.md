# Embedding stick2

Put stick2 in any page with an `<iframe>`, and choose exactly what it holds: the fight, the characters, which parts of the app show, which tabs and tools are there, the embed's own controls, input, a replay to watch and jump into, and how it behaves on someone else's site.

The quickest way is the **embed builder**, [`embed.html`](https://morbeo.github.io/stick2/embed.html): pick a preset, tick what you want, watch it live, then copy the link, the `<iframe>` code or a preset JSON. In the app, ⌘K **embed builder** opens it, and **embed this** opens it on whatever you have open now.

```html
<iframe src="https://morbeo.github.io/stick2/#preset=arcade&p1=bonko" width="800" height="450" title="stick2" loading="lazy" allow="fullscreen" style="border:0;max-width:100%"></iframe>
```

## How a config is written

Everything goes in the hash (`#…`) of the iframe's `src`. Layers apply in this order, each on top of the one before:

1. **Defaults** (the table below).
2. **`preset=<name>`**: one of the [presets](#presets).
3. **`cfg=<base64url JSON>`**: a whole config at once (what the builder uses for long ones).
4. **Option keys** in the hash: `ui=hud,timer`, `p1=bonko`, `edit=1`…
5. **postMessage `config`** from the host page, live (see [API](#postmessage-api)).

A list option takes a full list (`ui=hud,timer`), `none` (`ui=none`), or edits on what came before (`ui=-timer,+meter`; write `+` as `%2B` or leave a space). Booleans take `1/0`, `on/off`, `true/false`, or the bare key (`edit`). Numbers are clamped to their range; a bad value is dropped with a console warning.

The hash still takes the app's own links too (`tool=`, `char=`, `move=`…), limited to the tabs the embed allows. A plain `#embed=<scenario>` link (no embed option) keeps its old meaning: the full app in theater mode.

## Options

| Option | Group | Type | Default | What it does |
|---|---|---|---|---|
| `scenario` | scene | string | `you vs ai` | The fight: a scenario name, an #embed= slug (vsai, ai-vs-ai, random…) or a scenario JSON |
| `speed` | scene | number 0.25–2 | `1` | Game speed |
| `chars` | characters | list | `none` | Roster allow-list: only these characters appear in pickers and random picks (empty: all) |
| `p1` | characters | string | `—` | Character in slot 1 (empty: the scenario's own) |
| `p2` | characters | string | `—` | Character in slot 2 (empty: the scenario's own) |
| `ui` | ui | list (menubar, toolbar, side, help, palette, hud, timer, labels, meter, inputs, welcome) | `hud,timer` | Which parts of the app show |
| `sections` | ui | list | `none` | Side panel sections to keep, by heading (e.g. netplay,movelist; empty: all) |
| `controls` | controls | list (play, restart, speed, mute, jumpin, branches, fullscreen, open, share, edit) | `play,restart,mute,fullscreen,open` | The embed's own control bar (shown on hover or tap) |
| `tools` | tools | list (play, replay, grid, experiment, gallery, character, tests, animate, fx, sounds, tracker, props, weapons) | `play` | Which tabs can be opened (the first is where it starts, unless a replay is given) |
| `edit` | tools | bool | `false` | Allow the editing tabs (character, animate, fx…) and the edit drawer; edits stay in memory unless persist is on |
| `input` | input | list (keyboard, touch, gamepad, host) | `keyboard,touch,gamepad` | Which inputs drive the player (none: watch only; host: the host page presses keys through postMessage) |
| `focus` | input | enum (click, auto) | `click` | click: keys reach the game only after it is clicked, so the host page keeps its own keys |
| `autoplay` | playback | bool | `true` | Start running at once (off: a still poster frame until clicked; also off with reduced motion) |
| `replay` | playback | string | `—` | A replay to open: an https URL of a replay file, or inline (z:<deflated base64url>, j:<base64url JSON>) |
| `at` | playback | int 0–10000000 | `0` | The replay frame to start on |
| `side` | playback | enum (0, 1, 2) | `0` | Jump into the replay at that frame as P1 or P2 (0: just watch) |
| `branch` | playback | bool | `true` | Allow jumping in anywhere on the timeline (each jump-in is a branch) |
| `challenge` | playback | bool | `false` | A challenge: jump in at the frame and win the round from there |
| `net` | netplay | bool | `false` | Allow online play (#join= / #server= links and the online panel) |
| `bg` | look | enum (paper, transparent) | `paper` | Page background around the stage (light theme only) |
| `accent` | look | string | `—` | Accent colour of the embed's own bar and play button, as #rgb or #rrggbb (empty: the game's) |
| `poster` | look | string | `—` | A still image shown before play when autoplay is off: an https URL (empty: the paused first frame) |
| `watermark` | look | bool | `true` | A small "stick2" link back to the full game |
| `persist` | security | bool | `false` | Save to this browser's stick2 storage (off: everything stays in memory, the visitor's own saves are untouched) |
| `mute` | security | bool | `true` | Start muted |
| `origins` | security | list | `none` | Pages allowed to send postMessage commands (empty: the embedding page only; * for any) |

**ui** parts: `menubar` (the tabs and global buttons), `toolbar` (the tab's toolbar), `side` (the side panel), `help` (the hint line), `palette` (⌘K), `hud`, `timer`, `labels`, `meter` (frame meter), `inputs` (input display), `welcome`.

**sections**: side panel sections to keep, by their heading (`sections=movelist,netplay`); empty keeps them all.

**controls** (the embed's own bar, shown on hover or tap): `play` (play/pause), `restart` (or back to where you jumped in), `speed`, `mute`, `jumpin` (jump into the replay as P1 or P2, and back to the replay), `branches` (a list of the replay and its branches), `fullscreen`, `open` (the full app on the same fight), `share` (copy a link to this moment), `edit` (the edit drawer: toolbar and side panel).

**tools**: the tabs that can be opened. `play`, `replay`, `gallery` and `grid` are views; the rest (`character`, `animate`, `experiment`, `tests`, `fx`, `sounds`, `tracker`, `props`, `weapons`) need `edit=1`.

## Safe by default

An embed runs on someone else's page, so by default it:

- **keeps nothing**: `persist` is off, so it uses an in-memory store and neither sees nor changes the visitor's own stick2 saves (characters, layouts, settings);
- **is muted** until the visitor turns sound on;
- **takes keys only when clicked**: an iframe gets keyboard input only once it has focus; `focus=auto` grabs it on load instead;
- **has online play off** (`net=1` turns it on);
- **respects reduced motion**: with the system setting on, it starts on a still poster frame (unless `autoplay` is set);
- **loads lazily** (`loading="lazy"` in the snippet) and, with `autoplay=0`, shows a still frame under a play button until clicked.

To stop an embed changing when the game is updated, pin a version in the builder: the link then goes through [`build.html?sha=<commit>`](development.md), which loads the game exactly as it was at that commit.

## Replays: watch, scrub, jump in

`replay=` opens a replay file: an `https` URL (served with CORS, e.g. a GitHub raw link or a gist), or inline as `j:<base64url JSON>` or `z:<deflate-raw, base64url>` (about 6× smaller; a 400-frame fight is ~14 KB). `at=` is the frame to start on.

With `branch` on (the default) and the `jumpin` control, the visitor can scrub the timeline forward and back, pause anywhere and **jump in as P1 or P2**: the fight plays on live from that frame, with the other side kept on its recording or its AI. That is a **branch**. Going back to the replay keeps it; `branches` lists the replay and every branch (branches of branches too), to switch between them. `side=1|2` jumps in straight away at `at`.

`challenge=1` turns that into a challenge: the embed drops the visitor in at `at` on `side`, and tells them (and the host page, as a `challenge` event) whether they won the round from there. Restart goes back to the jump-in point.

## Presets

Presets live in [`profiles/embeds/`](../profiles/embeds/), one JSON file each, as examples to copy: `tip` says what it is for, `cfg` lists only what it changes from the defaults. After adding or changing one, run `npm run embed-presets` (it writes `src/ui/embed-presets.js`; a test fails while that's out of date). The builder's **preset JSON** box gives you a new one ready to save.

| Preset | For |
|---|---|
| `arcade` | You vs the AI with the HUD and timer, click to play, restart and fullscreen. The default kind of embed. |
| `challenge` | Drop the visitor into a replay at a frame, on one side, to win the round from there. Add replay=<url>&at=<frame>&side=1. |
| `demo` | A passive AI vs AI loop for a landing page: no input, no keys taken, only play/pause and mute. |
| `editor-lite` | A small editor: fight, character and animate tabs with the toolbar and side panel; edits stay in memory. |
| `full` | The whole app in a frame, saving to the visitor's own stick2 storage. Use for a docs page, not a third-party site. |
| `replay` | Watch a replay with its timeline; scrub anywhere and jump in as P1 or P2. Every jump-in is a branch you can return to. Add replay=<url>. |
| `showcase` | The character gallery as a looping showcase: every move and movement of one character, nothing to click. |

## postMessage API

The host page can drive the embed and hear back from it. Every message is an object `{ stick2: 1, type, … }` (`stick2` is the API version; a breaking change bumps it, and `ready` says which one is running).

**Events** (embed → host page, sent to the parent with `*`; nothing in them is private): `ready` {version, engine, build, warnings, tools}, `ko` {winner: 1 | 2 | 0, team, frame}, `challenge` {won, side, from}, `branch` {side, from}, `replay` {frames, version, desync}, `state` (an answer to `state`), `error` {error}.

**Commands** (host page → embed): `config` {config: {…options}} (live: every option but the replay ones; changing tools or the roster takes effect at once), `play`, `pause`, `restart`, `scenario` {name}, `seek` {frame}, `jumpIn` {side}, `load` {replay: a replay object or a `replay=` value}, `state`, and with `input` including `host`: `press` {keys}, `release` {keys}, `tap` {keys} (P1's keys: left, right, up, down, hop, punch, kick, special, guard). Commands are taken from the page that embeds the game, or from the pages listed in `origins` (`*` for any).

The helper [`stick2-embed.js`](../stick2-embed.js) wraps it:

```html
<div id="game"></div>
<script src="https://morbeo.github.io/stick2/stick2-embed.js"></script>
<script>
  const game = Stick2.mount(document.getElementById('game'), { preset: 'arcade', p1: 'bonko' }, { width: 800, height: 450 });
  game.on('ko', e => console.log('winner: P' + e.winner));
  game.config({ ui: ['hud'] });   // live: ui, controls, speed, mute…
</script>
```

`mount(el, options, { width, height, version, base, title })` returns `{ iframe, on(type, fn), config, play, pause, restart, scenario, seek, jumpIn, load, state, press, release, tap }`; commands sent before `ready` are queued.

## Short links

A long config (an inline replay) makes a long link. The [dedicated server](server.md) keeps short ones: the builder's **short link** button posts the hash to `POST <server>/api/embeds` and gets back `<server>/e/<id>`, which is a small page with its own link card ("stick2: arcade", "stick2: a replay"…) that goes straight on to the game. The same hash always gets the same id. Kept in `DB_PATH/embeds.json` (in memory without one), at most `MAX_EMBEDS` (default 10000; 0 turns short links off), 60 an hour per address.

## Link previews

`index.html` carries Open Graph tags, so a stick2 link (embed or not) unfurls in Discord, Slack and the like with a title, a line and a picture. The hash isn't sent to the unfurler, so it's one card for every plain link; a [short link](#short-links) gets a card naming what it plays.

## Gamepads

A standard-mapping gamepad plays P1 anywhere in the app, after the first click or key press: D-pad or left stick moves, A punch, B kick, X special, Y hop, LB / RB guard, Start pauses. In an embed it needs `gamepad` in `input` (on by default).

## Accessibility

The control bar is real buttons with labels, reachable by keyboard (it shows while focused). K.O.s, challenge results and jump-ins are announced in a polite live region. Reduced motion starts on a still frame and turns the bar's fades off.
