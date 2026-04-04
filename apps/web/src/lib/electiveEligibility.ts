import { getCourseLevel, normalizeCourseCode } from "schedule";
import { isBroadElectivePoolType } from "../store/scheduleHelpers";

const MAX_ELECTIVE_LEVEL = 4000;
export const DEFAULT_BASIC_ELECTIVE_LEVEL_BUCKETS = [1000];
export const DEFAULT_BASIC_LEVEL_BUCKETS = ["undergrad"] as const;
export const DEFAULT_BASIC_LANGUAGE_BUCKETS = ["en"] as const;

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

/**
 * When buckets are provided, only include matching course levels.
 * Unknown levels remain eligible to avoid over-filtering malformed codes.
 * When buckets are empty, fallback to the legacy <= 4000 cap.
 */
export function isWithinElectiveLevelBuckets(
  code: string,
  electiveLevelBuckets: number[],
): boolean {
  if (electiveLevelBuckets.length === 0) {
    return isWithinElectiveLevelCap(code);
  }
  const level = getCourseLevel(code);
  if (level == null) return true;
  const bucket = Math.floor(level / 1000) * 1000;
  return electiveLevelBuckets.includes(bucket);
}

/**
 * Returns whether we should apply the "virtual sections only" filter to this
 * course, given the requirement context and explicit-exemption rules.
 *
 * Policy:
 * - If virtualSectionsOnly is off, never filter.
 * - Only filter for broad (whole-catalog) elective pools — same notion as
 *   {@link isBroadElectivePoolType}. Discipline-scoped pools (e.g. discipline_elective)
 *   are treated like structured requirements.
 * - If the course appears in explicit picks (constrained/assigned), exempt it.
 */
export function virtualScheduleFilterApplies(
  virtualSectionsOnly: boolean,
  requirementType: string | undefined,
  courseCode: string,
  explicitExemptNormalized: Set<string>,
): boolean {
  if (!virtualSectionsOnly) return false;
  if (!isBroadElectivePoolType(requirementType ?? "")) return false;
  const norm = normalizeCourseCode(courseCode);
  if (explicitExemptNormalized.has(norm)) return false;
  return true;
}
