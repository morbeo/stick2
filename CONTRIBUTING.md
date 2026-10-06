# Contributing

stick2 is an active, solo-built project — it needs feedback, testers and bug reports far more than it needs anything else right now. If you've tried it, even briefly, your impressions are useful.

## Feedback and testing

The most valuable thing you can do is **play with it and say what happened**: what felt wrong, what crashed, what was confusing, what move or setting didn't behave the way the docs say it should. [Open an issue](https://github.com/morbeo/stick2/issues) for any of that — a vague "this felt off" report with a scenario or seed is still worth filing.

The app has a **report a bug** button for this, inside the **Debug** popup (top bar, upper right, the red chart icon). It shows a short report — build, engine version, settings changed from default, and the fight you're looking at — then one click copies it to your clipboard and opens a new GitHub issue for you to paste it into.

Useful things to include in a report:

- The **report a bug** button's output, pasted into the issue's Attachments section.
- What you were doing (which mode/tab, which character, which move or setting).
- What you expected versus what happened.
- A saved replay or scenario, if the bug is reproducible (see [Testing](docs/testing.md)) — replays are plain JSON and easy to attach, and the button's output reminds you to.
- Your browser, since the project only targets evergreen Chrome/Firefox/Safari.

## Suggesting a character

Looking for what to work on, or how to use the character/animate/experiment tools to build one? See [Contributing to the roster](docs/roster-contributing.md). This section is just the mechanics of the button that submits it.

The character tab has a **suggest for the roster** button, its own row under the heading, for proposing a roster character — your own edit of a built-in, or a brand new one — without using git at all.

It opens a dialog with three steps: **export** downloads the character as a JSON file, **open a new issue** opens a blank GitHub issue on this repo (sign in if asked — no fork needed, unlike a pull request), and you attach the exported file to it and describe what's new or changed. An earlier version of this button tried to pre-fill a GitHub "new file" page (a PR draft) with the character's JSON in the URL itself — a character alone is bigger than a URL can reliably carry, and GitHub refuses an oversized request outright rather than truncating it, so that page almost always opened empty anyway, and still needed a fork and "Propose changes" even once pasted. An issue with a file attached needs neither.

A suggestion like this is a staged proposal, not a finished change: the attached JSON is the character's full compiled definition (bones, poses, moves — the same format the character export/import buttons use). Turning it into a PR means hand-folding it into `src/roster.js` (or importing it locally to look it over first, with the character import button's "from the clipboard" option) — plain review, same as any other change. A replay of the character in action is a nice addition for reviewers, not required: play it through the **showcase** scenario and export that from the replay tab alongside the character file.

## Pull requests

PRs are welcome too: bug fixes, new fx looks, roster characters, docs fixes, anything. A few things that keep review quick:

- `npm test` and `npm run test:browser` should pass before you open a PR.
- The simulation is deterministic and pinned to `ENGINE_VERSION` (`src/core.js`) — if a change alters how an existing fight plays out (not just adds something new), the pinned fixtures in `tests/fixtures/` and `tests/snapshots/` need regenerating with `npm run test:update`, and `ENGINE_VERSION` needs bumping. Say so in the PR description.
- Keep the no-build-step, no-dependencies, no-image-asset constraints: everything is plain `src/*.js` loaded via `<script>` tags in `index.html`, and visuals are drawn in code, not images.
- Match the existing code style (see [Development](docs/development.md)) rather than introducing a new one.
- Small, focused PRs are easier to land than large ones.
- Commit messages: an imperative subject line (under 72 chars), a blank line, then 1-5 short `- ` bullets — what changed and why, with `- Risk:` / `- Follow-up:` only when there's a real one. No prose paragraphs, no "Risks: none", no AI attribution lines.

If you're not sure whether something is worth a PR, open an issue first and ask.
