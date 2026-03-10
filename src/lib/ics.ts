import type { DataCache } from './dataCache';
import type { GeneratedSchedule } from './scheduleGenerator';
import type { DayOfWeek } from '../schemas/schedules';

const DEFAULT_TZID = 'America/Toronto';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseIsoDate(date: string): { y: number; m: number; d: number } | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function utcDateFromIso(date: string): Date | null {
  const parts = parseIsoDate(date);
  if (!parts) return null;
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d, 0, 0, 0, 0));
}

function addUtcDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function dayToIsoIndex(day: DayOfWeek): number {
  // Monday=1 .. Sunday=7
  switch (day) {
    case 'Mo':
      return 1;
    case 'Tu':
      return 2;
    case 'We':
      return 3;
    case 'Th':
      return 4;
    case 'Fr':
      return 5;
    case 'Sa':
      return 6;
    case 'Su':
      return 7;
  }
}

function jsUtcDayToIsoIndex(jsUtcDay: number): number {
  // JS: 0=Sun..6=Sat -> ISO: 1=Mon..7=Sun
  if (jsUtcDay === 0) return 7;
  return jsUtcDay;
}

function formatUtcDateForIcs(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

function formatLocalDateTimeForIcs(dateUtcMidnight: Date, minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${formatUtcDateForIcs(dateUtcMidnight)}T${pad2(hours)}${pad2(mins)}00`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldIcsLine(line: string): string[] {
  // RFC folding is 75 octets; we approximate with 75 chars.
  const MAX = 75;
  if (line.length <= MAX) return [line];
  const out: string[] = [];
  let i = 0;
  out.push(line.slice(0, MAX));
  i = MAX;
  while (i < line.length) {
    out.push(` ${line.slice(i, i + MAX)}`);
    i += MAX;
  }
  return out;
}

function lines(...raw: string[]): string {
  const out: string[] = [];
  for (const l of raw) {
    for (const folded of foldIcsLine(l)) out.push(folded);
  }
  return out.join('\r\n') + '\r\n';
}

function uniqNonEmpty(parts: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const p of parts) {
    const t = (p ?? '').trim();
    if (t) set.add(t);
  }
  return [...set];
}

function pickLocation(sectionText: string): string | null {
  const raw = (sectionText ?? '').trim();
  if (!raw) return null;

  // Best-effort: look for common "BLDG 1234" or "BLDG-1234" patterns.
  // Avoid component tokens like LEC/LAB/REC.
  const m = raw.match(/\b([A-Z]{2,6})\s*[-]?\s*(\d{2,4}[A-Z]?)\b/);
  if (!m) return null;
  const building = m[1];
  const room = m[2];
  const banned = new Set(['LEC', 'LAB', 'REC', 'TUT', 'SEM', 'DGD', 'PRA', 'CLI']);
  if (banned.has(building)) return null;
  return `${building} ${room}`;
}

function dtstampUtc(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(
    d.getUTCHours()
  )}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

export function buildScheduleIcs(args: {
  schedule: GeneratedSchedule;
  cache: DataCache | null;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}): string {
  const { schedule, cache, startDate, endDate } = args;
  const start = utcDateFromIso(startDate);
  const end = utcDateFromIso(endDate);
  if (!start || !end) {
    throw new Error('Invalid date range for iCalendar export');
  }

  const dtstamp = dtstampUtc();

  let out = '';
  out += lines('BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//uschedule//EN', 'CALSCALE:GREGORIAN');

  for (const enrollment of schedule.enrollments) {
    const courseCode = enrollment.courseCode;
    const courseTitle =
      cache?.getCourse(courseCode)?.title?.trim() ||
      cache?.getSchedule(courseCode)?.title?.trim() ||
      '';

    const courseTzid = cache?.getSchedule(courseCode)?.timeZone || DEFAULT_TZID;

    for (const [component, { section }] of Object.entries(enrollment.sectionCombo)) {
      const instructors = uniqNonEmpty(section.instructors ?? []);
      const professor = instructors.length ? instructors.join(', ') : '—';
      const sectionCode = (section.sectionCode ?? section.section ?? '').trim();
      const sectionLabel = sectionCode ? `${component} - ${sectionCode}` : component;

      const location = pickLocation(section.section);
      const summary = `${courseCode}${location ? ` — ${location}` : ''}`;
      const descriptionLines = [
        courseTitle ? `Course: ${courseTitle}` : null,
        professor ? `Prof: ${professor}` : null,
        sectionLabel ? `Section: ${sectionLabel}` : null,
      ].filter(Boolean) as string[];

      for (const t of section.times ?? []) {
        if (t.startMinutes >= t.endMinutes) continue;

        const startIsoDow = dayToIsoIndex(t.day);
        const startDow = jsUtcDayToIsoIndex(start.getUTCDay());
        const delta = (startIsoDow - startDow + 7) % 7;
        const firstDay = addUtcDays(start, delta);

        const dtStart = formatLocalDateTimeForIcs(firstDay, t.startMinutes);
        const dtEnd = formatLocalDateTimeForIcs(firstDay, t.endMinutes);
        // Match reference format (UTC midnight on end date).
        const untilUtc = `${formatUtcDateForIcs(end)}T000000Z`;
        const uid = `${courseCode}-${component}-${t.day}-${t.startMinutes}-${t.endMinutes}@uschedule`;

        out += lines(
          'BEGIN:VEVENT',
          `UID:${escapeIcsText(uid)}`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART;TZID=${escapeIcsText(courseTzid)}:${dtStart}`,
          `DTEND;TZID=${escapeIcsText(courseTzid)}:${dtEnd}`,
          `RRULE:FREQ=WEEKLY;UNTIL=${untilUtc}`,
          `SUMMARY:${escapeIcsText(summary)}`,
          `DESCRIPTION:${escapeIcsText(descriptionLines.join('\n'))}`,
          ...(location ? [`LOCATION:${escapeIcsText(location)}`] : []),
          'END:VEVENT'
        );
      }
    }
  }

  out += lines('END:VCALENDAR');
  return out;
}

export function downloadTextFile(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

