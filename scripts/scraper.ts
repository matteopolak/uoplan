import * as cheerio from 'cheerio';
import { z } from 'zod';
import pLimit from 'p-limit';
import fs from 'fs/promises';
import path from 'path';

const BASE_URL = 'https://catalogue.uottawa.ca';

const CourseSchema = z.object({
  code: z.string(),
  title: z.string(),
  credits: z.number(),
  description: z.string(),
  component: z.string().optional(),
});
export type Course = z.infer<typeof CourseSchema>;

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

function parseElectiveRequirement(text: string, credits?: number): ProgramRequirement {
  const trimmed = text.replace(/^\s*(and|or)\s+/i, '').trim();

  if (/free elective/i.test(trimmed)) {
    return { type: 'free_elective', title: trimmed, credits };
  }

  const orParts = trimmed.split(/;\s*or\s+/i).map(s => s.trim()).filter(Boolean);
  if (orParts.length > 1) {
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
      credits,
      excluded_disciplines: exclusions.length > 0 ? exclusions : undefined,
    };
  }

  if (/Faculty of/i.test(trimmed)) {
    return { type: 'faculty_elective', title: trimmed, credits };
  }
  if (/in science/i.test(trimmed)) {
    return { type: 'faculty_elective', title: trimmed, credits, faculty: 'Science' };
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
      return { ...options[0], credits, title: trimmed };
    }

    return {
      type: 'pick',
      title: trimmed,
      credits,
      options,
    };
  }

  return { type: 'elective', title: trimmed, credits };
}

const ProgramSchema = z.object({
  title: z.string(),
  url: z.string(),
  requirements: z.array(ProgramRequirementSchema),
});
export type Program = z.infer<typeof ProgramSchema>;

const CatalogueSchema = z.object({
  courses: z.array(CourseSchema),
  programs: z.array(ProgramSchema),
});
export type Catalogue = z.infer<typeof CatalogueSchema>;

const USE_CACHE_ONLY = process.argv.includes('use-cache');

async function fetchHtml(url: string, retries = 3): Promise<string> {
  const cacheDir = '.cache/catalogue';
  await fs.mkdir(cacheDir, { recursive: true });

  const filename = encodeURIComponent(url.replace(/^https?:\/\//, '')) + '.html';
  const filePath = path.join(cacheDir, filename);

  try {
    const cached = await fs.readFile(filePath, 'utf-8');
    return cached;
  } catch {
    // not cached
    if (USE_CACHE_ONLY) {
      throw new Error(`Cache miss for ${url} with use-cache enabled (expected ${filePath})`);
    }
  }

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const text = await res.text();
      await fs.writeFile(filePath, text, 'utf-8');
      return text;
    } catch (err: any) {
      if (i === retries - 1) throw new Error(`Failed to fetch ${url}: ${err.message}`);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

async function scrapeDisciplineLinks(): Promise<string[]> {
  const html = await fetchHtml(`${BASE_URL}/en/courses/`);
  const $ = cheerio.load(html);
  const links: string[] = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && /^\/en\/courses\/[a-z]{3,4}\/$/.test(href)) {
      if (!links.includes(href)) links.push(href);
    }
  });
  return links;
}

async function scrapeProgramLinks(): Promise<string[]> {
  const html = await fetchHtml(`${BASE_URL}/en/programs/`);
  const $ = cheerio.load(html);
  const links: string[] = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && (href.startsWith('/en/undergrad/') || href.startsWith('/en/grad/'))) {
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
  const title = $('h1').first().text().replace(/\s+/g, ' ').trim();

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

async function main() {
  console.log('Fetching course disciplines...');
  const disciplineLinks = await scrapeDisciplineLinks();
  console.log(`Found ${disciplineLinks.length} disciplines.`);

  console.log('Fetching program links...');
  const programLinks = await scrapeProgramLinks();
  console.log(`Found ${programLinks.length} programs.`);

  const limit = pLimit(10);

  console.log('Scraping courses...');
  const allCourses: Course[] = [];
  const coursePromises = disciplineLinks.map(link => limit(async () => {
    const url = `${BASE_URL}${link}`;
    try {
      const courses = await scrapeCourses(url);
      allCourses.push(...courses);
    } catch (e: any) {
      console.error(`Error scraping courses at ${url}: ${e.message}`);
      throw e;
    }
  }));

  console.log('Scraping programs...');
  const allPrograms: Program[] = [];
  const programPromises = programLinks.map(link => limit(async () => {
    const url = `${BASE_URL}${link}`;
    try {
      const prog = await scrapeProgram(url);
      allPrograms.push(prog);
    } catch (e: any) {
      console.error(`Error scraping program at ${url}: ${e.message}`);
      throw e;
    }
  }));

  await Promise.all([...coursePromises, ...programPromises]);

  const catalogue = CatalogueSchema.parse({
    courses: allCourses,
    programs: allPrograms.map(p => ({
      ...p,
      requirements: processRequirements(p.requirements),
    })),
  });

  await fs.writeFile('public/data/catalogue.json', JSON.stringify(catalogue, null, 2));
  console.log(`Successfully saved ${allCourses.length} courses and ${allPrograms.length} programs to public/data/catalogue.json`);
}

main().catch(e => {
  console.error('\nScrape failed!');
  console.error(e);
  process.exit(1);
});

