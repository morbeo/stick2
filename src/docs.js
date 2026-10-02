'use strict';
// ---------- docs: how everything works, as topics with live demo fights and "try it" buttons; searchable ----------
// hand-written guide topics, plus reference topics generated from the tables the app itself runs on (settings, move flags,
// heights, input slots, keys), so they cannot go stale. Opened over the app (docs button, ⌘K, "docs →" in a heading's ⓘ),
// or as a page of its own: index.html#docs (docs.html opens it), #docs=topic for one topic
const playScen = s => { setMode('play'); lab.scen = s; lab.playback = null; build(); panels(); };
const openSetting = k => { setMode('play'); lab.q = k; panels(); };
// a guide topic: { id, title, body (paragraphs split by blank lines, :icon: and arrows allowed), demos: scenario names,
// items: [[name, text]], tries: [[label, tip, fn]], set: its settings group, heads: side panel headings whose ⓘ links here }
function guideTopics() {
  return [
    { id: 'start', title: 'What stick2 is', body: 'A sandbox for the feel of a fighting game: stick figures on springs, every timing and force a setting, every move a set of keyframes you can edit. The fight is deterministic (a fixed 120 Hz step and seeded random numbers), so any fight can be rewound, scrubbed, replayed from a file and compared cell by cell.\n\nEverything is drawn in code: no images, no sound files.',
      items: Object.entries(MODES).map(([m, t]) => [`:${MODE_ICONS[m]}: ${m}`, t]), tries: Object.keys(MODES).map(m => [`:${MODE_ICONS[m]}: ${m}`, MODES[m], () => setMode(m)]), demos: ['showcase'] },
    { id: 'fight', title: 'Fighting', body: 'Move with ← / →, jump with ↑ (2D) or Space, crouch with ↓. P punches, K kicks, S plays a special (a different one per direction), G guards. Normal moves chain into each other (J,J,K), a direction changes the move (the numpad notation: 6P is → P, 2K is ↓ K), and specials cancel a normal that hit.\n\nA hit freezes both fighters a moment (hit stop), knocks back, and a strong one knocks down: the body flies, bounces and lies on the floor before it gets up.',
      demos: ['J,J,K', 'J,K→spin', 'dash punch'], tries: [['you vs dummy', 'Fight a dummy that stands still', () => playScen('you vs dummy')], ['you vs ai', 'Fight the engine AI', () => playScen('you vs ai')]], set: 'Combos & cancels' },
    { id: 'guard', title: 'Guarding, parries and throws', body: 'Hold G to guard against the front (not from behind); ↓ + G is a low guard. Each move has a height that decides what stops it: highs pass over a crouch, lows hit a standing guard. A guard tapped just before a hit parries it (the attacker staggers); a little earlier still is a just guard (no chip, short blockstun).\n\nP+G close is a throw, ← P+G the back throw (it swings the victim round behind you), K+G the second throw; a throw catches only a standing, free fighter, and P+G as it starts breaks it. In blockstun, P (guard cancel) strikes back and K (push block) shoves the attacker away.',
      demos: ['vs guard', 'parry', 'throw', 'back throw', 'just guard'], items: Object.entries(HEIGHT_TIPS), set: 'Guard & damage' },
    { id: 'specials', title: 'Special moves', body: 'Each on its own switch in the Specials settings; specialScheme picks guard inputs (G held + → / ← rolls, ↓↓ S teleports) or motion inputs (↓↘→ S). Rolls pass through the foe, teleport reappears behind it, catches answer a strike of their height with a counter, a taunt beckons, a pounce dives on a lying foe, a wallbounce hit throws the victim off the wall into a juggle. ↗ S turns your back: you cannot guard until a direction or a move turns you back. A projectile (a key marked shoot, shots setting) flies from the hands: it is blocked like the move, and two shots meet and cancel.',
      demos: ['fireball', 'fireball clash', 'roll through', 'teleport', 'turnaround', 'high counter', 'guard cancel', 'wake-up attack', 'taunt', 'pounce', 'wall bounce'], set: 'Specials' },
    { id: 'juggles', title: 'Knockdowns and juggles', body: 'A knocked-down fighter flies as a ragdoll (or the fall pose), bounces off the floor and walls and lies downTime before it gets up; G just before landing techs. Hits on an airborne fighter juggle it: each launches lower (juggleDecay), and with jugglePoints set each hit spends the move\'s juggle cost from a pool that refills on the fighter\'s feet. Off-the-ground moves (otg flag) hit a fighter lying on the floor.',
      demos: ['air combo', 'OTG stomp', 'tech', 'wall bounce'], set: 'Falls' },
    { id: 'hitflags', title: 'Hit and guard flags', body: 'A move\'s hits (move panel, behind more) are the states of the foe it can hit; a strike passes through the others. With airGuard on, a jumping fighter holding G blocks every height, unless the move is flagged noAirGuard. The move table shows hits, juggle and the flags.',
      items: [...Object.entries(HITS_TIPS), ['noAirGuard', MOVE_FLAGS.noAirGuard], ['juggle', MOVE_PROPS.find(p => p.k === 'juggle').tip]], tries: [['airGuard', 'Open the airGuard setting', () => openSetting('airGuard')], ['jugglePoints', 'Open the jugglePoints setting', () => openSetting('jugglePoints')]] },
    { id: 'weapons', title: 'Weapons', body: 'P+G over a weapon lying on the floor picks it up, P+G holding it throws it (keep holding to charge the throw). While held, P / → P / ↓ P play its class\'s moves: daggers pierce, swords slash, bats and hammers smash, staffs poke and whirl. A knockdown or a hard blow knocks it loose; two strikes that meet with a weapon clash.',
      demos: ['pick up & slash', 'weapon throw', 'weapon clash', 'disarm'], set: 'Weapons' },
    { id: 'crowds', title: 'Crowds and waves', body: 'Scenarios can put any number of fighters on teams: 2 vs 2, free-for-all, a sandwich between two foes, or endless waves running in from both edges until you fall.',
      demos: ['ai 2v2', 'ai free-for-all', 'ai vs waves'], set: 'Waves' },
    { id: 'character', title: 'The character editor', body: 'Drag a joint to set its bone\'s length and stance angle; select several bones (⌘/Ctrl+click) and every property you change goes to all of them. Add limbs by role (arms, legs, tails, heads), tune each bone\'s stretch, stiffness, follow-through and dangle, and watch the preview fight with it live. The table button lists every bone with every property, sortable and editable; experiment breeds a grid of body variations around the one you click.',
      tries: [[':accessibility_new: character', 'Open the character editor', () => setMode('character')]], heads: ['character', 'body'] },
    { id: 'animate', title: 'The move editor', body: 'A move is a list of keys: each a pose, a duration and an easing. Drag joints to pose a key (IK; Alt rotates one bone), drag its edge on the timeline to retime, double-click to split. Mark keys active (they hit), cancel, invincible, unblockable, armor, catch, warp; set the move\'s power, knockback, launch, height and flags; the preview plays it against a target with springs and hit stop. Views: cards, list, the move table (every move\'s frame data, editable) and the input table (which input starts what).',
      tries: [[':timeline: animate', 'Open the move editor', () => setMode('animate')]], heads: ['moves', 'move'] },
    { id: 'events', title: 'Key events', body: 'Under events in the key panel (behind more): what a key does for the eye and ear as it is reached or hits. They change nothing in the fight, so replays stay valid. A key with events shows a spark icon on the timeline.',
      items: [...Object.entries(SPARK_TIPS).map(([k, t]) => ['spark ' + k, t]), ...Object.entries(SOUND_TIPS).filter(([k]) => k).map(([k, t]) => ['sound ' + k, t]),
        ['after', 'After-images while the key plays'], ['shake', 'Screen shake added as the key is reached (0 … 1)']] },
    { id: 'grid', title: 'Grid, experiments and breeding', body: 'The grid runs nine copies of one fight with a setting swept across the cells (and a second one down the rows). Click a cell to take its settings. Breed mode mutates settings or attacks around the cell you click, generation after generation, to search for a feel instead of tuning by hand.',
      tries: [[':grid_view: grid', 'Open the grid', () => setMode('grid')]] },
    { id: 'debug', title: 'Rewind, replays and debugging', body: 'V rewinds a second, N steps a frame, M scrubs time with the mouse: every fight is restored from a checkpoint and replayed with the same inputs. Record a fight to a replay file (inputs, settings and characters, pinned to the engine version) and play it back later. The frame meter colours startup, active, recovery, hitstun and blockstun per frame; the input display shows the inputs; boxes (B) shows hurt and hit shapes. Both meters are off by default (Debug settings).',
      demos: ['J,J,K'], set: 'Debug' },
    { id: 'sound', title: 'Sound', body: 'Whooshes, hits, thuds and blocks are synthesized live (WebAudio, no files), panned by where they happen, in the live fight and the animate preview only. The :waves: button in the top bar mutes them.' },
  ];
}
// reference topics generated from the app's own tables
function refTopics() {
  const sets = [];
  for (const s of SCHEMA) if (Array.isArray(s)) sets.push({ id: 'set-' + s[0].toLowerCase().replace(/\W+/g, '-'), title: s[0], body: s[1], items: [], ref: true });
    else sets.at(-1).items.push([s.k, `${s.tip}${s.optTips ? ' · ' + Object.entries(s.optTips).map(([o, t]) => `${o}: ${t}`).join(' · ') : ''} (default ${fmt(s.v)})`, () => openSetting(s.k)]);
  const keyName = a => keymap[a].map(k => { const f = keyIn(k, groupOf(a), 'fight'); return keyLabel(k) + (f !== k && ctxOf(groupOf(a)).includes('fight') ? `, in a fight ${keyLabel(f)}` : ''); }).join(' / ') || '—';
  return [
    { id: 'inputs', title: 'Inputs and combos', body: 'P = J, K = K, S = U, G = L by default (rebind them under Keys). Directions as on the numpad: 2 down, 3 down-forward, 6 forward, 8 up.', items: KEYS.map(([n, t]) => [n, t]), ref: true },
    { id: 'keys', title: 'Keyboard', body: 'Every rebindable key, as bound now. In a fight (play, grid) the letters are the fighter\'s: a shortcut on a letter takes ⇧ there (⇧P pause); in the editor modes shortcuts take the plain key and the fight keys do nothing.', items: ACTIONS.map(([a, g, , t]) => [`${a} (${keyName(a)})`, `${g}: ${t}`]), ref: true },
    { id: 'slots', title: 'Input slots', body: 'The inputs a move can be bound to (input row of the move panel).', items: Object.entries(SLOT_TIPS), ref: true },
    { id: 'flags', title: 'Move flags', body: 'Switches on a move (move panel).', items: Object.entries(MOVE_FLAGS), ref: true },
    { id: 'props', title: 'Move properties', body: 'Numbers on a move (move panel); unset ones fall back to the settings.', items: MOVE_PROPS.map(p => [p.k, p.tip]), ref: true },
    { id: 'easing', title: 'Easing', body: 'How a key moves into its pose. Each curve is time → progress toward the pose; the dot beside it moves the way a joint would.', items: Object.entries(EASE_TIPS), ease: true, ref: true },
    ...sets,
  ];
}
const docTopics = () => [...guideTopics(), ...refTopics()];
const topicText = t => [t.title, t.body, ...(t.items || []).flat().filter(x => typeof x === 'string')].join(' ');
// the topic a side panel heading's ⓘ links to
const docFor = title => { const l = String(title).toLowerCase(); return title && docTopics().find(t => t.title.toLowerCase() === l || t.heads?.includes(l)); };

const docs = { topic: 'start', q: '', demos: [], page: false };
function openDocs(id, page = false) {
  closePop(); closePalette(); $('docs')?.remove();
  if (id) docs.topic = id;
  docs.page = page; document.body.classList.toggle('docspage', page);
  const root = h('div', { id: 'docs', onkeydown: e => { e.stopPropagation(); if (e.key === 'Escape' && !docs.page) closeDocs(); },
    onmousedown: e => { if (e.target.id === 'docs') closeDocs(); } });
  document.body.append(root);
  renderDocs(root);
  root.querySelector('input').focus();
  requestAnimationFrame(docsFrame);
}
function closeDocs() { $('docs')?.remove(); docs.demos = []; if (docs.page) { docs.page = false; document.body.classList.remove('docspage'); history.replaceState(null, '', location.pathname); } }
function renderDocs(root) {
  const all = docTopics(), toc = h('div', { cls: 'dtoc' }), body = h('div', { cls: 'dbody' });
  const fill = () => {
    const q = docs.q.trim(), hit = t => !q || fuzzy(q, t.title) || topicText(t).toLowerCase().includes(q.toLowerCase());
    const row = t => h('div', { cls: 'pitem' + (t.id === docs.topic ? ' on' : ''), onclick: () => { docs.topic = t.id; fill(); } }, t.title);
    const shown = all.filter(hit);
    toc.replaceChildren(h('h4', { textContent: 'guide' }), ...shown.filter(t => !t.ref).map(row), h('h4', { textContent: 'reference' }), ...shown.filter(t => t.ref).map(row),
      ...shown.length ? [] : [h('div', { cls: 'note', textContent: 'nothing matches' })]);
    showTopic(body, all.find(t => t.id === docs.topic) || all[0], q);
  };
  const search = h('input', { placeholder: 'search the docs…', value: docs.q, oninput: () => { docs.q = search.value; fill(); },
    onkeydown: e => { if (e.key === 'Enter') { const f = toc.querySelector('.pitem'); if (f) f.click(); } } });
  root.replaceChildren(h('div', { cls: 'dbox' },
    h('div', { cls: 'dside' }, h('div', { cls: 'bar' }, search,
      docs.page ? button(':sports_kabaddi: app', 'Open the app', closeDocs) : button(':close:', 'Close the docs (Esc)', closeDocs)), toc), body));
  fill();
}
// a demo shows the engine as shipped: default settings and the built-in stick, whatever the editors have changed
const demoWorld = s => Object.assign(new World(SCENARIOS[s], { ...DEFAULTS, ...SCENARIOS[s].cfg }, 7, [docs.ch ??= makeCharacter(CHAR_DEFS.stick)]), { loop: true });
// one topic: its text, live demo fights, items (settings link to themselves), try buttons; matches of the search are marked
function showTopic(el, t, q) {
  docs.curves = [];
  docs.demos = (t.demos || []).filter(s => SCENARIOS[s]).map(s => {
    const cv = h('canvas', { width: 360, height: 200 }), d = { s, cv, paused: false, w: demoWorld(s) };
    const pause = button('', 'Pause / play this demo', () => { d.paused = !d.paused; }, 'mini');
    reg(pause, () => setRich(pause, d.paused ? ':play_arrow:' : ':pause:'));
    d.el = h('div', { cls: 'demo' }, cv, h('div', { cls: 'bar' }, h('b', { textContent: s }), pause,
      button(':skip_next:', 'Step one frame', () => { d.paused = true; d.w.advance(1 / 60, NOIN); }, 'mini'),
      button(':restart_alt:', 'Restart this demo', () => d.w.reset(), 'mini'),
      button(':play_arrow: try', 'Run this fight in play mode, with your settings and character', () => { closeDocs(); playScen(s); }, 'mini')));
    return d;
  });
  const mark = s => q && s.toLowerCase().includes(q.toLowerCase());
  const run = fn => () => { closeDocs(); fn(); syncAll(); };
  el.replaceChildren(...[h('h2', { textContent: t.title }), ...t.body.split('\n\n').map(p => h('p', {}, ...rich(p))),
    docs.demos.length && h('div', { cls: 'demos' }, docs.demos.map(d => d.el)),
    t.items?.length && h('dl', {}, t.items.flatMap(([n, txt, fn]) => [
      h('dt', { cls: mark(n) || mark(txt) ? 'hit' : '' }, ...rich(n), fn && button(':chevron_right:', `Open ${n} in the app`, run(fn), 'mini')),
      h('dd', {}, t.ease && easeCurve(n), ...rich(txt))])),
    (t.tries?.length || t.set) && h('div', { cls: 'bar' }, h('span', { cls: 'gl', textContent: 'try it' }), (t.tries || []).map(([l, tip, fn]) => button(l, tip, run(fn))),
      t.set && button(`:tune: ${t.set}`, `The ${t.set} settings, each explained`, () => { docs.topic = docFor(t.set).id; renderDocs($('docs')); }))].filter(Boolean));
  el.scrollTop = 0;
  el.querySelector('dt.hit')?.scrollIntoView({ block: 'center' });
}
// an easing's example: its curve with a dot riding it over time, and the same progress as a dot sliding along a track
function easeCurve(n) {
  const cv = h('canvas', { width: 150, height: 56, cls: 'ease' });
  docs.curves.push({ cv, f: EASE[n] }); return cv;
}
function drawCurve({ cv, f }, now) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height, x0 = 4, w = 70, y0 = H - 10, hh = 34;
  const t = Math.min(1, (now / 1000 % 1.6) / 1.2), Y = v => y0 - v * hh;
  c.clearRect(0, 0, W, H); c.lineWidth = 1; c.strokeStyle = '#d8d2c4';
  c.beginPath(); c.moveTo(x0, Y(0)); c.lineTo(x0 + w, Y(0)); c.moveTo(x0, Y(1)); c.lineTo(x0 + w, Y(1)); c.stroke();
  c.strokeStyle = '#555'; c.lineWidth = 1.5; c.beginPath();
  for (let i = 0; i <= 60; i++) c.lineTo(x0 + i / 60 * w, Y(f(i / 60)));
  c.stroke();
  c.fillStyle = '#c0392b'; c.beginPath(); c.arc(x0 + t * w, Y(f(t)), 3, 0, 7); c.fill();
  const tx = 90, tw = 52; c.strokeStyle = '#d8d2c4'; c.beginPath(); c.moveTo(tx, H / 2); c.lineTo(tx + tw, H / 2); c.stroke();
  c.beginPath(); c.arc(tx + f(t) * tw, H / 2, 4, 0, 7); c.fill();
}
// the demos run while the docs are open, 60 frames a second whatever the app's pause
function docsFrame() {
  if (!$('docs')) return;
  for (const d of docs.demos) {
    if (!d.paused) d.w.advance(1 / 60, NOIN);
    const c = d.cv.getContext('2d');
    c.fillStyle = '#f3f0e8'; c.fillRect(0, 0, d.cv.width, d.cv.height);
    d.w.render(c, { x: 0, y: 0, w: d.cv.width, h: d.cv.height });
  }
  const now = performance.now();
  for (const k of docs.curves || []) drawCurve(k, now);
  requestAnimationFrame(docsFrame);
}
// the address: #docs or #docs=topic opens the docs page, #mode=animate a mode
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.has('mode') && MODES[p.get('mode')]) setMode(p.get('mode'));
  if (p.has('docs')) openDocs(p.get('docs') || null, true);
}
