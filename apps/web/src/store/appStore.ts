import { create } from "zustand";
import { generateRandomSeed } from "schedule";
import type { AppStore } from "./types";
import { LOCAL_STORAGE_KEY } from "./constants";
import {
  createUrlSlice,
  createDataSlice,
  createConstraintsSlice,
  createSchedulesSlice,
  createSelectionSlice,
} from "./slices/index";

export type { AppState, AppActions, AppStore } from "./types";

export const useAppStore = create<AppStore>()((...a) => {
  const [set, get] = a;

  return {
    // Merge slices
    ...createDataSlice(...a),
    ...createUrlSlice(...a),
    ...createSelectionSlice(...a),
    ...createConstraintsSlice(...a),
    ...createSchedulesSlice(...a),

    // Initial State values that are cross-slice or global defaults
    catalogue: null,
    indices: null,
    schedulesData: null,
    cache: null,
    loading: false,
    error: null,
    terms: null,
    selectedTermId: null,
    availableYears: [],
    firstYear: null,
    yearCataloguePrograms: null,
    yearCatalogueCourses: null,
    yearCatalogueLoading: false,
    program: null,
    wizardMode: null,
    basicPinnedCourses: [],
    basicElectivesCount: 1,
    basicExcludedCategories: [],
    studentPrograms: [],
    completedCourses: [],
    remainingRequirements: [],
    requirementTreeWithStatus: [],
    completedRequirementsList: [],
    selectedPerRequirement: {},
    requirementSlotsUserTouched: {},
    selectedOptionsPerRequirement: {},
    constrainedPerRequirement: {},
    coursesThisSemester: 5,
    prereqEligibleCourses: [],
    filteredPrereqEligibleCourses: [],
    levelBuckets: ["undergrad"],
    languageBuckets: ["en", "other"],
    electiveLevelBuckets: [1000, 2000],
    generatedSchedules: [],
    swapPool: [],
    chosenCourseToRequirementId: {},
    schedulePoolMaps: [],
    scheduleColorMaps: [],
    selectedScheduleIndex: 0,
    generationError: null,
    unassignedCompletedCourses: [],
    swapHistory: [],
    generationMinStartMinutes: 8 * 60 + 30, // 8:30
    generationMaxEndMinutes: 22 * 60, // 22:00
    generationAllowedDays: ["Mo", "Tu", "We", "Th", "Fr"],
    generationSeed: generateRandomSeed(),
    includeClosedComponents: false,
    generationMinProfessorRating: null,
    professorRatings: null,
    generationLimitFirstYearCredits: true,
    generationCompressedSchedule: false,

    // Global action: touches many states
    resetToDefault: () => {
      const {
        catalogue,
        indices,
        schedulesData,
        cache,
        loading,
        error,
        availableYears,
      } = get();
      set({
        catalogue,
        indices,
        schedulesData,
        cache,
        loading,
        error,
        availableYears,
        firstYear: null,
        wizardMode: null,
        basicPinnedCourses: [],
        basicElectivesCount: 1,
        basicExcludedCategories: [],
        yearCataloguePrograms: null,
        yearCatalogueCourses: null,
        yearCatalogueLoading: false,
        program: null,
        completedCourses: [],
        remainingRequirements: [],
        requirementTreeWithStatus: [],
        completedRequirementsList: [],
        selectedPerRequirement: {},
        requirementSlotsUserTouched: {},
        selectedOptionsPerRequirement: {},
        constrainedPerRequirement: {},
        coursesThisSemester: 5,
        prereqEligibleCourses: [],
        filteredPrereqEligibleCourses: [],
        levelBuckets: ["undergrad"],
        languageBuckets: ["en", "other"],
        electiveLevelBuckets: [1000, 2000],
        generatedSchedules: [],
        swapPool: [],
        chosenCourseToRequirementId: {},
        schedulePoolMaps: [],
        scheduleColorMaps: [],
        selectedScheduleIndex: 0,
        generationError: null,
        unassignedCompletedCourses: [],
        swapHistory: [],
        generationSeed: generateRandomSeed(),
        includeClosedComponents: false,
      });
      if (typeof window !== "undefined") {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    },
  };
});
