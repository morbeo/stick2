'use strict';
// ---------- compare settings: two sets side by side (A and B: the current ones, a preset or a file), the differences listed, either side taken per setting or all at once ----------
// a stage panel of the play and grid tabs, and the grid's compare kind (two cells, A and B); a source is { name, cfg } with cfg only for a file (the current settings and presets are read when shown)
const cmp = { a: { name: 'current' }, b: { name: 'juicy' }, all: false, q: '' };
const CMP_PANEL_TIP = 'Compare settings: the current ones, a preset or a file, side by side; take either side per setting or all at once';
// a source's settings, without the debug views
function cmpCfg(s) {
  const c = s.cfg || (s.name === 'current' ? CFG : { ...DEFAULTS, ...PRESETS[s.name] });
  return Object.fromEntries(Object.keys(DEFAULTS).filter(k => !DISPLAY.includes(k)).map(k => [k, c[k] ?? DEFAULTS[k]]));
}
// the settings that differ (all: every one), in the order of the settings panel, with their group
function cmpRows(all = cmp.all) {
  const A = cmpCfg(cmp.a), B = cmpCfg(cmp.b), rows = [];
  let group = '';
  for (const s of SCHEMA) {
    if (Array.isArray(s)) { group = s[0]; continue; }
    if (s.k in A && (all || A[s.k] !== B[s.k])) rows.push({ k: s.k, group, tip: s.tip, a: A[s.k], b: B[s.k], d: DEFAULTS[s.k] });
  }
  return rows;
}
// the differences as text: - A / + B per setting
const cmpText = () => [`--- A: ${cmp.a.name}`, `+++ B: ${cmp.b.name}`, ...cmpRows(false).flatMap(r => [`- ${r.k}: ${r.a}`, `+ ${r.k}: ${r.b}`])].join('\n');
// a settings or everything file as a source
function cmpFile(side, then) {
  openFile((d, name) => {
    if (d.format !== 'stick2.settings' && d.format !== 'stick2.everything') return notice('Not a settings file', 'Not a settings or everything file');
    cmp[side] = { name: name.replace(/\.json$/, ''), cfg: cfgFrom(d.cfg) }; then?.();
  });
}
// compare… in the import menu and ⌘K: the current settings against a file, over the grid tab (play has no compare panel)
function compareFile() { cmpFile('b', () => { cmp.a = { name: 'current' }; openCompare(); }); }
function openCompare() { if (mode() !== labMode || lab.mode === 'play' || lab.mode === 'gallery') setMode('grid'); openStage('compare'); }
// the A or B button: the current settings, a preset or a file; the grid's compare cells follow
function cmpSource(side) {
  const S = side.toUpperCase(), set = s => { cmp[side] = s; if (lab.mode === 'grid' && lab.kind === 'compare') build(); panels(); };
  const b = button('', `${S}: the current settings, a preset or a file`, (e, b) => popup(b, h('div', { cls: 'bar' },
    seg(['current', ...Object.keys(PRESETS)], () => cmp[side].cfg ? null : cmp[side].name, n => { closePop(); set({ name: n }); },
      { current: 'The settings in use now', ...PRESET_TIPS }),
    button(':upload: file…', 'A settings or everything file (only its settings are read)', () => { closePop(); cmpFile(side, () => set(cmp[side])); }))));
  reg(b, () => setRich(b, `${S}: ${cmp[side].name} :expand_more:`));
  return b;
}
function compareView() {
  const wrap = h('div', { cls: 'mtable cmptable' }), body = h('tbody');
  const fill = () => {
    const rows = cmpRows().filter(r => !cmp.q || fuzzy(cmp.q, `${r.k} ${r.group}`)), fmtv = v => typeof v === 'number' ? fmt(v) : String(v);
    const use = (r, side) => r[side] !== CFG[r.k] ? button(`use ${side.toUpperCase()}`, `Set ${r.k} to ${fmtv(r[side])}, ${side.toUpperCase()}'s value (⌘Z undoes)`, () => { setCfg({ [r.k]: r[side] }); fill(); }, 'mini') : null;
    body.replaceChildren(...rows.map(r => h('tr', { tip: r.tip },
      h('td', { cls: 'note', textContent: r.group }), h('td', { textContent: r.k }),
      h('td', { textContent: fmtv(r.a) }), h('td', { textContent: fmtv(r.b) }),
      h('td', { cls: 'note', textContent: typeof r.a === 'number' && r.a !== r.b ? (r.b > r.a ? '+' : '') + fmt(r.b - r.a) : '' }),
      h('td', { cls: 'note', textContent: fmtv(r.d) }), h('td', {}, use(r, 'a'), use(r, 'b')))));
    if (!rows.length) body.replaceChildren(h('tr', {}, h('td', { colSpan: 7, cls: 'note', textContent: cmp.q ? 'no setting matches the filter' : 'A and B are the same' })));
    syncAll();
  };
  const all = side => button(`use all ${side.toUpperCase()}`, `Take every setting of ${side.toUpperCase()} (⌘Z undoes)`, () => { setCfg(cmpCfg(cmp[side])); fill(); });
  const filter = h('input', { cls: 'macro', value: cmp.q, placeholder: 'fuzzy filter: setting or group', tip: 'Letters in order match (e.g. "hs" finds hitstop)',
    oninput: e => { cmp.q = e.target.value; fill(); }, onkeydown: e => e.stopPropagation() });
  wrap.append(stageHead('compare settings', CMP_PANEL_TIP, cmpSource('a'), cmpSource('b'),
    seg(['changed', 'all'], () => cmp.all ? 'all' : 'changed', v => { cmp.all = v === 'all'; fill(); }, { changed: 'List only the settings where A and B differ', all: 'List every setting, the same ones too' }),
    filter, all('a'), all('b'),
    button(':content_copy: copy', 'Copy the differences as text (- A / + B per setting)', () => navigator.clipboard?.writeText(cmpText()))),
    h('table', {}, h('thead', {}, h('tr', {}, ...[['group', 'The settings group'], ['setting', 'Hover a row for what it does'], ['A', 'A\'s value'], ['B', 'B\'s value'],
      ['Δ', 'B − A, for numbers'], ['default', 'The default value'], ['', 'Take a side\'s value (shown when it differs from the current one)']].map(([t, tip]) => h('th', { textContent: t, tip })))), body));
  fill();
  return wrap;
}
