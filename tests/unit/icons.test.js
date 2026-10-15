'use strict';
// every icon the UI asks for is in the icon font's map (src/ui/ui.js ICONS, rebuilt into fonts/icons.woff2 by
// tools/render/icons.py): an unknown :name: shows as plain text, as :home: once did on the welcome button
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);
const ui = fs.readFileSync(path.join(root, 'src/ui/ui.js'), 'utf8'), block = ui.slice(ui.indexOf('const ICONS = {'), ui.indexOf('};', ui.indexOf('const ICONS = {')));
const NOT_ICONS = new Set(['sub']); // ':sub:' is a layout key separator (ui.js), not an icon
const ICONS = new Set([...block.matchAll(/([a-z_0-9]+): 0x[0-9a-f]+/g)].map(m => m[1]));

test('every icon used is in the icon font', () => {
  const missing = [];
  for (const f of files(path.join(root, 'src'))) {
    const src = fs.readFileSync(f, 'utf8').split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
    const used = [...src.matchAll(/(?<![\w$]):([a-z][a-z_0-9]*):(?![\w])/g)].map(m => m[1])
      // the icon maps: { key: 'icon_name', … } in any const named *_ICONS
      .concat(...[...src.matchAll(/const [A-Z_]*ICONS = \{([^}]*)\}/g)].filter(m => !m[0].startsWith('const ICONS')).map(m => [...m[1].matchAll(/:\s*'([a-z_0-9]+)'/g)].map(x => x[1])))
      .concat([...src.matchAll(/\b(?:icon|glyph)\('([a-z_0-9]+)'/g)].map(m => m[1]));
    for (const n of used) if (!ICONS.has(n) && !NOT_ICONS.has(n)) missing.push(`${path.relative(root, f)}: ${n}`);
  }
  assert.deepStrictEqual([...new Set(missing)], []);
});
