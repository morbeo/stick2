# Development

[← docs index](README.md)

How the code is laid out, and the tools that build its generated files.

## Layout

- No build step: `index.html` loads the scripts in `src/` in order.
- Everything is drawn in code. The only asset is the icon font (see [Icons](#icons)).
- Tests live in `tests/`, see [Testing](testing.md).
- The scripts share one global scope, so a new top-level name must not exist in any other `src/` file (a repeated `const` stops the later script).
- The engine runs without a page too: `tools/engine.js` loads the scripts that need no DOM (core, rig, fx, roster, fighter, world, brain, checks, events) into a Node vm context. The tests and the MCP server use it.
- `src/events.js` turns a fight into events (moves, hits, falls, inputs, combos), per-fighter lanes and stats (`recordFight`, `fightStats`), for the replay tab and anything else.

## Tools

| Tool | What it does |
|---|---|
| `node tools/build-info.js` | writes `src/build.js`: git commit, branch, date, uncommitted changes (`npm test` runs it) |
| `node tools/screenshots.js [name …]` | regenerates the screenshots in `docs/img/` (headless Chrome; no name = every shot) |
| `node tools/animations.js [name …]` | regenerates the short animations (`anim-*.png`): each loops one scenario, saved as an animated PNG (no name = every clip) |
| `node tools/social.js` | composites a few of the screenshots into `docs/img/social.png`, the GitHub repo's social preview image |
| `node tools/mcp.js [--serve PORT]` | the MCP server (`npm run mcp`): fights, settings, characters, scenarios, sounds, fx looks, the tracker, replays and pictures over MCP; `--serve` also serves the app for the live bridge (see [MCP server](mcp.md)) |
| `DISCORD_BOT_TOKEN=... node tools/discord-bot.js` | the Discord fight bot (`npm run discord-bot`); `tools/deploy-bot.sh` installs it as a systemd user service (see [MCP server → The Discord bot](mcp.md#the-discord-bot)) |
| `npm run discord-stickers [name …]` | renders flashy special-move/transformation clips to `out/discord-stickers/*.png`, animated and sized for Discord's sticker upload (320×320, under 500 KB; no name = every sticker) |
| `npm run itch` | packs `dist/stick2-itch.zip` for itch.io: `index.html`, `docs.html`, `src/`, `fonts/` and `LICENSE` (see [Publishing on itch.io](#publishing-on-itchio)) |
| `npm run itch:push` | runs the tests, packs the zip and uploads it with butler to `morbeo/stick2:html`, versioned by the commit (refuses uncommitted changes) |
| `npm run itch:assets` | writes a cover, banner, page/embed backgrounds, a favicon and a logo to `out/itch/`, drawn from the app's own code (see [Publishing on itch.io](#publishing-on-itchio)) |
| `python tools/icons.py MaterialSymbolsOutlined.ttf` | rebuilds the icon font subset (needs fonttools + brotli) |

Rerun the screenshots and animations after a visible change. Both find Chrome on their own; `CHROME=/path/to/chrome` overrides it.

## Icons

The only asset is `fonts/icons.woff2`, a subset of [Material Symbols](https://github.com/google/material-design-icons) (Apache License 2.0); its license is in `fonts/LICENSE`, and ships with it.

- Icons are written as `:name:` in labels and tooltips.
- Arrows ← → ↑ ↓ become icons too.
- To add one: put its name in `ICONS` in `src/ui.js`, then rebuild the subset with `python tools/icons.py MaterialSymbolsOutlined.ttf`.
- The page's favicon is drawn the same way: `src/ui.js` renders the `sports_martial_arts` icon to a canvas once the font loads and sets it as the favicon, no image file.

## Publishing on itch.io

1. Run `npm run itch`. It refreshes `src/build.js` and writes `dist/stick2-itch.zip`, with `index.html` at the root of the zip. If there are uncommitted changes, it warns that they're included.
2. On itch.io, create a project with **Kind of project: HTML**. Upload the zip, or push it with `npm run itch:push` (step 4), then tick **This file will be played in the browser** next to the upload.
3. Under **Embed options**:
   - set the viewport to 1400 × 800;
   - turn on the fullscreen button;
   - leave mobile friendly off.
4. To publish a new version, commit and run `npm run itch:push`. It runs the tests, packs the zip and uploads it with [butler](https://itch.io/docs/butler/) to the `html` channel of `morbeo/stick2`, labelled with the commit. Set up butler once with `butler login`. Uploads after the first keep the "played in the browser" setting. `butler status morbeo/stick2` shows the live version.
   - **If the live page shows a stale build** after `butler status` confirms the new one processed: check the project's edit page for more than one uploaded file marked "This file will be played in the browser" (e.g. an old manually-uploaded file alongside the one butler manages) — itch can serve the wrong one when two are flagged. Only the current upload should have it checked.
5. **Promotional images** (all optional on itch.io): `npm run itch:assets` writes the images below to `out/itch/` — drawn from the app's own rendering code and icon font (`tools/itch-assets.js`, `tools/itch-render.html`), not external files or an image editor. It records a couple of short AI free-for-alls and picks the frame where the camera shake peaks; re-run it for different moments.

   | File | Use |
   |---|---|
   | `social.png` (1200×630) | general social-media sharing (not an itch.io upload) |
   | `cover-wide.png` (2100×900, 21:9) | the game's **Cover image** |
   | `banner.png` (1600×500) | a wide crop for sharing elsewhere (forum posts, a profile header…); a different matchup than the cover, so it isn't just the same picture again |
   | `background.png` (1920×1080) | the page's **Edit theme → Background image**; blurred and darkened to sit behind page content, not be looked at directly |
   | `embed-bg.png` (1920×1080) | **Embed options**' background image, shown around the game's 1400×800 viewport on wider screens |
   | `favicon.png`, `logo.png` | the tab icon mark, and a transparent horizontal wordmark for promo modules |

Notes for the itch.io page:
- The game runs in an iframe, so the player clicks it before keys work. In fullscreen, the browser may take Esc.
- Saved data (settings, layouts, characters) is stored per site. The itch.io copy starts empty, so use export and import to bring data over.

## Publishing to Discord

- `.github/workflows/discord-notify.yml` posts the commit message and SHA to a Discord webhook (the `DISCORD_WEBHOOK` repo secret) on every push to `master` — no manual step.
- `.github/workflows/discord-feature-request.yml` posts every new `enhancement`-labeled issue to the `#feature-requests` channel (the `DISCORD_FEATURE_REQUESTS_WEBHOOK` repo secret) — also no manual step. Point that secret at a webhook scoped to `#feature-requests` before relying on it.
- `.github/workflows/discord-release.yml` renders a fight GIF (seeded by the release tag, so it's reproducible: `node tools/render-notify-gif.js <tag>`), attaches it to the GitHub release's assets, and posts it to the same `DISCORD_WEBHOOK` — on every published release, no manual step.
- The fight bot (`tools/discord-bot.js`, a separate always-on process) is unrelated to either workflow: see [MCP server → The Discord bot](mcp.md#the-discord-bot).

### Feature request guidelines (`#feature-requests`)

- File the request on GitHub first (use the "Feature request" issue template) — it auto-posts to the channel, so GitHub stays the single source of truth and discussion doesn't fork across two places.
- If you want to discuss an idea before it's fleshed out enough for an issue, post in `#feature-requests` directly, tag it with the area it touches (character / move / fx / editor / ui), and open the GitHub issue once it firms up — link back to the Discord message in the issue body.
- Don't open duplicate issues for the same idea just to "also" post it in Discord — react/reply on the existing bot post instead.
- Keep the request scoped to one idea per issue/message; bundle only tightly related tweaks (e.g. "add X move" plus "give it an icon").
