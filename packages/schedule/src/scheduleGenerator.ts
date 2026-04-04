import type { CourseSchedule, ComponentSection, DayOfWeek } from 'schemas';
import type { DataCache } from './dataCache';
import {
  isSectionAllowedByMinRating,
  type ProfessorRatingsMap,
} from './professorRatings';
import { isHonoursProject, normalizeCourseCode } from './utils/courseUtils';

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

export interface GenerationConstraints {
  minStartMinutes: number;
  maxEndMinutes: number;
  allowedDays: DayOfWeek[];
  minProfessorRating?: number;
  professorRatings?: ProfessorRatingsMap;
  /** Max credits from 1000-level courses allowed in the schedule (48 - already completed). */
  maxFirstYearCredits?: number;
  /** If true, each day may have at most one gap between classes, and that gap must be ≤ 90 minutes. */
  compressedSchedule?: boolean;
  /** Unix timestamp (ms) deadline to stop searching for schedules. */
  deadline?: number;
}

/** Default when the UI clears “days allowed” (empty array): same as initial app state (weekdays). */
const DEFAULT_ALLOWED_DAYS: DayOfWeek[] = [
  "Mo",
  "Tu",
  "We",
  "Th",
  "Fr",
];

function effectiveAllowedDays(c: GenerationConstraints): DayOfWeek[] {
  return c.allowedDays.length > 0 ? c.allowedDays : DEFAULT_ALLOWED_DAYS;
}

/** Time bounds are inclusive: a class starting at minStartMinutes or ending at maxEndMinutes is allowed. */
function timeSlotSatisfiesConstraints(slot: TimeSlot, c: GenerationConstraints): boolean {
  const allowedDays = effectiveAllowedDays(c);
  return (
    allowedDays.includes(slot.day) &&
    slot.startMinutes >= c.minStartMinutes &&
    slot.endMinutes <= c.maxEndMinutes
  );
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

/** Format minutes since midnight as HH:MM. */
function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}:${String(min).padStart(2, '0')}`;
}

/**
 * Returns the first enrollment in others that overlaps with candidate, plus a human-readable
 * time string for the overlapping slot (e.g. "Mo 10:00-11:30").
 */
export function getFirstOverlapWith(
  candidate: CourseEnrollment,
  others: CourseEnrollment[]
): { courseCode: string; timeStr: string } | null {
  for (const other of others) {
    for (const ta of candidate.times) {
      for (const tb of other.times) {
        if (ta.day !== tb.day) continue;
        if (ta.startMinutes < tb.endMinutes && tb.startMinutes < ta.endMinutes) {
          const timeStr = `${tb.day} ${formatMinutes(tb.startMinutes)}-${formatMinutes(tb.endMinutes)}`;
          return { courseCode: other.courseCode, timeStr };
        }
      }
    }
  }
  return null;
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

/** True if the section has at least one real time slot (used to skip TST/other components with empty times). */
function sectionHasTimes(section: ComponentSection): boolean {
  return (
    Array.isArray(section.times) &&
    section.times.some((t) => t.startMinutes < t.endMinutes)
  );
}

export function getValidSectionCombos(
  schedule: CourseSchedule,
  constraints?: GenerationConstraints
): SectionCombo[] {
  const componentKeys = Object.keys(schedule.components).sort();
  const sectionArrays = componentKeys.map((key) => {
    const sections = schedule.components[key] ?? [];
    return sections.filter((section) => {
      if (!sectionHasTimes(section)) return false;
      if (!constraints) return true;
      return isSectionAllowedByMinRating({
        instructors: section.instructors,
        minRating: constraints.minProfessorRating,
        professorRatings: constraints.professorRatings,
      });
    });
  });

  if (sectionArrays.some((arr) => arr.length === 0)) {
    return [];
  }

  const allCombos = cartesianProduct(sectionArrays);
  const valid: SectionCombo[] = [];

  for (const combo of allCombos) {
    const sections = combo;
    const times = collectTimes(sections);
    if (
      constraints &&
      !times.every((t) => timeSlotSatisfiesConstraints(t, constraints))
    ) {
      continue;
    }
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

  return valid;
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

function canonicalCourseCode(code: string, cache: DataCache): string {
  return cache.getCourse(normalizeCourseCode(code))?.code ?? code;
}

/**
 * Builds a course enrollment for schedule generation. Honours / research-project
 * courses (typically *900) have no fixed meeting times in the timetable data; they
 * are modeled with empty `times` so they never time-conflict with other courses.
 */
function enrollmentForPicker(
  code: string,
  combo: SectionCombo,
  cache: DataCache,
): CourseEnrollment {
  if (isHonoursProject(code, cache)) {
    return {
      courseCode: canonicalCourseCode(code, cache),
      sectionCombo: combo,
      times: [],
    };
  }
  const schedule = cache.getSchedule(code);
  if (!schedule) {
    return { courseCode: code, sectionCombo: combo, times: [] };
  }
  return getEnrollmentsForCourse(schedule, combo);
}

/** True if the schedule has at most one gap per day, and that gap is ≤ 90 minutes.
 * Transitions of ≤ 10 minutes (e.g. 9:50→10:00) are treated as back-to-back and do not count as a gap. */
function satisfiesCompressedConstraint(enrollments: CourseEnrollment[]): boolean {
  const MAX_GAP = 90;
  const TRANSITION_THRESHOLD = 10;
  const slotsByDay = new Map<DayOfWeek, { start: number; end: number }[]>();
  for (const e of enrollments) {
    for (const t of e.times) {
      if (!slotsByDay.has(t.day)) slotsByDay.set(t.day, []);
      slotsByDay.get(t.day)!.push({ start: t.startMinutes, end: t.endMinutes });
    }
  }
  for (const slots of slotsByDay.values()) {
    if (slots.length < 2) continue;
    slots.sort((a, b) => a.start - b.start);
    let gaps = 0;
    for (let i = 1; i < slots.length; i++) {
      const gap = slots[i].start - slots[i - 1].end;
      if (gap > TRANSITION_THRESHOLD) {
        gaps++;
        if (gaps > 1 || gap > MAX_GAP) return false;
      }
    }
  }
  return true;
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

export interface PrecomputedCombo {
  combo: SectionCombo;
  enrollment: CourseEnrollment;
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
        combos: combos.map(combo => ({
          combo,
          enrollment: enrollmentForPicker(schedule.courseCode, combo, cache)
        }))
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
