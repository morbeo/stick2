# UI standards

[← docs index](README.md)

Rules for controls over the stage and in the side panels, so new tools look and behave like the ones already there. Light theme only.

## Controls over the stage

- **Group related controls in a dock.** A dock is one boxed panel (`.dock`) of labelled rows, built with `dockRow(label, tip, ...controls)` in `src/ui/ui.js`. Examples: the preview docks in animate (compare, target, state, facing, preview) and the character tab (preview, opponent), and the blow dock in experiment's ragdoll impact (blow, power).
- **One row, one subject.** The row label is a short lowercase noun (`target`, `state`), muted, in a fixed 52px column so the controls line up; a row's controls wrap under each other, never under the label. Use `''` for an unlabelled row (a lone action button).
- **Bars stay on one line.** A strip like the timeline bar (`.tlbar`) never wraps. When it runs out of room, drop text and keep the icon, and move the name into the tip (the reach options there are icons only).
- **Anchor to an edge, never float over the figure.** Bars sit at the stage's bottom or side edges. Stage panels (the dopesheet, the move table) dock above the timeline or along an edge so the character stays visible.

## Buttons and toggles

- **Every button has a tip** (`button(label, tip, fn)`), naming what it does and its key if it has one (`keyTip`).
- **Same size inside a group.** Buttons in a dock or bar are mini: 11px text, 18px tall, 6px side padding.
- **Choices are a `seg`, on/off is a `toggle`.** A seg shows the picked option dark. A toggle shows a dot: filled is on.
- **Icon plus word for anything that opens a panel** (`:timeline: dopesheet`), so it can be found without hovering.

## Panels

- **Start compact.** Show the useful part first and put the rest behind a toggle. Example: the dopesheet lists only the bones the move turns until **all bones** is on.
- **Give height limits.** A panel over the stage takes at most about a quarter to a third of the stage height and scrolls inside.
- **Close with ×, Esc or the button that opened it.**

## Checklist for a new control

1. It has a tip and, if it is a feature, a palette entry (`src/ui/palette.js`).
2. It sits in an existing dock, bar or panel section, not on its own.
3. Its docs are updated (the page for its tab, plus the in-app help when it changes how a tab works).
