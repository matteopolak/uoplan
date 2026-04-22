import { useMemo, useCallback } from 'react';
import { Box, Text, Modal } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { startOfWeek } from 'date-fns';
import type { DataCache } from 'schedule';
import type { GeneratedSchedule } from 'schedule';
import type { ProfessorRatingsMap } from 'schedule';
import { CalendarEventContent } from './CalendarEventContent';
import { SwapModalContent } from './SwapModalContent';
import { useCalendarEvents, type CalendarEvent } from '../../hooks/useCalendarEvents';
import { useSwapModal } from '../../hooks/useSwapModal';
import { tr } from '../../i18n';

const EMPTY_COLOR_MAP: Record<string, number> = {};

interface CalendarViewProps {
  schedule: GeneratedSchedule | null;
  cache: DataCache | null;
  professorRatings: ProfessorRatingsMap | null;
  getSwapCandidates: (enrollmentIndex: number) => {
    candidates: string[];
    poolCourses: string[];
    requirementTitle?: string;
    rejectedWithConflict: Array<{ code: string; conflictsWith: string }>;
  };
  onSwap: (enrollmentIndex: number, newCourseCode: string) => void;
  /** courseCode → colorIndex map for stable colouring. */
  colorMap?: Record<string, number>;
}

export function CalendarView({
  schedule,
  cache,
  professorRatings,
  getSwapCandidates,
  onSwap,
  colorMap = EMPTY_COLOR_MAP,
}: CalendarViewProps) {
    const isMobile = useMediaQuery('(max-width: 768px)');

    // Expose animate() to parent - no-op for single schedule
    const swap = useSwapModal(getSwapCandidates, cache);

    const referenceWeekStart = useMemo(
      () => startOfWeek(new Date(), { weekStartsOn: 0 }),
      []
    );

    const events = useCalendarEvents(schedule, professorRatings, referenceWeekStart);

    const hasWeekendCourses = useMemo(() => {
      return events.some(e => {
        const day = e.start.getDay();
        return day === 0 || day === 6;
      });
    }, [events]);

    const showWeekends = !isMobile || hasWeekendCourses;

    const eventContent = useCallback(
      (arg: { event: { extendedProps: unknown } }) => {
        const ext = arg.event.extendedProps as CalendarEvent;
        return (
          <CalendarEventContent ext={ext} cache={cache} colorMap={colorMap} />
        );
      },
      [cache, colorMap]
    );

    const handleEventClick = (info: { event: { extendedProps: unknown } }) => {
      const ext = info.event.extendedProps as CalendarEvent;
      if (ext.enrollmentIndex != null) {
        swap.openModal(ext.enrollmentIndex, ext.courseCode);
      }
    };

    if (!schedule) {
      return (
        <Box
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#868E96',
          }}
        >
          <Text size="lg">{tr('calendarPage.noSchedule')}</Text>
        </Box>
      );
    }

    return (
      <Box
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <Box style={{ flex: 1, minHeight: 0 }}>
          <FullCalendar
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={false}
            allDaySlot={false}
            slotDuration="00:30:00"
            slotMinTime="08:00:00"
            slotMaxTime="23:00:00"
            firstDay={0}
            weekends={showWeekends}
            height="100%"
            events={events}
            eventContent={eventContent}
            eventClick={handleEventClick}
            slotLabelFormat={{
              hour: 'numeric',
              minute: '2-digit',
              omitZeroMinute: false,
              hour12: false,
            }}
            dayHeaderFormat={{ weekday: 'short' }}
            nowIndicator={false}
            navLinks={false}
            expandRows={true}
          />
        </Box>

        <Modal
          opened={swap.isOpen}
          onClose={swap.closeModal}
          title={swap.result?.requirementTitle}
          size="lg"
          centered
        >
          <SwapModalContent
            schedule={schedule}
            modalState={swap.modalState!}
            result={swap.result}
            loading={swap.loading}
            candidateOptions={swap.candidateOptions}
            query={swap.query}
            setQuery={swap.setQuery}
            closeModal={swap.closeModal}
            cache={cache}
            professorRatings={professorRatings}
            onSwap={onSwap}
          />
        </Modal>
      </Box>
    );
}
