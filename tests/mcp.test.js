// the MCP server (tools/mcp.js) over its stdio transport: the protocol, the tools, the resources, rendering
const test = require('node:test'), assert = require('node:assert/strict'), path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const { findChrome } = require('../tools/chrome');

// the server as a child process; rpc(method, params) → the answer's result (or error), call(tool, args) → parsed text / content
function server() {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'mcp.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const wait = new Map(), lines = [];
  let buf = '', id = 0;
  p.stdout.on('data', d => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); lines.push(m); wait.get(m.id)?.(m); wait.delete(m.id); }
  });
  const rpc = (method, params) => new Promise(ok => { wait.set(++id, ok); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const call = async (name, args = {}) => {
    const r = (await rpc('tools/call', { name, arguments: args })).result;
    return { ...r, json: r.content[0].type === 'text' && !r.isError && /^[[{"n\d]/.test(r.content[0].text) ? JSON.parse(r.content[0].text) : null };
  };
  return { p, rpc, call, lines, note: (method, params) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'), close: () => p.stdin.end() };
}
const s = server();
test.after(() => s.close());

test('initialize answers with a supported protocol version, the capabilities and the server name; unknown methods are errors', async () => {
  const r = (await s.rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).result;
  assert.equal(r.protocolVersion, '2025-03-26');
  assert.deepEqual(Object.keys(r.capabilities).sort(), ['resources', 'tools']);
  assert.equal(r.serverInfo.name, 'stick2');
  s.note('notifications/initialized');
  assert.equal((await s.rpc('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, '2025-06-18', 'an unknown version gets the newest');
  assert.deepEqual((await s.rpc('ping')).result, {});
  assert.equal((await s.rpc('no/such')).error.code, -32601);
  assert.equal((await s.rpc('tools/call', { name: 'nope' })).error.code, -32602);
});

test('tools/list: each tool has a description and an object input schema', async () => {
  const { tools } = (await s.rpc('tools/list')).result, names = tools.map(t => t.name);
  for (const n of ['list_characters', 'get_character', 'list_moves', 'list_scenarios', 'list_settings', 'set_settings', 'simulate', 'run_checks', 'replay_export', 'replay_import', 'render_frame'])
    assert.ok(names.includes(n), n);
  for (const t of tools) assert.ok(t.description.length > 20 && t.inputSchema.type === 'object', t.name);
});

test('characters and moves: the built-ins, a definition, frame data; a broken edit is refused and changes nothing', async () => {
  const cs = (await s.call('list_characters')).json;
  assert.ok(cs.length >= 10 && cs.some(c => c.name === 'stick' && c.builtin));
  const def = (await s.call('get_character', { name: 'stick' })).json;
  assert.ok(def.bones.length > 10 && def.moves.jab);
  const jab = (await s.call('list_moves', { char: 'stick' })).json.find(m => m.name === 'jab');
  assert.ok(jab.startup > 0 && jab.active > 0 && jab.binds.includes('punch'), JSON.stringify(jab));
  const bad = await s.call('edit_character', { name: 'stick', patch: { bones: { waist: { parent: 'nowhere' } } } });
  assert.ok(bad.isError && /no parent bone/.test(bad.content[0].text), bad.content[0].text);
  const made = (await s.call('create_character', { def: { ...def, name: 'longlegs' } })).json;
  assert.equal(made.name, 'longlegs');
  assert.equal((await s.call('edit_character', { name: 'longlegs', patch: { bones: { thighF: { len: 30 } }, speed: 1.2 } })).json.bones, def.bones.length);
  assert.equal((await s.call('get_character', { name: 'longlegs' })).json.bones.find(b => b.id === 'thighF').len, 30);
  assert.equal((await s.call('edit_move', { char: 'longlegs', name: 'jab', move: { damage: 9 }, merge: true })).json.damage, 9);
  const noDel = await s.call('delete_character', { name: 'stick' });
  assert.ok(noDel.isError && /built-ins can't be deleted/.test(noDel.content[0].text), noDel.content[0].text);
  const noRen = await s.call('rename_character', { from: 'stick', to: 'sticky' });
  assert.ok(noRen.isError && /built-ins can't be renamed/.test(noRen.content[0].text), noRen.content[0].text);
  assert.equal((await s.call('rename_character', { from: 'longlegs', to: 'longshanks' })).json.name, 'longshanks');
  assert.ok((await s.call('get_character', { name: 'longlegs' })).isError, 'the old name is gone');
  assert.equal((await s.call('get_character', { name: 'longshanks' })).json.bones.find(b => b.id === 'thighF').len, 30, 'the edits moved with it');
  assert.equal((await s.call('delete_character', { name: 'longshanks' })).json.deleted, 'longshanks');
  assert.ok((await s.call('get_character', { name: 'longshanks' })).isError, 'deleted for good');
});

test('settings: checked against their spec (type, options; numbers unlimited, warned outside the usual range), set, read back and reset', async () => {
  const bad = await s.call('set_settings', { values: { hitstop: 0.1, plane: 'cube', nope: 1, maxSpeed: 'fast' } });
  assert.ok(bad.isError);
  for (const w of ['plane', 'nope', 'maxSpeed']) assert.ok(bad.content[0].text.includes(w), w);
  assert.equal((await s.call('get_settings')).json.all.hitstop, (await s.call('list_settings', { group: 'hit stop' })).json[0].settings.find(x => x.key === 'hitstop').default, 'a rejected call changes nothing');
  const far = await s.call('set_settings', { values: { hitstop: 50 } });
  assert.ok(!far.isError && far.json.warnings?.[0].startsWith('hitstop'), 'an unusual number is set, with a warning');
  await s.call('set_settings', { values: { hitstop: 0.1, plane: 'belt' } });
  assert.deepEqual((await s.call('get_settings')).json.changed, { hitstop: 0.1, plane: 'belt' });
  assert.deepEqual((await s.call('reset_settings')).json.changed, {});
  assert.ok((await s.call('list_settings')).json.some(g => g.group === 'Movement' && g.settings.includes('maxSpeed')));
  assert.ok((await s.call('set_settings', { values: 1 })).isError, 'arguments are checked against the schema');
});

test('simulate: deterministic (same seed, same end hash), summed up with stats and filtered events', async () => {
  const a = (await s.call('simulate', { scenario: 'ai vs ai', seed: 4, chars: ['zippa', 'lumpo'], events: { types: ['hit'], limit: 5 } })).json;
  const b = (await s.call('simulate', { scenario: 'ai vs ai', seed: 4, chars: ['zippa', 'lumpo'], events: false })).json;
  assert.equal(a.endHash, b.endHash);
  assert.equal(a.N, b.N);
  assert.ok(['ko', 'time', 'double ko'].includes(a.outcome) && a.stats.length === 2 && a.fighters[0].char === 'zippa' && a.fighters[1].char === 'lumpo', JSON.stringify(a.fighters));
  assert.ok(a.events.shown.length <= 5 && a.events.shown.every(e => e.type === 'hit'));
  assert.equal(b.events, undefined);
  const m = (await s.call('simulate', { scenario: 'you vs dummy', inputs: '0.1, 6, 6, P', frames: 120, events: { types: ['move'] } })).json;
  assert.equal(m.fighters[0].ctl, 'human');
  assert.ok(m.events.shown.length >= 1, 'the macro plays a move');
  assert.ok((await s.call('simulate', { scenario: 'no such' })).isError);
});

test('a replay round trip: simulate → replay_export → replay_import plays in sync to the same end', async () => {
  const sim = (await s.call('simulate', { scenario: 'you vs ai', seed: 2, inputs: '0.3, 6, 6, P, 0.4, 2K, 0.3, 236P', frames: 900, events: false })).json;
  const rep = (await s.call('replay_export', { simulation: sim.id })).json;
  assert.equal(rep.format, 'stick2-replay');
  const back = (await s.call('replay_import', { json: rep, events: false })).json;
  assert.equal(back.desync, null);
  assert.equal(back.endHash, sim.endHash);
  const bent = (await s.call('replay_import', { json: { ...rep, cfg: { ...rep.cfg, maxSpeed: rep.cfg.maxSpeed * 1.3 } }, events: false })).json;
  assert.ok(bent.desync > 0, 'other settings: out of sync');
});

test('run_checks: a move against every target state', async () => {
  const r = (await s.call('run_checks', { char: 'stick', move: 'jab', all: true })).json;
  assert.equal(r.moves[0].cells.length, 28);
  assert.equal(r.moves[0].outs.length, 28);
});

test('resources: the docs and the schemas', async () => {
  const { resources } = (await s.rpc('resources/list')).result;
  assert.ok(resources.some(r => r.uri === 'stick2://docs/README.md') && resources.some(r => r.uri === 'stick2://schema/character'));
  assert.ok(['sound', 'look', 'track'].every(k => resources.some(r => r.uri === `stick2://schema/${k}`)));
  const doc = (await s.rpc('resources/read', { uri: 'stick2://docs/README.md' })).result.contents[0];
  assert.ok(doc.text.startsWith('# stick2 docs'));
  assert.ok(JSON.parse((await s.rpc('resources/read', { uri: 'stick2://schema/settings' })).result.contents[0].text).length > 100);
  assert.ok(JSON.parse((await s.rpc('resources/read', { uri: 'stick2://schema/track' })).result.contents[0].text).fields.rows);
  assert.ok((await s.rpc('resources/read', { uri: 'stick2://docs/../package.json' })).error);
});

test('scenarios: create a reusable one (checked by building a fight), edit it, simulate it, delete it; built-ins can\'t be deleted', async () => {
  const before = (await s.call('list_scenarios')).json.length;
  const bad = await s.call('create_scenario', { scen: { a: 'ai', b: 'dummy', chars: ['nope'] }, name: 'bad' });
  assert.ok(bad.isError && /no character/.test(bad.content[0].text), bad.content[0].text);
  const made = (await s.call('create_scenario', { scen: { a: 'ai', b: 'dummy', ax: 300, bx: 500, chars: ['stick'] }, name: 'my fight' })).json;
  assert.equal(made.name, 'my fight');
  assert.equal((await s.call('list_scenarios')).json.length, before + 1);
  const edited = (await s.call('edit_scenario', { name: 'my fight', patch: { period: 5 } })).json;
  assert.equal(edited.period, 5);
  const sim = (await s.call('simulate', { scenario: 'my fight', frames: 30 })).json;
  assert.ok(sim.outcome);
  assert.equal((await s.call('delete_scenario', { name: 'my fight' })).json.deleted, 'my fight');
  assert.equal((await s.call('list_scenarios')).json.length, before);
  assert.ok((await s.call('delete_scenario', { name: 'duel' })).isError);
});

test('sounds: list the built-ins, tune one with a merge patch, revert it; a brand new one, renamed, then reset deletes it for good', async () => {
  const sounds = (await s.call('list_sounds')).json;
  assert.ok(sounds.whoosh.builtin && sounds.whoosh.dur > 0);
  const tuned = (await s.call('save_sound', { name: 'whoosh', patch: { ngain: 0.9 } })).json;
  assert.equal(tuned.preset.ngain, 0.9);
  assert.equal((await s.call('list_sounds')).json.whoosh.ngain, 0.9);
  await s.call('reset_sound', { name: 'whoosh' });
  assert.notEqual((await s.call('list_sounds')).json.whoosh.ngain, 0.9);
  const bad = await s.call('save_sound', { name: 'mine', patch: { noise: 'nope', dur: 0.2 } });
  assert.ok(bad.isError && /noise/.test(bad.content[0].text), bad.content[0].text);
  const made = (await s.call('save_sound', { name: 'mine', patch: { tone: 'square', dur: 0.2 } })).json;
  assert.equal(made.preset.tone, 'square');
  await s.call('rename_sound', { from: 'mine', to: 'mine2' });
  const after = (await s.call('list_sounds')).json;
  assert.ok(!after.mine && after.mine2);
  assert.equal((await s.call('reset_sound', { name: 'mine2' })).json.deleted, 'mine2');
});

test('looks: built-ins are read-only hand-coded data; a custom one is tunable, renamed, then deleted', async () => {
  const looks = (await s.call('list_looks')).json;
  assert.ok(looks.fire.builtin === true && !looks.fire.shape);
  assert.ok((await s.call('save_look', { name: 'fire', patch: { shape: 'ring' } })).isError);
  const made = (await s.call('save_look', { name: 'mylook', patch: { shape: 'ring', col: 'cyan' } })).json;
  assert.equal(made.preset.shape, 'ring');
  await s.call('rename_look', { from: 'mylook', to: 'mylook2' });
  const after = (await s.call('list_looks')).json;
  assert.ok(!after.mylook && after.mylook2);
  assert.equal((await s.call('delete_look', { name: 'mylook2' })).json.deleted, 'mylook2');
});

test('tracker: a track\'s rows must name a real sound and match its step count; a valid one round-trips, renamed, then deleted', async () => {
  const bad = await s.call('save_track', { name: 'bad', patch: { bpm: 120, steps: 8, rows: [{ sound: 'nope', cells: [true] }] } });
  assert.ok(bad.isError && /sound name/.test(bad.content[0].text), bad.content[0].text);
  const made = (await s.call('save_track', { name: 'mytrack', patch: { bpm: 140, steps: 8, rows: [{ sound: 'hit', cells: [true, false, true, false, true, false, true, false] }] } })).json;
  assert.equal(made.rows[0].cells.filter(Boolean).length, 4);
  assert.equal((await s.call('list_tracks')).json.mytrack.bpm, 140);
  await s.call('rename_track', { from: 'mytrack', to: 'mytrack2' });
  assert.ok((await s.call('list_tracks')).json.mytrack2);
  assert.equal((await s.call('delete_track', { name: 'mytrack2' })).json.deleted, 'mytrack2');
});

test('render_frame with the SVG renderer: the engine draws into SVG', async () => {
  const sim = (await s.call('simulate', { scenario: 'ai vs ai', seed: 3, frames: 200, events: false })).json;
  const r = await s.call('render_frame', { simulation: sim.id, frames: [0, 150], renderer: 'svg', w: 320, h: 180 });
  assert.ok(!r.isError, r.content[0].text);
  assert.equal(r.content.length, 2);
  for (const c of r.content) { assert.match(c.text, /^<svg [^>]*width="320"/); assert.ok(c.text.length > 3000 && (c.text.match(/<path/g) || []).length > 20, 'a fighter is drawn'); }
});

test('render_frame and render_gif with Chrome: a PNG and a GIF file', { skip: !findChrome() && 'no Chrome found (set CHROME)' }, async () => {
  const sim = (await s.call('simulate', { scenario: 'ai vs ai', seed: 3, frames: 200, events: false })).json;
  const r = await s.call('render_frame', { simulation: sim.id, frame: 100, w: 320, h: 180 });
  assert.ok(!r.isError, r.content[0].text);
  assert.equal(r.content[0].mimeType, 'image/png');
  assert.equal(Buffer.from(r.content[0].data, 'base64').subarray(1, 4).toString(), 'PNG');
  const file = `test-${process.pid}.gif`, g = await s.call('render_gif', { simulation: sim.id, from: 0, to: 60, fps: 10, w: 160, h: 90, file });
  assert.ok(!g.isError, g.content[0].text);
  const info = JSON.parse(g.content[1].text);
  try { assert.equal(fs.readFileSync(info.path).subarray(0, 6).toString(), 'GIF89a'); assert.equal(info.frames, 11); } finally { fs.rmSync(info.path, { force: true }); }
});

test('the live bridge: the app opened from the server takes fixed commands', { skip: !findChrome() && 'no Chrome found (set CHROME)' }, async () => {
  const { launch } = require('../tools/chrome');
  const b = (await s.call('start_bridge')).json, page = await launch(b.url, ['--window-size=1200,800']);
  try {
    let st = null;
    for (let i = 0; i < 100 && !st; i++) { const r = await s.call('browser_state'); if (!r.isError) st = r.json; else await new Promise(ok => setTimeout(ok, 100)); }
    assert.ok(st && st.mode && st.character && st.def.bones, 'the page connects and answers state');
    assert.equal((await s.call('browser_command', { name: 'set_scenario', args: { name: 'ai vs ai' } })).json.scenario, 'ai vs ai');
    assert.ok((await s.call('browser_command', { name: 'set_settings', args: { values: { plane: 'cube' } } })).isError, 'checked in the page too');
    assert.deepEqual((await s.call('browser_command', { name: 'set_settings', args: { values: { hitstop: 0.12 } } })).json.changed, { hitstop: 0.12 });
    const sim = (await s.call('simulate', { scenario: 'ai vs ai', seed: 5, frames: 300, events: false })).json;
    const open = (await s.call('browser_command', { name: 'open_replay', args: { simulation: sim.id } })).json;
    assert.equal(open.desync, null);
    assert.equal((await s.call('browser_state')).json.mode, 'replay');
    const shot = await s.call('browser_command', { name: 'screenshot' });
    assert.equal(shot.content[0].mimeType, 'image/png');
    assert.ok((await s.call('browser_command', { name: 'eval' })).isError, 'only the fixed commands');
  } finally { page.close(); }
});
