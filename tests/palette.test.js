// the command palette (src/palette.js) should list every named-item registry in the app (sounds, looks, tracks,
// props, weapons, scenarios, characters …), not just the ones that existed when it was written: a future subsystem
// that follows the established BASE_x + myX (localStorage) -> live X pattern (see sound.js, stage.js, rig.js) is
// found here by that pattern alone, so adding one without wiring it into the palette fails this test
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');

test('palette: every BASE_x/myX item registry is a searchable command', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));
  const src = Object.fromEntries(files.map(f => [f, fs.readFileSync(path.join(srcDir, f), 'utf8')]));
  const all = Object.values(src).join('\n');
  const registries = new Set();
  for (const m of all.matchAll(/\bconst\s+(\w+)\s*=\s*\{\s*\.\.\.BASE_\w+\s*,\s*\.\.\.my\w+\s*\}/g)) registries.add(m[1]);
  assert.ok(registries.size > 0, 'no BASE_x/myX registries found at all - the naming convention this test looks for may have changed');
  const missing = [...registries].filter(r => !src['palette.js'].includes(`Object.keys(${r})`));
  assert.deepEqual(missing, [], `add these item registries to paletteEntries() in src/palette.js: ${missing.join(', ')}`);
});
