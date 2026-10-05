'use strict';
// ---------- app: mode buttons, transport, frame loop, keyboard and mouse ----------
const app = { mode: 'play', paused: false, stepOnce: false, speed: 1, loop: true, scrub: false, scrubF: null, hintUntil: 0, fps: 0, frameMs: 0, worstMs: 0, theater: false };
// theater mode (play): no toolbars, no side panel, just the fight — for streaming or recording. Tries for fullscreen too
// (best-effort: browsers can refuse outside a direct click, automated ones usually do); Esc or the toggle again leaves both
function setTheater(v) {
  app.theater = v; document.body.classList.toggle('theater', v); resize();
  if (v) document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
const MODES = {
  play: 'Fight in one arena. Pick who fights: you, the AI, scripted combos, crowds.',
  grid: 'Browse and search characters, moves, scenarios, sounds, looks and tracks as tiles. For characters and moves, pick which variables show on each one (an autocomplete over every documented stat and move property). Click a tile to open it where it\'s edited.',
  experiment: 'Nine copies of one fight side by side, each with different settings (or a bred variation, or two settings compared). Click a cell to focus it.',
  gallery: 'Every move of the character looping, with its keyframe timeline and frame data, then every movement (walk, run, dash, jump, flip, guard, hit, knockdown, dizzy…) with its speed and height. Only the cells on screen run (scroll for more).',
  impact: 'Hit reactions and falls: standard hits on the character side by side; drag on a body to strike it anywhere.',
  character: 'Build the fighter: drag joints, add limbs, tune bones. The preview fights with it live.',
  tests: 'Every move tried against every target: standing, crouching, guarding high and low, in the air, on the floor, dizzy; facing it or turned away; near and far; against the character itself or every one. Red cells did not do what they should (hover for why); click one to watch it and open it in animate to fix it. Your scenarios are played through too.',
  animate: 'Pose keyframes by dragging joints, retime them on the timeline, and watch the move with springs and hit stop.',
  fx: 'Every fx look (built-in and custom), as a gallery of tiles: open one to tune it (sliders, colour, randomize), preview it on a character or a plain segment, and compare values of two variables in a grid.',
  sounds: 'Every sound (built-in and custom), synthesized live, no files: a slider per parameter, a test button; duplicate a built-in to tune your own.',
  tracker: 'A simple step sequencer built from your own sounds: rows of sounds, a grid of beats, play it as a loop at a tempo.',
  replay: 'A recorded fight (the play fight or a replay file) as a timeline of colour-coded events and an event table: filter by type, find a moment, go there.',
};
const mode = () => ({ character: creatorMode, animate: animMode, tests: testMode, replay: replayMode, fx: fxMode, sounds: soundsMode, tracker: trackerMode, grid: gridMode })[app.mode] || labMode;
// the top bar's tabs: impact is a view of experiment, gallery and tests views of animate, sounds and tracker of fx, picked first in their toolbar
const VIEWS = { experiment: ['experiment', 'impact'], animate: ['animate', 'gallery', 'tests'], fx: ['fx', 'sounds', 'tracker'] };
const MODE_ICONS = { play: 'sports_kabaddi', grid: 'grid_view', experiment: 'science', gallery: 'animation', impact: 'crisis_alert', tests: 'fact_check', character: 'accessibility_new', animate: 'timeline', fx: 'auto_awesome', sounds: 'waves', tracker: 'view_module', replay: 'history' };
const tabOf = m => Object.keys(VIEWS).find(t => VIEWS[t].includes(m)) || m;

function setMode(m) {
  app.mode = m; closePop(); cursor('default');
  if (!ui.seen[m]) { ui.seen[m] = true; saveUi(); app.hintUntil = performance.now() + 8000; } // the first visit shows the hints a moment
  mode().enter(m);
  layApply(); // the tab's layout: side panel, then the panels
}
// the tab's toolbar groups and side sections, less the ones its layout hides; app.parts lists them all (for the layout popup)
function panels() {
  const views = VIEWS[tabOf(app.mode)];
  app.shows = [];
  const ctx = layOrder('ctx', [...views ? [grp('view', 'What this tab shows', seg(views, () => app.mode, setMode, MODES, m => `:${MODE_ICONS[m]}: ${{ animate: 'editor' }[m] || m}`))] : [],
    ...transportCtx(), ...mode().ctxBar()], el => el.dataset.part);
  $('side').classList.remove('searching');
  const side = layOrder('side', folds(mode().side().filter(Boolean), app.mode, mode().open || []), s => s.fname);
  app.parts = { ctx: [...new Set(ctx.map(el => el.dataset.part).filter(Boolean))], side: side.map(s => s.fname).filter(Boolean) };
  $('ctx').replaceChildren(...ctx.filter(el => !el.dataset.part || layShown('ctx:' + el.dataset.part)));
  // a toolbar group moves by dragging its name onto another group (it goes before that one); the order is kept in the tab's layout
  for (const g of $('ctx').querySelectorAll('.grp[data-part]')) {
    const gl = g.querySelector('.gl');
    gl.draggable = true; gl.dataset.tip = `${g.dataset.tip || g.dataset.part} · drag the name onto another group to move this one there`;
    gl.ondragstart = e => { e.dataTransfer.setData('text/plain', g.dataset.part); g.classList.add('dragging'); };
    gl.ondragend = () => g.classList.remove('dragging');
    g.ondragover = e => { e.preventDefault(); g.classList.add('dropto'); };
    g.ondragleave = () => g.classList.remove('dropto');
    g.ondrop = e => { e.preventDefault(); const p = e.dataTransfer.getData('text/plain'); if (p && p !== g.dataset.part) layMove('ctx', p, g.dataset.part); };
  }
  $('side').replaceChildren(...side.filter(s => !s.fname || layShown('side:' + s.fname)));
  $('over').replaceChildren(...mode().overlay?.() || []); // controls placed over the canvas
  syncAll();
}
function restart() { mode().restart(); }
// rewind every fight n frames and pause there
function rewind(n) { app.paused = true; app.scrub = false; if (mode().rewind) return mode().rewind(n); for (const w of mode().worlds()) w.rewind(n); }
function toggleHints() { ui.hints = !ui.hints; saveUi(); }
// factory reset: asks, then deletes everything this app keeps in the browser (characters, settings, keys and macros, layout) and reloads as on a first visit
function reload() { location.reload(); }
function factoryReset(anchor = $('global')) {
  const n = Object.keys(edited()).length;
  popup(anchor, h('b', { textContent: 'factory reset' }),
    h('p', { textContent: `Delete all local data: ${n ? `${n} edited or custom character${n > 1 ? 's' : ''} (export them first to keep them), ` : ''}settings, keys and macros, layout and hints. The page reloads as on a first visit. This cannot be undone.` }),
    h('div', { cls: 'bar' }, button(':delete: delete everything', 'Delete every saved stick2 setting in this browser and reload', () => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('stick2.')) localStorage.removeItem(k);
      reload();
    }), button(':close: cancel', 'Close this without deleting anything', closePop)));
}
function togglePanel() { lay().hide.side = !lay().hide.side; saveLay(); layApply(); }

// help under the rebindable keys (P = punch, K = kick, directions as on the numpad: 2 down, 3 down-forward, 6 forward…)
const KEYS = [
  ['combos', 'chains: P,P,P · K,K · P,K · P,P,K · run+P dash punch · air P/K, air P,K\ndirections × P / K: 6P elbow · 6K push kick · 8P hammer (overhead) · 8K turn kick (2D: ↑ with P / K together) · 4K fade kick (steps back) · 2P launcher · 2K sweep · 1P crouch jab · 3P body blow · 1K back sweep · 3K low kick\nair: j.8P upper · j.8K flip kick (launch) · j.2P hammer (spikes, bounces) · j.2K dive kick · j.S air spin\nspecials (cancel normals that hit): 236P rush · 623P rising · 214K spin · 236K stomp (hits a fighter on the floor) · 214P charge (unblockable) · 623K rising kick (invincible start)\n66 dash · 44 back dash · 66 and hold: run'],
  ['guard', 'hold L: guard, front only (not from behind) · ↓+L low guard · tap L just before a hit: parry · highs pass over a crouching fighter\nU special: S spin · → S rush · ↑ S rising · ↓ S stomp · ← S catch (counters a strike)\nJ+L throw, K+L second throw (P+G breaks them) · U+L (with a direction): switch stance · L while knocked flying: recover in the air · L just before landing: tech'],
  ['2.5D', 'plane setting: 2D (↑ jumps) / lanes / belt · 2D and 2.5D have separate movesets (input in animate) · 2.5D: ↑ ↓ move in depth (lanes: double tap = sidestep), 9P headbutt · 7P backfist · 7K crescent (overhead) · 9K flying knee · Space jumps in every plane, with ← / → a ninja flip'],
  ['fixed', '⌘K find anything · ⌘Z undo · ⇧⌘Z redo (character and moves) · Esc back / close · click a panel heading: fold it · ? hints · in a fight (play) a shortcut letter takes ⇧ (⇧P pause, ⇧R restart, ⇧H panel); in the editor modes the plain letter, and the fight keys do nothing'],
  ['experiment', 'click a cell: focus it and use its settings, ⌘Z undoes (breed / attacks: breed around it) · Shift+click: only focus'],
  ['character', 'drag a joint: length + angle · Shift+drag: angle only · drag the hip (square): move the waist over the feet'],
  ['animate', 'drag a joint: IK · Alt+drag: rotate one bone · timeline: drag a key to reorder, its edge to retime, double-click to split · Delete removes the key'],
  ['replay', 'timeline: click or drag to go to a moment · click an event to select it · events table (panels): fuzzy filter, sort, click a row to go there · the types in the toolbar show and hide lanes and rows'],
];
// playback and speed: present on every mode's toolbar (the main loop reads app.paused/speed/scrub regardless of mode),
// rebuilt each panels() call like any other toolbar group so it's draggable and hideable the same way
function transportCtx() {
  const pause = button('', 'Pause or resume the fight(s)' + keyTip('pause'), () => { app.paused = !app.paused; }, 'playbtn');
  reg(pause, () => { setRich(pause, app.paused ? ':play_arrow:' : ':pause:'); pause.classList.toggle('on', app.paused); });
  return [
    grp('playback', 'Playback', pause,
      button(':fast_rewind:', 'Rewind one second: every fight is restored from its last checkpoint and replayed with the same inputs, so your own and the AI\'s fights rewind too; play on from there to try something else' + keyTip('rewind'), () => rewind(60)),
      button(':skip_previous:', 'Back one frame and pause there' + keyTip('stepBack'), () => rewind(1)),
      button(':skip_next:', 'Step: advance one 60 fps frame' + keyTip('step'), () => { app.paused = app.stepOnce = true; }),
      button(':restart_alt:', 'Restart the fight(s) from the beginning' + keyTip('restart'), restart)),
    grp('speed', 'Speed and time', seg([1, 0.5, 0.25, 0.1], () => app.speed, v => { app.speed = v; },
      { 1: 'Real time', 0.5: 'Half speed', 0.25: 'Quarter speed', 0.1: 'One tenth: study single frames' }, v => ({ 1: '1×', 0.5: '½', 0.25: '¼', 0.1: '⅒' })[v]),
      toggle(':mouse:', 'Scrub: mouse left/right over the view sets the time: every fight is re-simulated to that moment' + keyTip('scrub'), () => app.scrub, v => { app.scrub = v; app.scrubF = null; }),
      toggle(':repeat:', 'Loop: scripted fights restart when their period ends; off = stop at the end', () => app.loop, v => {
        app.loop = v;
        for (const w of mode().worlds()) { w.loop = v; if (v && w.done) w.reset(); }
      })),
  ];
}
function buildTop() {
  const tabs = Object.keys(MODES).filter(m => tabOf(m) === m);
  $('modes').replaceChildren(seg(tabs, () => tabOf(app.mode), m => tabOf(app.mode) !== m && setMode(m),
    Object.fromEntries(tabs.map(m => [m, MODES[m] + (VIEWS[m] ? ` Also: ${VIEWS[m].slice(1).map(v => v + ': ' + MODES[v]).join(' ')}` : '')])), m => `:${MODE_ICONS[m]}: ${m}`));
  const soundBtn = button('', 'Sound: whooshes, hits and blocks in play and in the animate preview, synthesized live (no sound files); off by default in automated browsers', toggleMute, 'tog');
  reg(soundBtn, () => { soundBtn.classList.toggle('on', !muted()); setRich(soundBtn, muted() ? ':volume_off:' : ':waves:'); });
  $('global').replaceChildren(
    grp('edit', 'Edit history', button(':undo:', 'Undo the last edit: character, moves or settings (⌘Z)', undo), button(':redo:', 'Redo the last undone edit (⇧⌘Z)', redo)),
    clipGroup(),
    grp('replay', 'Edit the play fight in the replay tab, or stop a loaded replay file (export / import, in files) and return to the live fight',
      button(':history:', 'Edit the play fight in the replay tab: its events on a timeline and in a table', reelFromPlay), stopReplayButton()),
    grp('files', 'The character, the settings, everything, or this play fight as a replay, as JSON', button(':download: export :expand_more:', 'Export to a file: the character, the settings, everything, or this play fight as a replay', fileMenu('export', exportFile, replayExportItem())),
      button(':upload: import :expand_more:', 'Import from a file: a character, settings, everything, or a replay to play back', fileMenu('import', importFile,
        replayImportItem(), button('compare…', 'Compare settings: the current ones against a settings or everything file, setting by setting (grid tab)', compareFile)))),
    grp('layout', 'Layout and keys', button(':search:', 'Find anything (⌘K): a mode, a toolbar tool, an action, a table (moves, inputs, combos, bones), a character, a move or a setting', openPalette),
      button(':view_sidebar:', 'Panel: show / hide the side panel (remembered per tab)' + keyTip('panel'), togglePanel),
      button(':view_module:', LAY_TIP, layoutPanel),
      button(':zoom_in:', 'Interface scale: the whole page bigger or smaller (not the fight itself, which always fills its own space)', (e, b) => popup(b,
        slider('scale', { min: 0.6, max: 1.8, step: 0.05 }, () => ui.scale, setUiScale, 'The whole interface, zoomed'))),
      button(':keyboard:', 'Keys: rebind any action, set up macros, and help', keysPanel),
      button(':ssid_chart:', 'Debug: ghost, boxes, hud, labels and the scope bone, the build and engine version, frame rate and the shown fight\'s state (copy for a bug report), reset settings, factory reset, and the monitor', debugPanel),
      button(':info:', 'Docs: how everything works, with live demo fights, and every setting, move flag, input and key explained; searchable (also in ⌘K)', () => openDocs()),
      toggle(':help:', 'Hints: the line of mouse and key help under the view and the frame meter\'s colour legend; off, they show for a few seconds on the first visit to each mode (?)', () => ui.hints, toggleHints),
      soundBtn, button(':bug_report:', 'Report a bug: shows the report (build, settings changed from default, the shown fight), to copy and paste into a new GitHub issue', (e, b) => reportBug(b), 'bugbtn')));
}

function resize() {
  dpr = (devicePixelRatio || 1) * (ui.scale || 1); // the interface scale zooms clientWidth down/up too; keep the canvas crisp at any scale
  const st = $('stage');
  canvas.width = st.clientWidth * dpr; canvas.height = st.clientHeight * dpr;
}

// a big pause sign over the running preview, so a stopped game never looks frozen by mistake
function drawPaused(r) {
  const cx = r.x + r.w / 2, cy = r.y + r.h * 0.3, s = Math.min(r.w, r.h) * 0.06;
  ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = '#222';
  ctx.fillRect(cx - s * 1.1, cy - s * 1.4, s * 0.75, s * 2.8); ctx.fillRect(cx + s * 0.35, cy - s * 1.4, s * 0.75, s * 2.8);
  ctx.font = `bold ${s * 1.1}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'center'; ctx.fillText('PAUSED', cx, cy + s * 3);
  ctx.restore();
}
let last = performance.now();
const perf = { t0: last, frames: 0, worst: 0 }; // frames per second and the slowest frame, for the debug popup
function frame(now) {
  const raw = Math.min(0.05, (now - last) / 1000);
  perf.frames++; perf.worst = Math.max(perf.worst, now - last);
  if (now - perf.t0 >= 1000) { Object.assign(app, { fps: perf.frames, worstMs: perf.worst, frameMs: (now - perf.t0) / perf.frames }); Object.assign(perf, { t0: now, frames: 0, worst: 0 }); }
  last = now;
  const inp = readInput(), ran = !app.scrub && (!app.paused || app.stepOnce);
  if (app.scrub) { if (app.scrubF !== null) scrub(app.scrubF); }
  else if (ran) {
    const dt = app.stepOnce ? 1 / 60 : raw * app.speed;
    mode().tick?.(dt);
    for (const w of mode().worlds()) { w.advance(dt, inp); w.scrubN = undefined; }
    app.stepOnce = false;
  }
  mode().render(); clipCapture(now, ran); drawScope(); drawDebug();
  if (app.paused && !app.scrub) drawPaused(mode().preview?.() || { x: 0, y: 0, w: canvas.width, h: canvas.height });
  const help = $('help');
  help.hidden = !ui.hints && now > app.hintUntil;
  if (!help.hidden) setRich(help, mode().hint());
  requestAnimationFrame(frame);
}

// scrub: f in [0, 1] across the canvas = time through each fight's period; worlds are deterministic, so
// going forward just advances, going back replays from the start
function scrub(f) {
  app.scrubF = null;
  if (mode().scrub) return mode().scrub(f);
  for (const w of mode().worlds()) {
    const n = Math.round(f * (w.scen.period || 4) * 60);
    if (w.scrubN === undefined || n < w.scrubN) { w.reset(); w.scrubN = 0; }
    for (; w.scrubN < n; w.scrubN++) w.advance(1 / 60, NOIN);
  }
}

// ---------- input ----------
const keys = new Set(), pressed = new Set();
const FIGHT = ['left', 'right', 'up', 'down', 'hop', 'punch', 'kick', 'special', 'guard'];
const fightKey = code => FIGHT.find(a => keymap[a].some(k => k === code || k.endsWith('+' + code)));
const SHORTCUTS = {
  pause: () => { app.paused = !app.paused; },
  step: () => { app.paused = app.stepOnce = true; },
  rewind: () => rewind(60), stepBack: () => rewind(1),
  restart,
  panel: togglePanel, hints: toggleHints,
  ghost: () => setDisplay('ghost', !CFG.ghost),
  boxes: () => setDisplay('boxes', !CFG.boxes),
  scrub: () => { app.scrub = !app.scrub; app.scrubF = null; },
  clip: saveLast, record: toggleRecord,
  theater: () => setTheater(!app.theater),
  ...Object.fromEntries(Object.keys(MODES).map(m => [m, () => setMode(m)])),
};
addEventListener('keydown', e => { if (captureKey(e)) e.stopImmediatePropagation(); }, true); // rebinding a key
addEventListener('keydown', e => {
  if (e.target.closest?.('input, select, textarea, [contenteditable]')) return; // typing, or a focused slider: the keys are its own
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK') { e.preventDefault(); openPalette(); return; }
  if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); e.shiftKey || e.code === 'KeyY' ? redo() : undo(); return; }
  const a = act(e), mod = e.metaKey || e.ctrlKey;
  if (mode().key?.(e, a)) { e.preventDefault(); syncAll(); return; }
  if (e.code === 'Escape' && !mod && app.theater) { setTheater(false); return; }
  if (e.code === 'Escape' && !mod && stageOpen()) { closeStage(); return; }
  if (!mod && SHORTCUTS[a]) { SHORTCUTS[a](); syncAll(); return; }
  if (!inFight()) return; // the editor modes: no fighter is yours, the fight keys and macros do nothing
  const m = !mod && macroFor(e);
  if (m) { e.preventDefault(); if (!e.repeat) runMacro(m); return; }
  const f = FIGHT.includes(a) ? a : fightKey(e.code);
  if (!f) return;
  e.preventDefault();
  if (!e.repeat) pressed.add(f);
  keys.add(f);
});
// a button or slider clicked with the mouse lets go of focus, so Space / Enter / arrows go to the fight, not to it again
addEventListener('click', e => { if (e.detail) e.target.closest?.('button')?.blur(); });
addEventListener('pointerup', e => { if (e.target.matches?.('input[type=range]')) e.target.blur(); });
addEventListener('keyup', e => { const f = fightKey(e.code); if (f) keys.delete(f); });
addEventListener('blur', () => keys.clear());
function readInput() {
  const i = { left: keys.has('left'), right: keys.has('right'), up: keys.has('up'), down: keys.has('down'), guard: keys.has('guard'),
    hop: pressed.has('hop'), punch: pressed.has('punch'), kick: pressed.has('kick'), special: pressed.has('special'),
    punchHeld: keys.has('punch'), kickHeld: keys.has('kick'), specialHeld: keys.has('special') };
  pressed.clear(); // edges are consumed by the first substep only
  return i;
}
// canvas mouse in device px; drags keep reporting after leaving the canvas
const at = e => { const b = canvas.getBoundingClientRect(); return [(e.clientX - b.left) * dpr, (e.clientY - b.top) * dpr]; };
let down = false, splitting = false;
// the boundary between an editor and its preview (modes with split: animate, character): drag it to resize
const nearSplit = x => mode().split?.() && Math.abs(x - splitX()) < 5 * dpr;
canvas.addEventListener('mousedown', e => { if (nearSplit(at(e)[0])) { splitting = true; return; } down = true; mode().mouse?.('down', ...at(e), e); syncAll(); });
addEventListener('mousemove', e => {
  if (splitting) { (lay().size ??= {}).split = clamp(at(e)[0] / canvas.width, SPLIT[0], SPLIT[2]); return; }
  if (e.target === canvas) [clip.mx, clip.my] = at(e); // the clip films the cell under the mouse
  if (app.scrub && e.target === canvas) app.scrubF = clamp(at(e)[0] / canvas.width, 0, 1);
  else if (down || e.target === canvas) mode().mouse?.('move', ...at(e), e);
  if (!down && e.target === canvas && nearSplit(at(e)[0])) cursor('col-resize');
});
canvas.addEventListener('wheel', e => { if (mode().wheel?.(e.deltaY, e)) e.preventDefault(); }, { passive: false });
addEventListener('mouseup', e => { if (splitting) { splitting = false; saveLay(); return; } if (!down) return; down = false; mode().mouse?.('up', ...at(e), e); syncAll(); });

layInit();
buildTop();
setMode('play');
readHash();
new ResizeObserver(resize).observe($('stage'));
resize();
requestAnimationFrame(frame);
