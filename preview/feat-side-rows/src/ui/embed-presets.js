'use strict';
// generated from profiles/embeds/*.json by tools/dev/embed-presets.js (npm run embed-presets): edit those, not this
const EMBED_PRESETS = {
 "arcade": {
  "tip": "You vs the AI with the HUD and timer, click to play, restart and fullscreen. The default kind of embed.",
  "cfg": {
   "scenario": "you vs ai",
   "ui": [
    "hud",
    "timer"
   ],
   "controls": [
    "play",
    "restart",
    "mute",
    "fullscreen",
    "open"
   ]
  }
 },
 "challenge": {
  "tip": "Drop the visitor into a replay at a frame, on one side, to win the round from there. Add replay=<url>&at=<frame>&side=1.",
  "cfg": {
   "tools": [
    "replay",
    "play"
   ],
   "ui": [
    "hud",
    "timer"
   ],
   "controls": [
    "restart",
    "mute",
    "share",
    "open"
   ],
   "challenge": true,
   "side": "1"
  }
 },
 "demo": {
  "tip": "A passive AI vs AI loop for a landing page: no input, no keys taken, only play/pause and mute.",
  "cfg": {
   "scenario": "ai vs ai",
   "ui": [
    "hud"
   ],
   "controls": [
    "play",
    "mute"
   ],
   "input": [],
   "watermark": true
  }
 },
 "editor-lite": {
  "tip": "A small editor: fight, character and animate tabs with the toolbar and side panel; edits stay in memory.",
  "cfg": {
   "tools": [
    "play",
    "character",
    "animate",
    "gallery"
   ],
   "edit": true,
   "ui": [
    "menubar",
    "toolbar",
    "side",
    "hud",
    "timer",
    "palette"
   ],
   "controls": [
    "play",
    "restart",
    "mute",
    "fullscreen",
    "open",
    "edit"
   ]
  }
 },
 "full": {
  "tip": "The whole app in a frame, saving to the visitor's own stick2 storage. Use for a docs page, not a third-party site.",
  "cfg": {
   "tools": [
    "play",
    "replay",
    "grid",
    "experiment",
    "gallery",
    "character",
    "tests",
    "animate",
    "fx",
    "sounds",
    "tracker",
    "props",
    "weapons"
   ],
   "edit": true,
   "persist": true,
   "net": true,
   "mute": false,
   "ui": [
    "menubar",
    "toolbar",
    "side",
    "help",
    "palette",
    "hud",
    "timer",
    "labels",
    "meter",
    "inputs"
   ],
   "controls": [],
   "focus": "auto"
  }
 },
 "replay": {
  "tip": "Watch a replay with its timeline; scrub anywhere and jump in as P1 or P2. Every jump-in is a branch you can return to. Add replay=<url>.",
  "cfg": {
   "tools": [
    "replay",
    "play"
   ],
   "ui": [
    "hud",
    "timer",
    "toolbar"
   ],
   "controls": [
    "play",
    "restart",
    "speed",
    "mute",
    "jumpin",
    "branches",
    "fullscreen",
    "share",
    "open"
   ],
   "branch": true
  }
 },
 "showcase": {
  "tip": "The character gallery as a looping showcase: every move and movement of one character, nothing to click.",
  "cfg": {
   "tools": [
    "gallery"
   ],
   "ui": [],
   "controls": [
    "play",
    "fullscreen",
    "open"
   ],
   "input": []
  }
 }
};
