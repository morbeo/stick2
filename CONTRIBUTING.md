# Contributing

stick2 is an active, solo-built project — it needs feedback, testers and bug reports far more than it needs anything else right now. If you've tried it, even briefly, your impressions are useful.

## Feedback and testing

The most valuable thing you can do is **play with it and say what happened**: what felt wrong, what crashed, what was confusing, what move or setting didn't behave the way the docs say it should. [Open an issue](https://github.com/morbeo/stick2/issues) for any of that — a vague "this felt off" report with a scenario or seed is still worth filing.

Useful things to include in a report:

- What you were doing (which mode/tab, which character, which move or setting).
- What you expected versus what happened.
- A saved replay or scenario, if the bug is reproducible (see [Testing](docs/testing.md)) — replays are plain JSON and easy to attach.
- Your browser, since the project only targets evergreen Chrome/Firefox/Safari.

## Pull requests

PRs are welcome too: bug fixes, new fx looks, roster characters, docs fixes, anything. A few things that keep review quick:

- `npm test` and `npm run test:browser` should pass before you open a PR.
- The simulation is deterministic and pinned to `ENGINE_VERSION` (`src/core.js`) — if a change alters how an existing fight plays out (not just adds something new), the pinned fixtures in `tests/fixtures/` and `tests/snapshots/` need regenerating with `npm run test:update`, and `ENGINE_VERSION` needs bumping. Say so in the PR description.
- Keep the no-build-step, no-dependencies, no-image-asset constraints: everything is plain `src/*.js` loaded via `<script>` tags in `index.html`, and visuals are drawn in code, not images.
- Match the existing code style (see [Development](docs/development.md)) rather than introducing a new one.
- Small, focused PRs are easier to land than large ones.

If you're not sure whether something is worth a PR, open an issue first and ask.
