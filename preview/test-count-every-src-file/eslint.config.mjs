// ESLint: `npm run lint`. src/ is classic scripts sharing one global scope (index.html loads them in order), so
// names defined in one file and used in another are neither undefined nor unused here; tools/ and tests/ are Node.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'server/node_modules/', 'src/build.js', 'dist/', 'stick2-embed.js', '**/*.min.js'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.browser } },
    rules: {
      'no-undef': 'off', // globals from the other scripts
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, destructuredArrayIgnorePattern: '^_' }], // top-level names are used by other scripts
      'no-redeclare': 'off', // same reason: a script may define what another reads first
    },
  },
  {
    files: ['tools/**/*.js', 'tests/**/*.js', 'server/**/*.js', '*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, destructuredArrayIgnorePattern: '^_' }] },
  },
  // functions these send into the engine's vm context (tools/lib/engine.js), where the engine's globals are
  { files: ['tools/mcp/session.js', 'tools/render/frames.js'], rules: { 'no-undef': 'off' } },
  // a classic script too (render.html, itch-render.html and the MCP server's vm load it): drawFrames is its export
  { files: ['tools/render/frames.js'], languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
    rules: { 'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }] } },
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }], // try { … } catch {}: best effort (storage, clipboard, audio)
      'no-control-regex': 'off', // names and replay text are cleaned of control characters on purpose
    },
  },
];
