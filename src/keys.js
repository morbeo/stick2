'use strict';
// ---------- keys: every action's keys can be rebound; macros press a sequence of inputs with one key ----------
// [action, group, default keys, tip]. Keys are KeyboardEvent codes, with 'Shift+' / 'Alt+' for combinations
const ACTIONS = [
  ['left', 'fight', ['KeyA', 'ArrowLeft'], 'Move left'], ['right', 'fight', ['KeyD', 'ArrowRight'], 'Move right'],
  ['up', 'fight', ['KeyW', 'ArrowUp'], '2D: jump (with J / K together: an up attack) · 2.5D: a direction for moves and into the screen (lanes: double tap sidesteps)'],
  ['down', 'fight', ['KeyS', 'ArrowDown'], 'Crouch (and the down of special motions) · 2.5D: out of the screen (lanes: double tap sidesteps)'],
  ['hop', 'fight', ['Space'], 'Jump, in every plane (2D: ↑ too); with ← / → held a ninja flip (flips setting)'],
  ['punch', 'fight', ['KeyJ'], 'Punch (P)'], ['kick', 'fight', ['KeyK'], 'Kick (K)'], ['special', 'fight', ['KeyU'], 'Special (S): with a direction, a different special'],
  ['guard', 'fight', ['KeyL'], 'Guard (G), hold: blocks attacks from the front only; with ↓ a low guard. Tap it just before a hit to parry'],
  ['pause', 'transport', ['KeyP'], 'Pause / play'], ['step', 'transport', ['KeyN'], 'Advance one 60 fps frame'],
  ['rewind', 'transport', ['KeyV'], 'Rewind one second (the fight replays its inputs up to there)'], ['stepBack', 'transport', ['KeyC'], 'Back one frame'],
  ['restart', 'transport', ['KeyR'], 'Restart the fight(s)'], ['scrub', 'transport', ['KeyM'], 'Scrub: the mouse sets the time'],
  ['panel', 'view', ['KeyH'], 'Hide / show the side panel'], ['ghost', 'view', ['KeyG'], 'Ghost of the keyframe pose'], ['boxes', 'view', ['KeyB'], 'Hitboxes'],
  ['hints', 'view', ['Shift+Slash'], 'Show / hide the help line and the frame meter legend'],
  ['play', 'modes', ['Digit1'], 'Play mode'], ['grid', 'modes', ['Digit2'], 'Grid mode'], ['gallery', 'modes', ['Digit3'], 'Gallery mode'],
  ['character', 'modes', ['Digit4'], 'Character mode'], ['animate', 'modes', ['Digit5'], 'Animate mode'],
  ['impact', 'modes', ['Digit6'], 'Impact mode'],
  ['prevKey', 'animate', ['Shift+ArrowLeft'], 'Previous key'], ['nextKey', 'animate', ['Shift+ArrowRight'], 'Next key'],
  ['frameBack', 'animate', ['Comma'], 'Step the move back a frame'], ['frameFwd', 'animate', ['Period'], 'Step the move forward a frame'],
  ['playMove', 'animate', ['Enter'], 'Play / pause the move'], ['onion', 'animate', ['KeyO'], 'Onion skin'], ['aim', 'animate', ['KeyI'], 'Aim the striking limb at the cursor'],
  ['deleteBone', 'character', ['Delete', 'Backspace'], 'Delete the selected bone (character mode) or key (animate mode)'],
];
const KEY_STORE = 'stick2.keys';
const keyStore = (() => { try { return JSON.parse(localStorage.getItem(KEY_STORE)) || {}; } catch { return {}; } })();
const DEFAULT_MACROS = [{ key: 'KeyO', seq: '2, 3, 6P' }, { key: 'KeyY', seq: '6, 2, 3P' }];
const keymap = { ...Object.fromEntries(ACTIONS.map(([a, , k]) => [a, k])), ...keyStore.map };
if (keyStore.map?.jump) { keymap.up = keymap.jump; delete keymap.jump; } // 'jump' became 'up' (Space jumps)
const macros = keyStore.macros || clone(DEFAULT_MACROS);
const saveKeys = () => { try { localStorage.setItem(KEY_STORE, JSON.stringify({ map: keymap, macros })); } catch {} };

const combo = e => (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + e.code;
// contexts: in a fight (play, grid) the letters belong to the fighter, so a shortcut on a plain letter takes Shift (⇧P pause);
// in the editor modes shortcuts take the plain keys and the fight keys do nothing. Fight keys and macros work in fights only,
// animate and character shortcuts in the editor only, transport, view and mode keys in both
const FIGHT_MODES = ['play', 'grid'];
const inFight = () => FIGHT_MODES.includes(app.mode);
const CTX_OF = { fight: ['fight'], macro: ['fight'], animate: ['editor'], character: ['editor'] };
const ctxOf = g => CTX_OF[g] || ['fight', 'editor'];
const groupOf = a => ACTIONS.find(x => x[0] === a)?.[1];
// the combination a key of a group is pressed with in a context
const keyIn = (k, g, ctx) => ctx === 'fight' && !CTX_OF[g] && /^Key/.test(k) ? 'Shift+' + k : k;
// what a key takes in each context ('fight Shift+KeyP'); a fight letter's ⇧ form is left to a shortcut on that letter
const usesOf = (k, g) => ctxOf(g).map(c => c + ' ' + keyIn(k, g, c));
// the actions and macros sharing a combination in a context: only the first of them ever fires
function keyClashes() {
  const seen = new Map(), clash = new Set();
  const add = (o, g, k) => { for (const u of usesOf(k, g)) { const p = seen.get(u); if (p && p !== o) clash.add(p).add(o); else seen.set(u, o); } };
  for (const [a, g] of ACTIONS) for (const k of keymap[a]) add(a, g, k);
  macros.forEach((m, i) => m.key && add('macro ' + (i + 1), 'macro', m.key));
  return clash;
}
// the action of a key event in the current context: in a fight a fight key first (with modifiers too), then a shortcut on
// a non-letter or a combination, then a shortcut letter with Shift; in the editor modes only shortcuts, by their exact keys
function act(e) {
  const c = combo(e), ctx = inFight() ? 'fight' : 'editor';
  const sc = k => ACTIONS.find(([a, g]) => g !== 'fight' && ctxOf(g).includes(ctx) && keymap[a].includes(k))?.[0];
  if (ctx === 'editor') return sc(c);
  const fight = code => ACTIONS.find(([a, g]) => g === 'fight' && keymap[a].includes(code))?.[0];
  return fight(c) ?? (!/^Key/.test(c) ? sc(c) : null) ?? (e.shiftKey && /^Key/.test(e.code) ? sc(c.replace('Shift+', '')) : null) ?? fight(e.code);
}
// a shortcut's key as pressed in the current context, and for tooltips in both: 'P, in a fight ⇧P'
const shortcutLabel = a => keymap[a][0] ? keyLabel(keyIn(keymap[a][0], groupOf(a), inFight() ? 'fight' : 'editor')) : '';
const keyTip = a => { const k = keymap[a][0], g = groupOf(a); if (!k) return '';
  const e = keyIn(k, g, 'fight'); return ` (${keyLabel(k)}${e !== k ? `, in a fight ${keyLabel(e)}` : ''})`; };
const fightHint = () => { const k = a => keyLabel(keymap[a][0] || '—');
  return `${k('left')}/${k('right')} move · ${(mode().worlds()[0]?.cfg ?? CFG).plane === '2d' ? `${k('up')} jump · ${k('down')} crouch` : `${k('up')}/${k('down')} depth · ${k('hop')} jump`} · ${k('punch')} punch · ${k('kick')} kick · ${k('special')} special · ${k('guard')} guard (tap: parry) · ⇧ + letter: shortcuts (⇧P pause) · keys: rebind, macros`; };
const macroFor = e => macros.find(m => m.key === combo(e) || m.key === e.code);
const keyLabel = k => k.replace('Shift+', '⇧').replace('Alt+', '⌥').replace(/^Key|^Digit/, '')
  .replace(/Arrow(Left|Right|Up|Down)/, (_, d) => ({ Left: '←', Right: '→', Up: '↑', Down: '↓' })[d]).replace('Comma', ',').replace('Period', '.');

// macro text: comma-separated steps. Numpad digits are directions relative to the opponent (2 down, 3 down-forward,
// 6 forward, 4 back, 8 up …), P / K / S / G the buttons, a number with a dot waits that many seconds: '2, 3, 6P' · 'P, 0.13, P, 0.13, K'
const NUMPAD = { 1: 'down+back', 2: 'down', 3: 'down+fwd', 4: 'back', 5: '', 6: 'fwd', 7: 'back+up', 8: 'up', 9: 'fwd+up' };
const BUTTONS = { P: 'punch', K: 'kick', S: 'special', G: 'guard' };
function parseMacro(seq) {
  return seq.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    if (s.includes('.')) return +s || 0;
    const m = s.match(/^([1-9]?)([PKSG]*)$/i);
    if (!m) return s; // word form: 'down+fwd+punch'
    return [NUMPAD[m[1] || 5], ...[...m[2].toUpperCase()].map(b => BUTTONS[b])].filter(Boolean).join('+') || 0;
  });
}
// a macro plays in every world the keyboard controls (merged with the keys held), see World.step
function runMacro(m) {
  for (const w of mode().worlds()) if (w.ctl[0] === 'human' && !w.playback) { w.macro = new Script(parseMacro(m.seq)); w.macroSeq = m.seq; }
}

// ---------- keys panel: click a key to rebind it (Esc cancels, Backspace removes), + adds one ----------
let capture = null;
function captureKey(e) {
  if (!capture || /^(Shift|Alt|Control|Meta)/.test(e.code)) return !!capture;
  e.preventDefault();
  const fn = capture; capture = null;
  if (e.code !== 'Escape') fn(e.code === 'Backspace' ? null : combo(e));
  saveKeys(); syncAll(); refreshKeys();
  return true;
}
// a key given to a group's action leaves the actions and macros it would clash with (in a context they share), not the rest:
// a fight letter and an editor shortcut on the same key both stay
const unbind = (k, g) => { const mine = new Set(usesOf(k, g)), hit = (x, g2) => usesOf(x, g2).some(u => mine.has(u));
  for (const [a, g2] of ACTIONS) keymap[a] = keymap[a].filter(x => !hit(x, g2));
  macros.forEach(m => { if (m.key && hit(m.key, 'macro')) m.key = ''; }); };
function keyChip(get, set, tip, g, empty = '—') {
  const b = button('', tip + ' · click, then press the new key (Esc cancels, Backspace removes)', () => {
    capture = k => { if (k) unbind(k, g); set(k); };
    setRich(b, 'press a key…');
  }, 'mini');
  reg(b, () => { if (capture === null) setRich(b, get() ? keyLabel(get()) : empty); });
  return b;
}
let keysPop = null;
const refreshKeys = () => { if (keysPop?.isConnected) keysPop.replaceChildren(...keysContent()); };
function keysContent() {
  const groups = [...new Set(ACTIONS.map(a => a[1]))], clash = keyClashes();
  const CLASH = ' · shares its key with another action in the same context: only the first one fires';
  const where = g => g === 'fight' ? 'in a fight (play, grid)' : CTX_OF[g] ? 'in the editor modes' : 'everywhere; a letter takes ⇧ in a fight';
  return [
    h('p', { cls: 'note', textContent: 'In a fight (play, grid) the letters are the fighter\'s: a shortcut on a letter takes ⇧ there (⇧P pause, ⇧R restart). In the editor modes (gallery, impact, character, animate) shortcuts take the plain key and the fight keys do nothing.' }),
    ...groups.flatMap(g => [h('h4', { textContent: `${g} · ${where(g)}` }), ...ACTIONS.filter(a => a[1] === g).map(([a, , , tip]) =>
      h('div', { cls: clash.has(a) ? 'row warn' : 'row', tip: clash.has(a) ? tip + CLASH : tip }, h('span', { textContent: a }), h('span', { cls: 'bar' },
        ...keymap[a].map((k, i) => keyChip(() => keymap[a][i], v => { if (v) keymap[a][i] = v; else keymap[a].splice(i, 1); }, tip, g)),
        keyChip(() => '', v => { if (v) keymap[a].push(v); }, `Add a key for ${a}`, g, '+'))))]),
    h('h4', { textContent: 'macros · in a fight (play, grid)', tip: 'One key presses a sequence. Steps: numpad directions (2 down, 3 down-forward, 6 forward…) with P / K / S / G, or waits like 0.1' }),
    ...macros.map((m, i) => h('div', { cls: clash.has('macro ' + (i + 1)) ? 'bar warn' : 'bar' },
      keyChip(() => m.key, v => { m.key = v || ''; }, 'Macro key' + (clash.has('macro ' + (i + 1)) ? CLASH : ''), 'macro'),
      h('input', { cls: 'macro', value: m.seq, tip: "Steps: '2, 3, 6P' (↓↘→ punch) · 'P, 0.13, P, 0.13, K' · numbers with a dot are waits in seconds",
        onchange: e => { m.seq = e.target.value; saveKeys(); }, onkeydown: e => e.stopPropagation() }),
      button(':close:', 'Delete this macro', () => { macros.splice(i, 1); saveKeys(); refreshKeys(); }, 'mini'))),
    h('div', { cls: 'bar' },
      button(':add: macro', 'Add a macro', () => { macros.push({ key: '', seq: 'P, 0.13, P, 0.13, K' }); saveKeys(); refreshKeys(); }),
      button(':restart_alt: reset keys', 'Every key and macro back to the defaults', () => {
        Object.assign(keymap, Object.fromEntries(ACTIONS.map(([a, , k]) => [a, [...k]])));
        macros.splice(0, macros.length, ...clone(DEFAULT_MACROS)); saveKeys(); refreshKeys();
      })),
    ...KEYS.flatMap(([g, k]) => [h('h4', { textContent: g }), h('p', { cls: 'keys' }, ...rich(k))]),
  ];
}
function keysPanel(e, b) { keysPop = h('div', { cls: 'keyspop' }, ...keysContent()); popup(b, keysPop); }
