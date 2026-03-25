import { useEffect } from "react";
import { runTour } from "../tour";

const TOUR_DONE_KEY = "uoplan-tour-done";

/**
 * Hook for running the onboarding tour.
 * Automatically triggers the tour on first visit after data is loaded.
 * 
 * @param isReady - Whether the app is ready (data loaded, not loading)
 * @param setActiveStep - Callback to set the active wizard step (used by tour)
 */
export function useTour(
  isReady: boolean,
  setActiveStep: (step: number) => void
): void {
  useEffect(() => {
    // Don't run tour if not ready or already completed
    if (!isReady || localStorage.getItem(TOUR_DONE_KEY)) return;

    // Delay slightly to let the UI settle
    const t = setTimeout(() => runTour(setActiveStep), 400);
    return () => clearTimeout(t);
  }, [isReady, setActiveStep]);
}

/**
 * Mark the tour as completed so it won't run again.
 */
export function markTourComplete(): void {
  localStorage.setItem(TOUR_DONE_KEY, "true");
}

/**
 * Reset the tour so it will run again on next visit.
 */
export function resetTour(): void {
  localStorage.removeItem(TOUR_DONE_KEY);
}
