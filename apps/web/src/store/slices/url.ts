import { StateCreator } from "zustand";
import type { AppStore } from "../types";
import {
  encodeState,
  encodeStateToBase64,
  stateToShareUrl,
  urlToSlug,
  type EncodeInput,
  requirementIdsFromTree,
  withExtraCourses,
  isOptCourse,
  normalizeCourseCode,
} from "schedule";
import { recomputeStateForProgram } from "../requirementCompute";
import type { Course } from "schemas";

export interface UrlSlice {
  loadEncodedState: AppStore["loadEncodedState"];
  getEncodedStateBase64: AppStore["getEncodedStateBase64"];
  getShareUrl: AppStore["getShareUrl"];
}

export const createUrlSlice: StateCreator<
  AppStore,
  [],
  [],
  UrlSlice
> = (set, get) => ({
  loadEncodedState: (decoded) => {
    const { catalogue, indices, cache: baseCache, yearCataloguePrograms } = get();
    if (!catalogue || !baseCache || !indices) return;

    let program = decoded.program;
    if (program != null && yearCataloguePrograms != null) {
      const slug = urlToSlug(program.url);
      const yearProgram = yearCataloguePrograms.find((p) => urlToSlug(p.url) === slug);
      if (yearProgram) program = yearProgram;
    }

    // Augment cache with fake entries for any OPT transfer credit codes
    const optCodes = decoded.completedCourseCodes.map(normalizeCourseCode).filter(isOptCourse);
    const cache = optCodes.length > 0
      ? withExtraCourses(baseCache, optCodes.map((code): Course => ({ code, title: code, credits: 3, description: '' })))
      : baseCache;

    const studentPrograms = decoded.studentPrograms;
    const firstPass = recomputeStateForProgram(
      program,
      decoded.completedCourseCodes,
      cache,
      {},
      {},
      decoded.levelBuckets,
      decoded.languageBuckets,
      decoded.includeClosedComponents ?? true,
      studentPrograms,
    );
    const orderedReqIds = requirementIdsFromTree(firstPass.requirementTreeWithStatus);
    const reqIndexToId = new Map<number, string>();
    orderedReqIds.forEach((id, i) => reqIndexToId.set(i, id));

    const selectedOptionsPerRequirement: Record<string, number> = {};
    for (const { reqIndex, optionIndex } of decoded.optionSelections) {
      const reqId = reqIndexToId.get(reqIndex);
      if (reqId != null) selectedOptionsPerRequirement[reqId] = optionIndex;
    }

    const inCatalogue = new Set(
      (catalogue.courses as Array<{ code: string }>).map((c) => c.code),
    );
    const selectedPerRequirement: Record<string, string[]> = {};
    for (const { reqIndex, courseCodes } of decoded.courseSelections) {
      const reqId = reqIndexToId.get(reqIndex);
      if (reqId == null) continue;
      const valid = courseCodes.filter(
        (code) => isOptCourse(normalizeCourseCode(code)) || inCatalogue.has(code),
      );
      if (valid.length) selectedPerRequirement[reqId] = valid;
    }

    const full = recomputeStateForProgram(
      program,
      decoded.completedCourseCodes,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      decoded.levelBuckets,
      decoded.languageBuckets,
      decoded.includeClosedComponents ?? true,
      studentPrograms,
    );

    set({
      program,
      studentPrograms,
      completedCourses: decoded.completedCourseCodes,
      cache,
      levelBuckets: decoded.levelBuckets,
      languageBuckets: decoded.languageBuckets,
      electiveLevelBuckets: decoded.electiveLevelBuckets,
      coursesThisSemester: decoded.coursesThisSemester,
      selectedScheduleIndex: Math.max(0, decoded.selectedScheduleIndex),
      generationSeed: decoded.generationSeed >>> 0,
      includeClosedComponents: decoded.includeClosedComponents ?? false,
      generatedSchedules: [],
      generationError: null,
      generationErrorDetails: null,
      ...(decoded.selectedTermId != null ? { selectedTermId: decoded.selectedTermId } : {}),
      ...(decoded.firstYear != null ? { firstYear: decoded.firstYear } : {}),
      ...full,
    });
  },

  getEncodedStateBase64: () => {
    const s = get();
    if (!s.catalogue || !s.indices) return null;
    const input: EncodeInput = {
      selectedTermId: s.selectedTermId,
      firstYear: s.firstYear,
      program: s.program,
      completedCourses: s.completedCourses,
      levelBuckets: s.levelBuckets,
      languageBuckets: s.languageBuckets,
      electiveLevelBuckets: s.electiveLevelBuckets,
      coursesThisSemester: s.coursesThisSemester,
      selectedScheduleIndex: s.selectedScheduleIndex,
      generationSeed: s.generationSeed >>> 0,
      selectedPerRequirement: s.selectedPerRequirement,
      selectedOptionsPerRequirement: s.selectedOptionsPerRequirement,
      requirementTreeWithStatus: s.requirementTreeWithStatus,
      remainingRequirements: s.remainingRequirements,
      includeClosedComponents: s.includeClosedComponents,
      studentPrograms: s.studentPrograms,
    };
    return encodeStateToBase64(
      input,
      s.catalogue as any,
      s.indices,
    );
  },

  getShareUrl: () => {
    const s = get();
    if (!s.catalogue || !s.indices) return null;
    const input: EncodeInput = {
      selectedTermId: s.selectedTermId,
      firstYear: s.firstYear,
      program: s.program,
      completedCourses: s.completedCourses,
      levelBuckets: s.levelBuckets,
      languageBuckets: s.languageBuckets,
      electiveLevelBuckets: s.electiveLevelBuckets,
      coursesThisSemester: s.coursesThisSemester,
      selectedScheduleIndex: s.selectedScheduleIndex,
      generationSeed: s.generationSeed >>> 0,
      selectedPerRequirement: s.selectedPerRequirement,
      selectedOptionsPerRequirement: s.selectedOptionsPerRequirement,
      requirementTreeWithStatus: s.requirementTreeWithStatus,
      remainingRequirements: s.remainingRequirements,
      includeClosedComponents: s.includeClosedComponents,
      studentPrograms: s.studentPrograms,
    };
    const bytes = encodeState(
      input,
      s.catalogue as any,
      s.indices,
    );
    if (!bytes) return null;
    return stateToShareUrl(bytes);
  },
});
