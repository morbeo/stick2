// loads the engine scripts (no DOM) into one vm context, the way index.html does
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
module.exports = function load(files = ['core', 'rig', 'fighter', 'world', 'brain']) {
  const ctx = vm.createContext({ console, Math, Object, Array, JSON });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(SRC, f + '.js'), 'utf8'), ctx, { filename: path.join(SRC, f + '.js') });
  const run = code => vm.runInContext(code, ctx);
  // a scripted fight: returns the world after n frames plus the moves each side started
  run(`var fight = (sc, chars, n = 150) => {
    const w = new World(sc, {}, 7, chars); w.loop = false; const seen = [];
    for (let i = 0; i < n && !w.done; i++) { w.advance(1/60, NOIN);
      for (const f of [w.a, w.b]) { const k = f.action && Object.keys(f.ch.moves).find(k => f.ch.moves[k] === f.action.m);
        const tag = (f === w.a ? 'a:' : 'b:') + k; if (k && seen[seen.length - 1] !== tag) seen.push(tag); } }
    return { w, seen };
  };`);
  return { ctx, run };
};
