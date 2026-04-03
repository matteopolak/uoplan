import type { Catalogue, Course, Program, SchedulesData } from 'schemas'
import type { RemainingRequirement, RequirementWithStatus, CompletedRequirementItem } from "schedule";
import type { GeneratedSchedule } from "schedule";
import type { DayOfWeek } from 'schemas'
import type { DataCache } from "schedule";
import type { CourseLanguageBucket, CourseLevelBucket } from "schedule";
import type { Indices } from 'schemas'
import type { Term } from 'schemas'
import type { ProfessorRatingsMap } from "schedule";
import type { DecodedState } from "schedule";
import type { TimetableFailureDiagnostics } from "schedule";

export interface GenerationErrorDetails {
  emptyPools: Array<{ label: string; requirementId?: string }>;
  totalAvailable: number;
  totalNeeded: number;
  timetableFailure?: TimetableFailureDiagnostics;
}

/** Primary message plus optional structured context for the expandable Details panel. */
export type GenerationErrorState = {
  message: string;
  details: GenerationErrorDetails | null;
};

export interface AppState {
  wizardMode: "basic" | "advanced" | null;
  basicPinnedCourses: string[];
  basicElectivesCount: number;
  basicExcludedCategories: string[];

  catalogue: Catalogue | null;
  indices: Indices | null;
  schedulesData: SchedulesData | null;
  cache: DataCache | null;
  loading: boolean;
  error: string | null;

  terms: Term[] | null;
  selectedTermId: string | null;

  availableYears: number[];
  firstYear: number | null;
  yearCataloguePrograms: Program[] | null;
  yearCatalogueCourses: Course[] | null;
  yearCatalogueLoading: boolean;

  program: Program | null;
  studentPrograms: string[];
  completedCourses: string[];
  remainingRequirements: RemainingRequirement[];
  requirementTreeWithStatus: RequirementWithStatus[];
  completedRequirementsList: CompletedRequirementItem[];
  selectedPerRequirement: Record<string, string[]>;
  /** Requirement ids the user explicitly set via Assign (not auto-filled). */
  requirementSlotsUserTouched: Record<string, true>;
  selectedOptionsPerRequirement: Record<string, number>;
  constrainedPerRequirement: Record<string, string[]>;
  coursesThisSemester: number;
  prereqEligibleCourses: string[];
  filteredPrereqEligibleCourses: string[];
  levelBuckets: CourseLevelBucket[];
  languageBuckets: CourseLanguageBucket[];
  electiveLevelBuckets: number[];
  generatedSchedules: GeneratedSchedule[];
  swapPool: string[];
  chosenCourseToRequirementId: Record<string, string>;
  schedulePoolMaps: Record<string, string>[];
  /** Per-schedule map of courseCode → colorIndex (0–7). */
  scheduleColorMaps: Record<string, number>[];
  selectedScheduleIndex: number;
  generationError: GenerationErrorState | null;
  unassignedCompletedCourses: string[];
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
  generationSeed: number;
  includeClosedComponents: boolean;
  /** When true, only virtual meeting times are kept per section for scheduling. */
  virtualSectionsOnly: boolean;
  generationLimitFirstYearCredits: boolean;
  generationCompressedSchedule: boolean;
}

export interface AppActions {
  setWizardMode: (mode: "basic" | "advanced" | null) => void;
  setBasicPinnedCourses: (courses: string[]) => void;
  setBasicElectivesCount: (count: number) => void;
  setBasicExcludedCategories: (categories: string[]) => void;
  generateBasicSchedules: (options?: { appendFirstOnly?: boolean }) => Promise<void>;
  
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
  setConstrainedForRequirement: (requirementId: string, courses: string[]) => void;
  setSelectedOptionForRequirement: (
    requirementId: string,
    optionIndex: number,
  ) => void;
  clearSelectedOptionForRequirement: (requirementId: string) => void;
  setCoursesThisSemester: (n: number) => void;
  setGenerationMinStartMinutes: (minutes: number) => void;
  setGenerationMaxEndMinutes: (minutes: number) => void;
  setGenerationAllowedDays: (days: DayOfWeek[]) => void;
  setGenerationMinProfessorRating: (rating: number | null) => void;
  setIncludeClosedComponents: (value: boolean) => void;
  setVirtualSectionsOnly: (value: boolean) => void;
  generateSchedules: (options?: { appendFirstOnly?: boolean }) => Promise<void>;
  clearGeneratedSchedules: () => void;
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
  setGenerationLimitFirstYearCredits: (v: boolean) => void;
  setGenerationCompressedSchedule: (v: boolean) => void;
  resetToDefault: () => void;
}

export type AppStore = AppState & AppActions;
