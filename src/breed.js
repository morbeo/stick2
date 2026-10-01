'use strict';
// ---------- grid experiments: 9 cells bred around a parent (cell 0, framed); click a cell to breed around it ----------
// breed: random values of chosen settings · attacks: random moves for the current character, posed with IK
const breed = { vars: new Set(['freq', 'zeta', 'hitstop']), spread: 0.15, exag: 1, seed: 1, cfg: null, atk: null };
const snap = (s, v) => +(Math.round(clamp(v, s.min, s.max) / s.step) * s.step).toFixed(4);
// distinct variations: every variable gets n evenly spaced offsets in [-1, 1] in a shuffled order, one per cell,
// so no two cells share a value and none equals the parent; past the range a value bounces back instead of sticking to the end
function levels(n, rand) {
  const a = Array.from({ length: n }, (_, i) => n > 1 ? -1 + 2 * i / (n - 1) : 0);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const bounce = (v, lo, hi) => { const r = hi - lo, t = ((v - lo) % (2 * r) + 2 * r) % (2 * r); return lo + (t > r ? 2 * r - t : t); };
const amount = () => breed.spread * breed.exag; // exaggerate (×1 ×2 ×4) scales every experiment's spread
const BREED_TIPS = {
  sweep: 'Each cell gets one value of the X (and Y) variable across its range.',
  breed: 'Cells get random values of the variables you pick, around a parent. Click the best cell to breed around it.',
  attacks: 'Nine random attacks for the current character. Click one to breed variations of it, then save it or open it in animate.',
};

// numbers move by their level (see levels) × spread × their range; options and switches change with probability 2 × spread
function mutateCfg(base, rand, lv) {
  const o = { ...base }, p = Math.min(1, amount() * 2);
  for (const k in o) {
    const s = SPEC[k];
    if (s.opts) { if (rand() < p) o[k] = s.opts[Math.floor(rand() * s.opts.length)]; }
    else if (typeof s.v === 'boolean') { if (rand() < p) o[k] = !o[k]; }
    else o[k] = snap(s, bounce(o[k] + lv(k) * amount() * (s.max - s.min), s.min, s.max));
  }
  return o;
}
const diffLabel = (o, base) => Object.keys(o).filter(k => o[k] !== base[k]).map(k => `${k}=${fmt(o[k])}`).join('  ') || 'same';
function breedCells() {
  const rand = makeRand(breed.seed * 7919), parent = Object.fromEntries([...breed.vars].map(k => [k, breed.cfg?.[k] ?? CFG[k]]));
  breed.cfg = parent;
  const lv = mapVals(parent, () => levels(8, rand));
  return Array.from({ length: 9 }, (_, i) => {
    const over = i ? mutateCfg(parent, rand, k => lv[k][i - 1]) : parent;
    return { w: newWorld(SCENARIOS[lab.scen], over, 7), over, plot: [...breed.vars][0], parent: !i, label: i ? diffLabel(over, parent) : 'parent' };
  });
}

// ---------- random attacks ----------
// limb ends that can strike, and the direction each height aims at (world degrees: 90 = forward, 180 = up)
const HEIGHTS = { high: [115, 145], mid: [80, 110], low: [40, 70] };
const strikers = ch => ch.bones.filter(b => b.role !== 'spine' && !ch.bones.some(k => k.parent === b.id)).map(b => b.id);
function genAttack(ch, rand) {
  const pick = a => a[Math.floor(rand() * a.length)], fr = (a, b) => Math.round(rand(a, b)) / 60;
  const hit = pick(strikers(ch)), chain = ikChain(ch, hit), height = pick(Object.keys(HEIGHTS));
  const spine = ch.bones.find(b => b.role === 'spine') || chain[0], st = ch.poses.stance, lean = rand(5, 30), deg = rand(...HEIGHTS[height]);
  const reach = chain.reduce((s, b) => s + b.len, 0);
  // lean the torso, then IK the limb towards a point at `ext` × its length in direction a from its root joint
  const aim = (tilt, a, ext) => {
    const pose = { ...st, [spine.id]: st[spine.id] + tilt }, pv = fk(ch, pose, 1)[chain[chain.length - 1].parent || 'hip'];
    return ik(ch, pose, hit, [pv[0] + Math.sin(a * R) * reach * ext, pv[1] + Math.cos(a * R) * reach * ext], chain);
  };
  const part = p => Object.fromEntries([spine, ...chain].map(b => [b.id, Math.round(p[b.id] * 10) / 10]));
  const ant = part(aim(lean * 0.4, deg - rand(70, 140), rand(0.4, 0.7))), strike = part(aim(-lean, deg, 1.05));
  return { power: +rand(0.8, 1.8).toFixed(1), hit, height, knock: Math.round(rand(10, 40)) * 10, stun: +rand(0.3, 0.5).toFixed(2),
    ...(height !== 'low' && rand() < 0.3 ? { launch: 300, kd: true } : {}),
    keys: [
      { d: fr(4, 10), e: pick(['outQuad', 'inOutCubic', 'outCubic']), p: ant },
      { d: fr(2, 5), e: pick(['outExpo', 'outCubic', 'outBack']), p: strike, active: true, lunge: rand() < 0.5 ? Math.round(rand(50, 250)) : 0 },
      { d: fr(3, 8), p: { ...strike }, active: true },
      { d: fr(9, 18), e: 'inOutCubic', p: null },
    ] };
}
// jitter every key's angles and length, and the hit properties; a held pose stays equal to the strike before it
// lv(name): this cell's level (see levels) for key lengths, power and knock, so cells differ clearly in timing and force
function mutateAttack(m, ch, rand, lv) {
  const d = clone(m), s = amount();
  d.keys.forEach((k, i) => {
    k.d = Math.max(1, Math.round(k.d * 60 + lv('d' + i) * s * 20)) / 60;
    if (i && JSON.stringify(m.keys[i].p) === JSON.stringify(m.keys[i - 1].p)) k.p = d.keys[i - 1].p && { ...d.keys[i - 1].p };
    else if (k.p) for (const id in k.p) k.p[id] = Math.round(limit(ch.by[id], k.p[id] + rand(-1, 1) * s * 90) * 10) / 10;
  });
  d.power = +bounce(d.power + lv('power') * s * 2, 0.2, 3).toFixed(1);
  d.knock = Math.round(bounce(d.knock + lv('knock') * s * 600, 0, 600) / 10) * 10;
  return d;
}
function attackCells() {
  const rand = makeRand(breed.seed * 7919), ch = currentChar(), parent = breed.atk, lv = {};
  return Array.from({ length: 9 }, (_, i) => {
    const m = !parent ? genAttack(ch, rand) : i ? mutateAttack(parent, ch, rand, k => (lv[k] ??= levels(8, rand))[i - 1]) : parent;
    // the attack is added as move 'gen' to a copy of the character; it hits an unchanged dummy
    const gch = makeCharacter({ ...DEFS[CURRENT], moves: { ...DEFS[CURRENT].moves, gen: m } });
    return { w: newWorld(galleryScen('gen'), {}, 7, [gch, ch]), move: 'gen', gen: m, parent: !!parent && !i,
      label: parent && !i ? 'parent' : `${m.hit} ${m.height}` };
  });
}
function saveAttack(open) {
  let n = 1;
  while (DEFS[CURRENT].moves['gen' + n]) n++;
  edit(def => { def.moves['gen' + n] = clone(lab.focus.gen); });
  if (open) { anim.move = 'gen' + n; anim.key = 1; setMode('animate'); }
}

// click a cell: it becomes the parent, the others are new variations of it
function breedFrom(c) {
  if (lab.kind === 'breed') breed.cfg = c.over; else breed.atk = c.gen;
  breed.seed++; build();
}

// ---------- context bar parts ----------
function varsButton() {
  const b = button('', 'Which settings the cells vary', (e, b) => popup(b, ...SCHEMA.flatMap(s => Array.isArray(s)
    ? [h('h4', { textContent: s[0] })]
    : s.k === 'scope' ? [] : [toggle(s.k, s.tip, () => breed.vars.has(s.k), on => { breed.vars[on ? 'add' : 'delete'](s.k); build(); })])));
  reg(b, () => { setRich(b, `vary: ${[...breed.vars].join(' ') || 'nothing'}`); });
  return b;
}
function spreadButton() {
  const b = button('', 'How far the variations stray from the parent', (e, b) => popup(b,
    slider('spread', { min: 0.02, max: 0.5, step: 0.01 }, () => breed.spread, v => { breed.spread = v; },
      'Fraction of each variable\'s range (angles: × 90°, frames: × 20). Applied on the next breed or reroll.')));
  reg(b, () => { setRich(b, `spread ${fmt(breed.spread)}`); });
  return b;
}
// exaggerate: multiplies the spread of every grid experiment (settings, attacks, bodies) so the differences stand out
const exagSeg = rebuild => seg([1, 2, 4], () => breed.exag, v => { breed.exag = v; rebuild(); },
  { 1: 'Variations as far as the spread says', 2: 'Exaggerate: twice the spread', 4: 'Exaggerate: four times the spread, for clearly different cells' }, v => `×${v}`);
function breedCtx() {
  const reroll = button(':casino: reroll', 'New random cells around the same parent (attacks without a parent: nine new attacks)', () => { breed.seed++; build(); });
  if (lab.kind === 'breed') return [varsButton(), spreadButton(), exagSeg(build), reroll,
    button(':check: use parent', 'Copy the parent\'s values into the settings (side panel)', () => setCfg(breed.cfg)),
    button(':restart_alt: restart', 'Start again from the current settings', () => { breed.cfg = null; build(); })];
  const noFocus = el => { reg(el, () => { el.disabled = !lab.focus?.gen; }); return el; };
  return [spreadButton(), exagSeg(build), reroll,
    button(':casino: new', 'Throw the parent away: nine new random attacks', () => { breed.atk = null; breed.seed++; build(); }),
    noFocus(button(':save: save move', 'Add the parent (or the focused cell) to the character\'s moves as genN', () => saveAttack(false))),
    noFocus(button(':animation: edit in animate', 'Save it and open it in the animation editor', () => saveAttack(true)))];
}
