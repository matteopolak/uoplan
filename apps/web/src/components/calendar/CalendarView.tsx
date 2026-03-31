import { useRef, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Badge, Box, Group, Text, Modal, Stack, Button, Select, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { startOfWeek } from 'date-fns';
import type { DataCache } from 'schedule';
import type { GeneratedSchedule } from 'schedule';
import type { ProfessorRatingsMap } from 'schedule';
import {
  COURSE_COLORS as COLORS,
  COURSE_COLOR_HEX as COLOR_HEX,
  ratingToColor,
  ratingColorToCssVar,
  hexToRgb,
} from 'schedule';
import { EventStyleCard } from './EventStyleCard';
import { useCalendarEvents, type CalendarEvent } from '../../hooks/useCalendarEvents';
import { useSwapModal, type SwapCandidatesGetter } from '../../hooks/useSwapModal';
import { useCalendarMorph } from '../../hooks/useCalendarMorph';
import { ScheduleMorphOverlay } from './ScheduleMorphOverlay';

function RatingTooltipLabel({
  details,
}: {
  details?: Array<{ id?: string; legacyId?: number; name: string; rating: number; numRatings: number }>;
}) {
  if (!details?.length) return null;
  return (
    <Stack gap={4}>
      <Text size="xs" fw={600} c="dimmed">RateMyProfessors</Text>
      {details.map((d) => (
        <Text key={d.name} size="xs">
          {d.name} · {d.numRatings > 0 ? `${d.rating.toFixed(1).replace(/\.0$/, '')}/5` : 'N/A'}
          {d.numRatings > 0 ? ` (${d.numRatings} ratings)` : ''}
        </Text>
      ))}
    </Stack>
  );
}

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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIndex]);

    const swap = useSwapModal(getSwapCandidates, morph.displayedIndex, cache);

    const currentSchedule = schedules[morph.displayedIndex] ?? schedules[0] ?? null;
    const colorMap = colorMaps[morph.displayedIndex] ?? {};

    const events = useCalendarEvents(currentSchedule, professorRatings);

    const referenceWeekStart = useMemo(
      () => startOfWeek(new Date(), { weekStartsOn: 0 }),
      []
    );

    const fcRef = useRef<FullCalendar>(null);
    useEffect(() => {}, [morph.displayedIndex, schedules.length]);

    if (schedules.length === 0) {
      return (
        <Text c="dimmed">
          No schedules generated yet. Complete the steps above and click Generate.
        </Text>
      );
    }

    const swapDropdown = (() => {
      if (!swap.isOpen) return null;
      if (swap.loading) {
        return (
          <Text size="sm" c="dimmed">
            Finding swap options…
          </Text>
        );
      }
      const hasRejected = (swap.result.rejectedWithConflict?.length ?? 0) > 0;
      if (swap.result.candidates.length === 0 && !hasRejected) {
        const pool = swap.result.poolCourses;
        const poolPreview =
          pool.length > 0
            ? ` Pool had ${pool.length} course(s): ${pool.slice(0, 20).sort().join(', ')}${pool.length > 20 ? '…' : ''}.`
            : ' Pool was empty.';
        return (
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              No alternative courses available that fit your schedule.
            </Text>
            {pool.length > 0 && (
              <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                {poolPreview}
              </Text>
            )}
          </Stack>
        );
      }
      return (
        <Select
          label="Swap with"
          placeholder="Search courses…"
          searchable
          data={swap.candidateOptions}
          value={null}
          searchValue={swap.query}
          onSearchChange={swap.setQuery}
          nothingFoundMessage="No matches"
          maxDropdownHeight={260}
          onChange={(v: string | null) => {
            if (!v || v.startsWith('__rejected:') || !swap.modalState) return;
            onSwap(morph.displayedIndex, swap.modalState.enrollmentIndex, v);
            swap.closeModal();
          }}
          renderOption={({ option }) => {
            const rejected = 'conflictsWith' in option && option.conflictsWith;
            if (rejected) {
              const conflictsWith = String((option as { conflictsWith: string }).conflictsWith);
              const label = String((option as { label: string }).label);
              return (
                <Group gap="xs" wrap="nowrap">
                  <Badge size="sm" color="red" variant="light" style={{ flexShrink: 0 }}>
                    {conflictsWith}
                  </Badge>
                  <Text size="sm" span style={{ opacity: 0.85 }}>
                    {label}
                  </Text>
                </Group>
              );
            }
            return <>{String(option.label)}</>;
          }}
          styles={{
            option: { paddingTop: 6, paddingBottom: 6 },
            dropdown: { padding: 4 },
          }}
        />
      );
    })();

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
            backgroundColor: '#1E1E20',
            ...(isMobile
              ? { border: 'none', padding: 0 }
              : { border: '2px solid #2C2E33', padding: 12 }),
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
              weekends={true}
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
              eventContent={(arg) => {
                const ext = arg.event.extendedProps as CalendarEvent;
                const courseTitle = cache?.getCourse(ext.courseCode)?.title ?? '';
                const heading = courseTitle
                  ? `${ext.courseCode} — ${courseTitle}`
                  : ext.courseCode;
                const colorIdx = colorMap[ext.courseCode] ?? ext.enrollmentIndex;
                const colorName = COLORS[colorIdx % COLORS.length];
                const hex = COLOR_HEX[colorName];
                const { r, g, b } = hexToRgb(hex);
                return (
                  <div
                    className="fc-uoplan-event"
                    data-course-code={ext.courseCode}
                    data-color-hex={hex}
                    style={{
                      cursor: 'pointer',
                      borderLeft: `4px solid ${hex}`,
                      backgroundColor: `rgba(${r}, ${g}, ${b}, 0.38)`,
                    }}
                  >
                    <div className="fc-uoplan-event-body">
                      <span
                        className="fc-uoplan-event-code"
                        title={heading}
                      >
                        {heading}
                      </span>
                      <span className="fc-uoplan-event-type">{ext.componentSection}</span>
                      <span
                        className="fc-uoplan-event-professor"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexWrap: 'nowrap',
                          minWidth: 0,
                          maxWidth: '100%',
                        }}
                      >
                        <span
                          style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={ext.professor}
                        >
                          {ext.professor}
                        </span>
                        {ext.professorRatingDetails && ext.professorRatingDetails.length > 0 && (() => {
                          const legacyId = ext.professorRatingDetails?.find((d) => d.legacyId)?.legacyId;
                          return (
                            <Tooltip
                              label={<RatingTooltipLabel details={ext.professorRatingDetails} />}
                              withArrow
                              position="top"
                              withinPortal
                              color="dark"
                            >
                              <Box
                                component="a"
                                href={legacyId ? `https://www.ratemyprofessors.com/professor/${legacyId}` : undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  padding: 4,
                                  flexShrink: 0,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Box
                                  style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 0,
                                    backgroundColor: ratingColorToCssVar(
                                      ratingToColor(ext.professorRatingValue ?? null),
                                    ),
                                    border: '1px solid rgba(0,0,0,0.45)',
                                    boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset',
                                  }}
                                />
                              </Box>
                            </Tooltip>
                          );
                        })()}
                      </span>
                    </div>
                  </div>
                );
              }}
              eventClick={(info) => {
                const ext = info.event.extendedProps as CalendarEvent;
                swap.openModal(ext.enrollmentIndex, ext.courseCode);
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
          {swap.modalState && (() => {
            const schedule = schedules[morph.displayedIndex] ?? schedules[0];
            const enrollment = schedule?.enrollments[swap.modalState.enrollmentIndex];
            return (
              <Stack gap="md" mt="md">
                {swap.result.requirementTitle && (
                  <Box
                    px="sm"
                    py="sm"
                    style={{
                      backgroundColor: 'var(--mantine-color-dark-6)',
                    }}
                  >
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6} style={{ letterSpacing: '0.05em' }}>
                      Satisfying requirement
                    </Text>
                    <Text size="sm" lh={1.45} style={{ color: 'var(--mantine-color-gray-3)' }}>
                      {swap.result.requirementTitle}
                    </Text>
                  </Box>
                )}
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>
                    Current course
                  </Text>
                  {enrollment ? (
                    <EventStyleCard
                      enrollment={enrollment}
                      enrollmentIndex={swap.modalState.enrollmentIndex}
                      cache={cache}
                      professorRatings={professorRatings}
                    />
                  ) : (
                    <Text size="sm" c="dimmed">
                      {swap.modalState.courseCode}
                    </Text>
                  )}
                </div>
                <div>
                  <Text size="sm" c="dimmed" mb="xs">
                    Choose a course to replace it:
                  </Text>
                  {swapDropdown}
                </div>
                <Button variant="default" onClick={swap.closeModal}>
                  Cancel
                </Button>
              </Stack>
            );
          })()}
        </Modal>
      </Box>
    );
  }
);
