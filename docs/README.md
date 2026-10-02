# stick2 docs

The full reference behind the [landing page](../README.md). The app has its own interactive docs too: ⓘ in the top bar, or `docs.html`, with live demo fights and every setting.

| Page | What's in it |
|---|---|
| [Modes](modes.md) | what each tab and view does: play, impact, grid, character, animate, gallery, tests |
| [Fighting](fighting.md) | the engine: guard, combos, throws, specials, projectiles, weapons, power, falls, 2D / 2.5D, stances |
| [Editing](editing.md) | the roster, stats, the move table, movement layers, the input table, combos |
| [Interface](interface.md) | the top bar, export / import, debug, ⌘K, keys and macros, panels, undo, sound |
| [Development](development.md) | code layout, build info, the screenshot and animation tools, the icon font |
| [Testing](testing.md) | `npm test`, snapshots, replays, the browser test, seeds, the move matrix, fuzzing |
| [MCP server](mcp.md) | stick2 as an MCP server: fights, settings, characters, replays and pictures for an AI assistant; the live bridge |

## Where to start

- **Play a fight:** [Modes → Play](modes.md#play), then the keys in [Fighting → Buttons](fighting.md#buttons).
- **Make a character:** [Modes → Character](modes.md#character), then [Editing → Characters](editing.md#characters).
- **Make a move:** [Modes → Animate](modes.md#animate), then [Editing → Moves and inputs](editing.md#moves-and-inputs).
- **Tune the feel:** [Modes → Grid](modes.md#grid).
- **Save or share your work:** [Interface → Export and import](interface.md#export-and-import).

## Pictures

The screenshots in [img/](img/) come from `node tools/screenshots.js`, and the animations (`anim-*.png`) from `node tools/animations.js`. Both use headless Chrome; rerun them after a visible change.
