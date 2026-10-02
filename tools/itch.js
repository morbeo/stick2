// packs the app for itch.io (an HTML project): dist/stick2-itch.zip with index.html at its root. npm run itch
// only what the page loads: index.html, docs.html, src/ (with a fresh src/build.js) and the icon font, plus the licenses
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), dist = path.join(root, 'dist'), zip = path.join(dist, 'stick2-itch.zip');
const FILES = ['index.html', 'docs.html', 'src', 'fonts', 'LICENSE'];

execFileSync('node', [path.join(__dirname, 'build-info.js')], { cwd: root, stdio: 'inherit' });
const { BUILD } = new Function(fs.readFileSync(path.join(root, 'src', 'build.js'), 'utf8') + '; return { BUILD };')();
if (BUILD.dirty) console.warn('warning: uncommitted changes are in the build');
fs.mkdirSync(dist, { recursive: true });
fs.rmSync(zip, { force: true });
execFileSync('zip', ['-rqX', zip, ...FILES, '-x', '*.DS_Store'], { cwd: root, stdio: 'inherit' });
console.log(`${path.relative(root, zip)} · ${(fs.statSync(zip).size / 1024).toFixed(0)} KB · upload it as an HTML project played in the browser`);
