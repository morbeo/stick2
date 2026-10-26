# Drift checks

A weekly automated review opens one GitHub issue labelled `drift` listing anything below that has slipped. If an open `drift` issue already exists it is updated instead of a new one being opened. Edit this file to change what gets checked.

## Workflows (`.github/workflows/`, `.github/actions/`)
- Named `<Area> · <what>`; every job and step has a `name`; `run-name` set.
- Every third-party action pinned to a full SHA with a `# vN` comment, same SHA for the same action everywhere.
- `permissions` declared (top-level `{}` or minimal, widened per job); `timeout-minutes` on every job.
- `concurrency` on workflows triggered by push/PR.
- `actions/setup-node` uses `cache: npm` (with `cache-dependency-path` outside the root); Node version matches the relevant `engines`.
- No duplicate push + pull_request runs for the same branch.
- Steps repeated across workflows are moved into a composite action.
- Each run writes a line to `$GITHUB_STEP_SUMMARY`.
- Untrusted event text (titles, bodies, commit messages) only reaches `run:` via `env:`, never inline `${{ }}`.

## Naming and layout
- `src/` stays grouped into `engine/ net/ editor/ ui/`, `tools/` into `lib/ mcp/ discord/ itch/ render/ dev/`, `tests/` into `unit/ browser/`.
- File and identifier naming consistent with neighbours (kebab-case files, camelCase functions).

## Tests
- Every `src/` module has unit coverage or is loaded by a test; list modules with none.
- Coverage not below the CI floor; new code since the last check has tests.
- No skipped or `.only` tests committed.

## Docs and palette
- Features added since the last check are documented under `docs/` and listed in the command palette.
- Docs don't reference files, flags or workflows that no longer exist.

## Optimisation
- Unused files, exports or dependencies; heavy work repeated per frame; workflow steps that could be skipped or cached.
