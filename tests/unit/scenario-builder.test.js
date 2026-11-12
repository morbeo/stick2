// the scenario builder (src/engine/scenarios.js) without a page, on the DOM stand-in (tests/unit/ui-stub.js): every control runs and
// the edited scenario still builds a fight; renaming, actors, props, items, settings, modes, the select screen, move limits, AI skill,
// built-ins previewed and reverted, the export / import / embed buttons; and the showcase replay and embed loading
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load(['core', 'rig', 'fx', 'effects', 'roster', 'fighter', 'world', 'stage', 'brain', 'checks', 'events', 'scenarios']);
run(require('./ui-stub'));
run(`var fake = () => new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k in t ? t[k] : fake(), set: () => true, apply: () => fake() });
var built = 0, stages = [], panels = () => {}, setTheater = () => {}, build = () => { built++; }, setMode = m => { lab.mode = m; };
var lab = { scen: null, chars: [], inv: [], mode: 'play' }, withInv = s => s, optLabel = String, drawThumb = () => {};
var DEFS = CHARS, rosterKeys = () => Object.keys(CHARS), closeStage = () => stages.push('closed'), openStage = s => stages.push(s);
var charCard = (k, pick, on) => button(k, 'card ' + k, () => pick(k));
var fuzzyFinder = ({ candidates, text = String, onPick, limit = 8, render }) => el('div', { cls: 'finder' }, candidates().slice(0, limit).map(c => render(c, () => onPick(c))));
var URL = { createObjectURL: () => 'blob:x' }, location = { origin: 'https://example.org', pathname: '/stick2/' }, Blob = function (p) { this.p = p; };
var clipboard = '', navigator = { clipboard: { writeText: async t => { clipboard = t; }, readText: async () => clipboard } };
var builder = () => { FAKE.regs = []; return scenBuilder(); };
var pick = (root, label) => controls(root).find(c => typeof c.label === 'string' && (c.label === label || c.label.startsWith(label)));
var tap = c => Promise.all(c.fire('click'));
// the bar of the builder holding fighter i (its data-p)
var actor = (root, i) => walk(root).find(e => e.dataset?.p === i);
// a user scenario with something in every section: three actors (AI, script, dummy), a prop, an item, a setting, the select screen
var rich3 = name => { const u = fromScen(SCENARIOS['ai vs ai'], null);
  u.p[1].ctl = 'script'; u.p[1].script = '0.2, punch'; u.p.push({ char: null, ctl: 'dummy', script: '', x: 600, away: true, team: 1, inv: 'nodamage' });
  u.props = [{ type: 'crate', x: 200 }]; u.items = [{ type: 'sword', x: 300 }]; u.cfg = { hitstop: CFG.hitstop }; u.select = true; u.roster = [];
  myStore[name] = u; saveScens(); lab.scen = name; return u; };
var fight = name => { const w = new World(SCENARIOS[name], {}, 3); w.loop = false; for (let i = 0; i < 60; i++) w.advance(1 / 60, NOIN); return w.fighters.length; };`);
const js = src => JSON.parse(run(`JSON.stringify((() => { ${src} })())`));
const ajs = async src => JSON.parse(await run(`(async () => { ${src} })().then(r => JSON.stringify(r))`));

test('every control in the builder and its popups runs, and the scenario still builds a fight', async () => {
  const r = await ajs(`
    rich3('sweep'); const errors = [], n = controls(builder()).length; let clicked = 0, fields = 0;
    for (let i = 0; i < n; i++) { // the controls of the scenario as it started (adding an actor adds controls)
      const c = controls(builder())[i]; if (!c) break;
      if (/^:delete: delete|^:undo: revert/.test(c.label)) continue; // they close the builder: checked on their own below
      try {
        FAKE.pop = null; await tap(c); clicked++;
        const pop = FAKE.pop; if (pop) for (const p of controls(pop)) { await tap(p); clicked++; }
        lab.scen = 'sweep'; refresh();
      } catch (e) { errors.push((c.label || c.tip) + ': ' + e.message); }
    }
    for (let i = 0; i < walk(builder()).length; i++) {
      const f = walk(builder())[i]; if (!f || f.tag !== 'input' || f.type === 'file') continue;
      try { f.onkeydown?.({ stopPropagation() {} }); if (f.onchange) { f.onchange({ target: { value: /script/.test(f.className) ? '0.1, kick' : f.value } }); fields++; } }
      catch (e) { errors.push('field ' + f.className + ': ' + e.message); }
    }
    for (const k of Object.keys(myStore)) if (k !== 'sweep') delete myStore[k]; saveScens();
    return { errors, clicked, fields, fighters: fight('sweep') };`);
  assert.deepEqual(r.errors, []);
  assert.ok(r.clicked > 60, `only ${r.clicked} controls clicked`);
  assert.ok(r.fields >= 1, 'the name box at least');
  assert.ok(r.fighters >= 2);
  run(`delete myStore.sweep; saveScens();`);
});

test('the name: a new one moves the scenario, a built-in\'s or an empty one is put back', () => {
  const r = js(`
    rich3('mine'); const nm = () => walk(builder()).find(e => e.className === 'macro sname');
    let n = nm(); n.value = 'you vs dummy'; n.onchange(); const kept = [n.value, lab.scen];
    n = nm(); n.value = '  '; n.onchange(); const blank = n.value;
    n = nm(); n.value = 'renamed'; n.onchange(); const moved = [lab.scen, !!myStore.renamed, 'mine' in myStore, !!SCENARIOS.renamed?.user];
    delete myStore.renamed; saveScens();
    return { kept, blank, moved };`);
  assert.deepEqual(r.kept, ['mine', 'mine']);
  assert.equal(r.blank, 'mine');
  assert.deepEqual(r.moved, ['renamed', true, false, true]);
});

test('actors: controllers, a script, position, back turned, invulnerability, team, weapon, AI style; added, copied and removed', async () => {
  const r = await ajs(`
    const u = rich3('act'), out = {};
    controls(actor(builder(), 0)).find(c => c.tag === 'seg' && c.opts.includes('script')).set('script');
    walk(actor(builder(), 0)).find(e => e.className === 'macro script').onchange({ target: { value: '0.5, kick' } });
    out.script = Array.isArray(SCENARIOS.act.a) && SCENARIOS.act.a.length;
    controls(actor(builder(), 0)).find(c => c.tag === 'seg' && c.opts.includes('script')).set('AI');
    const a0 = () => controls(actor(builder(), 0));
    a0().find(c => c.tag === 'slider').set(120); out.x = SCENARIOS.act.ax;
    await tap(a0().find(c => c.label === ':swap_horiz: back turned')); out.away = typeof SCENARIOS.act.init;
    a0().find(c => c.tag === 'seg' && c.opts.includes('untouchable')).set('untouchable'); out.inv = SCENARIOS.act.aover?.inv;
    a0().find(c => c.tag === 'seg' && c.opts.includes('untouchable')).set('off'); out.noInv = SCENARIOS.act.aover?.inv;
    const weapon = Object.keys(WEAPONS)[0]; a0().find(c => c.tag === 'seg' && c.opts.includes('none')).set(weapon); out.weapon = SCENARIOS.act.aw;
    a0().find(c => c.tag === 'seg' && c.opts.includes('none')).set('none'); out.noWeapon = SCENARIOS.act.aw;
    const style = Object.keys(AI_STYLES).find(s => s !== 'balanced'); a0().find(c => c.tag === 'seg' && c.opts.includes('balanced')).set(style); out.style = SCENARIOS.act.aover?.aiStyle;
    a0().find(c => c.tag === 'seg' && c.opts.includes('balanced')).set('balanced'); out.balanced = SCENARIOS.act.aover?.aiStyle;
    FAKE.pop = null; await tap(a0().find(c => /^T\\d/.test(c.label))); await tap(pick(FAKE.pop, ':add: new team')); out.team = u.p[0].team;
    await tap(a0().find(c => /^T\\d/.test(c.label))); await tap(pick(FAKE.pop, 'T2')); out.joined = u.p[0].team;
    await tap(pick(builder(), ':add: add actor')); out.actors = u.p.length;
    await tap(controls(actor(builder(), 3)).find(c => c.label === ':content_copy:')); out.copied = u.p.length;
    await tap(controls(actor(builder(), 4)).find(c => c.label === ':close:')); out.removed = u.p.length;
    out.more = SCENARIOS.act.more.length; out.fighters = fight('act');
    delete myStore.act; saveScens();
    return out;`);
  assert.ok(r.script > 0, 'a script controller plays its script');
  assert.equal(r.x, 120);
  assert.equal(r.away, 'function');
  assert.equal(r.inv, 'untouchable');
  assert.equal(r.noInv, undefined);
  assert.ok(r.weapon);
  assert.equal(r.noWeapon, undefined);
  assert.ok(r.style);
  assert.equal(r.balanced, undefined);
  assert.equal(r.team, 2);
  assert.equal(r.joined, 1);
  assert.deepEqual([r.actors, r.copied, r.removed, r.more], [4, 5, 4, 2]);
  assert.equal(r.fighters, 4);
});

test('the character picker: follow the editor, random, or a card', async () => {
  const r = await ajs(`
    const u = rich3('chars'), card = () => controls(actor(builder(), 1)).find(c => c.tip?.startsWith('P2\\'s character'));
    const k = Object.keys(CHARS).at(-1); FAKE.pop = null; await tap(card()); await tap(pick(FAKE.pop, k)); const picked = u.p[1].char;
    await tap(card()); await tap(pick(FAKE.pop, ':casino: random')); const random = u.p[1].char in CHARS;
    await tap(card()); await tap(pick(FAKE.pop, ':edit: editor')); const editor = u.p[1].char;
    delete myStore.chars; saveScens();
    return { picked, k, random, editor };`);
  assert.equal(r.picked, r.k);
  assert.ok(r.random);
  assert.equal(r.editor, null);
});

test('props and items: added, retyped, moved and removed; they reach the fight', async () => {
  const r = await ajs(`
    const u = rich3('props'), out = {}, row = (key, i) => walk(builder()).find(e => e.dataset?.[key] === i);
    await tap(pick(builder(), ':add: add prop')); out.props = SCENARIOS.props.props.length;
    const kinds = Object.keys(PROPS); controls(row('pr', 1)).find(c => c.tag === 'seg').set(kinds.at(-1)); out.kind = u.props[1].type;
    controls(row('pr', 1)).find(c => c.tag === 'slider').set(450); out.px = SCENARIOS.props.props[1].x;
    await tap(controls(row('pr', 0)).find(c => c.label === ':close:')); out.leftProps = u.props.length;
    await tap(pick(builder(), ':add: add weapon')); out.items = SCENARIOS.props.items.length;
    controls(row('it', 1)).find(c => c.tag === 'seg').set(Object.keys(WEAPONS).at(-1)); controls(row('it', 1)).find(c => c.tag === 'slider').set(500); out.ix = u.items[1].x;
    await tap(controls(row('it', 0)).find(c => c.label === ':close:')); await tap(controls(row('it', 0)).find(c => c.label === ':close:'));
    out.noItems = SCENARIOS.props.items; out.fighters = fight('props');
    delete myStore.props; saveScens();
    return out;`);
  assert.equal(r.props, 2);
  assert.ok(r.kind);
  assert.equal(r.px, 450);
  assert.equal(r.leftProps, 1);
  assert.equal(r.items, 2);
  assert.equal(r.ix, 500);
  assert.equal(r.noItems, undefined);
  assert.ok(r.fighters >= 2);
});

test('the scenario\'s own settings, restart period, stage, mode and select screen', async () => {
  const r = await ajs(`
    const u = rich3('cfg'), out = {}, b = () => builder();
    const first = controls(walk(b()).find(e => e.className === 'finder'))[0]; await tap(first); out.added = Object.keys(u.cfg).length;
    await tap(controls(b()).filter(c => c.tip?.startsWith('Drop ')).at(-1)); out.dropped = Object.keys(u.cfg).length;
    const bool = SCHEMA.find(s => !Array.isArray(s) && typeof s.v === 'boolean'), opt = SCHEMA.find(s => !Array.isArray(s) && s.opts);
    u.cfg[bool.k] = CFG[bool.k]; u.cfg[opt.k] = CFG[opt.k];
    await tap(pick(b(), bool.k)); out.bool = u.cfg[bool.k] !== CFG[bool.k];
    controls(b()).find(c => c.tag === 'seg' && c.opts === opt.opts).set(opt.opts.at(-1)); out.opt = u.cfg[opt.k];
    const old = CFG.hitstop; CFG.hitstop = old + 1; await tap(pick(b(), ':tune: take my settings')); out.taken = u.cfg.hitstop === old + 1; CFG.hitstop = old;
    controls(b()).find(c => c.label === 'restart').set(4); out.period = SCENARIOS.cfg.period;
    const stage = Object.keys(STAGES).find(s => s !== 'plain'); controls(b()).find(c => c.tag === 'seg' && c.opts.includes('plain')).set(stage); out.stage = SCENARIOS.cfg.stage;
    controls(b()).find(c => c.tag === 'seg' && c.opts.includes('plain')).set('plain'); out.plain = SCENARIOS.cfg.stage;
    const modes = controls(b()).find(c => c.tag === 'seg' && c.opts.includes('waves'));
    modes.set('rumble'); out.rumble = SCENARIOS.cfg.rumble; modes.set('normal'); out.normal = [SCENARIOS.cfg.waves, SCENARIOS.cfg.rumble];
    const k = Object.keys(CHARS)[0]; await tap(controls(b()).find(c => c.tip === 'card ' + k)); out.roster = SCENARIOS.cfg.roster?.slice();
    await tap(controls(b()).find(c => c.tip === 'card ' + k)); out.unroster = SCENARIOS.cfg.roster;
    await tap(pick(b(), ':sports_kabaddi: select screen')); out.select = [SCENARIOS.cfg.select, controls(b()).some(c => c.tip?.startsWith('card '))];
    delete myStore.cfg; saveScens();
    return { ...out, opts: opt.opts.at(-1) };`);
  assert.equal(r.added, 2);
  assert.equal(r.dropped, 1);
  assert.ok(r.bool);
  assert.equal(r.opt, r.opts);
  assert.ok(r.taken);
  assert.equal(r.period, 4);
  assert.ok(r.stage);
  assert.equal(r.plain, undefined);
  assert.equal(r.rumble, true);
  assert.deepEqual(r.normal, [null, null], 'normal: neither waves nor rumble');
  assert.equal(r.roster.length, 1);
  assert.equal(r.unroster, undefined);
  assert.deepEqual(r.select, [null, false]);
});

test('move limits and AI skill: set, adjusted, removed; a skill back at the level\'s value is dropped', async () => {
  const r = await ajs(`
    const u = rich3('lim'), out = {}, a0 = () => controls(actor(builder(), 0));
    FAKE.pop = null; await tap(a0().find(c => c.label === ':block: limits')); let p = FAKE.pop;
    const mv = controls(p).find(c => c.tip?.startsWith('Cap ')); await tap(mv); out.limit = Object.values(u.p[0].limits);
    await tap(a0().find(c => c.label === ':block: limits')); p = FAKE.pop; refresh();
    controls(p).find(c => c.tag === 'slider').set(0); out.banned = Object.values(SCENARIOS.lim.aover.limits);
    await tap(controls(p).find(c => c.label === ':close:')); out.unlimited = u.p[0].limits;
    await tap(a0().find(c => c.label === ':tune: skill')); p = FAKE.pop;
    const s0 = controls(p).find(c => c.tag === 'slider'); s0.set(0.99); out.skill = { ...u.p[0].aiSkill };
    const base = AI_LEVELS[CFG.aiLevel] || AI_LEVELS.normal; s0.set(base[Object.keys(AI_SKILL_TIPS)[0]]); out.unskilled = u.p[0].aiSkill;
    delete myStore.lim; saveScens();
    return out;`);
  assert.deepEqual(r.limit, [3]);
  assert.deepEqual(r.banned, [0]);
  assert.equal(r.unlimited, undefined);
  assert.deepEqual(r.skill, { react: 0.99 });
  assert.equal(r.unskilled, undefined);
});

test('a built-in opened in the builder is only previewed until changed; revert restores it; a deleted one closes the builder', async () => {
  const r = await ajs(`
    lab.scen = 'ai vs dummy'; let b = builder(); const previewed = 'ai vs dummy' in myStore;
    controls(b).find(c => c.label === 'restart').set(2); const saved = ['ai vs dummy' in myStore, SCENARIOS['ai vs dummy'].period];
    await tap(pick(builder(), ':undo: revert')); const reverted = ['ai vs dummy' in myStore, SCENARIOS['ai vs dummy'] === BASE_SCENARIOS['ai vs dummy']];
    rich3('gone'); stages.length = 0; await tap(pick(builder(), ':delete: delete')); const deleted = ['gone' in myStore, lab.scen, stages.slice()];
    lab.scen = 'no such scenario'; stages.length = 0; builder(); const closed = stages.slice();
    return { previewed, saved, reverted, deleted, closed };`);
  assert.equal(r.previewed, false);
  assert.deepEqual(r.saved, [true, 2]);
  assert.deepEqual(r.reverted, [false, true]);
  assert.deepEqual(r.deleted, [false, 'you vs dummy', ['closed']]);
  assert.deepEqual(r.closed, ['closed']);
});

test('the builder\'s bar: experiment, copy, export, clipboard copy and paste, import a file, embed link', async () => {
  const r = await ajs(`
    rich3('bar'); const out = {}, b = () => builder();
    await tap(pick(b(), ':science: test in experiment')); out.exp = [lab.mode, lab.kind, lab.rows];
    lab.scen = 'bar'; stages.length = 0; await tap(pick(b(), ':content_copy: copy')); out.copy = [lab.scen, lab.scen in myStore, stages.slice()];
    lab.scen = 'bar'; await tap(pick(b(), ':download: export'));
    await tap(pick(b(), ':content_copy: copy all')); out.copied = Object.keys(JSON.parse(clipboard));
    clipboard = JSON.stringify({ pasted: myStore.bar }); await tap(pick(b(), ':content_copy: paste all')); out.pasted = !!SCENARIOS.pasted?.user;
    clipboard = 'not json'; await tap(pick(b(), ':content_copy: paste all'));
    await tap(pick(b(), ':upload: import')); FAKE.input.files = [{ text: async () => JSON.stringify({ imported: myStore.bar }) }]; await FAKE.input.onchange(); out.imported = !!SCENARIOS.imported?.user;
    await tap(pick(b(), ':content_copy: embed link')); out.embed = clipboard.startsWith('https://example.org/stick2/#embed=');
    out.back = JSON.parse(decodeURIComponent(clipboard.split('#embed=')[1])).p.length;
    for (const k of Object.keys(myStore)) delete myStore[k]; saveScens();
    return out;`);
  assert.deepEqual(r.exp, ['experiment', 'sweep', ['bar']]);
  assert.equal(r.copy[0], 'my scenario 1');
  assert.ok(r.copy[1]);
  assert.deepEqual(r.copy[2], ['builder']);
  assert.ok(r.copied.includes('bar'));
  assert.ok(r.pasted && r.imported && r.embed);
  assert.equal(r.back, 3);
});

test('the showcase as a replay with a bookmark per beat; an embed value loads its fight, a bad one is logged', () => {
  const r = js(`
    const rep = showcaseReplay(), out = { frames: rep.frames.length, marks: rep.marks.length === scriptBookmarks(SCENARIOS.showcase.a).length };
    lab.scen = null; loadEmbedScenario('vsai'); out.loaded = [lab.scen, lab.mode];
    const err = console.error; let logged = ''; console.error = m => { logged = m; };
    try { out.bad = resolveEmbedScenario('{nope'); loadEmbedScenario('{nope'); } finally { console.error = err; }
    out.logged = logged;
    return out;`);
  assert.ok(r.frames > 60);
  assert.ok(r.marks);
  assert.deepEqual(r.loaded, ['you vs ai', 'play']);
  assert.equal(r.bad, null);
  assert.match(r.logged, /bad #embed value/);
});
