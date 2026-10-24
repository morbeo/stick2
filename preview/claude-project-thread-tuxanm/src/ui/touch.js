'use strict';
// ---------- touch: an on-screen pad for phones and tablets, and the canvas driven by a finger ----------
// the pad feeds the same keys / pressed sets the keyboard does (app.js), so a fight, a macro-free online match or
// a replay recording can't tell the two apart. Shown on a touch screen (pointer: coarse) whenever a fighter is yours;
// ui.touchPad overrides it either way (the :stadia_controller: toggle in the pad's own corner, or touchPad(true/false))
const tpCoarse = matchMedia('(pointer: coarse)');
const tpWanted = () => ui.touchPad ?? tpCoarse.matches;
const tpad = h('div', { id: 'tpad', cls: 'tpad' });
const TP_DIRS = ['left', 'right', 'up', 'down'];
// the stick: one finger, eight directions from its angle to the centre; a dead zone in the middle presses nothing
const tpStick = h('div', { cls: 'tstick' }, h('i', { cls: 'tknob' }));
let tpStickId = null;
function tpStickAt(e) {
  const b = tpStick.getBoundingClientRect(), dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
  const r = Math.hypot(dx, dy), dead = b.width * 0.15, on = new Set();
  if (r > dead) {
    const a = Math.atan2(dy, dx) * 180 / Math.PI; // 0 right, 90 down
    if (a > -67.5 && a < 67.5) on.add('right'); if (a > 112.5 || a < -112.5) on.add('left');
    if (a > 22.5 && a < 157.5) on.add('down'); if (a < -22.5 && a > -157.5) on.add('up');
  }
  for (const d of TP_DIRS) {
    if (on.has(d) && !keys.has(d)) pressed.add(d);
    on.has(d) ? keys.add(d) : keys.delete(d);
  }
  const k = Math.min(r, b.width / 2) / (r || 1);
  tpStick.firstChild.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
}
function tpStickEnd() { tpStickId = null; for (const d of TP_DIRS) keys.delete(d); tpStick.firstChild.style.transform = ''; }
tpStick.onpointerdown = e => { e.preventDefault(); tpStickId = e.pointerId; tpStick.setPointerCapture(e.pointerId); tpStickAt(e); };
tpStick.onpointermove = e => { if (e.pointerId === tpStickId) tpStickAt(e); };
tpStick.onpointerup = tpStick.onpointercancel = e => { if (e.pointerId === tpStickId) tpStickEnd(); };
// the buttons: held while touched, an edge on the touch; each its own pointer, so P+G or a direction + K work together
const tpBtn = (a, label, tip) => {
  const b = h('button', { cls: 'tbtn t' + a, tip: tip }, label);
  const off = () => { keys.delete(a); b.classList.remove('on'); };
  b.onpointerdown = e => { e.preventDefault(); b.setPointerCapture(e.pointerId); pressed.add(a); keys.add(a); b.classList.add('on'); };
  b.onpointerup = b.onpointercancel = off;
  b.oncontextmenu = e => e.preventDefault();
  return b;
};
// J only in 2.5D: in 2D the stick's up already jumps (tpSync hides it)
const tpHop = tpBtn('hop', 'J', 'Jump');
const tbtns = h('div', { cls: 'tbtns' },
  tpBtn('punch', 'P', 'Punch'), tpBtn('kick', 'K', 'Kick'), tpBtn('special', 'S', 'Special'),
  tpBtn('guard', 'G', 'Guard (hold), parry (tap)'), tpHop);
tpad.append(tpStick, tbtns);
$('stage').append(tpad);
// a small corner switch on a touch screen: the pad off (to watch, or a keyboard plugged in) and back on
const tswitch = h('button', { cls: 'ico tswitch', tip: 'Touch controls on / off' });
setRich(tswitch, ':stadia_controller:');
tswitch.onclick = () => touchPad(!tpWanted());
$('stage').append(tswitch);
function touchPad(v) { ui.touchPad = v; saveUi(); }
// shown or hidden as the mode changes; letting go of everything when it hides, so no key stays stuck down
let tpShown = null;
function tpSync() {
  const show = tpWanted() && inFight() && !app.scrub;
  if (show !== tpShown) { tpShown = show; tpad.hidden = !show; if (!show) { tpStickEnd(); for (const a of FIGHT) keys.delete(a); } }
  tswitch.hidden = !(tpCoarse.matches || ui.touchPad) || !inFight();
  tswitch.classList.toggle('on', tpWanted());
  const flat = (mode().worlds?.()[0]?.cfg ?? CFG).plane === '2d';
  if (tpHop.hidden !== flat) { tpHop.hidden = flat; keys.delete('hop'); tpHop.classList.remove('on'); }
  requestAnimationFrame(tpSync);
}
tpSync();

// the canvas with a finger: a touch drives mode().mouse like the mouse does (drag a joint, scrub a timeline, pick a
// card), double tap stands in for a double click. touch-action: none on #c keeps the page from panning instead
let tpTouchId = null, tpLastTap = 0;
const tpMouse = (e, detail) => ({ clientX: e.clientX, clientY: e.clientY, button: 0, buttons: 1, detail, target: e.target,
  shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {}, stopPropagation() {} });
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || tpTouchId !== null) return;
  e.preventDefault(); tpTouchId = e.pointerId; canvas.setPointerCapture(e.pointerId);
  const t = performance.now(), detail = t - tpLastTap < 350 ? 2 : 1; tpLastTap = t;
  const [x, y] = at(e); mode().mouse?.('move', x, y, tpMouse(e, detail)); mode().mouse?.('down', x, y, tpMouse(e, detail)); syncAll();
});
canvas.addEventListener('pointermove', e => { if (e.pointerId === tpTouchId) mode().mouse?.('move', ...at(e), tpMouse(e, 1)); });
const tpUp = e => { if (e.pointerId !== tpTouchId) return; tpTouchId = null; mode().mouse?.('up', ...at(e), tpMouse(e, 1)); syncAll(); };
canvas.addEventListener('pointerup', tpUp);
canvas.addEventListener('pointercancel', tpUp);
// no compatibility mouse events after a touch: the pointer path above already handled it
canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
