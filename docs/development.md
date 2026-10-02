# Development

[← docs index](README.md)

How the code is laid out, and the tools that build its generated files.

## Layout

- No build step: `index.html` loads the scripts in `src/` in order.
- Everything is drawn in code. The only asset is the icon font (see [Icons](#icons)).
- Tests live in `tests/`, see [Testing](testing.md).
- The scripts share one global scope, so a new top-level name must not exist in any other `src/` file (a repeated `const` stops the later script).
- The engine runs without a page too: `tools/engine.js` loads the scripts that need no DOM (core, rig, fx, roster, fighter, world, brain, checks, events) into a Node vm context. The tests use it, and the MCP server will.
- `src/events.js` turns a fight into events (moves, hits, falls, inputs, combos), per-fighter lanes and stats (`recordFight`, `fightStats`), for the replay tab and anything else.

## Tools

| Tool | What it does |
|---|---|
| `node tools/build-info.js` | writes `src/build.js`: git commit, branch, date, uncommitted changes (`npm test` runs it) |
| `node tools/screenshots.js [name …]` | regenerates the screenshots in `docs/img/` (headless Chrome; no name = every shot) |
| `node tools/animations.js [name …]` | regenerates the short animations (`anim-*.png`): each loops one scenario, saved as an animated PNG (no name = every clip) |
| `npm run itch` | packs `dist/stick2-itch.zip` for itch.io: `index.html`, `docs.html`, `src/`, `fonts/` and `LICENSE` (see [Publishing on itch.io](#publishing-on-itchio)) |
| `npm run itch:push` | runs the tests, packs the zip and uploads it with butler to `morbeo/stick2:html`, versioned by the commit (refuses uncommitted changes) |
| `python tools/icons.py MaterialSymbolsOutlined.ttf` | rebuilds the icon font subset (needs fonttools + brotli) |

Rerun the screenshots and animations after a visible change. Both find Chrome on their own; `CHROME=/path/to/chrome` overrides it.

## Icons

The only asset is `fonts/icons.woff2`, a subset of [Material Symbols](https://github.com/google/material-design-icons) (Apache License 2.0); its license is in `fonts/LICENSE`, and ships with it.

- Icons are written as `:name:` in labels and tooltips.
- Arrows ← → ↑ ↓ become icons too.
- To add one: put its name in `ICONS` in `src/ui.js`, then rebuild the subset with `python tools/icons.py MaterialSymbolsOutlined.ttf`.

## Publishing on itch.io

1. Run `npm run itch`. It refreshes `src/build.js` and writes `dist/stick2-itch.zip`, with `index.html` at the root of the zip. If there are uncommitted changes, it warns that they're included.
2. On itch.io, create a project with **Kind of project: HTML**. Upload the zip, or push it with `npm run itch:push` (step 4), then tick **This file will be played in the browser** next to the upload.
3. Under **Embed options**:
   - set the viewport to 1400 × 800;
   - turn on the fullscreen button;
   - leave mobile friendly off.
4. To publish a new version, commit and run `npm run itch:push`. It runs the tests, packs the zip and uploads it with [butler](https://itch.io/docs/butler/) to the `html` channel of `morbeo/stick2`, labelled with the commit. Set up butler once with `butler login`. Uploads after the first keep the "played in the browser" setting. `butler status morbeo/stick2` shows the live version.

Notes for the itch.io page:
- The game runs in an iframe, so the player clicks it before keys work. In fullscreen, the browser may take Esc.
- Saved data (settings, layouts, characters) is stored per site. The itch.io copy starts empty, so use export and import to bring data over.
