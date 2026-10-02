# Interface

[← docs index](README.md)

How to find things: the top bar, search, keys, panels and the in-app docs.

## The top bar

![The menu bar with the export menu open](img/menubar.png)

Three rows, the same in every tab:

| Row | What's on it |
|---|---|
| menu bar | the tabs · undo / redo · replay save / play · export / import · search, panel, layout, keys, debug, docs, hints, sound |
| transport | pause, rewind, step back, step, restart, speed, scrub, loop (the same in every mode) |
| toolbar | the mode's own tools in labelled groups, in the same order on every tab: view, what you work on (fight, fighters, moves…), the tab's tools, **show** (overlays), **panels** (tables over the stage: click again, × or Esc closes; each tab keeps its own) |

### Export and import

**export** and **import** each open a small menu:

| Item | What's in the file |
|---|---|
| character | the current character |
| settings | every setting changed from its default (the debug views left out) |
| everything | your edited and new characters, the changed settings, your scenarios and your keys, as one JSON file |

- Importing **everything** asks first.
- A broken character in the file loads nothing.
- Settings out of range fall back to their default.

### Layouts

![The layout popup](img/layout.png)

The layout button (four squares) in the menu bar. Each tab remembers its own layout as you go: which toolbar groups and side sections are shown, which overlays are on, which side sections are folded, which show **more**, and whether the side panel is shown.

| Row or button | Does |
|---|---|
| toolbar | shows or hides each toolbar group of this tab |
| side panel | shows or hides the whole side panel, and each of its sections; hovering a section heading shows a **×** that hides it too |
| overlays | the same overlay toggles as the toolbar's **show** group |
| use | switches to another named layout; changes are kept in the one in use |
| save as… | copies this layout (every tab) under a new name and uses it |
| reset tab | this tab back to how it starts, in this layout |
| reset all | every tab back to how it starts, in this layout |
| delete | deletes the layout in use (not the default) |

The **show** group in the toolbar holds the overlays, always in this order; each tab has the ones that apply to it:

| Toggle | Draws |
|---|---|
| meter | the frame meter (kept per tab) |
| inputs | your inputs in numpad notation, in play (kept per tab) |
| boxes | the hitboxes and hurtboxes (setting `boxes`) |
| ghost | the keyframe pose as a ghost (setting `ghost`) |
| colours | bones coloured by role, in the editors (kept per tab) |
| hud | health and stun bars, dizzy stars, callouts and the hit counter (setting `hud`) |
| labels | each fight's label and stats line (setting `labels`) |

⌘K finds **hide toolbar group: …** and **hide side section: …** (or **show**) for the parts of the tab you are on.

### Debug

![The debug popup](img/debug.png)

The debug button (a chart icon) opens the debug popup, in any tab:

- the **ghost**, **boxes**, **hud** and **labels** switches, and the **scope** bone;
- the build, engine version, frame rate, and the shown fight's seed, frame, state hash and fighters, with **copy** for bug reports;
- **reset settings**: every setting back to its default (⌘Z undoes);
- **factory reset**;
- the **monitor**: the scope bone's target angle (grey) against the drawn one (red), with the fight's stats.

## In-app docs

The docs button (ⓘ) in the top bar opens interactive docs over the app. ⌘K finds them too, and so does **docs** in any panel heading's ⓘ.

- **Guide:** topics with live demo fights: pause, step, restart, or **try it in play**. The demos always run on the default settings and the built-in stick, so your edits can't break them; try it uses yours.
- **Reference:** generated from the app's own tables: every setting group with its defaults, move flags and properties, heights, input slots, easing (an animated curve per curve type), and the keyboard as bound now.
- Everything is searchable.

Links:

| Address | Opens |
|---|---|
| `docs.html` | the docs as a page of their own (same as `index.html#docs`) |
| `docs.html#weapons` | one topic |
| `index.html#mode=animate` | a mode |

## Search

![The command palette](img/palette.png)

### Command palette

⌘K / Ctrl+K, or the magnifier top right. Type to find:

- a mode, a tool on the current toolbar, or a key action;
- a table: the move table, input table and combos (over the character tab there, else in animate), the bone table (in the character tab);
- a layout by name, reset layout, reset settings, factory reset;
- a character, a move (opens it in animate) or a setting (searches the settings panel for it; from the gallery it goes to play).

↑ ↓ pick, Enter runs, Esc closes.

### Settings search

The box at the top of the settings panel: fuzzy search over the variable names and groups; plain text also matches tooltips. Esc clears.

## Keys and macros

The **keys** button (⌨) in the top bar shows every key and lets you rebind them, in groups: fight, transport, view, modes, animate, character. Saved in the browser.

**Macros:** one key presses a sequence such as `2, 3, 6P`: numpad directions + P / K, with waits like `0.1`.

### Keys depend on where you are

| Where | Letters belong to | Shortcuts |
|---|---|---|
| a fight (play, grid) | the fighter | take ⇧: ⇧P pause, ⇧N step, ⇧V rewind, ⇧R restart, ⇧H panel, ⇧B boxes, ⇧G ghost; 1–6 switch modes |
| the editors (gallery, impact, character, animate) | shortcuts | the plain key: P, N, R, H, `,` `.` frame, ⇧← ⇧→ key, Enter play, O onion, I aim, Del delete; fight keys and macros do nothing |

- The keys panel heads each group with its context and marks keys that clash within one.
- Keys never reach the fight while a slider or text field has focus.
- A button clicked with the mouse lets go of focus, so Space doesn't press it again.

## Panels

### Headings

Every heading carries its buttons on the right, in the same place:

- **Things** (character, bones, stance, moves) get their actions always in the same order, with the same icons: new · random · copy · rename · revert · delete · import · export.
- **Groups of variables** get the group buttons (below).
- Panels go from the list to the selected item: character → bones → selected bone → stance → stats → walk; selected move → selected key → character (animate, gallery and tests).
- The settings panel starts with the search, then the presets.
- Settings are saved in the browser as you change them; **reset settings** in the debug popup (or the juicy preset) brings back the defaults.

### Less at once

- Click a heading to fold its section. Folded ones hide their group buttons until hovered.
- Only the section you work in starts open; each one is remembered per mode in the tab's [layout](#layouts).
- Groups show their main variables and keep the rest behind a **more** button (moves: power, knock, launch, stun, damage; bones: len, thick, hurt, lag, stretch; settings: a few per group). A search shows every match, folded or not.
- The character is one button with its drawing, which opens the grid of characters.
- The help line under the view and the frame meter's colour legend show for a few seconds on the first visit to a mode, then only with **hints** (? top right).
- Secondary tools are icon-only buttons with tooltips (transport, panel / keys / hints, the show toggles). Option buttons carry icons too (views, sorts, heights, limbs, targets, presets…).
- Grid's ready-made comparisons sit in one **tests** menu; the input table shows its pads with the full table behind **details**.

### Variable groups

Every group of variables (settings, the selected bone, the move, the selected key) has buttons for all of them at once:

| Button | Does |
|---|---|
| dice | randomize |
| reset | back to defaults (the built-in values) |
| ▲ / ▼ | empower / diminish |
| flask | experiment with them in a grid (settings and bones) |

- Grid experiments (breed, attacks, body) give each cell a distinct value of every varied variable, spread evenly over the range. **exaggerate** ×2 / ×4 makes the differences stand out.
- Every variable's name is a link (dotted underline, a flask on hover). Click it to experiment with that one variable: settings sweep it across the grid; bone properties, stats and walk & idle open nine bodies varying only it.
- Every setting has a hover tooltip; each group's ⓘ explains it and lists its keys.

## Time

- **Pause** shows a large PAUSED sign over the preview.
- **Scrub** (transport, M): move the mouse left / right to set the time in any view. The seeded fights are re-simulated to that moment.
- **Undo** (⌘Z, ⇧⌘Z redo): sliders, presets, group buttons and grid picks, on the same stack as character edits. Clicking a sweep or breed cell also applies its values (Shift+click only focuses).

## Sound

Whooshes, hits, thuds and blocks, synthesized live with WebAudio (no sound files) and panned by where they happen.

- Only in the live fight and the animate preview; rewinds and replays stay silent.
- The sound toggle in the top bar mutes them.

## Factory reset

⌘K **factory reset**, or the debug popup. It asks, then deletes everything stick2 keeps in the browser (edited and custom characters, settings, scenarios, keys and macros, layout and hints) and reloads as on a first visit.

Export **everything** first to keep your work.
