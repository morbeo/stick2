'use strict';
// ---------- keys: every action's keys can be rebound; macros press a sequence of inputs with one key ----------
// [action, group, default keys, tip]. Keys are KeyboardEvent codes, with 'Shift+' / 'Alt+' for combinations
const ACTIONS = [
  ['left', 'fight', ['KeyA', 'ArrowLeft'], 'Move left'], ['right', 'fight', ['KeyD', 'ArrowRight'], 'Move right'],
  ['up', 'fight', ['KeyW', 'ArrowUp'], '2D: jump (with J / K together: an up attack) · 2.5D: a direction for moves and into the screen (lanes: double tap sidesteps)'],
  ['down', 'fight', ['KeyS', 'ArrowDown'], 'Crouch (and the down of special motions) · 2.5D: out of the screen (lanes: double tap sidesteps)'],
  ['hop', 'fight', ['Space'], 'Jump, in every plane (2D: ↑ too); with ← / → held a ninja flip (flips setting)'],
  ['punch', 'fight', ['KeyJ'], 'Punch (P)'], ['kick', 'fight', ['KeyK'], 'Kick (K)'], ['special', 'fight', ['KeyN'], 'Special (S): with a direction, a different special'],
  ['guard', 'fight', ['KeyL'], 'Guard (G), hold: blocks attacks from the front only; with ↓ a low guard. Tap it just before a hit to parry'],
  ['pause', 'transport', ['KeyP'], 'Pause or resume the fight(s)'], ['step', 'transport', ['KeyN'], 'Advance one 60 fps frame'],
  ['rewind', 'transport', ['KeyV'], 'Rewind one second (the fight replays its inputs up to there)'], ['stepBack', 'transport', ['KeyC'], 'Back one frame'],
  ['restart', 'transport', ['KeyR'], 'Restart the fight(s) from the beginning'], ['scrub', 'transport', ['KeyM'], 'Scrub: the mouse sets the time'],
  ['panel', 'view', ['KeyH'], 'Hide / show the side panel'], ['ghost', 'view', ['KeyG'], 'Show a ghost of the keyframe pose over the fighter'], ['boxes', 'view', ['KeyB'], 'Show the hit and hurt boxes'],
  ['hints', 'view', ['Shift+Slash'], 'Show / hide the help line and the frame meter legend'],
  ['theater', 'view', ['KeyT'], 'Theater mode: no toolbars, no side panel, just the fight, and tries for fullscreen — for streaming or recording (Esc, or the key again, leaves it)'],
  ['clip', 'view', ['KeyX'], 'Save a clip: the last seconds of the fight, the preview or the cell under the mouse'], ['record', 'view', ['KeyE'], 'Record a clip / stop and save it'],
  ['play', 'modes', ['Digit1'], 'Play mode'], ['grid', 'modes', ['Digit2'], 'Grid mode'], ['gallery', 'modes', ['Digit3'], 'Gallery mode'],
  ['character', 'modes', ['Digit4'], 'Character mode'], ['animate', 'modes', ['Digit5'], 'Animate mode'],
  ['impact', 'modes', ['Digit6'], 'Impact mode'], ['replay', 'modes', ['Digit7'], 'Replay mode'],
  ['prevKey', 'animate', ['Shift+ArrowLeft'], 'Select the previous key of the move'], ['nextKey', 'animate', ['Shift+ArrowRight'], 'Select the next key of the move'],
  ['frameBack', 'animate', ['Comma'], 'Step the move back a frame'], ['frameFwd', 'animate', ['Period'], 'Step the move forward a frame'],
  ['playMove', 'animate', ['Enter'], 'Play / pause the move'], ['onion', 'animate', ['KeyO'], 'Onion skin: ghosts of the previous and next keys'], ['aim', 'animate', ['KeyI'], 'Aim the striking limb at the cursor'],
  ['prevEvent', 'replay', ['BracketLeft'], 'Go to the previous shown event'], ['nextEvent', 'replay', ['BracketRight'], 'Go to the next shown event'],
  ['prevMark', 'replay', ['Shift+BracketLeft'], 'Go to the previous bookmark'], ['nextMark', 'replay', ['Shift+BracketRight'], 'Go to the next bookmark'],
  ['mark', 'replay', ['Backslash'], 'Add a bookmark at the playhead'],
  ['deleteBone', 'character', ['Delete', 'Backspace'], 'Delete the selected bone (character mode) or key (animate mode)'],
];
const KEY_STORE = 'stick2.keys';
const keyStore = (() => { try { return JSON.parse(localStorage.getItem(KEY_STORE)) || {}; } catch { return {}; } })();
const DEFAULT_MACROS = [{ key: 'KeyO', seq: '2, 3, 6P' }, { key: 'KeyY', seq: '6, 2, 3P' }];
const keymap = { ...Object.fromEntries(ACTIONS.map(([a, , k]) => [a, k])), ...keyStore.map };
if (keyStore.map?.jump) { keymap.up = keymap.jump; delete keymap.jump; } // 'jump' became 'up' (Space jumps)
const macros = keyStore.macros || clone(DEFAULT_MACROS);
// custom binds: a key for any app function paletteEntries() (palette.js) lists, not just ACTIONS. paletteEntries() builds fresh
// closures every call (it reads live DOM/state), so only { kind, name, key } is stored; the matching entry is found again when the key fires
const custom = keyStore.custom || [];
const saveKeys = () => { try { localStorage.setItem(KEY_STORE, JSON.stringify({ map: keymap, macros, custom })); } catch {} };

const combo = e => (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + e.code;
// contexts: in a fight (play, grid) the letters belong to the fighter, so a shortcut on a plain letter takes Shift (⇧P pause);
// in the editor modes shortcuts take the plain keys and the fight keys do nothing. Fight keys and macros work in fights only,
// animate and character shortcuts in the editor only, transport, view and mode keys in both
const FIGHT_MODES = ['play', 'grid'];
const inFight = () => FIGHT_MODES.includes(app.mode);
const CTX_OF = { fight: ['fight'], macro: ['fight'], animate: ['editor'], character: ['editor'], replay: ['editor'] };
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
  custom.forEach((c, i) => c.key && add('custom ' + (i + 1), 'custom', c.key));
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

// a macro plays in every world the keyboard controls (merged with the keys held), see World.step
function runMacro(m) {
  for (const w of mode().worlds()) if (w.ctl[0] === 'human' && !w.playback) { w.macro = new Script(parseMacro(m.seq)); w.macroSeq = m.seq; }
}

// a custom bind's group isn't in CTX_OF, so like 'view' or 'transport' it works everywhere, with a letter taking ⇧ in a fight
// (ctxOf/keyIn, above). This mirrors act()'s own non-fight shortcut matching, since custom binds aren't in ACTIONS so act() can't see them
const customAt = k => custom.find(c => c.key === k);
function customAct(e) {
  const c = combo(e), ctx = inFight() ? 'fight' : 'editor';
  if (ctx === 'editor') return customAt(c);
  return (!/^Key/.test(c) ? customAt(c) : null) ?? (e.shiftKey && /^Key/.test(e.code) ? customAt(c.replace('Shift+', '')) : null);
}
// fired on every keydown; paletteEntries() is rebuilt fresh so a bind on a deleted character or move just does nothing
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.target.closest?.('input, select, textarea, [contenteditable]')) return;
  const c = customAct(e);
  if (!c) return;
  const entry = paletteEntries().find(x => x.kind === c.kind && x.name === c.name);
  if (entry) { e.preventDefault(); entry.run(); syncAll(); }
});

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
  macros.forEach(m => { if (m.key && hit(m.key, 'macro')) m.key = ''; });
  custom.forEach(c => { if (c.key && hit(c.key, 'custom')) c.key = ''; }); };
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
let keysQuery = ''; // the search box text; kept across refreshKeys() rebuilds (e.g. after capturing a key) while the popup stays open
function keysContent() {
  const groups = [...new Set(ACTIONS.map(a => a[1]))], clash = keyClashes();
  const CLASH = ' · shares its key with another action in the same context: only the first one fires';
  const where = g => g === 'fight' ? 'in a fight (play, grid)' : CTX_OF[g] ? 'in the editor modes' : 'everywhere; a letter takes ⇧ in a fight';
  // fuzzy on the name (an action's id), plain substring on its tip, same split as the settings search (lab.js configPanel)
  const match = (name, tip) => { const q = keysQuery.trim().toLowerCase(); return !q || fuzzy(q, name) || (tip || '').toLowerCase().includes(q); };

  // one collapsible group per ACTIONS group (subFold, ui.js); rows keep their action and tip so the search box can filter them
  const groupSecs = groups.map(g => {
    const entries = ACTIONS.filter(a => a[1] === g).map(([a, , , tip]) => ({ a, tip, row:
      h('div', { cls: clash.has(a) ? 'row warn' : 'row', tip: clash.has(a) ? tip + CLASH : tip }, h('span', { textContent: a }), h('span', { cls: 'bar' },
        ...keymap[a].map((k, i) => keyChip(() => keymap[a][i], v => { if (v) keymap[a][i] = v; else keymap[a].splice(i, 1); }, tip, g)),
        keyChip(() => '', v => { if (v) keymap[a].push(v); }, `Add a key for ${a}`, g, '+'))) }));
    return { sec: subFold(`${g} · ${where(g)}`, entries.map(x => x.row)), entries };
  });
  const applyFilter = () => {
    const q = keysQuery.trim();
    keysPop.classList.toggle('searching', !!q);
    for (const { sec, entries } of groupSecs) {
      let any = false;
      for (const x of entries) { x.row.hidden = !match(x.a, x.tip); if (!x.row.hidden) any = true; }
      sec.hidden = !!q && !any;
    }
  };
  const search = h('div', { cls: 'bar' }, ...rich(':search:'),
    h('input', { cls: 'macro', value: keysQuery, placeholder: 'find an action by name or tip…',
      tip: 'Fuzzy search: letters in order match a name, plain text also matches its tip (like the settings search) · Esc clears',
      oninput: e => { keysQuery = e.target.value; applyFilter(); },
      onkeydown: e => { e.stopPropagation(); if (e.key === 'Escape') { e.target.value = keysQuery = ''; applyFilter(); } } }));

  const macroSec = subFold('macros · in a fight (play, grid)', [
    h('p', { cls: 'note', textContent: 'One key presses a sequence. Steps: numpad directions (2 down, 3 down-forward, 6 forward…) with P / K / S / G, or waits like 0.1.' }),
    ...macros.map((m, i) => h('div', { cls: clash.has('macro ' + (i + 1)) ? 'bar warn' : 'bar' },
      keyChip(() => m.key, v => { m.key = v || ''; }, 'The key that plays this macro in a fight' + (clash.has('macro ' + (i + 1)) ? CLASH : ''), 'macro'),
      h('input', { cls: 'macro', value: m.seq, tip: "Steps: '2, 3, 6P' (↓↘→ punch) · 'P, 0.13, P, 0.13, K' · numbers with a dot are waits in seconds",
        onchange: e => { m.seq = e.target.value; saveKeys(); }, onkeydown: e => e.stopPropagation() }),
      button(':close:', 'Delete this macro', () => { macros.splice(i, 1); saveKeys(); refreshKeys(); }, 'mini'))),
    button(':add: macro', 'Add a macro: one key that presses a sequence of inputs', () => { macros.push({ key: '', seq: 'P, 0.13, P, 0.13, K' }); saveKeys(); refreshKeys(); }),
  ]);

  // custom binds: a key for any app function paletteEntries() (palette.js) lists — modes, tools, tables, layouts, characters, moves,
  // settings, the same things ⌘K finds — picked with the same fuzzy ranking as the palette (paletteRank)
  const liveEntries = paletteEntries();
  const pickList = h('div', { cls: 'plist' });
  const pickEntry = e => {
    pickInp.value = ''; pickList.replaceChildren(h('div', { cls: 'note', textContent: `Press a key for ${e.kind}: ${e.name}… (Esc cancels)` }));
    capture = k => { if (!k) return; unbind(k, 'custom'); custom.push({ kind: e.kind, name: e.name, key: k }); };
  };
  const fillPick = () => {
    const q = pickInp.value.trim();
    const shown = q ? liveEntries.map(e => [paletteRank(q, e), e]).filter(([r]) => r).sort((a, b) => b[0] - a[0]).slice(0, 8).map(([, e]) => e) : [];
    pickList.replaceChildren(...shown.map(e => h('div', { cls: 'pitem', onmousedown: ev => { ev.preventDefault(); pickEntry(e); } },
      h('span', { cls: 'pk', textContent: e.kind }), h('b', { textContent: e.name }), h('span', { cls: 'pt' }, ...rich(e.tip || '')))));
  };
  const pickInp = h('input', { cls: 'macro', placeholder: 'bind a mode, tool, table, setting, character, move…',
    tip: 'Type to find any app function (the same ones ⌘K finds), pick it, then press a key for it',
    oninput: fillPick, onkeydown: ev => { ev.stopPropagation(); if (ev.key === 'Escape') { ev.target.value = ''; pickList.replaceChildren(); } } });
  const customSec = subFold('custom binds · everywhere; a letter takes ⇧ in a fight', [
    h('p', { cls: 'note', textContent: 'Bind a key to any app function, not just the actions above — the same ones ⌘K finds.' }),
    ...custom.map((c, i) => { const e = liveEntries.find(x => x.kind === c.kind && x.name === c.name), label = `${c.kind}: ${c.name}`;
      return h('div', { cls: clash.has('custom ' + (i + 1)) ? 'bar warn' : 'bar' },
        keyChip(() => c.key, v => { c.key = v || ''; }, `Runs ${label}` + (clash.has('custom ' + (i + 1)) ? CLASH : ''), 'custom'),
        h('span', { cls: 'bar', tip: e ? e.tip : 'This no longer exists in the app; delete this bind', textContent: label + (e ? '' : ' (gone)') }),
        button(':close:', 'Delete this custom bind', () => { custom.splice(i, 1); saveKeys(); refreshKeys(); }, 'mini')); }),
    pickInp, pickList,
  ]);

  applyFilter();
  return [
    h('p', { cls: 'note', textContent: 'In a fight (play, grid) the letters are the fighter\'s: a shortcut on a letter takes ⇧ there (⇧P pause, ⇧R restart). In the editor modes (gallery, impact, character, animate) shortcuts take the plain key and the fight keys do nothing.' }),
    search,
    ...groupSecs.map(x => x.sec),
    macroSec, customSec,
    h('div', { cls: 'bar' },
      button(':restart_alt: reset keys', 'Every key, macro and custom bind back to the defaults (your macros and custom binds are lost)', () => {
        Object.assign(keymap, Object.fromEntries(ACTIONS.map(([a, , k]) => [a, [...k]])));
        macros.splice(0, macros.length, ...clone(DEFAULT_MACROS));
        custom.splice(0, custom.length);
        saveKeys(); refreshKeys();
      })),
    ...KEYS.flatMap(([g, k]) => [h('h4', { textContent: g }), h('p', { cls: 'keys' }, ...rich(k))]),
  ];
}
function keysPanel(e, b) { keysPop = h('div', { cls: 'keyspop' }); keysPop.append(...keysContent()); popup(b, keysPop); }
