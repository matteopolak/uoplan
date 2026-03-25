import type { Program } from 'schemas';
import type { CourseLevelBucket, CourseLanguageBucket } from './courseFilters';
import type { RemainingRequirement, RequirementWithStatus } from './requirements';
import type { Indices } from 'schemas';

/** Collect all requirement IDs from the tree in depth-first order (used for stable encoding). */
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

/**
 * Derive a stable slug from a catalogue program URL. Works for both current and archive URLs:
 *   https://catalogue.uottawa.ca/en/undergrad/foo/         → undergrad/foo
 *   https://catalogue.uottawa.ca/archive/2024-2025/en/undergrad/foo/ → undergrad/foo
 */
export function urlToSlug(url: string): string {
  return url
    .replace(/^https?:\/\/catalogue\.uottawa\.ca(?:\/archive\/\d{4}-\d{4})?\/en\//, '')
    .replace(/\/$/, '');
}

function programSlug(p: Program): string {
  return (p as Program & { slug?: string }).slug ?? urlToSlug(p.url);
}

const VERSION = 5;
const MAX_U16 = 0xffff;
const MAX_U32 = 0xffffffff;

export interface EncodeInput {
  selectedTermId: string | null;
  firstYear: number | null;
  program: Program | null;
  completedCourses: string[];
  levelBuckets: CourseLevelBucket[];
  languageBuckets: CourseLanguageBucket[];
  electiveLevelBuckets: number[];
  coursesThisSemester: number;
  selectedScheduleIndex: number;
  generationSeed: number;
  selectedPerRequirement: Record<string, string[]>;
  selectedOptionsPerRequirement: Record<string, number>;
  /** Full requirement tree; used to get stable ordering of all requirement IDs (including parents). */
  requirementTreeWithStatus: RequirementWithStatus[];
  remainingRequirements: RemainingRequirement[];
  includeClosedComponents: boolean;
  studentPrograms: string[];
}

export interface DecodedState {
  selectedTermId: string | null;
  firstYear: number | null;
  program: Program | null;
  completedCourseCodes: string[];
  levelBuckets: CourseLevelBucket[];
  languageBuckets: CourseLanguageBucket[];
  electiveLevelBuckets: number[];
  coursesThisSemester: number;
  selectedScheduleIndex: number;
  generationSeed: number;
  optionSelections: Array<{ reqIndex: number; optionIndex: number }>;
  courseSelections: Array<{ reqIndex: number; courseIndices: number[] }>;
  includeClosedComponents: boolean;
  studentPrograms: string[];
}

export interface CatalogueLike {
  courses: Array<{ code: string }>;
  programs: Program[];
}

function levelToByte(b: CourseLevelBucket): number {
  return b === 'undergrad' ? 0 : 1;
}

function byteToLevel(b: number): CourseLevelBucket {
  return b === 0 ? 'undergrad' : 'grad';
}

function langToByte(b: CourseLanguageBucket): number {
  if (b === 'en') return 0;
  if (b === 'fr') return 1;
  return 2;
}

function byteToLang(b: number): CourseLanguageBucket {
  if (b === 0) return 'en';
  if (b === 1) return 'fr';
  return 'other';
}

function writeU16(view: DataView, offset: number, value: number): number {
  view.setUint16(offset, value, true);
  return offset + 2;
}

function writeU8(view: DataView, offset: number, value: number): number {
  view.setUint8(offset, value);
  return offset + 1;
}

function writeU32(view: DataView, offset: number, value: number): number {
  view.setUint32(offset, value >>> 0, true);
  return offset + 4;
}

function readU16(view: DataView, offset: number): { value: number; next: number } {
  return { value: view.getUint16(offset, true), next: offset + 2 };
}

function readU8(view: DataView, offset: number): { value: number; next: number } {
  return { value: view.getUint8(offset), next: offset + 1 };
}

function readU32(view: DataView, offset: number): { value: number; next: number } {
  return { value: view.getUint32(offset, true), next: offset + 4 };
}

/**
 * Encode user state to a compact binary format. Returns null if indices/catalogue
 * don't contain the current program or courses (e.g. program not in indices).
 *
 * Binary layout (VERSION 5):
 *   U8  version
 *   U8  termId byte-length (0 = absent)
 *   [ASCII bytes for termId]
 *   U16 firstYear (0 = null/current)
 *   U16 programIndex (MAX_U16 = no program)
 *   U16 completedCount
 *   [U16 × completedCount]
 *   U8  levelBuckets count + [U8 × count]
 *   U8  languageBuckets count + [U8 × count]
 *   U8  electiveLevelBuckets count + [U16 × count]
 *   U8  coursesThisSemester
 *   U16 selectedScheduleIndex
 *   U32 generationSeed
 *   U8  includeClosedComponents
 *   U16 optionSelections count + [U16 reqIndex, U16 optionIndex × count]
 *   U16 courseSelections count + [U16 reqIndex, U16 count, U16 × count] × count
 *   U8  studentPrograms count + [U8 byteLen + ASCII bytes] × count
 */
export function encodeState(
  input: EncodeInput,
  _catalogue: CatalogueLike,
  indices: Indices
): Uint8Array | null {
  const programIndex =
    input.program != null
      ? indices.programs.indexOf(programSlug(input.program))
      : -1;
  if (input.program != null && programIndex < 0) return null;

  const courseCodeToIndex = new Map<string, number>();
  indices.courses.forEach((code, i) => courseCodeToIndex.set(code, i));

  for (const code of input.completedCourses) {
    if (!courseCodeToIndex.has(code)) return null;
  }

  const termIdBytes = input.selectedTermId
    ? Array.from(input.selectedTermId).map(c => c.charCodeAt(0))
    : [];

  const orderedReqIds = requirementIdsFromTree(input.requirementTreeWithStatus);
  const reqIdToIndex = new Map<string, number>();
  orderedReqIds.forEach((id, i) => reqIdToIndex.set(id, i));

  const size =
    1 + // version
    1 + termIdBytes.length + // termId
    2 + // firstYear
    2 + 2 + input.completedCourses.length * 2 + // programIndex + completed
    1 + input.levelBuckets.length +
    1 + input.languageBuckets.length +
    1 + input.electiveLevelBuckets.length * 2 +
    1 + 2 + 4 + 1 + // coursesThisSemester, scheduleIndex, seed, includeClosedComponents
    (2 + Object.keys(input.selectedOptionsPerRequirement).length * 4) +
    (2 + (() => {
      let n = 0;
      for (const arr of Object.values(input.selectedPerRequirement)) {
        n += 2 + 2 + arr.length * 2;
      }
      return n;
    })()) +
    (1 + input.studentPrograms.reduce((acc, p) => acc + 1 + p.length, 0));

  const buffer = new ArrayBuffer(Math.max(256, size));
  const view = new DataView(buffer);
  let off = 0;

  off = writeU8(view, off, VERSION);

  // termId
  off = writeU8(view, off, Math.min(255, termIdBytes.length));
  for (const b of termIdBytes) off = writeU8(view, off, b);

  // firstYear (0 = null)
  off = writeU16(view, off, input.firstYear != null ? input.firstYear : 0);

  off = writeU16(view, off, programIndex === -1 ? MAX_U16 : programIndex);

  const completed = input.completedCourses.map((c) => courseCodeToIndex.get(c)!);
  off = writeU16(view, off, completed.length);
  for (const idx of completed) off = writeU16(view, off, idx);

  off = writeU8(view, off, input.levelBuckets.length);
  for (const b of input.levelBuckets) off = writeU8(view, off, levelToByte(b));

  off = writeU8(view, off, input.languageBuckets.length);
  for (const b of input.languageBuckets) off = writeU8(view, off, langToByte(b));

  off = writeU8(view, off, input.electiveLevelBuckets.length);
  for (const v of input.electiveLevelBuckets) off = writeU16(view, off, v);

  off = writeU8(view, off, Math.min(255, input.coursesThisSemester));
  off = writeU16(view, off, Math.min(MAX_U16, input.selectedScheduleIndex));
  off = writeU32(view, off, Math.min(MAX_U32, input.generationSeed >>> 0));
  off = writeU8(view, off, input.includeClosedComponents ? 1 : 0);

  const optEntries = Object.entries(input.selectedOptionsPerRequirement)
    .map(([reqId, optionIndex]) => {
      const reqIndex = reqIdToIndex.get(reqId);
      return reqIndex !== undefined ? { reqIndex, optionIndex } : null;
    })
    .filter((e): e is { reqIndex: number; optionIndex: number } => e !== null);
  off = writeU16(view, off, optEntries.length);
  for (const { reqIndex, optionIndex } of optEntries) {
    off = writeU16(view, off, reqIndex);
    off = writeU16(view, off, optionIndex);
  }

  const courseEntries: Array<{ reqIndex: number; courseIndices: number[] }> = [];
  for (const [reqId, codes] of Object.entries(input.selectedPerRequirement)) {
    const reqIndex = reqIdToIndex.get(reqId);
    if (reqIndex === undefined) continue;
    const courseIndices = codes
      .map((c) => courseCodeToIndex.get(c))
      .filter((i): i is number => i !== undefined);
    if (courseIndices.length) courseEntries.push({ reqIndex, courseIndices });
  }
  off = writeU16(view, off, courseEntries.length);
  for (const { reqIndex, courseIndices } of courseEntries) {
    off = writeU16(view, off, reqIndex);
    off = writeU16(view, off, courseIndices.length);
    for (const idx of courseIndices) off = writeU16(view, off, idx);
  }

  // Student programs: U8 count, then for each code: U8 byte-length + ASCII bytes.
  off = writeU8(view, off, Math.min(255, input.studentPrograms.length));
  for (const code of input.studentPrograms) {
    off = writeU8(view, off, code.length);
    for (let i = 0; i < code.length; i++) {
      off = writeU8(view, off, code.charCodeAt(i));
    }
  }

  return new Uint8Array(buffer, 0, off);
}

export type DecodeError = { error: string };

/**
 * Read just the termId and firstYear from the binary header without decoding the rest
 * or needing a catalogue. Returns null if the version is unsupported or the buffer is
 * too short to contain the header.
 */
export function peekTermAndYear(
  bytes: Uint8Array
): { termId: string | null; firstYear: number | null } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 1) return null;
  const version = view.getUint8(0);
  if (version !== VERSION) return null;
  let off = 1;

  if (off + 1 > bytes.length) return null;
  const termIdLen = view.getUint8(off++);
  if (off + termIdLen + 2 > bytes.length) return null;

  let termId: string | null = null;
  if (termIdLen > 0) {
    let s = '';
    for (let i = 0; i < termIdLen; i++) s += String.fromCharCode(view.getUint8(off + i));
    termId = s;
  }
  off += termIdLen;

  const firstYearRaw = view.getUint16(off, true);
  const firstYear = firstYearRaw === 0 ? null : firstYearRaw;

  return { termId, firstYear };
}

/**
 * Decode binary state. Returns DecodedState or DecodeError if version is unknown
 * or any referenced program/course is missing from the current catalogue.
 */
export function decodeState(
  buffer: Uint8Array,
  catalogue: CatalogueLike,
  indices: Indices
): DecodedState | DecodeError {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let off = 0;
  if (buffer.length < 1) return { error: 'Invalid state: too short' };
  const { value: version, next: n0 } = readU8(view, off);
  off = n0;
  if (version !== VERSION) {
    return { error: 'Invalid or unsupported state version' };
  }

  // termId
  if (off + 1 > buffer.length) return { error: 'Invalid state: truncated' };
  const { value: termIdLen, next: n0b } = readU8(view, off);
  off = n0b;
  if (off + termIdLen > buffer.length) return { error: 'Invalid state: truncated' };
  let selectedTermId: string | null = null;
  if (termIdLen > 0) {
    let s = '';
    for (let i = 0; i < termIdLen; i++) s += String.fromCharCode(view.getUint8(off + i));
    selectedTermId = s;
  }
  off += termIdLen;

  // firstYear
  if (off + 2 > buffer.length) return { error: 'Invalid state: truncated' };
  const { value: firstYearRaw, next: n0c } = readU16(view, off);
  off = n0c;
  const firstYear: number | null = firstYearRaw === 0 ? null : firstYearRaw;

  const { value: programIndex, next: n1 } = readU16(view, off);
  off = n1;

  let program: Program | null = null;
  if (programIndex !== MAX_U16 && programIndex < indices.programs.length) {
    const slug = indices.programs[programIndex];
    program = catalogue.programs.find((p) => programSlug(p) === slug) ?? null;
    if (program === null)
      return { error: 'Program from shared state is no longer in the catalogue' };
  }

  const { value: completedLen, next: n2 } = readU16(view, off);
  off = n2;
  const completedCourseCodes: string[] = [];
  for (let i = 0; i < completedLen && off + 2 <= buffer.length; i++) {
    const { value: idx, next: n } = readU16(view, off);
    off = n;
    if (idx >= indices.courses.length)
      return { error: 'A course from shared state is no longer in the catalogue' };
    completedCourseCodes.push(indices.courses[idx]);
  }

  if (off + 1 > buffer.length) return { error: 'Invalid state: truncated' };
  const { value: levelLen, next: n3 } = readU8(view, off);
  off = n3;
  const levelBuckets: CourseLevelBucket[] = [];
  for (let i = 0; i < levelLen && off + 1 <= buffer.length; i++) {
    const { value: b, next: n } = readU8(view, off);
    off = n;
    levelBuckets.push(byteToLevel(b));
  }

  if (off + 1 > buffer.length) return { error: 'Invalid state: truncated' };
  const { value: langLen, next: n4 } = readU8(view, off);
  off = n4;
  const languageBuckets: CourseLanguageBucket[] = [];
  for (let i = 0; i < langLen && off + 1 <= buffer.length; i++) {
    const { value: b, next: n } = readU8(view, off);
    off = n;
    languageBuckets.push(byteToLang(b));
  }

  if (off + 1 > buffer.length) return { error: 'Invalid state: truncated' };
  const { value: electiveLen, next: n5 } = readU8(view, off);
  off = n5;
  const electiveLevelBuckets: number[] = [];
  for (let i = 0; i < electiveLen && off + 2 <= buffer.length; i++) {
    const { value: v, next: n } = readU16(view, off);
    off = n;
    electiveLevelBuckets.push(v);
  }

  if (off + 1 + 2 > buffer.length) return { error: 'Invalid state: truncated' };
  const { value: coursesThisSemester, next: n6 } = readU8(view, off);
  off = n6;
  const { value: selectedScheduleIndex, next: n7 } = readU16(view, off);
  off = n7;

  if (off + 4 > buffer.length) return { error: 'Invalid state: truncated' };
  const { value: seed, next: nSeed } = readU32(view, off);
  off = nSeed;
  const generationSeed = seed >>> 0;

  if (off + 1 > buffer.length) return { error: 'Invalid state: truncated' };
  const { value: incClosed, next: nInc } = readU8(view, off);
  off = nInc;
  const includeClosedComponents = incClosed !== 0;

  if (off + 2 > buffer.length) return { error: 'Invalid state: truncated' };
  const { value: optCount, next: n8 } = readU16(view, off);
  off = n8;
  const optionSelections: Array<{ reqIndex: number; optionIndex: number }> = [];
  for (let i = 0; i < optCount && off + 4 <= buffer.length; i++) {
    const { value: reqIndex, next: na } = readU16(view, off);
    off = na;
    const { value: optionIndex, next: nb } = readU16(view, off);
    off = nb;
    optionSelections.push({ reqIndex, optionIndex });
  }

  if (off + 2 > buffer.length) return { error: 'Invalid state: truncated' };
  const { value: courseSelCount, next: n9 } = readU16(view, off);
  off = n9;
  const courseSelections: Array<{ reqIndex: number; courseIndices: number[] }> = [];
  for (let i = 0; i < courseSelCount; i++) {
    if (off + 2 + 2 > buffer.length) break;
    const { value: reqIndex, next: nc } = readU16(view, off);
    off = nc;
    const { value: numCourses, next: nd } = readU16(view, off);
    off = nd;
    const courseIndices: number[] = [];
    for (let j = 0; j < numCourses && off + 2 <= buffer.length; j++) {
      const { value: idx, next: ne } = readU16(view, off);
      off = ne;
      if (idx < indices.courses.length) {
        const code = indices.courses[idx];
        if (catalogue.courses.some((c) => c.code === code)) courseIndices.push(idx);
      }
    }
    courseSelections.push({ reqIndex, courseIndices });
  }

  // Student programs
  const studentPrograms: string[] = [];
  if (off + 1 <= buffer.length) {
    const { value: progCount, next: nPc } = readU8(view, off);
    off = nPc;
    for (let i = 0; i < progCount && off + 1 <= buffer.length; i++) {
      const { value: codeLen, next: nCl } = readU8(view, off);
      off = nCl;
      let code = '';
      for (let j = 0; j < codeLen && off + 1 <= buffer.length; j++) {
        const { value: ch, next: nCh } = readU8(view, off);
        off = nCh;
        code += String.fromCharCode(ch);
      }
      if (code) studentPrograms.push(code);
    }
  }

  return {
    selectedTermId,
    firstYear,
    program,
    completedCourseCodes,
    levelBuckets,
    languageBuckets,
    electiveLevelBuckets,
    coursesThisSemester,
    selectedScheduleIndex,
    generationSeed,
    optionSelections,
    courseSelections,
    includeClosedComponents,
    studentPrograms,
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
