# MCP server

[← docs index](README.md)

`tools/mcp.js` runs stick2 as an [MCP](https://modelcontextprotocol.io) server, so an AI assistant can run fights, read and change settings, characters, scenarios, sounds and fx looks, check moves, play replays and look at frames. It speaks the stdio transport (JSON-RPC 2.0, one message per line) and has no dependencies.

## Register it

The repo has a `.mcp.json`, so Claude Code offers the server when it opens the repo. To add it yourself:

```
claude mcp add --scope project stick2 -- node tools/mcp.js
```

Any other MCP client: run `node tools/mcp.js` (or `npm run mcp`) from the repo. It logs to stderr only.

## The session

- One engine per server process: the scripts that need no page (see [Development](development.md#layout)), loaded into a Node vm.
- Settings, characters made or edited, and fights live in memory for the session.
- The last 20 fights are kept by id (`s1`, `s2` …) for `replay_export` and the render tools.
- `save_profile` writes the session as the app's "everything" file. `load_profile` reads one (or a settings or character file).

## Tools

| Tool | What it does |
|---|---|
| `list_characters`, `get_character` | the roster, and one character's whole definition |
| `list_moves` | a character's moves with frame data, damage, height, flags and the inputs that play them |
| `create_character`, `edit_character`, `edit_move`, `delete_character`, `rename_character` | add, change, remove or rename a character made or edited this session; checked by compiling them, so a broken one changes nothing. `edit_character` takes a JSON merge patch; bones can be patched by id. A built-in can't be deleted or renamed in place - `delete_character` disables it instead (hidden from `random` picks), and `rename_character` makes an edited copy under the new name, leaving the original untouched |
| `enable_character`, `revert_character` | undo `delete_character` on a built-in without touching its edits, or throw away its edits entirely (and re-enable it if disabled) back to how it ships |
| `undo_character`, `redo_character` | step back or forward through create/edit/edit_move's one shared stack; undoing a create removes the character |
| `list_settings`, `get_settings`, `set_settings`, `reset_settings` | the settings by group, with defaults, ranges and tips; values are checked against their spec |
| `list_scenarios` | built-in scenarios and those from a loaded profile |
| `create_scenario`, `edit_scenario`, `delete_scenario`, `rename_scenario` | save a reusable "my scenario" (checked by building a fight from it), change one with a merge patch, remove or rename it; built-ins can't be edited, deleted or renamed |
| `simulate` | runs a fight headless: outcome, winner, K.O. time, stats, filtered events, the end hash. P1 can play a macro (`inputs`). The same seed gives the same fight |
| `run_checks` | the move matrix of the tests view: each move against every target state, the failing cells and why. It stops at a time budget and lists the moves left |
| `replay_export`, `replay_import` | a fight as a replay file, and a replay played back with a desync report |
| `load_profile`, `save_profile` | the app's export files |
| `git_status`, `git_diff`, `git_commit` | version an asset export (a character, profile or replay file) in the repo's own git history. Asset files only - a code path (`src/`, `tools/`, `tests/`, `docs/`, `fonts/`) is refused outright. `git_commit` takes an explicit file list and message, never a wildcard; it force-adds (most exports live under `out/`, which is gitignored until you commit one) |
| `render_frame` | a frame as a PNG (headless Chrome), or as SVG text without Chrome or with `renderer: "svg"` |
| `frame_state` | the same frame, numerically instead of drawn: position, facing, hp, combo, the move running, frameState's category |
| `render_gif` | a looping GIF of a stretch of a fight, written to `out/` (needs Chrome) |
| `list_sounds`, `save_sound`, `reset_sound`, `rename_sound` | the synthesized sounds (noise + tone layers); tune one with a merge patch (built-ins included), revert or delete, rename a custom one |
| `list_looks`, `save_look`, `delete_look`, `rename_look` | fx looks; built-ins are hand-coded and read-only, a custom one is a generic particle preset, tunable, deletable, renameable |
| `list_tracks`, `save_track`, `delete_track`, `rename_track` | the tracker: a step sequencer built from the sounds above. No play tool — there's no speaker on the other end of an MCP call |
| `start_bridge`, `browser_state`, `browser_command` | the live bridge, below |
| `search_tools` | find a tool by a word or two against its name and description, for when you know roughly what you want but not its exact name |

## Resources

- `stick2://docs/<file>.md`: these docs.
- `stick2://schema/settings`: every setting, as in `src/core.js`.
- `stick2://schema/character`: the shape of a character definition (bones, poses, moves, keys).
- `stick2://schema/scenario`: the shape of a scenario, and of script and macro steps.
- `stick2://schema/sound`, `/look`, `/track`: the shape of a sound, fx look and tracker track preset.

## Rendering

- **PNG and GIF:** headless Chrome draws the fight with the app's own code (`tools/render.html`).
  - It is found where the browser test looks; `CHROME=/path/to/chrome` overrides.
  - It starts on first use with a temporary profile, stays up for the session and is killed when the server exits.
- **SVG:** without Chrome, the engine draws into a recording 2D context (`tools/svg.js`) that writes SVG.
  - Same picture, as text: no dependencies means no rasterizing.
  - GIFs still need Chrome.

## The live bridge

The server can also drive the app open in a browser.

1. Start it: `node tools/mcp.js --serve 8123`, or the `start_bridge` tool.
2. It serves the repo on `http://127.0.0.1:PORT/` (only on this machine). Open that address.
3. The page connects on its own (`src/bridge.js`). Opened any other way (`file://`, itch.io, another server), the bridge does nothing.

`browser_state` shows the tab, the play scenario, the character being edited, the changed settings and your scenarios. `browser_command` runs one of a fixed set of commands; nothing is evaluated:

| Command | What it does |
|---|---|
| `set_settings { values }` | changes settings, checked like the settings panel does |
| `set_scenario { name }` | the play tab fights that scenario |
| `import_character { def }` | adds a character and picks it |
| `open_replay { replay }` or `{ simulation }` | opens a fight in the replay tab |
| `screenshot` | the canvas as a PNG |
| `set_mode { mode }` | switches tabs |
| `pick_character { name }` | the character every mode edits |
| `delete_character { name }` | a custom character, or disables a built-in (no confirmation prompt unlike the UI) |
| `enable_character { name }` | undoes `delete_character` on a built-in |
| `rename_character { from, to }` | a built-in makes an edited copy under the new name instead of being renamed in place |
| `set_preview { scenario?, opponent?, control? }` | the character tab's live preview (needs that tab open) |
| `send_to_play { scenario?, opponent? }` | jump to Play with a matchup; default: the character tab's own preview |
| `undo` / `redo` | the same stack as ⌘Z: character edits, settings, replay/movie/scene edits alike |
| `pose_scene { fighter, bone, angle }` or `{ fighter, preset }` | the replay tab's scene editor: pose a fighter (0 or 1) by exact bone angle, or apply a saved/built-in preset pose |
| `reset_pose` | clear every pose edit on the current scene |
| `snapshot_pose { fighter, name }` | save the fighter's current pose as a named preset - the same registry (`myPoses`) the animate editor's "start this key from a preset pose" and the character editor's stance presets both read |
| `place_prop { type, x, lift?, a? }` / `move_prop { index, x?, lift?, a? }` / `delete_prop { index }` | add, move or remove a prop on the scene |
| `clear_scene` | reset the scene's pose and props together |
| `branch_from { side }` | play on live from the playhead as P1 or P2 (1 or 2) - the replay tab's own "continue the fight from here" |

This session's characters (`list_characters`, `create_character`...) and the bridge tab's (`DEFS`/`CHARS` in the browser, its own localStorage) are two separate stores - editing one is invisible to the other. `push_to_browser { name }` and `pull_from_browser` move one character between them explicitly (overwriting a same-named one on the receiving side); there is no automatic sync.

## The Discord bot

`tools/discord-bot.js` is a separate always-on process (not an MCP client) that spawns its own `tools/mcp.js` and talks JSON-RPC to it over stdio, the same protocol any MCP client speaks. It's the one place in the repo with an npm dependency (`discord.js`) and a `package-lock.json`, needed only by this script.

- Command: `!fight <char> <char> [<char> [<char>]]` — 2 to 4 names, `vs` optional as a separator, `random` picks a roster character for that slot. 2 fighters → `ai vs ai`, 3 → `ai 3-way`, 4 → `ai free-for-all` (`src/brain.js`); it simulates the fight, renders a GIF (needs Chrome, same as `render_gif`), and replies with it.
- Access: admins/mods (Manage Server permission) can always use it; everyone else needs a role set with `!fightconfig role <name|none>`, optionally restricted to one channel with `!fightconfig channel <#name|none>`.
- Throttling: a per-user cooldown (hard reject) and a global cooldown enforced as a queue, not a rejection — both adjustable live with `!fightconfig usercooldown <seconds>` / `globalcooldown <seconds>`, persisted to `out/bot-config.json`. `!fightconfig show` and `!fightstatus` report the current state.
- `out/` fills with GIFs fast: a timer deletes ones older than `OUT_RETAIN_MS` (default 2h) every `OUT_CLEAN_INTERVAL_MS` (default 15m).
- Run it: `DISCORD_BOT_TOKEN=... npm run discord-bot`. Deploy it as a systemd user service with `tools/deploy-bot.sh` (installs dependencies, writes the env file and unit, enables it).
