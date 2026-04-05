import type { CourseEnrollment, TimeSlot } from './types';

export function timesOverlap(a: TimeSlot, b: TimeSlot): boolean {
  if (a.day !== b.day) return false;
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

export function enrollmentsOverlap(a: CourseEnrollment, b: CourseEnrollment): boolean {
  for (const ta of a.times) {
    for (const tb of b.times) {
      if (timesOverlap(ta, tb)) return true;
    }
  }
  return false;
}

export function getFirstOverlapWith(
  enrollment: CourseEnrollment,
  existingEnrollments: CourseEnrollment[]
): CourseEnrollment | null {
  for (const existing of existingEnrollments) {
    if (enrollmentsOverlap(enrollment, existing)) {
      return existing;
    }
  }
  return null;
}
