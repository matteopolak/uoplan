import type { ReactNode } from 'react';
import type { DataCache } from 'schedule';

/** Options use label = code so selected pills show only the code; use renderOption in MultiSelect to show "code – title" in the dropdown. */
export function createCourseOptions(
  codes: string[],
  _cache: DataCache | null
): { value: string; label: string }[] {
  return codes.map((code) => ({
    value: code,
    label: code,
  }));
}

/** Use with MultiSelect renderOption to show "code – title" in the dropdown while pills show code only. */
export function renderCourseOption(
  cache: DataCache | null
): (input: { option: { value: string; label: string } }) => ReactNode {
  return ({ option }) => {
    const course = cache?.getCourse(option.value);
    return course?.title ? `${option.value} – ${course.title}` : option.value;
  };
}
