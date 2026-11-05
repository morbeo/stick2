'use strict';
// ---------- panel and mode state: which tab a mode belongs to and which stage panel a tab shows ----------
// plain data and pure rules, no DOM: app.js (modes), layout.js (the panel kept in a tab's layout) and the editors all go through
// these, so a mode's home panel or a view of another tab is decided in one place (it used to be spread over app.js, layout.js and creator.js)
// the top bar's tabs: gallery and tests are views of animate, sounds/tracker/props/weapons of fx, picked first in their toolbar
// (impact used to be a view of experiment; it is now one of its kinds, alongside sweep/breed/attacks/compare — see BREED_TIPS)
const VIEWS = { animate: ['animate', 'gallery', 'tests'], fx: ['fx', 'sounds', 'tracker', 'props', 'weapons'] };
const tabOf = m => Object.keys(VIEWS).find(t => VIEWS[t].includes(m)) || m;
// a tab's state s keeps its open panel in s.panel: undefined = never set (the tab's home panel shows), null = none
const panelOpen = s => s.panel;
// the first look at a tab with a home panel (character: bones) opens it
function panelInit(s, home) { if (s.panel === undefined && home) s.panel = home; return s.panel; }
// the panel after a click on name (null: close). Closing goes back to the home panel, closing the home panel leaves none,
// so a look at combos doesn't lose the bones
const panelNext = (cur, name, home) => name || (home && cur !== home ? home : null);
function panelSet(s, name) { s.panel = name; return name; }
