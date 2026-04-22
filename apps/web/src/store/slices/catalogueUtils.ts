import {
  applyLatestAliasesToMergedCourses,
  normalizeCourseCode,
  removeMergedCoursesSupersededByAliases,
} from "schedule";
import type { Catalogue, Course } from "schemas";

/**
 * Merges the latest catalogue with the year-specific catalogue for courses the user
 * completed in their first year. Completed courses keep their year-specific row so
 * prerequisites reflect the exact credits/level from that year, while all other
 * courses use the latest catalogue data. Alias→canonical mapping is applied and
 * superseded alias rows are removed to avoid duplicates.
 */
export function getMergedCatalogue(
  catalogue: Catalogue | null,
  yearCatalogueCourses: Course[] | null,
  completedCourses: string[],
): Catalogue | null {
  if (!catalogue) return null;
  if (!yearCatalogueCourses) return catalogue;

  const completedSet = new Set(completedCourses.map(normalizeCourseCode));
  const yearMap = new Map(
    yearCatalogueCourses.map((c) => [normalizeCourseCode(c.code), c]),
  );

  const merged = new Map<string, Course>();
  for (const course of yearCatalogueCourses) {
    merged.set(normalizeCourseCode(course.code), course);
  }

  for (const course of catalogue.courses) {
    const key = normalizeCourseCode(course.code);
    if (completedSet.has(key) && yearMap.has(key)) {
      continue;
    }
    merged.set(key, course);
  }

  const mergedList = Array.from(merged.values());
  const withAliases = applyLatestAliasesToMergedCourses(catalogue.courses, mergedList);
  const courses = removeMergedCoursesSupersededByAliases(catalogue.courses, withAliases);
  return { ...catalogue, courses };
}
