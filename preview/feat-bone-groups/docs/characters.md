# Characters in code

[← docs index](README.md)

Every built-in character is one file in `src/engine/chars/`. This page shows how to add one, either from the editor or by hand.

## Where things are

| File | What it holds |
|---|---|
| `src/engine/chars/stick.js` | the base stick: bones, poses, moves, hurt reactions, its powered stance. Every other character starts from it. Loads with the rig. |
| `src/engine/chars/_kit.js` | helpers the roster files share: `sizedBones`, `pair`, `horns`, `tail3`, `ribbon`, `retimed`, `sig`, `bind`, `stylePose`, `stanceOf`, shared poses, `charFromDiff` |
| `src/engine/chars/<name>.js` | one character each |
| `src/engine/chars/index.json` | load order of the roster files (`_kit` first). A file not listed here is not loaded. |
| `src/engine/roster.js` | runs after all of them: adds each character's super, applies exported characters, compiles `CHARS` |

All scripts share one global scope, so a top-level name in a character file (a helper, a move table) must be unique across `src/`. Prefix it with the character's name (`CENTAUR_MOVES`).

## From the editor (no code)

1. Build the character in the character tab (start from a copy, or the random generator). Test it in the tests and experiment tabs.
2. Export it as code: **export → character → code** in the top bar, or **character: export as code** in ⌘K. You get `<name>.js`.
   - The JSON exports work too (**export → character**, the diff, or **full**).
3. In a checkout, run:
   ```sh
   npm run char:add -- ~/Downloads/<name>.js
   ```
   It:
   - picks the built-in the character differs least from, and writes `src/engine/chars/<name>.js` as that base plus a diff
   - adds the name to `chars/index.json`
   - updates the script tags in every page (`npm run chars:sync`)
   - loads the engine and checks the character compiles and comes back exactly as exported.

   Options: `--name <name>` (save under another name), `--force` (replace a file `char:add` wrote before), `--dry-run` (print the file, write nothing). It refuses to overwrite a hand-written character: edit that file instead.
4. Run `npm test`, then commit and open a PR. The PR shows the diff, so reviewers see what changed against the base (bones, poses, moves, stats).

An exported file looks like this:

```js
'use strict';
// kicko: made in the character editor, exported as code (docs/characters.md): the built-in hadoo plus these changes
charFromDiff("kicko", "hadoo", { "changed": { "name": [ "hadoo", "kicko" ], "bones": { "changed": { "waist": { "changed": { "len": [ 14, 20 ] } } } } }, "added": { "speed": 1.4 } });
```

The diff is `objdiff.js` format: `changed` (`[from, to]` for a value, nested for objects; bones, stances and other named lists by id or name), `added`, `removed`. `roster.js` applies it after the built-ins are finished (supers included), the same state the editor diffed against.

## By hand

1. Copy the nearest character, e.g. `cp src/engine/chars/hadoo.js src/engine/chars/kicko.js`, and rename every `hadoo` to `kicko`.
2. Edit the definition. A character is `CHAR_DEFS.<name> = { ...stick, name, ...stats, gait, bones, poses, moves, binds, binds25, motions, stances }`:
   - **bones:** `sizedBones({ chest: 1.1, uarm: 0.9 }, thick)` rescales the stick; add parts with `pair`, `horns`, `tail3`, `ribbon` or plain bone objects (see `BONE` in `rig.js`).
   - **stats:** speed, weight, jump, health, tough, tempo... (`CHAR_STATS` in `rig-chars.js`). 1 is the stick.
   - **gait:** idle style, lean, stride, lift, arm swing, breath (`GAIT_VARS` in `rig-chars.js`).
   - **moves:** `retimed(k)` gives the stick's moves scaled to the body; `sig({ ... })` adds signature moves written in the old 10-joint notation (`fromOld` in `rig.js`), or use `attack(...)` for the usual wind-up, strike, hold, recover shape.
   - **binds:** `...bind({ special: 'kiBlast', upSpecial: 'riser' })` maps input slots to moves (`BINDS` in `rig-chars.js`).
   - **stances:** at least one more, `[{ name, pose, body, req, ...bind({...}) }]`. Without its own, a character inherits the stick's powered stance.
3. Add the name to `src/engine/chars/index.json` (after any character it reuses helpers from), then run `npm run chars:sync`.
4. Run `npm test`. The roster and chars tests check that every character has its own moves, a second stance, and loads in every page.

## Updating a built-in

Edit its file. To bring editor changes back to a hand-written character, export the diff (**export → character**) and use it as the list of changes to make; `char:add` won't overwrite a hand-written file.
