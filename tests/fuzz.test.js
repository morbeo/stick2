// fuzzing: AI fights between random characters with random settings (any value the side panel allows), checked every frame:
// nothing throws, nothing becomes NaN, health stays within 0 … its maximum, nobody leaves the stage
// case i plays with seed SEED + i (see seed.js) and is made from that seed alone; FUZZ=n plays n cases (default 25)
// a failing case is shrunk to the fewest settings that still fail, and printed with the command that replays it
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load'), SEED = require('./seed');
const { run } = load();
const N = Number(process.env.FUZZ) || 25, FRAMES = 600, SETTINGS = 8;
run(`// a case from its seed: SETTINGS random settings (inspection-only ones left out), two characters, a scenario
  globalThis.fuzzCase = seed => { const rand = makeRand(seed), names = Object.keys(CHARS), pick = a => a[Math.floor(rand() * a.length)];
    const keys = Object.keys(SPEC).filter(k => !['ghost', 'boxes', 'scope'].includes(k)), cfg = {};
    for (let i = 0; i < ${SETTINGS}; i++) { const k = pick(keys), s = SPEC[k];
      cfg[k] = s.opts ? pick(s.opts) : typeof s.v === 'boolean' ? rand() < 0.5 : +Math.min(s.max, s.min + Math.round(rand() * (s.max - s.min) / s.step) * s.step).toFixed(6); }
    return { scen: pick(['ai vs ai', 'ai vs ai', 'ai vs waves']), chars: [pick(names), pick(names)], cfg }; };
  // the first broken invariant, or null
  globalThis.fuzzRun = (c, seed, frames) => { try { const w = new World(SCENARIOS[c.scen], c.cfg, seed, c.chars.map(n => CHARS[n])); w.loop = false;
    for (let i = 0; i < frames; i++) { w.advance(1 / 60, NOIN);
      for (const f of w.fighters) { const who = 'frame ' + i + ', ' + f.ch.name + ': ';
        if (!Number.isFinite(f.x + f.y + f.vx + f.vy + f.hp)) return { i, why: who + 'a position, speed or health became NaN' };
        if (f.x < -60 || f.x > W + 60) return { i, why: who + 'off the stage at x ' + Math.round(f.x) };
        if (f.hp < 0 || f.hp > f.c('health') + 1e-6) return { i, why: who + 'health ' + f.hp + ' outside 0 … ' + f.c('health') }; } }
    return null; } catch (e) { return { i: -1, why: 'throws ' + e.stack.split('\\n').slice(0, 2).join(' ') }; } };`);

// fewer settings while it still fails, then only as many frames as it takes
function shrink(c, seed, fail) {
  const fails = cc => JSON.parse(run(`JSON.stringify(fuzzRun(${JSON.stringify(cc)}, ${seed}, ${fail.i < 0 ? FRAMES : fail.i + 1}))`));
  for (const k of Object.keys(c.cfg)) { const { [k]: _, ...rest } = c.cfg, r = fails({ ...c, cfg: rest }); if (r) { c = { ...c, cfg: rest }; fail = r; } }
  return { c, fail };
}

test(`fuzz: ${N} AI fight${N === 1 ? '' : 's'} with random characters and settings (seeds ${SEED} … ${SEED + N - 1})`, () => {
  const bad = [];
  for (let seed = SEED; seed < SEED + N; seed++) {
    const c = JSON.parse(run(`JSON.stringify(fuzzCase(${seed}))`)), fail = JSON.parse(run(`JSON.stringify(fuzzRun(${JSON.stringify(c)}, ${seed}, ${FRAMES}))`));
    if (!fail) continue;
    const m = shrink(c, seed, fail);
    bad.push(`seed ${seed}: ${m.fail.why}\n  settings: ${JSON.stringify(m.c.cfg)}\n  replay: SEED=${seed} FUZZ=1 node --test tests/fuzz.test.js` +
      `\n  or in the engine: new World(SCENARIOS['${m.c.scen}'], ${JSON.stringify(m.c.cfg)}, ${seed}, [CHARS.${m.c.chars[0]}, CHARS.${m.c.chars[1]}])`);
  }
  assert.ok(!bad.length, `${bad.length} of ${N} fights broke:\n${bad.join('\n')}`);
});
