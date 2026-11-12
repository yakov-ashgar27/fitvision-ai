/**
 * Workout audio (US-06). Two independent settings:
 *  - sounds: short tones for a good rep, a corrected rep, a finished set and the rest countdown (on by default)
 *  - voice: Hebrew text-to-speech of the cues (off by default; the screen already shows every cue)
 */
const read = (key: string, def: boolean) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === "1";
  } catch {
    return def;
  }
};
const write = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* ignore */
  }
};

export const voiceOn = () => read("fv:voice", false);
export const setVoice = (on: boolean) => write("fv:voice", on);
export const soundsOn = () => read("fv:sounds", true);
export const setSounds = (on: boolean) => write("fv:sounds", on);

let last = "";
let lastAt = 0;
export function say(text: string): void {
  if (!voiceOn() || typeof speechSynthesis === "undefined") return;
  const now = Date.now();
  if (text === last && now - lastAt < 4000) return;
  last = text;
  lastAt = now;
  const u = new SpeechSynthesisUtterance(text.replace(/[^\p{L}\p{N}\s!,.?'"-]/gu, ""));
  u.lang = "he-IL";
  u.rate = 1.05;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Plays a short sequence of notes: [frequency Hz, duration s]. */
function tones(notes: [number, number][], volume = 0.06, type: OscillatorType = "sine"): void {
  if (!soundsOn()) return;
  const c = audio();
  if (!c) return;
  let t = c.currentTime;
  for (const [f, d] of notes) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + d + 0.02);
    t += d * 0.85;
  }
}

export const sfx = {
  good: () => tones([[784, 0.09], [1175, 0.14]]),
  fix: () => tones([[330, 0.16]], 0.05, "triangle"),
  bad: () => tones([[262, 0.12], [196, 0.18]], 0.05, "triangle"),
  tick: () => tones([[1000, 0.05]], 0.04),
  setDone: () => tones([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.28]], 0.07),
  /** Browsers allow audio only after a tap: call this from the start button. */
  unlock: () => void audio(),
};

/** Kept for older call sites: one neutral tone. */
export const beep = () => sfx.good();
