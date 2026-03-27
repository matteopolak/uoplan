import * as cheerio from 'cheerio';
import { z } from 'zod';
import pLimit from 'p-limit';
import fs from 'fs/promises';
import path from 'path';

const ROOT_URL = 'https://catalogue.uottawa.ca';
const OLDEST_YEAR = 2017;

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

type CoursePrereqNode = {
  type: 'course' | 'or_group' | 'and_group' | 'non_course';
  code?: string;
  text?: string;
  credits?: number;
  disciplines?: string[];
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

function parseLevelsFromClause(text: string): number[] | undefined {
  const levels: number[] = [];
  const re = /at the ([^.;]*) level/i;
  const m = text.match(re);
  if (!m) return undefined;
  const nums = m[1].match(/\b(\d{4})\b/g);
  if (!nums) return undefined;
  for (const n of nums) levels.push(parseInt(n, 10));
  return levels.length > 0 ? levels : undefined;
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

function extractPrereqSentence(raw: string): string | undefined {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;

  const labelRegex = /(Prerequisite|Prerequisites|Prerequiste|Préalable|Préalables)\s*[:：]\s*/i;
  if (!labelRegex.test(normalized)) return undefined;

  const afterLabel = normalized.replace(/^.*?(Prerequisite|Prerequisites|Prerequiste|Préalable|Préalables)\s*[:：]\s*/i, '');
  const trimmed = afterLabel.trim();
  if (!trimmed) return undefined;

  const dotIndex = trimmed.indexOf('.');
  const sentence = (dotIndex === -1 ? trimmed : trimmed.slice(0, dotIndex)).trim();
  return sentence || undefined;
}

function parseCreditRequirement(text: string): number | undefined {
  const match = text.match(/(\d+(?:\.\d+)?)[^0-9]*?(?:units?|crédits?|crédit)\b/i);
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

function parsePrereqClause(clause: string): CoursePrereqNode | undefined {
  let inner = clause.replace(/\s+/g, ' ').trim();
  if (!inner) return undefined;

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
  if (inner.includes(',') && inner.includes('(') && inner.includes(')')) {
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

  // If the whole clause is wrapped in a single pair of parentheses, strip them.
  if (inner.startsWith('(') && inner.endsWith(')')) {
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
      inner = inner.slice(1, -1).trim();
      if (!inner) return undefined;
    }
  }

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
  const hasOr = orRegex.test(inner);

  if (hasOr) {
    const orParts = splitTopLevel(inner, orRegex);
    const children: CoursePrereqNode[] = [];
    for (const part of orParts) {
      const partTrim = part.trim().replace(/^[,]+/, '').trim();
      if (!partTrim) continue;
      const codes = extractCourseCodes(partTrim);
      const credits = parseCreditRequirement(partTrim);
      const disciplines = extractDisciplines(partTrim);
      if (codes.length === 0) {
        children.push({
          type: 'non_course',
          text: partTrim,
          credits,
          disciplines: disciplines.length ? disciplines : undefined,
        });
      } else if (codes.length === 1) {
        children.push({
          type: 'course',
          code: codes[0],
          text: partTrim,
        });
      } else {
        const childNodes: CoursePrereqNode[] = codes.map(code => ({ type: 'course', code }));
        if (credits !== undefined) {
          childNodes.push({
            type: 'non_course',
            text: partTrim,
            credits,
          });
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
      text: inner,
      children,
    };
  }

  const codes = extractCourseCodes(inner);
  const credits = parseCreditRequirement(inner);
  const disciplines = extractDisciplines(inner);
  if (codes.length === 0) {
    return {
      type: 'non_course',
      text: inner,
      credits,
      disciplines: disciplines.length ? disciplines : undefined,
    };
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
    children.push({
      type: 'non_course',
      text: inner,
      credits,
    });
  }
  if (children.length === 1) return children[0];
  return {
    type: 'and_group',
    text: inner,
    children,
  };
}

function parseCoursePrerequisites(text: string): CoursePrereqNode | undefined {
  const body = text.replace(/\s+/g, ' ').trim();
  if (!body) return undefined;

  const clauseSeparators = /[.;]+/;
  const clauses = splitTopLevel(body, clauseSeparators);
  const clauseNodes: CoursePrereqNode[] = [];

  for (const clause of clauses) {
    if (!clause) continue;
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
    } catch (err: any) {
      // Don't retry 404s
      if (err instanceof NotFoundError) throw err;
      if (i === retries - 1) throw new Error(`Failed to fetch ${url}: ${err.message}`);
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

    courses.push(CourseSchema.parse({
      code,
      title,
      credits,
      description: descBlock,
      component,
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
  let cleaned = reqs.map(r => {
    const newR: ProgramRequirement = { ...r };
    if (newR.type === 'group' && (!newR.options || newR.options.length === 0)) {
      newR.type = 'elective';
      delete newR.options;
    }
    if (newR.options && newR.options.length === 0) {
      delete newR.options;
    }
    Object.keys(newR).forEach(key => {
      if ((newR as any)[key] === undefined) {
        delete (newR as any)[key];
      }
    });
    return newR;
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
    } catch (e: any) {
      if (e instanceof NotFoundError) {
        console.warn(`Skipping missing course page: ${url}`);
        missingUrls.push(url);
      } else {
        console.error(`Error scraping courses at ${url}: ${e.message}`);
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
    } catch (e: any) {
      if (e instanceof NotFoundError) {
        console.warn(`Skipping missing program: ${url}`);
        missingUrls.push(url);
      } else {
        console.error(`Error scraping program at ${url}: ${e.message}`);
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

async function generateIndices(year: number, dataDir: string): Promise<void> {
  const raw = await fs.readFile(path.join(dataDir, `catalogue.${year}.json`), 'utf-8');
  const catalogue = JSON.parse(raw);
  const indices = {
    courses: (catalogue.courses as Array<{ code: string }>).map(c => c.code),
    programs: (catalogue.programs as Array<{ slug?: string; url: string }>).map(
      p => p.slug ?? urlToSlug(p.url),
    ),
  };
  await fs.writeFile(path.join(dataDir, 'indices.json'), JSON.stringify(indices, null, 2), 'utf-8');
  console.log(`\nWrote indices.json (${indices.courses.length} courses, ${indices.programs.length} programs)`);
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
    missingByYear = JSON.parse(raw);
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
    JSON.stringify({ years }),
    'utf-8',
  );
  console.log(`\nWrote catalogue.json manifest: years ${currentYear}–${OLDEST_YEAR}`);

  await generateIndices(currentYear, dataDir);
}

main().catch(e => {
  console.error('\nScrape failed!');
  console.error(e);
  process.exit(1);
});
