'use strict';
// ---------- sound: every effect synthesized with WebAudio (no files); never part of the simulation ----------
// the live fight calls playSound through its world's sfx hook (World.sound); muted by default when the browser is automated
const snd = { ctx: null, noise: null };
const muted = () => ui.mute ?? !!navigator.webdriver;
function toggleMute() { ui.mute = !muted(); saveUi(); }
// a sound: a noise layer (filtered white noise, swept, with a q resonance) and/or a tone layer (an oscillator, swept,
// with a detune), both with their own gain and an exponential decay over dur (plus an optional ramp-up, attack, before
// the decay starts); q and detune default to 1 and 0 when absent, so every pre-existing preset still sounds the same
// BASE_SOUNDS: the shipped defaults, never mutated (so a built-in can be edited, then reverted); SOUNDS: the live table
// (built-ins, each overridable, plus any new custom ones) that playSound and everywhere a sound is picked both read
const BASE_SOUNDS = {
  whoosh: { noise: 'bandpass', nf0: 400, nf1: 2400, ngain: 0.35, tone: 'none', tf0: 0, tf1: 0, tgain: 0, attack: 0, dur: 0.16 },
  hit: { noise: 'lowpass', nf0: 3000, nf1: 900, ngain: 0.5, tone: 'sine', tf0: 180, tf1: 90, tgain: 0.5, attack: 0, dur: 0.09 },
  thud: { noise: 'lowpass', nf0: 1200, nf1: 300, ngain: 0.45, tone: 'sine', tf0: 110, tf1: 40, tgain: 0.8, attack: 0, dur: 0.22 },
  block: { noise: 'highpass', nf0: 2500, nf1: 1800, ngain: 0.3, tone: 'sine', tf0: 900, tf1: 700, tgain: 0.15, attack: 0, dur: 0.06 },
  // a small drum-machine kit and a couple of melodic instruments, for the tracker
  kick: { noise: 'none', nf0: 100, nf1: 100, ngain: 0, tone: 'sine', tf0: 150, tf1: 40, tgain: 0.9, attack: 0, dur: 0.18 },
  snare: { noise: 'highpass', nf0: 1800, nf1: 1200, ngain: 0.5, tone: 'triangle', tf0: 200, tf1: 150, tgain: 0.3, attack: 0, dur: 0.12 },
  hihat: { noise: 'highpass', nf0: 6000, nf1: 5000, ngain: 0.3, tone: 'none', tf0: 0, tf1: 0, tgain: 0, attack: 0, dur: 0.04 },
  openhat: { noise: 'highpass', nf0: 6000, nf1: 4500, ngain: 0.3, tone: 'none', tf0: 0, tf1: 0, tgain: 0, attack: 0, dur: 0.22 },
  clap: { noise: 'bandpass', nf0: 1500, nf1: 1200, ngain: 0.45, tone: 'none', tf0: 0, tf1: 0, tgain: 0, attack: 0.01, dur: 0.15 },
  tom: { noise: 'lowpass', nf0: 800, nf1: 200, ngain: 0.25, tone: 'sine', tf0: 200, tf1: 90, tgain: 0.6, attack: 0, dur: 0.25 },
  click: { noise: 'highpass', nf0: 4000, nf1: 4000, ngain: 0.25, tone: 'square', tf0: 1000, tf1: 1000, tgain: 0.15, attack: 0, dur: 0.02 },
  bell: { noise: 'none', nf0: 0, nf1: 0, ngain: 0, tone: 'sine', tf0: 900, tf1: 850, tgain: 0.4, detune: 5, attack: 0.005, dur: 0.6 },
};
// ---------- my sounds: edits to a built-in, or wholly new ones, saved as you go (same pattern as scenarios: myStore -> SCENARIOS) ----------
const SOUND_STORE = 'stick2.sounds';
const mySounds = (() => { try { return JSON.parse(localStorage.getItem(SOUND_STORE)) || {}; } catch { return {}; } })();
const SOUNDS = { ...BASE_SOUNDS, ...mySounds };
function saveSound(name, preset) { mySounds[name] = SOUNDS[name] = preset; saveSounds(); }
// a built-in: back to its shipped values; a custom one: gone entirely
function resetSound(name) { delete mySounds[name]; if (BASE_SOUNDS[name]) SOUNDS[name] = { ...BASE_SOUNDS[name] }; else delete SOUNDS[name]; saveSounds(); }
function renameSound(from, to) { if (!mySounds[from] || to === from || SOUNDS[to]) return; mySounds[to] = SOUNDS[to] = mySounds[from]; resetSound(from); }
function saveSounds() { try { localStorage.setItem(SOUND_STORE, JSON.stringify(mySounds)); } catch {} }
// one second of white noise shared by every noise layer; an AudioBuffer isn't tied to a context, so the live context's
// buffer is reused as-is by an OfflineAudioContext too (renderSound, for the sound editor's waveform preview)
function noiseBuffer(c) {
  if (!snd.noise) { snd.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = snd.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return snd.noise;
}
// builds the noise + tone layers of a preset onto dest, starting at now (0 for an offline render): the one graph both
// playSound (the live AudioContext) and renderSound (an OfflineAudioContext, for the editor's waveform preview) use
function synthSound(c, now, s, dest) {
  const { noise, nf0, nf1, ngain, tone, tf0, tf1, tgain, attack, dur } = s;
  // instant peak (attack 0, as every sound used to be), or a ramp up to it, then the same exponential decay to silence
  const env = (g, peak) => {
    if (attack > 0) { g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(peak, now + attack); } else g.gain.setValueAtTime(peak, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur); return g;
  };
  if (noise !== 'none' && ngain > 0) {
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = env(c.createGain(), ngain);
    src.buffer = noiseBuffer(c); f.type = noise; f.Q.value = s.q ?? 1; f.frequency.setValueAtTime(nf0, now); f.frequency.exponentialRampToValueAtTime(Math.max(1, nf1), now + dur);
    src.connect(f).connect(g).connect(dest); src.start(now); src.stop(now + dur);
  }
  if (tone !== 'none' && tgain > 0) {
    const o = c.createOscillator(), og = env(c.createGain(), tgain);
    o.type = tone; o.detune.value = s.detune ?? 0; o.frequency.setValueAtTime(tf0, now); o.frequency.exponentialRampToValueAtTime(Math.max(1, tf1), now + dur);
    o.connect(og).connect(dest); o.start(now); o.stop(now + dur);
  }
}
// pan: 0 left … 1 right (x / W from the world)
function playSound(name, pan = 0.5) {
  const s = SOUNDS[name];
  if (!s || muted()) return;
  try {
    const c = snd.ctx ??= new AudioContext();
    if (c.state === 'suspended') c.resume();
    const out = c.createStereoPanner();
    out.pan.value = clamp(pan * 2 - 1, -1, 1) * 0.6; out.connect(c.destination);
    synthSound(c, c.currentTime, s, out);
  } catch { /* no audio: stay silent */ }
}
// the same sound rendered silently offline, for the sound editor's waveform preview (never played, never muted)
async function renderSound(s) {
  const sr = 44100, c = new OfflineAudioContext(1, Math.ceil(sr * Math.max(s.dur, 0.02)), sr);
  synthSound(c, 0, s, c.destination);
  return (await c.startRendering()).getChannelData(0);
}
