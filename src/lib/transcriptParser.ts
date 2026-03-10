import { normalizeCourseCode } from './dataCache';

/** Course code pattern: 3–4 letters + 4–5 digits, optional letter suffix (e.g. ADM 1100, ESL 2121) */
const COURSE_CODE_REGEX = /([A-Z]{3,4})\s*(\d{4,5}[A-Z]?)/gi;

/** Y-coordinate tolerance for grouping text items into the same row (PDF units) */
const ROW_Y_TOLERANCE = 3;

let workerInitialized = false;

async function ensureWorker(): Promise<void> {
  if (workerInitialized) return;
  const [pdfjsLib, workerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?url').then((m) => m.default),
  ]);
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  workerInitialized = true;
}

interface TextItemWithPosition {
  str: string;
  x: number;
  y: number;
}

/**
 * Extract course codes from PDF text using table structure:
 * group items by row (y), sort by x, take first two columns as category + number.
 */
function extractCodesFromPositions(items: TextItemWithPosition[]): string[] {
  const codes: string[] = [];
  if (items.length === 0) return codes;

  const byRow = new Map<number, TextItemWithPosition[]>();
  for (const item of items) {
    const y = item.y;
    let rowKey: number | null = null;
    for (const key of byRow.keys()) {
      if (Math.abs(key - y) <= ROW_Y_TOLERANCE) {
        rowKey = key;
        break;
      }
    }
    if (rowKey == null) rowKey = y;
    const row = byRow.get(rowKey) ?? [];
    row.push(item);
    byRow.set(rowKey, row);
  }

  for (const row of byRow.values()) {
    row.sort((a, b) => a.x - b.x);
    const category = row[0]?.str?.trim() ?? '';
    const number = row[1]?.str?.trim() ?? '';
    const combined = `${category} ${number}`.trim();
    if (!combined) continue;
    const normalized = normalizeCourseCode(combined);
    if (/^[A-Z]{3,4}\s+\d{4,5}[A-Z]?$/i.test(normalized)) {
      codes.push(normalized);
    }
  }
  return codes;
}

/**
 * Fallback: find all course-code-like substrings in full page text.
 */
function extractCodesFromText(text: string): string[] {
  const codes: string[] = [];
  let m: RegExpExecArray | null;
  COURSE_CODE_REGEX.lastIndex = 0;
  while ((m = COURSE_CODE_REGEX.exec(text)) !== null) {
    const normalized = normalizeCourseCode(`${m[1]} ${m[2]}`);
    codes.push(normalized);
  }
  return codes;
}

export interface TranscriptParseResult {
  courses: string[];
  fullText: string;
}

/**
 * Parse an unofficial transcript PDF (client-side). Returns unique course codes and full text for program matching.
 * Uses first-two-columns table extraction when positions are available,
 * otherwise falls back to regex on full text.
 */
export async function parseTranscriptPdf(arrayBuffer: ArrayBuffer): Promise<TranscriptParseResult> {
  await ensureWorker();
  const pdfjsLib = await import('pdfjs-dist');
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const allCodes = new Set<string>();
  const textParts: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const itemsWithPosition: TextItemWithPosition[] = [];
    let hasPosition = false;

    for (const item of textContent.items as Array<{ str: string; transform?: number[] }>) {
      const str = item.str ?? '';
      if (!str.trim()) continue;
      const transform = item.transform;
      if (transform && transform.length >= 6) {
        hasPosition = true;
        itemsWithPosition.push({
          str,
          x: transform[4],
          y: transform[5],
        });
      } else {
        itemsWithPosition.push({ str, x: 0, y: 0 });
      }
    }

    const pageText = (textContent.items as unknown[])
      .map((it) => {
        if (it && typeof it === 'object' && 'str' in it) {
          const s = (it as { str?: unknown }).str;
          return typeof s === 'string' ? s : '';
        }
        return '';
      })
      .join(' ');
    textParts.push(pageText);

    if (hasPosition && itemsWithPosition.length > 0) {
      const fromPositions = extractCodesFromPositions(itemsWithPosition);
      fromPositions.forEach((c) => allCodes.add(c));
    }

    const fromText = extractCodesFromText(pageText);
    fromText.forEach((c) => allCodes.add(c));
  }

  return {
    courses: [...allCodes],
    fullText: textParts.join('\n'),
  };
}

/** Levenshtein distance between two strings */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= m; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[m][n];
}

/** Normalized similarity: 1 = exact match, 0 = max distance. Uses max length so short strings aren't over-penalized. */
function normalizedSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length, 1);
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

/** Semester header pattern: e.g. "2022 Fall Term", "2024 Winter Term", "2024 Spring/Summer Term" */
const SEMESTER_HEADER =
  /\b\d{4}\s+(?:Fall|Winter|Spring|Summer)(?:\s*\/\s*Summer)?\s*Term\b/im;

/**
 * Return the last semester segment of the transcript (from the last semester header to end).
 * So we use the most recent term's program, not an earlier one.
 */
function getLastSemesterSegment(transcriptText: string): string {
  const lines = transcriptText.split(/\r?\n/);
  let lastHeaderIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (SEMESTER_HEADER.test(lines[i])) {
      lastHeaderIndex = i;
    }
  }
  return lines.slice(lastHeaderIndex).join('\n');
}

/**
 * In a semester segment, extract the program name between "Term" and "Course".
 * Example: "... 2026 Winter Term Honours Bachelor of Science in Computer Science  Course Description ..."
 * -> "Honours Bachelor of Science in Computer Science"
 */
function extractProgramBetweenTermAndCourse(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/Term\s+(.+?)\s+Course\b/i);
  if (!match) return null;
  const fragment = match[1]
    .replace(/\s+/g, ' ')
    .trim()
    // Only shorten "Bachelor(s) of X" when preceded by "Honours"
    // Replace with "B" + first two letters after "of" (e.g. "Honours Bachelor of Science" -> "Honours BSc")
    .replace(
      /\b(Honours)\s+(?:Bachelor(?:'s)?|Bachelors)\s+of\s+([A-Za-z]{2})[A-Za-z]*\b/gi,
      (_m, honours: string, two: string) =>
        `${honours} B${two[0]?.toUpperCase() ?? ''}${two[1]?.toLowerCase() ?? ''}`
    )
    .replace(/\bin\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return fragment.length >= 5 ? fragment : null;
}

/**
 * Build candidate strings from text so titles broken across multiple lines can match.
 * Returns overlapping chunks of 1, 2, 3, 4 consecutive lines joined with space.
 */
function buildMultilineCandidates(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const candidates: string[] = [];
  const maxWindow = 4;
  for (let w = 1; w <= maxWindow; w++) {
    for (let i = 0; i <= lines.length - w; i++) {
      const chunk = lines
        .slice(i, i + w)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (chunk.length >= 5 && chunk.length <= 250) {
        candidates.push(chunk);
      }
    }
  }
  return [...new Set(candidates)];
}

/**
 * Find the program whose title best matches the transcript text (e.g. from PDF).
 * Uses the *last* semester segment only (most recent term). Builds multi-line candidates
 * so titles broken across lines (e.g. "Honours BSc" on one line, "Computer Science" on next) still match.
 * Uses Levenshtein distance for fuzzy matching.
 */
export function findBestMatchingProgram<T extends { title: string }>(
  transcriptText: string,
  programs: T[]
): T | null {
  if (programs.length === 0 || !transcriptText.trim()) return null;

  const segment = getLastSemesterSegment(transcriptText);
  const searchText = segment.trim().length >= 20 ? segment : transcriptText;

  // 1) Try strict extraction between "Term" and "Course" in the last semester segment.
  const fragment = extractProgramBetweenTermAndCourse(searchText);
  console.log({fragment});
  if (fragment) {
    const fragLower = fragment.toLowerCase();
    let bestProgramFromFragment: T | null = null;
    let bestFragmentScore = 0;

    for (const program of programs) {
      const title = program.title.trim();
      if (!title) continue;
      const titleLower = title.toLowerCase();

      let score = 0;
      if (fragLower.includes(titleLower) || titleLower.includes(fragLower)) {
        score = 1;
      } else {
        score = normalizedSimilarity(titleLower, fragLower);
      }

      if (score > bestFragmentScore) {
        bestFragmentScore = score;
        bestProgramFromFragment = program;
      }
    }

    // If we have a reasonably strong match from the explicit fragment, use it.
    if (bestProgramFromFragment && bestFragmentScore >= 0.6) {
      return bestProgramFromFragment;
    }
  }

  // 2) Fallback: multi-line and window-based fuzzy matching on the last segment.
  const candidates = buildMultilineCandidates(searchText);

  let bestProgram: T | null = null;
  let bestScore = 0;

  for (const program of programs) {
    const title = program.title.trim();
    if (!title) continue;

    let score = 0;
    const titleLower = title.toLowerCase();

    for (const chunk of candidates) {
      const sim = normalizedSimilarity(titleLower, chunk.toLowerCase());
      if (sim > score) score = sim;
    }

    if (score < 0.5) {
      const windowLen = Math.min(title.length + 30, searchText.length);
      for (let i = 0; i <= searchText.length - windowLen; i += 3) {
        const raw = searchText.slice(i, i + windowLen);
        const chunk = raw.replace(/\s+/g, ' ').trim();
        if (chunk.length >= 5) {
          const sim = normalizedSimilarity(titleLower, chunk.toLowerCase());
          if (sim > score) score = sim;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestProgram = program;
    }
  }

  return bestScore >= 0.5 ? bestProgram : null;
}
