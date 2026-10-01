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
  get done() { return this.i >= this.items.length && !this.hold && this.wait <= 0; }
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

// replays a recorded tape (see World.step), one entry per substep, looping; like scripts, it waits out hit stop
class Replay {
  constructor(tape) { Object.assign(this, { tape, i: 0 }); }
  input(f) {
    if (f.freeze > 0 || !this.tape.length) return { ...NOIN };
    const e = this.tape[this.i], d = f.dir > 0;
    this.i = (this.i + 1) % this.tape.length;
    return { left: d ? e.back : e.fwd, right: d ? e.fwd : e.back, down: e.down, jump: e.jump, punch: e.punch, kick: e.kick };
  }
}

// engine AI: re-thinks every reaction-time interval, walks to range and throws random chains
const CHAINS = [['punch'], ['punch', 'punch'], ['punch', 'punch', 'punch'], ['kick'], ['kick', 'kick'],
  ['punch', 'kick'], ['punch', 'punch', 'kick'], ['down+kick'],
  ['punch', 'down', 'down+fwd', 'fwd+punch'], ['punch', 'kick', 'down', 'down+back', 'back+kick']]; // specials cancel the chain
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
    if (o.kd === 'down' && dist < 110 && r < 0.4) { this.q = ['down', 'down+fwd', 'fwd+kick']; this.qt = 0; return; } // stomp
    if (o.kd === 'down' || o.action?.m.inv) { if (dist < 90) this.plan = 'out'; return; }
    if (!o.grounded && !o.kd && dist < 110 && r < 0.5) { this.q = ['fwd', 'down', 'down+fwd+punch']; this.qt = 0; return; } // anti-air rising
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
  if (spec?.tape) return new Replay(spec.tape);
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
  // cancels and specials (motions: 2 = down, 3 = down-forward, 6 = forward …)
  'J→rush': { a: ['punch', 0.1, 'down', 'down+fwd', 'fwd+punch'], b: 'dummy', period: 2.6 },
  'J,K→spin': { a: ['punch', 0.13, 'kick', 0.1, 'down', 'down+back', 'back+kick'], b: 'dummy', period: 2.8 },
  'rising': { a: ['fwd', 'down', 'down+fwd+punch'], b: 'dummy', period: 2.4 },
  'air combo': { a: ['punch', 0.13, 'punch', 0.13, 'punch', 0.3, 'fwd+jump', { hold: 'fwd', t: 0.1 }, 'punch', 0.14, 'kick'], b: 'dummy', period: 3.2 },
  'OTG stomp': { a: ['down+kick', 0.6, { hold: 'fwd', t: 0.25 }, 'down', 'down+fwd', 'fwd+kick'], b: 'dummy', period: 3 },
  // several opponents: extra fighters are { c: controller, x, team }; same team = allies
  'you vs 2 ai': { a: 'human', b: 'ai', bx: 520, more: [{ c: 'ai', x: 640, team: 1 }] },
  'you vs 3 dummies': { a: 'human', b: 'dummy', bx: 420, more: [{ c: 'dummy', x: 520, team: 1 }, { c: 'dummy', x: 160, team: 1 }] },
  'ai 2v2': { a: 'ai', b: 'ai', more: [{ c: 'ai', x: 200, team: 0 }, { c: 'ai', x: 600, team: 1 }] },
  'ai free-for-all': { a: 'ai', b: 'ai', more: [{ c: 'ai', x: 150, team: 2 }, { c: 'ai', x: 650, team: 3 }] },
  'sandwich': { a: ['punch', 0.13, 'punch', 0.13, 'kick', 0.7, 'punch', 0.13, 'punch', 0.13, 'kick'], b: 'dummy', bx: 372, more: [{ c: 'dummy', x: 285, team: 1 }], period: 3.4 },
  'showcase': { a: ['!punch', 0.13, 'punch', 0.13, 'kick', 0.9, '!down+kick', 1.1, 'jump', 0.12, 'kick', 0.8, { hold: 'back', t: 0.5 }], b: 'dummy', ax: 250, bx: 420, period: 5.5 },
  'walk': { a: [{ hold: 'fwd', t: 0.8 }, 0.3, { hold: 'back', t: 0.8 }], b: 'dummy', ax: 250, bx: 550, period: 2.4 },
  'jump': { a: ['jump', 0.7, 'fwd+jump', 0.1, { hold: 'fwd', t: 0.5 }], b: 'dummy', ax: 250, bx: 550, period: 2 },
};

// gallery: one looping cell per attack, forced with '@' so no input logic gets in the way
const GALLERY = ['jab', 'cross', 'uppercut', 'kick', 'roundhouse', 'sweep', 'dashPunch', 'airKick', 'airPunch', 'rush', 'rising', 'spin', 'stomp'];
const galleryScen = (m, air = m.startsWith('air')) => ({
  a: air ? ['jump', m === 'airPunch' ? 0.4 : 0.15, '@' + m] : [0.1, '@' + m], b: 'dummy',
  ax: 330, bx: m === 'dashPunch' ? 430 : 375, period: 2.4,
});
