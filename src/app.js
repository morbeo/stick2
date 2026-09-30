'use strict';
// ---------- app: mode buttons, transport, frame loop, keyboard and mouse ----------
const app = { mode: 'play', paused: false, stepOnce: false, speed: 1, loop: true, scrub: false, scrubF: null };
const MODES = {
  play: 'Fight in one arena. Pick who fights: you, the AI, scripted combos, crowds.',
  grid: 'Nine copies of one fight side by side, each with different settings. Click a cell to focus it.',
  gallery: 'Every move of the character looping, with its keyframe timeline and frame data.',
  character: 'Build the fighter: drag joints, add limbs, tune bones. The preview fights with it live.',
  animate: 'Pose keyframes by dragging joints, retime them on the timeline, and watch the move with springs and hit stop.',
};
const mode = () => ({ character: creatorMode, animate: animMode })[app.mode] || labMode;

function setMode(m) {
  app.mode = m; closePop();
  mode().enter(m);
  panels();
}
function panels() {
  $('ctx').replaceChildren(...mode().ctxBar());
  $('side').replaceChildren(...mode().side());
  syncAll();
}
function restart() { mode().restart(); }
function togglePanel() { document.body.classList.toggle('noside'); resize(); }

const KEYS = [
  ['fight', 'A/D or ←/→ move · W/↑/Space jump · S/↓ crouch · J punch · K kick\nchains: J,J,J · K,K · J,K · J,J,K · S+K sweep · run+J dash punch · air J/K'],
  ['transport', 'P pause · N step one frame · R restart · M scrub with the mouse · 1-5 modes · ⌘Z undo · ⇧⌘Z redo (character and moves)'],
  ['view', 'H hide the side panel · G ghost (keyframe pose) · B hitboxes · Esc back / close'],
  ['grid', 'click a cell: focus it (breed / attacks: breed around it) · Shift+click: focus'],
  ['character', 'drag a joint: length + angle · Shift+drag: angle only · Del delete bone'],
  ['animate', 'drag a joint: IK · Alt+drag: rotate one bone · Shift+←/→ prev/next key · , . step a frame · Enter play/pause move · O onion · I aim'],
];
function buildTop() {
  $('modes').replaceChildren(seg(Object.keys(MODES), () => app.mode, setMode, MODES));
  const pause = button('', 'Pause / play (P)', () => { app.paused = !app.paused; });
  reg(pause, () => { pause.textContent = app.paused ? '▶ play' : '❚❚ pause'; pause.classList.toggle('on', app.paused); });
  $('transport').replaceChildren(pause,
    button('step', 'Advance one 60 fps frame (N)', () => { app.paused = app.stepOnce = true; }),
    button('↺ restart', 'Restart the fight(s) (R)', restart),
    seg([1, 0.5, 0.25, 0.1], () => app.speed, v => { app.speed = v; },
      { 1: 'Real time', 0.5: 'Half speed', 0.25: 'Quarter speed', 0.1: 'One tenth: study single frames' }, v => ({ 1: '1×', 0.5: '½', 0.25: '¼', 0.1: '⅒' })[v]),
    toggle('scrub', 'Mouse left/right over the view sets the time: every fight is re-simulated to that moment (M)', () => app.scrub, v => { app.scrub = v; app.scrubF = null; }),
    toggle('loop', 'Scripted fights restart when their period ends; off = stop at the end', () => app.loop, v => {
      app.loop = v;
      for (const w of mode().worlds()) { w.loop = v; if (v && w.done) w.reset(); }
    }),
    button('panel', 'Show / hide the side panel (H)', togglePanel),
    button('?', 'Keys', (e, b) => popup(b, ...KEYS.flatMap(([g, k]) => [h('h4', { textContent: g }), h('p', { cls: 'keys', textContent: k })]))));
}

function resize() {
  dpr = devicePixelRatio || 1;
  const st = $('stage');
  canvas.width = st.clientWidth * dpr; canvas.height = st.clientHeight * dpr;
}

let last = performance.now();
function frame(now) {
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  const inp = readInput();
  if (app.scrub) { if (app.scrubF !== null) scrub(app.scrubF); }
  else if (!app.paused || app.stepOnce) {
    const dt = app.stepOnce ? 1 / 60 : raw * app.speed;
    mode().tick?.(dt);
    for (const w of mode().worlds()) { w.advance(dt, inp); w.scrubN = undefined; }
    app.stepOnce = false;
  }
  mode().render();
  $('help').textContent = mode().hint();
  requestAnimationFrame(frame);
}

// scrub: f in [0, 1] across the canvas = time through each fight's period; worlds are deterministic, so
// going forward just advances, going back replays from the start
function scrub(f) {
  app.scrubF = null;
  if (mode().scrub) return mode().scrub(f);
  for (const w of mode().worlds()) {
    const n = Math.round(f * (w.scen.period || 4) * 60);
    if (w.scrubN === undefined || n < w.scrubN) { w.reset(); w.scrubN = 0; }
    for (; w.scrubN < n; w.scrubN++) w.advance(1 / 60, NOIN);
  }
}

// ---------- input ----------
const keys = new Set(), pressed = new Set();
const MAP = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'jump', ArrowUp: 'jump',
  Space: 'jump', KeyS: 'down', ArrowDown: 'down', KeyJ: 'punch', KeyK: 'kick' };
const SHORTCUTS = {
  KeyP: () => { app.paused = !app.paused; },
  KeyN: () => { app.paused = app.stepOnce = true; },
  KeyR: restart,
  KeyH: togglePanel,
  KeyG: () => { CFG.ghost = !CFG.ghost; },
  KeyB: () => { CFG.boxes = !CFG.boxes; },
  KeyM: () => { app.scrub = !app.scrub; app.scrubF = null; },
  Digit1: () => setMode('play'), Digit2: () => setMode('grid'), Digit3: () => setMode('gallery'), Digit4: () => setMode('character'), Digit5: () => setMode('animate'),
};
addEventListener('keydown', e => {
  if (e.target.type === 'number') return;
  if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); e.shiftKey || e.code === 'KeyY' ? redo() : undo(); return; }
  if (mode().key?.(e)) { e.preventDefault(); syncAll(); return; }
  if (!e.metaKey && !e.ctrlKey && SHORTCUTS[e.code]) { SHORTCUTS[e.code](); syncAll(); return; }
  const a = MAP[e.code];
  if (!a) return;
  e.preventDefault();
  if (!e.repeat) pressed.add(a);
  keys.add(a);
});
addEventListener('keyup', e => { const a = MAP[e.code]; if (a) keys.delete(a); });
addEventListener('blur', () => keys.clear());
function readInput() {
  const i = { left: keys.has('left'), right: keys.has('right'), down: keys.has('down'),
    jump: pressed.has('jump'), punch: pressed.has('punch'), kick: pressed.has('kick') };
  pressed.clear(); // edges are consumed by the first substep only
  return i;
}
// canvas mouse in device px; drags keep reporting after leaving the canvas
const at = e => { const b = canvas.getBoundingClientRect(); return [(e.clientX - b.left) * dpr, (e.clientY - b.top) * dpr]; };
let down = false;
canvas.addEventListener('mousedown', e => { down = true; mode().mouse?.('down', ...at(e), e); syncAll(); });
addEventListener('mousemove', e => {
  if (app.scrub && e.target === canvas) app.scrubF = clamp(at(e)[0] / canvas.width, 0, 1);
  else if (down || e.target === canvas) mode().mouse?.('move', ...at(e), e);
});
addEventListener('mouseup', e => { if (!down) return; down = false; mode().mouse?.('up', ...at(e), e); syncAll(); });

buildTop();
setMode('play');
new ResizeObserver(resize).observe($('stage'));
resize();
requestAnimationFrame(frame);
