import type { StateCreator } from "zustand";
import type { AppStore } from "../types";
import { recomputeStateForProgram, getDisciplineCodesForProgram } from "../requirementCompute";
import {
  buildDataCache,
  normalizeCourseCode,
  withExtraCourses,
  isOptCourse,
} from "schedule";
import { getMergedCatalogue } from "./catalogueUtils";
import { pruneOptionSelectionsForClear } from "../../components/requirements/requirementUtils";
import {
  DEFAULT_BASIC_ELECTIVE_LEVEL_BUCKETS,
  DEFAULT_BASIC_LANGUAGE_BUCKETS,
  DEFAULT_BASIC_LEVEL_BUCKETS,
} from "../../lib/electiveEligibility";


interface SelectionSlice {
  setWizardMode: AppStore["setWizardMode"];
  setBasicPinnedCourses: AppStore["setBasicPinnedCourses"];
  setBasicElectivesCount: AppStore["setBasicElectivesCount"];
  setBasicExcludedCategories: AppStore["setBasicExcludedCategories"];
  setProgram: AppStore["setProgram"];
  setMinorProgram: AppStore["setMinorProgram"];
  setStudentPrograms: AppStore["setStudentPrograms"];
  setCompletedCourses: AppStore["setCompletedCourses"];
  addCompletedCourse: AppStore["addCompletedCourse"];
  removeCompletedCourse: AppStore["removeCompletedCourse"];
  setSelectedForRequirement: AppStore["setSelectedForRequirement"];
  setConstrainedForRequirement: AppStore["setConstrainedForRequirement"];
  setSelectedOptionForRequirement: AppStore["setSelectedOptionForRequirement"];
  clearSelectedOptionForRequirement: AppStore["clearSelectedOptionForRequirement"];
  setCoursesThisSemester: AppStore["setCoursesThisSemester"];
  setLevelBuckets: AppStore["setLevelBuckets"];
  setLanguageBuckets: AppStore["setLanguageBuckets"];
  setElectiveLevelBuckets: AppStore["setElectiveLevelBuckets"];
}

export const createSelectionSlice: StateCreator<
  AppStore,
  [],
  [],
  SelectionSlice
> = (set, get) => ({
  setWizardMode: (mode) =>
    set((state) => {
      if (mode !== "basic") {
        return { wizardMode: mode };
      }

      const hasUntouchedDefaults =
        state.levelBuckets.length === 1 &&
        state.levelBuckets[0] === "undergrad" &&
        state.languageBuckets.length === 2 &&
        state.languageBuckets.includes("en") &&
        state.languageBuckets.includes("other") &&
        state.electiveLevelBuckets.length === 2 &&
        state.electiveLevelBuckets.includes(1000) &&
        state.electiveLevelBuckets.includes(2000);

      if (!hasUntouchedDefaults) {
        return { wizardMode: mode };
      }

      return {
        wizardMode: mode,
        levelBuckets: [...DEFAULT_BASIC_LEVEL_BUCKETS],
        languageBuckets: [...DEFAULT_BASIC_LANGUAGE_BUCKETS],
        electiveLevelBuckets: [...DEFAULT_BASIC_ELECTIVE_LEVEL_BUCKETS],
      };
    }),
  setBasicPinnedCourses: (courses) => set({ basicPinnedCourses: courses }),
  setBasicElectivesCount: (count) => set({ basicElectivesCount: count }),
  setBasicExcludedCategories: (categories) => set({ basicExcludedCategories: categories }),

  setProgram: (program) => {
    const studentPrograms = getDisciplineCodesForProgram(program);
    set({
      program,
      minorProgram: null, // Clear minor when main program changes
      studentPrograms,
      constrainedPerRequirement: {},
      requirementSlotsUserTouched: {},
    });
    const {
      cache,
      completedCourses,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
    } = get();
    const state = recomputeStateForProgram(
      program,
      null, // minor is null
      completedCourses,
      cache,
      {},
      {},
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
      {},
    );
    set(state);
  },

  setMinorProgram: (minorProgram) => {
    set({
      minorProgram,
      constrainedPerRequirement: {},
      requirementSlotsUserTouched: {},
    });
    const {
      program,
      cache,
      completedCourses,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
    } = get();
    const state = recomputeStateForProgram(
      program,
      minorProgram,
      completedCourses,
      cache,
      {},
      {},
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
      {},
    );
    set(state);
  },

  setStudentPrograms: (programs) => {
    set({ studentPrograms: programs });
    const {
      program,
      minorProgram,
      cache,
      completedCourses,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      requirementSlotsUserTouched,
    } = get();
    const state = recomputeStateForProgram(
      program,
      minorProgram,
      completedCourses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      programs,
      requirementSlotsUserTouched,
    );
    set(state);
  },

  setCompletedCourses: (courses) => {
    set({ completedCourses: courses });
    const {
      catalogue,
      yearCatalogueCourses,
      schedulesData,
    } = get();
    if (yearCatalogueCourses && catalogue && schedulesData) {
      const effectiveCatalogue = getMergedCatalogue(catalogue, yearCatalogueCourses, courses);
      if (effectiveCatalogue) {
        const newCache = buildDataCache(effectiveCatalogue, schedulesData);
        set({ cache: newCache });
      }
    }
    const {
      program,
      minorProgram,
      cache: cacheAfterRebuild,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
      requirementSlotsUserTouched,
    } = get();

    // Inject fake course entries for OPT transfer credit codes so they flow through
    // the standard catalogue-based logic (prerequisite checks, elective candidates, etc.)
    const optCodes = courses.map(normalizeCourseCode).filter(isOptCourse);
    const cache = cacheAfterRebuild && optCodes.length > 0
      ? withExtraCourses(cacheAfterRebuild, optCodes.map((code) => ({ code, title: code, credits: 3, description: '' })))
      : cacheAfterRebuild;
    if (cache !== cacheAfterRebuild) set({ cache });

    const state = recomputeStateForProgram(
      program,
      minorProgram,
      courses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
      requirementSlotsUserTouched,
    );
    set(state);
  },

  addCompletedCourse: (code) => {
    const { completedCourses } = get();
    if (completedCourses.includes(code)) return;
    get().setCompletedCourses([...completedCourses, code]);
  },

  removeCompletedCourse: (code) => {
    const { completedCourses } = get();
    get().setCompletedCourses(completedCourses.filter((c) => c !== code));
  },

  setSelectedForRequirement: (requirementId, courses) => {
    const prev = get().selectedPerRequirement;
    const selectedPerRequirementNext = { ...prev, [requirementId]: courses };
    const requirementSlotsUserTouchedNext: Record<string, true> = {
      ...get().requirementSlotsUserTouched,
      [requirementId]: true as const,
    };
    const {
      program,
      minorProgram,
      cache,
      completedCourses,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
    } = get();
    const state = recomputeStateForProgram(
      program,
      minorProgram,
      completedCourses,
      cache,
      selectedPerRequirementNext,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
      requirementSlotsUserTouchedNext,
    );
    set({ ...state, requirementSlotsUserTouched: requirementSlotsUserTouchedNext });
  },

  setLevelBuckets: (buckets) => {
    set({ levelBuckets: buckets });
    const {
      program,
      minorProgram,
      cache,
      completedCourses,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
      requirementSlotsUserTouched,
    } = get();
    const state = recomputeStateForProgram(
      program,
      minorProgram,
      completedCourses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      buckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
      requirementSlotsUserTouched,
    );
    set(state);
  },

  setLanguageBuckets: (buckets) => {
    set({ languageBuckets: buckets });
    const {
      program,
      minorProgram,
      cache,
      completedCourses,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      includeClosedComponents,
      studentPrograms,
      requirementSlotsUserTouched,
    } = get();
    const state = recomputeStateForProgram(
      program,
      minorProgram,
      completedCourses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      buckets,
      includeClosedComponents,
      studentPrograms,
      requirementSlotsUserTouched,
    );
    set(state);
  },

  setElectiveLevelBuckets: (buckets) => {
    set({ electiveLevelBuckets: buckets });
  },

  setSelectedOptionForRequirement: (requirementId, optionIndex) => {
    const selectedOptionsPerRequirementNext = {
      ...get().selectedOptionsPerRequirement,
      [requirementId]: optionIndex,
    };
    const {
      program,
      minorProgram,
      cache,
      completedCourses,
      selectedPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
      requirementSlotsUserTouched,
    } = get();
    const state = recomputeStateForProgram(
      program,
      minorProgram,
      completedCourses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirementNext,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
      requirementSlotsUserTouched,
    );
    set(state);
  },

  clearSelectedOptionForRequirement: (requirementId) => {
    const selectedOptionsPerRequirementNext = pruneOptionSelectionsForClear(
      get().selectedOptionsPerRequirement,
      requirementId,
    );
    const {
      program,
      minorProgram,
      cache,
      completedCourses,
      selectedPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
      requirementSlotsUserTouched,
    } = get();
    const state = recomputeStateForProgram(
      program,
      minorProgram,
      completedCourses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirementNext,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
      requirementSlotsUserTouched,
    );
    set(state);
  },

  setConstrainedForRequirement: (requirementId, courses) => {
    set((s) => ({
      constrainedPerRequirement: {
        ...s.constrainedPerRequirement,
        [requirementId]: courses,
      },
    }));
  },

  setCoursesThisSemester: (n) => set({ coursesThisSemester: n }),
});
