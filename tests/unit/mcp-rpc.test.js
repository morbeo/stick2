const test = require('node:test'), assert = require('node:assert/strict');
const R = require('../../tools/lib/mcp-rpc');

test('mcp-rpc: version, listTools, checkArgs', () => {
  assert.equal(R.version('2025-03-26'), '2025-03-26');
  assert.equal(R.version('1999-01-01'), R.VERSIONS[0]);
  const TOOLS = { a: { d: 'A', p: { n: R.int('n'), k: R.str('k', { enum: ['x'] }) }, req: ['n'] }, b: { d: 'B', admin: true } };
  assert.deepEqual(R.listTools(TOOLS, t => !t.admin).map(t => t.name), ['a']);
  assert.equal(R.listTools(TOOLS, undefined, t => t.admin ? '!' : '')[1].description, 'B!');
  assert.deepEqual(R.listTools(TOOLS)[0].inputSchema.required, ['n']);
  assert.doesNotThrow(() => R.checkArgs(TOOLS.a, { n: 1, k: 'x' }));
  assert.throws(() => R.checkArgs(TOOLS.a, {}), /n is required/);
  assert.throws(() => R.checkArgs(TOOLS.a, { n: '' }), /n is required/);
  assert.throws(() => R.checkArgs(TOOLS.a, { n: 1, z: 1 }), /unknown argument z/);
  assert.throws(() => R.checkArgs(TOOLS.a, { n: 'one' }), /should be integer, not string/);
  assert.throws(() => R.checkArgs(TOOLS.a, { n: 1, k: 'y' }), /one of x/);
  assert.doesNotThrow(() => R.checkArgs({ p: { v: R.num('v') } }, { v: 2 }));
  assert.deepEqual(R.arr('l', { type: 'string' }), { type: 'array', description: 'l', items: { type: 'string' } });
  assert.equal(R.bool('b').type + R.obj('o').type, 'booleanobject');
});

test('mcp-rpc: results', () => {
  assert.equal(R.asResult('hi').content[0].text, 'hi');
  assert.equal(R.asResult({ a: 1 }).content[0].text, '{\n  "a": 1\n}');
  assert.equal(R.asResult(undefined).content[0].text, 'null');
  const own = { content: [] }; assert.equal(R.asResult(own), own);
  assert.deepEqual(R.errResult(new Error('no')), { content: [{ type: 'text', text: 'Error: no' }], isError: true });
});

test('mcp-rpc: rpc and rpcBody', async () => {
  const errs = [];
  const M = { ok: (p, c) => ({ p, c }), bad: () => { throw Object.assign(new Error('x'), { code: -1 }); }, boom: async () => { throw new Error('y'); } };
  assert.deepEqual(await R.rpc(M, { jsonrpc: '2.0', id: 1, method: 'ok', params: 2 }, 3), { jsonrpc: '2.0', id: 1, result: { p: 2, c: 3 } });
  assert.equal(await R.rpc(M, { jsonrpc: '2.0', method: 'ok' }), null);
  assert.equal(await R.rpc(M, { id: 1, result: {} }), null);
  assert.equal((await R.rpc(M, { jsonrpc: '1.0', id: 4, method: 'ok' })).error.code, -32600);
  assert.equal((await R.rpc(M, null)).id, null);
  assert.equal((await R.rpc(M, { jsonrpc: '2.0', id: 1, method: 'nope' })).error.code, -32601);
  assert.equal((await R.rpc(M, { jsonrpc: '2.0', id: 1, method: 'bad' }, null, e => errs.push(e))).error.code, -1);
  assert.equal((await R.rpc(M, { jsonrpc: '2.0', id: 1, method: 'boom' })).error.code, -32603);
  assert.equal(errs.length, 1);
  assert.equal((await R.rpcBody(M, [{ jsonrpc: '2.0', id: 1, method: 'ok' }, { jsonrpc: '2.0', method: 'ok' }])).length, 1);
  assert.equal(await R.rpcBody(M, [{ jsonrpc: '2.0', method: 'ok' }]), null);
  assert.equal(R.PARSE_ERROR.error.code, -32700);
});
