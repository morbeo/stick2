// panel and mode state (src/ui/panelstate.js): tabs of modes, and the stage panel a tab shows as it is opened and closed
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load(['panelstate']);

test('tabs: views belong to their tab, every other mode is its own tab', () => {
  assert.deepEqual(['gallery', 'tests', 'animate', 'sounds', 'weapons', 'play', 'character'].map(m => run(`tabOf(${JSON.stringify(m)})`)),
    ['animate', 'animate', 'animate', 'fx', 'fx', 'play', 'character']);
});

test('home panel: the first look opens it, a closed panel stays closed', () => {
  assert.equal(run(`(() => { const s = {}; panelInit(s, 'bones'); return panelOpen(s); })()`), 'bones');
  assert.equal(run(`(() => { const s = { panel: null }; panelInit(s, 'bones'); return panelOpen(s); })()`), null);
  assert.equal(run(`(() => { const s = {}; return panelInit(s) ?? 'unset'; })()`), 'unset');
});

test('closing a panel goes back to the home panel; closing the home panel leaves none (#66)', () => {
  assert.equal(run(`panelNext('combos', null, 'bones')`), 'bones');
  assert.equal(run(`panelNext('bones', null, 'bones')`), null);
  assert.equal(run(`panelNext('bones', 'table', 'bones')`), 'table');
  assert.equal(run(`panelNext('table', null, undefined)`), null);
  assert.equal(run(`(() => { const s = {}; panelSet(s, 'inputs'); return s.panel; })()`), 'inputs');
});
