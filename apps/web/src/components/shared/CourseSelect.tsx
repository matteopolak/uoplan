import type { ReactNode } from 'react';
import { Select } from '@mantine/core';
import type { ComboboxItem } from '@mantine/core';
import type { DataCache } from 'schedule';

interface CourseSelectProps {
  label?: string;
  placeholder?: string;
  data: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
  filter?: (code: string) => boolean;
  multiple?: boolean;
}

function filterByQuery(options: ComboboxItem[], query: string): ComboboxItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return options;
  return options.filter(
    (o) => o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)
  );
}

export function CourseSelect({
  label,
  placeholder = 'Search by code or title...',
  data,
  value,
  onChange,
  filter,
}: CourseSelectProps) {
  const filteredData = filter
    ? data.filter((d) => filter(d.value))
    : data;

  return (
    <Select
      label={label}
      placeholder={placeholder}
      data={filteredData}
      value={value}
      onChange={onChange}
      searchable
      clearable
      filter={({ options, search }) => filterByQuery(options as ComboboxItem[], search)}
      nothingFoundMessage="No courses found"
    />
  );
}

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
