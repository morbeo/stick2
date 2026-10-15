// the browser smoke test under Chrome's own coverage (CDP Profiler): runs the page, prints line and function coverage per src file
// a line counts as run when any code on it ran; blank and comment-only lines don't count
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function connect(port) {
  for (let i = 0; i < 100; i++) {
    try {
      const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page').webSocketDebuggerUrl);
      await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
      let id = 0; const wait = {};
      ws.onmessage = e => { const m = JSON.parse(e.data); if (wait[m.id]) { wait[m.id](m); delete wait[m.id]; } };
      return { ws, send: (method, params = {}) => new Promise((ok, no) => { wait[++id] = m => m.error ? no(new Error(method + ': ' + m.error.message)) : ok(m.result); ws.send(JSON.stringify({ id, method, params })); }) };
    } catch { await sleep(100); }
  }
  throw new Error('no DevTools connection');
}
// per character: the count of the innermost range around it (V8 ranges nest, the function's whole range first)
function lines(src, fns) {
  const count = new Int32Array(src.length).fill(-1);
  for (const r of fns.flatMap(f => f.ranges).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset)) count.fill(r.count, r.startOffset, r.endOffset);
  let run = 0, all = 0, off = 0, inBlock = false;
  for (const line of src.split('\n')) {
    const t = line.trim(), code = !inBlock && t && !t.startsWith('//') && !t.startsWith('/*');
    if (t.startsWith('/*') && !t.includes('*/')) inBlock = true; else if (inBlock && t.includes('*/')) inBlock = false;
    if (code) { all++; for (let i = 0; i < line.length; i++) if (line[i] !== ' ' && count[off + i] > 0) { run++; break; } }
    off += line.length + 1;
  }
  return { run, all };
}
module.exports = async function coverage(chrome, url, src) {
  const port = 9300 + Math.floor(Math.random() * 600), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stick2-cov-'));
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--window-size=1400,800',
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
  try {
    const { ws, send } = await connect(port);
    await send('Profiler.enable'); await send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
    await send('Page.navigate', { url });
    let title = '';
    for (let i = 0; i < 1200 && !/^(OK|ERR)/.test(title); i++) { await sleep(100); title = (await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })).result.value || ''; }
    const { result } = await send('Profiler.takePreciseCoverage');
    ws.close();
    const rows = result.filter(s => s.url.startsWith('file://' + src + '/')).map(s => {
      const file = s.url.slice(src.length + 8), text = fs.readFileSync(path.join(src, file), 'utf8'), l = lines(text, s.functions);
      const fns = s.functions.filter(f => f.functionName || f.ranges[0].startOffset > 0);
      return { file, l, f: { run: fns.filter(f => f.ranges[0].count > 0).length, all: fns.length } };
    }).sort((a, b) => a.l.run / a.l.all - b.l.run / b.l.all);
    const pct = x => (x.all ? 100 * x.run / x.all : 100).toFixed(1).padStart(6), sum = k => ({ run: rows.reduce((s, r) => s + r[k].run, 0), all: rows.reduce((s, r) => s + r[k].all, 0) });
    console.log('file           lines %   funcs %   lines run / all');
    for (const r of [...rows, { file: 'all files', l: sum('l'), f: sum('f') }]) console.log(`${r.file.padEnd(14)} ${pct(r.l)}    ${pct(r.f)}    ${r.l.run} / ${r.l.all}`);
    return title || 'no title';
  } finally { proc.kill(); }
};
