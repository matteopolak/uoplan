import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { type Got, got } from 'got';
import { CookieJar } from 'tough-cookie';

const BASE_URL =
  'https://uocampus.public.uottawa.ca/psc/csprpr9pub/EMPLOYEE/SA/c/UO_SR_AA_MODS.UO_PUB_CLSSRCH.GBL';
const PUBLIC_DIR = '../web/public';
const HTML_CACHE_DIR = '.cache/course-search-html';
const MAX_CONCURRENCY = 20;
const USE_CACHE_ONLY = process.argv.includes('use-cache');
const WRITE_CACHE = process.argv.includes('write-cache');

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Term = { termId: string; name: string };

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
  virtual: boolean;
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

function getCatalogueYearForTerm(termName: string): number {
  const m = termName.match(/(\d{4})/);
  if (!m) throw new Error(`Cannot extract year from term name: ${termName}`);
  const year = parseInt(m[1], 10);
  return termName.toLowerCase().includes('fall') ? year : year - 1;
}

async function loadCatalogue(year: number): Promise<ParsedCourseCode[]> {
  const raw = await fs.readFile(path.join(PUBLIC_DIR, 'data', `catalogue.${year}.json`), 'utf-8');
  const data = JSON.parse(raw) as { courses?: CatalogueCourse[] };
  if (!Array.isArray(data.courses)) {
    throw new Error('catalogue.json does not contain a courses array');
  }

  //const mat1300 = data.courses.find(c => c.code === 'MAT 1300');

  /*data.courses = data.courses.slice(0, 100);
  if (!data.courses.includes(mat1300!)) {
    data.courses.push(mat1300!);
  }*/

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
  for (let attempt = 1; attempt <= 10; attempt++) {
     
    const res = await client.get(BASE_URL);
    const html = res.body;
    lastHtml = html;
    const $ = cheerio.load(html);
    const icsid = $('#ICSID').attr('value');
    if (icsid) {
      const icStateNum = ($('#ICStateNum').attr('value')) || '1';
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
  virtual?: boolean;
}): string {
  const { icsid, dataLang, icStateNum, subject, catalogNbr, termId, virtual } = args;

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
  params.set('SSR_CLSRCH_WRK_LOCATION$0', virtual ? 'ZZVIRTL' : '');
  params.set('UO_PUB_SRCH_WRK_UO_ONLINE_COURSES$chk$0', 'N');
  params.set('UO_PUB_SRCH_WRK_UO_AUDITOR_PERMITD$chk$0', 'N');
  params.set('UO_PUB_SRCH_WRK_UO_UOTTA_CARLETON$chk$0', 'N');

  return params.toString();
}

function parseScheduleHtml(
  html: string,
  { subject, catalogNbr }: { subject: string; catalogNbr: string },
  virtual: boolean = false,
): CourseSchedule | null {
  const $ = cheerio.load(html);

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
        times.push({ day: dayKey, startMinutes: start, endMinutes: end, virtual });
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

function timeKey(t: MeetingTime): string {
  return `${t.day}|${t.startMinutes}|${t.endMinutes}`;
}

function sectionKey(componentKey: string, section: ComponentSection): string {
  return `${componentKey}|${section.sectionCode ?? ''}|${section.section}`;
}

function mergeVirtualIntoBase(
  base: CourseSchedule,
  virtualOnly: CourseSchedule,
): CourseSchedule {
  // base is treated as "non-virtual"; this function flips the relevant meeting-times to virtual.
  for (const [compKey, vSections] of Object.entries(virtualOnly.components)) {
    if (!base.components[compKey]) base.components[compKey] = [];
    const baseSections = base.components[compKey];

    const baseSectionByKey = new Map<string, ComponentSection>();
    baseSections.forEach((s) => baseSectionByKey.set(sectionKey(compKey, s), s));

    for (const vSection of vSections) {
      const key = sectionKey(compKey, vSection);
      const baseSection = baseSectionByKey.get(key);

      if (!baseSection) {
        // Extremely defensive: if a virtual section doesn't exist in the base result, keep it.
        baseSections.push(vSection);
        baseSectionByKey.set(key, vSection);
        continue;
      }

      const baseTimeByKey = new Map<string, number>();
      baseSection.times.forEach((t, idx) => baseTimeByKey.set(timeKey(t), idx));

      for (const vt of vSection.times) {
        const tKey = timeKey(vt);
        const baseTimeIdx = baseTimeByKey.get(tKey);
        if (baseTimeIdx != null) {
          baseSection.times[baseTimeIdx].virtual = true;
        } else {
          baseSection.times.push(vt);
          baseTimeByKey.set(tKey, baseSection.times.length - 1);
        }
      }
    }
  }

  return base;
}

async function fetchScheduleForCourseWithVirtual(
  clientInfo: ClientInfo,
  course: ParsedCourseCode,
  termId: string,
  virtual: boolean,
): Promise<CourseSchedule | null> {
  const { client, dataLang } = clientInfo;
  const safeSubject = course.subject.replace(/[^A-Za-z0-9]+/g, '_');
  const safeCatalog = course.catalogNbr.replace(/[^A-Za-z0-9]+/g, '_');
  const cacheFilename = `${safeSubject}-${safeCatalog}-${termId}-${virtual ? 'virtual' : 'nonvirtual'}.html`;
  const cachePath = path.join(HTML_CACHE_DIR, cacheFilename);

  if (USE_CACHE_ONLY) {
    try {
      const cachedHtml = await fs.readFile(cachePath, 'utf-8');

      // Mirror the "no results" detection we do for live responses.
      const bannerText = cheerio
        .load(cachedHtml)('span.PSERRORTEXT, div.PSERRORTEXT, span.SSSMSGALERTTEXT')
        .text()
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (bannerText.includes('no classes') || bannerText.includes('no results')) {
        return null;
      }

      const scheduleFromCache = parseScheduleHtml(
        cachedHtml,
        { subject: course.subject, catalogNbr: course.catalogNbr },
        virtual,
      );
      if (scheduleFromCache) return scheduleFromCache;
      return null;
    } catch (err: unknown) {
      console.error(
        `Cache miss for ${course.subject} ${course.catalogNbr} with use-cache enabled (expected ${cachePath}):`,
        getErrorMessage(err),
      );
      return null;
    }
  }

  for (let attempt = 1; attempt <= 10; attempt++) {
    // Refresh page-level state (ICSID / ICStateNum) from a fresh criteria page load.
    // This keeps us in sync with PeopleSoft even if previous interactions changed state.
    const initRes = await client.get(BASE_URL);
    try {
      const $init = cheerio.load(initRes.body);
      const pageIcsid = $init('#ICSID').attr('value');
      if (pageIcsid) clientInfo.icsid = pageIcsid;
      const pageState = $init('#ICStateNum').attr('value');
      if (pageState) clientInfo.icStateNum = pageState;
    } catch {
      // Ignore and fall back to previously known state.
    }

    const body = buildSearchBody({
      icsid: clientInfo.icsid,
      dataLang,
      icStateNum: clientInfo.icStateNum,
      subject: course.subject,
      catalogNbr: course.catalogNbr,
      termId,
      virtual,
    });

    const res = await client.post(BASE_URL, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    // Update session state (ICSID / ICStateNum) from the response for subsequent requests.
    try {
      const $ = cheerio.load(res.body);
      const newIcsid = $('#ICSID').attr('value');
      if (newIcsid) {
        clientInfo.icsid = newIcsid;
      }
      const newStateNum = $('#ICStateNum').attr('value');
      if (newStateNum) {
        clientInfo.icStateNum = newStateNum;
      }
    } catch {
      // Non-fatal; fall back to previous state values.
    }

    // Persist raw HTML per-course for debugging / verification.
    try {
      await fs.mkdir(HTML_CACHE_DIR, { recursive: true });
      if (WRITE_CACHE) await fs.writeFile(cachePath, res.body, 'utf-8');
    } catch (err: unknown) {
      console.error(
        `Warning: failed to write HTML cache for ${course.subject} ${course.catalogNbr}:`,
        getErrorMessage(err),
      );
    }

    // Detect login / redirect pages (not real search or results pages).
    const lowerHtml = res.body.toLowerCase();
    const looksLikeLogin =
      lowerHtml.includes('sign in to peoplesoft') ||
      lowerHtml.includes('you must have cookies enabled') ||
      (/<meta[^>]+http-equiv=['"]refresh['"]/i.test(res.body) &&
        res.body.includes('CAMPUS_URL='));
    if (looksLikeLogin) {
      console.error(
        `Received login/redirect page instead of search results for ${course.subject} ${course.catalogNbr}. ` +
          `See cached HTML at ${cachePath}. Will retry with new session (attempt ${attempt}/10).`,
      );
      if (attempt < 10) {
        // Replace this session with a fresh one (new cookie jar + fresh GET).
        const newSession = await createClient();
        Object.assign(clientInfo, newSession);
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      // On the final attempt, give up on this course but let the overall run continue.
      return null;
    }

    // Check for explicit "no results" banner; if present, do not retry.
    const bannerText = cheerio
      .load(res.body)('span.PSERRORTEXT, div.PSERRORTEXT, span.SSSMSGALERTTEXT')
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (bannerText.includes('no classes') || bannerText.includes('no results')) {
      return null;
    }

    const schedule = parseScheduleHtml(
      res.body,
      { subject: course.subject, catalogNbr: course.catalogNbr },
      virtual,
    );
    if (schedule) return schedule;

    if (attempt < 10) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.error(
    `Failed to parse schedule for ${course.subject} ${course.catalogNbr} after 10 attempts. ` +
      `See cached HTML at ${cachePath}`,
  );
  // Exit the whole process so the failure is visible and repeatable.
  process.exit(1);
}

async function fetchScheduleForCourse(
  clientInfo: ClientInfo,
  course: ParsedCourseCode,
  termId: string,
): Promise<CourseSchedule | null> {
  const base = await fetchScheduleForCourseWithVirtual(clientInfo, course, termId, false);
  const virtualOnly = await fetchScheduleForCourseWithVirtual(clientInfo, course, termId, true);

  if (!base && !virtualOnly) return null;
  if (base && !virtualOnly) return base;
  if (!base && virtualOnly) return virtualOnly;

  return mergeVirtualIntoBase(base!, virtualOnly!);
}

async function main(): Promise<void> {
  const onlySubject = process.env.ONLY_SUBJECT;
  const onlyCatalog = process.env.ONLY_CATALOG;
  const onlyTermId = process.env.ONLY_TERM_ID;

  const termsRaw = await fs.readFile(path.join(PUBLIC_DIR, 'data', 'terms.json'), 'utf-8');
  let terms: Term[] = (JSON.parse(termsRaw) as { terms: Term[] }).terms;

  if (onlyTermId) {
    terms = terms.filter((t) => t.termId === onlyTermId);
    if (terms.length === 0) {
      throw new Error(`ONLY_TERM_ID=${onlyTermId} not found in terms.json`);
    }
  }

  console.log('Initializing PeopleSoft session...');
  const clientCount = USE_CACHE_ONLY ? 1 : MAX_CONCURRENCY;
  const clientInfos: ClientInfo[] = await Promise.all(
    Array.from({ length: clientCount }, createClient),
  );

  console.log(`Initialized ${clientInfos.length} PeopleSoft session(s).`);

  for (const term of terms) {
    const catalogueYear = getCatalogueYearForTerm(term.name);
    console.log(`Loading catalogue.${catalogueYear}.json for ${term.name}...`);
    const allCourses = await loadCatalogue(catalogueYear);
    console.log(`Found ${allCourses.length} unique course codes.`);

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

    console.log(`Starting schedule scrape for ${term.name} (${term.termId})...`);
    const limit = pLimit(MAX_CONCURRENCY);
    const results: CourseSchedule[] = [];
    let processed = 0;

    const tasks = courses.map((course, index) =>
      limit(async () => {
        const clientInfo = clientInfos[index % clientInfos.length];
        try {
          const schedule = await fetchScheduleForCourse(clientInfo, course, term.termId);
          if (schedule) {
            results.push(schedule);
          }
        } catch (err: unknown) {
          console.error(
            `Error fetching schedule for ${course.subject} ${course.catalogNbr} (${term.termId}):`,
            getErrorMessage(err),
          );
        } finally {
          processed += 1;
          if (processed % 50 === 0 || processed === courses.length) {
            console.log(
              `[${term.termId}] Processed ${processed}/${courses.length} courses...`,
            );
          }
        }
      }),
    );

    await Promise.all(tasks);

    results.sort((a, b) => a.courseCode.localeCompare(b.courseCode));

    const output = {
      termId: term.termId,
      totalCourses: courses.length,
      totalWithSchedules: results.length,
      schedules: results,
    };

    const outPath = path.join(PUBLIC_DIR, 'data', `schedules.${term.termId}.json`);
    await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(
      `Done. Saved schedules for ${results.length} courses (out of ${courses.length}) to ${path.basename(outPath)}`,
    );
  }
}

main().catch(err => {
  console.error('Schedule scrape failed.');
  console.error(err);
  process.exit(1);
});

