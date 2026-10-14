// QR codes (src/qr.js): the structure every reader looks for, and pinned matrices (each checked once against an independent
// decoder, jsQR, along with every version 1-20 and all eight masks; a change here should be checked the same way again)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const ctx = vm.createContext({ TextEncoder, Math, Array, Infinity });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'qr.js'), 'utf8'), ctx);
const qrCode = vm.runInContext('qrCode', ctx);
const bitmap = q => Array.from({ length: q.size }, (_, y) => Array.from({ length: q.size }, (_, x) => q.dark(x, y) ? '1' : '0').join('')).join('\n');
const INVITE = 'https://morbeo.github.io/stick2/#join=s2b.o~xB-4~b3MTNSUM9YJkEu_PToYYdZF9~61eMNf_dbSDP-WitbLpbxVgwAuop7ASJB-ZzPqb5Ew~hmlLmAmnevQaGAY-4YCAgWzw~55930~s4203.0.113.7~61234';

test('a QR code has the finders, timing lines and dark module where readers look, at the smallest version that fits', () => {
  for (const [text, version] of [['stick2', 1], [INVITE, 9], ['x'.repeat(300), 13], ['x'.repeat(666), 20]]) {
    const q = qrCode(text), n = q.size;
    assert.equal(q.version, version, text.length + ' bytes');
    assert.equal(n, version * 4 + 17);
    for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      assert.equal(q.dark(ox + x, oy + y), d !== 2, `finder at ${ox},${oy}`);
    }
    for (let i = 8; i < n - 8; i++) { assert.equal(q.dark(6, i), i % 2 === 0); assert.equal(q.dark(i, 6), i % 2 === 0); }
    assert.ok(q.dark(8, n - 8), 'the dark module');
  }
  assert.equal(qrCode('x'.repeat(667)), null, 'too long for version 20');
});

test('QR matrices are pinned (checked against jsQR)', () => {
  const sha = q => crypto.createHash('sha1').update(bitmap(q)).digest('hex').slice(0, 16);
  assert.deepEqual([qrCode('stick2'), qrCode(INVITE)].map(q => [q.version, q.mask, sha(q)]), [[1, 2, '5d744e17951b1c65'], [9, 2, '422370b98f5026aa']]);
});
