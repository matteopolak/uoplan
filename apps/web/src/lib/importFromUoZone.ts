import type {
  ComponentSection,
  DataCache,
  DayOfWeek,
  GeneratedSchedule,
  MeetingTime,
} from "@uoplan/core";
import { normalizeCourseCode } from "@uoplan/core";

export interface UoZoneMeeting {
  sectionCode: string;
  component: string;
  day: DayOfWeek;
  startMinutes: number;
  endMinutes: number;
  location: string | null;
  address: string | null;
  instructor: string | null;
  meetingDates: [string, string];
}

export interface UoZoneCourse {
  code: string;
  title: string;
  status: string;
  meetings: UoZoneMeeting[];
}

export type UoZoneResolveResult =
  | {
      ok: true;
      schedule: GeneratedSchedule;
      warnings: string[];
      skippedCount: number;
    }
  | { ok: false; reason: "no-courses" | "no-matches"; warnings: string[] };

const DAYS: Record<string, DayOfWeek> = {
  Mo: "Mo",
  Tu: "Tu",
  We: "We",
  Th: "Th",
  Fr: "Fr",
  Sa: "Sa",
  Su: "Su",
};

const COMPONENT_ALIASES: Record<string, string> = {
  CLINIC: "CLI",
  DISCUSSION: "DGD",
  "DISCUSSION GROUP": "DGD",
  LABORATORY: "LAB",
  LECTURE: "LEC",
  PRACTICAL: "PRA",
  RESEARCH: "RCH",
  SEMINAR: "SEM",
  TUTORIAL: "TUT",
};

function textFromCell(cell: Element | undefined): string {
  return (cell?.querySelector("span")?.textContent ?? cell?.textContent ?? "")
    .replaceAll("\u00a0", " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function parseClock(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!match) throw new Error("Invalid meeting time");
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

function parseTimeRange(value: string): Pick<UoZoneMeeting, "day" | "startMinutes" | "endMinutes"> {
  const match = value.match(
    /^([A-Za-z]{2})\s+(\d{1,2}:\d{2}(?:AM|PM))\s+-\s+(\d{1,2}:\d{2}(?:AM|PM))$/i,
  );
  const day = match ? DAYS[`${match[1][0].toUpperCase()}${match[1][1].toLowerCase()}`] : undefined;
  if (!match || !day) throw new Error("Invalid meeting time range");
  return { day, startMinutes: parseClock(match[2]), endMinutes: parseClock(match[3]) };
}

function parseIsoDate(value: string): string {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new Error("Invalid meeting date");
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function parseDateRange(value: string): [string, string] {
  const parts = value.split(/\s+-\s+/);
  if (parts.length !== 2) throw new Error("Invalid meeting date range");
  return [parseIsoDate(parts[0]), parseIsoDate(parts[1])];
}

/**
 * Mirrors uo2ics: PeopleSoft renders the exportable address before a trailing
 * parenthesized short location. The full raw value is retained for uoPlan's UI,
 * while ICS receives the address with uo2ics's Ottawa suffix.
 */
function parseLocation(value: string): { location: string | null; address: string | null } {
  const location = value.trim();
  if (!location) return { location: null, address: null };
  const addressPart = (location.match(/^(.*?)\s+\([^()]*\)\s*$/)?.[1] ?? location).trim();
  const address = /^(?:virtual|online|tba)$/i.test(addressPart)
    ? addressPart
    : `${addressPart}, Ottawa, ON, Canada`;
  return { location, address };
}

function parseCourseHeading(value: string): { code: string; title: string } {
  const match = value
    .replaceAll(/\s+/g, " ")
    .trim()
    .match(/^([A-Z]{3,4}\s*\d{4,5})\s+-\s+(.+)$/i);
  if (!match) throw new Error("Invalid course heading");
  return { code: normalizeCourseCode(match[1]), title: match[2].trim() };
}

/** Parse an English uoZone “My Class Schedule” List View saved HTML page. */
export function parseUoZoneScheduleHtml(html: string): UoZoneCourse[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const courses: UoZoneCourse[] = [];

  for (const heading of document.querySelectorAll(".PAGROUPDIVIDER")) {
    const container = heading.parentElement?.parentElement;
    const rows = container ? [...container.querySelectorAll(".PSLEVEL3GRID")] : [];
    if (rows.length < 2) continue;

    const { code, title } = parseCourseHeading(heading.textContent ?? "");
    const status = textFromCell(rows[0].querySelector("td") ?? undefined);
    const cells = [...rows[1].querySelectorAll("td")];
    const meetings: UoZoneMeeting[] = [];
    let previousSection = "";
    let previousComponent = "";

    for (let index = 0; index + 6 < cells.length; index += 7) {
      const sectionCode = textFromCell(cells[index + 1]) || previousSection;
      const component = textFromCell(cells[index + 2]) || previousComponent;
      const timeText = textFromCell(cells[index + 3]);
      const dateText = textFromCell(cells[index + 6]);
      if (!sectionCode || !component || !timeText || !dateText) continue;

      previousSection = sectionCode;
      previousComponent = component;
      const location = parseLocation(textFromCell(cells[index + 4]));
      meetings.push({
        sectionCode,
        component,
        ...parseTimeRange(timeText),
        ...location,
        instructor: textFromCell(cells[index + 5]) || null,
        meetingDates: parseDateRange(dateText),
      });
    }

    courses.push({ code, title, status, meetings });
  }

  if (courses.length === 0) throw new Error("No uoZone courses found");
  return courses;
}

function componentToken(value: string | null | undefined): string {
  const normalized = (value ?? "")
    .replaceAll(/[^A-Za-z ]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return COMPONENT_ALIASES[normalized] ?? normalized;
}

function sectionCode(section: ComponentSection): string {
  return (section.sectionCode ?? section.section ?? "").trim().toUpperCase();
}

function findSection(
  meeting: UoZoneMeeting,
  components: Record<string, ComponentSection[]>,
): { component: string; section: ComponentSection } | null {
  const candidates = Object.entries(components).flatMap(([component, sections]) =>
    sections
      .filter((section) => sectionCode(section) === meeting.sectionCode.trim().toUpperCase())
      .map((section) => ({ component, section })),
  );
  if (candidates.length === 0) return null;

  const wanted = componentToken(meeting.component);
  const exact = candidates.filter(
    ({ component, section }) =>
      componentToken(component) === wanted || componentToken(section.component) === wanted,
  );
  if (exact.length === 1) return exact[0];
  return candidates.length === 1 ? candidates[0] : null;
}

function importedTime(meeting: UoZoneMeeting): MeetingTime {
  return {
    day: meeting.day,
    startMinutes: meeting.startMinutes,
    endMinutes: meeting.endMinutes,
    virtual: /(?:virtual|online)/i.test(meeting.location ?? ""),
    instructor: meeting.instructor,
    meetingDates: meeting.meetingDates,
    location: meeting.location,
    address: meeting.address,
  };
}

/** Resolve every uploaded meeting to its exact canonical course/component/section. */
export function resolveUoZoneSchedule(
  courses: UoZoneCourse[],
  cache: DataCache,
): UoZoneResolveResult {
  const warnings: string[] = [];
  const enrollments: GeneratedSchedule["enrollments"] = [];
  let skippedCount = 0;

  for (const course of courses) {
    if (course.status.trim().toLowerCase() !== "enrolled") {
      skippedCount += 1;
      continue;
    }

    const code = normalizeCourseCode(course.code);
    const schedule = cache.getSchedule(code);
    if (!schedule || course.meetings.length === 0) {
      warnings.push(code);
      continue;
    }

    const resolved = course.meetings.map((meeting) => ({
      meeting,
      match: findSection(meeting, schedule.components),
    }));
    if (resolved.some(({ match }) => match === null)) {
      warnings.push(code);
      continue;
    }

    const byComponent = new Map<
      string,
      { source: ComponentSection; times: MeetingTime[]; sectionIdentity: string }
    >();
    let ambiguous = false;
    for (const { meeting, match } of resolved) {
      if (!match) continue;
      const identity = sectionCode(match.section);
      const existing = byComponent.get(match.component);
      if (existing && existing.sectionIdentity !== identity) {
        ambiguous = true;
        break;
      }
      const group = existing ?? { source: match.section, times: [], sectionIdentity: identity };
      group.times.push(importedTime(meeting));
      byComponent.set(match.component, group);
    }
    if (ambiguous || byComponent.size === 0) {
      warnings.push(code);
      continue;
    }

    const sectionCombo: GeneratedSchedule["enrollments"][number]["sectionCombo"] = {};
    const times: GeneratedSchedule["enrollments"][number]["times"] = [];
    for (const [component, group] of byComponent) {
      const uniqueTimes = group.times.filter(
        (time, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.day === time.day &&
              candidate.startMinutes === time.startMinutes &&
              candidate.endMinutes === time.endMinutes &&
              candidate.meetingDates?.[0] === time.meetingDates?.[0] &&
              candidate.meetingDates?.[1] === time.meetingDates?.[1],
          ) === index,
      );
      sectionCombo[component] = { section: { ...group.source, times: uniqueTimes } };
      times.push(...uniqueTimes);
    }
    enrollments.push({ courseCode: code, sectionCombo, times });
  }

  if (enrollments.length === 0) {
    return {
      ok: false,
      reason: courses.some((course) => course.status.trim().toLowerCase() === "enrolled")
        ? "no-matches"
        : "no-courses",
      warnings,
    };
  }
  return { ok: true, schedule: { enrollments }, warnings, skippedCount };
}
