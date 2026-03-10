import { Stack, NumberInput, Button, Text, Alert } from '@mantine/core';

interface ScheduleCountStepProps {
  coursesThisSemester: number;
  onCoursesChange: (n: number) => void;
  selectedCount: number;
  onGenerate: () => void;
  generating?: boolean;
  error?: string | null;
}

export function ScheduleCountStep({
  coursesThisSemester,
  onCoursesChange,
  selectedCount,
  onGenerate,
  generating = false,
  error,
}: ScheduleCountStepProps) {
  const needMore = selectedCount < coursesThisSemester;

  return (
    <Stack gap="md">
      <NumberInput
        label="How many courses do you want this semester?"
        value={coursesThisSemester}
        onChange={(v) => onCoursesChange(Number(v) || 4)}
        min={1}
        max={10}
      />
      {error && (
        <Alert color="red" variant="light" radius="sm">
          {error}
        </Alert>
      )}
      {needMore && (
        <Alert color="violet" variant="light" radius="sm">
          You selected {selectedCount} course(s). We will suggest additional
          courses from your remaining requirements to fill your schedule.
        </Alert>
      )}
      <Button
        size="md"
        color="violet"
        variant="filled"
        onClick={onGenerate}
        loading={generating}
        radius="sm"
      >
        Generate Schedules
      </Button>
    </Stack>
  );
}
