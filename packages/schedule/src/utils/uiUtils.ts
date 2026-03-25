/**
 * UI utilities for colors, display formatting, and visual helpers.
 */

/**
 * Color palette for course calendar events.
 */
export const COURSE_COLORS = [
  "violet",
  "blue",
  "teal",
  "cyan",
  "pink",
  "grape",
  "indigo",
  "orange",
] as const;

export type CourseColor = (typeof COURSE_COLORS)[number];

/**
 * Hex color values for course colors.
 */
export const COURSE_COLOR_HEX: Record<CourseColor, string> = {
  violet: "#7950f2",
  blue: "#228be6",
  teal: "#12b886",
  cyan: "#15aabf",
  pink: "#e64980",
  grape: "#be4bdb",
  indigo: "#4c6ef5",
  orange: "#fd7e14",
};

/**
 * Get a course color by index (cycles through available colors).
 */
export function getCourseColor(index: number): CourseColor {
  return COURSE_COLORS[index % COURSE_COLORS.length];
}

/**
 * Get the hex value for a course color by index.
 */
export function getCourseColorHex(index: number): string {
  const color = getCourseColor(index);
  return COURSE_COLOR_HEX[color];
}

/**
 * Parse a hex color to RGB components.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace("#", "");
  const parts = cleanHex.match(/.{2}/g);
  if (!parts || parts.length < 3) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(parts[0], 16),
    g: parseInt(parts[1], 16),
    b: parseInt(parts[2], 16),
  };
}

/**
 * Rating color categories.
 */
export type RatingColor = "red" | "orange" | "yellow" | "green";

/**
 * Convert a professor rating (1-5 scale) to a color category.
 */
export function ratingToColor(rating: number): RatingColor {
  if (rating < 2.5) return "red";
  if (rating < 3.3) return "orange";
  if (rating < 4.0) return "yellow";
  return "green";
}

/**
 * Convert a rating color to a Mantine CSS variable.
 */
export function ratingColorToCssVar(color: RatingColor): string {
  switch (color) {
    case "red":
      return "var(--mantine-color-red-6)";
    case "orange":
      return "var(--mantine-color-orange-6)";
    case "yellow":
      return "var(--mantine-color-yellow-6)";
    case "green":
      return "var(--mantine-color-green-6)";
  }
}

/**
 * Requirement completion status colors.
 */
export type RequirementStatus = "complete" | "partial" | "incomplete" | "selected";

/**
 * Get the Mantine color for a requirement status.
 */
export function getRequirementStatusColor(status: RequirementStatus): string {
  switch (status) {
    case "complete":
      return "green";
    case "partial":
      return "yellow";
    case "selected":
      return "blue";
    case "incomplete":
    default:
      return "gray";
  }
}

/**
 * Format credits for display.
 * e.g., 3 -> "3 credits", 1 -> "1 credit"
 */
export function formatCredits(credits: number): string {
  return credits === 1 ? "1 credit" : `${credits} credits`;
}

/**
 * Truncate text to a maximum length with ellipsis.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}
