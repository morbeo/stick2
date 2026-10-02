'use strict';
// ---------- my scenarios: built in the browser (characters, controllers, scripts, positions, settings), saved as you go ----------
// stored as { name: { p: [{ char, ctl, script, x, away }, …], period, cfg } } and registered in SCENARIOS (flag user) for the picker and the grid
const SCEN_STORE = 'stick2.scenarios';
const myStore = (() => { try { return JSON.parse(localStorage.getItem(SCEN_STORE)) || {}; } catch { return {}; } })();
const myScens = () => myStore;
const CTLS = { you: 'human', AI: 'ai', dummy: 'dummy', script: 'script' };
const CTL_TIPS = { you: 'You on the keyboard', AI: 'The engine AI', dummy: 'Stands still', script: 'Plays the script below, the same every loop' };
// a script as macro text: waits with a dot (0.2, 1.0), inputs in word form, holds as 'hold up 0.2'
const scriptText = a => a.map(i => typeof i === 'number' ? (Number.isInteger(i) ? i.toFixed(1) : String(i)) : i.hold ? `hold ${i.hold} ${i.t}` : i).join(', ');
function toScen(u) {
  const [p, q] = u.p, ctl = f => f.ctl === 'script' ? parseMacro(f.script) : CTLS[f.ctl];
  const away = u.p.map(f => f.away);
  return { a: ctl(p), b: ctl(q), ax: p.x, bx: q.x, chars: [p.char, q.char], cfg: { ...u.cfg }, period: u.period, user: true,
    init: away.some(Boolean) ? w => { [w.a, w.b].forEach((f, i) => { if (away[i]) { f.away = true; f.dir = -f.dir; } }); } : undefined };
}
// a new one from a scenario's two fighters (its script, positions, characters and settings)
function fromScen(s, chars) {
  const f = (c, x, ch) => ({ char: ch ?? null, ctl: Array.isArray(c) ? 'script' : Object.keys(CTLS).find(k => CTLS[k] === c) || 'dummy', script: Array.isArray(c) ? scriptText(c) : '', x, away: false });
  const scripted = Array.isArray(s.a);
  return { p: [f(s.a, s.ax ?? (scripted ? 330 : 300), (s.chars || chars)?.[0]), f(s.b, s.bx ?? (scripted ? 375 : 500), (s.chars || chars)?.at(-1))], period: s.period || 0, cfg: { ...s.cfg } };
}
function saveScens() {
  for (const k of Object.keys(SCENARIOS)) if (SCENARIOS[k].user && !myStore[k]) delete SCENARIOS[k];
  for (const [k, u] of Object.entries(myStore)) SCENARIOS[k] = toScen(u);
  try { localStorage.setItem(SCEN_STORE, JSON.stringify(myStore)); } catch {}
}
saveScens();
function newScen() {
  let n = 1;
  while (SCENARIOS[`my scenario ${n}`]) n++;
  const name = `my scenario ${n}`;
  myStore[name] = fromScen(SCENARIOS[lab.scen], lab.chars.some(Boolean) ? lab.chars : null);
  saveScens(); lab.scen = name; lab.builder = true; build(); panels();
}
// every change saves and rebuilds the fight behind the builder
const scenChanged = () => { saveScens(); build(); };
const exportScens = () => JSON.stringify(myStore, null, 1);
function importScens(json) { Object.assign(myStore, JSON.parse(json)); saveScens(); panels(); }
const withData = (d, el) => { Object.assign(el.dataset, d); return el; };
const changedCfg = () => Object.keys(DEFAULTS).filter(k => CFG[k] !== DEFAULTS[k] && !['ghost', 'boxes', 'scope'].includes(k));
function scenBuilder() {
  const wrap = h('div', { cls: 'mtable sbuild' }), body = h('div');
  const fill = () => {
    const name = lab.scen, u = myStore[name];
    if (!u) { lab.builder = false; return panels(); }
    const nm = h('input', { cls: 'macro sname', value: name, tip: 'The scenario\'s name (any name the built-ins do not use)', onkeydown: e => e.stopPropagation(),
      onchange: () => { const v = nm.value.trim(); if (!v || v === name || SCENARIOS[v]) { nm.value = name; return; } myStore[v] = u; delete myStore[name]; lab.scen = v; scenChanged(); panels(); } });
    const fighter = (f, i) => withData({ p: i }, h('div', { cls: 'bar' }, h('b', { textContent: `P${i + 1}` }),
      seg(['editor', ...Object.keys(DEFS)], () => f.char ?? 'editor', v => { f.char = v === 'editor' ? null : v; scenChanged(); fill(); },
        Object.fromEntries(['editor', ...Object.keys(DEFS)].map(k => [k, k === 'editor' ? 'The character being edited, whichever it is' : `P${i + 1} is ${k}`]))),
      seg(Object.keys(CTLS), () => f.ctl, v => { f.ctl = v; scenChanged(); fill(); }, CTL_TIPS),
      f.ctl === 'script' ? h('input', { cls: 'macro script', value: f.script, tip: "Steps: '0.2, 2P, 0.12, K' (waits have a dot, inputs in numpad notation or words: down+punch, @move plays a move, hold up 0.2)",
        onkeydown: e => e.stopPropagation(), onchange: e => { f.script = e.target.value; scenChanged(); } }) : null,
      slider('x', { min: 40, max: W - 40, step: 5 }, () => f.x, v => { f.x = v; scenChanged(); }, `Where P${i + 1} starts (the stage is ${W} wide)`),
      toggle(':swap_horiz: back turned', `P${i + 1} starts with its back to the foe`, () => f.away, v => { f.away = v; scenChanged(); })));
    // settings: the overrides it brings, each editable; add one by name, or take every setting changed from the defaults now
    const over = Object.keys(u.cfg).filter(k => SPEC[k]).map(k => { const s = SPEC[k], set = v => { u.cfg[k] = v; scenChanged(); };
      return h('div', { cls: 'bar' }, s.opts ? h('span', { textContent: k }) : null,
        s.opts ? seg(s.opts, () => u.cfg[k], set, s.optTips) : typeof s.v === 'boolean' ? toggle(k, s.tip, () => u.cfg[k], set) : slider(k, s, () => u.cfg[k], set, s.tip),
        button(':close:', `Drop ${k}: the live setting applies`, () => { delete u.cfg[k]; scenChanged(); fill(); }, 'mini')); });
    const found = h('div', { cls: 'bar' }), find = h('input', { cls: 'macro sfind', placeholder: 'add a setting…', tip: 'Type a setting\'s name, then click it to bring it with its current value',
      onkeydown: e => e.stopPropagation(), oninput: () => found.replaceChildren(...(find.value ? SCHEMA.filter(s => !Array.isArray(s) && !(s.k in u.cfg) && fuzzy(find.value, s.k)).slice(0, 12)
        .map(s => button(s.k, s.tip, () => { u.cfg[s.k] = CFG[s.k]; scenChanged(); fill(); }, 'mini')) : [])) });
    body.replaceChildren(h('div', { cls: 'bar' }, nm,
      slider('restart', { min: 0, max: 10, step: 0.1 }, () => u.period, v => { u.period = v; scenChanged(); }, 'Restarts every this many seconds (0: plays on)')),
      ...u.p.map(fighter), h('h4', { textContent: 'settings' }), ...over,
      h('div', { cls: 'bar' }, find, button(':tune: take my settings', 'Bring every setting you changed from the defaults, at its current value',
        () => { for (const k of changedCfg()) u.cfg[k] = CFG[k]; scenChanged(); fill(); }, 'mini')), found);
  };
  wrap.append(h('div', { cls: 'bar' }, h('b', { textContent: 'scenario' }), h('span', { cls: 'note', textContent: 'saved in this browser as you edit' }), h('span', { cls: 'fill' }),
    button(':content_copy: copy', 'A new scenario starting from this one', newScen),
    button(':download: export', 'Download all my scenarios as a JSON file', () => { const a = h('a', { href: URL.createObjectURL(new Blob([exportScens()], { type: 'application/json' })), download: 'stick2-scenarios.json' }); a.click(); }),
    button(':upload: import', 'Add scenarios from a JSON file (same names are replaced)', () => { const i = h('input', { type: 'file', accept: '.json', onchange: async () => importScens(await i.files[0].text()) }); i.click(); }),
    button(':delete: delete', 'Delete this scenario', () => { delete myStore[lab.scen]; saveScens(); lab.scen = 'you vs dummy'; lab.builder = false; build(); panels(); }),
    button(':close:', 'Close the builder', () => { lab.builder = false; panels(); }, 'mini')), body);
  fill();
  return wrap;
}
