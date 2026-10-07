// the MCP server's session: one engine (tools/engine.js) plus the settings, characters and simulations changed or made through it
// Everything that touches engine objects runs inside the engine's vm context (inside() below), and only JSON crosses over,
// so no object ever mixes the two realms.
const fs = require('fs'), path = require('path'), engine = require('./engine');
const ROOT = path.join(__dirname, '..');
// scenarios.js, sound.js, tracker.js: their data (my scenarios, sounds, tracks) for profiles and the sound/look/track tools;
// none needs a DOM at load (localStorage, and sound.js/tracker.js's AudioContext, are only reached by calls this session never makes)
const FILES = [...engine.ENGINE, 'scenarios', 'sound', 'tracker'];
const KEEP_SIMS = 20;

// runs in the engine context: defines MCP, the helpers the tools call
function inside() {
  const clone = o => JSON.parse(JSON.stringify(o));
  const fail = msg => { throw new Error(msg); };
  const obj = v => v && typeof v === 'object' && !Array.isArray(v);
  // a setting value that fits its spec (the same rule as the app's settings files): known, the right type, in range or one of the options
  const cfgProblem = (k, v) => {
    const s = SPEC[k];
    if (!s) { const near = Object.keys(SPEC).filter(n => n.toLowerCase().includes(k.toLowerCase().slice(0, 4))).slice(0, 5); return `unknown setting "${k}"${near.length ? ` (did you mean ${near.join(', ')}?)` : ''}`; }
    if (typeof v !== typeof s.v) return `${k} takes a ${typeof s.v}, not ${JSON.stringify(v)}`;
    if (s.opts && !s.opts.includes(v)) return `${k} is one of ${s.opts.join(', ')}, not ${JSON.stringify(v)}`;
    if (typeof v === 'number' && !s.opts && !Number.isFinite(v)) return `${k} takes a finite number, not ${v}`; // any number: outside the usual range is only warned about
    return null;
  };
  const checkCfg = (o = {}) => { const bad = Object.entries(o).map(([k, v]) => cfgProblem(k, v)).filter(Boolean); if (bad.length) fail(bad.join('; ')); return o; };
  const changed = () => Object.fromEntries(Object.keys(DEFAULTS).filter(k => CFG[k] !== DEFAULTS[k]).map(k => [k, CFG[k]]));
  const charOf = n => CHARS[n] || fail(`no character "${n}" (list_characters)`);
  const slotsFor = (ch, name) => ch.stances.flatMap(s => Object.entries(s[bindsKey(CFG.plane)]).filter(([, n]) => n === name).map(([slot]) => s.name === 'main' ? slot : `${s.name}:${slot}`));
  const ctlName = c => typeof c === 'string' ? c : Array.isArray(c) ? 'script' : c ? 'tape' : 'dummy';
  // a scenario given as JSON: string controllers other than human / ai / dummy are macro text ('0.2, 2P, K')
  const scenFrom = s => { const ctl = c => typeof c === 'string' && !['human', 'ai', 'dummy'].includes(c) ? parseMacro(c) : c;
    return { ...s, a: ctl(s.a), b: ctl(s.b), ...(s.more ? { more: s.more.map(m => ({ ...m, c: ctl(m.c) })) } : {}) }; };
  // JSON merge patch (RFC 7386): objects merge, null deletes, anything else replaces; bones may also be patched by id ({ id: {...} | null })
  const merge = (t, p) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return p;
    const o = t && typeof t === 'object' && !Array.isArray(t) ? { ...t } : {};
    for (const [k, v] of Object.entries(p)) if (v === null) delete o[k]; else o[k] = merge(o[k], v);
    return o;
  };
  // the shape makeCharacter needs, with messages that say what is wrong (it would only throw a TypeError)
  const checkDef = def => {
    const bad = [], ids = new Set(), obj = v => v && typeof v === 'object' && !Array.isArray(v);
    if (!obj(def)) fail('a character definition is an object');
    if (!Array.isArray(def.bones) || !def.bones.length) bad.push('bones: a list of bones is required');
    else for (const [i, b] of def.bones.entries()) {
      if (!obj(b) || typeof b.id !== 'string' || !b.id) { bad.push(`bones[${i}] needs a string id`); continue; }
      if (ids.has(b.id)) bad.push(`bone id "${b.id}" is used twice`);
      ids.add(b.id);
      for (const k of ['len', 'a', 'thick', 'hurt', 'min', 'max']) if (b[k] !== undefined && !Number.isFinite(b[k])) bad.push(`bone ${b.id}: ${k} is a number`);
    }
    if (Array.isArray(def.bones)) for (const b of def.bones) if (b?.parent !== undefined && b.parent !== null && !ids.has(b.parent)) bad.push(`bone ${b.id}: no parent bone "${b.parent}"`);
    if (Array.isArray(def.bones) && !bad.length) { // no loops: every chain of parents reaches a root
      const by = Object.fromEntries(def.bones.map(b => [b.id, b]));
      for (const b of def.bones) { let x = b, n = 0; while (x.parent && n++ <= def.bones.length) x = by[x.parent]; if (n > def.bones.length) { bad.push(`bone ${b.id}: its parents loop`); break; } }
    }
    if (!obj(def.poses) || !obj(def.poses.stance)) bad.push('poses.stance: a pose ({ boneId: angle }) is required');
    if (!obj(def.moves)) bad.push('moves: an object of moves is required (it may be empty)');
    else for (const [n, m] of Object.entries(def.moves)) {
      if (!obj(m) || !Array.isArray(m.keys) || !m.keys.length) { bad.push(`move ${n}: keys, a list of keyframes, is required`); continue; }
      m.keys.forEach((k, i) => { if (!obj(k) || !(k.d > 0)) bad.push(`move ${n} key ${i}: d (seconds, > 0) is required`); else if (k.p !== undefined && k.p !== null && !obj(k.p)) bad.push(`move ${n} key ${i}: p is a pose or null`); });
      for (const h of [].concat(m.hit || [])) if (ids.size && !ids.has(h) && h !== 'weapon') bad.push(`move ${n}: hits with "${h}", which is not a bone`);
    }
    if (def.hurt !== undefined && !obj(def.hurt)) bad.push('hurt: an object of hit-reaction pose lists');
    if (bad.length) fail(bad.slice(0, 12).join('; ') + (bad.length > 12 ? ` (+${bad.length - 12} more)` : ''));
    makeCharacter(def);
  };
  const patchDef = (def, p) => {
    const { bones, ...rest } = p, out = merge(def, rest);
    if (Array.isArray(bones)) out.bones = bones;
    else if (bones) {
      out.bones = def.bones.filter(b => bones[b.id] !== null).map(b => bones[b.id] ? merge(b, bones[b.id]) : b);
      for (const [id, b] of Object.entries(bones)) if (b && !def.bones.some(x => x.id === id)) out.bones.push({ id, ...b });
    }
    return out;
  };

  // sounds, looks, tracks: small flat presets, checked field by field (like checkDef, but simple enough for one pass each)
  const checkSound = p => {
    const bad = [], finite = (k, req) => { if (p[k] !== undefined) { if (!Number.isFinite(p[k])) bad.push(`${k}: a number`); } else if (req) bad.push(`${k}: a number is required`); };
    if (!obj(p)) fail('a sound preset is an object');
    if (p.noise !== undefined && !['bandpass', 'lowpass', 'highpass', 'none'].includes(p.noise)) bad.push('noise: bandpass | lowpass | highpass | none');
    if (p.tone !== undefined && !['sine', 'square', 'sawtooth', 'triangle', 'none'].includes(p.tone)) bad.push('tone: sine | square | sawtooth | triangle | none');
    for (const k of ['nf0', 'nf1', 'ngain', 'q', 'tf0', 'tf1', 'tgain', 'detune', 'attack']) finite(k, false);
    finite('dur', true);
    if (bad.length) fail(bad.join('; '));
  };
  const checkLook = p => {
    const bad = [];
    if (!obj(p)) fail('a look preset is an object');
    if (p.shape !== undefined && !['dot', 'line', 'ring'].includes(p.shape)) bad.push('shape: dot | line | ring');
    if (p.col !== undefined && !FX_COLS[p.col]) bad.push(`col: one of ${Object.keys(FX_COLS).join(', ')}`);
    for (const k of ['count', 'life', 'speed', 'spread', 'angle', 'gravity', 'size0', 'size1']) if (p[k] !== undefined && !Number.isFinite(p[k])) bad.push(`${k}: a number`);
    if (bad.length) fail(bad.join('; '));
  };
  const checkTrack = t => {
    const bad = [];
    if (!obj(t)) fail('a track is an object');
    if (!(t.bpm > 0)) bad.push('bpm: a number > 0 is required');
    if (![8, 16, 32].includes(t.steps)) bad.push('steps: 8, 16 or 32');
    if (!Array.isArray(t.rows) || !t.rows.length) bad.push('rows: a non-empty list of { sound, cells } is required');
    else for (const [i, r] of t.rows.entries()) {
      if (!obj(r) || typeof r.sound !== 'string' || !SOUNDS[r.sound]) bad.push(`rows[${i}].sound: a sound name (list_sounds)`);
      if (!Array.isArray(r.cells) || r.cells.length !== t.steps || r.cells.some(c => typeof c !== 'boolean')) bad.push(`rows[${i}].cells: ${t.steps} booleans (one per step)`);
    }
    if (bad.length) fail(bad.join('; '));
  };
  // a user scenario (already run through scenFrom), checked by actually building a fight from it (like checkDef compiles a character)
  const checkScen = s => { try { new World(s, {}, 1, s.chars?.map(charOf)); } catch (e) { fail(`broken scenario: ${e.message}`); } };

  // a whole fight recorded, summed up: who won, when, the stats, the events (filtered), the end hash
  function summary(w, rec, o = {}) {
    const { events, lanes, N, T } = rec, ko = events.find(e => e.kind === 'say' && e.name === 'K.O.');
    const ctl = c => c === 'human' ? 'human' : !c ? 'dummy' : c instanceof Brain ? 'ai' : c instanceof Script ? 'script' : 'tape';
    const fighters = w.fighters.map((f, i) => ({ id: f.id, char: f.ch.name, team: f.team, ctl: ctl(w.ctl[i]), hp: Math.round(f.hp), max: f.c('health'), ko: !!f.ko, x: Math.round(f.x) }));
    const up = new Set(w.fighters.filter(f => !f.ko).map(f => f.team)), anyKo = w.fighters.some(f => f.ko);
    const outcome = anyKo && up.size === 1 ? 'ko' : anyKo && !up.size ? 'double ko' : w.scen.period && w.simT >= w.scen.period - 1e-9 ? 'period' : 'time';
    const winner = outcome === 'ko' ? { team: [...up][0], chars: w.fighters.filter(f => !f.ko).map(f => f.ch.name) } : null;
    const count = {}; for (const e of events) count[e.type] = (count[e.type] || 0) + 1;
    const ev = o.events === false ? undefined : (() => {
      const q = o.events || {}, types = q.types && new Set(q.types), lim = q.limit ?? 40;
      const sel = events.filter(e => (!types || types.has(e.type) || types.has(e.kind)) && (q.who === undefined || e.who === q.who) && e.f >= (q.from ?? 0) && e.f <= (q.to ?? Infinity));
      return { total: sel.length, shown: sel.slice(0, lim).map(e => ({ f: e.f, t: +T[e.f].toFixed(3), type: e.type, kind: e.kind, who: e.who, name: e.name,
        ...(e.end !== undefined ? { end: e.end } : {}), ...(e.data?.dmg !== undefined ? { dmg: Math.round(e.data.dmg * 10) / 10, vic: e.data.vic } : {}) })) };
    })();
    return { outcome, winner, koFrame: ko ? ko.f : null, koTime: ko ? +T[ko.f].toFixed(3) : null, N, seconds: +T[N].toFixed(3), fighters,
      stats: fightStats(events, lanes), eventCounts: count, events: ev, endHash: w.stateHash() };
  }

  globalThis.MCP = {
    // ---------- settings ----------
    listSettings(group) {
      const out = []; let g = null;
      for (const s of SCHEMA) {
        if (Array.isArray(s)) { g = { group: s[0], about: s[1], keys: s[2] || '', settings: [] }; out.push(g); continue; }
        g.settings.push({ key: s.k, default: s.v, current: CFG[s.k], ...(s.opts ? { options: s.opts } : typeof s.v === 'number' ? { min: s.min, max: s.max, step: s.step } : {}), tip: s.tip,
          ...(s.optTips ? { optionTips: s.optTips } : {}), ...(DISPLAY.includes(s.k) ? { display: true } : {}) });
      }
      if (!group) return out.map(g => ({ group: g.group, about: g.about, settings: g.settings.map(s => s.key) }));
      const q = group.toLowerCase(), hit = out.filter(g => g.group.toLowerCase() === q).length ? out.filter(g => g.group.toLowerCase() === q) : out.filter(g => g.group.toLowerCase().includes(q));
      return hit.length ? hit : fail(`no group "${group}": ${out.map(g => g.group).join(', ')}`);
    },
    getSettings: () => ({ changed: changed(), all: { ...CFG } }),
    setSettings(vals) { checkCfg(vals); Object.assign(CFG, vals); const warnings = Object.entries(vals).filter(([k, v]) => typeof v === 'number' && riskOf(v, SPEC[k].min, SPEC[k].max)).map(([k, v]) => `${k} = ${v}: ${RISK_TIPS[riskOf(v, SPEC[k].min, SPEC[k].max)]} (usually ${SPEC[k].min} … ${SPEC[k].max})`);
      return { set: vals, changed: changed(), ...warnings.length ? { warnings } : {} }; },
    resetSettings() { Object.assign(CFG, DEFAULTS); return { changed: changed() }; },
    changed,

    // ---------- characters ----------
    defs: {}, // made or edited through the session (a profile saves these)
    // undo/redo for createCharacter/editCharacter/editMove: one shared stack (like the app's own), snapshotting the
    // whole character each time (existed: false means it's a brand new name, so undo removes it instead of restoring a def)
    history: [], redoStack: [],
    snap(name) { MCP.history.push({ name, existed: name in CHARS, def: MCP.defs[name] ? clone(MCP.defs[name]) : null }); MCP.redoStack.length = 0; if (MCP.history.length > 50) MCP.history.shift(); },
    applySnap(e) {
      if (!e.existed) { delete MCP.defs[e.name]; delete CHARS[e.name]; return { deleted: e.name }; }
      if (e.def === null) delete MCP.defs[e.name]; else MCP.defs[e.name] = e.def;
      CHARS[e.name] = makeCharacter(MCP.defs[e.name] || CHAR_DEFS[e.name]);
      return { name: e.name, bones: CHARS[e.name].bones.length, moves: Object.keys(CHARS[e.name].moves).length };
    },
    undoCharacter() {
      const e = MCP.history.pop() || fail('nothing to undo (createCharacter, editCharacter and editMove push an undo step)');
      MCP.redoStack.push({ name: e.name, existed: e.name in CHARS, def: MCP.defs[e.name] ? clone(MCP.defs[e.name]) : null });
      return MCP.applySnap(e);
    },
    redoCharacter() {
      const e = MCP.redoStack.pop() || fail('nothing to redo');
      MCP.history.push({ name: e.name, existed: e.name in CHARS, def: MCP.defs[e.name] ? clone(MCP.defs[e.name]) : null });
      return MCP.applySnap(e);
    },
    listCharacters: () => Object.keys(CHARS).map(n => { const ch = CHARS[n];
      return { name: n, builtin: !!CHAR_DEFS[n], edited: !!MCP.defs[n], current: n === CURRENT, bones: ch.bones.length, moves: Object.keys(ch.moves).length,
        stances: ch.stances.map(s => s.name), weapon: ch.weapon || null, stats: Object.fromEntries(Object.entries(ch.stats).filter(([, v]) => v !== 1)) }; }),
    getCharacter: n => charOf(n).def,
    listMoves(n, speed) {
      const ch = charOf(n), sp = speed ?? CFG.attackSpeed * ch.stats.tempo;
      return Object.entries(ch.moves).map(([name, m]) => { const fd = frameData(m, sp);
        return { name, ...fd, total: fd.startup + fd.active + fd.recovery, damage: moveDamage(m), power: m.power ?? null, height: m.power ? m.height || 'mid' : null,
          knock: m.knock ?? null, launch: m.launch ?? null, stun: m.stun ?? null, hit: m.hit ?? null, binds: slotsFor(ch, name),
          flags: ['throw', 'air', 'kd', 'special', 'otg', 'inv', 'crumple', 'launcher', 'roll', 'wide', 'wall', 'wallbounce', 'bounce', 'noAirGuard'].filter(k => m[k]),
          ...(m.weapon ? { weapon: m.weapon } : {}), ...(m.next ? { next: m.next } : {}), keys: m.keys.length }; });
    },
    // a new character from a definition: makeCharacter throws on a broken one before anything changes; a taken name gets a number (like the app)
    createCharacter(def, replace) {
      checkDef(def);
      const base = def.name || 'char'; let name = base, n = 2;
      if (!replace) while (CHARS[name]) name = base + n++;
      MCP.snap(name);
      MCP.defs[name] = { ...clone(def), name }; CHARS[name] = makeCharacter(MCP.defs[name]);
      return { name, bones: CHARS[name].bones.length, moves: Object.keys(CHARS[name].moves).length };
    },
    editCharacter(n, patch) {
      const def = patchDef(clone(charOf(n).def), patch);
      if (def.name !== n) def.name = n;
      checkDef(def);
      MCP.snap(n);
      MCP.defs[n] = def; CHARS[n] = makeCharacter(def);
      return { name: n, bones: CHARS[n].bones.length, moves: Object.keys(CHARS[n].moves).length };
    },
    editMove(n, name, move, mergeIt) {
      const def = clone(charOf(n).def);
      if (move === null) { if (!def.moves[name]) fail(`${n} has no move "${name}"`); delete def.moves[name]; }
      else def.moves[name] = mergeIt ? merge(def.moves[name] || fail(`${n} has no move "${name}" to merge into`), move) : move;
      checkDef(def);
      MCP.snap(n);
      MCP.defs[n] = def; CHARS[n] = makeCharacter(def);
      return move === null ? { deleted: name } : MCP.listMoves(n).find(m => m.name === name);
    },
    deleteCharacter(n) {
      if (!MCP.defs[n]) fail(`no character "${n}" made or edited this session to delete (list_characters; built-ins can't be deleted)`);
      delete MCP.defs[n]; delete CHARS[n];
      if (CURRENT === n) CURRENT = 'stick';
      return { deleted: n };
    },
    renameCharacter(from, to) {
      if (!MCP.defs[from]) fail(`"${from}" is not a character made or edited this session (list_characters; built-ins can't be renamed)`);
      if (CHARS[to]) fail(`"${to}" is already a character`);
      MCP.defs[to] = { ...MCP.defs[from], name: to }; CHARS[to] = makeCharacter(MCP.defs[to]);
      delete MCP.defs[from]; delete CHARS[from];
      if (CURRENT === from) CURRENT = to;
      return { name: to };
    },

    // ---------- scenarios and fights ----------
    listScenarios: () => Object.entries(SCENARIOS).map(([name, s]) => ({ name, a: ctlName(s.a), b: ctlName(s.b), fighters: 2 + (s.more?.length || 0),
      ...(s.period ? { period: s.period } : {}), ...(s.chars ? { chars: s.chars } : {}), ...(s.cfg && Object.keys(s.cfg).length ? { cfg: s.cfg } : {}),
      ...(s.waves ? { waves: true } : {}), ...(s.survival ? { survival: true } : {}), ...(s.user ? { user: true } : {}),
      ...(Array.isArray(s.a) ? { script: scriptText(s.a) } : {}) })),
    // a new "my scenario": checked by building a fight from it (a broken one changes nothing); a taken name gets a number unless replace is true
    createScenario(scen, name, replace) {
      const built = scenFrom(scen);
      checkScen(built);
      const base = name || 'scenario'; let n = base, i = 2;
      if (!replace) while (SCENARIOS[n]) n = base + i++;
      myStore[n] = fromScen(built, built.chars); saveScens();
      return MCP.listScenarios().find(s => s.name === n);
    },
    // merge-patches an existing user scenario's own definition (stick2://schema/scenario); checked the same way
    editScenario(name, patch) {
      if (!myStore[name]) fail(`no user scenario "${name}" to edit (list_scenarios; only ones you made or loaded can be)`);
      const built = scenFrom(merge(clone(SCENARIOS[name]), patch));
      checkScen(built);
      myStore[name] = fromScen(built, built.chars); saveScens();
      return MCP.listScenarios().find(s => s.name === name);
    },
    deleteScenario(name) {
      if (!myStore[name]) fail(`no user scenario "${name}" to delete (list_scenarios; built-ins can't be deleted)`);
      delete myStore[name]; saveScens();
      return { deleted: name };
    },
    renameScenario(from, to) {
      if (!myStore[from]) fail(`no user scenario "${from}" to rename (list_scenarios; built-ins can't be renamed)`);
      if (SCENARIOS[to]) fail(`"${to}" is already a scenario`);
      myStore[to] = myStore[from]; delete myStore[from]; saveScens();
      return MCP.listScenarios().find(s => s.name === to);
    },
    // o: { scenario | scen, chars, seed, frames, cfg, inputs (macro text for P1, who becomes human), events } → { replay, summary }
    simulate(o) {
      const base = o.scen ? scenFrom(o.scen) : SCENARIOS[o.scenario] || fail(`no scenario "${o.scenario}" (list_scenarios)`);
      const scen = { ...base }, chars = o.chars ? o.chars.map(charOf) : null;
      if (chars) scen.chars = null; // the given characters win over a scenario's own (null, not deleted: a replay merges the named scenario back in)
      if (o.inputs) scen.a = 'human';
      const w = new World(scen, checkCfg(o.cfg), o.seed ?? 1, chars);
      w.loop = false;
      if (o.inputs) { parseMacro(o.inputs); w.macro = new Script(parseMacro(o.inputs)); w.macroSeq = o.inputs; } // logged with the first frame, so the replay presses it too
      const rec = recordFight(w, o.frames);
      return { replay: makeReplay(w, o.scen ? o.name || 'custom' : o.scenario), summary: summary(w, rec, o) };
    },
    // numeric per-fighter state at a frame of a kept fight - no rendering, for programmatic inspection (e.g. why a hit did or didn't land)
    // without eyeballing a picture: position, facing, hp, the move running and its frame within it, and frameState's category
    frameSnapshot(r, frame) {
      const w = replayWorld(r);
      w.loop = false;
      while (w.log.length <= frame && !w.done) w.advance(1 / 60, NOIN);
      const of = f => ({ state: frameState(f), x: Math.round(f.x), y: Math.round(f.y), hp: +f.hp.toFixed(1), facing: f.dir > 0 ? 'right' : 'left',
        combo: f.combo, move: f.action ? { name: f.action.name, i: f.action.i } : null });
      return { frame: w.log.length - 1, a: of(w.a), b: of(w.b) };
    },
    // a replay file played through: the same summary, plus the first frame that came out differently (null = in sync)
    importReplay(r, o = {}) {
      if (r?.format !== REPLAY_FORMAT) fail('not a stick2 replay (format "stick2-replay")');
      const w = replayWorld(r); w.loop = false;
      const rec = recordFight(w);
      if (!w.done) w.advance(0, NOIN); // past the last frame: the end checksum
      return { summary: summary(w, rec, o), desync: w.desync, version: r.version, engine: ENGINE_VERSION,
        ...(r.version !== ENGINE_VERSION ? { warning: `recorded with engine v${r.version}, this is v${ENGINE_VERSION}: it most likely plays out differently` } : {}) };
    },
    // the move matrix (the tests view): a move of ch against opp in every target state; failing = the cells with issues
    runChecks(n, move, oppName, all) {
      const ch = charOf(n), opp = oppName ? charOf(oppName) : ch, names = move ? [move] : Object.keys(ch.moves).filter(k => ch.moves[k].power);
      if (move && !ch.moves[move]) fail(`${n} has no move "${move}"`);
      const moves = names.map(name => {
        const cells = CHECK_COLS.map(col => ({ target: `${col.s} ${col.facing} ${col.dist}`, ...runCheck(ch, opp, name, col) }))
          .map(c => ({ target: c.target, out: c.out, ...(c.issues.length ? { issues: c.issues } : {}), ...(c.why ? { why: c.why } : {}) }));
        const failing = cells.filter(c => c.issues);
        return { move: name, failing: failing.length, outs: cells.map(c => c.out[0]).join(''), cells: all ? cells : failing };
      });
      return { char: n, opp: opp.name, columns: CHECK_COLS.map(c => `${c.s} ${c.facing} ${c.dist}`), failing: moves.reduce((s, m) => s + m.failing, 0), moves };
    },

    // ---------- profiles: the app's "everything" file (edited characters, settings, my scenarios) ----------
    loadProfile(d) {
      const out = { chars: [], settings: {}, rejected: [], scenarios: [] };
      if (d.format === 'stick2.settings' || d.format === 'stick2.everything') {
        for (const [n, def] of Object.entries(d.chars || {})) try { checkDef(def); } catch (e) { fail(`character ${n} is broken, nothing was loaded: ${e.message}`); } // all or nothing
        for (const [n, def] of Object.entries(d.chars || {})) { MCP.defs[n] = { ...clone(def), name: n }; CHARS[n] = makeCharacter(MCP.defs[n]); out.chars.push(n); }
        if (d.scenarios) { Object.assign(myStore, clone(d.scenarios)); saveScens(); out.scenarios = Object.keys(d.scenarios); }
        for (const k of Object.keys(DEFAULTS)) if (!DISPLAY.includes(k)) CFG[k] = DEFAULTS[k];
        for (const [k, v] of Object.entries(d.cfg || {})) { const bad = cfgProblem(k, v); if (bad) out.rejected.push(bad); else CFG[k] = out.settings[k] = v; }
        if (d.current && CHARS[d.current]) CURRENT = d.current;
        return out;
      }
      if (Array.isArray(d.bones)) return { chars: [MCP.createCharacter(d).name] };
      fail('not a stick2 file: an everything or settings export (format stick2.everything / stick2.settings) or a character');
    },
    saveProfile: () => ({ format: 'stick2.everything', chars: MCP.defs, current: CURRENT,
      cfg: Object.fromEntries(Object.entries(changed()).filter(([k]) => !DISPLAY.includes(k))), scenarios: myStore }),
    // sounds, looks and tracks live in their own storage (stick2.sounds / .looks / .tracks), in the app too: an "everything"
    // profile (above) never carried them even before MCP, so there is nothing to add there for these three

    // ---------- sounds: synthesized (noise + tone layers); built-ins are overridable, never deleted for good ----------
    listSounds: () => Object.fromEntries(Object.entries(SOUNDS).map(([name, p]) => [name, { ...p, builtin: name in BASE_SOUNDS }])),
    // a built-in name patches (and can be reverted with reset_sound); a new name creates one, starting from whoosh unless a full preset is given
    saveSound(name, patch) {
      const preset = merge(clone(SOUNDS[name] || BASE_SOUNDS.whoosh), patch);
      checkSound(preset);
      saveSound(name, preset);
      return { name, preset, builtin: name in BASE_SOUNDS };
    },
    resetSound(name) {
      if (!(name in SOUNDS)) fail(`no sound "${name}" (list_sounds)`);
      const builtin = name in BASE_SOUNDS;
      resetSound(name);
      return builtin ? { reverted: name } : { deleted: name };
    },
    renameSound(from, to) {
      if (!(from in SOUNDS) || from in BASE_SOUNDS) fail(`"${from}" is not a custom sound (list_sounds; built-ins can't be renamed)`);
      if (to in SOUNDS) fail(`"${to}" is already a sound`);
      renameSound(from, to);
      return { name: to };
    },

    // ---------- fx looks: built-ins are hand-coded and read-only; a custom one is a generic particle preset ----------
    listLooks: () => Object.fromEntries(Object.keys(FX_LOOKS).map(name => [name, name in myLooks ? { ...myLooks[name], builtin: false } : { builtin: true }])),
    saveLook(name, patch) {
      if (name in FX_LOOKS && !(name in myLooks)) fail(`"${name}" is a built-in, hand-coded look (not data-driven): pick another name for a custom one`);
      const preset = merge(clone(myLooks[name] || { count: 6, life: 0.5, speed: 60, spread: 40, angle: -90, gravity: 200, size0: 3, size1: 0, shape: 'dot', col: 'white' }), patch);
      checkLook(preset);
      saveLook(name, preset);
      return { name, preset };
    },
    deleteLook(name) {
      if (!(name in myLooks)) fail(`no custom look "${name}" to delete (list_looks; built-ins can't be)`);
      deleteLook(name);
      return { deleted: name };
    },
    renameLook(from, to) {
      if (!(from in myLooks)) fail(`"${from}" is not a custom look (list_looks; built-ins can't be renamed)`);
      if (to in FX_LOOKS) fail(`"${to}" is already a look`);
      renameLook(from, to);
      return { name: to };
    },

    // ---------- tracker: a step sequencer built from the sounds above; playback itself makes no sense over MCP (no speaker) ----------
    listTracks: () => myTracks,
    saveTrack(name, patch) {
      const t = merge(clone(myTracks[name] || { bpm: 120, steps: 16, rows: [] }), patch);
      checkTrack(t);
      saveTrack(name, t);
      return { name, ...t };
    },
    deleteTrack(name) {
      if (!myTracks[name]) fail(`no track "${name}" to delete (list_tracks)`);
      deleteTrack(name);
      return { deleted: name };
    },
    renameTrack(from, to) {
      if (!myTracks[from]) fail(`no track "${from}" (list_tracks)`);
      if (myTracks[to]) fail(`"${to}" is already a track`);
      renameTrack(from, to);
      return { name: to };
    },

    // ---------- drawing without a browser: frames of a replay as SVG text (svg = tools/svg.js) ----------
    renderSvg(r, frames, w, h, opts, svg) {
      const out = [];
      drawFrames(r, frames, w, h, opts, () => { const s = svg(w, h); out.push(s); return s.ctx; });
      return out.map(s => s.toString());
    },
  };
}

function session() {
  const { ctx, run } = engine(FILES);
  run(fs.readFileSync(path.join(__dirname, 'frames.js'), 'utf8'));
  run(`(${inside})()`);
  // calls MCP[name](...args) in the engine: arguments and result cross as JSON
  const call = (name, ...args) => {
    ctx.__in = JSON.stringify(args);
    const out = run(`JSON.stringify(MCP.${name}(...JSON.parse(__in)))`);
    return out === undefined ? undefined : JSON.parse(out);
  };
  const sims = new Map(); let nid = 0;
  const keep = (replay, summary, from) => {
    const id = 's' + ++nid;
    sims.set(id, { id, replay, from, made: new Date().toISOString() });
    for (const k of sims.keys()) if (sims.size > KEEP_SIMS) sims.delete(k);
    return id;
  };
  const sim = id => sims.get(id) || (() => { throw new Error(`no simulation "${id}" (the last ${KEEP_SIMS} are kept: ${[...sims.keys()].join(', ') || 'none yet'})`); })();
  const file = p => path.resolve(ROOT, p);
  const svg = require('./svg');
  return {
    ctx, run, call, sims, sim, file, ROOT,
    version: run('ENGINE_VERSION'),
    simulate(o) {
      const { replay, summary } = call('simulate', o), id = keep(replay, summary, o.scenario || 'custom');
      return { id, ...summary, ...(o.replay ? { replay } : {}) };
    },
    importReplay(o) {
      const r = o.json !== undefined ? (typeof o.json === 'string' ? JSON.parse(o.json) : o.json) : JSON.parse(fs.readFileSync(file(o.path), 'utf8'));
      const res = call('importReplay', r, o), id = keep(r, res.summary, 'import');
      return { id, desync: res.desync, inSync: res.desync === null, version: res.version, engine: res.engine, ...(res.warning ? { warning: res.warning } : {}), ...res.summary };
    },
    // the frames as SVG text: the engine draws into a recording context (tools/svg.js)
    svgFrames(replay, frames, w, h, opts) {
      ctx.__svg = svg;
      ctx.__in = JSON.stringify([replay, frames, w, h, opts]);
      return JSON.parse(run('JSON.stringify(MCP.renderSvg(...JSON.parse(__in), __svg))'));
    },
    // the move matrix move by move until a time budget runs out: what is left is listed, to check in another call
    runChecks(o) {
      const t0 = Date.now(), budget = (o.seconds ?? 25) * 1000, names = o.move ? [o.move] : o.moves || call('listMoves', o.char).filter(m => m.power).map(m => m.name);
      let res = null; const left = [...names];
      while (left.length && (!res || Date.now() - t0 < budget)) {
        const r = call('runChecks', o.char, left.shift(), o.opp, o.all);
        if (res) { res.moves.push(...r.moves); res.failing += r.failing; } else res = r;
      }
      return { ...res, checked: res.moves.length, ...(left.length ? { unchecked: left, note: `out of time: call again with moves: [the unchecked ones]` } : {}) };
    },
    loadProfile(p) { return call('loadProfile', JSON.parse(fs.readFileSync(file(p), 'utf8'))); },
    saveProfile(p) { const d = call('saveProfile'); fs.mkdirSync(path.dirname(file(p)), { recursive: true }); fs.writeFileSync(file(p), JSON.stringify(d, null, 1)); return { path: file(p), chars: Object.keys(d.chars), settings: Object.keys(d.cfg).length, scenarios: Object.keys(d.scenarios).length }; },
  };
}
module.exports = session;
