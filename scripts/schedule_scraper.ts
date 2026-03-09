import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import got, { type Got } from 'got';
import { CookieJar } from 'tough-cookie';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL =
  'https://uocampus.public.uottawa.ca/psc/csprpr9pub/EMPLOYEE/SA/c/UO_SR_AA_MODS.UO_PUB_CLSSRCH.GBL';
const MAX_CONCURRENCY = 10;

// Default to the currently selected term on the search page (2026 Winter Term as of 2026-03-09)
const DEFAULT_TERM_ID: string = process.env.UOTTAWA_TERM_ID || '2261';

interface CatalogueCourse {
  code: string;
}

interface ParsedCourseCode {
  subject: string;
  catalogNbr: string;
  code: string;
}

type DayOfWeek = 'Mo' | 'Tu' | 'We' | 'Th' | 'Fr' | 'Sa' | 'Su';

interface MeetingTime {
  day: DayOfWeek;
  startMinutes: number;
  endMinutes: number;
}

type MeetingDateRange = [string, string];

interface ComponentSection {
  section: string;
  sectionCode: string | null;
  component: string | null;
  session: string | null;
  times: MeetingTime[];
  instructors: string[];
  meetingDates: MeetingDateRange | null;
  status: string | null;
}

interface CourseSchedule {
  subject: string;
  catalogNumber: string;
  courseCode: string;
  title: string | null;
  timeZone: string;
  components: Record<string, ComponentSection[]>;
}

interface ClientInfo {
  client: Got;
  icsid: string;
  dataLang: string;
  icStateNum: string;
}

const DAY_MAP: Record<string, DayOfWeek> = {
  Mo: 'Mo',
  Mon: 'Mo',
  Tu: 'Tu',
  Tue: 'Tu',
  We: 'We',
  Wed: 'We',
  Th: 'Th',
  Thu: 'Th',
  Fr: 'Fr',
  Fri: 'Fr',
  Sa: 'Sa',
  Sat: 'Sa',
  Su: 'Su',
  Sun: 'Su',
};

function parseTimeToMinutes(time: string): number | null {
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function parseMeetingDates(text: string): MeetingDateRange | null {
  const m = text.match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  // Store as local ET dates (no offset) so consumers can combine with times using the ET timezone.
  const startDate = m[1];
  const endDate = m[2];
  if (Number.isNaN(Date.parse(`${startDate}T00:00:00Z`)) || Number.isNaN(Date.parse(`${endDate}T00:00:00Z`))) {
    return null;
  }
  return [startDate, endDate];
}

function parseSectionHeader(raw: string): {
  sectionCode: string | null;
  component: string | null;
  session: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { sectionCode: null, component: null, session: null };

  // Expect something like "F00-LEC FullSess."
  const m = trimmed.match(/^([A-Za-z0-9]+)-([A-Z]+)\s*(.*)$/);
  if (!m) {
    return { sectionCode: null, component: null, session: trimmed || null };
  }
  const sectionCode = m[1] || null;
  const component = m[2] || null;
  const session = m[3] ? m[3].trim() || null : null;
  return { sectionCode, component, session };
}

function parseCourseCode(code: string): ParsedCourseCode | null {
  const m = code.match(/^([A-Z]{3,4})\s+(\d{4,5}[A-Z]?)/);
  if (!m) return null;
  return { subject: m[1], catalogNbr: m[2], code: `${m[1]} ${m[2]}` };
}

async function loadCatalogue(): Promise<ParsedCourseCode[]> {
  const cataloguePath = path.join(__dirname, 'catalogue.json');
  const raw = await fs.readFile(cataloguePath, 'utf-8');
  const data = JSON.parse(raw) as { courses?: CatalogueCourse[] };
  if (!Array.isArray(data.courses)) {
    throw new Error('catalogue.json does not contain a courses array');
  }

  const unique = new Map<string, ParsedCourseCode>();
  for (const course of data.courses) {
    if (!course || typeof course.code !== 'string') continue;
    const parsed = parseCourseCode(course.code);
    if (!parsed) continue;
    const key = parsed.code;
    if (!unique.has(key)) {
      unique.set(key, parsed);
    }
  }

  return Array.from(unique.values());
}

async function createClient(): Promise<ClientInfo> {
  const jar = new CookieJar();
  const client: Got = got.extend({
    cookieJar: jar,
    followRedirect: true,
    https: { rejectUnauthorized: true },
  });

  // Initial GET to establish session and retrieve ICSID (with a few retries for transient pages)
  let lastHtml = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const res = await client.get(BASE_URL);
    const html = res.body;
    lastHtml = html;
    const $ = cheerio.load(html);
    const icsid = $('#ICSID').attr('value');
    if (icsid) {
      const icStateNum = ($('#ICStateNum').attr('value') as string | undefined) || '1';
      const dataLang = ($('#\\#ICDataLang').val() as string | undefined) || 'ENG';
      return { client, icsid, dataLang, icStateNum };
    }
  }

  const preview = lastHtml.slice(0, 400).replace(/\s+/g, ' ');
  throw new Error(`Failed to find ICSID on initial class search page; first 400 chars: ${preview}`);
}

function buildSearchBody(args: {
  icsid: string;
  dataLang: string;
  icStateNum: string;
  subject: string;
  catalogNbr: string;
  termId?: string;
}): string {
  const { icsid, dataLang, icStateNum, subject, catalogNbr, termId } = args;

  const params = new URLSearchParams();

  // Core PeopleSoft navigation / panel fields (non-AJAX, full page response)
  params.set('ICType', 'Panel');
  params.set('ICElementNum', '0');
  params.set('ICStateNum', icStateNum);
  params.set('ICAction', 'CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH');
  params.set('ICModelCancel', '0');
  params.set('ICXPos', '0');
  params.set('ICYPos', '0');
  params.set('ResponsetoDiffFrame', '-1');
  params.set('TargetFrameName', 'None');
  params.set('FacetPath', 'None');
  params.set('PrmtTbl', '');
  params.set('PrmtTbl_fn', '');
  params.set('PrmtTbl_fv', '');
  params.set('TA_SkipFldNms', '');
  params.set('ICFocus', '');
  params.set('ICSaveWarningFilter', '0');
  params.set('ICChanged', '-1');
  params.set('ICSkipPending', '0');
  params.set('ICAutoSave', '0');
  params.set('ICResubmit', '0');
  params.set('ICSID', icsid);
  params.set('ICActionPrompt', 'false');
  params.set('ICTypeAheadID', '');
  params.set('ICBcDomData', '');
  params.set('ICPanelName', '');
  params.set('ICFind', '');
  params.set('ICAddCount', '');
  params.set('ICAppClsData', '');

  // Language / term
  params.set('#ICDataLang', dataLang || 'ENG');
  if (termId) {
    params.set('CLASS_SRCH_WRK2_STRM$35$', termId);
  }

  // Course criteria
  params.set('SSR_CLSRCH_WRK_SUBJECT$0', subject);
  params.set('SSR_CLSRCH_WRK_SSR_EXACT_MATCH1$0', 'E'); // course number "exact match"
  params.set('SSR_CLSRCH_WRK_CATALOG_NBR$0', catalogNbr);

  // Keep other fields in a neutral state to mimic the real form as closely as possible.
  params.set('SSR_CLSRCH_WRK_ACAD_CAREER$0', '');
  // Open only flag unchecked (send both variants as "N"/empty)
  params.set('SSR_CLSRCH_WRK_SSR_OPEN_ONLY$chk$0', 'N');
  params.set('SSR_CLSRCH_WRK_SSR_OPEN_ONLY$0', 'N');
  params.set('UO_PUB_SRCH_WRK_ACAD_GROUP$0', '');
  params.set('SSR_CLSRCH_WRK_DESCR$0', '');
  params.set('UO_PUB_SRCH_WRK_UO_LNG_FR$chk$0', 'N');
  params.set('UO_PUB_SRCH_WRK_UO_LNG_EN$chk$0', 'N');
  params.set('UO_PUB_SRCH_WRK_UO_LNG_OT$chk$0', 'N');
  params.set('UO_PUB_SRCH_WRK_UO_LNG_BI$chk$0', 'N');
  params.set('UO_PUB_SRCH_WRK_SSR_RPTCK_OPT_01$chk$0', 'N');
  params.set('UO_PUB_SRCH_WRK_SSR_RPTCK_OPT_02$chk$0', 'N');
  params.set('UO_PUB_SRCH_WRK_SSR_RPTCK_OPT_03$chk$0', 'N');
  params.set('UO_PUB_SRCH_WRK_SSR_RPTCK_OPT_04$chk$0', 'N');
  params.set('UO_PUB_SRCH_WRK_GRADUATED_TBL_CD$chk$0', 'N');
  params.set('SSR_CLSRCH_WRK_SSR_START_TIME_OPR$0', 'GE');
  params.set('SSR_CLSRCH_WRK_MEETING_TIME_START$0', '');
  params.set('SSR_CLSRCH_WRK_SSR_END_TIME_OPR$0', 'LE');
  params.set('SSR_CLSRCH_WRK_MEETING_TIME_END$0', '');
  params.set('SSR_CLSRCH_WRK_INCLUDE_CLASS_DAYS$0', 'I');
  params.set('SSR_CLSRCH_WRK_MON$chk$0', '');
  params.set('SSR_CLSRCH_WRK_TUES$chk$0', '');
  params.set('SSR_CLSRCH_WRK_WED$chk$0', '');
  params.set('SSR_CLSRCH_WRK_THURS$chk$0', '');
  params.set('SSR_CLSRCH_WRK_FRI$chk$0', '');
  params.set('SSR_CLSRCH_WRK_SAT$chk$0', '');
  params.set('SSR_CLSRCH_WRK_SUN$chk$0', '');
  params.set('SSR_CLSRCH_WRK_SSR_EXACT_MATCH2$0', 'B');
  params.set('SSR_CLSRCH_WRK_LAST_NAME$0', '');
  params.set('SSR_CLSRCH_WRK_SSR_COMPONENT$0', '');
  params.set('SSR_CLSRCH_WRK_SESSION_CODE$0', '');
  params.set('SSR_CLSRCH_WRK_INSTRUCTION_MODE$0', '');
  params.set('SSR_CLSRCH_WRK_LOCATION$0', '');
  params.set('UO_PUB_SRCH_WRK_UO_ONLINE_COURSES$chk$0', 'N');
  params.set('UO_PUB_SRCH_WRK_UO_AUDITOR_PERMITD$chk$0', 'N');
  params.set('UO_PUB_SRCH_WRK_UO_UOTTA_CARLETON$chk$0', 'N');

  return params.toString();
}

function parseScheduleHtml(
  html: string,
  { subject, catalogNbr }: { subject: string; catalogNbr: string },
): CourseSchedule | null {
  const $ = cheerio.load(html);

  const noResultsText = $('span.PSERRORTEXT, div.PSERRORTEXT, span.SSSMSGALERTTEXT')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (noResultsText.includes('no classes') || noResultsText.includes('no results')) {
    return null;
  }

  const headerDiv = $('div[id^="win0divSSR_CLSRSLT_WRK_GROUPBOX2$"]').first();
  let headerText = headerDiv.text().replace(/\s+/g, ' ').trim();
  if (!headerText) {
    headerText = `${subject} ${catalogNbr}`;
  }

  let title: string | null = null;
  const headerMatch = headerText.match(/^[A-Z]{3,4}\s*\d{4,5}[A-Z]?\s*-\s*(.+)$/);
  if (headerMatch) {
    title = headerMatch[1].trim();
  }

  const components: Record<string, ComponentSection[]> = {};

  $('table[id^="SSR_CLSRCH_MTG1$scroll$"]').each((_, table) => {
    const rows = $(table).find('tr[id^="trSSR_CLSRCH_MTG1"]');
    rows.each((__, row) => {
      const $row = $(row);
      const sectionSpan = $row.find('span[id^="MTG_CLASSNAME$"]').first();
      const sectionHtml = sectionSpan.html() || '';
      const sectionLines = sectionHtml
        .split(/<br\s*\/?>/i)
        .map(line => line.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const rawSection = sectionLines.join(' ');

      const daysSpan = $row.find('span#MTG_DAYTIME\\$0, span[id^="MTG_DAYTIME$"]').first();
      const daysHtml = daysSpan.html() || '';
      const dayLines = daysHtml
        .split(/<br\s*\/?>/i)
        .map(line => line.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      const instrSpan = $row.find('span#MTG_INSTR\\$0, span[id^="MTG_INSTR$"]').first();
      const instrHtml = instrSpan.html() || '';
      const instructorParts = instrHtml
        .split(/<br\s*\/?>/i)
        .map(line => line.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      const datesSpan = $row.find('span#MTG_TOPIC\\$0, span[id^="MTG_TOPIC$"]').first();
      const datesHtml = datesSpan.html() || '';
      const dateLines = datesHtml
        .split(/<br\s*\/?>/i)
        .map(line => line.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const datesText = dateLines[0] || '';

      const statusAlt =
        $row
          .find('div[id^="win0divDERIVED_CLSRCH_SSR_STATUS_LONG$"] img')
          .attr('alt') || null;

      if (!rawSection && dayLines.length === 0 && instructorParts.length === 0 && !datesText && !statusAlt) {
        return;
      }

      const { sectionCode, component, session } = parseSectionHeader(sectionLines[0] || rawSection);

      const times: MeetingTime[] = [];
      for (const line of dayLines) {
        const m = line.match(/^([A-Za-z]{2,3})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
        if (!m) continue;
        const dayKey = DAY_MAP[m[1]];
        if (!dayKey) continue;
        const start = parseTimeToMinutes(m[2]);
        const end = parseTimeToMinutes(m[3]);
        if (start == null || end == null) continue;
        times.push({ day: dayKey, startMinutes: start, endMinutes: end });
      }

      const meetingDates = datesText ? parseMeetingDates(datesText) : null;

      const compKey = component || 'UNKNOWN';
      const section: ComponentSection = {
        section: rawSection || sectionLines[0] || '',
        sectionCode,
        component,
        session,
        times,
        instructors: instructorParts,
        meetingDates,
        status: statusAlt,
      };

      if (!components[compKey]) components[compKey] = [];
      components[compKey].push(section);
    });
  });

  const totalSections = Object.values(components).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );
  if (totalSections === 0) {
    return null;
  }

  const schedule: CourseSchedule = {
    subject,
    catalogNumber: catalogNbr,
    courseCode: `${subject} ${catalogNbr}`,
    title,
    timeZone: 'America/Toronto',
    components,
  };

  return schedule;
}

async function fetchScheduleForCourse(
  clientInfo: ClientInfo,
  course: ParsedCourseCode,
): Promise<CourseSchedule | null> {
  const { client, icsid, dataLang, icStateNum } = clientInfo;
  const body = buildSearchBody({
    icsid,
    dataLang,
    icStateNum,
    subject: course.subject,
    catalogNbr: course.catalogNbr,
    termId: DEFAULT_TERM_ID,
  });

  const res = await client.post(BASE_URL, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  return parseScheduleHtml(res.body, {
    subject: course.subject,
    catalogNbr: course.catalogNbr,
  });
}

async function main(): Promise<void> {
  console.log('Loading catalogue.json...');
  const allCourses = await loadCatalogue();
  console.log(`Found ${allCourses.length} unique course codes.`);

  // Optional env-based filtering for testing specific courses (e.g. ONLY_SUBJECT=MAT ONLY_CATALOG=1300).
  const onlySubject = process.env.ONLY_SUBJECT;
  const onlyCatalog = process.env.ONLY_CATALOG;
  const courses =
    onlySubject || onlyCatalog
      ? allCourses.filter(c => {
          if (onlySubject && c.subject !== onlySubject) return false;
          if (onlyCatalog && c.catalogNbr !== onlyCatalog) return false;
          return true;
        })
      : allCourses;

  if (courses.length !== allCourses.length) {
    console.log(
      `Filtered to ${courses.length} course(s) based on ONLY_SUBJECT/ONLY_CATALOG environment variables.`,
    );
  }

  console.log('Initializing PeopleSoft session...');
  const clientInfos: ClientInfo[] = [];
  for (let i = 0; i < MAX_CONCURRENCY; i++) {
    // Create multiple independent sessions/cookie jars for higher parallelism.
    // If any single session fails to initialize, surface the error early.
    // eslint-disable-next-line no-await-in-loop
    const info = await createClient();
    clientInfos.push(info);
  }
  console.log(
    `Initialized ${clientInfos.length} PeopleSoft session(s), starting schedule scraping...`,
  );

  const limit = pLimit(MAX_CONCURRENCY);
  const results: CourseSchedule[] = [];
  let processed = 0;

  const tasks = courses.map((course, index) =>
    limit(async () => {
      const clientInfo = clientInfos[index % clientInfos.length];
      try {
        const schedule = await fetchScheduleForCourse(clientInfo, course);
        if (schedule) {
          results.push(schedule);
        }
      } catch (err: any) {
        console.error(
          `Error fetching schedule for ${course.subject} ${course.catalogNbr}:`,
          err?.message || err,
        );
      } finally {
        processed += 1;
        if (processed % 50 === 0 || processed === courses.length) {
          console.log(`Processed ${processed}/${courses.length} courses...`);
        }
      }
    }),
  );

  await Promise.all(tasks);

  const output = {
    termId: DEFAULT_TERM_ID,
    generatedAt: new Date().toISOString(),
    totalCourses: courses.length,
    totalWithSchedules: results.length,
    schedules: results,
  };

  const outPath = path.join(__dirname, '..', 'schedules.json');
  await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(
    `Done. Saved schedules for ${results.length} courses (out of ${courses.length}) to schedules.json`,
  );
}

main().catch(err => {
  console.error('Schedule scrape failed.');
  console.error(err);
  process.exit(1);
});

