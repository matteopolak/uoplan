import type { AppState } from "../store/appStore";
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
import { cacheWithClosedFilter, getEffectiveSchedule } from "schedule";
import { courseMatchesFilters } from "schedule";
import { normalizeCourseCode } from "schedule";
import {
  buildRequirementPools,
  computeCoursesPerPool,
  isBroadElectivePoolType,
  reorderGeneralPoolForDisciplineDiversity,
  shuffleInPlace,
  type RequirementPool,
} from "../store/scheduleHelpers";
import {
  isHonoursProject,
  mergeGlobalExplicitRule,
  pickFromUserAndGeneralPools,
} from "schedule";
import { collectImplicitHonoursForSchedule } from "./implicitHonours";

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

export interface GenerateSchedulesResult {
  generatedSchedules: GeneratedSchedule[];
  swapPool: string[];
  chosenCourseToRequirementId: Record<string, string>;
  schedulePoolMaps: Record<string, string>[];
  selectedScheduleIndex: number;
  swapHistory: never[];
  generationError: string | null;
  generationErrorDetails: {
    emptyPools: Array<{ label: string; requirementId?: string }>;
    totalAvailable: number;
    totalNeeded: number;
  } | null;
}

export async function generateSchedulesAction(
  state: AppState,
  options?: { appendFirstOnly?: boolean }
): Promise<GenerateSchedulesResult | null> {
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
    generationLimitFirstYearCredits,
    generationCompressedSchedule,
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
  const effectiveCache = cacheWithClosedFilter(
    cacheVal,
    includeClosedComponents,
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
      selectedScheduleIndex: state.selectedScheduleIndex,
      swapHistory: [],
      generationError: `Assign all completed courses to requirements before generating schedules. Unassigned: ${preview.join(", ")}${suffix}`,
      generationErrorDetails: null,
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
      ? Math.max(0, 48 - completedFirstYearCredits)
      : undefined,
    compressedSchedule: generationCompressedSchedule || undefined,
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
      !getEffectiveSchedule(cacheVal, code, includeClosedComponents) ||
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
      selectedScheduleIndex: state.selectedScheduleIndex,
      swapHistory: [],
      generationError: "Please choose exactly one option in each \"or\" block before generating schedules.",
      generationErrorDetails: null,
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
    emptyPools: Array<{ label: string; requirementId?: string }>;
    totalAvailable: number;
    totalNeeded: number;
  } | null = null;

  function isEligibleCandidate(code: string, poolType?: string): boolean {
    const sched = getEffectiveSchedule(
      cacheVal,
      code,
      includeClosedComponents,
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
    if (poolType !== "course" && isHonoursProject(code, cacheVal)) return false;
    if (getValidSectionCombos(sched, constraints).length === 0) return false;
    return true;
  }

  const yieldToMain = (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, 0));

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
        const isElectiveType =
          pool.type === "elective" ||
          pool.type === "free_elective" ||
          pool.type === "non_discipline_elective" ||
          pool.type === "faculty_elective";
        if (electiveLevelBuckets.length > 0 && isElectiveType) {
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
        if (pool.type !== "course" && isHonoursProject(code, cacheVal)) continue;
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

    const maxAttempts = appendFirstOnly ? 100 : 300;
    const targetUniqueSchedules = appendFirstOnly ? 1 : 5;
    const seenCourseSets = new Set<string>();
    const collectedSchedules: GeneratedSchedule[] = [];
    const collectedPoolMaps: Record<string, string>[] = [];
    let lastFilteredPool: string[] = [];

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (collectedSchedules.length >= targetUniqueSchedules) break;
      if (attempt > 0 && attempt % 5 === 0) await yieldToMain();

      for (const list of candidatesByRequirement.values()) {
        shuffleInPlace(list, rng);
      }

      const chosenCodes = new Set<string>(pinned);
      const chosenFromPool: Record<string, string> = {};
      for (const code of pinned) {
        if (isHonoursProject(code, cacheVal)) continue;
        const reqId = requirementIdForPinnedCourse(code);
        if (reqId) chosenFromPool[code] = reqId;
      }

      let poolPickFailed = false;
      for (const pool of pools) {
        const need = coursesPerPool.get(pool.requirementId) ?? 0;
        if (need <= 0) continue;

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
        const sPick = [...SAvail];
        shuffleInPlace(sPick, rng);

        let GAvail = G.filter((code) => !chosenCodes.has(code));
        if (explicitOnly) {
          GAvail = GAvail.filter((code) => explicitSet.has(code));
        }
        shuffleInPlace(GAvail, rng);
        if (isBroadElectivePoolType(pool.type)) {
          reorderGeneralPoolForDisciplineDiversity(GAvail, chosenCodes);
        }

        const { userPicks, generalPicks, ok } = pickFromUserAndGeneralPools({
          need,
          sAvailOrdered: sPick,
          gAvailOrdered: GAvail,
        });
        if (!ok) {
          poolPickFailed = true;
          break;
        }
        for (const code of userPicks) {
          chosenCodes.add(code);
          chosenFromPool[code] = pool.requirementId;
        }
        for (const code of generalPicks) {
          chosenCodes.add(code);
          chosenFromPool[code] = pool.requirementId;
        }
      }

      if (poolPickFailed) {
        continue;
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

      const batch =
        pinned.length === 0
          ? genSchedules(
              lastFilteredPool,
              coursesThisSemester,
              effectiveCache,
              constraints,
            )
          : generateSchedulesWithPinned(
              pinned,
              lastFilteredPool,
              coursesThisSemester,
              effectiveCache,
              constraints,
            );

      const fullBatch = batch.filter(
        (s) => s.enrollments.length >= coursesThisSemester,
      );
      if (fullBatch.length === 0) continue;

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
    lastChosenFromPool = collectedPoolMaps[0] ?? {};

    filteredOptionalPool = lastFilteredPool;

    const emptyPools = poolsWithNoEligibleCandidates.map((p) => ({
      label: p.label,
      requirementId: p.requirementId,
    }));
    poolDiagnostics = {
      emptyPools,
      totalAvailable: pinned.length + filteredOptionalPool.length,
      totalNeeded: coursesThisSemester,
    };
  }

  if (remainingNeeded <= 0) {
    filteredOptionalPool = [];
    finalSchedules =
      pinned.length === 0
        ? genSchedules([], coursesThisSemester, effectiveCache, constraints)
        : generateSchedulesWithPinned(
            pinned,
            [],
            coursesThisSemester,
            effectiveCache,
            constraints,
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
        selectedScheduleIndex: state.selectedScheduleIndex,
        swapHistory: [],
        generationError: "Not enough eligible courses to generate another schedule. Try relaxing filters or changing selections.",
        generationErrorDetails: poolDiagnostics,
      };
    }
    const swapPool = [...new Set([...pinned, ...filteredOptionalPool])];
    return {
      generatedSchedules: [],
      swapPool,
      chosenCourseToRequirementId: {},
      schedulePoolMaps: [],
      selectedScheduleIndex: 0,
      swapHistory: [],
      generationError: "Not enough eligible courses match your filters and requirements to build a full schedule. Try relaxing filters or changing selections.",
      generationErrorDetails: poolDiagnostics,
    };
  }

  const swapPool = [...new Set([...pinned, ...filteredOptionalPool])];
  const limit = appendFirstOnly ? 1 : 25;
  const limitedSchedules = finalSchedules.slice(0, limit);
  const limitedPoolMaps = finalPoolMaps.slice(0, limit);

  if (appendFirstOnly && limitedSchedules.length > 0) {
    const newSchedules = [...state.generatedSchedules, limitedSchedules[0]];
    const newPoolMaps = [...state.schedulePoolMaps, limitedPoolMaps[0]];
    const newSwapPool = [
      ...new Set([
        ...state.swapPool,
        ...limitedSchedules[0].enrollments.map((e) => e.courseCode),
      ]),
    ];
    return {
      generatedSchedules: newSchedules,
      swapPool: newSwapPool,
      chosenCourseToRequirementId: state.chosenCourseToRequirementId,
      schedulePoolMaps: newPoolMaps,
      selectedScheduleIndex: newSchedules.length - 1,
      swapHistory: [],
      generationError: null,
      generationErrorDetails: null,
    };
  }

  if (appendFirstOnly && limitedSchedules.length === 0) {
    return {
      generatedSchedules: state.generatedSchedules,
      swapPool: state.swapPool,
      chosenCourseToRequirementId: state.chosenCourseToRequirementId,
      schedulePoolMaps: state.schedulePoolMaps,
      selectedScheduleIndex: state.selectedScheduleIndex,
      swapHistory: [],
      generationError: "Could not generate another schedule after 100 attempts. Try different selections or filters.",
      generationErrorDetails: null,
    };
  }

  return {
    generatedSchedules: limitedSchedules,
    swapPool,
    chosenCourseToRequirementId: lastChosenFromPool,
    schedulePoolMaps: limitedPoolMaps,
    selectedScheduleIndex: 0,
    swapHistory: [],
    generationError:
      limitedSchedules.length === 0
        ? "No non-overlapping schedules could be generated with your selections."
        : null,
    generationErrorDetails: null,
  };
}