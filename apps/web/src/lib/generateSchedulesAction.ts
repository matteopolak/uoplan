import type { AppState } from "../store/appStore";
import { createSeededRng } from "schedule";
import {
  generateSchedules as genSchedules,
  generateSchedulesWithPinned,
  getValidSectionCombos,
  type GeneratedSchedule,
  type GenerationConstraints,
} from "schedule";
import { cacheWithClosedFilter, getEffectiveSchedule } from "schedule";
import { courseMatchesFilters } from "schedule";
import { normalizeCourseCode } from "schedule";
import { buildRequirementPools, computeCoursesPerPool, shuffleInPlace, type RequirementPool } from "../store/scheduleHelpers";
import { isHonoursProject } from "schedule";

export interface GenerateSchedulesResult {
  generatedSchedules: GeneratedSchedule[];
  swapPool: string[];
  chosenCourseToRequirementId: Record<string, string>;
  schedulePoolMaps: Record<string, string>[];
  selectedScheduleIndex: number;
  swapHistory: never[];
  generationError: string | null;
  generationErrorDetails: {
    emptyPools: Array<{ label: string }>;
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

  if (!cache) return null;
  const cacheVal = cache;
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

  const allSelected = Object.values(selectedPerRequirement).flat();
  const unique = [...new Set(allSelected)];
  const completedSet = new Set(completedCourses.map(normalizeCourseCode));
  const prereqEligibleSet = new Set(prereqEligibleCourses);

  const honoursSelected = unique
    .filter((code) => isHonoursProject(code, cacheVal))
    .filter((code) => !completedSet.has(normalizeCourseCode(code)))
    .filter((code) => prereqEligibleSet.has(code));

  const selectedSchedulable = unique.filter(
    (code) =>
      !isHonoursProject(code, cacheVal) &&
      !!getEffectiveSchedule(cacheVal, code, includeClosedComponents) &&
      !completedSet.has(normalizeCourseCode(code)),
  );

  const honoursCount = honoursSelected.length;
  const effectiveTarget = Math.max(0, coursesThisSemester - honoursCount);
  const oversubscribedSelections = selectedSchedulable.length > effectiveTarget;
  const pinned = oversubscribedSelections ? [] : selectedSchedulable;

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
  const remainingNeeded = effectiveTarget - pinned.length;
  let filteredOptionalPool: string[] = [];
  let finalSchedules: GeneratedSchedule[] = [];
  let lastChosenFromPool: Record<string, string> = {};
  let finalPoolMaps: Record<string, string>[] = [];
  let poolDiagnostics: {
    emptyPools: Array<{ label: string }>;
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

  async function collectUniqueSchedulesFromCandidatePool(
    candidatePool: string[],
    mapsForNonPoolCodes: Record<string, string> = {},
  ): Promise<{
    schedules: GeneratedSchedule[];
    poolMaps: Record<string, string>[];
    usedPool: string[];
  }> {
    const maxAttempts = appendFirstOnly ? 100 : 300;
    const targetUniqueSchedules = appendFirstOnly ? 1 : 25;
    const seenCourseSets = new Set<string>();
    const collectedSchedules: GeneratedSchedule[] = [];
    const collectedPoolMaps: Record<string, string>[] = [];
    let lastUsedPool: string[] = [];

    const base = [...new Set(candidatePool)];
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (collectedSchedules.length >= targetUniqueSchedules) break;
      if (attempt > 0 && attempt % 5 === 0) await yieldToMain();
      const attemptPool = [...base];
      shuffleInPlace(attemptPool, rng);
      lastUsedPool = attemptPool;
      const batch = genSchedules(
        attemptPool,
        effectiveTarget,
        effectiveCache,
        constraints,
      );
      const fullBatch = batch.filter(
        (s) => s.enrollments.length >= effectiveTarget,
      );
      if (fullBatch.length === 0) continue;

      const fingerprint = fullBatch[0].enrollments
        .map((e) => e.courseCode)
        .sort()
        .join(",");
      if (seenCourseSets.has(fingerprint)) continue;
      seenCourseSets.add(fingerprint);
      collectedSchedules.push(fullBatch[0]);
      collectedPoolMaps.push(mapsForNonPoolCodes);
    }

    return {
      schedules: collectedSchedules,
      poolMaps: collectedPoolMaps,
      usedPool: lastUsedPool,
    };
  }

  if (oversubscribedSelections) {
    const selectedOnlyPool = selectedSchedulable.filter((code) =>
      isEligibleCandidate(code),
    );

    const baseAttempt = await collectUniqueSchedulesFromCandidatePool(
      selectedOnlyPool,
      {},
    );
    filteredOptionalPool = baseAttempt.usedPool;
    finalSchedules = baseAttempt.schedules;
    finalPoolMaps = baseAttempt.poolMaps;
    lastChosenFromPool = {};

    if (finalSchedules.length === 0) {
      const allPools = buildRequirementPools(remainingRequirements);
      const extraCandidates: string[] = [];
      const selectedSet = new Set(selectedOnlyPool.map(normalizeCourseCode));
      for (const pool of allPools) {
        for (const code of pool.candidateCourses) {
          if (selectedSet.has(normalizeCourseCode(code))) continue;
          if (!isEligibleCandidate(code, pool.type)) continue;
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
          extraCandidates.push(code);
        }
      }

      const expandedPool = [
        ...new Set([...selectedOnlyPool, ...extraCandidates]),
      ];
      const expandedAttempt = await collectUniqueSchedulesFromCandidatePool(
        expandedPool,
        {},
      );
      filteredOptionalPool = expandedAttempt.usedPool;
      finalSchedules = expandedAttempt.schedules;
      finalPoolMaps = expandedAttempt.poolMaps;
    }
  }

  if (!oversubscribedSelections && remainingNeeded > 0) {
    const allPools = buildRequirementPools(remainingRequirements);

    let pools: RequirementPool[] = allPools
      .map((pool) => {
        let pinnedCredits = 0;
        for (const code of pinned) {
          if (!pool.candidateCourses.includes(code)) continue;
          const course = cacheVal.getCourse(code);
          pinnedCredits += course?.credits ?? 3;
        }
        const selectedForPool =
          selectedPerRequirement[pool.requirementId] ?? [];
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

    const poolsWithCandidates = pools.filter((p) =>
      candidatesByRequirement.has(p.requirementId),
    );
    const coursesPerPool = computeCoursesPerPool(
      poolsWithCandidates,
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

      const chosenCodes = new Set<string>();
      const chosenFromPool: Record<string, string> = {};
      for (const pool of pools) {
        let need = coursesPerPool.get(pool.requirementId) ?? 0;
        if (need <= 0) continue;
        const candidates =
          candidatesByRequirement.get(pool.requirementId) ?? [];
        if (candidates.length === 0) continue;

        for (const code of candidates) {
          if (chosenCodes.size >= remainingNeeded) break;
          if (chosenCodes.has(code)) continue;
          if (pinned.includes(code)) continue;
          if (isHonoursProject(code, cacheVal)) continue;
          chosenCodes.add(code);
          chosenFromPool[code] = pool.requirementId;
          need -= 1;
          if (need <= 0) break;
        }
      }

      const optionalPool = Array.from(chosenCodes)
        .filter((code) => !isHonoursProject(code, cacheVal))
        .filter((code) => !pinned.includes(code));

      if (optionalPool.length + pinned.length < effectiveTarget) {
        break;
      }

      lastFilteredPool = optionalPool;
      shuffleInPlace(lastFilteredPool, rng);

      const batch =
        pinned.length === 0
          ? genSchedules(
              lastFilteredPool,
              effectiveTarget,
              effectiveCache,
              constraints,
            )
          : generateSchedulesWithPinned(
              pinned,
              lastFilteredPool,
              effectiveTarget,
              effectiveCache,
              constraints,
            );

      const fullBatch = batch.filter(
        (s) => s.enrollments.length >= effectiveTarget,
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

    const emptyPools = pools
      .filter(
        (p) =>
          (candidatesByRequirement.get(p.requirementId) ?? []).length === 0,
      )
      .map((p) => ({ label: p.label }));
    poolDiagnostics = {
      emptyPools,
      totalAvailable: pinned.length + filteredOptionalPool.length,
      totalNeeded: effectiveTarget,
    };
  }

  if (remainingNeeded <= 0) {
    filteredOptionalPool = [];
    finalSchedules =
      pinned.length === 0
        ? genSchedules([], effectiveTarget, effectiveCache, constraints)
        : generateSchedulesWithPinned(
            pinned,
            [],
            effectiveTarget,
            effectiveCache,
            constraints,
          );
    finalPoolMaps = finalSchedules.map(() => ({}));
  }

  if (filteredOptionalPool.length + pinned.length < effectiveTarget) {
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