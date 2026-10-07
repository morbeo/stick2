'use strict';
// ---------- command palette (⌘K): every mode, toolbar tool, key action, table (moves, inputs, combos, bones), character, scenario, move and setting, found by typing ----------
// entries are gathered when it opens, so they follow the current mode's toolbar; ↑ ↓ pick, Enter runs, Esc closes
function paletteEntries() {
  const tipName = t => (t || '').split(/[:·(]/)[0].trim();
  // the small persistent bars under a preview (timelineBar, targetBar, blowBar) count as tools too; the rest of #over
  // (stage panels, popups) does not — too much, and mostly not meaningful out of context
  const tools = [...document.querySelectorAll('#global button[data-tip], #ctx button[data-tip], .tlbar button[data-tip], .tgt button[data-tip], .blowbar button[data-tip], .cmpbar button[data-tip], .pvbar button[data-tip]')].filter(b => b.offsetParent).map(b => {
    const text = b.textContent.replace(/[\uE000-\uF8FF]/g, '').trim(), name = text && !/^[\d½¼⅒×]+$/.test(text) ? text : tipName(b.dataset.tip);
    return { kind: 'tool', name, tip: b.dataset.tip, run: () => b.click() };
  });
  const keyOf = a => keymap[a]?.[0] ? shortcutLabel(a) : '';
  // the tables over the stage: in the character tab over its stage, else in animate
  const over = ' (in the character tab there, else in animate)', overView = v => () => {
    if (app.mode !== 'character' && app.mode !== 'animate') setMode('animate');
    openStage(v);
  };
  return [
    ...docTopics().map(t => ({ kind: 'docs', name: t.title, tip: t.body, run: () => openDocs(t.id) })),
    ...Object.keys(MODES).map(m => ({ kind: 'mode', name: m, tip: MODES[m], key: keyOf(m), run: () => setMode(m) })),
    ...tools,
    ...ACTIONS.filter(([a, g]) => SHORTCUTS[a] && g !== 'modes').map(([a, , , tip]) => ({ kind: 'action', name: a, tip, key: keyOf(a), run: SHORTCUTS[a] })),
    { kind: 'table', name: 'move table', tip: VIEW_TIPS.table + over, run: overView('table') },
    { kind: 'table', name: 'input table', tip: VIEW_TIPS.inputs + over, run: () => { inputs.table = true; overView('inputs')(); } },
    { kind: 'editor', name: 'combos', tip: VIEW_TIPS.combos + over, run: overView('combos') },
    { kind: 'editor', name: 'looks', tip: VIEW_TIPS.looks, run: () => setMode('fx') }, // 'sounds'/'tracker' are their own mode entries (above) now that they're fx views
    { kind: 'table', name: 'bone table', tip: 'Every bone of the character in a table over its stage: sort, filter, edit in place, drag to reorder, change parents (in the character tab)', run: () => {
      if (app.mode !== 'character') setMode('character');
      openStage('bones');
    } },
    ...Object.keys(layouts.sets).map(n => ({ kind: 'layout', name: 'layout: ' + n, tip: 'Use this layout (what each tab shows)', run: () => layUse(n) })),
    ...['ctx', 'side'].flatMap(kind => app.parts[kind].map(p => { const id = kind + ':' + p, on = layShown(id), what = kind === 'ctx' ? 'toolbar group' : 'side section';
      return { kind: 'layout', name: `${on ? 'hide' : 'show'} ${what}: ${p}`, tip: `${on ? 'Hide' : 'Show'} the ${what} "${p}" on this tab (layout)`, run: () => layShow(id, !on) }; })),
    { kind: 'layout', name: 'reset layout', tip: 'This tab back to how it starts, in the layout in use', run: () => layReset(tabOf(app.mode)) },
    { kind: 'table', name: 'compare settings', tip: CMP_PANEL_TIP, run: openCompare },
    { kind: 'action', name: 'reset settings', tip: 'Every setting back to its default; the display aids (ghost, boxes, scope, hud, labels, timer) stay (⌘Z undoes)', run: () => { applyPreset('juicy'); mode().restart(); } },
    { kind: 'action', name: 'factory reset', tip: 'Delete all local data (characters, settings, keys, macros, layout) and reload; asks first', run: () => factoryReset() },
    { kind: 'action', name: 'suggest this character', tip: 'Export the current character and open a GitHub issue to propose it for the roster, with instructions (see CONTRIBUTING.md)', run: suggestChar },
    { kind: 'action', name: 'copy embed link', tip: 'Copy a link that embeds the current scenario, pre-loaded (paste as an <iframe> src)', run: () => { const u = curU(); if (u) navigator.clipboard?.writeText(embedLink(u)); } },
    { kind: 'action', name: 'kitchen sink', tip: 'Every shared UI component on one page, for checking a theme change or hunting a visual bug', run: () => openKitchenSink() },
    ...Object.keys(DEFS).map(c => ({ kind: 'character', name: c, tip: 'Use this character in every mode', run: () => pickChar(c) })),
    ...Object.keys(SCENARIOS).map(k => ({ kind: 'scenario', name: k, tip: scenTip(SCENARIOS[k]), run: () => {
      if (mode() !== labMode || lab.mode === 'gallery') setMode('play');
      lab.scen = k; lab.playback = lab.branch = null; build(); panels();
    } })),
    ...Object.keys(currentChar().moves).map(n => ({ kind: 'move', name: n, tip: 'Open it in the animate editor', run: () => openMove(n) })),
    ...Object.keys(SOUNDS).map(n => ({ kind: 'sound', name: n, tip: 'Open it in the sounds editor', run: () => { setMode('sounds'); soundSel = n; panels(); } })),
    ...Object.keys(FX_LOOKS).map(n => ({ kind: 'look', name: n, tip: FX_LOOKS[n], run: () => { setMode('fx'); fxState.sel = n; panels(); } })),
    ...Object.keys(myTracks).map(n => ({ kind: 'track', name: n, tip: 'Open it in the tracker', run: () => { setMode('tracker'); trackSel = n; panels(); } })),
    ...Object.keys(PROPS).map(n => ({ kind: 'prop', name: n, tip: 'Open it in the prop editor', run: () => { setMode('props'); propSel = n; panels(); } })),
    ...Object.keys(WEAPONS).map(n => ({ kind: 'weapon', name: n, tip: 'Open it in the weapon editor', run: () => { setMode('weapons'); weaponSel = n; panels(); } })),
    ...SCHEMA.filter(s => !Array.isArray(s)).map(s => ({ kind: 'setting', name: s.k, tip: s.tip, run: DISPLAY.includes(s.k) ? () => debugPanel(null, debugBtn()) : () => {
      if (mode() !== labMode || lab.mode === 'gallery') setMode('play'); // the gallery shows the move panel instead
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
  const inp = h('input', { placeholder: 'type a mode, tool, table, combos, move, character, scenario or setting…', oninput: () => { sel = 0; fill(); },
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
