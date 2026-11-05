// identity keys (src/net/identity.js): made once and kept, a signature a server can check, a fingerprint, export and import
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('crypto');
const { identityKeys, identitySign, identityPrint, identityExport, identityImport } = require('../../src/net/identity');
const mem = () => { let v = null; return { get: () => v, set: x => { v = x; } }; };

test('a key is made once, signs a nonce the way the server checks it, and carries to another device', async () => {
  const a = mem(), k = await identityKeys(a);
  assert.deepEqual(await identityKeys(a), k, 'kept');
  const m = await identitySign('abc', k);
  assert.equal(m.t, 'auth'); assert.equal(m.key.d, undefined, 'no private part');
  const ok = n => crypto.verify('sha256', Buffer.from('stick2-auth:' + n), { key: m.key, format: 'jwk', dsaEncoding: 'ieee-p1363' }, Buffer.from(m.sig, 'base64url'));
  assert.ok(ok('abc')); assert.ok(!ok('abd'));
  assert.match(identityPrint(k), /^[A-Z0-9_-]{4}-[A-Z0-9_-]{4}$/); assert.equal(identityPrint(null), '');
  const b = mem(), k2 = identityImport(identityExport(k), b);
  assert.equal(identityPrint(k2), identityPrint(k));
  assert.deepEqual((await identityKeys(b)).pub.x, k.pub.x, 'the other device keeps it');
  assert.throws(() => identityImport('hello'), /not a stick2 key/);
  assert.throws(() => identityImport('stick2-key:%%%'), /damaged/);
  assert.throws(() => identityImport('stick2-key:' + btoa('{"kty":"RSA"}')), /damaged/);
});
