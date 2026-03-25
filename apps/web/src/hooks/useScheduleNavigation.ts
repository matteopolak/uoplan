import { useCallback, useEffect } from "react";

/**
 * Hook for schedule navigation with keyboard support.
 * Handles prev/next navigation and arrow key bindings.
 *
 * @param totalSchedules - Total number of schedules available
 * @param selectedIndex - Currently selected schedule index
 * @param setIndex - Callback to update the selected index
 * @param enabled - Whether keyboard navigation is enabled (default true)
 */
export function useScheduleNavigation(
  totalSchedules: number,
  selectedIndex: number,
  setIndex: (idx: number) => void,
  enabled: boolean = true
) {
  const handlePrev = useCallback(() => {
    if (totalSchedules === 0) return;
    const newIndex = selectedIndex > 0 ? selectedIndex - 1 : totalSchedules - 1;
    setIndex(newIndex);
  }, [selectedIndex, totalSchedules, setIndex]);

  const handleNext = useCallback(() => {
    if (totalSchedules === 0) return;
    const newIndex = selectedIndex < totalSchedules - 1 ? selectedIndex + 1 : 0;
    setIndex(newIndex);
  }, [selectedIndex, totalSchedules, setIndex]);

  const handleFirst = useCallback(() => {
    if (totalSchedules === 0) return;
    setIndex(0);
  }, [totalSchedules, setIndex]);

  const handleLast = useCallback(() => {
    if (totalSchedules === 0) return;
    setIndex(totalSchedules - 1);
  }, [totalSchedules, setIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!enabled || totalSchedules === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          handlePrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          handleNext();
          break;
        case "Home":
          e.preventDefault();
          handleFirst();
          break;
        case "End":
          e.preventDefault();
          handleLast();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, totalSchedules, handlePrev, handleNext, handleFirst, handleLast]);

  return {
    handlePrev,
    handleNext,
    handleFirst,
    handleLast,
    hasPrev: selectedIndex > 0,
    hasNext: selectedIndex < totalSchedules - 1,
    canNavigate: totalSchedules > 1,
  };
}
