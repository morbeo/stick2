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
    else if (it[0] === '@') f.force(it.slice(1));
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
    return { left: d ? e.back : e.fwd, right: d ? e.fwd : e.back, up: !!e.up, down: e.down, hop: !!e.hop, punch: e.punch, kick: e.kick, special: !!e.special, guard: !!e.guard, punchHeld: !!e.punchHeld };
  }
}

// engine AI: re-thinks every reaction-time interval, walks to range and throws random chains
const CHAINS = [['punch'], ['punch', 'punch'], ['punch', 'punch', 'punch'], ['kick'], ['kick', 'kick'],
  ['punch', 'kick'], ['punch', 'punch', 'kick'], ['down+kick'], ['fwd+punch', 'kick'], ['fwd+kick'], ['down+fwd+kick'], ['down+punch'], ['up+kick'],
  ['punch', 'down', 'down+fwd', 'fwd+punch'], ['punch', 'kick', 'down', 'down+back', 'back+kick'], ['punch', 'punch', 'fwd+special'], ['kick', 'special'],
  ['down+back+punch', 'down+fwd+punch'], ['back+kick'], ['down+back+kick']]; // specials cancel the chain
// difficulty (aiLevel setting): think = seconds between decisions, react = seconds before reacting to a throw, then the chance to
// guard a startup, break a throw, tech a landing, anti-air a jump and juggle a launched foe; break and tech are rolled once per event
const AI_LEVELS = {
  easy: { think: [0.3, 0.5], react: 0.18, guard: 0.15, brk: 0.1, tech: 0.1, antiAir: 0.2, juggle: 0.25 },
  normal: { think: [0.12, 0.3], react: 0.12, guard: 0.4, brk: 0.35, tech: 0.35, antiAir: 0.5, juggle: 0.6 },
  hard: { think: [0.08, 0.2], react: 0.08, guard: 0.6, brk: 0.6, tech: 0.6, antiAir: 0.7, juggle: 0.75 },
  expert: { think: [0.05, 0.12], react: 0.05, guard: 0.8, brk: 0.85, tech: 0.85, antiAir: 0.85, juggle: 0.9 },
};
// the presses that make each scheme input (SPECIAL_SCHEMES), queued one after another
const SCHEME_INPUTS = { G6: ['guard+fwd'], G4: ['guard+back'], dd: ['down', 'down+special'], qcf: ['down', 'down+fwd', 'fwd+special'],
  qcb: ['down', 'down+back', 'back+special'], dp: ['fwd', 'down', 'down+fwd+special'], bP: ['punch'], bK: ['kick'], b6S: ['fwd+special'], b4S: ['back+special'],
  '7S': ['up+back+special'], '1S': ['down+back+special'] };
class Brain {
  constructor(rand) { Object.assign(this, { rand, t: 0, plan: null, q: [], qt: 0, held: null, brk: false, flying: false, tech: false, lying: false, wake: null, blocking: false, out: null, outT: 0 }); }
  input(f, o, h) {
    const inp = { ...NOIN }, dist = Math.abs(o.x - f.x) - (f.ch.extent[1] + o.ch.extent[1] - 38); // the gap as between two sticks (a centaur's body is long)
    const L = AI_LEVELS[f.c('aiLevel')] || AI_LEVELS.normal;
    if (!f.free) this.q = [];
    // a throw: decide once whether to break it, then press P+G after the reaction time
    if (f.heldBy !== this.held) { this.held = f.heldBy; this.brk = !!f.heldBy && this.rand() < L.brk; }
    if (f.heldBy) { if (this.brk && f.c('techWindow') - f.heldT >= L.react) inp.punch = inp.guard = true; return inp; }
    // a knockdown flight: decide once whether to tech the landing (G just before touching down)
    if ((f.kd === 'fly') !== this.flying) { this.flying = f.kd === 'fly'; this.tech = this.flying && this.rand() < L.tech; }
    if (f.kd === 'fly') { inp.guard = this.tech && f.vy > 0 && f.y > -30; return inp; }
    // lying (wakeUp setting): decide once how to get up, as often as it techs: attack a foe close by, roll, or stay down a while
    if ((f.kd === 'down') !== this.lying) {
      this.lying = f.kd === 'down'; this.wake = null;
      if (this.lying && f.c('wakeUp') && this.rand() < L.tech) { const r = this.rand(); this.wake = dist < 120 && r < 0.4 ? 'kick' : r < 0.7 ? 'back' : r < 0.85 ? 'fwd' : 'guard'; }
    }
    if (f.kd === 'down') { if (this.wake) press(inp, this.wake, f, o); return inp; }
    // blockstun: decide once whether to get out (guard cancel or push block), then press after the reaction time
    if ((f.blockT > 0) !== this.blocking) {
      this.blocking = f.blockT > 0; this.out = null; this.outT = 0;
      if (this.blocking && this.rand() < L.brk * 0.3) { const s = SPECIAL_SCHEMES[f.c('specialScheme')] || {}, n = this.rand() < 0.5 ? 'guardCancel' : 'pushBlock'; if (f.special(s[n]) === n) this.out = s[n]; }
    }
    if (this.out && (this.outT += h) >= L.react) { press(inp, SCHEME_INPUTS[this.out][0], f, o); this.out = null; return inp; }
    if (this.q.length) {
      if ((this.qt -= h) <= 0) { press(inp, this.q.shift(), f, o); this.qt = this.rand(0.1, 0.16); }
      return inp;
    }
    if ((this.t -= h) <= 0) this.think(f, o, dist);
    if (this.plan === 'in') press(inp, 'fwd', f, o);
    else if (this.plan === 'out') press(inp, 'back', f, o);
    else if (this.plan === 'zin' || this.plan === 'zout') press(inp, (this.plan === 'zin' ? 'up' : 'down') + (dist > 70 ? '+fwd' : ''), f, o);
    else if (this.plan === 'guard' || this.plan === 'guardLow') press(inp, this.plan === 'guard' ? 'guard' : 'down+guard', f, o);
    else if (this.plan === 'item') inp[this.item.x > f.x ? 'right' : 'left'] = true;
    else if (this.plan === 'charge') inp.guard = inp.punchHeld = true;
    else if (this.plan === 'dash') { press(inp, 'fwd', f, o); if (dist < 120) { inp.punch = true; this.plan = null; } }
    return inp;
  }
  // queue a special of the scheme in use, if it is switched on and the fighter has its move
  special(f, n) {
    const t = SPECIAL_SCHEMES[f.c('specialScheme')]?.[n];
    if (!t || f.special(t) !== n) return false;
    this.q = SCHEME_INPUTS[t].slice(); this.qt = 0; return true;
  }
  think(f, o, dist) {
    const r = this.rand(), L = AI_LEVELS[f.c('aiLevel')] || AI_LEVELS.normal;
    this.t = this.rand(...L.think); // reaction time
    this.plan = null;
    if (!f.free) return;
    // 2.5D: line up in depth first (belt: walk, lanes: sidestep), and sometimes sidestep an attack coming in
    const plane = f.c('plane'), dz = o.z - f.z;
    if (plane !== '2d' && !o.kd && idle(f) && Math.abs(dz) > f.c('zReach') * 0.7) {
      if (plane === 'belt') this.plan = dz < 0 ? 'zin' : 'zout';
      else { this.q = dz < 0 ? ['up', 'up'] : ['down', 'down']; this.qt = 0; }
      return;
    }
    if (plane === 'lanes' && idle(f) && dist < 110 && r < (o.action?.m.power ? 0.5 : 0.12)) { this.q = r < 0.2 || f.z > 0 ? ['up', 'up'] : ['down', 'down']; this.qt = 0; return; }
    // an attack starting up in front: guard it (low against lows); a fresh guard press that lands just in time parries
    if (frameState(o) === 'startup' && dist < 130 && (o.x - f.x) * f.dir > 0 && r < L.guard) {
      if (this.rand() < 0.25 && this.special(f, 'rollFwd')) return; // or roll through it
      const ht = o.action.m.height || 'mid'; // or catch it with the counter for its height
      if (this.rand() < L.brk * 0.2 && this.special(f, ht === 'low' ? 'catchLow' : ht.endsWith('high') ? 'catchHigh' : '')) return;
      this.plan = o.action.m.height === 'low' ? 'guardLow' : 'guard'; this.t = 0.3; return; }
    if (plane === 'belt' && dist > 150 && r < 0.2) { this.plan = f.z > 0 ? 'zin' : 'zout'; return; } // circle around on the belt
    if (o.kd === 'down' && dist < 140 && r < 0.15 && f.c('pounce') && f.ch.moves.pounce) { this.q = ['fwd+hop', 'down+special']; this.qt = 0; return; } // pounce
    if (o.kd === 'down' && dist < 110 && r < 0.4) { this.q = ['down', 'down+fwd', 'fwd+kick']; this.qt = 0; return; } // stomp
    if (o.kd === 'down' && dist > 150 && r < 0.3 && f.c('taunt')) { this.q = ['up+guard+special']; this.qt = 0; return; } // taunt a foe lying far off
    if (o.kd === 'down' || o.action?.m.inv) { if (dist < 90) this.plan = 'out'; return; }
    // weapons: go and pick up one lying near (P+G over it); armed, sometimes throw it from range
    const it = !f.ch.weapon && f.w.items.length ? f.w.items.filter(i => i.rest && !i.taker && Math.abs(i.x - f.x) < 260).sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x))[0] : null;
    if (it && dist > 60 && r < 0.8) { if (f.w.itemNear(f) === it) { this.q = ['punch+guard']; this.qt = 0; } else { this.plan = 'item'; this.item = it; } return; }
    if (f.ch.weapon && dist > 200 && dist < 450 && r < 0.06) { this.q = ['punch+guard']; this.qt = 0; this.plan = 'charge'; this.t = this.rand(0, 0.8); return; } // held a while: a harder throw
    if (!o.grounded && !o.kd && dist < 110 && r < L.antiAir) { this.q = ['fwd', 'down', 'down+fwd+punch']; this.qt = 0; return; } // anti-air rising
    if (o.kd === 'fly' && dist < 130 && r < L.juggle) { this.q = ['hop', 'kick']; this.qt = 0; return; }
    if (dist > 200 && r < 0.05 && this.special(f, 'teleport')) return; // appear behind
    if (dist > 220 && f.c('dash') && r < 0.3) { this.q = ['fwd', 'fwd']; this.qt = 0; this.plan = 'in'; return; } // dash, then run in
    if (dist > 150) { this.plan = r < 0.25 ? 'dash' : 'in'; return; }
    if (dist > 70) { this.plan = r < 0.85 ? 'in' : 'out'; return; }
    if (r < 0.03 && this.special(f, 'rollBack')) return;
    if (r < 0.12) { this.plan = 'out'; return; }
    if (r < 0.2) return; // hesitate
    if (o.guarding && r < 0.5) { this.q = [o.crouching ? 'up+punch' : dist < 60 && r < 0.3 ? 'punch+guard' : 'down+fwd+kick']; this.qt = 0; return; } // overhead vs a low guard; throw or low vs a standing one
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
  'juggle': { a: ['punch', 0.13, 'punch', 0.13, 'punch', 0.35, 'fwd+hop', { hold: 'fwd', t: 0.1 }, 'kick'], b: 'dummy', period: 3.2 },
  'sweep': { a: ['down+kick'], b: 'dummy', period: 2.4 },
  'dash punch': { a: [{ hold: 'fwd', t: 0.35 }, 'fwd+punch'], b: 'dummy', ax: 250, bx: 450, period: 2.4 },
  'air kick': { a: ['hop', 0.12, 'kick'], b: 'dummy', period: 1.6 },
  // cancels and specials (motions: 2 = down, 3 = down-forward, 6 = forward …)
  'J→rush': { a: ['punch', 0.1, 'down', 'down+fwd', 'fwd+punch'], b: 'dummy', period: 2.6 },
  'J,K→spin': { a: ['punch', 0.13, 'kick', 0.1, 'down', 'down+back', 'back+kick'], b: 'dummy', period: 2.8 },
  'rising': { a: ['fwd', 'down', 'down+fwd+punch'], b: 'dummy', period: 2.4 },
  'air combo': { a: ['punch', 0.13, 'punch', 0.13, 'punch', 0.3, 'fwd+hop', { hold: 'fwd', t: 0.1 }, 'punch', 0.14, 'kick'], b: 'dummy', period: 3.2 },
  // 2.5D (the plane comes with the scenario; a grid's plane axis overrides it)
  'sidestep': { a: [0.3, 'punch', 0.5, 'punch'], b: ['up', 0.05, 'up'], cfg: { plane: 'lanes' }, period: 2 },
  'ninja flip': { a: ['fwd+hop', { hold: 'fwd', t: 0.6 }, 0.3, 'back+hop', { hold: 'back', t: 0.6 }], ax: 220, b: 'dummy', cfg: { plane: 'belt' }, period: 2.6 },
  'dash & run': { a: ['fwd', 0.05, 'fwd', { hold: 'fwd', t: 0.45 }, 'fwd+punch'], ax: 120, b: 'dummy', bx: 440, period: 2.4 },
  'belt ai': { a: 'ai', b: 'ai', cfg: { plane: 'belt' } },
  'lanes ai': { a: 'ai', b: 'ai', cfg: { plane: 'lanes' } },
  // guard (G) and parry: the dummy guards standing, crouching, or taps guard just before the kick lands
  'vs guard': { a: [0.3, '!punch', 0.5, '!kick', 0.6, '!down+kick'], b: [{ hold: 'guard', t: 3 }], period: 2.6 },
  'vs low guard': { a: ['!punch', 0.5, '!kick', 0.6, '!down+kick'], b: [{ hold: 'down+guard', t: 3 }], period: 2.6 },
  'parry': { a: [0.2, 'kick', 0.4, 'punch'], b: [0.25, 'guard'], period: 2 },
  'specials (S)': { a: ['!special', 1, '!fwd+special', 1, '!up+special'], b: 'dummy', period: 4.4 },
  // throws (P+G), breaking one, the catch counters (↖ S high, ← S mid, ↙ S low), techs and air recovery (G while falling)
  'throw': { a: [0.2, 'punch+guard'], b: [{ hold: 'guard', t: 2 }], ax: 330, bx: 372, period: 2.4 },
  'throw break': { a: [0.2, 'punch+guard'], b: [0.38, 'punch+guard'], ax: 330, bx: 372, period: 2.4 },
  'catch': { a: [0.3, 'kick'], b: [0.15, 'back+special'], period: 2.4 },
  'high counter': { a: [0.3, 'punch'], b: [0.15, 'up+back+special'], period: 2.4 },
  'low counter': { a: [0.3, 'down+kick'], b: [0.15, 'down+back+special'], period: 2.4 },
  'tech': { a: ['down+kick'], b: [0.3, 'guard'], period: 2.4 },
  'air recover': { a: [0.1, '@roundhouse'], b: [0.58, 'guard'], period: 2.4 },
  // specials (Specials settings): rolls through a kick or away, teleport behind
  'roll through': { a: [0.1, { hold: 'guard+fwd', t: 0.1 }], b: [0.12, 'kick'], ax: 300, bx: 380, period: 2 },
  'roll back': { a: [0.2, { hold: 'guard+back', t: 0.1 }], b: 'dummy', ax: 330, bx: 400, period: 2 },
  'teleport': { a: [0.2, 'down', 0.05, 'down+special'], b: 'dummy', period: 2 },
  'guard cancel': { a: [0.2, 'kick'], b: [{ hold: 'guard', t: 0.4 }, 'punch'], period: 2 },
  'push block': { a: [0.2, 'kick'], b: [{ hold: 'guard', t: 0.4 }, 'kick'], period: 2 },
  'just guard': { a: [0.2, 'kick'], b: [0.19, { hold: 'guard', t: 0.6 }], period: 2 },
  'wake-up attack': { a: ['down+kick'], b: [1, 'kick'], period: 2.6 },
  'wake-up roll': { a: ['down+kick'], b: [1, 'back'], period: 2.6 },
  'taunt': { a: [0.2, 'up+guard+special'], b: 'dummy', period: 1.6 },
  'win pose': { a: [0.2, 'kick'], b: 'dummy', cfg: { health: 5 } },
  'pounce': { a: ['down+kick', 0.6, { hold: 'fwd', t: 0.35 }, 'hop', 0.1, 'down+special'], b: 'dummy', period: 3 },
  'wall bounce': { a: [0.2, 'special', 0.5, 'hop', 0.05, 'kick'], b: 'dummy', ax: 560, bx: 640, period: 2.4 },
  'OTG stomp': { a: ['down+kick', 0.6, { hold: 'fwd', t: 0.25 }, 'down', 'down+fwd', 'fwd+kick'], b: 'dummy', period: 3 },
  // several opponents: extra fighters are { c: controller, x, team }; same team = allies
  'you vs 2 ai': { a: 'human', b: 'ai', bx: 520, more: [{ c: 'ai', x: 640, team: 1 }] },
  'you vs 3 dummies': { a: 'human', b: 'dummy', bx: 420, more: [{ c: 'dummy', x: 520, team: 1 }, { c: 'dummy', x: 160, team: 1 }] },
  'ai 2v2': { a: 'ai', b: 'ai', more: [{ c: 'ai', x: 200, team: 0 }, { c: 'ai', x: 600, team: 1 }] },
  'ai free-for-all': { a: 'ai', b: 'ai', more: [{ c: 'ai', x: 150, team: 2 }, { c: 'ai', x: 650, team: 3 }] },
  // endless waves (Waves settings): enemies keep coming, wave after wave
  'endless waves': { a: 'human', b: 'ai', waves: true },
  'ai vs waves': { a: 'ai', b: 'ai', waves: true },
  'sandwich': { a: ['punch', 0.13, 'punch', 0.13, 'kick', 0.7, 'punch', 0.13, 'punch', 0.13, 'kick'], b: 'dummy', bx: 372, more: [{ c: 'dummy', x: 285, team: 1 }], period: 3.4 },
  'showcase': { a: ['!punch', 0.13, 'punch', 0.13, 'kick', 0.9, '!down+kick', 1.1, 'hop', 0.12, 'kick', 0.8, { hold: 'back', t: 0.5 }], b: 'dummy', ax: 250, bx: 420, period: 5.5 },
  // weapons (see WEAPONS): P+G picks one up and throws it; aw / bw = starts held, items = lying on the floor
  'pick up & slash': { a: [{ hold: 'fwd', t: 0.25 }, 0.1, 'punch+guard', 0.4, '!punch', 0.6, '!fwd+punch', 0.9, '!down+punch'], b: 'dummy', ax: 290, bx: 420, items: [{ type: 'sword', x: 335 }], period: 5 },
  'weapon throw': { a: [0.3, 'punch+guard'], aw: 'dagger', b: 'dummy', ax: 250, bx: 480, period: 2.4 },
  'disarm': { a: [0.2, '@launcher'], b: 'dummy', bw: 'sword', period: 2.6 },
  'weapon clash': { a: [0.3, 'punch'], b: [0.3, 'punch'], aw: 'sword', bw: 'sword', ax: 300, bx: 400, period: 2 },
  'deflect': { a: [0.3, 'punch+guard'], aw: 'dagger', b: [0.45, 'punch'], bw: 'sword', ax: 250, bx: 450, period: 2.4 },
  'sword vs staff ai': { a: 'ai', b: 'ai', aw: 'sword', bw: 'staff' },
  'weapons ai': { a: 'ai', b: 'ai', items: [{ type: 'axe', x: 330 }, { type: 'nunchucks', x: 470 }] },
  'walk': { a: [{ hold: 'fwd', t: 0.8 }, 0.3, { hold: 'back', t: 0.8 }], b: 'dummy', ax: 250, bx: 550, period: 2.4 },
  'jump': { a: ['hop', 0.7, 'fwd+hop', 0.1, { hold: 'fwd', t: 0.5 }], b: 'dummy', ax: 250, bx: 550, period: 2 },
};

// gallery: one looping cell per attack, forced with '@' so no input logic gets in the way
const GALLERY = ['jab', 'cross', 'uppercut', 'kick', 'roundhouse', 'sweep', 'dashPunch', 'airKick', 'airPunch', 'rush', 'rising', 'spin', 'stomp'];
const galleryScen = (m, air = m.startsWith('air')) => ({
  a: air ? ['hop', m === 'airPunch' ? 0.4 : 0.15, '@' + m] : [0.1, '@' + m], b: 'dummy',
  ax: 330, bx: m === 'dashPunch' ? 430 : 375, period: 2.4,
});
