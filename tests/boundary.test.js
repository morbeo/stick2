// boundaries: every timing window and the juggle pool, tried one frame inside its edge, on it, and one frame past it (N-1, N, N+1)
// a window of N frames is set as N / 60 s; a lead is how many frames the press comes before (or after) the moment it is measured from
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load();
const json = code => JSON.parse(run(`JSON.stringify(${code})`));
// play scen (b's script set per run) with hit stop and slow motion off, so frames and simulated time stay in step
run(`globalThis.bplay = (scen, b, over, watch) => { const w = new World({ ...scen, b, period: 0 }, { hitstop: 0, slowmo: false, ...over }, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
  const r = { tap: null, said: {} };
  for (let i = 0; i < 150; i++) { w.advance(1 / 60, NOIN); if (r.tap === null && w.b.guardT > 0) r.tap = i; if (w.b.labelT > 0) r.said[w.b.label] ??= i; watch?.(w, i, r); }
  return r; };
  // the frame the event happens without the press, then a press at each lead around the edge: lead → the frame each label was said
  globalThis.around = (scen, input, over, event, edge, after = false) => { const E = bplay(scen, 'dummy', over, (w, i, r) => { if (r.E === undefined && event(w)) r.E = i; }).E, out = {};
    for (let lead = edge - 2; lead <= edge + 2; lead++) { const r = bplay(scen, [(after ? E + lead : E - lead) / 60, input], over); out[after ? r.tap - E : E - r.tap] = r.said; }
    return { E, out }; };`);
// leads N-1, N, N+1 each pressed (a script's waits can land a frame off), with whether each gave the outcome
function edges(r, n, got) {
  for (const l of [n - 1, n, n + 1]) assert.ok(r.out[l], `no press landed at lead ${l} (event at frame ${r.E}; leads: ${Object.keys(r.out)})`);
  return [n - 1, n, n + 1].map(l => got(r.out[l]));
}

const PUNCH = { a: [0.5, 'punch'], ax: 330, bx: 375 }, connects = w => w.hits + w.blocks + w.parries > 0;
for (const n of [4, 6, 11]) { // 11: where summed frame times once rounded the tech window short
  test(`parry window ${n} frames: a guard tap ${n - 1} frames before the blow parries, ${n} and ${n + 1} do not`, () => {
    const r = json(`around(${JSON.stringify(PUNCH)}, 'guard', { parryWindow: ${n} / 60, justGuard: false }, ${connects}, ${n})`);
    assert.deepEqual(edges(r, n, s => 'PARRY' in s), [true, false, false]);
  });
  test(`just guard window ${n} frames: guard held from ${n - 1} or ${n} frames before the blow is a just guard, from ${n + 1} a plain block`, () => {
    const r = json(`around(${JSON.stringify(PUNCH)}, { hold: 'guard', t: 2 }, { parry: false, justGuardWindow: ${n} / 60 }, ${connects}, ${n})`);
    assert.deepEqual(edges(r, n, s => 'JUST' in s), [true, true, false]);
  });
  test(`throw break with techWindow ${n} frames: P+G ${n - 1} or ${n} frames into the hold breaks it, ${n + 1} is too late`, () => {
    const r = json(`around({ a: [0.2, 'punch+guard'], ax: 330, bx: 372 }, 'punch+guard', { techWindow: ${n} / 60 }, w => w.b.heldBy, ${n}, true)`);
    assert.deepEqual(edges(r, n, s => 'BREAK' in s), [true, true, false]);
  });
  test(`landing tech with techWindow ${n} frames: G ${n - 1} or ${n} frames before landing techs it, ${n + 1} does not`, () => {
    const r = json(`around({ a: ['down+kick'] }, 'guard', { techWindow: ${n} / 60, airRecover: 0, bounces: 0 }, w => w.b.rag?.landed, ${n})`); // one landing: a press can't tech a bounce instead
    assert.deepEqual(edges(r, n, s => 'TECH' in s), [true, true, false]);
  });
}

test('air recover after 3, 4 and 6 frames of flight: G recovers only once airRecover has passed since the blow sent it flying', () => {
  for (const n of [3, 4, 6]) { // 3: where the summed flight time once fell short of the setting
    // the time from the flight's start to the press, in seconds (the blow lands between substeps, so it is counted exactly, not in frames)
    const r = json(`(() => { const scen = { a: [0.1, '@roundhouse'] }, over = { airRecover: ${n} / 60, techWindow: 0 }, out = [];
      for (let f = 12 + ${n}; f <= 16 + ${n}; f++) { let start = null, tapT = null;
        const s = bplay(scen, [f / 60, 'guard'], over, w => { if (start === null && w.b.kd === 'fly') start = w.simT - w.b.flyT; if (tapT === null && w.b.guardT > 0) tapT = w.b.guardT; });
        out.push({ after: (tapT - start) * 60, ok: 'RECOVER' in s.said }); }
      return out; })()`);
    for (const p of r) assert.equal(p.ok, p.after > n + 1e-6, `airRecover ${n}: G ${p.after.toFixed(2)} frames into the flight ${p.ok ? 'recovered' : 'did not'}`);
    assert.ok(r.some(p => p.ok) && r.some(p => !p.ok), `airRecover ${n}: the presses miss the edge: ${JSON.stringify(r)}`);
  }
});

test('juggle pool: a hit costing 2 juggle points passes through with a pool of 1, lands with 2 and 3', () => {
  const r = json(`[1, 2, 3].map(n => { const kick = CHAR_DEFS.stick.moves.kick, ch = makeCharacter({ ...CHAR_DEFS.stick, moves: { ...CHAR_DEFS.stick.moves, kick: { ...kick, kd: true, knock: 20, launch: 300, juggle: 2 } } });
    const w = new World({ a: [0.1, 'kick', 0.3, 'kick'], b: 'dummy', ax: 330, bx: 375, cfg: { chains: 'none', jugglePoints: n } }, {}, 7, [ch, CHARS.stick]);
    w.loop = false; for (let i = 0; i < 120; i++) w.advance(1 / 60, NOIN); return w.hits; })`);
  assert.deepEqual(r, [1, 2, 2], 'hits with pools 1, 2, 3 (the launcher is free, the airborne follow-up costs 2)');
});
