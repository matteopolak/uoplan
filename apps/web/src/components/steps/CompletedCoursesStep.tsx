import { Alert, MultiSelect, Text, Stack } from '@mantine/core';
import type { ComboboxItem } from '@mantine/core';
import { createCourseOptions, renderCourseOption } from '../shared/CourseSelect';
import type { DataCache } from 'schedule';
import type { RemainingRequirement } from 'schedule';
import { tr } from '../../i18n';

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
      <Alert color="blue" variant="light" radius={0}>
        <Text size="sm">
          {tr("completedCourses.selectProgramFirst")}
        </Text>
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <MultiSelect
        data-tour="completed-courses"
        label={tr("completedCourses.label", )}
        placeholder={tr("completedCourses.placeholder", )}
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
        nothingFoundMessage={tr("completedCourses.notFound")}
        description={tr("completedCourses.description", )}
      />
    </Stack>
  );
}
