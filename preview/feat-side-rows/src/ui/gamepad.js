'use strict';
// ---------- gamepad: a standard-mapping pad drives the player like the keyboard does (the same keys / pressed sets) ----------
// Every button can be bound to any key action (keys panel, gamepad section; stored in stick2.pad). Fight actions press the
// fighter's keys in a fight; other actions (pause, restart, rewind, modes…) run like their key does. Outside a fight the pad
// works the menus: D-pad / stick moves the focus, A presses the focused control, B is Esc. Polled only while a pad is
// connected. An embed takes it only with gamepad in its input option (src/ui/embed.js)
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Home'];
const PAD_DEFAULT = { 0: 'punch', 1: 'kick', 2: 'special', 3: 'hop', 4: 'guard', 5: 'guard', 6: 'rewind', 9: 'pause', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const PAD_STORE = 'stick2.pad';
const padCfg = (() => { const d = { map: { ...PAD_DEFAULT }, dead: 0.4 };
  try { return { ...d, ...JSON.parse(localStorage.getItem(PAD_STORE)) }; } catch { return d; } })();
const savePad = () => { try { localStorage.setItem(PAD_STORE, JSON.stringify(padCfg)); } catch {} };
const resetPad = () => { padCfg.map = { ...PAD_DEFAULT }; padCfg.dead = 0.4; savePad(); };
// the actions a pad holds now: its bound buttons, plus the left stick past the dead zone as directions
function padActions(pad, map = padCfg.map, dead = padCfg.dead) {
  const on = new Set(), [ax = 0, ay = 0] = pad.axes || [];
  for (const [i, a] of Object.entries(map)) if (a && pad.buttons[i]?.pressed) on.add(a);
  if (ax < -dead) on.add('left'); if (ax > dead) on.add('right'); if (ay < -dead) on.add('up'); if (ay > dead) on.add('down');
  return on;
}
// the menu buttons, fixed so a rebind can't lock you out: directions, A, B
function padMenu(pad, dead = padCfg.dead) {
  const b = i => !!pad.buttons[i]?.pressed, [ax = 0, ay = 0] = pad.axes || [];
  return { up: b(12) || ay < -dead, down: b(13) || ay > dead, left: b(14) || ax < -dead, right: b(15) || ax > dead, ok: b(0), back: b(1) };
}
// the focusable controls in reading order, inside the open popup if there is one
function padFocusables() {
  const root = document.querySelector('.pop, #palette') || document;
  return [...root.querySelectorAll('button, select, input, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent);
}
function padMove(dir) {
  const all = padFocusables(); if (!all.length) return;
  const i = all.indexOf(document.activeElement);
  all[i < 0 ? (dir > 0 ? 0 : all.length - 1) : (i + dir + all.length) % all.length].focus();
}
const gp = { timer: null, held: new Set(), menu: {}, rep: 0, name: '' };
function gpPoll() {
  const pad = [...(navigator.getGamepads?.() || [])].find(p => p?.connected);
  if (!pad) return;
  gp.name = pad.id;
  const embedOff = typeof EMBED !== 'undefined' && EMBED && !EMBED.cfg.input.includes('gamepad');
  const fight = inFight() && !document.querySelector('.pop, #palette');
  const on = embedOff ? new Set() : padActions(pad);
  // fight actions only reach the fighter in a fight; the rest run once per press, anywhere
  const isFight = a => FIGHT.includes(a);
  for (const a of on) if (!gp.held.has(a)) {
    if (isFight(a)) { if (fight) { pressed.add(a); keys.add(a); } }
    else if (SHORTCUTS[a]) { SHORTCUTS[a](); syncAll(); }
  }
  for (const a of gp.held) if (!on.has(a) && isFight(a)) keys.delete(a);
  if (!fight) for (const a of on) if (isFight(a)) keys.delete(a);
  gp.held = on;
  if (fight || embedOff) { gp.menu = {}; return; }
  // menus: a direction moves the focus on press, then repeats while held
  const m = padMenu(pad), now = performance.now(), dir = m.down || m.right ? 1 : m.up || m.left ? -1 : 0;
  const was = gp.menu.down || gp.menu.right ? 1 : gp.menu.up || gp.menu.left ? -1 : 0;
  if (dir && dir !== was) { padMove(dir); gp.rep = now + 350; } else if (dir && now > gp.rep) { padMove(dir); gp.rep = now + 110; }
  if (m.ok && !gp.menu.ok) document.activeElement?.click?.();
  if (m.back && !gp.menu.back) { document.activeElement?.blur?.(); dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })); }
  gp.menu = m;
}
// the keys panel's gamepad section: which action each button presses, and the stick's dead zone
function padContent() {
  const opts = ['', ...ACTIONS.map(a => a[0])];
  return [
    h('p', { cls: 'note', textContent: gp.timer ? `Connected: ${gp.name || 'a gamepad'}` : 'No gamepad connected: press a button on it to wake it' }),
    ...PAD_NAMES.map((n, i) => h('div', { cls: 'row' }, h('span', { textContent: n }), h('select', { tip: `What ${n} presses (— nothing). Outside a fight A and B also press / cancel the focused control`,
      onchange: e => { padCfg.map[i] = e.target.value; savePad(); } }, ...opts.map(a => h('option', { value: a, textContent: a || '—', selected: (padCfg.map[i] || '') === a }))))),
    h('div', { cls: 'row' }, h('span', { textContent: 'stick dead zone' }), h('input', { type: 'number', min: 0.05, max: 0.95, step: 0.05, value: padCfg.dead,
      tip: 'How far the left stick has to move before it counts as a direction (0.05 – 0.95)', onkeydown: e => e.stopPropagation(),
      onchange: e => { padCfg.dead = Math.min(0.95, Math.max(0.05, +e.target.value || 0.4)); savePad(); } })),
    h('div', { cls: 'bar' }, button(':restart_alt: reset pad', 'Every gamepad button and the dead zone back to the defaults', () => { resetPad(); refreshKeys(); })),
  ];
}
addEventListener('gamepadconnected', () => { gp.timer ??= setInterval(gpPoll, 1000 / 120); refreshKeys(); });
addEventListener('gamepaddisconnected', () => {
  if ([...(navigator.getGamepads?.() || [])].some(p => p?.connected)) return;
  clearInterval(gp.timer); gp.timer = null; for (const k of gp.held) keys.delete(k); gp.held.clear(); refreshKeys();
});
