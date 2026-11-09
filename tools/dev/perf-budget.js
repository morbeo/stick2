#!/usr/bin/env node
// Perf budget: fails (exit 1) when a 2-fighter AI fight costs more than the budget in ms per frame (sim only, no drawing).
// Run by CI after the unit tests. Best of several runs, after a warm-up, so a busy machine does not fail it by chance.
// usage: node tools/dev/perf-budget.js [--budget MS] [--frames N] [--runs N]   (env PERF_BUDGET also sets the budget; default 1)
const engine = require('../lib/engine');
const opt = (name, def) => { const i = process.argv.indexOf('--' + name); const v = i > 0 ? +process.argv[i + 1] : NaN; return v > 0 ? v : def; };
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('usage: node tools/dev/perf-budget.js [--budget MS] [--frames N] [--runs N]\n  budget: max sim ms per frame (default 1, or PERF_BUDGET), frames per run (default 1200), runs (default 5, best counts)');
  process.exit(0);
}
const BUDGET = opt('budget', +process.env.PERF_BUDGET || 1), FRAMES = opt('frames', 1200), RUNS = opt('runs', 5);
const { run } = engine();
const fight = (frames, seed) => {
  run(`globalThis._pw = new World(SCENARIOS['ai vs ai'], {}, ${seed}); _pw.loop = false;`);
  const t = process.hrtime.bigint();
  run(`for (let i = 0; i < ${frames}; i++) _pw.advance(1 / 60, NOIN);`);
  return Number(process.hrtime.bigint() - t) / 1e6;
};
fight(300, 1); // warm-up: JIT
const times = Array.from({ length: RUNS }, (_, i) => fight(FRAMES, i + 1) / FRAMES).sort((a, b) => a - b);
const best = times[0], ok = best <= BUDGET;
console.log(`perf: ${best.toFixed(3)} ms/frame best of ${RUNS} (median ${times[RUNS >> 1].toFixed(3)}), budget ${BUDGET} ms: ${ok ? 'OK' : 'OVER BUDGET'}`);
process.exit(ok ? 0 : 1);
