# stick2 docs

The full reference behind the [landing page](../README.md). The app has its own interactive docs too: ⓘ in the top bar, or `docs.html`, with live demo fights and every setting.

| Page | What's in it |
|---|---|
| [Modes](modes.md) | what each tab and view does: play, grid, experiment (sweep, breed, attacks, compare, impact, vary body), character, animate, gallery, tests |
| [Fighting](fighting.md) | the engine: guard, combos, throws, specials, projectiles, weapons, power, falls, 2D / 2.5D, stances |
| [Editing](editing.md) | the roster, stats, the move table, movement layers, the input table, combos |
| [Contributing to the roster](roster-contributing.md) | what help is needed, the contribution workflow, and where to learn the tools (animate, movement, physics, combos) |
| [Interface](interface.md) | the top bar, export / import, debug, ⌘K, keys and macros, panels, undo, phones and the touch pad, sound |
| [Development](development.md) | code layout, build info, the screenshot and animation tools, the icon font |
| [Testing](testing.md) | `npm test`, snapshots, replays, the browser test, seeds, the move matrix, fuzzing |
| [Netplay](netplay.md) | online play with no server: connection, invite codes, the lobby; what's built and what's next |
| [Server](server.md) | the dedicated server: rooms through a relay, no codes; running it (Node, Docker), settings, `/healthz`, Prometheus metrics, the protocol |
| [MCP server](mcp.md) | stick2 as an MCP server: fights, settings, characters, replays and pictures for an AI assistant; the live bridge; the Discord bot |

## Where to start

- **Play a fight:** [Modes → Play](modes.md#play), then the keys in [Fighting → Buttons](fighting.md#buttons).
- **Make a character:** [Modes → Character](modes.md#character), then [Editing → Characters](editing.md#characters).
- **Make a move:** [Modes → Animate](modes.md#animate), then [Editing → Moves and inputs](editing.md#moves-and-inputs).
- **Play someone online:** [Modes → Online](modes.md#online).
- **Tune the feel:** [Modes → Experiment](modes.md#experiment).
- **Save or share your work:** [Interface → Export and import](interface.md#export-and-import).
- **Contribute to the roster:** [Contributing to the roster](roster-contributing.md).

## Pictures

The screenshots in [img/](img/) come from `node tools/render/screenshots.js`, and the animations (`anim-*.png`) from `node tools/render/animations.js`. Both use headless Chrome; rerun them after a visible change; `node tools/render/screenshots.js --changed` reruns only the shots whose sources differ from `origin/master` (each shot lists what it shows in `TOUCHES`). `node tools/render/social.js` composites a few of those screenshots into `img/social.png`, the GitHub repo's social preview (Settings → General → Social preview) — rerun it after regenerating the shots it uses (play, animate, experiment, character, fx, gallery).

## Release notes in pictures

`node tools/render/release-notes.js` lists each PR merged since the last tag, with before / after screenshots of the screens it touched: "before" renders the previous tag from a temporary git worktree, "after" the release. It writes `release-notes/notes.md` and the PNGs. `--from` / `--to` pick the range, `--max` the shots per PR, `--url` the image link prefix.

The **Release · notes in pictures** workflow runs it on every published release (or by hand with a tag), attaches the images to the release and appends the notes to its body; running it again replaces that section.
