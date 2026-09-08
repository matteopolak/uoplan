import "./calendar.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useHotkeys, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconArrowBackUp,
  IconArrowsDiagonalMinimize2,
  IconChevronLeft,
  IconChevronRight,
  IconSettings,
} from "@tabler/icons-react";
import {
  useActiveProgram,
  useAdditionalElectives,
  useCalendarView,
  useDataCache,
  useGetShareUrl,
  useIndices,
  useProfessorRatings,
  useScheduleGeneration,
  useScheduleResultMaps,
  useScheduleSwaps,
  useSeedNavigation,
  useStoreApi,
  useTermSelection,
} from "@uoplan/store/hooks";
import { useBasketCourses } from "../../hooks/useBasket";
import { useGraphPlannerStore } from "../../store/graphPlannerStore";
import { CalendarView } from "./CalendarView";
import { NoTimeslotBanner } from "./NoTimeslotBanner";
import { BackButton } from "../shared/BackButton";
import { PersonalizeBanner } from "../shared/PersonalizeBanner";
import { normalizeCourseCode } from "@uoplan/core";
import { downloadTextFile } from "../../lib/downloadFile";
import { useShareUrl } from "../../hooks/useShareUrl";
import { useTimetableDateRangeFromSchedule } from "../../hooks/useTimetableDateRange";
import { useGenerationErrorToast } from "../../hooks/useGenerationErrorToast";
import { GenerationErrorModal } from "../GenerationErrorModal";
import type { GenerationErrorState } from "@uoplan/store/types";
import { useGenerationSentiment } from "../../hooks/useGenerationSentiment";
import { tr, useTr } from "../../i18n";
import { useAnalytics } from "../../lib/analytics";
import { useImportantDates } from "../../hooks/useImportantDates";
import { buildScheduleExport } from "../../lib/scheduleExport";
import type { ScheduleExportRequest } from "../../lib/scheduleExport";
import { ScheduleExportDialog } from "./ScheduleExportDialog";
import { canGenerateBasicSchedule } from "@uoplan/store/basicCalendarPins";
import { canGoToPreviousSeed } from "@uoplan/store/seedNavigation";
import { SidebarResizeHandle } from "../shared/SidebarResizeHandle";
import { useSidebarResize } from "../shared/useSidebarResize";
import { BasicCalendarHeaderActions } from "./BasicCalendarHeaderActions";
import { CalendarUtilityToolbar } from "./CalendarUtilityToolbar";
import { CalendarMobileDrawer } from "./CalendarMobileDrawer";
import { EnrolCliModal } from "./EnrolCliModal";
import { UEnrollImportModal } from "./UEnrollImportModal";
import { UoZoneScheduleImportModal } from "./UoZoneScheduleImportModal";
import { AdvancedGenerationOptions } from "./AdvancedGenerationOptions";
import { BasicGenerationOptions } from "./BasicGenerationOptions";
import { encodeSchedulePayload } from "../../lib/encodeSchedulePayload";
import { useScheduleWeeks } from "../../hooks/useScheduleWeeks";
import { formatWeekLabel } from "../../lib/formatWeekCount";
import { cancelScheduleGeneration } from "../../workers/scheduleWorkerClient";
import { useSchoolFeature } from "../../hooks/useSchool";

type ScheduleNavigationButtonsProps = {
  canGoPrevious: boolean;
  canUseSeedNavigation: boolean;
  generationOptionsDirty: boolean;
  nextLabel: string;
  scheduleGenerating: boolean;
  onNext: () => void;
  onPrevious: () => void;
};

function ScheduleNavigationButtons({
  canGoPrevious,
  canUseSeedNavigation,
  generationOptionsDirty,
  nextLabel,
  scheduleGenerating,
  onNext,
  onPrevious,
}: ScheduleNavigationButtonsProps) {
  useTr();
  return (
    <Button.Group>
      <Button
        variant="default"
        size="sm"
        radius="md"
        style={{ flex: 1 }}
        leftSection={<IconChevronLeft size={14} />}
        disabled={!canGoPrevious || scheduleGenerating || !canUseSeedNavigation}
        loading={scheduleGenerating}
        onClick={onPrevious}
      >
        {tr("calendarPage.previous")}
      </Button>
      <Button
        variant={generationOptionsDirty ? "filled" : "default"}
        size="sm"
        radius="md"
        style={{ flex: 1 }}
        rightSection={<IconChevronRight size={14} />}
        disabled={scheduleGenerating || !canUseSeedNavigation}
        loading={scheduleGenerating}
        onClick={onNext}
      >
        {nextLabel}
      </Button>
    </Button.Group>
  );
}

function UndoSwapButton({
  swapCount,
  onUndo,
  style,
}: {
  swapCount: number;
  onUndo: () => void;
  style?: CSSProperties;
}) {
  useTr();
  if (swapCount <= 0) return null;
  return (
    <Button
      variant="subtle"
      color="gray"
      size="xs"
      radius="md"
      leftSection={<IconArrowBackUp size={12} />}
      onClick={onUndo}
      style={style}
    >
      {swapCount === 1
        ? tr("calendarPage.undoSwap")
        : tr("calendarPage.undoSwapCount", { count: swapCount })}
    </Button>
  );
}

function NoMoreSchedulesAlert({ hasProgram }: { hasProgram: boolean }) {
  useTr();
  return (
    <Alert color="yellow" variant="light" radius="md" py="xs" style={{ flexShrink: 0 }}>
      {tr(hasProgram ? "calendarPage.noMoreSchedules" : "basicCalendar.noMoreSchedules")}
    </Alert>
  );
}

type CalendarTimetableProps = React.ComponentProps<typeof CalendarView> & {
  /** Extra styles for the section wrapper (page mode pads; embedded does not). */
  sectionStyle?: CSSProperties;
};

function CalendarTimetable({ sectionStyle, ...viewProps }: CalendarTimetableProps) {
  return (
    <Box
      component="section"
      aria-label="Timetable"
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        ...sectionStyle,
      }}
    >
      <CalendarView {...viewProps} />
    </Box>
  );
}

export interface CalendarPageProps {
  /**
   * When the calendar is rendered inside the degree planner's in-page overlay
   * (instead of as the standalone `/schedule` route), this closes the overlay.
   * The planner's back affordance then returns to the graph without navigating.
   */
  onExit?: () => void;
  /**
   * `"page"` (default) renders the full standalone calendar (own sidebar +
   * timetable, `100dvh`). `"embedded"` renders a chrome-light desktop calendar
   * for the graph planner's floating card: no own sidebar (the floating planner
   * panel is the sidebar), `100%` height, and a compact header carrying the
   * schedule navigation + utility toolbar + a minimize control.
   */
  variant?: "page" | "embedded";
}

export function CalendarPage({ onExit, variant = "page" }: CalendarPageProps = {}) {
  const analytics = useAnalytics();
  const viewedScheduleKey = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("calendar-no-scrollbar-gutter");
    return () => {
      document.documentElement.classList.remove("calendar-no-scrollbar-gutter");
    };
  }, []);

  const storeApi = useStoreApi();
  useEffect(() => {
    // Cancel an in-flight generation the moment the user changes a generation
    // option (any setter flips generationOptionsDirty to true). The previous
    // schedule stays put and the now-dirty options prompt a manual re-run.
    return storeApi.subscribe((next, prev) => {
      if (next.scheduleGenerating && next.generationOptionsDirty && !prev.generationOptionsDirty) {
        cancelScheduleGeneration();
        notifications.show({
          color: "gray",
          title: tr("notifications.scheduleGenerationCancelled.title"),
          message: tr("notifications.scheduleGenerationCancelled.message"),
        });
      }
    });
  }, [storeApi]);

  const {
    currentSchedule,
    scheduleGenerating,
    generationError,
    generationOptionsDirty,
    generateSchedules,
    clearGenerationOptions,
    resetBasicCalendarSettings,
  } = useScheduleGeneration();
  const { currentSwaps, getSwapCandidates, swapCourseInSchedule, undoLastSwap } =
    useScheduleSwaps();
  const { currentColorMap } = useScheduleResultMaps();
  const {
    currentSeed,
    lowestVisitedSeed,
    scheduleNoVariety,
    goToPreviousSeed,
    goToNextSeed,
    randomizeSeed,
  } = useSeedNavigation();
  const indices = useIndices();
  const cache = useDataCache();
  const professorRatings = useProfessorRatings();
  const basketCourses = useBasketCourses();
  const { additionalElectivesCount } = useAdditionalElectives();
  const { terms, selectedTermId } = useTermSelection();
  const program = useActiveProgram();
  const importantDates = useImportantDates();
  const hasOfficialScheduleImport = useSchoolFeature("officialScheduleImport");

  // When a term is opened from the degree planner it links that term into this
  // calendar (see `openInCalendar`). While that link is live for the term on
  // screen, the back affordance returns to the planner (not the generic
  // personalize dashboard) and names it accordingly.
  const linkedCalendarTermId = useGraphPlannerStore((s) => s.linkedCalendarTermId);
  const openedFromPlanner =
    linkedCalendarTermId !== null && linkedCalendarTermId === selectedTermId;

  const hasProgram = program !== null;

  useEffect(() => {
    if (!currentSchedule) return;
    const key = `${selectedTermId ?? "unknown"}:${currentSeed}`;
    if (viewedScheduleKey.current === key) return;
    viewedScheduleKey.current = key;
    analytics.capture("schedule_viewed");
  }, [analytics, currentSchedule, currentSeed, selectedTermId]);

  const { setCalendarMode, calendarWeekIndex, setCalendarWeekIndex } = useCalendarView();
  // Sync the active calendar mode so generation logic knows which path is active.
  useEffect(() => {
    setCalendarMode(hasProgram ? "advanced" : "basic");
    return () => setCalendarMode(null);
  }, [hasProgram, setCalendarMode]);

  const { weekGroups, weekIndex, setWeekIndex } = useScheduleWeeks(
    currentSchedule,
    calendarWeekIndex,
  );

  useEffect(() => {
    setCalendarWeekIndex(weekIndex);
  }, [weekIndex, setCalendarWeekIndex]);

  const [generationErrorDetail, setGenerationErrorDetail] = useState<GenerationErrorState | null>(
    null,
  );
  useGenerationErrorToast(generationError, (error) => {
    analytics.capture("generation_error_details_opened", { kind: error.message.kind });
    setGenerationErrorDetail(error);
  });
  useGenerationSentiment();

  const getShareUrl = useGetShareUrl();

  const canGoPrevious = canGoToPreviousSeed(currentSeed, lowestVisitedSeed);
  const canUseSeedNavigation =
    hasProgram || canGenerateBasicSchedule(basketCourses.length, additionalElectivesCount);

  const [controlsOpen, setControlsOpen] = useState(false);
  const [enrolCliOpen, setEnrolCliOpen] = useState(false);
  const [uenrollImportOpen, setUenrollImportOpen] = useState(false);
  const [uozoneImportOpen, setUozoneImportOpen] = useState(false);
  const [exportRequest, setExportRequest] = useState<ScheduleExportRequest | null>(null);
  const sidebarResize = useSidebarResize();
  const sidebarWidth = sidebarResize.width;

  const cliCommand =
    currentSchedule && selectedTermId
      ? `uoplan run ${encodeSchedulePayload(currentSchedule, selectedTermId)}`
      : null;
  const [timetableStartDate, setTimetableStartDate] = useState("");
  const [timetableEndDate, setTimetableEndDate] = useState("");

  const { shareCopied, handleCopyShare } = useShareUrl(getShareUrl);

  const isMobile = useMediaQuery("(max-width: 768px)", false, { getInitialValueInEffect: false });

  useTimetableDateRangeFromSchedule(
    currentSchedule,
    timetableStartDate,
    timetableEndDate,
    setTimetableStartDate,
    setTimetableEndDate,
  );

  const startOk =
    Boolean(timetableStartDate) && !Number.isNaN(Date.parse(`${timetableStartDate}T00:00:00Z`));
  const endOk =
    Boolean(timetableEndDate) && !Number.isNaN(Date.parse(`${timetableEndDate}T00:00:00Z`));
  const dateRangeOk = startOk && endOk && timetableStartDate <= timetableEndDate;

  const handlePrevious = async () => {
    if (scheduleGenerating || !canUseSeedNavigation) return;
    await goToPreviousSeed();
  };

  const handleNext = async () => {
    if (scheduleGenerating || !canUseSeedNavigation) return;
    if (generationOptionsDirty) {
      // Regenerate from a fresh random seed so the previous-variant ladder resets
      // (Previous becomes unavailable) instead of advancing the existing seed.
      await randomizeSeed();
      return;
    }
    await goToNextSeed();
  };

  const nextLabel = generationOptionsDirty ? tr("calendarPage.generate") : tr("calendarPage.next");

  useHotkeys([
    ["ArrowLeft", () => canGoPrevious && void handlePrevious()],
    ["ArrowRight", () => void handleNext()],
  ]);

  const handleClearOptions = () => {
    resetBasicCalendarSettings();
  };

  const handleClearGenerationOptions = () => {
    clearGenerationOptions();
    void generateSchedules();
  };

  // Opens the shared export dialog with a snapshot of the current schedule,
  // term, and export bounds. Snapshotting (rather than reading live state from
  // inside `handleExportSchedule`) means a schedule/term change while the
  // dialog stays open can never silently export something other than what the
  // user opened the dialog for. `exportRequest` doubles as the dialog's
  // `opened` flag, so a duplicate trigger click while already open is a no-op.
  const handleOpenExportDialog = () => {
    if (!currentSchedule || !selectedTermId || exportRequest) return;
    setExportRequest({
      scope: "single",
      segments: [
        {
          key: selectedTermId,
          schedule: currentSchedule,
          startDate: timetableStartDate,
          endDate: timetableEndDate,
        },
      ],
      cache,
      filename: `uoplan-schedule-${currentSeed}-${timetableStartDate}-to-${timetableEndDate}.ics`,
    });
  };

  const handleCloseExportDialog = () => {
    setExportRequest(null);
  };

  // The dialog's only export path: always resolves important dates through
  // `useImportantDates()` and always calls `buildScheduleExport` with them —
  // never `buildScheduleIcs` directly, never without `{ data, includeDeadlines }`
  // — so the mandatory break/cancellation/replacement transforms are never
  // skippable. Missing/loading/failed important-date data blocks the export
  // (the dialog renders the thrown message); a loader failure also triggers a
  // retry so a later click can succeed once it recovers. Both a build failure
  // (`buildScheduleExport`) and a browser-download-boundary failure
  // (`downloadTextFile`) share one try/catch so either normalizes to the same
  // localized generic error — no technical English text ever reaches the
  // user. Analytics only fires after that try block fully succeeds.
  const handleExportSchedule = async ({
    includeDeadlines,
  }: {
    includeDeadlines: boolean;
  }): Promise<void> => {
    const request = exportRequest;
    if (!request) {
      throw new Error(tr("scheduleExport.error"));
    }

    if (importantDates.loading || !importantDates.data) {
      if (importantDates.error) {
        importantDates.retry();
      }
      throw new Error(tr("scheduleExport.error"), { cause: importantDates.error ?? undefined });
    }

    try {
      const resolved = buildScheduleExport(request, {
        data: importantDates.data,
        includeDeadlines,
      });
      downloadTextFile(resolved.filename, resolved.ics, "text/calendar;charset=utf-8");
    } catch (err) {
      throw new Error(tr("scheduleExport.error"), { cause: err });
    }

    analytics.capture("schedule_exported", { target: "ics" });
  };

  const calendarTitle = tr("calendarPage.title");
  const calendarSubtitle = tr(hasProgram ? "calendarPage.subtitle" : "basicCalendar.subtitle");
  // Localized term context shown in the export dialog (e.g. "Winter 2026"),
  // purely cosmetic — the export itself is keyed by `selectedTermId`.
  const exportScopeLabel = terms?.find((term) => term.termId === selectedTermId)?.name;

  const scheduleNavProps: ScheduleNavigationButtonsProps = {
    canGoPrevious,
    canUseSeedNavigation,
    generationOptionsDirty,
    nextLabel,
    scheduleGenerating,
    onNext: () => {
      void handleNext();
    },
    onPrevious: () => {
      void handlePrevious();
    },
  };

  const utilityToolbarProps = {
    downloadDisabled: !dateRangeOk || !currentSchedule,
    onDownloadIcs: handleOpenExportDialog,
    shareShow: Boolean(indices),
    shareCopied,
    onCopyShare: handleCopyShare,
    randomizeDisabled: scheduleGenerating || !canUseSeedNavigation,
    onRandomize: () => void randomizeSeed(),
    onClear: handleClearGenerationOptions,
    onImport: () => setUenrollImportOpen(true),
    onUploadSchedule: () => setUozoneImportOpen(true),
    uploadScheduleShow: hasOfficialScheduleImport,
    cliDisabled: !cliCommand,
    onEnrolCli: () => setEnrolCliOpen(true),
  };

  const calendarViewProps = useMemo(
    () => ({
      schedule: currentSchedule,
      cache,
      professorRatings,
      getSwapCandidates,
      onSwap: (enrollmentIndex: number, newCourseCode: string) => {
        analytics.capture("schedule_swapped_course", { courseCode: newCourseCode });
        void swapCourseInSchedule(enrollmentIndex, normalizeCourseCode(newCourseCode));
      },
      colorMap: currentColorMap,
      weekGroups,
      weekIndex,
      setWeekIndex,
    }),
    [
      analytics,
      cache,
      currentColorMap,
      currentSchedule,
      getSwapCandidates,
      professorRatings,
      setWeekIndex,
      swapCourseInSchedule,
      weekGroups,
      weekIndex,
    ],
  );

  const sidebarControls = (
    <>
      {onExit ? (
        <UnstyledButton
          onClick={onExit}
          aria-label={tr("planner.title")}
          style={{ alignSelf: "flex-start", color: "var(--mantine-color-dimmed)" }}
        >
          <Group gap={2} wrap="nowrap">
            <IconChevronLeft size={15} stroke={1.8} />
            <Text size="sm" c="dimmed">
              {tr("planner.title")}
            </Text>
          </Group>
        </UnstyledButton>
      ) : openedFromPlanner ? (
        <BackButton fallbackTo="/schedule/graph" fallbackLabel={tr("planner.title")} />
      ) : (
        <BackButton fallbackTo="/personalize" />
      )}
      <Title
        order={1}
        style={{
          fontFamily: "var(--app-font-heading)",
          color: "var(--app-text)",
          marginBottom: 0,
          ...(isMobile ? { display: "none" } : {}),
        }}
      >
        {calendarTitle}
      </Title>
      <Text size="sm" style={{ color: "var(--app-text-muted)", marginTop: isMobile ? 0 : -8 }}>
        {calendarSubtitle}
      </Text>

      <PersonalizeBanner variant="sidebar" />

      {!hasProgram ? (
        <>
          <BasicCalendarHeaderActions
            cliCommand={cliCommand}
            onEnrolCli={() => setEnrolCliOpen(true)}
            onClearOptions={handleClearOptions}
            onDownloadIcs={handleOpenExportDialog}
            downloadDisabled={!dateRangeOk || !currentSchedule}
          />
          {!isMobile && <ScheduleNavigationButtons {...scheduleNavProps} />}
          <NoTimeslotBanner />
          <BasicGenerationOptions />
        </>
      ) : (
        <Stack gap="md">
          <CalendarUtilityToolbar {...utilityToolbarProps} />

          {/* Prev/Next - desktop only */}
          {!isMobile && (
            <Stack gap={6}>
              <ScheduleNavigationButtons {...scheduleNavProps} />
            </Stack>
          )}

          <Divider color="var(--app-border)" />

          <NoTimeslotBanner />

          <AdvancedGenerationOptions />

          <Divider color="var(--app-border)" />

          <UndoSwapButton
            swapCount={currentSwaps.length}
            onUndo={() => undoLastSwap()}
            style={{ alignSelf: "flex-start", paddingInline: 6 }}
          />
        </Stack>
      )}

      <EnrolCliModal
        opened={enrolCliOpen}
        onClose={() => setEnrolCliOpen(false)}
        command={cliCommand ?? ""}
      />
      <UEnrollImportModal opened={uenrollImportOpen} onClose={() => setUenrollImportOpen(false)} />
      <UoZoneScheduleImportModal
        opened={uozoneImportOpen}
        onClose={() => setUozoneImportOpen(false)}
      />
      <ScheduleExportDialog
        opened={exportRequest !== null}
        onClose={handleCloseExportDialog}
        onExport={handleExportSchedule}
        scopeLabel={exportScopeLabel}
      />

      {scheduleNoVariety && !generationError && <NoMoreSchedulesAlert hasProgram={hasProgram} />}
    </>
  );

  const calendarModals = (
    <>
      <EnrolCliModal
        opened={enrolCliOpen}
        onClose={() => setEnrolCliOpen(false)}
        command={cliCommand ?? ""}
      />
      <UEnrollImportModal opened={uenrollImportOpen} onClose={() => setUenrollImportOpen(false)} />
      <UoZoneScheduleImportModal
        opened={uozoneImportOpen}
        onClose={() => setUozoneImportOpen(false)}
      />
      <ScheduleExportDialog
        opened={exportRequest !== null}
        onClose={handleCloseExportDialog}
        onExport={handleExportSchedule}
        scopeLabel={exportScopeLabel}
      />
      <GenerationErrorModal
        error={generationErrorDetail}
        onClose={() => setGenerationErrorDetail(null)}
      />
    </>
  );

  if (variant === "embedded") {
    return (
      <>
        <Box
          component="main"
          data-testid="calendar-page-embedded"
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          <Group
            gap="sm"
            wrap="nowrap"
            style={{
              flexShrink: 0,
              padding: "10px 12px",
              borderBottom: "var(--app-border-width) solid var(--app-border)",
            }}
          >
            {onExit ? (
              <Tooltip label={tr("planner.calendar.minimize")} withArrow position="bottom">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="md"
                  radius="md"
                  onClick={onExit}
                  aria-label={tr("planner.calendar.minimize")}
                >
                  <IconArrowsDiagonalMinimize2 size={16} />
                </ActionIcon>
              </Tooltip>
            ) : null}
            <Box style={{ flex: "0 1 260px", minWidth: 160 }}>
              <ScheduleNavigationButtons {...scheduleNavProps} />
            </Box>
            <UndoSwapButton
              swapCount={currentSwaps.length}
              onUndo={() => undoLastSwap()}
              style={{ flexShrink: 0, paddingInline: 6 }}
            />
            <Box style={{ marginLeft: "auto" }}>
              <CalendarUtilityToolbar {...utilityToolbarProps} tooltipPosition="bottom" />
            </Box>
          </Group>

          {scheduleNoVariety && !generationError && (
            <Stack gap={8} style={{ flexShrink: 0, padding: "10px 12px 0" }}>
              <NoMoreSchedulesAlert hasProgram={hasProgram} />
            </Stack>
          )}

          <CalendarTimetable {...calendarViewProps} />
        </Box>
        {calendarModals}
      </>
    );
  }

  return (
    <>
      <Box
        component="main"
        data-testid="calendar-page"
        style={{
          width: "100%",
          height: "100dvh",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {!isMobile && (
          <>
            <Box
              component="aside"
              ref={sidebarResize.asideRef}
              aria-label="Calendar Controls"
              style={{
                width: sidebarWidth,
                height: "100%",
                flexShrink: 0,
                padding: "24px 20px",
                backgroundColor: "var(--app-surface)",
                display: "flex",
                flexDirection: "column",
                gap: 24,
                overflowY: "auto",
              }}
            >
              {sidebarControls}
            </Box>
            <SidebarResizeHandle controller={sidebarResize} />
          </>
        )}

        {isMobile && (
          <CalendarMobileDrawer
            opened={controlsOpen}
            onClose={() => setControlsOpen(false)}
            title={calendarTitle}
            ariaLabel={tr("calendarPage.mobile.controlsAria")}
          >
            <Stack gap={24}>{sidebarControls}</Stack>
          </CalendarMobileDrawer>
        )}

        {/* Calendar area */}
        <CalendarTimetable {...calendarViewProps} sectionStyle={{ padding: 0 }} />

        {/* Mobile week navigation bar (above the bottom nav) */}
        {isMobile && weekGroups.length > 0 && (
          <Box
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              backgroundColor: "var(--app-surface)",
              borderTop: "var(--app-border-width) solid var(--app-border)",
            }}
          >
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              radius="md"
              aria-label={tr("calendarView.previousWeek")}
              disabled={weekIndex === 0}
              onClick={() => setWeekIndex(weekIndex - 1)}
            >
              <IconChevronLeft size={18} />
            </ActionIcon>
            <Text size="xs" c="dimmed" style={{ flex: 1, textAlign: "center" }}>
              {formatWeekLabel(weekGroups, weekIndex)}
            </Text>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              radius="md"
              aria-label={tr("calendarView.nextWeek")}
              disabled={weekIndex === weekGroups.length - 1}
              onClick={() => setWeekIndex(weekIndex + 1)}
            >
              <IconChevronRight size={18} />
            </ActionIcon>
          </Box>
        )}

        {/* Mobile bottom nav */}
        {isMobile && (
          <Box
            component="nav"
            style={{
              flexShrink: 0,
              display: "flex",
              gap: 0,
              backgroundColor: "var(--app-surface)",
              borderTop: "var(--app-border-width) solid var(--app-border)",
              paddingBottom: "env(safe-area-inset-bottom, 0)",
            }}
          >
            <Button
              variant="subtle"
              color="gray"
              size="md"
              radius="md"
              aria-label={tr("calendarPage.mobile.menu")}
              style={{ flex: 1, border: "none", height: 56 }}
              onClick={() => setControlsOpen(true)}
            >
              <IconSettings size={22} stroke={1.75} />
            </Button>
            <Button
              variant="subtle"
              color="gray"
              size="md"
              radius="md"
              aria-label={tr("calendarPage.mobile.previous")}
              style={{ flex: 1, border: "none", height: 56 }}
              disabled={!canGoPrevious || scheduleGenerating || !canUseSeedNavigation}
              loading={scheduleGenerating}
              onClick={handlePrevious}
              title="Previous schedule"
            >
              <IconChevronLeft size={22} stroke={1.75} />
            </Button>
            <Button
              variant={generationOptionsDirty ? "light" : "subtle"}
              color={generationOptionsDirty ? undefined : "gray"}
              size="md"
              radius="md"
              aria-label={
                generationOptionsDirty
                  ? tr("calendarPage.generate")
                  : tr("calendarPage.mobile.next")
              }
              style={{ flex: 1, border: "none", height: 56 }}
              disabled={scheduleGenerating || !canUseSeedNavigation}
              loading={scheduleGenerating}
              onClick={handleNext}
              title={generationOptionsDirty ? tr("calendarPage.generate") : "Next schedule"}
            >
              <IconChevronRight size={22} stroke={1.75} />
            </Button>
          </Box>
        )}
      </Box>
      <GenerationErrorModal
        error={generationErrorDetail}
        onClose={() => setGenerationErrorDetail(null)}
      />
    </>
  );
}
