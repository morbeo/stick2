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
  // the attack grid: a hovered cell's own save button keeps that attack (once, however often it is pressed), without breeding
  lab.kind = 'attacks'; setMode('grid'); lab.hover = 4; labRender();
  const cell = lab.cells[4], sb = cell.btns.find(b => !b.open), seed = breed.seed, nMoves = Object.keys(DEFS[CURRENT].moves).length;
  for (let i = 0; i < 2; i++) labClick(sb.x + 2, sb.y + 2, {});
  const dm = DEFS[CURRENT].moves; if (Object.keys(dm).length !== nMoves + 1 || JSON.stringify(dm[cell.saved]) !== JSON.stringify(cell.gen) || breed.seed !== seed) errs.push('cell save ' + [Object.keys(dm).length, nMoves, cell.saved, breed.seed, seed]);
  setMode('play'); for (let i = 0; i < 60; i++) for (const w of mode().worlds()) w.advance(1/60, NOIN);
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
