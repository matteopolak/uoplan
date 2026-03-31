import React from 'react';
import { Stack, NumberInput, Button, Alert, Group, MultiSelect, TextInput, Select, Checkbox } from '@mantine/core';
import type { DayOfWeek } from 'schemas';
import type { GenerationErrorDetails } from '../../store/types';
import { GenerationErrorDetailBlocks } from '../GenerationErrorDetailBlocks';
import { tr } from "../../i18n";

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
  errorDetails?: GenerationErrorDetails | null;
  disableGenerate?: boolean;
  disableGenerateReason?: string;
  beforeGenerate?: React.ReactNode;
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
  beforeGenerate,
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
  const dayOptions: { value: DayOfWeek; label: string }[] = [
    { value: 'Mo', label: tr("scheduleCount.day.monday") },
    { value: 'Tu', label: tr("scheduleCount.day.tuesday") },
    { value: 'We', label: tr("scheduleCount.day.wednesday") },
    { value: 'Th', label: tr("scheduleCount.day.thursday") },
    { value: 'Fr', label: tr("scheduleCount.day.friday") },
    { value: 'Sa', label: tr("scheduleCount.day.saturday") },
    { value: 'Su', label: tr("scheduleCount.day.sunday") },
  ];

  return (
    <Stack gap="md" data-tour="generate-step">
      <NumberInput
        label={tr("scheduleCount.courses.label")}
        value={coursesThisSemester}
        onChange={(v) => onCoursesChange(Number(v) || 5)}
        min={1}
        max={10}
      />
      <Group align="flex-end" gap="md">
        <TextInput
          label={tr("scheduleCount.time.earliest")}
          type="time"
          value={minutesToTimeString(minStartMinutes)}
          onChange={(e) => onMinStartMinutesChange(timeStringToMinutes(e.currentTarget.value))}
        />
        <TextInput
          label={tr("scheduleCount.time.latest")}
          type="time"
          value={minutesToTimeString(maxEndMinutes)}
          onChange={(e) => onMaxEndMinutesChange(timeStringToMinutes(e.currentTarget.value))}
        />
      </Group>
      <MultiSelect
        label={tr("scheduleCount.days.label")}
        description={tr("scheduleCount.days.description")}
        placeholder={tr("scheduleCount.days.placeholder")}
        data={dayOptions}
        value={allowedDays}
        onChange={(values) => onAllowedDaysChange(values as DayOfWeek[])}
        clearable
      />
      <Select
        label={tr("scheduleCount.rating.label")}
        description={tr("scheduleCount.rating.description")}
        placeholder={tr("scheduleCount.rating.placeholder")}
        data={ratingOptions}
        value={minProfessorRating == null ? null : String(minProfessorRating)}
        onChange={(v) => onMinProfessorRatingChange(v == null ? null : Number(v))}
        clearable
      />
      {warnFirstYearLimit && (
        <Alert color="yellow" variant="light" radius={0}>
          {tr(
            "scheduleCount.firstYear.warning",
            { credits: totalFirstYearCredits },
          )}
        </Alert>
      )}
      {totalFirstYearCredits > 0 && (
        <Checkbox
          label={tr("scheduleCount.firstYear.limitLabel")}
          description={tr(
            "scheduleCount.firstYear.limitDescription",
            {
              credits: totalFirstYearCredits,
              suffix: totalFirstYearCredits === 1 ? "" : "s",
            },
          )}
          checked={limitFirstYearCredits}
          onChange={(e) => onLimitFirstYearCreditsChange(e.currentTarget.checked)}
        />
      )}
      <Checkbox
        label={tr("scheduleCount.compressed.label")}
        description={tr("scheduleCount.compressed.description")}
        checked={compressedSchedule}
        onChange={(e) => onCompressedScheduleChange(e.currentTarget.checked)}
      />
      {error && (
        <Alert color="red" variant="light" radius={0} title={error}>
          <GenerationErrorDetailBlocks
            errorDetails={errorDetails}
            summarizeEmptyPools={!!summarizeEmptyPools}
          />
        </Alert>
      )}
      {needMore && (
        <Alert color="blue" variant="light" radius={0}>
          {tr(
            "scheduleCount.needMore",
            { count: selectedCount },
          )}
        </Alert>
      )}
      {disableGenerate && disableGenerateReason && (
        <Alert color="yellow" variant="light" radius={0}>
          {disableGenerateReason}
        </Alert>
      )}
      {beforeGenerate}
      <Button
        size="sm"
        color="violet"
        variant="filled"
        onClick={onGenerate}
        loading={generating}
        disabled={disableGenerate || generating}
        radius={0}
        style={{ border: '2px solid black' }}
      >
        {tr("scheduleCount.generate")}
      </Button>
    </Stack>
  );
}
