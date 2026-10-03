'use strict';
// ---------- tracker: a simple step sequencer that plays existing sounds on a beat, like a tiny drum machine ----------
// a track: { name, bpm, steps, rows: [{ sound, cells: [bool, …] }] }; saved the same way as sounds/looks (myStore -> live table)
const TRACK_STORE = 'stick2.tracks';
const myTracks = (() => { try { return JSON.parse(localStorage.getItem(TRACK_STORE)) || {}; } catch { return {}; } })();
function saveTracks() { try { localStorage.setItem(TRACK_STORE, JSON.stringify(myTracks)); } catch {} }
function newRow(sound = Object.keys(SOUNDS)[0], steps = 16) { return { sound, cells: Array(steps).fill(false) }; }
function saveTrack(name, t) { myTracks[name] = t; saveTracks(); }
function deleteTrack(name) { delete myTracks[name]; if (tracker.name === name) stopTrack(); saveTracks(); }
function renameTrack(from, to) { if (!myTracks[from] || to === from || myTracks[to]) return; myTracks[to] = myTracks[from]; delete myTracks[from];
  if (tracker.name === from) tracker.name = to; saveTracks(); }
function duplicateTrack(from) { let n = 1; while (myTracks[from + n]) n++; const name = from + n; saveTrack(name, clone(myTracks[from])); return name; }
// ---------- playback: a lookahead scheduler on the AudioContext's own clock (not setInterval) so steps stay sample-tight ----------
const tracker = { name: null, playing: false, startAt: 0, nextStep: 0, nextTime: 0, timer: null };
const STEP_LOOKAHEAD = 0.1; // schedule this far ahead of the audio clock, each tick
const stepDur = t => 60 / t.bpm / 4; // a step is a 16th note at the track's bpm
function playTrack(name) {
  stopTrack();
  const c = snd.ctx ??= new AudioContext(); if (c.state === 'suspended') c.resume();
  tracker.name = name; tracker.playing = true; tracker.startAt = c.currentTime + 0.05; tracker.nextStep = 0; tracker.nextTime = tracker.startAt;
  tracker.timer = setInterval(() => {
    const t = myTracks[tracker.name]; if (!t) return stopTrack();
    while (tracker.nextTime < c.currentTime + STEP_LOOKAHEAD) {
      if (!muted()) for (const row of t.rows) if (row.cells[tracker.nextStep % t.steps] && SOUNDS[row.sound]) synthSound(c, tracker.nextTime, SOUNDS[row.sound], c.destination);
      tracker.nextTime += stepDur(t); tracker.nextStep++;
    }
  }, 25);
}
function stopTrack() { if (tracker.timer) clearInterval(tracker.timer); tracker.timer = null; tracker.playing = false; tracker.name = null; }
// the step audibly playing right now (for the UI's highlight), from the clock — not nextStep, which runs ahead of it
function curStep(t) {
  if (!tracker.playing || !snd.ctx) return -1;
  const el = snd.ctx.currentTime - tracker.startAt; if (el < 0) return -1;
  return Math.floor(el / stepDur(t)) % t.steps;
}
