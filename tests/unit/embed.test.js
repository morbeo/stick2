// the embed config (src/ui/embed-schema.js): parsing the hash, presets, list edits, clamping, the round trip back to a hash,
// and the presets in profiles/embeds/ matching the generated src/ui/embed-presets.js
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..', '..');
const ctx = vm.createContext({ Buffer, URLSearchParams, console, JSON, Math, Object, Array, String, Number, encodeURIComponent, decodeURIComponent, escape, unescape });
for (const f of ['src/ui/embed-schema.js', 'src/ui/embed-presets.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const run = code => vm.runInContext(code, ctx);
const runJ = code => JSON.parse(run(`JSON.stringify(${code})`));
const parse = hash => JSON.parse(run(`JSON.stringify(parseEmbed(new URLSearchParams(${JSON.stringify(hash)}), EMBED_PRESETS))`));

test('defaults, and only embed keys make an embed', () => {
  const { cfg } = parse('ui=hud');
  assert.deepEqual(cfg.ui, ['hud']); assert.equal(cfg.persist, false); assert.equal(cfg.mute, true); assert.deepEqual(cfg.tools, ['play']);
  assert.equal(run(`isEmbedHash(new URLSearchParams('embed=vsai'))`), false); // the old #embed= link keeps its meaning
  assert.equal(run(`isEmbedHash(new URLSearchParams('preset=demo'))`), true);
});
test('a preset, then the hash on top: lists replaced, edited (+/-) or emptied (none)', () => {
  assert.deepEqual(parse('preset=arcade').cfg.ui, ['hud', 'timer']);
  assert.deepEqual(parse('preset=arcade&ui=-timer,+meter').cfg.ui, ['hud', 'meter']);
  assert.deepEqual(parse('preset=arcade&ui=labels').cfg.ui, ['labels']);
  assert.deepEqual(parse('preset=arcade&ui=none').cfg.ui, []);
  assert.deepEqual(parse('ui=hud,bogus').cfg.ui, ['hud']); // unknown values are dropped
});
test('values are checked: clamped numbers, booleans, enums; bad ones warn and keep the default', () => {
  assert.equal(parse('ui=hud&speed=9').cfg.speed, 2);
  assert.equal(parse('ui=hud&at=-4').cfg.at, 0);
  assert.equal(parse('ui=hud&edit').cfg.edit, true);
  assert.equal(parse('ui=hud&persist=off').cfg.persist, false);
  const r = parse('ui=hud&side=7&tool=play&focus=x'); // other hash keys (tool=, char=…) aren't the embed's: no warning
  assert.equal(r.cfg.side, '0'); assert.equal(r.cfg.focus, 'click');
  assert.ok(r.warnings.some(w => /bad value for side/.test(w)) && !r.warnings.some(w => /tool/.test(w)));
  assert.ok(parse('cfg=' + run(`embedCfgParam({ nope: 1 })`)).warnings.includes('cfg: unknown option "nope"'));
  assert.ok(parse('preset=nope').warnings.includes('no preset "nope"'));
});
test('cfg= carries a whole config as base64url JSON; the old embed= names the scenario', () => {
  const c = run(`embedCfgParam({ p1: 'bonko', ui: ['labels'], speed: 1.5 })`);
  const { cfg } = parse('cfg=' + c);
  assert.equal(cfg.p1, 'bonko'); assert.deepEqual(cfg.ui, ['labels']); assert.equal(cfg.speed, 1.5);
  assert.ok(parse('cfg=%%%').warnings.includes('cfg is not base64url JSON'));
  assert.equal(parse('embed=ai-vs-ai&ui=hud').cfg.scenario, 'ai-vs-ai');
});
test('embedHash round-trips every preset, with and without changes on top', () => {
  for (const p of Object.keys(run('EMBED_PRESETS'))) {
    for (const extra of ['', '&p1=bonko&ui=-hud&speed=0.5', '&controls=none&edit=1&replay=https%3A%2F%2Fx.org%2Fr.json&at=30&side=2']) {
      const a = parse(`preset=${p}${extra}`).cfg;
      for (const preset of [p, null]) {
        const h = run(`embedHash(${JSON.stringify(a)}, ${JSON.stringify(preset)}, EMBED_PRESETS)`);
        assert.deepEqual(parse(h).cfg, a, `${p}${extra} via ${h}`);
      }
    }
  }
});
test('every preset is valid and says what it is for', () => {
  for (const [name, p] of Object.entries(run('EMBED_PRESETS'))) {
    assert.ok(p.tip && p.tip.length > 20, `${name} has a tip`);
    const { warnings } = parse('preset=' + name);
    assert.deepEqual(warnings.filter(w => !/edits are lost|needs a replay|side only applies/.test(w)), [], name);
  }
});
test('the editing tabs need edit on', () => {
  assert.deepEqual(runJ(`embedToolsFor(parseEmbed(new URLSearchParams('tools=play,animate,gallery'), EMBED_PRESETS).cfg)`), ['play', 'gallery']);
  assert.deepEqual(runJ(`embedToolsFor(parseEmbed(new URLSearchParams('tools=play,animate&edit=1'), EMBED_PRESETS).cfg)`), ['play', 'animate']);
  assert.deepEqual(runJ(`embedToolsFor(parseEmbed(new URLSearchParams('tools=animate'), EMBED_PRESETS).cfg)`), ['play']);
});
test('src/ui/embed-presets.js is generated from profiles/embeds/', () => {
  execFileSync(process.execPath, [path.join(root, 'tools/dev/embed-presets.js'), '--check'], { stdio: 'pipe' });
});
test('the snippet escapes its src and loads lazily', () => {
  const s = run(`embedSnippet('https://x/#a="b"', 640, 360)`);
  assert.match(s, /src="https:\/\/x\/#a=&quot;b&quot;"/); assert.match(s, /loading="lazy"/); assert.match(s, /width="640" height="360"/);
});
test('docs/embed.md lists every option and every preset', () => {
  const md = fs.readFileSync(path.join(root, 'docs/embed.md'), 'utf8');
  for (const k of run('EMBED_KEYS')) assert.match(md, new RegExp('\\| `' + k + '` \\|'), `option ${k}`);
  for (const p of Object.keys(run('EMBED_PRESETS'))) assert.match(md, new RegExp('\\| `' + p + '` \\|'), `preset ${p}`);
});
