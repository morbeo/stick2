'use strict';
// (split from src/editor/lab.js: the fight modes' side panel, movelist and debug popup)
// ---------- side panel: presets, then every setting with its tooltip; groups have an ⓘ with info and keys ----------
function cfgControl(s) {
  const name = h('span', { textContent: s.k });
  if (s.k === 'scope') {
    const b = button('', 'The bone whose angle the scope plots · click: pick another', (e, b) => popup(b, h('div', { cls: 'bar' }, seg(currentChar().ids, () => CFG.scope, v => setDisplay('scope', v), Object.fromEntries(currentChar().ids.map(id => [id, `Plot the angle of ${id}`]))))));
    reg(b, () => { setRich(b, CFG.scope); });
    return h('div', { cls: 'row', tip: s.tip }, name, b);
  }
  const set = v => setCfg({ [s.k]: v }, 'cfg.' + s.k);
  if (s.opts) return h('div', { cls: 'row', tip: s.tip }, name, seg(s.opts, () => CFG[s.k], set, s.optTips));
  if (typeof s.v === 'boolean') return h('div', { cls: 'row', tip: s.tip }, name, toggle(CFG[s.k] ? 'on' : 'off', s.tip, () => CFG[s.k], set));
  return slider(s.k, s, () => CFG[s.k], set, s.tip);
}
function applyPreset(name) {
  const keep = { ...Object.fromEntries(DISPLAY.map(k => [k, CFG[k]])), timeScale: CFG.timeScale };
  setCfg({ ...DEFAULTS, ...PRESETS[name], ...keep });
}
// the settings shown in each group without "more" (the ones most worth turning first)
const BASIC_CFG = new Set(['plant', 'plantStep', 'maxSpeed', 'jumpVel', 'gravity', 'dashSpeed', 'airSpeed', 'fallSpeed', 'easing', 'attackSpeed', 'filter', 'response',
  'hitstop', 'hitShake', 'hitTest', 'powerScale', 'chains', 'chaseJump', 'juggleDecay', 'health', 'damage', 'chip', 'parry', 'staggerAt', 'dizzyAt',
  'grabReach', 'techWindow', 'weapon', 'weaponStart', 'disarm', 'falls', 'floorBounce', 'wallBounce', 'ceiling', 'plane', 'flips', 'dash',
  'comboStop', 'comboShake', 'comboSpeed', 'shake', 'zoomPunch', 'squash', 'sparks', 'slowmoT', 'punchIn', 'knockScale', 'impactFrames', ...DISPLAY]);
// fuzzy match: every query letter appears in order (ignoring case and spaces)
const fuzzy = (q, text) => { let i = 0; text = text.toLowerCase(); for (const c of q.toLowerCase().replace(/\s/g, '')) if ((i = text.indexOf(c, i) + 1) === 0) return false; return true; };

// ---------- movelist (play): P1's current character and stance, every bound move with its input notation (slotTip) ----------
// grouped normals first, then specials/motions/throws; several slots for the same move (e.g. special and qcfSpecial both
// playing it) collapse into one row with every notation that reaches it
function movelistEntries(ch, stanceI) {
  const binds = ch.stances[stanceI]?.[bindsKey(CFG.plane)] || {}, byMove = new Map();
  for (const [slot, m] of Object.entries(binds)) {
    if (!m || !ch.moves[m]) continue;
    const row = byMove.get(m) ?? byMove.set(m, { move: m, notes: [], special: /special|qcf|qcb|dp|^m\d+|throw/i.test(slot) }).get(m);
    const note = slotTip(slot) || slot; if (!row.notes.includes(note)) row.notes.push(note);
  }
  return [...byMove.values()].sort((a, b) => a.special - b.special || a.move.localeCompare(b.move));
}
const movelist = { el: null, q: '', key: '' };
// cheap: only touches the DOM when the played character, its stance or the filter actually changed; called every
// render frame (labRender) so a mid-fight stance switch updates it live, not just after a click (syncAll)
function refreshMovelist(f) {
  if (!movelist.el?.isConnected || !f) return;
  const key = `${f.ch.name}:${f.stanceI}:${movelist.q}`;
  if (key === movelist.key) return; movelist.key = key;
  const rows = movelistEntries(f.ch, f.stanceI).filter(r => !movelist.q || fuzzy(movelist.q, r.move));
  const els = [];
  let special = null; // a small label the first time the group changes (normals, then specials/motions/throws)
  for (const r of rows) { if (r.special !== special) { special = r.special; els.push(h('div', { cls: 'note', textContent: special ? 'specials' : 'normals' })); }
    els.push(h('div', { cls: 'bar' }, h('span', { textContent: r.notes.join(' / ') }), h('span', { textContent: r.move }))); }
  movelist.el.replaceChildren(...els.length ? els : [h('div', { cls: 'note', textContent: 'no move matches' })]);
}
function movelistSection() {
  const body = h('div'); movelist.el = body; movelist.key = ''; // force a fill on (re)mount
  const q = h('input', { cls: 'macro', value: movelist.q, placeholder: 'filter moves…', tip: 'Fuzzy filter by move name',
    onkeydown: e => e.stopPropagation(), oninput: e => { movelist.q = e.target.value; movelist.key = ''; refreshMovelist(lab.cells[0]?.w?.a); } });
  return [heading('Movelist', "The played character's own moves, each with the input that plays it: punches and kicks first, then specials, motions and throws. Updates live as you switch stance or character.", ''),
    h('div', { cls: 'bar' }, q), body];
}
// the scope: an oscilloscope over the focused cell's last few seconds, for the experiment tab specifically - watching
// a curve as you sweep a setting across cells (or breed, or compare A/B) catches things a single end-state number
// hides: a spring that overshoots and rings instead of settling, a stun meter that spikes instead of draining, which
// seed in a sweep made the AI's speed swing wildly. Reading it off one fight after the fact is possible but tedious;
// this is for watching it happen as you turn a dial.
function scopePanel() {
  return [heading('Monitor', "An oscilloscope over the focused cell's last few seconds. angle: a bone's keyframe target (grey) against what's actually drawn (red) after springs, damping and follow-through - the gap between them is overshoot, wobble or lag, which a hit stop or stun number alone won't show you. health / stun: both fighters' meters over time (P1 grey, P2 red) - whether one drains steadily or gets ground down by a snowballing combo. speed: P1's horizontal velocity - whether a dash or knockback is a clean curve or a jitter. Most useful paired with a sweep or breed below: change a setting, watch the shape change.", ''),
    h('div', { cls: 'row', tip: SPEC.scopeKind.tip }, h('span', { textContent: 'scope' }), h('div', { cls: 'bar' }, seg(SPEC.scopeKind.opts, () => CFG.scopeKind, v => setDisplay('scopeKind', v), SPEC.scopeKind.optTips))),
    (() => { const r = h('div', { cls: 'row', tip: SPEC.scope.tip }, h('span', { textContent: 'bone' }), h('div', { cls: 'bar' }, seg(currentChar().ids, () => CFG.scope, v => setDisplay('scope', v), Object.fromEntries(currentChar().ids.map(id => [id, `Plot the angle of ${id}`])))));
      reg(r, () => { r.hidden = CFG.scopeKind !== 'angle'; }); return r; })(),
    scopeCv, stats];
}
function configPanel() {
  let title = '';
  const rows = SCHEMA.map((s, i) => {
    if (Array.isArray(s)) { title = s[0]; return { el: groupHeading(s, i), head: true }; }
    if (s.k === 'scope' || s.k === 'scopeKind') return null; // their own panel now, experiment tab only: scopePanel()
    const el = gridLink(cfgControl(s), s);
    return { el: BASIC_CFG.has(s.k) ? el : adv(el), name: `${s.k} ${title}`, tip: (s.tip || '').toLowerCase() };
  }).filter(Boolean);
  const filter = () => {
    const q = lab.q || '';
    // fuzzy on the name and group title; tooltips only by plain substring (a loose fuzzy match there hits everything)
    for (const r of rows) if (!r.head) r.el.hidden = !!q && !fuzzy(q, r.name) && !r.tip.includes(q.toLowerCase());
    $('side').classList.toggle('searching', !!q); // folded sections and advanced rows open while searching
    rows.forEach((r, i) => { if (r.head) { let any = false; for (let j = i + 1; j < rows.length && !rows[j].head; j++) any ||= !rows[j].el.hidden; r.el.hidden = !any; } });
  };
  const search = h('div', { cls: 'bar' }, ...rich(':search:'),
    h('input', { cls: 'macro', value: lab.q || '', placeholder: 'search variables', tip: 'Fuzzy search: letters in order match names and groups, plain text matches tooltips · Esc clears',
      oninput: e => { lab.q = e.target.value; filter(); },
      onkeydown: e => { e.stopPropagation(); if (e.key === 'Escape') { e.target.value = lab.q = ''; filter(); } } }));
  filter();
  const first = rows.findIndex((r, i) => i && r.head);
  return [search, ...lab.mode === 'play' ? movelistSection() : [], ...lab.mode === 'experiment' ? scopePanel() : [], heading('Presets', 'Whole sets of settings at once: from raw (no smoothing) to juicy (the defaults). Your view settings (ghost, boxes, hud, labels, timer) stay.', ''),
    h('div', { cls: 'bar' }, Object.keys(PRESETS).map(n => button(optLabel(n), PRESET_TIPS[n], () => applyPreset(n))),
      button(':restart_alt: reset', 'All settings back to their defaults (same as juicy); the view settings stay, ⌘Z undoes', () => applyPreset('juicy'))),
    heading('Power', 'How hard blows land and how far bodies fly and bounce (off the floor, the walls and the ceiling). Only those settings change.', ''),
    h('div', { cls: 'bar' }, seg(Object.keys(POWER), () => Object.keys(POWER).find(n => Object.entries(POWER[n]).every(([k, v]) => CFG[k] === v)),
      n => setCfg({ ...POWER[n] }), POWER_TIPS, n => `:${POWER_ICONS[n]}: ${n}`)),
    ...rows.slice(first).map(r => r.el)];
}
// buttons on a group heading that change all of its variables at once
const groupKeys = i => { const k = []; for (let j = i + 1; j < SCHEMA.length && !Array.isArray(SCHEMA[j]); j++) k.push(SCHEMA[j].k); return k; };
// spec s: { min, max, step } for numbers, { opts } for choices, { v: boolean } for switches; v = current value, d = default
const nudge = f => (s, v) => typeof s.v === 'boolean' ? f > 0 : s.opts ? v : snap(s, v + f * (s.max - s.min));
const GROUP_OPS = {
  ':casino:': ['Randomize: every variable of the group gets a random value', s => typeof s.v === 'boolean' ? Math.random() < 0.5
    : s.opts ? s.opts[Math.floor(Math.random() * s.opts.length)] : snap(s, s.min + Math.random() * (s.max - s.min))],
  ':restart_alt:': ['Normalize: the group back to its defaults', (s, v, d) => d],
  ':arrow_drop_up:': ['Empower: numbers up by 15% of their range, switches on', nudge(0.15)],
  ':arrow_drop_down:': ['Diminish: numbers down by 15% of their range, switches off', nudge(-0.15)],
};
// the group buttons for any variables: specs (with k), get(k) / dflt(k) the current and default value, apply({ k: v }) in one
// undo step; exp: [tip, fn] for an experiment button
function groupOps(specs, get, dflt, apply, exp) {
  return h('span', { cls: 'gops' }, ...Object.entries(GROUP_OPS).map(([l, [tip, f]]) =>
    button(l, tip, () => apply(Object.fromEntries(specs.map(s => [s.k, f(s, get(s.k), dflt(s.k))]))), 'mini')),
    exp && button(':science:', exp[0], exp[1], 'mini'));
}
function groupHeading(s, i) {
  const el = heading(...s), ks = groupKeys(i).filter(k => k !== 'scope');
  if (s[0] === 'Debug') return el;
  el.append(groupOps(ks.map(k => SPEC[k]), k => CFG[k], k => SPEC[k].v, vals => setCfg(vals),
    ['Experiment: breed the group\'s variables in the experiment tab, click the best cell to breed around it', () => {
      lab.kind = 'breed'; breed.vars = new Set(ks); breed.cfg = null; setMode('experiment');
    }]));
  return el;
}
// clicking a variable's name sweeps it across the cells, in the experiment tab
function gridLink(row, s) {
  return expLink(row, `test ${s.k} in a grid, one value per cell`,
    () => { lab.kind = 'sweep'; Object.assign(lab.x, { k: s.k, lo: s.min, hi: s.max }); lab.y.k = ''; setMode('experiment'); });
}
const labSide = () => lab.mode === 'gallery' ? moveSide() : [...netSide(), ...configPanel()];
// the debug popup (menu bar): the Debug settings, the debug information, report a bug, reset and factory reset
// (the scope bone and the monitor live in the experiment tab now - see scopePanel)
function debugPanel(e, b) {
  const row = k => h('div', { cls: 'row', tip: SPEC[k].tip }, h('span', { textContent: k }), toggle(CFG[k] ? 'on' : 'off', SPEC[k].tip, () => CFG[k], v => setCfg({ [k]: v }, 'cfg.' + k)));
  popup(b, h('b', { textContent: 'debug' }), row('ghost'), row('boxes'), row('hud'), row('labels'),
    dbgInfo, h('div', { cls: 'bar' }, button(':bug_report: report a bug', 'Shows the report (build, settings changed from default, the shown fight), to copy and paste into a new GitHub issue', (e, b) => reportBug(b), 'bugbtn'),
      button(':restart_alt: reset settings', 'Every setting back to its default; the display aids (ghost, boxes, scope, hud, labels, timer) stay (⌘Z undoes)', () => { applyPreset('juicy'); mode().restart(); }),
      button(':delete: factory reset', 'Delete all local data: edited characters, settings, keys and macros, layout; then reload as new (asks first)', () => factoryReset())),
    h('div', { cls: 'bar' }, button(':north_east: github', 'Open the stick2 repository on GitHub, in a new tab', () => window.open('https://github.com/morbeo/stick2', '_blank'), 'mini')));
  pop.classList.add('dbgpop'); dbgT = 0; drawDebug();
}
const debugBtn = () => [...$('global').querySelectorAll('button')].find(b => b.dataset.tip?.startsWith('Debug:'));
// the fight the debug popup reports on: the focused cell in play / grid, else the mode's first world
const dbgWorld = () => mode() === labMode ? lab.focus?.w || lab.cells[0]?.w : mode().debugWorld?.() || mode().worlds()[0];
// the debug information: build, engine and runtime numbers and the shown fight's state, refreshed twice a second
const dbgInfo = h('pre', { cls: 'note dbg', tip: 'Debug information: the build (npm run build-info writes it), engine version, frame rate, and the focused fight: seed, frame, state hash, each fighter' });
// a checkout served locally: src/build.js is only rewritten by npm run build-info (and npm test), so it can lag behind HEAD
const localBuild = () => location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
// build, engine and runtime numbers and the shown fight's state, computed fresh (not just refreshed while the debug popup is open)
function debugText() {
  const b = typeof BUILD === 'object' ? BUILD : null, w = dbgWorld();
  const name = f => f.action ? (f.action.m.hurt ? 'hurt' : Object.keys(f.ch.moves).find(k => f.ch.moves[k] === f.action.m) || 'move') : f.kd || '';
  let kb = 0; try { for (const k in localStorage) if (localStorage.hasOwnProperty(k)) kb += (k.length + localStorage[k].length) / 512; } catch {}
  return [
    b ? `build ${b.commit}${b.dirty ? ' + changes' : ''} (${b.branch}) · ${b.date.slice(0, 16).replace('T', ' ')}${localBuild() ? ` · as of ${b.built.slice(0, 16).replace('T', ' ')}: npm run build-info after a commit or checkout` : ''}` : `build ${document.querySelector('script[src*="?v="]')?.src.split('?v=')[1] || 'local checkout'} (no src/build.js: npm run build-info)`,
    `engine v${ENGINE_VERSION} · ${app.fps} fps · ${app.frameMs.toFixed(1)} ms/frame, worst ${app.worstMs.toFixed(0)} ms`,
    `${app.mode} / ${lab.mode} · ${mode().worlds().length} worlds · ${Object.keys(DEFAULTS).filter(k => CFG[k] !== DEFAULTS[k]).length} settings changed`,
    ...w ? [`fight: seed ${w.seed} · frame ${w.log.length} · ${w.simT.toFixed(2)} s · hash ${w.stateHash()} · ${w.hits} hits`,
      ...w.fighters.map((f, i) => `P${i + 1} ${f.ch.name}: x ${f.x | 0} y ${f.y | 0} vx ${f.vx | 0} · hp ${Math.round(f.hp)} · ${frameState(f)} ${name(f)}`)] : [],
    `canvas ${canvas.width}×${canvas.height} @${dpr} · storage ${kb.toFixed(0)} KB · ${navigator.userAgent.match(/(Firefox|Chrome|Version)\/[\d.]+/)?.[0] || ''}`,
  ].join('\n');
}
let dbgT = 0;
function drawDebug() {
  if (!dbgInfo.isConnected || performance.now() < dbgT) return;
  dbgT = performance.now() + 500;
  dbgInfo.textContent = debugText();
}
// shows the debug info plus the actual settings changed from default (the count alone isn't actionable in a report);
// one button copies it and opens a new GitHub issue to paste it into. A saved replay (play: save replay) is the other
// half of a good report, so it's called out here too
function reportBug(anchor) {
  const settings = cfgData(), text = [debugText(),
    Object.keys(settings).length ? 'settings changed from default: ' + JSON.stringify(settings) : 'settings: all default'].join('\n');
  popup(anchor, h('b', { textContent: 'report a bug' }),
    h('p', {}, 'This is copied for you below. Describe what happened, paste it in, and attach a saved replay if you can reproduce it (play: the save replay button).'),
    h('pre', { cls: 'note dbg', textContent: text }),
    h('div', { cls: 'bar' }, button(':bug_report: copy & open a new issue', 'Copy this to your clipboard and open a new GitHub issue to paste it into', () => {
      navigator.clipboard?.writeText(text); window.open('https://github.com/morbeo/stick2/issues/new?template=bug_report.md', '_blank'); closePop();
    }, 'bugbtn')));
}

// click focuses a cell; in breed / attacks a click breeds around it and Shift+click focuses
