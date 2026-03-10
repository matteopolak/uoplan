import { Stack, Select, Group, Text, Menu, Paper } from '@mantine/core';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
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

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse: (value, formatString) => parse(value, formatString, new Date(), { locale: enUS }),
  startOfWeek: (date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

const formats = {
  dayFormat: (date: Date, culture: string | undefined, loc: typeof localizer) =>
    loc.format(date, 'EEE', culture),
  dayRangeHeaderFormat: () => '',
};

const DAY_OFFSETS: Record<string, number> = {
  Mo: 0,
  Tu: 1,
  We: 2,
  Th: 3,
  Fr: 4,
};

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

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  courseCode: string;
  enrollmentIndex: number;
  swapCandidates: string[];
  startMinutes: number;
  endMinutes: number;
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

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

function addDays(date: Date, amount: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function minutesToDate(base: Date, totalMinutes: number): Date {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
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

  const referenceWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  const events: CalendarEvent[] = currentSchedule.enrollments.flatMap((enrollment, enrollIdx) => {
    if (enrollment.times.length === 0) {
      return [];
    }

    const swapCandidates = getSwapCandidates(enrollment.courseCode, selectedPerRequirement);

    return enrollment.times.map((t, timeIdx) => {
      const offset = DAY_OFFSETS[t.day] ?? null;
      if (offset == null) return null;

      const dayDate = addDays(referenceWeekStart, offset);
      const start = minutesToDate(dayDate, t.startMinutes);
      const end = minutesToDate(dayDate, t.endMinutes);

      return {
        id: `${enrollment.courseCode}-${timeIdx}`,
        title: enrollment.courseCode,
        start,
        end,
        courseCode: enrollment.courseCode,
        enrollmentIndex: enrollIdx,
        swapCandidates,
        startMinutes: t.startMinutes,
        endMinutes: t.endMinutes,
      } satisfies CalendarEvent;
    });
  }).filter((e): e is CalendarEvent => e !== null);

  function CourseEventInner({
    event,
  }: {
    event: CalendarEvent;
  }) {
    const color = COLORS[event.enrollmentIndex % COLORS.length];

    const block = (
      <Paper
        p="xs"
        radius="sm"
        bg={`var(--mantine-color-${color}-7)`}
        style={{
          fontSize: '0.7rem',
          cursor: event.swapCandidates.length > 0 ? 'pointer' : 'default',
          minHeight: 0,
        }}
      >
        <Text size="xs" fw={600} lineClamp={1} c="white">
          {event.courseCode}
        </Text>
        <Text size="xs" c="gray.3" lineClamp={1}>
          {formatTime(event.startMinutes)}–{formatTime(event.endMinutes)}
        </Text>
      </Paper>
    );

    if (event.swapCandidates.length === 0) {
      return block;
    }

    return (
      <Menu position="bottom-start" withArrow>
        <Menu.Target>{block}</Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Swap with</Menu.Label>
          {event.swapCandidates.map((code) => {
            const course = cache?.getCourse(code);
            return (
              <Menu.Item
                key={code}
                onClick={() => onSwap(selectedIndex, event.enrollmentIndex, code)}
              >
                {code} – {course?.title ?? ''}
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
    );
  }

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
        <Stack gap={0} mb={4}>
          <Text size="sm" c="dimmed">
            {schedules.length} total · click a block to swap
          </Text>
          <Text size="xs" c="dimmed">
            Showing {events.length} meeting block{events.length === 1 ? '' : 's'} this week
          </Text>
        </Stack>
      </Group>
      <div
        style={{
          height: 600,
          background: 'var(--mantine-color-dark-6)',
          borderRadius: 'var(--mantine-radius-sm)',
          padding: '0.5rem',
        }}
      >
        <Calendar
          localizer={localizer}
          events={events}
          defaultView="week"
          views={['week']}
          toolbar={false}
          formats={formats}
          step={30}
          timeslots={1}
          defaultDate={referenceWeekStart}
          min={minutesToDate(referenceWeekStart, 8 * 60)}
          max={minutesToDate(referenceWeekStart, 22 * 60)}
          style={{ height: '100%' }}
          components={{
            event: ({ event }) => <CourseEventInner event={event as CalendarEvent} />,
          }}
          eventPropGetter={() => ({
            style: {
              backgroundColor: 'transparent',
              border: 'none',
              padding: 0,
            },
          })}
        />
      </div>
    </Stack>
  );
}
