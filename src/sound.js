'use strict';
// ---------- sound: every effect synthesized with WebAudio (no files); never part of the simulation ----------
// the live fight calls playSound through its world's sfx hook (World.sound); muted by default when the browser is automated
const snd = { ctx: null, noise: null };
const muted = () => ui.mute ?? !!navigator.webdriver;
function toggleMute() { ui.mute = !muted(); saveUi(); }
// name -> [noise filter type, filter start Hz, filter end Hz, noise gain, tone start Hz, tone end Hz, tone gain, seconds]
const SOUNDS = {
  whoosh: ['bandpass', 400, 2400, 0.35, 0, 0, 0, 0.16],
  hit: ['lowpass', 3000, 900, 0.5, 180, 90, 0.5, 0.09],
  thud: ['lowpass', 1200, 300, 0.45, 110, 40, 0.8, 0.22],
  block: ['highpass', 2500, 1800, 0.3, 900, 700, 0.15, 0.06],
};
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
    const [ft, f0, f1, ng, t0, t1, tg, dur] = s, now = c.currentTime, out = c.createStereoPanner();
    out.pan.value = clamp(pan * 2 - 1, -1, 1) * 0.6; out.connect(c.destination);
    const env = (g, peak) => { g.gain.setValueAtTime(peak, now); g.gain.exponentialRampToValueAtTime(0.001, now + dur); return g; };
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = env(c.createGain(), ng);
    src.buffer = snd.noise; f.type = ft; f.frequency.setValueAtTime(f0, now); f.frequency.exponentialRampToValueAtTime(f1, now + dur);
    src.connect(f).connect(g).connect(out); src.start(now); src.stop(now + dur);
    if (tg) {
      const o = c.createOscillator(), og = env(c.createGain(), tg);
      o.frequency.setValueAtTime(t0, now); o.frequency.exponentialRampToValueAtTime(t1, now + dur);
      o.connect(og).connect(out); o.start(now); o.stop(now + dur);
    }
  } catch { /* no audio: stay silent */ }
}
