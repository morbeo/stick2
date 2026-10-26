#!/usr/bin/env node
// profiles/embeds/*.json -> src/ui/embed-presets.js (EMBED_PRESETS), so the page has them without a fetch (file://, itch.io).
// --check: exit 1 if the file is out of date, write nothing
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', '..', 'profiles', 'embeds'), out = path.join(__dirname, '..', '..', 'src', 'ui', 'embed-presets.js');
const presets = Object.fromEntries(fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]));
const text = `'use strict';\n// generated from profiles/embeds/*.json by tools/dev/embed-presets.js (npm run embed-presets): edit those, not this\nconst EMBED_PRESETS = ${JSON.stringify(presets, null, 1)};\n`;
if (process.argv.includes('--check')) { const ok = fs.existsSync(out) && fs.readFileSync(out, 'utf8') === text; if (!ok) console.error('src/ui/embed-presets.js is out of date: npm run embed-presets'); process.exit(ok ? 0 : 1); }
fs.writeFileSync(out, text); console.log(`wrote ${path.relative(process.cwd(), out)} (${Object.keys(presets).length} presets)`);
