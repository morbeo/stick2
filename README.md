# stick2

A 2D stick-figure fighting engine and motion lab for the browser: procedural skeletons, keyframe tweening with a spring pose filter, and tools to tune how hits *feel*. No build step, no dependencies, no image assets: everything is drawn in code.

**[Play it on GitHub Pages](https://morbeo.github.io/stick2/)**, or open `index.html` directly. Full docs: [docs/](docs/README.md).

![A fight: knockdown, combo counter and frame meter](docs/img/play.png)

## Features

**Fight.** You, the engine AI (four difficulty levels), a dummy or scripted scenarios; 12 characters with chains, motion specials, throws, counters, projectiles, weapons, juggles and ragdoll falls; 2D or 2.5D lanes; endless waves. A frame meter and input display for training. → [Fighting](docs/fighting.md)

**Tune the feel.** Hundreds of settings (hit stop, shake, zoom, springs, gravity, knockback) with presets, and a grid that replays the same seeded fight side by side with one setting swept.

![Grid: one fight, nine hit stop values](docs/img/grid.png)

**Animate moves.** Pose keyframes by dragging joints (IK), retime them on a timeline, and watch the move with springs and hit stop against a target in any state. A gallery loops every move, and a move table edits them all at once. → [Editing](docs/editing.md)

![The move editor: keyframes, timeline and live preview](docs/img/animate.png)

**Build characters.** Drag joints, add limbs (arms, legs, tails, heads), tune each bone's stretch, stiffness and follow-through; stances, idle and walk variety, a stat radar.

![The character editor](docs/img/character.png)

**Test moves.** Every move against every target: standing, crouching, guarding high or low, airborne, down, dizzy; facing or turned away; near or far. Cells that don't do what they should turn red; click one to watch it and open it in the editor. → [Modes: tests](docs/modes.md#tests)

![The move test matrix](docs/img/tests.png)

**See the impacts.** Hit reactions and falls side by side; drag on a body to strike it anywhere.

![Impact view](docs/img/impact.png)

**Get around.** ⌘K finds any mode, tool, table, move or setting; every key rebinds, with macros; deterministic replays you can save, rewind and scrub; in-app docs with live demos. → [Interface](docs/interface.md)

## Development

`npm test` runs the engine tests in Node; `npm run test:browser` runs the headless Chrome smoke test. → [Testing](docs/testing.md)

The only asset is `fonts/icons.woff2`, a subset of [Material Symbols](https://github.com/google/material-design-icons) (Apache 2.0); everything else, sound included, is generated in code.
