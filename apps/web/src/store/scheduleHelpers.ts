import type { RemainingRequirement } from "schedule";
import type { DataCache } from "schedule";

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

function poolCourseCap(pool: RequirementPool): number {
  return Math.max(
    pool.minCourses,
    Math.ceil(pool.creditsNeeded / DEFAULT_CREDITS_PER_COURSE),
  );
}

/**
 * Whole-catalog style elective pools (not discipline-scoped). Kept in sync with
 * level-bucket filtering for electives in generateSchedulesAction.
 */
export function isBroadElectivePoolType(type: string): boolean {
  return (
    type === "elective" ||
    type === "free_elective" ||
    type === "non_discipline_elective" ||
    type === "faculty_elective"
  );
}

function sumCapForPools(
  poolSubset: RequirementPool[],
  cap: Map<string, number>,
): number {
  let s = 0;
  for (const p of poolSubset) {
    s += cap.get(p.requirementId) ?? 0;
  }
  return s;
}

function greedyPlaceOne(
  poolSubset: RequirementPool[],
  result: Map<string, number>,
  cap: Map<string, number>,
): boolean {
  const next = poolSubset
    .map((p) => {
      const cur = result.get(p.requirementId) ?? 0;
      const maxC = cap.get(p.requirementId) ?? 0;
      return { pool: p, cur, maxC, room: maxC - cur };
    })
    .filter((x) => x.room > 0)
    .sort((a, b) => {
      if (b.room !== a.room) return b.room - a.room;
      return b.pool.creditsNeeded - a.pool.creditsNeeded;
    })[0];
  if (!next) return false;
  result.set(next.pool.requirementId, next.cur + 1);
  return true;
}

/** Subject prefix (e.g. "MAT") for diversity ordering; mirrors requirements.ts getDiscipline. */
export function disciplinePrefixFromCourseCode(code: string): string {
  return code.split(/\s+/)[0]?.toUpperCase() ?? "";
}

/**
 * After shuffling, move courses whose discipline is not yet represented in
 * `chosenCodes` first (stable for ties). Mutates `codes`.
 */
export function reorderGeneralPoolForDisciplineDiversity(
  codes: string[],
  chosenCodes: Set<string>,
): void {
  const chosenDisciplines = new Set<string>();
  for (const code of chosenCodes) {
    chosenDisciplines.add(disciplinePrefixFromCourseCode(code));
  }
  codes.sort((a, b) => {
    const da = disciplinePrefixFromCourseCode(a);
    const db = disciplinePrefixFromCourseCode(b);
    const aSeen = chosenDisciplines.has(da);
    const bSeen = chosenDisciplines.has(db);
    if (aSeen !== bSeen) return aSeen ? 1 : -1;
    return 0;
  });
}

/**
 * Allocates up to `remainingCourseSlots` across requirement pools without exceeding
 * per-pool credit caps (ceil(creditsNeeded / 3), at least minCourses). Total
 * allocated is `min(remainingCourseSlots, sum of caps)`.
 *
 * Two phases: fill structured pools (core, OR, pick, discipline_elective, etc.)
 * first, then broad catalogue electives — so large elective pools do not starve
 * smaller requirements when structured caps can still absorb slots.
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

  const cap = new Map<string, number>();
  let sumCap = 0;
  for (const pool of pools) {
    const c = poolCourseCap(pool);
    cap.set(pool.requirementId, c);
    sumCap += c;
    result.set(pool.requirementId, 0);
  }

  if (sumCap === 0) return new Map();

  const target = Math.min(remainingCourseSlots, sumCap);
  const structuredPools = pools.filter((p) => !isBroadElectivePoolType(p.type));
  const broadPools = pools.filter((p) => isBroadElectivePoolType(p.type));
  const sumCapStructured = sumCapForPools(structuredPools, cap);

  let placed = 0;
  const targetStructured = Math.min(target, sumCapStructured);
  while (placed < targetStructured) {
    if (!greedyPlaceOne(structuredPools, result, cap)) break;
    placed += 1;
  }

  while (placed < target) {
    if (!greedyPlaceOne(broadPools, result, cap)) break;
    placed += 1;
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
