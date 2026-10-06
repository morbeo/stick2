'use strict';
// ---------- diffing: a structured, field-by-field diff between two plain JSON trees ----------
// used by studio.js (a character export is a diff against its matching built-in by default, like a git patch - small,
// and the shape a diff visualizer can address directly: which bone, which move, which key changed, not just a text patch)
// an array whose items carry an id or a name (bones, stances, a stance's body.add) diffs by that key, order-independent
// (reordering alone is not a change); any other array (a move's keys, a pose's numbers) diffs by index, whole-array
// replacement (full) if its length changed, since index-shifted inserts/deletes aren't worth reconstructing
const diffKey = x => x && typeof x === 'object' ? (x.id ?? x.name) : undefined;
function diffVal(a, b) {
  if (a === b) return undefined;
  if (Array.isArray(a) && Array.isArray(b)) return diffArr(a, b);
  if (a && b && typeof a === 'object' && typeof b === 'object') return diffObj(a, b);
  return JSON.stringify(a) === JSON.stringify(b) ? undefined : [a, b]; // a leaf change: [from, to]
}
// a key explicitly set to undefined (common from spreads/optional fields in the live JS objects, never from JSON
// itself) counts as absent, so diffing a value against its own structuredClone/JSON round trip is always empty
const has = (o, k) => k in o && o[k] !== undefined;
function diffObj(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!has(a, k) && !has(b, k)) continue;
    if (!has(a, k)) (out.added ??= {})[k] = b[k];
    else if (!has(b, k)) (out.removed ??= {})[k] = a[k];
    else { const d = diffVal(a[k], b[k]); if (d !== undefined) (out.changed ??= {})[k] = d; }
  }
  return Object.keys(out).length ? out : undefined;
}
function diffArr(a, b) {
  if (a.length && b.length && diffKey(a[0]) !== undefined && diffKey(b[0]) !== undefined) {
    const am = new Map(a.map(x => [diffKey(x), x])), bm = new Map(b.map(x => [diffKey(x), x])), out = {};
    for (const [k, v] of am) if (!bm.has(k)) (out.removed ??= {})[k] = v;
    for (const [k, v] of bm) if (!am.has(k)) (out.added ??= {})[k] = v;
    for (const [k, v] of am) if (bm.has(k)) { const d = diffObj(v, bm.get(k)); if (d) (out.changed ??= {})[k] = d; }
    return Object.keys(out).length ? out : undefined;
  }
  if (a.length !== b.length) return JSON.stringify(a) === JSON.stringify(b) ? undefined : { full: b };
  const out = {};
  for (let i = 0; i < a.length; i++) { const d = diffVal(a[i], b[i]); if (d !== undefined) (out.changed ??= {})[i] = d; }
  return Object.keys(out).length ? out : undefined;
}
// reconstructs b from a and diffVal(a, b) - a round trip: applyVal(a, diffVal(a, b)) deep-equals b
function applyVal(cur, d) {
  if (d === undefined) return cur;
  if (Array.isArray(d)) return d[1]; // a leaf change
  return Array.isArray(cur) ? applyArr(cur, d) : applyObj(cur, d);
}
function applyObj(cur, d) {
  const out = { ...cur };
  for (const k in d.added || {}) out[k] = d.added[k];
  for (const k in d.removed || {}) delete out[k];
  for (const k in d.changed || {}) out[k] = applyVal(cur[k], d.changed[k]);
  return out;
}
function applyArr(cur, d) {
  if ('full' in d) return d.full;
  if (cur.length && diffKey(cur[0]) !== undefined) {
    const map = new Map(cur.map(x => [diffKey(x), x]));
    for (const k in d.removed || {}) map.delete(k);
    for (const k in d.changed || {}) map.set(k, applyObj(map.get(k), d.changed[k]));
    for (const k in d.added || {}) map.set(k, d.added[k]);
    return [...map.values()];
  }
  const out = [...cur];
  for (const k in d.changed || {}) out[k] = applyVal(cur[k], d.changed[k]);
  return out;
}
// true if nothing differs (an empty diff) - diffVal returns undefined, {}, or nested emptiness never happens (diffObj/
// diffArr only return a truthy result when they found at least one added/removed/changed key)
const diffEmpty = d => d === undefined;
