import type { StateCreator } from "zustand";
import type { AppStore } from "../types";
import { getEffectiveSchedule } from "schedule";
import {
  getValidSectionCombos,
  getEnrollmentsForCourse,
  enrollmentsOverlap,
  getFirstOverlapWith,
  generateSchedulesWithPinned,
  cacheWithPerCourseVirtualFilter,
  type CourseEnrollment,
  type GenerationConstraints,
} from "schedule";
import { normalizeCourseCode } from "schedule";
import { courseMatchesFilters } from "schedule";
import { isHonoursProject, canTakeCourse, buildPrereqContext } from "schedule";
import {
  isElectiveRequirementType,
  isWithinElectiveLevelCap,
  isWithinElectiveLevelBuckets,
  virtualScheduleFilterApplies,
} from "../../lib/electiveEligibility";

const validEnrollmentsByCourseCode = new Map<string, CourseEnrollment[]>();

export function clearEnrollmentsCache() {
  validEnrollmentsByCourseCode.clear();
}

interface SchedulesSlice {
  generateSchedules: AppStore["generateSchedules"];
  generateBasicSchedules: AppStore["generateBasicSchedules"];
  clearGeneratedSchedules: AppStore["clearGeneratedSchedules"];
  setSelectedScheduleIndex: AppStore["setSelectedScheduleIndex"];
  swapCourseInSchedule: AppStore["swapCourseInSchedule"];
  undoLastSwap: AppStore["undoLastSwap"];
  getSwapCandidates: AppStore["getSwapCandidates"];
}

export const createSchedulesSlice: StateCreator<
  AppStore,
  [],
  [],
  SchedulesSlice
> = (set, get) => ({
  generateSchedules: async (options) => {
    const { generateSchedulesAction } = await import("../../lib/generateSchedulesAction");
    const result = await generateSchedulesAction(get(), options);
    if (result) {
      set(result);
    }
  },

  generateBasicSchedules: async (options) => {
    const { generateSchedulesAction } = await import("../../lib/generateSchedulesAction");
    const result = await generateSchedulesAction(get(), options);
    if (result) {
      set(result);
    }
  },

  clearGeneratedSchedules: () =>
    set((state) => {
      const alreadyCleared =
        state.generatedSchedules.length === 0 &&
        state.hasMoreSchedules === true &&
        state.scheduleColorMaps.length === 0 &&
        state.schedulePoolMaps.length === 0 &&
        state.selectedScheduleIndex === 0 &&
        state.generationError === null;
      if (alreadyCleared) return state;
      return {
        generatedSchedules: [],
        hasMoreSchedules: true,
        scheduleColorMaps: [],
        schedulePoolMaps: [],
        selectedScheduleIndex: 0,
        generationError: null,
      };
    }),

  setSelectedScheduleIndex: (idx) => set({ selectedScheduleIndex: idx }),

  swapCourseInSchedule: async (
    scheduleIndex,
    enrollmentIndex,
    newCourseCode,
    isUndo = false,
  ) => {
    const {
      wizardMode,
      basicPinnedCourses,
      generatedSchedules,
      cache,
      chosenCourseToRequirementId,
      schedulePoolMaps,
      scheduleColorMaps,
      generationMinStartMinutes,
      generationMaxEndMinutes,
      generationAllowedDays,
      generationMinProfessorRating,
      professorRatings,
      includeClosedComponents,
      virtualSectionsOnly,
      remainingRequirements,
      constrainedPerRequirement,
      selectedPerRequirement,
    } = get();
    if (!cache || scheduleIndex >= generatedSchedules.length) return;

    const schedule = generatedSchedules[scheduleIndex];
    const oldEnrollment = schedule.enrollments[enrollmentIndex];
    if (!oldEnrollment) return;

    const explicitExemptNormalized = new Set<string>();
    for (const codes of Object.values(constrainedPerRequirement)) {
      for (const code of codes) {
        explicitExemptNormalized.add(normalizeCourseCode(code));
      }
    }
    for (const codes of Object.values(selectedPerRequirement)) {
      for (const code of codes) {
        explicitExemptNormalized.add(normalizeCourseCode(code));
      }
    }

    let virtualOnlyForNewCourse: boolean;
    if (wizardMode === "basic") {
      // Basic mode only swaps electives; pinned "required" courses are excluded
      // from swap candidates, and schedule-generation uses per-course virtual filtering.
      virtualOnlyForNewCourse = virtualSectionsOnly;
    } else {
      const poolMap =
        schedulePoolMaps[scheduleIndex] ?? chosenCourseToRequirementId;
      const oldCode = oldEnrollment.courseCode;
      const reqId = poolMap[oldCode];
      const reqType = remainingRequirements.find(
        (r) => r.requirementId === reqId,
      )?.type;
      virtualOnlyForNewCourse = virtualScheduleFilterApplies(
        virtualSectionsOnly,
        reqType,
        newCourseCode,
        explicitExemptNormalized,
      );
    }

    const newSchedule = getEffectiveSchedule(
      cache,
      newCourseCode,
      includeClosedComponents,
      virtualOnlyForNewCourse,
    );
    if (!newSchedule) return;

    const constraints: GenerationConstraints = {
      minStartMinutes: generationMinStartMinutes,
      maxEndMinutes: generationMaxEndMinutes,
      allowedDays: generationAllowedDays,
      minProfessorRating: generationMinProfessorRating ?? undefined,
      professorRatings: professorRatings ?? undefined,
    };

    if (wizardMode === "basic") {
      const allCodes = schedule.enrollments.map(e => e.courseCode);
      allCodes[enrollmentIndex] = newCourseCode;
      
      const pinnedNormalized = new Set(
        basicPinnedCourses.map(normalizeCourseCode),
      );
      const effectiveCache = cacheWithPerCourseVirtualFilter(
        cache,
        includeClosedComponents,
        (code) =>
          virtualSectionsOnly &&
          !pinnedNormalized.has(normalizeCourseCode(code)),
      );
      
      const batch = generateSchedulesWithPinned(
        allCodes,
        [],
        allCodes.length,
        effectiveCache,
        constraints
      );
      
      const validSchedules = batch.filter((s) => s.enrollments.length >= allCodes.length);
      if (validSchedules.length > 0) {
        const newSchedules = [...generatedSchedules];
        newSchedules[scheduleIndex] = validSchedules[0];
        
        // Carry color map
        const oldColorMap = scheduleColorMaps[scheduleIndex] ?? {};
        const colorIdx = oldColorMap[oldEnrollment.courseCode];
        const { [oldEnrollment.courseCode]: _removed, ...mapWithoutOld } = oldColorMap;
        const nextColorMap = colorIdx !== undefined ? { ...mapWithoutOld, [newCourseCode]: colorIdx } : mapWithoutOld;
        const nextColorMaps = [...scheduleColorMaps];
        if (scheduleIndex < nextColorMaps.length) {
          nextColorMaps[scheduleIndex] = nextColorMap;
        }

        set({
          generatedSchedules: newSchedules,
          scheduleColorMaps: nextColorMaps,
          ...(isUndo
            ? {}
            : {
                swapHistory: [
                  ...get().swapHistory,
                  {
                    scheduleIndex,
                    enrollmentIndex,
                    previousCourseCode: oldEnrollment.courseCode,
                  },
                ],
              }),
        });
      }
      return;
    }

    const combos = getValidSectionCombos(newSchedule, constraints);
    const others = schedule.enrollments.filter((_, i) => i !== enrollmentIndex);

    for (const combo of combos) {
      const candidate = getEnrollmentsForCourse(newSchedule, combo);
      const conflicts = others.some((e) => enrollmentsOverlap(e, candidate));
      if (!conflicts) {
        const newEnrollments = [...schedule.enrollments];
        newEnrollments[enrollmentIndex] = candidate;
        const newSchedules = [...generatedSchedules];
        newSchedules[scheduleIndex] = { enrollments: newEnrollments };
        const oldCode = oldEnrollment.courseCode;
        const poolMap =
          schedulePoolMaps[scheduleIndex] ?? chosenCourseToRequirementId;
        const poolId = poolMap[oldCode];
        const nextMap =
          poolId != null ? { ...poolMap, [newCourseCode]: poolId } : poolMap;
        const nextPoolMaps = [...schedulePoolMaps];
        if (scheduleIndex < nextPoolMaps.length) {
          nextPoolMaps[scheduleIndex] = nextMap;
        }
        // Carry the old course's colour index to the replacement course
        const oldColorMap = scheduleColorMaps[scheduleIndex] ?? {};
        const colorIdx = oldColorMap[oldCode];
        const { [oldCode]: _removed, ...mapWithoutOld } = oldColorMap;
        const nextColorMap =
          colorIdx !== undefined
            ? { ...mapWithoutOld, [newCourseCode]: colorIdx }
            : mapWithoutOld;
        const nextColorMaps = [...scheduleColorMaps];
        if (scheduleIndex < nextColorMaps.length) {
          nextColorMaps[scheduleIndex] = nextColorMap;
        }
        set({
          generatedSchedules: newSchedules,
          chosenCourseToRequirementId:
            scheduleIndex === 0 ? nextMap : chosenCourseToRequirementId,
          schedulePoolMaps: nextPoolMaps,
          scheduleColorMaps: nextColorMaps,
          ...(isUndo
            ? {}
            : {
                swapHistory: [
                  ...get().swapHistory,
                  {
                    scheduleIndex,
                    enrollmentIndex,
                    previousCourseCode: oldCode,
                  },
                ],
              }),
        });
        return;
      }
    }
  },

  undoLastSwap: () => {
    const { swapHistory } = get();
    if (swapHistory.length === 0) return;
    const last = swapHistory[swapHistory.length - 1];
    const { scheduleIndex, enrollmentIndex, previousCourseCode } = last;
    set({ swapHistory: swapHistory.slice(0, -1) });
    void get().swapCourseInSchedule(
      scheduleIndex,
      enrollmentIndex,
      previousCourseCode,
      true,
    );
  },

  getSwapCandidates: (scheduleIndex, enrollmentIndex) => {
    const {
      wizardMode,
      basicPinnedCourses,
      basicExcludedCategories,
      studentPrograms,
      cache,
      generatedSchedules,
      remainingRequirements,
      chosenCourseToRequirementId,
      schedulePoolMaps,
      completedCourses,
      prereqEligibleCourses,
      levelBuckets,
      languageBuckets,
      electiveLevelBuckets,
      generationMinStartMinutes,
      generationMaxEndMinutes,
      generationAllowedDays,
      generationMinProfessorRating,
      professorRatings,
      includeClosedComponents,
      virtualSectionsOnly,
      filteredPrereqEligibleCourses,
      constrainedPerRequirement,
      selectedPerRequirement,
    } = get();
    if (!cache || scheduleIndex >= generatedSchedules.length) {
      return { candidates: [], poolCourses: [], rejectedWithConflict: [] };
    }

    const cacheVal = cache;
    const schedule = generatedSchedules[scheduleIndex];
    const enrollment = schedule.enrollments[enrollmentIndex];
    if (!enrollment) {
      return { candidates: [], poolCourses: [], rejectedWithConflict: [] };
    }

    const oldCode = enrollment.courseCode;

    if (wizardMode === "basic") {
      if (basicPinnedCourses.includes(oldCode)) {
        // Cannot swap required courses
        return { candidates: [], poolCourses: [], rejectedWithConflict: [] };
      }

      // Find valid electives
      const optionalPool: string[] = [];
      const excludedPrefixes = basicExcludedCategories.map(c => c.toLowerCase());
      const prereqCtx = buildPrereqContext(completedCourses, cacheVal, studentPrograms);
      const basicFilters = { levels: levelBuckets, languageBuckets };
      
      for (const course of cacheVal.getAllCourses()) {
        const code = course.code;
        if (code === oldCode) continue;
        if (!courseMatchesFilters(code, basicFilters)) continue;
        if (!isWithinElectiveLevelBuckets(code, electiveLevelBuckets)) continue;

        // Check exclusions
        const prefixMatch = code.match(/^([A-Z]{3,4})/i);
        const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : "";
        if (excludedPrefixes.includes(prefix)) continue;

        // Check prerequisites
        if (completedCourses.length > 0) {
          if (course.prerequisites) {
            if (!canTakeCourse(code, cacheVal, prereqCtx)) continue;
          } else if (course.prereqText) {
            continue;
          }
        } else {
          if (course.prerequisites || course.prereqText) continue;
        }
        
        // Check if already pinned or in schedule
        if (basicPinnedCourses.includes(code)) continue;
        const alreadyInSchedule = schedule.enrollments.some((e) => e.courseCode === code);
        if (alreadyInSchedule) continue;
        
        const sched = getEffectiveSchedule(
          cacheVal,
          code,
          includeClosedComponents,
          virtualSectionsOnly,
        );
        if (!sched) continue;
        
        const swapConstraints: GenerationConstraints = {
          minStartMinutes: generationMinStartMinutes,
          maxEndMinutes: generationMaxEndMinutes,
          allowedDays: generationAllowedDays,
          minProfessorRating: generationMinProfessorRating ?? undefined,
          professorRatings: professorRatings ?? undefined,
        };
        if (getValidSectionCombos(sched, swapConstraints).length === 0) continue;
        
        optionalPool.push(code);
      }

      return { candidates: optionalPool, poolCourses: optionalPool, requirementTitle: "Elective", rejectedWithConflict: [] };
    }

    const poolMap =
      schedulePoolMaps[scheduleIndex] ?? chosenCourseToRequirementId;
    const requirementId = poolMap[oldCode];
    const candidateSet = new Set<string>();
    let poolRequirementType: string | undefined;
    let requirementTitle: string | undefined;
    if (requirementId) {
      const req = remainingRequirements.find(
        (r) => r.requirementId === requirementId,
      );
      if (req?.candidateCourses?.length) {
        poolRequirementType = req.type;
        requirementTitle = req.title;
        for (const c of req.candidateCourses) candidateSet.add(c);
      }
    }
    if (candidateSet.size === 0) {
      const oldCodeNorm = normalizeCourseCode(oldCode);
      for (const req of remainingRequirements) {
        if (!req.candidateCourses?.length) continue;
        const hasOld = req.candidateCourses.some(
          (c) => normalizeCourseCode(c) === oldCodeNorm,
        );
        if (hasOld) {
          for (const c of req.candidateCourses) candidateSet.add(c);
        }
      }
    }
    if (candidateSet.size === 0) {
      for (const c of filteredPrereqEligibleCourses) candidateSet.add(c);
    }

    const explicitExemptNormalized = new Set<string>();
    for (const codes of Object.values(constrainedPerRequirement)) {
      for (const code of codes) explicitExemptNormalized.add(normalizeCourseCode(code));
    }
    for (const codes of Object.values(selectedPerRequirement)) {
      for (const code of codes) explicitExemptNormalized.add(normalizeCourseCode(code));
    }

    const others = schedule.enrollments.filter(
      (e, i) => i !== enrollmentIndex && e.courseCode !== oldCode,
    );
    const alreadyInSchedule = new Set(
      schedule.enrollments.map((e) => e.courseCode),
    );

    const prereqEligibleSet = new Set(prereqEligibleCourses);
    const swapConstraints: GenerationConstraints = {
      minStartMinutes: generationMinStartMinutes,
      maxEndMinutes: generationMaxEndMinutes,
      allowedDays: generationAllowedDays,
      minProfessorRating: generationMinProfessorRating ?? undefined,
      professorRatings: professorRatings ?? undefined,
    };

    function getValidEnrollmentsFor(code: string): CourseEnrollment[] {
      const virtualOnly = virtualScheduleFilterApplies(
        virtualSectionsOnly,
        poolRequirementType,
        code,
        explicitExemptNormalized,
      );
      const cacheKey = `${code}:${includeClosedComponents}:${virtualOnly}`;
      const cached = validEnrollmentsByCourseCode.get(cacheKey);
      if (cached) return cached;
      const sched = getEffectiveSchedule(
        cacheVal,
        code,
        includeClosedComponents,
        virtualOnly,
      );
      if (!sched) {
        validEnrollmentsByCourseCode.set(cacheKey, []);
        return [];
      }
      const combos = getValidSectionCombos(sched, swapConstraints);
      const enrollments = combos.map((combo) =>
        getEnrollmentsForCourse(sched, combo),
      );
      validEnrollmentsByCourseCode.set(cacheKey, enrollments);
      return enrollments;
    }

    const filters = { levels: levelBuckets, languageBuckets };

    const candidates: string[] = [];
    const rejectedWithConflict: Array<{ code: string; conflictsWith: string }> = [];
    for (const code of candidateSet) {
      if (!prereqEligibleSet.has(code)) continue;
      if (code === oldCode) continue;
      if (completedCourses.includes(code)) continue;
      if (alreadyInSchedule.has(code)) continue;
      if (isHonoursProject(code, cacheVal)) continue;
      if (!courseMatchesFilters(code, filters)) continue;
      
      const isElectiveType = isElectiveRequirementType(poolRequirementType);
      const isGenericElective =
        poolRequirementType === "free_elective" ||
        poolRequirementType === "non_discipline_elective" ||
        poolRequirementType === "faculty_elective" ||
        poolRequirementType === "elective";
      if (isElectiveType && !isWithinElectiveLevelCap(code)) continue;
      if (isGenericElective && electiveLevelBuckets.length > 0) {
        const match = code.match(/\d{4}/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!Number.isNaN(num)) {
            const bucket = Math.floor(num / 1000) * 1000;
            if (!electiveLevelBuckets.includes(bucket)) {
              continue;
            }
          }
        }
      }
      const possibleEnrollments = getValidEnrollmentsFor(code);
      if (possibleEnrollments.length === 0) continue;
      
      let added = false;
      for (const candidate of possibleEnrollments) {
        const conflicts = others.some((e) => enrollmentsOverlap(e, candidate));
        if (!conflicts) {
          candidates.push(code);
          added = true;
          break;
        }
      }
      if (!added && others.length > 0 && possibleEnrollments.length > 0) {
        const conflict = getFirstOverlapWith(possibleEnrollments[0], others);
        if (conflict) {
          rejectedWithConflict.push({
            code,
            conflictsWith: conflict.courseCode,
          });
        }
      }
    }
    const poolCourses = [...candidateSet];
    return { candidates, poolCourses, requirementTitle, rejectedWithConflict };
  },
});
