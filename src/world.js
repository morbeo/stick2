'use strict';
// ---------- world: one self-contained fight (the grid runs nine of them side by side) ----------
const W = 800, H = 450, GROUND = 360, CEIL = 8; // CEIL: the top of the screen (ceiling setting)
const INK = ['#222', '#8a8580'], RED = ['#c0392b', '#e0998f'];
const COLS = [INK, RED, ['#2c6fb0', '#94b7d8'], ['#2e8b57', '#97c5ab'], ['#8e44ad', '#c6a2d6'], ['#b9770e', '#e0c08a']];
// punch = pressed this frame, punchHeld = held down (a weapon throw charges while P+G stay held)
const NOIN = { left: false, right: false, up: false, down: false, hop: false, punch: false, kick: false, special: false, guard: false, punchHeld: false };
// depth (2.5D): z > 0 is toward the camera. Drawn lower and bigger; hits are tested in the fight plane plus a depth check
const ZMAX = 60, LANE = 40, ZS = 0.45, ZK = 0.0025;
const HIST = 240;
// enemies per wave (waves setting), wave n = 1, 2, …
const WAVES = { one: () => 1, pairs: () => 2, growing: n => Math.min(5, n), horde: () => 4 };

// what a training-mode frame meter shows for a fighter this frame
function frameState(f) {
  if (f.freeze > 0) return 'stop';
  if (f.kd) return 'down';
  if (f.blockT > 0) return 'block';
  if (f.dizzyT > 0) return 'dizzy';
  if (!f.free) return 'hit';
  const a = f.action;
  if (!a) return f.grounded ? 'idle' : 'air';
  if (!a.m.power) return 'move';
  const ks = a.m.keys, first = ks.findIndex(k => k.active), last = ks.findLastIndex(k => k.active);
  return a.i < first ? 'startup' : a.i <= last ? 'active' : a.i >= a.m.cancel && (a.hit || a.m.next) ? 'cancel' : 'recovery';
}

// checkpoint interval (frames); what a checkpoint leaves out: the logs, settings and UI state, kept as they are on restore
const CHECK = 60, KEEP = ['log', 'checkpoints', 'sums', 'playback', 'desync', 'replaying', 'tape', 'loop', 'scrubN', 'scen', 'over', 'chars', 'cfg'];

// a flying weapon's hit segment [end, end, radius]: its whole drawn length, the part behind the grip too (a staff is held along it)
function itemSeg(it, r = 0) {
  const w = WEAPONS[it.type], l = (w.len + (w.back || 0)) / 2, ux = Math.cos(it.rot) * l, uy = Math.sin(it.rot) * l;
  return [[it.x - ux, it.y - uy], [it.x + ux, it.y + uy], r];
}
class World {
  // over: config overrides on top of the live CFG. scen: { a, b, ax?, bx?, more?, period?, init?, chars? } (see brain.js)
  // chars: character per fighter slot (the last one fills the rest); default = the current character; a scenario's chars (names) win
  constructor(scen, over = {}, seed = 1, chars = null) {
    if (scen.chars) chars = scen.chars.map(n => CHARS[n] || currentChar()); // null: the character being edited
    Object.assign(this, { scen, over, seed, chars, groundY: GROUND, loop: true, camW: 420 });
    this.cfg = Object.assign(Object.create(CFG), scen.cfg, over); // a scenario can bring its own settings (plane …)
    this.reset();
  }
  reset() {
    const s = this.scen, scripted = Array.isArray(s.a);
    Object.assign(this, { rand: makeRand(this.seed), fx: makeRand(this.seed + 99), parts: [], trauma: 0, zoom: 0, slowT: 0, T: 0, simT: 0,
      frozenT: 0, hits: 0, blocks: 0, parries: 0, clashes: 0, koT: 0, freezes: [], victim: null, done: false, bank: this.cfg.hitstopBudget,
      pend: null, adv: null, macro: null, combo: 1, shakeK: 1, hist: { tgt: [], disp: [], vx: [], y: [], fs: [] }, whiffs: 0, acts: [], inputs: [] });
    if (!this.replaying) { this.log = []; this.checkpoints = []; this.sums = {}; this.desync = null; } // every frame since the start: [dt, input, macro], for rewind and replays
    // a vs b, plus any extra fighters: { c: controller, x, team }
    const specs = [{ c: s.a, x: s.ax ?? (scripted ? 330 : 300), team: 0 }, { c: s.b, x: s.bx ?? (scripted ? 375 : 500), team: 1 }, ...(s.more || [])];
    if (s.waves) specs.length = 1; // the enemies come in waves (nextWave)
    const chars = this.chars || [currentChar()];
    this.fighters = specs.map((sp, i) => Object.assign(
      new Fighter(this, sp.x, i < 2 ? 1 - 2 * i : sp.x < W / 2 ? 1 : -1, COLS[i % COLS.length], chars[Math.min(i, chars.length - 1)]),
      { team: sp.team ?? i }));
    [this.a, this.b] = this.fighters;
    // weapons: one per fighter from the settings (on the floor in front, or in hand), plus the scenario's (items, aw / bw / more[].w = held)
    this.items = []; this.shots = [];
    const wt = this.cfg.weapon, pickW = () => wt === 'random' ? Object.keys(WEAPONS)[Math.floor(this.rand() * 7)] : wt;
    this.fighters.forEach((f, i) => {
      const held = [s.aw, s.bw][i] ?? specs[i].w;
      if (held) f.wield(held);
      else if (WEAPONS[wt] || wt === 'random') {
        const type = pickW();
        if (this.cfg.weaponStart === 'held') f.wield(type); else this.drop(type, f.x + f.dir * 40);
      }
    });
    for (const it of s.items || []) this.drop(it.type, it.x);
    this.ctl = specs.map(sp => makeCtl(sp.c, this));
    if (s.waves) { Object.assign(this, { wave: 0, waveT: 0, spawned: 0, downs: 0 }); this.nextWave(); }
    this.cam = (this.a.x + this.b.x) / 2;
    s.init?.(this); // a scenario can set up a state (the animate preview's target: lying, dizzy, facing away)
  }
  // the next wave: the knocked-out enemies leave, new ones run in from both edges (a random built-in or the opponent's character)
  nextWave() {
    const keep = this.fighters.map((f, i) => !i || !f.ko);
    this.downs += keep.filter(k => !k).length;
    for (const k of ['fighters', 'ctl', 'acts']) this[k] = this[k].filter((_, i) => keep[i]);
    const n = WAVES[this.cfg.waves](++this.wave), names = Object.keys(CHARS), opp = (this.chars || [currentChar()])[Math.min(1, (this.chars || [0]).length - 1)];
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 1, x = left ? 50 + i * 12 : W - 50 - i * 12, ch = this.cfg.waveMix ? CHARS[names[Math.floor(this.rand() * names.length)]] : opp;
      this.fighters.push(Object.assign(new Fighter(this, x, left ? 1 : -1, COLS[1 + this.spawned++ % (COLS.length - 1)], ch), { team: 1 }));
      this.ctl.push(makeCtl('ai', this));
    }
    this.b = this.fighters[1];
    if (this.wave > 1) this.a.hp = Math.min(this.cfg.health, this.a.hp + this.cfg.health * this.cfg.waveHeal);
    this.a.say(`WAVE ${this.wave}`);
  }
  // a character was edited: fighters wearing the old build switch to the new one mid-fight
  swapChar(from, to) {
    if (this.chars) this.chars = this.chars.map(c => c === from ? to : c);
    for (const f of this.fighters) if (f.ch0 === from) f.setChar(armed(to, f.ch.weapon));
    this.checkpoints = []; // they hold the old build
  }
  // ---------- weapons lying around or flying (see Fighter.letGo) ----------
  drop(type, x) { this.items.push({ type, x, y: this.groundY - 2, z: 0, rot: 0, vx: 0, vy: 0, spin: 0, live: false, rest: true }); }
  // the lying weapon a fighter stands over, or null
  itemNear(f) {
    let best = null;
    for (const it of this.items) if (it.rest && !it.taker && Math.abs(it.x - f.x) < 40 && Math.abs(it.z - f.z) < 20 && (!best || Math.abs(it.x - f.x) < Math.abs(best.x - f.x))) best = it;
    return best;
  }
  updateItems(h) {
    const cfg = this.cfg;
    for (const it of this.items) if (!it.rest) {
      const w = WEAPONS[it.type];
      it.vy += (it.live ? 600 : cfg.gravity) * h; it.x += it.vx * h; it.y += it.vy * h; it.rot += it.spin * h;
      if (it.x < 20 || it.x > W - 20) { it.x = clamp(it.x, 20, W - 20); it.vx *= -0.4; it.live = false; }
      if (it.y >= this.groundY - 2) { // bounce, then lie flat
        it.y = this.groundY - 2; it.live = false;
        if (it.vy < 150) { it.rest = true; it.vx = it.vy = it.spin = 0; it.rot = Math.cos(it.rot) >= 0 ? 0 : Math.PI; }
        else { it.vy *= -0.3; it.vx *= 0.5; it.spin *= 0.5; this.dust(it.x, this.groundY, 0.3, it.z); }
      }
      if (!it.live) continue;
      // a thrown weapon hits its thrower's foes along its length, once
      const seg = itemSeg(it, cfg.hitR);
      // an active strike in its path bats it away (clash setting on)
      const bat = cfg.clash !== 'off' && this.foes(it.owner).find(o => Math.abs(o.z - it.z) <= cfg.zReach && o.action?.m.keys[o.action.i]?.active && !o.action.m.throw
        && o.strikeShapes(o.action.m).some(t => distSegSeg(seg[0], seg[1], t[0], t[1]) < seg[2] + t[2] + 2 + (o.ch.by[t.id]?.thick ?? BONE.thick) / 2));
      if (bat) {
        it.live = false; it.vx = bat.dir * Math.abs(it.vx) * 0.4; it.vy = -300; it.spin = -it.spin; this.clashes++; bat.say('DEFLECT');
        this.parts.push({ t: 'ring', x: it.x, y: it.y, z: it.z, life: 0.16, max: 0.16, col: '#d68c14' });
        continue;
      }
      for (const o of this.foes(it.owner)) if (Math.abs(o.z - it.z) <= cfg.zReach) {
        const hit = o.hurtAt(seg, false, false);
        if (!hit) continue;
        const m = thrownMove(it.type, it.power);
        this.onHit(it.owner, o, hit, m, o.defend(it, m, null));
        it.live = false; it.vx *= -0.2; it.vy = -250; it.spin = 10;
        break;
      }
    }
  }
  // ---------- projectiles (Fighter.shoot): fly straight until they hit, meet a foe's shot, leave the arena or run out of life ----------
  updateShots(h) {
    const cfg = this.cfg, gone = new Set(), pop = (s, col) => { gone.add(s); this.parts.push({ t: 'ring', x: s.x, y: s.y, z: s.z, life: 0.2, max: 0.2, col, big: true }); };
    for (const s of this.shots) { s.x += s.vx * h; s.t += h; if (s.t > s.life || s.x < 20 || s.x > W - 20) pop(s, '#aaa'); }
    for (const s of this.shots) for (const o of this.shots) if (s !== o && !gone.has(s) && !gone.has(o) && s.owner.team !== o.owner.team
      && Math.abs(s.x - o.x) < s.r + o.r && Math.abs(s.y - o.y) < s.r + o.r && Math.abs(s.z - o.z) <= cfg.zReach) { pop(s, '#d68c14'); pop(o, '#d68c14'); this.clashes++; }
    for (const s of this.shots) if (!gone.has(s)) for (const o of this.foes(s.owner)) if (Math.abs(o.z - s.z) <= cfg.zReach) {
      const hit = o.hurtAt([[s.x - s.vx * h, s.y], [s.x, s.y], s.r], false, false);
      if (!hit) continue;
      const def = o.defend(s, s.m, null), fr = s.owner.freeze; // blocked from the side it comes from; a counter can't catch it
      this.onHit(s.owner, o, hit, s.m, def === 'catch' ? 'block' : def);
      s.owner.freeze = fr; // the shooter is far away: no hit stop for it
      gone.add(s); break;
    }
    if (gone.size) this.shots = this.shots.filter(s => !gone.has(s));
  }
  // looks: ki (a blue ball), fire (flickering orange), dark (purple), wave (a crescent, sonic boom), star (a spinning shuriken)
  drawShots(ctx) {
    const COL = { ki: ['80,160,255', '#2c6fb0'], fire: ['240,140,30', '#c0392b'], dark: ['142,68,173', '#2c1338'], wave: ['230,200,60', '#b07a2c'], star: ['120,120,130', '#444'] };
    for (const s of this.shots) {
      const [rgb, edge] = COL[s.look] || COL.ki, r = s.r * (s.look === 'fire' ? 1 + 0.12 * Math.sin(s.t * 45) : 1);
      ctx.save(); ctx.translate(s.x, s.y + s.z * ZS);
      if (s.look === 'star') {
        ctx.rotate(s.t * 25 * s.dir); ctx.fillStyle = edge; ctx.beginPath();
        for (let k = 0; k < 8; k++) { const q = k * Math.PI / 4, l = k % 2 ? r * 0.35 : r; ctx.lineTo(Math.cos(q) * l, Math.sin(q) * l); }
        ctx.fill();
      } else if (s.look === 'wave') {
        ctx.scale(s.dir, 1); ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) { ctx.strokeStyle = `rgba(${rgb},${0.9 - k * 0.3})`; ctx.lineWidth = 4 - k; ctx.beginPath(); ctx.arc(-k * 9, 0, r * 1.4, -1.1, 1.1); ctx.stroke(); }
      } else {
        for (let k = 3; k > 0; k--) { ctx.fillStyle = `rgba(${rgb},${0.12 * (4 - k)})`; ctx.beginPath(); ctx.arc(-s.dir * k * r * 0.6, 0, r * (1 - k * 0.15), 0, 7); ctx.fill(); } // trail
        ctx.fillStyle = `rgba(${rgb},.45)`; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(${rgb},.9)`; ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, 7); ctx.fill();
      }
      if (this.cfg.boxes) { ctx.strokeStyle = 'rgba(192,57,43,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, s.r, 0, 7); ctx.stroke(); }
      ctx.restore();
    }
  }
  drawItems(ctx) {
    for (const it of this.items) {
      const w = WEAPONS[it.type], half = (w.len - (w.back || 0)) / 2, c = Math.cos(it.rot), s = Math.sin(it.rot);
      const lie = it.rest ? -2 : 0; // lying: its thickness above the floor line
      ctx.save(); ctx.translate(0, it.z * ZS + lie);
      drawWeapon(ctx, { ...w, back: w.back || 0 }, [it.x - c * half, it.y - s * half], [it.x + c * (w.len - half), it.y + s * (w.len - half)], null);
      if (this.cfg.boxes && it.live) { // a flying weapon's hitbox
        const [p, q] = itemSeg(it);
        ctx.strokeStyle = 'rgba(192,57,43,.6)'; ctx.lineWidth = this.cfg.hitR * 2 + 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
      ctx.restore();
    }
  }
  foes(f) { return this.fighters.filter(o => o.team !== f.team && !o.ko); }
  nearestFoe(f) {
    let best = null;
    for (const o of this.foes(f)) if (!best || Math.abs(o.x - f.x) < Math.abs(best.x - f.x)) best = o;
    return best;
  }
  get frozen() { return this.fighters.some(f => f.freeze > 0); }

  // one frame of wall time; inp = the human's input for this frame (edges included)
  advance(raw, inp) {
    if (this.done) return;
    if (this.playback && !this.replaying) { // a replay file: its frames instead of the live input; at the end it stays on the last frame
      const e = this.playback.frames[this.log.length], pb = this.playback;
      if (!e) { if (!pb.over && this.desync === null && pb.end && this.stateHash() !== pb.end) this.desync = this.log.length; pb.over = true; return; }
      [raw, inp] = e;
      if (e[2]) { this.macro = new Script(parseMacro(e[2])); this.macroSeq = e[2]; }
    }
    if (!this.replaying) {
      if (this.log.length % CHECK === 0) this.checkpoint();
      this.log.push([raw, inp, this.macroSeq]); this.macroSeq = null; // a macro started this frame replays too
    }
    const slow = this.slowT > 0 && !this.frozen; // finisher slow-mo starts once the freeze is over
    if (slow) this.slowT -= raw;
    this.combo = Math.max(1, ...this.fighters.map(f => f.combo)); // the longest running combo drives Combo escalation
    const dt = raw * this.cfg.timeScale * (slow ? 0.3 : 1) * clamp(1 + this.cfg.comboTime * (this.combo - 1), 0.2, 3);
    if (dt <= 0) return;
    // fixed-size substeps (<= 1/120 s) keep springs and physics identical at any refresh rate
    const n = Math.ceil(dt * 120);
    for (let i = 0; i < n && !this.done; i++) this.step(dt / n, i ? { ...inp, hop: false, punch: false, kick: false, special: false } : inp);
    for (const f of this.fighters) if (f.freeze <= 0) f.recordTrail();
    const h = this.hist, j = this.cfg.scope;
    h.tgt.push(this.a.target[j] ?? 0); h.disp.push(this.a.disp[j] ?? 0); h.vx.push(this.a.vx); h.y.push(this.a.y);
    h.fs.push([frameState(this.a), frameState(this.b)]);
    if (this.ctl[0] === 'human') this.logInput(inp);
    if (h.tgt.length > HIST) for (const k in h) h[k].shift();
  }

  // rewind: back n frames. The fight is deterministic, so it restarts and replays the logged frames (with the current settings)
  // back n frames: from the last checkpoint at or before that frame (else the start), replaying the logged frames after it
  rewind(n) {
    const to = Math.max(0, this.log.length - n), log = this.log.slice(0, to), cps = this.checkpoints.filter(c => c.i <= to), cp = cps[cps.length - 1];
    this.done = false; this.replaying = true;
    if (cp) this.restore(cp.s); else this.reset();
    for (const [dt, inp, mq] of log.slice(cp ? cp.i : 0)) { if (mq) this.macro = new Script(parseMacro(mq)); this.advance(dt, inp); }
    this.replaying = false; this.log = log; this.checkpoints = cps;
    for (const i in this.sums) if (i > to) delete this.sums[i];
  }
  // every CHECK frames: a checksum (a replay compares them: desync = first frame that differs) and a copy of the whole fight state;
  // the last 60 copies stay, older ones thin out to one per 10 (memory stays bounded, rewinding far back replays at most 10 of them)
  checkpoint() {
    const i = this.log.length, h = this.sums[i] = this.stateHash(), want = this.playback?.sums[i];
    if (want && want !== h && this.desync === null) this.desync = i;
    const cps = this.checkpoints, old = cps.length - 60;
    cps.push({ i, s: cloneState(this, new Map(), KEEP) });
    if (old > 0 && cps[old].i % (CHECK * 10)) cps.splice(old, 1);
  }
  restore(s) {
    const memo = new Map([[s, this]]);
    for (const k of Object.keys(s)) this[k] = cloneState(s[k], memo);
  }
  stateHash() {
    return hashNums([this.rand.seed, this.hits, this.blocks, this.clashes, this.simT, ...this.items.flatMap(it => [it.x, it.y]), ...this.shots.flatMap(s => [s.x, s.t]),
      ...this.fighters.flatMap(f => [f.x, f.y, f.z, f.vx, f.vy, f.hp, f.dir, f.action?.i ?? -1, f.action?.t ?? 0])]);
  }
  // a running key macro (keys.js) presses its steps on top of the keys held
  withMacro(inp, f, o, h) {
    if (!this.macro || !o) return inp;
    const m = this.macro.input(f, o, h);
    if (this.macro.done) this.macro = null;
    return Object.fromEntries(Object.keys(NOIN).map(k => [k, inp[k] || m[k]]));
  }
  // input display: the human's input in numpad notation (6 = forward, 2 = down, 8 = up…) + buttons, repeats merged
  logInput(i) {
    const x = (i.right - i.left) * this.a.dir, n = 5 + x + (i.down ? -3 : i.up ? 3 : 0);
    const b = (i.punch ? 'P' : '') + (i.kick ? 'K' : '') + (i.special ? 'S' : '') + (i.guard ? 'G' : '');
    const last = this.inputs[this.inputs.length - 1];
    if (last && last.n === n && last.b === b && (!b || b === 'G')) last.f++; // a held guard merges too
    else { this.inputs.push({ n, b, f: 1 }); if (this.inputs.length > 20) this.inputs.shift(); }
  }

  step(h, inp) {
    const cfg = this.cfg;
    this.T += h; this.simT += h;
    this.trauma = Math.max(0, this.trauma - h * 1.6);
    this.zoom *= Math.exp(-h * 10);
    this.bank = Math.min(cfg.hitstopBudget, this.bank + h * cfg.hitstopBudget);
    if (this.frozen) this.frozenT += h;
    this.updateParticles(h); this.updateItems(h); this.updateShots(h);

    const fs = this.fighters, tg = fs.map(f => this.nearestFoe(f));
    const ins = this.koT ? fs.map(() => NOIN) : this.ctl.map((c, i) => c === 'human' ? this.withMacro(inp, fs[i], tg[i], h) : !c || !tg[i] ? NOIN : c.input(fs[i], tg[i], h));
    fs.forEach((f, i) => f.bufferInput(ins[i]));
    // recording for the replay dummy: one entry per substep the human is not frozen, directions relative to facing
    if (this.tape && !this.replaying && this.ctl[0] === 'human' && this.a.freeze <= 0) {
      const i = ins[0], d = this.a.dir > 0;
      this.tape.push({ fwd: d ? i.right : i.left, back: d ? i.left : i.right, up: i.up, down: i.down, hop: i.hop, punch: i.punch, kick: i.kick, special: i.special, guard: i.guard, punchHeld: i.punchHeld });
    }
    const moving = fs.filter(f => f.freeze > 0 ? (f.freeze -= h, false) : true); // hit stop: a frozen fighter sits out the substep
    moving.forEach(f => f.update(h, ins[fs.indexOf(f)]));
    // same-frame trades: every fighter's strikes are found before any lands, so two blows on one frame both hit; a strike beats a throw
    const landed = [];
    moving.forEach(f => f.strike(this.foes(f), landed));
    for (const l of landed) if (!l.a.m.throw) this.onHit(l.f, l.o, l.h, l.m, l.o.defend(l.f, l.a.m, l.key));
    for (const l of landed) if (l.a.m.throw && l.f.action === l.a && l.o.free && !l.o.heldBy) l.f.seize(l.o);
    // push apart by the bodies' extents (unless someone is knocked down, or held in a throw: pinned at its spot), then face the nearest foe
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i], b = fs[j], d = b.x - a.x;
      // level (both against a wall): the one moving, else facing, that way more ends up nearer it, so a dash into the corner gets past
      const sd = Math.abs(d) > 0.5 ? Math.sign(d) : Math.sign(b.vx - a.vx) || Math.sign(b.dir - a.dir) || Math.sign(d) || 1;
      // the gap the two bodies need: the facing sides of their extents (a centaur's horse body reaches far in front)
      const side = (f, toward) => f.ch.extent[toward === f.dir ? 1 : 0], need = side(a, sd) + side(b, -sd);
      if (Math.abs(d) < need && Math.abs(a.y - b.y) < 60 && Math.abs(a.z - b.z) < cfg.zReach && !a.kd && !b.kd && a.heldBy !== b && b.heldBy !== a) {
        // a dash that began passing keeps passing while it is still dashing inside the other body
        if (a.passT > 0 || b.passT > 0) { for (const f of [a, b]) if (f.passT > 0 && f.dashT > 0) f.passT = Math.max(f.passT, 2 * h); continue; }
        // pushed apart, but never into a wall: the one against it stays, the other takes the whole push
        const gap = need - Math.abs(d), ax = a.x - gap / 2 * sd, bx = b.x + gap / 2 * sd;
        const k = Math.max(0, 40 - Math.min(ax, bx)) - Math.max(0, Math.max(ax, bx) - (W - 40));
        a.x = ax + k; b.x = bx + k;
      }
    }
    fs.forEach((f, i) => { if (tg[i] && !f.action && f.free && f.grounded) f.dir = (Math.sign(tg[i].x - f.x) || f.dir) * (f.away ? -1 : 1); });
    // whiff: an attack that ended (or was interrupted) without touching anyone
    fs.forEach((f, i) => { const a = this.acts[i]; if (a && a !== f.action && a.m.power && !a.hit) this.whiffs++; this.acts[i] = f.action; });

    // frame advantage of the last hit: who can act first afterwards, in 60 fps frames (+ = attacker)
    const pd = this.pend;
    if (pd) {
      if (pd.at === null && idle(pd.att)) pd.at = this.simT;
      if (pd.vt === null && idle(pd.vic)) pd.vt = this.simT;
      if (pd.at !== null && pd.vt !== null) { this.adv = Math.round((pd.vt - pd.at) * 60); this.pend = null; }
    }

    // endless waves: a moment after the last enemy falls the next wave comes; only your K.O. ends the round
    if (this.scen.waves && !this.a.ko) { if (this.foes(this.a).length) this.waveT = 0; else if ((this.waveT += h) > 1.2) this.nextWave(); }
    // a round ends once only one team is still standing
    else if (!this.koT && fs.some(f => f.ko) && new Set(fs.filter(f => !f.ko).map(f => f.team)).size <= 1) this.koT = 2.5;
    // the round is over: the controllers pause, each survivor plays its win move once it is free on the floor (winPose)
    if (this.koT) for (const f of fs) if (!f.ko && !f.won && f.free && f.grounded && !f.action && f.c('winPose') && f.ch.moves.win) { f.won = true; f.start('win'); }
    const p = this.scen.period;
    if (p && this.simT >= p || this.koT && (this.koT -= h) <= 0) { if (this.loop) this.reset(); else this.done = true; }
  }

  // ---------- juice ----------
  onHit(att, vic, hit, m, def) {
    const cfg = this.cfg, pt = hit.pt;
    this.pend = { att, vic, at: null, vt: null };
    if (def) { // blocked or parried: a shorter freeze and a ring, no combo
      if (def === 'catch') { vic.catchHit(att, hit); return; }
      if (def === 'parry') { vic.parryHit(att); this.parries++; } else { vic.blockHit(att, m); this.blocks++; }
      this.sound('block', pt[0]);
      const hs = (m.stop || cfg.hitstop * m.power) * cfg.powerScale * (def === 'parry' ? 1.2 : 0.5);
      vic.freeze = hs; att.freeze = Math.max(att.freeze, hs); // (max: in a trade the attacker was just struck too)
      this.trauma = Math.min(1, this.trauma + 0.1 * m.power * cfg.powerScale);
      this.parts.push({ t: 'ring', x: pt[0], y: pt[1], z: vic.z, life: 0.16, max: 0.16, col: def === 'parry' ? '#2c6fb0' : '#888' });
      return;
    }
    vic.takeHit(att, m, hit);
    const fin = vic.kd === 'fly', power = m.power * cfg.powerScale * (fin ? cfg.hitstopFin : 1);
    // freeze shrinks along a combo, and a budget caps total frozen time so long strings don't turn to stop-motion
    const n = vic.combo - 1, want = (m.stop || cfg.hitstop * m.power) * cfg.powerScale * (fin ? cfg.hitstopFin : 1) * cfg.hitstopDecay ** n * Math.max(0, 1 + cfg.comboStop * n);
    let hs = want;
    if (cfg.hitstopBudget > 0) { hs = Math.min(hs, this.bank); this.bank -= hs; }
    vic.freeze = hs; att.freeze = Math.max(att.freeze, hs * cfg.hitstopAtk);
    this.freezes.push({ hs, want, fin });
    if (this.freezes.length > 12) this.freezes.shift();
    this.hits++;
    this.trauma = Math.min(1, this.trauma + 0.3 * power);
    this.shakeK = 1 + cfg.comboShake * n;
    this.zoom += cfg.zoomPunch * power * (1 + cfg.comboZoom * n);
    if (fin && cfg.slowmo) this.slowT = 0.35;
    this.victim = vic;
    // the striking key's spark style (key event spark); the plain sparks still draw their random numbers so a style changes no fight
    const st = att.action?.m.keys?.[att.action.i]?.spark;
    this.sound(power > 1.5 ? 'thud' : 'hit', pt[0]);
    if (cfg.sparks > 0) {
      if (st !== 'none') this.parts.push({ t: 'ring', x: pt[0], y: pt[1], z: vic.z, life: 0.16, max: 0.16 });
      for (let i = 0; i < cfg.sparks * power; i++) {
        const a = this.rand(-0.8, 0.8) + (att.dir > 0 ? 0 : Math.PI), s = this.rand(250, 700), life = this.rand(0.12, 0.3);
        if (st !== 'none' && st !== 'slash') this.parts.push({ t: 'spark', x: pt[0], y: pt[1], z: vic.z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, w: st === 'heavy' ? 2 : 1 });
      }
      if (st && st !== 'none' && st !== 'hit') this.spark(st, pt, vic.z, att.dir);
    }
  }
  // a styled hit spark (key event spark), from the effects' own random numbers: heavy = a big flash and ring, slash = a cut across the
  // point, blunt = a flash with chunky bits
  spark(st, pt, z, dir) {
    const r = this.fx, P = this.parts;
    if (st === 'slash') { const a = r(-1.1, -0.5) * dir; P.push({ t: 'slash', x: pt[0], y: pt[1], z, a, life: 0.18, max: 0.18 }); return; }
    P.push({ t: 'flash', x: pt[0], y: pt[1], z, r: st === 'heavy' ? 34 : 22, life: 0.12, max: 0.12 });
    if (st === 'heavy') P.push({ t: 'ring', x: pt[0], y: pt[1], z, life: 0.28, max: 0.28, big: true });
    if (st === 'blunt') for (let i = 0; i < 5; i++) {
      const a = r(0, 7), s = r(150, 400), life = r(0.15, 0.3);
      P.push({ t: 'spark', x: pt[0], y: pt[1], z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, w: 2.5 });
    }
  }
  // a sound (sound.js) for the live fight only: rewinds, replays and the other cells stay silent
  sound(n, x) { if (this.sfx && !this.replaying) this.sfx(n, x / W); }
  // two active strikes met (see Fighter.clashWith): both moves stop, both recoil apart in a short stun, sparks
  clash(a, b, pt) {
    const cfg = this.cfg, stun = cfg.clashStun;
    for (const [f, o] of [[a, b], [b, a]]) {
      f.buffer = null; f.start(makeHurt(f.ch.hurt.high[0], stun, this.rand, f.st.pose)); f.hurtT = stun;
      f.vx = Math.sign(f.x - o.x || -f.dir) * cfg.clashPush; f.freeze = cfg.hitstop * 1.5; f.say('CLASH');
    }
    this.clashes++;
    this.trauma = Math.min(1, this.trauma + 0.2);
    this.parts.push({ t: 'ring', x: pt[0], y: pt[1], z: a.z, life: 0.2, max: 0.2, col: '#d68c14' });
    for (let i = 0; i < 8; i++) {
      const ang = this.rand(0, Math.PI * 2), sp = this.rand(200, 600), life = this.rand(0.1, 0.25);
      this.parts.push({ t: 'spark', x: pt[0], y: pt[1], z: a.z, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life, max: life });
    }
  }
  // the impact tool: a blow at world point (x, y) pushed by (dx, dy) (longer = harder; a long one knocks down),
  // on the fighter whose bone passes nearest; false if no body is near
  poke(x, y, dx, dy) {
    let best = null, bd = 25;
    for (const f of this.fighters.filter(f => !f.hidden)) {
      const P = f.body();
      for (const b of f.ch.bones) {
        const d = distSeg([x, y], b.shape === 'circle' ? P[b.id] : P[b.parent || 'hip'], P[b.id]) - (b.shape === 'circle' ? b.len : 0);
        if (d < bd) { bd = d; best = [f, b]; }
      }
    }
    if (!best) return false;
    const [vic, bone] = best, len = Math.hypot(dx, dy), p = clamp(len / 60, 0.2, 3);
    const att = Object.assign(Object.create(this.fighters.find(f => f !== vic)), { dir: Math.sign(dx) || -vic.dir }); // the other fighter, struck from dx's side
    const m = { power: p, knock: Math.abs(dx) * 6, launch: Math.max(0, -dy) * 6, kd: p >= 1, stun: 0.25 + 0.1 * p, damage: 0, height: dy > len / 2 ? 'low' : 'mid' };
    this.onHit(att, vic, { pt: [x, y], bone }, m, null);
    this.pend = null;
    return true;
  }
  dust(x, y, imp, z = 0) {
    if (this.cfg.squash <= 0) return;
    for (let i = 0; i < 3 + imp * 6; i++) {
      const life = this.rand(0.25, 0.45);
      this.parts.push({ t: 'dust', x: x + this.rand(-8, 8), y: y - 2, z, vx: this.rand(-1, 1) * 140 * imp, vy: -this.rand(10, 50), r: this.rand(2, 5), life, max: life });
    }
  }
  updateParticles(dt) {
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if ((p.life -= dt) <= 0) { parts.splice(i, 1); continue; }
      if (p.vx !== undefined) {
        const drag = Math.exp(-(p.t === 'spark' ? 6 : 4) * dt);
        p.vx *= drag; p.vy *= drag; p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }
  }
  drawParticles(ctx) {
    for (const p of this.parts) {
      const k = p.life / p.max;
      ctx.save(); ctx.translate(0, (p.z || 0) * ZS);
      if (p.t === 'spark') {
        ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 2.5 * k * (p.w || 1);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
      } else if (p.t === 'ring') {
        ctx.strokeStyle = p.col || '#222'; ctx.lineWidth = 3 * k;
        ctx.beginPath(); ctx.arc(p.x, p.y, 6 + (1 - k) * (p.big ? 70 : 36), 0, 7); ctx.stroke();
      } else if (p.t === 'flash') {
        ctx.fillStyle = `rgba(255,236,170,${0.85 * k})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.4 - 0.6 * k), 0, 7); ctx.fill();
      } else if (p.t === 'slash') { // a thin crescent across the point, widest in the middle
        const L = 46 * (1.3 - 0.3 * k), c = Math.cos(p.a), s = Math.sin(p.a), w = 7 * k;
        ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.strokeStyle = `rgba(192,57,43,${k})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p.x - c * L, p.y - s * L); ctx.quadraticCurveTo(p.x - s * w, p.y + c * w, p.x + c * L, p.y + s * L);
        ctx.quadraticCurveTo(p.x + s * w, p.y - c * w, p.x - c * L, p.y - s * L); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(120,110,100,${0.35 * k})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (2 - k), 0, 7); ctx.fill();
      }
      ctx.restore();
    }
  }

  // draw into rect r (device px). full = whole arena, otherwise a closer camera following the fight
  render(ctx, r, full) {
    // the camera widens to keep every fighter in view (hidden ones aside: the impact tool's unseen attacker)
    const xs = this.fighters.filter(f => !f.hidden).map(f => f.x), lo = Math.min(...xs), hi = Math.max(...xs), mid = (lo + hi) / 2;
    this.camW += (clamp(hi - lo + 260, 420, W) - this.camW) * 0.15;
    const cfg = this.cfg, vw = full ? W : this.camW, vh = vw * H / W;
    this.cam += (clamp(mid, vw / 2 - 20, W - vw / 2 + 20) - this.cam) * 0.15;
    const cx = full ? W / 2 : this.cam, cy = full ? H / 2 : this.groundY - vh * 0.3;
    const s = Math.min(r.w / vw, r.h / vh) * (1 + this.zoom), tr = this.trauma ** 2 * cfg.shake * this.shakeK;
    const T = this.T, sx = tr * (Math.sin(T * 71) + Math.sin(T * 113 + 1)) * 0.5;
    const sy = tr * (Math.sin(T * 89 + 2) + Math.sin(T * 127 + 3)) * 0.5;
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    this.view = { s, ox: r.x + r.w / 2 + (sx - cx) * s, oy: r.y + r.h / 2 + (sy - cy) * s }; // screen = world · s + o
    ctx.transform(s, 0, 0, s, this.view.ox, this.view.oy);
    ctx.strokeStyle = '#cfc8bb'; ctx.lineWidth = 2;
    const plane = cfg.plane, g = this.groundY;
    if (plane !== '2d') { // the floor in depth; lanes get a line each
      ctx.fillStyle = '#ebe5d9'; ctx.fillRect(-2000, g - ZMAX * ZS, W + 4000, ZMAX * ZS * 2);
      if (plane === 'lanes') for (const l of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(-2000, g + l * LANE * ZS); ctx.lineTo(W + 2000, g + l * LANE * ZS); ctx.stroke(); }
    } else { ctx.beginPath(); ctx.moveTo(-2000, g); ctx.lineTo(W + 2000, g); ctx.stroke(); }
    ctx.fillStyle = '#e4ded2'; ctx.fillRect(-2000, -2000, 2020, 4000); ctx.fillRect(W - 20, -2000, 2000, 4000); // walls
    for (const f of this.fighters.filter(f => !f.hidden).sort((a, b) => a.z - b.z)) // far ones first
      f.draw(ctx, f.freeze > 0 && f === this.victim ? Math.sin(T * 170) * cfg.hitShake : 0);
    this.drawItems(ctx);
    this.drawShots(ctx);
    this.drawParticles(ctx);
    ctx.restore();
    if (this.scen.waves) { // wave counter
      ctx.save(); ctx.fillStyle = '#8a8580'; ctx.textAlign = 'center'; ctx.font = `bold ${Math.round(r.h / 28)}px ui-monospace, Menlo, monospace`;
      ctx.fillText(`WAVE ${this.wave} · ${this.downs + this.fighters.filter(f => f.ko && f !== this.a).length} down`, r.x + r.w / 2, r.y + r.h / 14); ctx.restore();
    }
  }
}

// ---------- replay files: the fight's inputs (not its results), pinned to ENGINE_VERSION ----------
// everything the simulation reads goes in: scenario, seed, every setting, the characters' definitions; sums = checkpoint checksums
const REPLAY_FORMAT = 'stick2-replay', REPLAY_SKIP = ['boxes']; // display settings stay live
function makeReplay(w, name) {
  const keys = Object.keys(NOIN);
  return { format: REPLAY_FORMAT, version: ENGINE_VERSION, scenario: name, scen: JSON.parse(JSON.stringify(w.scen)), seed: w.seed,
    cfg: Object.fromEntries(Object.keys(SPEC).filter(k => !REPLAY_SKIP.includes(k)).map(k => [k, w.cfg[k]])),
    chars: (w.chars || [currentChar()]).map(c => c.def), keys,
    frames: w.log.map(([dt, inp, mq]) => [dt, keys.reduce((m, k, i) => m | (inp[k] ? 1 << i : 0), 0), ...mq ? [mq] : []]),
    sums: w.sums, end: w.stateHash() };
}
// a world that plays the replay (check r.version against ENGINE_VERSION first); w.desync = first frame that came out differently
function replayWorld(r) {
  const w = new World({ ...SCENARIOS[r.scenario], ...r.scen }, r.cfg, r.seed, r.chars.map(makeCharacter));
  w.playback = { version: r.version, sums: r.sums, end: r.end, frames: r.frames.map(([dt, m, mq]) => [dt, Object.fromEntries(r.keys.map((k, i) => [k, !!(m >> i & 1)])), mq || null]) };
  return w;
}
