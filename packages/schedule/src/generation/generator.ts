import type { DataCache } from '../dataCache';
import { isHonoursProject } from '../utils/courseUtils';
import { satisfiesCompressedConstraint } from './constraints';
import { enrollmentsOverlap } from './overlaps';
import { canonicalCourseCode, enrollmentForPicker, getValidSectionCombos } from './sectionCombos';
import type {
  CourseEnrollment,
  GeneratedSchedule,
  GenerationConstraints,
  PrecomputedCombo,
} from './types';

const MAX_SCHEDULES = 150;

export async function generateSchedules(
  courseCodes: string[],
  targetCount: number,
  cache: DataCache,
  constraints?: GenerationConstraints
): Promise<GeneratedSchedule[]> {
  const schedules: GeneratedSchedule[] = [];
  const coursesWithCombos: { code: string; combos: PrecomputedCombo[] }[] = [];
  let operationsSinceYield = 0;

  async function yieldToMainIfNeeded() {
    operationsSinceYield++;
    if (operationsSinceYield > 2000) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      operationsSinceYield = 0;
    }
  }

  for (const code of courseCodes) {
    if (isHonoursProject(code, cache)) {
      const combo = {};
      coursesWithCombos.push({
        code: canonicalCourseCode(code, cache),
        combos: [{ combo, enrollment: enrollmentForPicker(code, combo, cache) }],
      });
      continue;
    }
    const schedule = cache.getSchedule(code);
    if (!schedule) continue;
    const combos = getValidSectionCombos(schedule, constraints);
    if (combos.length > 0) {
      coursesWithCombos.push({
        code: schedule.courseCode,
        combos: combos.map((combo) => ({
          combo,
          enrollment: enrollmentForPicker(schedule.courseCode, combo, cache)
        })),
      });
    }
  }

  coursesWithCombos.sort((a, b) => a.combos.length - b.combos.length);

  if (coursesWithCombos.length < targetCount) {
    return [];
  }

  const nonFyRemainingAtIdx = new Array(coursesWithCombos.length + 1).fill(0) as number[];
  if (constraints?.maxFirstYearCredits != null) {
    let count = 0;
    for (let i = coursesWithCombos.length - 1; i >= 0; i--) {
      const code = coursesWithCombos[i].code;
      const m = code.match(/\d{4}/);
      if (!m || Number(m[0]) >= 2000) count++;
      nonFyRemainingAtIdx[i] = count;
    }
  }

  async function solve(
    courseIdx: number,
    selected: { code: string; combo: PrecomputedCombo }[],
    selectedCount: number,
    currentFyCredits: number
  ): Promise<boolean> {
    await yieldToMainIfNeeded();

    if (constraints?.deadline && Date.now() > constraints.deadline) return true;

    if (selectedCount === targetCount) {
      const enrollments: CourseEnrollment[] = selected.map(({ combo }) => combo.enrollment);
      if (constraints?.compressedSchedule && !satisfiesCompressedConstraint(enrollments)) {
        return false;
      }
      schedules.push({ enrollments });
      return (
        schedules.length >= MAX_SCHEDULES ||
        (constraints?.deadline != null && Date.now() > constraints.deadline)
      );
    }

    if (courseIdx === coursesWithCombos.length) return false;

    const remainingToPick = targetCount - selectedCount;
    if (coursesWithCombos.length - courseIdx < remainingToPick) {
      return false;
    }

    if (constraints?.maxFirstYearCredits != null) {
      const nonFyRemaining = nonFyRemainingAtIdx[courseIdx];
      const minFyCoursesForced = Math.max(0, remainingToPick - nonFyRemaining);
      if (currentFyCredits + (minFyCoursesForced * 3) > constraints.maxFirstYearCredits) {
        return false;
      }
    }

    const { code, combos } = coursesWithCombos[courseIdx];
    let courseFyCredits = 0;
    if (constraints?.maxFirstYearCredits != null) {
      const m = code.match(/\d{4}/);
      if (m && Number(m[0]) < 2000) {
        courseFyCredits = cache.getCourse(code)?.credits ?? 3;
      }
      if (currentFyCredits + courseFyCredits > constraints.maxFirstYearCredits) {
        if (await solve(courseIdx + 1, selected, selectedCount, currentFyCredits)) return true;
        return false;
      }
    }

    for (const precomputed of combos) {
      const candidate = precomputed.enrollment;
      const conflicts = selected.some(({ combo: co }) => enrollmentsOverlap(co.enrollment, candidate));
      if (conflicts) continue;

      selected.push({ code, combo: precomputed });
      if (await solve(courseIdx + 1, selected, selectedCount + 1, currentFyCredits + courseFyCredits)) return true;
      selected.pop();
    }

    if (await solve(courseIdx + 1, selected, selectedCount, currentFyCredits)) return true;

    return false;
  }

  await solve(0, [], 0, 0);

  return schedules;
}

export async function generateSchedulesWithPinned(
  pinnedCourseCodes: string[],
  optionalCourseCodes: string[],
  targetCount: number,
  cache: DataCache,
  constraints?: GenerationConstraints
): Promise<GeneratedSchedule[]> {
  if (pinnedCourseCodes.length > targetCount) {
    return [];
  }

  let operationsSinceYield = 0;

  async function yieldToMainIfNeeded() {
    operationsSinceYield++;
    if (operationsSinceYield > 2000) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      operationsSinceYield = 0;
    }
  }

  const pinned: { code: string; combos: PrecomputedCombo[] }[] = [];
  for (const code of pinnedCourseCodes) {
    if (isHonoursProject(code, cache)) {
      const combo = {};
      pinned.push({
        code: canonicalCourseCode(code, cache),
        combos: [{ combo, enrollment: enrollmentForPicker(code, combo, cache) }],
      });
      continue;
    }
    const schedule = cache.getSchedule(code);
    if (!schedule) return [];
    const combos = getValidSectionCombos(schedule, constraints);
    if (combos.length === 0) return [];
    pinned.push({
      code: schedule.courseCode,
      combos: combos.map(combo => ({
        combo,
        enrollment: enrollmentForPicker(schedule.courseCode, combo, cache)
      }))
    });
  }

  const optional: { code: string; combos: PrecomputedCombo[] }[] = [];
  for (const code of optionalCourseCodes) {
    if (pinnedCourseCodes.includes(code)) continue;
    if (isHonoursProject(code, cache)) {
      const combo = {};
      optional.push({
        code: canonicalCourseCode(code, cache),
        combos: [{ combo, enrollment: enrollmentForPicker(code, combo, cache) }],
      });
      continue;
    }
    const schedule = cache.getSchedule(code);
    if (!schedule) continue;
    const combos = getValidSectionCombos(schedule, constraints);
    if (combos.length > 0) {
      optional.push({
        code: schedule.courseCode,
        combos: combos.map(combo => ({
          combo,
          enrollment: enrollmentForPicker(schedule.courseCode, combo, cache)
        }))
      });
    }
  }

  optional.sort((a, b) => a.combos.length - b.combos.length);
  pinned.sort((a, b) => a.combos.length - b.combos.length);

  const schedules: GeneratedSchedule[] = [];

  async function findOptionalForPinned(
    optionalItems: { code: string; combos: PrecomputedCombo[] }[],
    chosenPinned: { code: string; combo: PrecomputedCombo }[],
    startIdx: number,
    initialFyCredits: number
  ): Promise<void> {
    const remainingSlots = targetCount - chosenPinned.length;
    if (remainingSlots <= 0) {
      const enrollments: CourseEnrollment[] = chosenPinned.map(({ combo }) => combo.enrollment);
      if (constraints?.compressedSchedule && !satisfiesCompressedConstraint(enrollments)) {
        return;
      }
      schedules.push({ enrollments });
      return;
    }

    const nonFyRemainingAtIdx = new Array(optionalItems.length + 1).fill(0) as number[];
    if (constraints?.maxFirstYearCredits != null) {
      let count = 0;
      for (let i = optionalItems.length - 1; i >= 0; i--) {
        const code = optionalItems[i].code;
        const m = code.match(/\d{4}/);
        if (!m || Number(m[0]) >= 2000) count++;
        nonFyRemainingAtIdx[i] = count;
      }
    }

    async function dfsOptional(
      idx: number,
      selected: { code: string; combo: PrecomputedCombo }[],
      selectedCount: number,
      currentFyCredits: number
    ): Promise<boolean> {
      await yieldToMainIfNeeded();

      if (constraints?.deadline && Date.now() > constraints.deadline) return true;

      if (selectedCount === remainingSlots) {
        const all = [...chosenPinned, ...selected];
        const enrollments: CourseEnrollment[] = all.map(({ combo }) => combo.enrollment);
        if (constraints?.compressedSchedule && !satisfiesCompressedConstraint(enrollments)) {
          return false;
        }
        schedules.push({ enrollments });
        return schedules.length >= MAX_SCHEDULES || (constraints?.deadline != null && Date.now() > constraints.deadline);
      }

      if (idx === optionalItems.length) return false;

      const remainingToPick = remainingSlots - selectedCount;
      if (optionalItems.length - idx < remainingToPick) return false;

      if (constraints?.maxFirstYearCredits != null) {
        const nonFyRemaining = nonFyRemainingAtIdx[idx];
        const minFyCoursesForced = Math.max(0, remainingToPick - nonFyRemaining);
        if (currentFyCredits + (minFyCoursesForced * 3) > constraints.maxFirstYearCredits) {
          return false;
        }
      }

      const { code, combos } = optionalItems[idx];
      let courseFyCredits = 0;
      if (constraints?.maxFirstYearCredits != null) {
        const m = code.match(/\d{4}/);
        if (m && Number(m[0]) < 2000) {
          courseFyCredits = cache.getCourse(code)?.credits ?? 3;
        }
        if (currentFyCredits + courseFyCredits > constraints.maxFirstYearCredits) {
          if (await dfsOptional(idx + 1, selected, selectedCount, currentFyCredits)) return true;
          return false;
        }
      }

      for (const precomputed of combos) {
        const candidate = precomputed.enrollment;
        const conflictsPinned = chosenPinned.some(({ combo: co }) => enrollmentsOverlap(co.enrollment, candidate));
        if (conflictsPinned) continue;

        const conflictsOpt = selected.some(({ combo: co }) => enrollmentsOverlap(co.enrollment, candidate));
        if (conflictsOpt) continue;

        selected.push({ code, combo: precomputed });
        if (await dfsOptional(idx + 1, selected, selectedCount + 1, currentFyCredits + courseFyCredits)) return true;
        selected.pop();
      }

      if (await dfsOptional(idx + 1, selected, selectedCount, currentFyCredits)) return true;
      return false;
    }

    await dfsOptional(startIdx, [], 0, initialFyCredits);
  }

  async function dfsPinned(
    items: { code: string; combos: PrecomputedCombo[] }[],
    selected: { code: string; combo: PrecomputedCombo }[],
    idx: number,
    currentFyCredits: number
  ): Promise<boolean> {
    await yieldToMainIfNeeded();

    if (idx === items.length) {
      await findOptionalForPinned(optional, selected, 0, currentFyCredits);
      return schedules.length >= MAX_SCHEDULES || (constraints?.deadline != null && Date.now() > constraints.deadline);
    }
    
    if (constraints?.deadline && Date.now() > constraints.deadline) return true;

    const { code, combos } = items[idx];
    let courseFyCredits = 0;
    if (constraints?.maxFirstYearCredits != null) {
      const m = code.match(/\d{4}/);
      if (m && Number(m[0]) < 2000) {
        courseFyCredits = cache.getCourse(code)?.credits ?? 3;
      }
      if (currentFyCredits + courseFyCredits > constraints.maxFirstYearCredits) {
        return false;
      }
    }

    for (const precomputed of combos) {
      const candidate = precomputed.enrollment;
      const conflicts = selected.some(({ combo: co }) => enrollmentsOverlap(co.enrollment, candidate));
      if (conflicts) continue;

      selected.push({ code, combo: precomputed });
      if (await dfsPinned(items, selected, idx + 1, currentFyCredits + courseFyCredits)) return true;
      selected.pop();
    }

    return false;
  }

  if (pinned.length === 0) {
    return await generateSchedules(optionalCourseCodes, targetCount, cache, constraints);
  }

  await dfsPinned(pinned, [], 0, 0);

  return schedules;
}
