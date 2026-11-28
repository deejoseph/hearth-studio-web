let context = null;
let enabled = true;
let resumeTarget = null;
let resuming = null;

const SOUNDS = {
  move: [[240, 150, 0.09, 'triangle', 0.16, 0]],
  capture: [[160, 70, 0.15, 'triangle', 0.2, 0], [320, 120, 0.07, 'sine', 0.11, 0.015]],
  check: [[660, 660, 0.09, 'sine', 0.13, 0], [880, 880, 0.14, 'sine', 0.13, 0.09]],
  castle: [[220, 180, 0.07, 'triangle', 0.13, 0], [180, 140, 0.09, 'triangle', 0.13, 0.09]],
  promote: [[523, 523, 0.1, 'sine', 0.11, 0], [659, 659, 0.1, 'sine', 0.11, 0.07], [784, 784, 0.16, 'sine', 0.11, 0.14]],
  end: [[392, 392, 0.14, 'sine', 0.12, 0], [294, 196, 0.24, 'triangle', 0.14, 0.12]],
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

function createContext() {
  const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContext) return null;
  try {
    return new AudioContext({ latencyHint: 'interactive' });
  } catch {
    try {
      return new AudioContext();
    } catch {
      return null;
    }
  }
}

function getContext() {
  if (!context || context.state === 'closed') context = createContext();
  return context;
}

function resumeAudio(audio) {
  if (!audio) return Promise.resolve(false);
  if (audio.state === 'running') return Promise.resolve(true);
  if (typeof audio.resume !== 'function') return Promise.resolve(false);
  if (resumeTarget !== audio || !resuming) {
    resumeTarget = audio;
    resuming = Promise.resolve()
      .then(() => audio.resume())
      .then(() => audio.state === 'running')
      .catch(() => false)
      .finally(() => {
        if (resumeTarget === audio) {
          resumeTarget = null;
          resuming = null;
        }
      });
  }
  return resuming;
}

export function unlockMoveAudio() {
  if (!enabled) return Promise.resolve(false);
  return resumeAudio(getContext());
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

export async function playMoveSound(kind) {
  if (!enabled) return false;
  const audio = getContext();
  if (!audio) return false;
  if (audio.state !== 'running') {
    const ready = await resumeAudio(audio);
    if (!ready || !enabled || context !== audio || audio.state !== 'running') return false;
  }
  const notes = SOUNDS[kind] ?? SOUNDS.move;
  const start = audio.currentTime + 0.005;
  try {
    for (const note of notes) tone(audio, start, note);
    return true;
  } catch {
    return false;
  }
}
