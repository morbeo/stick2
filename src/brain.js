'use strict';
// ---------- controllers: who presses the buttons for a fighter ----------
// 'human' = keyboard, null = dummy, Brain = engine AI, Script = scripted test.

// press 'punch', 'down+kick', 'fwd+punch' ... (fwd/back are relative to the opponent)
function press(inp, s, f, o) {
  const fwd = o.x > f.x ? 'right' : 'left', back = fwd === 'right' ? 'left' : 'right';
  for (const b of s.split('+')) inp[b === 'fwd' ? fwd : b === 'back' ? back : b] = true;
}
const idle = f => !f.action && f.free && f.grounded && f.squatT <= 0;

// items: 'punch' / 'down+kick' = press now · 0.2 = wait · { hold: 'fwd' | 'back', t } = hold a direction
// '!punch' = walk in and press once idle · '@uppercut' = force a move (for the gallery)
class Script {
  constructor(items) { Object.assign(this, { items, i: 0, wait: 0, hold: null }); }
  input(f, o, h) {
    const inp = { ...NOIN };
    if (f.freeze > 0) return inp; // the script's clock stops during hit stop, so timings hold at any hitstop
    if (this.hold) { press(inp, this.hold.k, f, o); if ((this.hold.t -= h) <= 0) this.hold = null; return inp; }
    if ((this.wait -= h) > 0) return inp;
    let it = this.items[this.i];
    if (it === undefined) return inp;
    if (typeof it === 'number') this.wait = it;
    else if (it.hold) this.hold = { k: it.hold, t: it.t };
    else if (it[0] === '@') f.start(it.slice(1));
    else {
      if (it[0] === '!') {
        if (Math.abs(o.x - f.x) > 62) { press(inp, 'fwd', f, o); return inp; }
        if (!idle(f)) return inp;
        it = it.slice(1);
      }
      press(inp, it, f, o);
    }
    this.i++;
    return inp;
  }
}

// engine AI: re-thinks every reaction-time interval, walks to range and throws random chains
const CHAINS = [['punch'], ['punch', 'punch'], ['punch', 'punch', 'punch'], ['kick'], ['kick', 'kick'],
  ['punch', 'kick'], ['punch', 'punch', 'kick'], ['down+kick']];
class Brain {
  constructor(rand) { Object.assign(this, { rand, t: 0, plan: null, q: [], qt: 0 }); }
  input(f, o, h) {
    const inp = { ...NOIN }, dist = Math.abs(o.x - f.x);
    if (!f.free) this.q = [];
    if (this.q.length) {
      if ((this.qt -= h) <= 0) { press(inp, this.q.shift(), f, o); this.qt = this.rand(0.1, 0.16); }
      return inp;
    }
    if ((this.t -= h) <= 0) this.think(f, o, dist);
    if (this.plan === 'in') press(inp, 'fwd', f, o);
    else if (this.plan === 'out') press(inp, 'back', f, o);
    else if (this.plan === 'dash') { press(inp, 'fwd', f, o); if (dist < 120) { inp.punch = true; this.plan = null; } }
    return inp;
  }
  think(f, o, dist) {
    const r = this.rand();
    this.t = this.rand(0.12, 0.3); // reaction time
    this.plan = null;
    if (!f.free) return;
    if (o.kd === 'down' || o.action?.m.inv) { if (dist < 90) this.plan = 'out'; return; }
    if (o.kd === 'fly' && dist < 130 && r < 0.6) { this.q = ['jump', 'kick']; this.qt = 0; return; }
    if (dist > 150) { this.plan = r < 0.25 ? 'dash' : 'in'; return; }
    if (dist > 70) { this.plan = r < 0.85 ? 'in' : 'out'; return; }
    if (r < 0.12) { this.plan = 'out'; return; }
    if (r < 0.2) return; // hesitate
    this.q = CHAINS[Math.floor(this.rand() * CHAINS.length)].slice(); this.qt = 0;
  }
}

function makeCtl(spec, world) {
  if (spec === 'human') return 'human';
  if (spec === 'ai') return new Brain(world.rand);
  if (Array.isArray(spec)) return new Script(spec);
  return null;
}

// a/b = controller specs, ax/bx = start x, period = seconds before the scenario restarts
const SCENARIOS = {
  'you vs dummy': { a: 'human', b: 'dummy' },
  'you vs ai': { a: 'human', b: 'ai' },
  'ai vs ai': { a: 'ai', b: 'ai' },
  'ai vs dummy': { a: 'ai', b: 'dummy' },
  'jab spam': { a: Array(12).fill('!punch'), b: 'dummy', period: 4.5 },
  'J,J,J': { a: ['punch', 0.13, 'punch', 0.13, 'punch'], b: 'dummy', period: 2.6 },
  'K,K': { a: ['kick', 0.2, 'kick'], b: 'dummy', period: 2.6 },
  'J,J,K': { a: ['punch', 0.13, 'punch', 0.13, 'kick'], b: 'dummy', period: 2.6 },
  'J,K,K': { a: ['punch', 0.13, 'kick', 0.2, 'kick'], b: 'dummy', period: 2.6 },
  'juggle': { a: ['punch', 0.13, 'punch', 0.13, 'punch', 0.35, 'fwd+jump', { hold: 'fwd', t: 0.1 }, 'kick'], b: 'dummy', period: 3.2 },
  'sweep': { a: ['down+kick'], b: 'dummy', period: 2.4 },
  'dash punch': { a: [{ hold: 'fwd', t: 0.35 }, 'fwd+punch'], b: 'dummy', ax: 250, bx: 450, period: 2.4 },
  'air kick': { a: ['jump', 0.12, 'kick'], b: 'dummy', period: 1.6 },
  'walk': { a: [{ hold: 'fwd', t: 0.8 }, 0.3, { hold: 'back', t: 0.8 }], b: 'dummy', ax: 250, bx: 550, period: 2.4 },
  'jump': { a: ['jump', 0.7, 'fwd+jump', 0.1, { hold: 'fwd', t: 0.5 }], b: 'dummy', ax: 250, bx: 550, period: 2 },
};

// gallery: one looping cell per attack, forced with '@' so no input logic gets in the way
const GALLERY = ['jab', 'cross', 'uppercut', 'kick', 'roundhouse', 'sweep', 'dashPunch', 'airKick', 'airPunch'];
const galleryScen = m => ({
  a: m.startsWith('air') ? ['jump', m === 'airPunch' ? 0.4 : 0.15, '@' + m] : [0.1, '@' + m], b: 'dummy',
  ax: 330, bx: m === 'dashPunch' ? 430 : 375, period: 2.4,
});
