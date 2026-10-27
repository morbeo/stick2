'use strict';
// ---------- command palette (⌘K): every mode, toolbar tool, key action, table (moves, inputs, combos, bones), character, scenario, move and setting, found by typing ----------
// entries are gathered when it opens, so they follow the current mode's toolbar; ↑ ↓ pick, Enter runs, Esc closes
function paletteEntries() {
  const tipName = t => (t || '').split(/[:·(]/)[0].trim();
  // the small persistent bars under a preview (timelineBar, the preview dock, blowBar) count as tools too; the rest of #over
  // (stage panels, popups) does not — too much, and mostly not meaningful out of context
  const tools = [...document.querySelectorAll('#global button[data-tip], #ctx button[data-tip], .tlbar button[data-tip], .dock button[data-tip], .blowbar button[data-tip], .pvbar button[data-tip], .rigcol button[data-tip]')].filter(b => b.offsetParent || b.closest('#ctx > .grp.ovf')).map(b => {
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
    { kind: 'table', name: 'dopesheet', tip: VIEW_TIPS.dope + over, run: overView('dope') },
    { kind: 'table', name: 'input table', tip: VIEW_TIPS.inputs + over, run: () => { inputs.table = true; overView('inputs')(); } },
    { kind: 'editor', name: 'combos', tip: VIEW_TIPS.combos + over, run: overView('combos') },
    { kind: 'editor', name: 'looks', tip: VIEW_TIPS.looks, run: () => setMode('fx') }, // 'sounds'/'tracker' are their own mode entries (above) now that they're fx views
    { kind: 'table', name: 'bone table', tip: 'Every bone of the character in a table over its stage: sort, filter, edit in place, drag to reorder, change parents (in the character tab; the bone tree and Alt+drag on the canvas reparent too)', run: () => {
      if (app.mode !== 'character') setMode('character');
      creator.boneView = 'table'; openStage('bones');
    } },
    { kind: 'table', name: 'bone tree', tip: 'The bone tree under the character view: select, fold, drag onto a bone to reparent (in the character tab)', run: () => {
      if (app.mode !== 'character') setMode('character');
      creator.boneView = 'tree'; openStage('bones');
    } },
    { kind: 'table', name: 'stats radar', tip: 'The character\'s stats on a radar under the character view, other characters overlaid to compare (in the character tab)', run: () => {
      if (app.mode !== 'character') setMode('character');
      creator.boneView = 'radar'; openStage('bones');
    } },
    ...['ground', 'air', 'fight', 'walk', 'shadow'].map(t => ({ kind: 'editor', name: 'stats: ' + t, tip: `The ${t} tab of the character's Stats section (in the character tab)`, run: () => {
      if (app.mode !== 'character') setMode('character');
      creator.statTab = t; try { localStorage.setItem('stick2.statTab', t); } catch {} panels();
      const hd = [...document.querySelectorAll('#side h3')].find(x => x.textContent.startsWith('Stats'));
      if (hd?.parentElement.classList.contains('shut')) hd.click();
      hd?.scrollIntoView({ block: 'start' });
    } })),
    ...[['rig tools', 'Show or hide the rig tools column beside the character view', () => { rig.hidden = !rig.hidden; panels(); }],
      ['rig: setup mode', RIG_MODE_TIPS.setup, () => { rig.mode = 'setup'; }], ['rig: animate mode', RIG_MODE_TIPS.animate, () => { rig.mode = 'animate'; }],
      ['rig: copy pose', 'Copy the stance pose', copyPose], ['rig: paste pose', 'Paste the copied pose onto every bone it has', () => pastePose()],
      ['rig: paste pose to selected', 'Paste the copied pose onto the selected bones only', () => pastePose(selIds())],
      ['rig: reset selected bones', 'Reset the selected bones to the bind pose', () => resetBones()],
      ['rig: isolate selection', 'Ghost every bone but the selected ones', () => { rig.isolate = !rig.isolate; }],
      ['rig: ghost tip', 'Trail the selected bone\'s tip in the preview fight', () => { rig.ghost = !rig.ghost; rig.trail.length = 0; }],
      ['stance blend: bezier', 'Make the selected stance\'s transition an auto blend on your own bezier curve (edit it under transition)', () => {
        if (studio.stance) edit(d => { const st = d.stances[studio.stance - 1]; st.morph = { ...st.morph, mode: 'auto', ease: 'bezier' }; });
      }],
      ['skin: save', 'Save the bones\' current look as a new skin', saveSkin],
      ...Object.keys(DEFS[CURRENT]?.skins || {}).map(n => ['skin: ' + n, `Apply the ${n} skin`, () => applySkin(n)]),
      ['rig: clear constraints', 'Remove follow and reach from the selected bones', () => edit(d => { for (const b of selDefs(d)) for (const k of ['follow', 'followMix', 'reach', 'reachMix']) delete b[k]; })]]
      .map(([name, tip, f]) => ({ kind: 'action', name, tip: tip + ' (in the character tab)', run: () => { if (app.mode !== 'character') setMode('character'); f(); panels(); } })),
    ...[...Object.keys(EASE), 'bezier'].map(e => ({ kind: 'action', name: 'key easing: ' + e, tip: `Ease the selected key ${e}: ${EASE_TIPS[e]} (in animate)`, run: () => {
      if (app.mode !== 'animate') setMode('animate');
      setKey('e', e); panels();
    } })),
    ...Object.keys(SHAPE_TIPS).map(sh => ({ kind: 'action', name: 'bone shape: ' + sh, tip: `Draw the selected bones as ${sh}: ${SHAPE_TIPS[sh]} (in the character tab)`, run: () => {
      if (app.mode !== 'character') setMode('character');
      edit(d => { for (const b of selDefs(d)) b.shape = sh; });
    } })),
    ...Object.keys(CAP_TIPS).map(cap => ({ kind: 'action', name: 'bone cap: ' + cap, tip: `Draw the selected line bones' ends ${cap}: ${CAP_TIPS[cap]} (in the character tab)`, run: () => {
      if (app.mode !== 'character') setMode('character');
      edit(d => { for (const b of selDefs(d)) if (cap === 'round') delete b.cap; else b.cap = cap; });
    } })),
    ...Object.keys(layouts.sets).map(n => ({ kind: 'layout', name: 'layout: ' + n, tip: 'Use this layout (what each tab shows)', run: () => layUse(n) })),
    ...['ctx', 'side'].flatMap(kind => app.parts[kind].map(p => { const id = kind + ':' + p, on = layShown(id), what = kind === 'ctx' ? 'toolbar group' : 'side section';
      return { kind: 'layout', name: `${on ? 'hide' : 'show'} ${what}: ${p}`, tip: `${on ? 'Hide' : 'Show'} the ${what} "${p}" on this tab (layout)`, run: () => layShow(id, !on) }; })),
    { kind: 'layout', name: ui.ctxAll ? 'toolbar: one row' : 'toolbar: all rows', tip: 'The toolbar on one row (the rest behind "more"), or every group on as many rows as it needs', run: () => { ui.ctxAll = !ui.ctxAll; saveUi(); ctxFit(); } },
    ...[['group', 'grouped settings'], ['context', 'selection first'], ['sticky', 'sticky headings'], ['allVars', 'all variables']].map(([k, n]) => ({ kind: 'layout', name: `side panel: ${sideCfg()[k] ? 'no ' : ''}${n}`, tip: 'Side panel option, in every tab (layout popup: side options)', run: () => setSide(k, !sideCfg()[k]) })),
    ...['off', 'editors', 'all'].map(v => ({ kind: 'layout', name: `side panel: one open section ${v}`, tip: 'One side section open at a time: off, in character and animate, or in every tab', run: () => setSide('accordion', v) })),
    { kind: 'layout', name: 'reset layout', tip: 'This tab back to how it starts, in the layout in use', run: () => layReset(tabOf(app.mode)) },
    { kind: 'table', name: 'compare settings', tip: CMP_PANEL_TIP, run: openCompare },
    { kind: 'action', name: 'reset settings', tip: 'Every setting back to its default; the display aids (ghost, boxes, scope, hud, labels, timer) stay (⌘Z undoes)', run: () => { applyPreset('juicy'); mode().restart(); } },
    { kind: 'action', name: 'check for update', tip: 'Ask the server for the newest version now; reloads to it when there is one (the build running is in the debug popup)', run: async () => { await checkStale(); if (appStale) reloadLatest(); } },
    { kind: 'action', name: 'load build', tip: 'Play stick2 as it was at any commit, branch or tag (build.html?sha=…); your saves are copied in read-only', run: () => { const r = prompt('Commit id, branch or tag', typeof BUILD === "object" ? BUILD.commit : ''); if (r) open('build.html?sha=' + encodeURIComponent(r.trim()), '_blank'); } },
    { kind: 'action', name: 'factory reset', tip: 'Delete all local data (characters, settings, keys, macros, layout) and reload; asks first', run: () => factoryReset() },
    { kind: 'action', name: 'character: export as code', tip: 'Download the current character as src/engine/chars/<name>.js (its closest built-in plus a diff), ready to commit; see docs/characters.md', run: exportCharCode },
    { kind: 'action', name: 'suggest this character', tip: 'Export the current character and open a GitHub issue to propose it for the roster, with instructions (see CONTRIBUTING.md)', run: suggestChar },
    { kind: 'action', name: 'embed builder', tip: 'Open the embed builder: pick what an embedded stick2 holds (scene, characters, UI, tools, controls, replay), preview it, copy the link or <iframe>', run: () => open(location.pathname.replace(/[^/]*$/, '') + 'embed.html', '_blank', 'noopener') },
    { kind: 'action', name: 'embed this', tip: 'Open the embed builder on what is open now (this tab and fight, or this replay frame)', run: embedThis },
    { kind: 'action', name: 'copy embed link', tip: 'Copy a link that embeds the current scenario, pre-loaded (paste as an <iframe> src)', run: () => { const u = curU(); if (u) navigator.clipboard?.writeText(embedLink(u)); } },
    { kind: 'action', name: 'kitchen sink', tip: 'Every shared UI component on one page, for checking a theme change or hunting a visual bug', run: () => openKitchenSink() },
    { kind: 'action', name: 'netplay', tip: 'Fight someone online: the play tab\'s netplay section (browser to browser with an invite, or through a stick2 server)', run: () => openNetplay(false) },
    { kind: 'action', name: 'netplay: host', tip: 'Open an online lobby and make an invite link to send to the other player', run: () => openNetplay(true) },
    { kind: 'action', name: 'netplay: server', tip: 'Play through a stick2 server: host a room or join one by its code, no codes to copy back and forth (docs/server.md)', run: () => openNetplay(false, true) },
    { kind: 'action', name: 'netplay: rooms', tip: 'Browse a stick2 server\'s public rooms and join or watch one (the last server used)', run: () => { openNetplay(false, true); netRooms(netServerSaved()); } },
    { kind: 'action', name: 'netplay: replays', tip: 'Watch a stick2 server\'s saved fights again (the last server used)', run: () => { openNetplay(false, true); netReplays(netServerSaved()); } },
    { kind: 'action', name: 'netplay: reroll name', tip: 'Get a new made-up netplay name (gogili, shpinga, kobokobo…); it stays on this device', run: () => { netReroll(); openNetplay(false); } },
    { kind: 'action', name: 'netplay: chat', tip: 'Jump to the netplay chat (Enter sends, Esc back to the fight)', run: () => openNetChat() },
    { kind: 'action', name: 'netplay: scan', tip: 'Scan an invite or an answer QR code with the camera (where the browser can read QR codes)', run: () => { openNetplay(false); netScan(t => net.lobby?.host && net.inviting === 'waiting' ? netAnswer(t) : netEnter(t)); } },
    { kind: 'action', name: 'welcome', tip: 'What stick2 can do and where to go for each activity, with a little demo of each (shown once on the first visit)', run: openWelcome },
    ...Object.keys(DEFS).map(c => ({ kind: 'character', name: c, tip: 'Use this character in every mode', run: () => pickChar(c) })),
    ...Object.keys(SCENARIOS).map(k => ({ kind: 'scenario', name: k, tip: scenTip(SCENARIOS[k]), run: () => {
      if (mode() !== labMode || lab.mode === 'gallery') setMode('play');
      lab.scen = k; lab.playback = lab.branch = null; build(); panels();
    } })),
    // every character's own moves, not just the current one's — picks that character first if it isn't already
    ...Object.keys(DEFS).flatMap(c => Object.keys(CHARS[c].moves).map(n => ({ kind: 'move', name: c === CURRENT ? n : `${n} (${c})`,
      tip: c === CURRENT ? 'Open it in the animate editor' : `Open ${c}'s ${n} in the animate editor`, run: () => { if (CURRENT !== c) pickChar(c); openMove(n); } }))),
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
