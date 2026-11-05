'use strict';
// ---------- the MCP pieces shared by the app's stdio server (tools/mcp/mcp.js) and the game server's POST /mcp (server/mcp.js) ----------
// JSON-RPC 2.0 framing, protocol versions, schema helpers, tools/list and argument checks. No dependencies.
// a tool: { d: description, p: properties (JSON Schema), req: required names, run(args, ctx) }
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const prop = type => (d, extra = {}) => ({ type, description: d, ...extra });
const str = prop('string'), num = prop('number'), int = prop('integer'), bool = prop('boolean'), obj = prop('object');
const arr = (d, items = {}) => ({ type: 'array', description: d, items });

// the protocol version to answer with: the client's when we speak it, else our newest
const version = asked => VERSIONS.includes(asked) ? asked : VERSIONS[0];
// tools/list entries; keep(t) filters (e.g. admin tools for admin callers only), suffix(t) adds to the description
const listTools = (TOOLS, keep = () => true, suffix = () => '') => Object.entries(TOOLS).filter(([, t]) => keep(t)).map(([name, t]) => ({ name, description: t.d + suffix(t),
  inputSchema: { type: 'object', properties: t.p || {}, ...(t.req ? { required: t.req } : {}), additionalProperties: false } }));
// the arguments against the tool's schema: required ones (missing or ''), unknown ones, the basic types and enums
function checkArgs(t, a) {
  const bad = [], p = t.p || {}, type = v => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
  for (const k of t.req || []) if (a[k] === undefined || a[k] === '') bad.push(`${k} is required`);
  for (const [k, v] of Object.entries(a)) {
    if (!p[k]) { bad.push(`unknown argument ${k} (takes ${Object.keys(p).join(', ') || 'none'})`); continue; }
    const want = [].concat(p[k].type || []), got = type(v);
    if (want.length && !want.includes(got) && !(got === 'integer' && want.includes('number'))) bad.push(`${k} should be ${want.join(' or ')}, not ${got}`);
    if (p[k].enum && !p[k].enum.includes(v)) bad.push(`${k} is one of ${p[k].enum.join(', ')}`);
  }
  if (bad.length) throw new Error(bad.join('; '));
}
// a tool's value as an MCP result (one that already has content passes through); errors become isError results
const asResult = r => r?.content ? r : { content: [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r ?? null, null, 2) }] };
const errResult = e => ({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });

// one JSON-RPC message → its answer (null for notifications and responses); METHODS[name](params, ctx) may be async
async function rpc(METHODS, m, ctx, onError) {
  if (m && typeof m === 'object' && m.method === undefined && m.id !== undefined) return null; // a response: these servers send no requests
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return { jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32600, message: 'invalid request' } };
  if (m.id === undefined) return null; // a notification
  const f = METHODS[m.method];
  if (!f) return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `method not found: ${m.method}` } };
  try { return { jsonrpc: '2.0', id: m.id, result: await f(m.params, ctx) }; }
  catch (e) { onError?.(e); return { jsonrpc: '2.0', id: m.id, error: { code: e.code || -32603, message: e.message } }; }
}
// a parsed body (one message or a batch) → the answer to send, or null when there is none
async function rpcBody(METHODS, body, ctx, onError) {
  if (!Array.isArray(body)) return rpc(METHODS, body, ctx, onError);
  const out = (await Promise.all(body.map(x => rpc(METHODS, x, ctx, onError)))).filter(Boolean);
  return out.length ? out : null;
}
const PARSE_ERROR = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } };

module.exports = { VERSIONS, str, num, int, bool, obj, arr, version, listTools, checkArgs, asResult, errResult, rpc, rpcBody, PARSE_ERROR };
