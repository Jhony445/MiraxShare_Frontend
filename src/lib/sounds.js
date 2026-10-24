// ponytail: synthesized with Web Audio so there's no asset to ship; swap for an audio file if you want a branded sound.
let ctx = null;

function tone(frequency, start, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration);
}

// Two descending notes, like the "someone left the call" cue in voice apps.
export function playLeaveSound() {
  try {
    ctx = ctx || new AudioContext();
    void ctx.resume();
    const now = ctx.currentTime;
    tone(587, now, 0.18);
    tone(392, now + 0.14, 0.3);
  } catch (_err) {
    // Audio can be unavailable (autoplay policy, no output device); the sound is optional.
  }
}
