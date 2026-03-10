import { Stack, Select, Group, Text } from '@mantine/core';
import { ScheduleCard } from './ScheduleCard';
import type { DataCache } from '../lib/dataCache';
import type { GeneratedSchedule } from '../lib/scheduleGenerator';

interface CalendarViewProps {
  schedules: GeneratedSchedule[];
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
  cache: DataCache | null;
  selectedPerRequirement: Record<string, string[]>;
  onSwap: (scheduleIndex: number, enrollmentIndex: number, newCourseCode: string) => void;
}

export function CalendarView({
  schedules,
  selectedIndex,
  onSelectIndex,
  cache,
  selectedPerRequirement,
  onSwap,
}: CalendarViewProps) {
  if (schedules.length === 0) {
    return (
      <Text c="dimmed">
        No schedules generated yet. Complete the steps above and click Generate.
      </Text>
    );
  }

  const scheduleOptions = schedules.map((_, i) => ({
    value: String(i),
    label: `Schedule #${i + 1}`,
  }));

  const currentSchedule = schedules[selectedIndex] ?? schedules[0];

  return (
    <Stack gap="sm">
      <Group align="flex-end">
        <Select
          label="Schedule"
          data={scheduleOptions}
          value={String(Math.min(selectedIndex, schedules.length - 1))}
          onChange={(v) => onSelectIndex(Number(v ?? 0))}
          w={200}
          size="md"
          radius="sm"
        />
        <Text size="sm" c="dimmed" mb={6}>
          {schedules.length} total · click a block to swap
        </Text>
      </Group>
      <ScheduleCard
        schedule={currentSchedule}
        index={selectedIndex}
        cache={cache}
        selectedPerRequirement={selectedPerRequirement}
        onSwap={(enrollIdx, code) => onSwap(selectedIndex, enrollIdx, code)}
      />
    </Stack>
  );
}
