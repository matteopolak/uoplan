import { Paper, Stack, SimpleGrid } from '@mantine/core';
import { CourseBlock } from './CourseBlock';
import type { GeneratedSchedule } from 'schedule';
import type { DataCache } from 'schedule';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DAY_KEYS = ['Mo', 'Tu', 'We', 'Th', 'Fr'] as const;
const HOURS = 14;
const START_HOUR = 8;
const MINUTES_PER_SLOT = 30;

interface ScheduleCardProps {
  schedule: GeneratedSchedule;
  index: number;
  cache: DataCache | null;
  selectedPerRequirement: Record<string, string[]>;
  onSwap: (enrollmentIndex: number, newCourseCode: string) => void;
}

function getSwapCandidates(
  courseCode: string,
  selectedPerRequirement: Record<string, string[]>
): string[] {
  const reqIds = Object.entries(selectedPerRequirement)
    .filter(([, courses]) => courses.includes(courseCode))
    .map(([id]) => id);

  const candidates = new Set<string>();
  for (const id of reqIds) {
    for (const c of selectedPerRequirement[id] ?? []) {
      if (c !== courseCode) candidates.add(c);
    }
  }
  return [...candidates];
}

export function ScheduleCard({
  schedule,
  cache,
  selectedPerRequirement,
  onSwap,
}: ScheduleCardProps) {
  const rows = HOURS * 2;

  const blocks: React.ReactNode[] = [];
  schedule.enrollments.forEach((enrollment, enrollIdx) => {
    if (enrollment.times.length === 0) {
      blocks.push(
        <Paper
          key={`${enrollment.courseCode}-empty`}
          p="xs"
          radius="sm"
          bg="var(--mantine-color-dark-5)"
          style={{ gridColumn: 1, gridRow: 1, fontSize: '0.75rem' }}
        >
          <span style={{ fontWeight: 600, color: 'var(--mantine-color-gray-3)' }}>{enrollment.courseCode}</span>
          <span style={{ color: 'var(--mantine-color-dimmed)' }}> (No set times)</span>
        </Paper>
      );
      return;
    }
    enrollment.times.forEach((t, ti) => {
      const dayIdx = DAY_KEYS.indexOf(t.day as (typeof DAY_KEYS)[number]);
      if (dayIdx < 0) return;
      const startRow =
        ((t.startMinutes - START_HOUR * 60) / MINUTES_PER_SLOT) * 2 + 1;
      const span = ((t.endMinutes - t.startMinutes) / MINUTES_PER_SLOT) * 2;
      blocks.push(
        <CourseBlock
          key={`${enrollment.courseCode}-${dayIdx}-${ti}`}
          enrollment={enrollment}
          index={enrollIdx}
          cache={cache}
          swapCandidates={getSwapCandidates(
            enrollment.courseCode,
            selectedPerRequirement
          )}
          onSwap={(code) => onSwap(enrollIdx, code)}
          dayIdx={dayIdx}
          startRow={startRow}
          span={span}
          startMinutes={t.startMinutes}
          endMinutes={t.endMinutes}
        />
      );
    });
  });

  return (
    <Paper p="sm" withBorder radius="sm" style={{ background: 'var(--mantine-color-dark-6)' }}>
      <Stack gap="xs">
        <SimpleGrid
          cols={7}
          style={{
            gridTemplateRows: `auto repeat(${rows}, 1fr)`,
            minHeight: 400,
            gap: 2,
          }}
        >
          <div style={{ gridColumn: 1, gridRow: 1 }} />
          {DAYS.map((d, i) => (
            <div
              key={d}
              style={{
                gridColumn: i + 2,
                gridRow: 1,
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--mantine-color-gray-4)',
              }}
            >
              {d}
            </div>
          ))}
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              style={{
                gridColumn: 1,
                gridRow: i + 2,
                fontSize: '0.65rem',
                color: 'var(--mantine-color-dark-2)',
              }}
            >
              {Math.floor(i / 2) + START_HOUR}:{i % 2 === 0 ? '00' : '30'}
            </div>
          ))}
          {blocks}
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}
