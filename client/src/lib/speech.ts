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

/* ---------- voices ----------
 * Speech uses the phone's own text-to-speech engine. Voices load asynchronously, and some engines have no
 * Hebrew voice at all (e.g. Samsung TTS), which made the cues silent in the third trial. So: wait for the voices,
 * report which languages are available, and let the workout fall back to a language the phone can speak. */
let voices: SpeechSynthesisVoice[] = [];
function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === "undefined") return [];
  const v = speechSynthesis.getVoices();
  if (v.length) voices = v;
  return voices;
}
if (typeof speechSynthesis !== "undefined") {
  loadVoices();
  speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}

/** Resolves with the voice list once the engine has published it (or after 2.5 s). */
export function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve([]);
  if (loadVoices().length) return Promise.resolve(voices);
  return new Promise((resolve) => {
    const done = () => resolve(loadVoices());
    speechSynthesis.addEventListener?.("voiceschanged", done, { once: true });
    setTimeout(done, 2500);
  });
}

const prefix = (lang: CueLang) => (lang === "en" ? "en" : lang === "he" ? "he" : lang);
export function voiceFor(lang: CueLang): SpeechSynthesisVoice | undefined {
  const all = loadVoices();
  const p = prefix(lang);
  // Hebrew is "he-IL" on most engines and "iw-IL" on some older Android ones
  const match = (v: SpeechSynthesisVoice) => {
    const l = v.lang.toLowerCase().replace("_", "-");
    return l.startsWith(p) || (p === "he" && l.startsWith("iw"));
  };
  return all.find((v) => match(v) && v.localService) ?? all.find(match);
}
export const speechSupported = () => typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";

/** The language the workout will actually speak: the chosen one if the phone has a voice for it, else English. */
export function spokenLang(): CueLang {
  const want = cueLang();
  if (voiceFor(want) || !loadVoices().length) return want;
  return voiceFor("en") ? "en" : want;
}

let last = "";
let lastAt = 0;
export function say(text: string, lang: CueLang = cueLang()): void {
  if (!voiceOn() || !speechSupported()) return;
  const now = Date.now();
  if (text === last && now - lastAt < 4000) return;
  last = text;
  lastAt = now;
  const u = new SpeechSynthesisUtterance(text.replace(/[^\p{L}\p{N}\s!,.?'"-]/gu, "").trim());
  u.lang = lang === "en" ? "en-US" : "he-IL";
  const voice = voiceFor(lang);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  }
  u.rate = 1;
  u.volume = 1;
  // cancel() right before speak() silently drops the new utterance on some Android builds: only cancel if busy
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  speechSynthesis.resume(); // Chrome on Android can leave the queue paused after the page was in the background
  setTimeout(() => speechSynthesis.speak(u), speechSynthesis.speaking ? 60 : 0);
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
    if (voiceOn() && speechSupported()) {
      // a real (quiet) word inside the tap: some engines ignore an empty utterance and stay locked
      const u = new SpeechSynthesisUtterance(cueLang() === "en" ? "ready" : "מוכן");
      u.volume = 0.01;
      const v = voiceFor(cueLang());
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    }
  },
};

/** Kept for older call sites: one neutral tone. */
export const beep = () => sfx.good();
