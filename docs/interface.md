# Interface

[← docs index](README.md)

Finding things, keys, panels and the in-app docs.

## In-app docs

**Docs**: the docs button (ⓘ) in the top bar (or ⌘K, or **docs** in any panel heading's ⓘ) opens interactive docs over the app: a guide with live demo fights (pause, step, restart, try it in play; the demos always run on the default settings and the built-in stick, so your edits can't break them, while try it uses yours) and a reference generated from the app's own tables (every setting group with its defaults, move flags and properties, heights, input slots, easing with an animated curve per curve type, the keyboard as bound now), all searchable. `docs.html` opens them as a page of their own (`index.html#docs`; `docs.html#weapons` opens one topic; `index.html#mode=animate` opens a mode).

## Command palette and search

- **command palette** (⌘K / Ctrl+K, or :search: top right): type to find a mode, a tool on the current toolbar, a key action, any table (move table, input table, combos: over the character tab there, else in animate; bone table: in the character tab), factory reset, a character, a move (opens it in animate) or a setting (searches the panel for it); ↑ ↓ pick, Enter runs, Esc closes
- **settings search**: fuzzy search over the variable names and groups (plain text matches tooltips), Esc clears

## Keys and macros

- **keys** (top bar): rebind every action (fight, transport, view, modes, animate, character), and macros: one key presses a sequence such as `2, 3, 6P` (numpad directions + P/K, waits like `0.1`); saved in the browser. Keys are scoped by context: in a fight (play, grid) the letters belong to the fighter, so a shortcut on a letter takes ⇧ there (⇧P pause, ⇧N step, ⇧V rewind, ⇧R restart, ⇧H panel, ⇧B boxes, ⇧G ghost) and 1-6 switch modes; in the editor modes (gallery, impact, character, animate) shortcuts take the plain key (P, N, R, H, `,` `.` frame, ⇧← ⇧→ key, Enter play, O onion, I aim, Del delete) and the fight keys and macros do nothing. The keys panel heads each group with its context and marks keys that clash within one. Keys never reach the fight while a slider or text field has focus, and a button clicked with the mouse lets go of focus, so Space doesn't press it again

## Panels and variable groups

- **panel layout**: every heading carries its buttons on the right in the same place: things (character, bones, stance, moves) get their actions always in the same order and with the same icons (new · random · copy · rename · revert · delete · import · export), groups of variables get the group buttons; panels go from the list to the selected item (character → bones → selected bone → stance → stats → walk; moves → selected move → selected key). The top bar: the modes, with undo / redo, the replay files (save, play), **export** / **import** (a popup each: the character, the settings, or everything: your edited and new characters, the changed settings, your scenarios and your keys, as one JSON file; importing everything asks first, a broken character in it loads nothing, settings out of range fall back to their default) and search / panel / keys / debug / docs on the right (**debug**: the ghost, boxes and scope switches, the build, engine version, frame rate and the shown fight's state with a copy button for bug reports, factory reset and the monitor, in any tab); under them the playback controls (the same in every mode), then the mode's own tools in labelled groups (fight · show · dummy, grid · axes · tests · stats…); the settings panel starts with the search, then the presets. Option buttons carry icons (views, sorts, heights, limbs, targets, presets…). **Less at once**: click a heading to fold its section (folded ones hide their group buttons until hovered); only the section you work in starts open and each one is remembered per mode in this browser; groups show their main variables and keep the rest behind a **more** button (moves: power, knock, launch, stun, damage; bones: len, thick, hurt, lag, stretch; settings: a few per group), and a search shows every match, folded or not; the character is one button with its drawing that opens the grid of characters; the help line under the view and the frame meter's colour legend show for a few seconds on the first visit to a mode, then only with **hints** (top right, ?); secondary tools are icon-only buttons with tooltips (transport, panel / keys / hints, the show toggles), grid's ready-made comparisons sit in one tests menu, and the input table shows its pads with the full table behind details
- **variable groups** (side panel): every group of variables (settings, the selected bone, the move, the selected key) has buttons to randomize, reset to defaults (the built-in value), empower or diminish all of them; settings and bones also experiment with them in a grid. Grid experiments (breed, attacks, body) give each cell a distinct value of every varied variable, spread evenly over the range, and **exaggerate** ×2 / ×4 makes the differences stand out Every variable's name is a link (dotted underline, a flask on hover): click it to experiment with that one variable: settings sweep it across the grid, bone properties, stats and walk & idle open nine bodies varying only it
Every setting has a hover tooltip; each group's ⓘ explains it and lists its keys. `?` in the top bar shows all keys.

## Time: pause, scrub, undo

- **paused** shows a large PAUSED sign over the preview
- **settings undo**: sliders, presets, group buttons and grid picks are undoable with ⌘Z, on the same stack as character edits; clicking a sweep or breed cell also applies its values (Shift+click only focuses)
- **scrub** (top bar, M): mouse left/right sets the time in any view; the seeded fights are re-simulated to that moment

## Sound

- **sound**: whooshes, hits, thuds and blocks synthesized live with WebAudio (no sound files), panned by where they happen, in the live fight and the animate preview only (rewinds and replays stay silent); the sound toggle in the top bar mutes them

## Factory reset

- **factory reset** (⌘K factory reset, or the debug popup in the menu bar): asks, then deletes everything stick2 keeps in the browser (edited and custom characters, keys and macros, layout and hints) and reloads as on a first visit; export characters first to keep them
