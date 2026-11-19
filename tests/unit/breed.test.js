// the grid experiments' breeding (src/engine/breed.js) without a page: distinct levels, bouncing at the range ends,
// mutated settings and attacks staying in range and seeded, random attacks aimed by limb, height and pose, saving an
// attack as a move, and every control of the context bar (tests/unit/ui-stub.js stands in for the DOM toolkit)
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load(['core', 'rig', 'fx', 'effects', 'roster', 'fighter', 'world', 'stage', 'brain', 'checks', 'events', 'editor', 'keyedit', 'movetable', 'breed']);
run(require('./ui-stub'));
run(`var clone = o => JSON.parse(JSON.stringify(o)); var studio = { stance: 0, sel: 'uarmF' }; var fmt = v => typeof v === 'number' ? String(+v.toFixed(3)) : String(v);
  var DEFS = mapVals(CHAR_DEFS, clone); var edit = fn => { fn(DEFS[CURRENT]); CHARS[CURRENT] = makeCharacter(DEFS[CURRENT]); };
  var newWorld = (...a) => new World(...a); var lab = { scen: Object.keys(SCENARIOS)[0], kind: 'breed', focus: null }; var builds = 0; var build = () => builds++;
  var modes = []; var setMode = m => modes.push(m); var setCfg = o => { cfgSet = o; }; var cfgSet = null; var optLabel = String;
  var POSES = { guard: { tip: 'High guard' } }; var presetPose = ch => mapVals(ch.poses.stance, v => v + 40);
  var calls = 0; var ctx = new Proxy({}, { get: () => () => calls++, set: () => true }); var text = () => calls++;
  var curStance = (ch = currentChar()) => ch.stances[studio.stance] || ch.stances[0]; var bkey = () => bindsKey(CFG.plane); var curBinds = ch => curStance(ch)[bkey()];
  var unlockedAbove = (ch, b) => { while (b?.lock) b = ch.by[b.parent]; return b; }; var panels = () => {}; var dpr = 1;`);
const js = src => JSON.parse(run(`JSON.stringify((() => { ${src} })())`));

test('breed: levels are distinct and spread over [-1, 1]; bounce reflects off the range ends; snap keeps to the step', () => {
  const r = js(`const lv = levels(8, makeRand(3)); return { lv, one: levels(1, makeRand(1)), b: [bounce(12, 0, 10), bounce(-3, 0, 10), bounce(25, 0, 10), bounce(5, 0, 10)],
    s: snap({ min: 0, max: 1, step: 0.05 }, 0.437), c: snap({ min: 0, max: 1, step: 0.1 }, 7) };`);
  assert.equal(new Set(r.lv).size, 8); assert.equal(Math.min(...r.lv), -1); assert.equal(Math.max(...r.lv), 1);
  assert.deepEqual(r.one, [0]); assert.deepEqual(r.b, [8, 3, 5, 5]); assert.equal(r.s, 0.45); assert.equal(r.c, 1);
});

test('breed: nine cells around a parent, each a seeded variation in range; the label names what changed', () => {
  const r = js(`breed.vars = new Set(['freq', 'zeta', 'hitstop', ...SCHEMA.filter(s => !Array.isArray(s) && (s.opts || typeof s.v === 'boolean')).slice(0, 2).map(s => s.k)]); breed.cfg = null; breed.seed = 1;
    breed.spread = 0.5; const a = breedCells(), b = (breed.cfg = null, breedCells());
    const inRange = a.slice(1).every(c => Object.entries(c.over).every(([k, v]) => SPEC[k].opts ? SPEC[k].opts.includes(v) : typeof SPEC[k].v === 'boolean' ? typeof v === 'boolean' : v >= SPEC[k].min && v <= SPEC[k].max));
    const same = diffLabel({ x: 1 }, { x: 1 }), diff = diffLabel({ x: 1.23456, y: 'a' }, { x: 1, y: 'a' }); breed.spread = 0.15;
    return { n: a.length, parent: a[0].label, labels: a.map(c => c.label), seeded: JSON.stringify(a.map(c => c.over)) === JSON.stringify(b.map(c => c.over)), inRange, same, diff };`);
  assert.equal(r.n, 9); assert.equal(r.parent, 'parent'); assert.ok(r.seeded); assert.ok(r.inRange);
  assert.ok(r.labels.slice(1).every(l => l !== 'parent' && l !== 'same'), r.labels.join(' | '));
  assert.equal(r.same, 'same'); assert.equal(r.diff, 'x=1.235');
});

test('breed: random attacks strike with the asked limb and height, into a pose, and mutate around a parent', () => {
  const r = js(`const ch = currentChar(), out = {}; breed.seed = 2;
    for (const limb of ['any', ...strikeRoles(ch)]) for (const height of ['any', 'high', 'mid', 'low']) { breed.limb = limb; breed.height = height;
      const m = genAttack(ch, makeRand(limb.length + height.length)); out[limb + ' ' + height] = [ch.by[m.hit].role, m.height, m.keys.length]; }
    breed.limb = 'any'; breed.height = 'any'; breed.pose = 'guard'; const posed = genAttack(ch, makeRand(5)); breed.pose = ch.stances[1]?.name || null; const st = breed.pose ? genAttack(ch, makeRand(6)) : posed; breed.pose = null;
    const cells = attackCells(); breed.atk = cells[3].gen; const kids = attackCells(); breed.atk = null;
    const held = kids.slice(1).every(c => JSON.stringify(c.gen.keys[2].p) === JSON.stringify(c.gen.keys[1].p));
    return { out, roles: strikeRoles(ch), posed: [posed.keys.length, posed.height], st: st.keys.length, cells: cells.map(c => c.label), kids: [kids[0].label, kids[0].parent], held,
      ranged: kids.every(c => c.gen.power >= 0.2 && c.gen.power <= 3 && c.gen.knock >= 0 && c.gen.knock <= 600 && c.gen.keys.every(k => k.d >= 1 / 60)) };`);
  for (const [k, [role, height, n]] of Object.entries(r.out)) { const [limb, h] = k.split(' ');
    if (limb !== 'any') assert.equal(role, limb, k); if (h !== 'any') assert.equal(height, h, k); assert.equal(n, 4); }
  assert.equal(r.posed[0], 4); assert.ok(['high', 'mid', 'low'].includes(r.posed[1])); assert.equal(r.st, 4);
  assert.equal(r.cells.length, 9); assert.deepEqual(r.kids, ['parent', true]); assert.ok(r.held, 'a held key stays equal to the strike'); assert.ok(r.ranged);
});

test('breed: saving an attack names it genN once, and edit opens it in animate; the cell buttons draw', () => {
  const r = js(`breed.atk = null; const cells = attackCells(), c = cells[1]; saveAttack(false, c); const first = c.saved; saveAttack(false, c); const again = c.saved;
    saveAttack(true, cells[2]); calls = 0; drawCellButtons(cells[2], { x: 0, y: 0, w: 300, h: 200 }); const small = (drawCellButtons(c, { x: 0, y: 0, w: 100, h: 80 }), c.btns.length);
    return { first, again, second: cells[2].saved, move: anim.move, modes, calls, btns: cells[2].btns.map(b => b.open), small };`);
  assert.match(r.first, /^gen\d+$/); assert.equal(r.again, r.first); assert.notEqual(r.second, r.first);
  assert.equal(r.move, r.second); assert.deepEqual(r.modes, ['animate']); assert.ok(r.calls > 0); assert.deepEqual(r.btns, [true, false]); assert.equal(r.small, 2);
});

test('breed: every control of the breed and attacks bars runs, and a clicked cell becomes the parent', () => {
  const r = js(`const tap = root => { let n = 0; for (const c of controls(root)) { FAKE.pop = null; c.fire('click'); if (c.set) c.set(c.opts ? c.opts.at(-1) : 0.3); n++;
      if (FAKE.pop) for (const p of controls(FAKE.pop)) { p.fire('click'); if (p.set) p.set(0.2); n++; } } return n; };
    FAKE.regs = []; lab.kind = 'breed'; breed.cfg = { freq: 3 }; const b = tap(h('div', {}, breedCtx())); refresh();
    const seed = breed.seed; breedFrom({ over: { freq: 4 } }); const bred = [breed.cfg.freq, breed.seed - seed];
    lab.kind = 'attacks'; lab.focus = { gen: attackCells()[1].gen }; FAKE.regs = []; const a = tap(h('div', {}, breedCtx())); refresh();
    breedFrom({ gen: { power: 1 } }); const atk = breed.atk; lab.focus = null; refresh();
    return { b, a, bred, atk, cfgSet: !!cfgSet, builds, exag: breed.exag, spread: breed.spread };`);
  assert.ok(r.b > 5 && r.a > 10, JSON.stringify(r)); assert.deepEqual(r.bred, [4, 1]); assert.deepEqual(r.atk, { power: 1 });
  assert.ok(r.cfgSet && r.builds > 5); assert.equal(r.exag, 4);
});
