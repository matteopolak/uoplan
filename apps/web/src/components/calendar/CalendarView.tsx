import { useRef, useEffect, useMemo, useImperativeHandle, forwardRef, useCallback } from 'react';
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
import { useSwapModal, type SwapCandidatesGetter } from '../../hooks/useSwapModal';
import { useCalendarMorph } from '../../hooks/useCalendarMorph';
import { ScheduleMorphOverlay } from './ScheduleMorphOverlay';
import { tr } from '../../i18n';

const EMPTY_COLOR_MAP: Record<string, number> = {};

export interface CalendarViewHandle {
  /** Trigger a morph animation to the given schedule index. */
  animate: (newIndex: number) => void;
}

interface CalendarViewProps {
  schedules: GeneratedSchedule[];
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
  cache: DataCache | null;
  professorRatings: ProfessorRatingsMap | null;
  getSwapCandidates: SwapCandidatesGetter;
  onSwap: (scheduleIndex: number, enrollmentIndex: number, newCourseCode: string) => void;
  /** Per-schedule courseCode → colorIndex maps for stable colouring. */
  colorMaps?: Record<string, number>[];
}

export const CalendarView = forwardRef<CalendarViewHandle, CalendarViewProps>(
  function CalendarView(
    {
      schedules,
      selectedIndex,
      onSelectIndex: _onSelectIndex,
      cache,
      professorRatings,
      getSwapCandidates,
      onSwap,
      colorMaps = [],
    },
    ref,
  ) {
    const isMobile = useMediaQuery('(max-width: 768px)');
    const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)') ?? false;

    // Ref on the container that holds all .fc-uoplan-event nodes
    const containerRef = useRef<HTMLDivElement>(null);

    const morph = useCalendarMorph(selectedIndex, containerRef, prefersReducedMotion);

    // Expose animate() to parent via ref
    useImperativeHandle(ref, () => ({
      animate: (newIndex: number) => {
        morph.triggerTransition(newIndex);
      },
    }));

    // When selectedIndex changes from the parent but we haven't triggered a
    // transition yet (e.g. initial render, URL state restore), snap instantly.
    useEffect(() => {
      if (selectedIndex !== morph.displayedIndex && !morph.isHidingEvents) {
        morph.triggerTransition(selectedIndex);
      }
    }, [selectedIndex, morph]);

    const swap = useSwapModal(getSwapCandidates, morph.displayedIndex, cache);

    const currentSchedule = schedules[morph.displayedIndex] ?? schedules[0] ?? null;
    const colorMap = colorMaps[morph.displayedIndex] ?? EMPTY_COLOR_MAP;

    const referenceWeekStart = useMemo(
      () => startOfWeek(new Date(), { weekStartsOn: 0 }),
      []
    );

    const events = useCalendarEvents(currentSchedule, professorRatings, referenceWeekStart);

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
      [cache, colorMap],
    );

    const fcRef = useRef<FullCalendar>(null);

    if (schedules.length === 0) {
      return (
        <Box
          style={{
            width: '100%',
            height: '100%',
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 16,
          }}
        >
          <Text c="dimmed">
            {tr(
              'calendarView.empty',
            )}
          </Text>
        </Box>
      );
    }

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
          ref={containerRef}
          className={morph.isHidingEvents ? 'fc-uoplan-morphing' : undefined}
          style={{
            flex: 1,
            minHeight: 0,
            width: '100%',
            ...(isMobile
              ? {
                  border: 'none',
                  outline: 'none',
                  boxShadow: 'none',
                  backgroundColor: 'transparent',
                  padding: 0,
                }
              : {
                  border: 'none',
                  outline: 'none',
                  boxShadow: 'none',
                  backgroundColor: 'transparent',
                  padding: 0,
                }),
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <style>{`
            .fc-uoplan-morphing .fc-event { opacity: 0 !important; }
          `}</style>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <FullCalendar
              ref={fcRef}
              plugins={[timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              headerToolbar={false}
              firstDay={0}
              weekends={showWeekends}
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
              events={events.map((e) => ({
                id: e.id,
                title: e.courseCode,
                start: e.start,
                end: e.end,
                extendedProps: e,
              }))}
              initialDate={referenceWeekStart}
              height="100%"
              eventContent={eventContent}
              eventClick={(info) => {
                const ext = info.event.extendedProps as CalendarEvent;
                swap.openModal(ext.enrollmentIndex, ext.courseCode, {
                  virtual: ext.virtual,
                  componentSection: ext.componentSection,
                });
              }}
            />
          </div>
        </div>

        <ScheduleMorphOverlay
          phantoms={morph.phantoms}
          onComplete={morph.onAnimationComplete}
        />

        <Modal
          opened={swap.isOpen}
          onClose={swap.closeModal}
          title="Swap course"
          size="md"
        >
          {swap.modalState && (
            <SwapModalContent
              schedule={schedules[morph.displayedIndex] ?? schedules[0]}
              scheduleIndex={morph.displayedIndex}
              modalState={swap.modalState}
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
          )}
        </Modal>
      </Box>
    );
  }
);
