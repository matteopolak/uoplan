import type { AppState } from "../store/types";
import type { GenerationErrorDetails, GenerationErrorState } from "../store/types";
import type { DataCache } from "schedule";
import { createSeededRng } from "schedule";
import {
  generateSchedules as genSchedules,
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
import { buildColorMap, buildColorMaps } from "./colorMap";
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

/**
 * Walks the requirement tree following the user's option selections and
 * collects requirements (with candidateCourses) that are inside selected
 * option branches but NOT yet in remainingRequirements (because they were
 * processed with dryRun:true and never added to the flat list).
 */
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
      // Follow only the selected branch; skip if no selection yet.
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
      // Add this node if it is a trackable leaf requirement.
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
      // Always recurse into children of container nodes (e.g. and_group).
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
  generatedSchedules: GeneratedSchedule[];
  swapPool: string[];
  chosenCourseToRequirementId: Record<string, string>;
  schedulePoolMaps: Record<string, string>[];
  scheduleColorMaps: Record<string, number>[];
  selectedScheduleIndex: number;
  swapHistory: never[];
  generationError: GenerationErrorState | null;
  hasMoreSchedules: boolean;
}

export async function generateSchedulesAction(
  state: AppState,
  options?: { appendFirstOnly?: boolean }
): Promise<GenerateSchedulesResult | null> {
  if (state.wizardMode === "basic") {
    return await handleBasicGeneration(state, options);
  }
  const appendFirstOnly = options?.appendFirstOnly ?? false;
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
    generationSeed,
    includeClosedComponents,
    virtualSectionsOnly,
    generationLimitFirstYearCredits,
    generationCompressedSchedule,
    scheduleColorMaps: existingColorMaps,
  } = state;

  if (!cache) {
    return null;
  }
  const cacheVal = cache;

  // Supplement remainingRequirements with any branch slots still missing from the
  // flat list (defensive; computeRequirementsState usually includes selected branches).
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

  // Closed-only: virtual filtering is applied per course (depending on pool type
  // and explicit exemptions) when selecting candidates / generating timetables.
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
      generatedSchedules: state.generatedSchedules,
      swapPool: state.swapPool,
      chosenCourseToRequirementId: state.chosenCourseToRequirementId,
      schedulePoolMaps: state.schedulePoolMaps,
      scheduleColorMaps: existingColorMaps,
      selectedScheduleIndex: state.selectedScheduleIndex,
      swapHistory: [],
      hasMoreSchedules: state.hasMoreSchedules,
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

  const existingScheduleCount = appendFirstOnly ? state.generatedSchedules.length : 0;
  const rng = createSeededRng(((generationSeed >>> 0) + existingScheduleCount) >>> 0);

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

  // Honours projects: count toward semester load and are pinned (no timetable).
  // Include both Constrain-step picks and Assign-step selections — users often
  // only assign the thesis on the requirements tree without re-picking Constrain.
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

  /** Schedulable non-honours constrained courses (union E). */
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

  /** Requirement a pinned course is tied to (Constrain first, else Assign, else implicit honours). */
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
      generatedSchedules: state.generatedSchedules,
      swapPool: state.swapPool,
      chosenCourseToRequirementId: state.chosenCourseToRequirementId,
      schedulePoolMaps: state.schedulePoolMaps,
      scheduleColorMaps: state.scheduleColorMaps,
      selectedScheduleIndex: state.selectedScheduleIndex,
      swapHistory: [],
      hasMoreSchedules: state.hasMoreSchedules,
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
  let finalSchedules: GeneratedSchedule[] = [];
  let lastChosenFromPool: Record<string, string> = {};
  let finalPoolMaps: Record<string, string>[] = [];
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

  
  let hasMore = false;

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
          // Count each pinned course toward at most one requirement: the one it is
          // constrained to in Constrain. Otherwise the same code (e.g. honours thesis)
          // often appears in many pools' candidate lists and would zero out every pool.
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

    // Redistribution alternatives that specifically defer a higher-level required
    // course (all its eligible candidates are 2000+) in favour of more electives.
    // These are tried randomly on every attempt, not just on failure, so generated
    // schedules sometimes omit the high-level requirement instead of always including it.
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

    const maxAttempts = appendFirstOnly ? 100 : 300;
    const targetUniqueSchedules = appendFirstOnly ? 1 : 5;
    const seenCourseSets = new Set<string>();
    const collectedSchedules: GeneratedSchedule[] = [];
    const collectedPoolMaps: Record<string, string>[] = [];
    let lastFilteredPool: string[] = [];

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

    /**
     * Picks courses across pools in level passes: exhaust 1000-level options
     * first, then allow up to 2000, etc., then a final unrestricted pass
     * (unparseable codes only match the last pass).
     */
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

          // Count how many courses share each level bucket in this pool's list,
          // so that the total weight per bucket is fixed regardless of how many
          // courses exist at that level. Without this, a pool with 50 × 2000-level
          // courses would dominate over 5 × 1000-level ones even with per-course
          // level weights.
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

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    
    if (collectedSchedules.length >= targetUniqueSchedules) break;
      
      for (const list of candidatesByRequirement.values()) {
        shuffleInPlace(list, rng);
      }

      // Randomly choose whether to defer a high-level required course to a later
      // semester and instead take an extra elective. Each attempt picks uniformly
      // from: [base allocation, ...high-level redistribution alternatives].
      const allocationPool =
        highLevelRedistAlts.length > 0
          ? [coursesPerPool, ...highLevelRedistAlts]
          : [coursesPerPool];
      const firstAlloc =
        allocationPool[Math.floor(rng() * allocationPool.length)];

      let pickPass: PoolPickPassResult = runPoolPickPass(firstAlloc);

      if (!pickPass.ok) {
        // Try base allocation if we started with a redistribution
        if (firstAlloc !== coursesPerPool) {
          pickPass = runPoolPickPass(coursesPerPool);
        }
        // Try remaining redistribution alternatives
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

      const chosenFromPool = pickPass.chosenFromPool;
      const chosenCodes = new Set<string>(pinned);
      for (const code of Object.keys(chosenFromPool)) {
        chosenCodes.add(code);
      }

      const optionalPool = Array.from(chosenCodes).filter(
        (code) => !pinned.includes(code),
      );

      const slotsFromOptional = coursesThisSemester - pinned.length;
      if (optionalPool.length < slotsFromOptional) {
        // Keep the best partial pick so diagnostics and swapPool reflect optional
        // courses we could schedule, not an empty list after `break`.
        if (optionalPool.length > lastFilteredPool.length) {
          lastFilteredPool = optionalPool;
        }
        break;
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

      const limit = 1;
      const batch = pinned.length === 0
        ? genSchedules(
            lastFilteredPool,
            coursesThisSemester,
            attemptCache,
            constraints,
            limit
          )
        : generateSchedulesWithPinned(
            pinned,
            lastFilteredPool,
            coursesThisSemester,
            attemptCache,
            constraints,
            limit
          );

      const fullBatch = batch;
      if (fullBatch.length === 0) {
        continue;
      }

      const fingerprint = fullBatch[0].enrollments
        .map((e) => e.courseCode)
        .sort()
        .join(",");
      if (seenCourseSets.has(fingerprint)) continue;
      seenCourseSets.add(fingerprint);
      collectedSchedules.push(fullBatch[0]);
      collectedPoolMaps.push(chosenFromPool);
    }

    finalSchedules = collectedSchedules;
    finalPoolMaps = collectedPoolMaps;
    hasMore = collectedSchedules.length === targetUniqueSchedules;
    lastChosenFromPool = collectedPoolMaps[0] ?? {};

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
    const limit = appendFirstOnly ? 1 : 25;
    finalSchedules = pinned.length === 0
      ? genSchedules([], coursesThisSemester, effectiveCache, constraints, limit)
      : generateSchedulesWithPinned(
          pinned,
          [],
          coursesThisSemester,
          effectiveCache,
          constraints,
          limit
        );
    finalPoolMaps = finalSchedules.map(() => ({}));
  }

  const optionalSlotsNeeded = coursesThisSemester - pinned.length;
  if (filteredOptionalPool.length < optionalSlotsNeeded) {
    if (appendFirstOnly) {
      return {
        generatedSchedules: state.generatedSchedules,
        swapPool: state.swapPool,
        chosenCourseToRequirementId: state.chosenCourseToRequirementId,
        schedulePoolMaps: state.schedulePoolMaps,
        scheduleColorMaps: existingColorMaps,
        selectedScheduleIndex: state.selectedScheduleIndex,
        swapHistory: [],
        hasMoreSchedules: false,
        generationError: generationErrorState(
          "Not enough courses for another schedule.",
          poolDiagnostics,
        ),
      };
    }
    const swapPool = [...new Set([...pinned, ...filteredOptionalPool])];
    return {
      generatedSchedules: [],
      swapPool,
      chosenCourseToRequirementId: {},
      schedulePoolMaps: [],
      scheduleColorMaps: existingColorMaps,
      selectedScheduleIndex: 0,
      swapHistory: [],
      hasMoreSchedules: false,
      generationError: generationErrorState(
        "Not enough courses match your filters.",
        poolDiagnostics,
      ),
    };
  }

  const swapPool = [...new Set([...pinned, ...filteredOptionalPool])];
  const limitedSchedules = finalSchedules;
  const limitedPoolMaps = finalPoolMaps;

  if (appendFirstOnly && limitedSchedules.length > 0) {
    const newSchedules = [...state.generatedSchedules, limitedSchedules[0]];
    const newPoolMaps = [...state.schedulePoolMaps, limitedPoolMaps[0]];
    const newSwapPool = [
      ...new Set([
        ...state.swapPool,
        ...limitedSchedules[0].enrollments.map((e) => e.courseCode),
      ]),
    ];
    const prevColorMap = existingColorMaps[existingColorMaps.length - 1] ?? {};
    const newColorMaps = [...existingColorMaps, buildColorMap(limitedSchedules[0], prevColorMap)];
    return {
      generatedSchedules: newSchedules,
      swapPool: newSwapPool,
      chosenCourseToRequirementId: state.chosenCourseToRequirementId,
      schedulePoolMaps: newPoolMaps,
      scheduleColorMaps: newColorMaps,
      selectedScheduleIndex: newSchedules.length - 1,
      swapHistory: [],
      hasMoreSchedules: hasMore,
      generationError: null,
    };
  }

  const diagnosticsCache = cacheWithPerCourseVirtualFilter(
    cacheVal,
    includeClosedComponents,
    (code) => {
      const reqId =
        lastChosenFromPool[code] ?? requirementIdForPinnedCourse(code);
      const reqType = reqId ? requirementTypeById.get(reqId) : undefined;
      return virtualScheduleFilterApplies(
        virtualSectionsOnly,
        reqType,
        code,
        explicitExemptNormalized,
      );
    },
  );

  if (appendFirstOnly && limitedSchedules.length === 0) {
    const { details, timetableFailure } = buildTimetableFailureDiagnostics(
      poolDiagnostics,
      pinned,
      filteredOptionalPool,
      coursesThisSemester,
      diagnosticsCache,
      constraints,
    );
    return {
      generatedSchedules: state.generatedSchedules,
      swapPool: state.swapPool,
      chosenCourseToRequirementId: state.chosenCourseToRequirementId,
      schedulePoolMaps: state.schedulePoolMaps,
      scheduleColorMaps: existingColorMaps,
      selectedScheduleIndex: state.selectedScheduleIndex,
      swapHistory: [],
      hasMoreSchedules: false,
      generationError: generationErrorState(
        `${timetableFailure.leadMessage} Couldn't find another combination.`,
        details,
      ),
    };
  }

  if (limitedSchedules.length === 0) {
    const { details, timetableFailure } = buildTimetableFailureDiagnostics(
      poolDiagnostics,
      pinned,
      filteredOptionalPool,
      coursesThisSemester,
      diagnosticsCache,
      constraints,
    );
    return {
      generatedSchedules: limitedSchedules,
      swapPool,
      chosenCourseToRequirementId: lastChosenFromPool,
      schedulePoolMaps: limitedPoolMaps,
      scheduleColorMaps: [],
      selectedScheduleIndex: 0,
      swapHistory: [],
      hasMoreSchedules: false,
      generationError: generationErrorState(timetableFailure.leadMessage, details),
    };
  }

  return {
    generatedSchedules: limitedSchedules,
    swapPool,
    chosenCourseToRequirementId: lastChosenFromPool,
    schedulePoolMaps: limitedPoolMaps,
    scheduleColorMaps: buildColorMaps(limitedSchedules),
    selectedScheduleIndex: 0,
    swapHistory: [],
    hasMoreSchedules: hasMore,
    generationError: null,
  };
}

async function handleBasicGeneration(
  state: AppState,
  options?: { appendFirstOnly?: boolean }
): Promise<GenerateSchedulesResult | null> {
  const appendFirstOnly = options?.appendFirstOnly ?? false;
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
    generationSeed,
    includeClosedComponents,
    virtualSectionsOnly,
    scheduleColorMaps: existingColorMaps,
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

  const existingScheduleCount = appendFirstOnly ? state.generatedSchedules.length : 0;
  const rng = createSeededRng(((generationSeed >>> 0) + existingScheduleCount) >>> 0);

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

  
  const limit = appendFirstOnly ? 1 : 25;
  const batch = generateSchedulesWithPinned(
    pinned,
    optionalPool,
    targetCount,
    effectiveCache,
    constraints,
    limit
  );
  
  const finalSchedules = batch;
  const swapPool = [...new Set([...pinned, ...optionalPool])];
  const limitedSchedules = finalSchedules;
  const hasMore = limitedSchedules.length === limit;

  if (appendFirstOnly && limitedSchedules.length > 0) {
    const newSchedules = [...state.generatedSchedules, limitedSchedules[0]];
    const newSwapPool = [
      ...new Set([
        ...state.swapPool,
        ...limitedSchedules[0].enrollments.map((e) => e.courseCode),
      ]),
    ];
    const prevColorMap = existingColorMaps[existingColorMaps.length - 1] ?? {};
    const newColorMaps = [...existingColorMaps, buildColorMap(limitedSchedules[0], prevColorMap)];
    return {
      generatedSchedules: newSchedules,
      swapPool: newSwapPool,
      chosenCourseToRequirementId: {},
      schedulePoolMaps: [],
      scheduleColorMaps: newColorMaps,
      selectedScheduleIndex: newSchedules.length - 1,
      swapHistory: [],
      hasMoreSchedules: hasMore,
      generationError: null,
    };
  }

  if (limitedSchedules.length === 0) {
    const timetableFailure = diagnoseTimetableFailure({
      pinnedCourseCodes: pinned,
      optionalCourseCodes: optionalPool,
      targetCount: targetCount,
      cache: effectiveCache,
      constraints,
    });
    
    return {
      generatedSchedules: limitedSchedules,
      swapPool,
      chosenCourseToRequirementId: {},
      schedulePoolMaps: [],
      scheduleColorMaps: [],
      selectedScheduleIndex: 0,
      swapHistory: [],
      hasMoreSchedules: false,
      generationError: {
        message: timetableFailure.leadMessage,
        details: {
          emptyPools: [],
          totalAvailable: pinned.length + optionalPool.length,
          totalNeeded: targetCount,
          timetableFailure
        }
      },
    };
  }

  return {
    generatedSchedules: limitedSchedules,
    swapPool,
    chosenCourseToRequirementId: {},
    schedulePoolMaps: [],
    scheduleColorMaps: buildColorMaps(limitedSchedules),
    selectedScheduleIndex: 0,
    swapHistory: [],
    hasMoreSchedules: hasMore,
    generationError: null,
  };
}
