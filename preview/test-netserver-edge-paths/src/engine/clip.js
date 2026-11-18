'use strict';
// ---------- clips: the last seconds of the view, or a recording, saved as an animated GIF or a WebM video ----------
// The view's pixels are copied as they are drawn (only the part being watched: the fight, the preview or the cell under the mouse),
// so a clip is exactly what was on screen, whatever changed the fight (inputs, blows, edits).

// ---------- GIF encoder (no DOM: node-loadable for the tests) ----------
// one 255-colour palette for the whole clip (median cut over 5-bit RGB), index 255 = transparent: a frame keeps only the
// rectangle that changed since the one before, and in it the unchanged pixels are transparent (small files for still backgrounds)
function gifPalette(frames) {
  const hist = new Uint32Array(32768);
  for (const px of frames) for (let i = 0; i < px.length; i += 8) hist[(px[i] >> 3) << 10 | (px[i + 1] >> 3) << 5 | px[i + 2] >> 3]++;
  const cols = [];
  for (let k = 0; k < 32768; k++) if (hist[k]) cols.push(k);
  const ch = (k, c) => k >> (10 - c * 5) & 31;
  let boxes = [cols];
  while (boxes.length < 255) { // split the box with the widest channel range at its weighted median
    let best = null, bi = -1, bc = 0, br = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 31, hi = 0;
        for (const k of b) { const v = ch(k, c); if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo > br) { br = hi - lo; best = b; bi = i; bc = c; }
      }
    });
    if (!best) break;
    best.sort((a, b) => ch(a, bc) - ch(b, bc));
    const half = best.reduce((s, k) => s + hist[k], 0) / 2;
    let acc = 0, cut = 1;
    for (; cut < best.length - 1; cut++) { acc += hist[best[cut - 1]]; if (acc >= half) break; }
    boxes.splice(bi, 1, best.slice(0, cut), best.slice(cut));
  }
  return boxes.map(b => { // the box's weighted mean colour
    let n = 0, r = 0, g = 0, bl = 0;
    for (const k of b) { const w = hist[k]; n += w; r += w * ch(k, 0); g += w * ch(k, 1); bl += w * ch(k, 2); }
    return [r, g, bl].map(v => Math.round(v / n * 255 / 31));
  });
}
// GIF LZW: codes grow from 9 bits up to 12, then a clear code starts the table again
function gifLzw(idx, out) {
  const CLEAR = 256, EOI = 257;
  let size = 9, next = 258, dict = new Map(), cur = 0, bits = 0, block = [];
  const put = code => {
    cur |= code << bits; bits += size;
    while (bits >= 8) { block.push(cur & 255); cur >>= 8; bits -= 8; if (block.length === 255) { out.push(255, ...block); block = []; } }
  };
  out.push(8);
  put(CLEAR);
  let w = idx[0];
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i], key = w << 8 | k, hit = dict.get(key);
    if (hit !== undefined) { w = hit; continue; }
    put(w);
    if (next < 4096) { dict.set(key, next++); if (next > 1 << size && size < 12) size++; }
    else { put(CLEAR); dict = new Map(); next = 258; size = 9; }
    w = k;
  }
  put(w); put(EOI);
  if (bits) block.push(cur & 255);
  if (block.length) out.push(block.length, ...block);
  out.push(0);
}
// frames: RGBA pixel arrays of w × h; delays in hundredths of a second (browsers slow anything under 2 to 10, so 2 at least)
function gifEncode(frames, w, h, delays) {
  const pal = gifPalette(frames), cache = new Int16Array(32768).fill(-1);
  const near = k => { // nearest palette colour of a 5-bit RGB key, remembered
    if (cache[k] >= 0) return cache[k];
    const r = (k >> 10) * 255 / 31, g = (k >> 5 & 31) * 255 / 31, b = (k & 31) * 255 / 31;
    let bi = 0, bd = Infinity;
    pal.forEach(([pr, pg, pb], i) => { const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2; if (d < bd) { bd = d; bi = i; } });
    return cache[k] = bi;
  };
  const out = [], u16 = v => out.push(v & 255, v >> 8);
  out.push(...[...'GIF89a'].map(c => c.charCodeAt(0))); u16(w); u16(h); out.push(0xf7, 0, 0); // a global table of 256 colours
  for (let i = 0; i < 256; i++) out.push(...pal[i] || [0, 0, 0]);
  out.push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map(c => c.charCodeAt(0)), 3, 1, 0, 0, 0); // loop forever
  let shown = null;
  const parts = [];
  frames.forEach((px, f) => {
    const idx = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < idx.length; i++, p += 4) idx[i] = near((px[p] >> 3) << 10 | (px[p + 1] >> 3) << 5 | px[p + 2] >> 3);
    let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1;
    if (shown) { // the rectangle that changed; nothing changed = the frame before stays up longer
      x0 = w; y0 = h; x1 = -1; y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (idx[y * w + x] !== shown[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
      if (x1 < 0) { parts[parts.length - 1].delay += delays[f]; return; }
    }
    const rw = x1 - x0 + 1, rh = y1 - y0 + 1, sub = new Uint8Array(rw * rh);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const i = (y0 + y) * w + x0 + x;
      sub[y * rw + x] = shown && idx[i] === shown[i] ? 255 : idx[i];
    }
    parts.push({ x0, y0, rw, rh, sub, delay: delays[f], trans: !!shown });
    shown = idx;
  });
  for (const p of parts) {
    out.push(0x21, 0xf9, 4, 4 | (p.trans ? 1 : 0)); u16(Math.max(2, Math.round(p.delay))); out.push(255, 0); // keep the frame under the next
    out.push(0x2c); u16(p.x0); u16(p.y0); u16(p.rw); u16(p.rh); out.push(0);
    gifLzw(p.sub, out);
  }
  out.push(0x3b);
  return new Uint8Array(out);
}
// delays in hundredths of a second from frame times in ms, rounded so they add up to the real length (30 fps = 3, 3, 4, …)
function gifDelays(ts) {
  const gap = ts.length > 1 ? (ts[ts.length - 1] - ts[0]) / (ts.length - 1) : 40;
  return ts.map((t, i) => Math.round(((ts[i + 1] ?? t + gap) - ts[0]) / 10) - Math.round((t - ts[0]) / 10));
}

// ---------- capture: a rolling buffer of the subject's pixels, and recordings ----------
const CLIP_SECS = [3, 5, 10], CLIP_SIZES = [320, 480, 720], CLIP_FPS = [15, 30, 50], CLIP_FMTS = ['gif', 'webm'], REC_MAX = 20;
const clip = { frames: [], pool: [], key: null, last: 0, rec: null, busy: '', mx: -1, my: -1, el: null };
const clipSet = () => ui.clip ??= { fmt: 'gif', secs: 5, size: 480, fps: 30, aspect: 'view', fit: 'crop' };
const CLIP_ASPECTS = { view: null, '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '9:16': 9 / 16 };
// what gets filmed: the rect (of the mode's clipRects) under the mouse, else the first; the whole view in modes without any
function clipSubject() {
  const rs = mode().clipRects?.() ?? [{ key: 'view', r: { x: 0, y: 0, w: canvas.width, h: canvas.height } }];
  if (clip.rec) return rs.find(s => s.key === clip.rec.key); // a recording keeps filming what it started on
  return rs.find(({ r }) => clip.mx >= r.x && clip.mx < r.x + r.w && clip.my >= r.y && clip.my < r.y + r.h) || rs[0];
}
const dropFrames = n => clip.pool.push(...clip.frames.splice(0, n).map(f => f.c));
// after each drawn frame that moved the fights on (a paused view adds nothing)
function clipCapture(now, ran) {
  if (clip.rec && clip.el) setRich(clip.el, `:stop: ${((now - clip.rec.t0) / 1000).toFixed(1)}s`);
  if (!ran || clip.busy) return;
  const set = clipSet();
  if (now - clip.last < 1000 / set.fps - 4) return;
  const s = clipSubject();
  if (!s) return;
  // another shape than the subject's: crop its middle, or fit all of it inside with bars
  const { r } = s, a = CLIP_ASPECTS[set.aspect] ?? r.w / r.h, box = set.fit === 'letterbox' ? r : r.w / r.h > a ? { ...r, x: r.x + (r.w - r.h * a) / 2, w: r.h * a } : { ...r, y: r.y + (r.h - r.w / a) / 2, h: r.w / a };
  const w = Math.round(Math.min(set.size, r.w / dpr) / 2) * 2, ht = Math.round(w / a / 2) * 2;
  if (w < 2 || ht < 2) return;
  const key = [s.key, w, ht];
  if (clip.key?.some((k, i) => k !== key[i])) dropFrames(clip.frames.length); // another subject or size: start over
  clip.key = key; clip.last = now;
  const c = clip.pool.pop() || document.createElement('canvas');
  c.width = w; c.height = ht;
  const g = c.getContext('2d'), k = Math.min(w / box.w, ht / box.h);
  if (set.fit === 'letterbox') { g.fillStyle = '#f3f0e8'; g.fillRect(0, 0, w, ht); }
  g.drawImage(canvas, box.x, box.y, box.w, box.h, (w - box.w * k) / 2, (ht - box.h * k) / 2, box.w * k, box.h * k);
  clip.frames.push({ c, t: now });
  if (clip.rec) { if (now - clip.rec.t0 > REC_MAX * 1000) toggleRecord(); }
  else { let n = 0; while (clip.frames[n] && clip.frames[n].t < now - set.secs * 1000) n++; dropFrames(n); }
}
function toggleRecord() {
  if (clip.busy) return;
  if (clip.rec) { const frames = clip.frames.filter(f => f.t >= clip.rec.t0); clip.rec = null; saveClip(frames); syncAll(); return; }
  const s = clipSubject();
  if (!s) return;
  clip.rec = { key: s.key, t0: performance.now() };
  syncAll();
}
const saveLast = () => saveClip(clip.frames.filter(f => f.t >= performance.now() - clipSet().secs * 1000));
const clipName = ext => { const d = new Date(), p = v => String(v).padStart(2, '0'); // local time
  return `stick2-${app.mode}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`; };
function saveBlob(name, blob) { const a = h('a', { href: URL.createObjectURL(blob), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
const tick = () => new Promise(r => setTimeout(r));
async function saveClip(frames) {
  if (clip.busy) return;
  if (frames.length < 2) { clip.busy = 'nothing yet'; syncAll(); setTimeout(() => { clip.busy = ''; syncAll(); }, 1200); return; }
  const kind = clipSet().fmt, { width: w, height: ht } = frames[0].c, delays = gifDelays(frames.map(f => f.t));
  const busy = t => { clip.busy = t; syncAll(); };
  busy(kind === 'gif' ? 'GIF…' : 'WebM…'); // capture waits meanwhile, so the frames' canvases are not reused
  try {
    if (kind === 'gif') {
      const px = frames.map(f => f.c.getContext('2d').getImageData(0, 0, w, ht).data);
      await tick();
      saveBlob(clipName('gif'), new Blob([gifEncode(px, w, ht, delays)], { type: 'image/gif' }));
    } else { // the browser's own video encoder, fed the frames at their real pace (so saving takes as long as the clip)
      const c = h2canvas(w, ht), stream = c.captureStream(0), track = stream.getVideoTracks()[0], chunks = [];
      const type = ['video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4e6 }), done = new Promise(r => { rec.onstop = r; });
      rec.ondataavailable = e => chunks.push(e.data);
      rec.start();
      for (let i = 0; i < frames.length; i++) {
        busy(`WebM ${Math.round(100 * i / frames.length)}%`);
        c.getContext('2d').drawImage(frames[i].c, 0, 0); track.requestFrame();
        await new Promise(r => setTimeout(r, delays[i] * 10));
      }
      rec.stop(); await done;
      saveBlob(clipName('webm'), new Blob(chunks, { type: 'video/webm' }));
    }
  } finally { busy(''); }
}
const h2canvas = (w, ht) => Object.assign(document.createElement('canvas'), { width: w, height: ht });

// the top bar's clip group: save the last seconds, record / stop, and the clip settings
const CLIP_TIPS = {
  gif: 'GIF: loops by itself and plays anywhere (chats, pages); 255 colours, bigger files',
  webm: 'WebM video: small files, every colour; saving takes as long as the clip (the browser encodes it in real time)',
  3: 'Keep the last 3 seconds', 5: 'Keep the last 5 seconds', 10: 'Keep the last 10 seconds',
  320: '320 px wide (smaller files)', 480: '480 px wide', 720: '720 px wide (never wider than the view itself)',
  15: '15 frames a second (smaller files)', 30: '30 frames a second (smooth)', 50: '50 frames a second (the most a GIF plays)',
  crop: 'Crop: fill the shape, cutting off the sides (or top and bottom)', letterbox: 'Letterbox: all of the picture, with bars',
  view: 'The shape of what you watch', '16:9': 'Wide video', '4:3': 'Old TV', '1:1': 'Square', '9:16': 'Tall (phone)',
};
function clipGroup() {
  const save = button('', `Save a clip: the last seconds of the fight, the preview or the cell under the mouse, as a GIF or a WebM (settings in ▾)${keyTip('clip')}`, saveLast);
  reg(save, () => setRich(save, clip.busy ? `:hourglass_empty: ${clip.busy}` : `:videocam: ${clipSet().secs}s`));
  const rec = button('', `Record: film the fight, the preview or the cell under the mouse until you press again (at most ${REC_MAX} s), then save it${keyTip('record')}`, toggleRecord);
  reg(rec, () => { rec.classList.toggle('on', !!clip.rec); clip.el = clip.rec ? rec : null; if (!clip.rec) setRich(rec, ':radio_button_checked:'); });
  const row = (label, tip, ...els) => h('div', { cls: 'row', tip }, h('span', { textContent: label }), ...els);
  const pick = (k, opts, lbl) => seg(opts, () => clipSet()[k], v => { clipSet()[k] = v; saveUi(); }, CLIP_TIPS, lbl);
  const opts = button(':expand_more:', 'Clip settings: format, length, size and frame rate', (e, b) => popup(b, h('b', { textContent: 'clips' }),
    h('p', { cls: 'note', textContent: 'Paused time is left out; slow motion stays slow.' }),
    row('format', 'The file type: GIF loops anywhere, WebM is smaller and has every colour', pick('fmt', CLIP_FMTS, v => v.toUpperCase())),
    row('length', 'How many seconds the clip button saves', pick('secs', CLIP_SECS, v => v + 's')),
    row('width', 'The clip\'s width in pixels', pick('size', CLIP_SIZES, String)),
    row('fps', 'Frames a second: more is smoother, fewer gives smaller files', pick('fps', CLIP_FPS, String)),
    row('aspect', 'The clip\'s shape: the watched view\'s own, or a fixed one (16:9 video, 1:1 square, 9:16 phone)', pick('aspect', Object.keys(CLIP_ASPECTS), String)),
    row('fit', 'Another shape than the view\'s: crop its middle, or fit all of it with bars', pick('fit', ['crop', 'letterbox'], String))));
  return grp('clips', 'Clips: save the last seconds of what you watch, or record it, as a GIF or a WebM', save, rec, opts);
}
