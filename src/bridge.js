'use strict';
// ---------- bridge: lets the MCP server drive this page (node tools/mcp.js --serve PORT, see docs/mcp.md) ----------
// Off unless the page comes from that server: on file://, itch.io or any other host it does nothing at all. Commands come in over
// server-sent events, each answer goes back as a POST; only the fixed commands below exist (nothing is evaluated).
(() => {
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  const cmds = {
    state: () => ({ mode: app.mode, scenario: lab.scen, character: CURRENT, def: DEFS[CURRENT], settings: Object.fromEntries(changedCfg().map(k => [k, CFG[k]])),
      scenarios: myScens(), replay: rp.reel ? { name: rp.reel.name, frames: rp.N, at: rp.n } : null }),
    set_settings({ values = {} }) {
      const bad = Object.entries(values).filter(([k, v]) => !cfgOk(k, v)).map(([k]) => k);
      if (bad.length) throw new Error(`not a setting, the wrong type or out of range: ${bad.join(', ')}`);
      setCfg(values); syncAll();
      return { changed: Object.fromEntries(changedCfg().map(k => [k, CFG[k]])) };
    },
    set_scenario({ name }) {
      if (!SCENARIOS[name]) throw new Error(`no scenario "${name}"`);
      playScen(name);
      return { mode: app.mode, scenario: lab.scen };
    },
    import_character({ def }) {
      makeCharacter(def); // throws on a broken one before anything changes
      addChar(def);
      return { name: CURRENT };
    },
    open_replay({ replay, name }) {
      if (replay?.format !== REPLAY_FORMAT) throw new Error('not a stick2 replay');
      loadReel(replay, name); setMode('replay');
      return { frames: rp.N, desync: rp.reel.desync, ...(replay.version !== ENGINE_VERSION ? { warning: `recorded with engine v${replay.version}, this is v${ENGINE_VERSION}` } : {}) };
    },
    screenshot: () => ({ png: canvas.toDataURL('image/png') }),
    set_mode({ mode }) {
      if (![...Object.keys(MODES), ...Object.values(VIEWS).flat()].includes(mode)) throw new Error(`no mode "${mode}"`);
      setMode(mode); panels();
      return { mode: app.mode };
    },
    pick_character({ name }) {
      if (!DEFS[name]) throw new Error(`no character "${name}" (state lists def.name, or import_character first)`);
      pickChar(name);
      return { character: CURRENT, def: DEFS[CURRENT] };
    },
    // bridge-driven, so no confirmation dialog (unlike the UI's delete/rename, which ask first): the caller already decided
    delete_character({ name }) {
      if (CHAR_DEFS[name]) throw new Error(`"${name}" is a built-in, can't be deleted`);
      if (!DEFS[name]) throw new Error(`no character "${name}"`);
      const used = scensUsing(name);
      delete DEFS[name]; delete CHARS[name];
      if (CURRENT === name) pickChar('stick'); else save();
      return { deleted: name, ...(used.length ? { stillNamedBy: used } : {}) };
    },
    rename_character({ from, to }) {
      if (CHAR_DEFS[from]) throw new Error(`"${from}" is a built-in, can't be renamed`);
      if (!DEFS[from]) throw new Error(`no character "${from}"`);
      if (DEFS[to]) throw new Error(`"${to}" already exists`);
      DEFS[to] = { ...DEFS[from], name: to }; CHARS[to] = makeCharacter(DEFS[to]);
      delete DEFS[from]; delete CHARS[from];
      if (CURRENT === from) pickChar(to); else save();
      return { name: to };
    },
    // the character editor's live preview: what it plays, the opponent, and whether your keyboard drives the opponent
    set_preview({ scenario, opponent, control } = {}) {
      if (app.mode !== 'character') throw new Error('the character tab must be open first (set_mode character)');
      if (scenario !== undefined) { if (!SCENARIOS[scenario]) throw new Error(`no scenario "${scenario}"`); creator.preview = scenario; }
      if (opponent !== undefined) { if (opponent !== 'self' && !CHARS[opponent]) throw new Error(`no character "${opponent}"`); creator.opponent = opponent; }
      if (control !== undefined) creator.controlDummy = !!control;
      creatorMode.restart(); panels();
      return { scenario: creator.preview, opponent: creator.opponent, control: creator.controlDummy };
    },
    // jump to Play with a scenario and opponent, continuing what a preview just showed (default: the character tab's own preview)
    send_to_play({ scenario, opponent } = {}) {
      const scen = scenario ?? (app.mode === 'character' ? creator.preview : lab.scen);
      if (!SCENARIOS[scen]) throw new Error(`no scenario "${scen}"`);
      sendToPlay(scen, opponent ?? (app.mode === 'character' ? creator.opponent : null));
      return { mode: app.mode, scenario: lab.scen };
    },
    // the same undo/redo as ⌘Z: character edits and settings changes (not scenarios, replays or anything else)
    undo() { if (!studio.undo.length) throw new Error('nothing to undo'); undo(); return { undone: true, left: studio.undo.length }; },
    redo() { if (!studio.redo.length) throw new Error('nothing to redo'); redo(); return { redone: true, left: studio.redo.length }; },
  };
  fetch('/bridge/hello').then(r => r.ok ? r.json() : null).then(hi => {
    if (hi?.stick2 !== 'bridge') return;
    const reply = m => fetch('/bridge/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) });
    new EventSource('/bridge/events').onmessage = e => {
      const { id, name, args } = JSON.parse(e.data);
      try {
        if (!Object.hasOwn(cmds, name)) throw new Error(`no command "${name}"`);
        reply({ id, ok: true, result: cmds[name](args || {}) });
      } catch (err) { reply({ id, ok: false, error: err.message }); }
    };
    console.info('stick2: the MCP bridge is on');
  }, () => {});
})();
