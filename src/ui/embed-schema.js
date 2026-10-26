'use strict';
// ---------- embed config: one schema for every option an embedded stick2 takes (the #… hash of an <iframe> src) ----------
// The same list drives the hash parser here, the embed builder's form (embed.html), the docs table (docs/embed.md) and the
// tests, so they can't drift. No DOM: tests load it into a vm (tests/unit/embed.test.js); src/ui/embed.js applies it.
// A config is built up preset < cfg (base64url JSON) < hash keys < postMessage 'config'. A list key takes a full list
// (ui=hud,timer), none (ui=none), or +/- edits on what came before (ui=-hud,+meter).
const EMBED_VERSION = 1; // the postMessage API's version: bumped on a breaking change, sent in 'ready'
const EMBED_MODES = ['play', 'replay', 'grid', 'experiment', 'gallery', 'character', 'tests', 'animate', 'fx', 'sounds', 'tracker', 'props', 'weapons'];
const EMBED_UI = ['menubar', 'toolbar', 'side', 'help', 'palette', 'hud', 'timer', 'labels', 'meter', 'inputs', 'welcome'];
const EMBED_CONTROLS = ['play', 'restart', 'speed', 'mute', 'jumpin', 'branches', 'fullscreen', 'open', 'share', 'edit'];
const EMBED_OPTS = [
  // key, group, type, default, tip (+ values for enum/list, min/max for numbers)
  { key: 'scenario', group: 'scene', type: 'string', def: 'you vs ai', tip: 'The fight: a scenario name, an #embed= slug (vsai, ai-vs-ai, random…) or a scenario JSON' },
  { key: 'speed', group: 'scene', type: 'number', def: 1, min: 0.25, max: 2, tip: 'Game speed' },
  { key: 'chars', group: 'characters', type: 'list', def: [], tip: 'Roster allow-list: only these characters appear in pickers and random picks (empty: all)' },
  { key: 'p1', group: 'characters', type: 'string', def: '', tip: 'Character in slot 1 (empty: the scenario\'s own)' },
  { key: 'p2', group: 'characters', type: 'string', def: '', tip: 'Character in slot 2 (empty: the scenario\'s own)' },
  { key: 'ui', group: 'ui', type: 'list', values: EMBED_UI, def: ['hud', 'timer'], tip: 'Which parts of the app show' },
  { key: 'sections', group: 'ui', type: 'list', def: [], tip: 'Side panel sections to keep, by heading (e.g. netplay,movelist; empty: all)' },
  { key: 'controls', group: 'controls', type: 'list', values: EMBED_CONTROLS, def: ['play', 'restart', 'mute', 'fullscreen', 'open'], tip: 'The embed\'s own control bar (shown on hover or tap)' },
  { key: 'tools', group: 'tools', type: 'list', values: EMBED_MODES, def: ['play'], tip: 'Which tabs can be opened (the first is where it starts, unless a replay is given)' },
  { key: 'edit', group: 'tools', type: 'bool', def: false, tip: 'Allow the editing tabs (character, animate, fx…) and the edit drawer; edits stay in memory unless persist is on' },
  { key: 'input', group: 'input', type: 'list', values: ['keyboard', 'touch', 'gamepad', 'host'], def: ['keyboard', 'touch', 'gamepad'], tip: 'Which inputs drive the player (none: watch only; host: the host page presses keys through postMessage)' },
  { key: 'focus', group: 'input', type: 'enum', values: ['click', 'auto'], def: 'click', tip: 'click: keys reach the game only after it is clicked, so the host page keeps its own keys' },
  { key: 'autoplay', group: 'playback', type: 'bool', def: true, tip: 'Start running at once (off: a still poster frame until clicked; also off with reduced motion)' },
  { key: 'replay', group: 'playback', type: 'string', def: '', tip: 'A replay to open: an https URL of a replay file, or inline (z:<deflated base64url>, j:<base64url JSON>)' },
  { key: 'at', group: 'playback', type: 'int', def: 0, min: 0, max: 1e7, tip: 'The replay frame to start on' },
  { key: 'side', group: 'playback', type: 'enum', values: ['0', '1', '2'], def: '0', tip: 'Jump into the replay at that frame as P1 or P2 (0: just watch)' },
  { key: 'branch', group: 'playback', type: 'bool', def: true, tip: 'Allow jumping in anywhere on the timeline (each jump-in is a branch)' },
  { key: 'challenge', group: 'playback', type: 'bool', def: false, tip: 'A challenge: jump in at the frame and win the round from there' },
  { key: 'net', group: 'netplay', type: 'bool', def: false, tip: 'Allow online play (#join= / #server= links and the online panel)' },
  { key: 'bg', group: 'look', type: 'enum', values: ['paper', 'transparent'], def: 'paper', tip: 'Page background around the stage (light theme only)' },
  { key: 'accent', group: 'look', type: 'string', def: '', tip: 'Accent colour of the embed\'s own bar and play button, as #rgb or #rrggbb (empty: the game\'s)' },
  { key: 'poster', group: 'look', type: 'string', def: '', tip: 'A still image shown before play when autoplay is off: an https URL (empty: the paused first frame)' },
  { key: 'watermark', group: 'look', type: 'bool', def: true, tip: 'A small "stick2" link back to the full game' },
  { key: 'persist', group: 'security', type: 'bool', def: false, tip: 'Save to this browser\'s stick2 storage (off: everything stays in memory, the visitor\'s own saves are untouched)' },
  { key: 'mute', group: 'security', type: 'bool', def: true, tip: 'Start muted' },
  { key: 'origins', group: 'security', type: 'list', def: [], tip: 'Pages allowed to send postMessage commands (empty: the embedding page only; * for any)' },
];
const EMBED_KEYS = EMBED_OPTS.map(o => o.key);
const EMBED_MAX = 32 * 1024; // the longest hash read (a long replay goes by URL, or by postMessage 'load')
const embedDefaults = () => Object.fromEntries(EMBED_OPTS.map(o => [o.key, Array.isArray(o.def) ? [...o.def] : o.def]));

// one value, checked and clamped; null for one that can't be used (it is dropped, with a warning)
function embedValue(o, v, prev) {
  if (o.type === 'bool') return v === true || v === '' || v === '1' || v === 'true' || v === 'on' ? true : v === false || v === '0' || v === 'false' || v === 'off' ? false : null;
  if (o.type === 'int' || o.type === 'number') {
    const n = Number(v); if (!Number.isFinite(n)) return null;
    return Math.min(o.max, Math.max(o.min, o.type === 'int' ? Math.round(n) : n));
  }
  if (o.type === 'enum') return o.values.includes(String(v)) ? String(v) : null;
  if (o.type === 'string') return typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, EMBED_MAX) : null;
  // list: an array, or text: "a,b", "none", "+a,-b" (edits on prev)
  // (a + in a hash read by URLSearchParams arrives as a space: ui=+meter is ui= meter)
  const items = Array.isArray(v) ? v.map(String) : String(v).split(',').map(s => s.replace(/^ (?=\S)/, '+').trim()).filter(Boolean);
  if (items.length === 1 && items[0] === 'none') return [];
  const edits = items.length && items.every(s => /^[+-]/.test(s));
  let out = edits ? [...(prev || o.def)] : [];
  for (const s of items) {
    const name = edits ? s.slice(1) : s;
    if (o.values && !o.values.includes(name)) continue;
    if (edits && s[0] === '-') out = out.filter(x => x !== name); else if (!out.includes(name)) out.push(name);
  }
  return out;
}
// merge raw values (an object, from a preset, cfg JSON, the hash or a postMessage) into cfg; returns the warnings
function embedMerge(cfg, raw, from) {
  const warn = [];
  for (const [k, v] of Object.entries(raw || {})) {
    const o = EMBED_OPTS.find(x => x.key === k);
    if (!o) { warn.push(`${from}: unknown option "${k}"`); continue; }
    const val = embedValue(o, v, cfg[k]);
    if (val === null) warn.push(`${from}: bad value for ${k}`); else cfg[k] = val;
  }
  return warn;
}
const b64urlDecode = s => { const b = s.replace(/-/g, '+').replace(/_/g, '/'); return typeof atob === 'function' ? atob(b + '='.repeat((4 - b.length % 4) % 4)) : Buffer.from(b, 'base64').toString('binary'); };
const b64urlEncode = bin => (typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const utf8 = { enc: s => unescape(encodeURIComponent(s)), dec: s => decodeURIComponent(escape(s)) };
// is this hash an embed? a preset, a cfg, or any embed-only option (#embed=, #scenario=… alone keep the old meaning)
const EMBED_ONLY = ['preset', 'cfg', 'ui', 'controls', 'tools', 'replay', 'challenge'];
const isEmbedHash = params => EMBED_ONLY.some(k => params.has(k));
// params: a URLSearchParams (or anything with get/has/forEach); presets: {name: {cfg}}. Returns { cfg, warnings }
function parseEmbed(params, presets = {}) {
  const cfg = embedDefaults(), warnings = [];
  const p = params.get('preset');
  if (p) { if (presets[p]) warnings.push(...embedMerge(cfg, presets[p].cfg, `preset ${p}`)); else warnings.push(`no preset "${p}"`); }
  const c = params.get('cfg');
  if (c) {
    if (c.length > EMBED_MAX) warnings.push('cfg is too long');
    else { let j; try { j = JSON.parse(utf8.dec(b64urlDecode(c))); } catch { warnings.push('cfg is not base64url JSON'); } if (j) warnings.push(...embedMerge(cfg, j, 'cfg')); }
  }
  const raw = {};
  params.forEach((v, k) => { if (EMBED_KEYS.includes(k)) raw[k] = v; });
  if (params.has('embed') && !params.has('scenario')) raw.scenario = params.get('embed'); // the old #embed=<slug|JSON> names the fight
  warnings.push(...embedMerge(cfg, raw, 'hash'));
  return { cfg, warnings: [...warnings, ...embedCheck(cfg)] };
}
// combinations that work but likely aren't meant
function embedCheck(cfg) {
  const w = [];
  if (cfg.edit && !cfg.persist) w.push('edit is on but persist is off: edits are lost on reload');
  if (!cfg.edit && cfg.tools.some(t => !['play', 'replay', 'gallery', 'grid'].includes(t))) w.push('editing tabs need edit=on; they are left out');
  if (cfg.challenge && (!cfg.replay || cfg.side === '0')) w.push('a challenge needs a replay, a frame (at) and a side');
  if (cfg.side !== '0' && !cfg.replay) w.push('side only applies to a replay');
  if (!cfg.tools.length) w.push('no tools: play is used');
  if (cfg.accent && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(cfg.accent)) w.push('accent must be #rgb or #rrggbb: ignored');
  if (cfg.poster && !/^https:\/\//.test(cfg.poster)) w.push('poster must be an https URL: ignored');
  if (cfg.ui.includes('menubar') && !cfg.edit) w.push('the menubar has import, reset and save buttons: consider edit=on or leave it out');
  return w;
}
// the tabs the embed may open: the editing ones only with edit on, play when nothing is left
const embedToolsFor = cfg => { const t = cfg.tools.filter(m => cfg.edit || ['play', 'replay', 'gallery', 'grid'].includes(m)); return t.length ? t : ['play']; };
// the shortest hash for cfg: only what differs from the preset (or from the defaults), as hash keys; long values go in cfg=
function embedHash(cfg, preset = null, presets = {}) {
  const base = embedDefaults();
  if (preset && presets[preset]) embedMerge(base, presets[preset].cfg, 'preset');
  const parts = preset && presets[preset] ? [['preset', preset]] : [];
  for (const o of EMBED_OPTS) {
    const v = cfg[o.key], b = base[o.key];
    if (JSON.stringify(v) === JSON.stringify(b)) continue;
    parts.push([o.key, o.type === 'list' ? (v.length ? v.join(',') : 'none') : o.type === 'bool' ? (v ? '1' : '0') : String(v)]);
  }
  // nothing an embed-only key marks it as an embed: ui says so (with the preset's own value)
  if (!parts.some(([k]) => EMBED_ONLY.includes(k))) parts.push(['ui', cfg.ui.length ? cfg.ui.join(',') : 'none']);
  return parts.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
const embedCfgParam = cfg => b64urlEncode(utf8.enc(JSON.stringify(cfg)));
// the <iframe> snippet: lazy, sized, with the permissions it can use
const embedSnippet = (src, w = 800, h = 450, title = 'stick2') =>
  `<iframe src="${src.replace(/"/g, '&quot;')}" width="${w}" height="${h}" title="${title}" loading="lazy" allow="fullscreen" style="border:0;max-width:100%"></iframe>`;
