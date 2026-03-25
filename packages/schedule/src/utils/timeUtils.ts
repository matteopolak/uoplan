/**
 * Time and date utilities for schedule display and manipulation.
 */

/**
 * Add days to a date, returning a new Date object.
 */
export function addDays(date: Date, amount: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

/**
 * Convert total minutes from midnight to a Date object on a given base date.
 * e.g., 510 (8:30 AM) on Jan 1 2024 -> Date for Jan 1 2024 08:30:00
 */
export function minutesToDate(base: Date, totalMinutes: number): Date {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/**
 * Convert total minutes from midnight to a time string.
 * e.g., 510 -> "8:30 AM"
 */
export function minutesToTimeString(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  const minuteStr = minutes.toString().padStart(2, "0");
  return `${hours12}:${minuteStr} ${period}`;
}

/**
 * Convert total minutes from midnight to 24-hour time string.
 * e.g., 510 -> "08:30"
 */
export function minutesToTime24(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/**
 * Format a time range from two minute values.
 * e.g., (510, 620) -> "8:30 AM - 10:20 AM"
 */
export function formatTimeRange(startMinutes: number, endMinutes: number): string {
  return `${minutesToTimeString(startMinutes)} - ${minutesToTimeString(endMinutes)}`;
}

/**
 * Day abbreviation offsets for calendar positioning.
 * Sunday = 0, Monday = 1, etc.
 */
export const DAY_OFFSETS: Record<string, number> = {
  Su: 0,
  Mo: 1,
  Tu: 2,
  We: 3,
  Th: 4,
  Fr: 5,
  Sa: 6,
};

/**
 * Full day names by abbreviation.
 */
export const DAY_NAMES: Record<string, string> = {
  Su: "Sunday",
  Mo: "Monday",
  Tu: "Tuesday",
  We: "Wednesday",
  Th: "Thursday",
  Fr: "Friday",
  Sa: "Saturday",
};

/**
 * Get the day offset for a given day abbreviation.
 * Returns 0 (Sunday) as default if not found.
 */
export function getDayOffset(dayAbbr: string): number {
  return DAY_OFFSETS[dayAbbr] ?? 0;
}

/**
 * Parse a time string in "HH:MM" format to total minutes from midnight.
 * Returns null if invalid.
 */
export function parseTimeToMinutes(time: string): number | null {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Calculate duration in minutes between two time values.
 */
export function getDurationMinutes(startMinutes: number, endMinutes: number): number {
  return endMinutes - startMinutes;
}

/**
 * Check if two time ranges overlap.
 */
export function timeRangesOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean {
  return start1 < end2 && start2 < end1;
}
