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
  // movement layers: + layer makes one at the state's procedural pose (its ref); it groups as layer, has a mix slider, and the + layer list drops it
  { const lb = () => [...document.querySelectorAll('#side button')].find(b => b.textContent.includes('layer')); lb().click();
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
  // the menu bar's files: export / import character, settings or everything; settings round-trip, out-of-range values fall back to the default
  { setMode('play'); const top = t => [...document.querySelectorAll('#global button')].find(b => b.textContent.includes(t)), got = [], dl = download, of = openFile;
    top('export').click(); const menu = [...document.querySelectorAll('.pop button')].map(b => b.textContent).join(); closePop();
    if (menu !== 'character,settings,everything' || !top('import')) errs.push('file menu ' + menu);
    download = (n, d) => got.push(JSON.parse(JSON.stringify(d))); let feed; openFile = f => f(feed);
    setCfg({ hitstop: 0.12 }); exportFile('settings'); setCfg({ hitstop: DEFAULTS.hitstop }); feed = got[0]; importFile('settings');
    if (CFG.hitstop !== 0.12) errs.push('settings import ' + CFG.hitstop);
    feed = { format: 'stick2.settings', cfg: { hitstop: 99 } }; importFile('settings'); if (CFG.hitstop !== DEFAULTS.hitstop) errs.push('settings range ' + CFG.hitstop);
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
  // impact's ragdoll view: one body alone; a blow button strikes it (a sweep knocks it down), stand up resets it
  { setMode('impact'); const btn = t => [...document.querySelectorAll('#ctx button')].find(b => b.textContent.trim().endsWith(t));
    btn('ragdoll').click(); btn('sweep').click(); const w = lab.cells[0].w; let down = false; for (let i = 0; i < 40; i++) { w.advance(1/60, NOIN); down ||= !!w.b.rag || w.b.downT > 0; }
    if (lab.cells.length !== 1 || !w.a.hidden || w.hits !== 1 || !down) errs.push('ragdoll blow ' + [lab.cells.length, w.a.hidden, w.hits, down]);
    btn('stand up').click(); if (lab.cells[0].w === w || lab.cells[0].w.hits) errs.push('ragdoll stand up');
    btn('hits').click(); if (lab.cells.length !== Object.keys(IMPACTS).length) errs.push('impact hits ' + lab.cells.length); }
  // the character tab's impact preview: the same lone body and blow buttons, on the character being built
  { setMode('character'); const btn = t => [...document.querySelectorAll('#ctx button')].find(b => b.textContent.trim().endsWith(t));
    btn('impact').click(); btn('launcher').click(); const w = creator.w; for (let i = 0; i < 20; i++) w.advance(1/60, NOIN);
    if (!w.a.hidden || w.b.ch !== currentChar() || w.hits !== 1) errs.push('creator impact ' + [w.a.hidden, w.b.ch.name, w.hits]);
    btn('showcase').click(); if (btn('crumple')) errs.push('creator blow buttons stay'); }
  // four tabs: impact is a view of play, gallery of animate, picked in the toolbar's view group
  { setMode('impact'); const tabs = [...document.querySelectorAll('#modes button')], on = tabs.find(b => b.classList.contains('on'));
    if (tabs.length !== 4 || !on?.textContent.includes('play')) errs.push('tabs ' + tabs.length + ' ' + on?.textContent);
    [...document.querySelectorAll('#ctx button')].find(b => b.textContent.includes('fight')).click(); if (app.mode !== 'play') errs.push('view fight ' + app.mode);
    setMode('gallery'); tabs.find(b => b.textContent.includes('animate')).click(); if (app.mode !== 'gallery') errs.push('tab keeps its view ' + app.mode); }
  // combos: the table lists routes; + P on a route's end adds a link (the route gets longer), clicking that step and cut removes it; the tree shows starters
  { setMode('animate'); pickChar('stick'); studio.stance = 0; anim.view = 'combos'; combos.view = 'table'; panels();
    const rows = () => [...document.querySelectorAll('.ctable tbody tr')], row = t => rows().find(r => [...r.cells[0].querySelectorAll('button')].map(b => b.textContent).filter(x => !/ [PK]$/.test(x)).join('›') === t), n0 = rows().length;
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
    anim.view = 'cards'; panels(); }
  // the moves toolbar group (character and animate) shows the move table, inputs and combos over the stage; a move in them opens in the animate editor, close goes back
  { setMode('character'); const sb = t => [...document.querySelectorAll('#ctx button')].find(b => b.textContent.trim().endsWith(t));
    sb('combos').click(); const chip = document.querySelector('.ctable .chip');
    if (!chip || anim.view !== 'cards') errs.push('character combos ' + !!chip + anim.view);
    const n = chip?.textContent; chip?.click(); if (app.mode !== 'animate' || anim.move !== n) errs.push('combo chip opens ' + app.mode + anim.move);
    setMode('character'); if (document.querySelector('.ctable')) errs.push('character combos stay open');
    sb('table').click(); if (document.querySelectorAll('.mtable tbody tr').length !== Object.keys(currentChar().moves).length) errs.push('character move table');
    [...document.querySelectorAll('.mtable .bar button')].find(b => b.textContent.includes('editor')).click(); if (document.querySelector('.mtable') || app.mode !== 'character') errs.push('character move table close');
    sb('inputs').click(); if (!document.querySelector('.mtable')) errs.push('character inputs'); creator.view = null; panels(); }
  // the character editor's hip handle moves the waist over the feet: the legs bend, the ankles stay; one undo step
  { setMode('character'); pickChar('stick'); studio.stance = 0; panels();
    const f0 = edFrame(), hp = f0.P.hip, ids = f0.ch.chains.leg.map(c => ankleOf(c).id), p0 = JSON.stringify(curStance().pose);
    creatorMouse('down', hp[0], hp[1], {}); creatorMouse('move', hp[0] + 6, hp[1] + 20, {});
    const f1 = edFrame(), off = Math.max(...ids.map(id => Math.hypot(f1.P[id][0] - f0.P[id][0], f1.P[id][1] - f0.P[id][1])));
    creatorMouse('up', 0, 0, {});
    if (Math.abs(f1.P.hip[1] - hp[1] - 20) > 1 || off > 3 || JSON.stringify(curStance().pose) === p0) errs.push('hip drag ' + [f1.P.hip[1] - hp[1], off]);
    undo(); if (JSON.stringify(curStance().pose) !== p0) errs.push('hip drag undo'); }
  // the bone table rearranges bones: drag a row's id onto another to move it before it (the draw order), click parent to hang it from another bone
  { setMode('character'); pickChar('stick'); creator.table = true; creator.tsort = { k: '', dir: 1 }; creator.tfilter = ''; panels();
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
    creator.table = false; panels(); }
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
  // factory reset (⌘K or the Debug panel): asks first, then deletes every stick2 key in localStorage (nothing else) and reloads
  { const keep = Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('stick2.')).map(k => [k, localStorage[k]]));
    localStorage.setItem('stick2.chars', '{}'); localStorage.setItem('stick2.ui', '{}'); localStorage.setItem('other.app', '1');
    let reloaded = 0; reload = () => { reloaded++; };
    const e = paletteEntries().find(e => e.name === 'factory reset'); e?.run();
    if (!document.querySelector('.pop') || localStorage.getItem('stick2.chars') === null) errs.push('factory reset asks first');
    [...document.querySelectorAll('.pop button')].find(b => b.textContent.includes('cancel'))?.click();
    if (document.querySelector('.pop') || localStorage.getItem('stick2.chars') === null || reloaded) errs.push('factory reset cancel');
    setMode('play'); [...document.querySelectorAll('#side button')].find(b => b.textContent.includes('factory reset'))?.click();
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
    if (!document.querySelector('.sbuild')) errs.push('builder gone ' + lab.scen + lab.builder + lab.mode); [...document.querySelectorAll('.sbuild button')].find(b => b.dataset.tip === 'Delete this scenario').click(); if (SCENARIOS['jab vs sumo'] || myScens()['jab vs sumo'] || lab.scen === 'jab vs sumo') errs.push('builder delete ' + lab.scen);
    delete myScens()['copy of it']; delete SCENARIOS['copy of it']; lab.builder = false; keep === null ? localStorage.removeItem('stick2.scenarios') : localStorage.setItem('stick2.scenarios', keep); lab.scen = 'you vs dummy'; build(); panels(); }
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
    setMode('play'); run('move table'); if (app.mode !== 'animate' || anim.view !== 'table' || !document.querySelector('.mtable tbody tr')) errs.push('palette move table ' + app.mode + anim.view);
    run('input table'); if (anim.view !== 'inputs' || !inputs.table || !document.querySelector('.mtable table:not([hidden])')) errs.push('palette input table ' + anim.view);
    setMode('character'); run('move table'); if (app.mode !== 'character' || creator.view !== 'table') errs.push('palette move table in character ' + creator.view);
    run('bone table'); if (app.mode !== 'character' || creator.view || !creator.table || !document.querySelector('.btable')) errs.push('palette bone table');
    setMode('play'); run('bone table'); if (app.mode !== 'character' || !document.querySelector('.btable')) errs.push('palette bone table from play ' + app.mode);
    creator.table = false; creator.view = null; anim.view = 'cards'; inputs.table = false; panels(); }
  // ⌘K: combos opens the combo editor over the stage (character tab: there, else animate)
  { setMode('play'); const e = paletteEntries().find(e => e.name === 'combos' && e.kind === 'editor'); e?.run(); panels();
    if (app.mode !== 'animate' || anim.view !== 'combos' || !document.querySelector('.ctable')) errs.push('palette combos ' + app.mode + anim.view);
    setMode('character'); e?.run(); panels(); if (app.mode !== 'character' || creator.view !== 'combos' || !document.querySelector('.ctable')) errs.push('palette combos in character');
    creator.view = null; anim.view = 'cards'; panels(); }
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
  { setMode('character'); pickChar('stick'); creator.table = true; panels();
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
    creator.table = false; panels(); }
  // debug: the first section of the lab settings, with the engine version and the fighters of the focused fight
  { setMode('play'); panels(); dbgT = 0; drawDebug();
    if (!dbgInfo.isConnected || !dbgInfo.textContent.includes('engine v' + ENGINE_VERSION) || !/P2 /.test(dbgInfo.textContent)) errs.push('debug info ' + dbgInfo.textContent.slice(0, 80));
    if ($('side').querySelector('.head, h3')?.textContent.indexOf('Debug') < 0) errs.push('debug not first'); }
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
    keymap.pause = ['KeyP']; }
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
} catch (e) { errs.push(e.message + ' ' + e.stack.split('\\n')[1]); }
document.title = errs.length ? 'ERR ' + errs.slice(0, 5).join(' | ') : 'OK';
</script></body>`;
fs.writeFileSync(out, fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/(src|fonts)\//g, `file://${root}/$1/`).replace('</body>', probe));
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--window-size=1400,800',
  '--virtual-time-budget=5000', '--dump-dom', 'file://' + out], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const title = (dom.match(/<title>([^<]*)/) || [])[1] || 'no title';
// docs.html opens the app as the docs page
const docsDom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--window-size=1400,800',
  '--virtual-time-budget=3000', '--dump-dom', 'file://' + path.join(root, 'docs.html')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const docsOk = /class="docspage"/.test(docsDom) && docsDom.includes('id="docs"');
console.log(title, docsOk ? '· docs.html OK' : '· docs.html FAILED');
process.exit(title === 'OK' && docsOk ? 0 : 1);
