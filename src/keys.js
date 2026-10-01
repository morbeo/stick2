'use strict';
// ---------- keys: every action's keys can be rebound; macros press a sequence of inputs with one key ----------
// [action, group, default keys, tip]. Keys are KeyboardEvent codes, with 'Shift+' / 'Alt+' for combinations
const ACTIONS = [
  ['left', 'fight', ['KeyA', 'ArrowLeft'], 'Move left'], ['right', 'fight', ['KeyD', 'ArrowRight'], 'Move right'],
  ['jump', 'fight', ['KeyW', 'ArrowUp', 'Space'], 'Jump'], ['down', 'fight', ['KeyS', 'ArrowDown'], 'Crouch (and the down of special motions)'],
  ['punch', 'fight', ['KeyJ'], 'Punch'], ['kick', 'fight', ['KeyK'], 'Kick'],
  ['pause', 'transport', ['KeyP'], 'Pause / play'], ['step', 'transport', ['KeyN'], 'Advance one 60 fps frame'],
  ['restart', 'transport', ['KeyR'], 'Restart the fight(s)'], ['scrub', 'transport', ['KeyM'], 'Scrub: the mouse sets the time'],
  ['panel', 'view', ['KeyH'], 'Hide / show the side panel'], ['ghost', 'view', ['KeyG'], 'Ghost of the keyframe pose'], ['boxes', 'view', ['KeyB'], 'Hitboxes'],
  ['play', 'modes', ['Digit1'], 'Play mode'], ['grid', 'modes', ['Digit2'], 'Grid mode'], ['gallery', 'modes', ['Digit3'], 'Gallery mode'],
  ['character', 'modes', ['Digit4'], 'Character mode'], ['animate', 'modes', ['Digit5'], 'Animate mode'],
  ['prevKey', 'animate', ['Shift+ArrowLeft'], 'Previous key'], ['nextKey', 'animate', ['Shift+ArrowRight'], 'Next key'],
  ['frameBack', 'animate', ['Comma'], 'Step the move back a frame'], ['frameFwd', 'animate', ['Period'], 'Step the move forward a frame'],
  ['playMove', 'animate', ['Enter'], 'Play / pause the move'], ['onion', 'animate', ['KeyO'], 'Onion skin'], ['aim', 'animate', ['KeyI'], 'Aim the striking limb at the cursor'],
  ['deleteBone', 'character', ['Delete', 'Backspace'], 'Delete the selected bone'],
];
const KEY_STORE = 'stick2.keys';
const keyStore = (() => { try { return JSON.parse(localStorage.getItem(KEY_STORE)) || {}; } catch { return {}; } })();
const DEFAULT_MACROS = [{ key: 'KeyU', seq: '2, 3, 6P' }, { key: 'KeyL', seq: '6, 2, 3P' }];
const keymap = { ...Object.fromEntries(ACTIONS.map(([a, , k]) => [a, k])), ...keyStore.map };
const macros = keyStore.macros || clone(DEFAULT_MACROS);
const saveKeys = () => { try { localStorage.setItem(KEY_STORE, JSON.stringify({ map: keymap, macros })); } catch {} };

const combo = e => (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + e.code;
// the action of a key event: the exact combination first; fight keys also work with modifiers held
function act(e) {
  const c = combo(e);
  return ACTIONS.find(([a]) => keymap[a].includes(c))?.[0] ?? ACTIONS.find(([a, g]) => g === 'fight' && keymap[a].includes(e.code))?.[0];
}
const fightHint = () => { const k = a => keyLabel(keymap[a][0] || '—');
  return `${k('left')}/${k('right')} move · ${k('jump')} jump · ${k('down')} crouch · ${k('punch')} punch · ${k('kick')} kick · keys: rebind, macros`; };
const macroFor = e => macros.find(m => m.key === combo(e) || m.key === e.code);
const keyLabel = k => k.replace('Shift+', '⇧').replace('Alt+', '⌥').replace(/^Key|^Digit/, '')
  .replace(/Arrow(Left|Right|Up|Down)/, (_, d) => ({ Left: '←', Right: '→', Up: '↑', Down: '↓' })[d]).replace('Comma', ',').replace('Period', '.');

// macro text: comma-separated steps. Numpad digits are directions relative to the opponent (2 down, 3 down-forward,
// 6 forward, 4 back, 8 jump …), P / K the buttons, a number with a dot waits that many seconds: '2, 3, 6P' · 'P, 0.13, P, 0.13, K'
const NUMPAD = { 1: 'down+back', 2: 'down', 3: 'down+fwd', 4: 'back', 5: '', 6: 'fwd', 7: 'back+jump', 8: 'jump', 9: 'fwd+jump' };
function parseMacro(seq) {
  return seq.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    if (s.includes('.')) return +s || 0;
    const m = s.match(/^([1-9]?)([PK]*)$/i);
    if (!m) return s; // word form: 'down+fwd+punch'
    return [NUMPAD[m[1] || 5], ...[...m[2].toUpperCase()].map(b => b === 'P' ? 'punch' : 'kick')].filter(Boolean).join('+') || 0;
  });
}
// a macro plays in every world the keyboard controls (merged with the keys held), see World.step
function runMacro(m) {
  for (const w of mode().worlds()) if (w.ctl[0] === 'human') w.macro = new Script(parseMacro(m.seq));
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
const unbind = k => { for (const a in keymap) keymap[a] = keymap[a].filter(x => x !== k); macros.forEach(m => { if (m.key === k) m.key = ''; }); };
function keyChip(get, set, tip, empty = '—') {
  const b = button('', tip + ' · click, then press the new key (Esc cancels, Backspace removes)', () => {
    capture = k => { if (k) unbind(k); set(k); };
    b.textContent = 'press a key…';
  }, 'mini');
  reg(b, () => { if (capture === null) b.textContent = get() ? keyLabel(get()) : empty; });
  return b;
}
let keysPop = null;
const refreshKeys = () => { if (keysPop?.isConnected) keysPop.replaceChildren(...keysContent()); };
function keysContent() {
  const groups = [...new Set(ACTIONS.map(a => a[1]))];
  return [
    ...groups.flatMap(g => [h('h4', { textContent: g }), ...ACTIONS.filter(a => a[1] === g).map(([a, , , tip]) =>
      h('div', { cls: 'row', tip }, h('span', { textContent: a }), h('span', { cls: 'bar' },
        ...keymap[a].map((k, i) => keyChip(() => keymap[a][i], v => { if (v) keymap[a][i] = v; else keymap[a].splice(i, 1); }, tip)),
        keyChip(() => '', v => { if (v) keymap[a].push(v); }, `Add a key for ${a}`, '+'))))]),
    h('h4', { textContent: 'macros', tip: 'One key presses a sequence. Steps: numpad directions (2 down, 3 down-forward, 6 forward…) with P / K, or waits like 0.1' }),
    ...macros.map((m, i) => h('div', { cls: 'bar' },
      keyChip(() => m.key, v => { m.key = v || ''; }, 'Macro key'),
      h('input', { cls: 'macro', value: m.seq, tip: "Steps: '2, 3, 6P' (↓↘→ punch) · 'P, 0.13, P, 0.13, K' · numbers with a dot are waits in seconds",
        onchange: e => { m.seq = e.target.value; saveKeys(); }, onkeydown: e => e.stopPropagation() }),
      button('×', 'Delete this macro', () => { macros.splice(i, 1); saveKeys(); refreshKeys(); }, 'mini'))),
    h('div', { cls: 'bar' },
      button('+ macro', 'Add a macro', () => { macros.push({ key: '', seq: 'P, 0.13, P, 0.13, K' }); saveKeys(); refreshKeys(); }),
      button('reset keys', 'Every key and macro back to the defaults', () => {
        Object.assign(keymap, Object.fromEntries(ACTIONS.map(([a, , k]) => [a, [...k]])));
        macros.splice(0, macros.length, ...clone(DEFAULT_MACROS)); saveKeys(); refreshKeys();
      })),
    ...KEYS.flatMap(([g, k]) => [h('h4', { textContent: g }), h('p', { cls: 'keys', textContent: k })]),
  ];
}
function keysPanel(e, b) { keysPop = h('div', { cls: 'keyspop' }, ...keysContent()); popup(b, keysPop); }
