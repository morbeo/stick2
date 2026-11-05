'use strict';
// ---------- gamepad: a standard-mapping pad drives the player like the keyboard does (the same keys / pressed sets) ----------
// D-pad or left stick: directions; A punch, B kick, X special, Y hop, LB / RB guard; Start pauses. Polled only while a pad
// is connected. An embed takes it only with gamepad in its input option (src/ui/embed.js)
const GP_BUTTONS = { 0: 'punch', 1: 'kick', 2: 'special', 3: 'hop', 4: 'guard', 5: 'guard', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const gp = { timer: null, held: new Set(), start: false };
function gpPoll() {
  const pad = [...(navigator.getGamepads?.() || [])].find(p => p?.connected);
  if (!pad) return;
  const on = new Set(), dead = 0.4, [ax = 0, ay = 0] = pad.axes;
  for (const [i, k] of Object.entries(GP_BUTTONS)) if (pad.buttons[i]?.pressed) on.add(k);
  if (ax < -dead) on.add('left'); if (ax > dead) on.add('right'); if (ay < -dead) on.add('up'); if (ay > dead) on.add('down');
  if (typeof EMBED !== 'undefined' && EMBED && !EMBED.cfg.input.includes('gamepad')) on.clear();
  for (const k of on) if (!gp.held.has(k)) { pressed.add(k); keys.add(k); }
  for (const k of gp.held) if (!on.has(k)) keys.delete(k);
  gp.held = on;
  const start = !!pad.buttons[9]?.pressed;
  if (start && !gp.start && inFight()) { app.paused = !app.paused; syncAll(); }
  gp.start = start;
}
addEventListener('gamepadconnected', () => { gp.timer ??= setInterval(gpPoll, 1000 / 120); });
addEventListener('gamepaddisconnected', () => {
  if ([...(navigator.getGamepads?.() || [])].some(p => p?.connected)) return;
  clearInterval(gp.timer); gp.timer = null; for (const k of gp.held) keys.delete(k); gp.held.clear();
});
