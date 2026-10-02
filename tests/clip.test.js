// clips: the GIF encoder's files decode back to the frames it was given (within its 5-bit colour steps), with their timing
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { ctx } = load(['clip']);

// a minimal GIF decoder: global palette, graphic control (delay, transparency), LZW image data, frames drawn over the last
function decode(b) {
  let p = 6;
  const u16 = () => b[p++] | b[p++] << 8, W = u16(), H = u16(), flags = b[p]; p += 3;
  const pal = []; for (let i = 0; i < 2 << (flags & 7); i++) pal.push([b[p++], b[p++], b[p++]]);
  const screen = new Uint8Array(W * H * 3), frames = [];
  let delay = 0, trans = -1, loops = false;
  for (;;) {
    const t = b[p++];
    if (t === 0x3b) break;
    if (t === 0x21) {
      const label = b[p++];
      if (label === 0xf9) { p++; const f = b[p++]; delay = u16(); trans = f & 1 ? b[p] : -1; p += 2; continue; }
      if (label === 0xff && String.fromCharCode(...b.slice(p + 1, p + 12)) === 'NETSCAPE2.0') loops = true;
      while (b[p]) p += b[p] + 1;
      p++; continue;
    }
    const x0 = u16(), y0 = u16(), w = u16(), h = u16(); p++;
    const min = b[p++], data = [];
    while (b[p]) { data.push(...b.slice(p + 1, p + 1 + b[p])); p += b[p] + 1; }
    p++;
    const CLEAR = 1 << min, EOI = CLEAR + 1, out = [];
    let size = min + 1, dict = [], prev = null, bit = 0;
    const reset = () => { dict = Array.from({ length: CLEAR + 2 }, (_, i) => [i]); size = min + 1; prev = null; };
    reset();
    for (;;) {
      let code = 0;
      for (let i = 0; i < size; i++, bit++) code |= (data[bit >> 3] >> (bit & 7) & 1) << i;
      if (code === CLEAR) { reset(); continue; }
      if (code === EOI) break;
      const entry = dict[code] || [...prev, prev[0]];
      out.push(...entry);
      if (prev) dict.push([...prev, entry[0]]);
      prev = entry;
      if (dict.length === 1 << size && size < 12) size++;
    }
    assert.equal(out.length, w * h, 'pixel count of a frame');
    out.forEach((k, i) => { if (k === trans) return; const o = ((y0 + Math.floor(i / w)) * W + x0 + i % w) * 3; screen.set(pal[k], o); });
    frames.push({ px: screen.slice(), delay });
  }
  return { W, H, frames, loops };
}

// a beige background with a dark square sliding right, its edge soft; frame 3 repeats frame 2
function frames(W, H) {
  return [0, 1, 2, 2, 3].map(f => {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.max(Math.abs(x - 8 - f * 6), Math.abs(y - H / 2)), k = Math.min(1, Math.max(0, d - 4) / 3), o = (y * W + x) * 4;
      px.set([243 * k + 40 * (1 - k), 240 * k + 30 * (1 - k), 232 * k + 200 * (1 - k), 255], o);
    }
    return px;
  });
}

test('a GIF decodes back to its frames, loops, and an unchanged frame lengthens the one before', () => {
  const W = 40, H = 20, src = frames(W, H), delays = [3, 3, 4, 3, 4];
  const gif = decode(Buffer.from(ctx.gifEncode(src, W, H, delays)));
  assert.deepEqual([gif.W, gif.H, gif.loops], [W, H, true]);
  assert.deepEqual(gif.frames.map(f => f.delay), [3, 3, 7, 4]);
  const keep = [0, 1, 2, 4];
  gif.frames.forEach((f, n) => {
    let worst = 0;
    for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(f.px[i * 3 + c] - src[keep[n]][i * 4 + c]));
    assert.ok(worst <= 12, `frame ${n}: a channel off by ${worst}`);
  });
});

test('a big noisy frame fills the LZW table past 4096 codes and still decodes', () => {
  const W = 120, H = 90, px = new Uint8ClampedArray(W * H * 4);
  let s = 7; const rnd = () => (s = s * 16807 % 2147483647) % 256;
  for (let i = 0; i < W * H; i++) px.set([rnd(), rnd(), rnd(), 255], i * 4);
  const gif = decode(Buffer.from(ctx.gifEncode([px], W, H, [4])));
  assert.equal(gif.frames.length, 1);
});

test('GIF delays add up to the clip length at 30 fps', () => {
  const ts = Array.from({ length: 31 }, (_, i) => i * 1000 / 30), d = [...ctx.gifDelays(ts)];
  assert.ok(d.every(v => v === 3 || v === 4), d.join());
  assert.equal(d.reduce((a, b) => a + b, 0), Math.round(31 * 100 / 30));
});
