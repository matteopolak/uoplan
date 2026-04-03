import type { Program, ProgramRequirement } from "schemas";
import type {
  RemainingRequirement,
  RequirementWithStatus,
  CompletedRequirementItem,
} from "schedule";
import { computeRequirementsState } from "schedule";
import { normalizeCourseCode, type DataCache } from "schedule";
import { buildPrereqContext, canTakeCourse } from "schedule";
import {
  courseMatchesFilters,
  type CourseLanguageBucket,
  type CourseLevelBucket,
} from "schedule";

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

/**
 * Preserves user-touched requirement selections that are still valid candidates.
 * Does not auto-fill untouched slots (schedule generation / Constrain handle picks).
 */
function getAutoSelectedForRequirements(
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

function getCreditsForCourseLocal(cache: DataCache, normCode: string): number {
  return cache.getCourse(normCode)?.credits ?? 3;
}

function sumCreditsForCodes(
  cache: DataCache,
  codes: string[],
): number {
  let s = 0;
  for (const code of codes) {
    s += getCreditsForCourseLocal(cache, normalizeCourseCode(code));
  }
  return s;
}

function isStrictSubset<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size >= b.size) return false;
  for (const x of a) {
    if (!b.has(x)) return false;
  }
  return true;
}

interface ReqAutoMeta {
  reqId: string;
  type: string;
  candidatesNorm: Set<string>;
  creditsNeeded: number;
}

/** Lower sort index = more preferred target for a course (type tier, then specificity, then id). */
function compareReqPreference(a: ReqAutoMeta, b: ReqAutoMeta): number {
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

function getAutoSelectedSingleEligibleCompleted(
  augmentedRemaining: RemainingRequirement[],
  unassignedCompleted: string[],
  cache: DataCache,
  alreadySelected: Record<string, string[]>,
  requirementSlotsUserTouched: Record<string, true>,
): Record<string, string[]> {
  const blockedCourses = new Set<string>();
  const metas: ReqAutoMeta[] = [];

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

  function eligibleMetasForCourse(norm: string): ReqAutoMeta[] {
    if (blockedCourses.has(norm)) return [];
    const list: ReqAutoMeta[] = [];
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

    const courseCredits = getCreditsForCourseLocal(cache, norm);
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

function mergeProgramWithMinor(
  mainProgram: Program,
  minorProgram: Program,
  cache: DataCache,
): Program {
  // A. compute credits needed for minor
  const minorState = computeRequirementsState(minorProgram, [], cache, {});
  let minorCredits = 0;
  for (const req of minorState.remaining) {
    if (req.creditsNeeded) minorCredits += req.creditsNeeded;
  }

  // B. deep clone main program requirements
  const cloneNode = (node: ProgramRequirement): ProgramRequirement => {
    const cloned = { ...node };
    if (cloned.options) cloned.options = cloned.options.map(cloneNode);
    return cloned;
  };
  const mainReqs = mainProgram.requirements.map(cloneNode);

  // C. subtract minorCredits from electives (traverse backwards)
  let remainingToSubtract = minorCredits;

  const subtractFromOptions = (options: ProgramRequirement[]) => {
    for (let i = options.length - 1; i >= 0 && remainingToSubtract > 0; i--) {
      const opt = options[i];
      
      if (opt.options) {
         subtractFromOptions(opt.options);
      }

      if (
        remainingToSubtract > 0 &&
        (opt.type === "elective" ||
          opt.type === "free_elective" ||
          opt.type === "non_discipline_elective") &&
        opt.credits
      ) {
        const toTake = Math.min(opt.credits, remainingToSubtract);
        opt.credits -= toTake;
        remainingToSubtract -= toTake;
      }
    }
    // Remove options that dropped to 0 credits
    for (let i = options.length - 1; i >= 0; i--) {
      const opt = options[i];
      if (
        (opt.type === "elective" ||
          opt.type === "free_elective" ||
          opt.type === "non_discipline_elective") &&
        opt.credits === 0
      ) {
        options.splice(i, 1);
      }
    }
  };

  subtractFromOptions(mainReqs);

  // D. append minor requirements inside an 'and' block so they render nicely
  mainReqs.push({
    type: "and",
    title: minorProgram.title,
    options: minorProgram.requirements.map(cloneNode),
  });

  return {
    ...mainProgram,
    title: `${mainProgram.title} + ${minorProgram.title}`,
    requirements: mainReqs,
  };
}

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
