/**
 * The free cloud server sleeps after ~15 minutes without use and needs up to a minute to wake. The app shell opens
 * at once (service worker); this banner pings the API right away and, if it is slow, says what is happening.
 */
import { useEffect, useState } from "react";

export default function WakeBanner() {
  const [state, setState] = useState<"checking" | "waking" | "ok">("checking");
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    let alive = true;
    const slow = window.setTimeout(() => alive && setState((s) => (s === "checking" ? "waking" : s)), 1500);
    const tick = window.setInterval(() => alive && setSecs((n) => n + 1), 1000);
    const ping = async () => {
      for (let i = 0; i < 40 && alive; i++) {
        try {
          const r = await fetch("/api/health", { cache: "no-store" });
          if (r.ok) {
            if (alive) setState("ok");
            return;
          }
        } catch {
          /* still waking */
        }
        await new Promise((res) => setTimeout(res, 2500));
      }
    };
    void ping();
    return () => {
      alive = false;
      clearTimeout(slow);
      clearInterval(tick);
    };
  }, []);

  if (state !== "waking") return null;
  return (
    <div className="banner warn" role="status" data-testid="wake-banner">
      ⏳ השרת מתעורר (בגרסה החינמית הוא נרדם כשאין שימוש)… {secs} שניות. בדרך כלל עד דקה, ואחר כך הכל מהיר.
    </div>
  );
}
