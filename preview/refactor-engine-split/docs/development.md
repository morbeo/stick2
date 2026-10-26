# Development

[← docs index](README.md)

How the code is laid out, and the tools that build its generated files.

## Layout

- No build step: `index.html` loads the scripts in `src/` in order.
- Everything is drawn in code. The only asset is the icon font (see [Icons](#icons)).
- Tests live in `tests/`, see [Testing](testing.md).
- The scripts share one global scope, so a new top-level name must not exist in any other `src/` file (a repeated `const` stops the later script).
- The engine runs without a page too: `tools/lib/engine.js` loads the scripts that need no DOM (core, shapes, the rig group, fx, the roster group, fighter, world, stage, brain, checks, events) into a Node vm context. The tests and the MCP server use it.
- Some scripts come as groups, listed in `tools/lib/engine.js` (`GROUPS`) and loaded in that order:
  - `rig`: `rig.js` (bones, `fromOld`, `attack`), `rig-chars.js` (binds, stances, stats, `makeCharacter`, `CHAR_DEFS`), `chars/stick.js` (the base stick), `rig-weapons.js`, `rig-pose.js` (stance bodies, sampling, frame data, combos, `fk`, `constrain`), `rig-draw.js`.
  - `roster`: `objdiff.js`, then every file in `src/engine/chars/index.json` (`_kit.js` first, then one file per character), then `roster.js` (supers, exported characters, `CHARS`).
  - `replay`: `replay.js` (reel, editing, branches, seeking), `replay-timeline.js`, `replay-scene.js`, `replay-footage.js`, `replay-movie.js`, `replay-panel.js`.
- `npm run chars:sync` (`tools/dev/char-scripts.js`) rewrites the script tags of these groups in every page; `--check` only reports. A unit test fails when a page is out of date.
- Replay files carry `fv`, the file layout's version (separate from `ENGINE_VERSION`). `readReplay` in `world.js` upgrades older layouts; bump `REPLAY_FV` and add a step to `REPLAY_UPGRADES` when the layout changes.
- `src/engine/events.js` turns a fight into events (moves, hits, falls, inputs, combos), per-fighter lanes and stats (`recordFight`, `fightStats`), for the replay tab and anything else.

## Tools

| Tool | What it does |
|---|---|
| `node tools/dev/build-info.js` | writes `src/build.js`: git commit, branch, date, uncommitted changes (`npm test` runs it). Locally it is a snapshot: rerun after a commit or checkout; the Debug popup shows when it was written |
| `node tools/render/screenshots.js [name …]` | regenerates the screenshots in `docs/img/` (headless Chrome; no name = every shot) |
| `node tools/render/animations.js [name …]` | regenerates the short animations (`anim-*.png`): each loops one scenario, saved as an animated PNG (no name = every clip) |
| `node tools/render/screenshots.js --changed [ref]` | regenerates only the shots whose sources changed since `ref` (default `origin/master`) |
| `node tools/render/release-notes.js [--from ref] [--to ref]` | release notes with before / after screenshots per merged PR, into `release-notes/` |
| `node tools/render/social.js` | composites a few of the screenshots into `docs/img/social.png`, the GitHub repo's social preview image |
| `node tools/mcp/mcp.js [--serve PORT]` | the MCP server (`npm run mcp`): fights, settings, characters, scenarios, sounds, fx looks, the tracker, replays and pictures over MCP; `--serve` also serves the app for the live bridge (see [MCP server](mcp.md)) |
| `DISCORD_BOT_TOKEN=... node tools/discord/discord-bot.js` | the Discord fight bot (`npm run discord-bot`); `tools/discord/deploy-bot.sh` installs it as a systemd user service (see [MCP server → The Discord bot](mcp.md#the-discord-bot)) |
| `npm run discord-stickers [name …]` | renders flashy special-move/transformation clips to `out/discord-stickers/*.png`, animated and sized for Discord's sticker upload (320×320, under 500 KB; no name = every sticker) |
| `npm run itch` | packs `dist/stick2-itch.zip` for itch.io: `index.html`, `docs.html`, `src/`, `fonts/` and `LICENSE` (see [Publishing on itch.io](#publishing-on-itchio)) |
| `npm run itch:push` | runs the tests, packs the zip and uploads it with butler to `morbeo/stick2:html`, versioned by the commit (refuses uncommitted changes) |
| `npm run itch:assets` | writes a cover, banner, page/embed backgrounds, a favicon and a logo to `out/itch/`, drawn from the app's own code (see [Publishing on itch.io](#publishing-on-itchio)) |
| `python tools/render/icons.py MaterialSymbolsOutlined.ttf` | rebuilds the icon font subset (needs fonttools + brotli) |

Rerun the screenshots and animations after a visible change. Both find Chrome on their own; `CHROME=/path/to/chrome` overrides it. Running as root (a container), Chrome needs `--no-sandbox`: point `CHROME` at a two-line wrapper script that adds it.

## Agents

`.claude/agents/` holds subagent definitions for AI-assisted work: `net-tester` (netplay tests), `editor-refactorer` (editor splits behind tests), `reviewer` (pre-PR project rule check, read-only) and `ci-watcher` (CI failure diagnosis, read-only).

## Icons

The only asset is `fonts/icons.woff2`, a subset of [Material Symbols](https://github.com/google/material-design-icons) (Apache License 2.0); its license is in `fonts/LICENSE`, and ships with it.

- Icons are written as `:name:` in labels and tooltips.
- Arrows ← → ↑ ↓ become icons too.
- To add one: put its name in `ICONS` in `src/ui/ui.js`, then rebuild the subset with `python tools/render/icons.py MaterialSymbolsOutlined.ttf`.
- The page's favicon is drawn the same way: `src/ui/ui.js` renders the `sports_martial_arts` icon to a canvas once the font loads and sets it as the favicon, no image file.

## Publishing on itch.io

1. Run `npm run itch`. It refreshes `src/build.js` and writes `dist/stick2-itch.zip`, with `index.html` at the root of the zip. If there are uncommitted changes, it warns that they're included.
2. On itch.io, create a project with **Kind of project: HTML**. Upload the zip, or push it with `npm run itch:push` (step 4), then tick **This file will be played in the browser** next to the upload.
3. Under **Embed options**:
   - set the viewport to 1400 × 800;
   - turn on the fullscreen button;
   - leave mobile friendly off.
4. To publish a new version, commit and run `npm run itch:push`. It runs the tests, packs the zip and uploads it with [butler](https://itch.io/docs/butler/) to the `html` channel of `morbeo/stick2`, labelled with the commit. Set up butler once with `butler login`. Uploads after the first keep the "played in the browser" setting. `butler status morbeo/stick2` shows the live version.
   - **From GitHub instead:** run **itch.io · publish** (`.github/workflows/itch-publish.yml`) from the Actions tab, or `gh workflow run itch-publish.yml -f ref=v0.2.0`. It tests, packs and pushes to `morbeo/stick2:<channel>` (default `html`) with the commit as the version; `dry-run` only packs. Inputs: `ref`, `channel`, `screenshots`, `dry-run`. One-time setup: create an API key under itch.io → Settings → API keys and add it as the `BUTLER_API_KEY` repo secret.
   - **If the live page shows a stale build** after `butler status` confirms the new one processed: check the project's edit page for more than one uploaded file marked "This file will be played in the browser" (e.g. an old manually-uploaded file alongside the one butler manages) — itch can serve the wrong one when two are flagged. Only the current upload should have it checked.
5. **Promotional images** (all optional on itch.io): `npm run itch:assets` writes the images below to `out/itch/` — drawn from the app's own rendering code and icon font (`tools/itch/itch-assets.js`, `tools/itch/itch-render.html`), not external files or an image editor. It records a couple of short AI free-for-alls and picks the frame where the camera shake peaks; re-run it for different moments.

   | File | Use |
   |---|---|
   | `social.png` (1200×630) | general social-media sharing (not an itch.io upload) |
   | `cover-wide.png` (2100×900, 21:9) | the game's **Cover image** |
   | `banner.png` (1600×500) | a wide crop for sharing elsewhere (forum posts, a profile header…); a different matchup than the cover, so it isn't just the same picture again |
   | `background.png` (1920×1080) | the page's **Edit theme → Background image**; blurred and darkened to sit behind page content, not be looked at directly |
   | `embed-bg.png` (1920×1080) | **Embed options**' background image, shown around the game's 1400×800 viewport on wider screens |
   | `favicon.png`, `logo.png` | the tab icon mark, and a transparent horizontal wordmark for promo modules |

6. **Store screenshots**: `node tools/itch/itch-showcase.js` writes `showcase-*.png` (character, animate, replay, experiment, fx, grid) to `out/itch/`. The publish workflow renders these and the promo images as the **itch-images** run artifact when `screenshots` is on. itch.io has no API or butler command for page screenshots, the cover or the theme: upload them on the project's edit page (Screenshots, Cover image, Edit theme). butler only pushes downloadable/playable builds.

Notes for the itch.io page:
- The game runs in an iframe, so the player clicks it before keys work. In fullscreen, the browser may take Esc.
- Saved data (settings, layouts, characters) is stored per site. The itch.io copy starts empty, so use export and import to bring data over.

## Publishing to Discord

- Workflows are named `<Area> · <what>`, jobs and steps by what they do, and each run writes a one-line job summary. Third-party actions are pinned to a commit SHA with a `# vN` comment; Dependabot (`.github/dependabot.yml`) bumps them and npm deps weekly. Steps shared by several workflows live in a composite action under `.github/actions/` (e.g. `fight-gif`). Every workflow uses the same pinned SHA per action and Node 22. Push/PR workflows cancel a PR's superseded run (`concurrency`); release workflows queue instead. The root `npm ci` is skipped in CI because its only dependency (`discord.js`) is for the fight bot. Server tests run once, in **Tests**; **Server · image** (`server.yml`) only runs on a release or by hand.
- A weekly drift check reviews the repo against [drift-checks.md](drift-checks.md) and opens one `drift` issue with its findings.
- `.github/workflows/discord-notify.yml` posts a fight GIF and the commit message/SHA to a Discord webhook (the `DISCORD_WEBHOOK` repo secret) on every push to `master`, and the release notes/tag plus the same kind of GIF (also attached to the release's assets) when a release is published — no manual step either way. The GIF is seeded by the commit SHA or the release tag, so it's reproducible: `node tools/discord/render-notify-gif.js <sha-or-tag>`. To add the GIF to a release that's missing one, run **Release · attach fight GIF** (`.github/workflows/release-gif.yml`) from the Actions tab with the release's tag, or `gh workflow run release-gif.yml -f tag=<tag>`.
- `.github/workflows/discord-feature-request.yml` posts every `enhancement` issue (labelled on open or later) to the `#feature-requests` channel (the `DISCORD_FEATURE_REQUESTS_WEBHOOK` repo secret) — also no manual step. Point that secret at a webhook scoped to `#feature-requests` before relying on it.
- The fight bot (`tools/discord/discord-bot.js`, a separate always-on process) is unrelated to either workflow: see [MCP server → The Discord bot](mcp.md#the-discord-bot).

### Feature request guidelines (`#feature-requests`)

- File the request on GitHub first (use the "Feature request" issue template) — it auto-posts to the channel, so GitHub stays the single source of truth and discussion doesn't fork across two places.
- If you want to discuss an idea before it's fleshed out enough for an issue, post in `#feature-requests` directly, tag it with the area it touches (character / move / fx / editor / ui), and open the GitHub issue once it firms up — link back to the Discord message in the issue body.
- Don't open duplicate issues for the same idea just to "also" post it in Discord — react/reply on the existing bot post instead.
- Keep the request scoped to one idea per issue/message; bundle only tightly related tweaks (e.g. "add X move" plus "give it an icon").

## Branch previews

`.github/workflows/pages.yml` publishes the site to the `gh-pages` branch: `master` at the root (https://morbeo.github.io/stick2/), every other branch at `https://morbeo.github.io/stick2/preview/<branch>/` (characters outside `A-Za-z0-9._-` become `-`). Opening a PR comments its preview link; deleting the branch removes the preview. One-time setup: Settings → Pages → Source "Deploy from a branch", branch `gh-pages`, folder `/ (root)`, after the first run has created that branch.

## Any build

`build.html?sha=<commit, branch or tag>` plays the game as it was at that commit (palette: **load build**). Add `&page=docs.html` (or any entry page) for another page.

- It resolves the ref with the GitHub API, then loads that commit's page from jsDelivr (`cdn.jsdelivr.net/gh/morbeo/stick2@<sha>/`), so every commit works without being deployed.
- `BUILD` is filled in from the commit, so the debug popup names it; the update check stays quiet.
- Saves are a read-only copy: the old build reads your local data, but its writes stay in memory and vanish on reload.
- Needs network access to api.github.com (60 lookups an hour without sign-in) and jsDelivr.
