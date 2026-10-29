"use client";

import { useEffect, useState } from "react";

export function ServiceWorkerRegister() {
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          reg.onupdatefound = () => {
            const installing = reg.installing;
            if (installing) {
              installing.onstatechange = () => {
                if (installing.state === "installed" && navigator.serviceWorker.controller) {
                  // New content available
                }
              };
            }
          };
        })
        .catch(() => {
          // Service worker registration ignored in environments that disallow it
        });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-zinc-900/95 border border-amber-500/40 text-amber-300 text-xs shadow-2xl backdrop-blur-md animate-fade-in"
    >
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      <span>Working Offline · Local document conversion and reader active</span>
    </aside>
  );
}
