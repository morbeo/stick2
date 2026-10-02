# Development

[← docs index](README.md)

How the code is laid out, and the tools that build its generated files.

## Layout

- No build step: `index.html` loads the scripts in `src/` in order.
- Everything is drawn in code. The only asset is the icon font (see [Icons](#icons)).
- Tests live in `tests/`, see [Testing](testing.md).

## Tools

| Tool | What it does |
|---|---|
| `node tools/build-info.js` | writes `src/build.js`: git commit, branch, date, uncommitted changes (`npm test` runs it) |
| `node tools/screenshots.js [name …]` | regenerates the screenshots in `docs/img/` (headless Chrome; no name = every shot) |
| `node tools/animations.js [name …]` | regenerates the short animations (`anim-*.png`): each loops one scenario, saved as an animated PNG (no name = every clip) |
| `python tools/icons.py MaterialSymbolsOutlined.ttf` | rebuilds the icon font subset (needs fonttools + brotli) |

Rerun the screenshots and animations after a visible change. Both find Chrome on their own; `CHROME=/path/to/chrome` overrides it.

## Icons

The only asset is `fonts/icons.woff2`, a subset of [Material Symbols](https://github.com/google/material-design-icons) (Apache License 2.0).

- Icons are written as `:name:` in labels and tooltips.
- Arrows ← → ↑ ↓ become icons too.
- To add one: put its name in `ICONS` in `src/ui.js`, then rebuild the subset with `python tools/icons.py MaterialSymbolsOutlined.ttf`.
