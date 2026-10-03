// smoke test in headless Chrome: every mode × every character (and each stance) renders its panels and a few frames without errors
// usage: npm run test:browser (CHROME=/path/to/chrome to override)
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), out = path.join(os.tmpdir(), 'stick2-smoke.html');
const chrome = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find(p => fs.existsSync(p));
if (!chrome) { console.log('skip: no Chrome found (set CHROME)'); process.exit(0); }
const probe = `<script>
let errs = [];
const later = [], afterSync = []; // async checks (afterSync: started once the synchronous ones are done); the title waits for them
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
  // movement layers: + layer makes one at the state's procedural pose (its ref); it groups as layer, has a mix slider, and the + layer list drops it
  { const lb = () => document.querySelector('#ctx [data-tip^="A keyframed loop"]'); lb().click();
    [...document.querySelectorAll('.pop button')].find(x => x.textContent === 'crouch').click();
    const m = currentChar().moves.crouchLayer, sl = [...document.querySelectorAll('#side .row')].some(r => r.textContent.startsWith('mix'));
    if (!m || anim.move !== 'crouchLayer' || JSON.stringify(m.keys[0].p) !== JSON.stringify(m.ref) || m.ref.handF === undefined && !Object.keys(m.ref).length || !sl) errs.push('makeLayer ' + [!!m, anim.move, sl]);
    if (Math.abs(m.ref[currentChar().chains.leg[0][1].id] - currentChar().poses.stance[currentChar().chains.leg[0][1].id]) < 5) errs.push('layer ref is not the crouch');
    lb().click(); if ([...document.querySelectorAll('.pop button')].some(x => x.textContent === 'crouch')) errs.push('layer list keeps crouch'); closePop();
    deleteMove(); if (currentChar().moves.crouchLayer) errs.push('delete layer'); }
  // turning keys: the spin toggle marks a whole turn (turn: 2), the turn toggle a half; the built-in spin has one
  { anim.move = 'jab'; selectKey(0); panels(); const tg = l => [...document.querySelectorAll('#side button')].find(b => b.textContent.endsWith(l));
    if (currentChar().moves.spin.keys[0].turn !== 2) errs.push('spin has no whole turn');
    tg('spin').click(); const t2 = curMove().keys[0].turn; tg('turn').click(); const t1 = curMove().keys[0].turn; tg('turn').click();
    if (t2 !== 2 || t1 !== true || curMove().keys[0].turn) errs.push('turn toggles ' + [t2, t1, curMove().keys[0].turn]); }
  // a shoot key: the toggle marks it and the shot row (look, speed, size, life) appears; the built-in fireball shoots
  { anim.move = 'jab'; selectKey(1); panels(); const tg = l => [...document.querySelectorAll('#side button')].find(b => b.textContent.endsWith(l));
    if (!currentChar().moves.fireball.keys.some(k => k.shoot)) errs.push('fireball does not shoot');
    tg('shoot').click(); panels(); const on = curMove().keys[1].shoot, row = [...document.querySelectorAll('#side .row > span:first-child')].some(e => e.textContent === 'shot');
    tg('wave')?.click(); const look = curMove().shot?.look; undo(); undo(); panels();
    if (!on || !row || look !== 'wave' || curMove().keys[1].shoot) errs.push('shoot toggle ' + [on, row, look, curMove().keys[1].shoot]); }
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
  lay('animate').panel = 'table'; panels();
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
  rows().find(r => r.firstChild.textContent === 'sweep').click(); if (anim.move !== 'sweep' || lay('animate').panel) errs.push('table click opens the editor');
  pickMove('slash'); if (edChar().weapon !== 'sword' || MOVE_GROUPS.type(curMove()) !== 'weapon' || boundSlots().join() !== 'punch') errs.push('weapon move ' + [edChar().weapon, boundSlots()]);
  toggleBind('backPunch'); if (DEFS[CURRENT].wbinds?.slash?.backPunch !== 'slash' || !boundSlots().includes('backPunch')) errs.push('weapon bind');
  // the input table: pads show unassigned directions; clicking one and a move in its popup binds it (undoable), none blanks it
  { pickChar('stick'); studio.stance = 0; setCfg({ plane: '2d' }); setMode('animate'); anim.move = 'jab'; lay('animate').panel = 'inputs'; panels();
    const cell = l => [...document.querySelectorAll('.pad button')].find(b => b.querySelector('.d').textContent.trim().endsWith(l));
    const unset = [...document.querySelectorAll('.pad button')].filter(b => !b.classList.contains('set') && !b.classList.contains('alias'));
    if (unset.length || !cell('7P').classList.contains('set') || !cell('j.7P').classList.contains('alias')) errs.push('input pads unset ' + unset.map(b => b.textContent));
    const pick = (l, t) => { cell(l).click(); [...document.querySelectorAll('.pop button')].find(b => b.textContent.trim() === t || t === 'none' && b.textContent.includes('none')).click(); };
    pick('4K', 'none'); pick('623K', 'none');
    if (!cell('4K').classList.contains('fall') || !cell('623K').classList.contains('none')) errs.push('input none ' + ['4K', '623K'].map(l => cell(l).className));
    pick('4K', 'roundhouse');
    if (DEFS[CURRENT].binds.backKick !== 'roundhouse' || !cell('4K').classList.contains('set')) errs.push('input assign ' + DEFS[CURRENT].binds.backKick);
    undo(); if (DEFS[CURRENT].binds.backKick !== '' || !cell('4K').classList.contains('fall')) errs.push('input undo');
    undo(); undo();
    undo(); lay('animate').panel = null; panels(); }
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
  // the menu bar's files: export / import character, settings or everything; settings round-trip, out-of-range values fall back to the default
  { setMode('play'); const top = t => [...document.querySelectorAll('#global button')].find(b => b.textContent.includes(t)), got = [], dl = download, of = openFile;
    top('export').click(); const menu = [...document.querySelectorAll('.pop button')].map(b => b.textContent).join(); closePop();
    if (menu !== 'character,settings,everything' || !top('import')) errs.push('file menu ' + menu);
    download = (n, d) => got.push(JSON.parse(JSON.stringify(d))); let feed; openFile = f => f(feed);
    setCfg({ hitstop: 0.12 }); exportFile('settings'); setCfg({ hitstop: DEFAULTS.hitstop }); feed = got[0]; importFile('settings');
    if (CFG.hitstop !== 0.12) errs.push('settings import ' + CFG.hitstop);
    feed = { format: 'stick2.settings', cfg: { hitstop: 99 } }; importFile('settings'); if (CFG.hitstop !== 99) errs.push('settings any number ' + CFG.hitstop); CFG.hitstop = DEFAULTS.hitstop;
    exportFile('everything'); if (got[1]?.format !== 'stick2.everything' || got[1].current !== CURRENT) errs.push('everything export');
    download = dl; openFile = of; }
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
    setMode('animate'); document.querySelector('.charpick').click(); [...document.querySelectorAll('.pop .card')].find(c => c.textContent === 'grumbo').click();
    if (CURRENT !== 'grumbo' || document.querySelector('.pop')) errs.push('char menu ' + CURRENT); pickChar('stick'); }
  // impact without an attacker: it is not drawn or framed, its blows land as before
  { lab.solo = true; setMode('impact'); const w = lab.cells[0].w; for (let i = 0; i < 60; i++) w.advance(1/60, NOIN);
    if (!w.a.hidden || !w.hits) errs.push('impact solo ' + [w.a.hidden, w.hits]); lab.solo = false; }
  // impact's ragdoll view: one body alone; a blow button (under the preview, not the toolbar) strikes it (a sweep knocks it down), stand up resets it
  { setMode('impact'); const btn = t => [...document.querySelectorAll('#ctx button')].find(b => b.textContent.trim().endsWith(t));
    const blow = t => [...document.querySelectorAll('.blowbar button')].find(b => b.textContent.trim().endsWith(t));
    btn('ragdoll').click(); if (document.querySelector('.blowbar.inpv')) errs.push('blow bar full width in lab');
    if (!paletteEntries().some(e => e.kind === 'tool' && e.name === 'sweep')) errs.push('blow bar not in palette');
    blow('sweep').click(); const w = lab.cells[0].w; let down = false; for (let i = 0; i < 40; i++) { w.advance(1/60, NOIN); down ||= !!w.b.rag || w.b.downT > 0; }
    if (lab.cells.length !== 1 || !w.a.hidden || w.hits !== 1 || !down) errs.push('ragdoll blow ' + [lab.cells.length, w.a.hidden, w.hits, down]);
    blow('stand up').click(); if (lab.cells[0].w === w || lab.cells[0].w.hits) errs.push('ragdoll stand up');
    btn('hits').click(); if (lab.cells.length !== Object.keys(IMPACTS).length) errs.push('impact hits ' + lab.cells.length); }
  // the character tab's preview picker and impact's blow buttons: both under the preview pane now, not the toolbar
  { setMode('character'); const pv = t => [...document.querySelectorAll('.pvbar button')].find(b => b.textContent.trim().endsWith(t));
    const blow = t => [...document.querySelectorAll('.blowbar button')].find(b => b.textContent.trim().endsWith(t));
    if (document.querySelector('#ctx [data-tip^="What the preview"]')) errs.push('preview picker still in toolbar');
    pv('impact').click(); if (!document.querySelector('.blowbar.inpv')) errs.push('blow bar not in preview pane');
    blow('launcher').click(); const w = creator.w; for (let i = 0; i < 20; i++) w.advance(1/60, NOIN);
    if (!w.a.hidden || w.b.ch !== currentChar() || w.hits !== 1) errs.push('creator impact ' + [w.a.hidden, w.b.ch.name, w.hits]);
    pv('showcase').click(); if (document.querySelector('.blowbar')) errs.push('creator blow bar stays'); }
  // animate's move group: the current move opens the picker (filter focused), a card picks and closes it; cards / list is kept in the layout, apart from the stage panels; ‹ › step
  { setMode('animate'); pickChar('stick'); studio.stance = 0; anim.move = 'jab'; anim.filter = ''; panels();
    const cur = () => [...document.querySelectorAll('#ctx [data-part="move"] button')].find(b => b.textContent.includes('jab'));
    cur().click(); const fo = document.activeElement?.classList.contains('filter'), cards = document.querySelectorAll('.pop .movepop .card');
    [...cards].find(c => c.textContent === 'roundhouse')?.click();
    if (!fo || !cards.length || anim.move !== 'roundhouse' || document.querySelector('.pop')) errs.push('move picker ' + [fo, cards.length, anim.move]);
    lay('animate').movesView = 'list'; lay('animate').panel = 'table'; panels(); lay('animate').panel = null; panels();
    if (lay('animate').movesView !== 'list') errs.push('panel resets the list view');
    document.querySelector('#ctx [data-part="move"] [data-tip="Next move"]').click(); const nx = anim.move;
    document.querySelector('#ctx [data-part="move"] [data-tip="Previous move"]').click();
    if (nx === 'roundhouse' || anim.move !== 'roundhouse') errs.push('move step ' + nx + anim.move);
    if ([...document.querySelectorAll('#side h3')].map(x => x.textContent).join().indexOf('Character') < 0 || document.querySelector('#side .movepop')) errs.push('animate side');
    delete lay('animate').movesView; saveLay(); anim.move = 'jab'; panels(); }
  // the gallery and tests views show the move panel too, following the move clicked there
  { const sideMove = () => [...document.querySelectorAll('#side h3')].some(x => x.textContent.startsWith('Move')) && !document.querySelector('#side input[placeholder="search variables"]');
    setMode('gallery'); const i = lab.cells.findIndex(c => c.move === 'sweep'), r = labRects()[i];
    labClick(r.x + r.w / 2, r.y + r.h / 2, {}); if (!sideMove() || anim.move !== 'sweep') errs.push('gallery move panel ' + anim.move);
    lab.zoom = false; setMode('tests'); isolate('kick|' + CURRENT + '|0'); if (!sideMove() || anim.move !== 'kick') errs.push('tests move panel ' + anim.move);
    isolate(null); anim.move = 'jab'; setMode('animate'); }
  // four tabs: impact is a view of play, gallery of animate, picked in the toolbar's view group
  { setMode('impact'); const tabs = [...document.querySelectorAll('#modes button')], on = tabs.find(b => b.classList.contains('on'));
    if (tabs.length !== 5 || !on?.textContent.includes('play')) errs.push('tabs ' + tabs.length + ' ' + on?.textContent);
    [...document.querySelectorAll('#ctx button')].find(b => b.textContent.includes('fight')).click(); if (app.mode !== 'play') errs.push('view fight ' + app.mode);
    setMode('gallery'); tabs.find(b => b.textContent.includes('animate')).click(); if (app.mode !== 'gallery') errs.push('tab keeps its view ' + app.mode); }
  // combos: the table lists routes; + P on a route's end adds a link (the route gets longer), clicking that step and cut removes it; the tree shows starters
  { setMode('animate'); pickChar('stick'); studio.stance = 0; lay('animate').panel = 'combos'; combos.view = 'table'; panels();
    const rows = () => [...document.querySelectorAll('.ctable tbody tr')], row = t => rows().find(r => [...r.cells[0].querySelectorAll('button')].map(b => b.textContent).filter(x => !/ [PKS]$/.test(x)).join('›') === t), n0 = rows().length;
    [...row('jab›cross›uppercut').querySelectorAll('button')].find(b => b.textContent.includes('P')).click();
    [...document.querySelectorAll('.pop button')].find(b => /(^| )sweep$/.test(b.textContent)).click();
    if (DEFS.stick.moves.uppercut.next?.punch !== 'sweep' || !row('jab›cross›uppercut›sweep') || rows().length !== n0) errs.push('combo add ' + [DEFS.stick.moves.uppercut.next?.punch, rows().length, n0]);
    [...row('jab›cross›uppercut›sweep').querySelectorAll('button')].find(b => b.textContent === 'sweep').click();
    [...document.querySelectorAll('.pop button')].find(b => b.textContent.includes('cut')).click();
    if (DEFS.stick.moves.uppercut.next || rows().length !== n0) errs.push('combo cut ' + rows().length);
    // a direction in the link popup puts the link on it (→: 6P)
    [...row('jab›cross›uppercut').querySelectorAll('button')].find(b => b.textContent.includes('P')).click(); document.querySelectorAll('.pop .seg button')[5].click();
    [...document.querySelectorAll('.pop button')].find(b => /(^| )sweep$/.test(b.textContent)).click();
    if (DEFS.stick.moves.uppercut.next?.['6P'] !== 'sweep' || !rows().some(r => r.cells[1].textContent.endsWith(' 6P'))) errs.push('combo 6P ' + JSON.stringify(DEFS.stick.moves.uppercut.next));
    setLink('uppercut', '6P', '');
    // hovering a step plays the route up to it next to the cursor: each move until its cancel window, then the next
    { const st = [...row('jab›cross›uppercut').querySelectorAll('button')].find(b => b.textContent === 'uppercut'), mm = new MouseEvent('mousemove', { clientX: 50, clientY: 50, bubbles: true });
      st.dispatchEvent(mm); const pk = document.querySelector('.peek span')?.textContent;
      if (pk !== 'jab › cross › uppercut' || peek.d.toFixed(3) !== (['jab', 'cross'].reduce((s, n) => s + keyStart(currentChar().moves[n], currentChar().moves[n].cancel), 0) + total(currentChar().moves.uppercut)).toFixed(3)) errs.push('combo peek ' + pk + ' ' + peek?.d);
      // the step's tooltip keeps clear of the preview, wherever the cursor is
      document.body.append(tipEl); // the probe runs before DOMContentLoaded adds it
      for (const [x, y] of [[50, 50], [400, 300], [innerWidth - 60, innerHeight - 40]]) { st.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
        const p = document.querySelector('.peek').getBoundingClientRect(), t = tipEl.getBoundingClientRect();
        if (!t.width) errs.push('no tip at ' + [x, y]); else if (t.left < p.right && p.left < t.right && t.top < p.bottom && p.top < t.bottom) errs.push('tip over the peek at ' + [x, y]); }
      st.dispatchEvent(new MouseEvent('mouseleave')); if (document.querySelector('.peek')) errs.push('combo peek stays'); }
    combos.view = 'tree'; panels(); if (document.querySelectorAll('.ctable .croot').length !== comboRoots(currentChar(), new Set(Object.values(curBinds(currentChar())))).length) errs.push('combo tree');
    lay('animate').panel = null; panels(); }
  // the panels group (character and animate) shows the move table, inputs and combos over the stage; a move in them opens in the animate editor; each tab keeps its own open panel
  { setMode('character'); const sb = t => [...document.querySelectorAll('#ctx button')].find(b => b.textContent.trim().endsWith(t));
    sb('combos').click(); const chip = document.querySelector('.ctable .chip');
    if (!chip || lay('animate').panel) errs.push('character combos ' + !!chip + lay('animate').panel);
    const n = chip?.textContent; chip?.click(); if (app.mode !== 'animate' || anim.move !== n) errs.push('combo chip opens ' + app.mode + anim.move);
    setMode('character'); if (!document.querySelector('.ctable')) errs.push('character combos stay open (kept per tab)');
    sb('table').click(); if (document.querySelectorAll('.mtable tbody tr').length !== Object.keys(currentChar().moves).length) errs.push('character move table');
    document.querySelector('.mtable .stagehead button[data-tip^="Close"]').click(); if (document.querySelector('.mtable') || app.mode !== 'character') errs.push('character move table close');
    sb('inputs').click(); if (!document.querySelector('.mtable')) errs.push('character inputs');
    const esc = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
    popup($('ctx').querySelector('button'), 'x'); esc(); if (pop || !document.querySelector('.mtable')) errs.push('Esc closes the popup only');
    esc(); if (document.querySelector('.mtable') || lay().panel) errs.push('Esc closes the stage panel');
    sb('bones').click(); if (!document.querySelector('.btable') || !document.querySelector('.btable .stagehead')) errs.push('bone table in the panels group'); lay('character').panel = null; panels(); }
  // effect stacks: + adds a second effect to a move (a list) and to a bone, the arrows reorder, the bin removes; a key's own stack replaces the move's
  { pickChar('stick'); studio.stance = 0; setMode('animate'); anim.move = 'jab'; selectKey(0); panels();
    const adds = () => [...document.querySelectorAll('#side button')].filter(b => b.dataset.tip?.startsWith('Add an effect')), fx0 = curMove().fx;
    adds()[0].click(); adds()[0].click(); const two = curMove().fx;
    [...document.querySelectorAll('#side button')].find(b => b.dataset.tip?.startsWith('Move this effect up') && !b.hidden).click(); const sw = curMove().fx;
    adds()[1].click(); const key = fxAt(curMove(), 0).map(e => e.look);
    if (!Array.isArray(two) || two.length !== 2 || sw[0].look !== two[1].look || key.length !== 3 || fxNow(edChar(), { m: curMove(), i: 0 }).length !== 3) errs.push('move effect stack ' + JSON.stringify([two, sw, key]));
    [...document.querySelectorAll('#side button')].findLast(b => b.dataset.tip === 'Remove this effect' && !b.closest('[hidden]')).click(); if (fxAt(curMove(), 0).length !== 2) errs.push('remove an effect');
    undo(); undo(); undo(); undo(); undo(); if (JSON.stringify(curMove().fx) !== JSON.stringify(fx0) || curMove().keys[0].fx !== undefined) errs.push('effect stack undo');
    setMode('character'); studio.sel = 'head'; panels(); adds()[0].click(); adds()[0].click();
    const hf = DEFS.stick.bones.find(b => b.id === 'head').fx; if (hf?.length !== 2 || fxNow(currentChar(), null).length !== 2) errs.push('bone effect stack ' + JSON.stringify(hf));
    undo(); if (DEFS.stick.bones.find(b => b.id === 'head').fx) errs.push('bone effect undo (one step: the bone edits merge)'); }
  // the shadow section: the shape buttons set def.shadow (only what differs from the default), body draws a frame, off draws none, back to ellipse saves none
  { setMode('character'); pickChar('stick'); panels(); const shp = t => [...document.querySelectorAll('#side button')].find(b => b.dataset.tip === SHADOW_SHAPES[t]);
    shp('circle').click(); const c = JSON.stringify(DEFS.stick.shadow); shp('body').click(); for (let i = 0; i < 5; i++) for (const w of mode().worlds()) w.advance(1/60, NOIN); mode().render?.();
    const skew = [...document.querySelectorAll('#side .row')].find(r => r.dataset.tip?.startsWith('Body only'));
    shp('none').click(); const off = currentChar().shadow.shape, hid = skew.hidden; shp('ellipse').click();
    if (c !== '{"shape":"circle"}' || off !== 'none' || !hid || DEFS.stick.shadow) errs.push('shadow shapes ' + [c, off, hid, JSON.stringify(DEFS.stick.shadow)]);
    undo(); if (DEFS.stick.shadow) errs.push('shadow undo (one step: the shape clicks merge)'); }
  // the character editor's hip handle moves the waist over the feet: the legs bend, the ankles stay; one undo step
  { setMode('character'); pickChar('stick'); studio.stance = 0; panels();
    const f0 = edFrame(), hp = f0.P.hip, ids = f0.ch.chains.leg.map(c => ankleOf(c).id), p0 = JSON.stringify(curStance().pose);
    creatorMouse('down', hp[0], hp[1], {}); creatorMouse('move', hp[0] + 6, hp[1] + 20, {});
    const f1 = edFrame(), off = Math.max(...ids.map(id => Math.hypot(f1.P[id][0] - f0.P[id][0], f1.P[id][1] - f0.P[id][1])));
    creatorMouse('up', 0, 0, {});
    if (Math.abs(f1.P.hip[1] - hp[1] - 20) > 1 || off > 3 || JSON.stringify(curStance().pose) === p0) errs.push('hip drag ' + [f1.P.hip[1] - hp[1], off]);
    undo(); if (JSON.stringify(curStance().pose) !== p0) errs.push('hip drag undo'); }
  // this stance only: with a second stance picked, a bone length edit goes to the stance's body (the main body and the other stance keep theirs),
  // the editor and the preview show it, Del hides a bone there, undo takes it back
  { setMode('character'); pickChar('stick'); studio.stance = 1; studio.sel = 'uarmF'; panels(); mode().restart();
    const own = () => [...document.querySelectorAll('#side button')].find(b => b.dataset.tip?.startsWith('This stance only'));
    if (!own()) errs.push('no stance only toggle');
    own().click(); setProp('len', 30);
    const body = DEFS.stick.stances[0].body;
    if (!studio.own || DEFS.stick.bones.find(b => b.id === 'uarmF').len !== 17 || body?.bones?.uarmF?.len !== 30 || CHARS.stick.by.uarmF.len !== 17
      || viewChar().by.uarmF.len !== 30 || edFrame().ch.by.uarmF.len !== 30 || creator.w.a.ch.by.uarmF.len !== 30) errs.push('stance only len ' + JSON.stringify(body));
    deleteBone(); if (!viewChar().by.handF.hidden || CHARS.stick.by.uarmF.hidden) errs.push('stance only hide');
    undo(); undo(); if (DEFS.stick.stances[0].body?.bones?.uarmF?.len) errs.push('stance only undo');
    // requirements: where and exit on, stored only while they differ from the defaults
    const btn = t => [...document.querySelectorAll('#side button')].find(b => b.dataset.tip?.startsWith(t));
    btn('Only in the air').click(); btn('Hit (a blow').click();
    const rq = JSON.stringify(DEFS.stick.stances[0].req), on = CHARS.stick.stances[1].req;
    btn('Only standing').click(); btn('Hit (a blow').click();
    if (rq !== '{"grounded":false,"air":true,"exitOn":["hit"]}' || !on.air || DEFS.stick.stances[0].req) errs.push('stance req ' + rq + JSON.stringify(DEFS.stick.stances[0].req));
    // main is a stance too: it gets the same "this stance only" toggle, but its own body bakes into the character itself (no separate variant)
    studio.stance = 0; panels(); if (!own()) errs.push('no stance only toggle on main');
    setProp('len', 25);
    const mainBody = DEFS.stick.main?.body;
    if (!studio.own || mainBody?.bones?.uarmF?.len !== 25 || CHARS.stick.by.uarmF.len !== 25 || CHARS.stick.base
      || viewChar().by.uarmF.len !== 25 || edFrame().ch.by.uarmF.len !== 25 || creator.w.a.ch.by.uarmF.len !== 25) errs.push('main stance only len ' + JSON.stringify(mainBody));
    undo(); if (DEFS.stick.main) errs.push('main stance only undo');
    studio.own = false;
    // transition: move mode shows the move row; new transition move makes <main>To<Stance> and opens it in animate
    studio.stance = 1; panels(); const nm = morphName('main', curStance().name);
    btn('A keyframed transition move').click(); btn('Make ' + nm).click();
    if (DEFS.stick.stances[0].morph?.mode !== 'move' || !CHARS.stick.moves[nm] || app.mode !== 'animate' || anim.move !== nm) errs.push('transition move ' + [nm, app.mode, anim.move]);
    anim.move = 'jab'; undo(); undo(); if (DEFS.stick.moves[nm] || DEFS.stick.stances[0].morph) errs.push('transition undo');
    setMode('character'); studio.stance = 0; panels(); }
  // the bone table rearranges bones: drag a row's id onto another to move it before it (the draw order), click parent to hang it from another bone
  { setMode('character'); pickChar('stick'); lay('character').panel = 'bones'; creator.tsort = { k: '', dir: 1 }; creator.tfilter = ''; panels();
    const idCell = id => [...document.querySelectorAll('.btable tbody td:first-child')].find(td => td.textContent === id), ids = () => currentChar().ids;
    const dt = new DataTransfer(); idCell('uarmF').dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    idCell('thighF').dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true })); idCell('thighF').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    if (!(ids().indexOf('uarmF') < ids().indexOf('thighF'))) errs.push('bone reorder ' + ids());
    const pc = id => idCell(id).parentNode.children[1].querySelector('button');
    pc('handF').click(); const opts = [...document.querySelectorAll('.pop button')].map(b => b.textContent);
    if (!opts.includes('chest') || !opts.includes('hip') || opts.includes('handF')) errs.push('bone parent choices ' + opts);
    pc('handF').click(); pc('uarmF').click(); if ([...document.querySelectorAll('.pop button')].some(b => b.textContent === 'farmF')) errs.push('bone parent loop offered');
    pc('uarmF').click(); pc('handF').click(); [...document.querySelectorAll('.pop button')].find(b => b.textContent === 'chest').click();
    if (DEFS.stick.bones.find(b => b.id === 'handF').parent !== 'chest' || currentChar().by.handF.parent !== 'chest') errs.push('bone reparent');
    undo(); undo(); if (DEFS.stick.bones.find(b => b.id === 'handF').parent !== 'farmF' || !(ids().indexOf('thighF') < ids().indexOf('uarmF'))) errs.push('bone rearrange undo');
    lay('character').panel = null; panels(); }
  // play's fighter select: P1 and P2 each pick from a grid of cards (or follow the editor), swap trades them; the fight is rebuilt with them
  { setMode('play'); pickChar('stick'); lab.scen = 'you vs dummy'; lab.chars = [null, null]; setMode('play');
    const fb = i => [...document.querySelectorAll('#ctx button')].find(b => b.dataset.tip?.startsWith('P' + i + ':')), card = k => [...document.querySelectorAll('.pop .card')].find(c => c.textContent === k);
    fb(1).click(); if (document.querySelectorAll('.pop .card').length !== Object.keys(DEFS).length) errs.push('fighter cards ' + document.querySelectorAll('.pop .card').length);
    card('jabbo').click(); fb(2).click(); card('lumpo').click();
    const w = () => lab.cells[0].w;
    if (w().a.ch !== CHARS.jabbo || w().b.ch !== CHARS.lumpo || CURRENT !== 'stick') errs.push('fighter pick ' + w().a.ch.name + w().b.ch.name + CURRENT);
    [...document.querySelectorAll('#ctx button')].find(b => b.dataset.tip?.startsWith('Swap')).click();
    if (w().a.ch !== CHARS.lumpo || w().b.ch !== CHARS.jabbo) errs.push('fighter swap');
    fb(1).click(); [...document.querySelectorAll('.pop button')].find(b => b.textContent.includes('editor')).click();
    if (w().a.ch !== CHARS.stick || lab.chars[0] !== null) errs.push('fighter follows the editor');
    lab.chars = [null, null]; build();
    // a shield per fighter: off → no damage → untouchable → off, the fight rebuilt with it in the scen
    const sh = i => [...document.querySelectorAll('#ctx button')].find(b => b.dataset.tip?.startsWith('P' + i + "'s shield"));
    sh(2).click(); const nd = w().b.c('inv'); sh(2).click();
    if (nd !== 'nodamage' || w().b.c('inv') !== 'untouchable' || w().scen.bover?.inv !== 'untouchable' || w().a.c('inv') || !sh(2).classList.contains('on') || !sh(2).dataset.tip.includes('untouchable: nothing')) errs.push('shield ' + [nd, w().b.c('inv')]);
    sh(2).click(); if (w().b.c('inv') || lab.inv[1] || sh(2).classList.contains('on')) errs.push('shield off ' + w().b.c('inv'));
    // a scenario with more fighters has a pick for each: P3 unset fights as P2, P4 picked fights as that one
    lab.scen = 'ai free-for-all'; lab.chars = [null, 'lumpo']; build(); panels();
    const fp = [...document.querySelectorAll('#ctx .fpick')]; fp[3]?.click(); [...document.querySelectorAll('.pop .cards > *')].find(c => c.textContent.includes('jabbo'))?.click();
    if (fp.length !== 4 || w().fighters.map(f => f.ch.name).join() !== 'stick,lumpo,lumpo,jabbo') errs.push('fighter picks ' + fp.length + ' ' + w().fighters.map(f => f.ch.name));
    lab.scen = 'you vs dummy'; lab.chars = [null, null]; build(); panels(); }
  // the scenario picker: groups by who fights, scripted tests by topic, every scenario in one; the filter narrows them
  { setMode('play'); const sb = () => [...document.querySelectorAll('#ctx button')].find(b => b.dataset.tip?.startsWith('Choose who fights'));
    sb().click(); if ([...document.querySelectorAll('.pop h4')].some(e => !e.querySelector('.ic'))) errs.push('scenario group icons');
    const heads = [...document.querySelectorAll('.pop h4')].map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()), names = [...document.querySelectorAll('.pop .bar button')].filter(b => !b.parentNode.querySelector('input')).map(b => b.textContent);
    for (const g of ['you', 'engine AI', 'chains', 'juggles & falls', 'guard & counters', 'specials', 'movement', 'weapons']) if (!heads.includes(g)) errs.push('scenario group ' + g);
    if (names.length !== Object.keys(SCENARIOS).length || new Set(names).size !== names.length) errs.push('scenario picker lists ' + names.length);
    const q = document.querySelector('.pop input'); q.value = 'fireb'; q.dispatchEvent(new Event('input'));
    const shown = [...document.querySelectorAll('.pop .bar button')].filter(b => !b.hidden && !b.parentNode.querySelector('input')).map(b => b.textContent);
    if (shown.join() !== 'fireball,fireball clash' || [...document.querySelectorAll('.pop h4')].filter(e => !e.hidden).length !== 1) errs.push('scenario filter ' + shown);
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); if (lab.scen !== 'fireball' || document.querySelector('.pop')) errs.push('scenario filter enter ' + lab.scen);
    lab.scen = 'you vs dummy'; build(); }
  // layouts: folds and the side panel are kept per tab in the current layout; save as copies it, switching swaps them, reset clears a tab or all
  // (after the synchronous checks: save as asks for the name in the app's own dialog; its first button answers it)
  afterSync.push(async () => { setMode('play'); const fold = () => document.querySelector('#side .fold:not(.shut)'), k0 = fold().k; fold().querySelector('h3').click();
    if (lay().fold[k0] !== true || !JSON.parse(localStorage.getItem('stick2.layouts')).sets.default.tabs.play.fold[k0]) errs.push('layout fold saved');
    togglePanel(); if (!document.body.classList.contains('noside') || !lay().hide.side) errs.push('layout panel off');
    setMode('character'); if (document.body.classList.contains('noside')) errs.push('layout panel is per tab'); setMode('play');
    const asked = laySaveAs(), modal = document.querySelector('.modal');
    if (!modal?.querySelector('input')) errs.push('layout save as dialog'); else { modal.querySelector('input').value = 'mine'; modal.querySelector('button').click(); }
    await asked; if (document.querySelector('.modal')) errs.push('layout dialog stays open');
    if (layouts.current !== 'mine' || !lay().hide.side) errs.push('layout save as');
    layReset('play'); if (document.body.classList.contains('noside') || lay().fold[k0] !== undefined) errs.push('layout reset tab');
    layUse('default'); if (!document.body.classList.contains('noside')) errs.push('layout switch');
    $('global').querySelector('button[data-tip^="Layout:"]').click(); const pb = t => [...document.querySelectorAll('.pop button')].find(b => b.textContent.includes(t));
    // hover-highlight: a shown part outlines its live element; a hidden one (the side panel, just turned off above) gets a dashed box over its container instead
    { const theaterRow = pb('theater'), r1 = $('ctx').querySelector('[data-part="theater"]').getBoundingClientRect();
      theaterRow.onmouseenter(); const hi = document.querySelector('.layhi');
      if (!hi || hi.classList.contains('hidden') || Math.abs(hi.getBoundingClientRect().left - r1.left) > 1) errs.push('layout highlight shown ' + hi?.className);
      theaterRow.onmouseleave(); if (document.querySelector('.layhi')) errs.push('layout highlight cleared');
      const panelRow = [...document.querySelectorAll('.pop button')].find(b => b.textContent === 'panel');
      panelRow.onmouseenter(); const hi2 = document.querySelector('.layhi');
      if (!hi2 || !hi2.classList.contains('hidden')) errs.push('layout highlight hidden ' + hi2?.className);
      panelRow.onmouseleave(); }
    if (!pb('mine') || pb('delete')) errs.push('layout popup'); pb('reset all').click();
    if (document.body.classList.contains('noside') || Object.keys(laySet().tabs).some(t => Object.keys(lay(t).fold).length)) errs.push('layout reset all');
    layUse('mine'); layDelete(); if (layouts.current !== 'default' || layouts.sets.mine) errs.push('layout delete'); closePop();
    paletteEntries().find(e => e.name === 'layout: default')?.run(); if (layouts.current !== 'default') errs.push('layout in ⌘K');
    layouts.fresh = true; ui.fold = { 'impact:presets': true, 'gallery:power': true }; layInit(); // folds saved before layouts move to their tab
    if (lay('play').fold['impact:presets'] !== true || lay('animate').fold['gallery:power'] !== true || ui.fold) errs.push('layout migration'); layReset(); });
  // visibility: toolbar groups and side sections hide per tab (popup, heading ×, ⌘K); the overlays sit in one order, meter / inputs / colours kept per tab
  { setMode('play'); const part = (k, p) => $(k).querySelector('[data-part="' + p + '"]');
    layShow('ctx:fight', false); if (part('ctx', 'fight') || !app.parts.ctx.includes('fight')) errs.push('hide toolbar group');
    setMode('impact'); if (part('ctx', 'fight')) errs.push('hidden group is per tab, not per view'); if (lay('grid').hide['ctx:fight']) errs.push('hidden group on another tab'); setMode('play');
    const sec = app.parts.side[0]; $('side').querySelector('.fold h3 .hidebtn').click();
    if ([...$('side').querySelectorAll('.fold')].some(f => f.fname === sec) || layShown('side:' + sec)) errs.push('heading hides its section');
    layoutPanel(null, $('global').querySelector('button[data-tip^="Layout:"]'));
    const tg = t => [...pop.querySelectorAll('button')].find(b => b.textContent.trim() === t);
    tg(sec).click(); tg('fight').click(); if (!layShown('side:' + sec) || !part('ctx', 'fight')) errs.push('layout popup shows parts again'); closePop();
    paletteEntries().find(e => e.name === 'hide toolbar group: fight')?.run(); if (part('ctx', 'fight')) errs.push('hide in ⌘K'); layShow('ctx:fight', true);
    const tips = [...part('ctx', 'show').querySelectorAll('button')].map(b => b.dataset.tip.split(/[ :]/)[0]).join();
    if (tips !== 'Frame,Input,Boxes,Ghost,Hud,Labels') errs.push('show order ' + tips);
    lab.meter = true; setMode('grid'); if (lab.meter) errs.push('meter per tab'); setMode('play');
    if (!lab.meter || !JSON.parse(localStorage.getItem('stick2.layouts')).sets.default.tabs.play.show.meter) errs.push('meter saved');
    setDisplay('hud', false); setDisplay('labels', false); labRender(); setDisplay('hud', true); setDisplay('labels', true);
    layReset(); if (lab.meter) errs.push('reset clears overlays'); }
  // order: dragging a part in the layout popup onto another puts it before that one (onto the row's label: last); kept per tab, reset clears it
  { setMode('play'); const ids = k => [...$(k).children].map(el => k === 'ctx' ? el.dataset.part : el.fname).filter(Boolean);
    const c0 = app.parts.ctx, s0 = app.parts.side;
    layoutPanel(null, $('global').querySelector('button[data-tip^="Layout:"]'));
    const tg = t => [...pop.querySelectorAll('button')].find(b => b.textContent.trim() === t), dt = new DataTransfer();
    const dnd = (from, to) => { from.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true })); to.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); };
    dnd(tg(c0.at(-1)), tg(c0[0])); dnd(tg(s0[0]), [...pop.querySelectorAll('.row > span')].find(x => x.textContent === 'side panel'));
    const c1 = ids('ctx'), s1 = ids('side');
    if (c1[0] !== c0.at(-1) || c1.slice(1).join() !== c0.slice(0, -1).join() || s1.at(-1) !== s0[0] || app.parts.side.join() !== s1.join()) errs.push('reorder ' + c1 + ' / ' + s1);
    setMode('grid'); if (lay().order) errs.push('order per tab'); setMode('play'); if (ids('ctx')[0] !== c0.at(-1)) errs.push('order kept');
    closePop(); layReset('play'); if (ids('ctx').join() !== c0.join() || ids('side').join() !== s0.join()) errs.push('reset order'); }
  // sizes: the grip sets the side panel's width (220–560, per tab, double-click: default); the editor / preview boundary drags (animate, character)
  { setMode('play'); const g = $('grip'), pe = (t, x) => (t === 'pointerdown' ? g : window).dispatchEvent(new PointerEvent(t, { clientX: x, bubbles: true }));
    pe('pointerdown', innerWidth - 300); pe('pointermove', innerWidth - 450); pe('pointerup', innerWidth - 450);
    if (lay().size?.side !== 450 || $('side').offsetWidth !== 450) errs.push('side width ' + lay().size?.side + ' ' + $('side').offsetWidth);
    pe('pointerdown', innerWidth - 450); pe('pointerup', innerWidth - 100); if (lay().size.side !== 220) errs.push('side width clamped ' + lay().size.side);
    setMode('animate'); if ($('side').offsetWidth !== 300) errs.push('side width per tab ' + $('side').offsetWidth); setMode('play');
    g.dispatchEvent(new MouseEvent('dblclick')); if ($('side').offsetWidth !== 300 || lay().size.side) errs.push('side width reset');
    setMode('animate'); const cv = canvas.getBoundingClientRect(), me = (t, x) => (t === 'mousedown' ? canvas : window).dispatchEvent(new MouseEvent(t, { clientX: cv.left + x, clientY: cv.top + 100, bubbles: true }));
    const x0 = anLayout().pv.x / dpr, k0 = anim.key; me('mousedown', x0); me('mousemove', x0 - 100); me('mouseup', x0 - 100);
    if (Math.abs(anLayout().pv.x / dpr - (x0 - 100)) > 1 || anim.key !== k0 || !JSON.parse(localStorage.getItem('stick2.layouts')).sets.default.tabs.animate.size.split) errs.push('split ' + anLayout().pv.x / dpr + ' ' + x0);
    setMode('character'); if (Math.abs(edLayout().pv.x / dpr - x0) > 1) errs.push('split per tab'); layReset(); setMode('play'); }
  // theater mode (play only): hides the toolbars and the side panel; the key and Esc both leave it
  { setMode('play'); panels();
    const btn = [...document.querySelectorAll('#ctx button')].find(b => b.dataset.tip?.startsWith('Theater mode'));
    btn.click();
    if (!app.theater || !document.body.classList.contains('theater') || $('top').offsetParent || $('side').offsetParent || $('help').offsetParent) errs.push('theater on ' + app.theater);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    if (app.theater || document.body.classList.contains('theater') || !$('top').offsetParent) errs.push('theater esc');
    btn.click(); document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', shiftKey: true, bubbles: true })); // in a fight, letters are the fighter's: the shortcut takes ⇧
    if (app.theater) errs.push('theater key toggles off'); }
  // compare settings: A and B (current, a preset, a file) differing in 3 settings give 3 rows; use B takes one (undoable), use all B every one; the text has - / + lines
  // (compare lives in grid, not play: no button for it there, and opening it from elsewhere lands in grid)
  { setMode('grid'); applyPreset('juicy'); const keep = { ...CFG };
    cmp.a = { name: 'current' }; cmp.b = { name: 'f', cfg: { ...cfgFrom({}), hitstop: 0.2, gravity: 999, easing: 'step' } }; cmp.all = false; cmp.q = '';
    paletteEntries().find(e => e.name === 'compare settings').run();
    const rows = () => [...document.querySelectorAll('.cmptable tbody tr')], cell = (r, i) => r.children[i].textContent;
    if (stageOpen() !== 'compare' || rows().length !== 3 || rows().map(r => cell(r, 1)).join() !== cmpRows().map(r => r.k).join()) errs.push('compare rows ' + rows().length);
    rows().find(r => cell(r, 1) === 'gravity').querySelector('button').click();
    if (CFG.gravity !== 999 || rows().length !== 2 || rows().some(r => cell(r, 1) === 'gravity')) errs.push('compare use B ' + CFG.gravity);
    undo(); if (CFG.gravity !== keep.gravity) errs.push('compare undo');
    const t = cmpText(); if (!t.includes('- hitstop: ' + keep.hitstop) || !t.includes('+ easing: step') || t.split('\\n').length !== 8) errs.push('compare text ' + t);
    cmp.all = true; panels(); if (rows().length < 50) errs.push('compare all ' + rows().length); cmp.all = false;
    [...document.querySelectorAll('.cmptable button')].find(b => b.textContent === 'use all B').click(); if (rows().length !== 1 || rows()[0].textContent !== 'A and B are the same') errs.push('compare use all ' + rows().length);
    undo(); cmp.a = { name: 'raw' }; cmp.b = { name: 'juicy' }; panels(); if (!rows().some(r => cell(r, 1) === 'easing')) errs.push('compare presets');
    setMode('play'); if (document.querySelector('.cmptable')) errs.push('compare per tab');
    if ([...document.querySelectorAll('#ctx button')].some(b => b.dataset.tip?.startsWith(CMP_PANEL_TIP))) errs.push('compare button in play');
    setMode('grid'); if (!document.querySelector('.cmptable')) errs.push('compare back in grid'); closeStage(); if (document.querySelector('.cmptable')) errs.push('compare close'); }
  // survival: the side panel has the Survival settings, the fight draws with its time counter
  { setMode('play'); lab.scen = 'survival'; build(); panels(); const w = lab.cells[0].w; for (let i = 0; i < 200; i++) w.advance(1/60, NOIN); labRender();
    if (!w.scen.survival || w.survT < 3 || ![...document.querySelectorAll('#side h3')].some(e => e.textContent.includes('Survival'))) errs.push('survival ' + w.survT);
    // a slider's value typed: any number is kept (-1 for survHp, flagged red: below a range that never goes negative), undoable; enemies get 1 health
    const hpRow = [...document.querySelectorAll('#side .row')].find(r => r.firstChild.textContent === 'survHp'), hpv = hpRow?.querySelector('input.v');
    if (hpv) { hpv.value = '-1'; hpv.dispatchEvent(new Event('change')); }
    const w2 = new World(SCENARIOS.survival);
    syncAll(); if (CFG.survHp !== -1 || hpv.value !== '-1' || !hpv.classList.contains('danger') || w2.b.c('health') !== 1) errs.push('survHp typed ' + CFG.survHp + ' ' + w2.fighters.map(f => f.c('health')));
    undo(); if (CFG.survHp !== 0.5) errs.push('survHp typed undo ' + CFG.survHp);
    lab.scen = 'you vs dummy'; build(); panels(); }
  // the grid's compare kind: two cells with A's and B's settings, the same seed; a click on B takes its settings (undoable); the panels seg opens the diff over it
  { const keep = { ...CFG }; cmp.a = { name: 'current' }; cmp.b = { name: 'juicy' }; lab.kind = 'compare'; setMode('grid');
    const [A, B] = lab.cells, J = cmpCfg({ name: 'juicy' });
    if (lab.cells.length !== 2 || lab.cols !== 2 || B.label !== 'B · juicy' || A.over.hitstop !== keep.hitstop || B.over.hitstop !== J.hitstop || A.w.seed !== B.w.seed) errs.push('grid compare cells ' + lab.cells.map(c => c.label));
    const r = labRects()[1]; labClick(r.x + r.w / 2, r.y + r.h / 2, {});
    if (CFG.hitstop !== J.hitstop || !lab.zoom) errs.push('grid compare adopt ' + CFG.hitstop); undo(); if (CFG.hitstop !== keep.hitstop) errs.push('grid compare undo');
    [...document.querySelectorAll('#ctx button')].find(b => b.dataset.tip?.startsWith(CMP_PANEL_TIP)).click(); if (!document.querySelector('#over > .cmptable')) errs.push('grid compare diff');
    closeStage(); lab.kind = 'sweep'; setMode('play'); }
  // settings persist: a change is stored (only what differs from the defaults), comes back on load, bad values are dropped; reset settings brings back the defaults
  { setCfg({ hitstop: 0.2, easing: 'step' }); setDisplay('boxes', true); saveCfg.flush(); const st = JSON.parse(localStorage.getItem('stick2.settings'));
    if (st.hitstop !== 0.2 || st.easing !== 'step' || st.boxes !== true || 'gravity' in st) errs.push('settings stored ' + JSON.stringify(st));
    localStorage.setItem('stick2.settings', JSON.stringify({ ...st, gravity: 'heavy', nope: 1 })); Object.assign(CFG, DEFAULTS); loadCfg();
    if (CFG.hitstop !== 0.2 || CFG.easing !== 'step' || !CFG.boxes || CFG.gravity !== DEFAULTS.gravity || 'nope' in CFG) errs.push('settings loaded');
    setMode('play'); debugBtn().click(); [...document.querySelectorAll('.pop button')].find(b => b.textContent.includes('reset settings')).click(); closePop();
    if (CFG.hitstop !== DEFAULTS.hitstop || CFG.easing !== DEFAULTS.easing || !CFG.boxes) errs.push('reset settings');
    undo(); if (CFG.hitstop !== 0.2) errs.push('reset settings undo');
    setDisplay('boxes', false); applyPreset('juicy'); saveCfg.flush(); if (localStorage.getItem('stick2.settings') !== '{}') errs.push('settings at defaults ' + localStorage.getItem('stick2.settings')); }
  // factory reset (⌘K or the debug popup): asks first, then deletes every stick2 key in localStorage (nothing else) and reloads
  { const keep = Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('stick2.')).map(k => [k, localStorage[k]]));
    localStorage.setItem('stick2.chars', '{}'); localStorage.setItem('stick2.ui', '{}'); localStorage.setItem('other.app', '1');
    let reloaded = 0; reload = () => { reloaded++; };
    const e = paletteEntries().find(e => e.name === 'factory reset'); e?.run();
    if (!document.querySelector('.pop') || localStorage.getItem('stick2.chars') === null) errs.push('factory reset asks first');
    [...document.querySelectorAll('.pop button')].find(b => b.textContent.includes('cancel'))?.click();
    if (document.querySelector('.pop') || localStorage.getItem('stick2.chars') === null || reloaded) errs.push('factory reset cancel');
    setMode('play'); debugBtn().click(); [...document.querySelectorAll('.pop button')].find(b => b.textContent.includes('factory reset'))?.click();
    [...document.querySelectorAll('.pop button')].find(b => b.textContent.includes('delete everything'))?.click();
    if (Object.keys(localStorage).some(k => k.startsWith('stick2.')) || localStorage.getItem('other.app') !== '1' || reloaded !== 1) errs.push('factory reset ' + Object.keys(localStorage) + reloaded);
    localStorage.removeItem('other.app'); for (const k in keep) localStorage.setItem(k, keep[k]); }
  // the scenario builder: new from the current scenario, characters, controllers, a script, settings; saved in the browser as you go, listed under my scenarios
  { const keep = localStorage.getItem('stick2.scenarios'); setMode('play'); lab.scen = 'J,J,K'; build(); panels();
    const sb = () => [...document.querySelectorAll('#ctx button')].find(b => b.dataset.tip?.startsWith('Choose who fights')), pb = t => [...document.querySelectorAll('.pop button')].find(b => b.textContent.includes(t));
    const bb = (t, root = document.querySelector('.sbuild')) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === t), row = i => document.querySelector('.sbuild [data-p="' + i + '"]');
    sb().click(); pb('new scenario').click(); panels();
    const name = lab.scen, u = () => myScens()[lab.scen], w = () => lab.cells[0].w;
    if (!document.querySelector('.sbuild') || !u() || !/^my scenario/.test(name) || u().p[0].ctl !== 'script' || u().p[0].script !== 'punch, 0.13, punch, 0.13, kick') errs.push('builder new ' + name + JSON.stringify(u()));
    bb('jabbo', row(0)).click(); bb('lumpo', row(1)).click(); bb('AI', row(1)).click();
    bb('untouchable', row(1)).click(); const inv1 = [u().p[1].inv, w().b.c('inv')]; row(1).querySelector('button[data-tip="P2 can be hit and hurt"]').click();
    if (inv1.join() !== 'untouchable,untouchable' || 'inv' in u().p[1] || w().b.c('inv')) errs.push('builder shield ' + inv1);
    const sc = row(0).querySelector('input.script'); sc.value = '0.2, 2P'; sc.dispatchEvent(new Event('change'));
    const nm = document.querySelector('.sbuild input.sname'); nm.value = 'jab vs sumo'; nm.dispatchEvent(new Event('change'));
    if (lab.scen !== 'jab vs sumo' || !SCENARIOS['jab vs sumo'] || SCENARIOS[name] || w().a.ch !== CHARS.jabbo || w().b.ch !== CHARS.lumpo || !(w().ctl[1] instanceof Brain) || JSON.stringify(w().scen.a) !== JSON.stringify([0.2, 'down+punch'])) errs.push('builder edit ' + lab.scen + ' ' + JSON.stringify(w().scen.a));
    const f = document.querySelector('.sbuild input.sfind'); f.value = 'gravit'; f.dispatchEvent(new Event('input')); bb('gravity').click();
    if (u().cfg.gravity !== CFG.gravity) errs.push('builder add setting ' + JSON.stringify(u().cfg));
    setCfg({ hitstop: 0.2 }); bb(Object.values(document.querySelectorAll('.sbuild button')).find(b => b.textContent.includes('take my settings')).textContent.trim()).click();
    if (u().cfg.hitstop !== 0.2 || w().cfg.hitstop !== 0.2) errs.push('builder take settings ' + JSON.stringify(u().cfg)); applyPreset('juicy');
    if (!JSON.parse(localStorage.getItem('stick2.scenarios'))['jab vs sumo']) errs.push('builder saved');
    sb().click(); const g = [...document.querySelectorAll('.pop h4')].find(e => e.textContent.includes('my scenarios'));
    if (!g || g.nextSibling.textContent !== 'jab vs sumo') errs.push('builder group'); closePop();
    const json = exportScens(); importScens(json.replace('jab vs sumo', 'copy of it')); if (!SCENARIOS['copy of it']) errs.push('builder import');
    if (!document.querySelector('.sbuild')) errs.push('builder gone ' + lab.scen + lay('play').panel + lab.mode);
    if (!$('ctx').querySelector('[data-part="panels"]')) errs.push('builder in the panels group');
    $('ctx').querySelector('[data-part="panels"] button[data-tip^="Edit this scenario"]').click(); if (document.querySelector('.sbuild')) errs.push('panels seg closes the builder');
    $('ctx').querySelector('[data-part="panels"] button[data-tip^="Edit this scenario"]').click(); if (!document.querySelector('.sbuild')) errs.push('panels seg opens the builder');
    [...document.querySelectorAll('.sbuild button')].find(b => b.dataset.tip === 'Delete this scenario').click(); if (SCENARIOS['jab vs sumo'] || myScens()['jab vs sumo'] || lab.scen === 'jab vs sumo') errs.push('builder delete ' + lab.scen);
    delete myScens()['copy of it']; delete SCENARIOS['copy of it']; lay('play').panel = null; keep === null ? localStorage.removeItem('stick2.scenarios') : localStorage.setItem('stick2.scenarios', keep); lab.scen = 'you vs dummy'; build(); panels(); }
  // the tests view: a move against every target column (and opponent), checked; failing only; a cell isolated plays over the table and opens in animate with its setup
  { setMode('tests'); tests.move = 'jab'; rerunTests(); panels();
    for (let i = 0; i < 200 && tests.queue.length; i++) testMode.tick();
    const cellsN = document.querySelectorAll('.tmat td.tcell').length - Object.keys(myScens()).length;
    if (tests.queue.length || cellsN !== 28 || document.querySelectorAll('.tmat td.fail').length || !testProgress.textContent.startsWith('28/28')) errs.push('tests jab ' + cellsN + ' ' + testProgress.textContent);
    tests.opps = 'all'; rerunTests(); if (tests.total !== 28 * Object.keys(DEFS).length + Object.keys(myScens()).length) errs.push('tests all opponents ' + tests.total); tests.opps = 'same'; rerunTests(); panels();
    for (let i = 0; i < 200 && tests.queue.length; i++) testMode.tick();
    const k = cellKey('jab', CURRENT, 8); tests.res[k] = { out: 'hit', issues: ['made up'], t: 1 }; tests.failing = true; panels();
    if (document.querySelectorAll('.tmat tbody tr').length !== 1 || document.querySelectorAll('.tmat td.fail').length !== 1) errs.push('tests failing only ' + document.querySelectorAll('.tmat tbody tr').length);
    document.querySelector('.tmat td.fail').click();
    if (tests.sel !== k || !tests.w || !document.querySelector('.tmat.iso') || !document.querySelector('.tmat .bar').textContent.includes('made up')) errs.push('tests isolate ' + tests.sel);
    [...document.querySelectorAll('.tmat button')].find(b => b.textContent.includes('open in animate')).click();
    if (app.mode !== 'animate' || anim.move !== 'jab' || anim.target.stance !== 'guard' || anim.target.facing !== 'toward' || anim.target.dist !== 'near') errs.push('tests open in animate ' + app.mode + JSON.stringify(anim.target));
    setMode('tests'); const h0 = CFG.hitstop; setCfg({ hitstop: h0 + 0.01 }); testMode.tick(); if (tests.total - tests.queue.length > 40 || tests.res[k]) errs.push('tests rerun on a setting'); setCfg({ hitstop: h0 });
    tests.failing = false; tests.move = null; anim.target = { char: null, stance: 'stand', state: 'idle', facing: 'toward', dist: 'near' }; setMode('play'); }
  // ⌘K reaches every table: the move table, the input table, the combos (character tab: over its stage, else animate) and the bone table (character tab)
  { const run = n => { closePop(); paletteEntries().find(e => e.name === n)?.run(); panels(); };
    setMode('play'); run('move table'); if (app.mode !== 'animate' || lay('animate').panel !== 'table' || !document.querySelector('.mtable tbody tr')) errs.push('palette move table ' + app.mode + lay('animate').panel);
    run('input table'); if (lay('animate').panel !== 'inputs' || !inputs.table || !document.querySelector('.mtable table:not([hidden])')) errs.push('palette input table ' + lay('animate').panel);
    setMode('character'); run('move table'); if (app.mode !== 'character' || lay('character').panel !== 'table') errs.push('palette move table in character ' + lay('character').panel);
    run('bone table'); if (app.mode !== 'character' || lay('character').panel !== 'bones' || !document.querySelector('.btable')) errs.push('palette bone table');
    setMode('play'); run('bone table'); if (app.mode !== 'character' || !document.querySelector('.btable')) errs.push('palette bone table from play ' + app.mode);
    lay('character').panel = null; lay('character').panel = null; lay('animate').panel = null; inputs.table = false; panels(); }
  // ⌘K: combos opens the combo editor over the stage (character tab: there, else animate)
  { setMode('play'); const e = paletteEntries().find(e => e.name === 'combos' && e.kind === 'editor'); e?.run(); panels();
    if (app.mode !== 'animate' || lay('animate').panel !== 'combos' || !document.querySelector('.ctable')) errs.push('palette combos ' + app.mode + lay('animate').panel);
    setMode('character'); e?.run(); panels(); if (app.mode !== 'character' || lay('character').panel !== 'combos' || !document.querySelector('.ctable')) errs.push('palette combos in character');
    lay('character').panel = null; lay('animate').panel = null; panels(); }
  // the gallery only builds and runs the cells on screen: the rest wait until scrolled into view
  { setMode('gallery'); const n = lab.cells.length, built = () => lab.cells.filter(c => c._w).length;
    if (mode().worlds().length >= n || built() > mode().worlds().length) errs.push('gallery lazy ' + [mode().worlds().length, built(), n]);
    lab.scroll = maxScroll(); const last = lab.cells[n - 1]; labRender();
    if (!mode().worlds().includes(last.w) || lab.cells[1]._w) errs.push('gallery scrolled ' + mode().worlds().length); // (the focused first cell is kept for the Debug panel)
    lab.scroll = 0; }
  // the gallery: every move, then every movement (with a hover tip); all run without errors
  { setMode('gallery'); const n = Object.keys(currentChar().moves).length, mv = lab.cells.filter(c => c.motion);
    if (lab.cells.length !== n + Object.keys(MOVEMENTS).length || mv.length !== Object.keys(MOVEMENTS).length || !mv.every(c => c.tip)) errs.push('gallery cells ' + lab.cells.length);
    for (const c of lab.cells) for (let i = 0; i < 30; i++) c.w.advance(1/60, NOIN);
    labRender(); }
  // the command palette: typing ranks a mode first, Enter runs it; a setting searches the settings panel for it
  { setMode('play'); const pal = q => { openPalette(); const i = document.querySelector('#palette input'); i.value = q; i.dispatchEvent(new Event('input'));
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); };
    pal('galle'); if (app.mode !== 'gallery' || $('palette')) errs.push('palette mode ' + app.mode);
    pal('hitstopFin'); if (mode() !== labMode || lab.q !== 'hitstopFin' || !document.querySelector('#side.searching')) errs.push('palette setting ' + [app.mode, lab.q]); lab.q = ''; panels(); }
  // power presets: one button sets the hit and bounce settings, and shows as on while they match
  { setMode('play'); const b = [...document.querySelectorAll('#side button')].find(b => b.textContent.includes('pinball')); b.click(); syncAll();
    if (CFG.powerScale !== 3 || CFG.ceiling !== 0.9 || !b.classList.contains('on')) errs.push('power preset ' + [CFG.powerScale, CFG.ceiling]); applyPreset('juicy'); }
  // input table: a new motion input gets a row and a move; the damage of the move an input plays is edited in place
  { setMode('animate'); pickChar('stick'); lay('animate').panel = 'inputs'; inputs.table = true; panels();
    edit(def => { (def.motions ??= {}).m41236 = '41236'; editBinds(def).m41236Punch = 'launcher'; }); syncAll();
    const row = [...document.querySelectorAll('.itable tbody tr')].find(r => r.textContent.includes('m41236Punch'));
    if (!row || !row.textContent.includes('launcher')) errs.push('custom input row ' + !!row);
    const dmg = row?.querySelectorAll('input[type=number]')[1]; if (dmg) { dmg.value = 17; dmg.dispatchEvent(new Event('change')); }
    if (DEFS.stick.moves.launcher.damage !== 17) errs.push('input table damage ' + DEFS.stick.moves.launcher.damage);
    removeInput('m41236'); if (DEFS.stick.motions.m41236 || editBinds(DEFS.stick).m41236Punch) errs.push('remove input');
    undo(); undo(); undo(); lay('animate').panel = null; inputs.table = false; panels(); }
  // compare: under the preview, not the toolbar; the strip button picks a move to compare with; the filmstrip draws both, a click on a frame goes there
  { setMode('animate'); pickChar('stick'); anim.move = 'roundhouse'; anim.cmp = null; anim.cmpView = 'off'; panels();
    if (document.querySelector('#ctx [data-tip="The move to compare with"]')) errs.push('compare still in toolbar');
    [...document.querySelectorAll('.cmpbar button')].find(b => b.dataset.tip?.startsWith('Filmstrip')).click();
    if (anim.cmpView !== 'strip' || cmpMove()) errs.push('compare strip ' + anim.cmpView);
    [...document.querySelectorAll('.cmpbar button')].find(b => b.dataset.tip === 'The move to compare with').click();
    [...document.querySelectorAll('.pop button')].find(b => b.textContent.trim().endsWith('armada')).click();
    if (anim.cmp !== 'armada' || anim.cmpView !== 'strip') errs.push('compare pick ' + [anim.cmp, anim.cmpView]);
    mode().render(); const { step, cw } = stripCells(anLayout().ed); animMouse('down', cw * 2.5, anLayout().ed.h / 2, { detail: 1 });
    if (Math.abs(anim.t - 2 * step) > 1e-6) errs.push('strip click ' + anim.t);
    anim.cmpView = 'overlay'; mode().render(); anim.cmpView = 'off'; anim.cmp = null; }
  // random characters: keeping a cell twice asks to update the kept character instead of adding a copy
  afterSync.push(async () => { setMode('character'); randomExp(); const n0 = Object.keys(DEFS).length; await keepRandom(0); const name = CURRENT, n1 = Object.keys(DEFS).length;
    const again = keepRandom(0), yes = document.querySelector('.modal button'); yes?.click(); await again;
    if (n1 !== n0 + 1 || Object.keys(DEFS).length !== n1 || !yes || CURRENT !== name) errs.push('keep random ' + [n0, n1, Object.keys(DEFS).length, !!yes]);
    delete DEFS[name]; delete CHARS[name]; creator.expOn = false; pickChar('stick'); });
  // character editor: Shift/⌘+click in the bone tree selects several bones, a value change goes to all of them; a plain click selects one
  { setMode('character'); pickChar('stick'); panels();
    const tb = id => [...document.querySelectorAll('.tree button')].find(b => b.textContent.trim().startsWith(id + ' ') || b.textContent.trim() === id);
    tb('uarmF').click(); tb('uarmB').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); tb('thighF').dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }));
    syncAll(); const title = [...document.querySelectorAll('h3, .head')].find(e => e.textContent.startsWith('Bone'))?.textContent || '';
    setProp('lag', 1.7); const lag = id => DEFS.stick.bones.find(b => b.id === id).lag;
    if (selIds()[0] !== 'thighF' || selIds().sort().join() !== 'thighF,uarmB,uarmF' || [lag('uarmF'), lag('uarmB'), lag('thighF')].some(v => v !== 1.7) || lag('farmF') === 1.7 || !title.includes('+ 2'))
      errs.push('multi-select ' + [selIds(), lag('uarmF'), lag('uarmB'), lag('thighF'), title.slice(0, 30)]);
    tb('uarmB').dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true })); if (selIds().sort().join() !== 'thighF,uarmF') errs.push('multi-select remove ' + selIds());
    tb('farmF').click(); if (selIds().join() !== 'farmF') errs.push('plain click ' + selIds());
    undo(); }
  // bone table: rows select (⌘+click adds), an edit in a selected row goes to every selected bone, in another row to that bone only
  { setMode('character'); pickChar('stick'); lay('character').panel = 'bones'; panels();
    const row = id => [...document.querySelectorAll('.btable tbody tr')].find(r => r.firstChild.textContent === id);
    const cell = (id, k) => row(id).children[BONE_COLS.findIndex(c => c.k === k)].querySelector('input');
    const lag = id => DEFS.stick.bones.find(b => b.id === id).lag;
    row('shinF').click(); row('shinB').dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true })); syncAll();
    const on = [...document.querySelectorAll('.btable tr.on')].length;
    const c = cell('shinB', 'lag'); c.value = '2.3'; c.dispatchEvent(new Event('change'));
    const o = cell('footF', 'lag'); o.value = '0.4'; o.dispatchEvent(new Event('change'));
    if (on !== 2 || lag('shinF') !== 2.3 || lag('shinB') !== 2.3 || lag('footF') !== 0.4 || lag('footB') === 0.4 || selIds().sort().join() !== 'shinB,shinF')
      errs.push('bone table ' + [on, lag('shinF'), lag('shinB'), lag('footF'), selIds()]);
    undo(); undo(); syncAll(); if (cell('shinF', 'lag').value === '2.3') errs.push('bone table after undo');
    lay('character').panel = null; panels(); }
  // debug: a popup from the menu bar (not in the side panel), with the engine version and the fighters of the shown fight, in any mode
  { setMode('play'); panels(); if (dbgInfo.isConnected || [...$('side').querySelectorAll('h3')].some(e => e.textContent.startsWith('Debug'))) errs.push('debug still in the side panel');
    debugBtn().click(); dbgT = 0; drawDebug();
    if (!dbgInfo.isConnected || !dbgInfo.textContent.includes('engine v' + ENGINE_VERSION) || !/P2 /.test(dbgInfo.textContent)) errs.push('debug info ' + dbgInfo.textContent.slice(0, 80));
    closePop(); setMode('animate'); panels(); debugBtn().click(); dbgT = 0; drawDebug(); drawScope();
    if (!dbgInfo.textContent.includes('animate') || !/P1 /.test(dbgInfo.textContent) || !stats.textContent.startsWith('animate')) errs.push('debug in animate ' + dbgInfo.textContent.slice(0, 120));
    closePop(); setMode('play'); panels(); }
  // keys by context: in a fight a shortcut letter takes ⇧ and the letters are the fighter's; in the editor modes the plain key
  // is the shortcut and fight keys do nothing; a focused slider keeps its keys; a clicked button lets go of focus; clashes are flagged
  { const kd = (code, o = {}, t = document.body) => { t.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...o })); t.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, ...o })); };
    setMode('play'); app.paused = false; readInput();
    kd('KeyP'); const p0 = app.paused; kd('KeyP', { shiftKey: true }); const p1 = app.paused; app.paused = false;
    kd('KeyJ'); const punch = readInput().punch, panel = document.body.classList.contains('noside'); kd('KeyH'); const panel1 = document.body.classList.contains('noside');
    setMode('animate'); app.paused = false; kd('KeyP'); const p2 = app.paused; app.paused = false; kd('KeyJ'); const punch2 = readInput().punch;
    if (p0 || !p1 || !punch || panel1 !== panel || !p2 || punch2) errs.push('key contexts ' + [p0, p1, punch, panel1 === panel, p2, punch2]);
    setMode('play'); const sl = document.querySelector('#side input[type=range]'); sl.focus(); const v0 = sl.value; kd('KeyD', {}, sl); kd('KeyA', {}, sl);
    if (readInput().right || readInput().left) errs.push('a focused slider passes keys to the fighter');
    sl.blur(); const b = [...document.querySelectorAll('#global button')][0]; b.focus(); b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    if (document.activeElement === b) errs.push('a clicked button keeps focus');
    if (keyClashes().size) errs.push('default keys clash ' + [...keyClashes()]);
    keymap.onion = ['KeyP']; if (!keyClashes().has('onion') || !keyClashes().has('pause')) errs.push('clash not flagged');
    keymap.onion = ['KeyO']; unbind('KeyJ', 'view'); if (!keymap.punch.includes('KeyJ')) errs.push('a view key took the punch key');
    unbind('KeyP', 'animate'); if (keymap.pause.includes('KeyP')) errs.push('an editor key did not take the pause key');
    keymap.pause = ['KeyP'];
    // custom binds: any paletteEntries() function (not just ACTIONS), stored as { kind, name, key } and resolved fresh when the key fires
    setMode('animate'); custom.push({ kind: 'mode', name: 'grid', key: 'KeyZ' });
    kd('KeyZ'); if (app.mode !== 'grid') errs.push('custom bind did not run');
    setMode('animate'); custom.pop();
    kd('KeyZ'); if (app.mode === 'grid') errs.push('deleted custom bind still ran');
    custom.push({ kind: 'mode', name: 'grid', key: 'KeyH' }); // same raw key as the 'panel' action: both resolve everywhere, so this must clash
    if (!keyClashes().has('panel') || !keyClashes().has('custom 1')) errs.push('custom bind clash not flagged');
    custom.pop();
    setMode('play'); }
  // keys popup: groups collapse (subFold) and the search box fuzzy-filters the action rows, hiding a group with no match
  { const keysBtn = [...$('global').querySelectorAll('button')].find(x => x.dataset.tip?.startsWith('Keys:'));
    keysPanel(null, keysBtn);
    keysQuery = 'punch'; refreshKeys();
    const rows = [...keysPop.querySelectorAll('.row')], punchRow = rows.find(r => r.firstChild.textContent === 'punch'), leftRow = rows.find(r => r.firstChild.textContent === 'left');
    const modesSec = [...keysPop.querySelectorAll('.fold.sub')].find(s => s.querySelector('h4').textContent.startsWith('modes'));
    if (!punchRow || punchRow.hidden || !leftRow?.hidden || !modesSec?.hidden) errs.push('keys search did not filter');
    keysQuery = ''; closePop(); }
  // Cinema: letterbox bars over the fight view; impact frames and speed lines draw; the settings rows are in the side panel
  { setMode('play'); lab.scen = 'you vs dummy'; build(); setCfg({ letterbox: true, impactFrames: true, speedLines: true, camLead: 0.2 }); panels();
    const w = lab.cells[0].w, r = labRects()[0]; w.advance(1/60, NOIN); w.impactAt = w.T; Object.assign(w.b, { kd: 'fly', vx: 900, vy: -300 }); mode().render();
    const px = ctx.getImageData(r.x + r.w / 2 | 0, r.y + 2 | 0, 1, 1).data;
    if (px[0] > 40 || !document.querySelector('#side .row[data-tip^="Black bars"]') || !docFor('Cinema')) errs.push('cinema letterbox ' + [...px]);
    applyPreset('juicy'); build(); panels(); }
  // docs: a topic for every settings group, search, a live demo that advances, the ⓘ "docs" link, ⌘K entries, the page form
  { setMode('play'); panels(); const g0 = CFG.gravity; CFG.gravity = g0 * 3; openDocs('specials'); CFG.gravity = g0;
    if (docs.demos[0].w.cfg.gravity !== DEFAULTS.gravity || docs.demos[0].w.a.ch.name !== 'stick') errs.push('docs demo uses your settings');
    const miss = SCHEMA.filter(s => Array.isArray(s) && !docFor(s[0])).map(s => s[0]); if (miss.length) errs.push('docs miss ' + miss);
    const d = docs.demos[0], t0 = d.w.T; docsFrame(); docsFrame(); if (!(d.w.T > t0) || docs.demos.length < 4) errs.push('docs demo ' + [t0, d.w.T, docs.demos.length]);
    const q = document.querySelector('#docs input'); q.value = 'jugglepoints'; q.dispatchEvent(new Event('input'));
    const toc = [...document.querySelectorAll('#docs .dtoc .pitem')].map(x => x.textContent); if (!toc.includes('Combos & cancels') || toc.includes('Weapons')) errs.push('docs search ' + toc);
    openDocs('easing'); docsFrame(); if (document.querySelectorAll('#docs canvas.ease').length !== Object.keys(EASE_TIPS).length) errs.push('docs easing examples');
    closeDocs(); if ($('docs')) errs.push('docs close');
    const info = [...document.querySelectorAll('#side h3')].find(x => x.textContent.startsWith('Specials')).querySelector('button.info'); info.click();
    const link = [...document.querySelectorAll('.pop button')].find(b => b.textContent.includes('docs')); link?.click();
    if (!link || docs.topic !== 'set-specials' || !$('docs')) errs.push('docs link'); closeDocs();
    if (!paletteEntries().some(e => e.kind === 'docs' && e.name === 'Key events')) errs.push('docs palette');
    location.hash = 'docs=weapons'; readHash(); if (!document.body.classList.contains('docspage') || docs.topic !== 'weapons') errs.push('docs page'); closeDocs();
    if (document.body.classList.contains('docspage')) errs.push('docs page close'); }
  // replay tab: the play fight comes in with its events; the table filters (fuzzy) and a row goes to its frame; types hide lanes;
  // the timeline seeks; rewind steps back from a checkpoint
  { lab.scen = 'you vs ai'; setMode('play'); const w = lab.cells[0].w;
    for (let i = 0; i < 600; i++) w.advance(1/60, { ...NOIN, right: i % 120 < 40, punch: i % 23 === 0, kick: i % 37 === 0 });
    rp.reel = null; setMode('replay'); openStage('events');
    if (!rp.reel || rp.N !== 600 || !rp.events.some(e => e.type === 'hit') || !rp.events.some(e => e.type === 'input')) errs.push('replay load ' + [rp.N, rp.events.length]);
    const rows = () => [...document.querySelectorAll('.etable tbody tr')].filter(r => r.cells.length), q = document.querySelector('.etable input');
    q.value = 'hit'; q.dispatchEvent(new Event('input'));
    if (!rows().length || rows().some(r => !/hit/.test(r.textContent))) errs.push('replay filter ' + rows().length);
    const r0 = rows()[0], f0 = +r0.cells[0].textContent.split(' f')[1]; r0.click();
    if (rp.n !== f0 || !rp.sel.size) errs.push('replay row ' + [rp.n, f0]);
    q.value = ''; q.dispatchEvent(new Event('input'));
    const lanes = rpLanes().length; [...document.querySelectorAll('#ctx button')].find(b => b.dataset.tip?.startsWith('input:')).click();
    const h0 = rpLayout().tl.h; if (rpLanes().length !== lanes || rows().some(r => /input/.test(r.cells[1].textContent))) errs.push('replay types');
    { const L2 = rpLayout(), ir = L2.rows.find(r => r.type === 'input'); rpMouse('down', L2.tl.x + 20, ir.y + 4, {}); rpMouse('up', 0, 0, {}); if (!rp.show.has('input') || rpLayout().tl.h !== h0) errs.push('replay lane name toggles, same height'); rp.show.delete('input'); }
    const L = rpLayout(); rpMouse('down', L.tx + L.tw / 2, L.ruler + 5 * dpr, { altKey: true }); rpMouse('up', 0, 0, {});
    if (Math.abs(rp.n - frameAt(rp.T[rp.N] / 2)) > 1) errs.push('replay seek ' + rp.n);
    const n1 = rp.n; rewind(1); if (rp.n !== n1 - 1) errs.push('replay rewind ' + [n1, rp.n]);
    // zoom around a time, fit; fold a fighter's curves; jump to the next event and bookmark; a bookmark goes into the replay file; stats
    rpZoom(0.25, rp.T[rp.N] / 2); const span = rp.v[1] - rp.v[0]; if (Math.abs(span - rp.T[rp.N] / 4) > 0.01) errs.push('replay zoom ' + span);
    rpView(0, rpEnd()); if (rp.v[0] !== 0 || rp.v[1] !== rpEnd()) errs.push('replay fit');
    const rows0 = rpLayout().rows.length, hp = rpLayout().rows.find(r => r.kind === 'hp'); rpMouse('down', rpLayout().tl.x + 5, hp.y + 3, {});
    if (rpLayout().rows.length !== rows0 - 1 || !rp.fold.size) errs.push('replay fold'); rp.fold.clear();
    rpSeek(0); rp.show = new Set(['hit']); rpJump(1); const h1 = rp.events.find(e => e.type === 'hit'); if (rp.n !== h1.f) errs.push('replay jump ' + [rp.n, h1.f]);
    rp.reel.rep.marks.push({ f: 100, name: 'm' }); rebuildEvents(); rpSeek(0); rpJump(1, true);
    if (rp.n !== 100 || !rp.events.some(e => e.kind === 'mark')) errs.push('replay mark ' + rp.n);
    const st = rpStats()[0].rows; if (st.find(r => r[0] === 'hits')[1] !== rp.events.filter(e => e.kind === 'hit' && e.who === rpStats()[0].l.id).length) errs.push('replay stats');
    rp.reel.rep.marks.length = 0; rebuildEvents();
    // editing: marquee picks inputs; dragging a press retimes it (one undo step); , nudges; Delete removes; ⌘Z undoes; the saved file plays in sync
    { rp.show = new Set(['input']); rpView(0, rpEnd()); const L = rpLayout(), row = L.rows.find(r => r.type === 'input');
      rpMouse('down', L.tx + 2, row.y + 1, {}); rpMouse('move', L.tx + L.tw * 0.3, row.y + row.h, {}); rpMouse('up', L.tx + L.tw * 0.3, row.y + row.h, {});
      const n = selInputs().length; if (!n || selInputs().some(e => rp.T[e.f] > xToT(L, L.tx + L.tw * 0.3) + 0.01)) errs.push('replay marquee ' + n);
      const p = rp.events.find(e => e.kind === 'press' && e.f > 60), u0 = studio.undo.length; rp.sel = new Set([p.i]);
      const x = tToX(L, rp.T[p.f]); rpMouse('down', x, row.y + 4 * dpr, {}); rpMouse('move', tToX(L, rp.T[p.f + 10]), row.y + 4 * dpr, {}); rpMouse('up', tToX(L, rp.T[p.f + 10]), row.y + 4 * dpr, {});
      const moved = rp.frames[p.f + 10][1][p.key] && !rp.frames[p.f][1][p.key];
      if (!moved || studio.undo.length !== u0 + 1 || !rp.reel.edits) errs.push('replay drag ' + [moved, studio.undo.length - u0]);
      const kd = (code, o = {}) => document.body.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...o }));
      kd('Comma'); if (!rp.frames[p.f + 9][1][p.key]) errs.push('replay nudge');
      kd('Delete'); if (rp.frames[p.f + 9][1][p.key]) errs.push('replay delete');
      undo(); undo(); undo(); if (!rp.frames[p.f][1][p.key] || rp.frames[p.f + 10][1][p.key]) errs.push('replay undo');
      const r = reelFile(), w = replayWorld(r); w.loop = false; for (let i = 0; i <= r.frames.length; i++) w.advance(0, NOIN);
      if (w.desync !== null) errs.push('replay saved file out of sync ' + w.desync);
      rp.show = new Set(Object.keys(EVENT_TYPES)); }
    // footage: I / O set in and out; a span drags (one undo step); export renders the in–out range at the chosen shape, slowed spans longer
    { const kd = code => document.body.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      rpSeek(60); kd('KeyI'); rpSeek(240); kd('KeyO'); const F = foot();
      if (F.in !== 60 || F.out !== 240) errs.push('footage in/out ' + [F.in, F.out]);
      rpSeek(100); rp.sel.clear(); addSpan('slow'); const sp = F.spans[0], L = rpLayout(), row = L.rows.find(r => r.kind === 'foot'), a0 = sp.a, u0 = studio.undo.length;
      const xm = (tToX(L, rp.T[sp.a]) + tToX(L, rp.T[sp.b])) / 2;
      rpMouse('down', xm, row.y + 3 * dpr, {}); rpMouse('move', xm + tToX(L, rp.T[a0 + 20]) - tToX(L, rp.T[a0]), row.y + 3 * dpr, {}); rpMouse('up', 0, 0, {});
      if (sp.a !== a0 + 20 || studio.undo.length !== u0 + 1) errs.push('footage drag ' + [sp.a - a0, studio.undo.length - u0]);
      undo(); if (foot().spans[0].a !== a0) errs.push('footage undo');
      panels(); const secs = [...document.querySelectorAll('#side input.sec')], set = (el, v) => { el.value = v; el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); };
      set(secs[2], '2.5'); set(document.querySelectorAll('#side input.sec')[3], '0.5'); const sp2 = foot().spans[0];
      if (sp2.a !== nearFrame(2.5) || Math.abs(rp.T[sp2.b] - rp.T[sp2.a] - 0.5) > 0.02) errs.push('footage typed ' + [sp2.a, sp2.b]);
      afterSync.push(async () => { let got = null; const sc = saveClip; saveClip = f => { got = f; };
        ui.clip = { ...clipSet(), fps: 30, aspect: '9:16', fit: 'crop' }; ui.rexp = { size: 320, hud: true, labels: true, inputs: false, meter: false };
        setMode('replay'); await exportReel(); saveClip = sc;
        const s0 = foot().spans[0], slow = Math.max(0, Math.min(s0.b, 240) - Math.max(s0.a, 60)), span = (rp.T[240] - rp.T[60]) + slow / 60 * 3; // the ×0.25 span lasts 4× as long
        if (!got || got[0].c.width !== 320 || got[0].c.height !== 568) errs.push('export size ' + (got && [got[0].c.width, got[0].c.height]));
        else if (Math.abs(got.length - span * 30) > 3) errs.push('export frames ' + [got.length, Math.round(span * 30)]);
      }); }
    // 'all' shows every type, and hides them all when all are shown; a toolbar group dragged onto another moves before it
    { const all = [...document.querySelectorAll('#ctx button')].find(b => b.textContent.endsWith('all')); rp.show = new Set(Object.keys(EVENT_TYPES)); all.click();
      const off = rp.show.size; all.click(); if (off !== 0 || rp.show.size !== Object.keys(EVENT_TYPES).length) errs.push('types all toggle ' + off);
      const gs = () => [...document.querySelectorAll('#ctx .grp[data-part]')].map(g => g.dataset.part), before = gs(), dt = new DataTransfer();
      document.querySelector('#ctx .grp[data-part="' + before[2] + '"] .gl').dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
      document.querySelector('#ctx .grp[data-part="' + before[0] + '"]').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
      if (gs()[0] !== before[2]) errs.push('toolbar drag ' + gs().slice(0, 3)); layReset('replay'); }
    // side panel: 'now' follows the playhead; the selection lists what is picked; a type row's strip seeks
    { panels(); rpSeek(200); mode().render(); const now = [...document.querySelectorAll('#side .nowf')];
      if (now.length < 2 || !$('side').textContent.includes('frame 200 of')) errs.push('side now ' + now.length);
      rp.sel = new Set(rp.events.slice(0, 2).map(e => e.i)); syncAll(); if (![...document.querySelectorAll('#side p.note')].some(p => /^2 events/.test(p.textContent))) errs.push('side selection');
      const sp = document.querySelector('#side canvas.spark'); sp.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: sp.getBoundingClientRect().left + 1 })); if (rp.n > 30) errs.push('side spark seek ' + rp.n);
      rp.sel.clear(); }
    // branches: play on as P2 from the playhead (in play), keep it: two reels, compared side by side and as a ghost; drop goes back
    { rpSeek(120); branchFrom(2); const bw = lab.cells[0].w;
      if (app.mode !== 'play' || !lab.branch || bw.ctl[1] !== 'human2' || bw.fi !== 120) errs.push('branch start ' + [app.mode, bw.ctl[1], bw.fi]);
      for (let i = 0; i < 90; i++) bw.advance(1/60, { ...NOIN, left: i % 30 < 15, kick: i % 11 === 0 });
      keepBranch(); if (app.mode !== 'replay' || rp.reels.length < 2 || !rp.cmp || !rp.events.some(e => e.cmp)) errs.push('branch keep ' + rp.reels.length);
      rp.cmpView = 'overlay'; mode().render(); rp.cmpView = 'side'; mode().render();
      rpSeek(150); if (rp.cmp.n !== 150) errs.push('compare sync ' + rp.cmp.n);
      rpSeek(100); branchFrom(1); dropBranch(); if (lab.branch) errs.push('branch drop'); setMode('replay'); loadCmp(null); }
    // highlights: moments are listed and picked; exporting them renders the picked windows back to back
    { panels(); if (!rp.moments.length || !rp.hl.picked.size) errs.push('highlights ' + rp.moments.length);
      afterSync.push(async () => { let got = null; const sc = saveClip; saveClip = f => { got = f; }; setMode('replay');
        ui.clip = { ...clipSet(), fps: 15, aspect: 'view' }; rp.hl.slow = false; const segs = hlSegs(); await exportHighlights(); saveClip = sc;
        let t = 0; for (const sg of segs) for (let f = sg.a; f < sg.b; f++) t += rp.frames[f][0];
        if (!got || Math.abs(got.length - t * 15) > 2) errs.push('highlights export ' + (got && got.length) + ' vs ' + Math.round(t * 15)); }); }
    // movie: a fresh reel's footage in–out becomes its first shot; + shot falls back to it with nothing selected; the movie/reel
    // toggle plays each shot's own world without touching this reel's playhead; export cuts every shot together; a project
    // file round-trips every loaded reel and the movie
    { const shots0 = rp.movie.shots;
      if (shots0.length !== 1 || shots0[0].reel !== 0 || shots0[0].a !== 0) errs.push('movie default shot ' + JSON.stringify(shots0));
      rp.sel.clear(); addShot();
      const added = rp.movie.shots[rp.movie.shots.length - 1];
      if (rp.movie.shots.length !== 2 || added.a !== 60 || added.b !== 240) errs.push('movie add shot (footage fallback) ' + JSON.stringify(added));
      const n0 = rp.n; setPlayMovie(true);
      if (!rp.mv || rp.mv.shotI !== 0) errs.push('movie play start ' + JSON.stringify(rp.mv && rp.mv.shotI));
      for (let i = 0; i < 10; i++) mode().tick(1 / 60);
      if (rp.mv.n <= rp.mv.a || rp.n !== n0) errs.push('movie play steps its own world, this reel untouched ' + [rp.mv.n, rp.n, n0]);
      setPlayMovie(false); if (rp.mv || rp.playMovie) errs.push('movie stop');
      const shotsForExport = rp.movie.shots;
      afterSync.push(async () => { let got = null; const sc = saveClip; saveClip = f => { got = f; };
        ui.clip = { ...clipSet(), fps: 15, aspect: 'view' }; rp.movie.shots = shotsForExport; panels(); await exportMovie(); saveClip = sc;
        let t = 0; for (const sh of shotsForExport) { const fr = rp.reels[sh.reel].rep.frames; for (let f = sh.a; f < Math.min(sh.b, fr.length); f++) t += fr[f][0]; }
        if (!got || Math.abs(got.length - t * 15) > 3) errs.push('movie export ' + (got && got.length) + ' vs ' + Math.round(t * 15)); });
      const proj = projectFile(), before = JSON.stringify(rp.movie.shots), nReels = rp.reels.length;
      loadProject(proj);
      if (rp.reels.length !== nReels || JSON.stringify(rp.movie.shots) !== before || !rp.reel) errs.push('project round-trip ' + [rp.reels.length, JSON.stringify(rp.movie.shots)]); }
    // transitions: a crossfade blends the previous shot's last frame into the next one's first, for its own duration, then plays normally;
    // 'cut' (the default) has none
    { movieEdit(M => { M.shots = [{ reel: 0, a: 0, b: 5 }, { reel: 0, a: 5, b: 10, trans: { kind: 'cross', dur: 2 / 60 } }]; });
      setPlayMovie(true);
      for (let i = 0; i < 6; i++) mode().tick(1 / 60); // plays shot 0's 5 frames, then crosses into shot 1
      if (!rp.mv || rp.mv.shotI !== 1 || !rp.mv.trans || rp.mv.trans.kind !== 'cross') errs.push('transition start ' + JSON.stringify(rp.mv && [rp.mv.shotI, rp.mv.trans]));
      const stillAt5 = rp.mv.n; if (stillAt5 !== rp.mv.a) errs.push('transition holds the shot frames until done ' + stillAt5);
      for (let i = 0; i < 4; i++) mode().tick(1 / 60); // past its two-frame duration
      if (rp.mv.trans || rp.mv.n <= rp.mv.a) errs.push('transition ends, the shot plays on ' + JSON.stringify(rp.mv.trans));
      setPlayMovie(false);
      const transShots = rp.movie.shots;
      afterSync.push(async () => { let got = null; const sc = saveClip; saveClip = f => { got = f; };
        ui.clip = { ...clipSet(), fps: 60, aspect: 'view' }; rp.movie.shots = transShots; panels(); await exportMovie(); saveClip = sc;
        // 5 content frames + 2 transition frames + 5 content frames at 60fps
        if (!got || Math.abs(got.length - 12) > 2) errs.push('transition export ' + (got && got.length)); }); }
    // freeze frame: holds on a frame of the shot (zoomed, captioned), then the shot plays on from there
    { movieEdit(M => { M.shots = [{ reel: 0, a: 0, b: 5, freeze: { at: 2, hold: 2 / 60, zoom: 1.5, text: 'HIT' } }]; });
      setPlayMovie(true);
      for (let i = 0; i < 3; i++) mode().tick(1 / 60); // steps to frame 2, where the freeze triggers
      if (!rp.mv.freeze || rp.mv.n !== 3) errs.push('freeze start ' + JSON.stringify([!!rp.mv.freeze, rp.mv.n]));
      for (let i = 0; i < 3; i++) mode().tick(1 / 60); // past its two-frame hold
      if (rp.mv.freeze || rp.mv.n <= 3) errs.push('freeze ends, the shot plays on ' + JSON.stringify([rp.mv.freeze, rp.mv.n]));
      setPlayMovie(false);
      const freezeShots = rp.movie.shots;
      afterSync.push(async () => { let got = null; const sc = saveClip; saveClip = f => { got = f; };
        ui.clip = { ...clipSet(), fps: 60, aspect: 'view' }; rp.movie.shots = freezeShots; panels(); await exportMovie(); saveClip = sc;
        // 5 content frames + 2 held frames
        if (!got || Math.abs(got.length - 7) > 2) errs.push('freeze export ' + (got && got.length)); }); }
    // speed: a rate paces how fast a shot's own frames play (double speed finishes in half the real time); reverse pre-renders
    // the shot once, forward, then steps through the pictures back to front
    { movieEdit(M => { M.shots = [{ reel: 0, a: 0, b: 10, speed: { rate: 2 } }, { reel: 0, a: 0, b: 3 }]; });
      setPlayMovie(true);
      for (let i = 0; i < 5; i++) mode().tick(1 / 60); // at rate 2, 10 frames finish in the real time 5 would normally take
      if (!rp.mv || rp.mv.shotI !== 1) errs.push('speed rate ' + JSON.stringify(rp.mv && rp.mv.shotI));
      setPlayMovie(false);
      const rateShots = rp.movie.shots;
      afterSync.push(async () => { let got = null; const sc = saveClip; saveClip = f => { got = f; };
        ui.clip = { ...clipSet(), fps: 60, aspect: 'view' }; rp.movie.shots = rateShots; panels(); await exportMovie(); saveClip = sc;
        // shot 0 at rate 2 takes half as long (10 frames / 2) + shot 1's 3 frames
        if (!got || Math.abs(got.length - 8) > 2) errs.push('speed rate export ' + (got && got.length)); });
      movieEdit(M => { M.shots = [{ reel: 0, a: 0, b: 5, speed: { reverse: true } }, { reel: 0, a: 0, b: 3 }]; });
      setPlayMovie(true);
      if (!rp.mv.rev || rp.mv.rev.imgs.length !== 5 || rp.mv.rev.i !== 0) errs.push('reverse start ' + JSON.stringify(rp.mv.rev && [rp.mv.rev.imgs.length, rp.mv.rev.i]));
      for (let i = 0; i < 3; i++) mode().tick(1 / 60);
      if (!rp.mv.rev || rp.mv.rev.i <= 0) errs.push('reverse steps through its pictures ' + (rp.mv.rev && rp.mv.rev.i));
      for (let i = 0; i < 3; i++) mode().tick(1 / 60);
      if (!rp.mv || rp.mv.shotI !== 1) errs.push('reverse ends, the next shot plays ' + JSON.stringify(rp.mv && rp.mv.shotI));
      setPlayMovie(false);
      const revShots = rp.movie.shots;
      afterSync.push(async () => { let got = null; const sc = saveClip; saveClip = f => { got = f; };
        ui.clip = { ...clipSet(), fps: 60, aspect: 'view' }; rp.movie.shots = revShots; panels(); await exportMovie(); saveClip = sc;
        // 5 reversed frames + 3 normal frames; it must not throw, and must produce about that many frames
        if (!got || Math.abs(got.length - 8) > 2) errs.push('reverse export ' + (got && got.length)); }); }
    // screen fx: a fully opaque tint replaces the picture with its colour; letterbox bars are black top and bottom
    { movieEdit(M => { M.shots = [{ reel: 0, a: 0, b: 3, fx: { tint: { col: '#3366cc', amt: 1 } } }]; });
      const tintShots = rp.movie.shots;
      afterSync.push(async () => { let got = null; const sc = saveClip; saveClip = f => { got = f; };
        ui.clip = { ...clipSet(), fps: 30, aspect: 'view' }; rp.movie.shots = tintShots; panels(); await exportMovie(); saveClip = sc;
        const c = got && got[0]?.c, g = c && c.getContext('2d'), px = g && g.getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
        if (!px || px[0] !== 0x33 || px[1] !== 0x66 || px[2] !== 0xcc) errs.push('fx tint ' + (px && [...px])); });
      movieEdit(M => { M.shots = [{ reel: 0, a: 0, b: 3, fx: { letterbox: true } }]; });
      const letterShots = rp.movie.shots;
      afterSync.push(async () => { let got = null; const sc = saveClip; saveClip = f => { got = f; };
        ui.clip = { ...clipSet(), fps: 30, aspect: 'view' }; rp.movie.shots = letterShots; panels(); await exportMovie(); saveClip = sc;
        const c = got && got[0]?.c, g = c && c.getContext('2d'), px = g && g.getImageData(2, 2, 1, 1).data;
        if (!px || px[0] > 10 || px[1] > 10 || px[2] > 10) errs.push('fx letterbox ' + (px && [...px])); }); }
    // camera: a shot has none of its own — it inherits whatever camera spans are on its source reel's footage
    { const reel = rp.reels[0], w = replayWorld(reel.rep);
      reel.rep.footage.spans.push({ kind: 'cam', a: 0, b: 10, zoom: 2, follow: 'P1' });
      const cam = camAt(reel.rep, w, 5), outside = camAt(reel.rep, w, 20);
      if (!cam || cam.zoom !== 2 || typeof cam.x !== 'number') errs.push('camAt in span ' + JSON.stringify(cam));
      if (outside) errs.push('camAt outside span ' + JSON.stringify(outside));
      movieEdit(M => { M.shots = [{ reel: 0, a: 0, b: 10 }]; });
      const camShots = rp.movie.shots;
      afterSync.push(async () => { let got = null; const sc = saveClip; saveClip = f => { got = f; };
        ui.clip = { ...clipSet(), fps: 30, aspect: 'view' }; rp.movie.shots = camShots; panels(); await exportMovie(); saveClip = sc;
        if (!got || !got.length) errs.push('camera export ' + (got && got.length));
        reel.rep.footage.spans.length = 0; }); }
    // clips: the 1:1 aspect crops the subject to a square
    { ui.clip = { ...clipSet(), aspect: '1:1', fit: 'crop', size: 200 }; clip.key = null; clip.frames.length = 0; clip.last = 0; clipCapture(5e6, true);
      const f = clip.frames[0]?.c; if (!f || f.width !== 200 || f.height !== 200) errs.push('clip aspect ' + (f && [f.width, f.height]));
      ui.clip = { ...clipSet(), aspect: 'view', size: 480 }; clip.last = 0; clip.frames.length = 0; }
    rp.show = new Set(Object.keys(EVENT_TYPES)); closeStage(); mode().render(); }
  // clips: the subject is the fight, the gallery cell under the mouse or the animate preview; the buffer keeps the last seconds;
  // ⇧X saves; Chrome decodes the GIF (a noisy frame of exact colours: the LZW table fills and restarts) to the same pixels
  { const snap = n => { for (let i = 0; i < n; i++) { mode().render(); clipCapture(1e6 + clip.t++ * 40, true); } };
    clip.t = 0; clip.frames.length = 0; clip.key = null; ui.clip = { fmt: 'gif', secs: 1, size: 480, fps: 30 };
    setMode('play'); snap(30);
    if (clip.frames.length !== 26 || clip.key[0] !== lab.cells[0] || clip.key[1] !== Math.min(480, Math.round(canvas.width / dpr / 2) * 2)) errs.push('clip play ' + [clip.frames.length, clip.key]);
    setMode('gallery'); const r = labRects()[1]; [clip.mx, clip.my] = [r.x + 5, r.y + 5]; snap(3);
    if (clip.key[0] !== shown()[1] || clip.frames.length !== 3) errs.push('clip gallery cell ' + clip.frames.length);
    setMode('animate'); snap(2); if (clip.key[0] !== 'preview' || clip.frames.length !== 2) errs.push('clip animate');
    let saved = null; const sv = saveClip; saveClip = f => { saved = f; };
    setMode('play'); document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', shiftKey: true, bubbles: true })); saveClip = sv;
    if (!saved) errs.push('clip key');
    const W = 120, H = 90, cols = Array.from({ length: 200 }, (_, i) => [i * 37 % 32, i * 11 % 32, i * 5 % 32].map(v => Math.round(v * 255 / 31)));
    const px = new Uint8ClampedArray(W * H * 4); let sd = 7;
    for (let i = 0; i < W * H; i++) px.set([...cols[(sd = sd * 16807 % 2147483647) % 200], 255], i * 4);
    later.push(createImageBitmap(new Blob([gifEncode([px], W, H, [4])], { type: 'image/gif' })).then(bm => {
      const c = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = c.getContext('2d'); g.drawImage(bm, 0, 0);
      const got = g.getImageData(0, 0, W, H).data; let worst = 0;
      for (let i = 0; i < px.length; i++) worst = Math.max(worst, Math.abs(got[i] - px[i]));
      if (bm.width !== W || worst > 4) errs.push('clip gif decode ' + worst);
    }, e => errs.push('clip gif ' + e.message))); }
} catch (e) { errs.push(e.message + ' ' + e.stack.split('\\n')[1]); }
// the async checks one after another (an export waits for the last one)
Promise.all(later).then(() => afterSync.reduce((p, f) => p.then(f), Promise.resolve())).then(() => { document.title = errs.length ? 'ERR ' + errs.slice(0, 5).join(' | ') : 'OK'; }, e => { document.title = 'ERR ' + e.message; });
</script></body>`;
fs.writeFileSync(out, fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/(src|fonts)\//g, `file://${root}/$1/`).replace('</body>', probe));
(async () => {
// COVERAGE=1: the same page under Chrome's coverage, printed per src file (tests/browser-coverage.js)
const title = process.env.COVERAGE ? await require('./browser-coverage')(chrome, 'file://' + out, path.join(root, 'src'))
  : (execFileSync(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--window-size=1400,800',
    '--virtual-time-budget=5000', '--dump-dom', 'file://' + out], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).match(/<title>([^<]*)/) || [])[1] || 'no title';
// docs.html opens the app as the docs page
const docsDom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--window-size=1400,800',
  '--virtual-time-budget=3000', '--dump-dom', 'file://' + path.join(root, 'docs.html')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const docsOk = /class="docspage"/.test(docsDom) && docsDom.includes('id="docs"');
console.log(title, docsOk ? '· docs.html OK' : '· docs.html FAILED');
process.exit(title === 'OK' && docsOk ? 0 : 1);
})();
