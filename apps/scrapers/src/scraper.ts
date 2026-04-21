import * as cheerio from 'cheerio';
import { z } from 'zod';
import pLimit from 'p-limit';
import fs from 'fs/promises';
import path from 'path';

const ROOT_URL = 'https://catalogue.uottawa.ca';
const OLDEST_YEAR = 2017;

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function getCurrentAcademicYear(): number {
  const now = new Date();
  // Academic year starts in September (month index 8)
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

function buildBaseUrl(year: number): string {
  if (year === getCurrentAcademicYear()) return ROOT_URL;
  return `${ROOT_URL}/archive/${year}-${year + 1}`;
}

/** Returns the path-only prefix for the given baseUrl (e.g. "/archive/2021-2022" or ""). */
function hrefPrefix(baseUrl: string): string {
  return baseUrl.replace(ROOT_URL, '');
}

// Detect if text is just a grade indicator like (M), (B+), (B+ or higher), (A-)
function isGradeIndicator(text: string): boolean {
  const trimmed = text.trim();
  // Pattern 1: letter grades A-F with optional +/- and "or higher"
  const gradePattern = /^\([A-F][+-]?\s*(or higher|ou supérieur)?\)$/i;
  // Pattern 2: single letters like (H), (M), (B) - honors, math, standing
  const singleLetterPattern = /^\([A-Z]\)$/;
  // Pattern 3: two-letter standing codes like (HP), (HS), etc.
  const twoLetterPattern = /^\([A-Z]{2}\)$/;
  return gradePattern.test(trimmed) || singleLetterPattern.test(trimmed) || twoLetterPattern.test(trimmed);
}

type CoursePrereqDisciplineLevel = {
  discipline: string;
  levels?: number[];
};

type CoursePrereqNode = {
  type: 'course' | 'or_group' | 'and_group' | 'non_course';
  code?: string;
  text?: string;
  credits?: number;
  disciplines?: string[];
  levels?: number[];
  disciplineLevels?: CoursePrereqDisciplineLevel[];
  programs?: string[];
  children?: CoursePrereqNode[];
};

const CoursePrereqNodeSchema: z.ZodType<CoursePrereqNode> = z.lazy(() =>
  z.object({
    type: z.enum(['course', 'or_group', 'and_group', 'non_course']),
    code: z.string().optional(),
    text: z.string().optional(),
    credits: z.number().optional(),
    disciplines: z.array(z.string()).optional(),
    levels: z.array(z.number()).optional(),
    disciplineLevels: z
      .array(
        z.object({
          discipline: z.string(),
          levels: z.array(z.number()).optional(),
        }),
      )
      .optional(),
    programs: z.array(z.string()).optional(),
    children: z.array(CoursePrereqNodeSchema).optional(),
  }),
);

const CourseSchema = z.object({
  code: z.string(),
  title: z.string(),
  credits: z.number(),
  description: z.string(),
  component: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  prereqText: z.string().optional(),
  prerequisites: CoursePrereqNodeSchema.optional(),
});
export type Course = z.infer<typeof CourseSchema>;
export type CoursePrereqNodeType = CoursePrereqNode;

const RequirementTypeSchema = z.enum([
  'course',
  'elective',
  'group',
  'pick',
  'options_group',
  'discipline_elective',
  'free_elective',
  'non_discipline_elective',
  'faculty_elective',
  'section',
  'and',
  'or_group',
  'or_course',
]);

const DisciplineLevelSchema = z.object({
  discipline: z.string(),
  levels: z.array(z.number()).optional(), // e.g. [3000, 4000]
});

const ProgramRequirementBaseSchema = z.object({
  type: RequirementTypeSchema,
  title: z.string().optional(),
  code: z.string().optional(),
  credits: z.number().optional(),
  disciplineLevels: z.array(DisciplineLevelSchema).optional(),
  excluded_disciplines: z.array(z.string()).optional(),
  faculty: z.string().optional(),
  // Row was visually indented in the source table (e.g. via `commentindent`).
  // Used to correctly group option contents.
  indented: z.boolean().optional(),
});

type ProgramRequirementType = z.infer<typeof ProgramRequirementBaseSchema> & {
  options?: ProgramRequirementType[];
};

const ProgramRequirementSchema: z.ZodType<ProgramRequirementType> = ProgramRequirementBaseSchema.extend({
  options: z.lazy(() => z.array(ProgramRequirementSchema)).optional(),
});
export type ProgramRequirement = ProgramRequirementType;

/**
 * "at the 3000 or 4000 level" / "niveau 3000 ou 4000" must not split on the inner `or`/`ou`.
 */
function normalizeLevelOrDisjunction(text: string): string {
  return text.replace(/\b(\d{4})\s+(or|ou)\s+(\d{4})\b/gi, '$1/$3');
}

/**
 * "12 course units in CSI or SDS" shares one credit pool across disciplines — wrap so
 * extractDisciplines finds them and tryMergeSharedCreditDisciplineOr can merge.
 */
function normalizeDisciplineOrInCredits(text: string): string {
  return text
    .replace(/\bin\s+([A-Z]{3,4})\s+or\s+([A-Z]{3,4})\b/gi, 'in ($1) or ($2)')
    .replace(/\bdans\s+([A-Z]{3,4})\s+ou\s+([A-Z]{3,4})\b/gi, 'dans ($1) ou ($2)');
}

// Common abbreviations that shouldn't trigger splits
const ABBREVIATIONS = new Set(['b.com', 'm.com', 'b.a', 'm.a', 'm.sc', 'ph.d', 'b.mus', 'b.eng']);

function shouldSplitPrereqAndAt(left: string, right: string): boolean {
  const leftTrim = left.trim().toLowerCase();
  const rightTrim = right.trim().toLowerCase();
  
  // Check if left ends with an abbreviation like B.Com
  const leftEnd = leftTrim.slice(-6).toLowerCase();
  for (const abbrev of ABBREVIATIONS) {
    if (leftEnd.includes(abbrev)) return false;
  }
  
  if (leftTrim.endsWith(')')) return true;
  
  // Only split on digit if it looks like a credit count (1-3 digits, not 4-digit level/course code)
  const creditMatch = rightTrim.match(/^(\d+)\s/);
  if (creditMatch) {
    const num = creditMatch[1];
    // 4-digit numbers are likely course codes or levels, not credit counts
    if (num.length === 4) return false;
    return true;
  }
  
  return false;
}

/**
 * Extracts 1000/2000/… level numbers from prerequisite text (English + French).
 * Replaces the narrower `at the … level`-only helper used for program electives.
 */
function extractLevelsFromPrerequisiteText(text: string): number[] | undefined {
  const normalized = normalizeLevelOrDisjunction(text);
  const found = new Set<number>();

  const atThe = normalized.match(/\bat the\s+([^.;]+?)\s+level\b/i);
  if (atThe) {
    const nums = atThe[1].match(/\b(\d{4})\b/g);
    if (nums) for (const n of nums) found.add(parseInt(n, 10));
  }

  const frNiveau = normalized.match(/\b(?:de|au)\s+niveau\s+([^.;]+)/i);
  if (frNiveau) {
    const nums = frNiveau[1].match(/\b(\d{4})\b/g);
    if (nums) for (const n of nums) found.add(parseInt(n, 10));
  }

  if (found.size === 0) return undefined;
  return Array.from(found).sort((a, b) => a - b);
}

function parseLevelsFromClause(text: string): number[] | undefined {
  return extractLevelsFromPrerequisiteText(text);
}

function extractDisciplines(text: string): string[] {
  const disciplineRegex = /\(([A-Z]{3,4})\)/g;
  const disciplines: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = disciplineRegex.exec(text)) !== null) disciplines.push(match[1]);
  return Array.from(new Set(disciplines));
}

function extractCourseCodes(text: string): string[] {
  const re = /\b([A-Z]{3,4})\s*(\d{4,5}[A-Z]?)\b/g;
  const codes: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    codes.push(`${m[1]} ${m[2]}`.replace(/\s+/, ' '));
  }
  return Array.from(new Set(codes));
}

function normalizeCodeKey(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Course codes from "Previously …" / "Antérieurement …" (legacy renumbering).
 * Scans component and description; does not add standalone catalogue rows.
 */
function extractPreviouslyAliases(combined: string, ownCode: string): string[] {
  const normalized = combined.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const ownKey = normalizeCodeKey(ownCode);
  const re = /\b(?:Previously|Antérieurement)\s*:?\s*/gi;
  const codes = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const rest = normalized.slice(m.index + m[0].length);
    let segment: string;
    const boundaryWithSentence = rest.match(
      /^([\s\S]*?)(?=\.\s+(?:They|The|Students|Reserved|Priority|Consult|Supplemental|It |Also |The courses |Réservé|Les cours ))/,
    );
    if (boundaryWithSentence) {
      segment = boundaryWithSentence[1];
    } else {
      const dotIdx = rest.indexOf('.');
      segment = dotIdx === -1 ? rest : rest.slice(0, dotIdx);
    }
    let segmentTrim = segment.replace(/^\(\s*/, '').replace(/\s*\)\s*$/, '').trim();
    segmentTrim = segmentTrim.replace(/\.\s*$/, '').trim();
    for (const c of extractCourseCodes(segmentTrim)) {
      if (normalizeCodeKey(c) !== ownKey) codes.add(c);
    }
  }
  return Array.from(codes);
}

export function extractPrereqSentence(raw: string): string | undefined {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;

  // Check if text has bilingual format (contains both French and English labels)
  // Extract the first language version (whichever appears first in the text)
  const hasEnglishLabel = /Prerequisite(s)?\s*[:：]/i.test(normalized);
  const hasFrenchLabel = /Préalable(s)?\s*[:：]/i.test(normalized);

  if (hasEnglishLabel && hasFrenchLabel) {
    // Find positions of both labels to determine which comes first
    const englishMatch = normalized.match(/Prerequisite(s)?\s*[:：]/i);
    const frenchMatch = normalized.match(/Préalable(s)?\s*[:：]/i);

    if (englishMatch && frenchMatch) {
      const englishPos = englishMatch.index ?? 0;
      const frenchPos = frenchMatch.index ?? 0;

      if (englishPos < frenchPos) {
        // English comes first - extract until "/ Préalable" or end
        const textMatch = normalized.match(/Prerequisite(s)?\s*[:：]\s*(.*?)(?:\s*\/\s*Préalable|$)/i);
        if (textMatch && textMatch[2]) {
          return extractFirstSentence(textMatch[2].trim());
        }
      } else {
        // French comes first - extract until "/ Prerequisite" or end
        const textMatch = normalized.match(/Préalable(s)?\s*[:：]\s*(.*?)(?:\s*\/\s*Prerequisite|$)/i);
        if (textMatch && textMatch[2]) {
          return extractFirstSentence(textMatch[2].trim());
        }
      }
    }
  }

  const labelRegex = /(Prerequisite|Prerequisites|Prerequiste|Préalable|Préalables)\s*[:：]\s*/i;
  if (!labelRegex.test(normalized)) return undefined;

  const afterLabel = normalized.replace(/^(.*?)(Prerequisite|Prerequisites|Prerequiste|Préalable|Préalables)\s*[:：]\s*/i, '');
  const trimmed = afterLabel.trim();
  if (!trimmed) return undefined;

  // Find sentence boundary, but be smart about abbreviations
  // Common abbreviations that contain periods: B.Com, B.A., M.A., M.Sc., Ph.D., etc.
  // Also single letters in parentheses like (B) or (B.A.)
  let sentenceEnd = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '.') {
      // Check if this looks like an abbreviation
      const before = trimmed.slice(Math.max(0, i - 10), i);
      const after = trimmed.slice(i + 1, Math.min(trimmed.length, i + 20));
      
      // Check for common abbreviations (single letter + period + optional more letters)
      if (/\b[A-Z]$/.test(before) || /\b[A-Z]\.$/.test(before)) {
        // Could be B., M., etc. - look ahead to see if it's followed by Com, A, Sc, etc.
        if (/^[A-Za-z]/.test(after) && !/^[A-Z]/.test(after)) {
          // Likely part of abbreviation like B.Com, M.Sc.
          continue;
        }
      }
      
      // Check if period is inside parentheses - likely abbreviation
      const parenBefore = trimmed.slice(0, i).lastIndexOf('(');
      const parenAfter = trimmed.indexOf(')', i);
      if (parenBefore !== -1 && parenAfter !== -1 && parenAfter > i) {
        // Period is inside parentheses - likely abbreviation context
        const parenContent = trimmed.slice(parenBefore, parenAfter + 1);
        if (/\([A-Z][.]?\)/.test(parenContent)) {
          continue;
        }
      }
      
      // This looks like a sentence-ending period
      // Either followed by space+letter, or end of string
      // Also stop at periods before bilingual separator like " / Prerequisites:"
      const afterPeriod = trimmed.slice(i, i + 20);
      if (i === trimmed.length - 1 || /\s+[A-Z]/.test(trimmed.slice(i, i + 3)) || /\s*\/\s*(Prerequisite|Préalables)/i.test(afterPeriod)) {
        sentenceEnd = i;
        break;
      }
    }
  }
  
  const sentence = (sentenceEnd === -1 ? trimmed : trimmed.slice(0, sentenceEnd)).trim();
  return sentence || undefined;
}

// Helper function to extract first sentence from text
function extractFirstSentence(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  // Find first sentence-ending period (simplified logic)
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '.') {
      // Check if this is part of an abbreviation or decimal
      const before = trimmed.slice(Math.max(0, i - 2), i);
      const after = trimmed.slice(i + 1, Math.min(trimmed.length, i + 3));

      // Skip decimal numbers (digit.digit)
      if (/\d$/.test(before) && /^\d/.test(after)) {
        continue;
      }

      // Check for abbreviations
      if (/\s+[A-Z]/.test(trimmed.slice(i, i + 3))) {
        return trimmed.slice(0, i).trim();
      }
    }
  }

  // Strip trailing period if present
  return trimmed.replace(/\.$/, '').trim();
}

function parseCreditRequirement(text: string): number | undefined {
  // Match both English (credit/credits) and French (crédit/crédits/unit/unités)
  const match = text.match(/(\d+(?:\.\d+)?)[^0-9]*?(?:units?|cr[ée]dits?|unit[ée]s?)\b/i);
  if (!match) return undefined;
  const value = parseFloat(match[1]);
  return Number.isNaN(value) ? undefined : value;
}

function splitTopLevel(text: string, separators: RegExp): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);

    if (depth === 0) {
      const rest = text.slice(i);
      const m = rest.match(separators);
      if (m && m.index === 0) {
        if (current.trim()) parts.push(current.trim());
        current = '';
        i += m[0].length - 1;
        continue;
      }
    }

    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Remove one outer `(...)` layer when the whole string is a single balanced group. */
function stripOuterParensOnce(inner: string): string | undefined {
  if (!inner.startsWith('(') || !inner.endsWith(')')) return undefined;
  let depth2 = 0;
  let wrapsAll = true;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '(') {
      depth2++;
    } else if (ch === ')') {
      depth2--;
      if (depth2 === 0 && i < inner.length - 1) {
        wrapsAll = false;
        break;
      }
    }
    if (depth2 < 0) {
      wrapsAll = false;
      break;
    }
  }
  if (wrapsAll && depth2 === 0) {
    return inner.slice(1, -1).trim();
  }
  return undefined;
}

/**
 * "18 units in (CSI) or software engineering (SEG) at the … level" shares one credit pool across
 * discipline branches — do not emit a separate or_group per `or`.
 */
function tryMergeSharedCreditDisciplineOr(
  orParts: string[],
  fullText: string,
): CoursePrereqNode | undefined {
  if (orParts.length < 2) return undefined;
  if (orParts.some((p) => extractCourseCodes(p).length > 0)) return undefined;
  const c0 = parseCreditRequirement(orParts[0]);
  if (c0 === undefined) return undefined;
  if (!orParts.slice(1).every((p) => parseCreditRequirement(p) === undefined)) return undefined;
  const allDisciplines = Array.from(new Set(orParts.flatMap((p) => extractDisciplines(p))));
  if (allDisciplines.length === 0) return undefined;
  const levels = extractLevelsFromPrerequisiteText(fullText);
  const base: CoursePrereqNode = {
    type: 'non_course',
    credits: c0,
    disciplines: allDisciplines,
    text: fullText,
  };
  if (levels?.length) {
    return {
      ...base,
      disciplineLevels: allDisciplines.map((d) => ({ discipline: d, levels })),
    };
  }
  return base;
}

function enrichNonCourseWithLevels(node: CoursePrereqNode, sourceText: string): CoursePrereqNode {
  if (node.type !== 'non_course') return node;
  if (node.credits == null && !node.disciplines?.length) return node;
  const levels = extractLevelsFromPrerequisiteText(sourceText);
  if (!levels?.length) return node;

  if (node.disciplines?.length) {
    return {
      ...node,
      disciplineLevels: node.disciplines.map((d) => ({ discipline: d, levels })),
    };
  }
  return { ...node, levels };
}

function parsePrereqClause(clause: string): CoursePrereqNode | undefined {
  let inner = clause.replace(/\s+/g, ' ').trim();
  if (!inner) return undefined;
  
  // Skip standalone grade indicators like (M), (B+), (A-)
  if (isGradeIndicator(inner)) return undefined;

  // Detect multiple top-level parenthesized groups, e.g.
  // (ADM 1705 ou MAT 1702), (ADM 1770 ou ITI 1520)
  const groupContents: string[] = [];
  const groupRanges: Array<{ start: number; end: number }> = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '(') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === ')' && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        groupContents.push(inner.slice(start + 1, i).trim());
        groupRanges.push({ start, end: i });
        start = -1;
      }
    }
  }

  if (groupContents.length > 1) {
    let outside = '';
    let lastIndex = 0;
    for (const range of groupRanges) {
      outside += inner.slice(lastIndex, range.start);
      lastIndex = range.end + 1;
    }
    outside += inner.slice(lastIndex);
    if (outside.replace(/[,\s]+/g, '') === '') {
      const children: CoursePrereqNode[] = [];
      for (const g of groupContents) {
        const node = parsePrereqClause(g);
        if (node) children.push(node);
      }
      if (children.length === 0) return undefined;
      if (children.length === 1) return children[0];
      return {
        type: 'and_group',
        text: inner,
        children,
      };
    }
  }

  // Handle clauses like "ECO 1502, ECO 1504, (ADM 1740 ou ADM 2740)"
  // by treating comma-separated top-level segments as an implicit AND.
  // Also handles "CHM 3120, CHM 4120, CHM 4125, equivalent. or A basic knowledge..."
  if (inner.includes(',') && (inner.includes('(') || /,\s*equivalent\.?\s+or\s+/i.test(inner))) {
    const commaParts = splitTopLevel(inner, /,/);
    if (commaParts.length > 1) {
      const children: CoursePrereqNode[] = [];
      for (const part of commaParts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const node = parsePrereqClause(trimmed);
        if (node) children.push(node);
      }
      if (children.length === 0) return undefined;
      if (children.length === 1) return children[0];
      return {
        type: 'and_group',
        text: inner,
        children,
      };
    }
  }

  // Split "((X) or Y) and 12 course units in …" / "SEG 2105 and 6 university course units …"
  // at depth 0 so nested `or` inside parentheses is parsed before top-level discipline OR.
  const andParts = splitTopLevel(inner, /\s+and\s+/i);
  if (andParts.length > 1) {
    let allBoundariesValid = true;
    for (let i = 0; i < andParts.length - 1; i++) {
      if (!shouldSplitPrereqAndAt(andParts[i], andParts[i + 1])) {
        allBoundariesValid = false;
        break;
      }
    }
    if (allBoundariesValid) {
      const children: CoursePrereqNode[] = [];
      for (const part of andParts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const node = parsePrereqClause(trimmed);
        if (node) children.push(node);
      }
      if (children.length === 0) return undefined;
      if (children.length === 1) return children[0];
      return {
        type: 'and_group',
        text: inner,
        children,
      };
    }
  }

  // Strip redundant outer parentheses (e.g. `((MAT 2371, STA 2100) or STA 2391)` → inner OR at depth 0).
  while (true) {
    const peeled = stripOuterParensOnce(inner);
    if (peeled === undefined || peeled === '') break;
    inner = peeled;
  }
  if (!inner) return undefined;

  // Detect "X or Y for students enrolled in A (P1) or B (P2) programs or Z for all other students"
  const enrolledPattern =
    /^(.*?)\s+for students enrolled in\s+(.*?)\s+programs?\s+or\s+(.*?)\s+for all other students$/i;
  const enrolledMatch = inner.match(enrolledPattern);
  if (enrolledMatch) {
    const coursesText = enrolledMatch[1].trim();
    const programsText = enrolledMatch[2].trim();
    const fallbackText = enrolledMatch[3].trim();

    const programs = extractDisciplines(programsText);
    const conditionalBase = parsePrereqClause(coursesText);
    const fallbackNode = parsePrereqClause(fallbackText);

    if (!conditionalBase && !fallbackNode) return undefined;
    if (!conditionalBase) return fallbackNode;
    if (!fallbackNode) return { ...conditionalBase, programs };

    const conditionalNode: CoursePrereqNode = { ...conditionalBase, programs };
    return {
      type: 'or_group',
      text: inner,
      children: [conditionalNode, fallbackNode],
    };
  }

  const orRegex = /\s+(or|ou)\s+/i;
  const innerForOr = normalizeDisciplineOrInCredits(normalizeLevelOrDisjunction(inner));
  const hasOr = orRegex.test(innerForOr);

  if (hasOr) {
    const orParts = splitTopLevel(innerForOr, orRegex);
    const merged = tryMergeSharedCreditDisciplineOr(orParts, innerForOr);
    if (merged) return merged;

    const children: CoursePrereqNode[] = [];
    for (const part of orParts) {
      const partTrim = part.trim().replace(/^[,]+/, '').trim();
      if (!partTrim) continue;
      const codes = extractCourseCodes(partTrim);
      const credits = parseCreditRequirement(partTrim);
      const disciplines = extractDisciplines(partTrim);
      if (codes.length === 0) {
        children.push(
          enrichNonCourseWithLevels(
            {
              type: 'non_course',
              text: partTrim,
              credits,
              disciplines: disciplines.length ? disciplines : undefined,
            },
            partTrim,
          ),
        );
      } else if (codes.length === 1) {
        children.push({
          type: 'course',
          code: codes[0],
          text: partTrim,
        });
      } else {
        const childNodes: CoursePrereqNode[] = codes.map(code => ({ type: 'course', code }));
        if (credits !== undefined) {
          childNodes.push(
            enrichNonCourseWithLevels({ type: 'non_course', text: partTrim, credits }, partTrim),
          );
        }
        children.push({
          type: 'and_group',
          text: partTrim,
          children: childNodes,
        });
      }
    }
    if (children.length === 0) return undefined;
    if (children.length === 1) return children[0];
    return {
      type: 'or_group',
      text: innerForOr,
      children,
    };
  }

  const codes = extractCourseCodes(inner);
  const credits = parseCreditRequirement(inner);
  const disciplines = extractDisciplines(inner);
  if (codes.length === 0) {
    return enrichNonCourseWithLevels(
      {
        type: 'non_course',
        text: inner,
        credits,
        disciplines: disciplines.length ? disciplines : undefined,
      },
      inner,
    );
  }
  if (codes.length === 1 && credits === undefined) {
    return {
      type: 'course',
      code: codes[0],
      text: inner,
    };
  }

  const children: CoursePrereqNode[] = codes.map(code => ({ type: 'course', code }));
  if (credits !== undefined) {
    children.push(enrichNonCourseWithLevels({ type: 'non_course', text: inner, credits }, inner));
  }
  if (children.length === 1) return children[0];
  return {
    type: 'and_group',
    text: inner,
    children,
  };
}

export function parseCoursePrerequisites(text: string): CoursePrereqNode | undefined {
  const body = text.replace(/\s+/g, ' ').trim();
  if (!body) return undefined;

  // Split on semicolons or periods, but not:
  // - periods within decimal numbers (e.g., 7.5)
  // - periods in common abbreviations (e.g., B.Com, B.A. - period followed by uppercase letter)
  // - periods followed by ' or' (e.g., 'equivalent. or')
  const clauseSeparators = /;|(?<!\d)\.(?!\d)(?!\s+or\s)(?![a-z]\b)(?!\s*[A-Z])/i;
  const clauses = splitTopLevel(body, clauseSeparators);
  const clauseNodes: CoursePrereqNode[] = [];

  for (const clause of clauses) {
    if (!clause) continue;
    // Skip grade indicators like (M), (B+), (B+ or higher)
    if (isGradeIndicator(clause)) continue;
    const node = parsePrereqClause(clause);
    if (node) clauseNodes.push(node);
  }

  if (clauseNodes.length === 0) return undefined;
  if (clauseNodes.length === 1) return clauseNodes[0];

  return {
    type: 'and_group',
    children: clauseNodes,
  };
}

function parseElectiveRequirement(text: string, credits?: number): ProgramRequirement {
  const trimmed = text.replace(/^\s*(and|or)\s+/i, '').trim();

  const effectiveCredits = credits ?? parseCreditRequirement(trimmed);

  if (/free elective/i.test(trimmed)) {
    return { type: 'free_elective', title: trimmed, credits: effectiveCredits };
  }

  const orParts = trimmed.split(/;\s*or\s+/i).map(s => s.trim()).filter(Boolean);
  if (orParts.length > 1) {
    const allSubsequentLackCredits = orParts.slice(1).every(p => parseCreditRequirement(p) == null);

    if (allSubsequentLackCredits) {
      // Subsequent parts have no credit spec of their own — they share the same credit pool.
      // Collect all disciplines/courses from every part into a single pick.
      const allOptions: ProgramRequirement[] = [];
      for (const part of orParts) {
        const p = part.replace(/^\s*(and|or)\s+/i, '').trim();
        const partDisciplines = extractDisciplines(p);
        const partLevels = parseLevelsFromClause(p);
        const partCourses = extractCourseCodes(p);
        for (const d of partDisciplines) {
          allOptions.push({
            type: 'discipline_elective',
            title: `Any ${d}${partLevels ? ` at ${partLevels.join(' or ')} level` : ''}`,
            disciplineLevels: [{ discipline: d, levels: partLevels }],
          });
        }
        for (const c of partCourses) {
          allOptions.push({ type: 'course', code: c });
        }
      }
      if (allOptions.length === 1) {
        return { ...allOptions[0], credits: effectiveCredits, title: trimmed };
      }
      if (allOptions.length > 1) {
        return { type: 'pick', title: trimmed, credits: effectiveCredits, options: allOptions };
      }
      // Fall through to or_group if no disciplines/courses found in any part
    }

    return {
      type: 'or_group',
      title: 'or',
      options: orParts.map(p => parseElectiveRequirement(p, credits)),
    };
  }

  if (/non[- ]/i.test(trimmed)) {
    const exclusions: string[] = [];
    if (/computing|computer/i.test(trimmed)) exclusions.push('CEG', 'CSI', 'SEG', 'ELG');
    if (/mathematic/i.test(trimmed)) exclusions.push('MAT');
    return {
      type: 'non_discipline_elective',
      title: trimmed,
      credits: effectiveCredits,
      excluded_disciplines: exclusions.length > 0 ? exclusions : undefined,
    };
  }

  if (/Faculty of/i.test(trimmed)) {
    return { type: 'faculty_elective', title: trimmed, credits: effectiveCredits };
  }
  if (/in science/i.test(trimmed)) {
    return { type: 'faculty_elective', title: trimmed, credits: effectiveCredits, faculty: 'Science' };
  }

  const disciplines = extractDisciplines(trimmed);
  const levels = parseLevelsFromClause(trimmed);
  const explicitCourses = extractCourseCodes(trimmed);

  if (disciplines.length > 0 || explicitCourses.length > 0) {
    const options: ProgramRequirement[] = [];

    for (const d of disciplines) {
      options.push({
        type: 'discipline_elective',
        title: `Any ${d}${levels ? ` at ${levels.join(' or ')} level` : ''}`,
        disciplineLevels: [{ discipline: d, levels }],
      });
    }

    for (const c of explicitCourses) {
      options.push({ type: 'course', code: c });
    }

    if (options.length === 1) {
      return { ...options[0], credits: effectiveCredits, title: trimmed };
    }

    return {
      type: 'pick',
      title: trimmed,
      credits: effectiveCredits,
      options,
    };
  }

  return { type: 'elective', title: trimmed, credits: effectiveCredits };
}

const ProgramSchema = z.object({
  title: z.string(),
  url: z.string(),
  slug: z.string(),
  requirements: z.array(ProgramRequirementSchema),
});
export type Program = z.infer<typeof ProgramSchema>;

function urlToSlug(url: string): string {
  return url
    .replace(/^https?:\/\/catalogue\.uottawa\.ca(?:\/archive\/\d{4}-\d{4})?\/en\//, '')
    .replace(/\/$/, '');
}

const CatalogueSchema = z.object({
  courses: z.array(CourseSchema),
  programs: z.array(ProgramSchema),
});
export type Catalogue = z.infer<typeof CatalogueSchema>;

class NotFoundError extends Error {
  constructor(url: string) {
    super(`Not found (404): ${url}`);
    this.name = 'NotFoundError';
  }
}

const USE_CACHE_ONLY = process.argv.includes('use-cache');
const WRITE_CACHE = process.argv.includes('write-cache');

async function fetchHtml(url: string, retries = 3): Promise<string> {
  const cacheDir = '.cache/catalogue';
  await fs.mkdir(cacheDir, { recursive: true });

  const filename = encodeURIComponent(url.replace(/^https?:\/\//, '')) + '.html';
  const filePath = path.join(cacheDir, filename);

  if (USE_CACHE_ONLY) {
    try {
      const cached = await fs.readFile(filePath, 'utf-8');
      return cached;
    } catch {
      // not cached
      throw new Error(`Cache miss for ${url} with use-cache enabled (expected ${filePath})`);
    }
  }

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) throw new NotFoundError(url);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const text = await res.text();
      if (WRITE_CACHE) await fs.writeFile(filePath, text, 'utf-8');
      return text;
    } catch (err: unknown) {
      // Don't retry 404s
      if (err instanceof NotFoundError) throw err;
      if (i === retries - 1) throw new Error(`Failed to fetch ${url}: ${getErrorMessage(err)}`, { cause: err });
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

async function scrapeDisciplineLinks(baseUrl: string): Promise<string[]> {
  const html = await fetchHtml(`${baseUrl}/en/courses/`);
  const $ = cheerio.load(html);
  const prefix = hrefPrefix(baseUrl);
  const pattern = new RegExp(`^${prefix}/en/courses/[a-z]{3,4}/$`);
  const links: string[] = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && pattern.test(href)) {
      if (!links.includes(href)) links.push(href);
    }
  });
  return links;
}

async function scrapeProgramLinks(baseUrl: string): Promise<string[]> {
  const html = await fetchHtml(`${baseUrl}/en/programs/`);
  const $ = cheerio.load(html);
  const prefix = hrefPrefix(baseUrl);
  const links: string[] = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && (href.startsWith(`${prefix}/en/undergrad/`) || href.startsWith(`${prefix}/en/grad/`))) {
      if (!links.includes(href)) links.push(href);
    }
  });
  return links;
}

async function scrapeCourses(url: string): Promise<Course[]> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const courses: Course[] = [];

  $('.courseblock').each((_, el) => {
    const titleBlock = $(el).find('.courseblocktitle').text().replace(/\s+/g, ' ').trim();
    const descBlock = $(el).find('.courseblockdesc').text().replace(/\s+/g, ' ').trim();
    const extraBlock = $(el).find('.courseblockextra').text().replace(/\s+/g, ' ').trim();

    const prereqHighlight = $(el).find('.courseblockextra.highlight').first();
    let prereqText: string | undefined;
    let prerequisites: CoursePrereqNode | undefined;
    if (prereqHighlight.length > 0) {
      const rawPrereq = prereqHighlight.text();
      prereqText = extractPrereqSentence(rawPrereq);
      if (prereqText) {
        prerequisites = parseCoursePrerequisites(prereqText);
      }
    }

    const match = titleBlock.match(/^([A-Z]{3,4}\s*\d{4,5}[A-Z]?)\s+(.*)$/i);

    if (!match) {
      throw new Error(`Failed to parse course title block: "${titleBlock}" at ${url}`);
    }

    const code = match[1].replace(/\s+/, ' ');
    let title = match[2];
    let credits = 0;

    const creditsMatch = title.match(/\(([^)]*?(?:units?|crédits?|crédit)[^)]*)\)$/i);
    if (creditsMatch) {
      title = title.substring(0, creditsMatch.index).trim();
      const numMatch = creditsMatch[1].match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        credits = parseFloat(numMatch[1]);
      }
    }

    const componentMatch = extraBlock.match(/(?:Course Component|Volet)\s*:\s*(.*)/i);
    const component = componentMatch ? componentMatch[1] : undefined;

    const aliasSource = [component, descBlock].filter(Boolean).join(' ');
    const aliases = extractPreviouslyAliases(aliasSource, code);

    courses.push(CourseSchema.parse({
      code,
      title,
      credits,
      description: descBlock,
      component,
      ...(aliases.length > 0 ? { aliases } : {}),
      prereqText,
      prerequisites,
    }));
  });

  return courses;
}

function parseUnits(text: string): number | undefined {
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (match) return parseFloat(match[1]);
  return undefined;
}

async function scrapeProgram(url: string): Promise<Program> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const title = $('#page-title-area>h1, h1.page-title').first().text().replace(/\s+/g, ' ').trim();

  const requirements: ProgramRequirement[] = [];
  let currentGroup: ProgramRequirement | null = null;

  $('table.sc_courselist tr').each((_, el) => {
    const rowClass = $(el).attr('class') || '';
    if (rowClass.includes('listsum')) return;

    const isIndented = $(el).find('div[style*="margin-left"]').length > 0 ||
      $(el).find('.blockind').length > 0 ||
      $(el).find('.commentindent').length > 0;

    const isHeaderRow = $(el).find('th').length > 0;
    const isSectionHeader = $(el).find('.areaheader').length > 0;

    if (isHeaderRow) {
      if (isSectionHeader) {
        currentGroup = null;
        requirements.push(ProgramRequirementSchema.parse({
          type: 'section',
          title: $(el).text().replace(/\s+/g, ' ').trim(),
          indented: isIndented || undefined,
        }));
      }
      return;
    }

    if (isSectionHeader) {
      currentGroup = null;
      requirements.push(ProgramRequirementSchema.parse({
        type: 'section',
        title: $(el).text().replace(/\s+/g, ' ').trim(),
        indented: isIndented || undefined,
      }));
      return;
    }

    let code = $(el).find('td.codecol').text().replace(/\s+/g, ' ').trim();
    const rowTitle = $(el).find('td.titlecol').text().replace(/\s+/g, ' ').trim();
    const hours = $(el).find('td.hourscol').text().replace(/\s+/g, ' ').trim();
    const credits = hours ? parseUnits(hours) : undefined;

    let isOr = false;
    if ($(el).find('.orclass').length > 0) isOr = true;
    if (code.startsWith('or ')) {
      isOr = true;
      code = code.substring(3).trim();
    }

    const isComment = $(el).find('.courselistcomment').length > 0;

    if (isComment) {
      const commentText = $(el).find('.courselistcomment').text().replace(/\s+/g, ' ').trim();
      const parsedNode = parseElectiveRequirement(commentText, credits);
      const parsedWithIndent: ProgramRequirement = {
        ...parsedNode,
        indented: isIndented || undefined,
      };

      if (isIndented && currentGroup && currentGroup.options) {
        currentGroup.options.push(parsedWithIndent);
      } else {
        if (commentText.endsWith(':') || commentText.toLowerCase().includes('from:')) {
          currentGroup = {
            type: 'group',
            title: commentText,
            credits,
            options: [],
            indented: isIndented || undefined,
          };
          requirements.push(currentGroup);
        } else {
          currentGroup = null;
          requirements.push(parsedWithIndent);
        }
      }
      return;
    }

    if (code) {
      const courseReq: ProgramRequirement = {
        type: isOr ? 'or_course' : 'course',
        code,
        title: rowTitle || undefined,
        credits,
        indented: isIndented || undefined,
      };

      if (isIndented && currentGroup && currentGroup.options) {
        currentGroup.options.push(courseReq);
      } else {
        currentGroup = null;
        requirements.push(courseReq);
      }
    } else if (rowTitle || hours) {
      const parsedNode = parseElectiveRequirement(rowTitle, credits);
      const parsedWithIndent: ProgramRequirement = {
        ...parsedNode,
        indented: isIndented || undefined,
      };
      if (isIndented && currentGroup && currentGroup.options) {
        currentGroup.options.push(parsedWithIndent);
      } else {
        currentGroup = null;
        requirements.push(parsedWithIndent);
      }
    }
  });

  return ProgramSchema.parse({
    title,
    url,
    slug: urlToSlug(url),
    requirements,
  });
}

function processRequirements(reqs: ProgramRequirement[]): ProgramRequirement[] {
  const cleaned = reqs.map(r => {
    const newR: ProgramRequirement = { ...r };
    if (newR.type === 'group' && (!newR.options || newR.options.length === 0)) {
      newR.type = 'elective';
      delete newR.options;
    }
    if (newR.options && newR.options.length === 0) {
      delete newR.options;
    }
    const withoutUndefined = Object.fromEntries(
      Object.entries(newR).filter(([, value]) => value !== undefined),
    );
    return withoutUndefined as ProgramRequirement;
  });

  const foldedOptions: ProgramRequirement[] = [];
  let currentOptionsGroup: ProgramRequirement | null = null;
  let currentOptionList: ProgramRequirement[] | null = null;

  for (let i = 0; i < cleaned.length; i++) {
    const r = cleaned[i];

    if ((r.type === 'elective' || r.type === 'group' || r.type === 'section') && r.title && r.title.toLowerCase().includes('option from the following')) {
      currentOptionsGroup = {
        type: 'options_group',
        title: r.title,
        credits: r.credits,
        options: [],
      };
      foldedOptions.push(currentOptionsGroup);
      continue;
    }

    if (r.type === 'section' && r.title && r.title.toLowerCase().startsWith('option ')) {
      if (!currentOptionsGroup) {
        currentOptionsGroup = {
          type: 'options_group',
          title: 'Options',
          options: [],
        };
        foldedOptions.push(currentOptionsGroup);
      }

      currentOptionList = [];
      currentOptionsGroup.options!.push({
        type: 'and',
        title: r.title,
        options: currentOptionList,
      });
      continue;
    }

    if (currentOptionList) {
      if (r.type === 'section') {
        // A new section always terminates the current options group.
        currentOptionsGroup = null;
        currentOptionList = null;
        foldedOptions.push(r);
      } else if (r.indented) {
        // Still visually indented under the current option; keep collecting.
        currentOptionList.push(r);
      } else {
        // First non-indented row after an option: end all option grouping and
        // treat subsequent rows as top-level requirements.
        currentOptionsGroup = null;
        currentOptionList = null;
        foldedOptions.push(r);
      }
    } else {
      foldedOptions.push(r);
    }
  }

  const foldedSections: ProgramRequirement[] = [];
  let currentSection: ProgramRequirement | null = null;

  for (let i = 0; i < foldedOptions.length; i++) {
    const r = foldedOptions[i];

    if (r.type === 'section') {
      if (r.title && r.title.toLowerCase() === 'or') {
        const last = foldedSections.pop();
        const orGroup: ProgramRequirement = {
          type: 'or_group',
          options: last ? [last] : [],
        };
        foldedSections.push(orGroup);
        currentSection = { type: 'and', title: 'Alternative', options: [] };
        orGroup.options!.push(currentSection);
      } else {
        currentSection = {
          type: 'and',
          title: r.title,
          options: [],
        };
        foldedSections.push(currentSection);
      }
    } else {
      if (currentSection) {
        currentSection.options!.push(r);
      } else {
        foldedSections.push(r);
      }
    }
  }

  return foldedSections;
}

async function scrapeYearCatalogue(baseUrl: string): Promise<{ catalogue: Catalogue; missingUrls: string[] }> {
  const disciplineLinks = await scrapeDisciplineLinks(baseUrl);
  const programLinks = await scrapeProgramLinks(baseUrl);

  const limit = pLimit(10);
  const missingUrls: string[] = [];

  const allCourses: Course[] = [];
  const coursePromises = disciplineLinks.map(link => limit(async () => {
    // hrefs are root-relative paths, so always use ROOT_URL as the domain
    const url = `${ROOT_URL}${link}`;
    try {
      const courses = await scrapeCourses(url);
      allCourses.push(...courses);
    } catch (e: unknown) {
      if (e instanceof NotFoundError) {
        console.warn(`Skipping missing course page: ${url}`);
        missingUrls.push(url);
      } else {
        console.error(`Error scraping courses at ${url}: ${getErrorMessage(e)}`);
        throw e;
      }
    }
  }));

  const allPrograms: Program[] = [];
  const programPromises = programLinks.map(link => limit(async () => {
    const url = `${ROOT_URL}${link}`;
    try {
      const prog = await scrapeProgram(url);
      allPrograms.push(prog);
    } catch (e: unknown) {
      if (e instanceof NotFoundError) {
        console.warn(`Skipping missing program: ${url}`);
        missingUrls.push(url);
      } else {
        console.error(`Error scraping program at ${url}: ${getErrorMessage(e)}`);
        throw e;
      }
    }
  }));

  await Promise.all([...coursePromises, ...programPromises]);

  allCourses.sort((a, b) => a.code.localeCompare(b.code));
  allPrograms.sort((a, b) => a.url.localeCompare(b.url));

  const catalogue = CatalogueSchema.parse({
    courses: allCourses,
    programs: allPrograms.map(p => ({
      ...p,
      requirements: processRequirements(p.requirements),
    })),
  });

  return { catalogue, missingUrls };
}

async function scrapeYear(year: number, dataDir: string, force: boolean): Promise<string[]> {
  const outPath = path.join(dataDir, `catalogue.${year}.json`);

  if (!force) {
    try {
      await fs.access(outPath);
      console.log(`Skipping catalogue.${year}.json (already exists)`);
      return [];
    } catch {
      // file doesn't exist, proceed with scraping
    }
  }

  const baseUrl = buildBaseUrl(year);
  console.log(`\nScraping ${year}-${year + 1} from ${baseUrl}...`);

  const { catalogue, missingUrls } = await scrapeYearCatalogue(baseUrl);

  await fs.writeFile(outPath, JSON.stringify(catalogue, null, 2), 'utf-8');
  console.log(
    `Saved catalogue.${year}.json (${catalogue.courses.length} courses, ${catalogue.programs.length} programs)` +
    (missingUrls.length ? ` — ${missingUrls.length} missing (404)` : '')
  );

  return missingUrls;
}

function parseIndicesStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string');
}

function parseMissingByYear(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [year, urls] of Object.entries(value)) {
    out[year] = parseIndicesStringArray(urls);
  }
  return out;
}

const CATALOGUE_JSON_RE = /^catalogue\.(\d{4})\.json$/;

async function generateIndices(dataDir: string): Promise<void> {
  const indicesPath = path.join(dataDir, 'indices.json');
  let existingCourses: string[] = [];
  let existingPrograms: string[] = [];
  try {
    const rawExisting = await fs.readFile(indicesPath, 'utf-8');
    const parsed: unknown = JSON.parse(rawExisting);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const o = parsed as Record<string, unknown>;
      existingCourses = parseIndicesStringArray(o.courses);
      existingPrograms = parseIndicesStringArray(o.programs);
    }
  } catch {
    // Missing or unreadable file — start fresh
  }

  const dirEntries = await fs.readdir(dataDir);
  const catalogueYears = dirEntries
    .map(name => {
      const m = CATALOGUE_JSON_RE.exec(name);
      return m ? Number(m[1]) : null;
    })
    .filter((y): y is number => y !== null)
    .sort((a, b) => a - b);

  const seenCourses = new Set(existingCourses);
  const coursesOut = [...existingCourses];
  const seenPrograms = new Set(existingPrograms);
  const programsOut = [...existingPrograms];

  for (const y of catalogueYears) {
    const raw = await fs.readFile(path.join(dataDir, `catalogue.${y}.json`), 'utf-8');
    const catalogue = CatalogueSchema.parse(JSON.parse(raw) as unknown);
    for (const c of catalogue.courses) {
      const code = c.code;
      if (!seenCourses.has(code)) {
        seenCourses.add(code);
        coursesOut.push(code);
      }
    }
    for (const p of catalogue.programs) {
      const slug = p.slug ?? urlToSlug(p.url);
      if (!seenPrograms.has(slug)) {
        seenPrograms.add(slug);
        programsOut.push(slug);
      }
    }
  }

  const newCourses = coursesOut.length - existingCourses.length;
  const newPrograms = programsOut.length - existingPrograms.length;
  await fs.writeFile(
    indicesPath,
    JSON.stringify({ courses: coursesOut, programs: programsOut }, null, 2),
    'utf-8',
  );
  console.log(
    `\nWrote indices.json (${coursesOut.length} courses, ${programsOut.length} programs; +${newCourses} courses, +${newPrograms} programs appended from ${catalogueYears.length} catalogue file(s))`,
  );
}

async function main() {
  const currentYear = getCurrentAcademicYear();
  const dataDir = '../web/public/data';
  await fs.mkdir(dataDir, { recursive: true });

  // Load existing missing-URLs log so we can merge into it
  const missingPath = path.join(dataDir, 'catalogue.missing.json');
  let missingByYear: Record<string, string[]> = {};
  try {
    const raw = await fs.readFile(missingPath, 'utf-8');
    missingByYear = parseMissingByYear(JSON.parse(raw) as unknown);
  } catch {
    // No existing file — start fresh
  }

  // Scrape archive years (skip if already present)
  for (let year = OLDEST_YEAR; year < currentYear; year++) {
    const missing = await scrapeYear(year, dataDir, false);
    if (missing.length) missingByYear[String(year)] = missing.sort();
  }

  // Always re-scrape the current year
  const currentMissing = await scrapeYear(currentYear, dataDir, true);
  if (currentMissing.length) {
    missingByYear[String(currentYear)] = currentMissing.sort();
  } else {
    delete missingByYear[String(currentYear)];
  }

  // Write the missing-URLs log
  await fs.writeFile(missingPath, JSON.stringify(missingByYear, null, 2), 'utf-8');
  const totalMissing = Object.values(missingByYear).reduce((n, urls) => n + urls.length, 0);
  if (totalMissing > 0) {
    console.log(`\nWrote catalogue.missing.json (${totalMissing} missing URLs across ${Object.keys(missingByYear).length} year(s))`);
  }

  // Write the manifest
  const years: number[] = [];
  for (let y = currentYear; y >= OLDEST_YEAR; y--) years.push(y);
  await fs.writeFile(
    path.join(dataDir, 'catalogue.json'),
    JSON.stringify({ years }, null, 2),
    'utf-8',
  );
  console.log(`\nWrote catalogue.json manifest: years ${currentYear}–${OLDEST_YEAR}`);

  await generateIndices(dataDir);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error('\nScrape failed!');
    console.error(e);
    process.exit(1);
  });
}
