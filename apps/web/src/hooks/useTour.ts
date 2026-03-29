import { useEffect, useMemo } from "react";
import { runTour, TOUR_DONE_KEY } from "../tour";
import { buildVisibleStepIndices } from "../lib/wizardSteps";

/**
 * Hook for running the onboarding tour.
 * Automatically triggers the tour on first visit after data is loaded.
 *
 * @param isReady - Whether the app is ready (data loaded, not loading)
 * @param setActiveStep - Callback to set the active wizard step (used by tour)
 * @param needsOptionsStep - Whether the Options wizard step is shown (same as sidebar)
 * @param needsAssignStep - Whether the Assign wizard step is shown
 */
export function useTour(
  isReady: boolean,
  setActiveStep: (step: number) => void,
  needsOptionsStep: boolean,
  needsAssignStep: boolean,
): void {
  const visibleStepIndices = useMemo(
    () => buildVisibleStepIndices(needsOptionsStep, needsAssignStep),
    [needsOptionsStep, needsAssignStep],
  );

  useEffect(() => {
    if (!isReady || localStorage.getItem(TOUR_DONE_KEY)) return;

    const t = setTimeout(
      () => runTour(setActiveStep, visibleStepIndices),
      400,
    );
    return () => clearTimeout(t);
  }, [isReady, setActiveStep, visibleStepIndices]);
}

/**
 * Mark the tour as completed so it won't run again.
 */
export function markTourComplete(): void {
  localStorage.setItem(TOUR_DONE_KEY, "1");
}

/**
 * Reset the tour so it will run again on next visit.
 */
export function resetTour(): void {
  localStorage.removeItem(TOUR_DONE_KEY);
}
