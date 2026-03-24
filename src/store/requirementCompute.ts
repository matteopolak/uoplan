import type { Program, ProgramRequirement } from "../schemas/catalogue";
import type {
  RemainingRequirement,
  RequirementWithStatus,
  CompletedRequirementItem,
} from "../lib/requirements";
import { computeRequirementsState } from "../lib/requirements";
import { normalizeCourseCode, type DataCache } from "../lib/dataCache";
import { getEffectiveSchedule } from "../lib/scheduleFilters";
import { buildPrereqContext, canTakeCourse } from "../lib/prerequisites";
import {
  courseMatchesFilters,
  type CourseLanguageBucket,
  type CourseLevelBucket,
} from "../lib/courseFilters";

export interface RecomputedState {
  remainingRequirements: RemainingRequirement[];
  requirementTreeWithStatus: RequirementWithStatus[];
  completedRequirementsList: CompletedRequirementItem[];
  selectedPerRequirement: Record<string, string[]>;
  selectedOptionsPerRequirement: Record<string, number>;
  prereqEligibleCourses: string[];
  filteredPrereqEligibleCourses: string[];
  unassignedCompletedCourses: string[];
}

/** Collect course codes that satisfy exact (course/or_course) requirements from the tree. */
function collectAssignedFromExactRequirements(
  tree: RequirementWithStatus[],
): Set<string> {
  const assigned = new Set<string>();
  function walk(nodes: RequirementWithStatus[]) {
    for (const node of nodes) {
      if (
        (node.type === "course" || node.type === "or_course") &&
        node.satisfiedBy?.length
      ) {
        for (const code of node.satisfiedBy) {
          assigned.add(normalizeCourseCode(code));
        }
      }
      if (node.options?.length) walk(node.options);
    }
  }
  walk(tree);
  return assigned;
}

export const GROUP_STYLE_TYPES = [
  "group",
  "pick",
  "or_group",
  "discipline_elective",
  "faculty_elective",
  "free_elective",
  "elective",
  "non_discipline_elective",
] as const;

function getAutoSelectedForRequirements(
  remaining: RemainingRequirement[],
  existing: Record<string, string[]>,
  cache: DataCache | null,
  includeClosedComponents: boolean,
): Record<string, string[]> {
  if (!cache) {
    return {};
  }

  const hasSchedule = (code: string) =>
    !!getEffectiveSchedule(cache, code, includeClosedComponents);
  const isHonoursProject = (code: string): boolean => {
    const course = cache.getCourse(code);
    const component = course?.component?.trim().toLowerCase() ?? "";
    return component.startsWith("recherche / research");
  };
  const scheduledOnlyByReq = new Map<string, Set<string>>();
  const allCandidatesByReq = new Map<string, Set<string>>();

  for (const req of remaining) {
    const scheduled = req.candidateCourses.filter(hasSchedule);
    scheduledOnlyByReq.set(req.requirementId, new Set(scheduled));
    allCandidatesByReq.set(req.requirementId, new Set(req.candidateCourses));
  }

  const out: Record<string, string[]> = {};
  for (const req of remaining) {
    const scheduledSet = scheduledOnlyByReq.get(req.requirementId)!;
    const scheduledCandidates = Array.from(scheduledSet);
    const allCandidatesSet = allCandidatesByReq.get(req.requirementId)!;

    if (scheduledCandidates.length === 1) {
      // Avoid auto-selecting honours/research courses; users should opt in explicitly.
      const only = scheduledCandidates[0];
      // Only auto-assign if the user has never interacted with this requirement.
      // If the key exists (even as []), the user explicitly set or cleared it — respect that.
      if (!isHonoursProject(only) && !(req.requirementId in existing)) {
        out[req.requirementId] = [only];
      }
    } else {
      const prev = existing[req.requirementId] ?? [];
      // Keep existing selection if each course is in the requirement's candidate list
      // (including courses without schedule, e.g. completed)
      const valid = prev.filter((c) => allCandidatesSet.has(c));
      if (valid.length) out[req.requirementId] = valid;
    }
  }

  return out;
}

const TYPE_PRIORITY: Record<string, number> = {
  course: 0,
  discipline_elective: 1,
  faculty_elective: 2,
  non_discipline_elective: 3,
  free_elective: 4,
  elective: 4,
};

const NEVER_AUTO_ASSIGN_TYPES = new Set([
  'or_group',
  'or_course',
  'pick',
  'options_group',
  'group',
]);

function getAutoSelectedSingleEligibleCompleted(
  augmentedRemaining: RemainingRequirement[],
  unassignedCompleted: string[],
  cache: DataCache,
  alreadySelected: Record<string, string[]>,
  originalExisting: Record<string, string[]>,
): Record<string, string[]> {
  // Track courses that appear in any never-auto-assign requirement; these are
  // fully ineligible for auto-assignment regardless of other matches.
  const blockedCourses = new Set<string>();
  const courseToReqs = new Map<
    string,
    Array<{ reqId: string; priority: number }>
  >();
  for (const req of augmentedRemaining) {
    if (NEVER_AUTO_ASSIGN_TYPES.has(req.type)) {
      for (const candidate of req.candidateCourses) {
        blockedCourses.add(normalizeCourseCode(candidate));
      }
      continue;
    }
    const priority = TYPE_PRIORITY[req.type];
    if (priority === undefined) continue;
    for (const candidate of req.candidateCourses) {
      const norm = normalizeCourseCode(candidate);
      const list = courseToReqs.get(norm) ?? [];
      list.push({ reqId: req.requirementId, priority });
      courseToReqs.set(norm, list);
    }
  }

  const out: Record<string, string[]> = {};
  for (const norm of unassignedCompleted) {
    if (blockedCourses.has(norm)) continue;
    const reqs = courseToReqs.get(norm);
    if (!reqs?.length) continue;
    const minPriority = Math.min(...reqs.map((r) => r.priority));
    const best = reqs.filter((r) => r.priority === minPriority);
    if (best.length !== 1) continue; // tie — ambiguous
    const { reqId } = best[0];
    // Don't auto-assign to requirements the user has already interacted with (set or cleared).
    // Only auto-place completed courses into requirements that have never been touched.
    if (reqId in originalExisting) continue;
    const courseCode = cache.getCourse(norm)?.code ?? norm;
    const existingForReq = alreadySelected[reqId] ?? out[reqId] ?? [];
    if (!existingForReq.includes(courseCode)) {
      out[reqId] = [...existingForReq, courseCode];
    }
  }
  return out;
}

/** Extract unique discipline codes (e.g. "CSI", "CEG") from all `type === 'course'` entries in a program's requirements. */
export function getDisciplineCodesForProgram(
  program: Program | null,
): string[] {
  if (!program) return [];
  const disciplines = new Set<string>();
  function walk(reqs: ProgramRequirement[]) {
    for (const req of reqs) {
      if (req.type === "course" && req.code) {
        const d = req.code.split(/\s+/)[0]?.toUpperCase();
        if (d) disciplines.add(d);
      }
      if (req.options) walk(req.options);
    }
  }
  walk(program.requirements);
  return [...disciplines].sort();
}

export function recomputeStateForProgram(
  program: Program | null,
  completedCourses: string[],
  cache: DataCache | null,
  existingSelectedPerRequirement: Record<string, string[]>,
  existingSelectedOptionsPerRequirement: Record<string, number>,
  levelBuckets: CourseLevelBucket[],
  languageBuckets: CourseLanguageBucket[],
  includeClosedComponents: boolean,
  studentPrograms: string[] = [],
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

  const { remaining, tree, completedList } = computeRequirementsState(
    program,
    completedCourses,
    cache,
  );

  const autoSelected = getAutoSelectedForRequirements(
    remaining,
    existingSelectedPerRequirement,
    cache,
    includeClosedComponents,
  );

  // Unassigned completed = completed minus (exact-match satisfied) minus (user-selected per requirement).
  const assignedFromExact = collectAssignedFromExactRequirements(tree);
  const assignedFromSelected = new Set<string>();
  for (const codes of Object.values(existingSelectedPerRequirement)) {
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

  // Auto-assign completed courses that are eligible for exactly one remaining requirement.
  const autoSelectedCompleted = getAutoSelectedSingleEligibleCompleted(
    augmentedRemaining,
    unassignedCompleted,
    cache,
    { ...existingSelectedPerRequirement, ...autoSelected },
    existingSelectedPerRequirement,
  );

  // Preserve nested selections (e.g. or_group option req-2-0) that are not in remaining;
  // merge with all auto-selections.
  const selectedPerRequirement = {
    ...existingSelectedPerRequirement,
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
