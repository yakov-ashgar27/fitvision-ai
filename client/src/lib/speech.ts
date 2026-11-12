/** Spoken feedback in Hebrew (US-06), can be muted. */
const KEY = "fv:muted";
export const isMuted = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
export const setMuted = (m: boolean) => {
  try {
    localStorage.setItem(KEY, m ? "1" : "0");
  } catch {
    /* ignore */
  }
};
let last = "";
let lastAt = 0;
export function say(text: string): void {
  if (isMuted() || typeof speechSynthesis === "undefined") return;
  const now = Date.now();
  if (text === last && now - lastAt < 2500) return;
  last = text;
  lastAt = now;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "he-IL";
  u.rate = 1.05;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
export function beep(): void {
  if (isMuted()) return;
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.08);
    o.onended = () => ctx.close();
  } catch {
    /* ignore */
  }
}
