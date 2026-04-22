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
    minorProgram: null,
    wizardMode: null,
    basicPinnedCourses: [],
    basicElectivesCount: 0,
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
    currentSchedule: null,
    swapPool: [],
    chosenCourseToRequirementId: {},
    currentPoolMap: {},
    currentColorMap: {},
    generationError: null,
    unassignedCompletedCourses: [],
    currentSwaps: [],
    firstSeed: generateRandomSeed(),
    currentSeed: 0, // Will be set to firstSeed when first generated
    generationMinStartMinutes: 8 * 60 + 30, // 8:30
    generationMaxEndMinutes: 22 * 60, // 22:00
    generationAllowedDays: ["Mo", "Tu", "We", "Th", "Fr"],
    includeClosedComponents: false,
    virtualSectionsOnly: false,
    generationMinProfessorRating: null,
    professorRatings: null,
    generationLimitFirstYearCredits: true,
    generationCompressedSchedule: false,
    activeStep: 0,

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
        basicElectivesCount: 0,
        basicExcludedCategories: [],
        yearCataloguePrograms: null,
        yearCatalogueCourses: null,
        yearCatalogueLoading: false,
        program: null,
        minorProgram: null,
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
        currentSchedule: null,
        swapPool: [],
        chosenCourseToRequirementId: {},
        currentPoolMap: {},
        currentColorMap: {},
        generationError: null,
        unassignedCompletedCourses: [],
        currentSwaps: [],
        firstSeed: generateRandomSeed(),
        currentSeed: 0,
        includeClosedComponents: false,
        virtualSectionsOnly: false,
        activeStep: 0,
      });
      if (typeof window !== "undefined") {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    },
  };
});
