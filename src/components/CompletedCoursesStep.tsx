import { MultiSelect, Text, Stack } from '@mantine/core';
import type { ComboboxItem } from '@mantine/core';
import { createCourseOptions, renderCourseOption } from './CourseSelect';
import type { DataCache } from '../lib/dataCache';
import type { RemainingRequirement } from '../lib/requirements';

interface CompletedCoursesStepProps {
  cache: DataCache | null;
  remainingRequirements: RemainingRequirement[];
  completedCourses: string[];
  onChange: (courses: string[]) => void;
  hasProgram: boolean;
}

export function CompletedCoursesStep({
  cache,
  remainingRequirements,
  completedCourses,
  onChange,
  hasProgram,
}: CompletedCoursesStepProps) {
  const allCandidates = [
    ...new Set(remainingRequirements.flatMap((r) => r.candidateCourses)),
  ];
  const completedSet = new Set(completedCourses);
  const availableCandidates = allCandidates.filter((c) => !completedSet.has(c));
  const options = createCourseOptions(availableCandidates, cache);

  if (!hasProgram) {
    return (
      <Text c="dimmed">Select a program in Step 1 first.</Text>
    );
  }

  return (
    <Stack gap="md">
      <MultiSelect
        data-tour="completed-courses"
        label="Courses you have completed or are currently taking"
        placeholder="Search by course code or title..."
        data={options}
        value={completedCourses}
        onChange={onChange}
        searchable
        clearable
        renderOption={renderCourseOption(cache)}
        filter={({ options, search }) => {
          const q = search.toLowerCase().trim();
          if (!q) return options;
          return (options as ComboboxItem[]).filter(
            (o) =>
              o.value.toLowerCase().includes(q) ||
              o.label.toLowerCase().includes(q)
          );
        }}
        nothingFoundMessage="No courses found"
        description="Courses you have completed or are taking. You can also upload your transcript in Step 1."
      />
    </Stack>
  );
}
