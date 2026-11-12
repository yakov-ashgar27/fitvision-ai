/** Real-user monitoring (6.3.4): loaded after the page, idle, and sent with sendBeacon. */
import { API_BASE } from "../api/client";

const queue: { name: string; value: number; page: string; device: string }[] = [];

function flush() {
  if (!queue.length) return;
  const body = JSON.stringify(queue.splice(0, queue.length));
  if (!navigator.sendBeacon?.(`${API_BASE}/metrics/rum`, new Blob([body], { type: "application/json" }))) {
    void fetch(`${API_BASE}/metrics/rum`, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  }
}

export function report(name: string, value: number) {
  queue.push({ name, value: Math.round(value * 10) / 10, page: location.pathname.slice(0, 120), device: navigator.userAgent.slice(0, 160) });
  if (queue.length >= 10) flush();
}

export function startRum() {
  const go = async () => {
    const { onLCP, onINP, onCLS } = await import("web-vitals");
    onLCP((m) => report("LCP", m.value));
    onINP((m) => report("INP", m.value));
    onCLS((m) => report("CLS", m.value * 1000));
    addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  };
  const idle = (cb: () => void) => ("requestIdleCallback" in window ? (window as any).requestIdleCallback(cb) : setTimeout(cb, 1500));
  if (document.readyState === "complete") idle(() => void go());
  else addEventListener("load", () => idle(() => void go()), { once: true });
}
