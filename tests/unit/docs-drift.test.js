// every named command palette entry and every MCP tool (tools/mcp and the server's /mcp) is mentioned somewhere in docs/,
// so adding a command or tool without documenting it fails here
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const docs = fs.readdirSync(path.join(root, 'docs')).filter(f => f.endsWith('.md')).map(f => read('docs/' + f)).join('\n');
const toolNames = f => [...read(f).matchAll(/^ {2,4}([a-z][a-z_]+): \{ (?:admin: true, )?d: /gm)].map(m => m[1]);

for (const f of ['tools/mcp/mcp.js', 'server/mcp.js']) test(`docs: every MCP tool in ${f} is documented`, () => {
  const names = toolNames(f);
  assert.ok(names.length > 5, `no tools found in ${f}: the TOOLS layout this test reads may have changed`);
  assert.deepEqual(names.filter(n => !docs.includes(n)), [], 'mention these tools in docs/mcp.md or docs/server.md');
});

test('docs: every named palette command is documented', () => {
  const names = [...read('src/ui/palette.js').matchAll(/\{ kind: '\w+', name: '([^']+)'/g)].map(m => m[1].trim().replace(/:$/, ''));
  assert.ok(names.length > 10, 'no palette entries found: the paletteEntries() layout this test reads may have changed');
  const low = docs.toLowerCase();
  assert.deepEqual(names.filter(n => !low.includes(n.toLowerCase())), [], 'mention these palette commands in docs/interface.md');
});
