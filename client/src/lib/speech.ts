/**
 * Workout audio (US-06). Two independent settings:
 *  - sounds: a short "pop" for every successful rep (silence for a rep that needs fixing), a chime at the end of
 *    the set and ticks in the rest countdown (on by default)
 *  - voice: the cues spoken aloud, because the trainee stands 2–3 m from the screen (on by default, third-trial
 *    feedback), in Hebrew or English (cue language setting)
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

export const voiceOn = () => read("fv:voice", true);
export const setVoice = (on: boolean) => write("fv:voice", on);
export const soundsOn = () => read("fv:sounds", true);
export const setSounds = (on: boolean) => write("fv:sounds", on);

export type CueLang = "he" | "en";
export const cueLang = (): CueLang => {
  try {
    return localStorage.getItem("fv:lang") === "en" ? "en" : "he";
  } catch {
    return "he";
  }
};
export const setCueLang = (l: CueLang) => {
  try {
    localStorage.setItem("fv:lang", l);
  } catch {
    /* ignore */
  }
};

let last = "";
let lastAt = 0;
export function say(text: string, lang: CueLang = cueLang()): void {
  if (!voiceOn() || typeof speechSynthesis === "undefined") return;
  const now = Date.now();
  if (text === last && now - lastAt < 4000) return;
  last = text;
  lastAt = now;
  const u = new SpeechSynthesisUtterance(text.replace(/[^\p{L}\p{N}\s!,.?'"-]/gu, ""));
  u.lang = lang === "en" ? "en-US" : "he-IL";
  const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang === "en" ? "en" : "he"));
  if (voice) u.voice = voice;
  u.rate = 1;
  u.volume = 1;
  speechSynthesis.cancel(); // the newest cue replaces an older one that is still being read
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

/** A short bright "pop": a fast upward pitch sweep with a quick decay. */
function pop(): void {
  if (!soundsOn()) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(1500, t + 0.06);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.14);
}

export const sfx = {
  pop,
  good: pop,
  fix: () => tones([[330, 0.16]], 0.05, "triangle"),
  bad: () => tones([[262, 0.12], [196, 0.18]], 0.05, "triangle"),
  tick: () => tones([[1000, 0.05]], 0.04),
  setDone: () => tones([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.28]], 0.07),
  /** Browsers (iOS especially) allow audio and speech only after a tap: call this from the start button. */
  unlock: () => {
    audio();
    if (voiceOn() && typeof speechSynthesis !== "undefined") {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  },
};

/** Kept for older call sites: one neutral tone. */
export const beep = () => sfx.good();
