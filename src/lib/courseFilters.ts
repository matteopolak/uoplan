export type CourseLanguageBucket = 'en' | 'fr' | 'other';

export interface CourseFilters {
  levels: CourseLevelBucket[];
  languageBuckets: CourseLanguageBucket[];
}

export type CourseLevelBucket = 'undergrad' | 'grad';

function extractNumericPart(code: string): string | null {
  const match = code.match(/(\d{4})/);
  return match ? match[1] : null;
}

export function isGraduateCourse(code: string): boolean {
  const numeric = extractNumericPart(code);
  if (!numeric) return false;
  const level = Number(numeric);
  if (Number.isNaN(level)) return false;
  return level >= 5000;
}

export function getCourseLevelBucket(code: string): CourseLevelBucket | null {
  const numeric = extractNumericPart(code);
  if (!numeric) return null;
  const level = Number(numeric);
  if (Number.isNaN(level)) return null;
  return level >= 5000 ? 'grad' : 'undergrad';
}

export function getCourseLanguageBucket(code: string): CourseLanguageBucket | null {
  const numeric = extractNumericPart(code);
  if (!numeric) return null;
  const secondDigit = Number(numeric[1]);
  if (Number.isNaN(secondDigit)) return null;
  if (secondDigit >= 1 && secondDigit <= 4) return 'en';
  if (secondDigit >= 5 && secondDigit <= 8) return 'fr';
  return 'other';
}

export function courseMatchesFilters(code: string, filters: CourseFilters): boolean {
  const levelBucket = getCourseLevelBucket(code);
  if (levelBucket && !filters.levels.includes(levelBucket)) {
    return false;
  }

  const bucket = getCourseLanguageBucket(code);
  if (bucket && !filters.languageBuckets.includes(bucket)) {
    return false;
  }

  return true;
}

