// release notes in pictures: each PR merged between two refs, with before / after screenshots of the parts of the app it touched
// usage: node tools/render/release-notes.js [--from ref] [--to ref] [--out dir] [--url base] [--max n]
//   --from  the previous release (default: the tag before --to, else 10 merges back)
//   --to    the release (default HEAD)
//   --out   where notes.md and the PNGs go (default release-notes/)
//   --url   prefix for the image links, e.g. a release's download URL (default: relative to notes.md)
//   --max   at most this many shots per PR (default 3)
// "before" renders --from from a temporary git worktree, so the pictures show what changed, not just what is there
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { affected, shoot } = require('./screenshots');
const root = path.join(__dirname, '..', '..');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

const opt = { to: 'HEAD', out: 'release-notes', url: '', max: 3 };
for (let a = process.argv.slice(2), i = 0; i < a.length; i++) {
  const k = a[i].replace(/^--/, '');
  if (k === 'help' || k === 'h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 8).map(l => l.slice(3)).join('\n')); process.exit(0); }
  if (!(k in opt) && k !== 'from') { console.error(`unknown option ${a[i]} (try --help)`); process.exit(2); }
  opt[k] = a[++i];
}
opt.max = +opt.max;
if (!opt.from) {
  try { opt.from = git('describe', '--tags', '--abbrev=0', `${opt.to}^`); }
  catch { opt.from = git('rev-list', '--first-parent', '--merges', '--max-count=11', opt.to).split('\n').pop(); }
}
const out = path.resolve(opt.out), link = f => (opt.url ? opt.url.replace(/\/?$/, '/') : '') + f;
fs.mkdirSync(out, { recursive: true });

// the PRs: merge commits on the first-parent line, titled by their body's first line ("Merge pull request #n from …" is the subject)
const prs = git('log', '--first-parent', '--merges', '--format=%H%x1f%s%x1f%b%x1e', `${opt.from}..${opt.to}`).split('\x1e').map(s => s.trim()).filter(Boolean)
  .map(s => { const [sha, subject, body] = s.split('\x1f'); return { sha, num: subject.match(/#(\d+)/)?.[1], title: body.split('\n')[0] || subject,
    files: git('diff', '--name-only', `${sha}^1`, sha).split('\n').filter(Boolean) }; })
  .map(p => ({ ...p, shots: affected(p.files).slice(0, opt.max) })).reverse();

// one render of each side covers every PR: "before" from a worktree of --from, "after" from --to (this checkout when it is HEAD)
const names = [...new Set(prs.flatMap(p => p.shots))];
const side = (ref, suffix) => {
  if (!names.length) return;
  const head = git('rev-parse', 'HEAD') === git('rev-parse', ref);
  const dir = head ? root : fs.mkdtempSync(path.join(os.tmpdir(), 'stick2-rn-'));
  if (!head) git('worktree', 'add', '--detach', dir, ref);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stick2-shots-'));
  try {
    for (const f of shoot(names, { root: dir, out: tmp })) fs.copyFileSync(f, path.join(out, path.basename(f, '.png') + suffix + '.png'));
  } finally { if (!head) git('worktree', 'remove', '--force', dir); fs.rmSync(tmp, { recursive: true, force: true }); }
};
side(opt.from, '-before'); side(opt.to, '');
// a shot that came out the same on both sides shows nothing new: dropped (and its PNGs deleted)
const png = f => path.join(out, f + '.png'), read = f => { try { return fs.readFileSync(png(f)); } catch { return null; } };
const same = new Set(names.filter(n => { const a = read(n + '-before'), b = read(n); return !a || !b || a.equals(b); }));
for (const n of same) for (const f of [n, n + '-before']) fs.rmSync(png(f), { force: true });
for (const p of prs) p.shots = p.shots.filter(n => !same.has(n));

const repo = (() => { try { return git('remote', 'get-url', 'origin').match(/github\.com[:/](.+?)(\.git)?$/)?.[1]; } catch { return null; } })();
const md = [`## What's new, in pictures`, '', `Changes from \`${opt.from}\` to \`${opt.to}\`.`, ''];
for (const p of prs) {
  md.push(`### ${p.title}${p.num ? ` (${repo ? `[#${p.num}](https://github.com/${repo}/pull/${p.num})` : '#' + p.num})` : ''}`, '');
  if (!p.shots.length) { md.push(`_No visible change: ${p.files.length} file${p.files.length === 1 ? '' : 's'} touched._`, ''); continue; }
  md.push('| Before | After |', '| --- | --- |');
  for (const n of p.shots) md.push(`| ![${n} before](${link(n + '-before.png')}) | ![${n} after](${link(n + '.png')}) |`);
  md.push('');
}
fs.writeFileSync(path.join(out, 'notes.md'), md.join('\n'));
console.log(path.join(path.relative(root, out) || '.', 'notes.md'));
