// the relay only shows the lobby phases src/net/lobby.js lists (LOBBY_PHASES): a host can't put any other string in the room list
const test = require('node:test'), assert = require('node:assert/strict');
const { Relay } = require('../relay');

test('an unknown phase from a host is ignored; a known one is taken', () => {
  const relay = new Relay({}), r = { phase: 'lobby' };
  relay.watch(r, { t: 'lobby', state: { phase: '<b>junk</b>', slots: [] } });
  assert.equal(r.phase, 'lobby');
  relay.watch(r, { t: 'lobby', state: { phase: 'toString', slots: [] } });
  assert.equal(r.phase, 'lobby');
  relay.watch(r, { t: 'lobby', state: { phase: 'match', slots: [] } });
  assert.equal(r.phase, 'match');
});
