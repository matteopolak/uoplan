import type { StateCreator } from "zustand";
import type { AppStore } from "../types";
import { getEffectiveSchedule, generateRandomSeed } from "schedule";
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
  clearSchedule: AppStore["clearSchedule"];
  markBasicSettingsChanged: AppStore["markBasicSettingsChanged"];
  goToPreviousSeed: AppStore["goToPreviousSeed"];
  goToNextSeed: AppStore["goToNextSeed"];
  randomizeSeed: AppStore["randomizeSeed"];
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
  generateSchedules: async () => {
    const { generateSchedulesAction } = await import("../../lib/generateSchedulesAction");
    const state = get();
    // Ensure currentSeed is initialized on first generation
    const isFirstGen = state.currentSeed === 0;
    const effectiveState = isFirstGen
      ? { ...state, currentSeed: state.firstSeed }
      : state;
    const result = await generateSchedulesAction(effectiveState);
    if (result) {
      // On first generation, also set currentSeed to firstSeed in the store
      set(isFirstGen ? { ...result, currentSeed: state.firstSeed } : result);
    }
  },

  generateBasicSchedules: async () => {
    const { generateSchedulesAction } = await import("../../lib/generateSchedulesAction");
    const state = get();
    const isFirstGen = state.currentSeed === 0;
    const effectiveState = isFirstGen
      ? { ...state, currentSeed: state.firstSeed }
      : state;
    const result = await generateSchedulesAction(effectiveState);
    if (result) {
      set(isFirstGen ? { ...result, currentSeed: state.firstSeed } : result);
    }
  },

  clearSchedule: () =>
    set((state) => {
      const alreadyCleared =
        state.currentSchedule === null &&
        state.generationError === null;
      if (alreadyCleared) return state;
      return {
        currentSchedule: null,
        currentPoolMap: {},
        currentColorMap: {},
        currentSwaps: [],
        generationError: null,
      };
    }),

  markBasicSettingsChanged: () =>
    set({
      generationError: null,
    }),

  goToPreviousSeed: async () => {
    const state = get();
    if (state.currentSeed <= state.firstSeed) return;
    const newSeed = state.currentSeed - 1;
    set({ currentSeed: newSeed, currentSwaps: [] });
    const { generateSchedulesAction } = await import("../../lib/generateSchedulesAction");
    const result = await generateSchedulesAction({ ...get(), currentSeed: newSeed });
    if (result) {
      set(result);
    }
  },

  goToNextSeed: async () => {
    const state = get();
    const newSeed = state.currentSeed + 1;
    set({ currentSeed: newSeed, currentSwaps: [] });
    const { generateSchedulesAction } = await import("../../lib/generateSchedulesAction");
    const result = await generateSchedulesAction({ ...get(), currentSeed: newSeed });
    if (result) {
      set(result);
    }
  },

  randomizeSeed: async () => {
    const newFirstSeed = generateRandomSeed();
    set({ firstSeed: newFirstSeed, currentSeed: newFirstSeed, currentSwaps: [] });
    const { generateSchedulesAction } = await import("../../lib/generateSchedulesAction");
    const result = await generateSchedulesAction({ ...get(), firstSeed: newFirstSeed, currentSeed: newFirstSeed });
    if (result) {
      set(result);
    }
  },

  swapCourseInSchedule: async (enrollmentIndex, newCourseCode) => {
    const {
      wizardMode,
      basicPinnedCourses,
      currentSchedule,
      cache,
      chosenCourseToRequirementId,
      currentPoolMap,
      currentColorMap,
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
    if (!cache || !currentSchedule) return;

    const schedule = currentSchedule;
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
      virtualOnlyForNewCourse = virtualSectionsOnly;
    } else {
      const oldCode = oldEnrollment.courseCode;
      const reqId = currentPoolMap[oldCode] ?? chosenCourseToRequirementId[oldCode];
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
      const allCodes = schedule.enrollments.map((e) => e.courseCode);
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
        constraints,
      );

      const validSchedules = batch.filter((s) => s.enrollments.length >= allCodes.length);
      if (validSchedules.length > 0) {
        const oldColorIdx = currentColorMap[oldEnrollment.courseCode];
        const { [oldEnrollment.courseCode]: _, ...mapWithoutOld } = currentColorMap;
        const nextColorMap = oldColorIdx !== undefined
          ? { ...mapWithoutOld, [newCourseCode]: oldColorIdx }
          : mapWithoutOld;

        set({
          currentSchedule: validSchedules[0],
          currentColorMap: nextColorMap,
          currentSwaps: [
            ...get().currentSwaps,
            { enrollmentIndex, courseCode: newCourseCode },
          ],
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
        const oldCode = oldEnrollment.courseCode;
        const poolId = currentPoolMap[oldCode] ?? chosenCourseToRequirementId[oldCode];
        const nextPoolMap = poolId != null
          ? { ...currentPoolMap, [newCourseCode]: poolId }
          : currentPoolMap;

        const oldColorIdx = currentColorMap[oldCode];
        const { [oldCode]: _, ...mapWithoutOld } = currentColorMap;
        const nextColorMap = oldColorIdx !== undefined
          ? { ...mapWithoutOld, [newCourseCode]: oldColorIdx }
          : mapWithoutOld;

        set({
          currentSchedule: { enrollments: newEnrollments },
          currentPoolMap: nextPoolMap,
          currentColorMap: nextColorMap,
          currentSwaps: [
            ...get().currentSwaps,
            { enrollmentIndex, courseCode: newCourseCode },
          ],
        });
        return;
      }
    }
  },

  undoLastSwap: () => {
    const { currentSwaps } = get();
    if (currentSwaps.length === 0) return;
    // Remove the last swap and regenerate with original seed to get base schedule
    set({ currentSwaps: currentSwaps.slice(0, -1) });
    // Regenerate to get clean schedule, then re-apply remaining swaps
    void get().generateSchedules();
  },

  getSwapCandidates: (enrollmentIndex) => {
    const {
      wizardMode,
      basicPinnedCourses,
      basicExcludedCategories,
      studentPrograms,
      cache,
      currentSchedule,
      remainingRequirements,
      chosenCourseToRequirementId,
      currentPoolMap,
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
    if (!cache || !currentSchedule) {
      return { candidates: [], poolCourses: [], rejectedWithConflict: [] };
    }

    const schedule = currentSchedule;
    const enrollment = schedule.enrollments[enrollmentIndex];
    if (!enrollment) {
      return { candidates: [], poolCourses: [], rejectedWithConflict: [] };
    }

    const oldCode = enrollment.courseCode;

    if (wizardMode === "basic") {
      if (basicPinnedCourses.includes(oldCode)) {
        return { candidates: [], poolCourses: [], rejectedWithConflict: [] };
      }

      const optionalPool: string[] = [];
      const excludedPrefixes = basicExcludedCategories.map((c) => c.toLowerCase());
      const prereqCtx = buildPrereqContext(completedCourses, cache, studentPrograms);
      const basicFilters = { levels: levelBuckets, languageBuckets };

      for (const course of cache.getAllCourses()) {
        const code = course.code;
        if (code === oldCode) continue;
        if (!courseMatchesFilters(code, basicFilters)) continue;
        if (!isWithinElectiveLevelBuckets(code, electiveLevelBuckets)) continue;

        const prefixMatch = code.match(/^([A-Z]{3,4})/i);
        const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : "";
        if (excludedPrefixes.includes(prefix)) continue;

        if (completedCourses.length > 0) {
          if (course.prerequisites) {
            if (!canTakeCourse(code, cache, prereqCtx)) continue;
          } else if (course.prereqText) {
            continue;
          }
        } else {
          if (course.prerequisites || course.prereqText) continue;
        }

        if (basicPinnedCourses.includes(code)) continue;
        const alreadyInSchedule = schedule.enrollments.some((e) => e.courseCode === code);
        if (alreadyInSchedule) continue;

        const sched = getEffectiveSchedule(
          cache,
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

    const poolId = currentPoolMap[oldCode] ?? chosenCourseToRequirementId[oldCode];
    const candidateSet = new Set<string>();
    let poolRequirementType: string | undefined;
    let requirementTitle: string | undefined;
    if (poolId) {
      const req = remainingRequirements.find((r) => r.requirementId === poolId);
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
        cache!,
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
      if (isHonoursProject(code, cache)) continue;
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
