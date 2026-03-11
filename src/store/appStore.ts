import { create } from 'zustand';
import type { Program } from '../schemas/catalogue';
import type {
  RemainingRequirement,
  RequirementWithStatus,
  CompletedRequirementItem,
} from '../lib/requirements';
import { computeRequirementsState } from '../lib/requirements';
import {
  generateSchedules as genSchedules,
  generateSchedulesWithPinned,
  getValidSectionCombos,
  getEnrollmentsForCourse,
  enrollmentsOverlap,
  getFirstOverlapWith,
  type CourseEnrollment,
  type GeneratedSchedule,
  type GenerationConstraints,
} from '../lib/scheduleGenerator';
import type { DayOfWeek } from '../schemas/schedules';
import type { DataCache } from '../lib/dataCache';
import { normalizeCourseCode } from '../lib/dataCache';
import { buildPrereqContext, canTakeCourse } from '../lib/prerequisites';
import {
  courseMatchesFilters,
  type CourseLanguageBucket,
  type CourseLevelBucket,
} from '../lib/courseFilters';
import type { Indices } from '../schemas/indices';
import {
  decodeStateFromBase64,
  encodeState,
  encodeStateToBase64,
  parseStateFromUrl,
  requirementIdsFromTree,
  stateToShareUrl,
  type DecodedState,
  type EncodeInput,
} from '../lib/stateEncode';
import type { Term } from '../schemas/terms';
import { createSeededRng, generateRandomSeed } from '../lib/seededRandom';

const validEnrollmentsByCourseCode = new Map<string, CourseEnrollment[]>();

const LOCAL_STORAGE_KEY = 'uschedule-state';
const TERM_LOCAL_STORAGE_KEY = 'uschedule-term';

export interface AppState {
  catalogue: { courses: unknown[]; programs: Program[] } | null;
  indices: Indices | null;
  schedulesData: { termId: string; schedules: unknown[] } | null;
  cache: DataCache | null;
  loading: boolean;
  error: string | null;

  terms: Term[] | null;
  selectedTermId: string | null;

  program: Program | null;
  completedCourses: string[];
  remainingRequirements: RemainingRequirement[];
  requirementTreeWithStatus: RequirementWithStatus[];
  completedRequirementsList: CompletedRequirementItem[];
  selectedPerRequirement: Record<string, string[]>;
  selectedOptionsPerRequirement: Record<string, number>;
  coursesThisSemester: number;
  prereqEligibleCourses: string[];
  filteredPrereqEligibleCourses: string[];
  levelBuckets: CourseLevelBucket[];
  languageBuckets: CourseLanguageBucket[];
  electiveLevelBuckets: number[];
  generatedSchedules: GeneratedSchedule[];
  swapPool: string[];
  /** Which requirement pool each chosen course was picked from (for swap dropdown). */
  chosenCourseToRequirementId: Record<string, string>;
  /** Per-schedule pool map when we have multiple schedules. */
  schedulePoolMaps: Record<string, string>[];
  selectedScheduleIndex: number;
  generationError: string | null;
  unassignedCompletedCourses: string[];
  generationMinStartMinutes: number;
  generationMaxEndMinutes: number;
  generationAllowedDays: DayOfWeek[];
  /** Seed used for deterministic randomization during schedule generation and shuffling. */
  generationSeed: number;
}

interface RecomputedState {
  remainingRequirements: RemainingRequirement[];
  requirementTreeWithStatus: RequirementWithStatus[];
  completedRequirementsList: CompletedRequirementItem[];
  selectedPerRequirement: Record<string, string[]>;
  selectedOptionsPerRequirement: Record<string, number>;
  prereqEligibleCourses: string[];
  filteredPrereqEligibleCourses: string[];
  unassignedCompletedCourses: string[];
}

type RequirementPool = {
  requirementId: string;
  type: RemainingRequirement['type'];
  label: string;
  candidateCourses: string[];
  creditsNeeded: number;
  minCourses: number;
};

/** Collect course codes that satisfy exact (course/or_course) requirements from the tree. */
function collectAssignedFromExactRequirements(tree: RequirementWithStatus[]): Set<string> {
  const assigned = new Set<string>();
  function walk(nodes: RequirementWithStatus[]) {
    for (const node of nodes) {
      if (
        (node.type === 'course' || node.type === 'or_course') &&
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

const GROUP_STYLE_TYPES = [
  'group',
  'pick',
  'or_group',
  'discipline_elective',
  'faculty_elective',
  'free_elective',
  'elective',
  'non_discipline_elective',
] as const;

function buildRequirementPools(remaining: RemainingRequirement[]): RequirementPool[] {
  const pools: RequirementPool[] = [];

  for (const req of remaining) {
    if (!req.requirementId || !req.candidateCourses?.length) continue;
    const creditsNeeded = req.creditsNeeded ?? 0;
    if (creditsNeeded <= 0) continue;

    const uniqueCandidates = [...new Set(req.candidateCourses)];
    if (uniqueCandidates.length === 0) continue;

    const label = req.title ?? req.type ?? 'Requirement';
    let minCourses = 0;
    if (req.type === 'course' || req.type === 'or_course') {
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
const DEFAULT_CREDITS_PER_COURSE = 3;

/**
 * Allocates remainingCourseSlots across pools so that each pool gets courses
 * proportional to creditsNeeded (ceil(creditsNeeded / 3)), and the total
 * equals remainingCourseSlots. Ensures we pick exactly that many courses total.
 */
function computeCoursesPerPool(
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
    const byCreditsDesc = [...pools].sort((a, b) => b.creditsNeeded - a.creditsNeeded);
    for (const pool of byCreditsDesc) {
      if (extra <= 0) break;
      const cur = result.get(pool.requirementId) ?? 0;
      result.set(pool.requirementId, cur + 1);
      extra -= 1;
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
        frac: remainingCourseSlots * frac - Math.floor(remainingCourseSlots * frac),
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

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function getAutoSelectedForRequirements(
  remaining: RemainingRequirement[],
  existing: Record<string, string[]>,
  cache: DataCache | null,
): Record<string, string[]> {
  if (!cache) {
    return {};
  }

  const hasSchedule = (code: string) => !!cache.getSchedule(code);
  const isHonoursProject = (code: string): boolean => {
    const course = cache.getCourse(code);
    const component = course?.component?.trim().toLowerCase() ?? '';
    return component.startsWith('recherche / research');
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
      if (!isHonoursProject(only)) {
        out[req.requirementId] = [only];
      }
    } else {
      const prev = existing[req.requirementId] ?? [];
      // Keep existing selection if each course is in the requirement's candidate list (including courses without schedule, e.g. completed)
      const valid = prev.filter((c) => allCandidatesSet.has(c));
      if (valid.length) out[req.requirementId] = valid;
    }
  }

  return out;
}

function recomputeStateForProgram(
  program: Program | null,
  completedCourses: string[],
  cache: DataCache | null,
  existingSelectedPerRequirement: Record<string, string[]>,
  existingSelectedOptionsPerRequirement: Record<string, number>,
  levelBuckets: CourseLevelBucket[],
  languageBuckets: CourseLanguageBucket[],
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
    cache
  );

  const autoSelected = getAutoSelectedForRequirements(
    remaining,
    existingSelectedPerRequirement,
    cache,
  );

  // Unassigned completed = completed minus (exact-match satisfied) minus (user-selected per requirement).
  const assignedFromExact = collectAssignedFromExactRequirements(tree);
  const assignedFromSelected = new Set<string>();
  for (const codes of Object.values(existingSelectedPerRequirement)) {
    for (const code of codes) {
      assignedFromSelected.add(normalizeCourseCode(code));
    }
  }
  const completedNormalized = new Set(completedCourses.map(normalizeCourseCode));
  const isWorkTerm = (normCode: string): boolean => {
    const course = cache.getCourse(normCode);
    const component = course?.component?.trim().toLowerCase() ?? '';
    return component.startsWith('stage / work term');
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
      !GROUP_STYLE_TYPES.includes(req.type as (typeof GROUP_STYLE_TYPES)[number])
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

  const ctx = buildPrereqContext(completedCourses, cache);
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

  const unassignedCompletedCourses = unassignedCompleted.map(
    (norm) => cache.getCourse(norm)?.code ?? norm,
  );

  // Preserve nested selections (e.g. or_group option req-2-0) that are not in remaining; merge with autoSelected
  const selectedPerRequirement = {
    ...existingSelectedPerRequirement,
    ...autoSelected,
  };

  return {
    remainingRequirements: augmentedRemaining,
    requirementTreeWithStatus: tree,
    completedRequirementsList: completedList,
    selectedPerRequirement,
    selectedOptionsPerRequirement: existingSelectedOptionsPerRequirement,
    prereqEligibleCourses,
    filteredPrereqEligibleCourses,
    unassignedCompletedCourses,
  };
}

export interface AppActions {
  loadData: () => Promise<void>;
  setSelectedTermId: (termId: string) => Promise<void>;
  loadEncodedState: (decoded: DecodedState) => void;
  getShareUrl: () => string | null;
  getEncodedStateBase64: () => string | null;
  setProgram: (program: Program | null) => void;
  setCompletedCourses: (courses: string[]) => void;
  addCompletedCourse: (code: string) => void;
  removeCompletedCourse: (code: string) => void;
  setSelectedForRequirement: (requirementId: string, courses: string[]) => void;
  setSelectedOptionForRequirement: (requirementId: string, optionIndex: number) => void;
  setCoursesThisSemester: (n: number) => void;
  setGenerationMinStartMinutes: (minutes: number) => void;
  setGenerationMaxEndMinutes: (minutes: number) => void;
  setGenerationAllowedDays: (days: DayOfWeek[]) => void;
  generateSchedules: (options?: { appendFirstOnly?: boolean }) => void;
  setSelectedScheduleIndex: (idx: number) => void;
  swapCourseInSchedule: (
    scheduleIndex: number,
    enrollmentIndex: number,
    newCourseCode: string
  ) => void;
  getSwapCandidates: (
    scheduleIndex: number,
    enrollmentIndex: number
  ) => {
    candidates: string[];
    poolCourses: string[];
    requirementTitle?: string;
    rejectedWithConflict: Array<{ code: string; conflictsWith: string }>;
  };
  setLevelBuckets: (buckets: CourseLevelBucket[]) => void;
  setLanguageBuckets: (buckets: CourseLanguageBucket[]) => void;
  setElectiveLevelBuckets: (buckets: number[]) => void;
  resetToDefault: () => void;
}

export type AppStore = AppState & AppActions;

export const useAppStore = create<AppStore>((set, get) => ({
  catalogue: null,
  indices: null,
  schedulesData: null,
  cache: null,
  loading: false,
  error: null,

  terms: null,
  selectedTermId: null,

  program: null,
  completedCourses: [],
  remainingRequirements: [],
  requirementTreeWithStatus: [],
  completedRequirementsList: [],
  selectedPerRequirement: {},
  selectedOptionsPerRequirement: {},
  coursesThisSemester: 5,
  prereqEligibleCourses: [],
  filteredPrereqEligibleCourses: [],
  levelBuckets: ['undergrad'],
  languageBuckets: ['en', 'other'],
  electiveLevelBuckets: [1000, 2000],
  generatedSchedules: [],
  swapPool: [],
  chosenCourseToRequirementId: {},
  schedulePoolMaps: [],
  selectedScheduleIndex: 0,
  generationError: null,
  unassignedCompletedCourses: [],
  generationMinStartMinutes: 8 * 60 + 30, // 8:30
  generationMaxEndMinutes: 22 * 60, // 22:00
  generationAllowedDays: ['Mo', 'Tu', 'We', 'Th', 'Fr'],
  generationSeed: generateRandomSeed(),

  setGenerationMinStartMinutes: (minutes) => set({ generationMinStartMinutes: minutes }),
  setGenerationMaxEndMinutes: (minutes) => set({ generationMaxEndMinutes: minutes }),
  setGenerationAllowedDays: (days) => set({ generationAllowedDays: days }),

  setSelectedTermId: async (termId: string) => {
    set({ loading: true, error: null });
    try {
      const { catalogue } = get();
      if (!catalogue) throw new Error('Catalogue not loaded');

      const schedulesRes = await fetch(`/data/schedules.${termId}.json`);
      if (!schedulesRes.ok) throw new Error('Failed to load schedules data');
      const schedulesData = await schedulesRes.json();

      const { buildDataCache } = await import('../lib/dataCache');
      const { SchedulesDataSchema } = await import('../schemas/schedules');

      const parsedSchedules = SchedulesDataSchema.parse(schedulesData);
      const cache = buildDataCache(catalogue as any, parsedSchedules);

      // Recompute derived state against the new schedules/cache (keeping existing selections).
      const s = get();
      const full = recomputeStateForProgram(
        s.program,
        s.completedCourses,
        cache,
        s.selectedPerRequirement,
        s.selectedOptionsPerRequirement,
        s.levelBuckets,
        s.languageBuckets,
      );

      set({
        selectedTermId: termId,
        schedulesData: parsedSchedules,
        cache,
        generatedSchedules: [],
        generationError: null,
        selectedScheduleIndex: 0,
        ...full,
        loading: false,
        error: null,
      });

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(TERM_LOCAL_STORAGE_KEY, termId);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load data',
      });
    }
  },

  loadEncodedState: (decoded) => {
    const { catalogue, indices, cache } = get();
    if (!catalogue || !cache || !indices) return;

    const firstPass = recomputeStateForProgram(
      decoded.program,
      decoded.completedCourseCodes,
      cache,
      {},
      {},
      decoded.levelBuckets,
      decoded.languageBuckets,
    );
    const orderedReqIds = requirementIdsFromTree(firstPass.requirementTreeWithStatus);
    const reqIndexToId = new Map<number, string>();
    orderedReqIds.forEach((id, i) => reqIndexToId.set(i, id));

    const selectedOptionsPerRequirement: Record<string, number> = {};
    for (const { reqIndex, optionIndex } of decoded.optionSelections) {
      const reqId = reqIndexToId.get(reqIndex);
      if (reqId != null) selectedOptionsPerRequirement[reqId] = optionIndex;
    }

    const selectedPerRequirement: Record<string, string[]> = {};
    for (const { reqIndex, courseIndices } of decoded.courseSelections) {
      const reqId = reqIndexToId.get(reqIndex);
      if (reqId == null) continue;
      const codes = courseIndices
        .map((i) => (i < indices.courses.length ? indices.courses[i] : null))
        .filter((c): c is string => c != null);
      const inCatalogue = new Set(
        (catalogue.courses as Array<{ code: string }>).map((c) => c.code),
      );
      const valid = codes.filter((code) => inCatalogue.has(code));
      if (valid.length) selectedPerRequirement[reqId] = valid;
    }

    const full = recomputeStateForProgram(
      decoded.program,
      decoded.completedCourseCodes,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      decoded.levelBuckets,
      decoded.languageBuckets,
    );

    set({
      program: decoded.program,
      completedCourses: decoded.completedCourseCodes,
      levelBuckets: decoded.levelBuckets,
      languageBuckets: decoded.languageBuckets,
      electiveLevelBuckets: decoded.electiveLevelBuckets,
      coursesThisSemester: decoded.coursesThisSemester,
      selectedScheduleIndex: Math.max(0, decoded.selectedScheduleIndex),
      generationSeed: decoded.generationSeed >>> 0,
      generatedSchedules: [],
      generationError: null,
      ...full,
    });
  },

  getEncodedStateBase64: () => {
    const s = get();
    if (!s.catalogue || !s.indices) return null;
    const input: EncodeInput = {
      program: s.program,
      completedCourses: s.completedCourses,
      levelBuckets: s.levelBuckets,
      languageBuckets: s.languageBuckets,
      electiveLevelBuckets: s.electiveLevelBuckets,
      coursesThisSemester: s.coursesThisSemester,
      selectedScheduleIndex: s.selectedScheduleIndex,
      generationSeed: s.generationSeed >>> 0,
      selectedPerRequirement: s.selectedPerRequirement,
      selectedOptionsPerRequirement: s.selectedOptionsPerRequirement,
      requirementTreeWithStatus: s.requirementTreeWithStatus,
      remainingRequirements: s.remainingRequirements,
    };
    return encodeStateToBase64(
      input,
      s.catalogue as { courses: Array<{ code: string }>; programs: Program[] },
      s.indices,
    );
  },

  getShareUrl: () => {
    const s = get();
    if (!s.catalogue || !s.indices) return null;
    const input: EncodeInput = {
      program: s.program,
      completedCourses: s.completedCourses,
      levelBuckets: s.levelBuckets,
      languageBuckets: s.languageBuckets,
      electiveLevelBuckets: s.electiveLevelBuckets,
      coursesThisSemester: s.coursesThisSemester,
      selectedScheduleIndex: s.selectedScheduleIndex,
      generationSeed: s.generationSeed >>> 0,
      selectedPerRequirement: s.selectedPerRequirement,
      selectedOptionsPerRequirement: s.selectedOptionsPerRequirement,
      requirementTreeWithStatus: s.requirementTreeWithStatus,
      remainingRequirements: s.remainingRequirements,
    };
    const bytes = encodeState(
      input,
      s.catalogue as { courses: Array<{ code: string }>; programs: Program[] },
      s.indices,
    );
    if (!bytes) return null;
    return stateToShareUrl(bytes, undefined, s.selectedTermId ?? undefined);
  },

  loadData: async () => {
    set({ loading: true, error: null });
    try {
      const [catalogueRes, termsRes, indicesRes] = await Promise.all([
        fetch('/data/catalogue.json'),
        fetch('/data/terms.json'),
        fetch('/data/indices.json').catch(() => null),
      ]);
      if (!catalogueRes.ok || !termsRes.ok) throw new Error('Failed to load data');

      const catalogue = await catalogueRes.json();
      const termsJson = await termsRes.json();

      const { buildDataCache } = await import('../lib/dataCache');
      const { CatalogueSchema } = await import('../schemas/catalogue');
      const { SchedulesDataSchema } = await import('../schemas/schedules');
      const { IndicesSchema } = await import('../schemas/indices');
      const { TermsDataSchema } = await import('../schemas/terms');

      const parsedCatalogue = CatalogueSchema.parse(catalogue);
      const parsedTerms = TermsDataSchema.parse(termsJson);

      let indices: Indices | null = null;
      if (indicesRes?.ok) {
        const indicesJson = await indicesRes.json();
        indices = IndicesSchema.parse(indicesJson);
      } else {
        indices = {
          courses: (parsedCatalogue.courses as Array<{ code: string }>).map((c) => c.code),
          programs: parsedCatalogue.programs.map((p) => p.url),
        };
      }

      let initialTermId: string | null = null;
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const urlTerm = params.get('t');
        if (urlTerm) initialTermId = urlTerm;
        if (!initialTermId) {
          try {
            initialTermId = localStorage.getItem(TERM_LOCAL_STORAGE_KEY);
          } catch {
            // ignore
          }
        }
      }
      if (!initialTermId) {
        initialTermId = parsedTerms.terms[0]?.termId ?? null;
      }
      if (!initialTermId) throw new Error('No terms available');

      const schedulesRes = await fetch(`/data/schedules.${initialTermId}.json`);
      if (!schedulesRes.ok) throw new Error('Failed to load schedules data');
      const schedulesData = await schedulesRes.json();
      const parsedSchedules = SchedulesDataSchema.parse(schedulesData);
      const cache = buildDataCache(parsedCatalogue, parsedSchedules);

      set({
        catalogue: parsedCatalogue,
        indices,
        schedulesData: parsedSchedules,
        cache,
        terms: parsedTerms.terms,
        selectedTermId: initialTermId,
        loading: false,
        error: null,
      });

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(TERM_LOCAL_STORAGE_KEY, initialTermId);
        } catch {
          // ignore
        }
      }

      if (indices && typeof window !== 'undefined') {
        const catalogueLike = parsedCatalogue as {
          courses: Array<{ code: string }>;
          programs: Program[];
        };
        const urlBytes = parseStateFromUrl(window.location.search);
        if (urlBytes && urlBytes.length > 0) {
          const { decodeState } = await import('../lib/stateEncode');
          const decoded = decodeState(urlBytes, catalogueLike, indices);
          if ('error' in decoded) {
            set({ error: decoded.error });
          } else {
            get().loadEncodedState(decoded);
            const u = new URL(window.location.href);
            u.searchParams.delete('s');
            u.searchParams.delete('t');
            window.history.replaceState({}, '', u.toString());
          }
        } else {
          const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (stored) {
            const decoded = decodeStateFromBase64(stored, catalogueLike, indices);
            if (!('error' in decoded)) get().loadEncodedState(decoded);
          }
        }
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load data',
      });
    }
  },

  setProgram: (program) => {
    set({ program });
    const { cache, completedCourses, levelBuckets, languageBuckets } = get();
    const state = recomputeStateForProgram(
      program,
      completedCourses,
      cache,
      {},
      {},
      levelBuckets,
      languageBuckets,
    );
    set(state);
  },

  setCompletedCourses: (courses) => {
    set({ completedCourses: courses });
    const {
      program,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
    } = get();
    const state = recomputeStateForProgram(
      program,
      courses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
    );
    set(state);
  },

  addCompletedCourse: (code) => {
    const { completedCourses } = get();
    if (completedCourses.includes(code)) return;
    get().setCompletedCourses([...completedCourses, code]);
  },

  removeCompletedCourse: (code) => {
    const { completedCourses } = get();
    get().setCompletedCourses(completedCourses.filter((c) => c !== code));
  },

  setSelectedForRequirement: (requirementId, courses) => {
    const prev = get().selectedPerRequirement;
    const selectedPerRequirementNext = { ...prev, [requirementId]: courses };
    const {
      program,
      cache,
      completedCourses,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
    } = get();
    const state = recomputeStateForProgram(
      program,
      completedCourses,
      cache,
      selectedPerRequirementNext,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
    );
    set(state);
  },

  setLevelBuckets: (buckets) => {
    set({ levelBuckets: buckets });
    const {
      program,
      cache,
      completedCourses,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      languageBuckets,
    } = get();
    const state = recomputeStateForProgram(
      program,
      completedCourses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      buckets,
      languageBuckets,
    );
    set(state);
  },

  setLanguageBuckets: (buckets) => {
    set({ languageBuckets: buckets });
    const {
      program,
      cache,
      completedCourses,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
    } = get();
    const state = recomputeStateForProgram(
      program,
      completedCourses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      buckets,
    );
    set(state);
  },

  setElectiveLevelBuckets: (buckets) => {
    set({ electiveLevelBuckets: buckets });
  },

  resetToDefault: () => {
    const { catalogue, indices, schedulesData, cache, loading, error } = get();
    set({
      catalogue,
      indices,
      schedulesData,
      cache,
      loading,
      error,
      program: null,
      completedCourses: [],
      remainingRequirements: [],
      requirementTreeWithStatus: [],
      completedRequirementsList: [],
      selectedPerRequirement: {},
      selectedOptionsPerRequirement: {},
      coursesThisSemester: 5,
      prereqEligibleCourses: [],
      filteredPrereqEligibleCourses: [],
      levelBuckets: ['undergrad'],
      languageBuckets: ['en', 'other'],
      electiveLevelBuckets: [1000, 2000],
      generatedSchedules: [],
      swapPool: [],
      chosenCourseToRequirementId: {},
      schedulePoolMaps: [],
      selectedScheduleIndex: 0,
      generationError: null,
      unassignedCompletedCourses: [],
      generationSeed: generateRandomSeed(),
    });
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  },

  setSelectedOptionForRequirement: (requirementId, optionIndex) => {
    set((s) => ({
      selectedOptionsPerRequirement: {
        ...s.selectedOptionsPerRequirement,
        [requirementId]: optionIndex,
      },
    }));
  },

  setCoursesThisSemester: (n) => set({ coursesThisSemester: n }),

  generateSchedules: (options) => {
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
      generationSeed,
    } = get();
    if (!cache) return;
    const cacheVal = cache;

    const unassigned = [...new Set(unassignedCompletedCourses)].sort();
    if (unassigned.length > 0) {
      const previewLimit = 12;
      const preview = unassigned.slice(0, previewLimit);
      const suffix =
        unassigned.length > previewLimit
          ? ` (+${unassigned.length - previewLimit} more)`
          : '';
      set({
        generationError: `Assign all completed courses to requirements before generating schedules. Unassigned: ${preview.join(', ')}${suffix}`,
      });
      return;
    }

    // Deterministic randomness:
    // - Base seed comes from appState and is included in share links.
    // - When the user clicks "Generate new schedule" (appendFirstOnly), we salt the seed with
    //   the number of schedules already generated so each click yields a different schedule,
    //   while the whole sequence remains reproducible from the same starting state.
    const existingScheduleCount = appendFirstOnly ? get().generatedSchedules.length : 0;
    const rng = createSeededRng(((generationSeed >>> 0) + existingScheduleCount) >>> 0);
    const constraints: GenerationConstraints = {
      minStartMinutes: generationMinStartMinutes,
      maxEndMinutes: generationMaxEndMinutes,
      allowedDays: generationAllowedDays,
    };

    function isHonoursProject(code: string): boolean {
      const course = cacheVal.getCourse(code);
      const component = course?.component?.trim().toLowerCase() ?? '';
      return component.startsWith('recherche / research');
    }

    const allSelected = Object.values(selectedPerRequirement).flat();
    const unique = [...new Set(allSelected)];
    const completedSet = new Set(completedCourses.map(normalizeCourseCode));

    const prereqEligibleSet = new Set(prereqEligibleCourses);

    // Separate out honours project selections: they **do** satisfy requirements but are not
    // scheduled like regular courses. We treat them as occupying a slot in the user's
    // requested course load, but we do not attempt to place them into time-based schedules.
    // IMPORTANT: honours selections should only reduce the schedulable target if the student
    // can actually take them (prereq-eligible). Otherwise they shouldn't "steal" a slot.
    const honoursSelected = unique
      .filter((code) => isHonoursProject(code))
      .filter((code) => !completedSet.has(normalizeCourseCode(code)))
      .filter((code) => prereqEligibleSet.has(code));
    // Selected schedulable courses (not honours, not completed, and present in schedules data).
    // In the normal case, these become "pinned" (forced into every schedule). If the user
    // selects more courses than the term target, we treat them as the initial candidate pool
    // instead (not all need to appear in every schedule).
    const selectedSchedulable = unique.filter(
      (code) =>
        !isHonoursProject(code) &&
        !!cacheVal.getSchedule(code) &&
        !completedSet.has(normalizeCourseCode(code)),
    );

    const honoursCount = honoursSelected.length;
    const effectiveTarget = Math.max(0, coursesThisSemester - honoursCount);
    const oversubscribedSelections = selectedSchedulable.length > effectiveTarget;
    const pinned = oversubscribedSelections ? [] : selectedSchedulable;

    // Enforce that all active or/options groups with a requirementId have exactly one selected option.
    // A group is "active" if it lies on the branch of options chosen in its ancestor option groups.
    const missingOptionGroups: string[] = [];

    function walkNodes(
      nodes: RequirementWithStatus[],
      parentRequirementId: string | undefined,
      parentSelectedIndex: number | undefined,
      parentChildIndex: number | undefined
    ): void {
      for (let idx = 0; idx < nodes.length; idx++) {
        const node = nodes[idx];
        // Determine if this node is on an active branch from its parent
        const parentActive =
          parentRequirementId == null ||
          parentSelectedIndex == null ||
          parentSelectedIndex === parentChildIndex;
        const active = parentActive;
        if (!active) {
          continue;
        }

        if (
          (node.type === 'or_group' || node.type === 'options_group') &&
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
            currentReqId != null ? selectedOptionsPerRequirement[currentReqId] : undefined;
          for (let childIdx = 0; childIdx < node.options.length; childIdx++) {
            walkNodes(
              [node.options[childIdx]],
              currentReqId ?? parentRequirementId,
              currentReqId != null ? currentSelectedIndex : parentSelectedIndex,
              childIdx
            );
          }
        }
      }
    }

    walkNodes(requirementTreeWithStatus, undefined, undefined, undefined);

    if (missingOptionGroups.length > 0) {
      set({
        generationError:
          'Please choose exactly one option in each “or” block before generating schedules.',
      });
      return;
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

    function isEligibleCandidate(code: string, poolType?: string): boolean {
      if (
        !cacheVal.getSchedule(code) ||
        pinned.includes(code) ||
        completedSet.has(normalizeCourseCode(code)) ||
        !prereqEligibleSet.has(code) ||
        !courseMatchesFilters(code, filters)
      ) {
        return false;
      }
      // Exclude honours/research courses from automatic scheduling for most pools; they are
      // handled separately as honours selections. However, when the pool itself is a concrete
      // course requirement (type: 'course'), we keep the honours course so the requirement tree
      // can still reflect it properly.
      if (poolType !== 'course' && isHonoursProject(code)) return false;
      // Exclude courses with no valid section combos (e.g. empty times) so they are never picked.
      const sched = cacheVal.getSchedule(code);
      if (sched && getValidSectionCombos(sched, constraints).length === 0) return false;
      return true;
    }

    function collectUniqueSchedulesFromCandidatePool(
      candidatePool: string[],
      mapsForNonPoolCodes: Record<string, string> = {}
    ): { schedules: GeneratedSchedule[]; poolMaps: Record<string, string>[]; usedPool: string[] } {
      const maxAttempts = appendFirstOnly ? 100 : 300;
      const targetUniqueSchedules = appendFirstOnly ? 1 : 25;
      const seenCourseSets = new Set<string>();
      const collectedSchedules: GeneratedSchedule[] = [];
      const collectedPoolMaps: Record<string, string>[] = [];
      let lastUsedPool: string[] = [];

      const base = [...new Set(candidatePool)];
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (collectedSchedules.length >= targetUniqueSchedules) break;
        const attemptPool = [...base];
        shuffleInPlace(attemptPool, rng);
        lastUsedPool = attemptPool;
        const batch = genSchedules(attemptPool, effectiveTarget, cacheVal, constraints);
        const fullBatch = batch.filter((s) => s.enrollments.length >= effectiveTarget);
        if (fullBatch.length === 0) continue;

        const fingerprint = fullBatch[0].enrollments
          .map((e) => e.courseCode)
          .sort()
          .join(',');
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
      const selectedOnlyPool = selectedSchedulable.filter((code) => isEligibleCandidate(code));

      const baseAttempt = collectUniqueSchedulesFromCandidatePool(selectedOnlyPool, {});
      filteredOptionalPool = baseAttempt.usedPool;
      finalSchedules = baseAttempt.schedules;
      finalPoolMaps = baseAttempt.poolMaps;
      lastChosenFromPool = {};

      // Fallback: if nothing works from selected courses alone, expand the pool with additional
      // remaining-requirement candidates (including electives) and retry.
      if (finalSchedules.length === 0) {
        const allPools = buildRequirementPools(remainingRequirements);
        const extraCandidates: string[] = [];
        const selectedSet = new Set(selectedOnlyPool.map(normalizeCourseCode));
        for (const pool of allPools) {
          for (const code of pool.candidateCourses) {
            if (selectedSet.has(normalizeCourseCode(code))) continue;
            if (!isEligibleCandidate(code, pool.type)) continue;
            // For elective-style pools, respect elective level buckets from the requirements page.
            const isElectiveType =
              pool.type === 'elective' ||
              pool.type === 'free_elective' ||
              pool.type === 'non_discipline_elective' ||
              pool.type === 'faculty_elective';
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

        const expandedPool = [...new Set([...selectedOnlyPool, ...extraCandidates])];
        const expandedAttempt = collectUniqueSchedulesFromCandidatePool(expandedPool, {});
        filteredOptionalPool = expandedAttempt.usedPool;
        finalSchedules = expandedAttempt.schedules;
        finalPoolMaps = expandedAttempt.poolMaps;
      }
    }

    if (!oversubscribedSelections && remainingNeeded > 0) {
      const allPools = buildRequirementPools(remainingRequirements);

      // Adjust pool credits: subtract pinned (selected, not yet taken) and selected completed.
      let pools: RequirementPool[] = allPools
        .map((pool) => {
          let pinnedCredits = 0;
          for (const code of pinned) {
            if (!pool.candidateCourses.includes(code)) continue;
            const course = cacheVal.getCourse(code);
            pinnedCredits += course?.credits ?? 3;
          }
          const selectedForPool = selectedPerRequirement[pool.requirementId] ?? [];
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

      // Exclude course/or_course pools that have no schedulable non-honours candidate
      // (e.g. CSI 4900). Those requirements are satisfied via honoursSelected and
      // must not consume a slot in the schedule.
      pools = pools.filter((pool) => {
        if (pool.type !== 'course' && pool.type !== 'or_course') return true;
        const hasSchedulableNonHonours = pool.candidateCourses.some((code) => {
          if (isHonoursProject(code)) return false;
          return !!cacheVal.getSchedule(code);
        });
        return hasSchedulableNonHonours;
      });

      const coursesPerPool = computeCoursesPerPool(pools, remainingNeeded, cacheVal);

      const candidatesByRequirement = new Map<string, string[]>();
      for (const pool of pools) {
        const candidates: string[] = [];
        for (const code of pool.candidateCourses) {
          if (
            !cacheVal.getSchedule(code) ||
            pinned.includes(code) ||
            completedCourses.includes(code) ||
            !prereqEligibleSet.has(code) ||
            !courseMatchesFilters(code, filters)
          ) {
            continue;
          }
          // For elective-style pools, also respect elective level buckets from the
          // requirements page (e.g., only 3000/4000-level electives).
          // NOTE: discipline_elective (like \"CSI 4000-level\") is NOT treated as a
          // generic elective for this purpose – it follows its own discipline rules.
          const isElectiveType =
            pool.type === 'elective' ||
            pool.type === 'free_elective' ||
            pool.type === 'non_discipline_elective' ||
            pool.type === 'faculty_elective';
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
          // Exclude honours/research courses from automatic scheduling for most pools;
          // they are handled separately as honours selections. However, when the pool
          // itself is a concrete course requirement (type: 'course'), we keep the
          // honours course so the requirement tree can still reflect it properly.
          if (pool.type !== 'course' && isHonoursProject(code)) continue;
          // Exclude courses with no valid section combos (e.g. empty times) so they
          // are never picked and never produce a schedule with fewer real courses.
          const sched = cacheVal.getSchedule(code);
          if (sched && getValidSectionCombos(sched, constraints).length === 0) continue;
          candidates.push(code);
        }
        if (candidates.length > 0) {
          candidatesByRequirement.set(pool.requirementId, candidates);
        }
      }

      const maxAttempts = appendFirstOnly ? 100 : 300;
      const targetUniqueSchedules = appendFirstOnly ? 1 : 25;
      const seenCourseSets = new Set<string>();
      const collectedSchedules: GeneratedSchedule[] = [];
      const collectedPoolMaps: Record<string, string>[] = [];
      let lastFilteredPool: string[] = [];

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (collectedSchedules.length >= targetUniqueSchedules) break;

        // Shuffle each pool's candidates so we try different course combinations.
        for (const list of candidatesByRequirement.values()) {
          shuffleInPlace(list, rng);
        }

        const chosenCodes = new Set<string>();
        const chosenFromPool: Record<string, string> = {};
        for (const pool of pools) {
          let need = coursesPerPool.get(pool.requirementId) ?? 0;
          if (need <= 0) continue;
          const candidates = candidatesByRequirement.get(pool.requirementId) ?? [];
          if (candidates.length === 0) continue;

          for (const code of candidates) {
            if (chosenCodes.size >= remainingNeeded) break;
            if (chosenCodes.has(code)) continue;
            if (pinned.includes(code)) continue;
            if (isHonoursProject(code)) continue;
            chosenCodes.add(code);
            chosenFromPool[code] = pool.requirementId;
            need -= 1;
            if (need <= 0) break;
          }
        }

        const optionalPool = Array.from(chosenCodes)
          .filter((code) => !isHonoursProject(code))
          .filter((code) => !pinned.includes(code));

        if (optionalPool.length + pinned.length < effectiveTarget) {
          break;
        }

        lastFilteredPool = optionalPool;
        shuffleInPlace(lastFilteredPool, rng);

        const batch =
          pinned.length === 0
            ? genSchedules(lastFilteredPool, effectiveTarget, cacheVal, constraints)
            : generateSchedulesWithPinned(
                pinned,
                lastFilteredPool,
                effectiveTarget,
                cacheVal,
                constraints
              );

        const fullBatch = batch.filter(
          (s) => s.enrollments.length >= effectiveTarget,
        );
        if (fullBatch.length === 0) continue;

        const fingerprint = fullBatch[0].enrollments
          .map((e) => e.courseCode)
          .sort()
          .join(',');
        if (seenCourseSets.has(fingerprint)) continue;
        seenCourseSets.add(fingerprint);
        collectedSchedules.push(fullBatch[0]);
        collectedPoolMaps.push(chosenFromPool);
      }

      finalSchedules = collectedSchedules;
      finalPoolMaps = collectedPoolMaps;
      lastChosenFromPool = collectedPoolMaps[0] ?? {};

      filteredOptionalPool = lastFilteredPool;
    }

    if (remainingNeeded <= 0) {
      filteredOptionalPool = [];
      finalSchedules =
        pinned.length === 0
          ? genSchedules([], effectiveTarget, cacheVal, constraints)
          : generateSchedulesWithPinned(pinned, [], effectiveTarget, cacheVal, constraints);
      finalPoolMaps = finalSchedules.map(() => ({}));
    }

    // If we could not assemble enough eligible courses to hit the target, surface error.
    if (filteredOptionalPool.length + pinned.length < effectiveTarget) {
      if (appendFirstOnly) {
        set({
          generationError:
            'Not enough eligible courses to generate another schedule. Try relaxing filters or changing selections.',
        });
        return;
      }
      const swapPool = [...new Set([...pinned, ...filteredOptionalPool])];
      set({
        generatedSchedules: [],
        swapPool,
        chosenCourseToRequirementId: {},
        schedulePoolMaps: [],
        selectedScheduleIndex: 0,
        generationError:
          'Not enough eligible courses match your filters and requirements to build a full schedule. Try relaxing filters or changing selections.',
      });
      return;
    }

    const swapPool = [...new Set([...pinned, ...filteredOptionalPool])];
    const limit = appendFirstOnly ? 1 : 25;
    const limitedSchedules = finalSchedules.slice(0, limit);
    const limitedPoolMaps = finalPoolMaps.slice(0, limit);

    if (appendFirstOnly && limitedSchedules.length > 0) {
      const current = get();
      const newSchedules = [...current.generatedSchedules, limitedSchedules[0]];
      const newPoolMaps = [...current.schedulePoolMaps, limitedPoolMaps[0]];
      const newSwapPool = [
        ...new Set([
          ...current.swapPool,
          ...limitedSchedules[0].enrollments.map((e) => e.courseCode),
        ]),
      ];
      set({
        generatedSchedules: newSchedules,
        swapPool: newSwapPool,
        schedulePoolMaps: newPoolMaps,
        selectedScheduleIndex: newSchedules.length - 1,
        generationError: null,
      });
      return;
    }

    if (appendFirstOnly && limitedSchedules.length === 0) {
      set({
        generationError:
          'Could not generate another schedule after 100 attempts. Try different selections or filters.',
      });
      return;
    }

    set({
      generatedSchedules: limitedSchedules,
      swapPool,
      chosenCourseToRequirementId: lastChosenFromPool,
      schedulePoolMaps: limitedPoolMaps,
      selectedScheduleIndex: 0,
      generationError:
        limitedSchedules.length === 0
          ? 'No non-overlapping schedules could be generated with your selections.'
          : null,
    });
  },

  setSelectedScheduleIndex: (idx) => set({ selectedScheduleIndex: idx }),

  swapCourseInSchedule: (scheduleIndex, enrollmentIndex, newCourseCode) => {
    const {
      generatedSchedules,
      cache,
      chosenCourseToRequirementId,
      schedulePoolMaps,
      generationMinStartMinutes,
      generationMaxEndMinutes,
      generationAllowedDays,
    } = get();
    if (!cache || scheduleIndex >= generatedSchedules.length) return;

    const schedule = generatedSchedules[scheduleIndex];
    const oldEnrollment = schedule.enrollments[enrollmentIndex];
    if (!oldEnrollment) return;

    const newSchedule = cache.getSchedule(newCourseCode);
    if (!newSchedule) return;

    const constraints: GenerationConstraints = {
      minStartMinutes: generationMinStartMinutes,
      maxEndMinutes: generationMaxEndMinutes,
      allowedDays: generationAllowedDays,
    };
    const combos = getValidSectionCombos(newSchedule, constraints);
    const others = schedule.enrollments.filter((_, i) => i !== enrollmentIndex);

    for (const combo of combos) {
      const candidate = getEnrollmentsForCourse(newSchedule, combo);
      const conflicts = others.some((e) => enrollmentsOverlap(e, candidate));
      if (!conflicts) {
        const newEnrollments = [...schedule.enrollments];
        newEnrollments[enrollmentIndex] = candidate;
        const newSchedules = [...generatedSchedules];
        newSchedules[scheduleIndex] = { enrollments: newEnrollments };
        const oldCode = oldEnrollment.courseCode;
        const poolMap = schedulePoolMaps[scheduleIndex] ?? chosenCourseToRequirementId;
        const poolId = poolMap[oldCode];
        const nextMap =
          poolId != null ? { ...poolMap, [newCourseCode]: poolId } : poolMap;
        const nextPoolMaps = [...schedulePoolMaps];
        if (scheduleIndex < nextPoolMaps.length) {
          nextPoolMaps[scheduleIndex] = nextMap;
        }
        set({
          generatedSchedules: newSchedules,
          chosenCourseToRequirementId:
            scheduleIndex === 0 ? nextMap : chosenCourseToRequirementId,
          schedulePoolMaps: nextPoolMaps,
        });
        return;
      }
    }
  },

  getSwapCandidates: (scheduleIndex, enrollmentIndex) => {
    const {
      cache,
      generatedSchedules,
      remainingRequirements,
      chosenCourseToRequirementId,
      schedulePoolMaps,
      completedCourses,
      prereqEligibleCourses,
      levelBuckets,
      languageBuckets,
      electiveLevelBuckets,
      generationMinStartMinutes,
      generationMaxEndMinutes,
      generationAllowedDays,
    } = get();
    if (!cache || scheduleIndex >= generatedSchedules.length) {
      return { candidates: [], poolCourses: [], rejectedWithConflict: [] };
    }

    const cacheVal = cache;
    const schedule = generatedSchedules[scheduleIndex];
    const enrollment = schedule.enrollments[enrollmentIndex];
    if (!enrollment) {
      return { candidates: [], poolCourses: [], rejectedWithConflict: [] };
    }

    const oldCode = enrollment.courseCode;
    // Use the pool this course was actually picked from (per-schedule when we have multiple).
    const poolMap = schedulePoolMaps[scheduleIndex] ?? chosenCourseToRequirementId;
    const requirementId = poolMap[oldCode];
    const candidateSet = new Set<string>();
    let poolRequirementType: string | undefined;
    let requirementTitle: string | undefined;
    if (requirementId) {
      const req = remainingRequirements.find((r) => r.requirementId === requirementId);
      if (req?.candidateCourses?.length) {
        poolRequirementType = req.type;
        requirementTitle = req.title;
        for (const c of req.candidateCourses) candidateSet.add(c);
      }
    }
    // Fallback: requirements that list this course (e.g. before we had tracking).
    if (candidateSet.size === 0) {
      const oldCodeNorm = normalizeCourseCode(oldCode);
      for (const req of remainingRequirements) {
        if (!req.candidateCourses?.length) continue;
        const hasOld = req.candidateCourses.some((c) => normalizeCourseCode(c) === oldCodeNorm);
        if (hasOld) {
          for (const c of req.candidateCourses) candidateSet.add(c);
        }
      }
    }
    if (candidateSet.size === 0) {
      const { filteredPrereqEligibleCourses } = get();
      for (const c of filteredPrereqEligibleCourses) candidateSet.add(c);
    }

    // Ignore conflicts with the swapped course and any duplicate blocks for same code.
    const others = schedule.enrollments.filter(
      (e, i) => i !== enrollmentIndex && e.courseCode !== oldCode
    );
    const alreadyInSchedule = new Set(schedule.enrollments.map((e) => e.courseCode));

    function isHonoursProject(code: string): boolean {
      const course = cacheVal.getCourse(code);
      const component = course?.component?.trim().toLowerCase() ?? '';
      return component.startsWith('recherche / research');
    }

    const prereqEligibleSet = new Set(prereqEligibleCourses);
    const swapConstraints: GenerationConstraints = {
      minStartMinutes: generationMinStartMinutes,
      maxEndMinutes: generationMaxEndMinutes,
      allowedDays: generationAllowedDays,
    };

    function getValidEnrollmentsFor(code: string): CourseEnrollment[] {
      const cached = validEnrollmentsByCourseCode.get(code);
      if (cached) return cached;
      const sched = cacheVal.getSchedule(code);
      if (!sched) {
        validEnrollmentsByCourseCode.set(code, []);
        return [];
      }
      const combos = getValidSectionCombos(sched, swapConstraints);
      const enrollments = combos.map((combo) => getEnrollmentsForCourse(sched, combo));
      validEnrollmentsByCourseCode.set(code, enrollments);
      return enrollments;
    }

    const filters = { levels: levelBuckets, languageBuckets };

    const candidates: string[] = [];
    const rejectedWithConflict: Array<{ code: string; conflictsWith: string }> = [];
    for (const code of candidateSet) {
      if (!prereqEligibleSet.has(code)) {
        continue;
      }
      if (code === oldCode) continue;
      if (completedCourses.includes(code)) {
        continue;
      }
      if (alreadyInSchedule.has(code)) {
        continue;
      }
      if (isHonoursProject(code)) {
        continue;
      }
      if (!courseMatchesFilters(code, filters)) {
        continue;
      }
      // Only apply elective level bucket filter to generic electives (free, non-discipline, etc.).
      // discipline_elective (e.g. CSI 4000-level) already enforces its own level via the requirement.
      const isGenericElective =
        poolRequirementType === 'free_elective' ||
        poolRequirementType === 'non_discipline_elective' ||
        poolRequirementType === 'faculty_elective' ||
        poolRequirementType === 'elective';
      if (isGenericElective && electiveLevelBuckets.length > 0) {
        const match = code.match(/\d{4}/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!Number.isNaN(num)) {
            const bucket = Math.floor(num / 1000) * 1000;
            if (!electiveLevelBuckets.includes(bucket)) {
              continue;
            }
          }
        }
      }
      const possibleEnrollments = getValidEnrollmentsFor(code);
      if (possibleEnrollments.length === 0) {
        continue;
      }
      let added = false;
      for (const candidate of possibleEnrollments) {
        const conflicts = others.some((e) => enrollmentsOverlap(e, candidate));
        if (!conflicts) {
          candidates.push(code);
          added = true;
          break;
        }
      }
      if (!added && others.length > 0 && possibleEnrollments.length > 0) {
        const conflict = getFirstOverlapWith(possibleEnrollments[0], others);
        if (conflict) {
          rejectedWithConflict.push({ code, conflictsWith: conflict.courseCode });
        }
      }
    }
    const poolCourses = [...candidateSet];
    return { candidates, poolCourses, requirementTitle, rejectedWithConflict };
  },
}));
