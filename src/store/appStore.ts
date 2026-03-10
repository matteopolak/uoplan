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
  type CourseEnrollment,
  type GeneratedSchedule,
} from '../lib/scheduleGenerator';
import type { DataCache } from '../lib/dataCache';
import { buildPrereqContext, canTakeCourse } from '../lib/prerequisites';
import {
  courseMatchesFilters,
  type CourseLanguageBucket,
  type CourseLevelBucket,
} from '../lib/courseFilters';

const validEnrollmentsByCourseCode = new Map<string, CourseEnrollment[]>();

export interface AppState {
  catalogue: { courses: unknown[]; programs: Program[] } | null;
  schedulesData: { termId: string; schedules: unknown[] } | null;
  cache: DataCache | null;
  loading: boolean;
  error: string | null;

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
  selectedScheduleIndex: number;
  generationError: string | null;
}

interface RecomputedState {
  remainingRequirements: RemainingRequirement[];
  requirementTreeWithStatus: RequirementWithStatus[];
  completedRequirementsList: CompletedRequirementItem[];
  selectedPerRequirement: Record<string, string[]>;
  selectedOptionsPerRequirement: Record<string, number>;
  prereqEligibleCourses: string[];
  filteredPrereqEligibleCourses: string[];
}

type RequirementPool = {
  requirementId: string;
  type: RemainingRequirement['type'];
  label: string;
  candidateCourses: string[];
  creditsNeeded: number;
  minCourses: number;
};

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

function averageCreditsForCodes(codes: string[], cache: DataCache): number {
  if (codes.length === 0) return 3;
  let total = 0;
  let count = 0;
  for (const code of codes) {
    const course = cache.getCourse(code);
    total += course?.credits ?? 3;
    count += 1;
  }
  return count === 0 ? 3 : total / count;
}

function computeCoursesPerPool(
  pools: RequirementPool[],
  remainingCourseSlots: number,
  cache: DataCache,
): Map<string, number> {
  const result = new Map<string, number>();
  if (remainingCourseSlots <= 0 || pools.length === 0) {
    return result;
  }

  let totalPlanned = 0;
  for (const pool of pools) {
    const avgCredits = averageCreditsForCodes(pool.candidateCourses, cache) || 3;
    const ideal = Math.ceil(pool.creditsNeeded / avgCredits);
    const withMin = Math.max(pool.minCourses, ideal);
    const clamped = Math.max(0, Math.min(withMin, remainingCourseSlots));
    if (clamped > 0) {
      result.set(pool.requirementId, clamped);
      totalPlanned += clamped;
    }
  }

  if (totalPlanned === 0) {
    return result;
  }

  while (totalPlanned > remainingCourseSlots) {
    let maxKey: string | null = null;
    let maxVal = 0;
    for (const [reqId, count] of result.entries()) {
      if (count > maxVal) {
        maxVal = count;
        maxKey = reqId;
      }
    }
    if (maxKey == null) break;
    const current = result.get(maxKey) ?? 0;
    const pool = pools.find((p) => p.requirementId === maxKey);
    const minCourses = pool?.minCourses ?? 0;
    if (current <= minCourses || current <= 0) {
      break;
    }
    result.set(maxKey, current - 1);
    totalPlanned -= 1;
  }

  return result;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
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
  const candidateSetByReq = new Map<string, Set<string>>();

  for (const req of remaining) {
    const scheduledCandidates = req.candidateCourses.filter(hasSchedule);
    candidateSetByReq.set(req.requirementId, new Set(scheduledCandidates));
  }

  const out: Record<string, string[]> = {};
  for (const req of remaining) {
    const candidateSet = candidateSetByReq.get(req.requirementId)!;
    const scheduledCandidates = Array.from(candidateSet);

    if (scheduledCandidates.length === 1) {
      out[req.requirementId] = [scheduledCandidates[0]];
    } else {
      const prev = existing[req.requirementId] ?? [];
      const valid = prev.filter((c) => candidateSet.has(c));
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

  const ctx = buildPrereqContext(completedCourses, cache);
  const candidateSet = new Set<string>();
  for (const req of remaining) {
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

  return {
    remainingRequirements: remaining,
    requirementTreeWithStatus: tree,
    completedRequirementsList: completedList,
    selectedPerRequirement: autoSelected,
    selectedOptionsPerRequirement: existingSelectedOptionsPerRequirement,
    prereqEligibleCourses,
    filteredPrereqEligibleCourses,
  };
}

export interface AppActions {
  loadData: () => Promise<void>;
  setProgram: (program: Program | null) => void;
  setCompletedCourses: (courses: string[]) => void;
  addCompletedCourse: (code: string) => void;
  removeCompletedCourse: (code: string) => void;
  setSelectedForRequirement: (requirementId: string, courses: string[]) => void;
  setSelectedOptionForRequirement: (requirementId: string, optionIndex: number) => void;
  setCoursesThisSemester: (n: number) => void;
  generateSchedules: () => void;
  setSelectedScheduleIndex: (idx: number) => void;
  swapCourseInSchedule: (
    scheduleIndex: number,
    enrollmentIndex: number,
    newCourseCode: string
  ) => void;
  getSwapCandidates: (scheduleIndex: number, enrollmentIndex: number) => string[];
  setLevelBuckets: (buckets: CourseLevelBucket[]) => void;
  setLanguageBuckets: (buckets: CourseLanguageBucket[]) => void;
  setElectiveLevelBuckets: (buckets: number[]) => void;
}

export type AppStore = AppState & AppActions;

export const useAppStore = create<AppStore>((set, get) => ({
  catalogue: null,
  schedulesData: null,
  cache: null,
  loading: false,
  error: null,

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
  selectedScheduleIndex: 0,
  generationError: null,

  loadData: async () => {
    set({ loading: true, error: null });
    try {
      const [catalogueRes, schedulesRes] = await Promise.all([
        fetch('/data/catalogue.json'),
        fetch('/data/schedules.json'),
      ]);
      if (!catalogueRes.ok || !schedulesRes.ok) throw new Error('Failed to load data');

      const catalogue = await catalogueRes.json();
      const schedulesData = await schedulesRes.json();

      const { buildDataCache } = await import('../lib/dataCache');
      const { CatalogueSchema } = await import('../schemas/catalogue');
      const { SchedulesDataSchema } = await import('../schemas/schedules');

      const parsedCatalogue = CatalogueSchema.parse(catalogue);
      const parsedSchedules = SchedulesDataSchema.parse(schedulesData);
      const cache = buildDataCache(parsedCatalogue, parsedSchedules);

      set({
        catalogue: parsedCatalogue,
        schedulesData: parsedSchedules,
        cache,
        loading: false,
        error: null,
      });
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
    set((s) => ({
      selectedPerRequirement: { ...s.selectedPerRequirement, [requirementId]: courses },
    }));
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

  setSelectedOptionForRequirement: (requirementId, optionIndex) => {
    set((s) => ({
      selectedOptionsPerRequirement: {
        ...s.selectedOptionsPerRequirement,
        [requirementId]: optionIndex,
      },
    }));
  },

  setCoursesThisSemester: (n) => set({ coursesThisSemester: n }),

  generateSchedules: () => {
    const {
      cache,
      remainingRequirements,
      requirementTreeWithStatus,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      coursesThisSemester,
      program,
      completedCourses,
      prereqEligibleCourses,
      levelBuckets,
      languageBuckets,
      electiveLevelBuckets,
    } = get();
    if (!cache) return;
    const cacheVal = cache;

    function isHonoursProject(code: string): boolean {
      const course = cacheVal.getCourse(code);
      const component = course?.component?.trim().toLowerCase() ?? '';
      return component.startsWith('recherche / research');
    }

    console.log({selectedPerRequirement});

    const allSelected = Object.values(selectedPerRequirement).flat();
    const unique = [...new Set(allSelected)];

    // Separate out honours project selections: they **do** satisfy requirements but are not
    // scheduled like regular courses. We treat them as occupying a slot in the user's
    // requested course load, but we do not attempt to place them into time-based schedules.
    const honoursSelected = unique.filter((code) => isHonoursProject(code));
    const pinned = unique.filter(
      (code) => !isHonoursProject(code) && !!cacheVal.getSchedule(code),
    );

    const honoursCount = honoursSelected.length;
    const effectiveTarget = Math.max(0, coursesThisSemester - honoursCount);

    if (pinned.length > effectiveTarget) {
      set({
        generationError:
          'You selected more mandatory courses than your target per semester. Increase the target or deselect some courses.',
      });
      return;
    }

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

    const prereqEligibleSet = new Set(prereqEligibleCourses);
    const filters = {
      levels: levelBuckets,
      languageBuckets,
    };
    const remainingNeeded = effectiveTarget - pinned.length;
    let filteredOptionalPool: string[] = [];

    if (remainingNeeded > 0) {
      const allPools = buildRequirementPools(remainingRequirements);

      // Adjust pool credits to account for pinned courses that already satisfy them.
      const pools: RequirementPool[] = allPools
        .map((pool) => {
          let pinnedCredits = 0;
          for (const code of pinned) {
            if (!pool.candidateCourses.includes(code)) continue;
            const course = cacheVal.getCourse(code);
            pinnedCredits += course?.credits ?? 3;
          }
          const remainingCredits = Math.max(0, pool.creditsNeeded - pinnedCredits);
          return { ...pool, creditsNeeded: remainingCredits };
        })
        .filter((pool) => pool.creditsNeeded > 0);

      const coursesPerPool = computeCoursesPerPool(pools, remainingNeeded, cacheVal);

      const candidatesByRequirement = new Map<string, string[]>();
      for (const pool of pools) {
        const candidates: string[] = [];
        for (const code of pool.candidateCourses) {
          if (
            !cacheVal.getSchedule(code) ||
            pinned.includes(code) ||
            !prereqEligibleSet.has(code) ||
            !courseMatchesFilters(code, filters)
          ) {
            continue;
          }
          // For elective-style pools, also respect elective level buckets from the
          // requirements page (e.g., only 3000/4000-level electives).
          const isElectiveType =
            pool.type === 'elective' ||
            pool.type === 'free_elective' ||
            pool.type === 'non_discipline_elective' ||
            pool.type === 'faculty_elective' ||
            pool.type === 'discipline_elective';
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
          // Exclude honours/research courses from automatic scheduling; they are
          // handled separately as honours selections.
          if (isHonoursProject(code)) continue;
          candidates.push(code);
        }
        if (candidates.length > 0) {
          shuffleInPlace(candidates);
          candidatesByRequirement.set(pool.requirementId, candidates);
        }
      }

      const chosenCodes = new Set<string>();

      for (const pool of pools) {
        let need = coursesPerPool.get(pool.requirementId) ?? 0;
        if (need <= 0) continue;
        const candidates = candidatesByRequirement.get(pool.requirementId) ?? [];
        if (candidates.length === 0) continue;

        for (const code of candidates) {
          if (chosenCodes.size >= remainingNeeded) break;
          if (chosenCodes.has(code)) continue;
          if (pinned.includes(code)) continue;
          chosenCodes.add(code);
          need -= 1;
          if (need <= 0) break;
        }
      }

      // Debug logging for pool-based selection before we flatten to a single list.
      // eslint-disable-next-line no-console
      console.log('generateSchedules pools snapshot', {
        remainingNeeded,
        pools: pools.map((p) => ({
          requirementId: p.requirementId,
          type: p.type,
          label: p.label,
          creditsNeeded: p.creditsNeeded,
          minCourses: p.minCourses,
        })),
        coursesPerPool: Array.from(coursesPerPool.entries()),
        candidatesByRequirementSizes: Array.from(candidatesByRequirement.entries()).map(
          ([reqId, codes]) => ({
            requirementId: reqId,
            candidateCount: codes.length,
          }),
        ),
        chosenCodes: Array.from(chosenCodes),
        pinned,
        levelBuckets,
        languageBuckets,
        electiveLevelBuckets,
      });

      filteredOptionalPool = Array.from(chosenCodes)
        .filter((code) => !isHonoursProject(code))
        .filter((code) => !pinned.includes(code));
    }

    if (remainingNeeded <= 0) {
      filteredOptionalPool = [];
    }

    shuffleInPlace(filteredOptionalPool);

    // If we cannot even assemble enough eligible courses to hit the target
    // count (including pinned), surface a clear error instead of silently
    // generating partial schedules.
    if (filteredOptionalPool.length + pinned.length < effectiveTarget) {
      const swapPool = [...new Set([...pinned, ...filteredOptionalPool])];
      set({
        generatedSchedules: [],
        swapPool,
        selectedScheduleIndex: 0,
        generationError:
          'Not enough eligible courses match your filters and requirements to build a full schedule. Try relaxing filters or changing selections.',
      });
      return;
    }

    const swapPool = [...new Set([...pinned, ...filteredOptionalPool])];

    // Debugging: inspect schedule generation inputs
    // eslint-disable-next-line no-console
    console.log('generateSchedules input', {
      selectedPerRequirement,
      uniqueSelected: unique,
      pinned,
      honoursSelected,
      remainingRequirements,
      remainingNeeded,
      candidateCount: filteredOptionalPool.length,
       requirementMeta: remainingRequirements.map((r) => ({
         requirementId: r.requirementId,
         type: r.type,
         title: r.title,
         creditsNeeded: r.creditsNeeded,
         candidateCount: r.candidateCourses.length,
       })),
      coursesThisSemester,
      effectiveTarget,
    });

    const schedules =
      pinned.length === 0
        ? genSchedules(filteredOptionalPool, effectiveTarget, cacheVal)
        : generateSchedulesWithPinned(pinned, filteredOptionalPool, effectiveTarget, cacheVal);

    const limitedSchedules = schedules.slice(0, 10);

    set({
      generatedSchedules: limitedSchedules,
      swapPool,
      selectedScheduleIndex: 0,
      generationError:
        limitedSchedules.length === 0
          ? 'No non-overlapping schedules could be generated with your selections.'
          : null,
    });
  },

  setSelectedScheduleIndex: (idx) => set({ selectedScheduleIndex: idx }),

  swapCourseInSchedule: (scheduleIndex, enrollmentIndex, newCourseCode) => {
    const { generatedSchedules, cache } = get();
    if (!cache || scheduleIndex >= generatedSchedules.length) return;

    const schedule = generatedSchedules[scheduleIndex];
    const oldEnrollment = schedule.enrollments[enrollmentIndex];
    if (!oldEnrollment) return;

    const newSchedule = cache.getSchedule(newCourseCode);
    if (!newSchedule) return;

    const combos = getValidSectionCombos(newSchedule);
    const others = schedule.enrollments.filter((_, i) => i !== enrollmentIndex);

    for (const combo of combos) {
      const candidate = getEnrollmentsForCourse(newSchedule, combo);
      const conflicts = others.some((e) => enrollmentsOverlap(e, candidate));
      if (!conflicts) {
        const newEnrollments = [...schedule.enrollments];
        newEnrollments[enrollmentIndex] = candidate;
        const newSchedules = [...generatedSchedules];
        newSchedules[scheduleIndex] = { enrollments: newEnrollments };
        set({ generatedSchedules: newSchedules });
        return;
      }
    }
  },

  getSwapCandidates: (scheduleIndex, enrollmentIndex) => {
    const {
      cache,
      generatedSchedules,
      completedCourses,
      prereqEligibleCourses,
      filteredPrereqEligibleCourses,
      levelBuckets,
      languageBuckets,
      electiveLevelBuckets,
    } = get();
    if (!cache || scheduleIndex >= generatedSchedules.length) return [];

    const cacheVal = cache;
    const schedule = generatedSchedules[scheduleIndex];
    const enrollment = schedule.enrollments[enrollmentIndex];
    if (!enrollment) return [];

    const oldCode = enrollment.courseCode;
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
    const candidateSet = new Set<string>(filteredPrereqEligibleCourses);

    function getValidEnrollmentsFor(code: string): CourseEnrollment[] {
      const cached = validEnrollmentsByCourseCode.get(code);
      if (cached) return cached;
      const sched = cacheVal.getSchedule(code);
      if (!sched) {
        validEnrollmentsByCourseCode.set(code, []);
        return [];
      }
      const combos = getValidSectionCombos(sched);
      const enrollments = combos.map((combo) => getEnrollmentsForCourse(sched, combo));
      validEnrollmentsByCourseCode.set(code, enrollments);
      return enrollments;
    }

    const filters = { levels: levelBuckets, languageBuckets };

    const candidates: string[] = [];
    for (const code of candidateSet) {
      if (!prereqEligibleSet.has(code)) continue;
      if (code === oldCode) continue;
      if (completedCourses.includes(code)) continue;
      if (alreadyInSchedule.has(code)) continue;
      if (isHonoursProject(code)) continue;
      if (!courseMatchesFilters(code, filters)) continue;
      if (electiveLevelBuckets.length > 0) {
        const match = code.match(/\d{4}/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!Number.isNaN(num)) {
            const bucket = Math.floor(num / 1000) * 1000;
            if (!electiveLevelBuckets.includes(bucket)) continue;
          }
        }
      }
      const possibleEnrollments = getValidEnrollmentsFor(code);
      if (possibleEnrollments.length === 0) continue;
      for (const candidate of possibleEnrollments) {
        const conflicts = others.some((e) => enrollmentsOverlap(e, candidate));
        if (!conflicts) {
          candidates.push(code);
          break;
        }
      }
    }
    return candidates;
  },
}));
