# Contributing

stick2 is an active, solo-built project — it needs feedback, testers and bug reports far more than it needs anything else right now. If you've tried it, even briefly, your impressions are useful.

## Feedback and testing

The most valuable thing you can do is **play with it and say what happened**: what felt wrong, what crashed, what was confusing, what move or setting didn't behave the way the docs say it should. [Open an issue](https://github.com/morbeo/stick2/issues) for any of that — a vague "this felt off" report with a scenario or seed is still worth filing.

The app has a **report a bug** button for this (top bar, and in the Debug popup). It shows a short report — build, engine version, settings changed from default, and the fight you're looking at — then one click copies it to your clipboard and opens a new GitHub issue for you to paste it into.

Useful things to include in a report:

- The **report a bug** button's output, pasted into the issue's Attachments section.
- What you were doing (which mode/tab, which character, which move or setting).
- What you expected versus what happened.
- A saved replay or scenario, if the bug is reproducible (see [Testing](docs/testing.md)) — replays are plain JSON and easy to attach, and the button's output reminds you to.
- Your browser, since the project only targets evergreen Chrome/Firefox/Safari.

## Suggesting a character

The character tab has a **suggest** button (next to export) for proposing a roster character — your own edit of a built-in, or a brand new one — without using git at all.

It copies the character's full JSON to your clipboard, then opens GitHub's "new file" page for this repo, pre-filled with that JSON at `contrib/characters/<name>.json` (if the box looks empty or cut off — very large characters can hit the URL's own length limit — paste it yourself, it's already on your clipboard). Sign in if asked; GitHub forks the repo for you automatically. From there: scroll down, click **Propose new file**, then **Create pull request**.

A PR like this is a staged suggestion, not a finished change: the `contrib/characters/` file is the character's compiled JSON (bones, poses, moves — the same format the export/import buttons use), not the hand-written `src/roster.js` form the roster actually ships in. Merging it means hand-folding it into `src/roster.js` (or importing the JSON locally to look it over first, with the import button's "from the clipboard" option) and deleting the staging file in the same commit — plain review, same as any other PR.

## Pull requests

PRs are welcome too: bug fixes, new fx looks, roster characters, docs fixes, anything. A few things that keep review quick:

- `npm test` and `npm run test:browser` should pass before you open a PR.
- The simulation is deterministic and pinned to `ENGINE_VERSION` (`src/core.js`) — if a change alters how an existing fight plays out (not just adds something new), the pinned fixtures in `tests/fixtures/` and `tests/snapshots/` need regenerating with `npm run test:update`, and `ENGINE_VERSION` needs bumping. Say so in the PR description.
- Keep the no-build-step, no-dependencies, no-image-asset constraints: everything is plain `src/*.js` loaded via `<script>` tags in `index.html`, and visuals are drawn in code, not images.
- Match the existing code style (see [Development](docs/development.md)) rather than introducing a new one.
- Small, focused PRs are easier to land than large ones.

If you're not sure whether something is worth a PR, open an issue first and ask.
