import { create } from 'zustand';
import type { Program } from '../schemas/catalogue';
import type {
  RemainingRequirement,
  RequirementWithStatus,
  CompletedRequirementItem,
} from '../lib/requirements';
import { computeRequirementsState } from '../lib/requirements';

function getAutoSelectedForRequirements(
  remaining: RemainingRequirement[],
  existing: Record<string, string[]>
): Record<string, string[]> {
  const candidateSetByReq = new Map<string, Set<string>>();
  for (const req of remaining) {
    candidateSetByReq.set(req.requirementId, new Set(req.candidateCourses));
  }
  const out: Record<string, string[]> = {};
  for (const req of remaining) {
    const candidateSet = candidateSetByReq.get(req.requirementId)!;
    if (req.candidateCourses.length === 1) {
      out[req.requirementId] = [req.candidateCourses[0]];
    } else {
      const prev = existing[req.requirementId] ?? [];
      const valid = prev.filter((c) => candidateSet.has(c));
      if (valid.length) out[req.requirementId] = valid;
    }
  }
  return out;
}
import {
  generateSchedules as genSchedules,
  generateSchedulesWithPinned,
  getValidSectionCombos,
  getEnrollmentsForCourse,
  enrollmentsOverlap,
  type GeneratedSchedule,
} from '../lib/scheduleGenerator';
import type { DataCache } from '../lib/dataCache';

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
  generatedSchedules: GeneratedSchedule[];
  selectedScheduleIndex: number;
  generationError: string | null;
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
  generatedSchedules: [],
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
    const { cache, completedCourses } = get();
    if (program && cache) {
      const { remaining, tree, completedList } = computeRequirementsState(
        program,
        completedCourses,
        cache
      );
      const autoSelected = getAutoSelectedForRequirements(remaining, {});
      set({
        remainingRequirements: remaining,
        requirementTreeWithStatus: tree,
        completedRequirementsList: completedList,
        selectedPerRequirement: autoSelected,
        selectedOptionsPerRequirement: {},
      });
    } else {
      set({
        remainingRequirements: [],
        requirementTreeWithStatus: [],
        completedRequirementsList: [],
        selectedPerRequirement: {},
        selectedOptionsPerRequirement: {},
      });
    }
  },

  setCompletedCourses: (courses) => {
    set({ completedCourses: courses });
    const { program, cache, selectedPerRequirement, selectedOptionsPerRequirement } = get();
    if (program && cache) {
      const { remaining, tree, completedList } = computeRequirementsState(
        program,
        courses,
        cache
      );
      const autoSelected = getAutoSelectedForRequirements(remaining, selectedPerRequirement);
      set({
        remainingRequirements: remaining,
        requirementTreeWithStatus: tree,
        completedRequirementsList: completedList,
        selectedPerRequirement: autoSelected,
        selectedOptionsPerRequirement,
      });
    }
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
    } = get();
    if (!cache) return;

    function isHonoursProject(code: string): boolean {
      const course = cache.getCourse(code);
      const component = course?.component?.trim().toLowerCase() ?? '';
      return component.startsWith('recherche / research');
    }

    const allSelected = Object.values(selectedPerRequirement).flat();
    const unique = [...new Set(allSelected)];
    const pinned = unique.filter((code) => !isHonoursProject(code));

    if (pinned.length > coursesThisSemester) {
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

    function helpsRequirements(code: string): boolean {
      if (!program) return false;
      const base = completedCourses;
      const before = computeRequirementsState(program, base, cache).remaining;
      const beforeCredits = before.reduce(
        (sum, r) => sum + (r.creditsNeeded ?? 0),
        0
      );
      const after = computeRequirementsState(program, [...base, code], cache).remaining;
      const afterCredits = after.reduce(
        (sum, r) => sum + (r.creditsNeeded ?? 0),
        0
      );
      return afterCredits < beforeCredits;
    }

    const remainingById = new Map<string, RemainingRequirement>();
    for (const r of remainingRequirements) {
      remainingById.set(r.requirementId, r);
    }

    const optionalPool: string[] = [];
    const remainingNeeded = coursesThisSemester - pinned.length;
    if (remainingNeeded > 0) {
      for (const req of remainingRequirements) {
        const selectedOpt = selectedOptionsPerRequirement[req.requirementId];
        const candidates = req.candidateCourses;
        for (const code of candidates) {
          if (
            optionalPool.length >= remainingNeeded * 4
            || pinned.includes(code)
            || optionalPool.includes(code)
            || isHonoursProject(code)
            || !cache.getSchedule(code)
          ) {
            continue;
          }
          if (!helpsRequirements(code)) continue;
          optionalPool.push(code);
        }
      }

      if (optionalPool.length < remainingNeeded) {
        for (const course of cache.getAllCourses()) {
          const code = course.code;
          if (
            optionalPool.length >= remainingNeeded * 6
            || pinned.includes(code)
            || optionalPool.includes(code)
            || isHonoursProject(code)
            || !cache.getSchedule(code)
          ) {
            continue;
          }
          if (!helpsRequirements(code)) continue;
          optionalPool.push(code);
        }
      }
    }

    const filteredOptionalPool = optionalPool.filter((code) => !isHonoursProject(code));

    // Debugging: inspect schedule generation inputs
    // eslint-disable-next-line no-console
    console.log('generateSchedules input', {
      selectedPerRequirement,
      uniqueSelected: unique,
      pinned,
      optionalPool,
      filteredOptionalPool,
      coursesThisSemester,
    });

    const schedules =
      pinned.length === 0
        ? genSchedules(filteredOptionalPool, coursesThisSemester, cache)
        : generateSchedulesWithPinned(pinned, filteredOptionalPool, coursesThisSemester, cache);

    set({
      generatedSchedules: schedules,
      selectedScheduleIndex: 0,
      generationError: schedules.length === 0 ? 'No non-overlapping schedules could be generated with your selections.' : null,
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
}));
