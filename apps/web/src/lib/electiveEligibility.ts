import { getCourseLevel } from "schedule";

export const MAX_ELECTIVE_LEVEL = 4000;

const ELECTIVE_REQUIREMENT_TYPES = new Set([
  "discipline_elective",
  "elective",
  "faculty_elective",
  "free_elective",
  "non_discipline_elective",
]);

export function isElectiveRequirementType(type: string | undefined): boolean {
  return type != null && ELECTIVE_REQUIREMENT_TYPES.has(type);
}

/**
 * Electives are capped at 4000-level.
 * Courses with unknown level parsing are left eligible.
 */
export function isWithinElectiveLevelCap(code: string): boolean {
  const level = getCourseLevel(code);
  return level == null || level <= MAX_ELECTIVE_LEVEL;
}
