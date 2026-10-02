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
