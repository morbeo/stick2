// the input table (src/engine/inputs.js) and the combo editor (src/engine/combos.js) without a page: tests/unit/ui-stub.js
// stands in for the DOM toolkit, both views are built, every control and popup in them clicked, and the edits checked
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load(['core', 'rig', 'fx', 'effects', 'roster', 'fighter', 'world', 'stage', 'brain', 'checks', 'events', 'editor', 'keyedit', 'movetable', 'inputs', 'combos']);
run(require('./ui-stub'));
// the combo view looks up and places its warning row: elements here have no tree to search
run(`var fmt = v => typeof v === 'number' ? String(+v.toFixed(3)) : String(v); var el0 = el; el = (...a) => Object.assign(el0(...a), { querySelector: () => null, before() {} });`);
run(`var clone = o => JSON.parse(JSON.stringify(o)); var studio = { stance: 0, sel: 'uarmF' };
  var DEFS = mapVals(CHAR_DEFS, clone); var edits = 0;
  var edit = fn => { fn(DEFS[CURRENT]); CHARS[CURRENT] = makeCharacter(DEFS[CURRENT]); edits++; };
  var curStance = (ch = currentChar()) => ch.stances[studio.stance] || ch.stances[0]; var bkey = () => bindsKey(CFG.plane);
  var curBinds = ch => curStance(ch)[bkey()]; var editBinds = def => def[bkey()] ??= {}; var viewChar = () => currentChar();
  var opened = []; var openMove = n => opened.push(n); var peeks = 0; var peekSeq = () => peeks++;
  var setCfg = o => Object.assign(CFG, o); var panels = () => {}; var restarts = 0; var mode = () => ({ restart: () => restarts++ });
  var nextOf = (def, n) => def.moves[n].next; var setNext = (def, n, next) => { def.moves[n].next = next; };
  var tapAll = (root, seen = new Set(), depth = 0) => { for (const c of controls(root)) { const key = c.label + '|' + c.tip; if (seen.has(key) || depth > 3) continue; seen.add(key);
    FAKE.pop = null; try { c.fire('click'); c.fire('mousemove'); c.fire('mouseleave'); if (c.tag === 'input') { c.fire('keydown'); c.fire('change', { target: { value: '7' } }); c.fire('change', { target: { value: '' } }); } } catch (e) { throw new Error((c.label || c.tag) + ': ' + e.message); }
    if (FAKE.pop) tapAll(FAKE.pop, seen, depth + 1); } return seen.size; };`);
const js = src => JSON.parse(run(`JSON.stringify((() => { ${src} })())`));

test('combos: link names, buttons, directions and keys round-trip', () => {
  const r = js(`return ['punch', 'kick', 'special', '6P', '2K', 'fwdSpecial', 'downSpecial'].map(b => [linkName(b), linkBtn(b), linkDir(b), linkKey(linkBtn(b), linkDir(b))]);`);
  assert.deepEqual(r, [['P', 'P', 5, 'punch'], ['K', 'K', 5, 'kick'], ['S', 'S', 5, 'special'], ['6P', 'P', 6, '6P'], ['2K', 'K', 2, '2K'], ['6S', 'S', 6, 'fwdSpecial'], ['2S', 'S', 2, 'downSpecial']]);
  assert.match(js(`return frameTip(currentChar().moves.jab)`), /^\d+f startup, \d+f active, \d+f recovery$/);
});

test('combos: links are set, moved and cut; both views and every popup run', () => {
  const r = js(`
    setLink('jab', '6P', 'jab'); const set = currentChar().moves.jab.next?.['6P'];
    setLink('jab', '6P', ''); const cut = currentChar().moves.jab.next?.['6P'];
    setCfg({ chains: 'off' }); const tree = tapAll(comboView()); combos.view = 'table'; const table = tapAll(comboView()); combos.view = 'tree';
    const chains = CFG.chains; setCfg({ chains: 'authored' });
    return { set, cut, tree, table, opened: opened.length > 0, chains };`);
  assert.equal(r.set, 'jab'); assert.equal(r.cut, undefined);
  assert.ok(r.tree > 5 && r.table > 5, JSON.stringify(r)); assert.ok(r.opened); assert.equal(r.chains, 'off');
});

test('inputs: cells try their slots in Fighter.pick order, and a cell knows its own, fallback and alias state', () => {
  const r = js(`const P = INPUT_PADS[0].cells, A = INPUT_PADS[3].cells, S = INPUT_PADS[2].cells;
    return { p3: P[8].chain, p5: P[4].chain, a9: A[2], s9: S[2], s6: S[5].chain, arrows: motionArrows('236'), tip: slotTip('m214Punch'),
      states: P.map(c => cellState(c, curBinds(currentChar()), currentChar()).st) };`);
  assert.deepEqual(r.p3, ['downFwdPunch', 'downPunch', 'punch']); assert.deepEqual(r.p5, ['punch']);
  assert.equal(r.a9.own, false); assert.deepEqual(r.s9.chain, ['upSpecial', 'special']); assert.deepEqual(r.s6, ['fwdSpecial', 'special']);
  assert.equal(r.arrows, '↓↘→'); assert.match(r.tip, /Motion ↓↙← \(214\) \+ J/);
  assert.ok(r.states.includes('set') && r.states.every(s => ['set', 'fall', 'none', 'alias'].includes(s)), r.states.join());
});

test('inputs: binds are set and cleared, custom inputs added and removed, and every control of the table runs', () => {
  const r = js(`
    assign('6P', 'jab'); const set = editBinds(DEFS[CURRENT])['6P']; assign('6P', undefined); const cleared = '6P' in editBinds(DEFS[CURRENT]);
    const n = tapAll(inputTable()); inputs.table = true; const t = tapAll(inputTable()); inputs.table = false;
    inputs.hand = Object.keys(WEAPON_CLASSES)[0]; const w = tapAll(inputTable()); const wd = defaultBind('punch'); inputs.hand = '';
    studio.stance = 0; DEFS[CURRENT].motions = { m41236: '41236' }; CHARS[CURRENT] = makeCharacter(DEFS[CURRENT]);
    const cells = customCells().map(c => c.label); removeInput('m41236');
    return { set, cleared, n, t, w, wd, cells, left: Object.keys(DEFS[CURRENT].motions || {}), edits, restarts };`);
  assert.equal(r.set, 'jab'); assert.equal(r.cleared, false);
  assert.ok(r.n > 10 && r.t > 10 && r.w > 10, JSON.stringify(r)); assert.ok(r.wd); assert.ok(r.restarts > 0, 'the plane switch restarts the fight');
  assert.deepEqual(r.cells, ['41236P', '41236K']); assert.ok(r.edits > 5, 'the number fields edit the moves'); assert.deepEqual(r.left, []);
});
