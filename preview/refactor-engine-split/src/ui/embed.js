'use strict';
// ---------- embed: the app in someone else's <iframe>, set up by its hash (src/ui/embed-schema.js, docs/embed.md) ----------
// Loaded right after embed-schema.js / embed-presets.js and before everything else, so the storage guard below is in
// place before any script reads or writes localStorage; app.js calls embedStart() (instead of readHash) once the app is up.
// EMBED is null on a normal page: none of this runs.
const EMBED = (() => {
  if (typeof location === 'undefined') return null;
  const params = new URLSearchParams(location.hash.slice(1));
  if (!isEmbedHash(params)) return null;
  const { cfg, warnings } = parseEmbed(params, EMBED_PRESETS);
  for (const w of warnings) console.warn('stick2 embed: ' + w);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches && !params.has('autoplay')) cfg.autoplay = false;
  return { cfg, params, warnings, focused: false, branches: 0, koSeen: false, origin: (() => { try { return new URL(document.referrer).origin; } catch { return null; } })() };
})();

// persist off: an in-memory localStorage, so the embed neither sees nor changes the visitor's own stick2 saves
if (EMBED && !EMBED.cfg.persist) {
  const mem = new Map();
  const store = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); },
    clear: () => mem.clear(), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
  try { Object.defineProperty(window, 'localStorage', { value: store, configurable: true }); } catch {}
}
// keyboard not an input: no keys reach the game (the embed's own buttons still work, they're clicks)
if (EMBED) for (const t of ['keydown', 'keyup']) addEventListener(t, e => {
  if (!EMBED.cfg.input.includes('keyboard') && !e.target.closest?.('#embbar, #embstate')) e.stopImmediatePropagation();
}, true);

// ---------- events out, commands in (postMessage) ----------
// every message is { stick2: EMBED_VERSION, type, ... }. Events go to the parent page with '*' (nothing in them is private);
// commands are taken only from the embedding page, the origins option, or anyone with origins=*
function embedEmit(type, data = {}) { if (EMBED && parent !== window) parent.postMessage({ stick2: EMBED_VERSION, type, ...data }, '*'); }
const embedTrusted = origin => EMBED.cfg.origins.includes('*') || EMBED.cfg.origins.includes(origin) || (!EMBED.cfg.origins.length && origin === EMBED.origin);
const embedWorld = () => app.mode === 'replay' ? rp.view : lab.cells[0]?.w;
function embedState() {
  const w = embedWorld();
  return { mode: app.mode, paused: app.paused, speed: app.speed, muted: muted(), scenario: lab.scen,
    replay: rp.reel && app.mode === 'replay' ? { frame: rp.n, frames: rp.N, branches: rp.reels.length - 1 } : null,
    branch: lab.branch ? { side: lab.branch.side, from: lab.branch.n } : null,
    fighters: w ? w.fighters.map((f, i) => ({ slot: i + 1, char: f.ch.name, hp: +f.hp.toFixed(1), ko: !!f.ko, team: f.team ?? i })) : [] };
}
const EMBED_CMDS = {
  config: m => { embedMerge(EMBED.cfg, m.config, 'postMessage'); embedTools(); embedRoster(); embedApply(); },
  play: () => { app.paused = false; },
  pause: () => { app.paused = true; },
  restart: () => { app.mode === 'replay' ? rpSeek(0) : mode().restart(); },
  scenario: m => { const n = resolveEmbedScenario(String(m.name)); if (n) { lab.scen = n; lab.playback = lab.branch = null; setMode('play'); build(); } },
  seek: m => { if (app.mode === 'replay' && rp.reel) rpSeek(Math.max(0, Math.min(rp.N, m.frame | 0))); },
  jumpIn: m => embedJumpIn(m.side === 2 ? 2 : 1),
  load: m => embedOpenReplay(m.replay),
  state: () => embedEmit('state', embedState()),
  // the host page plays P1 (input=host): press holds keys until release; tap presses for one frame
  press: m => embedKeys(m.keys, true), release: m => embedKeys(m.keys, false),
  tap: m => { embedKeys(m.keys, true); setTimeout(() => embedKeys(m.keys, false), 1000 / 60); },
};
function embedKeys(list, down) {
  if (!EMBED.cfg.input.includes('host')) throw new Error('host input is off in this embed (input=+host)');
  for (const k of [].concat(list || [])) {
    if (!FIGHT.includes(k)) throw new Error(`no key "${k}" (one of ${FIGHT.join(', ')})`);
    if (down) { if (!keys.has(k)) pressed.add(k); keys.add(k); } else keys.delete(k);
  }
}
function embedListen() {
  addEventListener('touchstart', e => { if (!e.target.closest('#embbar')) document.body.classList.toggle('embtouch'); }, { passive: true });
  addEventListener('message', e => {
    const m = e.data;
    if (!m || m.stick2 == null || e.source !== parent || !EMBED_CMDS[m.type]) return;
    if (!embedTrusted(e.origin)) return embedEmit('error', { error: `origin ${e.origin} may not send commands (the origins option)` });
    try { EMBED_CMDS[m.type](m); syncAll(); panels(); } catch (err) { embedEmit('error', { error: String(err.message || err) }); }
  });
}

// ---------- applying the config ----------
function embedApply() {
  const c = EMBED.cfg, b = document.body;
  b.classList.add('embed');
  b.classList.remove('theater'); app.theater = false; // #embed= alone means theater; here ui says what shows
  for (const u of EMBED_UI) b.classList.toggle('emb-no' + u, !c.ui.includes(u));
  b.classList.toggle('emb-clear', c.bg === 'transparent');
  b.classList.toggle('emb-notouch', !c.input.includes('touch'));
  b.classList.toggle('emb-nonet', !c.net);
  b.classList.toggle('emb-readonly', c.readonly);
  CFG.hud = c.ui.includes('hud'); CFG.timer = c.ui.includes('timer'); CFG.labels = c.ui.includes('labels');
  lab.meter = c.ui.includes('meter'); lab.inputs = c.ui.includes('inputs');
  ui.mute = c.mute; app.speed = c.speed;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.accent)) document.documentElement.style.setProperty('--emb-accent', c.accent);
  else document.documentElement.style.removeProperty('--emb-accent');
  embedSections();
  embedBar(); resize();
}
// side panel sections: only the ones named in sections (by heading, any case), after every rebuild of the panel
function embedSections() {
  const keep = EMBED.cfg.sections.map(x => x.toLowerCase());
  for (const f of document.querySelectorAll('#side .fold')) {
    const t = (f.querySelector('h3')?.firstChild?.textContent || f.querySelector('h3')?.textContent || '').trim().toLowerCase();
    f.hidden = keep.length > 0 && !keep.some(k => t === k || t.startsWith(k + ' '));
  }
}
// tabs: the ones not allowed are taken out of the top bar and setMode won't open them
function embedTools() {
  const allowed = embedToolsFor(EMBED.cfg);
  if (EMBED.cfg.replay && !allowed.includes('replay')) allowed.unshift('replay');
  if (EMBED.cfg.replay && EMBED.cfg.branch && !allowed.includes('play')) allowed.push('play'); // a jump-in plays on in the play tab
  EMBED.tools = allowed;
  EMBED.modes ??= { ...MODES }; // every tab, kept so a live config can bring one back
  for (const m of Object.keys(MODES)) delete MODES[m];
  for (const [m, t] of Object.entries(EMBED.modes)) if (allowed.includes(m) || (VIEWS[m] || []).some(v => allowed.includes(v))) MODES[m] = t;
  if (!EMBED.setMode) {
    EMBED.setMode = setMode;
    setMode = m => EMBED.setMode(EMBED.tools.includes(m) ? m : EMBED.tools.includes(app.mode) ? app.mode : EMBED.tools[0]);
    const inner = panels; panels = (...a) => { inner(...a); embedSections(); };
  }
  if (!allowed.includes(app.mode)) setMode(allowed[0]);
  buildTop();
}
// roster: everything outside the allow-list disabled (in memory: disabledChars, not setDisabled, which saves); p1/p2 fill the slots
function embedRoster() {
  const c = EMBED.cfg;
  for (const k of EMBED.offRoster || []) disabledChars.delete(k); // a live config: undo the last allow-list first
  EMBED.offRoster = c.chars.length ? Object.keys(DEFS).filter(k => !c.chars.includes(k) && !disabledChars.has(k)) : [];
  for (const k of EMBED.offRoster) disabledChars.add(k);
  const slots = c.p1 + '|' + c.p2; if (slots === EMBED.slots) return; // a live config that leaves the slots alone keeps the fight going
  EMBED.slots = slots;
  if (!c.p1 && !c.p2) return;
  const base = SCENARIOS[lab.scen === EMBED_KEY && EMBED.baseScen ? EMBED.baseScen : lab.scen]; if (!base) return;
  if (lab.scen !== EMBED_KEY) EMBED.baseScen = lab.scen;
  const chars = [...(base.chars || [null, null])];
  if (DEFS[c.p1]) chars[0] = c.p1; if (DEFS[c.p2]) chars[1] = c.p2;
  SCENARIOS[EMBED_KEY] = { ...base, chars }; lab.scen = EMBED_KEY; build();
}

// ---------- replays: open one, jump in, keep the branches ----------
async function embedReplayData(src) {
  if (typeof src === 'object') return src;
  if (src.startsWith('j:')) return JSON.parse(utf8.dec(b64urlDecode(src.slice(2))));
  if (src.startsWith('z:')) {
    const bin = b64urlDecode(src.slice(2)), bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
  }
  const u = new URL(src, location.href);
  if (u.protocol !== 'https:' && u.origin !== location.origin) throw new Error('a replay URL must be https');
  const r = await fetch(u); if (!r.ok) throw new Error(`replay: ${r.status}`);
  return r.json();
}
async function embedOpenReplay(src, at = 0, side = 0) {
  let rep;
  try { rep = await embedReplayData(src); } catch (err) { embedEmit('error', { error: 'replay: ' + err.message }); return embedCaption('The replay could not be opened.'); }
  try { rep = readReplay(rep); } catch (err) { embedEmit('error', { error: err.message }); return embedCaption('That is not a stick2 replay this page can open.'); }
  loadReel(rep, rep.scenario || 'replay'); setMode('replay'); app.paused = true;
  rpSeek(Math.min(at, rp.N));
  if (side) embedJumpIn(side); else app.paused = !EMBED.cfg.autoplay;
  syncAll(); panels(); embedEmit('replay', { frames: rp.N, version: rep.version, desync: !!rp.reel.desync });
}
function embedJumpIn(side) {
  if (!rp.reel || !EMBED.cfg.branch && !EMBED.cfg.challenge) return;
  if (app.mode !== 'replay') { if (lab.branch) keepBranch(); else return; }
  branchFrom(side); EMBED.branches++; EMBED.koSeen = false;
  embedEmit('branch', { side, from: lab.branch.n });
  embedCaption(EMBED.cfg.challenge ? `Challenge: win from here as P${side}.` : `You play P${side} from here.`);
  panels(); syncAll(); embedBar();
}
function embedBackToReplay() { if (lab.branch) keepBranch(); embedBar(); }

// ---------- the control bar, the poster, the caption line ----------
const embedEl = id => document.getElementById(id) || $('stage').appendChild(h('div', { id }));
function embedCaption(text) { const c = embedEl('embstate'); c.setAttribute('aria-live', 'polite'); c.textContent = text; c.classList.add('show'); clearTimeout(embedCaption.t); embedCaption.t = setTimeout(() => c.classList.remove('show'), 4000); }
// the full app, opened on the same fight (a replay given by URL goes along; an inline one is too long for a plain link)
function embedOpenFull() {
  const p = new URLSearchParams();
  if (EMBED.cfg.replay && !/^[jz]:/.test(EMBED.cfg.replay)) p.set('replay', EMBED.cfg.replay); else if (lab.scen !== EMBED_KEY) p.set('scenario', lab.scen);
  open(`${location.origin}${location.pathname}#${p}`, '_blank', 'noopener');
}
// a link to this embed at this moment: the replay frame and branch side, on top of the embed's own hash
function embedShare() {
  const p = new URLSearchParams(EMBED.params);
  if (app.mode === 'replay' && rp.reel) p.set('at', rp.n);
  if (lab.branch) { p.set('at', lab.branch.n); p.set('side', lab.branch.side); }
  const link = `${location.origin}${location.pathname}#${p}`;
  navigator.clipboard?.writeText(link).then(() => embedCaption('Link copied.'), () => embedCaption(link));
}
function embedBar() {
  const c = EMBED.cfg, has = k => c.controls.includes(k);
  const bar = embedEl('embbar'); bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'stick2 controls');
  const btn = (icon, label, fn, on) => { const b = button(icon, label, () => { fn(); syncAll(); embedBar(); }, 'mini'); b.setAttribute('aria-label', label); if (on) b.classList.add('on'); return b; };
  const items = [];
  if (has('play')) items.push(btn(app.paused ? ':play_arrow:' : ':pause:', app.paused ? 'Play' : 'Pause', () => { app.paused = !app.paused; embedPoster(false); }));
  if (has('restart')) items.push(btn(':restart_alt:', lab.branch ? 'Back to where you jumped in' : 'Restart', () => app.mode === 'replay' ? rpSeek(0) : mode().restart()));
  if (has('speed')) items.push(btn(`${app.speed}×`, 'Speed (click: the next one)', () => { const S = [0.5, 1, 1.5, 2]; app.speed = S[(S.indexOf(app.speed) + 1) % S.length]; }));
  if (has('mute')) items.push(btn(muted() ? ':volume_off:' : ':waves:', muted() ? 'Sound on' : 'Mute', () => { ui.mute = !muted(); }));
  if (has('jumpin') && rp.reel && (c.branch || c.challenge)) {
    if (app.mode === 'replay') items.push(btn('jump in P1', 'Play on from this frame as P1 (a new branch)', () => embedJumpIn(1)), btn('P2', 'Play on from this frame as P2 (a new branch)', () => embedJumpIn(2)));
    else if (lab.branch) items.push(btn(':history: replay', 'Back to the replay; this branch is kept', embedBackToReplay));
  }
  if (has('branches') && rp.reels.length > 1) {
    const sel = h('select', { title: 'Branches' }, rp.reels.map((r, i) => h('option', { value: i, textContent: r.name, selected: r === rp.reel })));
    sel.onchange = () => { const r = rp.reels[+sel.value]; if (lab.branch) keepBranch(); loadReel(r.rep, r.name, r); setMode('replay'); app.paused = true; panels(); syncAll(); embedBar(); };
    items.push(sel);
  }
  if (has('edit') && (c.edit || c.readonly)) items.push(btn(':edit:', 'Edit: the toolbar and side panel', () => { document.body.classList.toggle('emb-drawer'); resize(); }, document.body.classList.contains('emb-drawer')));
  if (has('share')) items.push(btn(':link:', 'Copy a link to this moment', embedShare));
  if (has('fullscreen')) items.push(btn(':theaters:', 'Fullscreen', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {})));
  if (has('open')) items.push(btn(':home:', 'Open in stick2', embedOpenFull));
  bar.replaceChildren(...items); bar.hidden = !items.length;
  const wm = embedEl('embmark'); wm.hidden = !c.watermark;
  wm.replaceChildren(h('a', { href: `${location.origin}${location.pathname}`, target: '_blank', rel: 'noopener', textContent: 'stick2' }));
}
// autoplay off: a still first frame under a play button, until clicked (the fight is built, just not running)
function embedPoster(on) {
  const p = embedEl('embposter'); p.hidden = !on;
  if (!on) return;
  app.paused = true;
  p.style.backgroundImage = /^https:\/\//.test(EMBED.cfg.poster) ? `url("${encodeURI(EMBED.cfg.poster)}")` : '';
  p.replaceChildren(h('button', { cls: 'embplay', title: 'Play', textContent: '▶' }));
  p.onclick = () => { embedPoster(false); app.paused = false; embedBar(); };
}
// round results: KO (and a challenge won or lost) as a caption and an event
function embedWatch() {
  setInterval(() => {
    // the bar follows the state (the tab, paused, a branch, the reels, speed, sound) without a hook in each place that changes it
    const sig = [app.mode, app.paused, !!lab.branch, rp.reels.length, rp.reel?.name, app.speed, muted()].join('|');
    if (sig !== EMBED.sig) { EMBED.sig = sig; embedBar(); }
    const w = embedWorld(); if (!w || app.mode === 'replay') return;
    if (!w.koT) { EMBED.koSeen = false; return; }
    if (EMBED.koSeen) return; EMBED.koSeen = true;
    const standing = w.fighters.filter(f => !f.ko), team = standing[0]?.team ?? (standing[0] === w.a ? 0 : 1);
    const winner = standing.length ? (standing.includes(w.a) ? 1 : 2) : 0;
    embedEmit('ko', { winner, team, frame: w.log?.length ?? 0 });
    if (EMBED.cfg.challenge && lab.branch) {
      const won = winner === lab.branch.side;
      embedEmit('challenge', { won, side: lab.branch.side, from: lab.branch.n });
      embedCaption(won ? 'Challenge beaten!' : 'Not this time: restart to try again.');
    } else embedCaption(winner ? `K.O. P${winner} wins.` : 'K.O.');
  }, 100);
}
// view only (readonly): every edit goes through snapshot() (studio.js) for undo before it changes anything, so refusing there
// stops character, settings, replay, footage, movie and scene edits alike; the refusal is caught below, not reported as a crash
class EmbedViewOnly extends Error {}
function embedViewOnly() {
  const inner = snapshot;
  snapshot = (...a) => {
    if (!EMBED.cfg.readonly) return inner(...a);
    embedCaption('View only: this embed can\'t be changed.');
    throw new EmbedViewOnly('view only');
  };
  addEventListener('error', e => { if (e.error instanceof EmbedViewOnly) e.preventDefault(); });
  addEventListener('unhandledrejection', e => { if (e.reason instanceof EmbedViewOnly) e.preventDefault(); });
}
function embedStart() {
  const c = EMBED.cfg;
  embedViewOnly();
  if (!c.net) { netJoinFromLink = () => embedEmit('error', { error: 'netplay is off in this embed (net=1)' }); netServerFromLink = netJoinFromLink; }
  if (!c.ui.includes('palette')) openPalette = () => {};
  if (!c.ui.includes('welcome')) openWelcome = () => {};
  embedTools();
  const n = resolveEmbedScenario(c.scenario);
  if (n) { lab.scen = n; lab.playback = null; }
  readHash(); // #tool=, #char=… still work inside an embed (the tabs allowed)
  setMode(EMBED.tools[0] === 'replay' && !c.replay ? EMBED.tools[1] || 'play' : EMBED.tools[0]); build();
  embedRoster(); embedApply(); embedListen(); embedWatch();
  if (c.replay) embedOpenReplay(c.replay, c.at, +c.side);
  else if (!c.autoplay) embedPoster(true);
  if (c.focus === 'auto') focus();
  panels(); syncAll();
  embedEmit('ready', { version: EMBED_VERSION, engine: ENGINE_VERSION, build: typeof BUILD !== 'undefined' ? BUILD.commit : null, warnings: EMBED.warnings, tools: EMBED.tools });
}
// ---------- from the full app: the builder, started on what's open now ----------
// the builder's tab opens first, while the click still counts as one (a popup opened after an await is blocked), then gets its link
async function embedThis() {
  const win = open('about:blank', '_blank');
  if (!win) return;
  win.opener = null;
  const cfg = embedDefaults(), tab = app.mode;
  if (!['play', 'replay', 'gallery', 'grid'].includes(tab)) { cfg.edit = true; cfg.ui = ['menubar', 'toolbar', 'side', 'hud', 'timer']; }
  cfg.tools = tab === 'play' ? ['play'] : [tab, 'play'];
  if (SCENARIOS[lab.scen] && lab.scen !== EMBED_KEY) cfg.scenario = lab.scen;
  if (tab === 'replay' && rp.reel) {
    cfg.controls = [...cfg.controls, 'jumpin', 'branches']; cfg.at = rp.n;
    const z = await embedPackReplay(rp.reel.rep);
    if (z.length < 24000) cfg.replay = z; // a longer one would make a link too long to paste: add a replay URL in the builder
  }
  win.location = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}embed.html#${embedHash(cfg)}`;
}
// a replay as a z: value (deflate-raw, base64url), about 6× smaller than its JSON
async function embedPackReplay(rep) {
  const bytes = new Uint8Array(await new Response(new Blob([JSON.stringify(rep)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return 'z:' + b64urlEncode(bin);
}
