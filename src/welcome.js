'use strict';
// ---------- welcome: a landing screen pointing at the app's main activities ----------
const WELCOME_ACTIVITIES = [
  { m: 'character', icon: 'accessibility_new', title: 'Build a character', info: 'Drag joints, add limbs, tune bones — the preview fights with it live.' },
  { m: 'animate', icon: 'timeline', title: 'Animate moves', info: 'Pose keyframes by dragging joints, retime them on the timeline, add springs and hit stop.' },
  { m: 'replay', icon: 'history', title: 'Edit a replay', info: 'A recorded fight as a timeline of colour-coded events: filter, find a moment, go there.' },
  { m: 'experiment', icon: 'science', title: 'Experiment', info: 'Nine copies of one fight side by side, each with different settings, to compare at a glance.' },
  { m: 'grid', icon: 'grid_view', title: 'Browse everything', info: 'Characters, moves, scenarios, sounds, looks and tracks as searchable tiles.' },
  { m: 'fx', icon: 'auto_awesome', title: 'Tune fx & sound', info: 'Every fx look and every sound, synthesized live, no files — tune and preview them.' },
  { m: 'play', icon: 'sports_kabaddi', title: 'Fight', info: 'Pick who fights: you, the AI, scripted combos, crowds.' },
];
function welcomePanel() {
  return h('div', { cls: 'mtable' },
    h('h2', { textContent: 'stick2' }),
    h('p', { cls: 'note', textContent: 'A stick-figure fighting game sandbox. Pick where to start:' }),
    h('div', { cls: 'cards', style: 'justify-content:flex-start' },
      WELCOME_ACTIVITIES.map(a => h('button', { cls: 'card wide', style: 'flex:0 0 220px;align-items:flex-start;text-align:left;gap:4px;display:block',
        tip: MODES[a.m], onclick: () => setMode(a.m) },
        h('div', {}, icon(a.icon), h('b', { textContent: ' ' + a.title })),
        h('div', { cls: 'note', textContent: a.info })))));
}
const welcomeMode = { enter() {}, restart() {}, worlds: () => [], render: clear, ctxBar: () => [], side: () => [], overlay: () => [welcomePanel()],
  open: [], hint: () => 'pick an activity to get started' };
