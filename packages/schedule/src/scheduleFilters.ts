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
 * Returns the schedule to use for eligibility (dropdowns, generation, swap).
 * When includeClosed is true, returns the raw schedule; when false, returns
 * the schedule with Closed sections filtered out, or undefined if incomplete.
 */
export function getEffectiveSchedule(
  cache: DataCache,
  code: string,
  includeClosed: boolean
): CourseSchedule | undefined {
  const s = cache.getSchedule(code);
  if (!s) return undefined;
  if (includeClosed) return s;
  return filterScheduleExcludingClosed(s) ?? undefined;
}

/**
 * Returns a DataCache that delegates to cache but getSchedule returns the
 * effective schedule (filtering Closed when includeClosed is false).
 * Used so schedule generation only sees open sections when the toggle is off.
 */
export function cacheWithClosedFilter(
  cache: DataCache,
  includeClosed: boolean
): DataCache {
  if (includeClosed) return cache;
  return {
    getCourse: (code) => cache.getCourse(code),
    getSchedule: (code) => getEffectiveSchedule(cache, code, false),
    getCoursesByDiscipline: (d) => cache.getCoursesByDiscipline(d),
    getAllCourses: () => cache.getAllCourses(),
    getAllSchedules: () => cache.getAllSchedules(),
  };
}
