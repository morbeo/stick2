'use strict';
// ---------- welcome: a modal splash pointing at the app's main activities, each with a tiny looping demo of it in
// action (not a tab: the app always starts on play; this shows once on the very first visit, see app.js, and can be
// reopened from the menu bar or ⌘K "welcome") ----------
// a canvas (or small DOM tree) that redraws itself every frame until it leaves the page - the same shape as
// studio.js's startCardPreview / editor.js's moveCard hover loop / gridlab.js's startScenPreview, just inlined here
// since this is the only place that needs several different kinds of demo side by side
function demoLoop(el, draw) {
  const loop = () => { if (!el.isConnected) return; draw(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return el;
}
// a character looping its own 'select' flourish then settling - exactly startCardPreview's own logic, standalone
// (that one keys off hover; a demo has no hover to key off)
function demoCharacter() {
  const cv = h('canvas'), ch = CHARS.stick, m = ch.moves.select, wch = m ? withWeapon(ch, m) : null, t0 = performance.now();
  return demoLoop(cv, () => {
    const t = (performance.now() - t0) / 1000 % ((m ? total(m) : 0) + 0.6);
    drawThumb(cv, wch && t < total(m) ? wch : ch, wch && t < total(m) ? samplePose(wch, m, t) : ch.poses.stance, 120, 108);
  });
}
// a move looping forever - moveCard's own hover-preview logic, standalone
function demoAnimate() {
  const cv = h('canvas'), ch = CHARS.stick, m = ch.moves.kick, wch = withWeapon(ch, m), t0 = performance.now();
  return demoLoop(cv, () => drawThumb(cv, wch, samplePose(wch, m, (performance.now() - t0) / 1000 % (total(m) + 0.3)), 120, 108));
}
// a scripted fight actually simulated and drawn live (gridlab.js's startScenPreview, standalone) - play: the fight
// itself; replay: the same idea plus a looping progress bar, since a replay is that fight's own timeline
function demoFight(scen, bar) {
  const cv = h('canvas', { width: 120 * dpr, height: 108 * dpr }); let w; try { w = newWorld(SCENARIOS[scen], {}, 1, null); w.loop = true; } catch { return cv; }
  const t0 = performance.now(), period = SCENARIOS[scen].period || 4;
  return demoLoop(cv, () => {
    w.advance(1 / 60, NOIN);
    const c = cv.getContext('2d');
    w.render(c, { x: 0, y: 0, w: cv.width, h: cv.height }, true);
    if (bar) { c.fillStyle = '#3a7ca5'; c.fillRect(0, cv.height - 3 * dpr, cv.width * ((performance.now() - t0) / 1000 % period) / period, 3 * dpr); }
  });
}
// two small fights side by side, one with an exaggerated setting - "the same fight, different settings, compared"
function demoExperiment() {
  const cv = h('canvas', { width: 120 * dpr, height: 108 * dpr }), cfgs = [{}, { powerScale: 2.6, flyKnock: 1 }];
  let ws; try { ws = cfgs.map(c => { const w = newWorld(SCENARIOS['K,K'], c, 1, null); w.loop = true; return w; }); } catch { return cv; }
  return demoLoop(cv, () => {
    const c = cv.getContext('2d'), cw = cv.width / 2;
    ws.forEach((w, i) => { w.advance(1 / 60, NOIN); w.render(c, { x: i * cw, y: 0, w: cw, h: cv.height }, true); });
    c.strokeStyle = '#ccc'; c.lineWidth = dpr; c.beginPath(); c.moveTo(cw, 0); c.lineTo(cw, cv.height); c.stroke();
  });
}
// a few character tiles with the "picked" outline stepping between them - the grid's own select-then-focus, at a glance
function demoGrid() {
  const names = ['stick', 'hadoo', 'grumbo', 'jabbo'];
  const tiles = names.map(n => { const cv = h('canvas'); drawThumb(cv, CHARS[n], CHARS[n].poses.stance, 54, 46); return h('div', { cls: 'demotile' }, cv); });
  const wrap = h('div', { cls: 'demogrid' }, tiles);
  return demoLoop(wrap, () => tiles.forEach((t, i) => t.classList.toggle('gridsel', i === Math.floor(performance.now() / 700) % tiles.length)));
}
const WELCOME_ACTIVITIES = [
  { m: 'character', title: 'Build a character', info: 'Drag joints, add limbs, tune bones — the preview fights with it live.', demo: demoCharacter },
  { m: 'animate', title: 'Animate moves', info: 'Pose keyframes by dragging joints, retime them on the timeline, add springs and hit stop.', demo: demoAnimate },
  { m: 'replay', title: 'Edit a replay', info: 'A recorded fight as a timeline of colour-coded events: filter, find a moment, go there.', demo: () => demoFight('you vs ai', true) },
  { m: 'experiment', title: 'Experiment', info: 'Nine copies of one fight side by side, each with different settings, to compare at a glance.', demo: demoExperiment },
  { m: 'grid', title: 'Browse everything', info: 'Characters, moves, scenarios, sounds, looks and tracks as searchable tiles.', demo: demoGrid },
  { m: 'fx', title: 'Tune fx & sound', info: 'Every fx look and every sound, synthesized live, no files — tune and preview them.', demo: () => fxCanvas(120, 'fire') },
  { m: 'play', title: 'Fight', info: 'Pick who fights: you, the AI, scripted combos, crowds.', demo: () => demoFight('ai vs ai') },
];
let welcomeBack = null;
function closeWelcome() { welcomeBack?.remove(); welcomeBack = null; removeEventListener('keydown', welcomeKey, true); }
function welcomeKey(e) { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeWelcome(); } }
function openWelcome() {
  if (welcomeBack) return;
  const box = h('div', { cls: 'pop modal welcomebox' },
    h('h2', { textContent: 'stick2' }),
    h('p', { cls: 'note', textContent: 'A stick-figure fighting game sandbox. Pick where to start — you can always come back here from the menu bar or ⌘K "welcome".' }),
    h('div', { cls: 'cards', style: 'justify-content:flex-start' },
      WELCOME_ACTIVITIES.map(a => h('button', { cls: 'card wide welcomecard', tip: MODES[a.m], onclick: () => { closeWelcome(); setMode(a.m); } },
        a.demo(), h('b', { textContent: a.title }), h('div', { cls: 'note', textContent: a.info })))),
    h('div', { cls: 'bar' }, button(':close: close', 'Close this (Esc)', closeWelcome)));
  welcomeBack = h('div', { cls: 'modalback' }, box);
  welcomeBack.addEventListener('mousedown', e => { if (e.target === welcomeBack) closeWelcome(); });
  addEventListener('keydown', welcomeKey, true);
  document.body.append(welcomeBack);
}
