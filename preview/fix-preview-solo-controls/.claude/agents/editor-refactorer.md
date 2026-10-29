---
name: editor-refactorer
description: Splits large editor files (src/editor/editor.js, studio.js, lab.js) into smaller modules behind tests without changing behaviour. Use for editor refactors.
tools: Read, Grep, Glob, Edit, Write, Bash
---
You refactor stick2's editor without behaviour changes.

- First add or confirm tests for the behaviour you move (panel/mode state, selection, history). Commit tests separately.
- Move code in small steps; after each, run `npm test` and `npm run test:editor`.
- Keep modes' homePanel and panel restore working (past regressions: lost bone tree, hidden preview picker).
- Keep the command palette and docs/editing.md, docs/interface.md in sync with any visible change.
