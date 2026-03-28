import { Stack, NumberInput, Button, Alert, Group, MultiSelect, TextInput, Select, Checkbox, List, Text } from '@mantine/core';
import type { DayOfWeek } from 'schemas';

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
  minProfessorRating: number | null;
  onMinProfessorRatingChange: (rating: number | null) => void;
  /** Total 1000-level credits (completed + selected this semester). */
  totalFirstYearCredits: number;
  /** True if totalFirstYearCredits > 48. */
  warnFirstYearLimit: boolean;
  limitFirstYearCredits: boolean;
  onLimitFirstYearCreditsChange: (v: boolean) => void;
  compressedSchedule: boolean;
  onCompressedScheduleChange: (v: boolean) => void;
  onGenerate: () => void;
  generating?: boolean;
  error?: string | null;
  errorDetails?: {
    emptyPools: Array<{ label: string; requirementId?: string }>;
    totalAvailable: number;
    totalNeeded: number;
  } | null;
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
  minProfessorRating,
  onMinProfessorRatingChange,
  totalFirstYearCredits,
  warnFirstYearLimit,
  limitFirstYearCredits,
  onLimitFirstYearCreditsChange,
  compressedSchedule,
  onCompressedScheduleChange,
  onGenerate,
  generating = false,
  error,
  errorDetails,
  disableGenerate = false,
  disableGenerateReason,
}: ScheduleCountStepProps) {
  const needMore = selectedCount < coursesThisSemester;
  const summarizeEmptyPools =
    errorDetails &&
    errorDetails.emptyPools.length > 4 &&
    errorDetails.totalAvailable < errorDetails.totalNeeded;
  const ratingOptions = [
    { value: '2', label: '2.0+' },
    { value: '2.5', label: '2.5+' },
    { value: '3', label: '3.0+' },
    { value: '3.5', label: '3.5+' },
    { value: '4', label: '4.0+' },
    { value: '4.5', label: '4.5+' },
  ];

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
        description="If you clear this, weekdays (Mon–Fri) are used for generation."
        placeholder="Select days"
        data={DAY_OPTIONS}
        value={allowedDays}
        onChange={(values) => onAllowedDaysChange(values as DayOfWeek[])}
        clearable
      />
      <Select
        label="Minimum RateMyProfessors rating"
        description="Professors without a rating are always allowed."
        placeholder="No minimum"
        data={ratingOptions}
        value={minProfessorRating == null ? null : String(minProfessorRating)}
        onChange={(v) => onMinProfessorRatingChange(v == null ? null : Number(v))}
        clearable
      />
      {warnFirstYearLimit && (
        <Alert color="yellow" variant="light" radius={0}>
          Your selected courses may push your total 1000-level credits to {totalFirstYearCredits}/48,
          exceeding the undergraduate limit. Enable the option below to cap them at 48.
        </Alert>
      )}
      {totalFirstYearCredits > 0 && (
        <Checkbox
          label="Limit 1000-level courses to 48 credits"
          description={`You currently have ${totalFirstYearCredits} credit${totalFirstYearCredits === 1 ? '' : 's'} of 1000-level courses (completed + selected). The undergraduate limit is 48.`}
          checked={limitFirstYearCredits}
          onChange={(e) => onLimitFirstYearCreditsChange(e.currentTarget.checked)}
        />
      )}
      <Checkbox
        label="Compressed schedule"
        description="At most one break per day, up to 90 minutes."
        checked={compressedSchedule}
        onChange={(e) => onCompressedScheduleChange(e.currentTarget.checked)}
      />
      {error && (
        <Alert color="red" variant="light" radius={0}>
          <Stack gap="xs">
            <Text size="sm">{error}</Text>
            {errorDetails &&
              errorDetails.totalAvailable < errorDetails.totalNeeded && (
                <Text size="sm" fw={500}>
                  Only {errorDetails.totalAvailable} course
                  {errorDetails.totalAvailable !== 1 ? "s" : ""} can be scheduled
                  with your current filters this term. Try reducing how many
                  courses you want this semester to {errorDetails.totalAvailable}{" "}
                  or relax time, day, level, or prerequisite constraints.
                </Text>
              )}
            {errorDetails &&
              errorDetails.emptyPools.length > 0 &&
              summarizeEmptyPools && (
                <Text size="sm" c="dimmed">
                  {errorDetails.emptyPools.length} other requirements have no
                  eligible courses this term (missing schedule, prerequisites, or
                  level filters). That is common for future-term courses with no
                  timetable yet; it is not the main limit on how many courses you
                  can take now.
                </Text>
              )}
            {errorDetails &&
              errorDetails.emptyPools.length > 0 &&
              !summarizeEmptyPools && (
                <>
                  <Text size="sm" fw={500}>
                    Requirements with no eligible courses this term:
                  </Text>
                  <List size="sm" spacing={2}>
                    {errorDetails.emptyPools.map((p) => (
                      <List.Item key={p.requirementId ?? p.label}>
                        {p.requirementId &&
                        (p.label === "course" || p.label === "or_course")
                          ? p.requirementId
                          : `${p.label}${p.requirementId ? ` (${p.requirementId})` : ""}`}
                      </List.Item>
                    ))}
                  </List>
                </>
              )}
          </Stack>
        </Alert>
      )}
      {needMore && (
        <Alert color="blue" variant="light" radius={0}>
          You selected {selectedCount} course(s). We will suggest additional
          courses from your remaining requirements to fill your schedule.
        </Alert>
      )}
      {disableGenerate && disableGenerateReason && (
        <Alert color="yellow" variant="light" radius={0}>
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
