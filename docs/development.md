# Development

[← docs index](README.md)

No build step: `index.html` loads the scripts in `src/` in order. `tools/build-info.js` writes `src/build.js` (run by `npm test`); `tools/screenshots.js` regenerates the images in `docs/img/`.

## Icons

Everything is drawn in code; the only asset is `fonts/icons.woff2`, a subset of [Material Symbols](https://github.com/google/material-design-icons) (Apache License 2.0). Icons are written as `:name:` in labels and tooltips (arrows ← → ↑ ↓ become icons too); after adding a name to `ICONS` in `src/ui.js`, rebuild the subset with `python tools/icons.py MaterialSymbolsOutlined.ttf` (needs fonttools + brotli).
