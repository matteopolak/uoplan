import { StateCreator } from "zustand";
import type { AppStore } from "../types";
import { recomputeStateForProgram, getDisciplineCodesForProgram } from "../requirementCompute";
import { buildDataCache, normalizeCourseCode, withExtraCourses, isOptCourse } from "schedule";

function getMergedCatalogue(
  catalogue: any,
  yearCatalogueCourses: any,
  completedCourses: string[],
): any {
  if (!catalogue) return null;
  if (!yearCatalogueCourses) return catalogue;

  const completedSet = new Set(completedCourses.map(normalizeCourseCode));
  const yearMap = new Map(
    yearCatalogueCourses.map((c: any) => [normalizeCourseCode(c.code), c]),
  );

  const merged = new Map<string, any>();
  for (const course of yearCatalogueCourses) {
    merged.set(normalizeCourseCode(course.code), course);
  }

  for (const course of catalogue.courses) {
    const key = normalizeCourseCode(course.code);
    if (completedSet.has(key) && yearMap.has(key)) {
      continue;
    }
    merged.set(key, course);
  }

  return { ...catalogue, courses: Array.from(merged.values()) };
}

export interface SelectionSlice {
  setProgram: AppStore["setProgram"];
  setStudentPrograms: AppStore["setStudentPrograms"];
  setCompletedCourses: AppStore["setCompletedCourses"];
  addCompletedCourse: AppStore["addCompletedCourse"];
  removeCompletedCourse: AppStore["removeCompletedCourse"];
  setSelectedForRequirement: AppStore["setSelectedForRequirement"];
  setSelectedOptionForRequirement: AppStore["setSelectedOptionForRequirement"];
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
  setProgram: (program) => {
    const studentPrograms = getDisciplineCodesForProgram(program);
    set({ program, studentPrograms });
    const {
      cache,
      completedCourses,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
    } = get();
    const state = recomputeStateForProgram(
      program,
      completedCourses,
      cache,
      {},
      {},
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
    );
    set(state);
  },

  setStudentPrograms: (programs) => {
    set({ studentPrograms: programs });
    const {
      program,
      cache,
      completedCourses,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
    } = get();
    const state = recomputeStateForProgram(
      program,
      completedCourses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      programs,
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
        const newCache = buildDataCache(effectiveCatalogue as any, schedulesData as any);
        set({ cache: newCache });
      }
    }
    const {
      program,
      cache: cacheAfterRebuild,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
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
      courses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
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
    const {
      program,
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
      completedCourses,
      cache,
      selectedPerRequirementNext,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
    );
    set(state);
  },

  setLevelBuckets: (buckets) => {
    set({ levelBuckets: buckets });
    const {
      program,
      cache,
      completedCourses,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
    } = get();
    const state = recomputeStateForProgram(
      program,
      completedCourses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      buckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
    );
    set(state);
  },

  setLanguageBuckets: (buckets) => {
    set({ languageBuckets: buckets });
    const {
      program,
      cache,
      completedCourses,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      includeClosedComponents,
      studentPrograms,
    } = get();
    const state = recomputeStateForProgram(
      program,
      completedCourses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      buckets,
      includeClosedComponents,
      studentPrograms,
    );
    set(state);
  },

  setElectiveLevelBuckets: (buckets) => {
    set({ electiveLevelBuckets: buckets });
  },

  setSelectedOptionForRequirement: (requirementId, optionIndex) => {
    set((s) => ({
      selectedOptionsPerRequirement: {
        ...s.selectedOptionsPerRequirement,
        [requirementId]: optionIndex,
      },
    }));
  },

  setCoursesThisSemester: (n) => set({ coursesThisSemester: n }),
});
