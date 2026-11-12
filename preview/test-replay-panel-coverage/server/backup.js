#!/usr/bin/env node
'use strict';
// ---------- backup / restore of a server's saved data: everything under DB_PATH (bans, accounts, ratings, embeds, replays) as one JSON file ----------
// usage:
//   node server/backup.js backup  [--db DIR] [--out FILE]      write a backup (default: stick2-backup-<date>.json here; --out - prints it)
//   node server/backup.js restore FILE [--db DIR] [--force]    put a backup's files back (refuses to overwrite files unless --force)
//   node server/backup.js list    FILE                         what a backup holds
// DIR defaults to $DB_PATH. Stop the server before a restore: a running one keeps its own copy in memory and writes it back.
const fs = require('fs'), path = require('path');
const FORMAT = 'stick2-server-backup', VERSION = 1;

// every .json under dir, as { 'replays/abc.json': text }
function collect(dir) {
  const files = {};
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    const rel = String(f).split(path.sep).join('/'), abs = path.join(dir, String(f));
    if (rel.endsWith('.json') && fs.statSync(abs).isFile()) files[rel] = fs.readFileSync(abs, 'utf8');
  }
  return files;
}
const backup = dir => ({ format: FORMAT, version: VERSION, created: new Date().toISOString(), files: collect(dir) });

// a backup's paths must stay inside dir: relative, .json, no ..
const safe = rel => typeof rel === 'string' && rel.endsWith('.json') && !path.isAbsolute(rel) && !rel.split(/[\\/]/).includes('..');
function check(b) {
  if (!b || b.format !== FORMAT) throw new Error('not a stick2 server backup');
  if (b.version > VERSION) throw new Error(`backup version ${b.version} is newer than this server reads (${VERSION})`);
  const bad = Object.keys(b.files || {}).filter(r => !safe(r) || typeof b.files[r] !== 'string');
  if (bad.length) throw new Error(`unsafe entries: ${bad.join(', ')}`);
  return b;
}
// writes the files; returns { written, skipped } (skipped: existed and force was off)
function restore(b, dir, force = false) {
  check(b);
  const written = [], skipped = [];
  for (const [rel, text] of Object.entries(b.files)) {
    const abs = path.join(dir, rel);
    if (fs.existsSync(abs) && !force) { skipped.push(rel); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
    written.push(rel);
  }
  return { written, skipped };
}
const summary = b => {
  const n = Object.keys(b.files), replays = n.filter(r => r.startsWith('replays/') && r !== 'replays/index.json').length;
  return { created: b.created, files: n.length, replays, data: n.filter(r => !r.startsWith('replays/')), bytes: n.reduce((s, r) => s + b.files[r].length, 0) };
};

function main(argv, env = process.env, log = console.log) {
  const [cmd, ...rest] = argv, flag = n => rest.includes('--' + n), val = n => { const i = rest.indexOf('--' + n); return i >= 0 ? rest[i + 1] : undefined; };
  const pos = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--db', '--out'].includes(rest[i - 1])));
  const dir = val('db') || env.DB_PATH;
  const needDir = () => { if (!dir) throw new Error('no data folder: pass --db DIR or set DB_PATH'); return path.resolve(dir); };
  const readFile = () => { if (!pos[0]) throw new Error('which backup file?'); return check(JSON.parse(fs.readFileSync(pos[0], 'utf8'))); };
  if (cmd === 'backup') {
    const d = needDir(); if (!fs.existsSync(d)) throw new Error(`${d} does not exist`);
    const b = backup(d), text = JSON.stringify(b), out = val('out') || `stick2-backup-${b.created.slice(0, 10)}.json`;
    if (out === '-') { process.stdout.write(text + '\n'); return 0; }
    fs.writeFileSync(out, text);
    const s = summary(b); log(`backed up ${s.files} files (${s.replays} replays, ${s.data.join(', ') || 'no data files'}) from ${d} to ${out}`);
    return 0;
  }
  if (cmd === 'restore') {
    const b = readFile(), r = restore(b, needDir(), flag('force'));
    log(`restored ${r.written.length} files to ${needDir()}` + (r.skipped.length ? `; kept ${r.skipped.length} existing (use --force to overwrite): ${r.skipped.join(', ')}` : ''));
    return 0;
  }
  if (cmd === 'list') { log(JSON.stringify(summary(readFile()), null, 2)); return 0; }
  log('usage: node server/backup.js backup [--db DIR] [--out FILE|-] | restore FILE [--db DIR] [--force] | list FILE\n  DIR defaults to $DB_PATH; stop the server before restoring');
  return cmd === undefined || cmd === 'help' || flag('help') || cmd === '-h' ? 0 : 2;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error('backup: ' + e.message); process.exitCode = 1; }
}
module.exports = { backup, restore, check, summary, main, FORMAT, VERSION };
