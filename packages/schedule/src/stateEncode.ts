import type { Program, DayOfWeek as SchemaDayOfWeek } from 'schemas';
import type { CourseLevelBucket, CourseLanguageBucket } from './courseFilters';
import type { RemainingRequirement, RequirementWithStatus } from './requirements';
import type { Indices } from 'schemas';
import { isOptCourse, getCourseLevel } from './utils/courseUtils';
import type {
  DayOfWeek as ProtoDayOfWeek} from './proto/state';
import {
  ShareableState,
  WizardMode,
  CourseLevelBucket as ProtoLevel,
  CourseLanguageBucket as ProtoLang
} from './proto/state';

export function requirementIdsFromTree(nodes: RequirementWithStatus[]): string[] {
  const out: string[] = [];
  function walk(n: RequirementWithStatus[]) {
    for (const node of n) {
      if (node.requirementId) out.push(node.requirementId);
      if (node.options?.length) walk(node.options);
    }
  }
  walk(nodes);
  return out;
}

export function urlToSlug(url: string): string {
  return url
    .replace(/^https?:\/\/catalogue\.uottawa\.ca(?:\/archive\/\d{4}-\d{4})?\/en\//, '')
    .replace(/\/$/, '');
}

export const STATE_MAGIC = 0x554F504C; // "UOPL" in ASCII hex

function programSlug(p: Program): string {
  return (p as Program & { slug?: string }).slug ?? urlToSlug(p.url);
}

const OPT_SENTINEL_BASE = 0xFFFFFFF0; // Safely inside uint32 space

export interface EncodeInput {
  wizardMode: "basic" | "advanced" | null;
  basicPinnedCourses: string[];
  basicElectivesCount: number;
  basicExcludedCategories: string[];

  selectedTermId: string | null;
  firstYear: number | null;
  program: Program | null;
  minorProgram: Program | null;
  completedCourses: string[];
  levelBuckets: CourseLevelBucket[];
  languageBuckets: CourseLanguageBucket[];
  electiveLevelBuckets: number[];
  coursesThisSemester: number;
  firstSeed: number;
  currentSeed: number;
  swaps: Array<{ enrollmentIndex: number; courseCode: string }>;
  selectedPerRequirement: Record<string, string[]>;
  selectedOptionsPerRequirement: Record<string, number>;
  constrainedPerRequirement: Record<string, string[]>;
  requirementTreeWithStatus: RequirementWithStatus[];
  remainingRequirements: RemainingRequirement[];
  includeClosedComponents: boolean;
  virtualSectionsOnly: boolean;
  studentPrograms: string[];

  requirementSlotsUserTouched: Record<string, true>;
  generationMinStartMinutes: number;
  generationMaxEndMinutes: number;
  generationAllowedDays: SchemaDayOfWeek[];
  generationMinProfessorRating: number | null;
  generationLimitFirstYearCredits: boolean;
  generationCompressedSchedule: boolean;
  activeStep: number;
  showCalendar: boolean;
}

export interface DecodedState {
  wizardMode: "basic" | "advanced" | null;
  basicPinnedCourses: string[];
  basicElectivesCount: number;
  basicExcludedCategories: string[];

  selectedTermId: string | null;
  firstYear: number | null;
  program: Program | null;
  minorProgram: Program | null;
  completedCourseCodes: string[];
  levelBuckets: CourseLevelBucket[];
  languageBuckets: CourseLanguageBucket[];
  electiveLevelBuckets: number[];
  coursesThisSemester: number;
  firstSeed: number;
  currentSeed: number;
  swaps: Array<{ enrollmentIndex: number; courseCode: string }>;
  optionSelections: Array<{ reqIndex: number; optionIndex: number }>;
  courseSelections: Array<{ reqIndex: number; courseCodes: string[] }>;
  constrainedSelections: Array<{ reqIndex: number; courseCodes: string[] }>;
  includeClosedComponents: boolean;
  virtualSectionsOnly: boolean;
  studentPrograms: string[];

  touchedReqIndices: number[];
  generationMinStartMinutes: number;
  generationMaxEndMinutes: number;
  generationAllowedDays: SchemaDayOfWeek[];
  generationMinProfessorRating: number | null;
  generationLimitFirstYearCredits: boolean;
  generationCompressedSchedule: boolean;
  activeStep: number;
  showCalendar: boolean;
}

export interface CatalogueLike {
  courses: Array<{ code: string }>;
  programs: Program[];
}

// Helpers for mappings
function levelToProto(b: CourseLevelBucket): ProtoLevel {
  return b === 'undergrad' ? ProtoLevel.COURSE_LEVEL_UNDERGRAD : ProtoLevel.COURSE_LEVEL_GRAD;
}

function protoToLevel(b: ProtoLevel): CourseLevelBucket {
  return b === ProtoLevel.COURSE_LEVEL_UNDERGRAD ? 'undergrad' : 'grad';
}

function langToProto(b: CourseLanguageBucket): ProtoLang {
  if (b === 'en') return ProtoLang.COURSE_LANGUAGE_EN;
  if (b === 'fr') return ProtoLang.COURSE_LANGUAGE_FR;
  return ProtoLang.COURSE_LANGUAGE_OTHER;
}

function protoToLang(b: ProtoLang): CourseLanguageBucket {
  if (b === ProtoLang.COURSE_LANGUAGE_EN) return 'en';
  if (b === ProtoLang.COURSE_LANGUAGE_FR) return 'fr';
  return 'other';
}

function dayToProto(d: SchemaDayOfWeek): ProtoDayOfWeek {
  const days: SchemaDayOfWeek[] = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  return days.indexOf(d) as ProtoDayOfWeek;
}

function protoToDay(p: ProtoDayOfWeek): SchemaDayOfWeek {
  const days: SchemaDayOfWeek[] = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  return days[p as number] ?? 'Mo';
}

export function encodeState(
  input: EncodeInput,
  _catalogue: CatalogueLike,
  indices: Indices
): Uint8Array | null {
  const programIndex = input.program != null
    ? indices.programs.indexOf(programSlug(input.program))
    : -1;
  if (input.program != null && programIndex < 0) return null;

  const minorProgramIndex = input.minorProgram != null
    ? indices.programs.indexOf(programSlug(input.minorProgram))
    : -1;
  if (input.minorProgram != null && minorProgramIndex < 0) return null;

  const courseCodeToIndex = new Map<string, number>();
  indices.courses.forEach((code, i) => courseCodeToIndex.set(code, i));

  // Validate courses
  for (const code of input.completedCourses) {
    if (!isOptCourse(code) && !courseCodeToIndex.has(code)) return null;
  }
  for (const code of input.basicPinnedCourses) {
    if (!courseCodeToIndex.has(code)) return null;
  }

  const encodeCourseCode = (c: string): number | undefined => {
    if (isOptCourse(c)) return OPT_SENTINEL_BASE + Math.floor((getCourseLevel(c) ?? 1000) / 1000);
    return courseCodeToIndex.get(c);
  };

  const orderedReqIds = requirementIdsFromTree(input.requirementTreeWithStatus);
  const reqIdToIndex = new Map<string, number>();
  orderedReqIds.forEach((id, i) => reqIdToIndex.set(id, i));

  // Assemble State
  const state: ShareableState = {
    wizardMode: input.wizardMode === "basic" ? WizardMode.WIZARD_MODE_BASIC 
      : input.wizardMode === "advanced" ? WizardMode.WIZARD_MODE_ADVANCED 
      : WizardMode.WIZARD_MODE_UNSPECIFIED,
    basicPinnedCourses: input.basicPinnedCourses.map(encodeCourseCode).filter((i): i is number => i !== undefined),
    basicElectivesCount: input.basicElectivesCount,
    basicExcludedCategories: input.basicExcludedCategories,

    selectedTermId: input.selectedTermId ?? undefined,
    firstYear: input.firstYear ?? undefined,
    programIndex: programIndex !== -1 ? programIndex : undefined,
    minorProgramIndex: minorProgramIndex !== -1 ? minorProgramIndex : undefined,
    studentPrograms: input.studentPrograms,

    completedCourses: input.completedCourses.map(encodeCourseCode).filter((i): i is number => i !== undefined),
    levelBuckets: input.levelBuckets.map(levelToProto),
    languageBuckets: input.languageBuckets.map(langToProto),
    electiveLevelBuckets: input.electiveLevelBuckets,
    
    coursesThisSemester: input.coursesThisSemester,
    firstSeed: input.firstSeed,
    currentSeed: input.currentSeed,
    swaps: input.swaps.map(s => ({
      enrollmentIndex: s.enrollmentIndex,
      courseCodeIndex: courseCodeToIndex.get(s.courseCode) ?? 0,
    })),

    optionSelections: [],
    courseSelections: [],
    constrainedSelections: [],
    touchedReqIndices: [],

    includeClosedComponents: input.includeClosedComponents,
    virtualSectionsOnly: input.virtualSectionsOnly,

    generationMinStartMinutes: input.generationMinStartMinutes,
    generationMaxEndMinutes: input.generationMaxEndMinutes,
    generationAllowedDays: input.generationAllowedDays.map(dayToProto),
    generationMinProfessorRating: input.generationMinProfessorRating !== null 
      ? Math.round(input.generationMinProfessorRating * 10) 
      : undefined,
    generationLimitFirstYearCredits: input.generationLimitFirstYearCredits,
    generationCompressedSchedule: input.generationCompressedSchedule,
    magic: STATE_MAGIC,
    activeStep: input.activeStep,
    showCalendar: input.showCalendar,
  };

  // Requirements
  for (const [reqId, optionIndex] of Object.entries(input.selectedOptionsPerRequirement)) {
    const reqIndex = reqIdToIndex.get(reqId);
    if (reqIndex !== undefined) {
      state.optionSelections.push({ reqIndex, optionIndex });
    }
  }

  for (const [reqId, codes] of Object.entries(input.selectedPerRequirement)) {
    const reqIndex = reqIdToIndex.get(reqId);
    if (reqIndex !== undefined) {
      const courseIndices = codes.map(encodeCourseCode).filter((i): i is number => i !== undefined);
      if (courseIndices.length) state.courseSelections.push({ reqIndex, courseIndices });
    }
  }

  for (const [reqId, codes] of Object.entries(input.constrainedPerRequirement)) {
    const reqIndex = reqIdToIndex.get(reqId);
    if (reqIndex !== undefined) {
      const courseIndices = codes.map(encodeCourseCode).filter((i): i is number => i !== undefined);
      if (courseIndices.length) state.constrainedSelections.push({ reqIndex, courseIndices });
    }
  }

  for (const reqId of Object.keys(input.requirementSlotsUserTouched)) {
    const reqIndex = reqIdToIndex.get(reqId);
    if (reqIndex !== undefined) state.touchedReqIndices.push(reqIndex);
  }

  try {
    return ShareableState.encode(state).finish();
  } catch {
    return null;
  }
}

export type DecodeError = { error: string };

export function peekTermAndYear(
  bytes: Uint8Array
): { termId: string | null; firstYear: number | null } | null {
  try {
    const state = ShareableState.decode(bytes);
    if (state.magic !== STATE_MAGIC) return null;
    return { 
      termId: state.selectedTermId ?? null, 
      firstYear: state.firstYear ?? null 
    };
  } catch {
    return null;
  }
}

export function decodeState(
  buffer: Uint8Array,
  catalogue: CatalogueLike,
  indices: Indices
): DecodedState | DecodeError {
  let state: ShareableState;
  try {
    state = ShareableState.decode(buffer);
  } catch {
    return { error: 'Invalid state encoding' };
  }

  if (state.magic !== STATE_MAGIC) {
    return { error: 'Incompatible or corrupted state data' };
  }

  let program: Program | null = null;
  if (state.programIndex !== undefined && state.programIndex < indices.programs.length) {
    const slug = indices.programs[state.programIndex];
    program = catalogue.programs.find((p) => programSlug(p) === slug) ?? null;
    if (program === null) return { error: 'Program from shared state is no longer in the catalogue' };
  }

  let minorProgram: Program | null = null;
  if (state.minorProgramIndex !== undefined && state.minorProgramIndex < indices.programs.length) {
    const slug = indices.programs[state.minorProgramIndex];
    minorProgram = catalogue.programs.find((p) => programSlug(p) === slug) ?? null;
    if (minorProgram === null) return { error: 'Minor program from shared state is no longer in the catalogue' };
  }

  const decodeCourseIndices = (indicesList: number[], optCounters?: Map<number, number>): string[] => {
    const codes: string[] = [];
    for (const idx of indicesList) {
      if (idx >= OPT_SENTINEL_BASE) {
        const level = (idx - OPT_SENTINEL_BASE) * 1000;
        let count = 0;
        if (optCounters) {
          count = optCounters.get(level) ?? 0;
          optCounters.set(level, count + 1);
        }
        codes.push(`OPT ${level + count}`);
      } else if (idx < indices.courses.length) {
        const code = indices.courses[idx];
        if (catalogue.courses.some((c) => c.code === code)) codes.push(code);
      } else {
        codes.push(indices.courses[idx]);
      }
    }
    return codes;
  };

  const completedOptCounters = new Map<number, number>();
  const completedCourseCodes = decodeCourseIndices(state.completedCourses, completedOptCounters).filter(c => c && (isOptCourse(c) || catalogue.courses.some(catC => catC.code === c)));

  const courseSelectionsOptCounters = new Map<number, number>();
  const courseSelections = state.courseSelections.map(sel => ({
    reqIndex: sel.reqIndex,
    courseCodes: decodeCourseIndices(sel.courseIndices, courseSelectionsOptCounters).filter(c => c && (isOptCourse(c) || catalogue.courses.some(catC => catC.code === c))),
  }));

  const constrainedOptCounters = new Map<number, number>();
  const constrainedSelections = state.constrainedSelections.map(sel => ({
    reqIndex: sel.reqIndex,
    courseCodes: decodeCourseIndices(sel.courseIndices, constrainedOptCounters).filter(c => c && (isOptCourse(c) || catalogue.courses.some(catC => catC.code === c))),
  }));

  const basicPinnedCourses = state.basicPinnedCourses
    .map(idx => idx < indices.courses.length ? indices.courses[idx] : null)
    .filter((c): c is string => c !== null);

  return {
    wizardMode: state.wizardMode === WizardMode.WIZARD_MODE_BASIC ? "basic"
      : state.wizardMode === WizardMode.WIZARD_MODE_ADVANCED ? "advanced"
      : null,
    basicPinnedCourses,
    basicElectivesCount: state.basicElectivesCount,
    basicExcludedCategories: state.basicExcludedCategories,

    selectedTermId: state.selectedTermId ?? null,
    firstYear: state.firstYear ?? null,
    program,
    minorProgram,
    completedCourseCodes,
    levelBuckets: state.levelBuckets.map(protoToLevel),
    languageBuckets: state.languageBuckets.map(protoToLang),
    electiveLevelBuckets: state.electiveLevelBuckets,
    
    coursesThisSemester: state.coursesThisSemester,
    firstSeed: state.firstSeed,
    currentSeed: state.currentSeed,
    swaps: state.swaps.map(s => ({
      enrollmentIndex: s.enrollmentIndex,
      courseCode: indices.courses[s.courseCodeIndex] ?? '',
    })),
    
    optionSelections: state.optionSelections.map(o => ({ reqIndex: o.reqIndex, optionIndex: o.optionIndex })),
    courseSelections,
    constrainedSelections,
    
    includeClosedComponents: state.includeClosedComponents,
    virtualSectionsOnly: state.virtualSectionsOnly,
    studentPrograms: state.studentPrograms,
    
    touchedReqIndices: state.touchedReqIndices,
    
    generationMinStartMinutes: state.generationMinStartMinutes,
    generationMaxEndMinutes: state.generationMaxEndMinutes,
    generationAllowedDays: state.generationAllowedDays.map(protoToDay),
    generationMinProfessorRating: state.generationMinProfessorRating !== undefined 
      ? state.generationMinProfessorRating / 10 
      : null,
    generationLimitFirstYearCredits: state.generationLimitFirstYearCredits,
    generationCompressedSchedule: state.generationCompressedSchedule,
    activeStep: state.activeStep ?? 0,
    showCalendar: state.showCalendar ?? false,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

export function stateToShareUrl(
  encoded: Uint8Array,
  baseUrl: string = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}`
    : ''
): string {
  const q = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${q}s=${encodeURIComponent(bytesToBase64(encoded))}`;
}

export function parseStateFromUrl(search: string): Uint8Array | null {
  const params = new URLSearchParams(search);
  const s = params.get('s');
  if (!s) return null;
  try {
    return base64ToBytes(decodeURIComponent(s));
  } catch {
    return null;
  }
}

export function encodeStateToBase64(
  input: EncodeInput,
  catalogue: CatalogueLike,
  indices: Indices
): string | null {
  const bytes = encodeState(input, catalogue, indices);
  if (!bytes) return null;
  return bytesToBase64(bytes);
}

export function decodeStateFromBase64(
  base64: string,
  catalogue: CatalogueLike,
  indices: Indices
): DecodedState | DecodeError {
  const bytes = base64ToBytes(base64);
  if (!bytes) return { error: 'Invalid state encoding' };
  return decodeState(bytes, catalogue, indices);
}

export function peekTermAndYearFromBase64(
  base64: string
): { termId: string | null; firstYear: number | null } | null {
  const bytes = base64ToBytes(base64);
  if (!bytes) return null;
  return peekTermAndYear(bytes);
}
