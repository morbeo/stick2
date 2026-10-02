'use strict';
// ---------- move checks: a move played against a target in every state, and whether what happens is what should ----------
// the target: what the dummy holds (stance), its state, facing toward or away; the animate preview plays the same setups
const STANCES = { stand: 'dummy', crouch: [{ hold: 'down', t: 99 }], guard: [{ hold: 'guard', t: 99 }], low: [{ hold: 'down+guard', t: 99 }] };
const FAR = 60; // a far target stands this much further than the move's usual distance
function targetScen(name, m, tg) {
  const s = galleryScen(name, !!m.air, m);
  s.b = tg.state === 'air' ? [Math.max(0, 0.1 + frameData(m, CFG.attackSpeed).startup / 60 - 0.25), 'hop'] : STANCES[tg.stance];
  if (tg.dist === 'far') s.bx += FAR;
  s.init = w => {
    const b = w.b;
    if ((b.away = tg.facing === 'away')) b.dir = -b.dir;
    if (tg.state === 'down') Object.assign(b, { kd: 'down', downT: 99 });
    if (tg.state === 'dizzy') Object.assign(b, { dizzyT: 99, hurtT: 99 });
  };
  return s;
}
// the test matrix's columns: each target state, facing toward / away, near / far
const CHECK_STATES = { stand: { stance: 'stand', state: 'idle' }, crouch: { stance: 'crouch', state: 'idle' }, guard: { stance: 'guard', state: 'idle' },
  low: { stance: 'low', state: 'idle' }, air: { stance: 'stand', state: 'air' }, down: { stance: 'stand', state: 'down' }, dizzy: { stance: 'stand', state: 'dizzy' } };
const CHECK_COLS = Object.keys(CHECK_STATES).flatMap(s => ['toward', 'away'].flatMap(facing => ['near', 'far'].map(dist => ({ s, facing, dist, ...CHECK_STATES[s] }))));
// what may happen: hit / block / whiff, with why the others may not
function allowed(m, col, cfg = CFG) {
  const h = m.height || 'mid', front = col.facing === 'toward', unblock = m.throw || m.keys.some(k => k.unblock), st = col.s;
  if (st === 'down') return cfg.otg === 'all' || cfg.otg === 'flagged' && m.otg ? { ok: ['hit', 'whiff'] } : { ok: ['whiff'], why: 'only off-the-ground (otg) moves hit a fighter on the floor' };
  if ((st === 'crouch' || st === 'low') && h === 'high') return { ok: ['whiff'], why: 'a high passes over a crouching fighter' };
  if (m.hits && !m.hits.includes(st === 'air' ? 'air' : st === 'crouch' || st === 'low' ? 'crouch' : 'stand')) return { ok: ['whiff'], why: `its hits leave out ${st}` };
  if (front && !unblock && (st === 'guard' && h !== 'low' || st === 'low' && (h === 'low' || h === 'smid'))) return { ok: ['block', 'whiff'], why: `a ${st === 'low' ? 'low ' : ''}guard from the front blocks a ${h}` };
  const why = !front && (st === 'guard' || st === 'low') ? 'guard only works from the front' : st === 'guard' || st === 'low' ? `a ${st === 'low' ? 'low ' : ''}guard does not block a ${unblock ? 'throw or unblockable' : h}` : 'nothing here blocks';
  // the move's own setup (a standing target facing it, near) must connect when the move strikes
  const strikes = m.keys.some(k => k.active) && !m.throw && !m.air;
  return st === 'stand' && front && col.dist === 'near' && strikes ? { ok: ['hit'], why: 'its own setup: a standing target in reach', must: true } : { ok: ['hit', 'whiff'], why };
}
const settled = f => !f.action && f.free && f.grounded && !f.heldBy && f.dizzyT <= 0;
// one cell: ch plays move name against opp in col; the result's issues are empty when it passes
function runCheck(ch, opp, name, col) {
  const m = ch.moves[name], s = targetScen(name, m, col);
  s.period = 0;
  const w = new World(s, {}, 7, [ch, opp]), { a, b } = w, lim = 240 + Math.ceil(total(m) / w.cfg.attackSpeed * 60) + 300;
  let started = false, still = 0, i = 0, nan = false;
  const watchB = !['down', 'dizzy'].includes(col.s);
  for (; i < lim; i++) {
    w.advance(1 / 60, NOIN);
    if (a.action && a.action.m === a.ch.moves[name]) started = true; // (by name: a weapon move arms the fighter, a new compiled character)
    if (![a, b].every(f => Number.isFinite(f.x + f.y + f.vx + f.vy))) { nan = true; break; }
    if (started && settled(a) && (!watchB || settled(b))) { if (++still > 15) break; } else still = 0;
  }
  const out = w.hits ? 'hit' : w.blocks || w.parries ? 'block' : 'whiff', exp = allowed(m, col, w.cfg), issues = [];
  const where = f => f.action ? `in ${Object.keys(f.ch.moves).find(k => f.ch.moves[k] === f.action.m) || 'a move'}` : f.kd ? `knocked ${f.kd}` : f.heldBy ? 'held' : !f.grounded ? 'in the air' : 'in hitstun';
  if (!started) return { out: 'skip', issues: [], t: i / 60, why: 'it never starts from this setup' };
  if (nan) issues.push('a position became NaN');
  else {
    if (!exp.ok.includes(out)) issues.push(exp.must ? `whiffs ${exp.why}` : `${out === 'hit' ? 'hits' : out === 'block' ? 'is blocked' : 'whiffs'}, but ${exp.why}`);
    if (!settled(a)) issues.push(`the attacker does not return to neutral (still ${where(a)})`);
    if (watchB && !settled(b)) issues.push(`the target does not recover (still ${where(b)})`);
    if ([a, b].some(f => f.x < -40 || f.x > W + 40)) issues.push('a fighter left the stage');
  }
  return { out, issues, t: i / 60, why: exp.why };
}
