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

function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

export function generateSchedules(
  courseCodes: string[],
  targetCount: number,
  cache: DataCache,
  constraints?: GenerationConstraints
): GeneratedSchedule[] {
  const schedules: GeneratedSchedule[] = [];
  const coursesWithCombos: { code: string; combos: PrecomputedCombo[] }[] = [];

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

  if (coursesWithCombos.length < targetCount) {
    return [];
  }

  function findNonOverlappingCombos(
    items: { code: string; combos: PrecomputedCombo[] }[],
    selected: { code: string; combo: PrecomputedCombo }[],
    idx: number
  ): boolean {
    if (idx === items.length) {
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

    if (constraints?.deadline && Date.now() > constraints.deadline) return true;

    const { code, combos } = items[idx];

    for (const precomputed of combos) {
      const candidate = precomputed.enrollment;
      const conflicts = selected.some(({ combo: co }) => {
        return enrollmentsOverlap(co.enrollment, candidate);
      });
      if (conflicts) continue;

      selected.push({ code, combo: precomputed });
      if (findNonOverlappingCombos(items, selected, idx + 1)) return true;
      selected.pop();
    }
    return false;
  }

  for (const combo of combinations(coursesWithCombos, targetCount)) {
    if (constraints?.deadline && Date.now() > constraints.deadline) break;
    if (constraints?.maxFirstYearCredits != null) {
      const fyCredits = combo.reduce((sum, item) => {
        const m = item.code.match(/\d{4}/);
        if (!m || Number(m[0]) >= 2000) return sum;
        return sum + (cache.getCourse(item.code)?.credits ?? 3);
      }, 0);
      if (fyCredits > constraints.maxFirstYearCredits) continue;
    }
    if (findNonOverlappingCombos(combo, [], 0)) break;
  }

  return schedules;
}

export function generateSchedulesWithPinned(
  pinnedCourseCodes: string[],
  optionalCourseCodes: string[],
  targetCount: number,
  cache: DataCache,
  constraints?: GenerationConstraints
): GeneratedSchedule[] {
  if (pinnedCourseCodes.length > targetCount) {
    return [];
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

  const schedules: GeneratedSchedule[] = [];

  function findOptionalForPinned(
    optionalItems: { code: string; combos: PrecomputedCombo[] }[],
    chosenPinned: { code: string; combo: PrecomputedCombo }[],
    startIdx: number
  ): void {
    const remainingSlots = targetCount - chosenPinned.length;
    if (remainingSlots <= 0) {
      const enrollments: CourseEnrollment[] = chosenPinned.map(({ combo }) => combo.enrollment);
      if (constraints?.compressedSchedule && !satisfiesCompressedConstraint(enrollments)) {
        return;
      }
      schedules.push({ enrollments });
      return;
    }

    function dfsOptional(
      items: { code: string; combos: PrecomputedCombo[] }[],
      selected: { code: string; combo: PrecomputedCombo }[],
      idx: number
    ): boolean {
      if (constraints?.deadline && Date.now() > constraints.deadline) return true;
      // Only accept full schedules: we need exactly remainingSlots optional courses.
      if (selected.length === remainingSlots) {
        const all = [...chosenPinned, ...selected];
        if (constraints?.maxFirstYearCredits != null) {
          const fyCredits = all.reduce((sum, item) => {
            const m = item.code.match(/\d{4}/);
            if (!m || Number(m[0]) >= 2000) return sum;
            return sum + (cache.getCourse(item.code)?.credits ?? 3);
          }, 0);
          if (fyCredits > constraints.maxFirstYearCredits) return false;
        }
        const enrollments: CourseEnrollment[] = all.map(({ combo }) => combo.enrollment);
        if (constraints?.compressedSchedule && !satisfiesCompressedConstraint(enrollments)) {
          return false;
        }
        schedules.push({ enrollments });
        return schedules.length >= MAX_SCHEDULES || (constraints?.deadline != null && Date.now() > constraints.deadline);
      }
      if (idx === items.length) return false;

      const { code, combos } = items[idx];

      for (const precomputed of combos) {
        const candidate = precomputed.enrollment;
        const conflictsPinned = chosenPinned.some(({ combo: co }) => {
          return enrollmentsOverlap(co.enrollment, candidate);
        });
        if (conflictsPinned) continue;

        const conflictsOpt = selected.some(({ combo: co }) => {
          return enrollmentsOverlap(co.enrollment, candidate);
        });
        if (conflictsOpt) continue;

        selected.push({ code, combo: precomputed });
        if (dfsOptional(items, selected, idx + 1)) return true;
        selected.pop();
      }

      if (dfsOptional(items, selected, idx + 1)) return true;
      return false;
    }

    dfsOptional(optionalItems.slice(startIdx), [], 0);
  }

  function dfsPinned(
    items: { code: string; combos: PrecomputedCombo[] }[],
    selected: { code: string; combo: PrecomputedCombo }[],
    idx: number
  ): boolean {
    if (idx === items.length) {
      findOptionalForPinned(optional, selected, 0);
      return schedules.length >= MAX_SCHEDULES || (constraints?.deadline != null && Date.now() > constraints.deadline);
    }
    
    if (constraints?.deadline && Date.now() > constraints.deadline) return true;

    const { code, combos } = items[idx];

    for (const precomputed of combos) {
      const candidate = precomputed.enrollment;
      const conflicts = selected.some(({ combo: co }) => {
        return enrollmentsOverlap(co.enrollment, candidate);
      });
      if (conflicts) continue;

      selected.push({ code, combo: precomputed });
      if (dfsPinned(items, selected, idx + 1)) return true;
      selected.pop();
    }

    return false;
  }

  if (pinned.length === 0) {
    return generateSchedules(optionalCourseCodes, targetCount, cache, constraints);
  }

  dfsPinned(pinned, [], 0);

  return schedules;
}
