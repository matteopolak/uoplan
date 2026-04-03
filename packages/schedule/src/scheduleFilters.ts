import type { CourseSchedule, ComponentSection } from 'schemas';
import type { DataCache } from './dataCache';

/**
 * Returns a new schedule with sections where status === "Closed" removed from each component.
 * If any component ends up with no sections, returns undefined (course is incomplete).
 */
export function filterScheduleExcludingClosed(
  schedule: CourseSchedule
): CourseSchedule | undefined {
  const filtered: Record<string, ComponentSection[]> = {};
  for (const [key, sections] of Object.entries(schedule.components)) {
    const kept = (sections ?? []).filter(
      (s) => (s.status ?? '').trim() !== 'Closed'
    );
    if (kept.length === 0) return undefined;
    filtered[key] = kept;
  }
  return {
    ...schedule,
    components: filtered,
  };
}

/**
 * Keeps only meeting times with virtual: true per section; drops sections with no times left.
 * If any component ends up with no sections, returns undefined.
 */
export function filterScheduleVirtualOnly(
  schedule: CourseSchedule
): CourseSchedule | undefined {
  const filtered: Record<string, ComponentSection[]> = {};
  for (const [key, sections] of Object.entries(schedule.components)) {
    const kept: ComponentSection[] = [];
    for (const sec of sections ?? []) {
      const times = (sec.times ?? []).filter((t) => t.virtual);
      if (times.length === 0) continue;
      kept.push({ ...sec, times });
    }
    if (kept.length === 0) return undefined;
    filtered[key] = kept;
  }
  return {
    ...schedule,
    components: filtered,
  };
}

function applyScheduleFilters(
  schedule: CourseSchedule,
  opts: { includeClosed: boolean; virtualOnly: boolean }
): CourseSchedule | undefined {
  let s: CourseSchedule | undefined = schedule;
  if (!opts.includeClosed) {
    s = filterScheduleExcludingClosed(s) ?? undefined;
    if (!s) return undefined;
  }
  if (opts.virtualOnly) {
    s = filterScheduleVirtualOnly(s) ?? undefined;
  }
  return s;
}

/**
 * Returns the schedule to use for eligibility (dropdowns, generation, swap).
 * When includeClosed is false, Closed sections are removed first.
 * When virtualOnly is true, non-virtual meeting times are stripped (and empty sections dropped).
 */
export function getEffectiveSchedule(
  cache: DataCache,
  code: string,
  includeClosed: boolean,
  virtualOnly: boolean = false
): CourseSchedule | undefined {
  const s = cache.getSchedule(code);
  if (!s) return undefined;
  return applyScheduleFilters(s, { includeClosed, virtualOnly });
}

/**
 * Returns a DataCache that delegates to cache but getSchedule returns the
 * effective schedule (filtering Closed when includeClosed is false, and/or
 * virtual-only times when virtualOnly is true).
 */
export function cacheWithClosedFilter(
  cache: DataCache,
  includeClosed: boolean,
  virtualOnly: boolean = false
): DataCache {
  if (includeClosed && !virtualOnly) return cache;
  return {
    getCourse: (code) => cache.getCourse(code),
    getSchedule: (code) =>
      getEffectiveSchedule(cache, code, includeClosed, virtualOnly),
    getCoursesByDiscipline: (d) => cache.getCoursesByDiscipline(d),
    getAllCourses: () => cache.getAllCourses(),
    getAllSchedules: () => cache.getAllSchedules(),
  };
}

/**
 * Like {@link cacheWithClosedFilter}, but `virtualOnly` is decided per-course.
 *
 * This is used so the global "virtual sections only" UX can apply selectively
 * (e.g. only for elective pools), while still letting explicitly chosen
 * courses keep in-person sections.
 */
export function cacheWithPerCourseVirtualFilter(
  cache: DataCache,
  includeClosed: boolean,
  virtualFor: (code: string) => boolean,
): DataCache {
  const memo = new Map<string, CourseSchedule | undefined>();
  return {
    getCourse: (code) => cache.getCourse(code),
    getSchedule: (code) => {
      if (memo.has(code)) return memo.get(code);
      const virtualOnly = virtualFor(code);
      const s = getEffectiveSchedule(cache, code, includeClosed, virtualOnly);
      memo.set(code, s);
      return s;
    },
    getCoursesByDiscipline: (d) => cache.getCoursesByDiscipline(d),
    getAllCourses: () => cache.getAllCourses(),
    getAllSchedules: () => cache.getAllSchedules(),
  };
}
