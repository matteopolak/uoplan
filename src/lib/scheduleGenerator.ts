import type { CourseSchedule, ComponentSection, DayOfWeek } from '../schemas/schedules';
import type { DataCache } from './dataCache';

export interface TimeSlot {
  day: DayOfWeek;
  startMinutes: number;
  endMinutes: number;
}

export interface CourseEnrollment {
  courseCode: string;
  sectionCombo: SectionCombo;
  times: TimeSlot[];
}

export interface SectionCombo {
  [component: string]: { section: ComponentSection };
}

export interface GeneratedSchedule {
  enrollments: CourseEnrollment[];
}

function collectTimes(sections: ComponentSection[]): TimeSlot[] {
  const times: TimeSlot[] = [];
  for (const s of sections) {
    for (const t of s.times) {
      if (t.startMinutes < t.endMinutes) {
        times.push({
          day: t.day,
          startMinutes: t.startMinutes,
          endMinutes: t.endMinutes,
        });
      }
    }
  }
  return times;
}

function timesOverlap(a: TimeSlot, b: TimeSlot): boolean {
  if (a.day !== b.day) return false;
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

export function enrollmentsOverlap(a: CourseEnrollment, b: CourseEnrollment): boolean {
  for (const ta of a.times) {
    for (const tb of b.times) {
      if (timesOverlap(ta, tb)) return true;
    }
  }
  return false;
}

function cartesianProduct<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [[]];
  const [first, ...rest] = arrays;
  const restProduct = cartesianProduct(rest);
  const result: T[][] = [];
  for (const item of first) {
    for (const combo of restProduct) {
      result.push([item, ...combo]);
    }
  }
  return result;
}

export function getValidSectionCombos(schedule: CourseSchedule): SectionCombo[] {
  const componentKeys = Object.keys(schedule.components).sort();
  const sectionArrays = componentKeys.map((key) => schedule.components[key] ?? []);

  const allCombos = cartesianProduct(sectionArrays);
  const valid: SectionCombo[] = [];

  for (const combo of allCombos) {
    const sections = combo as ComponentSection[];
    const times = collectTimes(sections);
    let hasOverlap = false;
    for (let i = 0; i < times.length; i++) {
      for (let j = i + 1; j < times.length; j++) {
        if (timesOverlap(times[i], times[j])) {
          hasOverlap = true;
          break;
        }
      }
      if (hasOverlap) break;
    }
    if (!hasOverlap) {
      const obj: SectionCombo = {};
      componentKeys.forEach((key, idx) => {
        obj[key] = { section: sections[idx] };
      });
      valid.push(obj);
    }
  }

  return valid.length > 0 ? valid : [{}];
}

export function getEnrollmentsForCourse(
  schedule: CourseSchedule,
  sectionCombo: SectionCombo
): CourseEnrollment {
  const sections = Object.values(sectionCombo).map((x) => x.section);
  const times = collectTimes(sections);
  return {
    courseCode: schedule.courseCode,
    sectionCombo,
    times,
  };
}

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
  cache: DataCache
): GeneratedSchedule[] {
  const schedules: GeneratedSchedule[] = [];
  const coursesWithCombos: { code: string; combos: SectionCombo[] }[] = [];

  for (const code of courseCodes) {
    const schedule = cache.getSchedule(code);
    if (!schedule) continue;
    const combos = getValidSectionCombos(schedule);
    if (combos.length > 0) {
      coursesWithCombos.push({ code: schedule.courseCode, combos });
    }
  }

  if (coursesWithCombos.length < targetCount) {
    return [];
  }

  function findNonOverlappingCombos(
    items: { code: string; combos: SectionCombo[] }[],
    selected: { code: string; combo: SectionCombo }[],
    idx: number
  ): boolean {
    if (idx === items.length) {
      const enrollments: CourseEnrollment[] = selected.map(({ code, combo }) => {
        const s = cache.getSchedule(code);
        return getEnrollmentsForCourse(s!, combo);
      });
      schedules.push({ enrollments });
      return schedules.length >= MAX_SCHEDULES;
    }

    const { code, combos } = items[idx];
    const schedule = cache.getSchedule(code)!;

    for (const combo of combos) {
      const candidate = getEnrollmentsForCourse(schedule, combo);
      const conflicts = selected.some(({ code: c, combo: co }) => {
        const existing = getEnrollmentsForCourse(cache.getSchedule(c)!, co);
        return enrollmentsOverlap(existing, candidate);
      });
      if (conflicts) continue;

      selected.push({ code, combo });
      if (findNonOverlappingCombos(items, selected, idx + 1)) return true;
      selected.pop();
    }
    return false;
  }

  for (const combo of combinations(coursesWithCombos, targetCount)) {
    if (findNonOverlappingCombos(combo, [], 0)) break;
  }

  return schedules;
}

export function generateSchedulesWithPinned(
  pinnedCourseCodes: string[],
  optionalCourseCodes: string[],
  targetCount: number,
  cache: DataCache
): GeneratedSchedule[] {
  if (pinnedCourseCodes.length > targetCount) {
    return [];
  }

  const pinned: { code: string; combos: SectionCombo[] }[] = [];
  for (const code of pinnedCourseCodes) {
    const schedule = cache.getSchedule(code);
    if (!schedule) return [];
    const combos = getValidSectionCombos(schedule);
    if (combos.length === 0) return [];
    pinned.push({ code: schedule.courseCode, combos });
  }

  const optional: { code: string; combos: SectionCombo[] }[] = [];
  for (const code of optionalCourseCodes) {
    if (pinnedCourseCodes.includes(code)) continue;
    const schedule = cache.getSchedule(code);
    if (!schedule) continue;
    const combos = getValidSectionCombos(schedule);
    if (combos.length > 0) {
      optional.push({ code: schedule.courseCode, combos });
    }
  }

  const schedules: GeneratedSchedule[] = [];

  function findOptionalForPinned(
    optionalItems: { code: string; combos: SectionCombo[] }[],
    chosenPinned: { code: string; combo: SectionCombo }[],
    startIdx: number
  ): void {
    const remainingSlots = targetCount - chosenPinned.length;
    if (remainingSlots <= 0) {
      const enrollments: CourseEnrollment[] = chosenPinned.map(({ code, combo }) => {
        const s = cache.getSchedule(code)!;
        return getEnrollmentsForCourse(s, combo);
      });
      schedules.push({ enrollments });
      return;
    }

    function dfsOptional(
      items: { code: string; combos: SectionCombo[] }[],
      selected: { code: string; combo: SectionCombo }[],
      idx: number
    ): boolean {
      if (selected.length === remainingSlots || idx === items.length) {
        const all = [...chosenPinned, ...selected];
        const enrollments: CourseEnrollment[] = all.map(({ code, combo }) => {
          const s = cache.getSchedule(code)!;
          return getEnrollmentsForCourse(s, combo);
        });
        schedules.push({ enrollments });
        return schedules.length >= MAX_SCHEDULES;
      }

      const { code, combos } = items[idx];
      const schedule = cache.getSchedule(code)!;

      for (const combo of combos) {
        const candidate = getEnrollmentsForCourse(schedule, combo);
        const conflictsPinned = chosenPinned.some(({ code: c, combo: co }) => {
          const existing = getEnrollmentsForCourse(cache.getSchedule(c)!, co);
          return enrollmentsOverlap(existing, candidate);
        });
        if (conflictsPinned) continue;

        const conflictsOpt = selected.some(({ code: c, combo: co }) => {
          const existing = getEnrollmentsForCourse(cache.getSchedule(c)!, co);
          return enrollmentsOverlap(existing, candidate);
        });
        if (conflictsOpt) continue;

        selected.push({ code, combo });
        if (dfsOptional(items, selected, idx + 1)) return true;
        selected.pop();
      }

      if (dfsOptional(items, selected, idx + 1)) return true;
      return false;
    }

    dfsOptional(optionalItems.slice(startIdx), [], 0);
  }

  function dfsPinned(
    items: { code: string; combos: SectionCombo[] }[],
    selected: { code: string; combo: SectionCombo }[],
    idx: number
  ): boolean {
    if (idx === items.length) {
      findOptionalForPinned(optional, selected, 0);
      return schedules.length >= MAX_SCHEDULES;
    }

    const { code, combos } = items[idx];
    const schedule = cache.getSchedule(code)!;

    for (const combo of combos) {
      const candidate = getEnrollmentsForCourse(schedule, combo);
      const conflicts = selected.some(({ code: c, combo: co }) => {
        const existing = getEnrollmentsForCourse(cache.getSchedule(c)!, co);
        return enrollmentsOverlap(existing, candidate);
      });
      if (conflicts) continue;

      selected.push({ code, combo });
      if (dfsPinned(items, selected, idx + 1)) return true;
      selected.pop();
    }

    return false;
  }

  if (pinned.length === 0) {
    return generateSchedules(optionalCourseCodes, targetCount, cache);
  }

  dfsPinned(pinned, [], 0);

  return schedules;
}
