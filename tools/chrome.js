// headless Chrome over the DevTools protocol, with node's built-in WebSocket (no dependencies): the animation tool and the MCP renderer
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');

// CHROME overrides; else the usual macOS and Linux places (as tests/browser.js looks)
const findChrome = () => process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find(p => fs.existsSync(p));

// the Chrome DevTools protocol over node's WebSocket: send(method, params) → result. proc/getStderr (launch() only):
// so a crash between writing DevToolsActivePort and actually opening the HTTP endpoint fails fast with the reason,
// instead of silently burning the whole retry budget on a process that's already gone
async function devtools(port, proc, getStderr) {
  for (let i = 0; i < 50; i++) {
    if (proc?.exitCode != null) break;
    try { const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page').webSocketDebuggerUrl);
      await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
      let id = 0; const wait = {};
      ws.onmessage = e => { const m = JSON.parse(e.data); if (wait[m.id]) { wait[m.id](m); delete wait[m.id]; } };
      return { ws, send: (method, params = {}) => new Promise((ok, no) => { wait[++id] = m => m.error ? no(new Error(method + ': ' + m.error.message)) : ok(m.result); ws.send(JSON.stringify({ id, method, params })); }) };
    } catch { await new Promise(r => setTimeout(r, 200)); }
  }
  const tail = getStderr?.().trim();
  throw new Error(`Chrome did not open its DevTools port${proc?.exitCode != null ? ` (exited ${proc.exitCode})` : ''}${tail ? ': ' + tail.split('\n').slice(-5).join(' | ') : ''}`);
}

// Chrome opening url in a temporary profile, on a free DevTools port (Chrome picks it and writes it to DevToolsActivePort)
// → { send, js(code) → value, close() }; close kills it and deletes the profile
async function launch(url, args = []) {
  const bin = findChrome();
  if (!bin) throw new Error('no Chrome found (set CHROME=/path/to/chrome)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stick2-chrome-'));
  const proc = spawn(bin, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0', `--user-data-dir=${dir}`, ...args, url], { stdio: ['ignore', 'ignore', 'pipe'] });
  // kept in case Chrome dies before opening its port (missing shared libs, a crash, ...): the only way to see why
  let stderr = ''; proc.stderr.on('data', d => { stderr += d; });
  let spawnErr = null; proc.on('error', e => { spawnErr = e; }); // a bad path (ENOENT) throws here, not from DevToolsActivePort ever appearing
  // the profile goes once Chrome is gone (it writes to it until then); at process exit nothing async runs, so close waits a moment
  const rm = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
  proc.once('exit', rm);
  const close = () => { try { proc.kill(); } catch {} Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300); rm(); };
  try {
    let port;
    for (let i = 0; i < 100 && !port && proc.exitCode === null && !spawnErr; i++) { try { port = +fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await new Promise(r => setTimeout(r, 100)); } }
    if (spawnErr) throw spawnErr;
    if (!port) throw new Error(`Chrome did not start${proc.exitCode !== null ? ` (exited ${proc.exitCode})` : ''}${stderr.trim() ? ': ' + stderr.trim().split('\n').slice(-5).join(' | ') : ''}`);
    const { ws, send } = await devtools(port, proc, () => stderr);
    const js = async code => { const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    return { proc, send, js, close: () => { try { ws.close(); } catch {} close(); } };
  } catch (e) { close(); throw e; }
}
module.exports = { findChrome, devtools, launch };
