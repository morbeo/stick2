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
| `create_character`, `edit_character`, `edit_move`, `delete_character`, `rename_character` | add, change, remove or rename a character made or edited this session; checked by compiling them, so a broken one changes nothing. `edit_character` takes a JSON merge patch; bones can be patched by id. Built-ins can't be deleted or renamed |
| `list_settings`, `get_settings`, `set_settings`, `reset_settings` | the settings by group, with defaults, ranges and tips; values are checked against their spec |
| `list_scenarios` | built-in scenarios and those from a loaded profile |
| `create_scenario`, `edit_scenario`, `delete_scenario` | save a reusable "my scenario" (checked by building a fight from it), change one with a merge patch, or remove it; built-ins can't be edited or deleted |
| `simulate` | runs a fight headless: outcome, winner, K.O. time, stats, filtered events, the end hash. P1 can play a macro (`inputs`). The same seed gives the same fight |
| `run_checks` | the move matrix of the tests view: each move against every target state, the failing cells and why. It stops at a time budget and lists the moves left |
| `replay_export`, `replay_import` | a fight as a replay file, and a replay played back with a desync report |
| `load_profile`, `save_profile` | the app's export files |
| `render_frame` | a frame as a PNG (headless Chrome), or as SVG text without Chrome or with `renderer: "svg"` |
| `render_gif` | a looping GIF of a stretch of a fight, written to `out/` (needs Chrome) |
| `list_sounds`, `save_sound`, `reset_sound`, `rename_sound` | the synthesized sounds (noise + tone layers); tune one with a merge patch (built-ins included), revert or delete, rename a custom one |
| `list_looks`, `save_look`, `delete_look`, `rename_look` | fx looks; built-ins are hand-coded and read-only, a custom one is a generic particle preset, tunable, deletable, renameable |
| `list_tracks`, `save_track`, `delete_track`, `rename_track` | the tracker: a step sequencer built from the sounds above. No play tool — there's no speaker on the other end of an MCP call |
| `start_bridge`, `browser_state`, `browser_command` | the live bridge, below |

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
