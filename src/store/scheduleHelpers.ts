import type { RemainingRequirement } from "../lib/requirements";
import type { DataCache } from "../lib/dataCache";

export type RequirementPool = {
  requirementId: string;
  type: RemainingRequirement["type"];
  label: string;
  candidateCourses: string[];
  creditsNeeded: number;
  minCourses: number;
};

export function buildRequirementPools(
  remaining: RemainingRequirement[],
): RequirementPool[] {
  const pools: RequirementPool[] = [];

  for (const req of remaining) {
    if (!req.requirementId || !req.candidateCourses?.length) continue;
    const creditsNeeded = req.creditsNeeded ?? 0;
    if (creditsNeeded <= 0) continue;

    const uniqueCandidates = [...new Set(req.candidateCourses)];
    if (uniqueCandidates.length === 0) continue;

    const label = req.title ?? req.type ?? "Requirement";
    let minCourses = 0;
    if (req.type === "course" || req.type === "or_course") {
      minCourses = 1;
    }

    pools.push({
      requirementId: req.requirementId,
      type: req.type,
      label,
      candidateCourses: uniqueCandidates,
      creditsNeeded,
      minCourses,
    });
  }

  return pools;
}

/** Default credits per course when converting creditsNeeded to number of courses. */
export const DEFAULT_CREDITS_PER_COURSE = 3;

/**
 * Allocates remainingCourseSlots across pools so that each pool gets courses
 * proportional to creditsNeeded (ceil(creditsNeeded / 3)), and the total
 * equals remainingCourseSlots. Ensures we pick exactly that many courses total.
 */
export function computeCoursesPerPool(
  pools: RequirementPool[],
  remainingCourseSlots: number,
  _cache: DataCache,
): Map<string, number> {
  const result = new Map<string, number>();
  if (remainingCourseSlots <= 0 || pools.length === 0) {
    return result;
  }

  // Ideal courses per pool from creditsNeeded only (no redundant min/cap).
  const ideal = new Map<string, number>();
  let totalIdeal = 0;
  for (const pool of pools) {
    const need = Math.max(
      pool.minCourses,
      Math.ceil(pool.creditsNeeded / DEFAULT_CREDITS_PER_COURSE),
    );
    ideal.set(pool.requirementId, need);
    totalIdeal += need;
  }

  if (totalIdeal === 0) return result;

  if (totalIdeal <= remainingCourseSlots) {
    // Give each pool its ideal; distribute the rest by most creditsNeeded first.
    for (const pool of pools) {
      result.set(pool.requirementId, ideal.get(pool.requirementId) ?? 0);
    }
    let extra = remainingCourseSlots - totalIdeal;
    const byCreditsDesc = [...pools].sort(
      (a, b) => b.creditsNeeded - a.creditsNeeded,
    );
    for (const pool of byCreditsDesc) {
      if (extra <= 0) break;
      const cur = result.get(pool.requirementId) ?? 0;
      const poolIdeal = ideal.get(pool.requirementId) ?? 0;
      if (cur < poolIdeal) {
        result.set(pool.requirementId, cur + 1);
        extra -= 1;
      }
    }
  } else {
    // Need to allocate exactly remainingCourseSlots; distribute by creditsNeeded proportion.
    const totalCredits = pools.reduce((s, p) => s + p.creditsNeeded, 0);
    if (totalCredits <= 0) return result;
    const remainder: { reqId: string; frac: number }[] = [];
    let allocated = 0;
    for (const pool of pools) {
      const frac = pool.creditsNeeded / totalCredits;
      const n = Math.max(0, Math.floor(remainingCourseSlots * frac));
      const cap = Math.min(n, ideal.get(pool.requirementId) ?? n);
      result.set(pool.requirementId, cap);
      allocated += cap;
      remainder.push({
        reqId: pool.requirementId,
        frac:
          remainingCourseSlots * frac - Math.floor(remainingCourseSlots * frac),
      });
    }
    // Assign remaining slots to pools with largest fractional remainder.
    remainder.sort((a, b) => b.frac - a.frac);
    let left = remainingCourseSlots - allocated;
    for (const { reqId } of remainder) {
      if (left <= 0) break;
      const cur = result.get(reqId) ?? 0;
      const cap = ideal.get(reqId) ?? cur + 1;
      if (cur < cap) {
        result.set(reqId, cur + 1);
        left -= 1;
      }
    }
  }

  return result;
}

export function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}
