// the built-in roster: the stick plus sixteen stereotypes, each with its own signature moves bound to inputs
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load();
const json = code => JSON.parse(run(`JSON.stringify(${code})`));
const ROSTER = ['hadoo', 'grumbo', 'jabbo', 'sneeko', 'zippa', 'hicco', 'lumpo', 'sarj', 'noodo', 'gogili', 'pollo', 'gloomo', 'centaur', 'houndo', 'tako', 'clampo'];

test('the roster: the stick and sixteen fighters, each with a second stance', () => {
  assert.deepEqual(run('Object.keys(CHARS)'), ['stick', ...ROSTER]);
  for (const n of ROSTER) assert.ok(json(`CHARS.${n}.stances.length`) >= 2, n);
});

test('each fighter has at least four signature moves of its own, every one reachable from an input', () => {
  for (const n of ROSTER) {
    const r = json(`(() => { const ch = CHARS.${n}, lib = CHAR_DEFS.stick.moves, bound = new Set(ch.stances.flatMap(s => [...Object.values(s.binds), ...Object.values(s.binds25)]));
      const own = Object.keys(CHAR_DEFS.${n}.moves).filter(k => !lib[k] && ch.moves[k].keys.some(x => x.active || x.shoot || x.warp));
      const throwsTo = new Set(Object.values(ch.moves).flatMap(m => [m.throw, m.counter]).filter(Boolean)); // throws and counters start these
      return { own, unbound: own.filter(k => !bound.has(k) && !throwsTo.has(k)) }; })()`);
    assert.ok(r.own.length >= 4, `${n}: ${r.own}`);
    assert.deepEqual(r.unbound, [], `${n}: signature moves with no input`);
  }
});

test('every signature move plays through against a dummy and the fighter comes back to neutral, with no NaN', () => {
  for (const n of ROSTER) {
    const r = json(`Object.keys(CHAR_DEFS.${n}.moves).filter(k => !CHAR_DEFS.stick.moves[k] && CHARS.${n}.moves[k].keys.length > 1).map(k => {
      const air = CHARS.${n}.moves[k].air, { w } = fight({ a: [0.05, ...(air ? ['hop', 0.15] : []), '@' + k], b: 'dummy', ax: 330, bx: 380, period: 9 }, [CHARS.${n}, CHARS.stick], 240);
      return { k, ok: isFinite(w.a.x) && isFinite(w.a.y) && Object.values(w.a.body()).every(p => isFinite(p[0]) && isFinite(p[1])), free: !w.a.action && w.a.grounded }; })`);
    for (const m of r) assert.ok(m.ok && m.free, `${n}.${m.k}: ${JSON.stringify(m)}`);
  }
});

test('the projectile fighters shoot from S: ki, star, wave, fire, dark', () => {
  for (const [n, look] of [['hadoo', 'ki'], ['sneeko', 'star'], ['sarj', 'wave'], ['noodo', 'fire'], ['gloomo', 'dark']]) {
    const r = json(`(() => { const w = new World({ a: [0.1, 'special'], b: 'dummy', ax: 200, bx: 700, period: 9 }, {}, 7, [CHARS.${n}, CHARS.stick]); w.loop = false;
      let shot = null; for (let i = 0; i < 60; i++) { w.advance(1/60, NOIN); shot ||= w.shots[0]?.look; } return shot; })()`);
    assert.equal(r, look, n);
  }
});

test('rise: a ground move leaves the floor and lands (sarj flash kick, zippa bird kick)', () => {
  for (const [n, inp, move] of [['sarj', 'up+special', 'flashKick'], ['zippa', 'up+special', 'birdKick']]) {
    const r = json(`(() => { const w = new World({ a: [0.1, '${inp}'], b: 'dummy', ax: 300, bx: 700, period: 9 }, {}, 7, [CHARS.${n}, CHARS.stick]); w.loop = false;
      let top = 0, seen = false; for (let i = 0; i < 120; i++) { w.advance(1/60, NOIN); top = Math.min(top, w.a.y); seen ||= w.a.action?.m === CHARS.${n}.moves.${move}; }
      return { top, seen, landed: w.a.grounded && !w.a.action }; })()`);
    assert.ok(r.seen, `${n} ${move}`); assert.ok(r.top < -40, `${n} rises: ${r.top}`); assert.ok(r.landed, `${n} lands`);
  }
});

test('rehit: a multi-hit move hits the same foe again (zippa lightning legs, lumpo hundred slap), a plain move once', () => {
  const hits = (n, inp) => run(`fight({ a: [0.1, '${inp}'], b: 'dummy', ax: 330, bx: 372, period: 9 }, [CHARS.${n}, CHARS.stick], 90).w.hits`);
  assert.ok(hits('zippa', 'special') >= 3, 'lightning legs ' + hits('zippa', 'special'));
  assert.ok(hits('lumpo', 'special') >= 3, 'hundred slap ' + hits('lumpo', 'special'));
  assert.equal(hits('stick', 'kick'), 1);
});

test('jabbo throws punches on K too', () => {
  const r = json(`(() => { const ch = CHARS.jabbo; return ['kick', 'fwdKick', 'backKick', 'upKick', 'downKick', 'airKick', 'downFwdKick']
    .map(s => ch.moves[ch.stances[0].binds[s]].hit).filter(h => [].concat(h).some(b => /foot|shin|thigh/.test(b))); })()`);
  assert.deepEqual(r, []);
});

test('the command throws land: grumbo spinning piledriver on a half circle, pollo giant swing, lumpo belt throw, clampo bearHug/legLock', () => {
  for (const [n, inp, grab, thr, bx = 372] of [['grumbo', ['fwd', 0.03, 'down+fwd', 0.03, 'down', 0.03, 'down+back', 0.03, 'back+punch'], 'spinGrab', 'piledriver', 430],
    ['pollo', ['@swingGrab'], 'swingGrab', 'giantSwing'], ['lumpo', ['punch+guard'], 'beltGrab', 'beltThrow'],
    ['clampo', ['punch+guard'], 'bearHug', 'slam'], ['clampo', ['kick+guard'], 'legLock', 'ankleTwist']]) {
    const r = run(`(() => { const r = fight({ a: [0.1, ...${JSON.stringify(inp)}], b: 'dummy', ax: 330, bx: ${bx}, period: 9 }, [CHARS.${n}, CHARS.stick], 120); return { seen: r.seen, hits: r.w.hits }; })()`);
    assert.ok(r.seen.includes('a:' + grab) && r.seen.includes('a:' + thr), `${n}: ${r.seen.join(' ')}`);
    assert.ok(r.hits > 0, `${n} ${thr} lands`);
  }
});

test('clampo\'s bearHug/slam is a combo throw: short enough recovery to land a follow-up hit on the foe before it lands from the launch', () => {
  const r = json(`(() => { const w = new World({ a: 'human', b: 'dummy', ax: 330, bx: 372, period: 9 }, {}, 7, [CHARS.clampo, CHARS.stick]), f = w.a, o = w.b;
    let launchFrame = null, freeFrame = null, landFrame = null, followUpLanded = false, hitsAtLaunch = 0;
    for (let i = 0; i < 180; i++) {
      const press = i === 2, doFollow = freeFrame !== null && !followUpLanded && landFrame === null;
      w.advance(1/60, { ...NOIN, punch: press || doFollow, guard: press });
      if (launchFrame === null && o.kd === 'fly') { launchFrame = i; hitsAtLaunch = w.hits; }
      if (launchFrame !== null && freeFrame === null && !f.action && f.grounded) freeFrame = i;
      if (launchFrame !== null && landFrame === null && o.grounded) landFrame = i;
      if (freeFrame !== null && w.hits > hitsAtLaunch) followUpLanded = true;
    }
    return { launchFrame, freeFrame, landFrame, followUpLanded }; })()`);
  assert.ok(r.launchFrame !== null, 'slam launches the foe');
  assert.ok(r.freeFrame !== null && r.landFrame !== null && r.freeFrame < r.landFrame,
    `clampo recovers from slam (frame ${r.freeFrame}) before the foe lands (frame ${r.landFrame}): a real follow-up window`);
  assert.ok(r.followUpLanded, 'a follow-up punch lands on the still-airborne foe');
});

test('sneeko\'s substitution (← S, backSpecial): a strike caught during substituteCatch is taken no damage, warps it behind the foe and leaves a stationary decoy that vanishes shortly', () => {
  const r = json(`(() => { const w = new World({ a: 'human', b: [0.1, '@kick'], ax: 330, bx: 375, period: 9 }, {}, 7, [CHARS.sneeko, CHARS.stick]), f = w.a;
    f.start('substituteCatch'); const hp0 = f.hp, x0 = f.x;
    const seenShot = [], out = [];
    for (let i = 0; i < 60; i++) { w.advance(1/60, NOIN); seenShot.push(w.shots.length > 0); out.push(f.action?.name); }
    return { hp0, hpAfter: f.hp, x0, xAfter: f.x, substituted: out.includes('substitute'), shotAppeared: seenShot.includes(true), shotGone: !seenShot.at(-1) }; })()`);
  assert.equal(r.hpAfter, r.hp0, 'the catch takes no damage from the kick');
  assert.ok(r.substituted, 'the counter (substitute) plays');
  assert.ok(Math.abs(r.xAfter - r.x0) > 50, `warps away from where it stood: ${r.x0} -> ${r.xAfter}`);
  assert.ok(r.shotAppeared && r.shotGone, 'a stationary decoy appears, then is gone by the end (life: 0.4)');
});

test('a scenario can name its characters: flash kick plays sarj, lightning legs zippa, whatever the current character', () => {
  for (const [s, n, move] of [['flash kick', 'sarj', 'flashKick'], ['lightning legs', 'zippa', 'lightningLegs']]) {
    const r = json(`(() => { const w = new World(SCENARIOS['${s}'], {}, 7, [CHARS.stick]); w.loop = false; let seen = false;
      for (let i = 0; i < 120; i++) { w.advance(1/60, NOIN); seen ||= w.a.action?.m === CHARS.${n}.moves.${move}; }
      return { ch: w.a.ch === CHARS.${n}, foe: w.b.ch === CHARS.stick, seen, hits: w.hits }; })()`);
    assert.deepEqual(r, { ...r, ch: true, foe: true, seen: true }, s);
    assert.ok(r.hits > 0, `${s} lands`);
  }
});
