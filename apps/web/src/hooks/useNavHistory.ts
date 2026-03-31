import { useCallback, useEffect, useRef, useState } from "react";
import type { WizardStep } from "../lib/wizardSteps";

type NavHistoryState = {
  step: WizardStep;
  showCalendar: boolean;
};

function getInitialNavState(): NavHistoryState {
  const hs = window.history.state as NavHistoryState | null;
  if (hs != null && typeof hs.step === "number") {
    return { step: hs.step, showCalendar: hs.showCalendar ?? false };
  }
  return { step: 0, showCalendar: false };
}

/**
 * Manages the wizard step and calendar visibility with browser history support.
 *
 * Every navigation action pushes a new history entry so the browser's back/forward
 * buttons (and the back mouse button) work as expected. Reset uses replaceState so
 * it doesn't pollute the history stack.
 */
export function useNavHistory() {
  const [state, setStateInternal] =
    useState<NavHistoryState>(getInitialNavState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Ensure the initial history entry always carries our state shape so that
  // a popstate fired back to the very first entry can still be handled.
  useEffect(() => {
    window.history.replaceState(
      {
        step: stateRef.current.step,
        showCalendar: stateRef.current.showCalendar,
      },
      "",
    );
    // Intentionally run only once on mount.
     
  }, []);

  // Sync React state when the browser navigates back or forward.
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const s = e.state as NavHistoryState | null;
      if (s != null && typeof s.step === "number") {
        setStateInternal({
          step: s.step,
          showCalendar: s.showCalendar ?? false,
        });
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  /**
   * Navigate to a specific wizard step. Always hides the calendar.
   * Accepts either a step index or an updater function (same API as useState).
   */
  const setActive = useCallback(
    (stepOrUpdater: number | ((prev: number) => number)) => {
      const step =
        typeof stepOrUpdater === "function"
          ? stepOrUpdater(stateRef.current.step)
          : stepOrUpdater;
      const newState: NavHistoryState = { step, showCalendar: false };
      window.history.pushState(newState, "");
      setStateInternal(newState);
    },
    [],
  );

  /**
   * Show or hide the calendar view. The current step index is preserved so
   * that hiding the calendar returns to the same step.
   */
  const setShowCalendar = useCallback((showCalendar: boolean) => {
    const newState: NavHistoryState = { ...stateRef.current, showCalendar };
    window.history.pushState(newState, "");
    setStateInternal(newState);
  }, []);

  /**
   * Reset navigation back to step 0 without calendar. Uses replaceState so
   * the reset itself doesn't become a navigable history entry.
   */
  const resetNav = useCallback(() => {
    const newState: NavHistoryState = { step: 0, showCalendar: false };
    window.history.replaceState(newState, "");
    setStateInternal(newState);
  }, []);

  /**
   * Sets the wizard step without pushing a history entry (replaces current).
   * Use when correcting an invalid step index (e.g. skipped steps).
   */
  const replaceActive = useCallback((step: number) => {
    const newState: NavHistoryState = { step, showCalendar: false };
    window.history.replaceState(newState, "");
    setStateInternal(newState);
  }, []);

  return {
    active: state.step,
    showCalendar: state.showCalendar,
    setActive,
    replaceActive,
    setShowCalendar,
    resetNav,
  };
}
