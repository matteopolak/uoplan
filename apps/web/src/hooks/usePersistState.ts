import { useEffect, useRef } from "react";
import { useAppStore } from "../store/appStore";
import type { AppStore } from "../store/types";

const STORAGE_KEY = "uoplan-state";
const DEBOUNCE_MS = 400;

function hasPersistedStateChange(next: AppStore, prev: AppStore): boolean {
  return (
    next.catalogue !== prev.catalogue ||
    next.indices !== prev.indices ||
    next.selectedTermId !== prev.selectedTermId ||
    next.firstYear !== prev.firstYear ||
    next.program !== prev.program ||
    next.completedCourses !== prev.completedCourses ||
    next.levelBuckets !== prev.levelBuckets ||
    next.languageBuckets !== prev.languageBuckets ||
    next.electiveLevelBuckets !== prev.electiveLevelBuckets ||
    next.coursesThisSemester !== prev.coursesThisSemester ||
    next.selectedScheduleIndex !== prev.selectedScheduleIndex ||
    next.generationSeed !== prev.generationSeed ||
    next.selectedPerRequirement !== prev.selectedPerRequirement ||
    next.selectedOptionsPerRequirement !== prev.selectedOptionsPerRequirement ||
    next.constrainedPerRequirement !== prev.constrainedPerRequirement ||
    next.requirementTreeWithStatus !== prev.requirementTreeWithStatus ||
    next.remainingRequirements !== prev.remainingRequirements ||
    next.includeClosedComponents !== prev.includeClosedComponents ||
    next.studentPrograms !== prev.studentPrograms
  );
}

export { hasPersistedStateChange };

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

    const schedule = (state: AppStore, prevState: AppStore) => {
      if (!hasPersistedStateChange(state, prevState)) return;
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
