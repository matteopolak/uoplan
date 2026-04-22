import type { DataCache } from '../dataCache';
import { getCourseLevel } from '../utils/courseUtils';
import type { PrereqContext, TakenCourse } from './types';

function getDiscipline(code: string): string {
  return code.split(/\s+/)[0]?.toUpperCase() ?? '';
}

export function buildPrereqContext(
  completedCourseCodes: string[],
  cache: DataCache,
  studentPrograms: string[] = [],
): PrereqContext {
  const taken: TakenCourse[] = [];
  let totalCredits = 0;
  const disciplineCredits: Record<string, number> = {};
  const seenCanonical = new Set<string>();

  for (const raw of completedCourseCodes) {
    const canonical = cache.resolveToCanonical(raw);
    const course = cache.getCourse(canonical);
    if (!course) continue;

    if (seenCanonical.has(canonical)) continue;
    seenCanonical.add(canonical);

    const credits = course.credits ?? 0;
    const discipline = getDiscipline(course.code);

    taken.push({
      code: canonical,
      credits,
      discipline,
      level: getCourseLevel(course.code),
    });
    totalCredits += credits;
    if (discipline) {
      disciplineCredits[discipline] = (disciplineCredits[discipline] ?? 0) + credits;
    }
  }

  return { taken, totalCredits, disciplineCredits, studentPrograms };
}
