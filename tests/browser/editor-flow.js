// the character editor end to end in headless Chrome, across a page reload: make a character from the stick, edit a bone,
// add one, undo / redo, and the edits are still there after reloading (localStorage); a built-in edited then reverted is the
// shipped one again, after a reload too. Real time over DevTools (tools/lib/chrome.js), one profile kept across the reload
// usage: npm run test:editor   (CHROME=/path/to/chrome overrides the browser)
const path = require('path'), { pathToFileURL } = require('url'), { launch } = require('../../tools/lib/chrome');
const APP = pathToFileURL(path.join(__dirname, '..', '..', 'index.html')).href;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(page, expr, what, ms = 30000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await page.js(`!!(${expr})`).catch(() => false)) return; await sleep(200); }
  throw new Error('timed out waiting for ' + what);
}
(async () => {
  const page = await launch(APP, ['--window-size=1400,800']);
  const errs = [], check = (ok, what) => { if (!ok) errs.push(what); };
  try {
    await until(page, `typeof addChar === 'function' && typeof DEFS === 'object'`, 'the app to load');
    // make, edit, add, undo, redo, then save now (the save is debounced; a reload flushes it too, this just doesn't rely on that)
    const made = await page.js(`(() => { closeWelcome(); setMode('character'); addChar(clone(CHAR_DEFS.stick), 'flowtest');
      pickBoneSel('uarmF', false); setProp('len', 33); const n0 = DEFS.flowtest.bones.length; addBone(); const added = studio.sel, n1 = DEFS.flowtest.bones.length;
      undo(); const nUndo = DEFS.flowtest.bones.length; redo(); const nRedo = DEFS.flowtest.bones.length;
      save.flush(); return { name: CURRENT, len: DEFS.flowtest.bones.find(b => b.id === 'uarmF').len, n0, n1, nUndo, nRedo, added }; })()`);
    check(made.name === 'flowtest', 'new character is current: ' + made.name);
    check(made.len === 33, 'bone edit: ' + made.len);
    check(made.n1 === made.n0 + 1 && made.nUndo === made.n0 && made.nRedo === made.n1, `add / undo / redo bone counts ${[made.n0, made.n1, made.nUndo, made.nRedo]}`);
    // a built-in, edited then reverted
    await page.js(`(() => { pickChar('grumbo'); pickBoneSel('head', false); setProp('len', 1); revertChar(); save.flush(); pickChar('flowtest'); save.flush(); return true; })()`);
    await page.send('Page.reload', { ignoreCache: true });
    await sleep(500);
    await until(page, `typeof DEFS === 'object' && DEFS.flowtest`, 'the character to come back after the reload');
    const back = await page.js(`(() => ({ name: CURRENT, len: DEFS.flowtest.bones.find(b => b.id === 'uarmF').len, n: DEFS.flowtest.bones.length,
      added: DEFS.flowtest.bones.some(b => b.id === ${JSON.stringify(made.added)}), compiled: !!CHARS.flowtest?.bones?.length,
      grumbo: JSON.stringify(DEFS.grumbo) === JSON.stringify(CHAR_DEFS.grumbo) }))()`);
    check(back.name === 'flowtest', 'current character after reload: ' + back.name);
    check(back.len === 33 && back.n === made.n1 && back.added && back.compiled, 'edits after reload ' + JSON.stringify(back));
    check(back.grumbo, 'reverted built-in is the shipped one after reload');
  } catch (e) { errs.push(e.message); } finally { page.close(); }
  if (errs.length) { console.error('FAIL: ' + errs.join(' | ')); process.exit(1); }
  console.log('PASS: character editor: make, edit, add, undo / redo, revert, all kept across a reload');
})();
