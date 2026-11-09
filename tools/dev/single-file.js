// one self-contained page: dist/stick2.html with every script and the icon font inlined, so the game runs from a
// double-clicked file, a USB stick or any static host with no folder to keep together. npm run single [-- out.html]
// The release workflow attaches it to each GitHub release. Same code as index.html, nothing minified or changed.
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const out = path.resolve(root, process.argv[2] || path.join('dist', 'stick2.html'));

execFileSync('node', [path.join(__dirname, 'build-info.js')], { cwd: root, stdio: 'inherit' });
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// a script's text can't contain "</script" inside an inline tag; "<\/script" means the same in JS strings and regexes
const inline = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/<\/script/gi, '<\\/script');
let n = 0;
html = html.replace(/<script src="([^"?]+)"><\/script>/g, (_, src) => { n++; return `<script>/* ${src} */\n${inline(src)}\n</script>`; });
html = html.replace(/url\((fonts\/[^)]+\.woff2)\)/g, (_, f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(root, f)).toString('base64')})`);
const left = html.match(/(src|href)="(src|fonts)\/[^"]+"/g);
if (left) { console.error('still pointing at files: ' + left.join(', ')); process.exit(1); }
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${path.relative(root, out)} · ${n} scripts inlined · ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
