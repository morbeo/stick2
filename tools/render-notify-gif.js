#!/usr/bin/env node
// Renders a short "ai vs ai" fight GIF for the push-to-master Discord notification.
// usage: node tools/render-notify-gif.js [seed]
// seed can be any string (e.g. a commit SHA) or a number; the same seed always
// picks the same characters and produces the same fight, so it can be replayed later.
// prints the gif path on stdout, and the resolved chars/seed on stderr
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

// deterministic string -> 32-bit int (FNV-1a)
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: deterministic PRNG from a 32-bit int seed
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function startEngine() {
  const proc = spawn('node', [path.join(__dirname, 'mcp.js')], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = readline.createInterface({ input: proc.stdout });
  const pending = new Map();
  let nextId = 1;
  rl.on('line', line => {
    let msg; try { msg = JSON.parse(line); } catch { return; }
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error.message));
    else entry.resolve(msg.result);
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const callTool = async (name, args) => {
    const result = await request('tools/call', { name, arguments: args });
    if (result.isError) throw new Error(result.content?.[0]?.text || 'tool error');
    return result;
  };
  return { callTool, request, proc };
}

async function main() {
  const input = process.argv[2] || String(Math.floor(Math.random() * 1e9));
  const rng = mulberry32(hashSeed(input));
  const engine = startEngine();
  await engine.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stick2-ci-notify', version: '1' } });
  engine.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const rosterResult = await engine.callTool('list_characters', {});
  const roster = JSON.parse(rosterResult.content.find(c => c.type === 'text').text).map(c => c.name);
  const chars = [roster[Math.floor(rng() * roster.length)], roster[Math.floor(rng() * roster.length)]];
  const seed = Math.floor(rng() * 1e6);

  const sim = await engine.callTool('simulate', { scenario: 'ai vs ai', chars, seed, events: false });
  const simData = JSON.parse(sim.content.find(c => c.type === 'text').text);
  const gif = await engine.callTool('render_gif', { simulation: simData.id, to: Math.min(simData.N, 1200) });
  const meta = JSON.parse(gif.content.find(c => c.type === 'text').text);

  console.error(`fight: ${chars[0]} vs ${chars[1]}, seed ${seed} (from "${input}")`);
  console.log(meta.path);
  engine.proc.kill();
}

main().catch(err => { console.error(err); process.exit(1); });
