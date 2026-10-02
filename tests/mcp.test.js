// the MCP server (tools/mcp.js) over its stdio transport: the protocol, the tools, the resources, rendering
const test = require('node:test'), assert = require('node:assert/strict'), path = require('path'), fs = require('fs'), { spawn } = require('child_process');

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
  for (const n of ['list_characters', 'get_character', 'list_moves', 'list_scenarios', 'list_settings', 'set_settings', 'simulate'])
    assert.ok(names.includes(n), n);
  for (const t of tools) assert.ok(t.description.length > 20 && t.inputSchema.type === 'object', t.name);
});

test('characters and moves: the built-ins, a definition, frame data', async () => {
  const cs = (await s.call('list_characters')).json;
  assert.ok(cs.length >= 10 && cs.some(c => c.name === 'stick' && c.builtin));
  const def = (await s.call('get_character', { name: 'stick' })).json;
  assert.ok(def.bones.length > 10 && def.moves.jab);
  const jab = (await s.call('list_moves', { char: 'stick' })).json.find(m => m.name === 'jab');
  assert.ok(jab.startup > 0 && jab.active > 0 && jab.binds.includes('punch'), JSON.stringify(jab));
});

test('settings: checked against their spec (type, range, options), set, read back and reset', async () => {
  const bad = await s.call('set_settings', { values: { hitstop: 5, plane: 'cube', nope: 1, maxSpeed: 'fast' } });
  assert.ok(bad.isError);
  for (const w of ['hitstop', 'plane', 'nope', 'maxSpeed']) assert.ok(bad.content[0].text.includes(w), w);
  assert.equal((await s.call('get_settings')).json.all.hitstop, (await s.call('list_settings', { group: 'hit stop' })).json[0].settings.find(x => x.key === 'hitstop').default, 'a rejected call changes nothing');
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

test('resources: the docs and the schemas', async () => {
  const { resources } = (await s.rpc('resources/list')).result;
  assert.ok(resources.some(r => r.uri === 'stick2://docs/README.md') && resources.some(r => r.uri === 'stick2://schema/character'));
  const doc = (await s.rpc('resources/read', { uri: 'stick2://docs/README.md' })).result.contents[0];
  assert.ok(doc.text.startsWith('# stick2 docs'));
  assert.ok(JSON.parse((await s.rpc('resources/read', { uri: 'stick2://schema/settings' })).result.contents[0].text).length > 100);
  assert.ok((await s.rpc('resources/read', { uri: 'stick2://docs/../package.json' })).error);
});
