#!/usr/bin/env node
// stick2 as an MCP server (Model Context Protocol): run fights, read and change settings and characters, check moves, replays, pictures.
// The stdio transport, written by hand (no dependencies): JSON-RPC 2.0, one message per line on stdin / stdout; logs go to stderr only.
// usage: node tools/mcp.js [--serve PORT]   (register: claude mcp add --scope project stick2 -- node tools/mcp.js; see docs/mcp.md)
const fs = require('fs'), path = require('path'), readline = require('readline');
console.log = console.info = console.debug = console.error; // stdout carries the protocol: nothing else may print there (the engine shares this console)
const S = require('./session')(), schemas = require('./schemas'), render = require('./render'), serve = require('./serve');
const { execFileSync } = require('child_process');
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const OUT = path.join(S.ROOT, 'out');

// ---------- git tools: asset files only, never source - see git_status/git_diff/git_commit below ----------
const CODE_DIRS = ['src', 'tools', 'tests', 'docs', '.github', 'fonts'];
// resolves and checks a path: inside the repo, and not a code directory (character/profile/replay exports, usually
// under out/, are fine; src/tools/tests/docs/fonts are not, so an AI calling these tools can never touch source)
function assetPath(p) {
  const abs = path.resolve(S.ROOT, p), rel = path.relative(S.ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`"${p}" is outside the repo`);
  if (CODE_DIRS.includes(rel.split(path.sep)[0])) throw new Error(`"${p}" is a code path: git tools only touch assets (character/profile/replay exports, usually under out/), never source`);
  return rel;
}
function git(...args) { return execFileSync('git', args, { cwd: S.ROOT, encoding: 'utf8' }); }
function gitStatus() {
  // -uall: without it, git collapses a whole ignored/untracked directory (out/) into one "!! out/" line instead of listing files in it
  // --ignored: out/ (where most asset exports land) is gitignored, so a freshly saved profile never shows without it;
  // narrowed to .json here (not gif/png noise already in out/) since that's what save_profile/replay_export write
  const lines = git('status', '--porcelain', '--ignored', '-uall').split('\n').filter(Boolean); // not .trim() first: that eats the first line's leading status char
  const files = lines.map(l => ({ status: l.slice(0, 2).trim(), path: l.slice(3) }))
    .filter(f => f.path.endsWith('.json') && (() => { try { assetPath(f.path); return true; } catch { return false; } })());
  return { clean: files.length === 0, files };
}

// ---------- tools: name → { d: description, p: properties (JSON Schema), req: required, run(args) → value | { content } } ----------
const str = d => ({ type: 'string', description: d }), num = d => ({ type: 'number', description: d }), int = d => ({ type: 'integer', description: d });
const bool = d => ({ type: 'boolean', description: d }), obj = d => ({ type: 'object', description: d }), arr = (d, items = {}) => ({ type: 'array', description: d, items });
const EVENTS = { type: ['object', 'boolean'], description: 'Which events to list (false: none). { types: ["hit", "move", …] (types or kinds: input, move, hit, defence, throw, fall, state, movement, item, meta, combo, say …), who: fighter id, from / to: frames, limit (default 40) }. eventCounts always has the totals.',
  properties: { types: arr('event types or kinds', { type: 'string' }), who: int('fighter id'), from: int('first frame'), to: int('last frame'), limit: int('at most this many (default 40)') } };
const SIZE = { w: int('width px (default 640, at most 1600)'), h: int('height px (default 360, at most 900)') };
const LOOK = { full: bool('the whole arena (default false: the camera follows the fighters, as in play)'), hud: bool('health bars, callouts and hit counters (default true)'),
  boxes: bool('hurtboxes and active hitboxes'), zoom: num('camera zoom on the arena (1 = whole arena width; 2 = twice as close), with x'), x: num('world x the zoomed camera looks at (the stage is 800 wide)'),
  hudPos: { type: 'string', enum: ['body', 'top'], description: 'Where health/stun bars draw (default: the hudPos setting): over each fighter\'s head, or together at the top of the screen' },
  hudNames: bool('with hudPos top: each fighter\'s character name under their health bar (default: the hudNames setting)') };
const replayOf = a => a.replay ? (typeof a.replay === 'string' ? JSON.parse(a.replay) : a.replay) : a.simulation ? S.sim(a.simulation).replay : (() => { throw new Error('give a simulation id (from simulate or replay_import) or a replay'); })();
const size = a => ({ w: Math.max(16, Math.min(1600, a.w ?? 640)), h: Math.max(16, Math.min(900, a.h ?? 360)) });
const look = a => Object.fromEntries(['full', 'hud', 'boxes', 'zoom', 'x', 'renderer', 'hudPos', 'hudNames'].filter(k => a[k] !== undefined).map(k => [k, a[k]]));
const image = (png, extra) => ({ content: [{ type: 'image', data: png, mimeType: 'image/png' }, ...extra ? [{ type: 'text', text: JSON.stringify(extra, null, 2) }] : []] });
let bridge = null;
const startBridge = async port => {
  if (!bridge) bridge = await serve(port, { version: String(S.version) });
  return { url: bridge.url, pages: bridge.pages(), note: bridge.pages() ? 'a page is connected' : `open ${bridge.url} in a browser: the app connects on its own (src/bridge.js)` };
};
const needBridge = () => bridge || (() => { throw new Error('the bridge is not running: call start_bridge (or run node tools/mcp.js --serve PORT), then open the app from it'); })();

const TOOLS = {
  // ---------- characters ----------
  list_characters: { d: 'The characters: built-in and made or edited in this session, with bone and move counts, stances, a held weapon and the stats that differ from 1.', run: () => S.call('listCharacters') },
  get_character: { d: 'A character\'s whole definition (JSON: bones, poses, moves, hurt poses, binds, stances, stats). The shape: resource stick2://schema/character.', p: { name: str('character name') }, req: ['name'],
    run: a => S.call('getCharacter', a.name) },
  list_moves: { d: 'A character\'s moves with frame data (startup / active / recovery frames at 60 fps, at the attackSpeed setting × its tempo), damage, height, knockback, flags, combo links and the input slots that play each.',
    p: { char: str('character name'), speed: num('attack speed for the frame data (default: the attackSpeed setting × the character\'s tempo)') }, req: ['char'], run: a => S.call('listMoves', a.char, a.speed) },
  create_character: { d: 'Add a character from a definition (see stick2://schema/character; get_character gives one to start from). It is checked by compiling it: a broken one changes nothing. A taken name gets a number unless replace is true.',
    p: { def: obj('the character definition'), replace: bool('replace a character of the same name (built-ins too, for this session)') }, req: ['def'], run: a => S.call('createCharacter', a.def, !!a.replace) },
  edit_character: { d: 'Change a character with a JSON merge patch of its definition: objects merge, null deletes a key, anything else replaces. bones may be patched by id: { bones: { thighF: { len: 30 }, tail: { parent: "waist", len: 20, role: "tail" }, horn: null } }. Checked by compiling; a broken result changes nothing.',
    p: { name: str('character name'), patch: obj('merge patch of the definition') }, req: ['name', 'patch'], run: a => S.call('editCharacter', a.name, a.patch) },
  edit_move: { d: 'Set, merge into or delete one move of a character (move shape: stick2://schema/character → move, key). Returns its new frame data.',
    p: { char: str('character name'), name: str('move name'), move: { type: ['object', 'null'], description: 'the move (null deletes it)' }, merge: bool('merge-patch the existing move instead of replacing it') }, req: ['char', 'name', 'move'],
    run: a => S.call('editMove', a.char, a.name, a.move, !!a.merge) },
  delete_character: { d: 'Remove a custom character, or disable a built-in (hidden from \'random\' picks and lists as disabled; enable_character or revert_character brings it back).', p: { name: str('character name') }, req: ['name'], run: a => S.call('deleteCharacter', a.name) },
  enable_character: { d: 'Bring a disabled built-in back (undoes delete_character on it) without touching any edits it has.', p: { name: str('built-in character name') }, req: ['name'], run: a => S.call('enableCharacter', a.name) },
  revert_character: { d: 'Undo all edits to a built-in character back to how it ships, and re-enable it if disabled.', p: { name: str('built-in character name') }, req: ['name'], run: a => S.call('revertCharacter', a.name) },
  rename_character: { d: 'Rename a character made or edited this session (a built-in keeps its own name and stays as shipped; renaming makes an edited copy under the new name instead).', p: { from: str('current name'), to: str('new name') }, req: ['from', 'to'], run: a => S.call('renameCharacter', a.from, a.to) },
  undo_character: { d: 'Undo the last create_character, edit_character or edit_move (one shared stack, most recent first). Undoing a create removes the character entirely.', run: () => S.call('undoCharacter') },
  redo_character: { d: 'Redo what undo_character undid, if nothing has changed since.', run: () => S.call('redoCharacter') },

  // ---------- settings ----------
  list_settings: { d: 'The settings (every tunable of the engine), by group. Without group: the groups and their keys. With group: each setting\'s default, current value, range or options and what it does.',
    p: { group: str('a group title, e.g. Movement, Air, Hits, Combos, Guard, Throws, Specials, Power, Plane, Weapons, Juice') }, run: a => S.call('listSettings', a.group) },
  get_settings: { d: 'The current settings: those changed from the defaults, and all of them.', run: () => S.call('getSettings') },
  set_settings: { d: 'Change settings for this session (simulate, run_checks, rendering use them). Each value is checked against its spec (type, options; numbers any finite value, with a warning outside the usual range); one bad value rejects the whole call.',
    p: { values: obj('{ key: value }, e.g. { "hitstop": 0.1, "plane": "belt" }') }, req: ['values'], run: a => S.call('setSettings', a.values) },
  reset_settings: { d: 'Every setting back to its default.', run: () => S.call('resetSettings') },

  // ---------- fights ----------
  list_scenarios: { d: 'The scenarios: built-in and from a loaded profile. Each with its controllers (human / ai / dummy / script), period, characters and the settings it brings. The shape: stick2://schema/scenario.', run: () => S.call('listScenarios') },
  create_scenario: { d: 'Save a new reusable "my scenario" (see stick2://schema/scenario; list_scenarios shows one to start from). Checked by building a fight from it: a broken one changes nothing. A taken name gets a number unless replace is true. It shows up in list_scenarios and simulate\'s scenario param right away.',
    p: { scen: obj('the scenario (stick2://schema/scenario); controllers may be macro text'), name: str('name (default "scenario")'), replace: bool('replace a scenario of the same name (built-ins too, for this session)') }, req: ['scen'],
    run: a => S.call('createScenario', a.scen, a.name, !!a.replace) },
  edit_scenario: { d: 'Change a "my scenario" with a JSON merge patch of its definition (objects merge, null deletes a key, anything else replaces). Only scenarios you made or loaded can be edited, not built-ins. Checked the same way as create_scenario.',
    p: { name: str('scenario name'), patch: obj('merge patch of the scenario') }, req: ['name', 'patch'], run: a => S.call('editScenario', a.name, a.patch) },
  delete_scenario: { d: 'Remove a "my scenario" (built-ins can\'t be removed).', p: { name: str('scenario name') }, req: ['name'], run: a => S.call('deleteScenario', a.name) },
  rename_scenario: { d: 'Rename a "my scenario" (built-ins can\'t be renamed).', p: { from: str('current name'), to: str('new name') }, req: ['from', 'to'], run: a => S.call('renameScenario', a.from, a.to) },
  simulate: { d: 'Run a fight headless and sum it up: outcome (ko, double ko, period, time) and winner, K.O. frame and time, each fighter\'s end state, stats per fighter (damage dealt, hits, blocks, parries, throws, best combo), the events (filterable), the end state hash (the same seed and inputs always give the same hash). The fight is kept under an id for replay_export, render_frame and render_gif. Fights are deterministic: seed picks the AI\'s choices.',
    p: { scenario: str('a scenario name (list_scenarios)'), scen: obj('a scenario as JSON instead (stick2://schema/scenario); controllers may be macro text'), name: str('a name for a JSON scenario'),
      chars: arr('character names per fighter slot, the last fills the rest (default: the scenario\'s, else stick)', { type: 'string' }), seed: int('random seed (default 1)'),
      frames: int('at most this many frames at 60 fps (default 3600 = 60 s, at most 36000); a K.O. or the scenario\'s period ends it sooner'),
      cfg: obj('setting overrides for this fight only, over the session settings'), inputs: str('P1 plays this macro (P1 becomes the human): "0.2, 6, 6, P, 0.3, 2K" (numpad directions relative to the foe, P K S G, waits with a dot, hold up 0.2)'),
      events: EVENTS, replay: bool('include the replay file (JSON) in the answer') },
    run: a => { if (!a.scenario && !a.scen) throw new Error('give a scenario name or scen');
      return S.simulate({ ...a, frames: Math.max(1, Math.min(36000, a.frames ?? 3600)) }); } },
  run_checks: { d: 'The move matrix (the app\'s tests view): each move against a target in every state (standing, crouching, guarding high and low, in the air, on the floor, dizzy; facing it or turned away; near and far) and whether what happens is what should (hit / block / whiff). Returns the failing cells with why; outs has one letter per column (h hit, b block, w whiff, s skip). A character\'s every attack takes a minute or two: each call checks moves until its time budget runs out and lists the rest.',
    p: { char: str('character name'), move: str('one move'), moves: arr('these moves (default: every attack of the character)', { type: 'string' }), opp: str('the target character (default: the same one)'),
      all: bool('list every cell, not only the failing ones'), seconds: num('time budget (default 25): moves left unchecked are listed, to check in another call') }, req: ['char'],
    run: a => S.runChecks({ ...a, all: !!a.all }) },

  // ---------- replays and profiles ----------
  replay_export: { d: 'A kept fight (simulation id) as a replay file: the app\'s format, JSON. The app opens it in the replay tab (or send it there with browser_command open_replay); save it with path.',
    p: { simulation: str('simulation id'), path: str('also write it to this file (relative to the repo)') }, req: ['simulation'],
    run: a => { const r = S.sim(a.simulation).replay; if (a.path) { fs.mkdirSync(path.dirname(S.file(a.path)), { recursive: true }); fs.writeFileSync(S.file(a.path), JSON.stringify(r)); } return r; } },
  replay_import: { d: 'Play a replay file (from the app or replay_export) and sum it up like simulate, with desync: the first frame that came out differently from the recording (null = in sync). A replay is pinned to the engine version it was recorded with. It is kept under a new id.',
    p: { json: { type: ['object', 'string'], description: 'the replay (JSON object or text)' }, path: str('or a file (relative to the repo)'), events: EVENTS }, run: a => S.importReplay(a) },
  load_profile: { d: 'Load a file the app exported: "everything" (edited characters, settings, my scenarios), settings, or a character file. Characters are checked first (one broken: nothing loads); settings go over the defaults, bad ones are listed.',
    p: { path: str('the file (relative to the repo)') }, req: ['path'], run: a => S.loadProfile(a.path) },
  save_profile: { d: 'Save the session as an app "everything" file (characters made or edited here, changed settings, scenarios): the app loads it with import → everything.',
    p: { path: str('the file (relative to the repo), e.g. out/profile.json') }, req: ['path'], run: a => S.saveProfile(a.path) },

  // ---------- git: asset files only (character/profile/replay exports), never source - no wildcards, you name every file ----------
  git_status: { d: 'Working-tree status for asset files only (never src/tools/tests/docs): new, modified or deleted, like `git status --porcelain`.',
    run: () => gitStatus() },
  git_diff: { d: 'The working-tree diff of one asset file (not staged, not a code path). A new file (not yet tracked - most asset exports live under out/, which is gitignored until you commit one) has no diff to show; this says so instead of returning nothing.',
    p: { path: str('the file, relative to the repo') }, req: ['path'],
    run: a => {
      const p = assetPath(a.path);
      if (!fs.existsSync(path.resolve(S.ROOT, p))) throw new Error(`"${p}" does not exist`);
      let tracked = true; try { git('ls-files', '--error-unmatch', '--', p); } catch { tracked = false; }
      if (!tracked) return { path: p, diff: '(new file, not yet committed: nothing to diff against)' };
      const out = git('diff', '--', p);
      return { path: p, diff: out || '(no changes)' };
    } },
  git_commit: { d: 'Stage and commit specific asset files (never src/tools/tests/docs; no wildcards, you name every file). Most asset exports live under out/, which is gitignored - naming one here force-adds it (a deliberate, explicit choice, not a wildcard), and it stays tracked after. Refuses if any named file is a code path or outside the repo - nothing is committed unless every one checks out.',
    p: { files: arr('files to commit, relative to the repo', { type: 'string' }), message: str('the commit message') }, req: ['files', 'message'],
    run: a => {
      if (!a.files?.length) throw new Error('name at least one file');
      const paths = a.files.map(assetPath);
      for (const p of paths) if (!fs.existsSync(path.resolve(S.ROOT, p))) throw new Error(`"${p}" does not exist`);
      git('add', '-f', '--', ...paths);
      const log = git('commit', '-m', a.message, '--', ...paths);
      return { committed: paths, message: a.message, log: log.trim() };
    } },

  // ---------- pictures ----------
  render_frame: { d: 'A picture of a fight at a frame (0 = the start), as the app draws it. PNG from headless Chrome (found on its own, CHROME overrides); without Chrome, or with renderer "svg", SVG text drawn by the engine into a recording context.',
    p: { simulation: str('simulation id'), replay: { type: ['object', 'string'], description: 'or a replay' }, frame: int('frame number (default 0)'), frames: arr('several frames at once (at most 12)', { type: 'integer' }),
      ...SIZE, ...LOOK, renderer: { type: 'string', enum: ['auto', 'chrome', 'svg'], description: 'auto (default): Chrome when found, else SVG' } },
    run: async a => {
      const list = (a.frames || [a.frame ?? 0]).slice(0, 12), { w, h } = size(a), shots = await render.frames(S, replayOf(a), list, w, h, look(a));
      if (shots[0].svg) return { content: shots.map(s => ({ type: 'text', text: s.svg })) };
      return { content: shots.map(s => ({ type: 'image', data: s.png, mimeType: 'image/png' })) };
    } },
  frame_state: { d: 'Numeric per-fighter state at a frame of a kept fight, no rendering: position, facing, hp, combo count, the move running (name and its frame within it), and frameState\'s category (idle, startup, active, recovery, cancel, block, hit, dizzy, down, stop, air, move). For inspecting why a hit did or didn\'t land without reading a picture.',
    p: { simulation: str('simulation id'), replay: { type: ['object', 'string'], description: 'or a replay' }, frame: int('frame number (default 0)') },
    run: a => S.call('frameSnapshot', replayOf(a), a.frame ?? 0) },
  render_gif: { d: 'A looping GIF of a fight from frame to frame, written to out/ (needs Chrome). Returns its path and a PNG of the first frame.',
    p: { simulation: str('simulation id'), replay: { type: ['object', 'string'], description: 'or a replay' }, from: int('first frame (default 0)'), to: int('last frame (default: the end, at most from + 1200)'),
      fps: num('frames per second (default 20; the engine runs at 60)'), ...SIZE, ...LOOK, file: str('file name in out/ (default <simulation>-<from>-<to>.gif)') },
    run: async a => {
      const r = replayOf(a), from = Math.max(0, a.from ?? 0), to = Math.min(a.to ?? r.frames.length, r.frames.length, from + 1200), { w, h } = size({ w: a.w ?? 480, h: a.h ?? 270 });
      const name = path.basename(a.file || `${a.simulation || 'replay'}-${from}-${to}.gif`), file = path.join(OUT, name.endsWith('.gif') ? name : name + '.gif');
      const g = await render.gif(S, r, { from, to, fps: Math.max(1, Math.min(60, a.fps ?? 20)), w, h, file, ...look(a) });
      return image(g.first, { path: g.path, frames: g.frames, bytes: g.bytes });
    } },

  // ---------- sounds, looks, tracker: cosmetic only (never read by the simulation); no play/render tool, there is no speaker on this end ----------
  list_sounds: { d: 'Every sound (synthesized, no files): the 4 built-ins and any custom ones, with their full preset (noise/tone layers, gain, resonance, detune, attack, duration). The shape: a save_sound preset.', run: () => S.call('listSounds') },
  save_sound: { d: 'Create or tune a sound with a JSON merge patch over its current preset (a built-in\'s shipped values, an existing custom one, or whoosh\'s shape for a brand new name). Fields: noise (bandpass|lowpass|highpass|none), nf0, nf1 (Hz), ngain (0-1), q (resonance, default 1), tone (sine|square|sawtooth|triangle|none), tf0, tf1 (Hz), tgain (0-1), detune (cents, default 0), attack (s, default 0), dur (s, required on a brand new sound). Checked field by field; a bad one changes nothing. Appears anywhere a sound is picked (a move\'s key events, a track\'s rows).',
    p: { name: str('sound name (a built-in\'s name tunes an override of it)'), patch: obj('merge patch of the preset') }, req: ['name', 'patch'], run: a => S.call('saveSound', a.name, a.patch) },
  reset_sound: { d: 'A built-in: back to its shipped values. A custom one: deleted entirely.', p: { name: str('sound name') }, req: ['name'], run: a => S.call('resetSound', a.name) },
  rename_sound: { d: 'Rename a custom sound (built-ins can\'t be renamed).', p: { from: str('current name'), to: str('new name') }, req: ['from', 'to'], run: a => S.call('renameSound', a.from, a.to) },

  list_looks: { d: 'Every fx look: built-ins (fire, aura, lightning…) are hand-coded drawing, shown as { builtin: true } with no data; custom ones are a generic particle preset. The shape: a save_look preset.', run: () => S.call('listLooks') },
  save_look: { d: 'Create or tune a custom look with a JSON merge patch (a simple rising-dots default for a brand new name; built-ins can\'t be patched, pick a new name instead). Fields: count, life (s), speed (px/s), spread (deg), angle (deg, -90 = up), gravity (px/s²), size0, size1 (start/end size), shape (dot|line|ring), col (a colour name, e.g. cyan, gold; default white), back (true: draws behind the body, like aura). Checked field by field. Appears anywhere a look is picked (a move or key\'s fx).',
    p: { name: str('look name'), patch: obj('merge patch of the preset') }, req: ['name', 'patch'], run: a => S.call('saveLook', a.name, a.patch) },
  delete_look: { d: 'Remove a custom look (built-ins can\'t be).', p: { name: str('look name') }, req: ['name'], run: a => S.call('deleteLook', a.name) },
  rename_look: { d: 'Rename a custom look (built-ins can\'t be renamed).', p: { from: str('current name'), to: str('new name') }, req: ['from', 'to'], run: a => S.call('renameLook', a.from, a.to) },

  list_tracks: { d: 'Every tracker track: tempo, step count and rows (each a sound name and its on/off beats). The shape: a save_track preset.', run: () => S.call('listTracks') },
  save_track: { d: 'Create or edit a track with a JSON merge patch (a bare 16-step, no-rows track for a brand new name). Fields: bpm (> 0), steps (8, 16 or 32 — changing it resizes every row\'s cells, keeping what fits), rows ([{ sound: a name from list_sounds, cells: one boolean per step }]). Checked field by field; a bad one changes nothing. There is no play tool: this is for building the pattern, not hearing it (no speaker over MCP).',
    p: { name: str('track name'), patch: obj('merge patch: { bpm, steps, rows }') }, req: ['name', 'patch'], run: a => S.call('saveTrack', a.name, a.patch) },
  delete_track: { d: 'Remove a tracker track entirely.', p: { name: str('track name') }, req: ['name'], run: a => S.call('deleteTrack', a.name) },
  rename_track: { d: 'Rename a tracker track.', p: { from: str('current name'), to: str('new name') }, req: ['from', 'to'], run: a => S.call('renameTrack', a.from, a.to) },

  // ---------- the live bridge: the app open in a browser ----------
  start_bridge: { d: 'Serve the app over HTTP on 127.0.0.1 and wait for it to be opened: the page then takes commands from browser_state / browser_command (src/bridge.js). Same as starting with --serve PORT.',
    p: { port: int('port (default 0: a free one)') }, run: a => startBridge(a.port ?? 0) },
  browser_state: { d: 'What the app open in the browser shows: mode (tab), play scenario, the character being edited and its definition, changed settings, my scenarios, the replay tab\'s reel.', run: () => needBridge().command('state') },
  browser_command: { d: 'Drive the app open in the browser. Commands: set_settings { values }, set_scenario { name } (the play tab fights it), import_character { def } (added and picked), open_replay { replay } or { simulation } (opens it in the replay tab), screenshot (the canvas as PNG), set_mode { mode } (switch tabs), pick_character { name } (the one every mode edits), delete_character { name } (a custom character, or disables a built-in) / enable_character { name } (undoes that disable) / rename_character { from, to } (no confirmation prompt, unlike the UI), set_preview { scenario?, opponent?, control? } (the character tab\'s live preview; needs that tab open), send_to_play { scenario?, opponent? } (jump to Play with a matchup, default: the character tab\'s own preview), undo / redo (the same stack as ⌘Z: character edits, settings, replay/movie/scene edits alike), pose_scene { fighter (0|1), bone, angle } or { fighter, preset } (the replay tab\'s scene editor: pose by exact bone angle, or apply a saved/built-in preset pose), reset_pose, snapshot_pose { fighter, name } (save the fighter\'s current pose as a preset, shared with the animate editor\'s own preset-pose picker), place_prop { type, x, lift?, a? } / move_prop { index, x?, lift?, a? } / delete_prop { index }, clear_scene, branch_from { side (1|2) } (play on live from the playhead as that side - "continue the fight from here").',
    p: { name: { type: 'string', enum: ['state', 'set_settings', 'set_scenario', 'import_character', 'open_replay', 'screenshot', 'set_mode', 'pick_character', 'delete_character', 'enable_character', 'rename_character', 'set_preview', 'send_to_play', 'undo', 'redo',
      'pose_scene', 'reset_pose', 'snapshot_pose', 'place_prop', 'move_prop', 'delete_prop', 'clear_scene', 'branch_from'] }, args: obj('the command\'s arguments') }, req: ['name'],
    run: async a => {
      const args = { ...a.args };
      if (a.name === 'open_replay' && args.simulation) { args.replay = S.sim(args.simulation).replay; args.name ??= args.simulation; delete args.simulation; }
      const r = await needBridge().command(a.name, args);
      return a.name === 'screenshot' ? image(r.png.slice(r.png.indexOf(',') + 1)) : r;
    } },
  // this session and an open bridge tab are two separate character stores (one in this process, one in the browser);
  // these two move one character between them explicitly, rather than keeping them automatically in sync
  push_to_browser: { d: 'Send a character (built-in or made/edited this session) to the bridge-connected browser tab, overwriting a same-named one there first (a built-in there can\'t be overwritten, so a name clash gets a number instead, like a normal import). Needs start_bridge and an open tab.',
    p: { name: str('character name (list_characters)') }, req: ['name'],
    run: async a => {
      const def = S.call('getCharacter', a.name);
      await needBridge().command('delete_character', { name: a.name }).catch(() => {});
      return needBridge().command('import_character', { def });
    } },
  pull_from_browser: { d: 'Bring the character currently being edited in the bridge-connected browser tab into this session (so list_characters, get_character, simulate etc. see it), overwriting a same-named one here. Needs start_bridge and an open tab.',
    run: async () => { const st = await needBridge().command('state'); return S.call('createCharacter', st.def, true); } },
  // ---------- discovery ----------
  search_tools: { d: 'Find tools by a word or two, matched against their name and description - for when you know roughly what you want but not its exact name (over 50 tools exist; tools/list shows all of them but isn\'t searchable).',
    p: { q: str('a word or short phrase, e.g. "camera shake" or "disable character"') }, req: ['q'],
    run: a => {
      const q = a.q.toLowerCase().trim(), terms = q.split(/\s+/).filter(Boolean);
      const hits = Object.entries(TOOLS).map(([name, t]) => {
        const hay = `${name} ${t.d}`.toLowerCase(), hit = terms.every(w => hay.includes(w));
        return hit ? { name, description: t.d, params: Object.keys(t.p || {}) } : null;
      }).filter(Boolean);
      return hits.length ? hits : { found: 0, tip: 'No match - try fewer or more general words, or see tools/list for the full set.' };
    } },
};

// ---------- resources: the docs and the data shapes ----------
const DOCS = path.join(S.ROOT, 'docs');
function resources() {
  const docs = fs.readdirSync(DOCS).filter(f => f.endsWith('.md')).map(f => ({ uri: `stick2://docs/${f}`, name: `docs/${f}`, mimeType: 'text/markdown',
    description: (fs.readFileSync(path.join(DOCS, f), 'utf8').match(/^# (.+)/m) || [, f])[1] }));
  return [...docs,
    { uri: 'stick2://schema/settings', name: 'settings schema', mimeType: 'application/json', description: 'Every setting: groups [title, about, keys] then { k, v (default), min, max, step | opts, tip }' },
    { uri: 'stick2://schema/character', name: 'character schema', mimeType: 'application/json', description: 'The shape of a character definition: bones, poses, moves, keys' },
    { uri: 'stick2://schema/scenario', name: 'scenario schema', mimeType: 'application/json', description: 'The shape of a scenario and of script / macro steps' },
    { uri: 'stick2://schema/sound', name: 'sound schema', mimeType: 'application/json', description: 'The shape of a sound preset (save_sound)' },
    { uri: 'stick2://schema/look', name: 'look schema', mimeType: 'application/json', description: 'The shape of a custom fx look preset (save_look)' },
    { uri: 'stick2://schema/track', name: 'track schema', mimeType: 'application/json', description: 'The shape of a tracker track (save_track)' }];
}
function readResource(uri) {
  const m = /^stick2:\/\/(docs|schema)\/(.+)$/.exec(uri), json = o => JSON.stringify(o, null, 2);
  if (m?.[1] === 'docs' && /^[\w.-]+\.md$/.test(m[2]) && fs.existsSync(path.join(DOCS, m[2]))) return { uri, mimeType: 'text/markdown', text: fs.readFileSync(path.join(DOCS, m[2]), 'utf8') };
  if (m?.[1] === 'schema' && m[2] === 'settings') return { uri, mimeType: 'application/json', text: S.run('JSON.stringify(SCHEMA, null, 1)') };
  if (m?.[1] === 'schema' && schemas[m[2]]) return { uri, mimeType: 'application/json', text: json(schemas[m[2]]) };
  throw Object.assign(new Error(`no resource ${uri}`), { code: -32002 });
}

// ---------- JSON-RPC ----------
const listTools = () => Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.d,
  inputSchema: { type: 'object', properties: t.p || {}, ...(t.req ? { required: t.req } : {}), additionalProperties: false } }));
// the arguments against the tool's schema: required ones, unknown ones, the basic types
function checkArgs(t, a) {
  const bad = [], p = t.p || {}, type = v => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
  for (const k of t.req || []) if (a[k] === undefined) bad.push(`${k} is required`);
  for (const [k, v] of Object.entries(a)) {
    if (!p[k]) { bad.push(`unknown argument ${k} (takes ${Object.keys(p).join(', ') || 'none'})`); continue; }
    const want = [].concat(p[k].type || []), got = type(v);
    if (want.length && !want.includes(got) && !(got === 'integer' && want.includes('number'))) bad.push(`${k} should be ${want.join(' or ')}, not ${got}`);
    if (p[k].enum && !p[k].enum.includes(v)) bad.push(`${k} is one of ${p[k].enum.join(', ')}`);
  }
  if (bad.length) throw new Error(bad.join('; '));
}
async function callTool(name, a = {}) {
  const t = TOOLS[name];
  if (!t) throw Object.assign(new Error(`unknown tool ${name}`), { code: -32602 });
  try {
    checkArgs(t, a);
    const r = await t.run(a);
    return r?.content ? r : { content: [{ type: 'text', text: JSON.stringify(r ?? null, null, 2) }] };
  } catch (e) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}
const METHODS = {
  initialize: p => ({ protocolVersion: VERSIONS.includes(p?.protocolVersion) ? p.protocolVersion : VERSIONS[0], capabilities: { tools: {}, resources: {} },
    serverInfo: { name: 'stick2', version: `engine-${S.version}` },
    instructions: 'stick2 is a stick-figure fighting game sandbox. Fights are deterministic simulations: simulate a scenario (list_scenarios) with characters (list_characters) and settings (list_settings), then read the stats and events, render frames, or export the replay. The docs are resources (stick2://docs/README.md).' }),
  ping: () => ({}),
  'tools/list': () => ({ tools: listTools() }),
  'tools/call': p => callTool(p?.name, p?.arguments),
  'resources/list': () => ({ resources: resources() }),
  'resources/templates/list': () => ({ resourceTemplates: [] }),
  'resources/read': p => ({ contents: [readResource(p?.uri)] }),
};
const send = m => process.stdout.write(JSON.stringify(m) + '\n');
async function handle(m) {
  if (m && typeof m === 'object' && m.method === undefined && m.id !== undefined) return; // a response: this server sends no requests
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return { jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32600, message: 'invalid request' } };
  const f = METHODS[m.method], note = m.id === undefined; // notifications (no id) get no answer
  if (note) return;
  if (!f) return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `method not found: ${m.method}` } };
  try { return { jsonrpc: '2.0', id: m.id, result: await f(m.params) }; }
  catch (e) { console.error(e.stack || e.message); return { jsonrpc: '2.0', id: m.id, error: { code: e.code || -32603, message: e.message } }; }
}
async function line(text) {
  if (!text.trim()) return;
  let m;
  try { m = JSON.parse(text); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
  if (Array.isArray(m)) { const out = (await Promise.all(m.map(handle))).filter(Boolean); if (out.length) send(out); return; }
  const r = await handle(m);
  if (r) send(r);
}

const arg = process.argv.indexOf('--serve');
if (arg > 0) startBridge(+process.argv[arg + 1] || 0).then(b => console.error(`stick2 bridge: ${b.url}`), e => console.error('bridge: ' + e.message));
// stdin closed: the client is gone; answer what is still running, then exit (the exit handlers kill Chrome)
let busy = 0, closed = false;
const done = () => { if (closed && !busy) process.exit(0); };
readline.createInterface({ input: process.stdin }).on('line', l => { busy++; line(l).catch(e => console.error(e)).finally(() => { busy--; done(); }); })
  .on('close', () => { closed = true; done(); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0)); // exit handlers kill Chrome
console.error(`stick2 MCP server ready (engine v${S.version}, ${Object.keys(TOOLS).length} tools)`);
