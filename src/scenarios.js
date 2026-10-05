'use strict';
// ---------- my scenarios: built in the browser (characters, controllers, scripts, positions, settings), saved as you go ----------
// stored as { name: { p: [{ char, ctl, script, x, away, inv }, …], period, cfg } } and registered in SCENARIOS (flag user) for the picker and the experiment tab
// BASE_SCENARIOS/SCENARIOS: src/brain.js (the shipped defaults, never mutated, vs. the live table this file layers myStore's overrides onto)
const SCEN_STORE = 'stick2.scenarios';
const myStore = (() => { try { return JSON.parse(localStorage.getItem(SCEN_STORE)) || {}; } catch { return {}; } })();
const myScens = () => myStore;
// a built-in opened in the builder but not yet changed: shown from here, not myStore, so merely looking at one never
// persists it or counts it as one of "my scenarios" anywhere myStore is read directly (the tests matrix, the export file…)
let preview = null;
const CTLS = { you: 'human', AI: 'ai', dummy: 'dummy', script: 'script' };
const CTL_TIPS = { you: 'You on the keyboard', AI: 'The engine AI', dummy: 'Stands still', script: 'Plays the script below, the same every loop' };
// a script as macro text: waits with a dot (0.2, 1.0), inputs in word form, holds as 'hold up 0.2'
const scriptText = a => a.map(i => typeof i === 'number' ? (Number.isInteger(i) ? i.toFixed(1) : String(i)) : i.hold ? `hold ${i.hold} ${i.t}` : i).join(', ');
function toScen(u) {
  const [p, q, ...rest] = u.p, ctl = f => f.ctl === 'script' ? parseMacro(f.script) : CTLS[f.ctl];
  const away = u.p.map(f => f.away);
  const over = f => { const o = { ...f.inv && { inv: f.inv }, ...f.aiStyle && { aiStyle: f.aiStyle }, ...f.aiSkill && { aiSkill: f.aiSkill },
      ...f.limits && Object.keys(f.limits).length && { limits: f.limits } };
    return Object.keys(o).length ? o : undefined; }; // invulnerability, AI style/skill and move limits: the fighter's own overrides (Fighter.c / allowed)
  return { a: ctl(p), b: ctl(q), ax: p.x, bx: q.x, aover: over(p), bover: over(q), chars: u.p.map(f => f.char),
    more: rest.length ? rest.map(f => ({ c: ctl(f), x: f.x, team: f.team ?? 1, over: over(f) })) : undefined,
    stage: u.stage, props: u.props?.length ? u.props.map(p => ({ type: p.type, x: p.x })) : undefined, cfg: { ...u.cfg }, period: u.period, user: true,
    init: away.some(Boolean) ? w => { w.fighters.forEach((f, i) => { if (away[i]) { f.away = true; f.dir = -f.dir; } }); } : undefined };
}
// a new one from a scenario's fighters (its script, positions, characters, teams and settings); P3 on come from s.more
function fromScen(s, chars) {
  const names = s.chars || chars, name = i => names?.[i] ?? names?.at(-1);
  const f = (c, x, ch, o, team) => ({ char: ch ?? null, ctl: Array.isArray(c) ? 'script' : Object.keys(CTLS).find(k => CTLS[k] === c) || 'dummy', script: Array.isArray(c) ? scriptText(c) : '', x, away: false,
    ...team !== undefined && { team }, ...o?.inv && { inv: o.inv }, ...o?.aiStyle && { aiStyle: o.aiStyle }, ...o?.aiSkill && { aiSkill: { ...o.aiSkill } }, ...o?.limits && { limits: { ...o.limits } } });
  const scripted = Array.isArray(s.a);
  return { p: [f(s.a, s.ax ?? (scripted ? 330 : 300), name(0), s.aover), f(s.b, s.bx ?? (scripted ? 375 : 500), name(1), s.bover),
    ...(s.more || []).map((m, i) => f(m.c, m.x, name(i + 2), m.over, m.team ?? 1))], stage: s.stage,
    props: (s.props || []).map(p => ({ type: p.type, x: p.x })), period: s.period || 0, cfg: { ...s.cfg } };
}
function saveScens() {
  for (const k of Object.keys(SCENARIOS)) if (!myStore[k]) { if (BASE_SCENARIOS[k]) SCENARIOS[k] = BASE_SCENARIOS[k]; else if (SCENARIOS[k].user) delete SCENARIOS[k]; }
  for (const [k, u] of Object.entries(myStore)) SCENARIOS[k] = toScen(u);
  try { localStorage.setItem(SCEN_STORE, JSON.stringify(myStore)); } catch {}
}
saveScens();
function newScen() {
  let n = 1;
  while (SCENARIOS[`my scenario ${n}`]) n++;
  const name = `my scenario ${n}`;
  myStore[name] = fromScen(withInv(SCENARIOS[lab.scen]), lab.chars.some(Boolean) ? lab.chars : null);
  saveScens(); lab.scen = name; build(); openStage('builder');
}
// every change saves and rebuilds the fight behind the builder; a still-previewed built-in is promoted into myStore first
const scenChanged = () => { if (preview?.name === lab.scen) { myStore[lab.scen] = preview.u; preview = null; } saveScens(); build(); };
const exportScens = () => JSON.stringify(myStore, null, 1);
function importScens(json) { Object.assign(myStore, JSON.parse(json)); saveScens(); panels(); }
const withData = (d, el) => { Object.assign(el.dataset, d); return el; };
const changedCfg = () => Object.keys(DEFAULTS).filter(k => CFG[k] !== DEFAULTS[k] && !DISPLAY.includes(k));
// move limits (f.limits, a fighter override): how many times each move can be used this fight (0: banned outright)
function limitsPopup(f, anchor) {
  const ch = f.char ? CHARS[f.char] || currentChar() : currentChar();
  f.limits ??= {};
  const rowsBox = h('div', {});
  reg(rowsBox, () => rowsBox.replaceChildren(...Object.keys(f.limits).filter(n => ch.moves[n]).map(n => h('div', { cls: 'bar' }, h('span', { textContent: n }),
    slider('uses', { min: 0, max: 20, step: 1 }, () => f.limits[n], v => { f.limits[n] = v; scenChanged(); }, `${n} can be used at most this many times this fight (0: banned outright)`),
    button(':close:', `Remove the limit on ${n}`, () => { delete f.limits[n]; if (!Object.keys(f.limits).length) delete f.limits; scenChanged(); }, 'mini')))));
  const found = h('div', { cls: 'bar' });
  const find = h('input', { cls: 'macro', placeholder: 'add a move…', tip: 'Type a move name, then click it to cap its uses', onkeydown: e => e.stopPropagation(),
    oninput: () => found.replaceChildren(...(find.value ? Object.keys(ch.moves).filter(n => !(n in f.limits) && fuzzy(find.value, n)).slice(0, 12)
      .map(n => button(n, `Cap ${n} (start at 3, then adjust)`, () => { f.limits[n] = 3; scenChanged(); find.value = ''; found.replaceChildren(); }, 'mini')) : [])) });
  popup(anchor, h('b', { textContent: 'move limits' }),
    h('p', {}, ...rich('How many times each move can be used this fight (0: banned outright). Unlisted moves have no limit. Applies to whoever plays this fighter, AI or you.')),
    rowsBox, h('div', { cls: 'bar' }, find), found);
}
// fine skill overrides (f.aiSkill, a fighter override over the aiLevel preset): only what differs from the level in use
const AI_SKILL_TIPS = { react: 'Seconds before reacting to a throw, blockstun escape or landing', guard: 'Chance to guard an attack starting up in front of it',
  brk: 'Chance to break a throw, and to escape blockstun with a guard cancel / push block', tech: 'Chance to tech a knockdown landing, and how it decides to wake up',
  antiAir: 'Chance to anti-air a foe jumping in close', juggle: 'Chance to jump in and juggle a launched foe' };
function skillPopup(f, anchor) {
  const base = () => AI_LEVELS[CFG.aiLevel] || AI_LEVELS.normal, cur = k => f.aiSkill?.[k] ?? base()[k];
  const set = (k, v) => { f.aiSkill ??= {}; if (v === base()[k]) { delete f.aiSkill[k]; if (!Object.keys(f.aiSkill).length) delete f.aiSkill; } else f.aiSkill[k] = v; scenChanged(); };
  popup(anchor, h('b', { textContent: 'skill' }), h('p', {}, ...rich(`Fine-tune this fighter's skill on top of the aiLevel setting (now: ${CFG.aiLevel}). Only what you change here differs from it.`)),
    ...Object.entries(AI_SKILL_TIPS).map(([k, tip]) => slider(k, { min: 0, max: 1, step: 0.02 }, () => cur(k), v => set(k, v), tip)));
}
const BUILDER_TIP = 'Edit this scenario: characters, controllers, script, positions, settings';
function scenBuilder() {
  const wrap = h('div', { cls: 'mtable sbuild' }), body = h('div');
  const fill = () => {
    const name = lab.scen;
    let u = myStore[name];
    if (!u) {
      if (!SCENARIOS[name]) return closeStage();
      if (preview?.name !== name) preview = { name, u: fromScen(withInv(SCENARIOS[name]), null) };
      u = preview.u;
    }
    u.props ??= [];
    const nm = h('input', { cls: 'macro sname', value: name, tip: 'The scenario\'s name (any name the built-ins do not use)', onkeydown: e => e.stopPropagation(),
      onchange: () => { const v = nm.value.trim(); if (!v || v === name || SCENARIOS[v]) { nm.value = name; return; } myStore[v] = u; delete myStore[name]; if (preview?.u === u) preview = null; lab.scen = v; scenChanged(); panels(); } });
    // the character picker: a popup with a grid of cards (as play's fighters group), instead of a flat list of names
    const charPick = (f, i) => {
      const cv = h('canvas'), name = () => f.char ?? CURRENT;
      const b = button('', `P${i + 1}'s character · click: pick from every character`, (e, el) => popup(el,
        h('b', { textContent: `P${i + 1}` }),
        h('div', { cls: 'bar' }, toggle(':edit: editor', `Follow the character being edited (now ${CURRENT})`, () => !f.char, () => { closePop(); f.char = null; scenChanged(); fill(); }),
          button(':casino: random', 'A random character', () => { closePop(); const ks = Object.keys(DEFS); f.char = ks[Math.floor(Math.random() * ks.length)]; scenChanged(); fill(); })),
        h('div', { cls: 'cards' }, Object.keys(DEFS).map(k => charCard(k, v => { closePop(); f.char = v; scenChanged(); fill(); }, k => (f.char ?? 'editor') === k)))));
      b.classList.add('fpick');
      reg(b, () => { b.replaceChildren(cv, h('span', { textContent: `P${i + 1} ${name()}` })); drawThumb(cv, CHARS[name()] || currentChar(), undefined, 20, 22); });
      return b;
    };
    // extra actors (P3 on) default to P2's team (gang up on P1); 'own' gives each its own team (free-for-all)
    const TEAM_TIPS = { P1: 'Fights alongside P1 (same team)', P2: "Fights alongside P2 (same team, the default)", own: "Its own team: a foe of everyone else" };
    const fighter = (f, i) => withData({ p: i }, h('div', { cls: 'bar' }, h('b', { textContent: `P${i + 1}` }),
      charPick(f, i),
      seg(Object.keys(CTLS), () => f.ctl, v => { f.ctl = v; scenChanged(); fill(); }, CTL_TIPS),
      f.ctl === 'script' ? h('input', { cls: 'macro script', value: f.script, tip: "Steps: '0.2, 2P, 0.12, K' (waits have a dot, inputs in numpad notation or words: down+punch, @move plays a move, hold up 0.2)",
        onkeydown: e => e.stopPropagation(), onchange: e => { f.script = e.target.value; scenChanged(); } }) : null,
      slider('x', { min: 40, max: W - 40, step: 5 }, () => f.x, v => { f.x = v; scenChanged(); }, `Where P${i + 1} starts (the stage is ${W} wide)`),
      toggle(':swap_horiz: back turned', `P${i + 1} starts with its back to the foe`, () => f.away, v => { f.away = v; scenChanged(); }),
      seg(['off', 'nodamage', 'untouchable'], () => f.inv || 'off', v => { if (v === 'off') delete f.inv; else f.inv = v; scenChanged(); },
        { off: `P${i + 1} can be hit and hurt`, nodamage: `P${i + 1} reacts to hits but loses no health`, untouchable: `Nothing hits P${i + 1}: strikes, shots and throws pass through` },
        v => v === 'off' ? ':shield: off' : v === 'nodamage' ? 'no damage' : v),
      i >= 2 ? seg(['P1', 'P2', 'own'], () => f.team === 0 ? 'P1' : f.team === 1 || f.team === undefined ? 'P2' : 'own', v => { f.team = v === 'P1' ? 0 : v === 'P2' ? 1 : i; scenChanged(); }, TEAM_TIPS) : null,
      f.ctl === 'AI' ? seg(Object.keys(AI_STYLES), () => f.aiStyle || 'balanced', v => { if (v === 'balanced') delete f.aiStyle; else f.aiStyle = v; scenChanged(); },
        SPEC.aiStyle.optTips, v => optLabel(v)) : null,
      f.ctl === 'AI' ? button(':tune: skill', `Fine-tune P${i + 1}'s AI skill on top of the aiLevel setting`, (e, b) => skillPopup(f, b), 'mini') : null,
      button(':block: limits', `Cap how many times P${i + 1} can use specific moves this fight (0: ban it outright)`, (e, b) => limitsPopup(f, b), 'mini'),
      i >= 2 ? button(':content_copy:', `Add another actor copied from P${i + 1}`, () => { u.p.splice(i + 1, 0, { ...f, team: f.team ?? 1 }); scenChanged(); fill(); }, 'mini') : null,
      i >= 2 ? button(':close:', `Remove P${i + 1}`, () => { u.p.splice(i, 1); scenChanged(); fill(); }, 'mini') : null));
    const addActor = button(':add: add actor', 'Add another fighter to the scenario (P3 on), ganging up on P1 by default', () => {
      u.p.push({ char: null, ctl: 'dummy', script: '', x: Math.min(W - 60, 160 + 80 * (u.p.length - 2)), away: false, team: 1 }); scenChanged(); fill();
    }, 'mini');
    // props: simple collidable scenery (PROPS, src/stage.js) — a crate (breakable), a reed (bends) or a spring (bouncy)
    const propRow = (p, i) => withData({ pr: i }, h('div', { cls: 'bar' }, h('b', { textContent: 'prop' }),
      seg(Object.keys(PROPS), () => p.type, v => { p.type = v; scenChanged(); fill(); }, Object.fromEntries(Object.keys(PROPS).map(k =>
        [k, k === 'crate' ? 'A crate: breaks after enough hits' : k === 'reed' ? 'A reed: bends when struck, never breaks' : 'A spring: bounces thrown weapons back']))),
      slider('x', { min: 20, max: W - 20, step: 5 }, () => p.x, v => { p.x = v; scenChanged(); }, `Where this ${p.type} sits (the stage is ${W} wide)`),
      button(':close:', 'Remove this prop', () => { u.props.splice(i, 1); scenChanged(); fill(); }, 'mini')));
    const addProp = button(':add: add prop', 'Add a piece of collidable scenery: a crate (breakable), a reed (bends) or a spring (bouncy)', () => {
      u.props.push({ type: 'crate', x: Math.min(W - 40, 200 + 60 * u.props.length) }); scenChanged(); fill();
    }, 'mini');
    // settings: the overrides it brings, each editable; add one by name, or take every setting changed from the defaults now
    const over = Object.keys(u.cfg).filter(k => SPEC[k]).map(k => { const s = SPEC[k], set = v => { u.cfg[k] = v; scenChanged(); };
      return h('div', { cls: 'bar' }, s.opts ? h('span', { textContent: k }) : null,
        s.opts ? seg(s.opts, () => u.cfg[k], set, s.optTips) : typeof s.v === 'boolean' ? toggle(k, s.tip, () => u.cfg[k], set) : slider(k, s, () => u.cfg[k], set, s.tip),
        button(':close:', `Drop ${k}: the live setting applies`, () => { delete u.cfg[k]; scenChanged(); fill(); }, 'mini')); });
    const found = h('div', { cls: 'bar' }), find = h('input', { cls: 'macro sfind', placeholder: 'add a setting…', tip: 'Type a setting\'s name, then click it to bring it with its current value',
      onkeydown: e => e.stopPropagation(), oninput: () => found.replaceChildren(...(find.value ? SCHEMA.filter(s => !Array.isArray(s) && !(s.k in u.cfg) && fuzzy(find.value, s.k)).slice(0, 12)
        .map(s => button(s.k, s.tip, () => { u.cfg[s.k] = CFG[s.k]; scenChanged(); fill(); }, 'mini')) : [])) });
    body.replaceChildren(h('div', { cls: 'bar' }, nm,
      slider('restart', { min: 0, max: 10, step: 0.1 }, () => u.period, v => { u.period = v; scenChanged(); }, 'Restarts every this many seconds (0: plays on)'),
      seg(Object.keys(STAGES), () => u.stage || 'plain', v => { u.stage = v === 'plain' ? undefined : v; scenChanged(); }, Object.fromEntries(Object.keys(STAGES).map(k => [k, STAGES[k].tip])))),
      ...u.p.map(fighter), h('div', { cls: 'bar' }, addActor),
      ...u.props.map(propRow), h('div', { cls: 'bar' }, addProp), h('h4', { textContent: 'settings' }), ...over,
      h('div', { cls: 'bar' }, find, button(':tune: take my settings', 'Bring every setting you changed from the defaults, at its current value',
        () => { for (const k of changedCfg()) u.cfg[k] = CFG[k]; scenChanged(); fill(); }, 'mini')), found);
  };
  wrap.append(stageHead('scenario', BUILDER_TIP, h('span', { cls: 'note', textContent: 'saved in this browser as you edit' }),
    button(':science: test in experiment', 'Open this scenario in the experiment tab, one row, to sweep it across settings', () => {
      lab.kind = 'sweep'; lab.x = { k: 'hitstop' }; lab.y = { k: 'scenario' }; lab.rows = [lab.scen]; setMode('experiment');
    }),
    button(':content_copy: copy', 'A new scenario starting from this one', newScen),
    button(':download: export', 'Download all my scenarios as a JSON file', () => { const a = h('a', { href: URL.createObjectURL(new Blob([exportScens()], { type: 'application/json' })), download: 'stick2-scenarios.json' }); a.click(); }),
    button(':upload: import', 'Add scenarios from a JSON file (same names are replaced)', () => { const i = h('input', { type: 'file', accept: '.json', onchange: async () => importScens(await i.files[0].text()) }); i.click(); }),
    BASE_SCENARIOS[lab.scen]
      ? button(':undo: revert', 'Restore this scenario to its shipped values', () => { delete myStore[lab.scen]; saveScens(); build(); fill(); })
      : button(':delete: delete', 'Delete this scenario', () => { delete myStore[lab.scen]; saveScens(); lab.scen = 'you vs dummy'; build(); closeStage(); })), body);
  fill();
  return wrap;
}
