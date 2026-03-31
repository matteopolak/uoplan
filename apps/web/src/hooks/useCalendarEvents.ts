import { useMemo } from "react";
import { startOfWeek } from "date-fns";
import type { GeneratedSchedule } from "schedule";
import type { ProfessorRatingsMap } from "schedule";
import {
  getRatingsForInstructors,
  getRatingDetailsForInstructors,
} from "schedule";
import { addDays, minutesToDate, DAY_OFFSETS } from "schedule";

/**
 * A calendar event representing a single time slot for a course section.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  courseCode: string;
  enrollmentIndex: number;
  startMinutes: number;
  endMinutes: number;
  componentSection: string;
  professor: string;
  professorRatingValue?: number | null;
  professorRatingDetails?: Array<{ id?: string; legacyId?: number; name: string; rating: number; numRatings: number }>;
}

/**
 * Hook to transform a schedule into FullCalendar-compatible events.
 *
 * @param schedule - The generated schedule to transform
 * @param professorRatings - Optional professor ratings map for display
 * @returns Array of calendar events positioned on a reference week
 */
export function useCalendarEvents(
  schedule: GeneratedSchedule | null,
  professorRatings: ProfessorRatingsMap | null
): CalendarEvent[] {
  const referenceWeekStart = useMemo(
    () => startOfWeek(new Date(), { weekStartsOn: 0 }),
    []
  );

  return useMemo<CalendarEvent[]>(() => {
    if (!schedule) return [];

    return schedule.enrollments.flatMap((enrollment, enrollIdx) => {
      const out: CalendarEvent[] = [];
      let timeIdx = 0;

      for (const [comp, { section }] of Object.entries(enrollment.sectionCombo)) {
        const sectionCode = section.sectionCode ?? section.section ?? "";
        const componentSection = `${comp} - ${sectionCode}`;
        const professor =
          [...new Set(section.instructors ?? [])].filter(Boolean).join(", ") ||
          "—";
        const ratings = getRatingsForInstructors(
          section.instructors ?? [],
          professorRatings
        );
        const professorRatingValue =
          ratings.length > 0
            ? Math.round(
                (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10
              ) / 10
            : null;
        const professorRatingDetails = getRatingDetailsForInstructors(
          section.instructors ?? [],
          professorRatings
        );

        for (const t of section.times) {
          if (t.startMinutes >= t.endMinutes) continue;
          const offset = DAY_OFFSETS[t.day] ?? null;
          if (offset == null) continue;

          const dayDate = addDays(referenceWeekStart, offset);
          const start = minutesToDate(dayDate, t.startMinutes);
          const end = minutesToDate(dayDate, t.endMinutes);

          out.push({
            id: `${enrollment.courseCode}-${comp}-${timeIdx}`,
            title: enrollment.courseCode,
            start,
            end,
            courseCode: enrollment.courseCode,
            enrollmentIndex: enrollIdx,
            startMinutes: t.startMinutes,
            endMinutes: t.endMinutes,
            componentSection,
            professor,
            professorRatingValue,
            professorRatingDetails,
          });
          timeIdx += 1;
        }
      }
      return out;
    });
  }, [schedule, professorRatings, referenceWeekStart]);
}
