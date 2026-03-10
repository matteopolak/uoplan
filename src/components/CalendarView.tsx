import { useRef, useEffect, useMemo, useState } from 'react';
import { Box, Text, Modal, Stack, Button, Select } from '@mantine/core';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { startOfWeek } from 'date-fns';
import type { DataCache } from '../lib/dataCache';
import type { GeneratedSchedule } from '../lib/scheduleGenerator';

interface CalendarViewProps {
  schedules: GeneratedSchedule[];
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
  cache: DataCache | null;
  getSwapCandidates: (scheduleIndex: number, enrollmentIndex: number) => string[];
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
  startMinutes: number;
  endMinutes: number;
  componentSection: string;
  professor: string;
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
  onSelectIndex: _onSelectIndex,
  cache,
  getSwapCandidates,
  onSwap,
}: CalendarViewProps) {
  const [swapModal, setSwapModal] = useState<{
    enrollmentIndex: number;
    courseCode: string;
  } | null>(null);
  const [swapCandidates, setSwapCandidates] = useState<string[]>([]);
  const [loadingSwapCandidates, setLoadingSwapCandidates] = useState(false);
  const [swapQuery, setSwapQuery] = useState('');

  useEffect(() => {
    if (!swapModal) {
      setSwapCandidates([]);
      setLoadingSwapCandidates(false);
      setSwapQuery('');
      return;
    }
    setLoadingSwapCandidates(true);
    setSwapCandidates([]);
    setSwapQuery('');
    // Defer so modal can paint before doing heavier work.
    const t = window.setTimeout(() => {
      const next = getSwapCandidates(selectedIndex, swapModal.enrollmentIndex);
      setSwapCandidates(next);
      setLoadingSwapCandidates(false);
    }, 0);
    return () => window.clearTimeout(t);
  }, [getSwapCandidates, selectedIndex, swapModal]);

  const swapCandidateOptions = useMemo(() => {
    return swapCandidates.map((code) => {
      const course = cache?.getCourse(code);
      const title = (course?.title ?? '').trim();
      return {
        value: code,
        label: title ? `${code} — ${title}` : code,
      };
    });
  }, [cache, swapCandidates]);

  const swapDropdown = useMemo(() => {
    if (!swapModal) return null;
    if (loadingSwapCandidates) {
      return (
        <Text size="sm" c="dimmed">
          Finding swap options…
        </Text>
      );
    }
    if (swapCandidates.length === 0) {
      return (
        <Text size="sm" c="dimmed">
          No alternative courses available.
        </Text>
      );
    }
    return (
      <Select
        label="Swap with"
        placeholder="Search courses…"
        searchable
        data={swapCandidateOptions}
        value={null}
        searchValue={swapQuery}
        onSearchChange={setSwapQuery}
        nothingFoundMessage="No matches"
        maxDropdownHeight={260}
        onChange={(v: string | null) => {
          if (!v) return;
          onSwap(selectedIndex, swapModal.enrollmentIndex, v);
          setSwapModal(null);
        }}
        styles={{
          option: { paddingTop: 6, paddingBottom: 6 },
          dropdown: { padding: 4 },
        }}
      />
    );
  }, [
    loadingSwapCandidates,
    onSwap,
    selectedIndex,
    swapCandidateOptions,
    swapCandidates.length,
    swapModal,
    swapQuery,
  ]);

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

  // Keep ref stable; no imperative calendar calls currently needed.
  useEffect(() => {}, [selectedIndex, schedules.length]);

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
              const courseTitle = cache?.getCourse(ext.courseCode)?.title ?? '';
              const heading = courseTitle
                ? `${ext.courseCode} — ${courseTitle}`
                : ext.courseCode;
              const colorName = COLORS[ext.enrollmentIndex % COLORS.length];
              const hex = COLOR_HEX[colorName];
              const [r, g, b] = hex.replace('#', '').match(/.{2}/g)!.map((x) => parseInt(x, 16));
              return (
                <div
                  className="fc-uschedule-event"
                  style={{
                    cursor: 'pointer',
                    borderLeft: `4px solid ${hex}`,
                    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.38)`,
                  }}
                >
                  <div className="fc-uschedule-event-body">
                    <span
                      className="fc-uschedule-event-code"
                      title={heading}
                    >
                      {heading}
                    </span>
                    <span className="fc-uschedule-event-type">{ext.componentSection}</span>
                    <span className="fc-uschedule-event-professor">{ext.professor}</span>
                  </div>
                </div>
              );
            }}
            eventClick={(info) => {
              const ext = info.event.extendedProps as CalendarEvent;
              setSwapModal({
                enrollmentIndex: ext.enrollmentIndex,
                courseCode: ext.courseCode,
              });
            }}
          />
      </div>

      <Modal
        opened={swapModal !== null}
        onClose={() => setSwapModal(null)}
        title={`Swap ${swapModal?.courseCode ?? ''}`}
      >
        {swapModal && (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Choose a course to replace {swapModal.courseCode}:
            </Text>
            {swapDropdown}
            <Button variant="default" onClick={() => setSwapModal(null)}>
              Cancel
            </Button>
          </Stack>
        )}
      </Modal>
    </Box>
  );
}
