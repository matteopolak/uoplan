import type { Course } from 'schemas'
import type { DataCache } from "../dataCache";

/**
 * Normalize course code for consistent lookup.
 * Handles variations like "AMM 5101", "AMM5101", "amm 5101" -> "AMM 5101"
 */
export function normalizeCourseCode(code: string): string {
  const match = code.match(/^([A-Z]{3,4})\s*(\d{4,5}[A-Z]?)$/i);
  if (!match) return code.trim();
  return `${match[1].toUpperCase()} ${match[2]}`;
}

/**
 * Check if a course is an honours project / research course.
 * These courses are handled specially - they satisfy requirements but
 * are not scheduled like regular courses.
 */
export function isHonoursProject(code: string, cache: DataCache | null): boolean {
  if (!cache) return false;
  const course = cache.getCourse(code);
  return course?.code.endsWith('900') ?? false;
}

/**
 * Check if a course is a work term / stage course.
 * These are typically excluded from scheduling.
 */
export function isWorkTermCourse(course: Course): boolean {
  const component = course.component?.trim().toLowerCase() ?? "";
  return component.includes("work term");
}

/**
 * Get the credits for a course, defaulting to 3 if not found.
 */
export function getCourseCredits(code: string, cache: DataCache | null): number {
  if (!cache) return 3;
  return cache.getCourse(code)?.credits ?? 3;
}

/**
 * Get total credits for a list of course codes.
 */
export function getTotalCredits(codes: string[], cache: DataCache | null): number {
  if (!cache) return 0;
  return codes.reduce((sum, code) => sum + getCourseCredits(code, cache), 0);
}

/**
 * Parse a course code into its discipline and number parts.
 * e.g., "CSI 2101" -> { discipline: "CSI", number: "2101" }
 */
export function parseCourseCode(code: string): {
  discipline: string;
  number: string;
} | null {
  const match = code.match(/^([A-Z]{3,4})\s*(\d{4,5}[A-Z]?)$/i);
  if (!match) return null;
  return {
    discipline: match[1].toUpperCase(),
    number: match[2],
  };
}

/**
 * Get the level of a course (1000, 2000, etc.) from its code.
 * Returns the thousands digit * 1000.
 */
export function getCourseLevel(code: string): number | null {
  const parsed = parseCourseCode(code);
  if (!parsed) return null;
  const firstDigit = parsed.number.charAt(0);
  const digit = parseInt(firstDigit, 10);
  if (Number.isNaN(digit)) return null;
  return digit * 1000;
}

/**
 * Format a course code with its title for display.
 * e.g., "CSI 2101" + "Discrete Structures" -> "CSI 2101 - Discrete Structures"
 */
export function formatCourseWithTitle(
  code: string,
  cache: DataCache | null,
  separator: string = " - "
): string {
  const course = cache?.getCourse(code);
  const title = course?.title?.trim();
  if (!title) return code;
  return `${code}${separator}${title}`;
}
