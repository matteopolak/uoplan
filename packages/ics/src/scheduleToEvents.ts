import type { DataCache } from "@uoplan/domain/dataCache";
import type { GeneratedSchedule } from "@uoplan/generation/generation/types";
import { assertInclusiveDateRange, canonicalizeCalendarEvent, nextIsoDateOnOrAfter } from "./model";
import type { CalendarEvent } from "./model";

const DEFAULT_TZID = "America/Toronto";

function uniqNonEmpty(parts: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const part of parts) {
    const trimmed = (part ?? "").trim();
    if (trimmed) {
      set.add(trimmed);
    }
  }
  return [...set];
}

function pickLocation(sectionText: string): string | null {
  const raw = sectionText.trim();
  if (!raw) return null;

  const match = raw.match(/\b([A-Z]{2,6})\s*[-]?\s*(\d{2,4}[A-Z]?)\b/);
  if (!match) return null;

  const building = match[1];
  const room = match[2];
  const banned = new Set(["LEC", "LAB", "REC", "TUT", "SEM", "DGD", "PRA", "CLI"]);
  if (banned.has(building)) return null;
  return `${building} ${room}`;
}

function resolveMeetingBounds(
  meetingDates: [string, string] | null | undefined,
  fallbackBounds: { startDate: string; endDate: string },
): { startDate: string; endDate: string } | null {
  if (!meetingDates) return fallbackBounds;

  const [startDate, endDate] = meetingDates;
  try {
    return assertInclusiveDateRange(startDate, endDate, "meeting date range");
  } catch {
    return null;
  }
}

export function scheduleToCalendarEvents(args: {
  schedule: GeneratedSchedule;
  cache: DataCache | null;
  startDate: string;
  endDate: string;
  uidPrefix?: string;
}): CalendarEvent[] {
  const { schedule, cache, uidPrefix = "" } = args;
  const fallbackBounds = assertInclusiveDateRange(args.startDate, args.endDate, "schedule segment");
  const events: CalendarEvent[] = [];

  for (const enrollment of schedule.enrollments) {
    const courseCode = enrollment.courseCode;
    const courseTitle =
      cache?.getCourse(courseCode)?.title?.trim() ||
      cache?.getSchedule(courseCode)?.title?.trim() ||
      "";
    const courseTzid = cache?.getSchedule(courseCode)?.timeZone || DEFAULT_TZID;

    for (const [component, { section }] of Object.entries(enrollment.sectionCombo)) {
      const instructors = uniqNonEmpty(
        (section.times ?? [])
          .map((time) => time.instructor)
          .filter((value): value is string => value !== null),
      );
      const professor = instructors.length > 0 ? instructors.join(", ") : "—";
      const sectionCode = (section.sectionCode ?? section.section ?? "").trim();
      const sectionLabel = sectionCode ? `${component} - ${sectionCode}` : component;
      const description = [
        courseTitle ? `Course: ${courseTitle}` : null,
        professor ? `Prof: ${professor}` : null,
        sectionLabel ? `Section: ${sectionLabel}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      for (const time of section.times ?? []) {
        if (time.startMinutes >= time.endMinutes) continue;

        const displayLocation = time.location?.trim() || pickLocation(section.section);
        const calendarLocation = time.address?.trim() || displayLocation;
        const summary = `${courseCode}${displayLocation ? ` — ${displayLocation}` : ""}`;

        const bounds = resolveMeetingBounds(time.meetingDates ?? null, fallbackBounds);
        if (!bounds) continue;

        const firstDate = nextIsoDateOnOrAfter(bounds.startDate, time.day);
        const uid = `${uidPrefix}${courseCode}-${component}-${time.day}-${time.startMinutes}-${time.endMinutes}@uoplan`;

        try {
          events.push(
            canonicalizeCalendarEvent({
              uid,
              summary,
              description: description || undefined,
              location: calendarLocation || undefined,
              time: {
                kind: "timed",
                date: firstDate,
                startMinutes: time.startMinutes,
                endMinutes: time.endMinutes,
                timeZone: courseTzid,
              },
              recurrence: {
                frequency: "weekly",
                day: time.day,
                untilDate: bounds.endDate,
                excludedDates: [],
                activeRange: bounds,
              },
            }),
          );
        } catch {
          continue;
        }
      }
    }
  }

  return events;
}
