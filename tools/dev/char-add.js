// adds a character made in the editor to the roster as src/engine/chars/<name>.js: takes the editor's export (as code,
// a JSON diff, or a full JSON character), writes the file as its closest built-in plus a diff, lists it in
// chars/index.json, updates the pages' script tags, then loads the engine to check it compiles and round-trips
// usage: npm run char:add -- <file> [--name <name>] [--force] [--dry-run]
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(ROOT, 'src', 'engine', 'chars'), INDEX = path.join(DIR, 'index.json');
const USAGE = 'usage: npm run char:add -- <file.json|file.js> [--name <name>] [--force] [--dry-run]';
const die = (msg, code = 1) => { console.error(msg); process.exit(code); };

const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i < 0 ? undefined : args.splice(i, 2)[1]; };
if (args.includes('-h') || args.includes('--help')) { console.log(USAGE); process.exit(0); }
const flag = k => { const i = args.indexOf(k); return i >= 0 && !!args.splice(i, 1); };
const force = flag('--force'), dry = flag('--dry-run'), rename = opt('--name');
if (args.length !== 1) die(USAGE, 2);

// the current engine (fresh: index.json changes below)
const loadEngine = () => { delete require.cache[require.resolve('../lib/engine')]; return require('../lib/engine')(); };
const { run } = loadEngine();
const text = fs.readFileSync(args[0], 'utf8');
// what the file holds, as a full character definition
let def;
if (/^\s*[{[]/.test(text)) {
  const j = JSON.parse(text);
  if (j.format === 'stick2.character.diff') {
    if (!run(`!!CHAR_DEFS[${JSON.stringify(j.base)}]`)) die(`${args[0]}: a diff against "${j.base}", which isn't a built-in`);
    def = JSON.parse(run(`JSON.stringify(applyObj(CHAR_DEFS[${JSON.stringify(j.base)}], ${JSON.stringify(j.diff)}))`));
  } else def = j;
} else {
  const m = text.match(/charFromDiff\(("[^"]*"), ("[^"]*"), ([\s\S]*)\);\s*$/);
  if (!m) die(`${args[0]}: not a character export (JSON, or the editor's "export as code" file)`);
  def = JSON.parse(run(`JSON.stringify({ ...applyObj(CHAR_DEFS[${m[2]}], ${m[3]}), name: ${m[1]} })`));
}
const name = rename || def.name;
if (!/^[a-z][a-z0-9_]*$/i.test(name || '')) die(`"${name}" can't be a file name: letters, digits and _ only (pick one with --name)`);
def.name = name;
try { run(`makeCharacter(${JSON.stringify(def)})`); } catch (err) { die(`${args[0]}: not a working character: ${err.message}`); }

const file = path.join(DIR, name + '.js'), index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const exported = f => fs.existsSync(f) && /charFromDiff\(/.test(fs.readFileSync(f, 'utf8'));
if (name === 'stick' || name.startsWith('_')) die(`"${name}" is reserved`);
if (fs.existsSync(file) && !exported(file)) die(`${name} is a hand-written built-in (src/engine/chars/${name}.js): edit that file, or add this as a new character with --name`);
if (fs.existsSync(file) && !force) die(`src/engine/chars/${name}.js exists: --force replaces it`);

const base = JSON.parse(run(`JSON.stringify(closestBase(${JSON.stringify(def)}))`));
const src = run(`charSource(${JSON.stringify(name)}, ${JSON.stringify(base)}, diffObj(CHAR_DEFS[${JSON.stringify(base)}], ${JSON.stringify(def)}) || {})`);
if (dry) { process.stdout.write(src); process.exit(0); }

fs.writeFileSync(file, src);
if (!index.includes(name)) fs.writeFileSync(INDEX, JSON.stringify([...index, name], null, 2) + '\n');
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'char-scripts.js')], { stdio: 'inherit' });
// loads as it will in the app, and comes out as the character that went in
const after = loadEngine().run(`JSON.stringify(CHAR_DEFS[${JSON.stringify(name)}])`);
if (after !== JSON.stringify({ ...JSON.parse(run(`JSON.stringify(applyObj(CHAR_DEFS[${JSON.stringify(base)}], diffObj(CHAR_DEFS[${JSON.stringify(base)}], ${JSON.stringify(def)}) || {}))`)), name }))
  die(`src/engine/chars/${name}.js doesn't load back as the exported character`);
console.log(`added ${name} (the built-in ${base} plus a diff): src/engine/chars/${name}.js. Next: npm test, then commit and open a PR`);
