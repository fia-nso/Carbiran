import { useEffect } from "react";

export function useAutoUpdate() {
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/version.json?t=" + Date.now());
        const { version } = (await res.json()) as { version: string };
        const current = localStorage.getItem("app_version");
        if (current && current !== version) {
          localStorage.setItem("app_version", version);
          window.location.reload();
        } else {
          localStorage.setItem("app_version", version);
        }
      } catch {
        // réseau indisponible — on réessaie au prochain tick
      }
    };

    void check();
    const interval = setInterval(() => { void check(); }, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
}
