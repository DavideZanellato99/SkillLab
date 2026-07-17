/* Phone ringback tone ("squillo") generated with Web Audio — no asset files.
 *
 * Reproduces the European ringback: a 425 Hz sine burst of 1s followed by
 * 1s of silence, repeated until stop() is called. Must be started from a
 * user gesture (click) so the AudioContext is allowed to play.
 */

const TONE_HZ = 425;
const CADENCE_ON_S = 1.0;
const CADENCE_OFF_S = 1.0;
const VOLUME = 0.15;
// Safety cap: the caller is expected to stop() long before this
const MAX_RING_S = 60;

export interface Ringback {
  stop: () => void;
}

export function startRingback(): Ringback {
  const ctx = new AudioContext();

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = TONE_HZ;
  osc.connect(gain);

  // Pre-schedule the whole on/off cadence; short ramps avoid clicks
  const t0 = ctx.currentTime;
  const period = CADENCE_ON_S + CADENCE_OFF_S;
  for (let t = t0; t < t0 + MAX_RING_S; t += period) {
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(VOLUME, t + 0.015);
    gain.gain.setValueAtTime(VOLUME, t + CADENCE_ON_S - 0.015);
    gain.gain.linearRampToValueAtTime(0, t + CADENCE_ON_S);
  }

  osc.start(t0);
  osc.stop(t0 + MAX_RING_S);

  return {
    stop: () => {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
      void ctx.close();
    },
  };
}
