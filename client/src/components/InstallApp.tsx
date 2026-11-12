/**
 * "Install as an app": FitVision is a PWA, so it installs from the browser on any device with a camera —
 * Android (Chrome, Samsung Internet), iPhone and iPad (Safari → Share → Add to Home Screen), and laptops
 * (Chrome or Edge → Install). Once installed it opens full screen from its own icon, like a store app.
 */
import { useEffect, useState } from "react";

interface BeforeInstallPrompt extends Event {
  prompt: () => Promise<void>;
}

const standalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export default function InstallApp() {
  const [evt, setEvt] = useState<BeforeInstallPrompt | null>(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return standalone() || localStorage.getItem("fv:install-hidden") === "1";
    } catch {
      return standalone();
    }
  });
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);

  if (hidden || (!evt && !isIos())) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem("fv:install-hidden", "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="card install" data-testid="install-app">
      <div className="spread">
        <div>
          <b>📲 התקנה כאפליקציה</b>
          <div className="muted small">אייקון במסך הבית, מסך מלא, ועבודה גם בלי רשת</div>
        </div>
        <div className="row">
          <button
            onClick={async () => {
              if (evt) {
                await evt.prompt();
                setEvt(null);
                close();
              } else setIosHelp(!iosHelp);
            }}
          >
            התקנה
          </button>
          <button className="link" aria-label="סגירה" onClick={close}>
            ✕
          </button>
        </div>
      </div>
      {iosHelp && (
        <ol className="small">
          <li>לוחצים על כפתור השיתוף ⬆️ בתחתית Safari (באייפד: למעלה)</li>
          <li>בוחרים "הוספה למסך הבית"</li>
          <li>לוחצים "הוסף". האפליקציה תופיע עם אייקון משלה</li>
        </ol>
      )}
    </div>
  );
}
