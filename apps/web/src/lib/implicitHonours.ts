import type { DataCache } from "schedule";
import type { RemainingRequirement } from "schedule";
import { getEffectiveSchedule, isHonoursProject, normalizeCourseCode } from "schedule";
import { virtualScheduleFilterApplies } from "./electiveEligibility";

export type ImplicitHonoursPick = { code: string; requirementId: string };

/**
 * When Assign does not pin a non-honours course and Constrain does not list one,
 * we still infer a single honours thesis for schedule generation if the
 * requirement has timetable-eligible honours candidates but no timetable-eligible
 * non-honours candidates.
 *
 * Mutates `seenHonoursNorm` with normalized codes for added implicit honours.
 */
export function collectImplicitHonoursForSchedule(
  effectiveRemainingRequirements: RemainingRequirement[],
  selectedPerRequirement: Record<string, string[]>,
  completedSet: Set<string>,
  prereqEligibleSet: Set<string>,
  cache: DataCache,
  includeClosedComponents: boolean,
  virtualSectionsOnly: boolean,
  explicitExemptNormalized: Set<string>,
  seenHonoursNorm: Set<string>,
): ImplicitHonoursPick[] {
  const picks: ImplicitHonoursPick[] = [];

  for (const req of effectiveRemainingRequirements) {
    const reqId = req.requirementId;
    if (!reqId || !req.candidateCourses?.length) continue;

    const assigned = selectedPerRequirement[reqId];
    if (assigned !== undefined && assigned.length === 0) continue;
    if (assigned?.some((c) => !isHonoursProject(c, cache))) continue;

    const honoursCands = req.candidateCourses.filter((code) => {
      if (!isHonoursProject(code, cache)) return false;
      const norm = normalizeCourseCode(code);
      if (completedSet.has(norm)) return false;
      return prereqEligibleSet.has(code);
    });
    const nonHonoursWithSchedule = req.candidateCourses.filter((code) => {
      if (isHonoursProject(code, cache)) return false;
      const norm = normalizeCourseCode(code);
      if (completedSet.has(norm)) return false;
      if (!prereqEligibleSet.has(code)) return false;
      const virtualOnly = virtualScheduleFilterApplies(
        virtualSectionsOnly,
        req.type,
        code,
        explicitExemptNormalized,
      );
      return !!getEffectiveSchedule(
        cache,
        code,
        includeClosedComponents,
        virtualOnly,
      );
    });

    if (nonHonoursWithSchedule.length > 0) continue;
    if (honoursCands.length !== 1) continue;

    const only = honoursCands[0];
    const norm = normalizeCourseCode(only);
    if (seenHonoursNorm.has(norm)) continue;
    seenHonoursNorm.add(norm);
    picks.push({ code: only, requirementId: reqId });
  }

  return picks;
}
