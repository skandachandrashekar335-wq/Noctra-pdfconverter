"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

function subscribeNetwork(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getClientSnapshot(): boolean {
  return typeof navigator !== "undefined" ? !navigator.onLine : false;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useOfflineStatus(): boolean {
  return useSyncExternalStore(subscribeNetwork, getClientSnapshot, getServerSnapshot);
}

export function ServiceWorkerRegister() {
  const isOffline = useOfflineStatus();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

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
  }, []);

  // Suppress floating banner when on dashboard (dashboard has a dedicated sidebar status card)
  if (!isOffline || pathname?.startsWith("/dashboard")) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-3 left-0 right-0 z-50 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#111115]/95 border border-amber-500/30 text-amber-300 text-xs shadow-lg backdrop-blur-md">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
        <span className="font-medium tracking-tight">Offline Mode · Local document conversion and reader active</span>
      </div>
    </aside>
  );
}
