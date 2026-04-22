import type { AppState } from "../store/types";
import type { GenerationErrorDetails, GenerationErrorState } from "../store/types";
import type { DataCache } from "schedule";
import { createSeededRng } from "schedule";
import {
  generateSchedulesWithPinned,
  getValidSectionCombos,
  type GeneratedSchedule,
  type GenerationConstraints,
  type RequirementWithStatus,
  type RemainingRequirement,
} from "schedule";
import {
  cacheWithClosedFilter,
  cacheWithPerCourseVirtualFilter,
  getCourseLevel,
  getEffectiveSchedule,
} from "schedule";
import { courseMatchesFilters } from "schedule";
import { normalizeCourseCode } from "schedule";
import {
  buildPoolCaps,
  buildRequirementPools,
  computeCoursesPerPool,
  enumerateSingleRedistributions,
  isBroadElectivePoolType,
  shuffleInPlace,
  weightedRandomPick,
  type RequirementPool,
} from "../store/scheduleHelpers";
import {
  isHonoursProject,
  mergeGlobalExplicitRule,
  prerequisitesContainNonCourse,
  splitRequiredAndGeneral,
  canTakeCourse,
  buildPrereqContext,
} from "schedule";
import { collectImplicitHonoursForSchedule } from "./implicitHonours";
import { diagnoseTimetableFailure, type TimetableFailureDiagnostics } from "schedule";
import { buildColorMap } from "./colorMap";
import {
  isElectiveRequirementType,
  isWithinElectiveLevelCap,
  virtualScheduleFilterApplies,
  isWithinElectiveLevelBuckets,
} from "./electiveEligibility";

const UNKNOWN_COURSE_LEVEL = 999_000;

/** Each level tier is this many times less likely than the one below it. */
const LEVEL_WEIGHT_BASE = 2;
/** Penalty multiplier for courses with non-course prerequisites (e.g. "permission of instructor"). */
const NON_COURSE_PREREQ_PENALTY = 0.3;
/** Floor weight for courses whose level can't be parsed. */
const UNKNOWN_LEVEL_FLOOR = 0.01;

function levelSortKey(code: string): number {
  return getCourseLevel(code) ?? UNKNOWN_COURSE_LEVEL;
}

function candidateWeight(level: number, hasNonCoursePrereq: boolean): number {
  if (level >= UNKNOWN_COURSE_LEVEL) return UNKNOWN_LEVEL_FLOOR;
  const tier = Math.max(1, Math.floor(level / 1000));
  let w = 1 / Math.pow(LEVEL_WEIGHT_BASE, tier - 1);
  if (hasNonCoursePrereq) w *= NON_COURSE_PREREQ_PENALTY;
  return w;
}

function collectRequirementsFromSelectedBranches(
  nodes: RequirementWithStatus[],
  selectedOptions: Record<string, number>,
  existingIds: Set<string>,
): RemainingRequirement[] {
  const result: RemainingRequirement[] = [];
  for (const node of nodes) {
    if (node.complete) continue;
    const isOrLike = node.type === "or_group" || node.type === "options_group";
    if (isOrLike && node.requirementId != null) {
      const sel = selectedOptions[node.requirementId];
      if (sel != null && node.options?.[sel]) {
        result.push(
          ...collectRequirementsFromSelectedBranches(
            [node.options[sel]],
            selectedOptions,
            existingIds,
          ),
        );
      }
    } else {
      if (
        node.requirementId != null &&
        !existingIds.has(node.requirementId) &&
        node.candidateCourses?.length &&
        (node.creditsNeeded ?? 0) > 0
      ) {
        existingIds.add(node.requirementId);
        result.push({
          requirementId: node.requirementId,
          type: node.type,
          title: node.title,
          candidateCourses: node.candidateCourses,
          creditsNeeded: node.creditsNeeded,
          satisfiedBy: node.satisfiedBy ?? [],
        });
      }
      if (node.options?.length) {
        result.push(
          ...collectRequirementsFromSelectedBranches(
            node.options,
            selectedOptions,
            existingIds,
          ),
        );
      }
    }
  }
  return result;
}

function buildTimetableFailureDiagnostics(
  poolDiagnostics: {
    emptyPools: Array<{ label: string; requirementId?: string; candidateCourses?: string[] }>;
    totalAvailable: number;
    totalNeeded: number;
  } | null,
  pinned: string[],
  filteredOptionalPool: string[],
  coursesThisSemester: number,
  effectiveCache: DataCache,
  constraints: GenerationConstraints,
): { details: GenerationErrorDetails; timetableFailure: TimetableFailureDiagnostics } {
  const timetableFailure = diagnoseTimetableFailure({
    pinnedCourseCodes: pinned,
    optionalCourseCodes: filteredOptionalPool,
    targetCount: coursesThisSemester,
    cache: effectiveCache,
    constraints,
  });
  const details: GenerationErrorDetails = {
    emptyPools: poolDiagnostics?.emptyPools ?? [],
    totalAvailable:
      poolDiagnostics?.totalAvailable ??
      pinned.length + filteredOptionalPool.length,
    totalNeeded: poolDiagnostics?.totalNeeded ?? coursesThisSemester,
    timetableFailure,
  };
  return { details, timetableFailure };
}

function generationErrorState(
  message: string,
  details: GenerationErrorDetails | null = null,
): GenerationErrorState {
  return { message, details };
}

interface GenerateSchedulesResult {
  currentSchedule: GeneratedSchedule | null;
  swapPool: string[];
  chosenCourseToRequirementId: Record<string, string>;
  currentPoolMap: Record<string, string>;
  currentColorMap: Record<string, number>;
  generationError: GenerationErrorState | null;
}

export async function generateSchedulesAction(
  state: AppState,
): Promise<GenerateSchedulesResult | null> {
  if (state.wizardMode === "basic") {
    return await handleBasicGeneration(state);
  }

  const {
    cache,
    remainingRequirements,
    requirementTreeWithStatus,
    selectedPerRequirement,
    selectedOptionsPerRequirement,
    constrainedPerRequirement,
    coursesThisSemester,
    completedCourses,
    prereqEligibleCourses,
    unassignedCompletedCourses,
    levelBuckets,
    languageBuckets,
    electiveLevelBuckets,
    generationMinStartMinutes,
    generationMaxEndMinutes,
    generationAllowedDays,
    generationMinProfessorRating,
    professorRatings,
    currentSeed,
    firstSeed,
    includeClosedComponents,
    virtualSectionsOnly,
    generationLimitFirstYearCredits,
    generationCompressedSchedule,
  } = state;

  if (!cache) {
    return null;
  }
  const cacheVal = cache;

  // Ensure we have a valid seed
  const effectiveSeed = currentSeed || firstSeed;

  const existingReqIds = new Set(
    remainingRequirements
      .map((r) => r.requirementId)
      .filter((id): id is string => id != null),
  );
  const branchRequirements = collectRequirementsFromSelectedBranches(
    requirementTreeWithStatus,
    selectedOptionsPerRequirement,
    existingReqIds,
  );
  const effectiveRemainingRequirements = [...remainingRequirements, ...branchRequirements];

  const explicitExemptNormalized = new Set<string>();
  for (const codes of Object.values(constrainedPerRequirement)) {
    for (const code of codes) explicitExemptNormalized.add(normalizeCourseCode(code));
  }
  for (const codes of Object.values(selectedPerRequirement)) {
    for (const code of codes) explicitExemptNormalized.add(normalizeCourseCode(code));
  }

  const requirementTypeById = new Map<string, string | undefined>();
  for (const req of effectiveRemainingRequirements) {
    if (req.requirementId) requirementTypeById.set(req.requirementId, req.type);
  }

  const effectiveCache = cacheWithClosedFilter(
    cacheVal,
    includeClosedComponents,
    false,
  );

  const unassigned = [...new Set(unassignedCompletedCourses)].sort();
  if (unassigned.length > 0) {
    const previewLimit = 12;
    const preview = unassigned.slice(0, previewLimit);
    const suffix =
      unassigned.length > previewLimit
        ? ` (+${unassigned.length - previewLimit} more)`
        : "";
    return {
      currentSchedule: null,
      swapPool: [],
      chosenCourseToRequirementId: {},
      currentPoolMap: {},
      currentColorMap: {},
      generationError: generationErrorState(
        `You have ${unassigned.length} completed course${
          unassigned.length === 1 ? "" : "s"
        } not assigned to a requirement: ${preview.join(", ")}${suffix}. ` +
          `You must assign ${
            unassigned.length === 1 ? "it" : "them"
          } to requirements, or move them to the Excluded section.`,
      ),
    };
  }

  // Use currentSeed directly for deterministic generation
  const rng = createSeededRng(effectiveSeed >>> 0);

  const completedFirstYearCredits = completedCourses.reduce((sum, code) => {
    const m = code.match(/\d{4}/);
    if (!m || Number(m[0]) >= 2000) return sum;
    const course = cacheVal.getCourse(code);
    return sum + (course?.credits ?? 3);
  }, 0);

  const constraints: GenerationConstraints = {
    minStartMinutes: generationMinStartMinutes,
    maxEndMinutes: generationMaxEndMinutes,
    allowedDays: generationAllowedDays,
    minProfessorRating: generationMinProfessorRating ?? undefined,
    professorRatings: professorRatings ?? undefined,
    maxFirstYearCredits: generationLimitFirstYearCredits
      ? 48 - (completedFirstYearCredits ?? 0)
      : undefined,
    compressedSchedule: generationCompressedSchedule,
  };

  const completedSet = new Set(completedCourses.map(normalizeCourseCode));
  const prereqEligibleSet = new Set(prereqEligibleCourses);

  const allConstrained = Object.values(constrainedPerRequirement).flat();
  const uniqueConstrained = [...new Set(allConstrained)];
  const honoursSelected: string[] = [];
  const seenHonours = new Set<string>();
  for (const code of uniqueConstrained) {
    if (!isHonoursProject(code, cacheVal)) continue;
    const norm = normalizeCourseCode(code);
    if (completedSet.has(norm)) continue;
    if (!prereqEligibleSet.has(code)) continue;
    if (seenHonours.has(norm)) continue;
    seenHonours.add(norm);
    honoursSelected.push(code);
  }
  for (const codes of Object.values(selectedPerRequirement)) {
    for (const code of codes) {
      if (!isHonoursProject(code, cacheVal)) continue;
      const norm = normalizeCourseCode(code);
      if (completedSet.has(norm)) continue;
      if (!prereqEligibleSet.has(code)) continue;
      if (seenHonours.has(norm)) continue;
      seenHonours.add(norm);
      honoursSelected.push(code);
    }
  }

  const implicitHonoursPicks = collectImplicitHonoursForSchedule(
    effectiveRemainingRequirements,
    selectedPerRequirement,
    completedSet,
    prereqEligibleSet,
    cacheVal,
    includeClosedComponents,
    virtualSectionsOnly,
    explicitExemptNormalized,
    seenHonours,
  );
  const implicitHonoursRequirementId = new Map<string, string>();
  for (const { code, requirementId } of implicitHonoursPicks) {
    honoursSelected.push(code);
    implicitHonoursRequirementId.set(normalizeCourseCode(code), requirementId);
  }

  const honoursCount = honoursSelected.length;
  const effectiveTarget = Math.max(0, coursesThisSemester - honoursCount);

  const explicitUnion: string[] = [];
  const explicitSet = new Set<string>();
  for (const code of uniqueConstrained) {
    if (isHonoursProject(code, cacheVal)) continue;
    if (
      !getEffectiveSchedule(
        cacheVal,
        code,
        includeClosedComponents,
        false,
      ) ||
      completedSet.has(normalizeCourseCode(code)) ||
      !prereqEligibleSet.has(code)
    ) {
      continue;
    }
    if (!explicitSet.has(code)) {
      explicitSet.add(code);
      explicitUnion.push(code);
    }
  }

  const { pinAllExplicit, explicitOnly } = mergeGlobalExplicitRule(
    explicitUnion.length,
    effectiveTarget,
  );

  const pinned: string[] = [...honoursSelected];
  if (pinAllExplicit) {
    for (const code of explicitUnion) {
      if (!pinned.includes(code)) pinned.push(code);
    }
  }

  function requirementIdForConstrainedCode(code: string): string | undefined {
    const norm = normalizeCourseCode(code);
    for (const [reqId, codes] of Object.entries(constrainedPerRequirement)) {
      if (codes.some((c) => normalizeCourseCode(c) === norm)) return reqId;
    }
    return undefined;
  }

  function requirementIdForPinnedCourse(code: string): string | undefined {
    const fromConstrain = requirementIdForConstrainedCode(code);
    if (fromConstrain != null) return fromConstrain;
    const norm = normalizeCourseCode(code);
    const implicitReq = implicitHonoursRequirementId.get(norm);
    if (implicitReq != null) return implicitReq;
    for (const [reqId, codes] of Object.entries(selectedPerRequirement)) {
      if (codes.some((c) => normalizeCourseCode(c) === norm)) return reqId;
    }
    return undefined;
  }

  const missingOptionGroups: string[] = [];

  function walkNodes(
    nodes: typeof requirementTreeWithStatus,
    parentRequirementId: string | undefined,
    parentSelectedIndex: number | undefined,
    parentChildIndex: number | undefined,
  ): void {
    for (let idx = 0; idx < nodes.length; idx++) {
      const node = nodes[idx];
      const parentActive =
        parentRequirementId == null ||
        parentSelectedIndex == null ||
        parentSelectedIndex === parentChildIndex;
      const active = parentActive;
      if (!active) {
        continue;
      }

      if (
        (node.type === "or_group" || node.type === "options_group") &&
        node.requirementId &&
        !node.complete
      ) {
        const sel = selectedOptionsPerRequirement[node.requirementId];
        if (sel == null) {
          missingOptionGroups.push(node.title ?? node.type);
        }
      }

      if (node.options && node.options.length > 0) {
        const currentReqId = node.requirementId;
        const currentSelectedIndex =
          currentReqId != null
            ? selectedOptionsPerRequirement[currentReqId]
            : undefined;
        for (let childIdx = 0; childIdx < node.options.length; childIdx++) {
          walkNodes(
            [node.options[childIdx]],
            currentReqId ?? parentRequirementId,
            currentReqId != null ? currentSelectedIndex : parentSelectedIndex,
            childIdx,
          );
        }
      }
    }
  }

  walkNodes(requirementTreeWithStatus, undefined, undefined, undefined);

  if (missingOptionGroups.length > 0) {
    return {
      currentSchedule: null,
      swapPool: [],
      chosenCourseToRequirementId: {},
      currentPoolMap: {},
      currentColorMap: {},
      generationError: generationErrorState(
        "Complete Assign requirements before generating schedules.",
      ),
    };
  }

  const filters = {
    levels: levelBuckets,
    languageBuckets,
  };

  const nonHonoursPinnedCount = pinned.filter(
    (c) => !isHonoursProject(c, cacheVal),
  ).length;
  const remainingNeeded = Math.max(0, effectiveTarget - nonHonoursPinnedCount);
  let filteredOptionalPool: string[] = [];
  let finalPoolMap: Record<string, string> = {};
  let foundSchedule: GeneratedSchedule | null = null;
  let poolDiagnostics: {
    emptyPools: Array<{ label: string; requirementId?: string; candidateCourses?: string[] }>;
    totalAvailable: number;
    totalNeeded: number;
  } | null = null;

  function isEligibleCandidate(code: string, poolType?: string): boolean {
    const virtualOnly = virtualScheduleFilterApplies(
      virtualSectionsOnly,
      poolType,
      code,
      explicitExemptNormalized,
    );
    const sched = getEffectiveSchedule(
      cacheVal,
      code,
      includeClosedComponents,
      virtualOnly,
    );
    if (
      !sched ||
      pinned.includes(code) ||
      completedSet.has(normalizeCourseCode(code)) ||
      !prereqEligibleSet.has(code) ||
      !courseMatchesFilters(code, filters)
    ) {
      return false;
    }
    if (isHonoursProject(code, cacheVal)) return false;
    if (isElectiveRequirementType(poolType) && !isWithinElectiveLevelCap(code)) {
      return false;
    }
    if (getValidSectionCombos(sched, constraints).length === 0) return false;
    return true;
  }

  if (remainingNeeded > 0) {
    const allPools = buildRequirementPools(effectiveRemainingRequirements);

    let pools: RequirementPool[] = allPools
      .map((pool) => {
        const constrainedForPool =
          constrainedPerRequirement[pool.requirementId] ?? [];
        const selectedForPool =
          selectedPerRequirement[pool.requirementId] ?? [];
        let pinnedCredits = 0;
        for (const code of pinned) {
          const primaryReqId = requirementIdForPinnedCourse(code);
          if (primaryReqId != null) {
            if (pool.requirementId !== primaryReqId) continue;
            const course = cacheVal.getCourse(code);
            pinnedCredits += course?.credits ?? 3;
            continue;
          }
          if (
            !pool.candidateCourses.includes(code) &&
            !constrainedForPool.includes(code)
          ) {
            continue;
          }
          const course = cacheVal.getCourse(code);
          pinnedCredits += course?.credits ?? 3;
        }
        let completedSelectedCredits = 0;
        for (const code of selectedForPool) {
          if (!completedSet.has(normalizeCourseCode(code))) continue;
          const course = cacheVal.getCourse(code);
          completedSelectedCredits += course?.credits ?? 3;
        }
        const remainingCredits = Math.max(
          0,
          pool.creditsNeeded - pinnedCredits - completedSelectedCredits,
        );
        return { ...pool, creditsNeeded: remainingCredits };
      })
      .filter((pool) => pool.creditsNeeded > 0);

    pools = pools.filter((pool) => {
      if (pool.type !== "course" && pool.type !== "or_course") return true;
      const hasSchedulableNonHonours = pool.candidateCourses.some((code) => {
        if (isHonoursProject(code, cacheVal)) return false;
        return !!getEffectiveSchedule(
          cacheVal,
          code,
          includeClosedComponents,
          virtualScheduleFilterApplies(
            virtualSectionsOnly,
            pool.type,
            code,
            explicitExemptNormalized,
          ),
        );
      });
      return hasSchedulableNonHonours;
    });

    const candidatesByRequirement = new Map<string, string[]>();
    for (const pool of pools) {
      const candidates: string[] = [];
      for (const code of pool.candidateCourses) {
        const sched = getEffectiveSchedule(
          cacheVal,
          code,
          includeClosedComponents,
          virtualScheduleFilterApplies(
            virtualSectionsOnly,
            pool.type,
            code,
            explicitExemptNormalized,
          ),
        );
        if (
          !sched ||
          pinned.includes(code) ||
          completedCourses.includes(code) ||
          !prereqEligibleSet.has(code) ||
          !courseMatchesFilters(code, filters)
        ) {
          continue;
        }
        const isElectiveType = isElectiveRequirementType(pool.type);
        if (isElectiveType && !isWithinElectiveLevelCap(code)) {
          continue;
        }
        if (
          electiveLevelBuckets.length > 0 &&
          isBroadElectivePoolType(pool.type)
        ) {
          const match = code.match(/\d{4}/);
          if (match) {
            const num = Number.parseInt(match[0], 10);
            if (!Number.isNaN(num)) {
              const bucket = Math.floor(num / 1000) * 1000;
              if (!electiveLevelBuckets.includes(bucket)) {
                continue;
              }
            }
          }
        }
        if (isHonoursProject(code, cacheVal)) continue;
        if (getValidSectionCombos(sched, constraints).length === 0) continue;
        candidates.push(code);
      }
      if (candidates.length > 0) {
        candidatesByRequirement.set(pool.requirementId, candidates);
      }
    }

    const poolsWithNoEligibleCandidates = pools.filter(
      (p) => !candidatesByRequirement.has(p.requirementId),
    );
    pools = pools.filter((p) => candidatesByRequirement.has(p.requirementId));

    const coursesPerPool = computeCoursesPerPool(
      pools,
      remainingNeeded,
      cacheVal,
    );
    const poolCaps = buildPoolCaps(pools);
    const redistributionAlts = enumerateSingleRedistributions(
      coursesPerPool,
      pools,
      poolCaps,
    );

    const highLevelPoolIds = new Set<string>();
    for (const pool of pools) {
      if (isBroadElectivePoolType(pool.type)) continue;
      const candidates = candidatesByRequirement.get(pool.requirementId) ?? [];
      if (candidates.length > 0 && candidates.every((c) => levelSortKey(c) >= 2000)) {
        highLevelPoolIds.add(pool.requirementId);
      }
    }
    const highLevelRedistAlts = redistributionAlts.filter((alt) =>
      [...alt.entries()].some(
        ([id, count]) =>
          highLevelPoolIds.has(id) && count < (coursesPerPool.get(id) ?? 0),
      ),
    );

    const maxAttempts = 300;
    const seenCourseSets = new Set<string>();
    let chosenFromPool: Record<string, string> = {};

    type PoolPickFailureDetail = {
      poolRequirementId: string;
      poolLabel: string;
      poolType: string;
      need: number;
      sAvailCount: number;
      gAvailCount: number;
      kUser: number;
      kGeneral: number;
      explicitOnly: boolean;
    };

    type PoolPickPassResult =
      | { ok: true; chosenFromPool: Record<string, string> }
      | { ok: false; failure?: PoolPickFailureDetail };

    function poolPickFailure(
      pool: RequirementPool,
      need: number,
      sAvailLen: number,
      gAvailLen: number,
    ): PoolPickPassResult {
      const { kUser, kGeneral } = splitRequiredAndGeneral(need, sAvailLen);
      return {
        ok: false,
        failure: {
          poolRequirementId: pool.requirementId,
          poolLabel: pool.label,
          poolType: String(pool.type),
          need,
          sAvailCount: sAvailLen,
          gAvailCount: gAvailLen,
          kUser,
          kGeneral,
          explicitOnly,
        },
      };
    }

    function runPoolPickPass(
      perPoolNeed: Map<string, number>,
    ): PoolPickPassResult {
      const chosenCodes = new Set<string>(pinned);
      const chosenFromPool: Record<string, string> = {};
      for (const code of pinned) {
        if (isHonoursProject(code, cacheVal)) continue;
        const reqId = requirementIdForPinnedCourse(code);
        if (reqId) chosenFromPool[code] = reqId;
      }

      const remaining = new Map<string, number>();
      for (const pool of pools) {
        const n = perPoolNeed.get(pool.requirementId) ?? 0;
        if (n > 0) remaining.set(pool.requirementId, n);
      }

      const totalRemaining = (): number =>
        [...remaining.values()].reduce((a, b) => a + b, 0);

      for (const pool of pools) {
        const r = remaining.get(pool.requirementId) ?? 0;
        if (r <= 0) continue;

        const constrainedForPool =
          constrainedPerRequirement[pool.requirementId] ?? [];
        const S = constrainedForPool.filter((code) =>
          isEligibleCandidate(code, pool.type),
        );
        const sSet = new Set(S);
        const candidates =
          candidatesByRequirement.get(pool.requirementId) ?? [];
        const G = candidates.filter((code) => !sSet.has(code));

        const SAvail = S.filter((code) => !chosenCodes.has(code));
        let GAvail = G.filter((code) => !chosenCodes.has(code));
        if (explicitOnly) {
          GAvail = GAvail.filter((code) => explicitSet.has(code));
        }

        const needS = Math.min(r, SAvail.length);
        const needG = r - needS;
        if (needG > GAvail.length) {
          return poolPickFailure(pool, r, SAvail.length, GAvail.length);
        }
      }

      type WeightedCand = {
        pool: RequirementPool;
        code: string;
        weight: number;
      };

      while (totalRemaining() > 0) {
        const cands: WeightedCand[] = [];

        for (const pool of pools) {
          const r = remaining.get(pool.requirementId) ?? 0;
          if (r <= 0) continue;

          const constrainedForPool =
            constrainedPerRequirement[pool.requirementId] ?? [];
          const S = constrainedForPool.filter((code) =>
            isEligibleCandidate(code, pool.type),
          );
          const sSet = new Set(S);
          const candidates =
            candidatesByRequirement.get(pool.requirementId) ?? [];
          const G = candidates.filter((code) => !sSet.has(code));

          const SAvail = S.filter((code) => !chosenCodes.has(code));
          let GAvail = G.filter((code) => !chosenCodes.has(code));
          if (explicitOnly) {
            GAvail = GAvail.filter((code) => explicitSet.has(code));
          }

          const needS = Math.min(r, SAvail.length);
          const needG = r - needS;
          if (needG > GAvail.length) {
            return poolPickFailure(pool, r, SAvail.length, GAvail.length);
          }

          const pickFromS = needS > 0;
          const list = pickFromS ? SAvail : GAvail;

          const levelCounts = new Map<number, number>();
          for (const code of list) {
            const lv = levelSortKey(code);
            levelCounts.set(lv, (levelCounts.get(lv) ?? 0) + 1);
          }

          for (const code of list) {
            const level = levelSortKey(code);
            const hasNonCoursePrereq = prerequisitesContainNonCourse(
              cacheVal.getCourse(code)?.prerequisites,
            );
            const bucketSize = levelCounts.get(level) ?? 1;
            cands.push({
              pool,
              code,
              weight: candidateWeight(level, hasNonCoursePrereq) / bucketSize,
            });
          }
        }

        if (cands.length === 0) {
          break;
        }

        const picked = weightedRandomPick(
          cands,
          cands.map((c) => c.weight),
          rng,
        );

        chosenCodes.add(picked.code);
        chosenFromPool[picked.code] = picked.pool.requirementId;
        const prev = remaining.get(picked.pool.requirementId) ?? 0;
        remaining.set(picked.pool.requirementId, prev - 1);
      }

      if (totalRemaining() > 0) {
        for (const pool of pools) {
          const r = remaining.get(pool.requirementId) ?? 0;
          if (r <= 0) continue;
          const constrainedForPool =
            constrainedPerRequirement[pool.requirementId] ?? [];
          const S = constrainedForPool.filter((code) =>
            isEligibleCandidate(code, pool.type),
          );
          const sSet = new Set(S);
          const candidates =
            candidatesByRequirement.get(pool.requirementId) ?? [];
          const G = candidates.filter((code) => !sSet.has(code));
          const SAvail = S.filter((code) => !chosenCodes.has(code));
          let GAvail = G.filter((code) => !chosenCodes.has(code));
          if (explicitOnly) {
            GAvail = GAvail.filter((code) => explicitSet.has(code));
          }
          return poolPickFailure(pool, r, SAvail.length, GAvail.length);
        }
        return { ok: false };
      }

      return { ok: true, chosenFromPool };
    }

    let lastFilteredPool: string[] = [];

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (foundSchedule) break;

      for (const list of candidatesByRequirement.values()) {
        shuffleInPlace(list, rng);
      }

      const allocationPool =
        highLevelRedistAlts.length > 0
          ? [coursesPerPool, ...highLevelRedistAlts]
          : [coursesPerPool];
      const firstAlloc =
        allocationPool[Math.floor(rng() * allocationPool.length)];

      let pickPass: PoolPickPassResult = runPoolPickPass(firstAlloc);

      if (!pickPass.ok) {
        if (firstAlloc !== coursesPerPool) {
          pickPass = runPoolPickPass(coursesPerPool);
        }
        if (!pickPass.ok) {
          for (const alt of redistributionAlts) {
            if (alt === firstAlloc) continue;
            pickPass = runPoolPickPass(alt);
            if (pickPass.ok) {
              break;
            }
          }
        }
      }

      if (!pickPass.ok) {
        continue;
      }

      chosenFromPool = pickPass.chosenFromPool;
      const chosenCodes = new Set<string>(pinned);
      for (const code of Object.keys(chosenFromPool)) {
        chosenCodes.add(code);
      }

      const optionalPool = Array.from(chosenCodes).filter(
        (code) => !pinned.includes(code),
      );

      const slotsFromOptional = coursesThisSemester - pinned.length;
      if (optionalPool.length < slotsFromOptional) {
        if (optionalPool.length > lastFilteredPool.length) {
          lastFilteredPool = optionalPool;
        }
        continue;
      }

      lastFilteredPool = optionalPool;
      shuffleInPlace(lastFilteredPool, rng);

      const attemptCache = cacheWithPerCourseVirtualFilter(
        cacheVal,
        includeClosedComponents,
        (code) => {
          const reqId =
            chosenFromPool[code] ?? requirementIdForPinnedCourse(code);
          const reqType = reqId ? requirementTypeById.get(reqId) : undefined;
          return virtualScheduleFilterApplies(
            virtualSectionsOnly,
            reqType,
            code,
            explicitExemptNormalized,
          );
        },
      );

      const batch = pinned.length === 0
        ? generateSchedulesWithPinned(
            lastFilteredPool,
            [],
            coursesThisSemester,
            attemptCache,
            constraints,
            1
          )
        : generateSchedulesWithPinned(
            pinned,
            lastFilteredPool,
            coursesThisSemester,
            attemptCache,
            constraints,
            1
          );

      if (batch.length > 0) {
        const fingerprint = batch[0].enrollments
          .map((e) => e.courseCode)
          .sort()
          .join(",");
        if (!seenCourseSets.has(fingerprint)) {
          seenCourseSets.add(fingerprint);
          foundSchedule = batch[0];
        }
      }
    }

    filteredOptionalPool = lastFilteredPool;

    const emptyPools = poolsWithNoEligibleCandidates.map((p) => ({
      label: p.label,
      requirementId: p.requirementId,
      candidateCourses: p.candidateCourses,
    }));
    poolDiagnostics = {
      emptyPools,
      totalAvailable: pinned.length + filteredOptionalPool.length,
      totalNeeded: coursesThisSemester,
    };
  }

  if (remainingNeeded <= 0) {
    filteredOptionalPool = [];
    const batch = pinned.length === 0
      ? generateSchedulesWithPinned([], [], coursesThisSemester, effectiveCache, constraints, 1)
      : generateSchedulesWithPinned(
          pinned,
          [],
          coursesThisSemester,
          effectiveCache,
          constraints,
          1
        );
    if (batch.length > 0) {
      finalPoolMap = {};
      foundSchedule = batch[0];
    }
  }

  const optionalSlotsNeeded = coursesThisSemester - pinned.length;
  if (filteredOptionalPool.length < optionalSlotsNeeded) {
    const swapPool = [...new Set([...pinned, ...filteredOptionalPool])];
    return {
      currentSchedule: null,
      swapPool,
      chosenCourseToRequirementId: finalPoolMap,
      currentPoolMap: finalPoolMap,
      currentColorMap: {},
      generationError: generationErrorState(
        "Not enough courses match your filters.",
        poolDiagnostics,
      ),
    };
  }

  if (!foundSchedule) {
    const { details, timetableFailure } = buildTimetableFailureDiagnostics(
      poolDiagnostics,
      pinned,
      filteredOptionalPool,
      coursesThisSemester,
      cacheWithPerCourseVirtualFilter(
        cacheVal,
        includeClosedComponents,
        (code) => {
          const reqId = finalPoolMap[code] ?? requirementIdForPinnedCourse(code);
          const reqType = reqId ? requirementTypeById.get(reqId) : undefined;
          return virtualScheduleFilterApplies(
            virtualSectionsOnly,
            reqType,
            code,
            explicitExemptNormalized,
          );
        },
      ),
      constraints,
    );
    const swapPool = [...new Set([...pinned, ...filteredOptionalPool])];
    return {
      currentSchedule: null,
      swapPool,
      chosenCourseToRequirementId: finalPoolMap,
      currentPoolMap: finalPoolMap,
      currentColorMap: {},
      generationError: generationErrorState(timetableFailure.leadMessage, details),
    };
  }

  const swapPool = [...new Set([...pinned, ...filteredOptionalPool])];
  return {
    currentSchedule: foundSchedule,
    swapPool,
    chosenCourseToRequirementId: finalPoolMap,
    currentPoolMap: finalPoolMap,
    currentColorMap: buildColorMap(foundSchedule, {}),
    generationError: null,
  };
}

async function handleBasicGeneration(
  state: AppState,
): Promise<GenerateSchedulesResult | null> {
  const {
    cache,
    basicPinnedCourses,
    basicElectivesCount,
    basicExcludedCategories,
    levelBuckets,
    languageBuckets,
    electiveLevelBuckets,
    generationMinStartMinutes,
    generationMaxEndMinutes,
    generationAllowedDays,
    generationMinProfessorRating,
    professorRatings,
    currentSeed,
    firstSeed,
    includeClosedComponents,
    virtualSectionsOnly,
    completedCourses,
    studentPrograms,
  } = state;

  if (!cache) {
    return null;
  }

  const pinned = basicPinnedCourses;
  const pinnedNormalized = new Set(pinned.map(normalizeCourseCode));
  const baseCache = cacheWithClosedFilter(cache, includeClosedComponents, false);
  const effectiveCache = cacheWithPerCourseVirtualFilter(
    cache,
    includeClosedComponents,
    (code) => virtualSectionsOnly && !pinnedNormalized.has(normalizeCourseCode(code)),
  );

  const effectiveSeed = currentSeed || firstSeed;
  const rng = createSeededRng(effectiveSeed >>> 0);

  const constraints: GenerationConstraints = {
    minStartMinutes: generationMinStartMinutes,
    maxEndMinutes: generationMaxEndMinutes,
    allowedDays: generationAllowedDays,
    minProfessorRating: generationMinProfessorRating ?? undefined,
    professorRatings: professorRatings ?? undefined,
  };

  const targetCount = pinned.length + basicElectivesCount;

  const optionalPool: string[] = [];
  const excludedPrefixes = basicExcludedCategories.map((c) => c.toLowerCase());
  const filters = { levels: levelBuckets, languageBuckets };

  const prereqCtx = buildPrereqContext(completedCourses, baseCache, studentPrograms);

  for (const course of cache.getAllCourses()) {
    const code = course.code;
    if (!courseMatchesFilters(code, filters)) continue;
    if (!isWithinElectiveLevelBuckets(code, electiveLevelBuckets)) continue;

    const prefixMatch = code.match(/^([A-Z]{3,4})/i);
    const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : "";
    if (excludedPrefixes.includes(prefix)) continue;

    if (completedCourses.length > 0) {
      if (course.prerequisites) {
        if (!canTakeCourse(code, effectiveCache, prereqCtx)) continue;
      } else if (course.prereqText) {
        continue;
      }
    } else {
      if (course.prerequisites || course.prereqText) continue;
    }

    if (pinned.includes(code)) continue;

    const sched = effectiveCache.getSchedule(code);
    if (!sched) continue;

    if (getValidSectionCombos(sched, constraints).length === 0) continue;

    optionalPool.push(code);
  }

  shuffleInPlace(optionalPool, rng);

  const batch = generateSchedulesWithPinned(
    pinned,
    optionalPool,
    targetCount,
    effectiveCache,
    constraints,
    1,
  );

  if (batch.length === 0) {
    const timetableFailure = diagnoseTimetableFailure({
      pinnedCourseCodes: pinned,
      optionalCourseCodes: optionalPool,
      targetCount: targetCount,
      cache: effectiveCache,
      constraints,
    });

    return {
      currentSchedule: null,
      swapPool: [...new Set([...pinned, ...optionalPool])],
      chosenCourseToRequirementId: {},
      currentPoolMap: {},
      currentColorMap: {},
      generationError: {
        message: timetableFailure.leadMessage,
        details: {
          emptyPools: [],
          totalAvailable: pinned.length + optionalPool.length,
          totalNeeded: targetCount,
          timetableFailure,
        },
      },
    };
  }

  const swapPool = [...new Set([...pinned, ...optionalPool])];
  return {
    currentSchedule: batch[0],
    swapPool,
    chosenCourseToRequirementId: {},
    currentPoolMap: {},
    currentColorMap: buildColorMap(batch[0], {}),
    generationError: null,
  };
}
