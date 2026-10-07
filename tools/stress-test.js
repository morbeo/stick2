#!/usr/bin/env node
// Ad-hoc perf tool, NOT run by `npm test`: measures sim cost (ms/frame) as fighter count grows, to find the
// real scaling bottleneck (see tests/load.js / tools/engine.js for the same headless-engine pattern).
// usage: node tools/stress-test.js [counts...]   e.g. node tools/stress-test.js 2 8 16 32 64
const engine = require('./engine');
const { ctx, run } = engine();
const CHAR_NAMES = run('Object.keys(CHARS)'); // CHARS is a vm-context `const`, not a property of ctx

const COUNTS = (process.argv.slice(2).map(Number).filter(n => n > 0)) || [];
const counts = COUNTS.length ? COUNTS : [2, 4, 8, 16, 32, 64, 96, 128];
const FRAMES = 300; // 5s of sim time at 60fps (each frame = up to 2 substeps at 120Hz)
const SPREAD_FROM = 40, SPREAD_TO = 760; // stage is 800 wide (W in world.js)

function buildScen(n) {
  const chars = Array.from({ length: n }, (_, i) => CHAR_NAMES[i % CHAR_NAMES.length]);
  const x = i => SPREAD_FROM + (SPREAD_TO - SPREAD_FROM) * (n === 1 ? 0 : i / (n - 1));
  const more = [];
  for (let i = 2; i < n; i++) more.push({ c: 'ai', x: x(i) }); // team omitted: defaults to its own index, so every fighter is a free-for-all foe of every other
  return { a: 'ai', b: 'ai', ax: x(0), bx: x(1), chars, more: more.length ? more : undefined };
}

function timeN(n) {
  const scen = buildScen(n);
  ctx.scen = scen;
  const start = process.hrtime.bigint();
  run(`(() => { const w = new World(scen, {}, 1); w.loop = false; for (let i = 0; i < ${FRAMES} && !w.done; i++) w.advance(1/60, NOIN); })()`);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  return { n, elapsedMs, msPerFrame: elapsedMs / FRAMES };
}

console.log(`frames per run: ${FRAMES} (sim seconds: ${(FRAMES / 60).toFixed(1)}s @ 60fps, up to ${FRAMES * 2} substeps @ 120Hz)\n`);
console.log('fighters | total ms | ms/frame | ms/frame/fighter');
console.log('---------|----------|----------|------------------');
const rows = [];
for (const n of counts) {
  const r = timeN(n);
  rows.push(r);
  console.log(`${String(n).padStart(8)} | ${r.elapsedMs.toFixed(1).padStart(8)} | ${r.msPerFrame.toFixed(3).padStart(8)} | ${(r.msPerFrame / n).toFixed(4).padStart(18)}`);
}

// real-time budget: 60fps leaves 16.67ms/frame; flag the first count that blows it
const budget = 1000 / 60;
const first = rows.find(r => r.msPerFrame > budget);
console.log(`\n16.67ms/frame (60fps real-time) budget ${first ? `exceeded at ${first.n} fighters (${first.msPerFrame.toFixed(2)}ms/frame)` : 'not exceeded in this range'}`);
