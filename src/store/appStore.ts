import { create } from "zustand";
import { type Program, CatalogueSchema } from "../schemas/catalogue";
import type {
  RemainingRequirement,
  RequirementWithStatus,
  CompletedRequirementItem,
} from "../lib/requirements";
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
} from "../lib/scheduleGenerator";
import { type DayOfWeek, SchedulesDataSchema } from "../schemas/schedules";
import {
  buildDataCache,
  normalizeCourseCode,
  type DataCache,
} from "../lib/dataCache";
import {
  getEffectiveSchedule,
  cacheWithClosedFilter,
} from "../lib/scheduleFilters";
import {
  courseMatchesFilters,
  type CourseLanguageBucket,
  type CourseLevelBucket,
} from "../lib/courseFilters";
import { type Indices, IndicesSchema } from "../schemas/indices";
import {
  decodeState,
  decodeStateFromBase64,
  encodeState,
  encodeStateToBase64,
  parseStateFromUrl,
  requirementIdsFromTree,
  stateToShareUrl,
  type DecodedState,
  type EncodeInput,
} from "../lib/stateEncode";
import { type Term, TermsDataSchema } from "../schemas/terms";
import { createSeededRng, generateRandomSeed } from "../lib/seededRandom";
import {
  buildProfessorRatingsMap,
  type ProfessorRatingsMap,
} from "../lib/professorRatings";
import {
  recomputeStateForProgram,
  getDisciplineCodesForProgram,
} from "./requirementCompute";
import {
  buildRequirementPools,
  computeCoursesPerPool,
  shuffleInPlace,
  type RequirementPool,
} from "./scheduleHelpers";

const validEnrollmentsByCourseCode = new Map<string, CourseEnrollment[]>();

const LOCAL_STORAGE_KEY = "uoplan-state";
const TERM_LOCAL_STORAGE_KEY = "uoplan-term";

export interface AppState {
  catalogue: { courses: unknown[]; programs: Program[] } | null;
  indices: Indices | null;
  schedulesData: { termId: string; schedules: unknown[] } | null;
  cache: DataCache | null;
  loading: boolean;
  error: string | null;

  terms: Term[] | null;
  selectedTermId: string | null;

  availableYears: number[];
  firstYear: number | null;
  yearCataloguePrograms: Program[] | null;
  yearCatalogueLoading: boolean;

  program: Program | null;
  studentPrograms: string[];
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
  /** Stack of swaps for undo (most recent at end). Each entry: schedule index, enrollment index, previous course code. */
  swapHistory: Array<{
    scheduleIndex: number;
    enrollmentIndex: number;
    previousCourseCode: string;
  }>;
  generationMinStartMinutes: number;
  generationMaxEndMinutes: number;
  generationAllowedDays: DayOfWeek[];
  generationMinProfessorRating: number | null;
  professorRatings: ProfessorRatingsMap | null;
  /** Seed used for deterministic randomization during schedule generation and shuffling. */
  generationSeed: number;
  /** When false, exclude component sections with status "Closed" from dropdowns, generation, and swap. */
  includeClosedComponents: boolean;
  /** If true, enforce the 48-credit cap on 1000-level courses in generated schedules. */
  generationLimitFirstYearCredits: boolean;
  /** If true, generated schedules must have at most one gap per day, ≤ 90 minutes. */
  generationCompressedSchedule: boolean;

  setGenerationMinProfessorRating: (rating: number | null) => void;
  setGenerationLimitFirstYearCredits: (v: boolean) => void;
  setGenerationCompressedSchedule: (v: boolean) => void;
}

export interface AppActions {
  loadData: () => Promise<void>;
  setSelectedTermId: (termId: string) => Promise<void>;
  setFirstYear: (year: number | null) => Promise<void>;
  loadEncodedState: (decoded: DecodedState) => void;
  getShareUrl: () => string | null;
  getEncodedStateBase64: () => string | null;
  setProgram: (program: Program | null) => void;
  setStudentPrograms: (programs: string[]) => void;
  setCompletedCourses: (courses: string[]) => void;
  addCompletedCourse: (code: string) => void;
  removeCompletedCourse: (code: string) => void;
  setSelectedForRequirement: (requirementId: string, courses: string[]) => void;
  setSelectedOptionForRequirement: (
    requirementId: string,
    optionIndex: number,
  ) => void;
  setCoursesThisSemester: (n: number) => void;
  setGenerationMinStartMinutes: (minutes: number) => void;
  setGenerationMaxEndMinutes: (minutes: number) => void;
  setGenerationAllowedDays: (days: DayOfWeek[]) => void;
  setGenerationMinProfessorRating: (rating: number | null) => void;
  setIncludeClosedComponents: (value: boolean) => void;
  generateSchedules: (options?: { appendFirstOnly?: boolean }) => Promise<void>;
  setSelectedScheduleIndex: (idx: number) => void;
  swapCourseInSchedule: (
    scheduleIndex: number,
    enrollmentIndex: number,
    newCourseCode: string,
    isUndo?: boolean,
  ) => void;
  undoLastSwap: () => void;
  getSwapCandidates: (
    scheduleIndex: number,
    enrollmentIndex: number,
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

  availableYears: [],
  firstYear: null,
  yearCataloguePrograms: null,
  yearCatalogueLoading: false,

  program: null,
  studentPrograms: [],
  completedCourses: [],
  remainingRequirements: [],
  requirementTreeWithStatus: [],
  completedRequirementsList: [],
  selectedPerRequirement: {},
  selectedOptionsPerRequirement: {},
  coursesThisSemester: 5,
  prereqEligibleCourses: [],
  filteredPrereqEligibleCourses: [],
  levelBuckets: ["undergrad"],
  languageBuckets: ["en", "other"],
  electiveLevelBuckets: [1000, 2000],
  generatedSchedules: [],
  swapPool: [],
  chosenCourseToRequirementId: {},
  schedulePoolMaps: [],
  selectedScheduleIndex: 0,
  generationError: null,
  unassignedCompletedCourses: [],
  swapHistory: [],
  generationMinStartMinutes: 8 * 60 + 30, // 8:30
  generationMaxEndMinutes: 22 * 60, // 22:00
  generationAllowedDays: ["Mo", "Tu", "We", "Th", "Fr"],
  generationSeed: generateRandomSeed(),
  includeClosedComponents: false,
  generationMinProfessorRating: null,
  professorRatings: null,
  generationLimitFirstYearCredits: true,
  generationCompressedSchedule: false,

  setIncludeClosedComponents: (value) => {
    validEnrollmentsByCourseCode.clear();
    set({ includeClosedComponents: value });
  },

  setGenerationMinStartMinutes: (minutes) =>
    set({ generationMinStartMinutes: minutes }),
  setGenerationMaxEndMinutes: (minutes) =>
    set({ generationMaxEndMinutes: minutes }),
  setGenerationAllowedDays: (days) => set({ generationAllowedDays: days }),
  setGenerationMinProfessorRating: (rating) =>
    set({
      generationMinProfessorRating: rating == null ? null : Number(rating),
    }),
  setGenerationLimitFirstYearCredits: (v) =>
    set({ generationLimitFirstYearCredits: v }),
  setGenerationCompressedSchedule: (v) =>
    set({ generationCompressedSchedule: v }),

  setSelectedTermId: async (termId: string) => {
    set({ loading: true, error: null });
    try {
      const { catalogue } = get();
      if (!catalogue) throw new Error("Catalogue not loaded");

      const schedulesRes = await fetch(`/data/schedules.${termId}.json`);
      if (!schedulesRes.ok) throw new Error("Failed to load schedules data");
      const schedulesData = await schedulesRes.json();

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
        s.includeClosedComponents,
        s.studentPrograms,
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

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(TERM_LOCAL_STORAGE_KEY, termId);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load data",
      });
    }
  },

  loadEncodedState: (decoded) => {
    const { catalogue, indices, cache } = get();
    if (!catalogue || !cache || !indices) return;

    const studentPrograms = decoded.studentPrograms;
    const firstPass = recomputeStateForProgram(
      decoded.program,
      decoded.completedCourseCodes,
      cache,
      {},
      {},
      decoded.levelBuckets,
      decoded.languageBuckets,
      decoded.includeClosedComponents ?? true,
      studentPrograms,
    );
    const orderedReqIds = requirementIdsFromTree(
      firstPass.requirementTreeWithStatus,
    );
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
      decoded.includeClosedComponents ?? true,
      studentPrograms,
    );

    set({
      program: decoded.program,
      studentPrograms,
      completedCourses: decoded.completedCourseCodes,
      levelBuckets: decoded.levelBuckets,
      languageBuckets: decoded.languageBuckets,
      electiveLevelBuckets: decoded.electiveLevelBuckets,
      coursesThisSemester: decoded.coursesThisSemester,
      selectedScheduleIndex: Math.max(0, decoded.selectedScheduleIndex),
      generationSeed: decoded.generationSeed >>> 0,
      includeClosedComponents: decoded.includeClosedComponents ?? false,
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
      includeClosedComponents: s.includeClosedComponents,
      studentPrograms: s.studentPrograms,
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
      includeClosedComponents: s.includeClosedComponents,
      studentPrograms: s.studentPrograms,
    };
    const bytes = encodeState(
      input,
      s.catalogue as { courses: Array<{ code: string }>; programs: Program[] },
      s.indices,
    );
    if (!bytes) return null;
    return stateToShareUrl(bytes, undefined, s.selectedTermId ?? undefined);
  },

  setFirstYear: async (year) => {
    const { catalogue } = get();
    set({ firstYear: year, yearCatalogueLoading: true });
    try {
      if (year === null) {
        // Use the current year's programs (already loaded as the main catalogue)
        set({ yearCataloguePrograms: null, yearCatalogueLoading: false });
      } else {
        const res = await fetch(`/data/catalogue.${year}.json`);
        if (!res.ok) throw new Error(`Failed to load catalogue.${year}.json`);
        const json = await res.json();
        const parsed = CatalogueSchema.parse(json);
        set({ yearCataloguePrograms: parsed.programs, yearCatalogueLoading: false });
      }
    } catch (err) {
      set({ yearCatalogueLoading: false });
      console.error("Failed to load year catalogue:", err);
    }
    // Clear program selection since requirements differ between years
    get().setProgram(null);
  },

  loadData: async () => {
    set({ loading: true, error: null });
    try {
      const [manifestRes, termsRes, indicesRes, rmpRes] = await Promise.all([
        fetch("/data/catalogue.json"),
        fetch("/data/terms.json"),
        fetch("/data/indices.json").catch(() => null),
        fetch("/data/ratemyprofessors.json").catch(() => null),
      ]);
      if (!manifestRes.ok || !termsRes.ok)
        throw new Error("Failed to load data");

      const manifestJson = await manifestRes.json();
      const availableYears: number[] = Array.isArray(manifestJson.years) ? manifestJson.years : [];
      const latestYear = availableYears[0];
      if (!latestYear) throw new Error("Catalogue manifest has no years");

      const catalogueRes = await fetch(`/data/catalogue.${latestYear}.json`);
      if (!catalogueRes.ok) throw new Error(`Failed to load catalogue.${latestYear}.json`);
      const catalogue = await catalogueRes.json();
      const termsJson = await termsRes.json();

      const parsedCatalogue = CatalogueSchema.parse(catalogue);
      const parsedTerms = TermsDataSchema.parse(termsJson);

      let professorRatings: ProfessorRatingsMap | null = null;
      if (rmpRes?.ok) {
        try {
          const rmpJson = await rmpRes.json();
          professorRatings = buildProfessorRatingsMap(rmpJson);
        } catch {
          professorRatings = null;
        }
      }

      let indices: Indices | null = null;
      if (indicesRes?.ok) {
        const indicesJson = await indicesRes.json();
        indices = IndicesSchema.parse(indicesJson);
      } else {
        indices = {
          courses: (parsedCatalogue.courses as Array<{ code: string }>).map(
            (c) => c.code,
          ),
          programs: parsedCatalogue.programs.map((p) => p.url),
        };
      }

      let initialTermId: string | null = null;
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const urlTerm = params.get("t");
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
      if (!initialTermId) throw new Error("No terms available");

      const schedulesRes = await fetch(`/data/schedules.${initialTermId}.json`);
      if (!schedulesRes.ok) throw new Error("Failed to load schedules data");
      const schedulesData = await schedulesRes.json();
      const parsedSchedules = SchedulesDataSchema.parse(schedulesData);
      const cache = buildDataCache(parsedCatalogue, parsedSchedules);

      set({
        catalogue: parsedCatalogue,
        indices,
        schedulesData: parsedSchedules,
        cache,
        professorRatings,
        terms: parsedTerms.terms,
        selectedTermId: initialTermId,
        availableYears,
        loading: false,
        error: null,
      });

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(TERM_LOCAL_STORAGE_KEY, initialTermId);
        } catch {
          // ignore
        }
      }

      if (indices && typeof window !== "undefined") {
        const catalogueLike = parsedCatalogue as {
          courses: Array<{ code: string }>;
          programs: Program[];
        };
        const urlBytes = parseStateFromUrl(window.location.search);
        if (urlBytes && urlBytes.length > 0) {
          const decoded = decodeState(urlBytes, catalogueLike, indices);
          if ("error" in decoded) {
            set({ error: decoded.error });
          } else {
            get().loadEncodedState(decoded);
            const u = new URL(window.location.href);
            u.searchParams.delete("s");
            u.searchParams.delete("t");
            window.history.replaceState({}, "", u.toString());
          }
        } else {
          const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (stored) {
            const decoded = decodeStateFromBase64(
              stored,
              catalogueLike,
              indices,
            );
            if (!("error" in decoded)) get().loadEncodedState(decoded);
          }
        }
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load data",
      });
    }
  },

  setProgram: (program) => {
    const studentPrograms = getDisciplineCodesForProgram(program);
    set({ program, studentPrograms });
    const {
      cache,
      completedCourses,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
    } = get();
    const state = recomputeStateForProgram(
      program,
      completedCourses,
      cache,
      {},
      {},
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
    );
    set(state);
  },

  setStudentPrograms: (programs) => {
    set({ studentPrograms: programs });
    const {
      program,
      cache,
      completedCourses,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
    } = get();
    const state = recomputeStateForProgram(
      program,
      completedCourses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      programs,
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
      includeClosedComponents,
      studentPrograms,
    } = get();
    const state = recomputeStateForProgram(
      program,
      courses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
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
      includeClosedComponents,
      studentPrograms,
    } = get();
    const state = recomputeStateForProgram(
      program,
      completedCourses,
      cache,
      selectedPerRequirementNext,
      selectedOptionsPerRequirement,
      levelBuckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
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
      includeClosedComponents,
      studentPrograms,
    } = get();
    const state = recomputeStateForProgram(
      program,
      completedCourses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      buckets,
      languageBuckets,
      includeClosedComponents,
      studentPrograms,
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
      includeClosedComponents,
      studentPrograms,
    } = get();
    const state = recomputeStateForProgram(
      program,
      completedCourses,
      cache,
      selectedPerRequirement,
      selectedOptionsPerRequirement,
      levelBuckets,
      buckets,
      includeClosedComponents,
      studentPrograms,
    );
    set(state);
  },

  setElectiveLevelBuckets: (buckets) => {
    set({ electiveLevelBuckets: buckets });
  },

  resetToDefault: () => {
    const { catalogue, indices, schedulesData, cache, loading, error, availableYears } = get();
    set({
      catalogue,
      indices,
      schedulesData,
      cache,
      loading,
      error,
      availableYears,
      firstYear: null,
      yearCataloguePrograms: null,
      yearCatalogueLoading: false,
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
      levelBuckets: ["undergrad"],
      languageBuckets: ["en", "other"],
      electiveLevelBuckets: [1000, 2000],
      generatedSchedules: [],
      swapPool: [],
      chosenCourseToRequirementId: {},
      schedulePoolMaps: [],
      selectedScheduleIndex: 0,
      generationError: null,
      unassignedCompletedCourses: [],
      swapHistory: [],
      generationSeed: generateRandomSeed(),
      includeClosedComponents: false,
    });
    if (typeof window !== "undefined") {
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

  generateSchedules: async (options) => {
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
    } = get();
    if (!cache) return;
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
      set({
        generationError: `Assign all completed courses to requirements before generating schedules. Unassigned: ${preview.join(", ")}${suffix}`,
      });
      return;
    }

    // Deterministic randomness:
    // - Base seed comes from appState and is included in share links.
    // - When the user clicks "Generate new schedule" (appendFirstOnly), we salt the seed with
    //   the number of schedules already generated so each click yields a different schedule,
    //   while the whole sequence remains reproducible from the same starting state.
    const existingScheduleCount = appendFirstOnly
      ? get().generatedSchedules.length
      : 0;
    const rng = createSeededRng(
      ((generationSeed >>> 0) + existingScheduleCount) >>> 0,
    );

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

    function isHonoursProject(code: string): boolean {
      const course = cacheVal.getCourse(code);
      const component = course?.component?.trim().toLowerCase() ?? "";
      return component.startsWith("recherche / research");
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
        !!getEffectiveSchedule(cacheVal, code, includeClosedComponents) &&
        !completedSet.has(normalizeCourseCode(code)),
    );

    const honoursCount = honoursSelected.length;
    const effectiveTarget = Math.max(0, coursesThisSemester - honoursCount);
    const oversubscribedSelections =
      selectedSchedulable.length > effectiveTarget;
    const pinned = oversubscribedSelections ? [] : selectedSchedulable;

    // Enforce that all active or/options groups with a requirementId have exactly one selected option.
    // A group is "active" if it lies on the branch of options chosen in its ancestor option groups.
    const missingOptionGroups: string[] = [];

    function walkNodes(
      nodes: RequirementWithStatus[],
      parentRequirementId: string | undefined,
      parentSelectedIndex: number | undefined,
      parentChildIndex: number | undefined,
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
      set({
        generationError:
          "Please choose exactly one option in each “or” block before generating schedules.",
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
      // Exclude honours/research courses from automatic scheduling for most pools; they are
      // handled separately as honours selections. However, when the pool itself is a concrete
      // course requirement (type: 'course'), we keep the honours course so the requirement tree
      // can still reflect it properly.
      if (poolType !== "course" && isHonoursProject(code)) return false;
      // Exclude courses with no valid section combos (e.g. empty times) so they are never picked.
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

      // Adjust pool credits: subtract pinned (selected, not yet taken) and selected completed.
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

      // Exclude course/or_course pools that have no schedulable non-honours candidate
      // (e.g. CSI 4900). Those requirements are satisfied via honoursSelected and
      // must not consume a slot in the schedule.
      pools = pools.filter((pool) => {
        if (pool.type !== "course" && pool.type !== "or_course") return true;
        const hasSchedulableNonHonours = pool.candidateCourses.some((code) => {
          if (isHonoursProject(code)) return false;
          return !!getEffectiveSchedule(
            cacheVal,
            code,
            includeClosedComponents,
          );
        });
        return hasSchedulableNonHonours;
      });

      const coursesPerPool = computeCoursesPerPool(
        pools,
        remainingNeeded,
        cacheVal,
      );

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
          // For elective-style pools, also respect elective level buckets from the
          // requirements page (e.g., only 3000/4000-level electives).
          // NOTE: discipline_elective (like \"CSI 4000-level\") is NOT treated as a
          // generic elective for this purpose – it follows its own discipline rules.
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
          // Exclude honours/research courses from automatic scheduling for most pools;
          // they are handled separately as honours selections. However, when the pool
          // itself is a concrete course requirement (type: 'course'), we keep the
          // honours course so the requirement tree can still reflect it properly.
          if (pool.type !== "course" && isHonoursProject(code)) continue;
          // Exclude courses with no valid section combos (e.g. empty times) so they
          // are never picked and never produce a schedule with fewer real courses.
          if (getValidSectionCombos(sched, constraints).length === 0) continue;
          candidates.push(code);
        }
        if (candidates.length > 0) {
          candidatesByRequirement.set(pool.requirementId, candidates);
        }
      }

      const maxAttempts = appendFirstOnly ? 100 : 300;
      const targetUniqueSchedules = appendFirstOnly ? 1 : 5;
      const seenCourseSets = new Set<string>();
      const collectedSchedules: GeneratedSchedule[] = [];
      const collectedPoolMaps: Record<string, string>[] = [];
      let lastFilteredPool: string[] = [];

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (collectedSchedules.length >= targetUniqueSchedules) break;
        if (attempt > 0 && attempt % 5 === 0) await yieldToMain();

        // Shuffle each pool's candidates so we try different course combinations.
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

    // If we could not assemble enough eligible courses to hit the target, surface error.
    if (filteredOptionalPool.length + pinned.length < effectiveTarget) {
      if (appendFirstOnly) {
        set({
          generationError:
            "Not enough eligible courses to generate another schedule. Try relaxing filters or changing selections.",
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
        swapHistory: [],
        generationError:
          "Not enough eligible courses match your filters and requirements to build a full schedule. Try relaxing filters or changing selections.",
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
        swapHistory: [],
        generationError: null,
      });
      return;
    }

    if (appendFirstOnly && limitedSchedules.length === 0) {
      set({
        generationError:
          "Could not generate another schedule after 100 attempts. Try different selections or filters.",
      });
      return;
    }

    set({
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
    });
  },

  setSelectedScheduleIndex: (idx) => set({ selectedScheduleIndex: idx }),

  swapCourseInSchedule: (
    scheduleIndex,
    enrollmentIndex,
    newCourseCode,
    isUndo = false,
  ) => {
    const {
      generatedSchedules,
      cache,
      chosenCourseToRequirementId,
      schedulePoolMaps,
      generationMinStartMinutes,
      generationMaxEndMinutes,
      generationAllowedDays,
      generationMinProfessorRating,
      professorRatings,
      includeClosedComponents,
    } = get();
    if (!cache || scheduleIndex >= generatedSchedules.length) return;

    const schedule = generatedSchedules[scheduleIndex];
    const oldEnrollment = schedule.enrollments[enrollmentIndex];
    if (!oldEnrollment) return;

    const newSchedule = getEffectiveSchedule(
      cache,
      newCourseCode,
      includeClosedComponents,
    );
    if (!newSchedule) return;

    const constraints: GenerationConstraints = {
      minStartMinutes: generationMinStartMinutes,
      maxEndMinutes: generationMaxEndMinutes,
      allowedDays: generationAllowedDays,
      minProfessorRating: generationMinProfessorRating ?? undefined,
      professorRatings: professorRatings ?? undefined,
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
        const poolMap =
          schedulePoolMaps[scheduleIndex] ?? chosenCourseToRequirementId;
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
          ...(isUndo
            ? {}
            : {
                swapHistory: [
                  ...get().swapHistory,
                  {
                    scheduleIndex,
                    enrollmentIndex,
                    previousCourseCode: oldCode,
                  },
                ],
              }),
        });
        return;
      }
    }
  },

  undoLastSwap: () => {
    const { swapHistory } = get();
    if (swapHistory.length === 0) return;
    const last = swapHistory[swapHistory.length - 1];
    const { scheduleIndex, enrollmentIndex, previousCourseCode } = last;
    set({ swapHistory: swapHistory.slice(0, -1) });
    get().swapCourseInSchedule(
      scheduleIndex,
      enrollmentIndex,
      previousCourseCode,
      true,
    );
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
      generationMinProfessorRating,
      professorRatings,
      includeClosedComponents,
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
    const poolMap =
      schedulePoolMaps[scheduleIndex] ?? chosenCourseToRequirementId;
    const requirementId = poolMap[oldCode];
    const candidateSet = new Set<string>();
    let poolRequirementType: string | undefined;
    let requirementTitle: string | undefined;
    if (requirementId) {
      const req = remainingRequirements.find(
        (r) => r.requirementId === requirementId,
      );
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
        const hasOld = req.candidateCourses.some(
          (c) => normalizeCourseCode(c) === oldCodeNorm,
        );
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
      (e, i) => i !== enrollmentIndex && e.courseCode !== oldCode,
    );
    const alreadyInSchedule = new Set(
      schedule.enrollments.map((e) => e.courseCode),
    );

    function isHonoursProject(code: string): boolean {
      const course = cacheVal.getCourse(code);
      const component = course?.component?.trim().toLowerCase() ?? "";
      return component.startsWith("recherche / research");
    }

    const prereqEligibleSet = new Set(prereqEligibleCourses);
    const swapConstraints: GenerationConstraints = {
      minStartMinutes: generationMinStartMinutes,
      maxEndMinutes: generationMaxEndMinutes,
      allowedDays: generationAllowedDays,
      minProfessorRating: generationMinProfessorRating ?? undefined,
      professorRatings: professorRatings ?? undefined,
    };

    function getValidEnrollmentsFor(code: string): CourseEnrollment[] {
      const cacheKey = `${code}:${includeClosedComponents}`;
      const cached = validEnrollmentsByCourseCode.get(cacheKey);
      if (cached) return cached;
      const sched = getEffectiveSchedule(
        cacheVal,
        code,
        includeClosedComponents,
      );
      if (!sched) {
        validEnrollmentsByCourseCode.set(cacheKey, []);
        return [];
      }
      const combos = getValidSectionCombos(sched, swapConstraints);
      const enrollments = combos.map((combo) =>
        getEnrollmentsForCourse(sched, combo),
      );
      validEnrollmentsByCourseCode.set(cacheKey, enrollments);
      return enrollments;
    }

    const filters = { levels: levelBuckets, languageBuckets };

    const candidates: string[] = [];
    const rejectedWithConflict: Array<{ code: string; conflictsWith: string }> =
      [];
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
        poolRequirementType === "free_elective" ||
        poolRequirementType === "non_discipline_elective" ||
        poolRequirementType === "faculty_elective" ||
        poolRequirementType === "elective";
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
          rejectedWithConflict.push({
            code,
            conflictsWith: conflict.courseCode,
          });
        }
      }
    }
    const poolCourses = [...candidateSet];
    return { candidates, poolCourses, requirementTitle, rejectedWithConflict };
  },
}));
