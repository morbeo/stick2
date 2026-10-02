// the move test matrix (src/checks.js, the Tests view's cells) as a regression test: only what must hold in every cell
// a move played against a target in some state: it starts, nothing becomes NaN, both fighters come back to neutral, nobody leaves the stage
// against its own character it must also hit, be blocked or whiff as the Tests view expects (against others some still miss, see docs/testing.md)
// by default each move gets a few cells picked by the seed (SEED=n, see seed.js); MATRIX=full (npm run test:matrix) runs every move of every character in every column against itself (about 8 minutes)
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load'), SEED = require('./seed');
const { run } = load();
const FULL = process.env.MATRIX === 'full', PER_MOVE = 2;
// the invariants among a cell's issues (the rest are hit / block / whiff expectations, checked against its own character only)
const INVARIANT = /NaN|return to neutral|does not recover|left the stage/;

test(`move matrix invariants, and expectations against itself (${FULL ? 'every cell' : `${PER_MOVE} cells per move, seed ${SEED}`})`, () => {
  const r = JSON.parse(run(`JSON.stringify((() => { const rand = makeRand(${SEED}), names = Object.keys(CHARS), bad = [], lib = CHAR_DEFS.stick.moves; let cells = 0;
    for (const n of names) { const ch = CHARS[n];
      // each move once: the stick's whole library, then the moves each fighter brings of its own
      const moves = Object.keys(ch.moves).filter(k => ${FULL} || n === 'stick' || !lib[k]);
      for (const mv of moves) {
        const picks = ${FULL} ? CHECK_COLS.map((_, ci) => [n, ci]) : Array.from({ length: ${PER_MOVE} }, () => [names[Math.floor(rand() * names.length)], Math.floor(rand() * CHECK_COLS.length)]);
        for (const [o, ci] of picks) { const c = CHECK_COLS[ci], res = runCheck(ch, CHARS[o], mv, c); cells++;
          const issues = res.out === 'skip' ? ['it never starts'] : res.issues.filter(i => o === n || ${INVARIANT}.test(i));
          if (issues.length) bad.push(n + '.' + mv + ' vs ' + o + ', target ' + c.s + ' ' + (c.facing === 'away' ? 'back turned' : 'facing') + ' ' + c.dist + ': ' + issues.join('; ')); } } }
    return { cells, bad }; })())`));
  const repro = `rerun: ${FULL ? 'MATRIX=full' : `SEED=${SEED}`} node --test tests/matrix.test.js · watch a cell: Tests view, the move, against all, hover the cell`;
  assert.ok(r.cells > 100, `only ${r.cells} cells ran`);
  assert.deepEqual(r.bad, [], `${r.bad.length} of ${r.cells} cells fail (seed ${SEED}); ${repro}`);
});
