'use strict';
// ---------- toolbar, side panel ----------
function reelFromPlay() {
  const w = lab.mode === 'play' && lab.cells[0]?.w;
  if (!w?.log.length) return notice('No play fight yet', 'Fight a while in play first, then take it here.');
  loadReel(makeReplay(w, lab.playback?.scenario || lab.scen)); app.paused = true;
  if (app.mode !== 'replay') setMode('replay'); else panels();
}
function rpCtx() {
  const fromPlay = button(':sports_kabaddi: from play', 'Take the fight in play so far (since its last restart) as the replay to edit', reelFromPlay);
  reg(fromPlay, () => { fromPlay.disabled = !(lab.mode === 'play' && lab.cells[0]?.w.log.length); });
  const save = button(':save: save', 'Save this replay as a replay file (with your edits and bookmarks)', () => saveBlob(`${rp.reel.name.replace(/\W+/g, '-')}${rp.reel.edits ? '-edited' : ''}.replay.json`, new Blob([JSON.stringify(reelFile())], { type: 'application/json' })));
  reg(save, () => { save.disabled = !rp.reel; });
  return [
    grp('reel', 'The replay being edited: from the play fight or a file; save it', fromPlay,
      button(':upload: open', 'Open a replay file', () => pickReplay(r => { loadReel(r); app.paused = true; panels(); })), save),
    grp('types', 'The event types shown in the timeline and the table', Object.entries(EVENT_TYPES).map(([k, [col, icon, tip]]) => {
      const t = toggle(`:${icon}:`, `${k}: ${tip}`, () => rp.show.has(k), v => { rp.show[v ? 'add' : 'delete'](k); });
      t.style.color = col; return t;
    }), (() => { const all = toggle('all', 'Show every type, or hide them all when all are shown', () => rp.show.size === Object.keys(EVENT_TYPES).length,
      v => { rp.show = new Set(v ? Object.keys(EVENT_TYPES) : []); }); return all; })()),
    editGrp(),
    grp('footage', 'How the replay is shown and exported: in / out, slow motion, camera, labels (the fight stays the same)',
      button('[ in', 'Start the footage at the playhead (I)', () => footEdit(F => { F.in = rp.n; })), button('out ]', 'End the footage at the playhead (O)', () => footEdit(F => { F.out = rp.n; })),
      button(':close:', 'Clear in and out: the whole fight', () => footEdit(F => { F.in = F.out = null; }), 'mini'),
      ...Object.entries(FOOT_KINDS).map(([k, [, tip]]) => button(`:add: ${k}`, `${tip}. Over the selection, else a second from the playhead`, () => addSpan(k))),
      toggle(':visibility: preview footage', 'Preview the footage: slow motion, camera, labels and the in–out loop in the view (off: the plain fight)', () => rp.footOn, v => { rp.footOn = v; }),
      button(':download: export footage', 'Export the in–out range: format, size and shape, overlays', exportPop)),
    grp('movie', 'Cut shots from any loaded reel into a movie, played one after another (the movie section in the side panel)',
      button(':add: shot', 'Add a shot from this reel: the selection, else the footage in–out, else two seconds from the playhead', addShot),
      toggle(':movie: preview', 'Preview the movie instead of this reel', () => rp.playMovie, setPlayMovie),
      button(':download: export movie', 'Export the movie as one clip, cuts only', exportMovie)),
    grp('branch', 'Play on from the playhead as P1 or P2 (the other side keeps its recording or its AI), keep the result as a branch and compare it with the reel',
      button(':sports_kabaddi: P1', 'Branch: play on from here as P1, in play; then keep it', () => branchFrom(1)), button(':sports_kabaddi: P2', 'Branch: play on from here as P2, in play; then keep it', () => branchFrom(2)),
      seg(['side', 'overlay'], () => rp.cmp && rp.cmpView, v => { rp.cmpView = v; if (!rp.cmp) loadCmp(rp.reels.find(r => r !== rp.reel)); panels(); },
        { side: 'Compare side by side: A (this reel) and B (the compared one), on the same frame', overlay: 'Compare as a ghost: B see-through over A' })),
    grp('view', 'The timeline\'s window: wheel over it zooms, Shift+wheel pans, the minimap moves it',
      button(':zoom_in:', 'Zoom in on the playhead', () => rpZoom(0.5, rp.T[rp.n])), button(':remove:', 'Zoom out', () => rpZoom(2, rp.T[rp.n])),
      button(':unfold_more: fit', 'Show the whole fight', () => rpView(0, rpEnd())), button(':select_all:', 'Zoom to the selection', zoomToSel),
      button(':chevron_left:', 'Previous shown event' + keyTip('prevEvent'), () => rpJump(-1)), button(':chevron_right:', 'Next shown event' + keyTip('nextEvent'), () => rpJump(1))),
    panelsGrp(['events'], { events: 'The events as a table: fuzzy filter, sort, click a row to go there' }),
  ];
}
// per fighter, for the side panel: fightStats as rows
function rpStats() {
  return fightStats(rp.base, rp.lanes).map(st => ({ l: rp.lanes[st.id], rows: [['dealt', st.dealt], ['hits', st.hits], ['blocked', st.blocked], ['parried', st.parried],
    ['thrown', st.thrown], ['best combo', st.bestCombo ? st.bestCombo + ' hits' : '–'], ['top combo dmg', st.topComboDmg || '–'], ['K.O.', st.koF !== null ? fmtT(rp.T[st.koF]) : '–']] }));
}
// a time typed in seconds (Enter or leaving it sets it, on the nearest frame; Esc puts it back); get / set in frames
function secField(get, set, tip) {
  const inp = h('input', { cls: 'v sec', inputMode: 'decimal', tip: tip + ' · type seconds, Enter sets it' });
  const show = () => { inp.value = rp.T[get()]?.toFixed(2) ?? ''; };
  reg(inp, () => { if (document.activeElement !== inp) show(); });
  const put = () => { const t = parseFloat(inp.value.replace(',', '.')); if (isFinite(t)) set(nearFrame(clamp(t, 0, rpEnd()))); show(); };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { put(); inp.blur(); } if (e.key === 'Escape') { show(); inp.blur(); } });
  inp.addEventListener('change', put);
  return inp;
}
// a footage span in the side panel: go there, its settings (rate / zoom and who / caption), delete; the selected one is marked
function spanRow(sp, j) {
  const set = (k, v) => footEdit(() => { sp[k] = v; }, 'span' + j + k), seg2 = (k, opts, lbl = String) => seg(opts, () => sp[k], v => set(k, v), {}, lbl);
  const cap = sp.kind === 'label' && h('input', { cls: 'macro', value: sp.text || '', tip: 'The caption' });
  if (cap) { cap.addEventListener('input', () => set('text', cap.value)); cap.addEventListener('keydown', e => e.stopPropagation()); }
  return h('div', { cls: 'bar' + (rp.fsel === j ? ' on' : '') }, h('span', { cls: 'chip', style: `background:${FOOT_KINDS[sp.kind][0]}`, tip: FOOT_KINDS[sp.kind][1] }, sp.kind),
    button(':my_location:', 'Go to the span and select it', () => { rp.fsel = j; rpSeek(sp.a); app.paused = true; panels(); }, 'mini'),
    secField(() => sp.a, f => footEdit(() => { const len = sp.b - sp.a; sp.a = Math.min(f, rp.N - 1); sp.b = Math.min(rp.N, sp.a + len); }), 'Where the span starts (it keeps its length)'),
    h('span', { cls: 'note', textContent: 'for' }),
    (() => { const len = h('input', { cls: 'v sec', inputMode: 'decimal', tip: 'How long the span lasts · type seconds, Enter sets it' }); const show = () => { len.value = (rp.T[sp.b] - rp.T[sp.a]).toFixed(2); };
      reg(len, () => { if (document.activeElement !== len) show(); });
      const put = () => { const t = parseFloat(len.value.replace(',', '.')); if (t > 0) footEdit(() => { sp.b = Math.max(sp.a + 1, Math.min(rp.N, nearFrame(rp.T[sp.a] + t))); }); show(); };
      len.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { put(); len.blur(); } if (e.key === 'Escape') { show(); len.blur(); } }); len.addEventListener('change', put); return len; })(),
    sp.kind === 'slow' ? seg2('rate', RATES, v => '×' + v) : sp.kind === 'cam' ? [seg2('zoom', ZOOMS, v => v + '×'), seg2('follow', FOLLOW)] : cap,
    button('[', 'Start the span at the playhead', () => footEdit(() => { sp.a = Math.min(rp.n, sp.b - 1); }), 'mini'),
    button(']', 'End the span at the playhead', () => footEdit(() => { sp.b = Math.max(rp.n, sp.a + 1); }), 'mini'),
    button(':remove:', 'A quarter second shorter (from its end)', () => footEdit(() => { sp.b = Math.max(sp.a + 1, frameAt(rp.T[sp.b] - 0.25)); }), 'mini'),
    button(':add:', 'A quarter second longer (at its end)', () => footEdit(() => { sp.b = Math.min(rp.N, frameAt(rp.T[sp.b] + 0.25) + 1); }), 'mini'),
    crud({ delete: ['Delete the span', () => { footEdit(F => { F.spans.splice(j, 1); rp.fsel = null; }); panels(); }] }));
}
// the toolbar's edit group: insert at the playhead, change the selected presses, delete, cut or duplicate the selection's frames
function editGrp() {
  const human = () => rp.reel && rp.master.ctl[0] === 'human', keys = [...Object.entries(BTN_NAMES), ...Object.entries(HELD_NAMES)];
  const ins = button(':add: insert', 'Insert an input at the playhead: a press, or a direction or guard held for 12 frames', (ev, b) => popup(b, h('b', { textContent: 'insert at the playhead' }),
    h('div', { cls: 'bar' }, keys.map(([k, n]) => button(n, k in HELD_NAMES ? `Hold ${n} for 12 frames from the playhead` : `Press ${n} at the playhead`, () => { closePop(); reelEdit(() => insertInput(k)); })))));
  const chg = button(':swap_horiz: change', 'Change the selected presses to another button', (ev, b) => popup(b, h('b', { textContent: 'change the selected presses to' }),
    h('div', { cls: 'bar' }, Object.entries(BTN_NAMES).map(([k, n]) => button(n, `Make them ${n} presses`, () => { closePop(); reelEdit(() => changeInputs(k)); })))));
  const del = button(':delete:', 'Delete the selected inputs' + keyTip('deleteBone'), () => reelEdit(deleteInputs));
  const cut = button(':content_cut:', 'Cut: the frames the selection spans go, everything after comes earlier', () => reelEdit(cutSpan));
  const dup = button(':content_copy:', 'Duplicate: the frames the selection spans play twice', () => reelEdit(dupSpan));
  reg(ins, () => { ins.disabled = !human(); chg.disabled = !selInputs().some(e => e.kind === 'press'); del.disabled = !selInputs().length; cut.disabled = dup.disabled = !rp.sel.size; });
  return grp('edit', 'Edit your inputs (P1 in a play fight): the fight plays again from the first changed frame. Drag selected inputs in the timeline to retime them, , and . nudge them a frame; ⌘Z undoes', ins, chg, del, cut, dup);
}
// ---------- side panel: the reel, what happens at the playhead, the selection, the types (how many, where), footage, bookmarks, reels, stats ----------
// now: refreshed as the playhead moves (rpRender calls rp.sideNow when the frame changed)
function nowPanel() {
  const at = h('div', { cls: 'note' }), list = h('div', { cls: 'bar col' }), fs = h('div');
  rp.sideN = null; // the next frame drawn fills it in
  rp.sideNow = () => {
    if (!at.isConnected) return at.seen && (rp.sideNow = null); // a newer panel took over
    at.seen = true;
    at.textContent = `${fmtT(rp.T[rp.n])} · frame ${rp.n} of ${rp.N}`;
    fs.replaceChildren(...rp.view.fighters.filter(f => !f.hidden).map(f => {
      const max = f.c('health'), act = f.action && !f.action.m.hurt ? f.action.name : '', st = frameState(f);
      return h('div', { cls: 'nowf', tip: `${who(f.id)}: health ${Math.round(f.hp)}${max > 0 ? ' / ' + max : ''}, stun ${Math.round(100 * f.stunM / (f.c('dizzyAt') || 1))}%, frame state ${st}` },
        h('b', { textContent: `${who(f.id)} ${f.ch.name}`, style: `color:${f.col[0]}` }),
        max > 0 ? h('span', { cls: 'hpbar' }, h('i', { style: `width:${100 * clamp(f.hp / max, 0, 1)}%;background:${f.col[0]}` })) : null,
        h('span', { cls: 'note', textContent: [act && `${act} (${st})`, !act && st !== 'idle' && st, f.combo > 1 && `${f.combo}-hit combo`, f.kd, f.dizzyT > 0 && 'dizzy'].filter(Boolean).join(' · ') || 'idle' }));
    }));
    const recent = rp.events.filter(e => e.f <= rp.n && e.f > rp.n - 20 && rp.show.has(e.type) && e.type !== 'input').slice(-5);
    list.replaceChildren(...recent.map(e => button(`:${EVENT_TYPES[e.type][1]}: ${who(e.who)} ${e.name}`, `${evText(e)} · click: select it`, () => { rp.sel = new Set([e.i]); rp.scrollTo = e.i; syncAll(); }, 'mini')));
  };
  return [heading('now', 'What happens at the playhead: each fighter\'s health, stun, move and its phase, combo; the events of the last third of a second (click one to select it).'), at, fs, list];
}
// the selection: what it holds and what to do with it
function selPanel() {
  const box = h('div', { cls: 'bar col' });
  reg(box, () => {
    const es = rp.events.filter(e => rp.sel.has(e.i)), s = selSpan();
    if (!es.length) return box.replaceChildren(h('p', { cls: 'note', textContent: 'Nothing selected: click events in the timeline or the table (⌘ / ⇧ for more), or drag a box over them in the lanes.' }));
    const ins = selInputs().length, by = Object.keys(EVENT_TYPES).map(t => [t, es.filter(e => e.type === t).length]).filter(([, n]) => n);
    box.replaceChildren(...[h('p', { cls: 'note', textContent: `${es.length} event${es.length > 1 ? 's' : ''} · ${fmtT(rp.T[s[0]])}–${fmtT(rp.T[Math.min(s[1], rp.N)])} · ${by.map(([t, n]) => `${n} ${t}`).join(', ')}` }),
      ...es.slice(0, 4).map(e => button(`:${EVENT_TYPES[e.type][1]}: ${who(e.who)} ${e.name}`, evText(e) + ' · click: go there', () => { rpSeek(e.f); rpFollow(); app.paused = true; }, 'mini')),
      es.length > 4 ? h('span', { cls: 'note', textContent: `… and ${es.length - 4} more (the events table lists them)` }) : null,
      h('div', { cls: 'bar' }, button(':select_all: zoom', 'Fit the timeline to the selection', zoomToSel, 'mini'),
        ...Object.keys(FOOT_KINDS).map(k => button(`:add: ${k}`, `${FOOT_KINDS[k][1]}, over the selection`, () => addSpan(k), 'mini')),
        button(':add: bookmark', 'A bookmark at the selection\'s start', async () => { rpSeek(s[0]); await addMark(); }, 'mini'),
        ...ins ? [button(':delete:', `Delete the ${ins} selected input${ins > 1 ? 's' : ''} (the fight plays again from there)`, () => reelEdit(deleteInputs), 'mini')] : [],
        button(':close:', 'Select nothing (Esc)', () => rp.sel.clear(), 'mini'))].filter(Boolean));
  });
  return [heading('selection', 'The events you picked: what they are and when; zoom to them, put slow motion, a camera, a label or a bookmark over them, delete selected inputs.'), box];
}
// the highlights: the best moments found (best first), pick the ones for the reel; slowed finishers and titles; export
function hlPanel() {
  return [heading('highlights', 'The best moments, found from the events (combos of three hits or more, K.O.s, parries, counters, wall hits, throws), best first. Pick the ones for a highlights reel; export joins them in fight order.'),
    h('div', { cls: 'bar' }, toggle(':speed: slow finish', 'Slow each moment\'s finishing blow to a quarter speed', () => rp.hl.slow, v => { rp.hl.slow = v; }),
      toggle('titles', 'Show each moment\'s name over its first second', () => rp.hl.titles, v => { rp.hl.titles = v; }),
      button(':download: export highlights', 'Export the picked moments as one clip (size and format as in footage → export)', () => exportHighlights()),
      button(':movie: make movie', 'Add the picked highlights as shots, in fight order', () => movieEdit(M => { M.shots.push(...hlSegs().map(sg => ({ reel: rp.reels.indexOf(rp.reel), a: sg.a, b: sg.b }))); }))),
    ...rp.moments.length ? rp.moments.slice(0, 12).map(m => h('div', { cls: 'bar trow' },
      toggle(String(m.score), `Score ${m.score}: put it in the highlights reel`, () => rp.hl.picked.has(m.a), v => { rp.hl.picked[v ? 'add' : 'delete'](m.a); }),
      button(`${fmtT(rp.T[m.a])} ${m.name}`, 'Go there and select the span', () => { rpSeek(m.a); rp.v = [rp.T[m.a] - 0.2, rp.T[m.b] + 0.2]; rpView(...rp.v); app.paused = true; }, 'mini')))
      : [h('p', { cls: 'note', textContent: 'No moments yet: combos of three hits, K.O.s, parries, counters, wall hits and throws show here.' })]];
}
// the types: show / hide, how many, where in the fight (a strip: click it to go there), previous / next of that type
function typesPanel() {
  const has = Object.keys(EVENT_TYPES).map(t => [t, rp.events.filter(e => e.type === t)]).filter(([, es]) => es.length);
  return [heading('types', 'Each kind of event: show or hide it (timeline and table), how many there are, where they fall in the fight (click the strip to go there), and the previous / next one from the playhead.'),
    ...has.map(([t, es]) => {
      const [col, icon, tip] = EVENT_TYPES[t], cv = h('canvas', { cls: 'spark', width: 120, height: 16, tip: `Where the ${t} events fall over the fight (darker: more); click to go there` });
      const g = cv.getContext('2d'), bins = new Array(40).fill(0), end = rpEnd();
      for (const e of es) bins[Math.min(39, Math.floor(rp.T[e.f] / end * 40))]++;
      const top = Math.max(...bins); g.fillStyle = col;
      bins.forEach((n, i) => { if (n) { const hh = Math.max(2, 14 * n / top); g.fillRect(i * 3, 16 - hh, 2, hh); } });
      cv.onclick = e => { rpSeek(frameAt(e.offsetX / cv.clientWidth * end)); rpFollow(); app.paused = true; };
      const tg = toggle(`:${icon}: ${t}`, `${tip} · click: ${rp.show.has(t) ? 'hide' : 'show'} them`, () => rp.show.has(t), v => { rp.show[v ? 'add' : 'delete'](t); });
      tg.style.color = col;
      const jump = d => () => { const fs = es.map(e => e.f), f = d > 0 ? Math.min(...fs.filter(f => f > rp.n)) : Math.max(...fs.filter(f => f < rp.n)); if (isFinite(f)) { rpSeek(f); rpFollow(); app.paused = true; } };
      return h('div', { cls: 'bar trow' }, tg, h('span', { cls: 'note', textContent: String(es.length) }), cv,
        button(':chevron_left:', `The previous ${t} event`, jump(-1), 'mini'), button(':chevron_right:', `The next ${t} event`, jump(1), 'mini'));
    })];
}
function footSide() {
  return [
    heading('footage', 'The footage edits: in and out, and the spans (slow motion, camera, label) in the timeline\'s footage row; drag a span to move it, its ends to resize it. Saved in the replay file; the export uses them.'),
    h('div', { cls: 'bar' }, h('span', { cls: 'note', textContent: 'in' }), secField(() => footRange()[0], f => footEdit(F => { F.in = Math.min(f, footRange()[1] - 1); }), 'Where the footage starts'),
      h('span', { cls: 'note', textContent: 'out' }), secField(() => footRange()[1], f => footEdit(F => { F.out = Math.max(f, footRange()[0] + 1); }), 'Where the footage ends')),
    ...foot().spans.map((sp, j) => spanRow(sp, j)),
  ];
}
function markSide() {
  return [
    heading('bookmarks', 'Named moments, saved in the replay file. \\ adds one at the playhead, ⇧[ ⇧] go to the previous / next.'),
    ...rp.reel.rep.marks.map((m, j) => h('div', { cls: 'bar' }, button(`⚑ ${m.name}`, `Go to ${fmtT(rp.T[m.f])} (f${m.f})`, () => { rpSeek(m.f); rpFollow(); app.paused = true; }),
      h('span', { cls: 'note', textContent: fmtT(rp.T[m.f]) }),
      crud({ rename: ['Rename the bookmark', async () => { const n = await askText('Rename the bookmark', m.name); if (n) { m.name = n; rebuildEvents(); panels(); } }], delete: ['Delete the bookmark', () => { rp.reel.rep.marks.splice(j, 1); rebuildEvents(); panels(); }] }))),
    h('div', { cls: 'bar' }, button(':add: bookmark', 'Add a bookmark at the playhead' + keyTip('mark'), addMark)),
  ];
}
function rpSide() {
  if (!rp.reel) return [heading('replay', 'Edit a recorded fight: its events on a timeline and in a table.')];
  const r = rp.reel.rep, w = rp.master, old = r.version !== ENGINE_VERSION;
  return [
    heading('replay', 'The recorded fight: its scenario, length, fighters and engine version. The events are found by playing it once.'),
    h('p', { cls: 'note', textContent: `${rp.reel.name} · ${fmtT(rp.T[rp.N])} · ${rp.N} frames · engine v${r.version}` }),
    rp.reel.edits ? h('p', { cls: 'note warn', textContent: `Edited (${rp.reel.edits} change${rp.reel.edits > 1 ? 's' : ''}): save to keep it.` }) : null,
    old ? h('p', { cls: 'note warn', textContent: `Recorded with engine v${r.version}, this is v${ENGINE_VERSION}: it may play out differently.` }) : null,
    rp.reel.desync !== null ? h('p', { cls: 'note warn', textContent: `The file goes out of sync with its recording from ${fmtT(rp.T[rp.reel.desync] ?? 0)}.` }) : null,
    h('p', { cls: 'note', textContent: w.fighters.map(f => `${who(f.id)} ${f.ch.name}`).join(' · ') }),
    ...nowPanel(), ...selPanel(), ...typesPanel(), ...hlPanel(),
    ...footSide(), ...movieSide(), ...markSide(), ...sceneSide(),
    heading('reels', 'This reel, its branches and any imported for the movie. Edit one, or compare it with the one you edit: side by side or as a ghost; the events only one has are marked (B: amber outline, only in A: amber underline).'),
    ...rp.reels.map(r => h('div', { cls: 'bar' + (r === rp.reel ? ' on' : '') },
      button(r === rp.reel ? `:edit: ${r.name}` : r.name, r === rp.reel ? 'The reel being edited' : `Edit this reel${r.from !== undefined ? ` (branched at ${fmtT(rp.T[Math.min(r.from, rp.N)])})` : ''}`, () => { if (r !== rp.reel) { loadReel(r.rep, r.name, r); app.paused = true; panels(); } }, 'mini'),
      r !== rp.reel && toggle(':sync_alt:', 'Compare it with the reel being edited', () => rp.cmp?.reel === r, v => { loadCmp(v ? r : null); rp.cmpView ||= 'side'; panels(); }),
      (r.parent || r !== rp.reel) && crud({ delete: [r.parent ? 'Delete this branch' : 'Remove this reel (any shots using it go too)', () => {
        const idx = rp.reels.indexOf(r); rp.reels.splice(idx, 1);
        rp.movie.shots = rp.movie.shots.filter(sh => sh.reel !== idx).map(sh => sh.reel > idx ? { ...sh, reel: sh.reel - 1 } : sh);
        if (rp.cmp?.reel === r) loadCmp(null); if (rp.reel === r) loadReel(r.parent.rep, r.parent.name, r.parent); panels();
      }] }))),
    heading('stats', 'Per fighter: damage dealt, hits landed, blocks and parries made, times thrown, its longest and most damaging combo, when it was knocked out.'),
    h('table', { cls: 'stats' }, h('tr', {}, h('th'), ...rpStats().map(({ l }) => h('th', { textContent: `${who(l.id)} ${l.name}`, style: `color:${l.col}` }))),
      ...rpStats()[0]?.rows.map((r, i) => h('tr', {}, h('td', { textContent: r[0] }), ...rpStats().map(st => h('td', { textContent: st.rows[i][1] })))) || []),
    rp.cmp && h('table', { cls: 'stats' }, h('tr', {}, h('th', { textContent: 'B' }), ...fightStats(rp.cmp.events, rp.cmp.lanes).map(st => h('th', { textContent: `${who(st.id)} ${st.name}`, style: `color:${st.col}` }))),
      ...[['dealt', 'dealt'], ['hits', 'hits'], ['blocked', 'blocked'], ['best combo', 'bestCombo']].map(([lbl, k]) => h('tr', {}, h('td', { textContent: lbl }), ...fightStats(rp.cmp.events, rp.cmp.lanes).map(st => h('td', { textContent: st[k] }))))),
  ];
}

const replayMode = {
  enter() { if (!rp.reel && lab.mode === 'play' && lab.cells[0]?.w.log.length) { loadReel(makeReplay(lab.cells[0].w, lab.playback?.scenario || lab.scen)); app.paused = true; } },
  restart() { if (rp.playMovie) mvLoad(0); else if (rp.reel) rpSeek(0); },
  worlds: () => [], // the shown fight is played here (tick), not by the frame loop
  debugWorld: () => rp.playMovie ? rp.mv?.w : rp.view,
  tick(dt) {
    if (!rp.reel || rp.drag || clip.busy) return; // an export plays the shown fight itself
    if (rp.playMovie) { mvTick(dt); return; }
    rp.t += dt * rateAt(rp.n);
    while (rp.n < rp.N && rp.T[rp.n + 1] <= rp.t + 1e-9) rpStep();
    rpFollow();
    const [a, b] = footRange();
    if (rp.n >= (rp.footOn ? b : rp.N)) { if (app.loop) rpSeek(rp.footOn ? a : 0); else app.paused = true; }
  },
  rewind(n) { if (!rp.playMovie && rp.reel) rpSeek(rp.n - n); },
  scrub(f) { if (!rp.playMovie && rp.reel) rpSeek(frameAt(f * rp.T[rp.N])); },
  preview: () => rpLayout().pv,
  clipRects: () => rp.reel ? [{ key: 'replay', r: rpLayout().pv }] : [],
  render: rpRender,
  ctxBar: rpCtx,
  side: rpSide,
  open: ['replay', 'now', 'selection', 'types', 'highlights', 'footage', 'movie', 'bookmarks', 'reels', 'stats', 'scene'],
  overlay: () => rp.reel && stageOpen() === 'events' ? [eventTable()] : [],
  mouse: rpMouse,
  wheel: rpWheel,
  key(e, a) {
    const nudge = d => selInputs().length ? reelEdit(() => shiftInputs(d), 'rp-nudge') : (app.paused = true, rpSeek(rp.n + d));
    const k = { prevEvent: () => rpJump(-1), nextEvent: () => rpJump(1), prevMark: () => rpJump(-1, true), nextMark: () => rpJump(1, true), mark: addMark,
      frameBack: () => nudge(-1), frameFwd: () => nudge(1), deleteBone: () => rp.fsel != null ? footEdit(F => { F.spans.splice(rp.fsel, 1); rp.fsel = null; }) : reelEdit(deleteInputs),
      aim: () => footEdit(F => { F.in = rp.n; }), onion: () => footEdit(F => { F.out = rp.n; }) }[a];
    if (e.code === 'Escape' && rp.sel.size) { rp.sel.clear(); return true; }
    if (!k || !rp.reel) return false;
    k(); return true;
  },
  hint: () => 'ruler: go to a moment (snaps, Alt: not) · lanes: click an event (⌘ / ⇧ more), drag from empty space to box-select · drag selected inputs to retime, their span ends to resize · , . nudge · Delete · ⌘Z · wheel zooms, Shift+wheel pans · [ ] events · ⇧[ ⇧] bookmarks · \\ bookmark',
};
