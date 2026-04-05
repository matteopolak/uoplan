import type { RemainingRequirement } from "schedule";
import { normalizeCourseCode, type DataCache, getCourseCredits } from "schedule";
import { isStrictSubset } from "./utils";

export function getAutoSelectedForRequirements(
  remaining: RemainingRequirement[],
  existing: Record<string, string[]>,
  cache: DataCache | null,
): Record<string, string[]> {
  if (!cache) {
    return {};
  }

  const out: Record<string, string[]> = {};
  for (const req of remaining) {
    const allCandidatesSet = new Set(req.candidateCourses);
    const prev = existing[req.requirementId] ?? [];
    const valid = prev.filter((c) => allCandidatesSet.has(c));
    if (valid.length) out[req.requirementId] = valid;
  }

  return out;
}

const TYPE_PRIORITY: Record<string, number> = {
  course: 0,
  discipline_elective: 1,
  pick: 1,
  group: 1,
  faculty_elective: 2,
  non_discipline_elective: 3,
  free_elective: 4,
  elective: 4,
};

/** Branch / explicit-choice requirements: candidates are blocked from auto-assignment elsewhere. */
const NEVER_AUTO_ASSIGN_TYPES = new Set([
  "or_group",
  "or_course",
  "options_group",
]);

export interface AutoAssignReqMeta {
  reqId: string;
  type: string;
  candidatesNorm: Set<string>;
  creditsNeeded: number;
}

export function compareReqPreference(a: AutoAssignReqMeta, b: AutoAssignReqMeta): number {
  const pa = TYPE_PRIORITY[a.type] ?? 999;
  const pb = TYPE_PRIORITY[b.type] ?? 999;
  if (pa !== pb) return pa - pb;
  const setA = a.candidatesNorm;
  const setB = b.candidatesNorm;
  const aSubB = isStrictSubset(setA, setB);
  const bSubA = isStrictSubset(setB, setA);
  if (aSubB !== bSubA) return aSubB ? -1 : 1;
  if (setA.size !== setB.size) return setA.size - setB.size;
  return a.reqId.localeCompare(b.reqId);
}

function sumCreditsForCodes(
  cache: DataCache,
  codes: string[],
): number {
  let s = 0;
  for (const code of codes) {
    s += getCourseCredits(normalizeCourseCode(code), cache);
  }
  return s;
}

export function getAutoSelectedSingleEligibleCompleted(
  augmentedRemaining: RemainingRequirement[],
  unassignedCompleted: string[],
  cache: DataCache,
  alreadySelected: Record<string, string[]>,
  requirementSlotsUserTouched: Record<string, true>,
): Record<string, string[]> {
  const blockedCourses = new Set<string>();
  const metas: AutoAssignReqMeta[] = [];

  for (const req of augmentedRemaining) {
    if (NEVER_AUTO_ASSIGN_TYPES.has(req.type)) {
      for (const candidate of req.candidateCourses) {
        blockedCourses.add(normalizeCourseCode(candidate));
      }
      continue;
    }
    const tier = TYPE_PRIORITY[req.type];
    if (tier === undefined || !req.candidateCourses?.length) continue;

    const candidatesNorm = new Set(
      req.candidateCourses.map((c) => normalizeCourseCode(c)),
    );
    const creditsNeeded = req.creditsNeeded ?? 3;
    metas.push({
      reqId: req.requirementId,
      type: req.type,
      candidatesNorm,
      creditsNeeded: creditsNeeded > 0 ? creditsNeeded : 9999,
    });
  }

  function eligibleMetasForCourse(norm: string): AutoAssignReqMeta[] {
    if (blockedCourses.has(norm)) return [];
    const list: AutoAssignReqMeta[] = [];
    for (const m of metas) {
      if (!m.candidatesNorm.has(norm)) continue;
      if (m.reqId in requirementSlotsUserTouched) continue;
      list.push(m);
    }
    list.sort(compareReqPreference);
    return list;
  }

  const coursesSorted = [...unassignedCompleted].sort((a, b) => {
    const na = eligibleMetasForCourse(a).length;
    const nb = eligibleMetasForCourse(b).length;
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
  });

  const out: Record<string, string[]> = {};

  for (const norm of coursesSorted) {
    if (blockedCourses.has(norm)) continue;

    const courseCredits = getCourseCredits(norm, cache);
    const courseCode = cache.getCourse(norm)?.code ?? norm;

    const candidates = eligibleMetasForCourse(norm);

    for (const m of candidates) {
      const existingForReq = [
        ...(alreadySelected[m.reqId] ?? []),
        ...(out[m.reqId] ?? []),
      ];
      if (existingForReq.includes(courseCode)) {
        break;
      }

      const used = sumCreditsForCodes(cache, existingForReq);
      const cap = m.creditsNeeded;
      if (used + courseCredits > cap) continue;

      out[m.reqId] = [...existingForReq, courseCode];
      break;
    }
  }

  return out;
}
