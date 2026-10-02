// loads the engine scripts (no DOM) into one vm context, the way index.html does (tools/engine.js), plus a test helper
const engine = require('../tools/engine');
module.exports = function load(files) {
  const { ctx, run } = engine(files);
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
