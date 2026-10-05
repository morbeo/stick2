// the engine without a page: the scripts that need no DOM loaded into one vm context, the way index.html loads them (tests, the MCP server)
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const ENGINE = ['core', 'shapes', 'rig', 'fx', 'roster', 'fighter', 'world', 'stage', 'brain', 'checks', 'events'];
module.exports = function engine(files = ENGINE) {
  const ctx = vm.createContext({ console, Math, Object, Array, JSON });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(SRC, f + '.js'), 'utf8'), ctx, { filename: path.join(SRC, f + '.js') });
  return { ctx, run: code => vm.runInContext(code, ctx) };
};
module.exports.ENGINE = ENGINE;
