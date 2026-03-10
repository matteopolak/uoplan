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
  coursesThisSemester: number;
  generatedSchedules: GeneratedSchedule[];
  selectedScheduleIndex: number;
}

export interface AppActions {
  loadData: () => Promise<void>;
  setProgram: (program: Program | null) => void;
  setCompletedCourses: (courses: string[]) => void;
  addCompletedCourse: (code: string) => void;
  removeCompletedCourse: (code: string) => void;
  setSelectedForRequirement: (requirementId: string, courses: string[]) => void;
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
  coursesThisSemester: 4,
  generatedSchedules: [],
  selectedScheduleIndex: 0,

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
      });
    } else {
      set({
        remainingRequirements: [],
        requirementTreeWithStatus: [],
        completedRequirementsList: [],
        selectedPerRequirement: {},
      });
    }
  },

  setCompletedCourses: (courses) => {
    set({ completedCourses: courses });
    const { program, cache, selectedPerRequirement } = get();
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

  setCoursesThisSemester: (n) => set({ coursesThisSemester: n }),

  generateSchedules: () => {
    const { cache, remainingRequirements, selectedPerRequirement, coursesThisSemester } = get();
    if (!cache) return;

    function isHonoursProject(code: string): boolean {
      const course = cache.getCourse(code);
      const component = course?.component?.trim().toLowerCase() ?? '';
      return component.startsWith('recherche / research');
    }

    const allSelected = Object.values(selectedPerRequirement).flat();
    const unique = [...new Set(allSelected)];

    let coursePool = unique;
    if (unique.length < coursesThisSemester) {
      const extra = remainingRequirements.flatMap((r) => r.candidateCourses);
      for (const code of extra) {
        if (coursePool.length >= coursesThisSemester) break;
        if (!coursePool.includes(code) && cache.getSchedule(code)) {
          coursePool = [...coursePool, code];
        }
      }
    }

    const filteredCoursePool = coursePool.filter((code) => !isHonoursProject(code));

    // Debugging: inspect schedule generation inputs
    // eslint-disable-next-line no-console
    console.log('generateSchedules input', {
      selectedPerRequirement,
      uniqueSelected: unique,
      coursePool,
      filteredCoursePool,
      coursesThisSemester,
    });

    const schedules = genSchedules(filteredCoursePool, coursesThisSemester, cache);

    set({
      generatedSchedules: schedules,
      selectedScheduleIndex: 0,
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
