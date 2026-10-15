// determinism: the same seed and inputs give the same fight, frame for frame; another seed gives another fight
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load'), SEED = require('./seed');
const { run } = load();
// an AI fight (it decides by the world's random numbers): its state hash every 60 frames
const hashes = (seed, r = run) => r(`(() => { const w = new World(SCENARIOS['ai vs ai'], {}, ${seed}, [CHARS.stick, CHARS.sneeko]); w.loop = false;
  const h = []; for (let i = 0; i < 1200; i++) { w.advance(1 / 60, NOIN); if (i % 60 === 59) h.push(w.stateHash()); } return h.join(' '); })()`);

test(`same seed, same fight: two runs match frame for frame (seed ${SEED})`, () => {
  assert.equal(hashes(SEED), hashes(SEED), `two runs of seed ${SEED} differ: rerun with SEED=${SEED}`);
  // and in a fresh engine, nothing carried over from earlier fights
  assert.equal(hashes(SEED, load().run), hashes(SEED), `seed ${SEED}: a fresh engine plays another fight`);
});

test(`another seed, another fight (seeds ${SEED} and ${SEED + 1})`, () => {
  assert.notEqual(hashes(SEED), hashes(SEED + 1), 'the seed changes nothing: something random ignores it');
});
