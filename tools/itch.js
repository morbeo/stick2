// packs the app for itch.io (an HTML project): dist/stick2-itch.zip with index.html at its root. npm run itch
// --push (npm run itch:push) then uploads it with butler to morbeo/stick2:html, versioned by the commit; a dirty tree is refused
// only what the page loads: index.html, docs.html, src/ (with a fresh src/build.js) and the icon font, plus the licenses
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), dist = path.join(root, 'dist'), zip = path.join(dist, 'stick2-itch.zip');
const FILES = ['index.html', 'docs.html', 'src', 'fonts', 'LICENSE'], TARGET = 'morbeo/stick2:html', push = process.argv.includes('--push');

execFileSync('node', [path.join(__dirname, 'build-info.js')], { cwd: root, stdio: 'inherit' });
const { BUILD } = new Function(fs.readFileSync(path.join(root, 'src', 'build.js'), 'utf8') + '; return { BUILD };')();
// uncommitted changes in what goes into the zip (other untracked files don't matter)
const dirty = execFileSync('git', ['status', '--porcelain', '--', ...FILES], { cwd: root, encoding: 'utf8' }).trim();
if (dirty && push) { console.error('uncommitted changes: commit them before pushing to itch.io\n' + dirty); process.exit(1); }
if (dirty) console.warn('warning: uncommitted changes are in the build\n' + dirty);
fs.mkdirSync(dist, { recursive: true });
fs.rmSync(zip, { force: true });
execFileSync('zip', ['-rqX', zip, ...FILES, '-x', '*.DS_Store'], { cwd: root, stdio: 'inherit' });
console.log(`${path.relative(root, zip)} · ${(fs.statSync(zip).size / 1024).toFixed(0)} KB · upload it as an HTML project played in the browser`);
if (push) execFileSync('butler', ['push', zip, TARGET, '--userversion', BUILD.commit], { cwd: root, stdio: 'inherit' });
