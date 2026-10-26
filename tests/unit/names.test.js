// player names (src/net/names.js): the seeded generator and the filter both the app and the server run
const test = require('node:test'), assert = require('node:assert/strict');
const { NAMES, nameGen, nameClean, nameFold, nameSeed } = require('../../src/net/names');

test('the same seed always makes the same name; names pass the filter and stay 3-10 letters', () => {
  assert.equal(nameGen('abc'), nameGen('abc'));
  const names = Array.from({ length: 500 }, (_, i) => nameGen('seed' + i));
  for (const n of names) {
    assert.equal(nameClean(n), n, n);
    assert.ok(n.replace('-', '').length >= NAMES.min && n.replace('-', '').length <= 10, n);
    assert.doesNotMatch(n, /([aeiou])\1\1/, n);
  }
  assert.ok(new Set(names).size > 400, 'names vary');
  assert.ok(names.some(n => n.includes('-')), 'some hyphen doubles');
  assert.ok(names.some(n => /^(.+)\1$/.test(n)), 'some doubled words');
});

test('the filter: length, charset, lookalikes, reserved and rude words, extra words', () => {
  assert.equal(nameClean('  gus   the bus '), 'gus the bus');
  assert.equal(nameClean('Ádám'), 'Ádám');
  for (const bad of ['ab', 'x'.repeat(17), '<b>hi</b>', 'Adm1n', 'MODERATOR', 'sh1t', 'f.u.c.k', 'shіt' /* cyrillic і */, null, ''])
    assert.equal(nameClean(bad), null, String(bad));
  assert.equal(nameClean('zero\u200bwidth'), 'zerowidth'); // invisible characters dropped
  assert.equal(nameClean('gogili', ['gogi']), null);
  assert.equal(nameFold('Ж0Ш'), 'o');
  assert.match(nameSeed(), /^[a-z0-9]{4,}$/);
});
