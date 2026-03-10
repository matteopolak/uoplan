import { useRef, useEffect } from 'react';
import { Box, Text } from '@mantine/core';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { startOfWeek } from 'date-fns';
import type { DataCache } from '../lib/dataCache';
import type {
  GeneratedSchedule,
  CourseEnrollment,
} from '../lib/scheduleGenerator';

interface CalendarViewProps {
  schedules: GeneratedSchedule[];
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
  cache: DataCache | null;
  selectedPerRequirement: Record<string, string[]>;
  onSwap: (scheduleIndex: number, enrollmentIndex: number, newCourseCode: string) => void;
}

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

const COLOR_HEX: Record<(typeof COLORS)[number], string> = {
  violet: '#7950f2',
  blue: '#228be6',
  teal: '#12b886',
  cyan: '#15aabf',
  pink: '#e64980',
  grape: '#be4bdb',
  indigo: '#4c6ef5',
  orange: '#fd7e14',
};

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
  componentSection: string;
  professor: string;
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

  const currentSchedule = schedules[selectedIndex] ?? schedules[0];

  const referenceWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  const events: CalendarEvent[] = currentSchedule.enrollments.flatMap((enrollment, enrollIdx) => {
    const swapCandidates = getSwapCandidates(enrollment.courseCode, selectedPerRequirement);
    const out: CalendarEvent[] = [];
    let timeIdx = 0;
    for (const [comp, { section }] of Object.entries(enrollment.sectionCombo)) {
      const sectionCode = section.sectionCode ?? section.section ?? '';
      const componentSection = `${comp} - ${sectionCode}`;
      const professor = [...new Set(section.instructors ?? [])].filter(Boolean).join(', ') || '—';
      for (const t of section.times) {
        if (t.startMinutes >= t.endMinutes) continue;
        const offset = DAY_OFFSETS[t.day] ?? null;
        if (offset == null) continue;
        const dayDate = addDays(referenceWeekStart, offset);
        const start = minutesToDate(dayDate, t.startMinutes);
        const end = minutesToDate(dayDate, t.endMinutes);
        out.push({
          id: `${enrollment.courseCode}-${comp}-${timeIdx}`,
          title: enrollment.courseCode,
          start,
          end,
          courseCode: enrollment.courseCode,
          enrollmentIndex: enrollIdx,
          swapCandidates,
          startMinutes: t.startMinutes,
          endMinutes: t.endMinutes,
          componentSection,
          professor,
        } satisfies CalendarEvent);
        timeIdx += 1;
      }
    }
    return out;
  });

  const fcEvents = events;
  const calendarRef = useRef<FullCalendar>(null);

  useEffect(() => {
    const el = calendarRef.current;
    if (!el) return;
    const api = el.getApi();
    //api.setOption('height', '100%');
  }, [selectedIndex, schedules.length]);

  return (
    <Box
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          background: '#111113',
          borderRadius: 'var(--mantine-radius-sm)',
          padding: '0.5rem',
          height: '100%',
        }}
      >
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={false}
            firstDay={1}
            weekends={false}
            allDaySlot={false}
            slotDuration="01:00:00"
            slotMinTime="08:00:00"
            slotMaxTime="22:00:00"
            slotLabelFormat={{
              hour: 'numeric',
              minute: '2-digit',
              hour12: false,
            }}
            expandRows={true}
            dayHeaderFormat={{ weekday: 'short' }}
            events={fcEvents.map((e) => ({
              id: e.id,
              title: e.courseCode,
              start: e.start,
              end: e.end,
              extendedProps: e,
            }))}
            initialDate={referenceWeekStart}
            height="100%"
            eventContent={(arg) => {
              const ext = arg.event.extendedProps as CalendarEvent;
              const colorName = COLORS[ext.enrollmentIndex % COLORS.length];
              const hex = COLOR_HEX[colorName];
              const [r, g, b] = hex.replace('#', '').match(/.{2}/g)!.map((x) => parseInt(x, 16));
              return (
                <div
                  className="fc-uschedule-event"
                  style={{
                    cursor: ext.swapCandidates.length > 0 ? 'pointer' : 'default',
                    borderLeft: `4px solid ${hex}`,
                    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.38)`,
                  }}
                >
                  <div className="fc-uschedule-event-body">
                    <span className="fc-uschedule-event-code">{ext.courseCode}</span>
                    <span className="fc-uschedule-event-type">{ext.componentSection}</span>
                    <span className="fc-uschedule-event-professor">{ext.professor}</span>
                  </div>
                </div>
              );
            }}
            eventClick={(info) => {
              const ext = info.event.extendedProps as CalendarEvent;
              if (!ext.swapCandidates.length) return;
              // Simple first-candidate swap to keep behavior without a custom menu
              const nextCode = ext.swapCandidates[0];
              onSwap(selectedIndex, ext.enrollmentIndex, nextCode);
            }}
          />
      </div>
    </Box>
  );
}
