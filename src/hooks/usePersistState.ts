import { useEffect, useRef } from "react";
import { useAppStore } from "../store/appStore";

const STORAGE_KEY = "uoplan-state";
const DEBOUNCE_MS = 400;

/**
 * Subscribes to the app store and debounce-saves encoded state to localStorage
 * whenever it changes. Pass `enabled` as false until the data needed for encoding
 * is ready (e.g. wait for `indices` to be loaded).
 */
export function usePersistState(enabled: boolean): void {
  const getEncodedStateBase64 = useAppStore((s) => s.getEncodedStateBase64);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const flush = () => {
      const base64 = getEncodedStateBase64();
      if (base64) localStorage.setItem(STORAGE_KEY, base64);
    };

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    };

    const unsub = useAppStore.subscribe(schedule);

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, getEncodedStateBase64]);
}
