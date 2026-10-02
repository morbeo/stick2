# Testing

[← docs index](README.md)

**Tests**: `npm test` runs the engine unit tests and the scenario / character regression snapshots in Node (no dependencies; `npm run test:update` rewrites the snapshots after an intended change); `tests/fixtures/replays.json` holds recorded fights that must still play out identically: a change to the simulation fails it, then bump `ENGINE_VERSION` in core.js (old replay files are then flagged as from another version) and re-record with `npm run test:update`; `npm test` also runs `tools/build-info.js` (or `npm run build-info`), which writes `src/build.js` (git commit, branch, date, uncommitted changes; ignored by git) shown in the lab's **Debug** section, the first in the settings, next to the engine version, frame rate and the focused fight's seed, frame, state hash and fighters (copy button for bug reports); `npm run test:browser` loads the page in headless Chrome and goes through every mode, character and stance checking for errors. `npm run coverage` runs the Node tests with V8 coverage of the engine (src: core, rig, fighter, world, brain, loaded into a vm context by `tests/load.js` under their real paths) and prints line / branch / function coverage per file; the UI modules need the DOM and are covered by the browser test instead.

## The suites

| File | What it checks |
|---|---|
| `tests/engine.test.js` | engine units: guard, throws, specials, juggles, weapons, rewind, replays of each feature |
| `tests/scenarios.test.js` | every scripted scenario and every character pair, played out and compared with `tests/snapshots/` |
| `tests/replay.test.js` | the recorded fights in `tests/fixtures/replays.json` replay frame-exact (checksums every 60 frames name the first frame that differs) |
| `tests/roster.test.js` | the built-in characters: signature moves bound and playable, projectiles, stances |
| `tests/render.test.js` | every scenario renders into a stub canvas with every overlay on, and drawing never changes the fight |
| `tests/data.test.js` | data validation: settings defaults within their range / options, presets, power presets and scenario settings use real settings with fitting values, scenario characters exist; bones (unique, parents exist, limits); moves (heights, hits, striking bones, posed bones, durations, chains, throws and counters name real moves); every bound input and stance key |
| `tests/boundary.test.js` | every timing window one frame inside its edge, on it and one past it (N-1, N, N+1) at a few sizes: parry (N frames before the blow), just guard, throw break and landing tech (N+1: the press on the edge frame counts; with lastFrame off, N), air recover (only once airRecover has passed), and the juggle pool (a hit costing 2 passes with 1, lands with 2 and 3) |
| `tests/matrix.test.js` | the Tests view's move matrix (`src/checks.js`) with only what must hold in every cell: the move starts, nothing becomes NaN, both fighters return to neutral, nobody leaves the stage; each move (the stick's library and every fighter's own) gets 2 cells, column and opponent picked by the seed |
| `tests/fuzz.test.js` | 25 AI fights (10 s each) between random characters with 8 random settings each (any value the side panel allows): nothing throws, nothing becomes NaN, health stays within 0 … its maximum, nobody leaves the stage |
| `tests/determinism.test.js` | the same seed plays the same AI fight frame for frame (also in a fresh engine); another seed plays another |
| `tests/centaur.js` | a quadruped test character (not in the roster) for bones a biped never has; `run(require('./centaur'))` adds it |
| `tests/browser.js` | headless Chrome: every mode, character and stance, no errors |

A data check lists every problem it finds, one line each (`stick.jab: punch chains into nothing, not a move`), so one run shows all of them.

## Seeds

The engine takes no clock and no hidden randomness: time comes in as each frame's `dt`, and all chance (the AI, sparks, random weapons) comes from the world's seeded generator (`new World(scenario, settings, seed, chars)`). The snapshot, replay and unit tests use fixed seeds.

The randomized tests share one seed from `tests/seed.js`, printed on every run (`# seed 1`):

| Command | Seed |
|---|---|
| `npm test` | 1, the same every run |
| `SEED=42 npm test` | 42: rerun a failure with the seed it names |
| `SEED=random npm test` | a fresh one each run (and each test file: `# seed 1460372106 for fuzz.test.js`), to explore; it is printed, so a failure can be replayed |
| `FUZZ=500 node --test tests/fuzz.test.js` | 500 fuzz fights instead of 25 (seeds SEED … SEED + 499) |

## The move matrix

`npm test` plays each move in 2 cells of the matrix (about 340 cells, 5 s), the cells picked by the seed: `SEED=random npm test` tries others. `npm run test:matrix` (`MATRIX=full`) plays every move of every character in all 28 columns against itself, about 36,000 cells in 8 minutes, before a release. A failure lists each bad cell (`stick.jab vs sneeko, target guard back turned near: a position became NaN`) with the command that reruns it; the Tests view (animate tab) shows the same cell playing.

The matrix tests invariants only. Whether a move hits, is blocked or whiffs where it should is checked in the Tests view, where some cells still fail on purpose, as known bugs: flyingKnee, wallDive, warpClaw and some of noodo's moves (spin, turnKick, risingKick, armada, lariat, longJab) whiff their own setup.

## Fuzzing

Fuzz case *i* plays with seed `SEED + i` and is made from that seed alone (characters, scenario, settings), so one case replays by itself: `SEED=10 FUZZ=1 node --test tests/fuzz.test.js`. A failing case is shrunk before it is reported: each setting is dropped while the fight still fails, and it plays only up to the failing frame. The report shows the seed, what broke and on which frame, the few settings that cause it, the replay command and the engine call that rebuilds the fight (this one from a fault planted to try the shrinker):

```
seed 10: frame 75, gogili: a position, speed or health became NaN
  settings: {"gravity":4000}
  replay: SEED=10 FUZZ=1 node --test tests/fuzz.test.js
  or in the engine: new World(SCENARIOS['ai vs ai'], {"gravity":4000}, 10, [CHARS.gogili, CHARS.gloomo])
```
