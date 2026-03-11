import { Stack, NumberInput, Button, Alert, Group, MultiSelect, TextInput } from '@mantine/core';
import type { DayOfWeek } from '../schemas/schedules';

const DAY_OPTIONS: { value: DayOfWeek; label: string }[] = [
  { value: 'Mo', label: 'Monday' },
  { value: 'Tu', label: 'Tuesday' },
  { value: 'We', label: 'Wednesday' },
  { value: 'Th', label: 'Thursday' },
  { value: 'Fr', label: 'Friday' },
  { value: 'Sa', label: 'Saturday' },
  { value: 'Su', label: 'Sunday' },
];

/** Format minutes since midnight as HH:mm for input type="time". */
function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Parse HH:mm from input type="time" to minutes since midnight. */
function timeStringToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return Math.max(0, Math.min(24 * 60 - 1, h * 60 + m));
}

interface ScheduleCountStepProps {
  coursesThisSemester: number;
  onCoursesChange: (n: number) => void;
  selectedCount: number;
  minStartMinutes: number;
  onMinStartMinutesChange: (minutes: number) => void;
  maxEndMinutes: number;
  onMaxEndMinutesChange: (minutes: number) => void;
  allowedDays: DayOfWeek[];
  onAllowedDaysChange: (days: DayOfWeek[]) => void;
  onGenerate: () => void;
  generating?: boolean;
  error?: string | null;
  disableGenerate?: boolean;
  disableGenerateReason?: string;
}

export function ScheduleCountStep({
  coursesThisSemester,
  onCoursesChange,
  selectedCount,
  minStartMinutes,
  onMinStartMinutesChange,
  maxEndMinutes,
  onMaxEndMinutesChange,
  allowedDays,
  onAllowedDaysChange,
  onGenerate,
  generating = false,
  error,
  disableGenerate = false,
  disableGenerateReason,
}: ScheduleCountStepProps) {
  const needMore = selectedCount < coursesThisSemester;

  return (
    <Stack gap="md">
      <NumberInput
        label="How many courses do you want this semester?"
        value={coursesThisSemester}
        onChange={(v) => onCoursesChange(Number(v) || 5)}
        min={1}
        max={10}
      />
      <Group align="flex-end" gap="md">
        <TextInput
          label="Earliest class start"
          type="time"
          value={minutesToTimeString(minStartMinutes)}
          onChange={(e) => onMinStartMinutesChange(timeStringToMinutes(e.currentTarget.value))}
        />
        <TextInput
          label="Latest class end"
          type="time"
          value={minutesToTimeString(maxEndMinutes)}
          onChange={(e) => onMaxEndMinutesChange(timeStringToMinutes(e.currentTarget.value))}
        />
      </Group>
      <MultiSelect
        label="Days of the week allowed"
        placeholder="Select days"
        data={DAY_OPTIONS}
        value={allowedDays}
        onChange={(values) => onAllowedDaysChange(values as DayOfWeek[])}
        clearable
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
      {disableGenerate && disableGenerateReason && (
        <Alert color="yellow" variant="light" radius="sm">
          {disableGenerateReason}
        </Alert>
      )}
      <Button
        data-tour="generate-schedules"
        size="sm"
        color="violet"
        variant="filled"
        onClick={onGenerate}
        loading={generating}
        disabled={disableGenerate || generating}
        radius={0}
        style={{ border: '2px solid black' }}
      >
        Generate Schedules
      </Button>
    </Stack>
  );
}
