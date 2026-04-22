import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { GeneratedSchedule } from "schedule";

export function useTimetableDateRangeFromSchedule(
  schedule: GeneratedSchedule | null,
  timetableStartDate: string,
  timetableEndDate: string,
  setTimetableStartDate: Dispatch<SetStateAction<string>>,
  setTimetableEndDate: Dispatch<SetStateAction<string>>,
) {
  useEffect(() => {
    if (!schedule) return;

    let minStart: string | null = null;
    let maxEnd: string | null = null;

    for (const enrollment of schedule.enrollments) {
      for (const { section } of Object.values(enrollment.sectionCombo)) {
        const md = section.meetingDates;
        if (!md || md.length < 2) continue;

        const start = md[0];
        const end = md[1];

        if (start && (!minStart || start < minStart)) minStart = start;
        if (end && (!maxEnd || end > maxEnd)) maxEnd = end;
      }
    }

    // Only auto-fill when the user hasn't provided values yet.
    if (!timetableStartDate && minStart) setTimetableStartDate(minStart);
    if (!timetableEndDate && maxEnd) setTimetableEndDate(maxEnd);
  }, [
    schedule,
    timetableStartDate,
    timetableEndDate,
    setTimetableStartDate,
    setTimetableEndDate,
  ]);
}

