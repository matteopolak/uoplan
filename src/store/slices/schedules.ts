import { StateCreator } from "zustand";
import type { AppStore } from "../types";
import { getEffectiveSchedule } from "../../lib/scheduleFilters";
import {
  getValidSectionCombos,
  getEnrollmentsForCourse,
  enrollmentsOverlap,
  getFirstOverlapWith,
  type CourseEnrollment,
  type GenerationConstraints,
} from "../../lib/scheduleGenerator";
import { normalizeCourseCode } from "../../lib/dataCache";
import { courseMatchesFilters } from "../../lib/courseFilters";
import { isHonoursProject } from "../../lib/utils/courseUtils";

const validEnrollmentsByCourseCode = new Map<string, CourseEnrollment[]>();

export function clearEnrollmentsCache() {
  validEnrollmentsByCourseCode.clear();
}

export interface SchedulesSlice {
  generateSchedules: AppStore["generateSchedules"];
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

  setSelectedScheduleIndex: (idx) => set({ selectedScheduleIndex: idx }),

  swapCourseInSchedule: (
    scheduleIndex,
    enrollmentIndex,
    newCourseCode,
    isUndo = false,
  ) => {
    const {
      generatedSchedules,
      cache,
      chosenCourseToRequirementId,
      schedulePoolMaps,
      generationMinStartMinutes,
      generationMaxEndMinutes,
      generationAllowedDays,
      generationMinProfessorRating,
      professorRatings,
      includeClosedComponents,
    } = get();
    if (!cache || scheduleIndex >= generatedSchedules.length) return;

    const schedule = generatedSchedules[scheduleIndex];
    const oldEnrollment = schedule.enrollments[enrollmentIndex];
    if (!oldEnrollment) return;

    const newSchedule = getEffectiveSchedule(
      cache,
      newCourseCode,
      includeClosedComponents,
    );
    if (!newSchedule) return;

    const constraints: GenerationConstraints = {
      minStartMinutes: generationMinStartMinutes,
      maxEndMinutes: generationMaxEndMinutes,
      allowedDays: generationAllowedDays,
      minProfessorRating: generationMinProfessorRating ?? undefined,
      professorRatings: professorRatings ?? undefined,
    };
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
        set({
          generatedSchedules: newSchedules,
          chosenCourseToRequirementId:
            scheduleIndex === 0 ? nextMap : chosenCourseToRequirementId,
          schedulePoolMaps: nextPoolMaps,
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
    get().swapCourseInSchedule(
      scheduleIndex,
      enrollmentIndex,
      previousCourseCode,
      true,
    );
  },

  getSwapCandidates: (scheduleIndex, enrollmentIndex) => {
    const {
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
      filteredPrereqEligibleCourses,
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
      const cacheKey = `${code}:${includeClosedComponents}`;
      const cached = validEnrollmentsByCourseCode.get(cacheKey);
      if (cached) return cached;
      const sched = getEffectiveSchedule(
        cacheVal,
        code,
        includeClosedComponents,
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
      
      const isGenericElective =
        poolRequirementType === "free_elective" ||
        poolRequirementType === "non_discipline_elective" ||
        poolRequirementType === "faculty_elective" ||
        poolRequirementType === "elective";
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
