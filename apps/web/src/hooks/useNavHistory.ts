import { useCallback, useEffect, useState } from "react";
import type { WizardStep } from "../lib/wizardSteps";
import { useAppStore } from "../store/appStore";

type NavHistoryState = {
  step: WizardStep;
  showCalendar: boolean;
  furthestStep: WizardStep;
};

function getInitialNavState(): NavHistoryState {
  const hs = window.history.state as NavHistoryState | null;
  if (hs != null && typeof hs.step === "number") {
    return {
      step: hs.step,
      showCalendar: hs.showCalendar ?? false,
      furthestStep: hs.furthestStep ?? hs.step,
    };
  }
  return { step: 0, showCalendar: false, furthestStep: 0 };
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

  useEffect(() => {
    useAppStore.setState({ activeStep: state.step });
  }, [state.step]);

  // Keep the current history entry synchronized with our state shape so a
  // popstate fired back to any entry can still be handled.
  useEffect(() => {
    window.history.replaceState(
      {
        step: state.step,
        showCalendar: state.showCalendar,
        furthestStep: state.furthestStep,
      },
      "",
    );
  }, [state.furthestStep, state.showCalendar, state.step]);

  // Sync React state when the browser navigates back or forward.
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const s = e.state as NavHistoryState | null;
      if (s != null && typeof s.step === "number") {
        setStateInternal({
          step: s.step,
          showCalendar: s.showCalendar ?? false,
          furthestStep: s.furthestStep ?? s.step,
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
      setStateInternal((prev) => {
        const step =
          typeof stepOrUpdater === "function"
            ? stepOrUpdater(prev.step)
            : stepOrUpdater;
        const newState: NavHistoryState = {
          step,
          showCalendar: false,
          furthestStep: Math.max(prev.furthestStep, step) as WizardStep,
        };
        window.history.pushState(newState, "");
        return newState;
      });
    },
    [],
  );

  /**
   * Show or hide the calendar view. The current step index is preserved so
   * that hiding the calendar returns to the same step.
   */
  const setShowCalendar = useCallback((showCalendar: boolean) => {
    setStateInternal((prev) => {
      const newState: NavHistoryState = { ...prev, showCalendar };
      window.history.pushState(newState, "");
      return newState;
    });
  }, []);

  /**
   * Reset navigation back to step 0 without calendar. Uses replaceState so
   * the reset itself doesn't become a navigable history entry.
   */
  const resetNav = useCallback(() => {
    const newState: NavHistoryState = { step: 0, showCalendar: false, furthestStep: 0 };
    window.history.replaceState(newState, "");
    setStateInternal(newState);
  }, []);

  /**
   * Sets the wizard step without pushing a history entry (replaces current).
   * Use when correcting an invalid step index (e.g. skipped steps).
   */
  const replaceActive = useCallback((step: number) => {
    setStateInternal((prev) => {
      const newState: NavHistoryState = {
        step,
        showCalendar: false,
        furthestStep: Math.max(prev.furthestStep, step) as WizardStep,
      };
      window.history.replaceState(newState, "");
      return newState;
    });
  }, []);

  return {
    active: state.step,
    showCalendar: state.showCalendar,
    furthestStep: state.furthestStep,
    setActive,
    replaceActive,
    setShowCalendar,
    resetNav,
  };
}
