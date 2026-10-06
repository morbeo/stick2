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
// a scripted scenario's own script, as replay bookmarks: one per action, at the frame it starts (for showcaseReplay)
function scriptBookmarks(a) {
  let f = 0; const marks = [];
  for (const step of a) {
    if (typeof step === 'number') f += step * 60;
    else if (step?.hold) { marks.push({ f: Math.round(f), name: `hold ${step.hold}` }); f += step.t * 60; }
    else marks.push({ f: Math.round(f), name: step.replace(/^!/, '').replace(/\+/g, ' + ') });
  }
  return marks;
}
// the current character performing the 'showcase' scenario, as a replay file with a bookmark at each of its beats
function showcaseReplay() {
  const w = new World(SCENARIOS.showcase, {}, 1); w.loop = false;
  for (let i = 0, n = (SCENARIOS.showcase.period || 8) * 60; i < n; i++) w.advance(1 / 60, NOIN);
  return { ...makeReplay(w, 'showcase'), marks: scriptBookmarks(SCENARIOS.showcase.a) };
}
function toScen(u) {
  const [p, q, ...rest] = u.p, ctl = f => f.ctl === 'script' ? parseMacro(f.script) : CTLS[f.ctl];
  const away = u.p.map(f => f.away);
  const over = f => { const o = { ...f.inv && { inv: f.inv }, ...f.aiStyle && { aiStyle: f.aiStyle }, ...f.aiSkill && { aiSkill: f.aiSkill },
      ...f.limits && Object.keys(f.limits).length && { limits: f.limits } };
    return Object.keys(o).length ? o : undefined; }; // invulnerability, AI style/skill and move limits: the fighter's own overrides (Fighter.c / allowed)
  return { a: ctl(p), b: ctl(q), ax: p.x, bx: q.x, aover: over(p), bover: over(q), chars: u.p.map(f => f.char),
    aTeam: p.team !== 0 ? p.team : undefined, bTeam: q.team !== 1 ? q.team : undefined,
    aw: p.weapon || undefined, bw: q.weapon || undefined,
    more: rest.length ? rest.map(f => ({ c: ctl(f), x: f.x, team: f.team ?? 1, over: over(f) })) : undefined,
    stage: u.stage, props: u.props?.length ? u.props.map(p => ({ type: p.type, x: p.x })) : undefined,
    items: u.items?.length ? u.items.map(it => ({ type: it.type, x: it.x })) : undefined,
    waves: u.mode === 'waves' ? true : undefined, survival: u.mode === 'survival' ? true : undefined,
    select: u.select || undefined, roster: u.select && u.roster?.length ? u.roster : undefined,
    cfg: { ...u.cfg }, period: u.period, user: true,
    init: away.some(Boolean) ? w => { w.fighters.forEach((f, i) => { if (away[i]) { f.away = true; f.dir = -f.dir; } }); } : undefined };
}
// a new one from a scenario's fighters (its script, positions, characters, teams and settings); P3 on come from s.more
// every actor gets an explicit team (P1: 0 "T1", P2: 1 "T2" by default); same team = allies, its own team = a foe of everyone else
function fromScen(s, chars) {
  const names = s.chars || chars, name = i => names?.[i] ?? names?.at(-1);
  const f = (c, x, ch, o, team, weapon) => ({ char: ch ?? null, ctl: Array.isArray(c) ? 'script' : Object.keys(CTLS).find(k => CTLS[k] === c) || 'dummy', script: Array.isArray(c) ? scriptText(c) : '', x, away: false, team,
    ...weapon && { weapon }, ...o?.inv && { inv: o.inv }, ...o?.aiStyle && { aiStyle: o.aiStyle }, ...o?.aiSkill && { aiSkill: { ...o.aiSkill } }, ...o?.limits && { limits: { ...o.limits } } });
  const scripted = Array.isArray(s.a);
  return { p: [f(s.a, s.ax ?? (scripted ? 330 : 300), name(0), s.aover, s.aTeam ?? 0, s.aw), f(s.b, s.bx ?? (scripted ? 375 : 500), name(1), s.bover, s.bTeam ?? 1, s.bw),
    ...(s.more || []).map((m, i) => f(m.c, m.x, name(i + 2), m.over, m.team ?? 1))], stage: s.stage,
    props: (s.props || []).map(p => ({ type: p.type, x: p.x })), items: (s.items || []).map(it => ({ type: it.type, x: it.x })),
    mode: s.waves ? 'waves' : s.survival ? 'survival' : 'normal', select: !!s.select, roster: s.roster || [], period: s.period || 0, cfg: { ...s.cfg } };
}
// a name/slug never saves to myStore or localStorage: it's for the page it's embedded on, not "my scenarios" in this browser
const EMBED_KEY = '__embed__';
function saveScens() {
  for (const k of Object.keys(SCENARIOS)) if (!myStore[k] && k !== EMBED_KEY) { if (BASE_SCENARIOS[k]) SCENARIOS[k] = BASE_SCENARIOS[k]; else if (SCENARIOS[k].user) delete SCENARIOS[k]; }
  for (const [k, u] of Object.entries(myStore)) SCENARIOS[k] = toScen(u);
  try { localStorage.setItem(SCEN_STORE, JSON.stringify(myStore)); } catch {}
}
saveScens();
// ---------- embed: #embed=<slug|JSON> in the URL hash (src/docs.js readHash), for dropping the app in an <iframe> pre-loaded with a fight ----------
const EMBED_SLUGS = { vsdummy: 'you vs dummy', vsai: 'you vs ai', vs2ai: 'you vs 2 ai', vs3dummies: 'you vs 3 dummies', waves: 'endless waves',
  arai: 'random AI vs random AI', arp: 'random player vs random player', arpai: 'random player vs random AI',
  // the same built-ins, hyphenated: easier to read in a URL, and a slug for everyone every existing one didn't cover
  'player-vs-dummy': 'you vs dummy', 'player-vs-ai': 'you vs ai', 'player-vs-2ai': 'you vs 2 ai', 'player-vs-3dummies': 'you vs 3 dummies',
  'ai-vs-dummy': 'ai vs dummy', 'ai-vs-ai': 'ai vs ai', 'ai-2v2': 'ai 2v2', 'ai-1v3': 'ai 1v3', 'ai-ffa': 'ai free-for-all',
  'endless-waves': 'endless waves', 'ai-waves': 'ai vs waves', 'ai-survival': 'ai survival', 'one-vs-many': 'one vs many' };
// scenarios a lone embedder could plausibly want at random: solo (you vs something), not a move test or an AI-only demo
const EMBED_RANDOM_POOL = ['you vs dummy', 'you vs ai', 'you vs 2 ai', 'you vs 3 dummies', 'endless waves', 'survival'];
// an embed is a passive demo for whoever's watching, not a real match: more of these (you vs 2 ai, 3 dummies, waves,
// survival) are a gang-up than a fair fight, so the player gets a real edge instead of just getting ground down.
// over replaces a setting rather than scaling it, so health/staggerAt/dizzyAt (not 1-based like damage) are computed
// off the live CFG; bover also applies to every wave/survival enemy as they spawn in (World.addFoe), not just b
const embedPlayerEdge = () => ({ health: CFG.health * 1.5, damage: 0.5, comboDamage: 0.7, staggerAt: CFG.staggerAt * 1.6, dizzyAt: CFG.dizzyAt * 1.6 });
const EMBED_ENEMY_EDGE = { damage: 1.6 };
function loadEmbedScenario(raw) {
  let name = EMBED_SLUGS[raw] || (SCENARIOS[raw] ? raw : null);
  if (raw === 'random') {
    name = EMBED_RANDOM_POOL[Math.floor(Math.random() * EMBED_RANDOM_POOL.length)];
    const base = SCENARIOS[name];
    SCENARIOS[EMBED_KEY] = { ...base, chars: ['random', 'random', 'random', 'random'],
      aover: { ...base.aover, ...embedPlayerEdge() }, bover: { ...base.bover, ...EMBED_ENEMY_EDGE },
      more: base.more?.map(m => ({ ...m, over: { ...m.over, ...EMBED_ENEMY_EDGE } })) };
    name = EMBED_KEY;
  }
  if (!name) { // not a known scenario or slug: a custom one, exported from the builder (same JSON as the export/import file, one entry)
    let u; try { u = JSON.parse(raw); } catch { return console.error(`stick2: bad #embed value "${raw}"`); }
    SCENARIOS[EMBED_KEY] = toScen(u); name = EMBED_KEY;
  }
  lab.scen = name; lab.playback = null; setMode('play'); setTheater(true); build();
}
function embedLink(u) { return `${location.origin}${location.pathname}#embed=${encodeURIComponent(JSON.stringify(u))}`; }
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
// the scenario now open in the builder, in its editable (u) form: from myStore, or a built-in previewed but not yet changed
function curU() {
  const name = lab.scen;
  let u = myStore[name];
  if (!u) {
    if (!SCENARIOS[name]) return null;
    if (preview?.name !== name) preview = { name, u: fromScen(withInv(SCENARIOS[name]), null) };
    u = preview.u;
  }
  u.props ??= []; u.items ??= []; u.roster ??= [];
  return u;
}
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
    const u = curU();
    if (!u) return closeStage();
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
    // T1, T2… by number, not by player: P1 and P2 start on their own (T1, T2) but any actor can join another's team,
    // start a fresh one (empty for now, others can join it later), or go solo — a popup, since the number of teams
    // and who's on each is open-ended, not a fixed few choices
    const teamPicker = f => {
      const used = () => [...new Set(u.p.map(p => p.team))].sort((a, b) => a - b);
      const label = t => `T${t + 1}`, who = t => u.p.map((p, j) => p.team === t ? `P${j + 1}` : null).filter(Boolean).join(', ');
      const b = button('', 'Team: who this actor fights alongside · click: change', (e, el) => popup(el, h('b', { textContent: 'team' }),
        h('div', { cls: 'bar col', onclick: closePop },
          ...used().map(t => button(label(t), `Join ${label(t)}: fights alongside ${who(t)}`, () => { f.team = t; scenChanged(); })),
          button(':add: new team', 'Start a fresh team, empty for now (others can join it later)', () => { f.team = Math.max(...used()) + 1; scenChanged(); }),
          button(':person: solo', 'Its own team: a foe of everyone else', () => { f.team = Math.max(...used()) + 1; scenChanged(); }))), 'mini');
      reg(b, () => setRich(b, `${label(f.team)} :expand_more:`));
      return b;
    };
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
      teamPicker(f),
      // only P1 and P2 can start holding a weapon (the engine only reads aw/bw for those two slots)
      i < 2 ? seg(['none', ...Object.keys(WEAPONS)], () => f.weapon || 'none', v => { if (v === 'none') delete f.weapon; else f.weapon = v; scenChanged(); },
        { none: `P${i + 1} starts empty-handed`, ...Object.fromEntries(Object.keys(WEAPONS).map(k => [k, WEAPONS[k].tip])) }, v => v === 'none' ? ':back_hand: none' : v) : null,
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
      seg(Object.keys(PROPS), () => p.type, v => { p.type = v; scenChanged(); fill(); }, Object.fromEntries(Object.keys(PROPS).map(k => [k, PROPS[k].tip]))),
      slider('x', { min: 20, max: W - 20, step: 5 }, () => p.x, v => { p.x = v; scenChanged(); }, `Where this ${p.type} sits (the stage is ${W} wide)`),
      button(':close:', 'Remove this prop', () => { u.props.splice(i, 1); scenChanged(); fill(); }, 'mini')));
    const addProp = button(':add: add prop', 'Add a piece of collidable scenery: a crate (breakable), a reed (bends) or a spring (bouncy)', () => {
      u.props.push({ type: 'crate', x: Math.min(W - 40, 200 + 60 * u.props.length) }); scenChanged(); fill();
    }, 'mini');
    // items: weapons lying on the floor, free for anyone to pick up (P+G near one) — separate from props (WEAPONS, not PROPS)
    const WEAPON_TIPS = Object.fromEntries(Object.keys(WEAPONS).map(k => [k, WEAPONS[k].tip]));
    const itemRow = (it, i) => withData({ it: i }, h('div', { cls: 'bar' }, h('b', { textContent: 'item' }),
      seg(Object.keys(WEAPONS), () => it.type, v => { it.type = v; scenChanged(); fill(); }, WEAPON_TIPS),
      slider('x', { min: 20, max: W - 20, step: 5 }, () => it.x, v => { it.x = v; scenChanged(); }, `Where this ${it.type} lies (the stage is ${W} wide)`),
      button(':close:', 'Remove this item', () => { u.items.splice(i, 1); scenChanged(); fill(); }, 'mini')));
    const addItem = button(':add: add weapon', 'Add a weapon lying on the floor, free for anyone to pick up (P+G near it)', () => {
      u.items.push({ type: 'sword', x: Math.min(W - 40, 200 + 60 * u.items.length) }); scenChanged(); fill();
    }, 'mini');
    // settings: the overrides it brings, each editable; add one by name, or take every setting changed from the defaults now
    const over = Object.keys(u.cfg).filter(k => SPEC[k]).map(k => { const s = SPEC[k], set = v => { u.cfg[k] = v; scenChanged(); };
      return h('div', { cls: 'bar' }, s.opts ? h('span', { textContent: k }) : null,
        s.opts ? seg(s.opts, () => u.cfg[k], set, s.optTips) : typeof s.v === 'boolean' ? toggle(k, s.tip, () => u.cfg[k], set) : slider(k, s, () => u.cfg[k], set, s.tip),
        button(':close:', `Drop ${k}: the live setting applies`, () => { delete u.cfg[k]; scenChanged(); fill(); }, 'mini')); });
    const found = h('div', { cls: 'bar' }), find = h('input', { cls: 'macro sfind', placeholder: 'add a setting…', tip: 'Type a setting\'s name, then click it to bring it with its current value',
      onkeydown: e => e.stopPropagation(), oninput: () => found.replaceChildren(...(find.value ? SCHEMA.filter(s => !Array.isArray(s) && !(s.k in u.cfg) && fuzzy(find.value, s.k)).slice(0, 12)
        .map(s => button(s.k, s.tip, () => { u.cfg[s.k] = CFG[s.k]; scenChanged(); fill(); }, 'mini')) : [])) });
    const MODE_TIPS = { normal: 'A normal fight between the actors above', waves: 'Endless waves: P2 is the first enemy, then new ones keep coming (the Waves settings tune them)',
      survival: 'Endless survival: one enemy after another, tougher over time (the Survival settings tune it)' };
    // select screen: a full roster picker shown before the fight (lab.js selectScreen), instead of the small per-slot
    // popup; the roster it offers defaults to every character, narrowed by checking only some of the cards off
    const selectRow = h('div', {});
    const fillSelect = () => selectRow.replaceChildren(
      toggle(':sports_kabaddi: select screen', 'Show a character-select screen for P1 and P2 before the fight starts, instead of picking them from the toolbar',
        () => u.select, v => { u.select = v; if (v) u.roster ??= []; scenChanged(); fillSelect(); }),
      u.select ? h('p', {}, ...rich('Roster for the select screen (none checked = every character):')) : null,
      u.select ? h('div', { cls: 'cards' }, Object.keys(DEFS).map(k => charCard(k,
        () => { const i = u.roster.indexOf(k); if (i < 0) u.roster.push(k); else u.roster.splice(i, 1); scenChanged(); fillSelect(); },
        k => u.roster.includes(k)))) : null);
    fillSelect();
    body.replaceChildren(h('div', { cls: 'bar' }, nm,
      slider('restart', { min: 0, max: 10, step: 0.1 }, () => u.period, v => { u.period = v; scenChanged(); }, 'Restarts every this many seconds (0: plays on)'),
      seg(Object.keys(STAGES), () => u.stage || 'plain', v => { u.stage = v === 'plain' ? undefined : v; scenChanged(); }, Object.fromEntries(Object.keys(STAGES).map(k => [k, STAGES[k].tip]))),
      seg(Object.keys(MODE_TIPS), () => u.mode || 'normal', v => { u.mode = v === 'normal' ? undefined : v; scenChanged(); }, MODE_TIPS)),
      selectRow,
      ...u.p.map(fighter), h('div', { cls: 'bar' }, addActor),
      ...u.props.map(propRow), h('div', { cls: 'bar' }, addProp),
      ...u.items.map(itemRow), h('div', { cls: 'bar' }, addItem), h('h4', { textContent: 'settings' }), ...over,
      h('div', { cls: 'bar' }, find, button(':tune: take my settings', 'Bring every setting you changed from the defaults, at its current value',
        () => { for (const k of changedCfg()) u.cfg[k] = CFG[k]; scenChanged(); fill(); }, 'mini')), found);
  };
  wrap.append(stageHead('scenario', BUILDER_TIP, h('span', { cls: 'note', textContent: 'saved in this browser as you edit' }),
    button(':science: test in experiment', 'Open this scenario in the experiment tab, one row, to sweep it across settings', () => {
      lab.kind = 'sweep'; lab.x = { k: 'hitstop' }; lab.y = { k: 'scenario' }; lab.rows = [lab.scen]; setMode('experiment');
    }),
    button(':content_copy: copy', 'A new scenario starting from this one', newScen),
    button(':download: export', 'Download all my scenarios as a JSON file', () => { const a = h('a', { href: URL.createObjectURL(new Blob([exportScens()], { type: 'application/json' })), download: 'stick2-scenarios.json' }); a.click(); }),
    button(':content_copy: copy all', 'Copy all my scenarios as JSON to the clipboard', () => navigator.clipboard?.writeText(exportScens()), 'mini'),
    button(':upload: import', 'Add scenarios from a JSON file (same names are replaced)', () => { const i = h('input', { type: 'file', accept: '.json', onchange: async () => importScens(await i.files[0].text()) }); i.click(); }),
    button(':content_copy: paste all', 'Add scenarios from JSON on the clipboard (same names are replaced)', async () => { try { importScens(await navigator.clipboard.readText()); } catch {} }, 'mini'),
    button(':content_copy: embed link', 'Copy a link that embeds just this fight, pre-loaded (paste as an <iframe> src)', () => navigator.clipboard?.writeText(embedLink(curU()))),
    BASE_SCENARIOS[lab.scen]
      ? button(':undo: revert', 'Restore this scenario to its shipped values', () => { delete myStore[lab.scen]; saveScens(); build(); fill(); })
      : button(':delete: delete', 'Delete this scenario', () => { delete myStore[lab.scen]; saveScens(); lab.scen = 'you vs dummy'; build(); closeStage(); })), body);
  fill();
  return wrap;
}
