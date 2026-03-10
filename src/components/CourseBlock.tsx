import { Paper, Menu, Text } from '@mantine/core';
import type { CourseEnrollment } from '../lib/scheduleGenerator';
import type { DataCache } from '../lib/dataCache';

const COLORS = [
  'violet',
  'blue',
  'teal',
  'cyan',
  'pink',
  'grape',
  'indigo',
  'orange',
] as const;

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

interface CourseBlockProps {
  enrollment: CourseEnrollment;
  index: number;
  cache: DataCache | null;
  swapCandidates: string[];
  onSwap: (newCourseCode: string) => void;
  dayIdx: number;
  startRow: number;
  span: number;
  startMinutes: number;
  endMinutes: number;
}

export function CourseBlock({
  enrollment,
  index,
  cache,
  swapCandidates,
  onSwap,
  dayIdx,
  startRow,
  span,
  startMinutes,
  endMinutes,
}: CourseBlockProps) {
  const color = COLORS[index % COLORS.length];
  const col = dayIdx + 2;

  const block = (
    <Paper
      p="xs"
      radius="sm"
      bg={`var(--mantine-color-${color}-7)`}
      style={{
        gridColumn: col,
        gridRow: `${startRow} / span ${span}`,
        fontSize: '0.7rem',
        cursor: swapCandidates.length > 0 ? 'pointer' : 'default',
        minHeight: 0,
      }}
    >
      <Text size="xs" fw={600} lineClamp={1} c="white">
        {enrollment.courseCode}
      </Text>
      <Text size="xs" c="gray.3" lineClamp={1}>
        {formatTime(startMinutes)}–{formatTime(endMinutes)}
      </Text>
    </Paper>
  );

  if (swapCandidates.length > 0) {
    return (
      <Menu key={`${enrollment.courseCode}-${dayIdx}`} position="bottom-start" withArrow>
        <Menu.Target>{block}</Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Swap with</Menu.Label>
          {swapCandidates.map((code) => {
            const c = cache?.getCourse(code);
            return (
              <Menu.Item key={code} onClick={() => onSwap(code)}>
                {code} – {c?.title ?? ''}
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
    );
  }

  return block;
}
