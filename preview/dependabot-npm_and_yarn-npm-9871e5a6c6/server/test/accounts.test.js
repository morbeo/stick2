// accounts (server/accounts.js) and what follows them in the relay: names kept, devices linked by code, recovery, ratings and bans per account
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const { Accounts, ACCOUNTS } = require('../accounts');
const { Bans } = require('../moderation');
const { Ratings } = require('../ratings');
const { Relay } = require('../relay');

test('an account keeps its name, links devices by a short code or the recovery code, and lives in a file without device ids', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounts-')), file = path.join(dir, 'accounts.json');
  let t = 0; const A = new Accounts({ file, now: () => t });
  try {
    const { account, recovery } = A.register('phone', 'gogili');
    assert.match(recovery, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.throws(() => A.register('phone', 'other'), /already has an account/);
    assert.throws(() => A.register('laptop', 'GOGILI'), /taken/);
    assert.ok(A.reserved('gogili', 'laptop')); assert.ok(!A.reserved('gogili', 'phone'), 'not from its own devices');
    const { code } = A.linkCode('phone');
    assert.equal(code.length, ACCOUNTS.codeLen);
    assert.equal(A.claim('laptop', code.toLowerCase()), account);
    assert.throws(() => A.claim('tablet', code), /wrong or has run out/, 'a link code works once');
    const late = A.linkCode('phone').code; t += ACCOUNTS.linkMs + 1;
    assert.throws(() => A.claim('tablet', late), /run out/);
    assert.equal(A.claim('tablet', recovery.replace(/-/g, ' ')), account, 'the recovery code works any time');
    assert.equal(account.devices.length, 3);
    assert.equal(A.relink('GOGILI', 'new-phone'), account);
    assert.ok(A.unlink('tablet')); assert.equal(A.of('tablet'), null);
    t += ACCOUNTS.reserveDays * 86400e3 + 1; assert.ok(!A.reserved('gogili', 'someone'), 'unused 90 days: free again');
    const again = new Accounts({ file, now: () => t });
    assert.equal(again.of('laptop').name, 'gogili');
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!text.includes('"phone"') && !text.includes(recovery), 'only hashes');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the relay: an account plays under its name, others get a #tag; ratings move to the account; a ban covers every linked device', () => {
  const accounts = new Accounts(), ratings = new Ratings(), bans = new Bans();
  const relay = new Relay({ accounts, ratings, bans });
  const mk = () => ({ sent: [], send(m) { this.sent.push(m); }, close() {}, last(tp) { return this.sent.filter(m => m.t === tp).at(-1); } });
  ratings.record({ device: 'phone', name: 'gogili' }, { device: 'x', name: 'x' }, 0);
  const a = mk();
  relay.receive(a, { t: 'account', do: 'whoami', device: 'phone' }); assert.equal(a.last('account').name, null);
  relay.receive(a, { t: 'account', do: 'register', device: 'phone', player: 'gogili' });
  const reg = a.last('account'); assert.equal(reg.name, 'gogili'); assert.ok(reg.recovery);
  assert.equal(ratings.get('phone'), null); assert.equal(ratings.byName('gogili').games, 1, 'the device\'s rating went with it');
  relay.receive(a, { t: 'account', do: 'link', device: 'phone' });
  const b = mk(); relay.receive(b, { t: 'account', do: 'claim', device: 'laptop', code: a.last('account').code });
  assert.equal(b.last('account').devices, 2);
  // someone else asking for the name: a #tag; the linked laptop: the name itself, whatever it asks for
  const c = mk(); relay.receive(c, { t: 'host', player: 'gogili', device: 'stranger' }); assert.equal(c.last('room').player, 'gogili#2');
  const d = mk(); relay.receive(d, { t: 'host', player: 'whatever', device: 'laptop' }); assert.equal(d.last('room').player, 'gogili');
  assert.equal(d.account, accounts.of('laptop').id); assert.equal(d.who, 'acct:' + d.account);
  // banned by account: the phone can't play either
  bans.add({ account: d.account, reason: 'spam' });
  const e = mk(); relay.receive(e, { t: 'host', device: 'phone' }); assert.match(e.last('error').error, /^banned: spam/);
  const f = mk(); relay.receive(f, { t: 'account', do: 'link', device: 'phone' }); assert.match(f.last('error').error, /^banned/);
  const g = mk(); relay.receive(g, { t: 'account', do: 'register', device: 'z', player: 'gogili' }); assert.match(g.last('error').error, /taken/);
  assert.match((() => { const x = mk(); new Relay({}).receive(x, { t: 'account', do: 'whoami', device: 'p' }); return x.last('error').error; })(), /^off/);
});
