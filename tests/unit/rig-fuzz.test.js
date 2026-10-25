// rig fuzz: random body edits of the kind the character editor makes (lengths, angles, limits, lag, level, reparenting to a bone
// that isn't its own descendant, new bones, removed leaves) must always compile into a character that fights with finite numbers
// and keeps a valid bone tree. Seeded, so a failure names the seed and edit list that reproduce it. FUZZ_RIG=n for more rounds
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load();
const N = +process.env.FUZZ_RIG || 40;
run(`var rigFuzz = seed => {
  let s = seed; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647; for (let i = 0; i < 5; i++) rnd(); /* small seeds start low */ const pick = a => a[Math.floor(rnd() * a.length)];
  const base = pick(Object.keys(CHAR_DEFS)), def = JSON.parse(JSON.stringify(CHAR_DEFS[base])), log = [];
  const kids = id => def.bones.filter(b => b.parent === id).map(b => b.id), under = id => [id, ...kids(id).flatMap(under)];
  for (let i = 0; i < 12; i++) {
    const b = pick(def.bones), op = pick(['len', 'a', 'limits', 'lag', 'level', 'parent', 'add', 'remove']);
    if (op === 'len') b.len = Math.round(rnd() * 60);
    else if (op === 'a') { b.a = Math.round(rnd() * 720 - 360); def.poses.stance[b.id] = Math.round(rnd() * 360 - 180); }
    else if (op === 'limits') { b.min = Math.round(rnd() * 360 - 180); b.max = b.min + Math.round(rnd() * 360); }
    else if (op === 'lag') b.lag = Math.round(rnd() * 30) / 10;
    else if (op === 'level') b.level = Math.round(rnd() * 10) / 10;
    else if (op === 'parent' && b.parent) { const to = pick(def.bones.filter(x => !under(b.id).includes(x.id))); if (to) b.parent = to.id; }
    else if (op === 'add') def.bones.push({ id: 'fz' + i, parent: b.id, len: Math.round(rnd() * 30), role: b.role });
    else if (op === 'remove' && b.parent && !kids(b.id).length) def.bones.splice(def.bones.indexOf(b), 1);
    log.push(op + ':' + b.id);
  }
  const ch = makeCharacter(def), ids = new Set(ch.bones.map(b => b.id));
  const tree = ch.bones.every((b, i) => !b.parent || ch.bones.slice(0, i).some(p => p.id === b.parent)); // parents before children
  const w = new World({ a: 'ai', b: 'ai', ax: 300, bx: 420 }, {}, seed, [ch, CHARS.stick]); w.loop = false;
  for (let i = 0; i < 180 && !w.done; i++) w.advance(1 / 60, NOIN);
  const P = fk(ch, ch.poses.stance, 1), finite = Object.values(P).every(([x, y]) => isFinite(x) && isFinite(y));
  const f = w.fighters[0], ok = [f.x, f.y, f.hp].every(isFinite);
  return { base, log: log.join(' '), tree, finite, ok, nBones: ids.size };
};`);

test(`rig fuzz: ${N} random editor-style body edits compile, keep a valid tree and fight with finite numbers`, () => {
  const bad = [];
  for (let seed = 1; seed <= N; seed++) {
    let r; try { r = JSON.parse(run(`JSON.stringify(rigFuzz(${seed}))`)); } catch (e) { bad.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!r.tree || !r.finite || !r.ok) bad.push(`seed ${seed} (${r.base}): tree ${r.tree} finite ${r.finite} fight ${r.ok} after ${r.log}`);
  }
  assert.deepEqual(bad, []);
});
