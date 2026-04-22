import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Group,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconArrowBackUp,
  IconChevronLeft,
  IconChevronRight,
  IconMenu2,
  IconRefresh,
  IconShare,
  IconX,
} from "@tabler/icons-react";
import { useAppStore } from "../../store/appStore";
import { useShallow } from "zustand/react/shallow";
import { CalendarView } from "./CalendarView";
import { ResetModal } from "../shared/ResetModal";
import { GenerationErrorDetailBlocks } from "../GenerationErrorDetailBlocks";
import { buildScheduleIcs, downloadTextFile } from "schedule";
import { useShareUrl } from "../../hooks/useShareUrl";
import { useTimetableDateRangeFromSchedule } from "../../hooks/useTimetableDateRange";
import { tr } from "../../i18n";
import { LanguageSwitcher } from "../shared/LanguageSwitcher";
import { CALENDAR_SIDEBAR_WIDTH_PX } from "./calendarLayout";
import { BasicCalendarSidebarControls } from "./BasicCalendarSidebarControls";
import { BasicCalendarHeaderActions } from "./BasicCalendarHeaderActions";

interface CalendarPageProps {
  onBack: () => void;
}

export function CalendarPage({ onBack }: CalendarPageProps) {
  useEffect(() => {
    document.documentElement.classList.add("calendar-no-scrollbar-gutter");
    return () => {
      document.documentElement.classList.remove("calendar-no-scrollbar-gutter");
    };
  }, []);

  const {
    currentSchedule,
    currentSwaps,
    indices,
    generationError,
    cache,
    professorRatings,
    currentColorMap,
    firstSeed,
    currentSeed,
    wizardMode,
  } = useAppStore(
    useShallow((s) => ({
      currentSchedule: s.currentSchedule,
      currentSwaps: s.currentSwaps,
      indices: s.indices,
      generationError: s.generationError,
      cache: s.cache,
      professorRatings: s.professorRatings,
      currentColorMap: s.currentColorMap,
      firstSeed: s.firstSeed,
      currentSeed: s.currentSeed,
      wizardMode: s.wizardMode,
    })),
  );

  const undoLastSwap = useAppStore((s) => s.undoLastSwap);
  const getShareUrl = useAppStore((s) => s.getShareUrl);
  const goToPreviousSeed = useAppStore((s) => s.goToPreviousSeed);
  const goToNextSeed = useAppStore((s) => s.goToNextSeed);
  const randomizeSeed = useAppStore((s) => s.randomizeSeed);
  const generateSchedules = useAppStore((s) => s.generateSchedules);
  const getSwapCandidates = useAppStore((s) => s.getSwapCandidates);
  const swapCourseInSchedule = useAppStore((s) => s.swapCourseInSchedule);
  const resetToDefault = useAppStore((s) => s.resetToDefault);

  const isBasic = wizardMode === "basic";
  const hasSchedule = currentSchedule !== null;
  const canGoPrevious = currentSeed > firstSeed && currentSeed > 0;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [timetableStartDate, setTimetableStartDate] = useState("");
  const [timetableEndDate, setTimetableEndDate] = useState("");

  const { shareCopied, handleCopyShare } = useShareUrl(getShareUrl);

  const isMobile = useMediaQuery("(max-width: 768px)");

  useTimetableDateRangeFromSchedule(
    currentSchedule,
    timetableStartDate,
    timetableEndDate,
    setTimetableStartDate,
    setTimetableEndDate,
  );

  const eventCount = currentSchedule?.enrollments.reduce(
    (sum, e) => sum + e.times.length,
    0,
  ) ?? 0;

  const startOk =
    Boolean(timetableStartDate) &&
    !Number.isNaN(Date.parse(`${timetableStartDate}T00:00:00Z`));
  const endOk =
    Boolean(timetableEndDate) &&
    !Number.isNaN(Date.parse(`${timetableEndDate}T00:00:00Z`));
  const dateRangeOk = startOk && endOk && timetableStartDate <= timetableEndDate;

  const genErrDetails = generationError?.details ?? null;
  const summarizeEmptyPoolsInGenError =
    genErrDetails &&
    genErrDetails.emptyPools.length > 4 &&
    genErrDetails.totalAvailable < genErrDetails.totalNeeded;

  const handlePrevious = async () => {
    setNavigating(true);
    await goToPreviousSeed();
    setNavigating(false);
  };

  const handleNext = async () => {
    setNavigating(true);
    await goToNextSeed();
    setNavigating(false);
  };

  const handleDownloadIcs = () => {
    if (!currentSchedule) return;
    const ics = buildScheduleIcs({
      schedule: currentSchedule,
      cache,
      startDate: timetableStartDate,
      endDate: timetableEndDate,
    });
    const filename = `uoplan-schedule-${currentSeed}-${timetableStartDate}-to-${timetableEndDate}.ics`;
    downloadTextFile(filename, ics, "text/calendar;charset=utf-8");
  };

  return (
    <Box
      component="main"
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "row",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Mobile sidebar backdrop */}
      {isMobile && sidebarOpen && (
        <Box
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 199,
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Box
        component="aside"
        aria-label="Calendar Controls"
        style={{
          width: CALENDAR_SIDEBAR_WIDTH_PX,
          height: "100%",
          flexShrink: 0,
          padding: "24px 20px",
          borderRight: "2px solid #2C2E33",
          backgroundColor: "#1E1E20",
          display: "flex",
          flexDirection: "column",
          gap: 24,
          overflowY: "auto",
          ...(isMobile
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                height: "100vh",
                zIndex: 200,
                transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.2s ease",
                boxShadow: sidebarOpen ? "4px 0 24px rgba(0,0,0,0.3)" : "none",
              }
            : {}),
        }}
      >
        {isMobile && (
          <Button
            variant="subtle"
            color="gray"
            size="sm"
            radius={0}
            leftSection={<IconX size={18} />}
            onClick={() => setSidebarOpen(false)}
            style={{ border: "none", alignSelf: "flex-start", marginBottom: 8 }}
          >
            {tr("calendarPage.mobile.close")}
          </Button>
        )}

        <Title
          order={1}
          style={{
            fontFamily: '"DM Serif Display", serif',
            color: "#F8F9FA",
            marginBottom: 0,
          }}
        >
          {tr(isBasic ? "basicCalendar.title" : "calendarPage.title")}
        </Title>
        <Text size="sm" style={{ color: "#ADB5BD", marginTop: -8 }}>
          {tr(isBasic ? "basicCalendar.subtitle" : "calendarPage.subtitle")}
        </Text>

        {isBasic ? (
          <>
            <BasicCalendarHeaderActions onBack={onBack} />
            <BasicCalendarSidebarControls />
          </>
        ) : (
          <>
            {currentSwaps.length > 0 && (
              <Button
                variant="light"
                color="gray"
                size="sm"
                radius={0}
                leftSection={<IconArrowBackUp size={14} />}
                onClick={() => undoLastSwap()}
              >
                {currentSwaps.length === 1
                  ? tr("calendarPage.undoSwap")
                  : tr("calendarPage.undoSwapCount", {
                      count: currentSwaps.length,
                    })}
              </Button>
            )}

            <Group gap="xs">
              <LanguageSwitcher />
              {indices && (
                <Tooltip label="Copied to clipboard!" opened={shareCopied} position="bottom" withArrow color="dark">
                  <Button
                    variant="filled"
                    color="dark"
                    size="sm"
                    radius={0}
                    leftSection={<IconShare size={14} />}
                    onClick={handleCopyShare}
                    style={{ backgroundColor: "#141517" }}
                  >
                    {tr("calendarPage.share")}
                  </Button>
                </Tooltip>
              )}
              <Button
                variant="filled"
                color="dark"
                size="sm"
                radius={0}
                leftSection={<IconRefresh size={14} />}
                onClick={() => setResetModalOpen(true)}
                style={{ backgroundColor: "#141517" }}
              >
                {tr("calendarPage.reset")}
              </Button>
            </Group>

            <ResetModal
              opened={resetModalOpen}
              onClose={() => setResetModalOpen(false)}
              onConfirm={() => {
                resetToDefault();
                setResetModalOpen(false);
                onBack();
              }}
            />
          </>
        )}

        {/* Seed Navigation - only show in advanced mode (basic has its own in sidebar) */}
        {!isBasic && (
          <>
            {hasSchedule ? (
              <Group gap="xs">
                <Button
                  variant="light"
                  color="violet"
                  size="sm"
                  radius={0}
                  leftSection={<IconChevronLeft size={14} />}
                  disabled={!canGoPrevious || navigating}
                  loading={navigating}
                  onClick={handlePrevious}
                >
                  {tr("calendarPage.previous")}
                </Button>
                <Button
                  variant="filled"
                  color="violet"
                  size="sm"
                  radius={0}
                  rightSection={<IconChevronRight size={14} />}
                  loading={navigating}
                  onClick={handleNext}
                >
                  {tr("calendarPage.next")}
                </Button>
              </Group>
            ) : (
              <Button
                variant="filled"
                color="violet"
                size="sm"
                radius={0}
                loading={navigating}
                onClick={async () => {
                  setNavigating(true);
                  await generateSchedules();
                  setNavigating(false);
                }}
              >
                {tr("calendarPage.generate")}
              </Button>
            )}

            {hasSchedule && (
              <Text size="sm" c="dimmed">
                {tr("calendarPage.seedLabel", { seed: currentSeed })}
              </Text>
            )}
          </>
        )}

        <Button
          size="sm"
          color="violet"
          variant="filled"
          radius={0}
          disabled={!dateRangeOk || !currentSchedule}
          onClick={handleDownloadIcs}
        >
          {tr("calendarPage.downloadIcs")}
        </Button>

        {!isBasic && (
          <Button
            variant="light"
            color="gray"
            size="sm"
            radius={0}
            onClick={() => randomizeSeed()}
          >
            {tr("calendarPage.randomize")}
          </Button>
        )}

        {generationError && (
          <Alert
            color="red"
            variant="light"
            radius={0}
            py="xs"
            title={generationError.message}
            styles={{ title: { whiteSpace: "normal", lineHeight: 1.3 } }}
            style={{ flexShrink: 0 }}
          >
            <GenerationErrorDetailBlocks
              errorDetails={genErrDetails}
              summarizeEmptyPools={!!summarizeEmptyPoolsInGenError}
            />
          </Alert>
        )}

        <Stack gap={0}>
          <Text size="xs" c="dimmed">
            {tr(
              "calendarPage.showingBlocks",
              {
                count: eventCount,
                suffix: eventCount === 1 ? "" : "s",
              },
            )}
          </Text>
        </Stack>

        <Box style={{ flex: 1, minHeight: 24 }} />

        <Button
          variant="filled"
          color="dark"
          size="sm"
          radius={0}
          onClick={onBack}
          style={{ backgroundColor: "#141517", alignSelf: "stretch" }}
        >
          {tr("calendarPage.backToSetup")}
        </Button>
      </Box>

      {/* Calendar area */}
      <Box
        component="section"
        aria-label="Timetable"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: 0,
          paddingBottom: isMobile ? 72 : 0,
          width: "100%",
        }}
      >
        <CalendarView
          schedule={currentSchedule}
          cache={cache}
          professorRatings={professorRatings}
          getSwapCandidates={getSwapCandidates}
          onSwap={swapCourseInSchedule}
          colorMap={currentColorMap}
        />
      </Box>

      {/* Mobile bottom nav */}
      {isMobile && (
        <Box
          component="nav"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            gap: 0,
            backgroundColor: "#1E1E20",
            borderTop: "2px solid #2C2E33",
            paddingBottom: "env(safe-area-inset-bottom, 0)",
            zIndex: 198,
          }}
        >
          <Button
            variant="subtle"
            color="gray"
            size="md"
            radius={0}
            style={{ flex: 1, border: "none", height: 56 }}
            leftSection={<IconMenu2 size={22} />}
            onClick={() => setSidebarOpen(true)}
          >
            {tr("calendarPage.mobile.menu")}
          </Button>
          <Button
            variant="subtle"
            color="gray"
            size="md"
            radius={0}
            style={{ flex: 1, border: "none", height: 56 }}
            leftSection={<IconChevronLeft size={22} />}
            disabled={!canGoPrevious}
            onClick={handlePrevious}
          >
            {tr("calendarPage.mobile.previous")}
          </Button>
          <Button
            variant="subtle"
            color="gray"
            size="md"
            radius={0}
            style={{ flex: 1, border: "none", height: 56 }}
            leftSection={<IconChevronRight size={22} />}
            onClick={handleNext}
          >
            {tr("calendarPage.mobile.next")}
          </Button>
        </Box>
      )}
    </Box>
  );
}
