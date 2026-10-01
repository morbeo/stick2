// smoke test in headless Chrome: every mode × every character (and each stance) renders its panels and a few frames without errors
// usage: npm run test:browser (CHROME=/path/to/chrome to override)
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), out = path.join(os.tmpdir(), 'stick2-smoke.html');
const chrome = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find(p => fs.existsSync(p));
if (!chrome) { console.log('skip: no Chrome found (set CHROME)'); process.exit(0); }
const probe = `<script>
let errs = [];
window.onerror = (m, s, l) => { errs.push(m + ' @' + (s || '').split('/').pop() + ':' + l); };
try {
  localStorage.clear(); app.paused = true;
  for (const c of Object.keys(CHARS)) {
    pickChar(c);
    for (let st = 0; st < currentChar().stances.length; st++) {
      studio.stance = st;
      for (const m of Object.keys(MODES)) {
        try { setMode(m); for (let i = 0; i < 20; i++) for (const w of mode().worlds()) w.advance(1/60, NOIN); mode().render?.(); }
        catch (e) { errs.push(c + '/' + st + '/' + m + ': ' + e.message); }
      }
    }
  }
  // the editor helpers: a keyframed idle and walk loop from the procedural cycles, then a fight using them
  pickChar('stick'); studio.stance = 0; setMode('animate'); makeLoop('idle'); makeLoop('walk');
  if (!currentChar().moves.idle || currentChar().moves.walk.keys.length !== 8) errs.push('makeLoop');
  // posing: body reach bends the spine as well, limb reach only the arm; mirror swaps the front and back limbs
  anim.move = 'jab'; selectKey(1);
  for (const r of ['limb', 'body']) {
    anim.reach = r; const hp = anFrame().P.handF, before = keyPose(currentChar(), curMove(), 1).chest;
    poseTo('handF', hp[0] - 200 * dpr, hp[1] - 150 * dpr, false);
    if ((keyPose(currentChar(), curMove(), 1).chest !== before) !== (r === 'body')) errs.push('reach ' + r);
  }
  const pre = keyPose(currentChar(), curMove(), 1); mirrorKey();
  const post = keyPose(currentChar(), curMove(), 1); if (post.uarmF !== pre.uarmB || post.farmB !== pre.farmF) errs.push('mirror');
  // every joint moves past its limits (they only shape the solve); the hip moves the body, the ankles stay
  { anim.move = 'jab'; selectKey(0); const ev = { detail: 1 }, drag = (id, dx, dy) => { const p = anFrame().P[id]; animMouse('down', p[0], p[1], ev); animMouse('move', p[0] + dx, p[1] + dy, ev); const f = anFrame(); animMouse('up', p[0] + dx, p[1] + dy, ev); return f; };
    const f0 = anFrame(), f1 = drag('hip', 10 * dpr, 30 * dpr), off = id => Math.hypot(f1.P[id][0] - f0.P[id][0], f1.P[id][1] - f0.P[id][1]) / dpr;
    if (off('hip') < 25 || off('shinF') > 2 || off('shinB') > 2) errs.push('hip drag ' + ['hip', 'shinF', 'shinB'].map(off));
    undo(); anim.reach = 'bone'; const hd = anFrame(); drag('head', -(hd.P.head[0] - hd.P.neck[0]) * 2 - 30 * dpr, 20 * dpr);
    if (!(keyPose(currentChar(), curMove(), 0).head > currentChar().by.head.max)) errs.push('past the limit ' + keyPose(currentChar(), curMove(), 0).head);
    undo(); anim.reach = 'limb'; }
  // the move table: one row per move, fuzzy filter, sorting, editing a value and retiming a phase in place
  anim.view = 'table'; panels();
  const rows = () => [...document.querySelectorAll('.mtable tbody tr')];
  if (rows().length !== Object.keys(currentChar().moves).length) errs.push('table rows');
  const fi = document.querySelector('.mtable .bar input'); fi.value = 'dk'; fi.dispatchEvent(new Event('input'));
  const names = rows().map(r => r.firstChild.textContent); if (!names.includes('sweep') || names.includes('jab')) errs.push('table filter ' + names);
  fi.value = ''; fi.dispatchEvent(new Event('input'));
  [...document.querySelectorAll('.mtable th')].find(t => t.textContent.startsWith('startup')).click();
  const SU = TABLE_COLS.findIndex(c => c.k === 'startup'), su = rows().map(r => +r.children[SU].querySelector('input').value); if (su.some((v, i) => i && v < su[i - 1])) errs.push('table sort');
  const edit1 = (n, col, v) => { const inp = rows().find(r => r.firstChild.textContent === n).children[col].querySelector('input'); inp.value = v; inp.dispatchEvent(new Event('change')); };
  edit1('kick', TABLE_COLS.findIndex(c => c.k === 'knock'), 333); if (currentChar().moves.kick.knock !== 333) errs.push('table edit');
  edit1('kick', SU, 12); if (frameData(currentChar().moves.kick).startup !== 12) errs.push('table retime ' + frameData(currentChar().moves.kick).startup);
  if (rows().find(r => r.firstChild.textContent === 'kick').children[TABLE_COLS.findIndex(c => c.k === 'stance')].textContent !== 'main') errs.push('table stance');
  rows().find(r => r.firstChild.textContent === 'sweep').click(); if (anim.move !== 'sweep' || anim.view !== 'cards') errs.push('table click opens the editor');
  pickMove('slash'); if (edChar().weapon !== 'sword' || MOVE_GROUPS.type(curMove()) !== 'weapon' || boundSlots().join() !== 'punch') errs.push('weapon move ' + [edChar().weapon, boundSlots()]);
  toggleBind('backPunch'); if (DEFS[CURRENT].wbinds?.slash?.backPunch !== 'slash' || !boundSlots().includes('backPunch')) errs.push('weapon bind');
  // the input table: pads show unassigned directions; clicking one and a move in its popup binds it (undoable), none blanks it
  { pickChar('stick'); studio.stance = 0; setCfg({ plane: '2d' }); setMode('animate'); anim.move = 'jab'; anim.view = 'inputs'; panels();
    const cell = l => [...document.querySelectorAll('.pad button')].find(b => b.querySelector('.d').textContent.trim().endsWith(l));
    const unset = [...document.querySelectorAll('.pad button')].filter(b => !b.classList.contains('set') && !b.classList.contains('alias'));
    if (unset.length || !cell('7P').classList.contains('alias')) errs.push('input pads unset ' + unset.map(b => b.textContent));
    const pick = (l, t) => { cell(l).click(); [...document.querySelectorAll('.pop button')].find(b => b.textContent.trim() === t || t === 'none' && b.textContent.includes('none')).click(); };
    pick('4K', 'none'); pick('623K', 'none');
    if (!cell('4K').classList.contains('fall') || !cell('623K').classList.contains('none')) errs.push('input none ' + ['4K', '623K'].map(l => cell(l).className));
    pick('4K', 'roundhouse');
    if (DEFS[CURRENT].binds.backKick !== 'roundhouse' || !cell('4K').classList.contains('set')) errs.push('input assign ' + DEFS[CURRENT].binds.backKick);
    undo(); if (DEFS[CURRENT].binds.backKick !== '' || !cell('4K').classList.contains('fall')) errs.push('input undo');
    undo(); undo();
    undo(); anim.view = 'cards'; panels(); }
  // the attack grid: a hovered cell's own save button keeps that attack (once, however often it is pressed), without breeding
  lab.kind = 'attacks'; setMode('grid'); lab.hover = 4; labRender();
  const cell = lab.cells[4], sb = cell.btns.find(b => !b.open), seed = breed.seed, nMoves = Object.keys(DEFS[CURRENT].moves).length;
  for (let i = 0; i < 2; i++) labClick(sb.x + 2, sb.y + 2, {});
  const dm = DEFS[CURRENT].moves; if (Object.keys(dm).length !== nMoves + 1 || JSON.stringify(dm[cell.saved]) !== JSON.stringify(cell.gen) || breed.seed !== seed) errs.push('cell save ' + [Object.keys(dm).length, nMoves, cell.saved, breed.seed, seed]);
  // attack grid picks: limb + height filter new attacks; a pose target makes them strike into that pose
  { const ch = currentChar(), rand = makeRand(5), pt = POSE_TARGETS(ch);
    Object.assign(breed, { limb: 'leg', height: 'high', pose: null });
    const gs = Array.from({ length: 6 }, () => genAttack(ch, rand)); if (gs.some(m => ch.by[m.hit].role !== 'leg' || m.height !== 'high')) errs.push('limb/height pick ' + gs.map(m => m.hit + m.height));
    Object.assign(breed, { limb: 'any', height: 'any', pose: 'karate' }); const m = genAttack(ch, rand), sk = m.keys[1].p;
    if (!Object.keys(sk).length || Object.keys(sk).some(id => Math.abs(sk[id] - pt.karate.pose[id]) > 0.1) || !m.keys[1].active) errs.push('pose attack');
    Object.assign(breed, { pose: null }); }
  setMode('play'); for (let i = 0; i < 60; i++) for (const w of mode().worlds()) w.advance(1/60, NOIN);
  // replay files: the play fight saved and played back matches its recording, shown with its engine version
  { const r = JSON.parse(JSON.stringify(makeReplay(lab.cells[0].w, lab.scen)));
    if (r.version !== ENGINE_VERSION || r.frames.length !== 60) errs.push('replay file ' + [r.version, r.frames.length]);
    lab.playback = r; build(); const w = lab.cells[0].w; for (let i = 0; i < 70; i++) w.advance(1/60, NOIN); labRender();
    if (!w.playback || w.desync !== null || !w.playback.over) errs.push('replay playback ' + [w.desync, w.playback?.over]);
    lab.playback = null; build(); if (lab.cells[0].w.playback) errs.push('replay stop'); }
  // side panel: headings fold their section (remembered), advanced rows wait behind "more", a search shows everything
  { setMode('play'); const sec = name => [...document.querySelectorAll('#side .fold')].find(f => f.querySelector('h3').textContent.toLowerCase().startsWith(name));
    const vis = el => !!el.offsetParent, row = k => [...document.querySelectorAll('#side .row')].find(r => r.firstChild.textContent === k);
    if (!sec('movement').classList.contains('shut') || vis(row('maxSpeed'))) errs.push('fold default');
    sec('movement').querySelector('h3').click(); if (!vis(row('maxSpeed')) || vis(row('accel'))) errs.push('fold open / adv');
    sec('movement').querySelector('.morebtn').click(); if (!vis(row('accel'))) errs.push('more');
    sec('movement').querySelector('.morebtn').click(); sec('movement').querySelector('h3').click(); panels();
    if (!sec('movement').classList.contains('shut')) errs.push('fold remembered');
    const q = document.querySelector('#side input'); q.value = 'decel'; q.dispatchEvent(new Event('input'));
    if (!vis(row('decel')) || vis(row('maxSpeed'))) errs.push('search shows folded');
    q.value = ''; q.dispatchEvent(new Event('input')); lab.q = '';
    // the character menu: the current one on a button, the rest in a popup
    setMode('animate'); document.querySelector('.charpick').click(); [...document.querySelectorAll('.pop .card')].find(c => c.textContent === 'brute').click();
    if (CURRENT !== 'brute' || document.querySelector('.pop')) errs.push('char menu ' + CURRENT); pickChar('stick'); }
  // impact without an attacker: it is not drawn or framed, its blows land as before
  { lab.solo = true; setMode('impact'); const w = lab.cells[0].w; for (let i = 0; i < 60; i++) w.advance(1/60, NOIN);
    if (!w.a.hidden || !w.hits) errs.push('impact solo ' + [w.a.hidden, w.hits]); lab.solo = false; }
  // four tabs: impact is a view of play, gallery of animate, picked in the toolbar's view group
  { setMode('impact'); const tabs = [...document.querySelectorAll('#modes button')], on = tabs.find(b => b.classList.contains('on'));
    if (tabs.length !== 4 || !on?.textContent.includes('play')) errs.push('tabs ' + tabs.length + ' ' + on?.textContent);
    [...document.querySelectorAll('#ctx button')].find(b => b.textContent.includes('fight')).click(); if (app.mode !== 'play') errs.push('view fight ' + app.mode);
    setMode('gallery'); tabs.find(b => b.textContent.includes('animate')).click(); if (app.mode !== 'gallery') errs.push('tab keeps its view ' + app.mode); }
  // the command palette: typing ranks a mode first, Enter runs it; a setting searches the settings panel for it
  { setMode('play'); const pal = q => { openPalette(); const i = document.querySelector('#palette input'); i.value = q; i.dispatchEvent(new Event('input'));
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); };
    pal('galle'); if (app.mode !== 'gallery' || $('palette')) errs.push('palette mode ' + app.mode);
    pal('hitstopFin'); if (mode() !== labMode || lab.q !== 'hitstopFin' || !document.querySelector('#side.searching')) errs.push('palette setting ' + [app.mode, lab.q]); lab.q = ''; panels(); }
  // power presets: one button sets the hit and bounce settings, and shows as on while they match
  { setMode('play'); const b = [...document.querySelectorAll('#side button')].find(b => b.textContent.includes('pinball')); b.click(); syncAll();
    if (CFG.powerScale !== 3 || CFG.ceiling !== 0.9 || !b.classList.contains('on')) errs.push('power preset ' + [CFG.powerScale, CFG.ceiling]); applyPreset('juicy'); }
  // input table: a new motion input gets a row and a move; the damage of the move an input plays is edited in place
  { setMode('animate'); pickChar('stick'); anim.view = 'inputs'; inputs.table = true; panels();
    edit(def => { (def.motions ??= {}).m41236 = '41236'; editBinds(def).m41236Punch = 'launcher'; }); syncAll();
    const row = [...document.querySelectorAll('.itable tbody tr')].find(r => r.textContent.includes('m41236Punch'));
    if (!row || !row.textContent.includes('launcher')) errs.push('custom input row ' + !!row);
    const dmg = row?.querySelectorAll('input[type=number]')[1]; if (dmg) { dmg.value = 17; dmg.dispatchEvent(new Event('change')); }
    if (DEFS.stick.moves.launcher.damage !== 17) errs.push('input table damage ' + DEFS.stick.moves.launcher.damage);
    removeInput('m41236'); if (DEFS.stick.motions.m41236 || editBinds(DEFS.stick).m41236Punch) errs.push('remove input');
    undo(); undo(); undo(); anim.view = 'cards'; inputs.table = false; panels(); }
  // compare: the strip button picks a move to compare with; the filmstrip draws both, a click on a frame goes there
  { setMode('animate'); pickChar('stick'); anim.move = 'roundhouse'; anim.cmp = null; anim.cmpView = 'off'; panels();
    [...document.querySelectorAll('#ctx button')].find(b => b.dataset.tip?.startsWith('Filmstrip')).click();
    if (anim.cmpView !== 'strip' || cmpMove()) errs.push('compare strip ' + anim.cmpView);
    [...document.querySelectorAll('#ctx button')].find(b => b.dataset.tip === 'The move to compare with').click();
    [...document.querySelectorAll('.pop button')].find(b => b.textContent.trim().endsWith('armada')).click();
    if (anim.cmp !== 'armada' || anim.cmpView !== 'strip') errs.push('compare pick ' + [anim.cmp, anim.cmpView]);
    mode().render(); const { step, cw } = stripCells(anLayout().ed); animMouse('down', cw * 2.5, anLayout().ed.h / 2, { detail: 1 });
    if (Math.abs(anim.t - 2 * step) > 1e-6) errs.push('strip click ' + anim.t);
    anim.cmpView = 'overlay'; mode().render(); anim.cmpView = 'off'; anim.cmp = null; }
  // random characters: keeping a cell twice asks to update the kept character instead of adding a copy
  { setMode('character'); randomExp(); const n0 = Object.keys(DEFS).length; keepRandom(0); const name = CURRENT, n1 = Object.keys(DEFS).length;
    const conf = window.confirm; let asked = 0; window.confirm = () => (asked++, true); keepRandom(0); window.confirm = conf;
    if (n1 !== n0 + 1 || Object.keys(DEFS).length !== n1 || !asked || CURRENT !== name) errs.push('keep random ' + [n0, n1, Object.keys(DEFS).length, asked]);
    delete DEFS[name]; delete CHARS[name]; creator.expOn = false; pickChar('stick'); }
  // debug: the first section of the lab settings, with the engine version and the fighters of the focused fight
  { setMode('play'); panels(); dbgT = 0; drawDebug();
    if (!dbgInfo.isConnected || !dbgInfo.textContent.includes('engine v' + ENGINE_VERSION) || !/P2 /.test(dbgInfo.textContent)) errs.push('debug info ' + dbgInfo.textContent.slice(0, 80));
    if ($('side').querySelector('.head, h3')?.textContent.indexOf('Debug') < 0) errs.push('debug not first'); }
} catch (e) { errs.push(e.message + ' ' + e.stack.split('\\n')[1]); }
document.title = errs.length ? 'ERR ' + errs.slice(0, 5).join(' | ') : 'OK';
</script></body>`;
fs.writeFileSync(out, fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/(src|fonts)\//g, `file://${root}/$1/`).replace('</body>', probe));
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--window-size=1400,800',
  '--virtual-time-budget=5000', '--dump-dom', 'file://' + out], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const title = (dom.match(/<title>([^<]*)/) || [])[1] || 'no title';
console.log(title);
process.exit(title === 'OK' ? 0 : 1);
