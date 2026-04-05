import { computeRequirementsState } from "schedule";
import { normalizeCourseCode, type DataCache } from "schedule";
import { buildPrereqContext, canTakeCourse } from "schedule";
import {
  courseMatchesFilters,
  type CourseLanguageBucket,
  type CourseLevelBucket,
} from "schedule";
import type { Program } from "schemas";
import { getAutoSelectedForRequirements, getAutoSelectedSingleEligibleCompleted } from "./autoAssign";
import { mergeProgramWithMinor } from "./minorMerge";
import type { RecomputedState } from "./types";
import { collectAssignedFromExactRequirements } from "./utils";

export * from "./types";
export * from "./utils";
export * from "./minorMerge";
export * from "./autoAssign";

const GROUP_STYLE_TYPES = [
  "group",
  "pick",
  "elective",
  "discipline_elective",
  "faculty_elective",
  "free_elective",
  "non_discipline_elective",
] as const;

export function recomputeStateForProgram(
  program: Program | null,
  minorProgram: Program | null,
  completedCourses: string[],
  cache: DataCache | null,
  existingSelectedPerRequirement: Record<string, string[]>,
  existingSelectedOptionsPerRequirement: Record<string, number>,
  levelBuckets: CourseLevelBucket[],
  languageBuckets: CourseLanguageBucket[],
  _includeClosedComponents: boolean,
  studentPrograms: string[] = [],
  requirementSlotsUserTouched: Record<string, true> = {},
): RecomputedState {
  if (!program || !cache) {
    return {
      remainingRequirements: [],
      requirementTreeWithStatus: [],
      completedRequirementsList: [],
      selectedPerRequirement: {},
      selectedOptionsPerRequirement: {},
      prereqEligibleCourses: [],
      filteredPrereqEligibleCourses: [],
      unassignedCompletedCourses: [],
    };
  }

  const effectiveProgram = minorProgram
    ? mergeProgramWithMinor(program, minorProgram, cache)
    : program;

  const { remaining, tree, completedList } = computeRequirementsState(
    effectiveProgram,
    completedCourses,
    cache,
    existingSelectedOptionsPerRequirement,
  );

  const userLockedSelections: Record<string, string[]> = {};
  for (const [reqId, codes] of Object.entries(existingSelectedPerRequirement)) {
    if (requirementSlotsUserTouched[reqId]) {
      userLockedSelections[reqId] = codes;
    }
  }

  const autoSelected = getAutoSelectedForRequirements(
    remaining,
    userLockedSelections,
    cache,
  );

  // Unassigned completed = completed minus exact-match minus courses locked to user-touched slots.
  const assignedFromExact = collectAssignedFromExactRequirements(tree);
  const assignedFromSelected = new Set<string>();
  for (const [reqId, codes] of Object.entries(existingSelectedPerRequirement)) {
    if (!requirementSlotsUserTouched[reqId]) continue;
    for (const code of codes) {
      assignedFromSelected.add(normalizeCourseCode(code));
    }
  }
  const completedNormalized = new Set(
    completedCourses.map(normalizeCourseCode),
  );
  const isWorkTerm = (normCode: string): boolean => {
    const course = cache.getCourse(normCode);
    const component = course?.component?.trim().toLowerCase() ?? "";
    return component.startsWith("stage / work term");
  };
  const unassignedCompleted = [...completedNormalized].filter(
    (norm) =>
      !assignedFromExact.has(norm) &&
      !assignedFromSelected.has(norm) &&
      !isWorkTerm(norm),
  );

  // For group-style requirements, augment candidate list with unassigned completed (eligible) first.
  const augmentedRemaining = remaining.map((req) => {
    if (
      !req.candidateCourses?.length ||
      !GROUP_STYLE_TYPES.includes(
        req.type as (typeof GROUP_STYLE_TYPES)[number],
      )
    ) {
      return req;
    }
    const eligibleSet = new Set(req.candidateCourses.map(normalizeCourseCode));
    const unassignedEligible = unassignedCompleted.filter((norm) =>
      eligibleSet.has(norm),
    );
    const displayCodes = unassignedEligible.map(
      (norm) => cache.getCourse(norm)?.code ?? norm,
    );
    const candidateCourses = [
      ...new Set([...displayCodes, ...req.candidateCourses]),
    ];
    return { ...req, candidateCourses };
  });

  const ctx = buildPrereqContext(completedCourses, cache, studentPrograms);
  const candidateSet = new Set<string>();
  for (const req of augmentedRemaining) {
    for (const code of req.candidateCourses) {
      candidateSet.add(code);
    }
  }
  for (const course of cache.getAllCourses()) {
    candidateSet.add(course.code);
  }
  const prereqEligibleCourses: string[] = [];
  for (const code of candidateSet) {
    if (canTakeCourse(code, cache, ctx)) {
      prereqEligibleCourses.push(code);
    }
  }

  const filters = { levels: levelBuckets, languageBuckets };
  const filteredPrereqEligibleCourses = prereqEligibleCourses.filter((code) =>
    courseMatchesFilters(code, filters),
  );

  // Auto-assign completed courses using type tier, specificity, MRV order, and credit caps.
  const autoSelectedCompleted = getAutoSelectedSingleEligibleCompleted(
    augmentedRemaining,
    unassignedCompleted,
    cache,
    { ...userLockedSelections, ...autoSelected },
    requirementSlotsUserTouched,
  );

  const selectedPerRequirement = {
    ...userLockedSelections,
    ...autoSelected,
    ...autoSelectedCompleted,
  };

  // Recompute unassigned using the final merged selections so the warning is immediately accurate.
  const finalAssignedFromSelected = new Set<string>();
  for (const codes of Object.values(selectedPerRequirement)) {
    for (const code of codes) {
      finalAssignedFromSelected.add(normalizeCourseCode(code));
    }
  }
  const finalUnassignedCompletedCourses = [...completedNormalized]
    .filter(
      (norm) =>
        !assignedFromExact.has(norm) &&
        !finalAssignedFromSelected.has(norm) &&
        !isWorkTerm(norm),
    )
    .map((norm) => cache.getCourse(norm)?.code ?? norm);

  if (
    typeof localStorage !== "undefined" &&
    localStorage.getItem("uoplanDebugAssignments") === "1"
  ) {
    console.debug("[uoplan assignments]", {
      selectedOptions: existingSelectedOptionsPerRequirement,
      requirementSlotsUserTouched,
      remainingIds: augmentedRemaining.map((r) => r.requirementId),
      selectedPerRequirement,
      unassignedCompletedCourses: finalUnassignedCompletedCourses,
    });
  }

  return {
    remainingRequirements: augmentedRemaining,
    requirementTreeWithStatus: tree,
    completedRequirementsList: completedList,
    selectedPerRequirement,
    selectedOptionsPerRequirement: existingSelectedOptionsPerRequirement,
    prereqEligibleCourses,
    filteredPrereqEligibleCourses,
    unassignedCompletedCourses: finalUnassignedCompletedCourses,
  };
}
