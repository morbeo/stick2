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
