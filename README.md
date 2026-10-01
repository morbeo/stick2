# stick2

A minimal 2D stick-figure fighting engine for the browser: procedural skeleton, keyframe tweening with a spring pose filter, and hit-stop/juice tuning tools.

Open `index.html` directly (no build step), or play it on GitHub Pages: https://morbeo.github.io/stick2/

- **play**: one fight (you / engine AI / dummy / scripted scenarios); the AI cancels chains into rush and spin, stomps a downed fighter and meets jumps with rising
- **grid**: 3x3 sweep of any tunable (or X x Y), every cell replaying the same seeded fight; **breed** gives the cells random values of the settings you pick around a parent (click the best cell to breed around it); **attacks** generates random attacks for the current character (IK-posed on any limb end), breeds them, and saves one as a move or opens it in animate
- **combos & cancels**: chains (authored routes, or a free 2-button magic series), specials by motion (↓↘→ J rush, →↓↘ J rising, ↓↙← K spin, ↓↘→ K stomp) that cancel normals on hit, jump cancels into air combos with juggle decay, OTG hits on a fighter lying down; cancel windows show purple on the frame meter and timeline (a key can open the window or be invincible); **cancel test** in the grid compares chain rules on combo fights
- **combo escalation**: hit stop, shake and zoom that grow per combo hit, attacks or the whole game speeding up (or slowing) along a combo; **combo fx test** in the grid shows each effect on the same air combo
- **falls**: knocked-down fighters tumble with flailing limbs, bounce off the floor (restitution, bounce count) and off the arena walls
- **2D / 2.5D** (plane setting): one line, three sidestep lanes (double tap ↑ / ↓; wide moves like spin still hit) or a free depth belt (↑ / ↓ walk in depth); fighters are drawn lower and bigger toward the camera; flat figures only hit within zReach of each other's depth, and attacks home in on the target's depth (zAssist); the hop key (Space) jumps, with ← / → a ninja flip; double tap → / ← dashes (passing through opponents for the first dashPass seconds), holding on runs; the AI lines up in depth and sidesteps; **2.5D test** in the grid runs every plane on sidestep / flip / dash / AI fights
- **idle and walk variety**: each fighter gets its own stance width and idle (weight shift, boxer bounce or sway); steps match leg length so feet stay planted, walking back takes shorter steps with the guard up, a centaur trots on diagonal pairs
- **keys** (top bar): rebind every action (fight, transport, view, modes, animate, character), and macros: one key presses a sequence such as `2, 3, 6P` (numpad directions + P/K, waits like `0.1`); saved in the browser
- **settings groups** (side panel): each heading has buttons to randomize, reset, empower or diminish all its variables, or experiment with them in the breed grid
- **gallery**: every attack looping with its keyframe timeline and frame data (startup / active / recovery, advantage on hit)
- **character**: drag joints to set length and stance angle, add role-based limbs (arms, legs, tails, heads, joints), tune bone properties (stretch, follow-through, stiffness…) and watch the live preview fight; **experiment** breeds a 3x3 grid of body variations around the cell you click (with **limbs** on, variations also add, drop or extend limbs)
- **animate**: pose keyframes by dragging joints (IK; Alt = rotate one bone), retime keys on a 60 fps timeline, set easing / active frames / lunge and hit properties, onion skins, **aim** (the striking limb follows the cursor) and a live preview with springs and hit stop
- **characters** (side panel in character / animate): built-in stick, brute, dwarf, minotaur, demon (wings, horns, tail) and centaur (four legs), copy to make your own, revert, export / import JSON; edits are saved in the browser automatically. Any move can be bound to an input (J, K, crouching, running, air), so copied moves are playable
- **training** (play): frame meter (startup / active / recovery / hitstun / hit stop per frame), input display in numpad notation, record your inputs and let the dummy replay them
- **grid testing**: 1/3/5 seeds per cell with averaged hits / whiffs / frozen %, sort cells by a metric, **collision test** (every hitTest mode × three fights); gallery moves can hit a dummy, whiff, or face the AI
- **settings undo**: sliders, presets, group buttons and grid picks are undoable with ⌘Z, on the same stack as character edits; clicking a sweep or breed cell also applies its values (Shift+click only focuses)
- **scrub** (top bar, M): mouse left/right sets the time in any view; the seeded fights are re-simulated to that moment

Every setting has a hover tooltip; each group's ⓘ explains it and lists its keys. `?` in the top bar shows all keys.

Everything is drawn in code; the only asset is `fonts/icons.woff2`, a subset of [Material Symbols](https://github.com/google/material-design-icons) (Apache License 2.0). Icons are written as `:name:` in labels and tooltips (arrows ← → ↑ ↓ become icons too); after adding a name to `ICONS` in `src/ui.js`, rebuild the subset with `python tools/icons.py MaterialSymbolsOutlined.ttf` (needs fonttools + brotli).
