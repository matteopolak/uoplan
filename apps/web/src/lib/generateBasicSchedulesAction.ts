import type { AppState } from "../store/appStore";
import type { GenerationErrorState } from "../store/types";
import { createSeededRng } from "schedule";
import {
  generateSchedulesWithPinned,
  getValidSectionCombos,
  type GeneratedSchedule,
  type GenerationConstraints,
  courseMatchesFilters,
} from "schedule";
import {
  cacheWithClosedFilter,
  cacheWithPerCourseVirtualFilter,
  normalizeCourseCode,
} from "schedule";
import { shuffleInPlace } from "../store/scheduleHelpers";
import { diagnoseTimetableFailure, canTakeCourse, buildPrereqContext } from "schedule";
import { buildColorMap, buildColorMaps } from "./colorMap";
import { isWithinElectiveLevelBuckets } from "./electiveEligibility";

export interface GenerateBasicSchedulesResult {
  generatedSchedules: GeneratedSchedule[];
  swapPool: string[];
  chosenCourseToRequirementId: Record<string, string>;
  schedulePoolMaps: Record<string, string>[];
  scheduleColorMaps: Record<string, number>[];
  selectedScheduleIndex: number;
  swapHistory: never[];
  hasMoreSchedules: boolean;
  generationError: GenerationErrorState | null;
}

export function generateBasicSchedulesAction(
  state: AppState,
  options?: { appendFirstOnly?: boolean }
): GenerateBasicSchedulesResult | null {
  const appendFirstOnly = options?.appendFirstOnly ?? false;
  const {
    cache,
    basicPinnedCourses,
    basicElectivesCount,
    basicExcludedCategories,
    levelBuckets,
    languageBuckets,
    electiveLevelBuckets,
    generationMinStartMinutes,
    generationMaxEndMinutes,
    generationAllowedDays,
    generationMinProfessorRating,
    professorRatings,
    generationSeed,
    includeClosedComponents,
    virtualSectionsOnly,
    scheduleColorMaps: existingColorMaps,
    completedCourses,
    studentPrograms,
  } = state;

  if (!cache) {
    return null;
  }

  const pinned = basicPinnedCourses;
  const pinnedNormalized = new Set(pinned.map(normalizeCourseCode));
  const baseCache = cacheWithClosedFilter(cache, includeClosedComponents, false);
  const effectiveCache = cacheWithPerCourseVirtualFilter(
    cache,
    includeClosedComponents,
    (code) => virtualSectionsOnly && !pinnedNormalized.has(normalizeCourseCode(code)),
  );

  const existingScheduleCount = appendFirstOnly ? state.generatedSchedules.length : 0;
  const rng = createSeededRng(((generationSeed >>> 0) + existingScheduleCount) >>> 0);

  const deadline = Date.now() + 2000;
  const constraints: GenerationConstraints = {
    minStartMinutes: generationMinStartMinutes,
    maxEndMinutes: generationMaxEndMinutes,
    allowedDays: generationAllowedDays,
    minProfessorRating: generationMinProfessorRating ?? undefined,
    professorRatings: professorRatings ?? undefined,
    deadline,
  };

  const targetCount = pinned.length + basicElectivesCount;
  
  // Find valid electives
  const optionalPool: string[] = [];
  const excludedPrefixes = basicExcludedCategories.map(c => c.toLowerCase());
  const filters = { levels: levelBuckets, languageBuckets };
  
  const prereqCtx = buildPrereqContext(completedCourses, baseCache, studentPrograms);

  for (const course of cache.getAllCourses()) {
    const code = course.code;
    if (!courseMatchesFilters(code, filters)) continue;
    if (!isWithinElectiveLevelBuckets(code, electiveLevelBuckets)) continue;
    
    // Check exclusions
    const prefixMatch = code.match(/^([A-Z]{3,4})/i);
    const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : "";
    if (excludedPrefixes.includes(prefix)) continue;

    // Check prerequisites
    if (completedCourses.length > 0) {
      if (course.prerequisites) {
        if (!canTakeCourse(code, effectiveCache, prereqCtx)) continue;
      } else if (course.prereqText) {
        // If it has text but no structured prereqs, we can't be sure they meet them. Skip to be safe.
        continue;
      }
    } else {
      // No completed courses: must have NO prerequisites
      if (course.prerequisites || course.prereqText) continue;
    }
    
    // Check if already pinned
    if (pinned.includes(code)) continue;
    
    const sched = effectiveCache.getSchedule(code);
    if (!sched) continue;
    
    if (getValidSectionCombos(sched, constraints).length === 0) continue;
    
    optionalPool.push(code);
  }
  
  shuffleInPlace(optionalPool, rng);

  let finalSchedules: GeneratedSchedule[] = [];
  
  const batch = generateSchedulesWithPinned(
    pinned,
    optionalPool,
    targetCount,
    effectiveCache,
    constraints,
  );
  
  finalSchedules = batch.filter((s) => s.enrollments.length >= targetCount);

  const swapPool = [...new Set([...pinned, ...optionalPool])];
  const limit = appendFirstOnly ? 1 : 25;
  const limitedSchedules = finalSchedules.slice(0, limit);

  if (appendFirstOnly && limitedSchedules.length > 0) {
    const newSchedules = [...state.generatedSchedules, limitedSchedules[0]];
    const newSwapPool = [
      ...new Set([
        ...state.swapPool,
        ...limitedSchedules[0].enrollments.map((e) => e.courseCode),
      ]),
    ];
    const prevColorMap = existingColorMaps[existingColorMaps.length - 1] ?? {};
    const newColorMaps = [...existingColorMaps, buildColorMap(limitedSchedules[0], prevColorMap)];
    return {
      generatedSchedules: newSchedules,
      swapPool: newSwapPool,
      chosenCourseToRequirementId: {},
      schedulePoolMaps: [],
      scheduleColorMaps: newColorMaps,
      selectedScheduleIndex: newSchedules.length - 1,
      swapHistory: [],
      hasMoreSchedules: Date.now() <= deadline,
      generationError: null,
    };
  }

  if (limitedSchedules.length === 0) {
    const timetableFailure = diagnoseTimetableFailure({
      pinnedCourseCodes: pinned,
      optionalCourseCodes: optionalPool,
      targetCount: targetCount,
      cache: effectiveCache,
      constraints,
    });
    
    return {
      generatedSchedules: limitedSchedules,
      swapPool,
      chosenCourseToRequirementId: {},
      schedulePoolMaps: [],
      scheduleColorMaps: [],
      selectedScheduleIndex: 0,
      swapHistory: [],
      hasMoreSchedules: false,
      generationError: {
        message: timetableFailure.leadMessage,
        details: {
          emptyPools: [],
          totalAvailable: pinned.length + optionalPool.length,
          totalNeeded: targetCount,
          timetableFailure
        }
      },
    };
  }

  return {
    generatedSchedules: limitedSchedules,
    swapPool,
    chosenCourseToRequirementId: {},
    schedulePoolMaps: [],
    scheduleColorMaps: buildColorMaps(limitedSchedules),
    selectedScheduleIndex: 0,
    swapHistory: [],
    hasMoreSchedules: Date.now() <= deadline,
    generationError: null,
  };
}
