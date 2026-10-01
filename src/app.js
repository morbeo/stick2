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
  app.mode = m; closePop(); cursor('default');
  mode().enter(m);
  panels();
}
function panels() {
  $('ctx').replaceChildren(...mode().ctxBar());
  $('side').replaceChildren(...mode().side());
  $('over').replaceChildren(...mode().overlay?.() || []); // controls placed over the canvas
  syncAll();
}
function restart() { mode().restart(); }
function togglePanel() { document.body.classList.toggle('noside'); resize(); }

// help under the rebindable keys (P = punch, K = kick, directions as on the numpad: 2 down, 3 down-forward, 6 forward…)
const KEYS = [
  ['combos', 'chains: P,P,P · K,K · P,K · P,P,K · run+P dash punch · air P/K, air P,K\ndirections × P / K: 6P elbow · 6K push kick · 8P hammer (overhead) · 8K turn kick · 2P launcher · 2K sweep · 3K low kick (← free)\nspecials (cancel normals that hit): 236P rush · 623P rising · 214K spin · 236K stomp (hits a fighter on the floor) · 214P charge (unblockable)\n66 dash · 44 back dash · 66 and hold: run'],
  ['guard', 'hold L: guard, front only (not from behind) · ↓+L low guard · tap L just before a hit: parry · highs pass over a crouching fighter\nU special: S spin · → S rush · ↑ S rising · ↓ S stomp · ← S catch (counters a strike)\nJ+L throw (P+G breaks it) · L while knocked flying: recover in the air · L just before landing: tech'],
  ['2.5D', 'plane setting: lanes / belt · ↑ ↓ move in depth (lanes: double tap = sidestep) · Space jumps in every plane, with ← / → a ninja flip'],
  ['fixed', '⌘Z undo · ⇧⌘Z redo (character and moves) · Esc back / close'],
  ['grid', 'click a cell: focus it and use its settings, ⌘Z undoes (breed / attacks: breed around it) · Shift+click: only focus'],
  ['character', 'drag a joint: length + angle · Shift+drag: angle only'],
  ['animate', 'drag a joint: IK · Alt+drag: rotate one bone · timeline: drag a key to reorder, its edge to retime, double-click to split · Delete removes the key'],
];
function buildTop() {
  $('modes').replaceChildren(seg(Object.keys(MODES), () => app.mode, setMode, MODES,
    m => `:${{ play: 'sports_kabaddi', grid: 'grid_view', gallery: 'animation', character: 'accessibility_new', animate: 'timeline' }[m]}: ${m}`));
  const pause = button('', 'Pause / play (P)', () => { app.paused = !app.paused; });
  reg(pause, () => { setRich(pause, app.paused ? ':play_arrow: play' : ':pause: pause'); pause.classList.toggle('on', app.paused); });
  $('transport').replaceChildren(pause,
    button(':skip_next: step', 'Advance one 60 fps frame (N)', () => { app.paused = app.stepOnce = true; }),
    button(':restart_alt: restart', 'Restart the fight(s) (R)', restart),
    seg([1, 0.5, 0.25, 0.1], () => app.speed, v => { app.speed = v; },
      { 1: 'Real time', 0.5: 'Half speed', 0.25: 'Quarter speed', 0.1: 'One tenth: study single frames' }, v => ({ 1: '1×', 0.5: '½', 0.25: '¼', 0.1: '⅒' })[v]),
    toggle(':mouse: scrub', 'Mouse left/right over the view sets the time: every fight is re-simulated to that moment (M)', () => app.scrub, v => { app.scrub = v; app.scrubF = null; }),
    toggle(':repeat: loop', 'Scripted fights restart when their period ends; off = stop at the end', () => app.loop, v => {
      app.loop = v;
      for (const w of mode().worlds()) { w.loop = v; if (v && w.done) w.reset(); }
    }),
    button(':view_sidebar: panel', 'Show / hide the side panel (H)', togglePanel),
    button(':keyboard: keys', 'Keys: rebind any action, set up macros, and help', keysPanel));
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
  setRich($('help'), mode().hint());
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
const FIGHT = ['left', 'right', 'up', 'down', 'hop', 'punch', 'kick', 'special', 'guard'];
const fightKey = code => FIGHT.find(a => keymap[a].some(k => k === code || k.endsWith('+' + code)));
const SHORTCUTS = {
  pause: () => { app.paused = !app.paused; },
  step: () => { app.paused = app.stepOnce = true; },
  restart,
  panel: togglePanel,
  ghost: () => { CFG.ghost = !CFG.ghost; },
  boxes: () => { CFG.boxes = !CFG.boxes; },
  scrub: () => { app.scrub = !app.scrub; app.scrubF = null; },
  ...Object.fromEntries(Object.keys(MODES).map(m => [m, () => setMode(m)])),
};
addEventListener('keydown', e => { if (captureKey(e)) e.stopImmediatePropagation(); }, true); // rebinding a key
addEventListener('keydown', e => {
  if (e.target.type === 'number') return;
  if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); e.shiftKey || e.code === 'KeyY' ? redo() : undo(); return; }
  const a = act(e), mod = e.metaKey || e.ctrlKey;
  if (mode().key?.(e, a)) { e.preventDefault(); syncAll(); return; }
  if (!mod && SHORTCUTS[a]) { SHORTCUTS[a](); syncAll(); return; }
  const m = !mod && macroFor(e);
  if (m) { e.preventDefault(); if (!e.repeat) runMacro(m); return; }
  const f = FIGHT.includes(a) ? a : fightKey(e.code);
  if (!f) return;
  e.preventDefault();
  if (!e.repeat) pressed.add(f);
  keys.add(f);
});
addEventListener('keyup', e => { const f = fightKey(e.code); if (f) keys.delete(f); });
addEventListener('blur', () => keys.clear());
function readInput() {
  const i = { left: keys.has('left'), right: keys.has('right'), up: keys.has('up'), down: keys.has('down'), guard: keys.has('guard'),
    hop: pressed.has('hop'), punch: pressed.has('punch'), kick: pressed.has('kick'), special: pressed.has('special') };
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
