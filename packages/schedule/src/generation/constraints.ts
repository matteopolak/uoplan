import type { DayOfWeek } from 'schemas';
import type { CourseEnrollment, GenerationConstraints, TimeSlot } from './types';

/** Default when the UI clears “days allowed” (empty array): same as initial app state (weekdays). */
const DEFAULT_ALLOWED_DAYS: DayOfWeek[] = [
  "Mo",
  "Tu",
  "We",
  "Th",
  "Fr",
];

export function effectiveAllowedDays(c: GenerationConstraints): DayOfWeek[] {
  return c.allowedDays.length > 0 ? c.allowedDays : DEFAULT_ALLOWED_DAYS;
}

/** Time bounds are inclusive: a class starting at minStartMinutes or ending at maxEndMinutes is allowed. */
export function timeSlotSatisfiesConstraints(slot: TimeSlot, c: GenerationConstraints): boolean {
  const allowedDays = effectiveAllowedDays(c);
  return (
    allowedDays.includes(slot.day) &&
    slot.startMinutes >= c.minStartMinutes &&
    slot.endMinutes <= c.maxEndMinutes
  );
}

/**
 * Ensures that for each day, there is at most one "gap" between consecutive classes,
 * and that gap is no longer than 90 minutes.
 * A gap is defined as the time between the end of one class and the start of the next
 * on the same day, provided the next class doesn't start immediately or overlap.
 */
export function satisfiesCompressedConstraint(enrollments: CourseEnrollment[]): boolean {
  const timesByDay: Record<string, TimeSlot[]> = {};
  for (const e of enrollments) {
    for (const t of e.times) {
      if (!timesByDay[t.day]) {
        timesByDay[t.day] = [];
      }
      timesByDay[t.day].push(t);
    }
  }

  for (const day of Object.keys(timesByDay)) {
    const times = timesByDay[day];
    if (times.length <= 1) continue;

    times.sort((a, b) => a.startMinutes - b.startMinutes);
    let gapCount = 0;
    for (let i = 0; i < times.length - 1; i++) {
      const current = times[i];
      const next = times[i + 1];
      // Due to overlap checking elsewhere, current.endMinutes <= next.startMinutes usually.
      // A gap exists if the next class starts strictly after the current class ends.
      if (next.startMinutes > current.endMinutes) {
        const gapDuration = next.startMinutes - current.endMinutes;
        if (gapDuration > 0) {
          gapCount++;
          if (gapCount > 1 || gapDuration > 90) {
            return false;
          }
        }
      }
    }
  }

  return true;
}
