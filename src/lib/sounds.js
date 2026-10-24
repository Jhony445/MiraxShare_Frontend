// ponytail: synthesized with Web Audio so there's no asset to ship; swap for audio files if you want branded sounds.
const VOLUME = 0.5;
let ctx = null;

function tone(frequency, start, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(VOLUME, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration);
}

function playNotes(first, second) {
  try {
    ctx = ctx || new AudioContext();
    void ctx.resume();
    const now = ctx.currentTime;
    tone(first, now, 0.18);
    tone(second, now + 0.14, 0.3);
  } catch (_err) {
    // Audio can be unavailable (autoplay policy, no output device); the sound is optional.
  }
}

// Two notes like the voice-app cues: rising when someone joins, falling when someone leaves.
export const playJoinSound = () => playNotes(392, 587);
export const playLeaveSound = () => playNotes(587, 392);
