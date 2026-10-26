// picture tests: how every roster character looks, pinned. Each one is drawn (drawFigure, the same call the game makes) into a
// recording 2D context in its rest pose and 40% of the way through every one of its moves (keyframe time); the drawing commands, coordinates rounded to
// a tenth of a pixel, must match the snapshot. Vector, not pixels: the same on every machine and every Chrome. The snapshot keeps
// one line per pose (its name, how many commands, a hash of them), so a diff names what changed without storing megabytes.
// An intended look change: UPDATE=1 npm test rewrites tests/unit/snapshots/pictures.txt (review which poses changed)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), load = require('./load');
const { run } = load();
const FILE = path.join(__dirname, 'snapshots', 'pictures.txt'), crypto = require('crypto');
run(`var recCtx = () => { const out = [], r = v => typeof v === 'number' ? Math.round(v * 10) / 10 : v;
  const ctx = new Proxy({}, { get: (t, k) => k === 'out' ? out : k in t ? t[k] : (...a) => { out.push(k + ' ' + a.map(r).join(' '));
      return /Gradient$/.test(k) ? { addColorStop: () => {} } : undefined; },
    set: (t, k, v) => { if (/^(fillStyle|strokeStyle|lineWidth|globalAlpha)$/.test(k)) out.push(k + '=' + r(v)); t[k] = v; return true; } });
  return ctx; };
  var picture = (ch, pose) => { const c = recCtx(); drawFigure(c, ch, fk(ch, pose, 1), '#222', '#888'); return c.out; };`);

const names = JSON.parse(run('JSON.stringify(Object.keys(CHARS))'));
const lines = names.flatMap(name => JSON.parse(run(`JSON.stringify((() => { const ch = CHARS[${JSON.stringify(name)}];
  const poses = [['rest', ch.poses.stance], ...Object.entries(ch.moves).filter(([, m]) => m.keys?.length).map(([k, m]) => [k, { ...ch.poses.stance, ...samplePose(ch, m, m.keys.reduce((s, x) => s + x.d, 0) * 0.4) }])];
  return poses.map(([k, p]) => [k, picture(ch, p)]); /* a layer move poses only its own bones: over the rest pose */ })())`))
  .map(([k, cmds]) => ({ name, key: `${name} ${k}`, bad: cmds.some(c => /NaN|Infinity/.test(c)), line: `${name} ${k} ${cmds.length} ${crypto.createHash('sha1').update(cmds.join('\n')).digest('hex').slice(0, 12)}` })));

test('pictures: every pose draws with finite coordinates only', () => {
  assert.deepEqual(lines.filter(l => l.bad).map(l => l.key), []);
});
test(`pictures: ${names.length} characters at rest and mid-move look as in the snapshot`, () => {
  const text = lines.map(l => l.line).join('\n') + '\n';
  if (process.env.UPDATE || !fs.existsSync(FILE)) fs.writeFileSync(FILE, text);
  const want = new Map(fs.readFileSync(FILE, 'utf8').trim().split('\n').map(l => [l.split(' ').slice(0, -2).join(' '), l]));
  const changed = lines.filter(l => want.get(l.key) !== l.line).map(l => l.key), gone = [...want.keys()].filter(k => !lines.some(l => l.key === k));
  assert.ok(!changed.length && !gone.length, `looks changed: ${[...changed, ...gone.map(k => k + ' (gone)')].join(', ')}\nintended? UPDATE=1 npm test, then review tests/unit/snapshots/pictures.txt`);
});
