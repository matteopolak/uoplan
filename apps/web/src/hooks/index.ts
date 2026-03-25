/**
 * Custom hooks index.
 * Import hooks from here for cleaner imports:
 *   import { useCalendarEvents, useShareUrl } from '../hooks';
 */

export { useCalendarEvents, type CalendarEvent } from "./useCalendarEvents";
export { useNavHistory } from "./useNavHistory";
export { usePersistState } from "./usePersistState";
export { useScheduleNavigation } from "./useScheduleNavigation";
export { useShareUrl } from "./useShareUrl";
export {
  useSwapModal,
  type SwapCandidatesGetter,
  type SwapModalState,
  type SwapResult,
  type SwapCandidateOption,
} from "./useSwapModal";
export { useTour, markTourComplete, resetTour } from "./useTour";
