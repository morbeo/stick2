// the MCP server's session: one engine (tools/engine.js) plus the settings, characters and simulations changed or made through it
// Everything that touches engine objects runs inside the engine's vm context (inside() below), and only JSON crosses over,
// so no object ever mixes the two realms.
const fs = require('fs'), path = require('path'), engine = require('./engine');
const ROOT = path.join(__dirname, '..');
// scenarios.js: the user scenarios (toScen, saveScens) for profiles; it needs no DOM at load (localStorage is tried and skipped)
const FILES = [...engine.ENGINE, 'scenarios'];
const KEEP_SIMS = 20;

// runs in the engine context: defines MCP, the helpers the tools call
function inside() {
  const clone = o => JSON.parse(JSON.stringify(o));
  const fail = msg => { throw new Error(msg); };
  // a setting value that fits its spec (the same rule as the app's settings files): known, the right type, in range or one of the options
  const cfgProblem = (k, v) => {
    const s = SPEC[k];
    if (!s) { const near = Object.keys(SPEC).filter(n => n.toLowerCase().includes(k.toLowerCase().slice(0, 4))).slice(0, 5); return `unknown setting "${k}"${near.length ? ` (did you mean ${near.join(', ')}?)` : ''}`; }
    if (typeof v !== typeof s.v) return `${k} takes a ${typeof s.v}, not ${JSON.stringify(v)}`;
    if (s.opts && !s.opts.includes(v)) return `${k} is one of ${s.opts.join(', ')}, not ${JSON.stringify(v)}`;
    if (typeof v === 'number' && !s.opts && (v < s.min || v > s.max || !Number.isFinite(v))) return `${k} goes from ${s.min} to ${s.max}, not ${v}`;
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
    setSettings(vals) { checkCfg(vals); Object.assign(CFG, vals); return { set: vals, changed: changed() }; },
    resetSettings() { Object.assign(CFG, DEFAULTS); return { changed: changed() }; },
    changed,

    // ---------- characters ----------
    defs: {}, // made or edited through the session (a profile saves these)
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
    // ---------- scenarios and fights ----------
    listScenarios: () => Object.entries(SCENARIOS).map(([name, s]) => ({ name, a: ctlName(s.a), b: ctlName(s.b), fighters: 2 + (s.more?.length || 0),
      ...(s.period ? { period: s.period } : {}), ...(s.chars ? { chars: s.chars } : {}), ...(s.cfg && Object.keys(s.cfg).length ? { cfg: s.cfg } : {}),
      ...(s.waves ? { waves: true } : {}), ...(s.survival ? { survival: true } : {}), ...(s.user ? { user: true } : {}),
      ...(Array.isArray(s.a) ? { script: scriptText(s.a) } : {}) })),
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
  };
}

function session() {
  const { ctx, run } = engine(FILES);
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
  return {
    ctx, run, call, sims, sim, file, ROOT,
    version: run('ENGINE_VERSION'),
    simulate(o) {
      const { replay, summary } = call('simulate', o), id = keep(replay, summary, o.scenario || 'custom');
      return { id, ...summary, ...(o.replay ? { replay } : {}) };
    },
  };
}
module.exports = session;
