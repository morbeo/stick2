// the scenario builder panel (src/engine/scenarios.js scenBuilder) without a page: tests/unit/ui-stub.js stands in for the DOM
// toolkit, so every control can be found and run, and the saved store, the popups and the embed link can be checked
const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load');
const { run } = load([...require('../../tools/lib/engine').ENGINE, 'scenarios']);
run(require('./ui-stub'));
run(`var setMode = m => { lab.mode = m; }, setTheater = () => {}, build = () => { builds++; }, panels = () => {}, builds = 0, stageClosed = 0, stageOpened = [],
  closeStage = () => { stageClosed++; }, openStage = n => { stageOpened.push(n); }, lab = { scen: 'you vs dummy', chars: [null, null], mode: 'play' },
  withInv = s => s, optLabel = String, DEFS = Object.fromEntries(Object.keys(CHARS).map(k => [k, {}])),
  rosterKeys = () => Object.keys(CHARS), drawThumb = () => {}, charCard = (k, pick, on) => { const c = ctl('card', k, '', () => pick(k)); c.on = on(k); return c; },
  URL = { createObjectURL: () => 'blob:x' }, Blob = function (p) { this.p = p; }, location = { origin: 'http://x', pathname: '/app' }, navigator = { clipboard: { text: '', writeText(t) { this.text = t; }, async readText() { return this.text; } } },
  fuzzyFinder = o => { const e = el('div', {}, [button('x', '', () => {})]); e.o = o; return e; };`);
const js = src => JSON.parse(run(`JSON.stringify((() => { ${src} })())`));
const ajs = async src => JSON.parse(await run(`(async () => { ${src} })().then(r => JSON.stringify(r))`));

run(`var reset = () => { for (const k of Object.keys(myStore)) delete myStore[k]; saveScens(); preview = null; builds = 0; stageClosed = 0; stageOpened.length = 0; FAKE.pop = null; FAKE.regs = [];
    Object.assign(lab, { scen: 'you vs dummy', mode: 'play' }); delete lab.rows; navigator.clipboard.text = ''; },
  B = name => { lab.scen = name; FAKE.regs = []; return scenBuilder(); },
  by = (root, label, i = 0) => controls(root).filter(c => typeof c.label === 'string' && (c.label === label || c.label.startsWith(label)))[i],
  hit = (root, label, i = 0) => { const c = by(root, label, i); c.act({}, c); return c; },
  row = (root, key, i) => walk(root).find(e => e.dataset && e.dataset[key] === i),
  inPop = label => { const c = controls(FAKE.pop).find(c => c.label === label || (typeof c.label === 'string' && c.label.startsWith(label))); c.act({}, c); return c; },
  made = [], h0 = h, h = (tag, props, ...kids) => { const e = h0(tag, props, ...kids); made.push(e); return e; };`);

test('editing a built-in saves it as one of my scenarios, and every fighter control changes it', () => {
  const r = js(`reset(); const root = B('ai vs ai'), out = {};
    out.previewed = !myStore['ai vs ai'];
    const p0 = () => row(root, 'p', 0);
    controls(p0()).find(c => c.tip?.startsWith("P1's character")).act({}, {}); inPop(':edit: editor'); controls(p0()).find(c => c.tip?.startsWith("P1's character")).act({}, {});
    inPop(':casino: random'); controls(p0()).find(c => c.tip?.startsWith("P1's character")).act({}, {}); inPop('grumbo');
    out.saved = !!myStore['ai vs ai']; out.char = myStore['ai vs ai'].p[0].char;
    for (const v of ['you', 'dummy', 'script', 'AI']) row(root, 'p', 0).children.find(c => c.opts?.[0] === 'you').set(v);
    out.ctl = myStore['ai vs ai'].p[0].ctl;
    const script = controls(row(root, 'p', 0)).length; // the row is rebuilt on every change
    row(root, 'p', 0).children.find(c => c.opts?.[0] === 'you').set('script');
    const inp = walk(row(root, 'p', 0)).find(e => e.tag === 'input'); inp.onchange({ target: { value: 'punch, 0.5, kick' } });
    out.script = myStore['ai vs ai'].p[0].script;
    row(root, 'p', 0).children.find(c => c.opts?.[0] === 'you').set('AI');
    const rr = () => row(root, 'p', 0), bySeg = first => walk(rr()).find(c => c.opts?.[0] === first);
    controls(rr()).find(c => c.label === 'x').act({}, {}); out.x = myStore['ai vs ai'].p[0].x;
    controls(rr()).find(c => c.label?.startsWith(':swap_horiz:')).act({}, {}); out.away = myStore['ai vs ai'].p[0].away;
    bySeg('off').set('nodamage'); out.inv = myStore['ai vs ai'].p[0].inv; bySeg('off').set('off'); out.invOff = 'inv' in myStore['ai vs ai'].p[0];
    bySeg('none').set(Object.keys(WEAPONS)[0]); out.weapon = myStore['ai vs ai'].p[0].weapon; bySeg('none').set('none'); out.weaponOff = 'weapon' in myStore['ai vs ai'].p[0];
    bySeg('balanced').set(Object.keys(AI_STYLES)[1]); out.style = myStore['ai vs ai'].p[0].aiStyle; bySeg('balanced').set('balanced'); out.styleOff = 'aiStyle' in myStore['ai vs ai'].p[0];
    return out;`);
  assert.equal(r.previewed, true);
  assert.equal(r.saved, true);
  assert.equal(r.char, 'grumbo');
  assert.equal(r.ctl, 'AI');
  assert.equal(r.script, 'punch, 0.5, kick');
  assert.ok(r.x > 0);
  assert.equal(r.away, true);
  assert.equal(r.inv, 'nodamage');
  assert.equal(r.invOff, false);
  assert.ok(r.weapon);
  assert.equal(r.weaponOff, false);
  assert.ok(r.style);
  assert.equal(r.styleOff, false);
});

test('the team, skill and limits popups edit the fighter they belong to', () => {
  const r = js(`reset(); const root = B('ai vs ai'), out = {}, p0 = () => row(root, 'p', 0);
    controls(p0()).find(c => c.tip?.startsWith('Team:')).act({}, {}); inPop('T1'); out.team = myStore['ai vs ai'].p[0].team;
    controls(p0()).find(c => c.tip?.startsWith('Team:')).act({}, {}); inPop(':add: new team'); out.newTeam = myStore['ai vs ai'].p[0].team;
    controls(p0()).find(c => c.tip?.startsWith('Team:')).act({}, {}); inPop(':person: solo'); out.solo = myStore['ai vs ai'].p[0].team;
    controls(p0()).find(c => c.label === ':tune: skill').act({}, {});
    const sk = controls(FAKE.pop).filter(c => c.set); out.skills = sk.length; sk[0].set(0.9); out.skill = { ...myStore['ai vs ai'].p[0].aiSkill };
    sk[0].set(AI_LEVELS[CFG.aiLevel].react); out.skillBack = 'aiSkill' in myStore['ai vs ai'].p[0];
    controls(p0()).find(c => c.label === ':block: limits').act({}, {});
    const lf = walk(FAKE.pop).find(e => e.o); out.cands = lf.o.candidates().length > 0;
    const mv = lf.o.candidates()[0]; lf.o.onPick(mv); out.limit = { ...myStore['ai vs ai'].p[0].limits }; refresh();
    const pop = FAKE.pop; const rowsBox = walk(pop).find(e => e.className === 'bar' || e.tag === 'div');
    const lf2 = lf.o.render(mv, () => {}); out.rendered = !!lf2;
    // the rows redraw on each change: a slider changes the count, the close button drops the limit
    controls(FAKE.pop).find(c => c.set)?.set(5); out.count = Object.values(myStore['ai vs ai'].p[0].limits)[0];
    controls(FAKE.pop).find(c => c.label === ':close:')?.act({}, {}); out.dropped = 'limits' in myStore['ai vs ai'].p[0];
    return out;`);
  assert.equal(r.team, 0);
  assert.ok(r.newTeam > 1);
  assert.ok(r.solo > r.newTeam);
  assert.ok(r.skills >= 6);
  assert.equal(r.skill.react, 0.9);
  assert.equal(r.skillBack, false);
  assert.ok(r.cands && r.rendered);
  assert.equal(r.limit[Object.keys(r.limit)[0]], 3);
  assert.equal(r.count, 5);
  assert.equal(r.dropped, false);
});

test('actors, props and weapons on the floor can be added, changed, copied and removed', () => {
  const r = js(`reset(); const root = B('ai 2v2'), out = {}, n = () => myStore['ai 2v2'].p.length, k0 = SCENARIOS['ai 2v2'].more?.length ?? 0;
    out.start = curU().p.length;
    hit(root, ':add: add actor'); out.added = n();
    controls(row(root, 'p', n() - 1)).find(c => c.tip?.startsWith('Add another actor')).act({}, {}); out.copied = n();
    controls(row(root, 'p', n() - 1)).find(c => c.tip?.startsWith('Remove P')).act({}, {}); out.removed = n();
    hit(root, ':add: add prop'); const pr = () => row(root, 'pr', 0);
    out.prop = myStore['ai 2v2'].props.length;
    walk(pr()).find(c => c.opts).set(Object.keys(PROPS).at(-1)); out.propType = myStore['ai 2v2'].props[0].type;
    controls(pr()).find(c => c.label === 'x').act({}, {}); out.propX = myStore['ai 2v2'].props[0].x;
    controls(pr()).find(c => c.tip === 'Remove this prop').act({}, {}); out.propGone = myStore['ai 2v2'].props.length;
    hit(root, ':add: add weapon'); const it = () => row(root, 'it', 0);
    walk(it()).find(c => c.opts).set(Object.keys(WEAPONS).at(-1)); out.itemType = myStore['ai 2v2'].items[0].type;
    controls(it()).find(c => c.label === 'x').act({}, {}); out.itemX = myStore['ai 2v2'].items[0].x;
    controls(it()).find(c => c.tip === 'Remove this item').act({}, {}); out.itemGone = myStore['ai 2v2'].items.length;
    out.builds = builds > 6;
    return out;`);
  assert.equal(r.added, r.start + 1);
  assert.equal(r.copied, r.added + 1);
  assert.equal(r.removed, r.added);
  assert.equal(r.prop, 1);
  assert.ok(r.propType);
  assert.ok(r.propX > 0);
  assert.equal(r.propGone, 0);
  assert.ok(r.itemType);
  assert.ok(r.itemX > 0);
  assert.equal(r.itemGone, 0);
  assert.ok(r.builds);
});

test('the scenario-wide controls: restart, stage, mode, settings, select screen', () => {
  const r = js(`reset(); const root = B('you vs dummy'), out = {};
    controls(root).find(c => c.label === 'restart').act({}, {}); out.period = myStore['you vs dummy'].period;
    const stages = Object.keys(STAGES), seg = first => walk(root).find(c => c.opts?.[0] === first);
    seg(stages[0]).set(stages[1]); out.stage = myStore['you vs dummy'].stage; seg(stages[0]).set('plain'); out.plain = myStore['you vs dummy'].stage;
    for (const m of ['waves', 'survival', 'rumble', 'normal']) { seg('normal').set(m); out[m] = myStore['you vs dummy'].mode; }
    // a setting: bring one by name through the finder, edit it, drop it
    const finder = walk(root).find(e => e.o?.placeholder === 'add a setting…').o, cand = finder.candidates(); out.cands = cand.length > 0;
    const num = cand.find(s => s.v !== undefined && typeof s.v !== 'boolean' && !s.opts), bool = cand.find(s => typeof s.v === 'boolean'), opts = cand.find(s => s.opts);
    for (const s of [num, bool, opts].filter(Boolean)) { finder.onPick(s); finder.render(s, () => {}); }
    out.cfg = Object.keys(myStore['you vs dummy'].cfg);
    for (const k of out.cfg) { const c = controls(root).find(c => c.tip === 'Drop ' + k + ': the live setting applies'); c.act({}, {}); }
    out.dropped = Object.keys(myStore['you vs dummy'].cfg).length;
    CFG.hitstop = DEFAULTS.hitstop + 1; hit(root, ':tune: take my settings'); out.taken = myStore['you vs dummy'].cfg.hitstop === CFG.hitstop; CFG.hitstop = DEFAULTS.hitstop;
    hit(root, ':sports_kabaddi: select screen'); out.select = myStore['you vs dummy'].select;
    const card = controls(root).find(c => c.tag === 'card'); card.act({}, {}); out.roster = myStore['you vs dummy'].roster.length; card.act({}, {}); out.rosterEmpty = myStore['you vs dummy'].roster.length;
    hit(root, ':sports_kabaddi: select screen'); out.selectOff = myStore['you vs dummy'].select;
    return out;`);
  assert.ok(r.period > 0);
  assert.ok(r.stage);
  assert.equal(r.plain, undefined);
  assert.equal(r.waves, 'waves');
  assert.equal(r.survival, 'survival');
  assert.equal(r.rumble, 'rumble');
  assert.equal(r.normal, undefined);
  assert.ok(r.cands);
  assert.ok(r.cfg.length >= 2);
  assert.equal(r.dropped, 0);
  assert.ok(r.taken);
  assert.equal(r.select, true);
  assert.equal(r.roster, 1);
  assert.equal(r.rosterEmpty, 0);
  assert.equal(r.selectOff, false);
});

test('the header: rename, test in experiment, copy, export / import, embed link, revert and delete', async () => {
  const r = await ajs(`reset(); const out = {}; let root = B('you vs dummy');
    hit(root, ':science: test in experiment'); out.exp = [lab.kind, lab.rows, lab.mode];
    const nm = walk(root).find(e => e.tag === 'input' && e.className === 'macro sname'); nm.value = 'ai vs ai'; nm.onchange(); out.clash = lab.scen;
    nm.value = ' '; nm.onchange(); out.blank = lab.scen; out.reset = nm.value;
    hit(root, ':content_copy: copy'); out.copy = [lab.scen, stageOpened.at(-1), !!myStore['my scenario 1']];
    root = B('my scenario 1'); const nm2 = walk(root).find(e => e.tag === 'input' && e.className === 'macro sname');
    nm2.value = 'renamed'; nm2.onchange(); out.renamed = [lab.scen, !!myStore.renamed, 'my scenario 1' in myStore];
    root = B('renamed'); hit(root, ':download: export'); out.saved = [made.at(-1).tag, made.at(-1).download];
    hit(root, ':content_copy: copy all'); out.copied = Object.keys(JSON.parse(navigator.clipboard.text));
    const json = navigator.clipboard.text; delete myStore.renamed; saveScens(); root = B('you vs dummy');
    hit(root, ':upload: import'); const inp = made.at(-1); inp.files = [{ text: async () => json }]; await Promise.all(inp.fire('change')); out.imported = !!myStore.renamed; delete myStore.renamed; saveScens();
    await Promise.all(hit(root, ':content_copy: paste all').fire('click')); out.pasted = !!myStore.renamed;
    root = B('you vs dummy'); out.link = (() => { hit(root, ':content_copy: embed link'); return navigator.clipboard.text; })();
    root = B('renamed'); hit(root, ':delete: delete'); out.deleted = [!!myStore.renamed, lab.scen, stageClosed];
    myStore['ai vs ai'] = fromScen(SCENARIOS['ai vs ai'], null); saveScens(); root = B('ai vs ai'); hit(root, ':undo: revert'); out.reverted = !myStore['ai vs ai'];
    root = B('you vs dummy');
    return out;`);
  assert.deepEqual(r.exp.slice(0, 2), ['sweep', ['you vs dummy']]);
  assert.equal(r.exp[2], 'experiment');
  assert.equal(r.clash, 'you vs dummy');
  assert.equal(r.blank, 'you vs dummy');
  assert.equal(r.reset, 'you vs dummy');
  assert.deepEqual(r.copy, ['my scenario 1', 'builder', true]);
  assert.deepEqual(r.renamed, ['renamed', true, false]);
  assert.deepEqual(r.saved, ['a', 'stick2-scenarios.json']);
  assert.ok(r.imported);
  assert.ok(r.copied.includes('renamed'));
  assert.ok(r.pasted);
  assert.match(r.link, /^http:\/\/x\/app#embed=/);
  assert.deepEqual(r.deleted, [false, 'you vs dummy', 1]);
  assert.ok(r.reverted);
});

test('the showcase replay carries one bookmark per scripted beat and plays back as a replay file', () => {
  const r = js(`reset(); const rep = showcaseReplay(), a = SCENARIOS.showcase.a;
    return { marks: rep.marks.length, beats: a.filter(s => typeof s !== 'number').length, first: rep.marks[0], hasFrames: !!rep.name || Object.keys(rep).length > 1 };`);
  assert.equal(r.marks, r.beats);
  assert.equal(r.first.f, 0);
  assert.ok(r.hasFrames);
});

test('a custom scenario passed as JSON to #embed loads under the embed key and an unknown slug is rejected', () => {
  const r = js(`reset(); const u = fromScen(SCENARIOS['ai vs ai'], null); u.period = 4;
    loadEmbedScenario(JSON.stringify(u)); const custom = [lab.scen === EMBED_KEY, SCENARIOS[EMBED_KEY].period];
    const link = embedLink(u); saveScens();
    return { custom, link: link.startsWith('http://x/app#embed='), kept: EMBED_KEY in SCENARIOS };`);
  assert.deepEqual(r.custom, [true, 4]);
  assert.ok(r.link);
  assert.ok(r.kept);
});
