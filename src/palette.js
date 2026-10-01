'use strict';
// ---------- command palette (⌘K): every mode, toolbar tool, key action, character, move and setting, found by typing ----------
// entries are gathered when it opens, so they follow the current mode's toolbar; ↑ ↓ pick, Enter runs, Esc closes
function paletteEntries() {
  const tipName = t => (t || '').split(/[:·(]/)[0].trim();
  const tools = [...document.querySelectorAll('#global button[data-tip], #transport button[data-tip], #ctx button[data-tip]')].filter(b => b.offsetParent).map(b => {
    const text = b.textContent.replace(/[\uE000-\uF8FF]/g, '').trim(), name = text && !/^[\d½¼⅒×]+$/.test(text) ? text : tipName(b.dataset.tip);
    return { kind: 'tool', name, tip: b.dataset.tip, run: () => b.click() };
  });
  const keyOf = a => keymap[a]?.[0] ? keyLabel(keymap[a][0]) : '';
  return [
    ...docTopics().map(t => ({ kind: 'docs', name: t.title, tip: t.body, run: () => openDocs(t.id) })),
    ...Object.keys(MODES).map(m => ({ kind: 'mode', name: m, tip: MODES[m], key: keyOf(m), run: () => setMode(m) })),
    ...tools,
    ...ACTIONS.filter(([a, g]) => SHORTCUTS[a] && g !== 'modes').map(([a, , , tip]) => ({ kind: 'action', name: a, tip, key: keyOf(a), run: SHORTCUTS[a] })),
    ...Object.keys(DEFS).map(c => ({ kind: 'character', name: c, tip: 'Use this character', run: () => pickChar(c) })),
    ...Object.keys(currentChar().moves).map(n => ({ kind: 'move', name: n, tip: 'Open it in the animate editor', run: () => { if (app.mode !== 'animate') setMode('animate'); anim.view = 'cards'; pickMove(n); } })),
    ...SCHEMA.filter(s => !Array.isArray(s)).map(s => ({ kind: 'setting', name: s.k, tip: s.tip, run: () => {
      if (mode() !== labMode) setMode('play');
      lab.q = s.k; panels();
    } })),
  ];
}
// best first: name starts with the query, then contains it, then fuzzy on the name, then on the kind and tooltip
function paletteRank(q, e) {
  const n = e.name.toLowerCase(), l = q.toLowerCase();
  return !q ? 1 : n.startsWith(l) ? 4 : n.includes(l) ? 3 : fuzzy(q, e.name) ? 2 : fuzzy(q, `${e.kind} ${e.name}`) || (e.tip || '').toLowerCase().includes(l) ? 1 : 0;
}
function openPalette() {
  if ($('palette')) return closePalette();
  closePop();
  const all = paletteEntries(), list = h('div', { cls: 'plist' });
  let shown = [], sel = 0;
  const run = e => { closePalette(); e.run(); syncAll(); };
  const fill = () => {
    const q = inp.value.trim();
    shown = all.map(e => [paletteRank(q, e), e]).filter(([r]) => r).sort((a, b) => b[0] - a[0]).slice(0, 14).map(([, e]) => e);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.replaceChildren(...shown.map((e, i) => h('div', { cls: 'pitem' + (i === sel ? ' on' : ''), onmousedown: ev => { ev.preventDefault(); run(e); }, onmousemove: () => { if (sel !== i) { sel = i; fill(); } } },
      h('span', { cls: 'pk', textContent: e.kind }), h('b', { textContent: e.name }), h('span', { cls: 'pt' }, ...rich(e.tip || '')), e.key && h('kbd', { textContent: e.key }))));
    if (!shown.length) list.append(h('div', { cls: 'note', textContent: 'nothing matches' }));
  };
  const inp = h('input', { placeholder: 'type a mode, tool, move, character or setting…', oninput: () => { sel = 0; fill(); },
    onkeydown: e => {
      e.stopPropagation();
      if (e.key === 'Escape') closePalette();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % (shown.length || 1); fill(); }
      else if (e.key === 'Enter' && shown[sel]) run(shown[sel]);
    } });
  document.body.append(h('div', { id: 'palette', onmousedown: e => { if (e.target.id === 'palette') closePalette(); } }, h('div', { cls: 'pbox' }, inp, list)));
  fill(); inp.focus();
}
function closePalette() { $('palette')?.remove(); }
