'use strict';
// ---------- QR codes, drawn in code (no library, no image): an invite link to scan with a phone or a second screen ----------
// Byte mode, error correction level M (about 15% of the code can be smudged or glared and it still reads), versions 1-20 (up to
// 666 bytes; an invite link needs about 8-10). Follows the standard (ISO/IEC 18004) step by step: data bits, Reed-Solomon error
// correction per block, interleaving, the function patterns, the zigzag placement, then the mask with the lowest penalty.
// [total codewords, EC codewords per block, blocks in group 1, data codewords per group-1 block, blocks in group 2 (one more each)]
const QR_M = [null, [26, 10, 1, 16, 0], [44, 16, 1, 28, 0], [70, 26, 1, 44, 0], [100, 18, 2, 32, 0], [134, 24, 2, 43, 0], [172, 16, 4, 27, 0],
  [196, 18, 4, 31, 0], [242, 22, 2, 38, 2], [292, 22, 3, 36, 2], [346, 26, 4, 43, 1], [404, 30, 1, 50, 4], [466, 22, 6, 36, 2], [532, 22, 8, 37, 1],
  [581, 24, 4, 40, 5], [655, 24, 5, 41, 5], [733, 28, 7, 45, 3], [815, 28, 10, 46, 1], [901, 26, 9, 43, 4], [991, 26, 3, 44, 11], [1085, 26, 3, 41, 13]];
const QR_ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58],
  [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90]];
const qrDataCw = v => { const [, ec, b1, d1, b2] = QR_M[v]; return b1 * d1 + b2 * (d1 + 1); };

// GF(256) arithmetic (polynomial 0x11D) and the Reed-Solomon remainder of the data by the generator of the given degree
function qrMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; }
function qrEc(data, degree) {
  const div = Array(degree).fill(0); div[degree - 1] = 1;
  for (let i = 0, root = 1; i < degree; i++, root = qrMul(root, 2))
    for (let j = 0; j < degree; j++) { div[j] = qrMul(div[j], root); if (j + 1 < degree) div[j] ^= div[j + 1]; }
  const r = Array(degree).fill(0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= qrMul(c, f); }); }
  return r;
}

// text → { size, dark(x, y) }, or null if it's too long for version 20
function qrCode(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let v = 1;
  while (v <= 20 && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > qrDataCw(v) * 8) v++;
  if (v > 20) return null;
  // the data bits: byte mode, the length, the bytes, a terminator, then pad bytes to fill the version
  const bits = [], put = (n, len) => { for (let i = len - 1; i >= 0; i--) bits.push((n >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) put(b, 8);
  const cap = qrDataCw(v) * 8;
  put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
  for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => a << 1 | b, 0));
  // split into blocks, each with its error correction; then interleave them column by column
  const [, ecLen, b1, d1, b2] = QR_M[v], blocks = [];
  for (let i = 0, at = 0; i < b1 + b2; i++) { const n = d1 + (i >= b1 ? 1 : 0), d = data.slice(at, at += n); blocks.push({ d, e: qrEc(d, ecLen) }); }
  const cw = [];
  for (let i = 0; i <= d1; i++) for (const b of blocks) if (i < b.d.length) cw.push(b.d[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) cw.push(b.e[i]);

  const size = v * 4 + 17, mod = Array.from({ length: size }, () => Array(size).fill(false)), fn = mod.map(r => r.map(() => false));
  const set = (x, y, on) => { mod[y][x] = on; fn[y][x] = true; };
  // function patterns: timing lines, the three finders, the alignment patterns, then room for the format and version bits
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]])
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  const al = QR_ALIGN[v], last = al.length - 1;
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return; // where the finders are
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const format = mask => {
    const d = 0 << 3 | mask; let r = d; // (level M is 00)
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = (d << 10 | r) ^ 0x5412, bit = i => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true); // the one always-dark module
  };
  format(0);
  if (v >= 7) {
    let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = v << 12 | r;
    for (let i = 0; i < 18; i++) { const on = ((b >>> i) & 1) === 1, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, on); set(c, a, on); }
  }
  // the codewords, two columns at a time in a zigzag from the bottom right, around the function patterns
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing line
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!fn[y][x] && k < cw.length * 8) { mod[y][x] = ((cw[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
    }
  }
  // the mask: each of the eight flips the data modules in its own pattern; the one with the lowest penalty is kept
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
  const apply = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
  let best = 0, low = Infinity;
  for (let m = 0; m < 8; m++) { apply(m); format(m); const p = qrPenalty(mod); if (p < low) { low = p; best = m; } apply(m); }
  apply(best); format(best);
  return { size, version: v, mask: best, dark: (x, y) => mod[y][x] };
}
// the standard's penalty: long runs of one colour, 2x2 blocks, finder-like 1:1:3:1:1 runs, and an uneven dark/light balance
function qrPenalty(mod) {
  const n = mod.length, lines = [...mod, ...mod[0].map((_, x) => mod.map(r => r[x]))];
  let p = 0, dark = 0;
  for (const l of lines) {
    for (let i = 0, run = 1; i < n; i++, run++) if (i === n - 1 || l[i] !== l[i + 1]) { if (run >= 5) p += run - 2; run = 0; }
    const s = l.map(b => b ? 1 : 0).join('');
    p += 40 * ((s.match(/(?=10111010000|00001011101)/g) || []).length);
  }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
  for (const r of mod) for (const b of r) dark += b;
  return p + 10 * Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n));
}
// a QR code as a canvas: dark modules on white with the standard 4-module quiet zone around (light only: it has to scan)
function qrCanvas(text, px = 4) {
  const q = qrCode(text); if (!q) return null;
  const n = q.size + 8, c = document.createElement('canvas'), g = c.getContext('2d');
  c.width = c.height = n * px;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.dark(x, y)) g.fillRect((x + 4) * px, (y + 4) * px, px, px);
  return c;
}
