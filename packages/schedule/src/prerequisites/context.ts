import type { DataCache } from '../dataCache';
import { getCourseLevel, normalizeCourseCode } from '../utils/courseUtils';
import type { PrereqContext, TakenCourse } from './types';

function getDiscipline(code: string): string {
  return code.split(/\s+/)[0]?.toUpperCase() ?? '';
}

/** Maps normalized legacy code → normalized canonical code (last wins on conflict). */
function buildAliasToCanonicalMap(cache: DataCache): Map<string, string> {
  const map = new Map<string, string>();
  for (const course of cache.getAllCourses()) {
    const canonical = normalizeCourseCode(course.code);
    for (const a of course.aliases ?? []) {
      map.set(normalizeCourseCode(a), canonical);
    }
  }
  return map;
}

export function buildPrereqContext(
  completedCourseCodes: string[],
  cache: DataCache,
  studentPrograms: string[] = [],
): PrereqContext {
  const aliasToCanonical = buildAliasToCanonicalMap(cache);
  const taken: TakenCourse[] = [];
  let totalCredits = 0;
  const disciplineCredits: Record<string, number> = {};
  const seenCanonical = new Set<string>();

  for (const raw of completedCourseCodes) {
    const norm = normalizeCourseCode(raw);
    let course = cache.getCourse(norm);
    if (!course) {
      const mapped = aliasToCanonical.get(norm);
      if (mapped) course = cache.getCourse(mapped);
    }
    if (!course) continue;

    const canonicalNorm = normalizeCourseCode(course.code);
    if (seenCanonical.has(canonicalNorm)) continue;
    seenCanonical.add(canonicalNorm);

    const credits = course.credits ?? 0;
    const discipline = getDiscipline(course.code);

    taken.push({
      code: canonicalNorm,
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
