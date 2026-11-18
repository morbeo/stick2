// ---------- character mode, stats side: radar, stats, walk & idle, shadow (split from creator.js) ----------
// ---------- radar: the character's chosen stats, other characters overlaid to compare ----------
const radar = { vars: new Set(['speed', 'dash', 'traction', 'weight', 'jump', 'airSpeed', 'health', 'tempo']), chars: new Set() };
const RADAR_COLS = ['#c0392b', '#2a6fb0', '#2e8b57', '#b8860b', '#7b4ea3', '#d35400', '#555'];
const statOf = (k, st) => DEFS[k][st.k] ?? 1;
function radarPanel() {
  const cv = h('canvas', { cls: 'radar' }), legend = h('div', { cls: 'legend' });
  const draw = () => {
    const S = 250, c = cv.getContext('2d'), axes = CHAR_STATS.filter(st => radar.vars.has(st.k)), n = axes.length, R = 80, cx = S / 2, cy = S / 2;
    cv.width = cv.height = S * dpr; c.scale(dpr, dpr); c.font = '10px ui-monospace, Menlo, monospace'; c.textAlign = 'center';
    const ks = [CURRENT, ...[...radar.chars].filter(k => k !== CURRENT && DEFS[k])];
    legend.replaceChildren(...ks.map((k, i) => h('span', { textContent: k, style: `color: ${RADAR_COLS[i % RADAR_COLS.length]}` })));
    if (n < 3) { c.fillStyle = '#999'; c.fillText('pick 3 or more stats', cx, cy); return; }
    const pt = (i, f) => { const a = -Math.PI / 2 + i / n * 2 * Math.PI; return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f]; };
    const shape = f => { c.beginPath(); axes.forEach((st, i) => c.lineTo(...pt(i, f(st)))); c.closePath(); };
    const norm = (v, st) => clamp((v - st.min) / (st.max - st.min), 0, 1);
    c.strokeStyle = '#ddd'; c.lineWidth = 1;
    for (const f of [0.25, 0.5, 0.75, 1]) { shape(() => f); c.stroke(); }
    axes.forEach((st, i) => { c.beginPath(); c.moveTo(cx, cy); c.lineTo(...pt(i, 1)); c.stroke(); });
    c.setLineDash([3, 3]); c.strokeStyle = '#aaa'; shape(st => norm(1, st)); c.stroke(); c.setLineDash([]); // 1 = as the settings say
    ks.slice().reverse().forEach(k => { // the current character on top
      const col = RADAR_COLS[ks.indexOf(k) % RADAR_COLS.length];
      shape(st => norm(statOf(k, st), st)); c.globalAlpha = 0.15; c.fillStyle = col; c.fill();
      c.globalAlpha = 1; c.strokeStyle = col; c.lineWidth = k === CURRENT ? 2 : 1.5; c.stroke();
    });
    c.fillStyle = '#555';
    axes.forEach((st, i) => { const [x, y] = pt(i, 1.18); c.fillText(st.k, x, y + 3); });
  };
  reg(cv, draw);
  const head = h('h3', { textContent: 'radar', tip: 'Stats on a radar: each axis runs from the stat\'s minimum (centre) to its maximum (rim); the dashed ring is 1 (as the settings say). Pick the axes and the characters to compare.' });
  head.append(h('span', { cls: 'gops' },
    button(':tune:', 'Pick the stats the radar shows as axes', (e, b) => popup(b, h('div', { cls: 'bar' }, CHAR_STATS.map(st =>
      toggle(st.k, `${st.g} · ${st.tip}`, () => radar.vars.has(st.k), on => radar.vars[on ? 'add' : 'delete'](st.k))))), 'mini'),
    button(':person:', 'Characters to compare with this one', (e, b) => popup(b, h('div', { cls: 'bar' }, Object.keys(DEFS).filter(k => k !== CURRENT).map(k =>
      toggle(k, `Overlay ${k}'s stats on the radar to compare`, () => radar.chars.has(k), on => radar.chars[on ? 'add' : 'delete'](k))))), 'mini')));
  return [head, cv, legend];
}
// the character's stats; defaults are the built-in's values (custom characters: 1)
// (in stance only: the stance body's stats over the character's; health stays the character's)
function statsPanel(only) {
  const own = stanceOnly(), get = k => (own ? stanceBody()?.stats?.[k] : undefined) ?? DEFS[CURRENT][k] ?? 1, dflt = k => own ? DEFS[CURRENT][k] ?? 1 : CHAR_DEFS[CURRENT]?.[k] ?? 1;
  const put = (def, vals) => Object.assign(own ? editBody(def).stats ??= {} : def, vals);
  // one heading per group (ground / air / fight), each with its group buttons
  return Object.keys(STAT_GROUPS).filter(g => !only || g === only).flatMap(g => {
    const specs = CHAR_STATS.filter(s => s.g === g && !(own && s.k === 'health'));
    const title = h('h3', { textContent: `${g} stats`, tip: `${STAT_GROUPS[g]}. Multipliers on the fight settings for this character only (1 = as the settings say)` });
    title.append(groupOps(specs, get, dflt, vals => edit(def => put(def, vals)),
      [`Experiment: nine bodies varying the ${g} stats; click the best to breed around it`, () => { creator.exp.vars = new Set(specs.map(s => s.k)); openBodyVary(); }]));
    return [title, ...specs.map(s => bodyExpLink(slider(s.k, s, () => get(s.k), v => edit(def => put(def, { [s.k]: v }), 'stat:' + s.k), s.tip), s.k))];
  });
}
// walk and idle knobs; keyframed loops (moves named idle / walk, made in animate) replace them
function gaitPanel() {
  const own = stanceOnly(), spec = k => GAIT_VARS.find(s => s.k === k), main = k => DEFS[CURRENT].gait?.[k] ?? spec(k).v;
  const get = k => (own ? stanceBody()?.gait?.[k] : undefined) ?? main(k), dflt = k => own ? main(k) : CHAR_DEFS[CURRENT]?.gait?.[k] ?? spec(k).v;
  const set = vals => edit(def => { if (own) { const b = editBody(def); b.gait = { ...b.gait, ...vals }; } else def.gait = { ...def.gait, ...vals }; }, 'gait:' + Object.keys(vals).join());
  const title = h('h3', { textContent: 'walk & idle', tip: 'The procedural walk and idle of this character. Preview: walk shows the cycle. A keyframed idle or walk loop (animate) replaces them.' });
  title.append(groupOps(GAIT_VARS, get, dflt, set,
    ['Experiment: nine bodies varying the walk and idle; click the best to breed around it', () => { creator.exp.vars = new Set(GAIT_VARS.filter(s => !s.opts).map(s => s.k)); creator.preview = 'walk'; openBodyVary(); }]));
  const loops = ['idle', 'walk'].map(n => loopName(currentChar(), studio.stance, n)).filter(n => currentChar().moves[n]);
  const path = h('div', { cls: 'row', tip: 'Draw each foot\'s path in the preview (walk preview: one full cycle)' }, h('span', {}, ...rich(':timeline: preview')), h('span', { cls: 'bar' },
    toggle(':footprint: step path', 'Trail every foot in the preview fight: each one should go as far forward as back', () => rig.steps, v => { rig.steps = v; rig.stepTrail = []; if (v) creator.preview = 'walk'; })));
  return [title, h('div', { cls: 'note', textContent: own ? 'this stance only: these change this stance\'s walk alone' : 'a stance can walk its own way: pick it and switch on this stance only (stance row)' }), path,
    loops.length ? h('div', { cls: 'note', textContent: `keyframed ${loops.join(' and ')} loop replaces the procedural one` }) : null,
    ...GAIT_VARS.map(s => s.opts ? h('div', { cls: 'row', tip: s.tip }, h('span', { textContent: s.k }), seg(s.opts, () => get(s.k), v => set({ [s.k]: v }), s.optTips))
      : bodyExpLink(slider(s.k, s, () => get(s.k), v => set({ [s.k]: v }), s.tip), s.k, 'walk'))];
}
// the shadow under the fighter (def.shadow, only what differs from SHADOW is saved); drawing only
const SHADOW_VARS = [
  { k: 'w', min: 0, max: 60, step: 1, tip: 'Width: the half-width of the oval, the radius of the circle (px); body: the figure\'s width (22 = as wide as the fighter)' },
  { k: 'h', min: 0, max: 30, step: 0.5, only: ['ellipse', 'body'], tip: 'Height: the half-height of the oval (px); body: how much of the figure\'s height shows on the floor (22 = all of it)' },
  { k: 'alpha', min: 0, max: 0.6, step: 0.01, tip: 'Darkness: 0 invisible … 0.6 nearly solid' },
  { k: 'dx', min: -40, max: 40, step: 1, tip: 'Moves the shadow forward (+) or back (−) from the feet (px; on the screen, not by facing)' },
  { k: 'dy', min: -20, max: 20, step: 1, tip: 'Moves the shadow down (+) or up (−) from the floor line (px)' },
  { k: 'lift', min: 0, max: 3, step: 0.1, tip: 'How fast the shadow shrinks as the fighter rises: 1 = to a third at 140 px up, 0 = never' },
  { k: 'skew', min: -2, max: 2, step: 0.05, only: ['body'], tip: 'Body only: how far the shadow leans, per px of height (the light from the side; 0 = straight down)' },
];
function shadowPanel() {
  const own = stanceOnly();
  const get = k => ({ ...SHADOW, ...DEFS[CURRENT].shadow, ...(own && stanceBody()?.shadow) })[k];
  // "back to defaults" means back to the character's own shadow when editing a stance's, else back to the shipped one
  const dflt = k => own ? ({ ...SHADOW, ...DEFS[CURRENT].shadow })[k] : ({ ...SHADOW, ...CHAR_DEFS[CURRENT]?.shadow })[k];
  const set = vals => edit(def => {
    const target = own ? editBody(def) : def, base = own ? { ...SHADOW, ...def.shadow } : SHADOW;
    const sh = { ...target.shadow, ...vals };
    for (const k in sh) if (sh[k] === base[k]) delete sh[k];
    if (Object.keys(sh).length) target.shadow = sh; else delete target.shadow; // nothing of its own (here) saves none
  }, 'shadow:' + Object.keys(vals).join());
  const title = h('h3', { textContent: 'shadow', tip: 'The shadow under this character in a fight: its shape, size, darkness, colour and place. Drawing only, the fight is the same.' });
  title.append(groupOps(SHADOW_VARS, get, dflt, set));
  const off = (r, only) => { reg(r, () => { r.hidden = get('shape') === 'none' || !!only && !only.includes(get('shape')); }); return r; };
  return [title,
    h('div', { cls: 'row', tip: 'The shadow\'s shape' }, h('span', { textContent: 'shape' }),
      seg(Object.keys(SHADOW_SHAPES), () => get('shape'), v => set({ shape: v }), SHADOW_SHAPES, o => o === 'none' ? ':block: off' : optLabel(o))),
    off(h('div', { cls: 'row', tip: 'The shadow\'s colour' }, h('span', {}, ...rich(':palette: colour')),
      seg(['black', ...Object.keys(FX_COLS)], () => get('col'), v => set({ col: v }), { black: 'A plain dark shadow', ...mapVals(FX_COLS, () => 'This colour (a glow under a ghost, coloured light)') }))),
    ...SHADOW_VARS.map(s => off(slider(s.k, s, () => get(s.k), v => set({ [s.k]: v }), s.tip), s.only))];
}
