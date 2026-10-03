'use strict';
// ---------- sound: every effect synthesized with WebAudio (no files); never part of the simulation ----------
// the live fight calls playSound through its world's sfx hook (World.sound); muted by default when the browser is automated
const snd = { ctx: null, noise: null };
const muted = () => ui.mute ?? !!navigator.webdriver;
function toggleMute() { ui.mute = !muted(); saveUi(); }
// a sound: a noise layer (filtered white noise, swept) and/or a tone layer (an oscillator, swept), both with their own
// gain and an exponential decay over dur (plus an optional ramp-up, attack, before the decay starts)
const SOUNDS = {
  whoosh: { noise: 'bandpass', nf0: 400, nf1: 2400, ngain: 0.35, tone: 'none', tf0: 0, tf1: 0, tgain: 0, attack: 0, dur: 0.16 },
  hit: { noise: 'lowpass', nf0: 3000, nf1: 900, ngain: 0.5, tone: 'sine', tf0: 180, tf1: 90, tgain: 0.5, attack: 0, dur: 0.09 },
  thud: { noise: 'lowpass', nf0: 1200, nf1: 300, ngain: 0.45, tone: 'sine', tf0: 110, tf1: 40, tgain: 0.8, attack: 0, dur: 0.22 },
  block: { noise: 'highpass', nf0: 2500, nf1: 1800, ngain: 0.3, tone: 'sine', tf0: 900, tf1: 700, tgain: 0.15, attack: 0, dur: 0.06 },
};
// ---------- my sounds: custom presets built in the browser, saved as you go (same pattern as scenarios: myStore -> SCENARIOS) ----------
const SOUND_STORE = 'stick2.sounds';
const mySounds = (() => { try { return JSON.parse(localStorage.getItem(SOUND_STORE)) || {}; } catch { return {}; } })();
Object.assign(SOUNDS, mySounds);
function saveSound(name, preset) { mySounds[name] = SOUNDS[name] = preset; saveSounds(); }
function deleteSound(name) { delete mySounds[name]; delete SOUNDS[name]; saveSounds(); }
function renameSound(from, to) { if (!mySounds[from] || to === from || SOUNDS[to]) return; mySounds[to] = SOUNDS[to] = mySounds[from]; deleteSound(from); }
function saveSounds() { try { localStorage.setItem(SOUND_STORE, JSON.stringify(mySounds)); } catch {} }
// pan: 0 left … 1 right (x / W from the world)
function playSound(name, pan = 0.5) {
  const s = SOUNDS[name];
  if (!s || muted()) return;
  try {
    const c = snd.ctx ??= new AudioContext();
    if (c.state === 'suspended') c.resume();
    if (!snd.noise) { // one second of white noise, shared
      snd.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = snd.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const { noise, nf0, nf1, ngain, tone, tf0, tf1, tgain, attack, dur } = s, now = c.currentTime, out = c.createStereoPanner();
    out.pan.value = clamp(pan * 2 - 1, -1, 1) * 0.6; out.connect(c.destination);
    // instant peak (attack 0, as every sound used to be), or a ramp up to it, then the same exponential decay to silence
    const env = (g, peak) => {
      if (attack > 0) { g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(peak, now + attack); } else g.gain.setValueAtTime(peak, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur); return g;
    };
    if (noise !== 'none' && ngain > 0) {
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = env(c.createGain(), ngain);
      src.buffer = snd.noise; f.type = noise; f.frequency.setValueAtTime(nf0, now); f.frequency.exponentialRampToValueAtTime(Math.max(1, nf1), now + dur);
      src.connect(f).connect(g).connect(out); src.start(now); src.stop(now + dur);
    }
    if (tone !== 'none' && tgain > 0) {
      const o = c.createOscillator(), og = env(c.createGain(), tgain);
      o.type = tone; o.frequency.setValueAtTime(tf0, now); o.frequency.exponentialRampToValueAtTime(Math.max(1, tf1), now + dur);
      o.connect(og).connect(out); o.start(now); o.stop(now + dur);
    }
  } catch { /* no audio: stay silent */ }
}
