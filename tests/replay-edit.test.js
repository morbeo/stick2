// the replay editor: events recorded while a replay plays, without changing the fight; seeking lands on the same state as playing there
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), load = require('./load');
const { run } = load([...require('../tools/engine').ENGINE, 'replay']);
const reps = fs.readFileSync(path.join(__dirname, 'fixtures', 'replays.json'), 'utf8');
run(`var REPS = ${reps};`);

test('the event recorder changes no fight: same checksums, same end state', () => {
  const r = JSON.parse(run(`JSON.stringify(REPS.map(r => {
    const play = rec => { const w = replayWorld(r); w.loop = false; let n = 0; if (rec) w.rec = () => n++;
      for (let i = 0; i <= r.frames.length; i++) w.advance(0, NOIN); return [w.desync, w.stateHash(), n]; };
    return [play(false), play(true)];
  }))`));
  for (const [plain, rec] of r) {
    assert.deepEqual(rec.slice(0, 2), plain.slice(0, 2));
    assert.equal(rec[0], null);
    assert.ok(rec[2] > 10, `only ${rec[2]} events recorded`);
  }
});

test('a reel\'s events: the same every time, in frame order, of every main type; combos span their hits', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    const ev = () => { loadReel(REPS[0]); return rp.events.map(e => [e.f, e.type, e.who, e.name, e.end ?? null]); };
    const a = ev(), b = ev(), types = [...new Set(a.map(e => e[1]))], combo = rp.events.find(e => e.kind === 'combo');
    const hitsIn = combo && rp.events.filter(e => e.kind === 'hit' && e.data.vic === combo.data.vic && e.f >= combo.f && e.f <= combo.end).length;
    return { same: JSON.stringify(a) === JSON.stringify(b), sorted: a.every((e, i) => !i || a[i - 1][0] <= e[0]), inside: a.every(e => e[0] >= 0 && e[0] < rp.N), types,
      combo: combo && [combo.name, hitsIn], n: a.length };
  })())`));
  assert.ok(r.same && r.sorted && r.inside, JSON.stringify(r));
  for (const t of ['input', 'move', 'hit', 'fall']) assert.ok(r.types.includes(t), `no ${t} events: ${r.types}`);
  assert.ok(r.combo, 'no combo');
  assert.equal(r.combo[0], `${r.combo[1]}-hit combo`);
});

test('seeking to a frame gives the state of playing the replay up to it', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    loadReel(REPS[0]);
    return [0, 1, 59, 60, 61, 247, 400, rp.N].map(n => {
      rpSeek(n); const got = rp.view.stateHash();
      const w = replayWorld(REPS[0]); w.loop = false; for (let i = 0; i < n; i++) w.advance(0, NOIN);
      return [n, got === w.stateHash()];
    });
  })())`));
  for (const [n, ok] of r) assert.ok(ok, `frame ${n}`);
});

// edits: the editor's UI hooks are stubs here; an edit replays from a checkpoint, which must equal playing the edited frames from the start
run('var snapshot = () => {}, syncAll = () => {}, panels = () => {};');
const EDIT = `const fresh = () => { const r = reelFile(), w = replayWorld(r); w.loop = false; let n = 0; for (let i = 0; i < r.frames.length && !w.done; i++) { w.advance(0, NOIN); n++; } return [w.stateHash(), n, w.desync]; };`;
test('an input edit replays from a checkpoint the same as the edited frames from the start; the saved file plays in sync', () => {
  const r = JSON.parse(run(`JSON.stringify((() => { ${EDIT}
    loadReel(JSON.parse(JSON.stringify(REPS[0])));
    const p = rp.events.find(e => e.kind === 'press' && e.f > 200 && e.key === 'punch'), out = [];
    rp.sel = new Set([p.i]); reelEdit(() => shiftInputs(7));
    const moved = rp.frames[p.f + 7][1].punch && !rp.frames[p.f][1].punch;
    out.push(['move', moved, rp.master.stateHash() === fresh()[0], rp.N === fresh()[1], fresh()[2]]);
    rp.sel = new Set(rp.events.filter(e => e.kind === 'press' && e.f > 300 && e.f < 340).map(e => e.i)); const n0 = rp.frames.length; reelEdit(cutSpan);
    out.push(['cut', rp.frames.length < n0, rp.master.stateHash() === fresh()[0], rp.N === fresh()[1], fresh()[2]]);
    reelEdit(() => insertInput('kick'));
    out.push(['insert', rp.frames[Math.min(rp.n, rp.frames.length - 1)][1].kick, rp.master.stateHash() === fresh()[0], rp.N === fresh()[1], fresh()[2]]);
    return out;
  })())`));
  for (const [name, changed, same, len, desync] of r) {
    assert.ok(changed, `${name}: nothing changed`);
    assert.ok(same && len, `${name}: the replayed fight differs from playing the edited frames`);
    assert.equal(desync, null, `${name}: the saved file is out of sync`);
  }
});

test('undoing an edit brings the frames and the fight back', () => {
  const r = JSON.parse(run(`JSON.stringify((() => { ${EDIT}
    loadReel(JSON.parse(JSON.stringify(REPS[0])));
    const h0 = rp.master.stateHash(), snap = reelSnap();
    rp.sel = new Set(rp.events.filter(e => e.kind === 'press').map(e => e.i)); reelEdit(deleteInputs);
    const h1 = rp.master.stateHash(); reelRestore(snap);
    return [h0 !== h1, rp.master.stateHash() === h0, reelSnap() === snap];
  })())`));
  assert.deepEqual(r, [true, true, true]);
});

test('recordFight (events.js, used without the replay tab) finds the same events and stats as the replay tab', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    loadReel(JSON.parse(JSON.stringify(REPS[0])));
    const tab = rp.base.map(e => [e.f, e.type, e.who, e.name]).sort().join('|'), w = replayWorld(REPS[0]); w.loop = false;
    const rec = recordFight(w), mine = rec.events.map(e => [e.f, e.type, e.who, e.name]).sort().join('|');
    return [tab === mine, rec.N === rp.N, JSON.stringify(fightStats(rec.events, rec.lanes)) === JSON.stringify(fightStats(rp.base, rp.lanes))];
  })())`));
  assert.deepEqual(r, [true, true, true]);
});

test('a branch (P2 taken over at the playhead) saves as a replay that plays in sync; compared, nothing differs before the fork', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    loadReel(JSON.parse(JSON.stringify(REPS[0])));
    const n = 150, b = branchWorld(reelFile(), n, 2);
    for (let i = 0; i < 200 && !b.done; i++) b.advance(1 / 60, { ...NOIN, left: i % 50 < 25, kick: i % 17 === 0 });
    const rep = JSON.parse(JSON.stringify(makeReplay(b, 'branch'))), p = replayWorld(rep); p.loop = false;
    for (let i = 0; i <= rep.frames.length; i++) p.advance(0, NOIN);
    const reel = { rep, name: 'b', from: n, parent: rp.reel, edits: 0 }; rp.reels.push(reel); loadCmp(reel);
    return [b.ctl[1], p.desync, p.stateHash() === b.stateHash(), rp.events.filter(e => e.f < n && (e.cmp || e.aOnly)).length, rp.events.some(e => e.cmp)];
  })())`));
  assert.deepEqual(r, ['human2', null, true, 2, true]);
});

test('highlights: moments found from the events (combos, K.O.s, parries…), windows that overlap merge, best first', () => {
  const r = JSON.parse(run(`JSON.stringify((() => {
    const w = replayWorld(REPS[0]); w.loop = false; const rec = recordFight(w), ms = findMoments(rec.events, rec.T);
    const sorted = ms.every((m, i) => !i || ms[i - 1].score >= m.score), apart = [...ms].sort((p, q) => p.a - q.a).every((m, i, a) => !i || a[i - 1].b < m.a);
    return [ms.length, sorted, apart, ms.every(m => m.a < m.fin && m.fin < m.b && m.b <= rec.N)];
  })())`));
  assert.ok(r[0] > 0, 'no moments');
  assert.deepEqual(r.slice(1), [true, true, true]);
});
