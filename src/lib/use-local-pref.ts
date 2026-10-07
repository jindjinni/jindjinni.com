"use client";

import { useCallback, useSyncExternalStore } from "react";

// A small per-browser setting (like "chat sounds on"). Reads safely (private windows can block storage), and every screen
// that uses the same key updates together. Never used for anything that has to be reliable -- only conveniences.

const EVENT = "local-pref-change";

function read(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function useLocalPref(key: string, fallback: string): [string, (v: string) => void] {
  const subscribe = useCallback(
    (cb: () => void) => {
      const h = (e: Event) => {
        if (e.type === EVENT ? (e as CustomEvent).detail === key : (e as StorageEvent).key === key) cb();
      };
      window.addEventListener(EVENT, h);
      window.addEventListener("storage", h);
      return () => {
        window.removeEventListener(EVENT, h);
        window.removeEventListener("storage", h);
      };
    },
    [key],
  );
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
  const set = useCallback(
    (v: string) => {
      try {
        window.localStorage.setItem(key, v);
      } catch {
        /* blocked storage: the setting just doesn't stick */
      }
      window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
    },
    [key],
  );
  return [value, set];
}

/** True in the browser once the page has loaded, false on the server and during the first paint (so times and dates don't mismatch). */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
