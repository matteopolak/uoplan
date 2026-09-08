import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, FocusTrap, Text } from "@mantine/core";
import { useLocalStorage, useMediaQuery } from "@mantine/hooks";
import { AnimatePresence, m } from "framer-motion";
import { isOptimizationEnabled } from "@uoplan/core";
import type { DataCache, GeneratedSchedule, ProfessorRatingsMap } from "@uoplan/core";
import { useCalendarEvents } from "../../hooks/useCalendarEvents";
import { useScheduleSentiment } from "../../hooks/useScheduleSentiment";
import { useSwapModal } from "../../hooks/useSwapModal";
import { useScheduleTransition, useWeekIndexTransition } from "../../hooks/useScheduleTransition";
import { slotActiveInWeek } from "../../hooks/useScheduleWeeks";
import { computeScheduleDateBounds } from "../../hooks/useTimetableDateRange";
import { WeekCalendar } from "./WeekCalendar";
import { WeekPreviewPanel } from "./WeekPreviewPanel";
import { CalendarMobileDrawer } from "./CalendarMobileDrawer";
import { CalendarEventDetails } from "./CalendarEventDetails";
import { SwapContextProvider } from "./swapContext";
import type { SwapContextValue, SwapDifficulty, SwapSortKey } from "./swapContext";
import { useGenerationConstraints } from "@uoplan/store/hooks";
import { CALENDAR_HEADER_MIN_HEIGHT } from "./calendarHeaderLayout";
import {
  CALENDAR_PREVIEW_BAR_LARGE_QUERY,
  CALENDAR_PREVIEW_BAR_MAX_PX,
  CALENDAR_PREVIEW_BAR_MIN_PX,
  CALENDAR_PREVIEW_BAR_WIDTH_LARGE_PX,
  CALENDAR_PREVIEW_BAR_WIDTH_PX,
} from "./calendarLayout";
import type { CalendarEvent } from "../../hooks/useCalendarEvents";
import type { WeekGroup } from "../../hooks/useScheduleWeeks";
import { formatWeekLabel } from "../../lib/formatWeekCount";
import { tr as staticTr } from "../../i18n";
import { formatUtcDateRange } from "./calendarDateRange";

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
  colorMap?: Record<string, number>;
  weekGroups: WeekGroup[];
  weekIndex: number;
  setWeekIndex: (index: number) => void;
}

export function CalendarView({
  schedule,
  cache,
  professorRatings,
  getSwapCandidates,
  onSwap,
  colorMap = EMPTY_COLOR_MAP,
  weekGroups,
  weekIndex,
  setWeekIndex,
}: CalendarViewProps) {
  const isCompactCalendar = useMediaQuery("(max-width: 1200px)");
  const isMobile = useMediaQuery("(max-width: 768px)", false, { getInitialValueInEffect: false });
  const isLargeScreen = useMediaQuery(CALENDAR_PREVIEW_BAR_LARGE_QUERY, false);
  const prefersReduced = useMediaQuery("(prefers-reduced-motion: reduce)") ?? false;

  const [previewBarWidth, setPreviewBarWidth] = useLocalStorage<number>({
    key: "uoplan.calendar.previewBarWidth",
    defaultValue: isLargeScreen
      ? CALENDAR_PREVIEW_BAR_WIDTH_LARGE_PX
      : CALENDAR_PREVIEW_BAR_WIDTH_PX,
    getInitialValueInEffect: false,
  });

  const previewResizing = useRef(false);
  const previewStartX = useRef(0);
  const previewStartWidth = useRef(0);
  // Transient width during an active drag; committed to localStorage on pointer-up
  // so we don't write to storage on every pointer-move.
  const [draggingPreviewWidth, setDraggingPreviewWidth] = useState<number | null>(null);
  const effectivePreviewWidth = draggingPreviewWidth ?? previewBarWidth;

  const clampPreviewWidth = useCallback(
    (width: number) =>
      Math.min(CALENDAR_PREVIEW_BAR_MAX_PX, Math.max(CALENDAR_PREVIEW_BAR_MIN_PX, width)),
    [],
  );

  const handlePreviewResizeDown = useCallback(
    (e: React.PointerEvent) => {
      previewResizing.current = true;
      previewStartX.current = e.clientX;
      previewStartWidth.current = previewBarWidth;
      setDraggingPreviewWidth(previewBarWidth);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [previewBarWidth],
  );

  const handlePreviewResizeMove = useCallback(
    (e: React.PointerEvent) => {
      if (!previewResizing.current) return;
      const delta = e.clientX - previewStartX.current;
      setDraggingPreviewWidth(clampPreviewWidth(previewStartWidth.current + delta));
    },
    [clampPreviewWidth],
  );

  const handlePreviewResizeUp = useCallback(() => {
    if (!previewResizing.current) return;
    previewResizing.current = false;
    setDraggingPreviewWidth((current) => {
      if (current !== null) setPreviewBarWidth(current);
      return null;
    });
  }, [setPreviewBarWidth]);

  const handlePreviewResizeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const STEP = 12;
      let next: number | null = null;
      if (e.key === "ArrowLeft") next = clampPreviewWidth(effectivePreviewWidth - STEP);
      else if (e.key === "ArrowRight") next = clampPreviewWidth(effectivePreviewWidth + STEP);
      else if (e.key === "Home") next = CALENDAR_PREVIEW_BAR_MIN_PX;
      else if (e.key === "End") next = CALENDAR_PREVIEW_BAR_MAX_PX;
      if (next !== null) {
        e.preventDefault();
        setPreviewBarWidth(next);
      }
    },
    [clampPreviewWidth, effectivePreviewWidth, setPreviewBarWidth],
  );

  const { displayedSchedule, animationPhase: schedulePhase } = useScheduleTransition(
    schedule,
    prefersReduced,
  );
  const { displayedWeekIndex, animationPhase: weekPhase } = useWeekIndexTransition(
    weekIndex,
    prefersReduced,
  );

  // Schedule animation takes priority; week animation fires only when schedule is idle.
  const animationPhase = schedulePhase !== "idle" ? schedulePhase : weekPhase;

  const swap = useSwapModal(getSwapCandidates, cache, professorRatings);

  const [isFullscreen, setIsFullscreen] = useState(false);
  // Stays true while the fullscreen overlay plays its exit animation. The
  // popover re-opens immediately (so it's visible before the overlay finishes
  // closing), and this flag makes that open instant — no fade-pop on top of the
  // fading overlay.
  const [overlayExiting, setOverlayExiting] = useState(false);
  const [sortKey, setSortKey] = useState<SwapSortKey>("best");
  const [difficulty, setDifficulty] = useState<SwapDifficulty | null>(null);

  // Closing the overlay (or the swap entirely) dismisses both: the overlay
  // animates out and the active event is deselected.
  const handleCloseModal = useCallback(() => {
    setIsFullscreen(false);
    swap.closeModal();
  }, [swap]);

  const openFullscreen = useCallback(() => setIsFullscreen(true), []);
  const closeFullscreen = useCallback(() => {
    setOverlayExiting(true);
    setIsFullscreen(false);
  }, []);

  // Keep fullscreen from lingering if the swap closes by any other path, and
  // reset the list's sort/filter when a different event is opened (matching the
  // previous per-open reset when the popover content remounted).
  const activeEventKey = swap.modalState?.eventId ?? null;
  useEffect(() => {
    if (!swap.isOpen) setIsFullscreen(false);
  }, [swap.isOpen]);
  useEffect(() => {
    setSortKey("best");
    setDifficulty(null);
  }, [activeEventKey]);

  const sentiment = useScheduleSentiment();
  const allEvents = useCalendarEvents(displayedSchedule, professorRatings, sentiment);

  const scheduleDateRange = useMemo(() => {
    const { start, end } = computeScheduleDateBounds(schedule);
    return start && end ? { start, end } : null;
  }, [schedule]);

  const currentGroup: WeekGroup | null = weekGroups[displayedWeekIndex] ?? null;

  const events = useMemo(() => {
    if (!currentGroup) return allEvents;
    return allEvents.filter((e) => {
      if (!e.meetingDates) return true;
      // Use the slot's specific day occurrence within the group's first week,
      // matching the fingerprint logic so no phantom events bleed across groups.
      return slotActiveInWeek(e.day, e.meetingDates, currentGroup.startDate);
    });
  }, [allEvents, currentGroup]);

  const hasWeekendCourses = useMemo(
    () => events.some((e) => e.day === "Sa" || e.day === "Su"),
    [events],
  );

  const showWeekends = !isCompactCalendar || hasWeekendCourses;

  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      swap.openModal(event.enrollmentIndex, event.courseCode, {
        eventId: event.id,
        virtual: event.virtual,
        componentSection: event.componentSection,
        gradeViz: event.gradeViz,
      });
    },
    [swap],
  );

  const { optimizationPriorities } = useGenerationConstraints();
  const generationPreferEasier = isOptimizationEnabled(optimizationPriorities, "prefer_easier");

  // The full event for the currently-open swap overlay (used by the mobile drawer).
  const activeEvent = useMemo<CalendarEvent | null>(() => {
    if (!swap.modalState) return null;
    const { eventId, enrollmentIndex, componentSection } = swap.modalState;
    return (
      allEvents.find((e) => e.id === eventId) ??
      allEvents.find(
        (e) => e.enrollmentIndex === enrollmentIndex && e.componentSection === componentSection,
      ) ??
      allEvents.find((e) => e.enrollmentIndex === enrollmentIndex) ??
      null
    );
  }, [allEvents, swap.modalState]);

  const activeCourseTitle = activeEvent
    ? (cache?.getCourse(activeEvent.courseCode)?.title ?? "")
    : "";

  const swapContextValue = useMemo<SwapContextValue>(
    () => ({
      activeEnrollmentIndex: swap.modalState?.enrollmentIndex ?? null,
      activeEventId: swap.modalState?.eventId ?? null,
      isMobile: isMobile ?? false,
      loading: swap.loading,
      result: swap.result,
      candidateOptions: swap.candidateOptions,
      query: swap.query,
      setQuery: swap.setQuery,
      closeModal: handleCloseModal,
      onSwap,
      cache,
      professorRatings,
      preferEasier: generationPreferEasier,
      isFullscreen,
      openFullscreen,
      closeFullscreen,
      sortKey,
      setSortKey,
      difficulty,
      setDifficulty,
    }),
    [
      swap.modalState?.enrollmentIndex,
      swap.modalState?.eventId,
      swap.loading,
      swap.result,
      swap.candidateOptions,
      swap.query,
      swap.setQuery,
      handleCloseModal,
      isMobile,
      onSwap,
      cache,
      professorRatings,
      generationPreferEasier,
      isFullscreen,
      openFullscreen,
      closeFullscreen,
      sortKey,
      difficulty,
    ],
  );

  return (
    <SwapContextProvider value={swapContextValue}>
      <Box
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Box
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {!isMobile && (
            <Box
              style={{
                flexShrink: 0,
                minHeight: CALENDAR_HEADER_MIN_HEIGHT,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                borderBottom: "1px solid var(--app-border)",
                backgroundColor: "var(--app-surface)",
              }}
            >
              {weekGroups.length > 0 ? (
                <Box style={{ padding: "6px 12px", textAlign: "center" }}>
                  {scheduleDateRange && (
                    <Text size="xs" c="dimmed">
                      {formatUtcDateRange(scheduleDateRange.start, scheduleDateRange.end)}
                    </Text>
                  )}
                  <Text size="xs" c="dimmed">
                    {formatWeekLabel(weekGroups, weekIndex)}
                  </Text>
                </Box>
              ) : (
                <Box style={{ padding: "6px 12px", textAlign: "center", visibility: "hidden" }}>
                  <Text size="xs">&nbsp;</Text>
                  <Text size="xs">&nbsp;</Text>
                </Box>
              )}
            </Box>
          )}
          <Box
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "row",
              overflow: "hidden",
            }}
          >
            {!isMobile && (
              <>
                <WeekPreviewPanel
                  schedule={schedule}
                  weekGroups={weekGroups}
                  weekIndex={weekIndex}
                  setWeekIndex={setWeekIndex}
                  colorMap={colorMap}
                  barWidth={effectivePreviewWidth}
                />
                <div
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- WAI-ARIA window-splitter resize handle, not an <hr>
                  role="separator"
                  aria-label={staticTr("calendarView.resizePreviewBar")}
                  aria-orientation="vertical"
                  aria-valuemin={CALENDAR_PREVIEW_BAR_MIN_PX}
                  aria-valuemax={CALENDAR_PREVIEW_BAR_MAX_PX}
                  aria-valuenow={Math.round(effectivePreviewWidth)}
                  tabIndex={0}
                  onKeyDown={handlePreviewResizeKeyDown}
                  onPointerDown={handlePreviewResizeDown}
                  onPointerMove={handlePreviewResizeMove}
                  onPointerUp={handlePreviewResizeUp}
                  style={{
                    width: 6,
                    flexShrink: 0,
                    cursor: "col-resize",
                    backgroundColor: "var(--app-border)",
                    transition: "background-color 0.15s",
                    touchAction: "none",
                    zIndex: 1,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor =
                      "var(--app-border-strong)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = "var(--app-border)";
                  }}
                />
              </>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <WeekCalendar
                events={events}
                cache={cache}
                colorMap={colorMap}
                onEventClick={handleEventClick}
                showWeekends={showWeekends ?? false}
                animationPhase={animationPhase}
                activeEventId={swap.modalState?.eventId ?? null}
                isMobile={isMobile ?? false}
                isFullscreen={isFullscreen}
                instantPopover={overlayExiting}
                onEventClose={handleCloseModal}
              />
            </div>
          </Box>
        </Box>

        <AnimatePresence onExitComplete={() => setOverlayExiting(false)}>
          {!isMobile && isFullscreen && activeEvent && (
            <m.div
              key="calendar-fullscreen-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReduced ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
              onClick={handleCloseModal}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "clamp(16px, 4vh, 48px)",
                background: "var(--app-overlay-scrim)",
              }}
            >
              <FocusTrap active>
                <m.div
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- animated modal dialog (framer-motion); native <dialog> can't be used here
                  role="dialog"
                  aria-modal="true"
                  aria-label={staticTr("calendar.swap.swapWith")}
                  tabIndex={-1}
                  initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
                  animate={prefersReduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 }}
                  transition={{ duration: prefersReduced ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      handleCloseModal();
                    }
                  }}
                  style={{
                    width: "min(960px, 100%)",
                    maxHeight: "100%",
                    overflowY: "auto",
                    backgroundColor: "var(--app-bg)",
                    border: "var(--app-border-width) solid var(--app-border)",
                    borderRadius: "var(--app-radius-lg)",
                    boxShadow: "var(--app-shadow-lg)",
                    padding: "var(--mantine-spacing-lg)",
                    scrollbarGutter: "stable",
                  }}
                >
                  <CalendarEventDetails event={activeEvent} courseTitle={activeCourseTitle} />
                </m.div>
              </FocusTrap>
            </m.div>
          )}
        </AnimatePresence>
      </Box>

      {isMobile && activeEvent && (
        <CalendarMobileDrawer
          opened={swap.isOpen}
          onClose={handleCloseModal}
          title={activeEvent.courseCode}
          ariaLabel={staticTr("calendar.swap.swapWith")}
        >
          <CalendarEventDetails
            event={activeEvent}
            courseTitle={activeCourseTitle}
            hideCloseButton
          />
        </CalendarMobileDrawer>
      )}
    </SwapContextProvider>
  );
}
