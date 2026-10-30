'use strict';
// ---------- movie: shots cut from any loaded reel (the reel, its branches, an imported file), played and exported one after another ----------
// a project file: every reel the movie uses, plus the movie itself (shots: [{ reel: index into reels, a, b, trans }]); shot fx are a later phase
const PROJECT_FORMAT = 'stick2-project';
function movieEdit(fn, key = null) { snapshot(() => ({ movie: JSON.stringify(rp.movie) }), key); fn(rp.movie); panels(); }
// a shot's transition in from the one before it (shot 0 has none): dur in seconds; fade/flash: col; wipe/slide: dir, the edge the
// new shot enters from. Drawn by blending two frozen frames (the old shot's last, the new one's first), in the preview and export
const TRANS_KINDS = { cut: 'Switches instantly (the default)', fade: 'Fades through a colour', cross: 'Crossfades into the new shot',
  wipe: 'A hard edge wipes the new shot in', slide: 'The new shot slides in, pushing the old one out' };
const TRANS_DIRS = { L: 'from the left', R: 'from the right', U: 'from the top', D: 'from the bottom' };
function transDraw(g, w, h, from, to, trans, p) {
  const { kind, dir = 'R', col = 'black' } = trans;
  if (kind === 'fade') {
    if (p < 0.5) { g.drawImage(from, 0, 0, w, h); g.globalAlpha = p * 2; g.fillStyle = col; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
    else { g.fillStyle = col; g.fillRect(0, 0, w, h); g.globalAlpha = (p - 0.5) * 2; g.drawImage(to, 0, 0, w, h); g.globalAlpha = 1; }
  } else if (kind === 'cross') { g.drawImage(from, 0, 0, w, h); g.globalAlpha = p; g.drawImage(to, 0, 0, w, h); g.globalAlpha = 1; }
  else if (kind === 'wipe') {
    g.drawImage(from, 0, 0, w, h); g.save(); g.beginPath();
    if (dir === 'R') g.rect(w * (1 - p), 0, w * p, h); else if (dir === 'L') g.rect(0, 0, w * p, h);
    else if (dir === 'D') g.rect(0, h * (1 - p), w, h * p); else g.rect(0, 0, w, h * p);
    g.clip(); g.drawImage(to, 0, 0, w, h); g.restore();
  } else if (kind === 'slide') {
    const sign = dir === 'R' || dir === 'D' ? 1 : -1, horiz = dir === 'L' || dir === 'R', size = horiz ? w : h;
    const toOff = size * (1 - p) * sign, fromOff = -size * p * sign;
    if (horiz) { g.drawImage(from, fromOff, 0, w, h); g.drawImage(to, toOff, 0, w, h); } else { g.drawImage(from, 0, fromOff, w, h); g.drawImage(to, 0, toOff, w, h); }
  } else g.drawImage(to, 0, 0, w, h);
}
// a shot's freeze frame { at (frame, relative to the shot; unset: its last), hold (s), zoom, text }: holds on one frame, optionally
// punched in and captioned, before the shot's own frames play on
function drawFreeze(g, w, h, img, zoom, text) {
  if (zoom > 1) { g.save(); g.translate(w / 2, h / 2); g.scale(zoom, zoom); g.drawImage(img, -w / 2, -h / 2, w, h); g.restore(); }
  else g.drawImage(img, 0, 0, w, h);
  if (text) drawTitle(g, text, { x: 0, y: 0, w, h });
}
// a shot's screen effects { shake, vignette, tint: { col, amt }, letterbox, caption }, drawn over its own frames (not over a
// freeze, a transition or a reversed shot's pictures: those are their own, separate phase of the shot)
const shakeOff = amt => amt ? [(Math.random() - 0.5) * amt * 2, (Math.random() - 0.5) * amt * 2] : [0, 0];
// atFrame: the frame being drawn, relative to the shot's own start (0-based) — governs the caption's cue, if it has one
function drawShotFx(g, w, h, fx, atFrame = 0) {
  if (!fx) return;
  if (fx.letterbox) { const bar = h * 0.12; g.fillStyle = '#000'; g.fillRect(0, 0, w, bar); g.fillRect(0, h - bar, w, bar); }
  if (fx.vignette) { const grad = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.65)'); g.fillStyle = grad; g.fillRect(0, 0, w, h); }
  if (fx.tint?.amt) { g.fillStyle = fx.tint.col; g.globalAlpha = fx.tint.amt; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
  if (fx.caption && (fx.capAt === undefined || (atFrame >= fx.capAt && atFrame < fx.capAt + (fx.capDur ?? 2) * 60))) drawTitle(g, fx.caption, { x: 0, y: 0, w, h });
}
// a new shot from this reel: the selection, else the footage in–out, else two seconds from the playhead
function addShot() {
  const s = selSpan(), [a, b] = s || (foot().in != null || foot().out != null ? footRange() : [rp.n, Math.min(rp.N, frameAt(rp.T[rp.n] + 2))]);
  movieEdit(M => { M.shots.push({ reel: rp.reels.indexOf(rp.reel), a, b }); });
}
function importReel() { pickReplay(r => { rp.reels.push({ rep: r, name: r.scenario, edits: 0 }); panels(); }); }
// movie playback: a lightweight world of its own per shot (rp.reel / master / view are untouched, so editing the loaded reel still works).
// transFrom: the previous shot's last frame, when this shot transitions in from it; a frozen blend plays before the shot's own frames do
// shot.speed { rate, reverse }: rate paces how fast its own frames play (not the simulation itself); reverse pre-renders every
// frame of the shot once (the engine can only play forward) and steps through the pictures backward. Freeze is skipped on a
// reversed shot: its "at" frame does not have a clean meaning once the order is flipped
function mvLoad(shotI, transFrom = null) {
  const sh = rp.movie.shots[shotI];
  if (!sh) { rp.mv = null; return false; }
  const reel = rp.reels[sh.reel];
  if (!reel) return mvLoad(shotI + 1, transFrom); // a shot whose reel was removed: skip it
  const w = replayWorld(reel.rep); w.loop = false; w.replaying = true;
  const frames = w.playback.frames, N = Math.min(sh.b, frames.length), a = Math.min(sh.a, N), rate = sh.speed?.rate || 1;
  for (let f = 0; f < a; f++) { const [dt, inp, mq, inp2] = frames[f]; if (mq) w.macro = new Script(parseMacro(mq)); w.advance(dt, inp, inp2); }
  rp.mv = { shotI, w, frames, n: a, N, a, rate, T: frames.slice(a, N).reduce((arr, f) => (arr.push(arr[arr.length - 1] + f[0]), arr), [0]), t: 0, trans: null, freeze: null, rev: null };
  if (sh.speed?.reverse) {
    const pv = rpLayout().pv, imgs = [];
    for (let f = a; f < N; f++) {
      const [dt, inp, mq, inp2] = frames[f]; if (mq) w.macro = new Script(parseMacro(mq)); w.advance(dt, inp, inp2);
      const c = document.createElement('canvas'); c.width = pv.w; c.height = pv.h;
      const g = c.getContext('2d'); g.fillStyle = '#f3f0e8'; g.fillRect(0, 0, pv.w, pv.h); w.render(g, { x: 0, y: 0, w: pv.w, h: pv.h }, true);
      imgs.push({ img: c, dt });
    }
    imgs.reverse(); // index 0 now plays first: the shot's last frame
    rp.mv.rev = { imgs, i: 0, t: 0, T: imgs.reduce((arr, x) => (arr.push(arr[arr.length - 1] + x.dt), arr), [0]) };
  }
  if (transFrom && sh.trans && sh.trans.kind !== 'cut') rp.mv.trans = { ...sh.trans, from: transFrom, to: mvSnapshot(), t: 0 };
  return true;
}
// a snapshot of the current movie frame, at the preview's own size (used to blend a transition either side of it)
function mvSnapshot() {
  const pv = rpLayout().pv, c = document.createElement('canvas'); c.width = pv.w; c.height = pv.h;
  const g = c.getContext('2d'); g.fillStyle = '#f3f0e8'; g.fillRect(0, 0, pv.w, pv.h); rp.mv.w.render(g, { x: 0, y: 0, w: pv.w, h: pv.h }, true);
  return c;
}
function mvStepOnce() {
  const m = rp.mv, sh = rp.movie.shots[m.shotI], [dt, inp, mq, inp2] = m.frames[m.n];
  if (mq) m.w.macro = new Script(parseMacro(mq));
  m.w.advance(dt, inp, inp2);
  const at = sh.freeze && m.a + (sh.freeze.at ?? m.N - m.a - 1);
  if (sh.freeze && m.n === at) m.freeze = { ...sh.freeze, t: 0, hold: sh.freeze.hold ?? 1, zoom: sh.freeze.zoom ?? 1, img: mvSnapshot() };
  m.n++;
}
function mvTick(dt) {
  if (!rp.mv && !mvLoad(0)) { app.paused = true; return; }
  const m = rp.mv;
  if (m.trans) { m.trans.t += dt; if (m.trans.t >= m.trans.dur) m.trans = null; return; } // the shot's own frames wait out the transition
  if (m.freeze) { m.freeze.t += dt; if (m.freeze.t >= m.freeze.hold) m.freeze = null; return; }
  if (m.rev) {
    m.rev.t += dt * m.rate;
    while (m.rev.i < m.rev.imgs.length - 1 && m.rev.T[m.rev.i + 1] <= m.rev.t + 1e-9) m.rev.i++;
    if (m.rev.i >= m.rev.imgs.length - 1 && !mvLoad(m.shotI + 1, m.rev.imgs[m.rev.imgs.length - 1].img)) app.paused = true;
    return;
  }
  m.t += dt * m.rate;
  while (!m.freeze && m.n < m.N && m.T[m.n - m.a + 1] <= m.t + 1e-9) mvStepOnce();
  if (m.n >= m.N) { const img = mvSnapshot(); if (!mvLoad(m.shotI + 1, img)) app.paused = true; }
}
function setPlayMovie(v) { rp.playMovie = v; rp.mv = null; if (v) mvLoad(0); app.paused = false; }
// export: each shot's own reel rendered in turn, cut to cut (a shot's own fx and the transition between shots are a later phase)
async function exportMovie() {
  if (clip.busy) return;
  if (!rp.movie.shots.length) return notice('No shots yet', 'Add one in the movie section first.');
  const o = expSet(), set = clipSet(), fps = set.fps, [W2, H2] = expSize(W / H), fill = set.fit !== 'letterbox';
  const frames = [], total = rp.movie.shots.reduce((n, sh) => n + Math.max(0, sh.b - sh.a), 0);
  let t = 0, next = 0, done = 0;
  clip.busy = 'render 0%'; syncAll();
  const hud = CFG.hud; CFG.hud = o.hud;
  let lastImg = null;
  try {
    for (const [si, sh] of rp.movie.shots.entries()) {
      const reel = rp.reels[sh.reel]; if (!reel) continue;
      const w = replayWorld(reel.rep); w.loop = false; w.replaying = true;
      const fr = w.playback.frames, end = Math.min(sh.b, fr.length);
      for (let f = 0; f < sh.a; f++) { const [dt, inp, mq, inp2] = fr[f]; if (mq) w.macro = new Script(parseMacro(mq)); w.advance(dt, inp, inp2); }
      if (si > 0 && lastImg && sh.trans && sh.trans.kind !== 'cut') { // a frozen blend from the previous shot's last frame to this one's first, before its own frames play
        const toImg = h2canvas(W2, H2), tg = toImg.getContext('2d'); tg.fillStyle = '#f3f0e8'; tg.fillRect(0, 0, W2, H2); w.render(tg, { x: 0, y: 0, w: W2, h: H2 }, true, { ...camAt(reel.rep, w, sh.a), fill });
        const n = Math.max(1, Math.round(sh.trans.dur * fps));
        for (let k = 1; k <= n; k++) { const c = h2canvas(W2, H2), g = c.getContext('2d'); transDraw(g, W2, H2, lastImg, toImg, sh.trans, k / n); frames.push({ c, t: next * 1000 }); next += 1 / fps; lastImg = c; }
        t = next;
      }
      const rate = sh.speed?.rate || 1, reverse = !!sh.speed?.reverse, startIdx = frames.length;
      const freezeAt = sh.freeze && !reverse && sh.a + (sh.freeze.at ?? end - sh.a - 1); // freeze has no clean meaning once reversed
      for (let f = sh.a; f < end; f++) {
        const [dt, inp, mq, inp2] = fr[f]; if (mq) w.macro = new Script(parseMacro(mq));
        const t1 = t + dt / rate;
        if (next <= t1 - 1e-9) {
          const [dx, dy] = shakeOff(sh.fx?.shake), c = h2canvas(W2, H2), g = c.getContext('2d'), r = { x: dx, y: dy, w: W2, h: H2 };
          g.fillStyle = '#f3f0e8'; g.fillRect(0, 0, W2, H2);
          w.render(g, r, true, { ...camAt(reel.rep, w, f), fill });
          if (o.inputs && w.ctl[0] === 'human') drawInputs(w, 10 * dpr, 30 * dpr, g);
          if (o.meter) drawMeter(w, { x: 6 * dpr, y: H2 - 24 * dpr, w: W2 - 12 * dpr, h: 18 * dpr }, true, g);
          drawShotFx(g, W2, H2, sh.fx, f - sh.a);
          for (; next <= t1 - 1e-9; next += 1 / fps) frames.push({ c, t: next * 1000 });
          lastImg = c;
        }
        t = t1; w.advance(dt, inp, inp2);
        if (f === freezeAt && lastImg) { // hold on the last rendered frame, then carry on from here
          const hold = Math.max(1, Math.round((sh.freeze.hold ?? 1) * fps));
          for (let k = 0; k < hold; k++) { const c = h2canvas(W2, H2), g = c.getContext('2d'); drawFreeze(g, W2, H2, lastImg, sh.freeze.zoom ?? 1, sh.freeze.text); frames.push({ c, t: next * 1000 }); next += 1 / fps; }
          t = next;
        }
        if (++done % 30 === 0) { clip.busy = `render ${Math.round(100 * done / total)}%`; syncAll(); await new Promise(r => setTimeout(r)); }
      }
      if (reverse) { // the engine can only play forward: keep the timestamps, just show the pictures back to front
        const pics = frames.slice(startIdx).map(x => x.c);
        for (let k = startIdx; k < frames.length; k++) frames[k].c = pics[frames.length - 1 - k];
        lastImg = frames[frames.length - 1]?.c ?? lastImg;
      }
    }
  } finally { CFG.hud = hud; clip.busy = ''; }
  await saveClip(frames);
}
const projectFile = () => ({ format: PROJECT_FORMAT, version: ENGINE_VERSION, reels: rp.reels.map(r => ({ name: r.name, rep: r.rep })), movie: rp.movie });
const saveProject = () => saveBlob('movie.stick2-project.json', new Blob([JSON.stringify(projectFile())], { type: 'application/json' }));
function pickProject(then) {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => {
    let p; try { p = JSON.parse(await inp.files[0].text()); } catch (err) { return notice('Not a project file', err.message); }
    if (p.format !== PROJECT_FORMAT) return notice('Not a project file', 'This JSON file is not a stick2 movie project.');
    then(p);
  };
  inp.click();
}
function loadProject(p) {
  rp.reels = p.reels.map(r => ({ rep: r.rep, name: r.name, edits: 0 }));
  loadReel(rp.reels[0].rep, rp.reels[0].name, rp.reels[0]); // a listed reel: rp.reels / rp.movie (set next) are left alone
  rp.movie = p.movie; rp.playMovie = false; rp.mv = null;
  app.paused = true;
}
// a shot in the side panel: which reel, its range (seconds while that reel is the one loaded, else frame numbers), trim to the
// playhead (only while editing that reel), duplicate, delete; drag to reorder
// the transition into shot j from the one before it (none for the first shot: nothing plays before it)
function transBtn(j) {
  const cur = () => rp.movie.shots[j].trans || { kind: 'cut', dur: 0.4, col: 'black', dir: 'R' };
  const set = vals => movieEdit(M => { const t = { ...cur(), ...vals }; M.shots[j].trans = t.kind === 'cut' ? undefined : t; });
  const b = button(':theaters:', 'How this shot transitions in from the one before it', (e, btn) => popup(btn, h('b', { textContent: 'transition in' }),
    h('div', { cls: 'row' }, h('span', { textContent: 'kind' }), seg(Object.keys(TRANS_KINDS), () => cur().kind, v => set({ kind: v }), TRANS_KINDS)),
    h('div', { cls: 'row' }, h('span', { textContent: 'for' }), slider('secs', { min: 0.1, max: 2, step: 0.05 }, () => cur().dur, v => set({ dur: v }), 'How long the transition takes')),
    (() => { const r = h('div', { cls: 'row' }, h('span', { textContent: 'colour' }), seg(['black', 'white'], () => cur().col, v => set({ col: v })));
      reg(r, () => { r.hidden = cur().kind !== 'fade'; }); return r; })(),
    (() => { const r = h('div', { cls: 'row' }, h('span', { textContent: 'enters' }), seg(Object.keys(TRANS_DIRS), () => cur().dir, v => set({ dir: v }), TRANS_DIRS));
      reg(r, () => { r.hidden = !['wipe', 'slide'].includes(cur().kind); }); return r; })()), 'mini');
  reg(b, () => setRich(b, `:theaters: ${cur().kind}`));
  return b;
}
// a shot's freeze frame: holds on one of its frames (its last, or wherever the playhead was when "here" was clicked), zoomed and
// captioned if set, before its own frames (after the freeze point) play on
function freezeBtn(j) {
  const on = () => !!rp.movie.shots[j].freeze, cur = () => rp.movie.shots[j].freeze || { hold: 1, zoom: 1, text: '' };
  const set = vals => movieEdit(M => { M.shots[j].freeze = { ...cur(), ...vals }; });
  const b = button(':pause:', 'Hold on a frame of this shot before it plays on', (e, btn) => popup(btn, h('b', { textContent: 'freeze frame' }),
    h('div', { cls: 'row' }, h('span', { textContent: 'freeze' }), toggle(':pause: on', 'Hold on a frame, then play on', on,
      v => movieEdit(M => { if (v) M.shots[j].freeze = cur(); else delete M.shots[j].freeze; }))),
    h('div', { cls: 'row' }, h('span', { textContent: 'at' }), button(':my_location: here', 'Freeze at the playhead (edit this reel first)', () => set({ at: rp.n - rp.movie.shots[j].a }), 'mini'),
      h('span', { cls: 'note', textContent: cur().at !== undefined ? `frame ${cur().at} of the shot` : 'the last frame of the shot' })),
    h('div', { cls: 'row' }, h('span', { textContent: 'hold' }), slider('secs', { min: 0.1, max: 5, step: 0.1 }, () => cur().hold, v => set({ hold: v }), 'How long it holds')),
    h('div', { cls: 'row' }, h('span', { textContent: 'zoom' }), slider('×', { min: 1, max: 3, step: 0.1 }, () => cur().zoom, v => set({ zoom: v }), 'Punch in while held')),
    h('div', { cls: 'row' }, h('span', { textContent: 'caption' }), h('input', { cls: 'macro', value: cur().text, oninput: e2 => set({ text: e2.target.value }) }))), 'mini');
  reg(b, () => b.classList.toggle('on', on()));
  return b;
}
// a shot's own speed: a constant rate (not a ramp: pick a different rate on either side of a cut for that), or reversed
// (pre-rendered once, forward, then shown back to front, since the engine cannot simulate backward)
function speedBtn(j) {
  const cur = () => rp.movie.shots[j].speed || { rate: 1, reverse: false };
  const set = vals => movieEdit(M => { const s = { ...cur(), ...vals }; M.shots[j].speed = s.rate === 1 && !s.reverse ? undefined : s; });
  const b = button(':speed:', 'How fast this shot plays, or reversed', (e, btn) => popup(btn, h('b', { textContent: 'speed' }),
    h('div', { cls: 'row' }, h('span', { textContent: 'rate' }), slider('×', { min: 0.1, max: 3, step: 0.05 }, () => cur().rate, v => set({ rate: v }), 'How fast the shot plays (1 = normal, under 1 slower, over 1 faster)')),
    h('div', { cls: 'row' }, h('span', { textContent: 'reverse' }), toggle(':fast_rewind: reversed', 'Plays the shot back to front', () => cur().reverse, v => set({ reverse: v })))), 'mini');
  reg(b, () => setRich(b, `:speed: ${cur().reverse ? 'reversed' : cur().rate + '×'}`));
  return b;
}
// a shot's screen effects (shake, vignette, tint, letterbox) and a caption shown throughout it; drawn on its own frames only
function fxBtn(j) {
  const cur = () => rp.movie.shots[j].fx || { shake: 0, vignette: false, tint: { col: '#c0392b', amt: 0 }, letterbox: false, caption: '' };
  const set = vals => movieEdit(M => { const f = { ...cur(), ...vals, tint: { ...cur().tint, ...vals.tint } };
    if (!f.caption) { delete f.capAt; delete f.capDur; }
    M.shots[j].fx = f.shake || f.vignette || f.tint.amt || f.letterbox || f.caption ? f : undefined; });
  const b = button(':auto_awesome:', 'Screen effects over this shot: shake, vignette, a colour tint, letterbox bars, a caption', (e, btn) => popup(btn, h('b', { textContent: 'effects' }),
    h('div', { cls: 'row' }, h('span', { textContent: 'shake' }), slider('px', { min: 0, max: 20, step: 1 }, () => cur().shake, v => set({ shake: v }), 'Camera jitter each frame (0 = none)')),
    h('div', { cls: 'row' }, h('span', { textContent: 'vignette' }), toggle(':blur_on: on', 'Darkens the edges of the picture', () => cur().vignette, v => set({ vignette: v }))),
    h('div', { cls: 'row' }, h('span', { textContent: 'tint' }), colorInput(cur().tint.col, v => set({ tint: { col: v } }), 'tint'),
      slider('', { min: 0, max: 1, step: 0.05 }, () => cur().tint.amt, v => set({ tint: { amt: v } }), 'How strong the colour wash is (0 = none)')),
    h('div', { cls: 'row' }, h('span', { textContent: 'letterbox' }), toggle(':crop_landscape: on', 'Black bars top and bottom, for a cinematic look', () => cur().letterbox, v => set({ letterbox: v }))),
    h('div', { cls: 'row' }, h('span', { textContent: 'caption' }), h('input', { cls: 'macro', value: cur().caption, oninput: e2 => set({ caption: e2.target.value }) })),
    (() => { const r = h('div', { cls: 'row' }, h('span', { textContent: 'cue' }),
        toggle(':timer: timed', 'Shows only for a while, instead of the whole shot', () => cur().capAt !== undefined, v => set({ capAt: v ? 0 : undefined })),
        button(':my_location: here', 'Starts the caption at the playhead (edit this reel first)', () => set({ capAt: rp.n - rp.movie.shots[j].a }), 'mini'),
        slider('secs', { min: 0.2, max: 5, step: 0.1 }, () => cur().capDur ?? 2, v => set({ capDur: v }), 'How long the caption shows'));
      reg(r, () => { r.hidden = !cur().caption; }); return r; })()), 'mini');
  reg(b, () => b.classList.toggle('on', !!rp.movie.shots[j].fx));
  return b;
}
function shotRow(sh, j) {
  const reel = rp.reels[sh.reel], active = reel === rp.reel;
  const t = f => active ? fmtT(rp.T[f]) : `frame ${f}`;
  const inBtn = button('[', 'Start the shot at the playhead (edit this reel first)', () => movieEdit(M => { M.shots[j].a = Math.min(rp.n, M.shots[j].b - 1); }), 'mini');
  const outBtn = button(']', 'End the shot at the playhead (edit this reel first)', () => movieEdit(M => { M.shots[j].b = Math.max(rp.n, M.shots[j].a + 1); }), 'mini');
  reg(inBtn, () => { inBtn.disabled = !active; }); reg(outBtn, () => { outBtn.disabled = !active; });
  return h('div', { cls: 'bar', draggable: true, ondragstart: () => { rp.shotDrag = j; },
    ondragover: e => e.preventDefault(), ondrop: e => { e.preventDefault(); if (rp.shotDrag == null || rp.shotDrag === j) return;
      movieEdit(M => { const [s] = M.shots.splice(rp.shotDrag, 1); M.shots.splice(j, 0, s); }); rp.shotDrag = null; } },
    h('span', { cls: 'note', textContent: String(j + 1) }),
    button(reel ? reel.name : '(missing reel)', active ? 'This reel is being edited' : `Edit "${reel?.name}"`, () => { if (reel && !active) loadReel(reel.rep, reel.name, reel); app.paused = true; panels(); }, 'mini'),
    button(':swap_horiz:', 'Use a different reel for this shot', (e, b) => popup(b, h('b', { textContent: 'pick a reel' }),
      h('div', { cls: 'bar col' }, rp.reels.map((r, i) => button(r.name, `Use "${r.name}" for this shot`, () => { movieEdit(M => { M.shots[j].reel = i; }); closePop(); })))), 'mini'),
    h('span', { cls: 'note', textContent: `${t(sh.a)} – ${t(sh.b)}` }),
    inBtn, outBtn, j > 0 ? transBtn(j) : null, freezeBtn(j), speedBtn(j), fxBtn(j),
    button(':content_copy:', 'Duplicate this shot', () => movieEdit(M => { M.shots.splice(j + 1, 0, { ...sh }); }), 'mini'),
    crud({ delete: ['Delete this shot', () => movieEdit(M => { M.shots.splice(j, 1); })] }));
}
function movieSide() {
  return [heading('movie', 'Shots cut from any loaded reel (this one, a branch, or one imported below), played one after another. Saved in a project file alongside the reels it uses.'),
    h('div', { cls: 'bar' }, button(':add: shot', 'Add a shot from this reel: the selection, else the footage in–out, else two seconds from the playhead', addShot),
      button(':upload: import reel', 'Load another replay file to cut shots from, without replacing this one', importReel),
      toggle(':movie: preview', 'Preview the movie instead of this reel: its shots play in turn, cut to cut', () => rp.playMovie, setPlayMovie),
      button(':download: export movie', 'Export the movie as one clip, cuts only (size and format as in footage → export)', exportMovie)),
    ...rp.movie.shots.length ? rp.movie.shots.map((sh, j) => shotRow(sh, j)) : [h('p', { cls: 'note', textContent: 'No shots yet.' })],
    h('div', { cls: 'bar' }, button(':save: save project', 'Save every loaded reel and the movie as one project file', saveProject),
      button(':upload: open project', 'Open a project file: its reels and movie, replacing these', () => pickProject(p => { loadProject(p); panels(); }))),
  ];
}
