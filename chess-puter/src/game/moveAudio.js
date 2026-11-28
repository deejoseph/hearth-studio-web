let context = null;
let enabled = true;

const SOUNDS = {
  move: [[240, 150, 0.075, 'triangle', 0.09, 0]],
  capture: [[160, 70, 0.13, 'triangle', 0.13, 0], [320, 120, 0.06, 'sine', 0.07, 0.015]],
  check: [[660, 660, 0.08, 'sine', 0.08, 0], [880, 880, 0.12, 'sine', 0.08, 0.09]],
  castle: [[220, 180, 0.06, 'triangle', 0.08, 0], [180, 140, 0.08, 'triangle', 0.08, 0.09]],
  promote: [[523, 523, 0.09, 'sine', 0.07, 0], [659, 659, 0.09, 'sine', 0.07, 0.07], [784, 784, 0.14, 'sine', 0.07, 0.14]],
  end: [[392, 392, 0.12, 'sine', 0.07, 0], [294, 196, 0.22, 'triangle', 0.09, 0.12]],
};

export function setMoveSoundEnabled(value) {
  enabled = Boolean(value);
}

export function moveSoundKind(move, status = {}) {
  if (status.over) return 'end';
  if (move?.promotion) return 'promote';
  if (status.check) return 'check';
  if (move?.captured) return 'capture';
  if (move?.flags?.includes('k') || move?.flags?.includes('q')) return 'castle';
  return 'move';
}

function getContext() {
  const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContext) return null;
  context ??= new AudioContext();
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

export function unlockMoveAudio() {
  if (enabled) getContext();
}

function tone(audio, start, [from, to, duration, type, volume, delay]) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const at = start + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, at);
  oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

export function playMoveSound(kind) {
  if (!enabled) return;
  const audio = getContext();
  const notes = SOUNDS[kind] ?? SOUNDS.move;
  if (!audio) return;
  const start = audio.currentTime + 0.005;
  for (const note of notes) tone(audio, start, note);
}
