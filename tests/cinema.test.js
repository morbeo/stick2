// the Cinema settings: defaults play as before, each setting does what it says, the drawing-only ones never change the fight
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load();
// a fight for n frames with settings over; watch(w) runs after every frame
run(`var cine = (scen, over, n = 150, watch) => { const w = new World(SCENARIOS[scen] || scen, over, 7, [CHARS.stick, CHARS.stick]); w.loop = false;
  for (let i = 0; i < n && !w.done; i++) { w.advance(1/60, NOIN); watch?.(w); } return w; };`);
run(`var stubCtx = () => new Proxy({}, { get: (t, k) => k in t ? t[k] : () => {}, set: (t, k, v) => (t[k] = v, true) });`);

test('the Cinema defaults are the values the engine used before', () => {
  const d = run(`JSON.stringify(Object.fromEntries(['slowmoT', 'slowmoRate', 'slowCounter', 'slowParry', 'slowKO', 'koFreeze', 'traumaHit', 'traumaBlock', 'traumaDecay',
    'camFollow', 'camMargin', 'camHeight', 'camLead', 'punchIn', 'knockScale', 'launchScale', 'comboGravity', 'letterbox', 'impactFrames', 'speedLines'].map(k => [k, DEFAULTS[k]])))`);
  assert.deepEqual(JSON.parse(d), { slowmoT: 0.35, slowmoRate: 0.3, slowCounter: 0, slowParry: 0, slowKO: 0, koFreeze: 0, traumaHit: 0.3, traumaBlock: 0.1, traumaDecay: 1.6,
    camFollow: 0.15, camMargin: 260, camHeight: 0.3, camLead: 0, punchIn: 0, knockScale: 1, launchScale: 1, comboGravity: 1, letterbox: false, impactFrames: false, speedLines: false });
  assert.ok(run(`SCHEMA.filter(s => !Array.isArray(s)).every(s => s.tip)`), 'every setting has a tip');
});

test('camera, shake and the drawing-only effects never change the fight', () => {
  const look = { letterbox: true, impactFrames: true, speedLines: true, camLead: 0.3, camFollow: 0.5, camMargin: 100, camHeight: 0.1, punchIn: 0.4, traumaHit: 1, traumaDecay: 0.5 };
  for (const s of ['air combo', 'J,J,K', 'fireball']) {
    const r = run(`(() => { const ctx = stubCtx(), a = cine(${JSON.stringify(s)}, ${JSON.stringify(look)}, 200, w => w.render(ctx, { x: 0, y: 0, w: 800, h: 450 }, false)), b = cine(${JSON.stringify(s)}, {}, 200);
      return [a.stateHash(), b.stateHash(), a.hits]; })()`);
    assert.equal(r[0], r[1], s), assert.ok(r[2] > 0, s);
  }
});

test('slowmoT sets the finisher slow motion, slowmoRate its speed', () => {
  const most = over => run(`(() => { let m = 0; cine('J,J,K', ${JSON.stringify(over)}, 150, w => { m = Math.max(m, w.slowT); }); return m; })()`);
  assert.equal(most({}), 0.35);
  assert.ok(Math.abs(most({ slowmoT: 1.2 }) - 1.2) < 0.02);
  assert.equal(most({ slowmo: false, slowKO: 0 }), 0);
  // slower slow motion: less fight time passes in the same frames
  const simT = over => run(`cine('J,J,K', ${JSON.stringify(over)}, 90).simT`);
  assert.ok(simT({ slowmoRate: 0.1 }) < simT({}));
});

test('knockScale and launchScale change how far and how high a hit sends the victim', () => {
  const far = over => run(`cine({ a: [0.1, 'punch'], b: 'dummy', ax: 330, bx: 375, period: 3 }, ${JSON.stringify(over)}, 40).b.x`);
  assert.ok(far({ knockScale: 2 }) - 375 > (far({}) - 375) * 1.5);
  const high = over => run(`(() => { let top = 0; cine('J,J,K', ${JSON.stringify(over)}, 120, w => { top = Math.min(top, w.b.y); }); return top; })()`);
  assert.ok(high({ launchScale: 2 }) < high({}) - 10);
});

test('comboGravity drops a juggled body sooner', () => {
  const air = over => run(`(() => { let n = 0; cine('air combo', ${JSON.stringify(over)}, 190, w => { if (!w.b.grounded) n++; }); return n; })()`);
  assert.ok(air({ comboGravity: 2.5 }) < air({}));
});

test('slow motion on counter hit, parry and K.O.; a K.O. freeze stops everyone', () => {
  const most = (scen, over) => run(`(() => { let m = 0; cine(${JSON.stringify(scen)}, ${JSON.stringify(over)}, 120, w => { m = Math.max(m, w.slowT); }); return m; })()`);
  assert.equal(most('parry', {}), 0);
  assert.ok(most('parry', { slowParry: 0.8 }) > 0.7);
  const trade = { a: [0.05, 'punch'], b: [0.1, 'kick'], ax: 330, bx: 380, period: 2 }; // b is caught starting its kick
  assert.equal(most(trade, { slowmo: false }), 0);
  assert.ok(most(trade, { slowmo: false, slowCounter: 0.6 }) > 0.5);
  const r = run(`(() => { const s = { a: [0.1, '@roundhouse'], b: 'dummy', bx: 385, cfg: { health: 100 }, init: w => { w.b.hp = 1; } };
    let slow = 0, frozen = 0; cine(s, { slowKO: 1.5, koFreeze: 0.5 }, 120, w => { slow = Math.max(slow, w.slowT); if (w.a.freeze > 0.3 && w.b.freeze > 0.3) frozen++; });
    let slow0 = 0; cine(s, {}, 120, w => { slow0 = Math.max(slow0, w.slowT); });
    return [slow, frozen, slow0]; })()`);
  assert.ok(r[0] > 1.4, 'K.O. slow motion ' + r[0]), assert.ok(r[1] > 0, 'K.O. freeze'), assert.equal(r[2], 0.35);
});
