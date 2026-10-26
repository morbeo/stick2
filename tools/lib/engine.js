// the engine without a page: the scripts that need no DOM loaded into one vm context, the way index.html loads them (tests, the MCP server)
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = path.join(__dirname, '..', '..', 'src');
const ENGINE = ['core', 'shapes', 'rig', 'fx', 'roster', 'fighter', 'world', 'stage', 'brain', 'checks', 'events', 'objdiff'];
// src/ is grouped into folders (engine, net, editor, ui): a script is named by its file name alone
const srcFile = name => {
  if (name.includes('/')) return path.join(SRC, name + '.js');
  for (const d of fs.readdirSync(SRC, { withFileTypes: true })) if (d.isDirectory() && fs.existsSync(path.join(SRC, d.name, name + '.js'))) return path.join(SRC, d.name, name + '.js');
  return path.join(SRC, name + '.js');
};
// 'roster' stands for every character file (src/engine/chars/index.json, in order) and then roster.js itself
const CHAR_FILES = JSON.parse(fs.readFileSync(path.join(SRC, 'engine', 'chars', 'index.json'), 'utf8')).map(c => 'engine/chars/' + c);
const expand = files => files.flatMap(f => f === 'roster' ? [...CHAR_FILES, 'roster'] : [f]);
module.exports = function engine(files = ENGINE) {
  const ctx = vm.createContext({ console, Math, Object, Array, JSON });
  for (const f of expand(files)) vm.runInContext(fs.readFileSync(srcFile(f), 'utf8'), ctx, { filename: srcFile(f) });
  return { ctx, run: code => vm.runInContext(code, ctx) };
};
module.exports.ENGINE = ENGINE;
module.exports.srcFile = srcFile;
module.exports.CHAR_FILES = CHAR_FILES;
module.exports.expand = expand;
