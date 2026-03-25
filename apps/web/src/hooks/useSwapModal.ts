import { useState, useEffect, useMemo, useCallback } from "react";
import type { DataCache } from "schedule";

/**
 * Type for the swap candidates getter function.
 */
export type SwapCandidatesGetter = (
  scheduleIndex: number,
  enrollmentIndex: number
) => {
  candidates: string[];
  poolCourses: string[];
  requirementTitle?: string;
  rejectedWithConflict: Array<{ code: string; conflictsWith: string }>;
};

/**
 * State for the swap modal.
 */
export interface SwapModalState {
  enrollmentIndex: number;
  courseCode: string;
}

/**
 * Result from the swap candidates getter.
 */
export interface SwapResult {
  candidates: string[];
  poolCourses: string[];
  requirementTitle?: string;
  rejectedWithConflict: Array<{ code: string; conflictsWith: string }>;
}

/**
 * Option for the swap dropdown.
 */
export interface SwapCandidateOption {
  value: string;
  label: string;
  disabled: boolean;
  conflictsWith?: string;
}

const EMPTY_SWAP_RESULT: SwapResult = {
  candidates: [],
  poolCourses: [],
  rejectedWithConflict: [],
};

/**
 * Hook for managing swap modal state and loading candidates.
 * 
 * @param getSwapCandidates - Function to fetch swap candidates
 * @param selectedIndex - Currently selected schedule index
 * @param cache - Data cache for looking up course info
 */
export function useSwapModal(
  getSwapCandidates: SwapCandidatesGetter,
  selectedIndex: number,
  cache: DataCache | null
) {
  const [swapModal, setSwapModal] = useState<SwapModalState | null>(null);
  const [swapResult, setSwapResult] = useState<SwapResult>(EMPTY_SWAP_RESULT);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  // Load candidates when modal opens
  useEffect(() => {
    if (!swapModal) {
      setSwapResult(EMPTY_SWAP_RESULT);
      setLoading(false);
      setQuery("");
      return;
    }
    setLoading(true);
    setSwapResult(EMPTY_SWAP_RESULT);
    setQuery("");

    // Defer to let modal paint before heavier work
    const t = window.setTimeout(() => {
      const next = getSwapCandidates(selectedIndex, swapModal.enrollmentIndex);
      setSwapResult(next);
      setLoading(false);
    }, 0);

    return () => window.clearTimeout(t);
  }, [getSwapCandidates, selectedIndex, swapModal]);

  // Build dropdown options from candidates
  const candidateOptions = useMemo<SwapCandidateOption[]>(() => {
    const valid = swapResult.candidates.map((code) => {
      const course = cache?.getCourse(code);
      const title = (course?.title ?? "").trim();
      return {
        value: code,
        label: title ? `${code} — ${title}` : code,
        disabled: false as const,
      };
    });

    const rejected = (swapResult.rejectedWithConflict ?? []).map(
      ({ code, conflictsWith }) => {
        const course = cache?.getCourse(code);
        const title = (course?.title ?? "").trim();
        const label = title ? `${code} — ${title}` : code;
        return {
          value: `__rejected:${code}`,
          label,
          disabled: true as const,
          conflictsWith,
        };
      }
    );

    return [...valid, ...rejected];
  }, [cache, swapResult.candidates, swapResult.rejectedWithConflict]);

  const openModal = useCallback(
    (enrollmentIndex: number, courseCode: string) => {
      setSwapModal({ enrollmentIndex, courseCode });
    },
    []
  );

  const closeModal = useCallback(() => {
    setSwapModal(null);
  }, []);

  return {
    // Modal state
    isOpen: swapModal !== null,
    modalState: swapModal,
    openModal,
    closeModal,

    // Loading state
    loading,

    // Results
    result: swapResult,
    candidateOptions,

    // Search
    query,
    setQuery,
  };
}
