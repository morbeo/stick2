#!/usr/bin/env node
// Quick character inspection straight from the engine, no MCP/browser round-trip and no 150k-char JSON dump.
// Usage:
//   node tools/char-info.js <name>                 bones (id, parent, role, len, shape) + move names + binds
//   node tools/char-info.js <name> bones            just the bone list, full fields
//   node tools/char-info.js <name> move <moveName>  one move's full definition (keys included)
//   node tools/char-info.js <name> moves            every move's frame data (like list_moves)
const engine = require('./engine');
// const/let declared inside vm.runInContext don't attach to the sandbox object as properties (only var/function
// declarations do), so everything that touches CHAR_DEFS/makeCharacter has to run as a string INSIDE the context
// (ctx.run(code)), the same way tools/session.js's MCP.* calls do - not accessed from here as ctx.CHAR_DEFS
const { run } = engine();

const [, , name, what, moveName] = process.argv;
if (!name) { console.error('usage: node tools/char-info.js <name> [bones|move <moveName>|moves]'); process.exit(1); }

const has = run(`!!CHAR_DEFS[${JSON.stringify(name)}]`);
if (!has) { console.error(`no built-in "${name}" (CHAR_DEFS). Custom/session characters aren't loaded here - use list_characters/get_character for those.`); process.exit(1); }

const out = run(`(() => {
  const def = CHAR_DEFS[${JSON.stringify(name)}], ch = makeCharacter(def), what = ${JSON.stringify(what)}, moveName = ${JSON.stringify(moveName)};
  if (what === 'bones') return JSON.stringify(def.bones);
  if (what === 'move') {
    if (!def.moves[moveName]) throw new Error(\`${name} has no move "\${moveName}". Moves: \${Object.keys(def.moves).join(', ')}\`);
    return JSON.stringify(def.moves[moveName]);
  }
  if (what === 'moves') return JSON.stringify(Object.keys(ch.moves));
  return JSON.stringify({
    name: ${JSON.stringify(name)},
    bones: def.bones.map(b => ({ id: b.id, parent: b.parent ?? null, role: b.role, len: b.len, shape: b.shape ?? 'line' })),
    stances: ch.stances.map(s => s.name),
    binds: def.binds || {},
    moveNames: Object.keys(def.moves),
  });
})()`);
console.log(JSON.stringify(JSON.parse(out), null, 1));
