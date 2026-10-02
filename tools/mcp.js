#!/usr/bin/env node
// stick2 as an MCP server (Model Context Protocol): run fights, read and change settings and characters, check moves, replays, pictures.
// The stdio transport, written by hand (no dependencies): JSON-RPC 2.0, one message per line on stdin / stdout; logs go to stderr only.
// usage: node tools/mcp.js   (register: claude mcp add --scope project stick2 -- node tools/mcp.js; see docs/mcp.md)
const fs = require('fs'), path = require('path'), readline = require('readline');
console.log = console.info = console.debug = console.error; // stdout carries the protocol: nothing else may print there (the engine shares this console)
const S = require('./session')(), schemas = require('./schemas');
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

// ---------- tools: name → { d: description, p: properties (JSON Schema), req: required, run(args) → value | { content } } ----------
const str = d => ({ type: 'string', description: d }), num = d => ({ type: 'number', description: d }), int = d => ({ type: 'integer', description: d });
const bool = d => ({ type: 'boolean', description: d }), obj = d => ({ type: 'object', description: d }), arr = (d, items = {}) => ({ type: 'array', description: d, items });
const EVENTS = { type: ['object', 'boolean'], description: 'Which events to list (false: none). { types: ["hit", "move", …] (types or kinds: input, move, hit, defence, throw, fall, state, movement, item, meta, combo, say …), who: fighter id, from / to: frames, limit (default 40) }. eventCounts always has the totals.',
  properties: { types: arr('event types or kinds', { type: 'string' }), who: int('fighter id'), from: int('first frame'), to: int('last frame'), limit: int('at most this many (default 40)') } };

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

  // ---------- settings ----------
  list_settings: { d: 'The settings (every tunable of the engine), by group. Without group: the groups and their keys. With group: each setting\'s default, current value, range or options and what it does.',
    p: { group: str('a group title, e.g. Movement, Air, Hits, Combos, Guard, Throws, Specials, Power, Plane, Weapons, Juice') }, run: a => S.call('listSettings', a.group) },
  get_settings: { d: 'The current settings: those changed from the defaults, and all of them.', run: () => S.call('getSettings') },
  set_settings: { d: 'Change settings for this session (simulate, run_checks, rendering use them). Each value is checked against its spec (type, range, options); one bad value rejects the whole call.',
    p: { values: obj('{ key: value }, e.g. { "hitstop": 0.1, "plane": "belt" }') }, req: ['values'], run: a => S.call('setSettings', a.values) },
  reset_settings: { d: 'Every setting back to its default.', run: () => S.call('resetSettings') },

  // ---------- fights ----------
  list_scenarios: { d: 'The scenarios: built-in and from a loaded profile. Each with its controllers (human / ai / dummy / script), period, characters and the settings it brings. The shape: stick2://schema/scenario.', run: () => S.call('listScenarios') },
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
};

// ---------- resources: the docs and the data shapes ----------
const DOCS = path.join(S.ROOT, 'docs');
function resources() {
  const docs = fs.readdirSync(DOCS).filter(f => f.endsWith('.md')).map(f => ({ uri: `stick2://docs/${f}`, name: `docs/${f}`, mimeType: 'text/markdown',
    description: (fs.readFileSync(path.join(DOCS, f), 'utf8').match(/^# (.+)/m) || [, f])[1] }));
  return [...docs,
    { uri: 'stick2://schema/settings', name: 'settings schema', mimeType: 'application/json', description: 'Every setting: groups [title, about, keys] then { k, v (default), min, max, step | opts, tip }' },
    { uri: 'stick2://schema/character', name: 'character schema', mimeType: 'application/json', description: 'The shape of a character definition: bones, poses, moves, keys' },
    { uri: 'stick2://schema/scenario', name: 'scenario schema', mimeType: 'application/json', description: 'The shape of a scenario and of script / macro steps' }];
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

// stdin closed: the client is gone; answer what is still running, then exit (the exit handlers kill Chrome)
let busy = 0, closed = false;
const done = () => { if (closed && !busy) process.exit(0); };
readline.createInterface({ input: process.stdin }).on('line', l => { busy++; line(l).catch(e => console.error(e)).finally(() => { busy--; done(); }); })
  .on('close', () => { closed = true; done(); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0)); // exit handlers kill Chrome
console.error(`stick2 MCP server ready (engine v${S.version}, ${Object.keys(TOOLS).length} tools)`);
